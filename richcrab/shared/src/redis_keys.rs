use std::time::Duration;

pub const TICKET_TTL_MIN: Duration = Duration::from_secs(60);
pub const TICKET_TTL_MAX: Duration = Duration::from_secs(5 * 60);
pub const TICKET_TTL: Duration = Duration::from_secs(3 * 60);

pub const PIN_TTL_SCOPE: &str = "room_lifetime";
pub const INVITE_TTL_SCOPE: &str = "room_lifetime";
pub const RATE_LIMIT_TTL_SCOPE: &str = "policy_defined";

pub fn pin_key(pin: impl AsRef<str>) -> String {
    format!("pin:{}", pin.as_ref())
}

pub fn invite_key(invite_token: impl AsRef<str>) -> String {
    format!("invite:{}", invite_token.as_ref())
}

pub fn room_invite_token_key(room_id: impl AsRef<str>) -> String {
    format!("room_invite_token:{}", room_id.as_ref())
}

pub fn ticket_key(join_ticket: impl AsRef<str>) -> String {
    format!("ticket:{}", join_ticket.as_ref())
}

pub fn ratelimit_key(scope: impl AsRef<str>, id: impl AsRef<str>) -> String {
    format!("ratelimit:{}:{}", scope.as_ref(), id.as_ref())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_expected_keys() {
        assert_eq!(pin_key("1234"), "pin:1234");
        assert_eq!(invite_key("abc"), "invite:abc");
        assert_eq!(room_invite_token_key("r1"), "room_invite_token:r1");
        assert_eq!(ticket_key("xyz"), "ticket:xyz");
        assert_eq!(ratelimit_key("ip", "1.2.3.4"), "ratelimit:ip:1.2.3.4");
    }

    #[test]
    fn ticket_ttl_stays_within_requested_bounds() {
        assert!(TICKET_TTL >= TICKET_TTL_MIN);
        assert!(TICKET_TTL <= TICKET_TTL_MAX);
    }
}
