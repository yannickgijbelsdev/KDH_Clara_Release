"""XML Imports Router — Upload, parse, and manage XML imports with S3 storage."""
import uuid
import secrets
import hashlib
import asyncio
from datetime import datetime, timezone
from typing import Optional
from xml.etree import ElementTree
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, Header, Request
from pydantic import BaseModel
from database import db
from services.auth import get_current_user
from services.main_site_context import get_main_site_id_from_header
from services.s3_storage import upload_file_to_s3, delete_file_from_s3, get_file_from_s3, get_s3_url, is_s3_configured
from services.audit import log_action, get_client_ip
from fastapi.responses import Response
import logging

logger = logging.getLogger(__name__)

xml_imports_router = APIRouter(prefix="/xml-imports", tags=["xml-imports"])

MAX_XML_SIZE = 50 * 1024 * 1024  # 50MB default


# ── Models ──

class ApiKeyCreate(BaseModel):
    name: str
    main_site_id: str


class ImportFilterParams:
    def __init__(
        self,
        status: Optional[str] = Query(None),
        source: Optional[str] = Query(None),
        main_site_id: Optional[str] = Query(None),
        sort_by: str = Query("upload_date"),
        sort_order: str = Query("desc"),
        page: int = Query(1, ge=1),
        page_size: int = Query(20, ge=1, le=100),
    ):
        self.status = status
        self.source = source
        self.main_site_id = main_site_id
        self.sort_by = sort_by
        self.sort_order = sort_order
        self.page = page
        self.page_size = page_size


# ── Helpers ──

def _parse_xml(content: bytes) -> dict:
    """Parse XML and extract basic metadata."""
    try:
        root = ElementTree.fromstring(content)
        tag = root.tag.split("}")[-1] if "}" in root.tag else root.tag

        # Try to find common metadata fields
        project_name = ""
        version = ""
        date = ""

        # Search common patterns
        for el in root.iter():
            local = el.tag.split("}")[-1] if "}" in el.tag else el.tag
            lower = local.lower()
            text = (el.text or "").strip()
            if not text:
                continue
            if lower in ("project", "projectname", "project_name", "name", "title") and not project_name:
                project_name = text
            elif lower in ("version", "ver") and not version:
                version = text
            elif lower in ("date", "datum", "created", "createdate", "timestamp") and not date:
                date = text

        # Fallback: use root tag as project name
        if not project_name:
            project_name = tag

        return {
            "project_name": project_name,
            "version": version,
            "date": date,
            "root_tag": tag,
            "element_count": sum(1 for _ in root.iter()),
            "error": None,
        }
    except ElementTree.ParseError as e:
        return {"project_name": "", "version": "", "date": "", "root_tag": "", "element_count": 0, "error": str(e)}


async def _verify_api_key(authorization: str = Header(None)):
    """Verify API key from Authorization header. Returns the key document."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid API key")

    token = authorization[7:]
    key_hash = hashlib.sha256(token.encode()).hexdigest()
    key_doc = await db.xml_api_keys.find_one({"key_hash": key_hash, "active": True}, {"_id": 0})
    if not key_doc:
        raise HTTPException(status_code=401, detail="Invalid or inactive API key")

    # Update last_used
    await db.xml_api_keys.update_one(
        {"id": key_doc["id"]},
        {"$set": {"last_used": datetime.now(timezone.utc).isoformat()}}
    )
    return key_doc


# ── API Key Management ──

@xml_imports_router.post("/api-keys")
async def create_api_key(body: ApiKeyCreate, current_user: dict = Depends(get_current_user)):
    """Create a new API key for a main site (agent authentication)."""
    # Generate a secure random key
    raw_key = f"clara_{secrets.token_urlsafe(32)}"
    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()

    key_doc = {
        "id": str(uuid.uuid4()),
        "name": body.name,
        "main_site_id": body.main_site_id,
        "key_hash": key_hash,
        "key_prefix": raw_key[:12] + "...",
        "active": True,
        "created_by": current_user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "last_used": None,
    }
    await db.xml_api_keys.insert_one({**key_doc})

    # Return the raw key ONLY on creation
    return {**key_doc, "api_key": raw_key}


@xml_imports_router.get("/api-keys")
async def list_api_keys(
    main_site_id: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    """List API keys for a main site."""
    keys = await db.xml_api_keys.find(
        {"main_site_id": main_site_id},
        {"_id": 0, "key_hash": 0}
    ).to_list(100)
    return keys


@xml_imports_router.delete("/api-keys/{key_id}")
async def delete_api_key(key_id: str, current_user: dict = Depends(get_current_user)):
    """Deactivate an API key."""
    result = await db.xml_api_keys.update_one(
        {"id": key_id},
        {"$set": {"active": False}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="API key not found")
    return {"message": "API key deactivated"}


# ── XML Upload (Web - authenticated user) ──

@xml_imports_router.post("/upload")
async def upload_xml(
    request: Request,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """Upload an XML file (web interface - authenticated user)."""
    main_site_id = await get_main_site_id_from_header(request)
    if not main_site_id:
        raise HTTPException(status_code=400, detail="X-Main-Site-ID header required")

    return await _process_xml_upload(file, main_site_id, source="manual", uploaded_by=current_user.get("name", current_user.get("email", "")))


# ── XML Upload (Agent - API key auth) ──

@xml_imports_router.post("/agent/upload")
async def agent_upload_xml(
    file: UploadFile = File(...),
    key_doc: dict = Depends(_verify_api_key),
):
    """Upload an XML file (external sync agent - API key auth)."""
    return await _process_xml_upload(file, key_doc["main_site_id"], source="agent", uploaded_by=f"Agent: {key_doc['name']}")


# ── Shared upload logic ──

async def _process_xml_upload(file: UploadFile, main_site_id: str, source: str, uploaded_by: str):
    """Process and store an uploaded XML file."""
    # Validate file type
    if not file.filename.lower().endswith(".xml"):
        raise HTTPException(status_code=400, detail="Only XML files are allowed")

    # Read content
    content = await file.read()
    if len(content) > MAX_XML_SIZE:
        raise HTTPException(status_code=400, detail=f"File too large. Maximum size: {MAX_XML_SIZE // (1024*1024)}MB")

    import_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    s3_key = f"xml_imports/{main_site_id}/{import_id}.xml"

    # Create initial import record
    import_doc = {
        "id": import_id,
        "file_name": file.filename,
        "project_name": "",
        "upload_date": now,
        "source": source,
        "status": "processing",
        "main_site_id": main_site_id,
        "uploaded_by": uploaded_by,
        "xml_path": s3_key,
        "file_size": len(content),
        "error_message": None,
        "metadata": {},
    }
    await db.xml_imports.insert_one({**import_doc})

    # Process in background
    asyncio.create_task(_process_xml_background(import_id, content, s3_key, import_doc))

    return {"import_id": import_id, "status": "processing"}


async def _process_xml_background(import_id: str, content: bytes, s3_key: str, doc: dict):
    """Background task: upload to S3 and parse XML."""
    try:
        # Upload to S3
        if is_s3_configured():
            await upload_file_to_s3(content, s3_key, content_type="application/xml", main_site_id=doc.get("main_site_id"))
        else:
            # Fallback: store locally
            import os
            local_dir = "/app/storage/xml_imports"
            os.makedirs(local_dir, exist_ok=True)
            with open(f"{local_dir}/{import_id}.xml", "wb") as f:
                f.write(content)

        # Parse XML
        parsed = _parse_xml(content)

        if parsed["error"]:
            await db.xml_imports.update_one(
                {"id": import_id},
                {"$set": {
                    "status": "failed",
                    "error_message": f"XML parsing failed: {parsed['error']}",
                    "project_name": doc["file_name"],
                }}
            )
        else:
            await db.xml_imports.update_one(
                {"id": import_id},
                {"$set": {
                    "status": "success",
                    "project_name": parsed["project_name"] or doc["file_name"],
                    "metadata": {
                        "version": parsed["version"],
                        "date": parsed["date"],
                        "root_tag": parsed["root_tag"],
                        "element_count": parsed["element_count"],
                    },
                }}
            )

        logger.info(f"XML import {import_id} processed: {parsed.get('project_name', 'unknown')}")

    except Exception as e:
        logger.error(f"XML import {import_id} failed: {e}")
        await db.xml_imports.update_one(
            {"id": import_id},
            {"$set": {"status": "failed", "error_message": str(e)}}
        )


# ── List imports ──

@xml_imports_router.get("")
async def list_imports(
    request: Request,
    params: ImportFilterParams = Depends(),
    current_user: dict = Depends(get_current_user),
):
    """List XML imports with filtering, sorting, and pagination."""
    main_site_id = params.main_site_id or await get_main_site_id_from_header(request)

    query = {}
    if main_site_id:
        query["main_site_id"] = main_site_id
    if params.status:
        query["status"] = params.status
    if params.source:
        query["source"] = params.source

    sort_dir = -1 if params.sort_order == "desc" else 1
    sort_field = params.sort_by if params.sort_by in ("upload_date", "file_name", "status", "project_name") else "upload_date"

    total = await db.xml_imports.count_documents(query)
    skip = (params.page - 1) * params.page_size

    imports = await db.xml_imports.find(query, {"_id": 0}).sort(sort_field, sort_dir).skip(skip).limit(params.page_size).to_list(params.page_size)

    return {
        "imports": imports,
        "total": total,
        "page": params.page,
        "page_size": params.page_size,
        "total_pages": (total + params.page_size - 1) // params.page_size,
    }


# ── Agent list imports (API key auth) ──

@xml_imports_router.get("/agent/list")
async def agent_list_imports(
    status: Optional[str] = Query(None),
    key_doc: dict = Depends(_verify_api_key),
):
    """List imports for the agent's main site."""
    query = {"main_site_id": key_doc["main_site_id"]}
    if status:
        query["status"] = status
    imports = await db.xml_imports.find(query, {"_id": 0}).sort("upload_date", -1).limit(50).to_list(50)
    return imports


# ── Import details ──

@xml_imports_router.get("/{import_id}")
async def get_import(import_id: str, current_user: dict = Depends(get_current_user)):
    """Get details of a specific import."""
    doc = await db.xml_imports.find_one({"id": import_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Import not found")
    return doc


# ── Agent import details ──

@xml_imports_router.get("/agent/{import_id}")
async def agent_get_import(import_id: str, key_doc: dict = Depends(_verify_api_key)):
    """Get import details (agent auth)."""
    doc = await db.xml_imports.find_one(
        {"id": import_id, "main_site_id": key_doc["main_site_id"]},
        {"_id": 0}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Import not found")
    return doc


# ── Download XML ──

@xml_imports_router.get("/{import_id}/download")
async def download_xml(import_id: str, current_user: dict = Depends(get_current_user)):
    """Download the original XML file."""
    doc = await db.xml_imports.find_one({"id": import_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Import not found")

    try:
        if is_s3_configured():
            content = await get_file_from_s3(doc["xml_path"])
        else:
            with open(f"/app/storage/xml_imports/{import_id}.xml", "rb") as f:
                content = f.read()
    except Exception:
        raise HTTPException(status_code=404, detail="XML file not found in storage")

    return Response(
        content=content,
        media_type="application/xml",
        headers={"Content-Disposition": f'attachment; filename="{doc["file_name"]}"'}
    )


# ── XML Preview ──

@xml_imports_router.get("/{import_id}/preview")
async def preview_xml(import_id: str, current_user: dict = Depends(get_current_user)):
    """Get XML content for preview (read-only)."""
    doc = await db.xml_imports.find_one({"id": import_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Import not found")

    try:
        if is_s3_configured():
            content = await get_file_from_s3(doc["xml_path"])
        else:
            with open(f"/app/storage/xml_imports/{import_id}.xml", "rb") as f:
                content = f.read()
        return {"xml_content": content.decode("utf-8", errors="replace")}
    except Exception:
        raise HTTPException(status_code=404, detail="XML file not found in storage")


# ── Delete import ──

@xml_imports_router.delete("/{import_id}")
async def delete_import(import_id: str, current_user: dict = Depends(get_current_user)):
    """Delete an import and its XML file."""
    doc = await db.xml_imports.find_one({"id": import_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Import not found")

    # Delete from S3
    try:
        if is_s3_configured():
            await delete_file_from_s3(doc["xml_path"])
        else:
            import os
            local_path = f"/app/storage/xml_imports/{import_id}.xml"
            if os.path.exists(local_path):
                os.remove(local_path)
    except Exception as e:
        logger.warning(f"Could not delete XML file: {e}")

    await db.xml_imports.delete_one({"id": import_id})
    return {"message": "Import deleted"}
