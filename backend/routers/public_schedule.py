"""Public schedule API — public, header-less, slug-scoped per main site.

Modern, recommended URLs (no auth, no headers required):

    GET /api/public/schedule/{site_slug}/{station}/day/{day}   # one day
    GET /api/public/schedule/{site_slug}/{station}/today        # today
    GET /api/public/schedule/{site_slug}/{station}/week         # full week

Each show in the response carries:

    {
      "id":                  "...",
      "title":               "Show name",
      "description":         "...",
      "start_time":          "20:00",
      "end_time":            "22:00",
      "date":                "2026-06-04",
      "presenter":           "Hadewig Weyen & Shalini Groffy",
      "presenter_names":     ["Hadewig Weyen", "Shalini Groffy"],
      "presenter_ids":       ["...", "..."],
      "presenter_image_url": "https://...jpg",
      "image":               "https://.../show-logo.png",
      "rds_station":         "mfy"
    }

`station` is one of: `mfy`, `grk`, `both`.
`day` is the Dutch weekday in lowercase: maandag, dinsdag, woensdag,
donderdag, vrijdag, zaterdag, zondag.

Legacy header-scoped endpoints below (still in use by the WordPress plugin)
remain working for backwards compatibility.
"""
from fastapi import APIRouter, HTTPException, Request
from datetime import datetime, timedelta
import logging
import os

from database import db
from services.timezone_utils import now_brussels, WEEKDAY_NAMES_NL

logger = logging.getLogger(__name__)

public_schedule_router = APIRouter(prefix="/public", tags=["Public Schedule"])


def _absolute_url(url: str) -> str:
    """Turn `/api/uploads/...` style relative paths into absolute URLs so
    that external consumers (WordPress plugin, FM player, schedule widget)
    can fetch the file. Anything that already starts with `http(s)://`
    passes through unchanged.

    Uses `SHARE_BASE_URL` from env — the same base used for shared media,
    so production / staging hosts get the right hostname automatically.
    """
    if not url:
        return ""
    if url.startswith(("http://", "https://", "//")):
        return url
    base = (os.environ.get("SHARE_BASE_URL") or "").rstrip("/")
    if not base:
        return url
    if url.startswith("/"):
        return f"{base}{url}"
    return f"{base}/{url}"


WEEKDAYS_NL = ("maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag")


async def _resolve_site_id_from_slug(site_slug: str) -> str:
    site = await db.main_sites.find_one({"slug": site_slug}, {"_id": 0, "id": 1})
    if not site:
        raise HTTPException(status_code=404, detail=f"Main site '{site_slug}' not found")
    return site["id"]


async def _validate_station_for_site(main_site_id: str, station: str) -> None:
    """Reject station codes that aren't configured for this main site.

    Accepts the aliases `all` / `both` (every configured station). All other
    values must match a `code` in `rds_stations` for the given main site.
    """
    if station in ("all", "both"):
        return
    exists = await db.rds_stations.find_one(
        {"main_site_id": main_site_id, "code": station},
        {"_id": 0, "code": 1},
    )
    if not exists:
        configured = await db.rds_stations.find(
            {"main_site_id": main_site_id}, {"_id": 0, "code": 1}
        ).to_list(50)
        codes = [c["code"] for c in configured] + ["all"]
        raise HTTPException(
            status_code=400,
            detail=f"Station '{station}' is not configured for this site. Valid: {', '.join(codes)}",
        )


async def _resolve_presenter_image_url(presenter_ids: list, title_image_url: str = "") -> str:
    """Pick the best image URL for the on-air presenter slot.

    Priority (matches the user's expectation that "Show Management uploads
    are the source of truth"):

    1. **Show-title image** uploaded via Show Management — this is always S3
       and is the official artwork for the broadcast.
    2. The first presenter's personal avatar (S3 preferred, then local
       upload). Used when no show-title image exists.

    Result is always an absolute URL ready for `<img src>` consumption.
    """
    # 1. Show-title image wins
    if title_image_url:
        return _absolute_url(title_image_url)

    # 2. Presenter avatar fallback (preserve presenter_ids order)
    if presenter_ids:
        presenters = await db.users.find(
            {"id": {"$in": presenter_ids}},
            {"_id": 0, "id": 1, "avatar": 1, "avatar_url": 1, "image": 1, "image_url": 1, "photo_url": 1},
        ).to_list(10)
        by_id = {p.get("id"): p for p in presenters if p.get("id")}
        ordered = [by_id[pid] for pid in presenter_ids if pid in by_id]
        for p in ordered:
            avatar = p.get("avatar")
            if isinstance(avatar, dict):
                if avatar.get("s3_url"):
                    return avatar["s3_url"]
                if avatar.get("file_key"):
                    return _absolute_url(f"/api/uploads/avatars/{avatar['file_key']}")
            for k in ("avatar_url", "image_url", "photo_url"):
                if p.get(k):
                    return _absolute_url(p[k])
            if isinstance(p.get("image"), dict):
                url = p["image"].get("s3_url") or p["image"].get("url")
                if url:
                    return _absolute_url(url)

    return ""


# Legacy alias kept for any internal caller that still expects the old name.
async def _first_presenter_image(presenter_ids: list, title_image_fallback: str = "") -> str:
    return await _resolve_presenter_image_url(presenter_ids, title_image_url=title_image_fallback)


async def get_shows_for_week(main_site_id: str, station: str) -> dict:
    """All shows for this calendar week (Mon..Sun) grouped by Dutch weekday."""
    today = now_brussels().date()
    monday = today - timedelta(days=today.weekday())
    sunday = monday + timedelta(days=6)
    query = {
        "main_site_id": main_site_id,
        "date": {"$gte": monday.strftime("%Y-%m-%d"), "$lte": sunday.strftime("%Y-%m-%d")},
    }
    shows = await db.shows.find(query, {"_id": 0}).to_list(500)

    show_titles = {}
    async for title in db.show_titles.find({"main_site_id": main_site_id}, {"_id": 0}):
        show_titles[title.get("name")] = title

    result = {day: [] for day in WEEKDAYS_NL}

    for show in shows:
        title_name = show.get("title", "")
        title_info = show_titles.get(title_name, {})
        rds_station = title_info.get("rds_station", "none")

        # Dynamic filter — backwards-compat aliases:
        #   "both" / "all" → broadcast on every station of the site
        #   any other code → must match the show's `rds_station` exactly
        #   "none"         → never broadcast
        if station in ("both", "all"):
            if rds_station == "none":
                continue
        else:
            if rds_station == "none":
                continue
            if rds_station not in (station, "both", "all"):
                continue

        try:
            show_date = datetime.strptime(show.get("date", ""), "%Y-%m-%d")
            weekday = WEEKDAY_NAMES_NL[show_date.weekday()]
        except Exception:
            continue

        presenter_names = []
        presenter_ids = show.get("presenter_ids") or []
        if presenter_ids:
            presenters = await db.users.find(
                {"id": {"$in": presenter_ids}},
                {"_id": 0, "name": 1},
            ).to_list(10)
            presenter_names = [p.get("name", "") for p in presenters if p.get("name")]

        image_url = ""
        if isinstance(title_info.get("image"), dict):
            image_url = title_info["image"].get("s3_url") or title_info["image"].get("url") or ""
            if not image_url and title_info["image"].get("file_key"):
                image_url = f"/api/uploads/show_title_images/{title_info['image']['file_key']}"
        image_url = _absolute_url(image_url)

        presenter_image_url = await _resolve_presenter_image_url(presenter_ids, title_image_url=image_url)

        result[weekday].append({
            "id": show.get("id"),
            "title": title_name,
            "description": title_info.get("description", ""),
            "start_time": show.get("start_time", ""),
            "end_time": show.get("end_time", ""),
            "date": show.get("date", ""),
            "presenter": " & ".join(presenter_names) if presenter_names else "",
            "presenter_names": presenter_names,
            "presenter_ids": presenter_ids,
            "presenter_image_url": presenter_image_url,
            "image": image_url,
            "rds_station": rds_station,
        })

    for day in result:
        result[day].sort(key=lambda x: x.get("start_time", "00:00"))
    return result


async def get_shows_for_today(main_site_id: str, station: str) -> list:
    week = await get_shows_for_week(main_site_id, station)
    return week.get(WEEKDAY_NAMES_NL[now_brussels().weekday()], [])


# ─── Slug-scoped public endpoints (recommended) ─────────────────────────────

@public_schedule_router.get("/schedule/{site_slug}/{station}/day/{day}")
async def schedule_by_slug_and_day(site_slug: str, station: str, day: str):
    """Public per-day schedule for one site + station.

    Path params:
      - site_slug: slug of the main site, e.g. `radiogroep`, `koodh`
      - station:   `mfy`, `grk` or `both`
      - day:       Dutch weekday in lowercase (maandag..zondag)

    Returns a JSON list of shows with time, title, presenter name(s),
    presenter photo URL and show image. No auth, no headers.
    """
    day_lower = day.lower()
    if day_lower not in WEEKDAYS_NL:
        raise HTTPException(status_code=400, detail=f"Invalid day. Use one of {', '.join(WEEKDAYS_NL)}")
    main_site_id = await _resolve_site_id_from_slug(site_slug)
    await _validate_station_for_site(main_site_id, station)
    week = await get_shows_for_week(main_site_id, station)
    return {"site_slug": site_slug, "station": station, "day": day_lower, "shows": week.get(day_lower, [])}


@public_schedule_router.get("/schedule/{site_slug}/{station}/today")
async def schedule_by_slug_today(site_slug: str, station: str):
    """Public schedule for today, scoped by site slug + station."""
    main_site_id = await _resolve_site_id_from_slug(site_slug)
    await _validate_station_for_site(main_site_id, station)
    shows = await get_shows_for_today(main_site_id, station)
    return {"site_slug": site_slug, "station": station, "day": WEEKDAY_NAMES_NL[now_brussels().weekday()], "shows": shows}


@public_schedule_router.get("/schedule/{site_slug}/{station}/week")
async def schedule_by_slug_week(site_slug: str, station: str):
    """Public weekly schedule for one site + station, grouped per Dutch weekday."""
    main_site_id = await _resolve_site_id_from_slug(site_slug)
    await _validate_station_for_site(main_site_id, station)
    return {"site_slug": site_slug, "station": station, "week": await get_shows_for_week(main_site_id, station)}


# ─── Legacy header-based endpoints (kept for backwards compat) ──────────────

@public_schedule_router.get("/schedule/{station}")
async def get_public_schedule(station: str, request: Request):
    """Legacy: weekly schedule with X-Main-Site-ID header."""
    main_site_id = request.headers.get("X-Main-Site-ID") or request.query_params.get("main_site_id", "")
    if not main_site_id:
        return {"error": "main_site_id required"}
    try:
        await _validate_station_for_site(main_site_id, station)
    except HTTPException as e:
        return {"error": e.detail}
    return await get_shows_for_week(main_site_id, station)


@public_schedule_router.get("/schedule/{station}/today")
async def get_public_schedule_today(station: str, request: Request):
    """Legacy: today's schedule with X-Main-Site-ID header."""
    main_site_id = request.headers.get("X-Main-Site-ID") or request.query_params.get("main_site_id", "")
    if not main_site_id:
        return {"error": "main_site_id required"}
    try:
        await _validate_station_for_site(main_site_id, station)
    except HTTPException as e:
        return {"error": e.detail}
    shows = await get_shows_for_today(main_site_id, station)
    return [
        {
            "name": s.get("title"),
            "description": s.get("description", ""),
            "time": s.get("start_time"),
            "time_end": s.get("end_time"),
            "timezone_string": "Europe/Brussels",
            "thumbnail": s.get("image") or False,
            "presenter": s.get("presenter", ""),
            "presenter_image": s.get("presenter_image_url"),
        }
        for s in shows
    ]


@public_schedule_router.get("/schedule/{station}/day/{day}")
async def get_public_schedule_day(station: str, day: str, request: Request):
    """Legacy: per-day schedule with X-Main-Site-ID header."""
    main_site_id = request.headers.get("X-Main-Site-ID") or request.query_params.get("main_site_id", "")
    if not main_site_id:
        return {"error": "main_site_id required"}
    try:
        await _validate_station_for_site(main_site_id, station)
    except HTTPException as e:
        return {"error": e.detail}
    day_lower = day.lower()
    if day_lower not in WEEKDAYS_NL:
        return {"error": f"Invalid day. Use one of {', '.join(WEEKDAYS_NL)}"}
    week = await get_shows_for_week(main_site_id, station)
    return week.get(day_lower, [])
