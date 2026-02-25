use std::env;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let game_addr =
        env::var("SERVICE_ADDR_GAME").unwrap_or_else(|_| "http://127.0.0.1:50051".to_string());
    let join_addr =
        env::var("SERVICE_ADDR_JOIN").unwrap_or_else(|_| "http://127.0.0.1:50052".to_string());
    let players: usize = env::var("SMOKE_PLAYERS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(10);

    let mut game =
        proto::richcrab::v1::game_service_client::GameServiceClient::connect(game_addr).await?;
    let mut join =
        proto::richcrab::v1::join_service_client::JoinServiceClient::connect(join_addr).await?;

    let owner = uuid::Uuid::new_v4().to_string();
    let room = game
        .create_room(proto::richcrab::v1::CreateRoomRequest {
            owner_user_id: Some(proto::richcrab::v1::UserId {
                value: owner.clone(),
            }),
            quiz_id: Some(proto::richcrab::v1::QuizId {
                value: "default".to_string(),
            }),
            title: "smoke room".to_string(),
        })
        .await?
        .into_inner();

    let pin = room.pin;
    let room_id = room.room_id.map(|r| r.value).unwrap_or_default();

    for idx in 0..players {
        let ticket = join
            .issue_join_ticket_by_pin(proto::richcrab::v1::IssueJoinTicketByPinRequest {
                pin: pin.clone(),
                display_name: format!("player-{idx}"),
            })
            .await?
            .into_inner();
        let join_ticket = ticket.ticket.map(|t| t.token).unwrap_or_default();
        game.join_room(proto::richcrab::v1::JoinRoomRequest { join_ticket })
            .await?;
    }

    game.start_game(proto::richcrab::v1::StartGameRequest {
        room_id: Some(proto::richcrab::v1::RoomId {
            value: room_id.clone(),
        }),
        requested_by: Some(proto::richcrab::v1::UserId { value: owner }),
    })
    .await?;

    println!("smoke-load complete players={players} room_id={room_id}");
    Ok(())
}
