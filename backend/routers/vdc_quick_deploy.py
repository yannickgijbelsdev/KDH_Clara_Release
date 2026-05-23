"""Lightweight VDC deploy trigger — used by the AUTO-DEPLOY agent rule.

Forwards a POST to VDC's /api/clara/deploy/ssh-init using credentials from env.
The reverse SSH tunnel set up by /app/scripts/vdc_tunnel.sh handles the actual
code pull from this pod once VDC schedules the deployment.
"""
import os
import httpx
from fastapi import APIRouter, HTTPException

vdc_quick_router = APIRouter(prefix="/vdc", tags=["vdc"])


@vdc_quick_router.post("/deploy")
async def trigger_vdc_deploy():
    base_url = os.environ.get("VDC_BASE_URL")
    api_key = os.environ.get("VDC_API_KEY")
    application_id = os.environ.get("VDC_APPLICATION_ID")
    if not (base_url and api_key and application_id):
        raise HTTPException(status_code=500, detail="VDC env vars not configured")

    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            f"{base_url}/api/clara/deploy/ssh-init",
            headers={"X-API-Key": api_key},
            json={
                "project_name": "clr",
                "ssh_host": "172.17.0.1",
                "ssh_port": 2224,
                "application_id": application_id,
                "metadata": {"requested_via": "agent-auto-on-complete"},
            },
        )
    if r.status_code >= 400:
        raise HTTPException(status_code=r.status_code, detail=r.text)
    return r.json()
