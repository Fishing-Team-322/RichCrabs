use uuid::Uuid;

pub type Id = Uuid;

pub fn new_id() -> Id {
    Uuid::new_v4()
}
