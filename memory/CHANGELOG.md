# Changelog

## 2026-04-08 — Fork Session: Voice Support, 3D Images & S3 Migration

### New Feature: Clara Voice Support (AI Phone Calls)
- Built real-time AI voice call feature using OpenAI Realtime API (WebRTC)
- Created `voice_support.py` backend router with session management, transcript saving
- Created `VoiceCallWidget.js` with incoming call overlay, active call UI, mute/minimize, transcript display
- Integrated voice call trigger in header (green phone icon, Enterprise-only)
- Added "Or call Clara Support" button in ClaraAssistant
- Extended ClaraAssistantContext with `voiceCallRequested` / `requestVoiceCall` / `clearVoiceCallRequest`
- All tests passed (100% backend 9/9, 100% frontend)

### 3D Isometric Room Images
- Generated custom 3D isometric room illustrations via image_generation_tool
- Violet developer workspace for Code Assistant card
- Orange support command center for Enterprise Support card
- Applied to EnterpriseAssistantPage.js MODE_CONFIG

### Enterprise Support Icon
- Replaced HeadphonesIcon with Sparkles (enterprise icon) on Enterprise Support card

### S3 Object Storage Migration (P0)
- Migrated support ticket attachments from base64/MongoDB to S3
- Added GET /api/support-tickets/files/{path}?auth=TOKEN proxy endpoint
- Frontend getAttachmentUrl() helper with backwards compatibility
- All tests passed (iteration_140)

## Previous Sessions
- Clara Enterprise Assistant (Code + Support modes with Claude)
- Responsive topbar navigation with ResizeObserver
- Support ticket UX improvements
- PWA install prompt overlay
- RDS auto-refresh background polling
- WordPress publishing fixes
- Cloudflare WAF sync fixes
