use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use anyhow::{bail, Context};
use base64::Engine;

pub fn build_crypto_key(encryption_key: &str) -> anyhow::Result<[u8; 32]> {
    if encryption_key.trim().is_empty() {
        bail!("ENCRYPTION_KEY is not configured");
    }
    let hash = shared::crypto::sha256_hex(encryption_key);
    let mut key = [0_u8; 32];
    hex::decode_to_slice(hash, &mut key).context("invalid ENCRYPTION_KEY")?;
    Ok(key)
}

pub fn encrypt_token(encryption_key: &str, token: &str) -> anyhow::Result<String> {
    let key = build_crypto_key(encryption_key)?;
    let cipher = Aes256Gcm::new((&key).into());
    let nonce_bytes: [u8; 12] = rand::random();
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher
        .encrypt(nonce, token.as_bytes())
        .map_err(|_| anyhow::anyhow!("token encryption failed"))?;

    let mut payload = Vec::with_capacity(nonce_bytes.len() + ciphertext.len());
    payload.extend_from_slice(&nonce_bytes);
    payload.extend_from_slice(&ciphertext);
    Ok(base64::engine::general_purpose::STANDARD.encode(payload))
}

pub fn decrypt_token(encryption_key: &str, token_encrypted: &str) -> anyhow::Result<String> {
    let payload = base64::engine::general_purpose::STANDARD
        .decode(token_encrypted)
        .context("token decrypt failed")?;
    if payload.len() < 13 {
        bail!("token decrypt payload is invalid");
    }

    let key = build_crypto_key(encryption_key)?;
    let cipher = Aes256Gcm::new((&key).into());
    let (nonce_bytes, ciphertext) = payload.split_at(12);
    let nonce = Nonce::from_slice(nonce_bytes);
    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| anyhow::anyhow!("token decrypt failed"))?;
    String::from_utf8(plaintext).context("token decrypt utf8 failed")
}

#[cfg(test)]
mod tests {
    use super::{decrypt_token, encrypt_token};

    #[test]
    fn token_roundtrip() {
        let key = "super_secret_key";
        let token = "123456:ABC-DEF";

        let encrypted = encrypt_token(key, token).expect("encrypt");
        let decrypted = decrypt_token(key, &encrypted).expect("decrypt");

        assert_eq!(decrypted, token);
    }

    #[test]
    fn decrypt_fails_for_invalid_key() {
        let encrypted = encrypt_token("key1", "token").expect("encrypt");
        let error = decrypt_token("key2", &encrypted).expect_err("must fail");
        assert!(error.to_string().contains("token decrypt failed"));
    }

    #[test]
    fn decrypt_fails_for_invalid_token_payload() {
        let error = decrypt_token("key", "not-base64").expect_err("must fail");
        assert!(error.to_string().contains("token decrypt failed"));
    }
}
