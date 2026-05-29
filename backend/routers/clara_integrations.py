"""Clara Custom — Feature Integrations.

Per-feature integration manager: external Emergent projects implement a
specific contract (e.g. News/Blog) and register themselves with Clara.
Clara then becomes the editor for that feature via the content library.

Flow:
  1. Admin generates prompt for template → row created with pending_registration
  2. Admin pastes prompt into external project → external project builds endpoints
  3. External project POSTs to /integrations/register → status → pending_approval
  4. Admin clicks Approve → status → connected + full sync of existing items
  5. Admin can: publish individual items, disconnect, manual health check
  6. Background poller checks connected integrations every 30s
"""
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from datetime import datetime, timezone
from typing import Optional, List
import uuid
import secrets
import asyncio
import httpx

from services.auth import get_current_user, require_network_admin
from database import db

clara_integrations_router = APIRouter(prefix="/clara-custom/integrations", tags=["clara-integrations"])

require_system_admin = require_network_admin

# ───────────────────── Templates ─────────────────────

TEMPLATES = {
    "news_blog": {
        "id": "news_blog",
        "name": "News / Blog",
        "description": "Auto-sync the Clara Content Library to a news section on the external site.",
        "icon": "newspaper",
        "endpoints": {
            "health": {"method": "GET", "path": "/api/clara-feature/health", "auth": False},
            "list": {"method": "GET", "path": "/api/clara-feature/news", "auth": True},
            "upsert_by_clara_id": {"method": "POST", "path": "/api/clara-feature/news/by-clara-id/{clara_content_id}", "auth": True},
            "delete_by_clara_id": {"method": "DELETE", "path": "/api/clara-feature/news/by-clara-id/{clara_content_id}", "auth": True},
        },
        "schema": {
            "title": "str (required)",
            "slug": "str (auto-generated if omitted)",
            "excerpt": "str",
            "body_html": "str (full HTML)",
            "featured_image_url": "str",
            "author_name": "str",
            "category": "str",
            "tags": "list[str]",
            "status": "enum: draft | published | archived",
            "published_at": "ISO 8601 datetime",
            "clara_content_id": "str (UUID from Clara — used for upsert)",
        },
    },
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _strip_id(doc: dict) -> dict:
    doc.pop("_id", None)
    return doc


def _generate_integration_token() -> str:
    return secrets.token_hex(24)


def _build_prompt(template_id: str, token: str, callback_url: str, site_name: str) -> str:
    """Render a markdown prompt to paste into the external Emergent project."""
    tpl = TEMPLATES[template_id]
    eps = tpl["endpoints"]
    schema_rows = "\n".join(f"  - `{k}`: {v}" for k, v in tpl["schema"].items())
    ep_rows = "\n".join(
        f"| `{spec['method']}` | `{spec['path']}` | {'Bearer token' if spec['auth'] else 'public'} |"
        for spec in eps.values()
    )
    return f"""# Clara Integration — {tpl['name']}

You are building a **{tpl['name']}** integration for the Koodh Clara platform.
Clara will be the master editor for this feature; this project just exposes a
small REST contract so Clara can push content into it.

## 🔐 Authentication

The integration uses a shared secret in `backend/.env`:

```
CLARA_FEATURE_SECRET=<choose-a-long-random-string-you-set-yourself>
CLARA_INTEGRATION_TOKEN={token}
CLARA_INTEGRATION_CALLBACK={callback_url}
SITE_PUBLIC_URL=<https://your-public-url>
```

All endpoints below (except `/health`) require:
```
Authorization: Bearer ${{CLARA_FEATURE_SECRET}}
```

## 📡 Endpoints to implement

| Method | Path | Auth |
|---|---|---|
{ep_rows}

**Payload schema** (the body Clara will send on upsert):
{schema_rows}

`clara_content_id` is the stable UUID — store it on every record. The endpoint
must **upsert** (create if missing, replace if exists) based on this id.

## 🌐 Public site rendering (recommended)

Also expose a `GET /api/public/news` and `GET /api/public/news/{{slug}}` for
the website frontend to read published articles. These do NOT need auth.

## 🚀 Auto-registration (mandatory)

At FastAPI startup, this project must POST to Clara with the
`CLARA_INTEGRATION_TOKEN` to register itself. Put this in `backend/server.py`:

```python
import os, httpx
from fastapi import FastAPI

app = FastAPI()

@app.on_event("startup")
async def register_clara_integration():
    token = os.getenv("CLARA_INTEGRATION_TOKEN")
    callback = os.getenv("CLARA_INTEGRATION_CALLBACK")
    base_url = os.getenv("SITE_PUBLIC_URL")
    secret = os.getenv("CLARA_FEATURE_SECRET")
    if not all([token, callback, base_url, secret]):
        return
    payload = {{
        "integration_token": token,
        "base_url": base_url,
        "shared_secret": secret,
        "endpoints_map": {{
            "health": "/api/clara-feature/health",
            "list": "/api/clara-feature/news",
            "upsert_by_clara_id": "/api/clara-feature/news/by-clara-id/{{clara_content_id}}",
            "delete_by_clara_id": "/api/clara-feature/news/by-clara-id/{{clara_content_id}}",
        }},
        "schema_version": 1,
    }}
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            r = await client.post(callback, json=payload)
            print(f"[clara-integration] {{r.status_code}}: {{r.text[:200]}}")
    except Exception as e:
        print(f"[clara-integration] skipped: {{type(e).__name__}}")
```

## ✅ Acceptance

- [ ] `GET /api/clara-feature/health` returns `200 OK` without auth.
- [ ] `POST /api/clara-feature/news/by-clara-id/abc123` with a full article body
      either creates or updates that article and returns the saved object.
- [ ] On startup, you see `[clara-integration] 200` in the logs.
- [ ] In Clara, the integration for **{site_name}** moves to "pending approval".

Build all of this end-to-end and confirm by checking that Clara shows the
integration as pending-approval. The Clara admin will then click Approve and
existing articles will be synced automatically.
"""


# ───────────────────── Admin endpoints ─────────────────────

@clara_integrations_router.get("/templates")
async def list_templates(current_user: dict = Depends(require_system_admin)):
    return list(TEMPLATES.values())


@clara_integrations_router.get("/by-site/{main_site_id}")
async def list_integrations(
    main_site_id: str,
    current_user: dict = Depends(require_system_admin),
):
    cursor = db.clara_integrations.find({"main_site_id": main_site_id}, {"_id": 0, "shared_secret": 0, "integration_token": 0}).sort("created_at", -1)
    items = []
    async for it in cursor:
        items.append(it)
    return items


@clara_integrations_router.post("/generate-prompt")
async def generate_prompt(data: dict, current_user: dict = Depends(require_system_admin)):
    """Create a pending integration row and return the markdown prompt + raw token."""
    main_site_id = data.get("main_site_id")
    template_id = data.get("template")
    if not main_site_id:
        raise HTTPException(status_code=400, detail="main_site_id required")
    if template_id not in TEMPLATES:
        raise HTTPException(status_code=400, detail=f"Unknown template: {template_id}")

    site = await db.main_sites.find_one({"id": main_site_id}, {"_id": 0, "id": 1, "name": 1})
    if not site:
        raise HTTPException(status_code=404, detail="Main site not found")

    import os
    backend_base = os.environ.get("REACT_APP_BACKEND_URL") or os.environ.get("VDC_BASE_URL") or ""
    # Prefer the externally reachable URL — discovered_url of the site is also OK
    if not backend_base:
        # Best-effort: read from frontend .env
        try:
            with open("/app/frontend/.env", "r") as f:
                for line in f:
                    if line.startswith("REACT_APP_BACKEND_URL="):
                        backend_base = line.split("=", 1)[1].strip()
                        break
        except Exception:
            pass

    token = _generate_integration_token()
    callback_url = f"{backend_base}/api/clara-custom/integrations/register"

    doc = {
        "id": str(uuid.uuid4()),
        "main_site_id": main_site_id,
        "template": template_id,
        "integration_token": token,
        "status": "pending_registration",
        "base_url": None,
        "shared_secret": None,
        "endpoints_map": None,
        "schema_version": None,
        "last_health_check": None,
        "last_synced_at": None,
        "created_at": _now_iso(),
        "created_by": current_user.get("id"),
        "approved_at": None,
        "approved_by": None,
    }
    await db.clara_integrations.insert_one(dict(doc))

    prompt = _build_prompt(template_id, token, callback_url, site.get("name", "this site"))
    return {
        "integration_id": doc["id"],
        "integration_token": token,
        "callback_url": callback_url,
        "template": TEMPLATES[template_id],
        "prompt_markdown": prompt,
    }


@clara_integrations_router.post("/register")
async def register_integration(data: dict, background: BackgroundTasks):
    """PUBLIC endpoint called by the external Emergent project on startup.
    Auth is via the integration_token in the body.
    """
    token = (data.get("integration_token") or "").strip()
    base_url = (data.get("base_url") or "").rstrip("/")
    shared_secret = data.get("shared_secret") or ""
    endpoints_map = data.get("endpoints_map") or {}
    schema_version = data.get("schema_version") or 1

    if not token:
        raise HTTPException(status_code=400, detail="integration_token required")
    if not base_url:
        raise HTTPException(status_code=400, detail="base_url required")

    integ = await db.clara_integrations.find_one({"integration_token": token}, {"_id": 0})
    if not integ:
        raise HTTPException(status_code=401, detail="Invalid integration token")
    if integ.get("status") == "disconnected":
        raise HTTPException(status_code=403, detail="This integration is disconnected; ask the admin to regenerate a new token.")

    now = _now_iso()
    # Preserve 'connected' status if re-registering (e.g. external project redeploy)
    new_status = integ.get("status") if integ.get("status") in ("connected",) else "pending_approval"

    update = {
        "base_url": base_url,
        "shared_secret": shared_secret,
        "endpoints_map": endpoints_map,
        "schema_version": schema_version,
        "registered_at": integ.get("registered_at") or now,
        "updated_at": now,
        "status": new_status,
    }
    await db.clara_integrations.update_one({"id": integ["id"]}, {"$set": update})

    # Run an initial health check in background
    background.add_task(_run_health_check, integ["id"])

    return {
        "status": new_status,
        "integration_id": integ["id"],
        "message": "Registered. Awaiting admin approval." if new_status == "pending_approval" else "Re-registered.",
    }


@clara_integrations_router.post("/{integration_id}/approve")
async def approve_integration(
    integration_id: str,
    background: BackgroundTasks,
    current_user: dict = Depends(require_system_admin),
):
    integ = await db.clara_integrations.find_one({"id": integration_id}, {"_id": 0})
    if not integ:
        raise HTTPException(status_code=404, detail="Integration not found")
    if integ.get("status") not in ("pending_approval", "disconnected"):
        raise HTTPException(status_code=400, detail=f"Cannot approve from status: {integ.get('status')}")

    now = _now_iso()
    await db.clara_integrations.update_one(
        {"id": integration_id},
        {"$set": {"status": "connected", "approved_at": now, "approved_by": current_user.get("id"), "updated_at": now}},
    )
    # Full sync of existing content items
    background.add_task(_full_sync_news_blog, integration_id)
    return {"status": "connected", "message": "Approved. Existing items will be synced in background."}


@clara_integrations_router.post("/{integration_id}/disconnect")
async def disconnect_integration(integration_id: str, current_user: dict = Depends(require_system_admin)):
    res = await db.clara_integrations.update_one(
        {"id": integration_id},
        {"$set": {"status": "disconnected", "disconnected_at": _now_iso(), "disconnected_by": current_user.get("id")}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Integration not found")
    return {"status": "disconnected"}


@clara_integrations_router.delete("/{integration_id}")
async def delete_integration(integration_id: str, current_user: dict = Depends(require_system_admin)):
    res = await db.clara_integrations.delete_one({"id": integration_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Integration not found")
    return {"status": "deleted"}


@clara_integrations_router.post("/{integration_id}/check")
async def manual_health_check(integration_id: str, current_user: dict = Depends(require_system_admin)):
    result = await _run_health_check(integration_id)
    return result or {"status": "error", "message": "Could not run check"}


@clara_integrations_router.post("/{integration_id}/publish/{content_id}")
async def publish_content_item(
    integration_id: str,
    content_id: str,
    current_user: dict = Depends(require_system_admin),
):
    integ = await db.clara_integrations.find_one({"id": integration_id}, {"_id": 0})
    if not integ:
        raise HTTPException(status_code=404, detail="Integration not found")
    if integ.get("status") != "connected":
        raise HTTPException(status_code=400, detail="Integration is not connected")

    item = await db.content_items.find_one({"id": content_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Content item not found")

    result = await _push_content_item(integ, item)
    return result


# Public list of CONNECTED integrations for a main_site — used by Content Library UI
@clara_integrations_router.get("/connected/by-site/{main_site_id}")
async def list_connected_for_site(
    main_site_id: str,
    template: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    q = {"main_site_id": main_site_id, "status": "connected"}
    if template:
        q["template"] = template
    cursor = db.clara_integrations.find(q, {"_id": 0, "shared_secret": 0, "integration_token": 0})
    items = []
    async for it in cursor:
        items.append(it)
    return items


# ───────────────────── Helpers (sync + health) ─────────────────────

def _build_url(base_url: str, path_template: str, **kwargs) -> str:
    path = path_template
    for k, v in kwargs.items():
        path = path.replace("{" + k + "}", str(v))
    return base_url.rstrip("/") + (path if path.startswith("/") else "/" + path)


def _content_to_payload(item: dict) -> dict:
    """Map a Clara content_item to the integration's news_blog schema."""
    return {
        "title": item.get("title") or "",
        "slug": item.get("slug") or "",
        "excerpt": item.get("excerpt") or item.get("description") or "",
        "body_html": item.get("body") or item.get("body_html") or "",
        "featured_image_url": item.get("featured_image_url") or item.get("image_url") or "",
        "author_name": item.get("author_name") or item.get("created_by_name") or "",
        "category": item.get("category") or "",
        "tags": item.get("tags") or [],
        "status": item.get("status") or "published",
        "published_at": item.get("published_at") or item.get("updated_at") or _now_iso(),
        "clara_content_id": item["id"],
    }


async def _push_content_item(integ: dict, item: dict) -> dict:
    eps = integ.get("endpoints_map") or {}
    upsert_path = eps.get("upsert_by_clara_id") or "/api/clara-feature/news/by-clara-id/{clara_content_id}"
    url = _build_url(integ["base_url"], upsert_path, clara_content_id=item["id"])
    headers = {"Content-Type": "application/json"}
    if integ.get("shared_secret"):
        headers["Authorization"] = f"Bearer {integ['shared_secret']}"
    payload = _content_to_payload(item)
    started = datetime.now(timezone.utc)
    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            r = await client.post(url, json=payload, headers=headers)
            elapsed_ms = int((datetime.now(timezone.utc) - started).total_seconds() * 1000)
            ok = r.status_code < 400
            return {
                "status": "synced" if ok else "failed",
                "http_status": r.status_code,
                "elapsed_ms": elapsed_ms,
                "response": (r.text or "")[:400],
            }
    except Exception as e:
        return {"status": "error", "message": f"{type(e).__name__}: {str(e)[:120]}"}


async def _run_health_check(integration_id: str) -> dict:
    integ = await db.clara_integrations.find_one({"id": integration_id}, {"_id": 0})
    if not integ or not integ.get("base_url"):
        return {"status": "error", "message": "Integration not registered"}
    eps = integ.get("endpoints_map") or {}
    health_path = eps.get("health") or "/api/clara-feature/health"
    url = _build_url(integ["base_url"], health_path)
    started = datetime.now(timezone.utc)
    try:
        async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
            r = await client.get(url)
            elapsed_ms = int((datetime.now(timezone.utc) - started).total_seconds() * 1000)
            ok = r.status_code < 400
            result = {
                "status": "ok" if ok else "failed",
                "http_status": r.status_code,
                "elapsed_ms": elapsed_ms,
                "checked_at": _now_iso(),
            }
    except httpx.TimeoutException:
        result = {"status": "timeout", "message": "Timed out", "checked_at": _now_iso()}
    except Exception as e:
        result = {"status": "error", "message": f"{type(e).__name__}: {str(e)[:120]}", "checked_at": _now_iso()}
    await db.clara_integrations.update_one({"id": integration_id}, {"$set": {"last_health_check": result}})
    return result


async def _full_sync_news_blog(integration_id: str):
    """Push all main_site content items to the external integration after approval."""
    integ = await db.clara_integrations.find_one({"id": integration_id}, {"_id": 0})
    if not integ or integ.get("template") != "news_blog":
        return
    items = await db.content_items.find({"main_site_id": integ["main_site_id"], "deleted_at": {"$in": [None, ""]}}, {"_id": 0}).to_list(2000)
    synced, failed = 0, 0
    for item in items:
        res = await _push_content_item(integ, item)
        if res.get("status") == "synced":
            synced += 1
        else:
            failed += 1
        await asyncio.sleep(0.1)  # small rate limit
    await db.clara_integrations.update_one(
        {"id": integration_id},
        {"$set": {"last_synced_at": _now_iso(), "last_sync_result": {"synced": synced, "failed": failed, "total": len(items)}}},
    )


# ───────────────────── Background poller ─────────────────────

async def integrations_health_poller():
    """Background task: health-check all 'connected' integrations every 30s."""
    while True:
        try:
            integs = await db.clara_integrations.find({"status": "connected"}, {"_id": 0, "id": 1}).to_list(500)
            await asyncio.gather(*[_run_health_check(i["id"]) for i in integs], return_exceptions=True)
        except Exception:
            pass
        await asyncio.sleep(30)
