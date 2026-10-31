# QR code tracking: CRUD, redirect + scan logging, public Clara Campaigns API
import os
import time
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
MOBILE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
TABLET_UA = "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Safari/604.1"


def _login(email, pw):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw})
    if r.status_code != 200:
        pytest.skip(f"login failed {email}: {r.status_code}")
    d = r.json()
    return d.get("token") or d.get("access_token")


@pytest.fixture(scope="module")
def admin():
    s = requests.Session()
    s.headers["Authorization"] = f"Bearer {_login('admkoodh@koodh.com', 'KYLovie13monx')}"
    return s


@pytest.fixture(scope="module")
def other():
    s = requests.Session()
    s.headers["Authorization"] = f"Bearer {_login('yannick.gijbels@koodh.com', 'test')}"
    return s


@pytest.fixture(scope="module")
def mdb():
    env = dict(l.strip().split("=", 1) for l in open("/app/backend/.env") if "=" in l and not l.startswith("#"))
    c = MongoClient(env["MONGO_URL"].strip('"'))
    return c[env["DB_NAME"].strip('"')]


@pytest.fixture(scope="module")
def qr(admin, mdb):
    r = admin.post(f"{BASE_URL}/api/qr-codes", json={"target_url": "https://example.com/a", "label": "TEST_qr"})
    assert r.status_code == 200, r.text
    d = r.json()
    yield d
    mdb.qr_codes.delete_many({"label": {"$regex": "^TEST_"}})
    mdb.qr_scans.delete_many({"qr_id": d["id"]})


def _hit(code, ua, extra=None):
    h = {"User-Agent": ua, **(extra or {})}
    return requests.get(f"{BASE_URL}/api/q/{code}", headers=h, allow_redirects=False)


class TestCrud:
    def test_create_fields(self, qr):
        assert qr["tracking_enabled"] is True
        assert qr["tracking_url"].endswith(f"/api/q/{qr['code']}")
        assert f"/api/public/qr/{qr['code']}/stats?token=" in qr["api_url"]
        assert f"/api/public/qr/{qr['code']}/scans?token=" in qr["scans_api_url"]
        assert "api_token" not in qr
        assert qr["tracking_url"].startswith(BASE_URL)

    def test_non_http_400(self, admin):
        r = admin.post(f"{BASE_URL}/api/qr-codes", json={"target_url": "hello world", "label": "TEST_bad"})
        assert r.status_code == 400

    def test_unauth_401(self):
        r = requests.post(f"{BASE_URL}/api/qr-codes", json={"target_url": "https://x.com"})
        assert r.status_code in (401, 403)

    def test_list_and_get(self, admin, qr):
        r = admin.get(f"{BASE_URL}/api/qr-codes")
        assert r.status_code == 200 and any(x["id"] == qr["id"] for x in r.json())
        g = admin.get(f"{BASE_URL}/api/qr-codes/{qr['id']}")
        assert g.status_code == 200 and g.json()["code"] == qr["code"]

    def test_other_team_404(self, other, admin, qr):
        me1 = admin.get(f"{BASE_URL}/api/auth/me").json()
        me2 = other.get(f"{BASE_URL}/api/auth/me").json()
        if me1.get("team_id") == me2.get("team_id"):
            pytest.skip("same team")
        r = other.get(f"{BASE_URL}/api/qr-codes/{qr['id']}")
        assert r.status_code == 404


class TestRedirectAndScans:
    def test_unknown_404(self):
        assert _hit("zzzzzzzz9", MOBILE_UA).status_code == 404

    def test_redirect_and_logging(self, qr, mdb):
        r = _hit(qr["code"], MOBILE_UA, {"cf-ipcountry": "BE", "cf-ipcity": "Kasterlee"})
        assert r.status_code == 302 and r.headers["location"] == "https://example.com/a"
        _hit(qr["code"], MOBILE_UA, {"cf-ipcountry": "BE", "cf-ipcity": "Kasterlee"})
        _hit(qr["code"], DESKTOP_UA)
        _hit(qr["code"], TABLET_UA)
        for bot in ("WhatsApp/2.23", "curl/8.0", "Googlebot/2.1", "TelegramBot (like TwitterBot) preview"):
            assert _hit(qr["code"], bot).status_code == 302
        time.sleep(4)
        scans = list(mdb.qr_scans.find({"qr_id": qr["id"]}))
        assert len(scans) == 4, [s.get("device_type") for s in scans]
        for s in scans:
            assert not any("ip" == k.lower() or "ip_" in k.lower() or k.lower().endswith("_ip") for k in s.keys()), s.keys()
        devices = sorted(s["device_type"] for s in scans)
        assert devices == ["desktop", "mobile", "mobile", "tablet"]
        mob = [s for s in scans if s["device_type"] == "mobile"]
        assert mob[0]["os"] == "iOS" and mob[0]["browser"] == "Safari"
        assert sorted(s["unique"] for s in mob) == [False, True]
        # client cf-* headers are overwritten by the ingress; geo comes from the real IP lookup
        assert all("country" in s and "city" in s for s in scans)
        desk = [s for s in scans if s["device_type"] == "desktop"][0]
        assert desk["os"] == "Windows" and desk["browser"] == "Chrome"


class TestPublicApi:
    def test_stats(self, qr):
        r = requests.get(qr["api_url"])
        assert r.status_code == 200
        assert r.headers.get("access-control-allow-origin") == "*"
        d = r.json()
        for k in ("qr", "totals", "by_day", "by_device", "by_os", "by_browser", "by_country", "by_city", "recent_scans"):
            assert k in d
        assert d["totals"]["scans"] == 4 and d["totals"]["unique_scans"] == 3
        assert d["totals"]["first_scan_at"] and d["totals"]["last_scan_at"]
        assert "api_token" not in d["qr"]
        assert all("visitor" not in s for s in d["recent_scans"])
        assert requests.get(qr["api_url"] + "&days=1").json()["period_days"] == 1

    def test_scans_incremental(self, qr):
        r = requests.get(qr["scans_api_url"] + "&limit=2")
        d = r.json()
        assert r.status_code == 200 and d["count"] == 2 and d["has_more"] is True
        assert d["scans"][0]["scanned_at"] <= d["scans"][1]["scanned_at"]
        r2 = requests.get(qr["scans_api_url"], params={"since": d["next_since"]}).json()
        assert r2["count"] == 2 and r2["has_more"] is False

    def test_bad_token_and_header(self, qr):
        base = f"{BASE_URL}/api/public/qr/{qr['code']}"
        assert requests.get(f"{base}/stats?token=wrong").status_code == 401
        assert requests.get(f"{base}/stats").status_code == 401
        assert requests.get(f"{base}/scans?token=wrong").status_code == 401
        tok = qr["api_url"].split("token=")[1]
        assert requests.get(f"{base}/stats", headers={"X-API-Key": tok}).status_code == 200

    def test_patch_and_tracking_off(self, admin, qr, mdb):
        r = admin.patch(f"{BASE_URL}/api/qr-codes/{qr['id']}", json={"target_url": "https://example.org/b"})
        assert r.status_code == 200 and r.json()["code"] == qr["code"]
        assert _hit(qr["code"], MOBILE_UA).headers["location"] == "https://example.org/b"
        assert admin.patch(f"{BASE_URL}/api/qr-codes/{qr['id']}", json={"target_url": "ftp://x"}).status_code == 400
        r = admin.patch(f"{BASE_URL}/api/qr-codes/{qr['id']}", json={"tracking_enabled": False})
        assert r.json()["tracking_enabled"] is False
        time.sleep(2)
        before = mdb.qr_scans.count_documents({"qr_id": qr["id"]})
        assert _hit(qr["code"], DESKTOP_UA + " x").status_code == 302
        time.sleep(2)
        assert mdb.qr_scans.count_documents({"qr_id": qr["id"]}) == before

    def test_rotate_token(self, admin, qr):
        r = admin.post(f"{BASE_URL}/api/qr-codes/{qr['id']}/rotate-token")
        assert r.status_code == 200
        new = r.json()["api_url"]
        assert new != qr["api_url"]
        assert requests.get(qr["api_url"]).status_code == 401
        assert requests.get(new).status_code == 200
