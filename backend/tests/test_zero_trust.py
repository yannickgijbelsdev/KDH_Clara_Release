"""Zero Trust regression tests."""
import os
import sys
import pytest

# Ensure backend is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))


@pytest.mark.asyncio
async def test_encryption_round_trip():
    from services.security.encryption import encrypt, decrypt, is_encrypted, is_available, mask
    assert is_available(), "SECURITY_ENCRYPTION_KEY must be configured"
    plain = "super-secret-api-key-12345"
    enc = encrypt(plain)
    assert is_encrypted(enc)
    assert enc != plain
    assert decrypt(enc) == plain
    # Idempotency: encrypting an already-encrypted value is a no-op
    assert encrypt(enc) == enc
    # Empty/None pass through
    assert encrypt("") == ""
    assert encrypt(None) is None
    # Mask returns last 4 chars for plaintext
    assert mask("abcdefgh") == "••••efgh"


@pytest.mark.asyncio
async def test_brute_force_ladder():
    from services.security.brute_force import is_locked, record_failure, record_success
    key = "email:bf-test@example.com"
    await record_success(key)  # ensure clean state

    # First 4 failures: not locked
    for i in range(1, 5):
        r = await record_failure(key, "127.0.0.1")
        assert r["failure_count"] == i
        assert not r["locked"], f"should NOT lock at failure {i}"

    # 5th failure: locked for 60s
    r = await record_failure(key, "127.0.0.1")
    assert r["locked"]
    assert r["retry_after"] >= 30

    locked, retry = await is_locked(key)
    assert locked
    assert retry > 0

    # Successful login clears lockout
    await record_success(key, "127.0.0.1")
    locked, _ = await is_locked(key)
    assert not locked


@pytest.mark.asyncio
async def test_device_fingerprint_stability():
    from services.security.device_trust import fingerprint
    fp_a = fingerprint("Mozilla/5.0 Chrome", "en-US", "10.1.2.3")
    fp_b = fingerprint("Mozilla/5.0 Chrome", "en-US", "10.1.2.99")  # same /24
    fp_c = fingerprint("Mozilla/5.0 Chrome", "en-US", "192.168.1.5")  # different network
    fp_d = fingerprint("Mozilla/5.0 Firefox", "en-US", "10.1.2.3")  # different UA
    assert fp_a == fp_b, "same /24 network should produce same fingerprint"
    assert fp_a != fp_c, "different network should produce different fingerprint"
    assert fp_a != fp_d, "different user agent should produce different fingerprint"
    assert len(fp_a) == 32


@pytest.mark.asyncio
async def test_security_headers_middleware_emits_zero_trust_headers():
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from middleware.security_headers import SecurityHeadersMiddleware

    app = FastAPI()
    app.add_middleware(SecurityHeadersMiddleware)

    @app.get("/ping")
    def ping():
        return {"ok": True}

    client = TestClient(app)
    r = client.get("/ping")
    assert r.status_code == 200
    assert "max-age" in r.headers.get("strict-transport-security", "")
    assert r.headers.get("x-content-type-options") == "nosniff"
    assert r.headers.get("x-frame-options") == "SAMEORIGIN"
    assert "strict-origin" in r.headers.get("referrer-policy", "")
    assert "default-src 'self'" in r.headers.get("content-security-policy", "")
    assert "frame-ancestors 'self'" in r.headers.get("content-security-policy", "")
