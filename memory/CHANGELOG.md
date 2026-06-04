# Changelog

## 2026-06-04 — Content Library Robustness & Custom-Site Polish

### Backend (`/app/backend/routers/content.py`)
- `POST /api/content/categories` now accepts JSON body `{ "name": "..." }` and de-duplicates on slug per main site.
- NEW `DELETE /api/content/categories/{id}` — removes a category and unsets `category_id` on its items (no data loss).
- NEW `POST /api/content/bulk-delete` — body `{ "content_ids": [...] }`. Soft-deletes the items, flips `status='draft'` so they vanish from the public News API immediately, batched audit log.
- `DELETE /api/content/{id}` re-ordered: **soft-delete first**, WordPress trash cleanup after with a 6-second timeout per site. Slow/unreachable WP hosts can no longer make the UI think the delete failed.

### Frontend
- `ContentLibraryPage.js`:
  - New **Delete** button in the bulk action bar (calls `/bulk-delete`).
  - **Always-visible Category dropdown** with `+ New category` and per-row trash icons, even when no categories exist.
  - New **News API endpoints** info panel: lists each category with its public `/api/news/{slug}/{cat}` URL and a copy-to-clipboard button.
- `CreateContentDialog.js`: `+ New category` button next to the Category label — inline create without leaving the wizard.
- `ContentDetailPage.js`: surfaces backend `detail` on delete errors and reports per-site WordPress sync failures in the toast.
- `DashboardHome.js`: added `SITE_TYPE_THEMES.custom` (label "Custom Site"). Unknown site types now fall back to **custom** instead of **radio** — custom main sites no longer show the "Radio Station" label.

### Tests
- `/app/backend/tests/test_content_library_dbnt_fixes.py` — 10/10 green covering category CRUD, dedupe, bulk-delete soft-delete + status-flip, fast single delete, public News API regression.


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
