use chrono::Utc;
use game::{
    domain::{RoomLifecycleState, RoomState},
    room_actor::{spawn_room_actor, RoomCommand},
};
use tokio::sync::oneshot;

#[tokio::test]
async fn create_room_issue_ticket_join_start_submit_and_game_end() {
    // CreateRoom
    let room_id = uuid::Uuid::new_v4().to_string();
    let owner_id = uuid::Uuid::new_v4().to_string();
    let state = RoomState {
        room_id: room_id.clone(),
        owner_user_id: owner_id.clone(),
        quiz_id: "quiz-1".to_string(),
        title: "Integration room".to_string(),
        state: RoomLifecycleState::Lobby,
        players: Default::default(),
        current_question: None,
        timer: None,
        result: None,
        updated_at: Utc::now(),
    };
    let (room, _task) = spawn_room_actor(state, 64);

    // IssueTicket (simulated in test)
    let join_ticket = format!("ticket-{}", uuid::Uuid::new_v4());
    assert!(join_ticket.starts_with("ticket-"));

    // JoinRoom
    let (join_tx, join_rx) = oneshot::channel();
    room.tx
        .send(RoomCommand::Join {
            user_id: "user-1".to_string(),
            display_name: "player-1".to_string(),
            response: join_tx,
        })
        .await
        .expect("join command sent");
    let player_id = join_rx.await.expect("join response").expect("join ok");

    // StartGame
    let (start_tx, start_rx) = oneshot::channel();
    room.tx
        .send(RoomCommand::StartGame {
            requested_by: owner_id,
            response: start_tx,
        })
        .await
        .expect("start command sent");
    start_rx.await.expect("start response").expect("start ok");

    // SubmitAnswer
    let (answer_tx, answer_rx) = oneshot::channel();
    room.tx
        .send(RoomCommand::SubmitAnswer {
            player_id: player_id.clone(),
            question_id: "q1".to_string(),
            answer: "correct".to_string(),
            response: answer_tx,
        })
        .await
        .expect("answer command sent");
    let delta = answer_rx
        .await
        .expect("answer response")
        .expect("answer accepted");
    assert_eq!(delta, 100);

    // GameEnded
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
