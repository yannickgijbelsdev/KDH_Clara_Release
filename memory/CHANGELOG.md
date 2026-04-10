# Changelog

## 2026-04-10 — Fork Session: UI Width Standardization

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
