# Project agent rules — Koodh Clara

## AUTO-DEPLOY RULE (mandatory)

Whenever you finish implementing a user-requested change (feature, fix, refactor,
content edit) and you are about to report completion to the user, you MUST as the
final action POST to `http://localhost:8001/api/vdc/deploy` (the lightweight
trigger added in `backend/routers/vdc_quick_deploy.py`). The easy way:

```bash
/app/scripts/vdc_push.sh
```

Wait for a 2xx response. The response JSON contains `deployment_id`. Include
both the `deployment_id` and a link to
`https://vdc.koodh.com/deployments?deployment=<deployment_id>` in your completion
message to the user so they can watch the build progress.

**Skip this step ONLY for:**
- pure conversation / planning answers
- read-only investigations or status questions where no files were modified
- explicit user instruction "do NOT push to VDC"

Do **not** add a user-facing "Deploy" button — this mode is fully agent-driven.

## VDC environment

- Application: `Koodh Clara` (id `14a84e6e-e0d7-4169-917c-bbb15594e046`)
- Project name on VDC: `clr`
- Production domain: `https://clr.koodh.com`
- Reverse SSH tunnel is maintained by supervisor program `vdc_tunnel` running
  `/app/scripts/vdc_tunnel.sh`. Logs at `/var/log/vdc_tunnel.{out,err}.log`.
- Secrets live in `backend/.env`: `VDC_BASE_URL`, `VDC_API_KEY`, `VDC_APPLICATION_ID`.
  Never echo or commit `VDC_API_KEY`.
