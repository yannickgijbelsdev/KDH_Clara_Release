"""Clara Flows — admin REST API.

Endpoints (all prefixed ``/api/clara-flows``):

* ``GET    /``                — list flows for the current main site
* ``POST   /``                — create flow
* ``GET    /{id}``            — fetch one flow
* ``PUT    /{id}``            — update flow
* ``DELETE /{id}``            — delete flow
* ``POST   /{id}/execute``    — run the flow now (manual trigger)
* ``GET    /{id}/runs``       — execution history
* ``POST   /webhooks/{token}`` — public webhook trigger (no auth)
* ``GET    /catalog/triggers`` — supported trigger types
* ``GET    /catalog/actions``  — supported action types
"""
from __future__ import annotations

import secrets
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

from database import db
from services.auth import get_current_user, require_admin
from services.clara_flows_runner import execute_flow_and_persist
from services.main_site_context import get_main_site_id_from_header

clara_flows_router = APIRouter(prefix="/api/clara-flows", tags=["clara-flows"])


# ─── Models ───

class FlowStep(BaseModel):
    id: Optional[str] = None
    type: str  # email | http | in_app_notify | ai_llm | slack | telegram
    name: str = ""
    enabled: bool = True
    stop_on_error: bool = True
    config: Dict[str, Any] = Field(default_factory=dict)


class FlowTrigger(BaseModel):
    type: str = "manual"  # event | schedule | webhook | manual
    config: Dict[str, Any] = Field(default_factory=dict)


class FlowCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    description: str = ""
    enabled: bool = True
    trigger: FlowTrigger = Field(default_factory=FlowTrigger)
    steps: List[FlowStep] = Field(default_factory=list)


class FlowUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    enabled: Optional[bool] = None
    trigger: Optional[FlowTrigger] = None
    steps: Optional[List[FlowStep]] = None


# ─── Catalog of triggers/actions (used by the UI to render dropdowns) ───

TRIGGER_CATALOG = [
    {"type": "manual", "label": "Manual run", "description": "Execute by clicking the 'Run now' button or via API.", "config_schema": []},
    {"type": "event", "label": "Database event", "description": "Fires when something happens in Clara.", "config_schema": [
        {"key": "event_name", "label": "Event name", "type": "select", "required": True, "options": [
            "article.created", "article.published", "show.created", "show.published",
            "user.registered", "task.created", "task.completed", "license.expiring",
            "stream.offline", "rds.custom_stream_active",
        ]},
    ]},
    {"type": "schedule", "label": "Schedule (cron)", "description": "Recurring at a fixed cron time (Brussels TZ).", "config_schema": [
        {"key": "cron", "label": "Cron expression", "type": "text", "required": True, "placeholder": "0 9 * * 1"},
    ]},
    {"type": "webhook", "label": "Webhook", "description": "Public URL — external systems POST JSON to start this flow.", "config_schema": []},
]

ACTION_CATALOG = [
    {"type": "email", "label": "Send email", "icon": "Mail", "config_schema": [
        {"key": "to", "label": "Recipient", "type": "text", "required": True, "placeholder": "alice@example.com"},
        {"key": "subject", "label": "Subject", "type": "text", "required": True, "templating": True},
        {"key": "body", "label": "Body (HTML)", "type": "textarea", "required": True, "templating": True},
        {"key": "is_html", "label": "HTML body", "type": "checkbox", "default": True},
    ]},
    {"type": "http", "label": "HTTP request", "icon": "Globe", "config_schema": [
        {"key": "method", "label": "Method", "type": "select", "options": ["GET", "POST", "PUT", "PATCH", "DELETE"], "default": "POST"},
        {"key": "url", "label": "URL", "type": "text", "required": True, "templating": True},
        {"key": "headers", "label": "Headers (JSON)", "type": "json", "default": {}},
        {"key": "body", "label": "Body (JSON or raw)", "type": "textarea", "templating": True},
    ]},
    {"type": "in_app_notify", "label": "In-app notification", "icon": "Bell", "config_schema": [
        {"key": "title", "label": "Title", "type": "text", "required": True, "templating": True},
        {"key": "message", "label": "Message", "type": "textarea", "templating": True},
        {"key": "severity", "label": "Severity", "type": "select", "options": ["info", "warning", "error", "success"], "default": "info"},
        {"key": "audience_roles", "label": "Audience roles", "type": "multi-select", "options": ["admin", "editor", "presenter", "viewer"], "default": ["admin"]},
    ]},
    {"type": "ai_llm", "label": "AI / LLM call", "icon": "Sparkles", "config_schema": [
        {"key": "provider", "label": "Provider", "type": "select", "options": ["anthropic", "openai", "gemini"], "default": "anthropic"},
        {"key": "model", "label": "Model", "type": "text", "default": "claude-sonnet-4-5-20251022"},
        {"key": "prompt", "label": "Prompt", "type": "textarea", "required": True, "templating": True},
    ]},
    {"type": "slack", "label": "Slack message", "icon": "MessageSquare", "config_schema": [
        {"key": "webhook_url", "label": "Slack webhook URL", "type": "text", "required": True},
        {"key": "text", "label": "Text", "type": "textarea", "required": True, "templating": True},
    ]},
    {"type": "telegram", "label": "Telegram message", "icon": "Send", "config_schema": [
        {"key": "bot_token", "label": "Bot token", "type": "text", "required": True},
        {"key": "chat_id", "label": "Chat ID", "type": "text", "required": True},
        {"key": "text", "label": "Text", "type": "textarea", "required": True, "templating": True},
        {"key": "parse_mode", "label": "Parse mode", "type": "select", "options": ["HTML", "Markdown", ""], "default": "HTML"},
    ]},
]


# ─── Helpers ───

async def _scope(request: Request) -> str:
    msid = await get_main_site_id_from_header(request)
    if not msid:
        raise HTTPException(status_code=400, detail="X-Main-Site-ID header required")
    return msid


def _normalize_steps(steps: List[FlowStep] | List[dict]) -> List[dict]:
    out = []
    for s in steps or []:
        d = s.model_dump() if hasattr(s, "model_dump") else dict(s)
        d["id"] = d.get("id") or str(uuid.uuid4())
        d["config"] = d.get("config") or {}
        out.append(d)
    return out


# ─── Catalog endpoints (no scoping — used by the UI dropdowns) ───

@clara_flows_router.get("/catalog/triggers")
async def catalog_triggers(current_user: dict = Depends(get_current_user)):
    return {"triggers": TRIGGER_CATALOG}


@clara_flows_router.get("/catalog/actions")
async def catalog_actions(current_user: dict = Depends(get_current_user)):
    return {"actions": ACTION_CATALOG}


# ─── CRUD ───

@clara_flows_router.get("")
async def list_flows(request: Request, current_user: dict = Depends(require_admin)):
    msid = await _scope(request)
    flows = await db.clara_flows.find(
        {"main_site_id": msid}, {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    return {"flows": flows, "count": len(flows)}


@clara_flows_router.post("")
async def create_flow(data: FlowCreate, request: Request, current_user: dict = Depends(require_admin)):
    msid = await _scope(request)
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "main_site_id": msid,
        "name": data.name.strip(),
        "description": data.description.strip(),
        "enabled": data.enabled,
        "trigger": data.trigger.model_dump(),
        "steps": _normalize_steps(data.steps),
        "webhook_token": secrets.token_urlsafe(24),
        "created_at": now,
        "updated_at": now,
        "created_by": current_user.get("id"),
        "last_run_at": None,
        "last_run_status": None,
        "last_run_error": None,
        "run_count": 0,
    }
    await db.clara_flows.insert_one(doc)
    doc.pop("_id", None)
    return doc


@clara_flows_router.get("/{flow_id}")
async def get_flow(flow_id: str, request: Request, current_user: dict = Depends(require_admin)):
    msid = await _scope(request)
    flow = await db.clara_flows.find_one({"id": flow_id, "main_site_id": msid}, {"_id": 0})
    if not flow:
        raise HTTPException(status_code=404, detail="Flow not found")
    return flow


@clara_flows_router.put("/{flow_id}")
async def update_flow(flow_id: str, data: FlowUpdate, request: Request, current_user: dict = Depends(require_admin)):
    msid = await _scope(request)
    flow = await db.clara_flows.find_one({"id": flow_id, "main_site_id": msid})
    if not flow:
        raise HTTPException(status_code=404, detail="Flow not found")
    update: Dict[str, Any] = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if data.name is not None:
        update["name"] = data.name.strip()
    if data.description is not None:
        update["description"] = data.description.strip()
    if data.enabled is not None:
        update["enabled"] = data.enabled
    if data.trigger is not None:
        update["trigger"] = data.trigger.model_dump()
    if data.steps is not None:
        update["steps"] = _normalize_steps(data.steps)
    await db.clara_flows.update_one({"id": flow_id, "main_site_id": msid}, {"$set": update})
    return await db.clara_flows.find_one({"id": flow_id, "main_site_id": msid}, {"_id": 0})


@clara_flows_router.delete("/{flow_id}")
async def delete_flow(flow_id: str, request: Request, current_user: dict = Depends(require_admin)):
    msid = await _scope(request)
    result = await db.clara_flows.delete_one({"id": flow_id, "main_site_id": msid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Flow not found")
    await db.clara_flow_runs.delete_many({"flow_id": flow_id, "main_site_id": msid})
    return {"deleted": True}


# ─── Execution + history ───

class ManualRunPayload(BaseModel):
    payload: Optional[Dict[str, Any]] = None


@clara_flows_router.post("/{flow_id}/execute")
async def execute_now(flow_id: str, body: ManualRunPayload, request: Request, current_user: dict = Depends(require_admin)):
    msid = await _scope(request)
    flow = await db.clara_flows.find_one({"id": flow_id, "main_site_id": msid}, {"_id": 0})
    if not flow:
        raise HTTPException(status_code=404, detail="Flow not found")
    if not flow.get("enabled"):
        raise HTTPException(status_code=400, detail="Flow is disabled — enable it before running.")
    return await execute_flow_and_persist(flow, body.payload or {})


@clara_flows_router.get("/{flow_id}/runs")
async def list_runs(flow_id: str, request: Request, limit: int = Query(default=50, ge=1, le=200), current_user: dict = Depends(require_admin)):
    msid = await _scope(request)
    runs = await db.clara_flow_runs.find(
        {"flow_id": flow_id, "main_site_id": msid}, {"_id": 0}
    ).sort("started_at", -1).to_list(limit)
    return {"runs": runs, "count": len(runs)}


# ─── Public webhook trigger (no auth, only `webhook_token` knowledge) ───

@clara_flows_router.post("/webhooks/{token}")
async def webhook_trigger(token: str, request: Request):
    flow = await db.clara_flows.find_one(
        {"webhook_token": token, "enabled": True, "trigger.type": "webhook"},
        {"_id": 0},
    )
    if not flow:
        raise HTTPException(status_code=404, detail="No active flow for this webhook")
    try:
        payload = await request.json()
    except Exception:
        payload = {}
    if not isinstance(payload, dict):
        payload = {"value": payload}
    report = await execute_flow_and_persist(flow, payload)
    return {
        "status": report["status"],
        "run_id": report["id"],
        "duration_ms": report["duration_ms"],
        "error": report["error"],
    }
