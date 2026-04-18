"""Koodh VDC Deployment Router.

Handles encrypted deployment of source code and MongoDB database
to Koodh VDC (https://vdc.koodh.com).
"""
import os
import io
import tarfile
import base64
import logging
import asyncio
import time
from pathlib import Path
from datetime import datetime, timezone

import httpx
from bson import json_util
from cryptography.hazmat.primitives.asymmetric import padding as asym_padding
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from fastapi import APIRouter, Depends, HTTPException

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

_deploy_status: dict[str, dict] = {}


def _require_system_admin(user: dict):
    if not user.get("is_system_admin"):
        raise HTTPException(403, "Only system admins can deploy")


def _status_key(user_id: str) -> str:
    return f"deploy_{user_id}"


def _fmt_size(b: int) -> str:
    if b < 1024:
        return f"{b} B"
    if b < 1024 * 1024:
        return f"{b / 1024:.1f} KB"
    return f"{b / (1024 * 1024):.1f} MB"


def _init_status(user_id: str):
    _deploy_status[_status_key(user_id)] = {
        "phase": "starting",
        "progress": 0,
        "detail": "Initiating deployment...",
        "error": "",
        "done": False,
        "deployment_id": "",
        "started_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "log": [],
        "stats": {},
    }


def _log(user_id: str, phase: str, progress: int, message: str, level: str = "info", **extra):
    key = _status_key(user_id)
    status = _deploy_status.get(key)
    if not status:
        return
    now = datetime.now(timezone.utc).isoformat()
    entry = {"ts": now, "phase": phase, "message": message, "level": level}
    entry.update(extra)
    status["log"].append(entry)
    status["phase"] = phase
    status["progress"] = progress
    status["detail"] = message
    status["updated_at"] = now


def _set_error(user_id: str, phase: str, progress: int, error: str):
    key = _status_key(user_id)
    status = _deploy_status.get(key)
    if status:
        status["error"] = error
        status["phase"] = phase
        status["progress"] = progress
        status["updated_at"] = datetime.now(timezone.utc).isoformat()
        status["log"].append({
            "ts": status["updated_at"], "phase": phase,
            "message": error, "level": "error",
        })


def _set_done(user_id: str, deployment_id: str, message: str):
    key = _status_key(user_id)
    status = _deploy_status.get(key)
    if status:
        now = datetime.now(timezone.utc).isoformat()
        status["phase"] = "complete"
        status["progress"] = 100
        status["detail"] = message
        status["done"] = True
        status["deployment_id"] = deployment_id
        status["updated_at"] = now
        status["log"].append({
            "ts": now, "phase": "complete",
            "message": message, "level": "success",
        })


def _update_stats(user_id: str, **kwargs):
    key = _status_key(user_id)
    status = _deploy_status.get(key)
    if status:
        status["stats"].update(kwargs)


@vdc_deploy_router.get("/status")
async def get_deploy_status(user: dict = Depends(get_current_user)):
    _require_system_admin(user)
    key = _status_key(user["id"])
    return _deploy_status.get(key, {
        "phase": "idle", "progress": 0, "detail": "", "error": "",
        "done": False, "log": [], "stats": {},
    })


@vdc_deploy_router.post("/start")
async def start_deploy(user: dict = Depends(get_current_user)):
    _require_system_admin(user)
    user_id = user["id"]
    key = _status_key(user_id)

    current = _deploy_status.get(key, {})
    if current.get("phase") not in ("idle", "", None) and not current.get("done") and not current.get("error"):
        raise HTTPException(409, "A deployment is already in progress")

    _init_status(user_id)
    asyncio.create_task(_run_deploy(user_id))
    return {"status": "started", "message": "Deployment started in background"}


async def _run_deploy(user_id: str):
    """Full deploy pipeline running in background."""
    headers = {"X-API-Key": VDC_API_KEY, "Content-Type": "application/json"}
    t_start = time.monotonic()

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            # ── Step 1: Handshake ──
            _log(user_id, "handshake", 5, "Connecting to Koodh VDC...")
            challenge = base64.b64encode(os.urandom(32)).decode()
            hs_resp = await client.post(f"{VDC_BASE}/api/clara/handshake", headers=headers, json={
                "client_name": "Koodh Clara",
                "client_version": "1.0.0",
                "challenge": challenge,
            })
            if hs_resp.status_code != 200:
                _set_error(user_id, "handshake", 5, f"Handshake failed: HTTP {hs_resp.status_code}")
                _log(user_id, "handshake", 5, f"Response: {hs_resp.text[:200]}", "debug")
                return
            hs_data = hs_resp.json()
            if hs_data.get("status") != "online":
                _set_error(user_id, "handshake", 5, "Koodh VDC is offline")
                return
            server_name = hs_data.get("server_name", "Unknown")
            capabilities = hs_data.get("capabilities", [])
            limits = hs_data.get("limits", {})
            _log(user_id, "handshake", 8, f"Connected to {server_name}", "success",
                 server=server_name, capabilities=capabilities)
            _update_stats(user_id, server_name=server_name,
                          max_chunk_mb=limits.get("max_chunk_size_mb"),
                          max_total_gb=limits.get("max_total_size_gb"))

            # ── Step 2: Get public key ──
            _log(user_id, "keys", 10, "Fetching RSA-4096 public key...")
            pk_resp = await client.get(f"{VDC_BASE}/api/clara/public-key", headers=headers)
            if pk_resp.status_code != 200:
                _set_error(user_id, "keys", 10, f"Failed to get public key: HTTP {pk_resp.status_code}")
                return
            pk_data = pk_resp.json()
            pem_key = pk_data["public_key"]
            algorithm = pk_data.get("algorithm", "RSA-OAEP-SHA256")
            rsa_public = serialization.load_pem_public_key(pem_key.encode())
            fingerprint = hs_data.get("rsa_key_fingerprint", "")[:16]
            _log(user_id, "keys", 12, f"Public key loaded ({algorithm}, fingerprint: {fingerprint}...)", "success")

            # ── Step 3: Prepare data ──
            _log(user_id, "preparing", 15, "Creating source archive (tar.gz)...")
            t_archive = time.monotonic()
            source_bytes = await asyncio.to_thread(_create_source_archive)
            archive_time = time.monotonic() - t_archive
            _log(user_id, "preparing", 20,
                 f"Source archive: {_fmt_size(len(source_bytes))} ({archive_time:.1f}s)", "success",
                 source_size=len(source_bytes))
            _update_stats(user_id, source_size=len(source_bytes), source_size_fmt=_fmt_size(len(source_bytes)))

            _log(user_id, "preparing", 22, "Dumping MongoDB database...")
            t_db = time.monotonic()
            db_bytes = await _dump_database()
            db_time = time.monotonic() - t_db
            collections_count = await db.list_collection_names()
            _log(user_id, "preparing", 28,
                 f"Database dump: {_fmt_size(len(db_bytes))} ({len(collections_count)} collections, {db_time:.1f}s)", "success",
                 db_size=len(db_bytes), collections=len(collections_count))
            _update_stats(user_id, db_size=len(db_bytes), db_size_fmt=_fmt_size(len(db_bytes)),
                          collections=len(collections_count))

            total_size = len(source_bytes) + len(db_bytes)
            _update_stats(user_id, total_size=total_size, total_size_fmt=_fmt_size(total_size))

            # Generate AES key
            _log(user_id, "encrypting", 30, "Generating AES-256 session key...")
            aes_key = AESGCM.generate_key(bit_length=256)
            encrypted_aes_key = rsa_public.encrypt(
                aes_key,
                asym_padding.OAEP(
                    mgf=asym_padding.MGF1(algorithm=hashes.SHA256()),
                    algorithm=hashes.SHA256(),
                    label=None,
                ),
            )
            encrypted_aes_key_b64 = base64.b64encode(encrypted_aes_key).decode()
            _log(user_id, "encrypting", 32, "AES key encrypted with RSA-4096 OAEP", "success")

            # Split into chunks
            source_chunks = _split_bytes(source_bytes, CHUNK_SIZE)
            db_chunks = _split_bytes(db_bytes, CHUNK_SIZE)
            total_chunks = len(source_chunks) + len(db_chunks)
            _log(user_id, "encrypting", 35,
                 f"Data split into {total_chunks} chunks ({len(source_chunks)} source + {len(db_chunks)} database)")
            _update_stats(user_id, total_chunks=total_chunks,
                          source_chunks=len(source_chunks), db_chunks=len(db_chunks))

            # ── Step 4: Init session ──
            _log(user_id, "init_session", 40, "Initializing upload session...")
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
                _set_error(user_id, "init_session", 40, f"Session init failed: HTTP {init_resp.status_code}")
                _log(user_id, "init_session", 40, f"Response: {init_resp.text[:200]}", "debug")
                return
            session_id = init_resp.json()["session_id"]
            _log(user_id, "init_session", 42, f"Session created: {session_id[:12]}...", "success",
                 session_id=session_id)
            _update_stats(user_id, session_id=session_id)

            # ── Step 5: Upload chunks ──
            aesgcm = AESGCM(aes_key)
            uploaded = 0
            bytes_uploaded = 0
            t_upload_start = time.monotonic()

            _log(user_id, "uploading", 45, f"Starting encrypted upload ({total_chunks} chunks)...")

            for i, chunk in enumerate(source_chunks):
                pct = 45 + int((uploaded / total_chunks) * 48)
                chunk_size = len(chunk)
                t_chunk = time.monotonic()
                enc_data = _encrypt_chunk(aesgcm, chunk)
                resp = await client.post(f"{VDC_BASE}/api/clara/deploy/chunk", headers=headers, json={
                    "session_id": session_id,
                    "chunk_index": uploaded,
                    "encrypted_data": enc_data,
                    "chunk_type": "source",
                })
                chunk_time = time.monotonic() - t_chunk
                if resp.status_code != 200:
                    _set_error(user_id, "uploading", pct, f"Source chunk {i + 1}/{len(source_chunks)} failed: HTTP {resp.status_code}")
                    return
                bytes_uploaded += chunk_size
                uploaded += 1
                speed = bytes_uploaded / (time.monotonic() - t_upload_start) if (time.monotonic() - t_upload_start) > 0 else 0
                _log(user_id, "uploading", pct,
                     f"Source {i + 1}/{len(source_chunks)} — {_fmt_size(chunk_size)} ({chunk_time:.1f}s, {_fmt_size(int(speed))}/s)")

            for i, chunk in enumerate(db_chunks):
                pct = 45 + int((uploaded / total_chunks) * 48)
                chunk_size = len(chunk)
                t_chunk = time.monotonic()
                enc_data = _encrypt_chunk(aesgcm, chunk)
                resp = await client.post(f"{VDC_BASE}/api/clara/deploy/chunk", headers=headers, json={
                    "session_id": session_id,
                    "chunk_index": uploaded,
                    "encrypted_data": enc_data,
                    "chunk_type": "database",
                })
                chunk_time = time.monotonic() - t_chunk
                if resp.status_code != 200:
                    _set_error(user_id, "uploading", pct, f"Database chunk {i + 1}/{len(db_chunks)} failed: HTTP {resp.status_code}")
                    return
                bytes_uploaded += chunk_size
                uploaded += 1
                speed = bytes_uploaded / (time.monotonic() - t_upload_start) if (time.monotonic() - t_upload_start) > 0 else 0
                _log(user_id, "uploading", pct,
                     f"Database {i + 1}/{len(db_chunks)} — {_fmt_size(chunk_size)} ({chunk_time:.1f}s, {_fmt_size(int(speed))}/s)")

            upload_time = time.monotonic() - t_upload_start
            _log(user_id, "uploading", 93,
                 f"Upload complete: {_fmt_size(bytes_uploaded)} in {upload_time:.1f}s ({_fmt_size(int(bytes_uploaded / upload_time))}/s)", "success")
            _update_stats(user_id, upload_time=f"{upload_time:.1f}s",
                          avg_speed=_fmt_size(int(bytes_uploaded / upload_time)) + "/s")

            # ── Step 6: Finalize ──
            _log(user_id, "finalizing", 95, "Finalizing deployment...")
            fin_resp = await client.post(f"{VDC_BASE}/api/clara/deploy/finalize", headers=headers, json={
                "session_id": session_id,
            })
            if fin_resp.status_code != 200:
                _set_error(user_id, "finalizing", 95, f"Finalize failed: HTTP {fin_resp.status_code}")
                return

            fin_data = fin_resp.json()
            aes_key = None  # Wipe from memory

            total_time = time.monotonic() - t_start
            _update_stats(user_id, total_time=f"{total_time:.1f}s")
            _set_done(user_id,
                      fin_data.get("deployment_id", ""),
                      fin_data.get("message", "Deployment complete"))
            _log(user_id, "complete", 100,
                 f"Total deployment time: {total_time:.1f}s", "success")

    except httpx.ConnectError:
        _set_error(user_id, "error", 0, "Cannot reach Koodh VDC. Check your connection.")
    except httpx.ReadError:
        _set_error(user_id, "error", 0, "Connection to Koodh VDC was interrupted.")
    except httpx.TimeoutException:
        _set_error(user_id, "error", 0, "Connection to Koodh VDC timed out.")
    except Exception as e:
        logger.exception("VDC deploy error")
        _set_error(user_id, "error", 0, str(e) or "An unexpected error occurred.")


def _create_source_archive() -> bytes:
    buf = io.BytesIO()
    file_count = 0
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
                    file_count += 1
                except (PermissionError, OSError):
                    continue
    buf.seek(0)
    return buf.read()


async def _dump_database() -> bytes:
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
