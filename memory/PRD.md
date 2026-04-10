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

## Architecture
```
/app
├── backend/routers/
│   ├── voice_support.py         # ElevenLabs signed URL + transcript CRUD
│   ├── enterprise_assistant.py  # Claude code generation
│   ├── support_tickets.py       # S3 file storage
│   └── ...
├── frontend/src/
│   ├── components/
│   │   ├── VoiceCallWidget.js        # @11labs/client direct WebRTC
│   │   ├── workspace/ServerRackView.js # Rack carousel (3 visible)
│   │   └── MainSiteDashboardLayout.js
│   └── pages/
│       ├── EnterpriseAssistantPage.js
│       └── Network/NetworkDashboard.js
└── memory/
```

## Voice Support (ElevenLabs)
- Agent: agent_8101knpxmcfjfsrbfee7taaq3jjx (Sarah voice)
- SDK: @11labs/client (Conversation.startSession)
- Rendered via React Portal on document.body (z-10000)
- Enterprise-only feature

## Credentials
- System Admin: admkoodh@koodh.com / KYLovie13monx
- Network Admin: yannick.gijbels@koodh.com / test

## Recent Fixes
- **Rundown delete bug** (Apr 2026): Fixed `delete_rundown_item` endpoint — added multisite context (`X-Main-Site-ID`) and changed from admin-only to editor/admin/member permissions (consistent with create/update)
- **Clara Assistant error handling** (Apr 2026): Improved error messages when LLM key hits rate limit — now shows actionable message directing users to create support tickets directly
- **Clara Voice Support client tools** (Apr 2026): 
  - Added 3 ElevenLabs client tools: `hang_up`, `highlight_element`, `navigate_to_page`
  - Created `ClaraGuideOverlay.js` — spotlight/glow overlay system that highlights UI elements
  - Created `ClaraNavigationListener` — handles page navigation triggered by voice commands
  - Updated agent prompt: Clara now actively uses tools to show/highlight/navigate instead of just describing
  - Endpoint `POST /api/voice-support/setup-agent-tools` for tool creation
  - Endpoint `POST /api/voice-support/update-agent-prompt` for prompt updates
- **Radio Automation System** (Apr 2026) — Phase 1: UI + Backend:
  - OmniPlayer-style layout with A/B player decks, waveform visualization, crossfader
  - Track Library panel with search, demo tracks for first-time experience
  - Playlist management with drag-to-deck support
  - Cue Point editor (intro, outro, fade-in, fade-out) per track
  - VU-meter style indicators per deck
  - Backend: Full track/playlist CRUD with multisite context (`radio_automation.py`)
  - Route: `/{site}/radio-automation`
- **Site Creation Wizard — Feature Selection** (Apr 2026):
  - Added "Features" step to CreateMainSiteWizard for Virtual Datacenter type
  - Users can now choose which tools to activate: XML Imports, API Keys, VMix Director, Canva Director, Radioplayer, Radio Automation
  - Dynamic step indicator: Features step only appears for site types with optional features
  - Selected features are included in `enabled_features` on site creation

## UI Consistency (Apr 2026)
- Standardized all page widths inside CanvasPanel to match Content Library (full-width)
- Removed restrictive `max-w-*` classes from: RDSBuilderPage, RDSSettingsPage, RDSMonitorPage, AudioTriggersPage, StreamMonitorPage, RadioplayerPage, WpSecurityPage, XmlUpload, XmlDetails, ZeroTierPage, TaskBoardsPage

## Dynamic RDS Stations (Apr 2026)
- New `rds_stations` collection: stores station configs per main_site (name, code, stream_url, stream_type, default_text, color)
- Backend CRUD endpoints: GET/POST/PUT/DELETE /api/rds-stations/{main_site_id}
- Bulk-sync endpoint: PUT /api/rds-stations/{main_site_id}/bulk-sync
- Legacy migration endpoint: POST /api/rds-stations/migrate/legacy (migrated MFY/GRK)
- **GET /api/rds/endpoints** now dynamically generates station-specific API endpoints from `rds_stations` collection (no more hardcoded MFY/GRK)
- Frontend RDSSettingsPage API Endpoints section dynamically renders stations from endpoint data (station_name, station_color)
- Create Site Wizard: "Stations" step added for radio type (Environment → Details → Stations → Admin → Security → Deploying)
- Edit Site Wizard: "Stations" tab added for radio type sites
- RDS Builder, Settings, Monitor pages now dynamically load stations from API instead of hardcoded MFY/GRK

## WordPress Wizard Integration (Apr 2026)
- Create Site Wizard: "WordPress" step added for radio + external_host types
- Edit Site Wizard: "WordPress" tab added for radio + external_host types
- Full CRUD: view, add, edit, delete WordPress connections per site
- WordPress config saved via POST /api/wordpress/sites with X-Main-Site-Id header
- Radio flow: Environment → Details → Stations → WordPress → Admin → Security → Deploying
- External Host flow: Environment → Details → WordPress → Admin → Security → Deploying
- Other types: no WordPress or Stations steps

## Clara Test Agent (Apr 2026)
- AI-powered connection testing: Clara tests WordPress and RDS connections and explains issues
- Automatic health scan: Clara scans all main sites on admin login, shows notification banner if issues found
- Backend endpoints: POST /api/clara-test/test-wordpress, POST /api/clara-test/test-rds-stream, GET /api/clara-test/health-scan
- Uses GPT-5.2 via Emergent LLM Key for diagnosis
- Health banner appears in top-right corner after login with dismiss button

## Server Rack Dynamic Scaling (Apr 2026)
- Fixed ServerRackView.js to dynamically scale racks based on screen width
- Replaced hardcoded `width: 320px` and `VISIBLE_RACKS = 3` with ResizeObserver-based dynamic sizing
- Racks now auto-calculate: visible count (1-N based on viewport), card width (280-420px range), proportional image height
- Ultra-wide screens show 5+ racks; smaller screens gracefully degrade to fewer racks

## Clara Health Diagnostic Modal (Apr 2026)
- Replaced top-right notification banner with full Clara-style centered diagnostic modal
- Per-issue cards: type badge (WordPress/RDS), site name, error, AI diagnosis with solutions
- "Reconfigure" button navigates to the site's settings page (/{slug}/wordpress or /{slug}/rds)
- "Re-test" button retests individual connections with live AI diagnosis update
- Backend: health-scan now returns site_id/site_slug/site_type per check; new POST /api/clara-test/retest-check endpoint
- Rescan All, Dismiss, and session-based daily suppression

## Unified RDS Tabbed Page (Apr 2026)
- Created `RDSPage.js`: unified tabbed interface with Settings | Monitor | Builder | Scheduler
- Deep-linking via `?tab=monitor|builder|scheduler` URL params
- Removed individual page headers (RDS header lives in the unified wrapper)
- Updated sidebar: single "RDS" item replaces 3 separate items (RDS Settings, RDS Builder, RDS Monitor)
- All routes consolidated under `/:mainSiteSlug/rds`
- Fixed all hardcoded MFY/GRK station validation blocks across `rds.py` and `rds_builder.py`
- Dynamic shoutcast log filtering by site's station codes
- Dynamic Scheduler station tabs (fetched from `/api/rds-stations/by-slug/{slug}`)
- New backend endpoint: `GET /api/rds-stations/by-slug/{slug}`
- Fixed Dutch text to English across RDS pages (testing agent also contributed fixes)

## Dynamic Station Filtering Across Full Stack (Apr 2026)
- Removed ALL remaining hardcoded MFY/GRK iteration loops from:
  - `rds_builder.py`: monitor endpoint, force-refresh, check_live_shows_from_calendar, scheduled-texts-status
  - `rds_builder_scheduler.py`: run_rds_builder_cycle, _background_full_refresh
  - `rds_scheduler.py`: refresh_live_show_cache (for "both" station broadcast)
  - `shoutcast.py`: ShoutcastScheduler._run_loop
- Monitor endpoint now accepts `?stations=` query param for per-site filtering
- Frontend RDSMonitorPage passes dynamic station codes to all API calls
- RDSSchedulerPage station tabs now load dynamically from `/api/rds-stations/by-slug/{slug}`
- New backend endpoint: `GET /api/rds-stations/by-slug/{slug}`

## RDS Permission Consolidation (Apr 2026)
- Merged `rds_settings`, `rds_builder`, `rds_monitor` into single `rds` feature/permission
- DB migration in server startup converts existing sites and roles automatically
- CLI `ALL_FEATURES` and `ALL_AVAILABLE_FEATURES` updated
- Sidebar shows single "RDS" menu item under "Streaming & RDS" group

## Firewall at Rack Level + Header (Apr 2026)
- New `GET /api/firewall/status/bulk` endpoint returns firewall enabled status per site
- ServerRackView shows "Clara Global Protect" (green) badge when ALL sites in rack have firewall enabled
- Shows "Partial Protection" (amber) badge when SOME sites have firewall enabled
- MainSiteDashboardLayout header shows "Clara Global Protect" text badge only when firewall is active for that site
- Firewall status conditional on `firewall_settings.enabled = true` per site

## Backlog
### P0
- Dynamic Step-by-Step RDS Builder Wizard (4 steps: Station Source → Metadata Fields → Shows/Playlist → Preview & Activate)
### P1
- Calendar Integration (Google Calendar / Outlook) for Clara Tasks
- WordPress Plugin Integration (clara-radio-schedule)
- Radio Automation Phase 2 (Audio Engine + Cloud Playback)
### P2
- Payment Gateway (Stripe/Mollie), Stream Monitor VU Meters
- React Hook warnings (45+ files, mostly `headers` dep), MainSiteDashboardLayout refactoring
