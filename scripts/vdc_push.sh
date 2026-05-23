#!/bin/bash
# One-shot CLI for the AUTO-DEPLOY rule. Posts to the local FastAPI endpoint
# which forwards to VDC's ssh-init route. Writes the JSON response to
# /tmp/vdc_last_deploy.json so the agent can grep the deployment_id.
curl -fsS -X POST http://localhost:8001/api/vdc/deploy \
  -H "Content-Type: application/json" \
  | tee /tmp/vdc_last_deploy.json
