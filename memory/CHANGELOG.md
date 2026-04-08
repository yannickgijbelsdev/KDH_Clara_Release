# Changelog

## 2026-04-08 — Fork Session: 3D Images & S3 Migration

### Completed
- **3D Isometric Room Images** — Generated and applied custom 3D isometric room illustrations for Enterprise Assistant mode selection cards:
  - Violet/purple developer workspace for Code Assistant
  - Orange/amber support command center for Enterprise Support
  - Applied to `EnterpriseAssistantPage.js` MODE_CONFIG heroImage fields

- **S3 Object Storage Migration for Support Tickets** (P0)
  - Migrated `upload_attachment` endpoint from base64 encoding to S3 upload via `object_storage.py`
  - Migrated `upload_recording` endpoint from base64 encoding to S3 upload
  - Added `GET /api/support-tickets/files/{storage_path}?auth=TOKEN` proxy endpoint
  - Updated `UserTicketsPanel.js` with `getAttachmentUrl()` helper for S3 URL + backwards compatibility
  - Updated `SupportTicketsPage.js` with same helper
  - All tests passed (backend 82%, frontend 100%)

### Previous Sessions (Summary)
- Clara Enterprise Assistant (Code + Support modes with Claude)
- Responsive topbar navigation with ResizeObserver
- Support ticket UX improvements (async emails, gray closed tickets, hidden admin names)
- PWA install prompt overlay
- RDS auto-refresh background polling
- WordPress publishing fixes
- Cloudflare WAF sync fixes
- Avatar site-switcher dropdown filtering
