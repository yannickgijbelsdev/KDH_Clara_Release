"""Trackable QR codes.

Editors create a QR record whose short link (/api/q/{code}) is encoded in the QR image.
Each scan is logged (time, device, OS, browser, country, city; no IP stored) and the
visitor is redirected to the target. Clara Campaigns reads the data per QR code via
/api/public/qr/{code}/stats|scans?token=... (token-protected, read-only).
"""
import hashlib
import hmac
import ipaddress
import logging
import os
import re
import secrets
from datetime import datetime, timezone, timedelta
from typing import Optional
from urllib.parse import unquote

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel

from database import db
from services.auth import require_editor_or_admin
from services.main_site_context import get_main_site_id_from_header
from routers.public_schedule import _public_base_url

logger = logging.getLogger(__name__)

qr_router = APIRouter(tags=["QR Codes"])

CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"
URL_RE = re.compile(r"^https?://[^\s]+$", re.IGNORECASE)
BOT_RE = re.compile(r"bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|discord|curl|wget|python-requests|headless", re.I)
PUBLIC_HEADERS = {"Access-Control-Allow-Origin": "*", "Cache-Control": "no-store"}
SCAN_FIELDS = {"_id": 0, "id": 1, "scanned_at": 1, "device_type": 1, "os": 1, "browser": 1,
               "country": 1, "city": 1, "unique": 1}


class QrCreate(BaseModel):
    target_url: str
    label: Optional[str] = None
    content_id: Optional[str] = None
    tracking_enabled: bool = True


class QrUpdate(BaseModel):
    target_url: Optional[str] = None
    label: Optional[str] = None
    tracking_enabled: Optional[bool] = None


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _validate_url(url: str) -> str:
    url = (url or "").strip()
    if not URL_RE.match(url):
        raise HTTPException(status_code=400, detail="Tracking only works for links starting with http:// or https://")
    return url


def _links(base: str, qr: dict) -> dict:
    return {
        "tracking_url": f"{base}/api/q/{qr['code']}",
        "api_url": f"{base}/api/public/qr/{qr['code']}/stats?token={qr['api_token']}",
        "scans_api_url": f"{base}/api/public/qr/{qr['code']}/scans?token={qr['api_token']}",
    }


def _public_qr(base: str, qr: dict) -> dict:
    keys = ("id", "code", "label", "target_url", "content_id", "tracking_enabled",
            "scan_count", "unique_scan_count", "last_scan_at", "created_at", "updated_at")
    return {**{k: qr.get(k) for k in keys}, **_links(base, qr)}


async def _new_code() -> str:
    for _ in range(10):
        code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(8))
        if not await db.qr_codes.find_one({"code": code}, {"_id": 1}):
            return code
    raise HTTPException(status_code=500, detail="Could not allocate a QR code")


def _scope(current_user: dict) -> dict:
    # Users without a team (e.g. platform admins) only see their own QR codes.
    team_id = current_user.get("team_id")
    return {"team_id": team_id} if team_id else {"team_id": None, "created_by": current_user.get("id")}


async def _owned_qr(qr_id: str, current_user: dict) -> dict:
    qr = await db.qr_codes.find_one({"id": qr_id, **_scope(current_user)}, {"_id": 0})
    if not qr:
        raise HTTPException(status_code=404, detail="QR code not found")
    return qr


@qr_router.post("/qr-codes")
async def create_qr_code(body: QrCreate, request: Request, current_user: dict = Depends(require_editor_or_admin)):
    now = _now().isoformat()
    qr = {
        "id": secrets.token_hex(12), "code": await _new_code(), "api_token": secrets.token_urlsafe(24),
        "target_url": _validate_url(body.target_url), "label": (body.label or "").strip()[:120] or None,
        "content_id": body.content_id, "tracking_enabled": body.tracking_enabled,
        "team_id": current_user.get("team_id"), "main_site_id": await get_main_site_id_from_header(request),
        "created_by": current_user.get("id"), "scan_count": 0, "unique_scan_count": 0,
        "last_scan_at": None, "created_at": now, "updated_at": now,
    }
    await db.qr_codes.insert_one({**qr})
    return _public_qr(_public_base_url(request), qr)


@qr_router.get("/qr-codes")
async def list_qr_codes(request: Request, content_id: Optional[str] = None,
                        current_user: dict = Depends(require_editor_or_admin)):
    query = _scope(current_user)
    if content_id:
        query["content_id"] = content_id
    items = await db.qr_codes.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    base = _public_base_url(request)
    return [_public_qr(base, q) for q in items]


@qr_router.get("/qr-codes/{qr_id}")
async def get_qr_code(qr_id: str, request: Request, current_user: dict = Depends(require_editor_or_admin)):
    return _public_qr(_public_base_url(request), await _owned_qr(qr_id, current_user))


@qr_router.patch("/qr-codes/{qr_id}")
async def update_qr_code(qr_id: str, body: QrUpdate, request: Request,
                         current_user: dict = Depends(require_editor_or_admin)):
    qr = await _owned_qr(qr_id, current_user)
    patch = {"updated_at": _now().isoformat()}
    if body.target_url is not None:
        patch["target_url"] = _validate_url(body.target_url)
    if body.label is not None:
        patch["label"] = body.label.strip()[:120] or None
    if body.tracking_enabled is not None:
        patch["tracking_enabled"] = body.tracking_enabled
    await db.qr_codes.update_one({"id": qr_id}, {"$set": patch})
    return _public_qr(_public_base_url(request), {**qr, **patch})


@qr_router.post("/qr-codes/{qr_id}/rotate-token")
async def rotate_qr_token(qr_id: str, request: Request, current_user: dict = Depends(require_editor_or_admin)):
    qr = await _owned_qr(qr_id, current_user)
    token = secrets.token_urlsafe(24)
    await db.qr_codes.update_one({"id": qr_id}, {"$set": {"api_token": token, "updated_at": _now().isoformat()}})
    return _public_qr(_public_base_url(request), {**qr, "api_token": token})


# ── Scan tracking ──

def _parse_ua(ua: str) -> dict:
    u = ua.lower()
    if "ipad" in u or "tablet" in u or ("android" in u and "mobile" not in u):
        device = "tablet"
    elif "mobi" in u or "iphone" in u or "android" in u:
        device = "mobile"
    else:
        device = "desktop"
    if "iphone" in u or "ipad" in u or "ios" in u:
        os_name = "iOS"
    elif "android" in u:
        os_name = "Android"
    elif "windows" in u:
        os_name = "Windows"
    elif "mac os" in u or "macintosh" in u:
        os_name = "macOS"
    elif "linux" in u:
        os_name = "Linux"
    else:
        os_name = "Other"
    for name, marker in (("Edge", "edg/"), ("Samsung Internet", "samsungbrowser"), ("Opera", "opr/"),
                         ("Firefox", "firefox"), ("Chrome", "chrome"), ("Chrome", "crios"), ("Safari", "safari")):
        if marker in u:
            return {"device_type": device, "os": os_name, "browser": name}
    return {"device_type": device, "os": os_name, "browser": "Other"}


def _client_ip(request: Request) -> str:
    h = request.headers
    return (h.get("cf-connecting-ip") or (h.get("x-forwarded-for") or "").split(",")[0].strip()
            or (request.client.host if request.client else ""))


def _header_geo(request: Request) -> dict:
    h = request.headers
    country = (h.get("cf-ipcountry") or "").upper()
    city = unquote(h.get("cf-ipcity") or "")
    return {"country": country if country and country not in ("XX", "T1") else None, "city": city or None}


_geo_cache: dict = {}


async def _lookup_geo(ip: str) -> dict:
    try:
        if not ipaddress.ip_address(ip).is_global:
            return {}
    except ValueError:
        return {}
    if ip in _geo_cache:
        return _geo_cache[ip]
    geo = {}
    try:
        async with httpx.AsyncClient(timeout=4) as client:
            r = await client.get(f"https://ipwho.is/{ip}", params={"fields": "success,country_code,city"})
            data = r.json() if r.status_code == 200 else {}
            if data.get("success"):
                geo = {"country": data.get("country_code"), "city": data.get("city")}
            else:
                r = await client.get(f"https://ipapi.co/{ip}/json/")
                data = r.json() if r.status_code == 200 else {}
                if not data.get("error"):
                    geo = {"country": data.get("country_code"), "city": data.get("city")}
    except Exception as e:
        logger.debug("Geo lookup failed: %s", e)
    if geo:
        if len(_geo_cache) > 5000:
            _geo_cache.clear()
        _geo_cache[ip] = geo
    return geo


async def _record_scan(qr_id: str, ua: str, ip: str, geo: dict):
    now = _now()
    # Keyed, daily-rotating hash: counts unique visitors without storing (or exposing) the IP.
    visitor = hmac.new(os.environ["JWT_SECRET"].encode(), f"{qr_id}|{ip}|{ua}|{now.date().isoformat()}".encode(),
                       hashlib.sha256).hexdigest()
    burst = await db.qr_scans.count_documents(
        {"qr_id": qr_id, "visitor": visitor, "scanned_at": {"$gte": (now - timedelta(minutes=1)).isoformat()}})
    if burst >= 5:
        return
    if not geo.get("country"):
        geo = {**geo, **{k: v for k, v in (await _lookup_geo(ip)).items() if v}}
    unique = not await db.qr_scans.find_one({"qr_id": qr_id, "visitor": visitor}, {"_id": 1})
    scan = {"id": secrets.token_hex(12), "qr_id": qr_id, "scanned_at": now.isoformat(), "visitor": visitor,
            "unique": unique, "country": geo.get("country"), "city": geo.get("city"), **_parse_ua(ua)}
    await db.qr_scans.insert_one({**scan})
    await db.qr_codes.update_one({"id": qr_id}, {
        "$inc": {"scan_count": 1, "unique_scan_count": 1 if unique else 0},
        "$set": {"last_scan_at": scan["scanned_at"]},
    })


@qr_router.api_route("/q/{code}", methods=["GET", "HEAD"])
async def qr_redirect(code: str, request: Request, background: BackgroundTasks):
    qr = await db.qr_codes.find_one({"code": code}, {"_id": 0, "id": 1, "target_url": 1, "tracking_enabled": 1})
    if not qr:
        raise HTTPException(status_code=404, detail="QR code not found")
    ua = request.headers.get("user-agent") or ""
    if qr.get("tracking_enabled") and request.method == "GET" and not BOT_RE.search(ua):
        background.add_task(_record_scan, qr["id"], ua, _client_ip(request), _header_geo(request))
    return RedirectResponse(qr["target_url"], status_code=302, headers={"Cache-Control": "no-store"})


# ── Public read API for Clara Campaigns ──

async def _qr_for_token(code: str, request: Request, token: Optional[str]) -> dict:
    token = token or request.headers.get("x-api-key")
    qr = await db.qr_codes.find_one({"code": code}, {"_id": 0})
    if not qr or not token or not secrets.compare_digest(token, qr["api_token"]):
        raise HTTPException(status_code=401, detail="Invalid QR code or token")
    return qr


async def _group(qr_id: str, field: str, since: Optional[str]) -> list:
    match = {"qr_id": qr_id, **({"scanned_at": {"$gte": since}} if since else {})}
    rows = await db.qr_scans.aggregate([
        {"$match": match},
        {"$group": {"_id": f"${field}", "scans": {"$sum": 1}, "unique": {"$sum": {"$cond": ["$unique", 1, 0]}}}},
        {"$sort": {"scans": -1}},
    ]).to_list(500)
    return [{"value": r["_id"] or "Unknown", "scans": r["scans"], "unique": r["unique"]} for r in rows]


@qr_router.get("/public/qr/{code}/stats")
async def public_qr_stats(code: str, request: Request, token: Optional[str] = None,
                          days: int = Query(90, ge=1, le=3650)):
    qr = await _qr_for_token(code, request, token)
    since = (_now() - timedelta(days=days)).isoformat()
    by_day_raw = await db.qr_scans.aggregate([
        {"$match": {"qr_id": qr["id"], "scanned_at": {"$gte": since}}},
        {"$group": {"_id": {"$dateToString": {"format": "%Y-%m-%d", "timezone": "Europe/Brussels",
                                              "date": {"$dateFromString": {"dateString": "$scanned_at"}}}},
                    "scans": {"$sum": 1},
                    "unique": {"$sum": {"$cond": ["$unique", 1, 0]}}}},
        {"$sort": {"_id": 1}},
    ]).to_list(4000)
    first = await db.qr_scans.find_one({"qr_id": qr["id"]}, {"_id": 0, "scanned_at": 1}, sort=[("scanned_at", 1)])
    content = await db.content_items.find_one({"id": qr.get("content_id")}, {"_id": 0, "title": 1}) if qr.get("content_id") else None
    recent = await db.qr_scans.find({"qr_id": qr["id"]}, SCAN_FIELDS).sort("scanned_at", -1).to_list(50)
    payload = {
        "qr": {**{k: qr.get(k) for k in ("code", "label", "target_url", "tracking_enabled", "content_id", "created_at")},
               "content_title": (content or {}).get("title"),
               "tracking_url": f"{_public_base_url(request)}/api/q/{qr['code']}"},
        "period_days": days,
        "timezone": "Europe/Brussels",
        "_notes": "totals are all-time; by_* breakdowns cover the last period_days; by_day uses Europe/Brussels dates.",
        "totals": {"scans": qr.get("scan_count", 0), "unique_scans": qr.get("unique_scan_count", 0),
                   "first_scan_at": (first or {}).get("scanned_at"), "last_scan_at": qr.get("last_scan_at")},
        "by_day": [{"date": r["_id"], "scans": r["scans"], "unique": r["unique"]} for r in by_day_raw],
        "by_device": await _group(qr["id"], "device_type", since),
        "by_os": await _group(qr["id"], "os", since),
        "by_browser": await _group(qr["id"], "browser", since),
        "by_country": await _group(qr["id"], "country", since),
        "by_city": await _group(qr["id"], "city", since),
        "recent_scans": recent,
        "generated_at": _now().isoformat(),
    }
    return JSONResponse(payload, headers=PUBLIC_HEADERS)


@qr_router.get("/public/qr/{code}/scans")
async def public_qr_scans(code: str, request: Request, token: Optional[str] = None,
                          since: Optional[str] = None, limit: int = Query(500, ge=1, le=5000)):
    """Raw scans in chronological order. Pass the last `next_since` to fetch only new scans."""
    qr = await _qr_for_token(code, request, token)
    query = {"qr_id": qr["id"], **({"scanned_at": {"$gt": since}} if since else {})}
    scans = await db.qr_scans.find(query, SCAN_FIELDS).sort("scanned_at", 1).to_list(limit)
    return JSONResponse({
        "code": qr["code"], "count": len(scans), "scans": scans,
        "next_since": scans[-1]["scanned_at"] if scans else since, "has_more": len(scans) == limit,
    }, headers=PUBLIC_HEADERS)
