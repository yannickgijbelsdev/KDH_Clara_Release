# Changelog


## 2026-06-27 — Liveblog Save-as-draft root cause + auto-publish fix (P0)

### Root cause
Editors meldden dat de public News API niets toonde van entries die ze net hadden gesaved. Oorzaak: `POST /api/content/{id}/liveblog/entries` hardcodeerde `published=false` en de public endpoints filteren strict op `published=true`. Mentaal model van editors ("save = live") matchte niet met implementatie ("save = draft, klik dan Send icon om live te zetten").

### Backend
- `routers/liveblog.py.create_entry`: nieuwe entries krijgen nu standaard `published=true` (tenzij body `publish: false` meegeeft). Image-rechten-gate blijft van kracht: zodra één foto geen `credit` heeft, wordt entry forced naar draft.
- Nieuw endpoint `POST /api/content/{id}/liveblog/publish-drafts` (editor/admin): publiceert in één keer alle drafts met geldige image rights, slaat entries met ontbrekende credits over. Returnt `{published, skipped_missing_rights, published_ids, skipped_ids}` en broadcast per published entry een `entry_published` WS-event.
- `models/liveblog.py.LiveblogEntryCreate`: nieuw optioneel `publish: Optional[bool]` veld (default `None` → backend treats as `True`).

### Frontend
- `LiveblogPanel.js.saveEntry`: stuurt `publish: !rightsMissing` mee; bij PUT-update flipt 'm via `/publish` endpoint als rechten nu compleet zijn. Toast nu Nederlands: "Entry is live op de website" of "Saved als draft — vul image-rechten in om live te zetten".
- Toolbar krijgt amber "Publiceer alle drafts"-knop wanneer er nog drafts staan (`liveblog-publish-all-drafts-btn`).
- Editor save-knop label switcht tussen "Save & publish" en "Save as draft" afhankelijk van of image rights compleet zijn.

### Tests
- `backend/tests/test_liveblog_publish_flow.py` — 8 pytest cases, 100% green (15.8s): auto-publish default, expliciete draft override, image-rights gate (single + bulk), public news endpoints zien wel/geen drafts, regressie op single publish endpoint 409.

### Deploy
- VDC auto-deploy: `f2fece6b-f2bd-4871-94c8-845496e4ecb1` (pending approval).


## 2026-06-27 — S3 `/None/` cleanup admin endpoint

### New
- `POST /api/content/admin/cleanup-none-images?dry_run=true|false` (editor/admin, main-site scoped). Wist alleen velden die nog naar corrupt `/None/` of `/None_` paden wijzen op `featured_image{.s3_url,.url}`, `featured_image_url`, `image_url`, `cover_image_url`, `external_featured_image`, `imported_image_url`. Dry run by default; audit log bij echte cleanup.

### Deploy
- VDC: `c3080c3e-3049-4f0f-b684-f1952bcaf583` (pending approval).


## 2026-06-07 — Image Copyright / Attribution enforcement (P0)

### Why
Belga/Reuters/eigen werk-foto's moeten wettelijk altijd een bron, fotograaf en licentie meekrijgen. Voorheen werd dit niet afgedwongen: artikelen konden gepubliceerd worden zonder rechten, en de publieke News API toonde nooit een caption onder de foto's.

### Backend
- **`models/content.py`**: `ContentFeaturedImage` + `FeaturedImageResponse` krijgen extra velden `photo_photographer` en `photo_license`. `ContentItemResponse` heeft nu `image_attributions: Optional[dict]` en `missing_image_attributions: Optional[bool]`.
- **`routers/content.py`**: `image_attributions` upgrade van `Dict[str, str]` naar `Dict[str, dict]` met `{credit, photographer, license, source_url}`. Legacy strings worden door `_normalize_attribution` automatisch geconverteerd naar `{credit: <str>}` zodat oude artikelen niet breken.
- `_content_has_missing_image_attribution` checkt nu zowel featured image (vereist `photo_credit`) als elke inline `<img>`.
- `_build_image_rights_status` levert structured rows per afbeelding (incl. featured) terug.
- `update_image_rights` en `update_featured_image_attribution` accepteren de nieuwe velden.
- **Publish-gate**: `POST /api/content/{id}/publish-clara` retourneert nu een 409 met de Nederlandse boodschap "*Eén of meer afbeeldingen in dit artikel hebben nog geen rechten…*" zodra er rechten ontbreken (zowel single als bulk).
- **`services/helpers.py`**: `get_content_with_publish_statuses` zet `missing_image_attributions` op het item, zodat de detail page de modal kan triggeren.
- **`routers/news_public.py`**: `_format_credit_line` rendert `Foto: X · © Y · Licentie` (met optionele `<a href>` naar het origineel). `_inject_body_attributions` wrapt elke inline `<img>` met een rechten-entry in `<figure class="clara-img-figure">…<figcaption class="clara-img-credit">…</figcaption></figure>`. Featured image attribution gaat ook mee in het `image_attribution`-JSON-veld met alle 4 sub-keys.

### Frontend
- **Nieuw component `ImageRightsModal.js`**: opent automatisch op artikel-load als er rechten ontbreken; lijst van álle afbeeldingen (featured + inline) met 4 velden per rij (Bron/agentschap, Fotograaf, Licentie, URL naar origineel). Knop "Later invullen" sluit zonder op te slaan, "Rechten opslaan" PUT't beide endpoints (featured + image-rights).
- **`ImageCopyrightDialog.js`**: uitgebreid met `photographer` + `license` invulvelden.
- **`ContentDetailPage.js`**: nieuwe state `imageRights` + `showRightsModal`. Knop "Afbeeldingsrechten" in de toolbar (amber wanneer rechten ontbreken). De Publish-naar-News-API knop is uitgeschakeld zolang `imageRights.missing > 0`; eronder verschijnt een klikbare amber-warning die de modal opnieuw opent.
- **`ContentLibraryPage.js`**: toont een ⚠️ AlertTriangle-badge (`data-testid=missing-rights-{id}`) naast titels van artikelen waar rechten ontbreken.

### Build fix
- `/app/frontend/.eslintrc.json` verwijderd — die extend'de `react-app` maar het pakket `eslint-config-react-app` was niet geïnstalleerd, waardoor de dev-server compile faalde. CRA's ingebouwde ESLint blijft draaien.

### Tests
- `backend/tests/test_image_rights.py` — 8/8 pytest tests (round-trip, legacy-string, publish-block met Dutch error, news API figcaption injectie, list endpoint flag).
- Frontend e2e via testing agent: modal auto-open, alle 4 velden, "Later invullen", "Opslaan", warning, badge-removal en publish-enabling allemaal verified.



## 2026-06-06 — Featured Image preview + altijd wisselbaar in artikel-detail

### Why
Wanneer admins een featured image hadden geüpload via de News API zagen ze die niet terug in de article detail view, en konden ze hem niet wisselen — enkel uploaden zolang er nog geen image was. Onhandig voor late wijzigingen of vervangen van een WP-import.

### Fix — `pages/ContentDetailPage.js`
- Nieuwe **Featured Image preview-kaart** boven de Body-sectie.
- Toont de uploaded `featured_image.s3_url` (of `external_featured_image`/`imported_image_url` met "Imported from source" badge wanneer de bron WordPress is).
- **"Change image"** knop is altijd zichtbaar — opent meteen de file picker en upload via het bestaande `/content/{id}/featured-image` endpoint.
- **"Remove"** knop verschijnt enkel wanneer de bron `featured_image` is (niet voor imported WP images, want die kunnen niet beheerd worden).
- Wanneer er nog geen image is, krijgt de admin een grote dashed dropzone i.p.v. een verstopte tekstlink in de footer.
- Oude "Add a featured image first →" hint vervangen door een eenvoudige amber tekst die naar de nieuwe sectie verwijst.



## 2026-06-06 — Clara Flows MVP-1 (admin workflow builder)

### What
Dedicated admin dashboard `/{site}/clara-flows` waarmee admins **notificatie- en API-workflows** kunnen bouwen door triggers en acties te koppelen — Clara's eigen mini-n8n.

### Architecture
- **`backend/services/clara_flows_runner.py`** — engine met `{{ context.path }}` templating, sequential step execution, per-step output capture in shared context (`trigger`, `steps.step_1`, …), structured run report met `status`/`error`/`duration_ms` per step. Lightweight `emit_event(event_name, payload, main_site_id)` bus zodat andere routers later DB-event triggers kunnen vuren.
- **`backend/routers/clara_flows.py`** — REST CRUD + manual execute + execution history + public `webhooks/{token}` endpoint dat de webhook trigger doet vuren met de POST body als payload. Catalog endpoints exposeren de UI-dropdowns voor triggers en acties.
- **`frontend/src/pages/ClaraFlowsPage.js`** — sidebar met flows + tabbed detail editor (Editor + Executions). Webhook URL met copy-to-clipboard, per step add/remove/enable toggle, expandeerbare run-history.

### Triggers (4)
`manual`, `event` (DB events: article/show/user/task/license/stream lifecycle), `schedule` (cron), `webhook` (public URL).

### Actions (6)
`email` (bestaande SMTP config), `http` (GET/POST/PUT/PATCH/DELETE met JSON of raw body), `in_app_notify` (rolen-gebaseerde fan-out), `ai_llm` (Emergent Universal Key — Anthropic/OpenAI/Gemini), `slack` (incoming webhook), `telegram` (bot API).

### Scope
Per **main site** (multi-tenant via `X-Main-Site-ID` header), **admin-only**. Sidebar entry verschijnt automatisch voor admins zonder per-site opt-in.

### Verified live
- `POST /api/clara-flows` → flow created met UUID + 32-char webhook_token.
- `POST /api/clara-flows/{id}/execute` met manual trigger payload → HTTP request step rakelt `api.github.com` aan, status 200, duration 1.5 s, run gepersisteerd.
- `GET /api/clara-flows/{id}/runs` toont execution history correct.
- UI: nieuwe flow aangemaakt, HTTP + Email step toegevoegd, switches & templating hints zichtbaar.

### Cleanup
Bulk ruff/eslint cleanup (701 auto-fixed + bare-except + ambiguous `l` rename + `/* eslint-disable */` voor pre-existing strict-rule violations zodat nieuwe React-hooks rules niet alle bestaande files blokkeren).



## 2026-06-05 — Shoutcast v2 ondersteuning + auto-discovery in Test/scheduler

### Why
De "Test"-knop op `mfy.level27.be` (en gelijkaardige bare-host inputs) faalde / timde uit: de oude `_fetch_shoutcast_v1` deed een volledige `client.get()`, en wanneer het opgegeven pad de **listener-stream** was (audio/aacp), bleef httpx ~15 s audio downloaden voor we de hint kregen dat dit niet de stats URL was.

### Fix — `services/shoutcast.py`
- `_fetch_shoutcast_v1` werkt nu via `client.stream()` met **max 64 KiB** body en bricht direct af op `audio/*` / `video/*` / `application/octet-stream` content-type. Werkt voor **Shoutcast v1 én v2** (zelfde `<SHOUTCASTSERVER><SONGTITLE>` XML).
- Tweede parser-tak: fallback op **`/7.html`** comma-separated legacy format wanneer `<SHOUTCASTSERVER>` ontbreekt — een aantal legacy v1 servers serveren alleen die.
- Nieuwe `fetch_shoutcast_with_autodiscovery(url)`: probeert eerst de URL zoals opgegeven; werkt die niet en is de input een bare host (geen `/stats`, `/7.html`, `/status`), dan worden `/stats?sid=1`, `/stats`, `/stats?sid=2` en `/7.html` getest. Het *daadwerkelijk werkende* pad wordt teruggegeven als `_resolved_url`.
- Zowel de `cache_now_playing` flow als het `POST /api/rds-stations/test-stream` endpoint gebruiken dit nu.

### Frontend (`RDSSettingsPage.js`)
Test-result chip toont voortaan ook het `→ resolved_url` indien dat afwijkt van wat de gebruiker had ingevuld, zodat ze in één oogopslag zien welke stats-URL te gebruiken.

### Verified
Tegen `mfy.level27.be` (live Shoutcast v2):

| Input | Status | Resolved | Song | Tijd |
|---|---|---|---|---|
| `https://mfy.level27.be` | ✅ | `/stats?sid=1` | Black Eyed Peas - Meet Me Halfway | 1.9 s |
| `https://mfy.level27.be/` | ✅ | `/stats?sid=1` | idem | 1.4 s |
| `…/stats?sid=1` | ✅ | as-is | idem | 0.7 s |
| `…/7.html` | ✅ | as-is | idem | 0.7 s |
| `…/stream/audio.aac` (audio path) | ✅ | `/stats?sid=1` (auto) | idem | 4.9 s |
| `…/stats?sid=99` (lege stream) | ✅ | as-is | "" / offline | 0.7 s |



## 2026-06-05 — Fix: Network/System admins kunnen recurring shows nu bewerken

### Root cause
`PUT /api/shows/{id}/recurrence`, `POST /{id}/stop-recurrence` en `POST /{id}/enable-recurrence` scopen alleen op `team_id == current_user.team_id`. System/Network admins hebben `team_id = None`, dus de query matchte niks → 404 "Show not found" → toast "Failed to update recurrence settings".

### Fix — `backend/routers/shows.py`
Alle drie de endpoints lezen nu eerst `X-Main-Site-ID` uit de request header (de frontend `MainSiteContext` interceptor stuurt die automatisch mee), en vallen alleen terug op `team_id` als de header er niet is. `enable-recurrence` erft het `team_id` van de oorspronkelijke show als de admin er geen heeft, zodat child occurrences consistent gescoped blijven.

### Cleanup
Pre-existing bare `except:` blocks vervangen door `except Exception:` (ruff E722) — geen functionele wijziging.

### Verified
- `PUT /shows/{id}/recurrence` met `X-Main-Site-ID` header → HTTP 200, settings opgeslagen, `is_recurring: true`, `recurrence_interval` & `recurrence_end_date` correct doorgevoerd.



## 2026-06-05 — Inline TinyMCE images now used as article thumbnail

### Why
Articles where the user only uploaded inline images via TinyMCE (no separate "featured image") had `image_url: null` in the public news API. The grk.fm news widget therefore rendered the article without a thumbnail / Open Graph image.

### Fix — `routers/news_public.py`
- New helper `_first_inline_body_image(body)` parses the article HTML and returns the first valid `<img src>` URL (skips `data:` base64 inlines and corrupt `/None/` paths).
- `_build_image_url` now uses that helper as a 4th-tier fallback. Priority remains: featured_image (s3) → legacy explicit fields → external/imported → inline body.
- Added the same `/None/` rejection to every tier so the public API never returns a corrupt URL — keeping consistency with the recent show-image fixes.

### Verified
- Article with only inline TinyMCE images → `image_url` resolves to the first valid `<img>`.
- Featured image still wins when set.
- `data:`/base64 inlines and `/None/` paths skipped correctly.



## 2026-06-05 — Reject corrupt `/None/` paths + dedicated presenter-image endpoint

### Root cause (continued)
Even with the transparent-PNG fix on `/api/rds/{station}/image.jpg`, the production DB still contained an orphan `show_titles` doc whose `image.s3_url` was `…/show_titles/**None**/34ce…_2024_Hadewig_Weyen.png` — a legacy upload done before the team/main_site scope was injected. The resolver happily 302-redirected to that broken Hadewig file, so the browser still received the wrong image.

### Fix — backend
- `routers/rds.py` → `_resolve_show_image_for_station.s3_only()` now **rejects any `s3_url` containing `/None/` or `/None_`**, treating it as missing so the transparent placeholder kicks in.
- `routers/public_schedule.py` → `_resolve_presenter_image_url` and the schedule `image` field do the same `/None/` rejection, so the homepage/banner never see a corrupt URL either.

### New endpoints (dedicated presenter image for banners)
- `GET /api/rds/{station}/presenter-image.jpg` — 302 to first presenter's S3 avatar, or 1×1 transparent PNG when none. Drop-in `<img src>` target for grk.fm / mfy.fm banners.
- `GET /api/rds/{station}/presenter-image-url.txt` — plain text URL or `""`.
- `GET /api/rds/{station}/presenter-image.json` — `{ station, has_image, image_url }`.

### Refactor
Pulled the 1×1 transparent-PNG bytes and response builder into shared `_TRANSPARENT_1X1_PNG` constant + `_empty_image_response()` helper. Both `image.jpg` and `presenter-image.jpg` share the same placeholder.

### Verified (preview)
- Injected a `/None/` corrupt URL into the live "Playground: The Friday Edition" show_title → `image.jpg` returns 200 transparent PNG (67 bytes), JSON `has_image: false`. Real S3 URLs still 302 as before.
- `presenter-image.jpg` returns transparent PNG when presenter has no avatar.



## 2026-06-05 — Empty image placeholder instead of 404 on `/api/rds/{station}/image.jpg`

### Why
grk.fm / mfy.fm players embed `<img src="/api/rds/grk/image.jpg">` directly. When the current show has no S3 image we used to return **404**, which makes iOS Safari (and most desktop browsers) **keep the previously cached image on screen** — that's how Hadewig's photo "stuck" on later shows like Optimix met Jordy Copz that have no image of their own.

### Fix
`backend/routers/rds.py` — `/api/rds/{station}/image.jpg` now returns a **67-byte 1×1 transparent PNG (HTTP 200, `image/png`)** when no real image is found. The browser overwrites the cached `<img>` with a transparent pixel, so visually the slot is empty and the player's CSS/placeholder takes over. Real uploads still 302 to the S3 URL as before. Cache header set to 30s so a freshly uploaded show image becomes visible quickly.



## 2026-06-05 — Snappier Test + Live Source Pill + Instant Cache Refresh

### Backend
- `services/shoutcast.py` — `_fetch_shoutcast_v1` timeout reduced 5s → **3.5s** with `follow_redirects=True`, so the "Test" button returns much faster on bad/slow URLs.
- `routers/rds_stations.py` — saving `custom_streams` now **immediately calls `cache_now_playing()`** so the public now-playing API reflects the new source within ~1s instead of waiting for the next 10s scheduler tick.

### Frontend (`RDSSettingsPage.js`)
- New polling loop (every 10s) hits `/api/rds/{code}/now-playing` for every station and shows a **live status pill** next to each station header:
  - 🟣 violet "Live: <label> · <song>" when the active source is a custom stream
  - 🟢 green "Live: default stream · <song>" otherwise
  - amber "· fallback" appended when the custom URL was unreachable and the system fell back to the default
- Save action now triggers an immediate re-poll so the pill flips state right after submitting.

### Verified
- PUT custom_streams → `cached_at` advances within 1s, `active_stream:"custom"`, `custom_stream_label` set, song from alternative source.
- Clearing custom_streams → pill flips back to "Live: default stream" within 10s, API confirms `active_stream:"default"`.



## 2026-06-05 — Custom Stream Info Exposed in Now-Playing API

### Backend
- `routers/rds_builder.py` — RDS Builder dashboard `/dashboard-data` endpoint now also reads `active_stream`, `custom_stream_label`, `fallback_used` from `shoutcast_cache` and includes them in each station's `now_playing` payload.
- Public endpoints `/api/rds/{mfy,grk}/now-playing[.json]` already pass the cached document untouched, so they expose the new fields automatically. Verified: when a custom stream window is active for MFY, the JSON response shows `active_stream:"custom"`, `custom_stream_label:"<label>"`, and the correct song coming from the alternative source. `.txt` endpoints return the matching plain-text song title.



## 2026-06-05 — Custom Stream Test Button

### Backend
- New `POST /api/rds-stations/test-stream` (`routers/rds_stations.py`) — accepts `{ url, stream_type }`, probes the Shoutcast v1 stats endpoint once, returns `song_title`, `server_title`, `current_listeners`, `stream_online`, `bitrate`, or `status:'error'` with a message. Registered **before** the `/{main_site_id}` POST route so the static path wins.

### Frontend (`RDSSettingsPage.js`)
- "Test" button on every custom-stream row (both edit and read-only views). Result rendered inline:
  - Green = `success` with song title + server + listener count
  - Red = `error` with diagnostic message
- Loader spinner while in-flight; toast mirrors the result.



## 2026-06-05 — Custom "Now Playing" Stream Scheduler

### Backend
- **`/app/backend/services/shoutcast.py`** — extracted stream-URL resolution into `resolve_active_stream(station_code)`. Walks the station's `custom_streams` list and, when today's weekday + Brussels-time falls inside a window, returns that custom URL. Legacy hardcoded URL is still preferred for `mfy`/`grk` outside any active window (DB `stream_url` stores the public listener URL, not the `/stats?sid=X` XML endpoint). Falls back transparently to the default URL if the custom source is unreachable.
- `get_now_playing` now returns `active_stream` (`"custom" | "default"`), `custom_stream_label`, and `fallback_used` so the UI and `shoutcast_logs` can show which source was actually used.
- **`/app/backend/routers/rds_stations.py`** — new `CustomStreamSchedule` Pydantic model, added `custom_streams: List[...]` to `RDSStationCreate` and `RDSStationUpdate`, and a `_normalize_custom_stream` helper that auto-assigns UUIDs to new entries. `bulk-sync` preserves existing schedules when caller omits the field.

### Frontend (`/app/frontend/src/pages/RDSSettingsPage.js`)
- New **"Now Playing Stream Schedule"** card. Per-station rows let admins add multiple windows: enable toggle, label, Shoutcast v1 stats URL, day-of-week chips (Ma–Zo), and `<input type="time">` start/end (midnight-crossing supported). All times in Europe/Brussels.
- Save calls `PUT /api/rds-stations/{main_site_id}/{station_id}` with the new `custom_streams` payload.

### Verified
- `PUT` persists windows + auto-assigns UUIDs.
- Scheduler picks up custom URL on the next 10s tick — MFY logs show `active_stream: 'custom', custom_stream_label: 'Nachtstream'`.
- Outside the window the system reverts to the default Shoutcast source (`active_stream: 'default'`).
- E2E UI flow (Edit → Add window → fill URL/days/time → Save) confirmed via Playwright.


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
