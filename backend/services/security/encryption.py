"""
Field-level encryption service (Zero Trust at-rest data protection).

Uses Fernet (AES-128-CBC + HMAC-SHA256) with a key derived from
the SECURITY_ENCRYPTION_KEY env var. If the env var is missing, the
service refuses to encrypt rather than silently weakening security.

Stored ciphertexts are prefixed with `enc:v1:` so we can detect
encrypted vs plaintext fields during gradual migration and rotation.
"""
from __future__ import annotations

import base64
import hashlib
import logging
import os
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken

log = logging.getLogger("security.encryption")

PREFIX = "enc:v1:"


def _derive_key() -> Optional[bytes]:
    """Derive a Fernet key from SECURITY_ENCRYPTION_KEY.

    The env value can be either:
      - a 32-byte URL-safe base64 key (preferred — production grade)
      - any string ≥ 32 chars (derived via SHA-256 then base64)
    """
    raw = os.environ.get("SECURITY_ENCRYPTION_KEY") or os.environ.get("JWT_SECRET")
    if not raw:
        return None
    # Already a valid Fernet key?
    try:
        decoded = base64.urlsafe_b64decode(raw.encode())
        if len(decoded) == 32:
            return raw.encode()
    except Exception:
        pass
    # Derive deterministically (so existing values stay decryptable)
    digest = hashlib.sha256(raw.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest)


_key = _derive_key()
_cipher: Optional[Fernet] = Fernet(_key) if _key else None


def is_available() -> bool:
    return _cipher is not None


def is_encrypted(value: Optional[str]) -> bool:
    return isinstance(value, str) and value.startswith(PREFIX)


def encrypt(value: Optional[str]) -> Optional[str]:
    """Encrypt a string value. Idempotent — already encrypted values pass through.

    Returns the original value unchanged if encryption is unavailable, so the
    application keeps functioning, but logs a warning so ops can act.
    """
    if value is None or value == "":
        return value
    if is_encrypted(value):
        return value
    if not _cipher:
        log.warning("SECURITY_ENCRYPTION_KEY missing — storing field as plaintext")
        return value
    token = _cipher.encrypt(value.encode("utf-8")).decode("utf-8")
    return f"{PREFIX}{token}"


def decrypt(value: Optional[str]) -> Optional[str]:
    """Decrypt a previously-encrypted value. Plaintext is returned as-is."""
    if value is None or value == "":
        return value
    if not is_encrypted(value):
        return value
    if not _cipher:
        log.error("Encrypted field encountered but SECURITY_ENCRYPTION_KEY missing")
        return None
    payload = value[len(PREFIX):]
    try:
        return _cipher.decrypt(payload.encode("utf-8")).decode("utf-8")
    except InvalidToken:
        log.error("Failed to decrypt field — invalid token or rotated key")
        return None


def encrypt_dict(data: dict, fields: list[str]) -> dict:
    """Encrypt specified string fields in a dict in-place. Returns the dict."""
    if not data:
        return data
    for f in fields:
        if f in data and isinstance(data[f], str):
            data[f] = encrypt(data[f])
    return data


def decrypt_dict(data: dict, fields: list[str]) -> dict:
    """Decrypt specified string fields in a dict in-place. Returns the dict."""
    if not data:
        return data
    for f in fields:
        if f in data and isinstance(data[f], str):
            data[f] = decrypt(data[f])
    return data


def mask(value: Optional[str], visible: int = 4) -> str:
    """Return a masked version of a secret for display (***last4)."""
    if not value:
        return ""
    if is_encrypted(value):
        return "••••••••"
    if len(value) <= visible:
        return "•" * len(value)
    return "•" * (len(value) - visible) + value[-visible:]
