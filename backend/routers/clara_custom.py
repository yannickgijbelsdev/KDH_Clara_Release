"""Clara Custom — External API connection manager.

Lets system admins register external APIs per main site, run health checks
(HTTP status + path validation + schema validation), and import specs from
free-text prompts, OpenAPI/Swagger, or Postman collections.
"""
from fastapi import APIRouter, HTTPException, Depends, Request, BackgroundTasks
from datetime import datetime, timezone
from typing import Optional, List
import uuid
import json
import httpx
import asyncio

from services.auth import get_current_user, require_network_admin
from database import db

clara_custom_router = APIRouter(prefix="/clara-custom", tags=["clara-custom"])


# Use require_network_admin as the system admin gate (network admins are the platform admins)
require_system_admin = require_network_admin


# ───────────────────── Helpers ─────────────────────

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _strip_id(doc: dict) -> dict:
    doc.pop("_id", None)
    return doc


def _schema_matches(value, schema) -> bool:
    """Lightweight JSON-schema-ish validator.
    Schema can be:
      - {"type": "object"|"array"|"string"|"number"|"boolean"}
      - {"type": "object", "required": ["field1","field2"]}
      - {"type": "array", "items": {...}}
    """
    if not isinstance(schema, dict):
        return True
    t = schema.get("type")
    if t == "object":
        if not isinstance(value, dict):
            return False
        for req in schema.get("required", []) or []:
            if req not in value:
                return False
        return True
    if t == "array":
        if not isinstance(value, list):
            return False
        items = schema.get("items")
        if items and value:
            return all(_schema_matches(v, items) for v in value[:5])
        return True
    if t == "string":  return isinstance(value, str)
    if t == "number":  return isinstance(value, (int, float)) and not isinstance(value, bool)
    if t == "integer": return isinstance(value, int) and not isinstance(value, bool)
    if t == "boolean": return isinstance(value, bool)
    return True


async def run_health_check(api: dict, timeout_seconds: float = 8.0) -> dict:
    """Perform a configurable health check on a Clara Custom API."""
    base_url = (api.get("base_url") or "").rstrip("/")
    path = (api.get("health_check_path") or "").strip()
    if not base_url:
        return {"status": "error", "message": "Base URL missing", "checked_at": _now_iso()}

    url = base_url + (path if path.startswith("/") else "/" + path) if path else base_url

    headers = {}
    if api.get("auth_header"):
        headers["Authorization"] = api["auth_header"]
    for h in api.get("extra_headers", []) or []:
        if isinstance(h, dict) and h.get("name") and h.get("value"):
            headers[h["name"]] = h["value"]

    started = datetime.now(timezone.utc)
    try:
        async with httpx.AsyncClient(timeout=timeout_seconds, follow_redirects=True) as client:
            r = await client.request(api.get("method", "GET"), url, headers=headers)
            elapsed_ms = int((datetime.now(timezone.utc) - started).total_seconds() * 1000)
            expected = api.get("expected_status") or 200
            status_ok = (r.status_code == expected) if expected else (r.status_code < 400)
            schema_ok = True
            schema_msg = ""
            if api.get("expected_schema"):
                try:
                    body = r.json()
                    schema_ok = _schema_matches(body, api["expected_schema"])
                    schema_msg = "Schema matched" if schema_ok else "Schema mismatch"
                except Exception:
                    schema_ok = False
                    schema_msg = "Non-JSON response"

            connected = status_ok and schema_ok
            return {
                "status": "connected" if connected else "failed",
                "http_status": r.status_code,
                "expected_status": expected,
                "schema_ok": schema_ok,
                "schema_message": schema_msg,
                "response_time_ms": elapsed_ms,
                "url_checked": url,
                "message": "OK" if connected else f"HTTP {r.status_code} (expected {expected})" + (f" · {schema_msg}" if api.get("expected_schema") else ""),
                "checked_at": _now_iso(),
            }
    except httpx.TimeoutException:
        return {"status": "timeout", "message": f"Timed out after {timeout_seconds}s", "url_checked": url, "checked_at": _now_iso()}
    except Exception as e:
        return {"status": "error", "message": f"{type(e).__name__}: {str(e)[:120]}", "url_checked": url, "checked_at": _now_iso()}


def _parse_openapi_payload(payload: dict, base_url_default: str = "") -> List[dict]:
    """Parse an OpenAPI/Swagger spec into a list of API entries (one per path)."""
    apis = []
    base = ""
    if "servers" in payload and payload["servers"]:
        base = (payload["servers"][0] or {}).get("url", "")
    elif "host" in payload:  # swagger v2
        scheme = (payload.get("schemes") or ["https"])[0]
        base = f"{scheme}://{payload['host']}{payload.get('basePath', '')}"
    base = base or base_url_default

    paths = payload.get("paths", {}) or {}
    for path, methods in paths.items():
        if not isinstance(methods, dict):
            continue
        # Pick GET if available for health checks, else first method
        method = "GET" if "get" in methods else next(iter([k for k in methods if k.lower() in ("get","post","put","delete","patch")]), None)
        if not method:
            continue
        op = methods.get(method.lower(), {})
        name = (op.get("summary") or op.get("operationId") or f"{method.upper()} {path}")[:60]
        apis.append({
            "name": name,
            "base_url": base,
            "method": method.upper(),
            "health_check_path": path,
            "expected_status": 200,
        })
    return apis


def _parse_postman_payload(payload: dict) -> List[dict]:
    """Parse a Postman v2 collection into a list of API entries."""
    apis = []

    def walk(items):
        for item in items or []:
            if "item" in item and isinstance(item["item"], list):
                walk(item["item"])
                continue
            req = item.get("request")
            if not isinstance(req, dict):
                continue
            url_block = req.get("url")
            if isinstance(url_block, str):
                full_url = url_block
            elif isinstance(url_block, dict):
                full_url = url_block.get("raw") or ""
            else:
                full_url = ""
            if not full_url:
                continue
            # Split base from path heuristically
            try:
                from urllib.parse import urlsplit
                u = urlsplit(full_url)
                base = f"{u.scheme}://{u.netloc}" if u.scheme else ""
                path = u.path or "/"
            except Exception:
                base, path = full_url, ""
            apis.append({
                "name": item.get("name") or path,
                "base_url": base,
                "method": (req.get("method") or "GET").upper(),
                "health_check_path": path,
                "expected_status": 200,
            })

    walk(payload.get("item", []))
    return apis


async def _parse_prompt_with_ai(prompt: str) -> List[dict]:
    """Use Emergent LLM to convert a free-form prompt into structured API entries."""
    import os
    api_key = os.getenv("EMERGENT_LLM_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="EMERGENT_LLM_KEY not configured")
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
    except Exception:
        raise HTTPException(status_code=500, detail="emergentintegrations library not installed")

    system = (
        "You are an API integration assistant. The user pastes documentation, descriptions, "
        "or notes about external APIs. Extract every endpoint into a JSON array of objects with: "
        "name (short label), base_url (full origin like https://api.example.com), method (GET/POST/etc), "
        "health_check_path (the path to ping), expected_status (usually 200), and optional "
        "auth_header (e.g. 'Bearer xxx' if a token was mentioned). "
        "Return ONLY valid JSON — an array of these objects. No prose, no markdown fences."
    )
    chat = LlmChat(api_key=api_key, session_id=f"clara-custom-{uuid.uuid4().hex[:8]}", system_message=system)
    chat.with_model("anthropic", "claude-sonnet-4-5")

    try:
        response = await chat.send_message(UserMessage(text=prompt[:8000]))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI parser failed: {type(e).__name__}: {str(e)[:200]}")

    # Strip code fences if any
    text = (response or "").strip()
    if text.startswith("```"):
        text = text.split("```", 2)[1].lstrip("json").lstrip()
        text = text.rsplit("```", 1)[0] if "```" in text else text
    try:
        data = json.loads(text)
        if isinstance(data, dict) and "apis" in data:
            data = data["apis"]
        if not isinstance(data, list):
            raise ValueError("AI did not return an array")
        cleaned = []
        for entry in data:
            if not isinstance(entry, dict):
                continue
            if not entry.get("base_url"):
                continue
            cleaned.append({
                "name": entry.get("name") or entry.get("base_url"),
                "base_url": entry["base_url"],
                "method": (entry.get("method") or "GET").upper(),
                "health_check_path": entry.get("health_check_path") or "/",
                "expected_status": int(entry.get("expected_status") or 200),
                "auth_header": entry.get("auth_header") or "",
            })
        return cleaned
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse AI output: {e}. Raw: {text[:200]}")


# ───────────────────── Endpoints ─────────────────────

@clara_custom_router.get("/apis")
async def list_apis(
    main_site_id: str,
    current_user: dict = Depends(require_system_admin),
):
    """List all registered APIs for a main site."""
    cursor = db.clara_custom_apis.find({"main_site_id": main_site_id}, {"_id": 0}).sort("created_at", -1)
    apis = []
    async for a in cursor:
        apis.append(a)
    return apis


@clara_custom_router.post("/apis")
async def create_api(
    data: dict,
    current_user: dict = Depends(require_system_admin),
):
    """Register a new API entry."""
    main_site_id = data.get("main_site_id")
    if not main_site_id:
        raise HTTPException(status_code=400, detail="main_site_id is required")
    if not data.get("base_url"):
        raise HTTPException(status_code=400, detail="base_url is required")

    api = {
        "id": str(uuid.uuid4()),
        "main_site_id": main_site_id,
        "name": data.get("name") or data.get("base_url"),
        "base_url": data["base_url"].rstrip("/"),
        "method": (data.get("method") or "GET").upper(),
        "health_check_path": data.get("health_check_path") or "/",
        "expected_status": int(data.get("expected_status") or 200),
        "expected_schema": data.get("expected_schema") or None,
        "auth_header": data.get("auth_header") or "",
        "extra_headers": data.get("extra_headers") or [],
        "tags": data.get("tags") or [],
        "created_at": _now_iso(),
        "created_by": current_user.get("id"),
        "last_health_check": None,
    }
    await db.clara_custom_apis.insert_one(dict(api))
    return api


@clara_custom_router.put("/apis/{api_id}")
async def update_api(
    api_id: str,
    data: dict,
    current_user: dict = Depends(require_system_admin),
):
    existing = await db.clara_custom_apis.find_one({"id": api_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="API not found")
    update = {k: v for k, v in data.items() if k in (
        "name", "base_url", "method", "health_check_path", "expected_status",
        "expected_schema", "auth_header", "extra_headers", "tags",
    )}
    if "base_url" in update:
        update["base_url"] = (update["base_url"] or "").rstrip("/")
    if "method" in update:
        update["method"] = (update["method"] or "GET").upper()
    if "expected_status" in update:
        try:
            update["expected_status"] = int(update["expected_status"])
        except (TypeError, ValueError):
            update["expected_status"] = 200
    update["updated_at"] = _now_iso()
    update["updated_by"] = current_user.get("id")
    await db.clara_custom_apis.update_one({"id": api_id}, {"$set": update})
    merged = {**existing, **update}
    return merged


@clara_custom_router.delete("/apis/{api_id}")
async def delete_api(
    api_id: str,
    current_user: dict = Depends(require_system_admin),
):
    res = await db.clara_custom_apis.delete_one({"id": api_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="API not found")
    await db.clara_custom_health_log.delete_many({"api_id": api_id})
    return {"status": "deleted", "id": api_id}


@clara_custom_router.post("/apis/{api_id}/check")
async def check_api(
    api_id: str,
    current_user: dict = Depends(require_system_admin),
):
    """Run health check for a single API and store the result."""
    api = await db.clara_custom_apis.find_one({"id": api_id}, {"_id": 0})
    if not api:
        raise HTTPException(status_code=404, detail="API not found")
    result = await run_health_check(api)
    await db.clara_custom_apis.update_one({"id": api_id}, {"$set": {"last_health_check": result}})
    await db.clara_custom_health_log.insert_one({
        "id": str(uuid.uuid4()),
        "api_id": api_id,
        "main_site_id": api.get("main_site_id"),
        **result,
    })
    return result


@clara_custom_router.post("/check-all")
async def check_all(
    main_site_id: str,
    current_user: dict = Depends(require_system_admin),
):
    apis = await db.clara_custom_apis.find({"main_site_id": main_site_id}, {"_id": 0}).to_list(500)
    results = await asyncio.gather(*[run_health_check(a) for a in apis], return_exceptions=False)
    for api, res in zip(apis, results):
        await db.clara_custom_apis.update_one({"id": api["id"]}, {"$set": {"last_health_check": res}})
        await db.clara_custom_health_log.insert_one({
            "id": str(uuid.uuid4()),
            "api_id": api["id"],
            "main_site_id": main_site_id,
            **res,
        })
    return {
        "checked": len(results),
        "connected": sum(1 for r in results if r.get("status") == "connected"),
        "results": [{"api_id": a["id"], "name": a["name"], **r} for a, r in zip(apis, results)],
    }


@clara_custom_router.post("/test")
async def test_one_off(
    data: dict,
    current_user: dict = Depends(require_system_admin),
):
    """One-off health check without saving — used by the wizard."""
    return await run_health_check(data, timeout_seconds=data.get("timeout") or 8.0)


@clara_custom_router.post("/import")
async def import_apis(
    data: dict,
    current_user: dict = Depends(require_system_admin),
):
    """Import APIs from prompt (AI), OpenAPI, or Postman.

    Body: { main_site_id, mode: 'prompt'|'openapi'|'postman', content: str|dict, save: bool? }
    """
    main_site_id = data.get("main_site_id")
    mode = (data.get("mode") or "").lower()
    content = data.get("content")
    save = bool(data.get("save", True))
    if not main_site_id:
        raise HTTPException(status_code=400, detail="main_site_id is required")
    if not content:
        raise HTTPException(status_code=400, detail="content is required")

    parsed: List[dict] = []
    if mode == "prompt":
        if not isinstance(content, str):
            raise HTTPException(status_code=400, detail="prompt content must be a string")
        parsed = await _parse_prompt_with_ai(content)
    elif mode == "openapi":
        payload = content
        if isinstance(payload, str):
            try:
                payload = json.loads(payload)
            except Exception:
                try:
                    import yaml
                    payload = yaml.safe_load(payload)
                except Exception as e:
                    raise HTTPException(status_code=400, detail=f"Invalid OpenAPI JSON/YAML: {e}")
        if not isinstance(payload, dict):
            raise HTTPException(status_code=400, detail="OpenAPI content must be an object")
        parsed = _parse_openapi_payload(payload, base_url_default=data.get("base_url_default", ""))
    elif mode == "postman":
        payload = content
        if isinstance(payload, str):
            try:
                payload = json.loads(payload)
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Invalid Postman JSON: {e}")
        if not isinstance(payload, dict):
            raise HTTPException(status_code=400, detail="Postman content must be an object")
        parsed = _parse_postman_payload(payload)
    else:
        raise HTTPException(status_code=400, detail="mode must be one of: prompt, openapi, postman")

    if not parsed:
        return {"created": 0, "preview": [], "message": "No APIs detected in input"}

    saved = []
    if save:
        now = _now_iso()
        for entry in parsed:
            doc = {
                "id": str(uuid.uuid4()),
                "main_site_id": main_site_id,
                **entry,
                "extra_headers": [],
                "expected_schema": None,
                "tags": [mode],
                "created_at": now,
                "created_by": current_user.get("id"),
                "last_health_check": None,
            }
            await db.clara_custom_apis.insert_one(dict(doc))
            saved.append(_strip_id(doc))

    return {"created": len(saved) if save else 0, "preview": parsed, "saved": saved}


@clara_custom_router.get("/health-log/{api_id}")
async def get_health_log(
    api_id: str,
    limit: int = 100,
    current_user: dict = Depends(require_system_admin),
):
    cursor = db.clara_custom_health_log.find({"api_id": api_id}, {"_id": 0}).sort("checked_at", -1).limit(limit)
    log = []
    async for entry in cursor:
        log.append(entry)
    return log
