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
