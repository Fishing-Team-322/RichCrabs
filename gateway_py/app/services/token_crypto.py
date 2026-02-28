import base64
import hashlib
import os
from dataclasses import dataclass
from typing import Dict, Optional

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


@dataclass(frozen=True)
class EncryptedToken:
    ciphertext: str
    nonce: str
    key_version: str


class TokenCrypto:
    def __init__(self, active_key_version: str, keys: Dict[str, bytes]):
        self._active_key_version = active_key_version
        self._keys = keys

    @classmethod
    def from_keyring(cls, keyring: str) -> "TokenCrypto":
        if not keyring or not keyring.strip():
            raise ValueError("token keyring is empty")

        active_version: Optional[str] = None
        keys: Dict[str, bytes] = {}
        for item in keyring.split(','):
            pair = item.strip()
            if not pair:
                continue
            if ':' not in pair:
                raise ValueError("invalid keyring item format")
            version, raw_key = pair.split(':', 1)
            version = version.strip()
            raw_key = raw_key.strip()
            if not version or not raw_key:
                raise ValueError("invalid keyring item")
            if active_version is None:
                active_version = version
            keys[version] = hashlib.sha256(raw_key.encode('utf-8')).digest()

        if active_version is None or not keys:
            raise ValueError("token keyring is empty")

        return cls(active_version, keys)

    def encrypt(self, plaintext: str) -> EncryptedToken:
        key = self._keys.get(self._active_key_version)
        if key is None:
            raise ValueError("active key is missing")

        nonce = os.urandom(12)
        encrypted = AESGCM(key).encrypt(nonce, plaintext.encode('utf-8'), None)
        return EncryptedToken(
            ciphertext=base64.b64encode(encrypted).decode('ascii'),
            nonce=base64.b64encode(nonce).decode('ascii'),
            key_version=self._active_key_version,
        )

    def decrypt(self, token: EncryptedToken) -> str:
        key = self._keys.get(token.key_version)
        if key is None:
            raise ValueError("unknown key version")

        try:
            nonce = base64.b64decode(token.nonce, validate=True)
            ciphertext = base64.b64decode(token.ciphertext, validate=True)
        except Exception as ex:
            raise ValueError("token decrypt payload is invalid") from ex

        if len(nonce) != 12 or not ciphertext:
            raise ValueError("token decrypt payload is invalid")

        try:
            data = AESGCM(key).decrypt(nonce, ciphertext, None)
        except Exception as ex:
            raise ValueError("token decrypt failed") from ex

        return data.decode('utf-8')
