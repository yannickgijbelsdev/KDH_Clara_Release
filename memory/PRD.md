# Radio Show Planning & Rundown Dashboard - PRD

## Original Problem Statement
Build a web-based dashboard that allows radio editors to plan radio shows and prepare detailed rundowns. The focus of this MVP is show preparation, not live broadcasting. Features include:
- MVP 1: Show planning and rundown management
- MVP 2: Team and user management with roles
- MVP 3: Content Library and Multi-site WordPress Publishing
- MVP 4: Collaboration, Media, Permissions, and Recurring Shows
- Step 4.1a: Enhanced Recurrence Pattern UI + Day Selection
- Content Approval Workflow and Soft-Delete System

## Architecture
- **Frontend**: React 19 with TailwindCSS, Shadcn/UI components
- **Backend**: FastAPI (Python) with async MongoDB (Motor)
- **Database**: MongoDB
- **Authentication**: JWT-based email/password login with role-based access
- **Drag & Drop**: @dnd-kit/core and @dnd-kit/sortable
- **WordPress Integration**: httpx for REST API calls (one-way sync)
- **Background Tasks**: Custom async scheduler for WordPress post publishing

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
- POST /api/media/{id}/share - Create public share link
- GET /api/media/{id}/share - Get share link status
- DELETE /api/media/{id}/share - Revoke share link
- GET /api/share/{token} - Public file download (no auth)

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
- [x] Content Audit Logs (January 31, 2026): Per-post edit history tracking with detailed change diffs and PDF export (admin only)
- [x] WordPress Scheduled Publishing (January 31, 2026): Added ability to schedule posts for future publication with date/time picker
- [x] Enhanced TinyMCE Editor (January 31, 2026): Improved link insertion, file uploads, full menu bar with Insert/Format/Tools menus
- [x] Admin Content Approval Workflow (January 31, 2026): Admins must approve content before it can be published to WordPress, with dedicated approval dashboard

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

### January 31, 2026 - Soft-Delete & Restore System
- [x] **Soft-Delete Endpoint** (DELETE /api/content/{id}):
  - Sets `deleted_at` and `deleted_by` fields instead of removing
  - Automatically deletes posts from linked WordPress sites
  - Returns WordPress deletion results
- [x] **Admin Deleted Items Endpoint** (GET /api/content/admin/deleted):
  - Returns all soft-deleted content for the team
  - Includes `deleted_by_name` field
  - Admin-only access
- [x] **Restore Endpoint** (POST /api/content/{id}/restore):
  - Removes `deleted_at` and `deleted_by` fields
  - Returns restored content
  - Admin-only access
- [x] **Permanent Delete Endpoint** (DELETE /api/content/{id}/permanent):
  - Completely removes content from database
  - Deletes associated files and records
  - Admin-only access
- [x] **Content Filtering**:
  - GET /api/content excludes soft-deleted items for non-admins
  - Admins can use `include_deleted=true` parameter
- [x] **Trash Page** (TrashPage.js at /trash):
  - Admin-only page accessible from sidebar
  - Lists deleted content with metadata
  - View, Restore, and Delete Forever buttons
  - Search functionality
- [x] **Improved Delete Dialog**:
  - Shows "Move to Trash" message
  - Warns about WordPress post deletion
  - Informs admins can restore

### January 31, 2026 - WordPress Scheduler Worker
- [x] **Background Scheduler Service** (services/wp_scheduler.py):
  - Checks for scheduled posts every 60 seconds
  - Automatically publishes posts when schedule time arrives
  - Changes WordPress status from 'future' to 'publish'
  - Updates sync_status from 'scheduled' to 'synced'
  - Error handling with status updates
- [x] **Server Integration**:
  - Scheduler starts on application startup
  - Graceful shutdown on application stop

## Prioritized Backlog

### P1 - High Priority
- [ ] Microsoft SSO Integration (user requested)
- [ ] Chat: WebSocket upgrade for real-time messaging

### P2 - Medium Priority  
- [ ] Frontend refactoring (decompose ContentDetailPage.js)
- [ ] Show Templates from past rundowns
- [ ] Custom WPM setting for script timing
- [ ] Public password reset flow

### P3 - Low Priority
- [ ] Chat enhancements (reactions, GIFs)
- [ ] Advanced scheduling (drag-and-drop calendar)

### January 31, 2026 - Menu Groups & Admin User Switching
- [x] **Grouped Navigation Menu**:
  - Shows group: Shows List, Calendar, Show Management
  - Content group: Content Library, Media Library, Content Approval, Trash  
  - Communication group: Team Chat
  - Administration group: Team Settings, WordPress, Activity Logs (admin only)
  - Collapsible/expandable groups with chevron indicators
  - Active group/item highlighting

- [x] **Personal Settings Page** (/settings):
  - Profile section with user avatar, name, email, role
  - Navigation Display section with toggle
  - "Group Menu Items" toggle to switch between grouped and flat menu
  - Visual preview of both menu styles
  - Preferences saved to database

- [x] **User Preferences System**:
  - Backend: PUT /api/users/me/preferences saves preferences
  - Backend: GET /api/auth/me returns preferences field
  - Frontend: AuthContext includes updateUserPreferences
  - Preferences persist across sessions

- [x] **Admin User Switching (Impersonation)**:
  - Backend: POST /api/admin/switch-user/{user_id} creates token for target user
  - Backend: POST /api/admin/exit-impersonation returns to admin account
  - Frontend: "Login as User" option in TeamSettingsPage dropdown
  - Orange impersonation banner at top when viewing as another user
  - "Return to [admin]" button to exit impersonation
  - Non-admins blocked with 403 error

### February 1, 2026 - Media Library Sharing
- [x] **Public Share Links for Media Assets**:
  - Generate secure, token-based URLs for media files
  - Public access without authentication
  - Share link management UI in Media Library
  
- [x] **Backend Endpoints**:
  - POST /api/media/{asset_id}/share - Create share link with token
  - GET /api/media/{asset_id}/share - Check if share link exists
  - DELETE /api/media/{asset_id}/share - Revoke share link
  - GET /api/share/{token} - Public file download (no auth)
  
- [x] **Frontend UI (MediaLibraryPage.js)**:
  - "Share" option in asset dropdown menu
  - Share dialog with status indicator ("Public link is active" / "Create a public link")
  - Shareable URL display with copy-to-clipboard button
  - External link button to open in new tab
  - Revoke Share Link button to disable sharing
  - Toast notifications for all actions
  
- [x] **Database (media_share_links collection)**:
  - id, asset_id, team_id, share_token, created_by, created_at
  - Links cleaned up when assets are deleted
  
- [x] All 18 backend tests + frontend UI tests passed (100% success rate)

### February 1, 2026 - Session Management & Advanced Features

- [x] **Session Timeout (4 Hours)**:
  - JWT expiration set to 4 hours since login
  - Login/register responses include `expires_at` timestamp
  - Frontend SessionWarningModal shows 5-minute countdown before logout
  - Auto-logout when session expires
  - Session state persisted in localStorage
  
- [x] **Share URL Domain Configuration**:
  - SHARE_BASE_URL environment variable (defaults to https://clara.koodh.com)
  - GET /api/config returns share_base_url for frontend
  - Share links use configured domain instead of preview URL
  
- [x] **Media Library Folders**:
  - Complete folder CRUD (create, read, update, delete)
  - Nested folder structure with parent_id
  - Folder tree endpoint (GET /api/media/folders/tree)
  - Assets can be organized into folders (folder_id field)
  - Folder sidebar in Media Library UI
  - Breadcrumb navigation for current folder
  - Asset counts per folder
  
- [x] **Folder Sharing**:
  - Share folders with users (POST /api/media/folders/{id}/shares with user_ids)
  - Link folders to shows (show_ids)
  - Link folders to series (series_ids)
  - View folder shares (GET /api/media/folders/{id}/shares)
  - Remove shares (DELETE /api/media/folders/{id}/shares/{share_id})
  - Get folders for show/occurrence (GET /api/media/folders/show/{id}, /occurrence/{id})
  
- [x] **Show/Rundown Permission Restrictions**:
  - Admins can edit all shows and rundowns
  - Editors can edit all shows and rundowns
  - Presenters can only edit shows/rundowns they're assigned to
  - Viewers cannot edit
  - Only admins can delete shows and rundown items
  
- [x] **Bulk Assignment Changes for Recurring Shows**:
  - POST /api/series/{id}/assignments/bulk with apply_to options:
    - "this_only": Only series assignment (new occurrences inherit)
    - "all_future": Series + all future occurrence assignments
    - "all": Series + all occurrence assignments (past & future)
  - DELETE /api/series/{id}/assignments/{user_id}/bulk with same options
  
- [x] All 22 new backend tests passed (100% success rate)

### February 2, 2026 - Media Library Drag & Drop

- [x] **Drag & Drop for Media Assets**:
  - Implemented using @dnd-kit library (already installed)
  - DraggableAssetCard component wraps asset cards with drag handle
  - DroppableFolderItem component makes folders droppable targets
  - DroppableAllFiles component allows moving assets back to root
  - Visual feedback: orange ring highlight on drop targets during drag
  - GripVertical drag handle appears on hover (top-left of asset cards)
  - Toast notifications: "Asset moved" / "Asset moved to root"
  
- [x] **Backend Fix for Move to Root**:
  - Fixed PUT /api/media/{id} to accept folder_id=null
  - Changed from filtering None values to using exclude_unset=True
  - Assets can now be moved back to root (All Files) via drag-and-drop
  
- [x] All 7 drag-and-drop tests passed (100% success rate)

### February 6, 2026 - Hetzner S3 Object Storage Integration

- [x] **S3 Storage Service**:
  - Created `/app/backend/services/s3_storage.py` for all S3 operations
  - Supports upload, delete, get, and presigned URL generation
  - Uses boto3 with S3v4 signature for Hetzner compatibility
  - Configuration via environment variables (S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY)
  
- [x] **Media Library S3 Integration**:
  - All new media uploads go directly to S3 bucket `koodh-clara`
  - Files stored with path: `media/{team_id}/{uuid}.{ext}`
  - `s3_url` field added to MediaAssetResponse model
  - Frontend uses direct S3 URLs for serving files (faster CDN delivery)
  - Fallback to local storage if S3 not configured
  
- [x] **TinyMCE Editor S3 Integration**:
  - Editor file uploads (images, video, audio) now go to S3
  - Files stored with path: `editor/{uuid}.{ext}`
  - Direct S3 URL returned to TinyMCE for embedding
  
- [x] **S3 Status Endpoint**:
  - GET /api/storage/status (admin only) - check S3 connection status

- [x] **UI Cleanup**:
  - Removed "Excerpt" field from Create Content dialog
  - Removed "Excerpt" field from Content Detail edit mode

### February 6, 2026 - Featured Image Display Bug Fix

- [x] **Bug Fix: Featured images not showing in Content Library**:
  - Root cause 1: `s3_url` field was missing from `ContentFeaturedImage` model
  - Root cause 2: Site-specific featured images from `content_item_featured_images` collection were not included in GET /api/content response
  - Root cause 3: Frontend only checked `featured_image` and `external_featured_image`, not `publish_statuses[].featured_image`
  
- [x] **Backend Fixes**:
  - Added `s3_url: Optional[str] = None` to `ContentFeaturedImage` model
  - Added `s3_url: Optional[str] = None` to `FeaturedImageResponse` model
  - Updated GET /api/content endpoint to include featured images from `content_item_featured_images` collection in publish_statuses
  
- [x] **Frontend Fixes**:
  - Added `getBestFeaturedImage()` helper function that checks multiple sources:
    1. Content-level `featured_image` (direct upload)
    2. Site-specific `publish_statuses[].featured_image` (WordPress publish)
    3. External `external_featured_image` (WordPress import)
  - Added `useLocation` hook for data refresh on navigation back to list

### February 6, 2026 - RDS Integration & WordPress Audio Format

- [x] **WordPress Audio Format**:
  - Artikelen worden nu standaard gepubliceerd met `format: "audio"` i.p.v. `standard`
  - Aangepast in `/app/backend/routers/wordpress.py` line 454

- [x] **Rundown Tekst Volledig Tonen**:
  - Verwijderd `line-clamp-2` class van rundown item notes
  - Tekst wordt nu volledig weergegeven in de rundown view
  - File: `/app/frontend/src/components/SortableRundownItem.js`

- [x] **RDS Instellingen Pagina** (`/rds`):
  - Nieuwe pagina voor MagicRDS integratie
  - Configuratie sectie: productie base URL en cache interval
  - API Endpoints overzicht met kopieerbare URLs:
    - `/api/rds/live` - Live show titel (plain text, publiek)
    - `/api/rds/live.txt` - Zelfde met .txt extensie
    - `/api/rds/cached-rundown` - Gecachte JSON rundown (publiek)
    - `/api/shows/{show_id}/rundown` - Show-specifieke rundown (auth vereist)
  - Cache logs met status en timestamps
  - Handmatige cache refresh knop

- [x] **RDS Cache Scheduler**:
  - Automatische cronjob die elke 5 minuten de live show rundown cachet
  - Cached data beschikbaar via `/api/rds/cached-rundown` (geen auth nodig)
  - Logs worden opgeslagen en getoond in de RDS Instellingen pagina
  - File: `/app/backend/services/rds_scheduler.py`


- [x] **Upload Progress Indicator in TinyMCE**:
  - Visuele upload progress overlay toegevoegd aan de rich text editor
  - Toont bestandsnaam en percentage tijdens upload
  - Progress bar met animatie voor betere gebruikerservaring
  - File: `/app/frontend/src/components/RichTextEditor.js`


### February 6, 2026 - RDS Station-Specifieke Features

- [x] **RDS Station per Show Title**:
  - Nieuwe `rds_station` field toegevoegd aan ShowTitle model
  - Opties: MFY, GRK, Beide, Geen
  - UI: Selector buttons in Edit Show Title dialog
  - File: `/app/backend/models/shows.py`, `/app/frontend/src/pages/ShowManagementPage.js`

- [x] **Station-Specifieke RDS Endpoints**:
  - `/api/rds/mfy/live` - Live show titel voor MFY
  - `/api/rds/mfy/cached-rundown` - Rundown voor MFY shows
  - `/api/rds/grk/live` - Live show titel voor GRK
  - `/api/rds/grk/cached-rundown` - Rundown voor GRK shows

- [x] **Shoutcast Now Playing Integratie**:
  - `/api/rds/mfy/now-playing` - Now playing van mfy.level27.be (JSON)
  - `/api/rds/mfy/now-playing.txt` - Song title (plain text)
  - `/api/rds/grk/now-playing` - Now playing van grk.level27.be (JSON)
  - `/api/rds/grk/now-playing.txt` - Song title (plain text)
  - File: `/app/backend/services/shoutcast.py`

- [x] **RDS Settings Pagina Verbeterd**:
  - Endpoints gegroepeerd per station (Radio MFY, Radio GRK, Alle Stations)
  - Kleurcodering per station (oranje voor MFY, violet voor GRK)

- [x] **RDS Scheduler Tijdzone Fix**:
  - Probeert nu zowel CET (UTC+1) als UTC tijd
  - Lost probleem op met nieuwe shows die niet werden gevonden

- [x] **Upload Progress Z-index Fix**:
  - Fixed positioning met zIndex: 100000
  - Overlay verschijnt nu boven TinyMCE dialogs


### February 7, 2026 - Bug Fixes RDS Builder & Stream Monitor

- [x] **RDS Builder Custom Text Input Fix**:
  - Bug: Custom text input veld in RDS Builder accepteerde geen tekst invoer
  - Fix: `onChange` handler verbeterd met `e.stopPropagation()` en `data-testid` attributen toegevoegd
  - Status: WERKEND - tekst kan nu correct worden ingevoerd en opgeslagen

- [~] **Stream Monitor Audio Playback** (GEDEELTELIJK):
  - Bug: Audio streams speelden niet af, VU meters werkten niet
  - Onderzocht: Backend stream proxy werkt correct (audio data ontvangen via curl)
  - Root Cause: Browser beveiligingsbeperking - streams zijn HTTP maar app draait op HTTPS (mixed content)
  - Huidige status: VU meters tonen realistische animatie/simulatie wanneer stream "speelt"
  - Voor echte audio analyse: streams moeten via HTTPS, of server-side audio level service nodig

- [x] **Backend Stream Proxy**:
  - Nieuwe endpoint: `/api/streams/{stream_id}` - proxied Shoutcast streams
  - Nieuwe endpoint: `/api/streams/{stream_id}/status` - check stream status
  - Werkt correct, maar browser blokkeert mixed content (HTTP stream op HTTPS site)

- [x] **Shoutcast Scheduler (10 sec interval)**:
  - Automatisch now playing data ophalen elke 10 seconden
  - Gecachte data beschikbaar via API
  - Logs worden opgeslagen per update

- [x] **Now Playing Filters**:
  - Configureerbare filters per station
  - Default filters: "the feelgood station", "de stadsradio van genk"
  - UI in RDS Settings pagina
  - Endpoints: `/api/rds/shoutcast/filters/{station}`
