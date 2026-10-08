"""Public schedule API — public, header-less, slug-scoped per main site.

Modern, recommended URLs (no auth, no headers required):

    GET /api/public/schedule/{site_slug}/{station}/day/{day}            # by weekday name (current week)
    GET /api/public/schedule/{site_slug}/{station}/today                # today's shows
    GET /api/public/schedule/{site_slug}/{station}/week                 # current week grouped per weekday
    GET /api/public/schedule/{site_slug}/{station}/week?date=YYYY-MM-DD # the week containing that date (±4 weeks)
    GET /api/public/schedule/{site_slug}/{station}/date/{YYYY-MM-DD}    # one specific calendar date (±4 weeks)
    GET /api/public/schedule/{site_slug}/{station}/range?from=YYYY-MM-DD&to=YYYY-MM-DD   # date range grouped per day

The date-based endpoints are capped at ±28 days (4 weeks) from today, so
the UI can scroll a continuous day-by-day timeline without ever running
unbounded Mongo scans.

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
from fastapi import APIRouter, HTTPException, Request, Query
from datetime import datetime, timedelta
import logging
import os

from database import db
from services.timezone_utils import now_brussels, WEEKDAY_NAMES_NL

logger = logging.getLogger(__name__)

public_schedule_router = APIRouter(prefix="/public", tags=["Public Schedule"])


def _public_base_url(request) -> str:
    """Build an absolute origin URL that external consumers can actually
    reach. Behind a reverse proxy, `request.base_url` carries the upstream
    internal hostname (e.g. `cluster-5.preview.emergentcf.cloud`) which is
    useless for CDN'd `<img src>` references. Prefer `X-Forwarded-Host`
    and `X-Forwarded-Proto` so we emit `https://clr.koodh.com/...` when
    grk.fm hits `clr.koodh.com`, and fall back to the request's own host
    header for local/dev requests.

    IMPORTANT: on public domains we always force `https://` to avoid
    mixed-content blocking when the embedding page is HTTPS and the proxy
    forwards HTTP internally. Only genuine localhost/`.local` hosts stay
    on `http://`.
    """
    headers = request.headers
    host = headers.get("x-forwarded-host") or headers.get("host") or ""
    proto = (headers.get("x-forwarded-proto") or request.url.scheme or "https").split(",")[0].strip()
    if not host:
        return str(request.base_url).rstrip("/")
    host = host.split(",")[0].strip()
    # Force https for any public host so grk.fm (HTTPS) can load the composite
    # — mixed-content blocking otherwise swallows the <img> request silently.
    is_local = host.startswith("localhost") or host.startswith("127.") or host.endswith(".local")
    if not is_local:
        proto = "https"
    return f"{proto}://{host}"


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

    POLICY: **Only presenter Team-Settings avatars count.** If no presenter
    has an uploaded avatar, return "" so the consumer renders a transparent
    placeholder. The legacy manually-uploaded show-title image is
    **never** used as a fallback here (per product owner — Yannick, feb 2026).

    Priority:
    1. First presenter avatar's S3 URL (uploaded via Team Settings).
    2. "" so the consumer renders a transparent placeholder.

    `title_image_url` is kept in the signature for backwards compatibility
    with internal callers but is deliberately ignored.

    S3-only — local `/api/uploads/...` URLs are deliberately skipped so grk.fm
    and the player get cache-friendly CDN URLs.
    """
    def _clean(u: str) -> str:
        """Reject corrupt URLs containing the literal "None" scope segment."""
        if not u:
            return ""
        if "/None/" in u or "/None_" in u:
            return ""
        return u

    def _not_stale(user: dict, url: str) -> bool:
        """A `/avatars/shared/...` URL on a user who **does** have a
        team_id/main_site_id is a leftover from before team-scoping and
        must be ignored — Team Settings now writes avatars to
        `/avatars/{team_id}/...`."""
        if "/avatars/shared/" not in url:
            return True
        return not (user.get("team_id") or user.get("main_site_id"))

    # 1. Presenter avatar — S3 only
    if presenter_ids:
        presenters = await db.users.find(
            {"id": {"$in": presenter_ids}},
            {"_id": 0, "id": 1, "avatar": 1, "avatar_url": 1, "image": 1, "image_url": 1, "photo_url": 1, "team_id": 1, "main_site_id": 1},
        ).to_list(10)
        by_id = {p.get("id"): p for p in presenters if p.get("id")}
        for pid in presenter_ids:
            p = by_id.get(pid)
            if not p:
                continue
            avatar = p.get("avatar")
            if isinstance(avatar, dict):
                cleaned = _clean(avatar.get("s3_url") or "")
                if cleaned and _not_stale(p, cleaned):
                    return cleaned
            # Flat legacy fields — accept only if they're absolute S3 URLs
            for k in ("avatar_url", "image_url", "photo_url"):
                v = _clean(p.get(k) or "")
                if v.startswith("https://") and "your-objectstorage.com" in v and _not_stale(p, v):
                    return v
            img = p.get("image")
            if isinstance(img, dict):
                cleaned = _clean(img.get("s3_url") or "")
                if cleaned and _not_stale(p, cleaned):
                    return cleaned

    # 2. No valid presenter avatar → return "" so the API serves transparent.
    #    Show-title image fallback deliberately removed per product owner.
    return ""


async def _resolve_presenter_avatars(presenter_ids: list) -> list:
    """Return a list of per-presenter avatar entries so the consumer can
    render an overlapping-circles composite (grk.fm uses this for the
    programmering page). Each entry is:
        {"id": str, "name": str, "avatar_url": str | ""}

    `avatar_url` is empty when the presenter has no S3 photo yet — the
    consumer should render a transparent placeholder slot (mirrors the
    `PresenterComposite.jsx` behaviour)."""
    if not presenter_ids:
        return []

    def _clean(u: str) -> str:
        if not u:
            return ""
        if "/None/" in u or "/None_" in u:
            return ""
        return u

    def _not_stale(user: dict, url: str) -> bool:
        if "/avatars/shared/" not in url:
            return True
        return not (user.get("team_id") or user.get("main_site_id"))

    rows = await db.users.find(
        {"id": {"$in": presenter_ids}},
        {"_id": 0, "id": 1, "name": 1, "avatar": 1, "avatar_url": 1, "image": 1, "image_url": 1, "photo_url": 1, "team_id": 1, "main_site_id": 1},
    ).to_list(100)
    by_id = {r.get("id"): r for r in rows if r.get("id")}

    out = []
    for pid in presenter_ids:
        p = by_id.get(pid) or {}
        url = ""
        avatar = p.get("avatar")
        if isinstance(avatar, dict):
            candidate = _clean(avatar.get("s3_url") or "")
            if candidate and _not_stale(p, candidate):
                url = candidate
        if not url:
            for k in ("avatar_url", "image_url", "photo_url"):
                v = _clean(p.get(k) or "")
                if v.startswith("https://") and "your-objectstorage.com" in v and _not_stale(p, v):
                    url = v
                    break
        if not url:
            img = p.get("image")
            if isinstance(img, dict):
                candidate = _clean(img.get("s3_url") or "")
                if candidate and _not_stale(p, candidate):
                    url = candidate
        out.append({
            "id": pid,
            "name": p.get("name", ""),
            "avatar_url": url,
        })
    return out


# Legacy alias kept for any internal caller that still expects the old name.
async def _first_presenter_image(presenter_ids: list, title_image_fallback: str = "") -> str:
    return await _resolve_presenter_image_url(presenter_ids, title_image_url=title_image_fallback)


async def _build_show_payload(show: dict, title_info: dict, request_base: str = "") -> dict:
    """Produce the public-facing show dict used by all schedule endpoints.

    Encapsulates the presenter / image / video enrichment that was
    previously inlined in `get_shows_for_week`, so date-range and
    date-based endpoints can reuse exactly the same shape.
    """
    title_name = show.get("title", "")
    raw_presenter_ids = show.get("presenter_ids") or []
    # Filter out "ghost" presenter_ids — ids that no longer have a user doc
    # in the DB. Leaving them in bloats the composite PNG with empty slots
    # (visual regression: Mike's half of a 2-up composite becomes offset to
    # the right because slot 1 is a deleted user) and leaks removed users
    # into `presenter_names`. See the bug report: "programmaschema shows
    # nothing when a second photo is added".
    presenter_ids = []
    presenter_name_by_id: dict[str, str] = {}
    if raw_presenter_ids:
        async for p in db.users.find(
            {"id": {"$in": raw_presenter_ids}},
            {"_id": 0, "id": 1, "name": 1},
        ):
            if p.get("id"):
                presenter_name_by_id[p["id"]] = p.get("name", "")
        # Preserve the original ordering from the show doc.
        presenter_ids = [pid for pid in raw_presenter_ids if pid in presenter_name_by_id]
    presenter_names = [presenter_name_by_id[pid] for pid in presenter_ids if presenter_name_by_id.get(pid)]

    image_url = ""
    if isinstance(title_info.get("image"), dict):
        raw_url = title_info["image"].get("s3_url") or ""
        if raw_url and "/None/" not in raw_url and "/None_" not in raw_url:
            image_url = raw_url

    presenter_image_url = await _resolve_presenter_image_url(presenter_ids, title_image_url=image_url)
    presenter_avatars = await _resolve_presenter_avatars(presenter_ids)

    # Any show with presenters → use the composite endpoint so grk.fm /
    # player always get a consistent PNG (real avatars for users with a
    # photo, transparent slots for users without one). The composite
    # endpoint returns a fully transparent placeholder when **no** presenter
    # has an avatar — guarantees we never leak the legacy show-title image
    # as a presenter fallback (bug reported feb 2026).
    if presenter_ids:
        composite_path = f"/api/rds/show/{show.get('id')}/presenter-composite.png"
        if request_base:
            presenter_image_url = f"{request_base.rstrip('/')}{composite_path}"
        else:
            presenter_image_url = _absolute_url(composite_path)

    video_payload = None
    if show.get("has_video"):
        override = (show.get("video_embed_override") or "").strip()
        endpoint_id = show.get("video_endpoint_id")
        if override:
            from services.video_embed import detect_platform, build_embed_html
            det = detect_platform(override)
            video_payload = {
                "endpoint_id": None,
                "platform": det.get("platform"),
                "embed_url": det.get("embed_url"),
                "embed_html": build_embed_html(det),
                "thumbnail_url": det.get("thumbnail_url"),
                "source": "inline",
            }
        elif endpoint_id:
            ve = await db.video_endpoints.find_one({"id": endpoint_id}, {"_id": 0})
            if ve:
                from services.video_embed import serialize_video
                s = serialize_video(ve)
                video_payload = {
                    "endpoint_id": s.get("id"),
                    "name": s.get("name"),
                    "type": s.get("type"),
                    "platform": s.get("platform"),
                    "embed_html": s.get("embed_html"),
                    "thumbnail_url": s.get("thumbnail_url"),
                    "uploaded_url": s.get("uploaded_url"),
                    "source": "library",
                }

    return {
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
        "presenter_avatars": presenter_avatars,
        # `image` mirrors `presenter_image_url` whenever the show has
        # presenters so grk.fm's hero (which reads `.image`) and schedule
        # row (which reads `.presenter_image_url`) stay in sync and both
        # pick up the composite PNG with transparent fallback. Shows
        # without presenters keep the legacy show-title image as before.
        "image": presenter_image_url if presenter_ids else image_url,
        "rds_station": title_info.get("rds_station", "none"),
        "has_video": bool(show.get("has_video")),
        "video": video_payload,
    }


def _station_match(show_rds_station: str, station: str) -> bool:
    """Shared filter: `both`/`all` → every non-'none' station,
    specific code → exact match (or `both`/`all` on the show itself)."""
    if show_rds_station == "none":
        return False
    if station in ("both", "all"):
        return True
    return show_rds_station in (station, "both", "all")


async def get_shows_in_range(
    main_site_id: str,
    station: str,
    start_date,
    end_date,
    request_base: str = "",
) -> list:
    """Flat, chronologically sorted list of shows between two dates (inclusive).

    Both `start_date` and `end_date` must be `date` or `datetime` instances.
    Used by the per-date and date-range public endpoints to look up to
    4 weeks forward/backward from today.
    """
    query = {
        "main_site_id": main_site_id,
        "date": {
            "$gte": start_date.strftime("%Y-%m-%d"),
            "$lte": end_date.strftime("%Y-%m-%d"),
        },
    }
    shows = await db.shows.find(query, {"_id": 0}).to_list(5000)

    show_titles = {}
    async for title in db.show_titles.find({"main_site_id": main_site_id}, {"_id": 0}):
        show_titles[title.get("name")] = title

    out = []
    for show in shows:
        title_info = show_titles.get(show.get("title", ""), {})
        rds_station = title_info.get("rds_station", "none")
        if not _station_match(rds_station, station):
            continue
        out.append(await _build_show_payload(show, title_info, request_base=request_base))

    out.sort(key=lambda s: (s.get("date", ""), s.get("start_time", "00:00")))
    return out


async def get_shows_for_week(main_site_id: str, station: str, anchor_date=None, request_base: str = "") -> dict:
    """All shows for the calendar week (Mon..Sun) grouped by Dutch weekday.

    When `anchor_date` is supplied, returns the week **containing** that
    date — enabling the UI to page ±4 weeks around today without any
    change to the endpoint contract. Falls back to the current Brussels
    week when omitted.
    """
    today = (anchor_date or now_brussels().date())
    monday = today - timedelta(days=today.weekday())
    sunday = monday + timedelta(days=6)
    shows = await get_shows_in_range(main_site_id, station, monday, sunday, request_base=request_base)

    result = {day: [] for day in WEEKDAYS_NL}
    for s in shows:
        try:
            show_date = datetime.strptime(s.get("date", ""), "%Y-%m-%d")
            result[WEEKDAY_NAMES_NL[show_date.weekday()]].append(s)
        except Exception:
            continue
    for day in result:
        result[day].sort(key=lambda x: x.get("start_time", "00:00"))
    return result


async def get_shows_for_today(main_site_id: str, station: str, request_base: str = "") -> list:
    week = await get_shows_for_week(main_site_id, station, request_base=request_base)
    return week.get(WEEKDAY_NAMES_NL[now_brussels().weekday()], [])


# ─── Slug-scoped public endpoints (recommended) ─────────────────────────────

@public_schedule_router.get("/schedule/{site_slug}/{station}/day/{day}")
async def schedule_by_slug_and_day(site_slug: str, station: str, day: str, request: Request):
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
    week = await get_shows_for_week(main_site_id, station, request_base=_public_base_url(request))
    return {"site_slug": site_slug, "station": station, "day": day_lower, "shows": week.get(day_lower, [])}


@public_schedule_router.get("/schedule/{site_slug}/{station}/today")
async def schedule_by_slug_today(site_slug: str, station: str, request: Request):
    """Public schedule for today, scoped by site slug + station."""
    main_site_id = await _resolve_site_id_from_slug(site_slug)
    await _validate_station_for_site(main_site_id, station)
    shows = await get_shows_for_today(main_site_id, station, request_base=_public_base_url(request))
    return {"site_slug": site_slug, "station": station, "day": WEEKDAY_NAMES_NL[now_brussels().weekday()], "shows": shows}


@public_schedule_router.get("/schedule/{site_slug}/{station}/week")
async def schedule_by_slug_week(site_slug: str, station: str, request: Request, date: str | None = None):
    """Public weekly schedule for one site + station, grouped per Dutch weekday.

    Optional `?date=YYYY-MM-DD` returns the week **containing** that date,
    so the UI can page ±4 weeks around today without extra endpoints.
    """
    main_site_id = await _resolve_site_id_from_slug(site_slug)
    await _validate_station_for_site(main_site_id, station)
    anchor = None
    if date:
        try:
            anchor = datetime.strptime(date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="date must be YYYY-MM-DD")
        _assert_within_window(anchor)
    return {"site_slug": site_slug, "station": station, "week": await get_shows_for_week(main_site_id, station, anchor_date=anchor, request_base=_public_base_url(request))}


# ─── Date-based lookup (±4 weeks, per date) ─────────────────────────────────

# How far forward/backward the public API will search. Keeps queries bounded
# so no caller can accidentally scan the whole collection.
MAX_WINDOW_DAYS = 28


def _assert_within_window(d) -> None:
    """Reject lookups more than 28 days (4 weeks) from today."""
    today = now_brussels().date()
    delta = abs((d - today).days)
    if delta > MAX_WINDOW_DAYS:
        raise HTTPException(
            status_code=400,
            detail=f"date must be within ±{MAX_WINDOW_DAYS} days of today",
        )


@public_schedule_router.get("/schedule/{site_slug}/{station}/date/{iso_date}")
async def schedule_by_slug_and_date(site_slug: str, station: str, iso_date: str, request: Request):
    """Per-date schedule — pick any calendar date within ±4 weeks of today.

    `iso_date` is `YYYY-MM-DD`. Returns the shows for that exact date.
    """
    try:
        target = datetime.strptime(iso_date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="iso_date must be YYYY-MM-DD")
    _assert_within_window(target)
    main_site_id = await _resolve_site_id_from_slug(site_slug)
    await _validate_station_for_site(main_site_id, station)
    shows = await get_shows_in_range(main_site_id, station, target, target, request_base=_public_base_url(request))
    return {
        "site_slug": site_slug,
        "station": station,
        "date": iso_date,
        "weekday": WEEKDAY_NAMES_NL[target.weekday()],
        "shows": shows,
    }


@public_schedule_router.get("/schedule/{site_slug}/{station}/range")
async def schedule_by_slug_range(
    site_slug: str,
    station: str,
    request: Request,
    from_: str | None = Query(default=None, alias="from"),
    to: str | None = None,
):
    """Date-range schedule, grouped per date, for ±4-week scrolling.

    Query params:
      - `from=YYYY-MM-DD` (required): inclusive start date
      - `to=YYYY-MM-DD`   (required): inclusive end date

    Window is capped at ±4 weeks around today for both bounds, and the
    span (`to - from`) must not exceed `MAX_WINDOW_DAYS` days.
    """
    if not from_ or not to:
        raise HTTPException(status_code=400, detail="from and to are required (YYYY-MM-DD)")
    try:
        start = datetime.strptime(from_, "%Y-%m-%d").date()
        end = datetime.strptime(to, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="from/to must be YYYY-MM-DD")
    if end < start:
        raise HTTPException(status_code=400, detail="to must be >= from")
    _assert_within_window(start)
    _assert_within_window(end)
    if (end - start).days > MAX_WINDOW_DAYS:
        raise HTTPException(status_code=400, detail=f"range may not exceed {MAX_WINDOW_DAYS} days")

    main_site_id = await _resolve_site_id_from_slug(site_slug)
    await _validate_station_for_site(main_site_id, station)
    shows = await get_shows_in_range(main_site_id, station, start, end, request_base=_public_base_url(request))

    # Group per date — produce every day in the range, even empty ones,
    # so the client can render a continuous timeline/scroller.
    by_date: dict[str, list] = {}
    cursor = start
    while cursor <= end:
        by_date[cursor.strftime("%Y-%m-%d")] = []
        cursor += timedelta(days=1)
    for s in shows:
        by_date.setdefault(s.get("date", ""), []).append(s)

    return {
        "site_slug": site_slug,
        "station": station,
        "from": from_,
        "to": to,
        "days": [
            {
                "date": d,
                "weekday": WEEKDAY_NAMES_NL[datetime.strptime(d, "%Y-%m-%d").weekday()],
                "shows": shows_for_day,
            }
            for d, shows_for_day in by_date.items()
        ],
    }


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
    return await get_shows_for_week(main_site_id, station, request_base=_public_base_url(request))


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
    shows = await get_shows_for_today(main_site_id, station, request_base=_public_base_url(request))
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
    week = await get_shows_for_week(main_site_id, station, request_base=_public_base_url(request))
    return week.get(day_lower, [])



# ───────────────────────────────────────────────────────────────────────────
# Public rundown share link — guests can view a rundown via a secret token
# without any Clara login. The token is created from the authenticated Show
# Detail page (`POST /api/shows/{id}/rundown-share`) and revoked with
# `DELETE /api/shows/{id}/rundown-share`.
# ───────────────────────────────────────────────────────────────────────────

from fastapi.responses import HTMLResponse  # noqa: E402  (routed late to avoid circular import)


@public_schedule_router.get("/rundown/{share_token}", response_class=HTMLResponse)
async def get_public_rundown(share_token: str, pdf: int = 0):
    """Render the Clara-styled rundown HTML for guests holding a share token.
    No authentication required; the token itself is the capability."""
    if not share_token or len(share_token) < 16:
        raise HTTPException(status_code=404, detail="Invalid share link")

    show = await db.shows.find_one(
        {"rundown_share_token": share_token},
        {"_id": 0}
    )
    if not show:
        raise HTTPException(status_code=404, detail="Rundown not found or link revoked")

    # Lazy-import so this router stays independent of the show router module.
    from routers.shows import _build_rundown_html

    html = await _build_rundown_html(show, pdf=bool(pdf), is_public=True)
    return HTMLResponse(content=html)
