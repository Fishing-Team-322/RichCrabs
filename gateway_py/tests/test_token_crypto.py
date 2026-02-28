import pytest

from app.services.token_crypto import EncryptedToken, TokenCrypto


def test_encrypt_decrypt_roundtrip():
    crypto = TokenCrypto.from_keyring("v1:master-key")
    encrypted = crypto.encrypt("123456:ABCDEF")

    assert encrypted.ciphertext
    assert encrypted.nonce
    assert encrypted.key_version == "v1"

    assert crypto.decrypt(encrypted) == "123456:ABCDEF"


def test_decrypt_fails_for_invalid_key():
    encryptor = TokenCrypto.from_keyring("v1:key-a")
    decryptor = TokenCrypto.from_keyring("v1:key-b")

    encrypted = encryptor.encrypt("token")
    with pytest.raises(ValueError, match="token decrypt failed"):
        decryptor.decrypt(encrypted)


def test_decrypt_fails_for_corrupted_payload():
    crypto = TokenCrypto.from_keyring("v1:key-a")
    encrypted = crypto.encrypt("token")

    corrupted = EncryptedToken(
        ciphertext="@@@not-base64@@@",
        nonce=encrypted.nonce,
        key_version=encrypted.key_version,
    )
    with pytest.raises(ValueError, match="token decrypt payload is invalid"):
        crypto.decrypt(corrupted)


def test_key_rotation_supports_old_and_new_versions():
    old_crypto = TokenCrypto.from_keyring("v1:key-old")
    old_encrypted = old_crypto.encrypt("rotate")

    rotated = TokenCrypto.from_keyring("v2:key-new,v1:key-old")
    assert rotated.decrypt(old_encrypted) == "rotate"

    new_encrypted = rotated.encrypt("rotate")
    assert new_encrypted.key_version == "v2"
