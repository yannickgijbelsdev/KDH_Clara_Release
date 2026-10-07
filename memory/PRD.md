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
- **Clara Flows** — Admin-only visual workflow builder for notifications & API flows (triggers: manual/event/schedule/webhook; actions: email/HTTP/in-app/AI/Slack/Telegram; `{{ trigger.x }}` templating; per main site)
- **Image Copyright Enforcement** — every featured/inline image must carry bron, fotograaf, licentie en URL naar origineel; publish-naar-News-API geblokkeerd zonder rechten; `<figcaption>` auto-injected in News API HTML body; "!" badge in Content Library.

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

## RDS Custom Stream Scheduler (Jun 2026)
- Each `rds_stations` doc may carry a `custom_streams` array. Each entry: `{ id, enabled, label, url, stream_type, days[0..6], start_time HH:MM, end_time HH:MM }`.
- `resolve_active_stream(station_code)` (in `services/shoutcast.py`) picks the first active window using Brussels-TZ weekday + `is_time_between` (midnight-crossing supported). Legacy hardcoded `SHOUTCAST_SERVERS` is preferred when no custom window is active.
- On HTTP failure of the custom source, transparently retries the default `stream_url` so MagicRDS never blanks out.
- UI: `RDSSettingsPage.js` → "Now Playing Stream Schedule" card, per station (`PUT /api/rds-stations/{main_site_id}/{station_id}`).

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


## 2026-07-07 — Room Bookings System
### What shipped
- **Backend** (`routers/bookings.py`, `models/bookings.py`): CRUD for room bookings + admin-only Rooms management on top of the existing `studios` collection. Every booking may declare `blocks_room=True/False`; conflict detection compares against overlapping shows AND bookings sharing the same room where both sides block. Half-open interval semantics let back-to-back slots coexist.
- **Extended booking fields**: `contact_person`, `contact_email`, `attendees`, plus a `recurrence_type` (`none`/`daily`/`weekly`/`monthly`) + `recurrence_end_date`. Creation expands the series into sibling documents linked by `parent_booking_id`; a pre-scan aborts the whole POST if any future occurrence would conflict (no half-populated series).
- **Series-aware update/delete**: `PUT /api/bookings/{id}?…` accepts `update_series=true` in the body to propagate metadata to every sibling while leaving each start/end intact; `DELETE /api/bookings/{id}?delete_series=true` wipes the parent + siblings.
- **Shows integration**: `POST /api/shows` now runs the same `find_room_conflict` before insert (previously only `PUT`). `ShowCreate`/`ShowUpdate` carry `blocks_room` (default True); legacy shows without the field default to blocking via `$ne: False` so migrations don't leak room slots.
- **Frontend** (`RoomBookingsPage.js`): Two-tab surface (Boekingen / Ruimtes). Booking dialog exposes ruimte, titel, start/eind, contactpersoon, contact e-mail, aantal personen, herhaling + einddatum, beschrijving, en "Blokkeer de ruimte" toggle. Series badges + "geen block" chips on the list. Delete/edit surface a confirm prompt for series propagation. Rooms tab hides admin-only actions for non-admins.
- **CreateShowDialog** + **ShowDetailPage**: added Studio selector + "Blokkeer de ruimte" checkbox in both create + edit modes; 409 payloads surface as friendly toasts.
- **Nav**: new "Room Bookings" entry under Shows group, auto-enabled when `shows` or `calendar` features are on.

### Bug fixed by testing agent
- `bookings.py` recurrence loop reused the same `_id` (motor mutates the source dict on insert) → every 2nd sibling raised DuplicateKeyError. Fixed with `base_doc.pop('_id', None)` before the loop. Regression covered by `/app/backend/tests/test_room_bookings.py` (19 pytest scenarios, 100% green).

### Status
- Backend: ✅ 19/19 room-booking pytests green.
- Frontend: ✅ admin room-bookings smoke green (page renders, tabs work, dialog contains every new field).
- Not yet manually verified: non-admin UI restriction on the Rooms tab + ShowDetailPage save flow (API-level 403s + conflict responses are covered by pytest).
- Next: VDC push once user greenlights.


## 2026-10-03 — Clara Campaigns Layout + Koodh Avatar
### What shipped
- **Header lockup**: chevron.png + 1px slate divider + "Clara" wordmark on both MainSiteDashboardLayout and NetworkHeader; header canvas is `bg-[#F5F6F8]` (no border/blur) so it blends with the workspace background.
- **Compact user menu**: hidden name/role; the trigger is now avatar + chevron, preceded by a round Help icon and a vertical divider. Dropdown panels dropped backdrop-blur in favour of solid white + slate border + shadow-lg.
- **Login redesign**: full-bleed KOODH cosmic bear background; a single centred white rounded card with the chevron+divider+Clara lockup, "Welcome back" heading and periwinkle Sign in button. Removed the floating feature-bubbles column.
- **TopLoader**: progress bar is now `bg-blue-500` (was orange).
- **Universal Koodh avatar fallback** (`utils/avatar.js`): `getAvatarUrl` always returns a URL — real avatar if present, otherwise `/koodh-avatar.png`. Every initials fallback across the app is now the Koodh bear mascot (no "Y" / "A" circles any more).
- **Universal periwinkle buttons**: Shadcn `Button` component variants (default, destructive, outline, secondary, ghost) all render `bg-[#7380b6] hover:bg-[#5f6ca3] text-white`. All raw `<button>` and `<Button>` instances across `pages/` + `components/` that used `bg-rose-600`, `bg-zinc-900`, `bg-slate-900` or the orange-era legacy palette as filled CTAs were swept to the same hex. Login submit, LoginWizard "Enter Clara", New Server, New Show, New Room, Save/Done flows, Content Deploy — one tone across the app, white text.

### Not shipped (intentional)
- Status badges, delete-icon tints, dark pill-nav active state and secondary outline buttons kept their current palette to preserve meaning (the user asked only for CTA buttons to turn blue + white).

### Status
- Frontend: ✅ compiles clean (only pre-existing React Hook warnings remain).
- Verified by screenshot: login page, dashboard header + "New Server" CTA, loader bar.
- Testing agent run queued (iteration_173).



## 2026-10-05 — Transparent placeholders · Rundown Export redesign · Team Chat unread notifications

### What shipped
- **Transparent fallback images**: Content Library rows now render the universally-transparent `/show-placeholder.png` (RGBA 0,0,0,0) in place of the old grey `TypeIcon` box. Shows, calendar sidebars and show-management titles were already routed through `<PresenterComposite>` which also falls back to the same transparent asset.
- **Rundown Export URL migrated** from `clara.koodh.com` → `clr.koodh.com` for both the HTML export and the new PDF action (`ShowDetailPage.js :: handlePrintView / handleExportPDF`).
- **Rundown Export redesign** (`backend/routers/shows.py :: generate_print_html`):
  - Clara wordmark + Koodh×Clara logo top-left, "Generated …" timestamp top-right.
  - Hero block: eyebrow pill → Show title → Date / Airtime / Status meta grid → Presenter chips (avatar + name, falls back to initial on blue-gradient).
  - Rundown items table with cumulative Start-time column (computed from `show.start_time` + each item's duration), Clara-blue column headers, zebra rows, pill-shaped type badges, media attachment line in blue.
  - Full `Outfit` typography, Clara-blue (`#7380b6`) palette, periwinkle pill action buttons ("Close" / "Print / Save PDF"), rounded 20px card on neutral background.
  - `?pdf=1` query auto-triggers `window.print()` on load so the PDF button lands users directly on the Save-as-PDF dialog.
  - Footer "Clara · clr.koodh.com".
- **ShowDetailPage header**: new `PDF` pill next to `Export` (`data-testid="export-pdf-rundown-btn"`).
- **Team Chat unread notifications** (the P0 missed from the previous session):
  - `MainSiteDashboardLayout.js` polls `GET /api/chat/unread-count` every 20 s + on window focus and dispatches `clara:chat-unread` CustomEvent with `{total, threads}`.
  - Profile avatar in top-right now carries a periwinkle unread badge (`data-testid="avatar-chat-unread-badge"`) with the unread count (`9+` when >9), ring-white, shadow.
  - `DashboardHome.js` listens for the same event and primes once on mount; when `total > 0` it shows a dismissable notice above the welcome panel (`data-testid="dashboard-chat-unread-notice"`) with a "Open chat" CTA that routes to `/{mainSite}/chat`.

### Verification
- Rundown HTML endpoint tested via localhost → 11.9 KB response, 28 Clara-blue/presenter-chip style hits; visually confirmed via Playwright screenshot (logo, hero, presenters, items table, footer all rendering correctly).
- Dashboard: created a temporary `group`-type thread with admkoodh as `member_ids` and 2 messages from another user → verified avatar badge "2" + notice "You have 2 unread messages" visible on dashboard; cleaned up after.
- Mobile 390x844 verified for dashboard layout; existing nav overflow unchanged (pre-existing).

### Files touched
- `/app/backend/routers/shows.py` — rewrote `generate_print_html` + `get_show_rundown_print_view` (presenters, cumulative start-times, `pdf` param)
- `/app/frontend/src/pages/ShowDetailPage.js` — URL swap + new PDF button
- `/app/frontend/src/pages/ContentLibraryPage.js` — transparent fallback image
- `/app/frontend/src/components/MainSiteDashboardLayout.js` — chat unread polling + avatar badge
- `/app/frontend/src/pages/DashboardHome.js` — dashboard unread notice component

### Status
- Backend: ✅ reloads clean, endpoint returns 200 with new HTML template.
- Frontend: ✅ renders without new console errors (pre-existing DialogContent warning unchanged).
- Testing: manual Playwright smoke + rendered HTML preview.


## 2026-10-06 — PresenterComposite priority fix (Team Settings avatars win)

### Problem
Previous version of `PresenterComposite.jsx` short-circuited to the legacy manually-uploaded title image whenever `fallbackSrc` was passed, so shows kept rendering old uploaded images instead of the presenters' avatars from Team Settings. User flagged: *"Het principe met de presenter image werkt nog niet, dat je kijkt wie de presenters zijn en dan de avatar/images van die personen in team settings neemt."*

### Fix
Flipped the resolution order inside `/app/frontend/src/components/PresenterComposite.jsx`:
1. **Presenters first** — if `presenters[]` is non-empty, render the overlapping-avatar composite using `getAvatarUrl(p)` (which falls back to Koodh bear for presenters without an uploaded photo).
2. **Legacy title image** — only when there are zero presenters AND a `fallbackSrc` is set.
3. **Transparent placeholder** — otherwise.

Also fixed two mis-aligned keyword arguments in `backend/routers/shows.py` (`create_show`): `get_presenters_info(..., team_id)` was being treated as `main_site_id`. Now both branches (recurring + single) call with explicit `main_site_id=` and `team_id=` keywords.

### Verified
- `Social Club` (Yannick Gijbels, has avatar) → header shows real avatar `/api/uploads/avatars/6102f41f...png` on both desktop (1920) and mobile (390).
- `Genkluistert` (Mike Cnudde, no avatar) → header falls back to Koodh bear (correct behaviour until admin uploads Mike's avatar in Team Settings).
- Show Management list, Calendar sidebar and Show Detail header all use the same component path.

## 2026-10-06 — Public Rundown Share Link

### What shipped
Guests can now open a rundown without a Clara account via a secret share token.

**Backend** (`/app/backend/routers/shows.py` + `/app/backend/routers/public_schedule.py`):
- Refactored HTML builder into `_build_rundown_html(show, pdf, is_public)` so the authenticated print view and the public view share one source of truth.
- `POST /api/shows/{show_id}/rundown-share` — editor/admin only, idempotent, returns `{share_token, public_url}`. Token is 64-char hex, stored on `shows.rundown_share_token` with a `rundown_share_created_at` timestamp.
- `GET /api/shows/{show_id}/rundown-share` — reads current token (null if none).
- `DELETE /api/shows/{show_id}/rundown-share` — revokes.
- `GET /api/public/rundown/{share_token}` — public, no auth. Renders the same Clara-blue HTML but with eyebrow "Shared rundown" and footer "Shared via Clara · clr.koodh.com". Supports `?pdf=1` auto-print. 404s if token is revoked or wrong.
- Paths deliberately use `rundown-share` (not `rundown/share`) to avoid being shadowed by `/{show_id}/rundown/{item_id}`.

**Frontend** (`/app/frontend/src/pages/ShowDetailPage.js`):
- New **Share** pill in the show header (next to Export / PDF) with `data-testid="share-rundown-btn"`.
- Dropdown menu offers "Copy public link" (`share-copy-link-item`) and "Revoke public link" (`share-revoke-item`, red).
- "Copy" calls `POST /rundown-share`, writes the public URL to clipboard, and shows a toast with the URL. If the Clipboard API is blocked, a `window.prompt` lets the user copy it manually.

### Verified
- Full e2e via localhost: POST → token created, idempotent re-POST returns same token, GET reads it, public endpoint returns 11.9 KB HTML with "Shared rundown" eyebrow, DELETE → 204, subsequent public GET → 404.
- UI: Share dropdown renders correctly with both menu items, next to Export / PDF.



## 2026-10-07 — RDS presenter-composite: multi-presenter + transparent slots

### Problem
`GET /api/rds/{station}/presenter-composite.png` previously skipped any presenter without an avatar in Team Settings. A show with 2 presenters where only 1 had a photo rendered as a single-circle PNG — not reflecting the actual line-up — and the "nobody has an avatar" case fell straight through to the plain placeholder without slot layout.

### Fix (`/app/backend/routers/rds.py :: get_station_presenter_composite`)
- Build a `url_by_id` dict keyed by `presenter_ids` so **every presenter keeps a slot** in the composite, even when they have no avatar.
- Order the slots by the show's `presenter_ids` order (preserves "lead presenter first").
- Slots without an avatar are left fully transparent (we simply don't `paste()` onto the RGBA(0,0,0,0) canvas) — matches the frontend `PresenterComposite.jsx` behaviour.
- When every presenter is avatarless, return the packaged transparent placeholder as before.

### Verified
- 2 presenters (1 with avatar, 1 without) → 634×512 RGBA PNG, Yannick's photo on the left, right slot fully transparent.
- 3 presenters (1 with avatar, 2 without) → 884×512 RGBA PNG with 2 transparent slots after Yannick's photo.
- 0 presenters-with-avatar → 1366×808 transparent placeholder (unchanged behaviour).
- Test data seeded + cleaned via Mongo.
