use sha2::{Digest, Sha256};

pub fn sha256_hex(input: impl AsRef<[u8]>) -> String {
    let hash = Sha256::digest(input.as_ref());
    format!("{hash:x}")
}
