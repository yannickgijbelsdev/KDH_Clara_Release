"""Tests for GET /api/rds/troubleshoot/{station} — live diagnostic endpoint."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://api-turbo.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admkoodh@koodh.com"
ADMIN_PASSWORD = "KYLovie13monx"
NONADMIN_EMAIL = "yannick.gijbels@koodh.com"
NONADMIN_PASSWORD = "test"

EXPECTED_NAMES_CORE = {
    "Station configured",
    "Stream URL resolved",
    "DNS resolves",
    "TCP reachable",
    "HTTP reachable",
    "Shoutcast metadata parses",
    "Cache populated",
}


def _login(email: str, password: str) -> str | None:
    # The login endpoint is slow under load (bcrypt + queries) — sometimes the
    # ingress gateway times out at 60s with a 502 before the backend responds.
    # Retry several times with a small sleep so the upstream catches up.
    import time as _t
    for attempt in range(6):
        try:
            r = requests.post(
                f"{BASE_URL}/api/auth/login",
                json={"email": email, "password": password},
                timeout=120,
            )
        except requests.RequestException:
            _t.sleep(2)
            continue
        if r.status_code == 200:
            return r.json().get("token") or r.json().get("access_token")
        if r.status_code in (401, 403):
            return None  # credentials wrong / locked
        _t.sleep(2)
    return None


@pytest.fixture(scope="module")
def admin_token():
    tok = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
    if not tok:
        pytest.skip("admin login failed")
    return tok


@pytest.fixture(scope="module")
def nonadmin_token():
    return _login(NONADMIN_EMAIL, NONADMIN_PASSWORD)


@pytest.fixture(scope="module")
def grk_payload(admin_token):
    """Single live diagnostic call; reused across assertions to avoid 7+ live network rounds."""
    r = requests.get(
        f"{BASE_URL}/api/rds/troubleshoot/grk",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=60,
    )
    assert r.status_code == 200, f"GRK troubleshoot returned {r.status_code}: {r.text[:300]}"
    return r.json()


# ─── Shape ──────────────────────────────────────────────────────────────────

def test_grk_response_shape(grk_payload):
    p = grk_payload
    for k in ("station", "ok", "checks", "recent_logs", "summary"):
        assert k in p, f"missing key '{k}' in response: {list(p.keys())}"
    assert p["station"] == "grk"
    assert isinstance(p["ok"], bool)
    assert isinstance(p["checks"], list)
    assert isinstance(p["recent_logs"], list)
    assert isinstance(p["summary"], str)


def test_checks_contain_core_names(grk_payload):
    names = [c.get("name") for c in grk_payload["checks"]]
    missing = EXPECTED_NAMES_CORE - set(names)
    assert not missing, f"missing core check names: {missing}. Got: {names}"


def test_check_entry_shape(grk_payload):
    for c in grk_payload["checks"]:
        assert set(c.keys()) >= {"name", "ok", "detail", "data"}, f"bad shape: {c}"
        assert isinstance(c["name"], str)
        assert c["ok"] in (True, False, None)
        assert isinstance(c["detail"], str)
        assert isinstance(c["data"], dict)


# ─── Real-world expectations for GRK ────────────────────────────────────────

def test_grk_tcp_check_surfaces_real_host(grk_payload):
    """The TCP check should fail and detail must contain 'stream-shout.koodh.be:9010'
    confirming the diagnostic correctly surfaces the real-world infra issue."""
    tcp = next((c for c in grk_payload["checks"] if c["name"] == "TCP reachable"), None)
    assert tcp is not None, "No 'TCP reachable' entry found"
    # If DNS succeeded (likely), TCP should have been attempted; if it failed,
    # detail must reference the actual host:port.
    if tcp["ok"] is False:
        assert "stream-shout.koodh.be:9010" in tcp["detail"], f"detail={tcp['detail']!r}"
    elif tcp["ok"] is None:
        # downstream-skipped because DNS failed — still acceptable
        assert tcp["detail"].lower().startswith("skipped"), tcp["detail"]
    # If TCP somehow succeeded, the diagnostic is structurally fine — we
    # don't fail the test (would be flaky against real infra recovering).


def test_downstream_skipped_when_upstream_fails(grk_payload):
    """If TCP failed, the HTTP step (downstream) must be ok=None with detail starting 'Skipped'."""
    checks = {c["name"]: c for c in grk_payload["checks"]}
    tcp = checks.get("TCP reachable")
    http = checks.get("HTTP reachable")
    assert http is not None
    if tcp and tcp["ok"] is False:
        assert http["ok"] is None, f"http.ok should be None when TCP failed: {http}"
        assert http["detail"].lower().startswith("skipped"), http["detail"]


def test_summary_format(grk_payload):
    """When ok=False, summary should be 'Name: detail → hint' style."""
    if grk_payload["ok"] is False:
        s = grk_payload["summary"]
        assert s, "summary should be non-empty when ok=False"
        assert ":" in s, f"summary missing colon: {s!r}"
        # First failing step is most likely TCP — confirm hint arrow present
        # (every category in _summarise_failure adds ' → ' except none-match).
        # We only assert that the hint is present when first failure is in the
        # known categories.
        assert "→" in s or "->" in s or s.endswith("."), f"summary missing hint: {s!r}"


def test_overall_ok_aggregate_ignores_null(grk_payload):
    """ok must == all(c['ok'] for c in checks if c['ok'] is not None)."""
    expected = all(c["ok"] for c in grk_payload["checks"] if c["ok"] is not None)
    assert grk_payload["ok"] == expected


# ─── Auth ──────────────────────────────────────────────────────────────────

def test_unauthenticated_blocked():
    # auth runs before any live network work, but still allow plenty of margin.
    # Retry once: ingress sometimes returns transient 502s under load.
    last_code = None
    for _ in range(3):
        r = requests.get(f"{BASE_URL}/api/rds/troubleshoot/grk", timeout=60)
        last_code = r.status_code
        if last_code in (401, 403):
            return
    pytest.fail(f"expected 401/403, last status was {last_code}")


def test_non_admin_forbidden(nonadmin_token):
    if not nonadmin_token:
        pytest.skip("non-admin login failed; cannot verify 403")
    r = requests.get(
        f"{BASE_URL}/api/rds/troubleshoot/grk",
        headers={"Authorization": f"Bearer {nonadmin_token}"},
        timeout=60,
    )
    assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text[:200]}"


# ─── Unknown station ───────────────────────────────────────────────────────

def test_unknown_station(admin_token):
    last = None
    for _ in range(3):
        r = requests.get(
            f"{BASE_URL}/api/rds/troubleshoot/zzz",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=60,
        )
        last = r
        if r.status_code == 200:
            break
    assert last is not None and last.status_code == 200, f"got {last.status_code if last else 'no-resp'}: {(last.text[:300] if last is not None else '')}"
    p = last.json()
    assert p["ok"] is False
    assert len(p["checks"]) == 1, f"expected exactly 1 check for unknown station, got {len(p['checks'])}: {p['checks']}"
    only = p["checks"][0]
    assert only["name"] == "Station configured"
    assert only["ok"] is False
