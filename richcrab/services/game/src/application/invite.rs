use chrono::Utc;
use qrcode::{render::svg, QrCode};
use serde::Deserialize;
use shared::{entitlements_client::EntitlementsApi, redis_keys};
use tokio::sync::oneshot;
use tonic::{Request, Response, Status};
use tracing::info;

use crate::{room_actor::RoomCommand, service::GameServiceImpl};

#[derive(Clone, Debug, Deserialize)]
pub(crate) struct JoinTicketPayload {
    pub room_id: String,
    pub display_name: String,
    pub issued_at_unix: i64,
}

pub(crate) fn invite_path(invite_token: &str) -> String {
    format!("/invite/{invite_token}")
}

pub(crate) fn invite_qr_svg(path: &str) -> Result<String, String> {
    let qr = QrCode::new(path).map_err(|e| format!("failed to generate invite QR code: {e}"))?;
    Ok(qr
        .render::<svg::Color>()
        .min_dimensions(246, 246)
        .quiet_zone(true)
        .build())
}

impl GameServiceImpl {
    pub(crate) async fn regenerate_invite_uc(
        &self,
        request: Request<proto::richcrab::v1::RegenerateInviteRequest>,
    ) -> Result<Response<proto::richcrab::v1::RegenerateInviteResponse>, Status> {
        let req = request.into_inner();
        let room_id = req
            .room_id
            .map(|v| v.value)
            .ok_or_else(|| Status::invalid_argument("room_id is required"))?;
        let requested_by = req
            .requested_by
            .map(|v| v.value)
            .ok_or_else(|| Status::invalid_argument("requested_by is required"))?;
        let room = self.resolve_room(&room_id).await?;
        let (state_tx, state_rx) = oneshot::channel();
        room.tx
            .send(RoomCommand::GetState { response: state_tx })
            .await
            .map_err(|_| Status::unavailable("room is unavailable"))?;
        let state = state_rx
            .await
            .map_err(|_| Status::internal("room actor response dropped"))?;
        if requested_by != state.owner_user_id {
            return Err(Status::permission_denied(
                "only room owner can regenerate invite",
            ));
        }
        let previous_token = self
            .redis
            .get_value(&redis_keys::room_invite_token_key(&room_id))
            .await
            .map_err(|e| Status::internal(format!("failed to read room invite token: {e}")))?;
        let invite_token = uuid::Uuid::new_v4().to_string();
        self.redis
            .set_with_ttl(
                &redis_keys::invite_key(&invite_token),
                &room_id,
                self.pin_ttl,
            )
            .await
            .map_err(|e| Status::internal(format!("failed to write invite token: {e}")))?;
        self.redis
            .set_with_ttl(
                &redis_keys::room_invite_token_key(&room_id),
                &invite_token,
                self.pin_ttl,
            )
            .await
            .map_err(|e| Status::internal(format!("failed to write room invite token: {e}")))?;
        if let Some(previous_token) = previous_token {
            if previous_token != invite_token {
                self.redis
                    .delete_key(&redis_keys::invite_key(previous_token))
                    .await
                    .map_err(|e| {
                        Status::internal(format!("failed to delete old invite token: {e}"))
                    })?;
            }
        }
        let invite_path = invite_path(&invite_token);
        let invite_qr_svg = invite_qr_svg(&invite_path).map_err(Status::internal)?;
        Ok(Response::new(
            proto::richcrab::v1::RegenerateInviteResponse {
                invite_token,
                invite_path,
                invite_qr_svg,
                error: None,
            },
        ))
    }

    pub(crate) async fn join_room_uc(
        &self,
        request: Request<proto::richcrab::v1::JoinRoomRequest>,
    ) -> Result<Response<proto::richcrab::v1::JoinRoomResponse>, Status> {
        let metrics = shared::observability::init_metrics();
        let req = request.into_inner();
        let ticket = req.join_ticket;
        if ticket.is_empty() {
            return Err(Status::invalid_argument("join_ticket is required"));
        }
        let payload_raw = self
            .redis
            .consume_join_ticket(&redis_keys::ticket_key(&ticket))
            .await
            .map_err(|e| Status::internal(format!("failed to consume ticket: {e}")))?
            .ok_or_else(|| Status::permission_denied("join ticket is invalid or expired"))?;
        let payload: JoinTicketPayload = serde_json::from_str(&payload_raw).map_err(|_| {
            shared::observability::error("game", "join_ticket_payload_invalid");
            Status::permission_denied("join ticket payload is invalid")
        })?;
        info!(request_id = %uuid::Uuid::new_v4(), room_id = %payload.room_id, user_id = "", bot_id = "", "join_room");
        let issued_at = chrono::DateTime::from_timestamp(payload.issued_at_unix, 0)
            .ok_or_else(|| Status::permission_denied("join ticket issued_at is invalid"))?;
        let max_ticket_age = chrono::Duration::from_std(redis_keys::TICKET_TTL)
            .map_err(|_| Status::internal("ticket ttl misconfigured"))?;
        if (Utc::now() - issued_at) > max_ticket_age {
            return Err(Status::permission_denied("join ticket is expired"));
        }
        let room = self.resolve_room(&payload.room_id).await?;
        let (state_tx, state_rx) = oneshot::channel();
        room.tx
            .send(RoomCommand::GetState { response: state_tx })
            .await
            .map_err(|_| Status::unavailable("room is unavailable"))?;
        let state = state_rx
            .await
            .map_err(|_| Status::internal("room actor response dropped"))?;
        self.entitlements
            .for_user(&state.owner_user_id)
            .check("MAX_PLAYERS_IN_ROOM")
            .await
            .map_err(Status::from)?;
        let (tx, rx) = oneshot::channel();
        room.tx
            .send(RoomCommand::Join {
                user_id: String::new(),
                display_name: payload.display_name,
                response: tx,
            })
            .await
            .map_err(|_| Status::unavailable("room is unavailable"))?;
        let player_id = rx
            .await
            .map_err(|_| Status::internal("room actor response dropped"))?
            .map_err(Status::failed_precondition)?;
        self.entitlements
            .for_user(&state.owner_user_id)
            .report("MAX_PLAYERS_IN_ROOM", 1)
            .await
            .map_err(Status::from)?;
        metrics.players_connected.inc();
        Ok(Response::new(proto::richcrab::v1::JoinRoomResponse {
            player_id: Some(proto::richcrab::v1::PlayerId { value: player_id }),
            joined_at: Self::now_ts(),
            error: None,
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::{invite_path, invite_qr_svg};
    #[test]
    fn invite_path_is_relative() {
        assert_eq!(invite_path("abc"), "/invite/abc");
    }
    #[test]
    fn invite_qr_svg_is_valid_svg() {
        let svg = invite_qr_svg("/invite/abc").unwrap();
        assert!(svg.contains("<svg"));
    }
}
