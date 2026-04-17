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
