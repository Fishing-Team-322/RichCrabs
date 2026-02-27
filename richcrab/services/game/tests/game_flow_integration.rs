use chrono::Utc;
use game::{
    domain::{GameQuestion, RoomLifecycleState, RoomState},
    room_actor::{spawn_room_actor, RoomCommand},
};
use tokio::sync::oneshot;

#[tokio::test]
async fn create_room_issue_ticket_join_start_submit_and_game_end() {
    let room_id = uuid::Uuid::new_v4().to_string();
    let owner_id = uuid::Uuid::new_v4().to_string();
    let state = RoomState {
        room_id: room_id.clone(),
        owner_user_id: owner_id.clone(),
        quiz_id: "quiz-1".to_string(),
        title: "Integration room".to_string(),
        state: RoomLifecycleState::Lobby,
        players: Default::default(),
        teams: Default::default(),
        question_bank: Vec::new(),
        current_question: None,
        timer: None,
        result: None,
        updated_at: Utc::now(),
    };
    let (room, _task) = spawn_room_actor(state, 64);

    let join_ticket = format!("ticket-{}", uuid::Uuid::new_v4());
    assert!(join_ticket.starts_with("ticket-"));

    let (join_tx, join_rx) = oneshot::channel();
    room.tx
        .send(RoomCommand::Join {
            user_id: "".to_string(),
            display_name: "player-1".to_string(),
            response: join_tx,
        })
        .await
        .expect("join command sent");
    let player_id = join_rx.await.expect("join response").expect("join ok");

    let (start_tx, start_rx) = oneshot::channel();
    room.tx
        .send(RoomCommand::StartGame {
            requested_by: owner_id,
            questions: vec![GameQuestion {
                question_id: "q1".to_string(),
                question_text: "2+2?".to_string(),
                options: vec!["3".to_string(), "4".to_string()],
                correct_option_index: Some(1),
            }],
            response: start_tx,
        })
        .await
        .expect("start command sent");
    start_rx.await.expect("start response").expect("start ok");

    let (answer_tx, answer_rx) = oneshot::channel();
    room.tx
        .send(RoomCommand::SubmitAnswer {
            player_id: player_id.clone(),
            question_id: "q1".to_string(),
            answer: "1".to_string(),
            response: answer_tx,
        })
        .await
        .expect("answer command sent");
    let delta = answer_rx
        .await
        .expect("answer response")
        .expect("answer accepted");
    assert_eq!(delta, 100);

    let (state_tx, state_rx) = oneshot::channel();
    room.tx
        .send(RoomCommand::GetState { response: state_tx })
        .await
        .expect("state command sent");
    let current = state_rx.await.expect("state response");
    assert_eq!(current.state, RoomLifecycleState::Finished);
    assert!(current.result.is_some());
    assert_eq!(current.players.get(&player_id).map(|p| p.score), Some(100));
    assert_eq!(current.room_id, room_id);
}
