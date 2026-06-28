"""Backend tests for the rendered <section class='clara-liveblog'> HTML
that is appended to body in GET /api/news/articles/{id}.

Covers:
- HTML structure: section + ol timeline, exactly once.
- Each entry has <li> with <time datetime=ISO> formatted in Dutch.
- Title -> <h3>; absent title omits h3.
- Image -> <figure> + <img> + <figcaption> with credit line when credit set.
- Video embed_html -> <div class='clara-liveblog-embed'>html</div>.
- Video url-only -> <video class='clara-liveblog-video' controls>.
- Header LIVE vs ended state.
- liveblog_entries[] still present alongside HTML.
- Drafts hidden from both HTML and liveblog_entries[].
- Zero published entries -> no clara-liveblog markup.
- Regression: featured-image caption + inline <img> figcaption still injected.
"""
import os
import re
import uuid
import pytest
import requests
from pymongo import MongoClient

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
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=20,
    )
    if r.status_code != 200:
        pytest.skip(f"Admin login failed: {r.status_code} {r.text[:200]}")
    token = r.json().get("token")
    if not token:
        pytest.skip("Admin login did not return a token (2FA?)")
    return token


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


def _force_publish_article(mongo_db, article_id, *, is_liveblog=True, extra=None):
    update = {
        "status": "published",
        "approval_status": "approved",
        "deleted_at": None,
        "is_liveblog": is_liveblog,
    }
    if extra:
        update.update(extra)
    mongo_db.content_items.update_one({"id": article_id}, {"$set": update})


def _create_article(auth_headers, mongo_db, *, is_liveblog=True, body="<p>intro</p>", extra=None):
    title = f"TEST_LBHTML_{uuid.uuid4().hex[:8]}"
    r = requests.post(
        f"{BASE_URL}/api/content",
        json={"title": title, "type": "text", "body": body, "status": "draft"},
        headers=auth_headers, timeout=20,
    )
    assert r.status_code in (200, 201), r.text
    article = r.json()
    if is_liveblog:
        requests.put(
            f"{BASE_URL}/api/content/{article['id']}",
            json={"is_liveblog": True},
            headers=auth_headers, timeout=20,
        )
    _force_publish_article(mongo_db, article["id"], is_liveblog=is_liveblog, extra=extra)
    return article


@pytest.fixture(scope="module")
def cleanup(mongo_db):
    created_ids: list[str] = []
    yield created_ids
    for cid in created_ids:
        mongo_db.liveblog_entries.delete_many({"content_id": cid})
        mongo_db.content_items.delete_one({"id": cid})


# ───────────────────────── Tests ─────────────────────────
class TestLiveblogHtmlRendering:
    def test_full_structure_with_two_published_entries(self, auth_headers, mongo_db, cleanup):
        article = _create_article(auth_headers, mongo_db)
        cid = article["id"]
        cleanup.append(cid)

        # Entry 1: title + image with credit
        r1 = requests.post(
            f"{BASE_URL}/api/content/{cid}/liveblog/entries",
            json={
                "title": "Entry With Image",
                "body": "<p>image entry body</p>",
                "images": [{
                    "url": "https://example.com/photo.jpg",
                    "credit": "Reuters",
                    "photographer": "Jane Doe",
                }],
            }, headers=auth_headers, timeout=20,
        )
        assert r1.status_code == 201, r1.text
        e1 = r1.json()
        assert e1["published"] is True

        # Entry 2: body-only (no title)
        r2 = requests.post(
            f"{BASE_URL}/api/content/{cid}/liveblog/entries",
            json={"body": "<p>second body-only update</p>"},
            headers=auth_headers, timeout=20,
        )
        assert r2.status_code == 201, r2.text
        e2 = r2.json()
        assert e2["published"] is True

        # GET public article
        pr = requests.get(f"{BASE_URL}/api/news/articles/{cid}", timeout=20)
        assert pr.status_code == 200, pr.text
        data = pr.json()
        body = data["body"]

        # liveblog_entries[] still in JSON
        assert "liveblog_entries" in data
        assert len(data["liveblog_entries"]) == 2

        # Section appears exactly once
        assert body.count('<section class="clara-liveblog"') == 1
        assert '<ol class="clara-liveblog-timeline">' in body

        # 2 <li class='clara-liveblog-entry'>
        li_count = len(re.findall(r'<li class="clara-liveblog-entry"', body))
        assert li_count == 2, f"expected 2 entries, got {li_count}"

        # Each entry has <time datetime="..."> with ISO; readable Dutch text contains ' · '
        time_matches = re.findall(
            r'<time class="clara-liveblog-time" datetime="([^"]+)">([^<]+)</time>',
            body,
        )
        assert len(time_matches) == 2
        for iso, label in time_matches:
            # datetime attr equal to raw ISO timestamp
            assert iso, "datetime attr must not be empty"
            # Dutch format contains middle dot separator
            assert " · " in label, f"expected Dutch time label, got {label}"
            # Dutch month name
            assert any(m in label for m in [
                "januari", "februari", "maart", "april", "mei", "juni",
                "juli", "augustus", "september", "oktober", "november", "december"
            ]), f"expected dutch month name in {label}"

        # Entry 1 has the title h3
        assert '<h3 class="clara-liveblog-entry-title">Entry With Image</h3>' in body
        # Body-only entry should NOT produce an h3 for entry 2 — only one h3 in the timeline
        h3_count = len(re.findall(r'<h3 class="clara-liveblog-entry-title">', body))
        assert h3_count == 1, f"expected 1 h3 (only titled entry), got {h3_count}"

        # Image figure + figcaption with credit
        assert '<figure class="clara-liveblog-figure">' in body
        assert 'src="https://example.com/photo.jpg"' in body
        assert '<figcaption class="clara-liveblog-credit">' in body
        # Credit line should mention Reuters (and photographer)
        assert "Reuters" in body
        assert "Jane Doe" in body

        # Header: should contain LIVE since is_liveblog=true
        assert "● LIVE" in body
        assert "Liveblog beëindigd" not in body

    def test_zero_published_entries_no_markup(self, auth_headers, mongo_db, cleanup):
        article = _create_article(auth_headers, mongo_db)
        cid = article["id"]
        cleanup.append(cid)

        # Create only a draft, no published entries
        r = requests.post(
            f"{BASE_URL}/api/content/{cid}/liveblog/entries",
            json={"title": "DraftOnly", "publish": False},
            headers=auth_headers, timeout=20,
        )
        assert r.status_code == 201
        assert r.json()["published"] is False

        pr = requests.get(f"{BASE_URL}/api/news/articles/{cid}", timeout=20)
        assert pr.status_code == 200
        body = pr.json()["body"]
        assert "clara-liveblog" not in body, "no markup expected when zero published entries"
        # liveblog_entries[] empty / no drafts leaked
        assert pr.json()["liveblog_entries"] == []

    def test_draft_entries_not_in_html_nor_array(self, auth_headers, mongo_db, cleanup):
        article = _create_article(auth_headers, mongo_db)
        cid = article["id"]
        cleanup.append(cid)

        # 1 published + 1 draft
        rp = requests.post(
            f"{BASE_URL}/api/content/{cid}/liveblog/entries",
            json={"title": "PubVisible", "body": "<p>p</p>"},
            headers=auth_headers, timeout=20,
        )
        rd = requests.post(
            f"{BASE_URL}/api/content/{cid}/liveblog/entries",
            json={"title": "DraftHidden", "publish": False},
            headers=auth_headers, timeout=20,
        )
        assert rp.status_code == 201 and rd.status_code == 201
        pub_id, draft_id = rp.json()["id"], rd.json()["id"]

        pr = requests.get(f"{BASE_URL}/api/news/articles/{cid}", timeout=20)
        body = pr.json()["body"]
        ids = [e["id"] for e in pr.json()["liveblog_entries"]]
        assert pub_id in ids
        assert draft_id not in ids
        assert "PubVisible" in body
        assert "DraftHidden" not in body

    def test_ended_liveblog_header(self, auth_headers, mongo_db, cleanup):
        # Article with is_liveblog=false but liveblog_ended_at set + published entry
        ended = "2026-01-10T12:30:00+00:00"
        article = _create_article(
            auth_headers, mongo_db,
            is_liveblog=False,
            extra={"liveblog_ended_at": ended},
        )
        cid = article["id"]
        cleanup.append(cid)

        # Article was created with is_liveblog=False so /entries endpoint may
        # reject — temporarily flip it back, post entry, then flip off.
        mongo_db.content_items.update_one({"id": cid}, {"$set": {"is_liveblog": True}})
        r = requests.post(
            f"{BASE_URL}/api/content/{cid}/liveblog/entries",
            json={"title": "FinalUpdate", "body": "<p>last word</p>"},
            headers=auth_headers, timeout=20,
        )
        assert r.status_code == 201, r.text
        # Now flip is_liveblog back to False and set ended_at
        mongo_db.content_items.update_one(
            {"id": cid},
            {"$set": {"is_liveblog": False, "liveblog_ended_at": ended}},
        )

        pr = requests.get(f"{BASE_URL}/api/news/articles/{cid}", timeout=20)
        assert pr.status_code == 200
        data = pr.json()
        # auto-archive may also touch this — accept either provided ended date
        # or auto-archive's own timestamp.
        body = data["body"]
        assert "Liveblog beëindigd" in body
        assert "● LIVE" not in body
        # Should still render the timeline ol
        assert '<ol class="clara-liveblog-timeline">' in body

    def test_video_embed_html_and_url(self, auth_headers, mongo_db, cleanup):
        article = _create_article(auth_headers, mongo_db)
        cid = article["id"]
        cleanup.append(cid)

        # Entry with embed_html
        embed_html = '<iframe src="https://youtube.com/embed/abc"></iframe>'
        r1 = requests.post(
            f"{BASE_URL}/api/content/{cid}/liveblog/entries",
            json={
                "title": "EmbedVid",
                "videos": [{"embed_html": embed_html}],
            }, headers=auth_headers, timeout=20,
        )
        assert r1.status_code == 201, r1.text

        # Entry with only url
        r2 = requests.post(
            f"{BASE_URL}/api/content/{cid}/liveblog/entries",
            json={
                "title": "UrlVid",
                "videos": [{"url": "https://example.com/clip.mp4"}],
            }, headers=auth_headers, timeout=20,
        )
        assert r2.status_code == 201, r2.text

        pr = requests.get(f"{BASE_URL}/api/news/articles/{cid}", timeout=20)
        body = pr.json()["body"]

        assert '<div class="clara-liveblog-embed">' in body
        assert embed_html in body, "iframe HTML must be passed through"
        assert '<video class="clara-liveblog-video"' in body
        assert 'src="https://example.com/clip.mp4"' in body
        assert "controls" in body

    def test_regression_featured_image_caption_at_top_of_body(
        self, auth_headers, mongo_db, cleanup
    ):
        """Featured image caption (<p class='clara-image-credit'>) must still
        be injected at the TOP of body, BEFORE the liveblog section."""
        article = _create_article(
            auth_headers, mongo_db,
            body="<p>original body content</p>",
            extra={
                "featured_image_url": "https://example.com/hero.jpg",
                "photo_credit": "AFP",
                "photo_photographer": "Bob",
            },
        )
        cid = article["id"]
        cleanup.append(cid)

        r = requests.post(
            f"{BASE_URL}/api/content/{cid}/liveblog/entries",
            json={"title": "AlongsideHero", "body": "<p>x</p>"},
            headers=auth_headers, timeout=20,
        )
        assert r.status_code == 201

        pr = requests.get(f"{BASE_URL}/api/news/articles/{cid}", timeout=20)
        body = pr.json()["body"]
        # Caption present
        assert '<p class="clara-image-credit">' in body
        assert "AFP" in body
        # Caption appears BEFORE the liveblog section
        idx_caption = body.find('<p class="clara-image-credit">')
        idx_section = body.find('<section class="clara-liveblog"')
        assert idx_caption != -1 and idx_section != -1
        assert idx_caption < idx_section, "caption must sit at top of body, before liveblog section"

    def test_regression_inline_img_figcaption_injection(
        self, auth_headers, mongo_db, cleanup
    ):
        """_inject_body_attributions must still wrap inline body <img> tags
        with <figure>/<figcaption> when image_attributions has an entry."""
        body_html = (
            "<p>intro</p>"
            '<img src="https://example.com/inline.jpg" alt="x" />'
            "<p>outro</p>"
        )
        article = _create_article(
            auth_headers, mongo_db,
            body=body_html,
            extra={
                "image_attributions": {
                    "https://example.com/inline.jpg": {"credit": "DPA", "photographer": "Alice"}
                },
            },
        )
        cid = article["id"]
        cleanup.append(cid)

        # Add at least one published liveblog entry so we know the body still
        # contains the figure even with liveblog section appended.
        r = requests.post(
            f"{BASE_URL}/api/content/{cid}/liveblog/entries",
            json={"title": "Y", "body": "<p>y</p>"},
            headers=auth_headers, timeout=20,
        )
        assert r.status_code == 201

        pr = requests.get(f"{BASE_URL}/api/news/articles/{cid}", timeout=20)
        body = pr.json()["body"]
        # Inline image wrapped
        assert '<figure class="clara-img-figure">' in body
        assert '<figcaption class="clara-img-credit">' in body
        assert "DPA" in body
        # And the liveblog section still appended
        assert '<section class="clara-liveblog"' in body

    def test_unpublishing_removes_entry_from_html(self, auth_headers, mongo_db, cleanup):
        article = _create_article(auth_headers, mongo_db)
        cid = article["id"]
        cleanup.append(cid)

        r1 = requests.post(
            f"{BASE_URL}/api/content/{cid}/liveblog/entries",
            json={"title": "Keeper", "body": "<p>stay</p>"},
            headers=auth_headers, timeout=20,
        )
        r2 = requests.post(
            f"{BASE_URL}/api/content/{cid}/liveblog/entries",
            json={"title": "Disappearing", "body": "<p>bye</p>"},
            headers=auth_headers, timeout=20,
        )
        assert r1.status_code == 201 and r2.status_code == 201
        keep_id, drop_id = r1.json()["id"], r2.json()["id"]

        # Sanity: both visible
        pr = requests.get(f"{BASE_URL}/api/news/articles/{cid}", timeout=20)
        body = pr.json()["body"]
        assert "Keeper" in body and "Disappearing" in body

        # Unpublish the second one directly in mongo (no public unpublish API
        # for entries needed here — we just verify the public detail honours
        # the flip).
        mongo_db.liveblog_entries.update_one(
            {"id": drop_id},
            {"$set": {"published": False, "published_at": None}},
        )

        pr2 = requests.get(f"{BASE_URL}/api/news/articles/{cid}", timeout=20)
        body2 = pr2.json()["body"]
        assert "Keeper" in body2
        assert "Disappearing" not in body2
        # liveblog_entries[] also reflects the change
        ids = [e["id"] for e in pr2.json()["liveblog_entries"]]
        assert keep_id in ids
        assert drop_id not in ids
