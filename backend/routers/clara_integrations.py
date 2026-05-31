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
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks, Request
from datetime import datetime, timezone
from typing import Optional, List
import os
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
    "site_branding": {
        "id": "site_branding",
        "name": "Site Branding & Content",
        "description": "Push colors, logo, hero text, contact info and SEO meta to the external site.",
        "icon": "palette",
        "endpoints": {
            "health":  {"method": "GET",   "path": "/api/clara-feature/branding/health", "auth": False},
            "get":     {"method": "GET",   "path": "/api/clara-feature/branding",        "auth": True},
            "update":  {"method": "PATCH", "path": "/api/clara-feature/branding",        "auth": True},
        },
        "schema": {
            "site_name": "str", "logo_url": "str", "favicon_url": "str",
            "primary_color": "hex", "secondary_color": "hex", "accent_color": "hex",
            "background_color": "hex", "text_color": "hex", "font_family": "str",
            "hero_headline": "str", "hero_subheadline": "str", "hero_cta_label": "str", "hero_cta_url": "str",
            "about_title": "str", "about_body": "str (HTML)", "footer_tagline": "str",
            "contact_email": "str", "contact_phone": "str", "contact_address": "str",
            "social_facebook": "url", "social_instagram": "url", "social_linkedin": "url",
            "social_twitter": "url", "social_youtube": "url",
            "meta_title": "str", "meta_description": "str", "og_image_url": "url",
        },
    },
    "site_menu": {
        "id": "site_menu",
        "name": "Navigation Menu",
        "description": "Manage the navigation menu (header/footer) of the external site from Clara.",
        "icon": "menu",
        "endpoints": {
            "health":  {"method": "GET",  "path": "/api/clara-feature/menu/health", "auth": False},
            "list":    {"method": "GET",  "path": "/api/clara-feature/menu",        "auth": True},
            "replace": {"method": "PUT",  "path": "/api/clara-feature/menu",        "auth": True},
        },
        "schema": {
            "items": "list[{label, url, order, target, location: 'header'|'footer', children: [...]}]",
        },
    },
    "pages": {
        "id": "pages",
        "name": "Static Pages",
        "description": "Manage static pages (About, Privacy, Terms, custom landing pages) from Clara.",
        "icon": "file",
        "endpoints": {
            "health":             {"method": "GET",    "path": "/api/clara-feature/pages/health", "auth": False},
            "list":               {"method": "GET",    "path": "/api/clara-feature/pages",        "auth": True},
            "upsert_by_clara_id": {"method": "POST",   "path": "/api/clara-feature/pages/by-clara-id/{clara_content_id}", "auth": True},
            "delete_by_clara_id": {"method": "DELETE", "path": "/api/clara-feature/pages/by-clara-id/{clara_content_id}", "auth": True},
        },
        "schema": {
            "title": "str", "slug": "str", "body_html": "str",
            "meta_title": "str", "meta_description": "str", "og_image_url": "str",
            "status": "draft | published",
            "clara_content_id": "str (UUID)",
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


def _resolve_callback_base(target: str) -> str:
    """Return the public Clara base URL for the chosen target.

    - `preview`    → REACT_APP_BACKEND_URL (this instance's external URL)
    - `production` → PROMOTE_TARGET_URL (e.g. https://clr.koodh.com)
    """
    if target == "production":
        url = os.environ.get("PROMOTE_TARGET_URL", "").strip()
        return url.rstrip("/") if url else ""
    # preview / default
    url = os.environ.get("REACT_APP_BACKEND_URL", "").strip()
    if not url:
        try:
            with open("/app/frontend/.env", "r") as f:
                for line in f:
                    if line.startswith("REACT_APP_BACKEND_URL="):
                        url = line.split("=", 1)[1].strip()
                        break
        except Exception:
            pass
    return url.rstrip("/") if url else ""


def _build_prompt(template_id: str, token: str, callback_url: str, site_name: str, target: str = "preview", site_public_url: str = "") -> str:
    """Render a markdown prompt to paste into the external Emergent project."""
    tpl = TEMPLATES[template_id]
    eps = tpl["endpoints"]
    schema_rows = "\n".join(f"  - `{k}`: {v}" for k, v in tpl["schema"].items())
    ep_rows = "\n".join(
        f"| `{spec['method']}` | `{spec['path']}` | {'Bearer token' if spec['auth'] else 'public'} |"
        for spec in eps.values()
    )
    # Build endpoints_map literal for the registration snippet
    endpoints_map_lines = "\n".join(
        f'            "{key}": "{spec["path"]}",'
        for key, spec in eps.items()
    )
    # Friendly public-route hint per template
    public_hint = ""
    if template_id == "news_blog":
        public_hint = "Also expose `GET /api/public/news` + `GET /api/public/news/{slug}` (no auth) so the public website can read articles."
    elif template_id == "site_branding":
        public_hint = "Apply branding values to CSS variables / meta tags at request time so the public site reflects changes within one refresh."
    elif template_id == "site_menu":
        public_hint = "Render the menu items from your DB on every page render (server-side or client-side fetch from `/api/public/menu`)."
    elif template_id == "pages":
        public_hint = "Expose `GET /api/public/pages/{slug}` (no auth) for the public website to render static pages by slug."

    upsert_note = ""
    if "upsert_by_clara_id" in eps:
        upsert_note = "\n`clara_content_id` is the stable UUID — store it on every record. The endpoint must **upsert** (create if missing, replace if exists) based on this id.\n"

    target_banner = (
        "\n> 🚀 **Target**: this prompt registers against **PRODUCTION Clara** "
        f"({callback_url.split('/api/')[0]}). Make sure the external project is also "
        "the production deployment (not a preview).\n"
        if target == "production"
        else "\n> 🧪 **Target**: this prompt registers against **PREVIEW Clara** "
             f"({callback_url.split('/api/')[0]}). Use this for development/testing. "
             "Switch to the production prompt before going live.\n"
    )

    site_public_url_value = site_public_url or "<https://your-public-url>"

    return f"""# Clara Integration — {tpl['name']}
{target_banner}
You are building a **{tpl['name']}** integration for the Koodh Clara platform.
Clara will be the master editor for this feature; this project just exposes a
small REST contract so Clara can push content into it.

## 🔐 Authentication

The integration uses a shared secret in `backend/.env`:

```
CLARA_FEATURE_SECRET=<choose-a-long-random-string-you-set-yourself>
CLARA_INTEGRATION_TOKEN={token}
CLARA_INTEGRATION_CALLBACK={callback_url}
SITE_PUBLIC_URL={site_public_url_value}
```

All endpoints below (except `/health`) require:
```
Authorization: Bearer ${{CLARA_FEATURE_SECRET}}
```

## 📡 Endpoints to implement

| Method | Path | Auth |
|---|---|---|
{ep_rows}

**Payload schema:**
{schema_rows}
{upsert_note}

## 🌐 Public site rendering

{public_hint}

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
{endpoints_map_lines}
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

- [ ] Health endpoint returns 200 OK without auth.
- [ ] All other endpoints accept `Authorization: Bearer ${{CLARA_FEATURE_SECRET}}`.
- [ ] On startup, you see `[clara-integration] 200` in the logs.
- [ ] In Clara, the integration for **{site_name}** moves to "pending approval".

Build all of this end-to-end and confirm by checking that Clara shows the
integration as pending-approval. The Clara admin will then click Approve.
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
    target = (data.get("target") or "preview").lower()  # 'preview' or 'production'
    if not main_site_id:
        raise HTTPException(status_code=400, detail="main_site_id required")
    if template_id not in TEMPLATES:
        raise HTTPException(status_code=400, detail=f"Unknown template: {template_id}")
    if target not in ("preview", "production"):
        raise HTTPException(status_code=400, detail="target must be 'preview' or 'production'")

    site = await db.main_sites.find_one({"id": main_site_id}, {"_id": 0, "id": 1, "name": 1})
    if not site:
        raise HTTPException(status_code=404, detail="Main site not found")

    backend_base = _resolve_callback_base(target)
    if not backend_base:
        raise HTTPException(
            status_code=503,
            detail="Production callback URL not configured. Set PROMOTE_TARGET_URL in backend/.env to enable production prompts.",
        )

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

    prompt = _build_prompt(template_id, token, callback_url, site.get("name", "this site"), target=target)
    return {
        "integration_id": doc["id"],
        "integration_token": token,
        "callback_url": callback_url,
        "target": target,
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


@clara_integrations_router.get("/{integration_id}/prompt")
async def get_existing_prompt(
    integration_id: str,
    target: str = "preview",
    current_user: dict = Depends(require_system_admin),
):
    """Regenerate the markdown prompt for an EXISTING integration.

    `target` selects which Clara instance the external project will register
    against:
      - `preview`    → this instance (default; useful during dev)
      - `production` → https://clr.koodh.com (requires PROMOTE_TARGET_URL set)

    Important: the integration_token only exists in THIS instance's DB. To use
    the same token on production, click "Promote" first to copy the row.
    """
    integ = await db.clara_integrations.find_one({"id": integration_id}, {"_id": 0})
    if not integ:
        raise HTTPException(status_code=404, detail="Integration not found")

    template_id = integ.get("template")
    if template_id not in TEMPLATES:
        raise HTTPException(status_code=400, detail=f"Unknown template on integration: {template_id}")

    target = (target or "preview").lower()
    if target not in ("preview", "production"):
        raise HTTPException(status_code=400, detail="target must be 'preview' or 'production'")

    site = await db.main_sites.find_one({"id": integ["main_site_id"]}, {"_id": 0, "name": 1})
    site_name = (site or {}).get("name", "this site")

    backend_base = _resolve_callback_base(target)
    if not backend_base:
        raise HTTPException(
            status_code=503,
            detail="Production callback URL not configured. Set PROMOTE_TARGET_URL in backend/.env to enable production prompts.",
        )
    callback_url = f"{backend_base}/api/clara-custom/integrations/register"

    # Check if production has been promoted yet (warn if not)
    promote_warning = None
    if target == "production":
        promoted = bool(integ.get("promoted_at"))
        if not promoted:
            promote_warning = (
                "This integration has not been promoted to production yet. "
                "The external project will get HTTP 401 (Invalid integration token) "
                "when it tries to register against production. Click 'Promote' first."
            )

    # SITE_PUBLIC_URL hint: preview = currently-registered base_url; production = explicit production_url if set
    site_public_url = ""
    if target == "production":
        site_public_url = (integ.get("production_url") or "").rstrip("/")
    else:
        site_public_url = (integ.get("base_url") or "").rstrip("/")

    prompt = _build_prompt(template_id, integ["integration_token"], callback_url, site_name, target=target, site_public_url=site_public_url)
    return {
        "integration_id": integ["id"],
        "integration_token": integ["integration_token"],
        "callback_url": callback_url,
        "target": target,
        "template": TEMPLATES[template_id],
        "prompt_markdown": prompt,
        "current_base_url": integ.get("base_url"),
        "current_shared_secret_set": bool(integ.get("shared_secret")),
        "production_url": integ.get("production_url"),
        "site_public_url_in_prompt": site_public_url or None,
        "promote_warning": promote_warning,
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

    # Auto-enable content_library feature on the parent main_site (for news_blog template)
    if integ.get("template") == "news_blog":
        await db.main_sites.update_one(
            {"id": integ["main_site_id"]},
            {"$addToSet": {"enabled_features": {"$each": ["content_library", "media_library"]}}},
        )

    # Initial bidirectional sync: pull existing remote items in first, then push everything
    background.add_task(_initial_sync_news_blog, integration_id)
    return {"status": "connected", "message": "Approved. Existing remote items will be imported and synced in background."}


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


@clara_integrations_router.patch("/{integration_id}")
async def patch_integration(
    integration_id: str,
    data: dict,
    current_user: dict = Depends(require_system_admin),
):
    """Manually override fields on an integration (e.g. swap base_url from preview to production)."""
    integ = await db.clara_integrations.find_one({"id": integration_id}, {"_id": 0, "id": 1})
    if not integ:
        raise HTTPException(status_code=404, detail="Integration not found")
    allowed = {"base_url", "shared_secret", "production_url"}
    update = {k: v for k, v in data.items() if k in allowed and v is not None}
    if "base_url" in update:
        update["base_url"] = str(update["base_url"]).rstrip("/")
    if "production_url" in update:
        update["production_url"] = str(update["production_url"]).rstrip("/")
    if not update:
        raise HTTPException(status_code=400, detail="No editable fields provided")
    update["updated_at"] = _now_iso()
    await db.clara_integrations.update_one({"id": integration_id}, {"$set": update})
    return {"status": "updated", "updated_fields": list(update.keys())}


# ───────────────────── Promote preview → production ─────────────────────

@clara_integrations_router.get("/promote-config")
async def promote_config(current_user: dict = Depends(require_system_admin)):
    """Frontend uses this to know whether to show the Promote button.

    Promote is enabled only when both env vars are set:
      - PROMOTE_TARGET_URL  (e.g. https://clr.koodh.com)
      - CLARA_PROMOTE_SECRET (same value as on the production instance)
    """
    target = os.environ.get("PROMOTE_TARGET_URL")
    secret = os.environ.get("CLARA_PROMOTE_SECRET")
    return {
        "enabled": bool(target and secret),
        "target_url": target if target else None,
    }


@clara_integrations_router.post("/{integration_id}/promote")
async def promote_to_production(
    integration_id: str,
    current_user: dict = Depends(require_system_admin),
):
    """Copy this integration row to the production Clara instance.

    The production instance must have the SAME CLARA_PROMOTE_SECRET in its .env.
    """
    target_url = os.environ.get("PROMOTE_TARGET_URL")
    secret = os.environ.get("CLARA_PROMOTE_SECRET")
    if not (target_url and secret):
        raise HTTPException(status_code=503, detail="Promote feature not configured. Set PROMOTE_TARGET_URL and CLARA_PROMOTE_SECRET in this instance's .env.")

    integ = await db.clara_integrations.find_one({"id": integration_id}, {"_id": 0})
    if not integ:
        raise HTTPException(status_code=404, detail="Integration not found")
    site = await db.main_sites.find_one({"id": integ["main_site_id"]}, {"_id": 0})
    if not site:
        raise HTTPException(status_code=404, detail="Main site not found")

    payload = {
        "integration": integ,
        "main_site_slug": site.get("slug"),
        "main_site_name": site.get("name"),
    }
    headers = {"X-Promote-Secret": secret, "Content-Type": "application/json"}
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.post(
                f"{target_url.rstrip('/')}/api/clara-custom/integrations/accept-promotion",
                json=payload,
                headers=headers,
            )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to reach production: {type(e).__name__}: {str(e)[:140]}")
    if r.status_code >= 400:
        raise HTTPException(status_code=r.status_code, detail=f"Production refused: {r.text[:200]}")
    body = r.json()
    return {
        "status": body.get("status", "ok"),
        "target_url": target_url,
        "production_integration_id": body.get("integration_id"),
        "matched_main_site": body.get("main_site_slug"),
        "message": "Integration promoted to production. The external project does not need to be reconfigured — the same token now works on both Clara instances.",
    }


@clara_integrations_router.post("/accept-promotion")
async def accept_promotion(data: dict, request: Request):
    """Production-side receiver — authenticated by X-Promote-Secret header.

    NEVER call this directly from external projects; it bypasses 2FA and is
    intended only for trusted preview → production promotion.
    """
    expected = os.environ.get("CLARA_PROMOTE_SECRET")
    if not expected:
        raise HTTPException(status_code=503, detail="Promote receiver not enabled on this instance")
    if request.headers.get("X-Promote-Secret") != expected:
        raise HTTPException(status_code=401, detail="Invalid promote secret")

    src_integ = data.get("integration") or {}
    if not src_integ.get("id") or not src_integ.get("integration_token"):
        raise HTTPException(status_code=400, detail="integration payload incomplete")

    slug = data.get("main_site_slug")
    if not slug:
        raise HTTPException(status_code=400, detail="main_site_slug required for matching")
    target_site = await db.main_sites.find_one({"slug": slug}, {"_id": 0, "id": 1, "name": 1})
    if not target_site:
        raise HTTPException(status_code=404, detail=f"No main_site with slug='{slug}' in this instance. Create it first.")

    src_integ["main_site_id"] = target_site["id"]
    src_integ["promoted_at"] = _now_iso()

    # Idempotent: match on integration_token (stable identifier)
    existing = await db.clara_integrations.find_one(
        {"integration_token": src_integ["integration_token"]},
        {"_id": 0, "id": 1},
    )
    if existing:
        await db.clara_integrations.update_one(
            {"id": existing["id"]},
            {"$set": src_integ},
        )
        return {"status": "updated", "integration_id": existing["id"], "main_site_slug": slug}

    await db.clara_integrations.insert_one(dict(src_integ))
    return {"status": "created", "integration_id": src_integ["id"], "main_site_slug": slug}


@clara_integrations_router.post("/{integration_id}/check")
async def manual_health_check(integration_id: str, current_user: dict = Depends(require_system_admin)):
    result = await _run_health_check(integration_id)
    return result or {"status": "error", "message": "Could not run check"}


@clara_integrations_router.post("/{integration_id}/import-remote")
async def import_remote(integration_id: str, current_user: dict = Depends(require_system_admin)):
    """Pull existing items from the external site into Clara's content library."""
    integ = await db.clara_integrations.find_one({"id": integration_id}, {"_id": 0})
    if not integ:
        raise HTTPException(status_code=404, detail="Integration not found")
    if integ.get("status") != "connected":
        raise HTTPException(status_code=400, detail="Integration must be connected to import")
    result = await _import_existing_remote_items(integ)
    await db.clara_integrations.update_one(
        {"id": integration_id},
        {"$set": {"last_import_result": result, "last_import_at": _now_iso()}},
    )
    return result


@clara_integrations_router.post("/{integration_id}/diagnose")
async def diagnose_external(integration_id: str, current_user: dict = Depends(require_system_admin)):
    """Inspect the actual response of the external site's list endpoint.
    Returns the raw HTTP status, headers, response body (truncated) and a
    classification of why import might be returning 0 items.
    """
    integ = await db.clara_integrations.find_one({"id": integration_id}, {"_id": 0})
    if not integ:
        raise HTTPException(status_code=404, detail="Integration not found")
    if not integ.get("base_url"):
        raise HTTPException(status_code=400, detail="Integration has not registered yet")

    eps = integ.get("endpoints_map") or {}
    list_path = eps.get("list") or "/api/clara-feature/news"
    url = _build_url(integ["base_url"], list_path)
    headers = {}
    if integ.get("shared_secret"):
        headers["Authorization"] = f"Bearer {integ['shared_secret']}"

    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            r = await client.get(url, headers=headers)
            raw_body = (r.text or "")[:2000]
            try:
                parsed = r.json()
            except Exception:
                parsed = None
    except Exception as e:
        return {
            "ok": False,
            "url": url,
            "error": f"{type(e).__name__}: {str(e)[:200]}",
            "diagnosis": "Could not reach the external site. Check that it is deployed and the base URL is correct.",
        }

    # Classify outcome
    item_count = 0
    if isinstance(parsed, list):
        item_count = len(parsed)
    elif isinstance(parsed, dict):
        item_count = len(parsed.get("items") or parsed.get("data") or [])

    diagnosis = ""
    if r.status_code == 401 or r.status_code == 403:
        diagnosis = (
            "AUTH FAILURE — the external site rejected the bearer token. The shared_secret "
            "stored in Clara does not match the CLARA_FEATURE_SECRET on the external project. "
            "Have the external project re-register, or update its secret."
        )
    elif r.status_code == 404:
        diagnosis = (
            f"ENDPOINT NOT FOUND — `{list_path}` does not exist on the external site. "
            "The external project may not have implemented the 'list' endpoint of this template."
        )
    elif r.status_code >= 500:
        diagnosis = f"EXTERNAL SITE ERROR — {r.status_code}. Check the external project's logs."
    elif r.status_code >= 400:
        diagnosis = f"HTTP {r.status_code} — unexpected response from external site."
    elif item_count == 0:
        diagnosis = (
            "EMPTY RESPONSE — the external site returned 200 OK but with 0 items. "
            "Likely causes:\n"
            "• The blog data exists on the external site but is NOT stored in the collection "
            "that backs this endpoint (e.g. static frontend content, hard-coded JSON, or a different DB collection).\n"
            "• The endpoint filters out articles that are not yet imported from Clara.\n"
            "Ask the external project to verify that GET " + list_path + " returns the existing blog articles."
        )
    else:
        diagnosis = f"OK — {item_count} item(s) returned. Import should work."

    return {
        "ok": r.status_code < 400,
        "url": url,
        "http_status": r.status_code,
        "item_count": item_count,
        "diagnosis": diagnosis,
        "response_body_preview": raw_body,
    }


@clara_integrations_router.get("/{integration_id}/setup-steps")
async def get_setup_steps(integration_id: str, current_user: dict = Depends(require_system_admin)):
    """Return a contextual step-by-step setup guide for this integration.
    Each step has: id, title, description, status (done|current|todo), action (optional),
    and crucial=True if a step requires Clara Support involvement.
    """
    integ = await db.clara_integrations.find_one({"id": integration_id}, {"_id": 0, "shared_secret": 0, "integration_token": 0})
    if not integ:
        raise HTTPException(status_code=404, detail="Integration not found")
    status = integ.get("status", "pending_registration")
    tpl_id = integ.get("template", "news_blog")
    template = TEMPLATES.get(tpl_id, {})

    def step(sid, title, desc, st, action=None, crucial=False, support_topic=None):
        return {"id": sid, "title": title, "description": desc, "status": st,
                "action": action, "crucial": crucial, "support_topic": support_topic}

    # Compute step statuses
    has_registered = bool(integ.get("base_url"))
    is_connected = status == "connected"
    healthy = (integ.get("last_health_check") or {}).get("status") == "ok"
    imported = bool(integ.get("last_import_at"))

    steps = [
        step(
            "generate_prompt",
            "1. Generate the integration prompt",
            f"Click 'Add integration' and pick '{template.get('name', tpl_id)}'. Clara creates the row and shows the markdown prompt.",
            "done",  # always done — this endpoint exists because the integration was created
        ),
        step(
            "paste_in_external",
            "2. Paste the prompt into the external Emergent project",
            "Open the OTHER Emergent project, start a new chat, paste the entire markdown prompt as the first message. The agent there will build the required endpoints.",
            "done" if has_registered else "current",
        ),
        step(
            "external_registers",
            "3. External project registers itself",
            "After deploying the new code, the external backend automatically POSTs to Clara on startup. You'll see logs `[clara-integration] 200` in the external project.",
            "done" if has_registered else ("current" if status == "pending_registration" else "todo"),
        ),
        step(
            "verify_health",
            "4. Verify the health endpoint",
            f"Clara pings `{template.get('endpoints', {}).get('health', {}).get('path', '/api/clara-feature/health')}` automatically. It should return HTTP 200 within 500ms.",
            "done" if healthy else ("current" if has_registered else "todo"),
            action={"type": "check", "label": "Check now"} if has_registered else None,
        ),
        step(
            "approve",
            "5. Approve the integration",
            "Once health is OK, approve the integration. Clara starts the initial sync (pull remote items + push Clara items).",
            "done" if is_connected else ("current" if status == "pending_approval" else "todo"),
            action={"type": "approve", "label": "Approve"} if status == "pending_approval" else None,
        ),
        step(
            "import_existing",
            "6. Import existing content from the external site (optional)",
            "If the external site already has content, click Import to pull it into the Clara Content Library so you can edit it here.",
            "done" if imported else ("current" if is_connected else "todo"),
            action={"type": "import", "label": "Import now"} if is_connected else None,
        ),
        step(
            "promote_to_prod",
            "7. Promote to production (optional)",
            "Copy this integration to the production Clara so the same token works on https://clr.koodh.com.",
            "todo" if is_connected else "todo",
            action={"type": "promote", "label": "Promote"} if is_connected else None,
            crucial=True,
            support_topic="Production rollout — Clara Promote feature needs CLARA_PROMOTE_SECRET set on production. Contact Clara Support if you need help configuring this.",
        ),
    ]
    return {
        "integration_id": integration_id,
        "template": template,
        "status": status,
        "steps": steps,
        "support_email": "support@koodh.com",
    }


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
            if not ok:
                if r.status_code == 404:
                    hint = f"The external site does not have endpoint {upsert_path}. The integration may need to be rebuilt with the new prompt template."
                elif r.status_code in (401, 403):
                    hint = "Authentication failed. The shared_secret in Clara does not match the external site's CLARA_FEATURE_SECRET."
                else:
                    hint = f"External site returned HTTP {r.status_code}."
                return {
                    "status": "failed",
                    "http_status": r.status_code,
                    "elapsed_ms": elapsed_ms,
                    "url": url,
                    "hint": hint,
                    "response": (r.text or "")[:400],
                }
            return {"status": "synced", "http_status": r.status_code, "elapsed_ms": elapsed_ms, "url": url}
    except httpx.ConnectTimeout:
        return {"status": "error", "url": url, "hint": "Connection timed out. The external site's backend may be offline or sleeping. Try waking it up (open the URL in a browser) or check that its server is running."}
    except httpx.ReadTimeout:
        return {"status": "error", "url": url, "hint": "External site took longer than 12s to respond. Backend may be overloaded or stuck."}
    except Exception as e:
        return {"status": "error", "url": url, "hint": f"{type(e).__name__}: {str(e)[:160]}"}


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


async def _import_existing_remote_items(integ: dict) -> dict:
    """Pull existing items from the external site into Clara's content_items.
    Used so that after approval, the editor sees what's already published on
    the external website and can edit it via Clara's Content Library.
    Idempotent: skips items that already exist (matched on slug or remote id).
    """
    if integ.get("template") != "news_blog":
        return {"imported": 0, "skipped": 0, "failed": 0}
    eps = integ.get("endpoints_map") or {}
    list_path = eps.get("list") or "/api/clara-feature/news"
    url = _build_url(integ["base_url"], list_path)
    headers = {}
    if integ.get("shared_secret"):
        headers["Authorization"] = f"Bearer {integ['shared_secret']}"
    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            r = await client.get(url, headers=headers)
            if r.status_code >= 400:
                return {"imported": 0, "skipped": 0, "failed": 0, "error": f"list endpoint returned {r.status_code}"}
            data = r.json() if r.text else []
            # Accept both bare list and {items: [...]} envelope
            remote_items = data if isinstance(data, list) else (data.get("items") or data.get("data") or [])
    except Exception as e:
        return {"imported": 0, "skipped": 0, "failed": 0, "error": f"{type(e).__name__}: {str(e)[:120]}"}

    main_site_id = integ["main_site_id"]
    imported = skipped = failed = 0
    now = _now_iso()
    for ri in remote_items:
        try:
            remote_id = ri.get("clara_content_id") or ri.get("id")
            slug = (ri.get("slug") or "").strip()
            title = (ri.get("title") or "").strip() or "Untitled"
            # Match on remote id first (if Clara had previously synced), then slug
            existing = None
            if remote_id:
                existing = await db.content_items.find_one(
                    {"main_site_id": main_site_id, "id": remote_id},
                    {"_id": 0, "id": 1},
                )
            if not existing and slug:
                existing = await db.content_items.find_one(
                    {"main_site_id": main_site_id, "slug": slug},
                    {"_id": 0, "id": 1},
                )
            if existing:
                skipped += 1
                continue
            # Map external statuses to Clara's enum
            ext_status = (ri.get("status") or "published").lower()
            clara_status = {"published": "ready", "draft": "draft", "archived": "draft"}.get(ext_status, "ready")
            new_doc = {
                "id": remote_id or str(uuid.uuid4()),
                "title": title,
                "slug": slug,
                "type": "text",
                "body": ri.get("body_html") or ri.get("body") or "",
                "excerpt": ri.get("excerpt") or "",
                "external_url": ri.get("external_url") or "",
                "featured_image_url": ri.get("featured_image_url") or "",
                "category_label": ri.get("category") or "",
                "tags": ri.get("tags") or [],
                "status": clara_status,
                "main_site_id": main_site_id,
                "team_id": "",
                "created_by": "clara-integration-import",
                "imported_from_integration_id": integ["id"],
                "imported_from_url": integ.get("base_url"),
                "created_at": ri.get("created_at") or now,
                "updated_at": ri.get("updated_at") or now,
                "published_at": ri.get("published_at") or now,
            }
            await db.content_items.insert_one(dict(new_doc))
            imported += 1
        except Exception:
            failed += 1
    return {"imported": imported, "skipped": skipped, "failed": failed, "total_remote": len(remote_items)}


async def _initial_sync_news_blog(integration_id: str):
    """Approval flow: first import existing remote items, then push everything back."""
    integ = await db.clara_integrations.find_one({"id": integration_id}, {"_id": 0})
    if not integ:
        return
    import_result = await _import_existing_remote_items(integ)
    await db.clara_integrations.update_one(
        {"id": integration_id},
        {"$set": {"last_import_result": import_result, "last_import_at": _now_iso()}},
    )
    # After import, push everything (this also re-saves the freshly imported ones,
    # ensuring the external site has Clara-canonical fields like clara_content_id).
    await _full_sync_news_blog(integration_id)


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
