"""Koodh VDC SSH Deployment Router.

Deploys via SSH reverse tunnel — VDC pulls source directly.
Replaces the old encrypted chunked upload method.
"""
import os
import subprocess
import logging
import asyncio
import time
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from services.auth import get_current_user

logger = logging.getLogger(__name__)

vdc_deploy_router = APIRouter(prefix="/vdc-deploy", tags=["VDC Deploy"])

VDC_BASE = "https://vdc.koodh.com"
VDC_API_KEY = "clara_tRlglPrl91Dvb9fNmK7WOMkjM4Mtn-6LusJmAcFf69w"
VDC_PUBLIC_KEY = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDMafSgoZYCmATRAyRsu14sXvU6+eGaHIliVPUqxT7Va clarahost-deploy@emergent"
TUNNEL_KEY_PATH = "/root/.ssh/vdc_tunnel_key"
TUNNEL_HOST = "docker.koodh.com"
TUNNEL_PORT = 2222
SSH_HOST_FOR_VDC = "172.17.0.1"

_deploy_status: dict[str, dict] = {}


def _require_system_admin(user: dict):
    if not user.get("is_system_admin"):
        raise HTTPException(403, "Only system admins can deploy")


def _status_key(user_id: str) -> str:
    return f"deploy_{user_id}"


def _init_status(user_id: str):
    _deploy_status[_status_key(user_id)] = {
        "phase": "starting",
        "progress": 0,
        "detail": "Initiating SSH deployment...",
        "error": "",
        "done": False,
        "deployment_id": "",
        "started_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "log": [],
        "stats": {},
    }


def _log(user_id: str, phase: str, progress: int, message: str, level: str = "info"):
    key = _status_key(user_id)
    status = _deploy_status.get(key)
    if not status:
        return
    now = datetime.now(timezone.utc).isoformat()
    status["log"].append({"ts": now, "phase": phase, "message": message, "level": level})
    status["phase"] = phase
    status["progress"] = progress
    status["detail"] = message
    status["updated_at"] = now


def _set_error(user_id: str, phase: str, progress: int, error: str):
    key = _status_key(user_id)
    status = _deploy_status.get(key)
    if status:
        now = datetime.now(timezone.utc).isoformat()
        status["error"] = error
        status["phase"] = phase
        status["progress"] = progress
        status["updated_at"] = now
        status["log"].append({"ts": now, "phase": phase, "message": error, "level": "error"})


def _set_done(user_id: str, deployment_id: str, message: str):
    key = _status_key(user_id)
    status = _deploy_status.get(key)
    if status:
        now = datetime.now(timezone.utc).isoformat()
        status.update(phase="complete", progress=100, detail=message,
                      done=True, deployment_id=deployment_id, updated_at=now)
        status["log"].append({"ts": now, "phase": "complete", "message": message, "level": "success"})


def _tunnel_alive() -> bool:
    """Check if the reverse SSH tunnel process is running."""
    try:
        result = subprocess.run(
            ["pgrep", "-f", f"ssh.*{TUNNEL_PORT}"],
            capture_output=True, timeout=5,
        )
        return result.returncode == 0
    except Exception:
        return False


def _sshd_running() -> bool:
    try:
        result = subprocess.run(["pgrep", "-x", "sshd"], capture_output=True, timeout=5)
        return result.returncode == 0
    except Exception:
        return False


def _has_tunnel_key() -> bool:
    return os.path.exists(TUNNEL_KEY_PATH) and os.path.getsize(TUNNEL_KEY_PATH) > 100


class TunnelKeyBody(BaseModel):
    private_key: str


@vdc_deploy_router.get("/status")
async def get_deploy_status(user: dict = Depends(get_current_user)):
    _require_system_admin(user)
    key = _status_key(user["id"])
    base = _deploy_status.get(key, {
        "phase": "idle", "progress": 0, "detail": "", "error": "",
        "done": False, "log": [], "stats": {},
    })
    base["tunnel_alive"] = _tunnel_alive()
    base["sshd_running"] = _sshd_running()
    base["has_tunnel_key"] = _has_tunnel_key()
    return base


@vdc_deploy_router.post("/set-key")
async def set_tunnel_key(body: TunnelKeyBody, user: dict = Depends(get_current_user)):
    _require_system_admin(user)
    key_content = body.private_key.strip()
    if "PRIVATE KEY" not in key_content:
        raise HTTPException(400, "Invalid private key format")
    os.makedirs("/root/.ssh", exist_ok=True)
    with open(TUNNEL_KEY_PATH, "w") as f:
        f.write(key_content + "\n")
    os.chmod(TUNNEL_KEY_PATH, 0o600)
    return {"status": "ok", "message": "Tunnel key saved"}


@vdc_deploy_router.post("/start")
async def start_deploy(user: dict = Depends(get_current_user)):
    _require_system_admin(user)
    user_id = user["id"]
    key = _status_key(user_id)

    current = _deploy_status.get(key, {})
    if current.get("phase") not in ("idle", "", None) and not current.get("done") and not current.get("error"):
        raise HTTPException(409, "A deployment is already in progress")

    if not _has_tunnel_key():
        raise HTTPException(400, "No tunnel key configured. Upload the VDC deploy private key first.")

    _init_status(user_id)
    asyncio.create_task(_run_ssh_deploy(user_id))
    return {"status": "started", "message": "SSH deployment started"}


async def _run_ssh_deploy(user_id: str):
    t_start = time.monotonic()

    try:
        # ── Step 1: Setup SSH ──
        _log(user_id, "ssh_setup", 5, "Preparing SSH environment...")

        os.makedirs("/run/sshd", exist_ok=True)
        os.makedirs("/root/.ssh", exist_ok=True)
        os.chmod("/root/.ssh", 0o700)

        # Add VDC public key to authorized_keys
        auth_keys_path = "/root/.ssh/authorized_keys"
        existing = ""
        if os.path.exists(auth_keys_path):
            with open(auth_keys_path, "r") as f:
                existing = f.read()
        if VDC_PUBLIC_KEY not in existing:
            with open(auth_keys_path, "a") as f:
                f.write(VDC_PUBLIC_KEY + "\n")
            os.chmod(auth_keys_path, 0o600)
            _log(user_id, "ssh_setup", 10, "VDC public key added to authorized_keys", "success")
        else:
            _log(user_id, "ssh_setup", 10, "VDC public key already present", "success")

        # Start sshd if not running
        if not _sshd_running():
            _log(user_id, "ssh_setup", 15, "Starting sshd...")
            proc = await asyncio.create_subprocess_exec(
                "/usr/sbin/sshd",
                stderr=asyncio.subprocess.PIPE,
            )
            await proc.wait()
            await asyncio.sleep(0.5)
            if _sshd_running():
                _log(user_id, "ssh_setup", 20, "sshd started successfully", "success")
            else:
                _set_error(user_id, "ssh_setup", 15, "Failed to start sshd")
                return
        else:
            _log(user_id, "ssh_setup", 20, "sshd already running", "success")

        # ── Step 2: Open reverse tunnel ──
        if _tunnel_alive():
            _log(user_id, "tunnel", 35, "Reverse tunnel already active", "success")
        else:
            _log(user_id, "tunnel", 25, f"Opening reverse tunnel to {TUNNEL_HOST}:{TUNNEL_PORT}...")

            proc = await asyncio.create_subprocess_exec(
                "ssh",
                "-i", TUNNEL_KEY_PATH,
                "-o", "StrictHostKeyChecking=no",
                "-o", "ServerAliveInterval=30",
                "-o", "ExitOnForwardFailure=yes",
                "-N",
                "-R", f"0.0.0.0:{TUNNEL_PORT}:localhost:22",
                f"root@{TUNNEL_HOST}",
                stderr=asyncio.subprocess.PIPE,
            )

            # Wait for tunnel to establish
            for attempt in range(10):
                await asyncio.sleep(1)
                if _tunnel_alive():
                    break

            if _tunnel_alive():
                _log(user_id, "tunnel", 40, f"Reverse tunnel active on {TUNNEL_HOST}:{TUNNEL_PORT}", "success")
            else:
                stderr_out = ""
                try:
                    stderr_out = (await asyncio.wait_for(proc.stderr.read(500), timeout=2)).decode()
                except Exception:
                    pass
                _set_error(user_id, "tunnel", 30, f"Failed to establish tunnel. {stderr_out}")
                return

        # ── Step 3: Get preview URL ──
        preview_url = ""
        try:
            with open("/app/frontend/.env", "r") as f:
                for line in f:
                    if line.startswith("REACT_APP_BACKEND_URL="):
                        preview_url = line.split("=", 1)[1].strip()
                        break
        except Exception:
            pass
        _log(user_id, "register", 50, f"Preview URL: {preview_url}")

        # ── Step 4: Register deployment with VDC ──
        _log(user_id, "register", 55, "Registering deployment with Koodh VDC...")

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{VDC_BASE}/api/clara/deploy/ssh-init",
                headers={"Content-Type": "application/json", "X-API-Key": VDC_API_KEY},
                json={
                    "ssh_host": SSH_HOST_FOR_VDC,
                    "ssh_port": TUNNEL_PORT,
                    "preview_url": preview_url,
                    "project_name": "Koodh Clara",
                },
            )

            if resp.status_code != 200:
                body = resp.text[:300]
                _set_error(user_id, "register", 55, f"VDC registration failed: HTTP {resp.status_code}")
                _log(user_id, "register", 55, f"Response: {body}", "debug")
                return

            data = resp.json()
            deployment_id = data.get("deployment_id", data.get("id", ""))
            status_msg = data.get("status", "registered")
            message = data.get("message", "Deployment registered")

        _log(user_id, "register", 75, f"Deployment registered: {deployment_id[:16]}...", "success")
        _log(user_id, "register", 80, f"Status: {status_msg}", "success")

        # ── Step 5: Waiting for VDC to pull ──
        _log(user_id, "waiting", 85, "Tunnel open — waiting for VDC to pull source code...")
        _log(user_id, "waiting", 90, "VDC will pull /app/frontend/ and /app/backend/ via SSH")
        _log(user_id, "waiting", 92, "Env variables will be imported into VDC Secrets")

        total_time = time.monotonic() - t_start
        _log(user_id, "waiting", 95, f"Setup completed in {total_time:.1f}s", "success")
        _log(user_id, "waiting", 97, "Awaiting admin approval at https://vdc.koodh.com")

        _set_done(user_id, deployment_id,
                  "Deployment registered — awaiting admin approval on vdc.koodh.com")

    except httpx.ConnectError:
        _set_error(user_id, "error", 0, "Cannot reach Koodh VDC.")
    except httpx.ReadError:
        _set_error(user_id, "error", 0, "Connection to Koodh VDC interrupted.")
    except httpx.TimeoutException:
        _set_error(user_id, "error", 0, "Connection to Koodh VDC timed out.")
    except Exception as e:
        logger.exception("VDC SSH deploy error")
        _set_error(user_id, "error", 0, str(e) or "Unexpected error during deployment.")
