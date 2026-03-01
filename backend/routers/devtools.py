"""DevTools Router — Source code viewer for clone debugging."""
import os
from fastapi import APIRouter, Depends, HTTPException, Query
from services.auth import get_current_user

devtools_router = APIRouter(prefix="/devtools", tags=["devtools"])

# Allowed source directories (prevent directory traversal)
ALLOWED_PREFIXES = [
    "src/pages/",
    "src/components/",
    "src/context/",
    "src/utils/",
]
FRONTEND_BASE = "/app/frontend"


@devtools_router.get("/source")
async def get_source_code(
    file: str = Query(..., description="Relative file path from src/"),
    current_user: dict = Depends(get_current_user),
):
    """Get source code of a frontend component file. Network admin only."""
    if not current_user.get("is_network_admin"):
        raise HTTPException(status_code=403, detail="Network admin only")

    # Security: validate path
    clean_path = file.replace("\\", "/").lstrip("/")
    if ".." in clean_path:
        raise HTTPException(status_code=400, detail="Invalid path")

    if not any(clean_path.startswith(prefix) for prefix in ALLOWED_PREFIXES):
        raise HTTPException(status_code=403, detail="Access to this path is not allowed")

    full_path = os.path.join(FRONTEND_BASE, clean_path)
    if not os.path.isfile(full_path):
        raise HTTPException(status_code=404, detail="File not found")

    try:
        with open(full_path, "r", encoding="utf-8") as f:
            content = f.read()
        return {
            "file": clean_path,
            "content": content,
            "lines": content.count("\n") + 1,
            "size": len(content),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not read file: {str(e)}")
