"""Koodh VDC Deployment Router.

Handles encrypted deployment of source code and MongoDB database
to Koodh VDC (https://vdc.koodh.com).
"""
import os
import io
import tarfile
import base64
import tempfile
import logging
import asyncio
from pathlib import Path
from datetime import datetime, timezone

import httpx
from bson import json_util
from cryptography.hazmat.primitives.asymmetric import padding as asym_padding
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from database import db
from services.auth import get_current_user

logger = logging.getLogger(__name__)

vdc_deploy_router = APIRouter(prefix="/vdc-deploy", tags=["VDC Deploy"])

VDC_BASE = "https://vdc.koodh.com"
VDC_API_KEY = "clara_tRlglPrl91Dvb9fNmK7WOMkjM4Mtn-6LusJmAcFf69w"
CHUNK_SIZE = 4 * 1024 * 1024  # 4 MB

PROJECT_ROOT = Path(__file__).parent.parent  # /app

EXCLUDE_DIRS = {
    "node_modules", ".git", "__pycache__", ".venv", "venv",
    ".emergent", ".next", "dist", "build", ".cache",
}
EXCLUDE_EXTENSIONS = {".pyc", ".pyo", ".log"}


# ── In-memory deploy status per user ──
_deploy_status: dict[str, dict] = {}


class DeployResponse(BaseModel):
    status: str
    message: str
    deployment_id: str | None = None


def _require_system_admin(user: dict):
    if not user.get("is_system_admin"):
        raise HTTPException(403, "Only system admins can deploy")


def _status_key(user_id: str) -> str:
    return f"deploy_{user_id}"


def _set_status(user_id: str, phase: str, progress: int = 0, detail: str = "", error: str = "", done: bool = False, deployment_id: str = ""):
    _deploy_status[_status_key(user_id)] = {
        "phase": phase,
        "progress": progress,
        "detail": detail,
        "error": error,
        "done": done,
        "deployment_id": deployment_id,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }


@vdc_deploy_router.get("/status")
async def get_deploy_status(user: dict = Depends(get_current_user)):
    _require_system_admin(user)
    key = _status_key(user["id"])
    return _deploy_status.get(key, {"phase": "idle", "progress": 0, "detail": "", "error": "", "done": False})


@vdc_deploy_router.post("/start")
async def start_deploy(user: dict = Depends(get_current_user)):
    _require_system_admin(user)
    user_id = user["id"]
    key = _status_key(user_id)

    current = _deploy_status.get(key, {})
    if current.get("phase") not in ("idle", "", None) and not current.get("done") and not current.get("error"):
        raise HTTPException(409, "A deployment is already in progress")

    _set_status(user_id, "starting", 0, "Initiating deployment...")
    asyncio.create_task(_run_deploy(user_id))
    return {"status": "started", "message": "Deployment started in background"}


async def _run_deploy(user_id: str):
    """Full deploy pipeline running in background."""
    headers = {"X-API-Key": VDC_API_KEY, "Content-Type": "application/json"}

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            # ── Step 1: Handshake ──
            _set_status(user_id, "handshake", 5, "Connecting to Koodh VDC...")
            challenge = base64.b64encode(os.urandom(32)).decode()
            hs_resp = await client.post(f"{VDC_BASE}/api/clara/handshake", headers=headers, json={
                "client_name": "Koodh Clara",
                "client_version": "1.0.0",
                "challenge": challenge,
            })
            if hs_resp.status_code != 200:
                _set_status(user_id, "handshake", 5, error=f"Handshake failed: {hs_resp.status_code} — {hs_resp.text}")
                return
            hs_data = hs_resp.json()
            if hs_data.get("status") != "online":
                _set_status(user_id, "handshake", 5, error="Koodh VDC is offline")
                return

            # ── Step 2: Get public key ──
            _set_status(user_id, "keys", 10, "Fetching encryption keys...")
            pk_resp = await client.get(f"{VDC_BASE}/api/clara/public-key", headers=headers)
            if pk_resp.status_code != 200:
                _set_status(user_id, "keys", 10, error=f"Failed to get public key: {pk_resp.status_code}")
                return
            pem_key = pk_resp.json()["public_key"]
            rsa_public = serialization.load_pem_public_key(pem_key.encode())

            # ── Step 3: Prepare data ──
            _set_status(user_id, "preparing", 15, "Creating source archive...")
            source_bytes = await asyncio.to_thread(_create_source_archive)

            _set_status(user_id, "preparing", 25, "Dumping database...")
            db_bytes = await _dump_database()

            # Generate AES key
            aes_key = AESGCM.generate_key(bit_length=256)  # 32 bytes
            encrypted_aes_key = rsa_public.encrypt(
                aes_key,
                asym_padding.OAEP(
                    mgf=asym_padding.MGF1(algorithm=hashes.SHA256()),
                    algorithm=hashes.SHA256(),
                    label=None,
                ),
            )
            encrypted_aes_key_b64 = base64.b64encode(encrypted_aes_key).decode()

            # Split into chunks
            _set_status(user_id, "encrypting", 35, "Encrypting data...")
            source_chunks = _split_bytes(source_bytes, CHUNK_SIZE)
            db_chunks = _split_bytes(db_bytes, CHUNK_SIZE)
            total_chunks = len(source_chunks) + len(db_chunks)
            total_size = len(source_bytes) + len(db_bytes)

            # ── Step 4: Init session ──
            _set_status(user_id, "init_session", 40, "Starting upload session...")
            init_resp = await client.post(f"{VDC_BASE}/api/clara/deploy/init", headers=headers, json={
                "project_name": "Koodh Clara",
                "encrypted_aes_key": encrypted_aes_key_b64,
                "total_chunks": total_chunks,
                "total_size": total_size,
                "has_database": True,
                "has_source": True,
                "metadata": {"branch": "main", "timestamp": datetime.now(timezone.utc).isoformat()},
            })
            if init_resp.status_code != 200:
                _set_status(user_id, "init_session", 40, error=f"Init failed: {init_resp.status_code} — {init_resp.text}")
                return
            session_id = init_resp.json()["session_id"]

            # ── Step 5: Upload chunks ──
            aesgcm = AESGCM(aes_key)
            uploaded = 0

            for i, chunk in enumerate(source_chunks):
                pct = 45 + int((uploaded / total_chunks) * 50)
                _set_status(user_id, "uploading", pct, f"Uploading source chunk {i + 1}/{len(source_chunks)}...")
                enc_data = _encrypt_chunk(aesgcm, chunk)
                resp = await client.post(f"{VDC_BASE}/api/clara/deploy/chunk", headers=headers, json={
                    "session_id": session_id,
                    "chunk_index": uploaded,
                    "encrypted_data": enc_data,
                    "chunk_type": "source",
                })
                if resp.status_code != 200:
                    _set_status(user_id, "uploading", pct, error=f"Source chunk {i + 1} failed: {resp.status_code}")
                    return
                uploaded += 1

            for i, chunk in enumerate(db_chunks):
                pct = 45 + int((uploaded / total_chunks) * 50)
                _set_status(user_id, "uploading", pct, f"Uploading database chunk {i + 1}/{len(db_chunks)}...")
                enc_data = _encrypt_chunk(aesgcm, chunk)
                resp = await client.post(f"{VDC_BASE}/api/clara/deploy/chunk", headers=headers, json={
                    "session_id": session_id,
                    "chunk_index": uploaded,
                    "encrypted_data": enc_data,
                    "chunk_type": "database",
                })
                if resp.status_code != 200:
                    _set_status(user_id, "uploading", pct, error=f"Database chunk {i + 1} failed: {resp.status_code}")
                    return
                uploaded += 1

            # ── Step 6: Finalize ──
            _set_status(user_id, "finalizing", 95, "Finalizing deployment...")
            fin_resp = await client.post(f"{VDC_BASE}/api/clara/deploy/finalize", headers=headers, json={
                "session_id": session_id,
            })
            if fin_resp.status_code != 200:
                _set_status(user_id, "finalizing", 95, error=f"Finalize failed: {fin_resp.status_code}")
                return

            fin_data = fin_resp.json()
            # Wipe AES key from memory
            aes_key = None

            _set_status(
                user_id, "complete", 100,
                detail=fin_data.get("message", "Deployment complete"),
                done=True,
                deployment_id=fin_data.get("deployment_id", ""),
            )

    except httpx.ConnectError:
        _set_status(user_id, "error", 0, error="Cannot reach Koodh VDC. Check your connection.")
    except httpx.ReadError:
        _set_status(user_id, "error", 0, error="Connection to Koodh VDC was interrupted. The server may be temporarily unavailable.")
    except httpx.TimeoutException:
        _set_status(user_id, "error", 0, error="Connection to Koodh VDC timed out. Try again later.")
    except Exception as e:
        logger.exception("VDC deploy error")
        _set_status(user_id, "error", 0, error=str(e) or "An unexpected error occurred during deployment.")


def _create_source_archive() -> bytes:
    """Create a tar.gz of the project directory, excluding unnecessary files."""
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        for root, dirs, files in os.walk(str(PROJECT_ROOT)):
            dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
            for f in files:
                if any(f.endswith(ext) for ext in EXCLUDE_EXTENSIONS):
                    continue
                fpath = os.path.join(root, f)
                arcname = os.path.relpath(fpath, str(PROJECT_ROOT))
                try:
                    tar.add(fpath, arcname=arcname)
                except (PermissionError, OSError):
                    continue
    buf.seek(0)
    return buf.read()


async def _dump_database() -> bytes:
    """Dump all MongoDB collections as JSON."""
    collections = await db.list_collection_names()
    dump = {}
    for coll_name in collections:
        docs = []
        async for doc in db[coll_name].find():
            docs.append(json_util.dumps(doc))
        dump[coll_name] = docs
    return json_util.dumps(dump).encode("utf-8")


def _split_bytes(data: bytes, chunk_size: int) -> list[bytes]:
    return [data[i:i + chunk_size] for i in range(0, len(data), chunk_size)]


def _encrypt_chunk(aesgcm: AESGCM, chunk: bytes) -> str:
    nonce = os.urandom(12)
    ciphertext = aesgcm.encrypt(nonce, chunk, None)
    return base64.b64encode(nonce + ciphertext).decode()
