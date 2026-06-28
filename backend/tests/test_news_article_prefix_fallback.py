"""Backend tests for the prefix-fallback in GET /api/news/articles/{article_id}.

Covers iteration 158 review-request:
- Exact slug & id lookup still work (no regression).
- Truncated slug single-match returns 200 with the matching article.
- Truncated slug multi-match returns 404 with `candidates` payload.
- Zero-match truncated slug returns plain 404 (no candidates field).
- Short slugs / slugs without trailing '-' are NOT prefix-fallback-eligible.
- Drafts / unapproved articles are NEVER surfaced by the prefix fallback
  (PUBLIC_BASE_QUERY visibility filter is still enforced).
"""
import os
import uuid
import pytest
import requests
from pymongo import MongoClient
from datetime import datetime, timezone

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    BASE_URL = "http://localhost:8001"

ADMIN_EMAIL = "admkoodh@koodh.com"
ADMIN_PASSWORD = "KYLovie13monx"
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")


# ───────────────────────── fixtures ─────────────────────────
@pytest.fixture(scope="module")
def mongo_db():
    client = MongoClient(MONGO_URL)
    return client[DB_NAME]


@pytest.fixture(scope="module")
def admin_token():
    # Retry-tolerant login (the preview ingress occasionally 502s on cold start).
    last = None
    for _ in range(4):
        try:
            r = requests.post(
                f"{BASE_URL}/api/auth/login",
                json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
                timeout=120,
            )
            last = r
            if r.status_code == 200:
                token = r.json().get("token")
                if token:
                    return token
        except Exception as e:
            last = e
    pytest.skip(f"Admin login failed: {getattr(last, 'status_code', last)}")


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


def _force_publish(mongo_db, article_id, slug, *, extra=None, draft=False):
    update = {
        "slug": slug,
        "deleted_at": None,
    }
    if draft:
        # Make sure it stays HIDDEN from the public endpoint.
        update.update({"status": "draft", "approval_status": "pending"})
    else:
        update.update({
            "status": "published",
            "approval_status": "approved",
            "published_at": datetime.now(timezone.utc).isoformat(),
        })
    if extra:
        update.update(extra)
    mongo_db.content_items.update_one({"id": article_id}, {"$set": update})


def _create_article(auth_headers, mongo_db, slug, *, draft=False, body="<p>intro</p>"):
    title = f"TEST_PFX_{uuid.uuid4().hex[:8]}"
    r = requests.post(
        f"{BASE_URL}/api/content",
        json={"title": title, "type": "text", "body": body, "status": "draft"},
        headers=auth_headers, timeout=20,
    )
    assert r.status_code in (200, 201), r.text
    article = r.json()
    _force_publish(mongo_db, article["id"], slug, draft=draft)
    article["slug"] = slug
    article["title"] = title
    return article


@pytest.fixture(scope="module")
def cleanup(mongo_db):
    ids: list[str] = []
    yield ids
    for cid in ids:
        mongo_db.content_items.delete_one({"id": cid})


# ───────────────────────── Tests ─────────────────────────
class TestArticlePrefixFallback:
    def test_exact_slug_lookup_still_works(self, auth_headers, mongo_db, cleanup):
        slug = f"test-exact-slug-{uuid.uuid4().hex[:8]}"
        art = _create_article(auth_headers, mongo_db, slug)
        cleanup.append(art["id"])

        r = requests.get(f"{BASE_URL}/api/news/articles/{slug}", timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["id"] == art["id"]
        assert data["slug"] == slug
        # Detail responses include rendered body.
        assert "body" in data

    def test_exact_id_lookup_still_works(self, auth_headers, mongo_db, cleanup):
        slug = f"test-id-lookup-{uuid.uuid4().hex[:8]}"
        art = _create_article(auth_headers, mongo_db, slug)
        cleanup.append(art["id"])

        r = requests.get(f"{BASE_URL}/api/news/articles/{art['id']}", timeout=20)
        assert r.status_code == 200, r.text
        assert r.json()["id"] == art["id"]

    def test_truncated_slug_single_match_returns_200(self, auth_headers, mongo_db, cleanup):
        # 88-char slug — the canonical real-world case from the bug report.
        full = "genk-investeert-in-jeugdwelzijn-en-gelijke-kansen-met-opening-van-nieuwe-kinderopvang"
        # add a uuid suffix to keep slugs unique across re-runs
        unique = f"{full}-{uuid.uuid4().hex[:6]}"
        art = _create_article(auth_headers, mongo_db, unique)
        cleanup.append(art["id"])

        # Simulate a chat-client truncation at ~70 chars ending with '-'
        truncated = unique[:70].rsplit("-", 1)[0] + "-"
        assert len(truncated) >= 20 and truncated.endswith("-")

        r = requests.get(f"{BASE_URL}/api/news/articles/{truncated}", timeout=20)
        assert r.status_code == 200, f"prefix fallback should resolve single match. got {r.status_code} {r.text[:300]}"
        data = r.json()
        assert data["id"] == art["id"]
        assert data["slug"] == unique

    def test_truncated_slug_multi_match_returns_404_with_candidates(
        self, auth_headers, mongo_db, cleanup
    ):
        run_id = uuid.uuid4().hex[:6]
        prefix = f"genk-investeert-in-stad-{run_id}-iets"
        slug_a = f"{prefix}-extras"
        slug_b = f"{prefix}-anders"
        a = _create_article(auth_headers, mongo_db, slug_a)
        b = _create_article(auth_headers, mongo_db, slug_b)
        cleanup.extend([a["id"], b["id"]])

        # Truncate exactly at the shared prefix + trailing dash.
        truncated = f"{prefix}-"
        assert len(truncated) >= 20 and truncated.endswith("-")

        r = requests.get(f"{BASE_URL}/api/news/articles/{truncated}", timeout=20)
        assert r.status_code == 404, r.text
        body = r.json()
        # FastAPI shape: {"detail": {message, candidates}}
        detail = body.get("detail")
        assert isinstance(detail, dict), f"expected dict detail, got {type(detail)}: {body}"
        assert "did you mean" in detail.get("message", "").lower()
        cands = detail.get("candidates")
        assert isinstance(cands, list) and len(cands) == 2
        slugs = {c["slug"] for c in cands}
        assert slug_a in slugs and slug_b in slugs
        for c in cands:
            assert "slug" in c and "title" in c

    def test_zero_match_truncated_slug_returns_plain_404(self, mongo_db):
        ghost = f"this-slug-does-not-exist-at-all-ever-{uuid.uuid4().hex[:6]}-"
        assert len(ghost) >= 20 and ghost.endswith("-")
        r = requests.get(f"{BASE_URL}/api/news/articles/{ghost}", timeout=20)
        assert r.status_code == 404
        body = r.json()
        # plain detail string — no candidates field
        assert body.get("detail") == "Article not found", body

    def test_short_truncated_key_not_prefix_eligible(self, auth_headers, mongo_db, cleanup):
        # Create a published article whose slug starts with 'short-'
        slug = f"short-but-very-long-slug-{uuid.uuid4().hex[:8]}"
        art = _create_article(auth_headers, mongo_db, slug)
        cleanup.append(art["id"])

        # Lookup with a key < 20 chars ending in '-'. Even though it would
        # match by prefix, the guard must reject it.
        short_key = "short-"  # 6 chars
        assert len(short_key) < 20
        r = requests.get(f"{BASE_URL}/api/news/articles/{short_key}", timeout=20)
        assert r.status_code == 404
        assert r.json().get("detail") == "Article not found"

    def test_slug_without_trailing_dash_not_prefix_eligible(
        self, auth_headers, mongo_db, cleanup
    ):
        run_id = uuid.uuid4().hex[:6]
        # >20 chars but no trailing dash — must NOT trigger the fallback even
        # though a longer matching slug exists.
        full_slug = f"some-existing-prefix-without-trailing-dash-{run_id}-longer"
        art = _create_article(auth_headers, mongo_db, full_slug)
        cleanup.append(art["id"])

        key = f"some-existing-prefix-without-trailing-dash-{run_id}"
        assert len(key) >= 20 and not key.endswith("-")

        r = requests.get(f"{BASE_URL}/api/news/articles/{key}", timeout=20)
        assert r.status_code == 404
        assert r.json().get("detail") == "Article not found"

    def test_draft_not_surfaced_by_prefix_fallback(self, auth_headers, mongo_db, cleanup):
        run_id = uuid.uuid4().hex[:6]
        # Single draft whose slug starts with the lookup prefix.
        draft_slug = f"draft-only-article-genk-investeert-{run_id}-detail"
        art = _create_article(auth_headers, mongo_db, draft_slug, draft=True)
        cleanup.append(art["id"])

        # Sanity check the DB-side state — it must really be draft.
        doc = mongo_db.content_items.find_one({"id": art["id"]}, {"_id": 0, "status": 1, "approval_status": 1})
        assert doc["status"] == "draft"

        truncated = f"draft-only-article-genk-investeert-{run_id}-"
        assert len(truncated) >= 20 and truncated.endswith("-")

        r = requests.get(f"{BASE_URL}/api/news/articles/{truncated}", timeout=20)
        # Draft must NOT be returned and must NOT appear as a candidate either.
        assert r.status_code == 404
        body = r.json()
        # plain detail string — no candidates because draft is invisible
        if isinstance(body.get("detail"), dict):
            cands = body["detail"].get("candidates", [])
            slugs = {c["slug"] for c in cands}
            assert draft_slug not in slugs, "draft must never appear as candidate"
        else:
            assert body.get("detail") == "Article not found"
