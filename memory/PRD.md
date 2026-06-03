# Radio Show Planning & Management Platform — PRD

## Original Problem Statement
Multi-environment SaaS platform for radio station management built with React frontend, FastAPI backend, and MongoDB.

## Core Features
- Network-level management dashboard with **rack carousel** (3 visible, scrollable)
- **Clara Voice Support** — Real-time AI voice calls using ElevenLabs Conversational AI
- Clara Enterprise Code Assistant (Claude) with 3D isometric room cards
- Support Ticket System with S3 file attachments
- WordPress content publishing and security
- PWA installation support, RDS metadata auto-refresh
- **Clara System Scan Widget** — Non-blocking floating scan on login

## Architecture
```
/app
├── backend/routers/
│   ├── clara_test_agent.py       # Health scan + rack scan (optimized)
│   ├── voice_support.py          # ElevenLabs signed URL + transcript CRUD
│   ├── enterprise_assistant.py   # Claude code generation
│   ├── support_tickets.py        # S3 file storage
│   └── ...
├── backend/services/
│   └── redis_cache.py            # Redis + in-memory fallback (0.3s timeout)
├── frontend/src/
│   ├── components/
│   │   ├── ClaraScanWidget.js         # Unified scan widget (popup/minimized/expanded)
│   │   ├── VoiceCallWidget.js         # @11labs/client direct WebRTC
│   │   ├── workspace/ServerRackView.js # Rack carousel
│   │   └── MainSiteDashboardLayout.js
│   └── pages/
│       ├── EnterpriseAssistantPage.js
│       └── Network/NetworkDashboard.js
└── memory/
```

## Credentials
- System Admin: admkoodh@koodh.com / KYLovie13monx
- Network Admin: yannick.gijbels@koodh.com / test

## Performance Optimization (Apr 2026)
- **Health Scan**: Rewritten from sequential blocking calls (60s+ timeout) to 2-phase non-blocking:
  - Phase 1: Instant DB config checks (~0.1s from cache)
  - Phase 2: External WP/RDS connectivity tested in background `asyncio.create_task`
  - LLM diagnosis removed from scan (was adding 5-10s per call)
  - Cache: 60s TTL via in-memory/Redis
- **Rack Scan**: N+1 queries eliminated — 7 batch `asyncio.gather` queries replace 40+ individual queries
  - From ~5-10s → 0.09s
  - Cache: 60s TTL
- **Main Sites**: Already had batch aggregation + caching; MongoDB indexes added for `id`, `slug`, `environment_id`, `main_site_id`
- **Redis Cache**: Socket timeout reduced from 1s → 0.3s to minimize cold-start latency
- **MongoDB Indexes**: Created on startup for: `main_sites.id`, `main_sites.slug`, `main_site_users`, `sites.main_site_id`, `wordpress_sites.main_site_id`, `rds_stations.main_site_id`, `firewall_settings.main_site_id`, `users.id`, `users.email`
- **Health scan site_type filter**: Removed — now checks ALL sites with WP/RDS configs regardless of `site_type` field presence

## Unified Scan Widget (Apr 2026)
- Replaced separate `ClaraHealthBanner` + `ClaraRackScan` modals with unified `ClaraScanWidget.js`
- **3-phase UX**: Popup (5 sec centered) → Minimized (floating bottom-right pill) → Expanded (side panel)
- Non-blocking: user can continue working while scans run in background
- Visual progress: circular progress ring, per-item checkmarks/crosses, severity badges
- Runs both Health Scan and System Scan simultaneously
- **Fix Guide Mode**: Click "Fix" on any issue to get a step-by-step guided fix flow
- Component: `frontend/src/components/ClaraScanWidget.js`

## Branding Update (Apr 2026)
- Replaced default "Clara" text logo with custom Koodh Clara image logo (pink/red "koodh" + purple "clara")
- Logo stored at: `/api/uploads/branding/koodh_clara_logo_cropped.png`
- Updated: LoginPage.js (h-7 — matching header size), BrandLogo.js (h-9 default), NetworkHeader.js (uses BrandingContext)
- Auto-cropped from 4269x2400 original to 3365x715 (logo text only, no black padding)
- **Brand Colors (Apr 2026)**: Replaced all orange (#f97316) with `#dd0c51` (pink/magenta) for buttons & accents, and amber (#f59e0b) with `#7c1ac8` (purple) for gradients & secondary accents.
  - Tailwind `orange` palette overridden in `tailwind.config.js`
  - Tailwind `amber` palette overridden in `tailwind.config.js`
  - CSS variables `--primary`, `--accent`, `--ring` updated to HSL 338 90% 46%
  - All hard-coded hex values (`#f97316`, `#ea580c`, `#f59e0b`, etc.) and `rgba(249,115,22,...)` replaced globally

## Clara Scan Widget Improvements (Apr 2026)
- 2FA auto-fix moved from AUTO_FIXABLE to CONFIRM_FIXABLE — shows confirmation dialog with Skip/Enable 2FA buttons
- Re-run scans button added to expanded view header (⟳) and footer ("Re-run") — resets all state and re-runs health + system scan
- Component: `frontend/src/components/ClaraScanWidget.js`

## VDC Deployment Module (Apr 2026)
- Encrypted deployment of source code + MongoDB database to Clara Host VDC (https://vdc.koodh.com)
- Encryption: RSA-4096 (key exchange) + AES-256-GCM (data encryption, 12-byte nonce)
- Chunked upload: 4MB per chunk, background async processing
- Backend: `backend/routers/vdc_deploy.py` — `/api/vdc-deploy/start`, `/api/vdc-deploy/status`
- Frontend: `frontend/src/pages/Network/VDCDeployPanel.js` — accessible via More → Deploy to VDC
- 6-step flow: Handshake → Public Key → Prepare Data → Init Session → Upload Chunks → Finalize
- Real-time progress polling with phase indicators
- Only accessible by system admins

## Backlog
### P0
- Dynamic Step-by-Step RDS Builder Wizard (4 steps)
### P1
- Calendar Integration (Google Calendar / Outlook) for Clara Tasks
- WordPress Plugin Integration (clara-radio-schedule)
- Radio Automation Phase 2 (Audio Engine + Cloud Playback)
### P2
- Payment Gateway (Stripe/Mollie), Stream Monitor VU Meters
- React Hook warnings (45+ files), MainSiteDashboardLayout refactoring
- Split massive ContentDetailPage.js (>1600 lines)
- Wrap Radix DialogContent with VisuallyHidden DialogTitle (a11y warning, low priority)
- Align `/api/notifications/broadcast` field names between preview (`subject`/`message`) and send (`title`/`body`)

## 2026-05-29 — Feature Integration "Show prompt" + Restore Guide
- **New endpoint** `GET /api/clara-custom/integrations/{id}/prompt` — regenerates the markdown prompt for an EXISTING integration using its existing `integration_token`. Idempotent: external project re-registers without re-approval and stays `connected`.
- **UI**: "Prompt" button on every integration row (connected / pending / disconnected) in `IntegrationsTab.js`. Reuses the same dialog (with a "♻️ Re-using existing token" banner instead of the one-time warning).
- **Hand-off file**: `/app/memory/RESTORE_KOODH_MEDIA_INTEGRATION.md` — ready-to-paste prompt for the user's media-group-web project (token `b9059dc8…` already filled in, callback URL set to current Clara preview).
- **Why**: media-group-web's backend lost the `/api/clara-feature/*` routes (all return 404 while root is 200). The restore prompt + Show-prompt button lets the user fix the external project at any time without needing the main agent.
- **Smoke tested**: 200 with auth, 403 without, 404 for unknown id, token preserved across calls.

## 2026-05-23 — Clara Custom Auto-Discovery
- **Discovery tokens** per environment: nieuwe `clara_discovery_tokens` collectie. Admins genereren een token via `/discovery-tokens` (system-admin only). Token wordt eenmalig getoond met copy-actie en de juiste `.env` snippet voor het externe project.
- **Self-registration endpoint** `POST /api/clara-custom/discover` (publiek, auth via token in body). Idempotent op `discovered_url_hash` (sha256 van site_url). Bij eerste call: maakt pending main_site aan met `pending_setup: true`, `pending_setup_steps: ["name","verify_endpoints"]`, slug auto-genereerd, environment = token's environment. Bij vervolgcalls: update bestaande entry (geen duplicates).
- **Auto-import OpenAPI**: discover body bevat `openapi_url` → background task haalt spec op en importeert alle endpoints in `clara_custom_apis` met `Authorization: Bearer {shared_secret}` voorgevuld.
- **Auto-health-check**: 2s na discovery worden alle geregistreerde endpoints geverifieerd.
- **Pending badge (!)** op auto-discovered sites in `ServerRackView.js` (beide render-paths). Klikbaar → opent Clara Custom dashboard.
- **PendingSetupBanner** (`components/ClaraCustom/PendingSetupBanner.js`) op Clara Custom dashboard: 3-stappen checklist (naam, environment, verify endpoints) + Save/Finalize knoppen.
- **Environment-move**: `PUT /api/main-sites/{id}` accepteert nu `environment_id` (network admins only) zodat sites tussen racks verplaatst kunnen worden — gebruikt door de PendingSetupBanner en algemeen voor reorganisatie.
- **Discovery Tokens UI**: nieuwe pagina `/discovery-tokens` (system admin only) — list met masked tokens, copy/revoke, "How it works" uitleg.
- **NetworkHeader**: extra link in LINK_ITEMS naar Discovery Tokens (Key icoon, system admin only).
- **Prompt update**: `/app/memory/CLARA_CUSTOM_SITE_PROMPT.md` bevat nu een `Auto-discovery (zelf-registratie bij Clara)` sectie met FastAPI startup-event code en env vars (`CLARA_DISCOVERY_URL`, `CLARA_DISCOVERY_TOKEN`).
- **Smoke tested**: token genereren ✅ → discover (registered) ✅ → discover opnieuw zelfde URL (updated, idempotent) ✅ → pending_setup correct gezet ✅ → masked token in list ✅ → revoke ✅.

## 2026-04-22 — Content History Rollback + Login BG Fix
- **Rollback feature** (P0): Added `POST /api/content/{content_id}/rollback/{log_id}` in `backend/routers/content.py`. Restores field values from a specific audit log entry's `old_value` (full values now stored; not truncated) and records a traceable rollback audit entry.
- **UI**: In `ContentDetailPage.js`, each updated history row shows a "Rollback" button; clicking opens an AlertDialog confirmation. Frontend truncates long HTML previews to 180 chars for display only.
- **Login page**: Switched `ROOMS_IMG` to `clara_rooms.png` (transparent PNG) and removed `mixBlendMode: 'multiply'` to eliminate the visible white box behind the isometric rooms. Cleaned up leftover duplicate JSX at end of file.
- Tested: backend curl (edit → rollback → verify title reverted), frontend Playwright (history dialog opens, Rollback btn triggers AlertDialog, confirm executes rollback successfully).

## 2026-05 — Code Studio → Clara Custom Pivot + Notification Broadcast
- **Code Studio REMOVED entirely**: Dropped MongoDB collections `code_studio_sites`, `code_studio_pages`, `code_studio_files`. Deleted `backend/routers/code_studio.py` and `frontend/src/pages/CodeStudioPage.js`.
- **Clara Custom (NEW)**: New `main_site` type for monitoring 3rd-party API health.
  - Backend: `backend/routers/clara_custom.py` — `POST /api/clara-custom/check-all?main_site_id=...`, `POST /api/clara-custom/apis/{api_id}/check` async pings external endpoints with timeout and returns status/latency.
  - Model: `backend/models/main_sites.py` adds `custom_apis: List[Dict]` field with `{name, url, headers}`.
  - Wizard: `CreateMainSiteWizard.js` step "Clara Custom APIs" (`StepClaraCustom`) for adding/editing endpoint rows during site creation.
  - Dashboard: `frontend/src/pages/ClaraCustomPage.js` — lists APIs with live connectivity badges (green/red/yellow).
- **Notification Broadcast System**: `/preview` page (`Network/NotificationBroadcast.js`) for composing network-wide alerts with severity styling and a live maintenance banner / email layout preview. Endpoints: `POST /api/notifications/broadcast`, preview helpers in `routers/notifications.py`. `MaintenanceBanner.js` component renders site-wide banners.
- **Login Page redesign**: 4 HD fullscreen Nano Banana-generated animated scenes, centered logo, exact background colors. White background, no black edges, no "VDC Deploy" text.
- **Status icon styling**: White/outlined status icons in `ContentDetailPage.js` & content library replaced legacy color badges.

## 2026-05-14 — Wizard Runtime Error Fix
- **Bug**: `ReferenceError: setLinkedMainSiteId is not defined` thrown by `handleClose` and `StepEnvironment.onSelect` in `CreateMainSiteWizard.js` — orphaned references to deleted Code Studio state.
- **Fix**: Removed `setLinkedMainSiteId('')` and `setClMode('none')` from both call sites (lines 1394 & 1486); replaced with `setCustomApis([])` reset for Clara Custom flow.
- **Tested** (`testing_agent_v3_fork` iteration_150): Backend 10/10 (Clara Custom, notifications broadcast, content rollback). Frontend smoke 100% — login → LoginWizard → Enter Clara → "New Server" wizard opens without `ReferenceError`. Regression suite saved to `/app/backend/tests/test_clara_custom_and_recent_fixes.py`.


## 2026-06-03 — ProRadio Cleanup + Zero Trust Enterprise Security
### ProRadio fully removed
- Deleted: `backend/routers/proradio.py`, `backend/services/proradio_service.py`, `frontend/public/images/api_proradio.jpg`.
- Stripped: ProRadio sync calls + imports from `routers/shows.py` (create/update/delete handlers), `server.py`, `routers/main_sites.py` (API explorer mapping), and `pages/Network/ApiExplorerPage.js`.
- DB migration `scripts/cleanup_proradio_data.py` — drops `proradio_sync` / `proradio_credentials` / `proradio_logs` collections, strips legacy ProRadio fields from shows, removes `"proradio"` from `enabled_integrations`. Idempotent.
- Verified: `GET /api/proradio/*` → 404; no ProRadio collections remain.

### Zero Trust security layer (assume-breach posture)
New components:
- **Field-level encryption** (`services/security/encryption.py`) — Fernet/AES-128-CBC + HMAC-SHA256, prefix `enc:v1:`, idempotent, keyed by `SECURITY_ENCRYPTION_KEY`.
- **Brute-force identity lockout** (`services/security/brute_force.py`) — ladder: 5 failed attempts → 60s lock, then 5m → 15m → 60m. Stored in `db.brute_force_locks`. Per-email scoping (complementary to existing IP-level firewall).
- **Device-trust tracking** (`services/security/device_trust.py`) — SHA-256 fingerprint of UA + accept-language + IP /24, new-device → audit event → notification.
- **Anomaly scheduler** (`services/security/anomaly.py`) — 5min loop detecting credential stuffing, off-hours admin writes, permission bursts.
- **Security headers middleware** (`middleware/security_headers.py`) — HSTS, CSP, X-Frame-Options=SAMEORIGIN, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, COOP/CORP.
- **Strict CORS** — exact origin allow-list + regex `^https://([a-zA-Z0-9-]+\.)?koodh\.com$|^https://[a-zA-Z0-9-]+\.preview\.emergentagent\.com$`; methods + headers narrowed to what's actually used.
- **Admin telemetry router** (`routers/security.py`): `/api/security/overview|anomalies|lockouts|devices` + acknowledge / clear / revoke actions.
- **Frontend Zero Trust panel** (`components/ZeroTrustPanel.js`) embedded in Network Dashboard → Security section. Shows encryption status, open anomalies (with severity tiles), active lockouts (with one-click release), and known devices.

Encryption applied to existing data:
- `wordpress_sites.app_password` and `clara_integrations.shared_secret` migrated to `enc:v1:…` via `scripts/encrypt_existing_secrets.py` (4 documents). Runtime decrypt happens at the auth-string build sites (`routers/wordpress.py`, `routers/clara_integrations.py`).

Audit wiring:
- Login now feeds *both* the existing IP-level firewall **and** the new identity-level lockout; failed 2FA also records identity failures.
- Successful login emits a New-Device audit log via the existing audit→notification bridge when the fingerprint is unknown.

Tests:
- `backend/tests/test_zero_trust.py` — 4 tests, all green: encryption round-trip, brute-force ladder, fingerprint stability across /24, security headers presence.

### Status
- Backend health: ✅ running
- Encryption available: ✅ (verified via `/api/security/overview`)
- ProRadio: removed
- Auto-deploy push to VDC: queued (deployment_id `7a7e6f09-…`)
