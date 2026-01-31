# Radio Show Planning & Rundown Dashboard - PRD

## Original Problem Statement
Build a web-based dashboard that allows radio editors to plan radio shows and prepare detailed rundowns. The focus of this MVP is show preparation, not live broadcasting. Features include:
- MVP 1: Show planning and rundown management
- MVP 2: Team and user management with roles
- MVP 3: Content Library and Multi-site WordPress Publishing
- MVP 4: Collaboration, Media, Permissions, and Recurring Shows
- Step 4.1a: Enhanced Recurrence Pattern UI + Day Selection

## Architecture
- **Frontend**: React 19 with TailwindCSS, Shadcn/UI components
- **Backend**: FastAPI (Python) with async MongoDB (Motor)
- **Database**: MongoDB
- **Authentication**: JWT-based email/password login with role-based access
- **Drag & Drop**: @dnd-kit/core and @dnd-kit/sortable
- **WordPress Integration**: httpx for REST API calls (one-way sync)

## User Personas
### Admin
- Can manage team settings and users
- Full access to create, edit, delete shows and series
- Can invite new users and assign roles
- Can connect multiple WordPress sites for publishing
- Can create Show Series and generate occurrences
- Can assign users to shows/series

### Editor
- Can create and edit content library items
- Can publish content to connected WordPress sites
- Can edit assigned shows and occurrences
- Cannot manage team, users, WordPress connections, or create series

### Presenter (NEW in MVP 4)
- Can edit rundowns for shows they are assigned to
- Can upload media and attach to shows
- Cannot create shows or manage content publishing
- Limited content/media editing capabilities

### Viewer
- Read-only access to shows, rundowns, and content library
- Cannot create or edit anything

## Core Requirements (Static)
### MVP 1 (Complete)
1. Authentication: Email/password login with JWT tokens
2. Show Management: Create, edit, delete shows with title, description, date, times, status
3. Rundown Management: Add/edit/delete rundown items with drag-drop reordering
4. Status Filtering: Filter shows by draft/scheduled/completed
5. Calendar View: Monthly calendar with show scheduling
6. Auto-duration: Estimated speaking time based on word count (150 wpm)
7. MagicRDS Integration: Clean text endpoint at /api/rds/live

### MVP 2 (Complete)
1. Team Management: Each user belongs to one team
2. User Roles: Admin, Editor, Presenter, Viewer with different permissions
3. User Invitations: Admins can invite users with temporary passwords
4. Team-scoped Shows: Users only see their team's shows
5. Role-based UI: Viewers see read-only interface

### MVP 3 (Complete - January 9, 2026)
1. Content Library: Central repository of reusable content items
   - Types: text, link, reference
   - Fields: title, body, excerpt, external_url, tags, status (draft/ready)
   - Search and filter by type, status, tags
   - Team-scoped content
2. Multi-site WordPress Connections (Admin only):
   - Connect multiple WordPress sites per team
   - Each site has: name, URL, username, app_password, default settings, active status
   - Test connection functionality
3. Multi-site Publishing (One-way sync):
   - Publish content to one or more WordPress sites
   - Per-site configuration: post type (post/page), status (draft/publish)
   - ContentItemPublish join table tracks sync status per site
   - Shows published status, permalink, and errors per site
   - Re-sync capability for failed publishes
4. Featured Image Support:
   - Upload featured image per content item per WordPress site
   - Sync featured image to WordPress media library during publish

### MVP 4 (Complete - January 9, 2026)
1. **Internal Team Chat**:
   - Team-scoped messaging system
   - Default team chat thread per team
   - Show-specific chat threads (optional)
   - Real-time message display with polling
   - Chronological message ordering with date grouping
   
2. **Media Library**:
   - Upload documents: PDF, DOCX, TXT
   - Upload audio: MP3, WAV, M4A
   - Team-scoped media assets
   - Search and filter by kind (document/audio)
   - Rename and delete assets
   - Attach media to shows (ShowMedia)
   - Attach media to rundown items (RundownItemMedia)
   - Audio player for audio files
   
3. **Permissions & Assignments**:
   - New 'presenter' role added
   - ShowAssignment model: Assign users to shows with role
   - SeriesAssignment model: Assign users to series
   - Only admins can create shows/series
   - Editors/Presenters can edit rundowns for assigned shows
   
4. **Recurring Shows (Calendar Recurrence)**:
   - ShowSeries model: Template for recurring shows
     - Title, description, default times
     - Recurrence rule (RRULE format): Daily, Weekly by day, Weekdays, etc.
   - ShowOccurrence model: Individual show instances
     - Linked to series (or standalone)
     - Each occurrence has its own fresh, empty rundown
     - Status: draft/scheduled/completed
   - Rundown model: Linked to occurrences
   - RundownItemsV2: Rundown items for occurrences
   - Generate occurrences for N weeks ahead
   - Clean rundown every time (no carry-over from previous)

### Step 4.1a (Complete - January 9, 2026)
1. **Enhanced Recurrence Pattern UI**:
   - New ShowSeries fields (additive, nullable):
     - `recurrence_type`: "none" or "weekly"
     - `start_date`: Required start date for recurrence
     - `end_date`: Optional end boundary
     - `interval_weeks`: 1-4 (every N weeks)
     - `days_of_week`: Array [0-6] where 0=Mon, 6=Sun
   - Day-of-week toggle buttons in create/edit dialog
   - Interval dropdown (Every week, Every 2/3/4 weeks)
   - End condition: "No end date" or "Until date" options
   - Live preview text showing recurrence pattern
   - Backward compatible with legacy RRULE-based series

## What's Been Implemented
### January 6, 2026 - MVP 1
- [x] JWT authentication (register/login/logout)
- [x] Shows CRUD with status filtering
- [x] Rundown items CRUD with drag & drop reorder
- [x] Calendar view for scheduling
- [x] Auto-duration calculation from notes text
- [x] MagicRDS endpoint for live show title

### January 9, 2026 - MVP 2
- [x] Team model with name and creation date
- [x] User roles (admin/editor/viewer)
- [x] Team Settings page (admin only)
- [x] User invitation with temporary password
- [x] Role management (change user roles)
- [x] Remove users from team
- [x] Team-scoped shows (users only see their team's shows)
- [x] Role-based UI restrictions (viewers see read-only)
- [x] Legacy data migration on startup

### January 9, 2026 - MVP 3
- [x] Content Library with CRUD operations
- [x] Content types: text, link, reference
- [x] Search and filter content by title, type, status, tags
- [x] Multi-site WordPress connections management
- [x] Add/edit/delete WordPress sites (admin only)
- [x] Test connection functionality
- [x] Multi-site publish dialog with site selection
- [x] Per-site publish configuration (post type, status)
- [x] Per-site sync status tracking (ContentItemPublish)
- [x] Publish status display on content detail page
- [x] Featured Image model (ContentItemFeaturedImage) - per content+site
- [x] Featured image upload and sync to WordPress

### January 9, 2026 - MVP 4
- [x] Team Chat system
  - [x] ChatThread model (team/show types)
  - [x] ChatMessage model with user attribution
  - [x] GET/POST /api/chat/threads endpoints
  - [x] GET/POST /api/chat/threads/{id}/messages endpoints
  - [x] ChatPage frontend with real-time polling
  - [x] Message grouping by date
  
- [x] Media Library
  - [x] MediaAsset model (document/audio kinds)
  - [x] ShowMedia join table
  - [x] RundownItemMedia join table
  - [x] File upload with validation (100MB max)
  - [x] GET/POST/PUT/DELETE /api/media endpoints
  - [x] MediaLibraryPage frontend with upload, search, filter
  - [x] Audio player integration
  - [x] Attach media to shows and rundown items
  
- [x] Permissions & Assignments
  - [x] 'presenter' role added to ROLES list
  - [x] ShowAssignment model
  - [x] SeriesAssignment model
  - [x] OccurrenceAssignment model
  - [x] Assignment CRUD endpoints for shows/series
  - [x] Permission checks in occurrence rundown editing
  - [x] Presenter role in invite dialog
  
- [x] Recurring Shows
  - [x] ShowSeries model with recurrence_rule
  - [x] ShowOccurrence model with rundown_id
  - [x] Rundown model linked to occurrences
  - [x] RundownItemsV2 collection for occurrence rundowns
  - [x] RRULE parser for generating dates
  - [x] POST /api/series/{id}/generate endpoint
  - [x] SeriesPage frontend with create/edit/generate
  - [x] OccurrencesPage frontend with date grouping
  - [x] OccurrenceDetailPage with rundown editor
  - [x] Drag & drop reordering in occurrence rundowns

### January 9, 2026 - Step 4.1a (Enhanced Recurrence)
- [x] Extended ShowSeries model with new recurrence fields:
  - [x] recurrence_type (none/weekly)
  - [x] start_date (required start boundary)
  - [x] end_date (optional end boundary)
  - [x] interval_weeks (1-4)
  - [x] days_of_week (array 0-6)
- [x] New generate_dates_from_recurrence() function
- [x] Updated generate endpoint to use new fields (with RRULE fallback)
- [x] Enhanced SeriesPage UI:
  - [x] Day-of-week toggle buttons (Mon-Sun)
  - [x] Interval dropdown (Every 1/2/3/4 weeks)
  - [x] End condition radio buttons (No end / Until date)
  - [x] Live recurrence preview text
- [x] Backward compatibility with legacy RRULE-based series

### January 9, 2026 - Step 4.2 (Print View)
- [x] Print-friendly HTML view at GET /api/occurrences/{id}/print?token=<jwt>
- [x] Print layout includes:
  - [x] Show title
  - [x] Date and time
  - [x] Status badge
  - [x] Rundown items table (order, type, title, duration, notes)
  - [x] Media attachments listed
  - [x] Generated timestamp
  - [x] Page numbers (@page CSS)
- [x] Print CSS optimized for A4 paper
- [x] "Export / Print" button on occurrence detail page

### January 9, 2026 - Step 4.3 (Realtime Collaboration)
- [x] WebSocket endpoint at /ws/rundown/{id}?token=<jwt>
- [x] ConnectionManager class for room-based connections
- [x] Presence tracking (who's viewing):
  - [x] presence_join/presence_leave events
  - [x] Presence avatars in UI header
  - [x] Overflow indicator for 5+ users
- [x] Live rundown updates (no refresh):
  - [x] item_created broadcast after POST
  - [x] item_updated broadcast after PUT
  - [x] item_deleted broadcast after DELETE
  - [x] items_reordered broadcast after reorder
- [x] Frontend WebSocket hook (useRundownWebSocket.js)
- [x] Connection status indicator (Live/Offline)
- [x] Toast notifications for remote changes
- [x] Note: WebSocket requires WSS-capable proxy in production

### January 12, 2026 - Simplified Recurring Shows in Calendar
- [x] Removed separate "Show Series" and "Occurrences" pages
- [x] Consolidated recurring show scheduling into the Calendar page
- [x] Added recurrence options to show creation:
  - Does not repeat (one-time)
  - Every week
  - Every 2 weeks
  - Every 3 weeks
  - Every 4 weeks
- [x] Optional end date for recurring shows (defaults to 1 year)
- [x] Recurring shows auto-generate occurrences on creation
- [x] Each occurrence has its own rundown
- [x] Edit recurring show dialog: "Only This One" or "All Occurrences"
- [x] Delete recurring show dialog: "Only This One" or "All Occurrences"
- [x] "Recurring" badge displayed on show detail page
- [x] Repeat icon shown in calendar sidebar for recurring shows
- [x] Updated navigation: removed Series and Occurrences links
- [x] Deleted unused pages: SeriesPage.js, OccurrencesPage.js, OccurrenceDetailPage.js
- [x] Refactored monolithic server.py (4234 lines) into modular structure

### January 12, 2026 - Enable Recurrence for Existing Shows
- [x] **Enable Recurrence Feature**: Convert non-recurring shows to recurring
  - New API endpoint: POST /api/shows/{show_id}/enable-recurrence
  - Parameters: recurrence_interval (1-4 weeks), recurrence_end_date (optional)
  - Automatically generates future occurrences based on the original show
- [x] **Frontend UI** in ShowDetailPage.js:
  - "Make This a Recurring Show" section for non-recurring shows
  - "Enable Recurrence" button opens configuration dialog
  - Frequency dropdown (Every 1/2/3/4 weeks)
  - Optional end date picker (defaults to 1 year)
  - Success toast and UI updates after enabling
- [x] **Test coverage**: 12/12 backend API tests passed
- [x] **Deleted** server_backup.py cleanup file
- [x] Created `/app/backend/database.py`: MongoDB connection, JWT config, upload directories (29 lines)
- [x] Created `/app/backend/models/` directory with 9 Pydantic model files:
  - [x] auth.py - Authentication models (UserCreate, UserLogin, TokenResponse, etc.)
  - [x] shows.py - Show and rundown item models
  - [x] content.py - Content library models
  - [x] wordpress.py - WordPress integration models
  - [x] series.py - ShowSeries and occurrence models
  - [x] assignments.py - Show/series assignment models
  - [x] chat.py - Chat thread and message models
  - [x] media.py - Media asset models
- [x] Created `/app/backend/services/` directory with 4 service files:
  - [x] auth.py - Password hashing, JWT tokens, auth dependencies
  - [x] websocket.py - WebSocket ConnectionManager for real-time collaboration
  - [x] helpers.py - RRULE parsing, content helpers
- [x] Created `/app/backend/routers/` directory with 10 router files:
  - [x] auth.py - /api/auth/* routes
  - [x] teams.py - /api/teams/* routes
  - [x] users.py - /api/users/* routes
  - [x] shows.py - /api/shows/* routes (including legacy rundown and print)
  - [x] content.py - /api/content/* routes
  - [x] wordpress.py - /api/wordpress/* routes
  - [x] series.py - /api/series/* routes
  - [x] occurrences.py - /api/occurrences/* routes (including print)
  - [x] chat.py - /api/chat/* routes
  - [x] media.py - /api/media/* routes
- [x] New server.py is 345 lines (main entry point only)
- [x] All 25 regression tests passed (100% success rate)
- [x] Full backward compatibility maintained - all APIs work identically

### January 16, 2026 - Chat Bug Fixes
- [x] **Bug Fix: Sidebar Preview Text** - Fixed CSS styling issue where message preview in conversation list showed ":::::" instead of actual text
  - Changed `text-zinc-600` to `text-zinc-400` for better visibility
  - Removed `italic` style that caused font rendering issues with repeated characters
  - Applied to both desktop and mobile sidebar views
- [x] **Verified: Real-time Polling** - Confirmed polling mechanism works correctly:
  - Thread list polls every 5 seconds for new conversations and message previews
  - Active thread messages poll every 2 seconds using `after` parameter
  - New messages appear without page refresh
- [x] All 14 chat functionality tests passed (100% success rate)

### January 16, 2026 - Chat Delete Features
- [x] **Delete Private Chats** - Either member of a private/direct message conversation can now delete it
  - Trash icon button in private chat header
  - Confirmation dialog before deletion
  - All messages in the conversation are deleted
- [x] **Delete Messages for Everyone** - Users can delete their own messages from any chat
  - Delete button appears on hover to the left of own messages
  - Message is removed from the chat for all participants
  - Only the message sender can delete their own messages
- [x] All 8 chat delete feature tests passed (100% success rate)

### January 16, 2026 - Content Featured Images
- [x] **Content-Level Featured Image Upload** - Upload featured images when creating or editing content
  - Featured image upload section added to Create Content dialog
  - Featured image display in content detail view mode
  - Replace/Remove buttons in edit mode
  - Images stored in `/app/backend/uploads/featured_images/`
- [x] **API Endpoints Added:**
  - `POST /api/content/{id}/featured-image` - Upload image
  - `DELETE /api/content/{id}/featured-image` - Remove image
- [x] All 9 featured image tests passed (100% success rate)

### January 25, 2026 - Show Image Uploads & Studio Display
- [x] **Show Image Upload** - Add, replace, and remove images for shows
  - Image upload section on ShowDetailPage with drag-to-upload area
  - Replace and Remove buttons for existing images
  - Images displayed on show cards in ShowsPage
  - Images stored in `/app/backend/show_images/`
- [x] **API Endpoints for Show Images:**
  - `POST /api/shows/{show_id}/image` - Upload image
  - `DELETE /api/shows/{show_id}/image` - Remove image
  - `GET /api/uploads/show_images/{file_key}` - Serve image
- [x] **Studio Name Display** - Show studio/room name on show cards
  - Radio icon with studio name displayed next to date/time
  - Visible on both one-time show cards and recurring series bundles
  - Fixed `update_show` endpoint to return `studio_name` in response
- [x] All 9 show image tests passed (100% success rate)

## Database Collections
### Core Collections
- **users**: id, email, password_hash, name, role, team_id, created_at, temp_password
- **teams**: id, name, created_at
- **shows**: id, title, description, date, start_time, end_time, status, editor_id, team_id, studio_id, image (file_storage_key, file_name, mime_type, size)
- **rundown_items**: id, show_id, type, title, notes, duration, order, content_ids (legacy)
- **show_titles**: id, team_id, name, description, default_start_time, default_end_time
- **studios**: id, team_id, name, description

### Content & WordPress
- **content_items**: id, team_id, title, type, body, excerpt, external_url, tags, status, created_by
- **wordpress_sites**: id, team_id, name, wp_base_url, username, app_password, defaults, is_active
- **content_item_publishes**: id, content_item_id, wordpress_site_id, wp_post_id, sync_status
- **content_item_featured_images**: id, content_item_id, wordpress_site_id, file_storage_key, wp_media_id

### MVP 4 Collections
- **chat_threads**: id, team_id, type (team/show), show_id, created_by, created_at, updated_at
- **chat_messages**: id, thread_id, user_id, body, created_at
- **media_assets**: id, team_id, uploaded_by, kind (document/audio), title, file_storage_key, mime_type, size
- **show_media**: id, show_id, media_asset_id, created_at
- **rundown_item_media**: id, rundown_item_id, media_asset_id, created_at
- **show_series**: id, team_id, title, description, default_start/end_time, recurrence_rule, is_active
- **show_occurrences**: id, team_id, show_series_id, title, date, start/end_time, status, rundown_id
- **rundowns**: id, occurrence_id, created_at, updated_at
- **rundown_items_v2**: id, occurrence_id, show_id, type, title, notes, duration, order
- **show_assignments**: id, show_id, user_id, role_on_show, created_at
- **series_assignments**: id, series_id, user_id, role_on_show, created_at
- **occurrence_assignments**: id, occurrence_id, user_id, role_on_show, created_at

## API Endpoints
### Authentication
- POST /api/auth/register, /api/auth/login, GET /api/auth/me

### Teams & Users (Admin only)
- GET/PUT /api/teams/current
- GET /api/users, POST /api/users/invite, PUT /api/users/{id}/role, DELETE /api/users/{id}

### Legacy Shows & Rundown
- GET/POST /api/shows, GET/PUT/DELETE /api/shows/{id}
- GET/POST /api/shows/{id}/rundown, PUT/DELETE /api/shows/{id}/rundown/{item_id}
- GET/POST/DELETE /api/shows/{id}/media, /api/shows/{id}/rundown/{item_id}/media

### Content Library
- GET/POST /api/content, GET/PUT/DELETE /api/content/{id}
- POST /api/content/{id}/publish
- GET/POST/DELETE /api/content/{id}/featured-images/{site_id}

### WordPress Sites (Admin only)
- GET/POST /api/wordpress/sites, GET/PUT/DELETE /api/wordpress/sites/{id}
- POST /api/wordpress/sites/{id}/test

### Team Chat (MVP 4)
- GET /api/chat/threads, GET /api/chat/threads/team, POST /api/chat/threads
- GET/POST /api/chat/threads/{id}/messages

### Media Library (MVP 4)
- GET/POST /api/media, GET/PUT/DELETE /api/media/{id}
- GET /api/uploads/media/{file_key}

### Show Series (MVP 4 - Admin only)
- GET/POST /api/series, GET/PUT/DELETE /api/series/{id}
- POST /api/series/{id}/generate
- GET/POST/DELETE /api/series/{id}/assignments

### Occurrences (MVP 4)
- GET/POST /api/occurrences, GET/PUT/DELETE /api/occurrences/{id}
- GET/POST /api/occurrences/{id}/rundown
- PUT /api/occurrences/{id}/rundown/reorder
- PUT/DELETE /api/occurrences/{id}/rundown/{item_id}

### Public
- GET /api/rds/live, /api/rds/live.txt

## Prioritized Backlog
### P0 (Complete)
- [x] Core show and rundown management (MVP 1)
- [x] Team and user management with roles (MVP 2)
- [x] Content Library and WordPress Publishing (MVP 3)
- [x] Team Chat, Media Library, Recurring Shows (MVP 4)
- [x] Backend Refactoring: Modular structure with models/, routers/, services/
- [x] Chat sidebar preview bug fix (January 16, 2026)
- [x] Chat real-time polling verification (January 16, 2026)
- [x] WordPress Article Import (January 31, 2026): Imported 132 articles from mfy.be and grk.fm
- [x] Content Library bug fix (January 31, 2026): Fixed ValidationError by making external_url, body, excerpt optional in ContentItemResponse
- [x] External Featured Images Display (January 31, 2026): Added support for displaying WordPress featured images in Content Library with source labels
- [x] Categories System (January 31, 2026): Replaced tags with WordPress categories, added creator display, imported 5 categories from WordPress

### P1 (Near-term)
- [ ] Show cloning/templating
- [ ] Attach content items to rundown items
- [ ] Email invitations (currently shows temp password)
- [ ] Password change after first login prompt
- [ ] Migrate legacy shows to occurrence model
- [ ] Refactor ChatPage.js (1200+ lines) into smaller components

### P2 (Future)
- [ ] Multiple teams per user
- [ ] Show history/versioning
- [ ] Segment templates library
- [ ] Advanced permissions (per-show access levels)
- [ ] Audit logs
- [ ] Customizable WPM setting for speaking time
- [ ] Real-time WebSocket chat (replace polling with WebSockets)
- [ ] Recurrence exceptions ("skip this week")
- [ ] Enhanced calendar with drag-and-drop rescheduling
- [ ] Chat message reactions (👍❤️😂)
- [ ] GIF support in chat (Giphy/Tenor integration)

## Test Credentials
- Email: demo@radio.com
- Password: password123

## Notes
- WordPress integration is one-way sync (dashboard → WordPress)
- WordPress requires Application Password authentication (NOT normal passwords)
- WordPress integration is MOCKED for testing - needs real credentials for production
- Legacy shows model remains for backward compatibility
- New recurring shows use ShowSeries → ShowOccurrence → Rundown structure
- Each occurrence gets a fresh, empty rundown (no auto-carryover)

### WordPress Security Requirements (January 10, 2026)
- **Authentication**: Application Passwords only (not login passwords)
- **Service Account**: Dedicated non-Administrator account recommended
- **Minimum Capabilities**: edit_posts, upload_files, publish_posts (optional)
- **2FA**: Remains enabled for human accounts; app passwords work independently
- **Credential Storage**: app_password never returned via API
- **Audit Logging**: Failed auth attempts logged to wordpress_auth_logs collection
- **Test Connection**: Checks capabilities and warns about security issues
- **Documentation**: See /app/docs/WORDPRESS_SECURITY.md
