"""Clara Flows runner.

Pure-Python engine that resolves ``{{ context.path }}`` templating, walks
through a flow's ordered steps and executes the configured action for each
step. Returns a structured run report that the router can persist into
``db.clara_flow_runs`` for the executions tab.

Supported step types (MVP-1):

* ``email``          — Send an email via the existing ``notification_config``
                        SMTP credentials.
* ``http``           — Generic HTTP request (GET/POST/PUT/PATCH/DELETE).
* ``in_app_notify``  — Insert an in-app notification document.
* ``ai_llm``         — Emergent Universal Key (Claude / GPT / Gemini text).
* ``slack``          — Slack incoming-webhook payload.
* ``telegram``       — Telegram bot ``sendMessage`` API.

Each step receives the **merged context** built from the trigger payload
and every previously executed step's output, accessible via the dotted
path syntax ``{{ trigger.title }}``, ``{{ steps.step_1.body }}`` etc.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx

from database import db
from services.email_service import send_email_with_config

logger = logging.getLogger(__name__)


_TEMPLATE_RE = re.compile(r"\{\{\s*([a-zA-Z_][\w.\-]*)\s*\}\}")


def _resolve_path(ctx: Dict[str, Any], path: str) -> Any:
    """Walk a dotted path through nested dicts / lists. Returns "" when any
    segment is missing so a templated string can never raise."""
    cur: Any = ctx
    for seg in path.split("."):
        if isinstance(cur, dict):
            cur = cur.get(seg)
        elif isinstance(cur, list):
            try:
                cur = cur[int(seg)]
            except (ValueError, IndexError):
                return ""
        else:
            return ""
        if cur is None:
            return ""
    return cur


def render_template(value: Any, ctx: Dict[str, Any]) -> Any:
    """Recursively substitute ``{{ path.to.field }}`` in strings inside
    ``value``. Lists / dicts are walked. Non-string scalars pass through."""
    if isinstance(value, str):
        def _sub(match: re.Match) -> str:
            resolved = _resolve_path(ctx, match.group(1))
            if isinstance(resolved, (dict, list)):
                return json.dumps(resolved, ensure_ascii=False, default=str)
            return "" if resolved is None else str(resolved)
        return _TEMPLATE_RE.sub(_sub, value)
    if isinstance(value, list):
        return [render_template(v, ctx) for v in value]
    if isinstance(value, dict):
        return {k: render_template(v, ctx) for k, v in value.items()}
    return value


# ─── Step handlers ─────────────────────────────────────────────────────────

async def _step_email(cfg: Dict[str, Any]) -> Dict[str, Any]:
    smtp = await db.notification_config.find_one({"type": "smtp"}, {"_id": 0})
    if not smtp:
        raise RuntimeError("No SMTP config — set one up in Notifications first.")
    to = (cfg.get("to") or "").strip()
    if not to:
        raise RuntimeError("Email step requires a `to` address.")
    subject = cfg.get("subject") or "(no subject)"
    body = cfg.get("body") or ""
    if cfg.get("is_html", True):
        html = body
    else:
        html = f"<pre style='font-family:inherit;white-space:pre-wrap'>{body}</pre>"
    ok = await send_email_with_config(smtp, to, subject, html)
    if not ok:
        raise RuntimeError("SMTP send failed — see backend logs.")
    return {"sent": True, "to": to, "subject": subject}


async def _step_http(cfg: Dict[str, Any]) -> Dict[str, Any]:
    method = (cfg.get("method") or "GET").upper()
    url = (cfg.get("url") or "").strip()
    if not url:
        raise RuntimeError("HTTP step requires a `url`.")
    headers = cfg.get("headers") or {}
    body = cfg.get("body")
    json_body = None
    raw_body = None
    if body is not None:
        if isinstance(body, (dict, list)):
            json_body = body
        else:
            # If the user pasted JSON as text, parse it; otherwise send raw.
            try:
                json_body = json.loads(body)
            except (ValueError, TypeError):
                raw_body = body
    async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
        resp = await client.request(
            method, url, headers=headers, json=json_body, content=raw_body
        )
    out: Dict[str, Any] = {
        "status_code": resp.status_code,
        "ok": resp.is_success,
    }
    # Try to parse JSON, else fall back to text (truncated).
    try:
        out["json"] = resp.json()
    except ValueError:
        out["text"] = (resp.text or "")[:5000]
    if not resp.is_success:
        raise RuntimeError(f"HTTP {resp.status_code}: {out.get('text') or out.get('json')}")
    return out


async def _step_in_app_notify(cfg: Dict[str, Any], main_site_id: str) -> Dict[str, Any]:
    title = (cfg.get("title") or "").strip()
    message = (cfg.get("message") or "").strip()
    if not title and not message:
        raise RuntimeError("Notification step requires a title or message.")
    audience_roles = cfg.get("audience_roles") or ["admin"]
    severity = (cfg.get("severity") or "info").lower()
    if severity not in {"info", "warning", "error", "success"}:
        severity = "info"

    # Fan out to every matching user in the main site.
    query = {"role": {"$in": audience_roles}}
    if main_site_id:
        query["main_site_id"] = main_site_id
    user_ids = [u["id"] async for u in db.users.find(query, {"_id": 0, "id": 1})]
    now = datetime.now(timezone.utc).isoformat()
    docs = [
        {
            "id": str(uuid.uuid4()),
            "user_id": uid,
            "main_site_id": main_site_id,
            "title": title,
            "message": message,
            "severity": severity,
            "source": "clara_flows",
            "read": False,
            "created_at": now,
        }
        for uid in user_ids
    ]
    if docs:
        await db.notifications.insert_many(docs)
    return {"delivered": len(docs), "user_ids": user_ids}


async def _step_ai_llm(cfg: Dict[str, Any]) -> Dict[str, Any]:
    import os
    api_key = os.environ.get("EMERGENT_LLM_KEY") or ""
    if not api_key:
        raise RuntimeError("EMERGENT_LLM_KEY env var missing.")
    provider = (cfg.get("provider") or "anthropic").lower()
    model = (cfg.get("model") or "claude-sonnet-4-5-20251022").strip()
    prompt = (cfg.get("prompt") or "").strip()
    if not prompt:
        raise RuntimeError("AI step requires a `prompt`.")
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
    except Exception as e:
        raise RuntimeError(
            "emergentintegrations not installed — `pip install emergentintegrations`."
        ) from e
    chat = (
        LlmChat(api_key=api_key, session_id=f"clara-flows-{uuid.uuid4()}", system_message="You are Clara Flows.")
        .with_model(provider, model)
    )
    resp = await chat.send_message(UserMessage(text=prompt))
    return {"provider": provider, "model": model, "text": str(resp)[:8000]}


async def _step_slack(cfg: Dict[str, Any]) -> Dict[str, Any]:
    url = (cfg.get("webhook_url") or "").strip()
    if not url:
        raise RuntimeError("Slack step requires a `webhook_url`.")
    text = cfg.get("text") or ""
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(url, json={"text": text})
    if not resp.is_success:
        raise RuntimeError(f"Slack webhook returned HTTP {resp.status_code}: {resp.text[:200]}")
    return {"ok": True}


async def _step_telegram(cfg: Dict[str, Any]) -> Dict[str, Any]:
    token = (cfg.get("bot_token") or "").strip()
    chat_id = (cfg.get("chat_id") or "").strip()
    text = cfg.get("text") or ""
    if not token or not chat_id:
        raise RuntimeError("Telegram step requires `bot_token` and `chat_id`.")
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={"chat_id": chat_id, "text": text, "parse_mode": cfg.get("parse_mode", "HTML")},
        )
    body = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
    if not resp.is_success or not body.get("ok"):
        raise RuntimeError(f"Telegram error: {body}")
    return {"message_id": body.get("result", {}).get("message_id")}


STEP_HANDLERS = {
    "email": _step_email,
    "http": _step_http,
    "in_app_notify": _step_in_app_notify,
    "ai_llm": _step_ai_llm,
    "slack": _step_slack,
    "telegram": _step_telegram,
}


# ─── Public API ────────────────────────────────────────────────────────────

async def execute_flow(flow: dict, trigger_payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Run every enabled step in ``flow`` against ``trigger_payload``.

    Returns a run report dict ready to persist into ``db.clara_flow_runs``:

    ```
    {
        "id": uuid,
        "flow_id": ...,
        "main_site_id": ...,
        "status": "success" | "error",
        "started_at": iso,
        "finished_at": iso,
        "trigger_payload": {...},
        "steps": [
            {"id": step_id, "type": "email", "name": "...",
             "status": "success" | "error" | "skipped",
             "output": {...} | None, "error": str | None,
             "duration_ms": int},
            ...
        ],
        "error": None | str,
    }
    ```
    """
    main_site_id = flow.get("main_site_id") or ""
    trigger_payload = trigger_payload or {}
    started_at = datetime.now(timezone.utc)
    ctx: Dict[str, Any] = {"trigger": trigger_payload, "steps": {}}
    step_results: List[Dict[str, Any]] = []
    overall_status = "success"
    overall_error: Optional[str] = None

    for idx, step in enumerate(flow.get("steps") or []):
        step_id = step.get("id") or f"step_{idx + 1}"
        step_label = f"step_{idx + 1}"
        step_type = step.get("type")
        step_name = step.get("name") or step_type or step_label
        step_started = datetime.now(timezone.utc)

        if step.get("enabled") is False:
            step_results.append({
                "id": step_id, "label": step_label, "type": step_type, "name": step_name,
                "status": "skipped", "output": None, "error": None,
                "duration_ms": 0,
            })
            continue

        handler = STEP_HANDLERS.get(step_type)
        if not handler:
            step_results.append({
                "id": step_id, "label": step_label, "type": step_type, "name": step_name,
                "status": "error", "output": None,
                "error": f"Unknown step type '{step_type}'",
                "duration_ms": 0,
            })
            overall_status = "error"
            overall_error = f"Unknown step type '{step_type}'"
            break

        rendered_cfg = render_template(step.get("config") or {}, ctx)
        try:
            if step_type == "in_app_notify":
                output = await handler(rendered_cfg, main_site_id)
            else:
                output = await handler(rendered_cfg)
            step_results.append({
                "id": step_id, "label": step_label, "type": step_type, "name": step_name,
                "status": "success", "output": output, "error": None,
                "duration_ms": int((datetime.now(timezone.utc) - step_started).total_seconds() * 1000),
            })
            ctx["steps"][step_label] = output
        except Exception as e:
            logger.exception(f"Clara Flow step {step_label} ({step_type}) failed: {e}")
            step_results.append({
                "id": step_id, "label": step_label, "type": step_type, "name": step_name,
                "status": "error", "output": None, "error": str(e),
                "duration_ms": int((datetime.now(timezone.utc) - step_started).total_seconds() * 1000),
            })
            overall_status = "error"
            overall_error = f"{step_label} ({step_type}): {e}"
            if step.get("stop_on_error", True):
                break

    finished_at = datetime.now(timezone.utc)
    return {
        "id": str(uuid.uuid4()),
        "flow_id": flow.get("id"),
        "main_site_id": main_site_id,
        "status": overall_status,
        "started_at": started_at.isoformat(),
        "finished_at": finished_at.isoformat(),
        "duration_ms": int((finished_at - started_at).total_seconds() * 1000),
        "trigger_payload": trigger_payload,
        "trigger_type": (flow.get("trigger") or {}).get("type"),
        "steps": step_results,
        "error": overall_error,
    }


async def execute_flow_and_persist(flow: dict, trigger_payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Convenience: run the flow, persist the run report, update flow stats."""
    report = await execute_flow(flow, trigger_payload)
    try:
        await db.clara_flow_runs.insert_one({**report})
    except Exception as e:
        logger.warning(f"Failed to persist Clara Flow run: {e}")
    try:
        await db.clara_flows.update_one(
            {"id": flow["id"]},
            {"$set": {
                "last_run_at": report["finished_at"],
                "last_run_status": report["status"],
                "last_run_error": report["error"],
            }, "$inc": {"run_count": 1}},
        )
    except Exception as e:
        logger.warning(f"Failed to update Clara Flow stats: {e}")
    # Strip ObjectId leftover from insert_one.
    report.pop("_id", None)
    return report


# Lightweight event bus: routers call ``emit_event("article.published", payload)``
# from anywhere in the codebase; we look up every matching flow and run it.

async def emit_event(event_name: str, payload: Dict[str, Any], main_site_id: Optional[str] = None) -> int:
    """Fire every flow whose trigger.type='event' matches ``event_name``.

    Returns the number of flows that were dispatched (run in the background).
    """
    query: Dict[str, Any] = {
        "enabled": True,
        "trigger.type": "event",
        "trigger.config.event_name": event_name,
    }
    if main_site_id:
        query["main_site_id"] = main_site_id
    flows = await db.clara_flows.find(query, {"_id": 0}).to_list(50)
    for flow in flows:
        asyncio.create_task(execute_flow_and_persist(flow, payload))
    return len(flows)
