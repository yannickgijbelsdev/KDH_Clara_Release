"""Tests for PUT /api/shows/titles/{title_id} duplicate-name guard fix."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://api-turbo.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admkoodh@koodh.com"
ADMIN_PASSWORD = "KYLovie13monx"
MAIN_SITE_SLUG = "radiogroep"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    token = r.json().get("access_token") or r.json().get("token")
    assert token, f"No token in login response: {r.json()}"
    s.headers.update({
        "Authorization": f"Bearer {token}",
        "X-Main-Site": MAIN_SITE_SLUG,
    })
    return s


@pytest.fixture(scope="module")
def titles(session):
    r = session.get(f"{BASE_URL}/api/shows/titles")
    assert r.status_code == 200, f"List titles failed: {r.status_code} {r.text}"
    data = r.json()
    assert isinstance(data, list) and len(data) >= 2, f"Need >=2 titles, got {len(data) if isinstance(data, list) else data}"
    return data


def test_update_same_name_other_fields_only(session, titles):
    """Scenario 1: Update WITHOUT changing name — must succeed."""
    title = titles[0]
    tid = title["id"]
    original_name = title["name"]
    original_presenters = title.get("default_presenter_ids", []) or []

    # toggle presenters list (append dummy or remove)
    new_presenters = original_presenters + ["__TEST_PRESENTER__"] if "__TEST_PRESENTER__" not in original_presenters else original_presenters[:-1]

    payload = {"name": original_name, "default_presenter_ids": new_presenters}
    r = session.put(f"{BASE_URL}/api/shows/titles/{tid}", json=payload)
    assert r.status_code == 200, f"Same-name update rejected: {r.status_code} {r.text}"
    body = r.json()
    assert body.get("name") == original_name
    assert body.get("default_presenter_ids") == new_presenters

    # restore
    session.put(f"{BASE_URL}/api/shows/titles/{tid}",
                json={"name": original_name, "default_presenter_ids": original_presenters})


def test_update_rename_to_existing_rejected(session, titles):
    """Scenario 2: Renaming to an existing other title's name must 400."""
    a, b = titles[0], titles[1]
    r = session.put(f"{BASE_URL}/api/shows/titles/{a['id']}", json={"name": b["name"]})
    assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text}"
    assert "already exists" in r.text.lower()


def test_update_rename_to_unique_allowed(session, titles):
    """Scenario 3: Renaming to a unique name must succeed, then restore."""
    a = titles[0]
    tid = a["id"]
    original_name = a["name"]
    unique = f"TEST_RENAME_{uuid.uuid4().hex[:8]}"

    r = session.put(f"{BASE_URL}/api/shows/titles/{tid}", json={"name": unique})
    assert r.status_code == 200, f"Unique rename failed: {r.status_code} {r.text}"
    assert r.json().get("name") == unique

    # verify via GET list
    r2 = session.get(f"{BASE_URL}/api/shows/titles")
    assert r2.status_code == 200
    assert any(t["id"] == tid and t["name"] == unique for t in r2.json())

    # restore
    rr = session.put(f"{BASE_URL}/api/shows/titles/{tid}", json={"name": original_name})
    assert rr.status_code == 200, f"Restore rename failed: {rr.status_code} {rr.text}"


def test_case_insensitive_duplicate_still_enforced(session, titles):
    """Scenario 4: Renaming to a lowercase variant of another title must 400."""
    a, b = titles[0], titles[1]
    lowered = (b["name"] or "").lower()
    if lowered == (a["name"] or "").lower():
        pytest.skip("Titles A and B share names; cannot test case-insensitive dup")
    # Only meaningful if b.name has at least one letter (so case flip matters)
    if lowered == b["name"]:
        # try uppercase instead
        lowered = b["name"].upper()
    r = session.put(f"{BASE_URL}/api/shows/titles/{a['id']}", json={"name": lowered})
    assert r.status_code == 400, f"Expected 400 for case-insensitive dup, got {r.status_code}: {r.text}"
    assert "already exists" in r.text.lower()
