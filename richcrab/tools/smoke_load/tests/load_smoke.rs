#[tokio::test]
#[ignore = "requires running gRPC stack"]
async fn smoke_load_can_run_against_live_stack() {
    let game_addr =
        std::env::var("SERVICE_ADDR_GAME").unwrap_or_else(|_| "http://127.0.0.1:50051".to_string());
    let join_addr =
        std::env::var("SERVICE_ADDR_JOIN").unwrap_or_else(|_| "http://127.0.0.1:50052".to_string());

    let mut game = proto::richcrab::v1::game_service_client::GameServiceClient::connect(game_addr)
        .await
        .expect("game service reachable");
    let mut join = proto::richcrab::v1::join_service_client::JoinServiceClient::connect(join_addr)
        .await
        .expect("join service reachable");

    let owner = uuid::Uuid::new_v4().to_string();
    let room = game
        .create_room(proto::richcrab::v1::CreateRoomRequest {
            owner_user_id: Some(proto::richcrab::v1::UserId {
                value: owner.clone(),
            }),
            quiz_id: Some(proto::richcrab::v1::QuizId {
                value: "default".to_string(),
            }),
            title: "load-test".to_string(),
            settings: None,
        })
        .await
        .expect("create room")
        .into_inner();

    let ticket = join
        .issue_join_ticket_by_pin(proto::richcrab::v1::IssueJoinTicketByPinRequest {
            pin: room.pin,
            display_name: "load-player".to_string(),
        })
        .await
        .expect("issue ticket")
        .into_inner()
        .ticket
        .expect("ticket");

    game.join_room(proto::richcrab::v1::JoinRoomRequest {
        join_ticket: ticket.token,
    })
    .await
    .expect("join room");
}
