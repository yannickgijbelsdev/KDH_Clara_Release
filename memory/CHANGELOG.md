# Changelog

## 2026-04-10 — Fork Session: UI Width Standardization & Dynamic RDS Stations

### UI Consistency: Page Width Unification
- Removed `max-w-6xl mx-auto` from RDSBuilderPage.js
- Removed `max-w-4xl mx-auto` from RDSSettingsPage.js
- Removed `max-w-7xl mx-auto` from RDSMonitorPage.js
- Removed `max-w-6xl mx-auto` from AudioTriggersPage.js
- Removed `max-w-6xl mx-auto` from StreamMonitorPage.js
- Removed `max-w-4xl mx-auto` from RadioplayerPage.js
- Removed `max-w-4xl` from WpSecurityPage.js
- Removed `max-w-2xl` from XmlUpload.js
- Removed `max-w-3xl` from XmlDetails.js
- Removed `max-w-7xl mx-auto` from ZeroTierPage.js
- Removed `max-w-5xl mx-auto` from TaskBoardsPage.js
- All pages now use full CanvasPanel width, consistent with Content Library

### Dynamic RDS Station Configuration
- NEW: `/app/backend/routers/rds_stations.py` — Full CRUD for RDS station configs per main site
- NEW: `rds_stations` MongoDB collection with station name, code, stream URL, stream type, default text, color
- MODIFIED: CreateMainSiteWizard.js — Added "Stations" step for radio type sites
- MODIFIED: EditMainSiteWizard.js — Added "Stations" tab for radio type sites
- MODIFIED: RDSBuilderPage.js — Fetches stations dynamically from API
- MODIFIED: RDSSettingsPage.js — Dynamic filter sections per station
- MODIFIED: RDSMonitorPage.js — Dynamic station cards and countdowns
- Migrated existing MFY/GRK hardcoded data to dynamic station configs
- Testing: 100% backend (12/12), 100% frontend — All pass

### WordPress Wizard Integration
- MODIFIED: CreateMainSiteWizard.js — Added "WordPress" step for radio + external_host types
- MODIFIED: EditMainSiteWizard.js — Added "WordPress" tab with full CRUD (view/add/edit/delete connections)
- Radio flow: Environment → Details → Stations → WordPress → Admin → Security → Deploying
- External Host flow: Environment → Details → WordPress → Admin → Security → Deploying
- Testing: 100% frontend — All pass

### Clara Test Agent & Health Scan
- NEW: `/app/backend/routers/clara_test_agent.py` — AI-powered connection testing (WP + RDS streams)
- NEW: `/app/frontend/src/components/ClaraHealthBanner.js` — Auto health scan notification after admin login
- MODIFIED: CreateMainSiteWizard.js — "Test Connection with Clara" button in WordPress step
- MODIFIED: EditMainSiteWizard.js — Clara test buttons (zap icon) on WP sites and RDS stations
- MODIFIED: App.js — Integrated ClaraHealthScanWrapper for automatic scanning
- Uses GPT-5.2 via Emergent LLM Key (emergentintegrations LlmChat)
- Testing: 100% backend (9/9), 100% frontend — All pass

## 2026-04-08 — Fork Session: ElevenLabs Voice, 3D Images & S3 Migration

### New Feature: Clara Voice Support (ElevenLabs Conversational AI)
- Migrated voice support from OpenAI Realtime API to **ElevenLabs Conversational AI**
- Created ElevenLabs agent (agent_8101knpxmcfjfsrbfee7taaq3jjx) with Sarah voice
- Backend: `voice_support.py` with signed URL endpoint, transcript CRUD
- Frontend: `VoiceCallWidget.js` using `@elevenlabs/react` SDK with `ConversationProvider`
- Incoming call ringing animation, call controls (mute/minimize/hangup), transcript saving
- Integrated in header (green phone icon) + "Call Clara Support" button in ClaraAssistant
- Enterprise-only feature (requires `clara_enterprise` site flag)
- All tests passed (100% backend 7/7, 100% frontend)

### 3D Isometric Room Images
- Generated custom 3D isometric room illustrations for Enterprise Assistant cards
- Violet developer workspace (Code Assistant) + Orange support center (Enterprise Support)

### Enterprise Support Icon
- HeadphonesIcon → Sparkles enterprise icon

### S3 Object Storage Migration (P0)
- Support ticket attachments migrated from base64/MongoDB to S3
- Proxy endpoint + frontend backwards compatibility

## Previous Sessions (Summary)
- Clara Enterprise Assistant, Responsive topbar nav, Support ticket UX
- PWA install prompt, RDS auto-refresh, WordPress fixes, Cloudflare WAF fixes
