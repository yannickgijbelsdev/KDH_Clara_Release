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
  - Fix: Lokale state toegevoegd aan SequenceItem component met onBlur sync naar parent
  - Status: WERKEND - tekst kan nu correct worden ingevoerd en opgeslagen

- [x] **RDS Builder Show Naam Fix**:
  - Bug: Show naam werd niet getoond in de RDS output (bleef leeg)
  - Oorzaak: Shows hadden `rds_station = "none"` maar code zocht alleen naar "mfy"/"grk"/"both"
  - Fix: Fallback logica toegevoegd - nu wordt elke actieve show gevonden, ook zonder specifiek RDS station
  - Files aangepast: `/app/backend/services/rds_builder_scheduler.py`, `/app/backend/routers/rds.py`

- [~] **Stream Monitor Audio Playback** (TECHNISCHE BEPERKING):
  - Bug: Audio streams speelden niet af, VU meters werkten niet
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

### February 11, 2026 - RDS "Both" Station Feature
- [x] **RDS Now Playing Source Logic for "Both" Station**:
  - Feature: Wanneer een show op "both" (MFY en GRK) staat, gebruikt GRK de Now Playing data van MFY
  - Implementatie in `/app/backend/routers/rds.py`:
    - Nieuwe functie `get_now_playing_source_station()` om te bepalen welk station te gebruiken
    - `/api/rds/grk/now-playing` retourneert nu MFY data als actieve show `rds_station='both'` heeft
    - `/api/rds/grk/now-playing.txt` idem
    - Response bevat `source_station` veld en optioneel `note` veld
  - Implementatie in `/app/backend/services/rds_builder_scheduler.py`:
    - Nieuwe functie `get_now_playing_station_for()` 
    - RDS Builder sequenties gebruiken nu ook MFY data voor GRK's "now_playing" items
  - Tested: 100% backend tests passed (9/9)

- [x] **Default Show Names (Fallback)**:
  - Feature: Wanneer geen actieve show voor een station, toon default naam
  - GRK default: "the feelgood station"
  - MFY default: "altijd dichtbij"
  - Werkt voor zowel `/api/rds/{station}/live` endpoints als RDS Builder "show_name" items
  - Logica: Alleen shows met `rds_station` = station of "both" worden meegeteld

- [x] **Multi-Output System (Streaming, DAB, FM)**:
  - Feature: Meerdere configureerbare RDS outputs per station
  - Elke output heeft eigen naam, slug (URL), en configureerbare items
  - Items: Show Naam, Now Playing, Custom Tekst - elk met aan/uit toggle en duratie
  - Database collecties: `rds_outputs` (config), `rds_output_states` (huidige state)
  - API endpoints:
    - `GET /api/rds-builder/outputs/{station}` - lijst van outputs
    - `POST /api/rds-builder/outputs/{station}` - nieuwe output
    - `PUT /api/rds-builder/outputs/{station}/{slug}` - bewerken
    - `DELETE /api/rds-builder/outputs/{station}/{slug}` - verwijderen
    - `GET /api/rds-builder/output/{station}/{slug}.txt` - public URL voor MagicRDS
  - Frontend: Tabbed interface met Multi-Output en Legacy Sequence Builder
  - Tested: 24/24 backend tests passed, frontend UI volledig functioneel

### February 13, 2026 - Rundown Timestamps Feature
- [x] **Calculated Timestamps in Rundown**:
  - Feature: Elke rundown item toont nu een berekende starttijd
  - Berekening gebaseerd op show starttijd + cumulatieve duur van vorige items
  - Default duraties: Ad blok = 2 minuten, Music blok = 3 minuten
  - Items met expliciete duur gebruiken die waarde
  - Talk items berekenen duur van tekst (150 WPM spreektempo)
  - Weergave: Oranje kleur (text-orange-400), HH:MM formaat (bijv. 17:00, 17:03)
  - Files aangepast:
    - `/app/frontend/src/components/RundownEditor.js` - calculateTimestamps() functie
    - `/app/frontend/src/components/SortableRundownItem.js` - timestamp prop weergave
    - `/app/frontend/src/pages/ShowDetailPage.js` - showStartTime prop doorgeven
  - Tested: 8/8 frontend tests passed (100% success rate)

- [x] **ShowImage Model Fix**:
  - Bug: Shows API returned 520 error vanwege Pydantic validatiefout
  - Oorzaak: Inconsistentie tussen database velden (file_key, filename) en model (file_storage_key, file_name)
  - Fix: ShowImage model aangepast om beide naamconventies te ondersteunen met aliassen
  - File: `/app/backend/models/shows.py`

### February 13, 2026 - RDS Custom Text Scheduler Feature
- [x] **RDS Custom Text Scheduler**:
  - Nieuwe feature: Meerdere custom teksten schedulen op specifieke tijdstippen
  - Backend API endpoints:
    - `GET /api/rds-builder/scheduled-texts/{station}` - alle geplande teksten ophalen
    - `POST /api/rds-builder/scheduled-texts/{station}` - nieuwe geplande tekst aanmaken
    - `PUT /api/rds-builder/scheduled-texts/{station}/{id}` - geplande tekst bewerken
    - `DELETE /api/rds-builder/scheduled-texts/{station}/{id}` - geplande tekst verwijderen
    - `GET /api/rds-builder/scheduled-texts/{station}/calendar` - kalender items met recurring expansion
    - `GET /api/rds-builder/scheduled-texts/{station}/active` - momenteel actieve geplande tekst
  - Scheduling opties:
    - Datum en tijd selectie
    - Duur type: Vaste duur (in minuten) OF Tot volgende item
    - Herhaling: Eenmalig, Dagelijks, Wekelijks, Maandelijks
    - Einddatum voor herhalende items (optioneel)
  - Frontend:
    - Nieuwe `/rds-scheduler` pagina met kalender view
    - Maand navigatie en vandaag button
    - Station selector (MFY/GRK)
    - Create/Edit dialog met alle opties
    - Link vanuit RDS Builder pagina ("Custom Text Scheduler" button)
  - Shows hebben altijd voorrang boven geplande custom teksten
  - Files aangepast:
    - `/app/backend/routers/rds_builder.py` - nieuwe API endpoints
    - `/app/frontend/src/pages/RDSSchedulerPage.js` - nieuwe pagina
    - `/app/frontend/src/pages/RDSBuilderPage.js` - link naar scheduler
    - `/app/frontend/src/App.js` - route toegevoegd
  - Nieuwe MongoDB collection: `rds_scheduled_texts`
  - Tested: 21/21 backend tests passed, 100% frontend UI verified

### February 13, 2026 - RDS Scheduler Hourly & Both Stations Update
- [x] **Hourly Recurrence Option**:
  - Nieuwe optie "Elk uur" toegevoegd aan herhaling dropdown
  - Handig voor nieuws updates die elk heel uur moeten verschijnen
  - Kalender toont alle uurlijkse items met "+X meer" indicator voor dagen met veel items

- [x] **Station Selection per Scheduled Text**:
  - Nieuwe "Zichtbaar op" dropdown in de create/edit dialog
  - Opties: Radio MFY, Radio GRK, Beide stations
  - Items voor "Beide stations" worden groen weergegeven in de kalender
  - API endpoints bijgewerkt om "both" station te ondersteunen
  - Calendar en active endpoints tonen items voor zowel de specifieke station als "both"

- Files aangepast:
  - `/app/backend/routers/rds_builder.py` - hourly recurrence, both station support
  - `/app/frontend/src/pages/RDSSchedulerPage.js` - station selector, hourly option, green color for "both"

### February 13, 2026 - Rundown UI/UX Improvements
- [x] **Sticky "Add Item" Button**:
  - Rundown header met "Add Item" knop blijft nu zichtbaar tijdens scrollen
  - CSS classes: `sticky top-0 z-10 bg-[#18181b]`
  - Border-bottom toegevoegd voor visuele scheiding
  - File: `/app/frontend/src/components/RundownEditor.js`

- [x] **Export/Print URL Production Fix**:
  - Print/Export functie gebruikt nu productie URL: `https://clara.koodh.com`
  - Voorheen gebruikte dynamische API URL (development)
  - Hardcoded naar productie voor consistente uitvoer
  - File: `/app/frontend/src/pages/ShowDetailPage.js`

- Files aangepast:
  - `/app/frontend/src/components/RundownEditor.js` - sticky header styling
  - `/app/frontend/src/pages/ShowDetailPage.js` - handlePrintView() URL fix

### February 13, 2026 - Presenter Assignment Feature
- [x] **Show Management - Default Presenters**:
  - Multi-select om standaard presenters toe te wijzen aan show titles
  - Presenters worden in violet weergegeven met Users icoon
  - Alle teamleden kunnen geselecteerd worden
  - Files: `backend/models/shows.py`, `backend/routers/shows.py`, `frontend/src/pages/ShowManagementPage.js`

- [x] **Show Management - Image URL Fix**:
  - getImageUrl() functie toegevoegd voor consistente URL handling
  - Ondersteunt zowel s3_url als file_storage_key/file_key formaten

- [x] **Calendar/Create Show - Presenter Override**:
  - Presenter selectie veld in Create Show Dialog
  - Auto-fill van default presenters bij selectie van show title
  - Mogelijkheid om presenters te overschrijven voor specifieke shows
  - File: `frontend/src/components/CreateShowDialog.js`

- [x] **Calendar Sidebar & Show Detail - Presenter Display**:
  - Presenters worden in violet weergegeven in calendar sidebar
  - Show Detail Page toont presenters met avatar badges
  - Edit modus ondersteunt presenter wijziging
  - Files: `frontend/src/pages/CalendarPage.js`, `frontend/src/pages/ShowDetailPage.js`

- Backend API updates:
  - `PresenterInfo` model toegevoegd
  - `default_presenter_ids` in ShowTitle models
  - `presenter_ids` in Show models
  - `get_presenters_info()` helper functie voor data enrichment
  - Alle CRUD endpoints verrijken responses met presenter details

### February 13, 2026 - UI Translation (Dutch to English)
- [x] **Complete UI Translation**:
  - Translated entire application UI from Dutch to English
  - All calendar pages use English locale (enUS) for dates
  - RDS pages translated: RDSSchedulerPage, RDSBuilderPage, RDSSettingsPage, RDSOutputManager
  - Show management pages translated: ShowManagementPage, CreateShowDialog, ShowDetailPage
  - Content pages translated: ContentCalendarPage, ContentLibraryPage
  - Other pages: RundownEditor, StreamMonitorPage
  - Backend RDS endpoint descriptions translated
  - Weekday headers, buttons, labels, toast messages all in English
  - Files updated:
    - `frontend/src/pages/RDSSchedulerPage.js` - Date locale, labels, buttons
    - `frontend/src/pages/RDSBuilderPage.js` - Item types, messages
    - `frontend/src/pages/RDSSettingsPage.js` - Headers, buttons, endpoint descriptions
    - `frontend/src/components/rds/RDSOutputManager.js` - Dialog labels, messages
    - `frontend/src/pages/ContentCalendarPage.js` - Headers, labels, legend
    - `frontend/src/pages/ShowManagementPage.js` - Presenter selection labels
    - `frontend/src/components/CreateShowDialog.js` - Presenter labels
    - `frontend/src/pages/ShowDetailPage.js` - Presenter labels
    - `frontend/src/components/RundownEditor.js` - Live mode toggle
    - `frontend/src/pages/StreamMonitorPage.js` - Status messages
    - `backend/routers/rds.py` - API endpoint descriptions
  - Tested: 100% frontend translation verified (13 features tested)


### February 13, 2026 - Bug Fixes and UI Unification
- [x] **Team Page Image Upload Bug Fix**:
  - Fixed avatar image not refreshing after upload
  - Updated img src to use `s3_url` when available with fallback to `file_key`
  - Added `key` prop to force React re-render when avatar URL changes
  - File: `frontend/src/pages/TeamSettingsPage.js` line 402

- [x] **Rundown Editor - Presenter Display**:
  - Added presenter display section to RundownEditor component
  - Shows presenters with avatar badges and names after the header section
  - Uses violet color scheme consistent with rest of application
  - File: `frontend/src/components/RundownEditor.js`

- [x] **UI Unification - Calendar Pages**:
  - Unified RDS Scheduler Page styling to match main Show Calendar:
    - Same rounded-xl container with bg-[#18181b]
    - Consistent border-zinc-800 styling
    - Station tabs (Radio MFY, Radio GRK) with proper color coding
    - Legend at bottom with dot indicators
    - Aspect-square day cells with hover effects
  - Unified Content Calendar Page styling:
    - Same rounded-xl container styling
    - Legend moved inside calendar container at bottom
    - Consistent header styling with subtitle
  - Files updated:
    - `frontend/src/pages/RDSSchedulerPage.js`
    - `frontend/src/pages/ContentCalendarPage.js`
  - Tested: 100% frontend verification (6 features tested)

### February 13, 2026 - RDS Scheduler "Infinite" Bug Fix & Builder Integration
- [x] **P0 Bug Fix: RDS Custom Text Scheduler "Infinite" Scheduling**:
  - Bug: Scheduled texts with "infinite" option (no end date) stopped after ~3 days
  - Root cause: Scheduler logic didn't process scheduled texts in RDS Builder output
  - Fix: Added `get_active_scheduled_text_for_station()` function to rds_builder_scheduler.py
  - Fix: Modified `process_rds_sequence()` and `process_named_output()` to check for active scheduled texts
  - Scheduled texts now have priority over sequence items (Shows > Scheduled Texts > Sequence Items)
  - max_iterations increased to 10000 for long-running infinite schedules
  - Files updated:
    - `backend/services/rds_builder_scheduler.py` - Complete refactor to support scheduled texts
  - Tested: 15/15 backend tests passed (100% success rate)

- [x] **P1 Feature: Scheduled Texts in RDS Builder Interface**:
  - New "Scheduled Texts" section added to RDS Builder page
  - Shows all scheduled texts for each station (MFY and GRK)
  - Toggle switches to enable/disable scheduled texts on-demand
  - "∞ Infinite" label displayed for texts without end date
  - "Both stations" label for texts that apply to both stations
  - Priority indicator: "Shows > Scheduled texts > Sequence items"
  - Scheduler button links to full RDS Custom Text Scheduler page
  - Files updated:
    - `frontend/src/pages/RDSBuilderPage.js` - Added ScheduledTextsManager component
  - Tested: 100% frontend verification (all UI features working)

### February 13, 2026 - Audio Trigger System (Sound Detection)
- [x] **Audio Trigger Feature: Detect sounds in live stream**:
  - New feature: Automatically detect specific sounds (like commercial jingles) in the live stream
  - When IN sound is detected, show custom RDS text (e.g., "Reclame")
  - When OUT sound is detected (optional), return to normal output (Now Playing, Show Name, etc.)
  - Features:
    - Upload IN sound (MP3/WAV) - triggers activation
    - Upload OUT sound (optional) - triggers deactivation
    - Configure time windows when to listen (save CPU resources)
    - Set timeout duration (auto-deactivate if no OUT sound)
    - Match threshold slider (0.5-0.99 for strictness)
    - Manual test buttons for activation/deactivation
    - Detection logs with timestamps
  - Priority order: Shows > Audio Triggers > Scheduled Texts > Sequence Items
  - Backend implementation:
    - New service: `backend/services/audio_trigger.py` - Audio fingerprinting with librosa
    - New router: `backend/routers/audio_trigger.py` - CRUD + upload endpoints
    - New scheduler: AudioTriggerScheduler (3s interval during active windows)
    - New collections: `audio_triggers`, `audio_trigger_states`, `audio_trigger_logs`
  - Frontend implementation:
    - New page: `frontend/src/pages/AudioTriggersPage.js`
    - Route: `/audio-triggers`
    - Link from RDS Builder page (green "Audio Triggers" button)
  - API Endpoints:
    - GET/POST /api/audio-triggers - List/Create triggers
    - GET/PUT/DELETE /api/audio-triggers/{id} - CRUD
    - POST /api/audio-triggers/{id}/in-sound - Upload IN sound
    - POST /api/audio-triggers/{id}/out-sound - Upload OUT sound
    - DELETE /api/audio-triggers/{id}/in-sound - Delete IN sound
    - DELETE /api/audio-triggers/{id}/out-sound - Delete OUT sound
    - POST /api/audio-triggers/{id}/test - Manual activate/deactivate
    - GET /api/audio-triggers/station/{station}/active - Public active check
    - GET /api/audio-triggers/logs - Detection logs
  - Libraries installed: librosa, scipy, soundfile (for audio fingerprinting)
  - Tested: API endpoints working, manual activation/deactivation verified

### February 13, 2026 - Calendar Rendering Bug Fix
- [x] **P0 Bug Fix: Calendar Shows Disappearing**:
  - Bug: When there are many recurring shows (500+), shows would disappear from the calendar view
  - Root cause: Backend API `/api/shows` used `.to_list(1000)` limit with descending date sort
  - This meant older shows were cut off when total shows exceeded 1000
  - Fix in `backend/routers/shows.py`:
    - Increased limit from 1000 to 5000
    - Changed sort order from descending (-1) to ascending (1) 
    - This ensures oldest shows aren't cut off if limit is reached
  - Tested with 2000+ shows - all calendar days now display correctly
  - Files updated: `backend/routers/shows.py` line 587-589

### February 13, 2026 - Now Playing Formatting & Recurring Show Images Fix
- [x] **Now Playing Title Formatting (P0)**:
  - Artist names now display in UPPERCASE (e.g., "PHIL COLLINS")
  - Song titles display in Title Case (e.g., "In The Air Tonight")
  - Implemented in `backend/services/shoutcast.py` with `format_now_playing()` function
  - Handles edge cases: missing separator, empty title after filtering
  - Filters are applied first, then formatting
  - Example: "phil collins - in the air tonight" → "PHIL COLLINS - In The Air Tonight"
  
- [x] **Recurring Show Images Bug Fix (P0)**:
  - Bug: Images from show_titles weren't being propagated to recurring show instances
  - Root cause: `create_show()` and `enable_recurrence()` didn't copy the image field
  - Fixes implemented:
    1. When creating recurring shows, image is fetched from show_title and applied
    2. When enabling recurrence, image is copied from parent show or show_title
    3. New endpoint: POST /api/shows/titles/sync-images - syncs existing shows with their title's image
  - Files updated: `backend/routers/shows.py`
  - Ran sync: 52 shows of "Backstage Radio" were updated with missing images
  
- [x] **System Dependency: ffmpeg**:
  - Re-installed ffmpeg for audio trigger detection (required for stream analysis)
  - Note: System-level dependencies may need re-installation after forks

### February 14, 2026 - Pagina's (Landing Pages) Feature
- [x] **New Feature: Pagina's / Landing Pages**
  - Create custom public landing pages with configurable URLs (e.g., /radio-test)
  - Features per page:
    - **Logo upload** - Custom branding
    - **Audio Player** - MP3/AAC livestream OR uploaded audio file
    - **Video Player** - YouTube, Vimeo, Twitch embeds OR HLS stream
    - **Contact Form** - Naam, Telefoonnummer, Bericht + custom fields
    - **Password Protection** - Optional page access control
  - Admin features:
    - Manage sites in Dashboard under Administration > Pagina's
    - View form submissions per site
    - Assign users with editor/viewer roles
  - Files created:
    - `backend/models/sites.py` - Site, FormField, Submission models
    - `backend/routers/sites.py` - CRUD, uploads, submissions API
    - `frontend/src/pages/Sites/SitesListPage.js` - Sites overview
    - `frontend/src/pages/Sites/SiteDashboard.js` - Site settings with tabs
    - `frontend/src/pages/Sites/PublicSitePage.js` - Public landing page renderer
  - Database collections: `sites`, `site_submissions`, `site_users`

### Now Playing Formatting Improvements
- [x] **Unformatted Title Detection** - If the now playing text is still all caps (not properly formatted), show fallback text to give the cache time to update
- [x] **Artist Case Check** - Also detect when artist is not in UPPERCASE (e.g., "The Cranberries" instead of "THE CRANBERRIES")


### February 14, 2026 - Sites Navigation Improvement
- [x] **Renamed "Pagina's" to "Sites"**:
  - Menu dropdown under user profile now shows "Sites" instead of "Pagina's"
  - Sites list page header changed to "Sites"
  - Button changed to "Nieuwe site" instead of "Nieuwe pagina"
  - Empty state message updated to "Geen sites" instead of "Geen pagina's"
  - Files updated: `DashboardLayout.js`, `SitesListPage.js`

- [x] **Dynamic Sites Listing in Dropdown**:
  - Sites are now listed dynamically under "Sites" in user dropdown
  - Each site links directly to its dashboard (/sites/{id})
  - Sites are fetched via `/api/sites` for admin users
  - Shows site logo/icon and name for quick navigation
  - File: `DashboardLayout.js` lines 158-166, 582-606

- [x] **Context-Switching Sidebar**:
  - When navigating to a site dashboard (/sites/{id}):
    - Main sidebar is replaced with site-specific menu
    - "Terug naar Sites" back navigation button at top
    - Site name and slug displayed in header
    - Menu items: Algemeen, Media, Formulier, Inzendingen, Gebruikers
  - When clicking "Terug naar Sites" or navigating away:
    - Normal sidebar is restored
  - Uses custom event `siteTabChange` for tab switching between sidebar and SiteDashboard
  - Files: `DashboardLayout.js` lines 99-105 (siteNavItems), 392-442 (site-specific nav render)
  - File: `SiteDashboard.js` lines 29-34 (event listener)

- [x] **Testing**: All 9 navigation features tested with 100% success rate


### February 14, 2026 - Sites Feature Enhancements
- [x] **S3 Uploads for Site Assets**:
  - Logo, header image, and audio files now upload to S3
  - Fallback to local storage if S3 is not configured
  - URL handling supports both S3 (http://) and local paths
  - Files: `backend/routers/sites.py` lines 221-372 (upload endpoints)

- [x] **Dynamic Browser Tab Titles**:
  - Main pages: "Clara | [Team Name]"
  - Site dashboard: "Clara | [Site Name]"
  - Public pages: "[Site Name]" (no prefix)
  - Files: `DashboardLayout.js` lines 203-212, `PublicSitePage.js` line 40

- [x] **Dropdown Menu Cleanup**:
  - Sites header with Globe icon
  - Individual sites with Home icon (same as team)
  - Proper alignment with pl-8 indentation
  - File: `DashboardLayout.js` lines 658-686

- [x] **Header Image for Public Pages**:
  - New "Header Afbeelding" section in Media tab
  - Upload endpoint: `POST /api/sites/{id}/header`
  - Shows above audio player (only if video is disabled)
  - Model field: `header_image_url` added to Site
  - Files: `SiteDashboard.js` lines 439-479, `PublicSitePage.js` lines 287-295, `backend/models/sites.py`

- [x] **Testing**: All 11 backend tests passed, all frontend features verified (100% success rate)


### February 14, 2026 - Sites UI Refinements (Phase 3)
- [x] **Header Logo Verwijderd**:
  - Dashboard header toont nu alleen team/site naam, geen logo meer
  - Vermindert visuele rommel in de header
  - File: `DashboardLayout.js` lines 862-879

- [x] **Logo Schaling met Percentage**:
  - Nieuwe slider (10-200%) om logo grootte op publieke pagina in te stellen
  - Live preview van geschaalde logo in site dashboard
  - Model field: `logo_scale` (int, default 100)
  - Files: `SiteDashboard.js` (slider + preview), `PublicSitePage.js` (getLogoStyle function)

- [x] **Compacte Header op Publieke Pagina**:
  - Header verkleind met minimale spacing (mb-2)
  - Audio player plakt direct tegen header afbeelding
  - Kleinere padding voor cleaner uiterlijk
  - File: `PublicSitePage.js` lines 317-357

- [x] **Configureerbare Knop Kleuren**:
  - Kleurenkiezer met hex input in Formulier tab
  - Live preview van "Verstuur" knop
  - Model field: `button_color` (str, nullable)
  - Publieke pagina past kleur toe op form submit en play button
  - Files: `SiteDashboard.js` (Form tab), `PublicSitePage.js` (buttonStyle, buttonClassName)

- [x] **Bestandsuploads in Contactformulier**:
  - Toggle "Bestandsuploads toestaan" in Formulier tab
  - Bezoekers kunnen afbeeldingen, audio en video uploaden (max 50MB)
  - Bestanden worden naar S3 geüpload
  - Model fields: `form_file_upload_enabled`, `file_urls` in submissions
  - New endpoint: `POST /api/sites/public/{slug}/upload-file`
  - Files: `backend/routers/sites.py` line 568, `backend/models/sites.py`, `PublicSitePage.js`

- [x] **Testing**: 16/16 backend tests passed, all 9 frontend features verified (100% success rate)

### February 15, 2026 - UI Polish & Generalization
- [x] **Login Page Generalization**:
  - Changed hero text from "Plan Your Radio Shows Like a Pro" to "Manage Your Network With Ease"
  - Updated subtitle to be more generic ("all-in-one dashboard" instead of "radio professionals")
  - Changed sign-in text from "access your shows" to "access your dashboard"
  - Replaced radio studio background image with abstract purple gradient waves
  - Image: https://images.unsplash.com/photo-1654198340681-a2e0fc449f1b
  
- [x] **Browser Tab Title**:
  - Changed from "Clara | Koodh Radio" to "Clara | Network"
  - File: `frontend/public/index.html`
  
- [x] **Create Main Site Dialog - English Placeholders**:
  - Changed "Mijn Radio Station" placeholder to "My Awesome Project"
  - Changed "mijn-station" placeholder to "my-awesome-project"
  - File: `frontend/src/pages/Network/NetworkDashboard.js`
  
- [x] **Network Dashboard AlertDialog**:
  - Replaced window.confirm for delete main site with styled AlertDialog
  - Consistent with AlertDialog pattern used elsewhere in the app
  - File: `frontend/src/pages/Network/NetworkDashboard.js`

## Upcoming Tasks (P1)
- **Configurable "Stale Now Playing" Timeout** - Make the 15-minute timeout in shoutcast_service.py configurable via API and UI

## Future Tasks (P2)
- **Stream Monitor VU Meters** - Implement functional VU meters (blocked by browser security, needs WebSocket proxy)

### February 14, 2026 - Sites Feature Updates (Phase 4)
- [x] **Bijlagen Zichtbaar in Inzendingen**:
  - Geüploade bestanden worden nu getoond in de inzendingen view
  - Afbeeldingen tonen als thumbnails (klikbaar)
  - Audio/video bestanden tonen als links met iconen
  - Files: `SiteDashboard.js` lines 971-1017

- [x] **Speaker Icon Hover Kleur**:
  - Volume/mute icon krijgt button_color bij hover
  - Gebruikt onMouseEnter/onMouseLeave voor smooth transition
  - File: `PublicSitePage.js` lines 406-410

- [x] **Achtergrond Kleur Configureerbaar**:
  - Nieuwe kleurenkiezer voor pagina achtergrond
  - Default: #09090b (donker)
  - Model field: `background_color` (str, nullable)
  - Files: `SiteDashboard.js` (Form tab), `PublicSitePage.js`

- [x] **Kader Kleur Configureerbaar**:
  - Aparte kleur voor containers/kaders
  - Default: #18181b (iets lichter donker)
  - Model field: `container_color` (str, nullable)
  - Toegepast op audio player en contactformulier
  - Files: `SiteDashboard.js`, `PublicSitePage.js`

- [x] **Voorbeeld Kleuren Preview**:
  - Gecombineerde preview van alle 3 kleuren in Form tab
  - Toont achtergrond, kader en knop samen

- [x] **Auto-Refresh Inzendingen**:
  - Polling elke 10 seconden op inzendingen tab
  - Toast notificatie bij nieuwe inzendingen
  - Geen page reload nodig
  - File: `SiteDashboard.js` (submissionsPollingRef)

- [x] **Counter Badges voor Inzendingen**:
  - Badge in sidebar toont aantal ongelezen inzendingen
  - Badge verdwijnt na bekijken tab (mark-viewed)
  - Polling elke 15 seconden voor badge updates
  - New endpoints: `/api/sites/{id}/submissions/count`, `/api/sites/{id}/submissions/mark-viewed`
  - Files: `DashboardLayout.js` (submissionCounts), `backend/routers/sites.py`

- [x] **Testing**: 17/17 backend tests passed, all 11 frontend features verified (100% success rate)

### February 14, 2026 - Sites UI Improvements (Phase 5)
- [x] **Styling Tab Created**:
  - New separate "Styling" menu item with Palette icon
  - Moved all color settings (Button, Background, Container) from Form tab to Styling tab
  - Files: `DashboardLayout.js` (menu), `SiteDashboard.js` (styling tab)

- [x] **English Translations**:
  - All Sites feature text translated from Dutch to English
  - Menu items: General, Media, Form, Styling, Submissions, Users
  - "Back to Sites" instead of "Terug naar Sites"
  - All labels, buttons, and messages now in English
  - Files: `SitesListPage.js`, `SiteDashboard.js`, `DashboardLayout.js`

- [x] **Logo Image Fix**:
  - Fixed broken logo display on SitesListPage
  - Added `getImageUrl()` helper to properly handle S3 URLs vs local paths
  - File: `SitesListPage.js` line 98-101

- [x] **Testing**: Verified via screenshots - all changes working correctly


### February 14, 2026 - RDS Builder Apostrophe Bug Fix
- [x] **Bug Fix: Incorrect capitalization after apostrophes in RDS builder**:
  - Problem: Python's `str.title()` treats apostrophes as word boundaries
  - Example: "it's" became "It'S" instead of "It's"
  - Solution: Created `smart_title_case()` function with regex-based apostrophe handling
  - Supports various apostrophe types: ' ' ʼ
  - File: `/app/backend/services/shoutcast.py` (lines 97-134)
  - Test cases verified:
    - "it's nice" → "It's Nice" ✅
    - "don't stop" → "Don't Stop" ✅
    - "can't help" → "Can't Help" ✅
    - "livin' la vida" → "Livin' La Vida" ✅


### February 14, 2026 - Multisite Architecture Implementation

**Major Feature: WordPress-style Multisite Architecture**

This feature introduces a hierarchical organization structure similar to WordPress Multisite, allowing the management of multiple main sites (organizations) with nested mini sites.

#### Architecture Overview
```
clara.koodh.com/
├── (root)                        → Network Admin Dashboard (for network admins)
│                                 → Site Selector (for regular users)
├── /radiogroep/                  → Main Site Dashboard (configurable features)
│   ├── /radiogroep/shows
│   ├── /radiogroep/sites
│   ├── /radiogroep/mfy-ochtendshow/  → Public Mini Site
│   └── /radiogroep/grk-middagshow/   → Public Mini Site
└── /network                      → Network Admin (manage all main sites)
```

#### Backend Changes
- **New Model: `main_sites.py`**
  - `MainSite`: id, name, slug, description, logo_url, enabled_features
  - `MainSiteUser`: Links users to main sites with roles (admin/editor/presenter/viewer)
  - `AVAILABLE_FEATURES`: 15 configurable features grouped by category

- **New Router: `main_sites.py`**
  - `GET /api/main-sites`: List all main sites (filtered by user access)
  - `POST /api/main-sites`: Create main site (network admin only)
  - `GET /api/main-sites/{id}`: Get main site details
  - `GET /api/main-sites/by-slug/{slug}`: Get main site by URL slug
  - `PUT /api/main-sites/{id}`: Update main site settings
  - `DELETE /api/main-sites/{id}`: Delete main site
  - `GET /api/main-sites/{id}/users`: List main site users
  - `POST /api/main-sites/{id}/users`: Add user to main site
  - `PUT/DELETE /api/main-sites/{id}/users/{user_id}`: Manage user access
  - `GET /api/main-sites/{id}/sites`: List mini sites within main site
  - `GET /api/main-sites/my/access`: Get current user's accessible main sites
  - `GET /api/main-sites/features`: List all available features

- **Updated Models:**
  - `auth.py`: Added `is_network_admin` field to UserResponse
  - `sites.py`: Added `main_site_id` to SiteCreate/SiteResponse

- **Updated Router: `sites.py`**
  - New multisite public endpoints:
    - `GET /api/sites/public/{main_site_slug}/{site_slug}`
    - `POST /api/sites/public/{main_site_slug}/{site_slug}/verify-password`
    - `POST /api/sites/public/{main_site_slug}/{site_slug}/submit`
    - `POST /api/sites/public/{main_site_slug}/{site_slug}/upload-file`

#### Frontend Changes
- **New Context: `MainSiteContext.js`**
  - Manages current main site state
  - Provides `hasFeature()`, `hasPermission()`, `isAdmin()` helpers

- **New Pages:**
  - `NetworkDashboard.js`: Overview of all main sites with create/edit/delete
  - `MainSiteSelector.js`: Site selector for non-network-admin users

- **New Layout: `MainSiteDashboardLayout.js`**
  - Dynamic sidebar based on enabled features
  - Main site dropdown switcher
  - User profile dropdown

- **Updated Routing (`App.js`):**
  - `/`: Network Dashboard (admins) or Site Selector (users)
  - `/network`: Network Admin Dashboard
  - `/:mainSiteSlug/*`: Main Site Dashboard with nested routes
  - `/:mainSiteSlug/:siteSlug`: Public mini site page
  - `/legacy/*`: Legacy routes for backward compatibility

- **Updated Pages:**
  - `SitesListPage.js`: Works with main site context
  - `PublicSitePage.js`: Supports both legacy and multisite URLs

#### Available Features (15 total)
1. **Shows Group:** shows, calendar, show_management
2. **Content Group:** content_library, media_library, content_approval, trash
3. **Communication Group:** team_chat
4. **Streaming Group:** rds_settings, rds_builder, stream_monitor
5. **Sites Group:** sites
6. **Admin Group:** team_settings, wordpress, activity_logs

#### Access Control
- **Network Admin (`is_network_admin: true`):** Full access to all main sites
- **Main Site Admin:** Full access within assigned main site
- **Editor/Presenter/Viewer:** Role-based access within main site

#### Files Created
- `/app/backend/models/main_sites.py`
- `/app/backend/routers/main_sites.py`
- `/app/frontend/src/context/MainSiteContext.js`
- `/app/frontend/src/pages/Network/NetworkDashboard.js`
- `/app/frontend/src/pages/Network/MainSiteSelector.js`
- `/app/frontend/src/components/MainSiteDashboardLayout.js`

#### Files Modified
- `/app/backend/server.py` - Added main_sites_router
- `/app/backend/models/auth.py` - Added is_network_admin
- `/app/backend/models/sites.py` - Added main_site_id
- `/app/backend/services/auth.py` - Added require_network_admin
- `/app/backend/routers/auth.py` - Include is_network_admin in responses
- `/app/backend/routers/sites.py` - Multisite public endpoints + main_site_id in create
- `/app/frontend/src/App.js` - New routing structure
- `/app/frontend/src/pages/Sites/SitesListPage.js` - Main site context support
- `/app/frontend/src/pages/Sites/PublicSitePage.js` - Multisite URL support

#### Test Data Created
- Main Site: "Radiogroep MFY/GRK" (slug: "radiogroep")
- Mini Sites: "MFY Ochtendshow", "GRK Middagshow"
- Test user (test@test.com) set as network admin

### February 14, 2026 - Multisite Bug Verification
- [x] **Personal Settings Page** - Verified working correctly within MainSiteDashboardLayout
  - Profile section shows user info correctly
  - Navigation Display toggle works
  - Save Settings saves preferences with toast confirmation
- [x] **Network Admin Dashboard** - Works correctly for network admins
- [x] **Site Selector** - Shows correctly for users with multiple main sites
- [x] **Site Switcher Dropdown** - Works in sidebar for switching between sites
- [x] **Role-based Access** - admin/editor/presenter/viewer roles work correctly
- [x] **Auto-redirect** - Works when user has only 1 main site access
- [x] **System dependency ffmpeg** - Reinstalled for audio trigger functionality


### February 14, 2026 - Critical Data Isolation Bug Fix (P0)

**Problem:** Newly created Main Sites incorrectly inherited all content from existing Main Sites. A new site "DBNT" showed all 416 shows, 3 media items, etc. from "Radiogroep MFY/GRK" instead of being empty.

**Root Cause:** The backend routers filtered content only by `team_id`, but in a multisite architecture each Main Site must have its own isolated content. The `main_site_id` was not being stored or filtered.

**Solution:** Implemented `X-Main-Site-ID` header-based filtering across all content API endpoints.

#### Backend Changes
- **New Service: `/app/backend/services/main_site_context.py`**
  - `get_main_site_id_from_header()` - Extract X-Main-Site-ID from request
  - `get_required_main_site_id()` - Same but raises 400 if missing
  - `validate_main_site_access()` - Verify user has access to main site
  - `get_main_site_filter()` - Get MongoDB filter dict for main site

- **Updated Routers with main_site_id support:**
  - `/app/backend/routers/shows.py` - GET/POST shows, show_titles, studios
  - `/app/backend/routers/media.py` - GET/POST media assets
  - `/app/backend/routers/content.py` - GET/POST content items, categories
  - `/app/backend/routers/series.py` - GET/POST show series
  - `/app/backend/routers/occurrences.py` - GET/POST occurrences
  - `/app/backend/routers/folders.py` - GET/POST media folders

- **New Migration Endpoint:**
  - `POST /api/main-sites/migrate-content/{main_site_id}` - Migrate existing team content to a main site
  - Updates all content collections: shows, show_titles, studios, media_assets, content_items, categories, series

#### Frontend Changes
- **Updated: `/app/frontend/src/context/MainSiteContext.js`**
  - Added axios interceptor that automatically adds `X-Main-Site-ID` header to all API requests
  - Uses `useRef` to properly manage interceptor lifecycle
  - Header is added only when a main site is selected

- **Minor Fix: `/app/frontend/src/components/MainSiteDashboardLayout.js`**
  - Fixed double slash in mobile nav routes (`/dbnt//dbnt/shows` → `/dbnt/shows`)
  - Changed "Network Beheer" to "Network Management" in user dropdown

#### Test Results
- **Backend:** 21/21 tests passed (100% success rate)
- **Frontend:** All UI features verified working
- **Data Isolation Verified:**
  - Radiogroep: 416 shows, 3 media items (existing content)
  - DBNT: 0 shows, 0 media items (new empty site)

#### New Test Files Created
- `/app/backend/tests/test_data_isolation.py` - Comprehensive data isolation tests
- `/app/backend/scripts/migrate_to_multisite.py` - Standalone migration script

### February 14, 2026 - Data Isolation Race Condition Fix
**Problem:** New main sites were showing content from other sites due to a race condition in the axios interceptor timing. When switching between main sites:
1. The `mainSiteSlug` would change (URL update)
2. `fetchMainSite()` would start fetching the new site data
3. **SIMULTANEOUSLY**, child components (ShowsPage, ContentLibraryPage) would re-render and make API calls
4. The axios interceptor was only updated AFTER `setMainSite()` completed
5. This caused API calls to be made with the OLD or NO `X-Main-Site-ID` header

**Root Cause:** The axios interceptor was set in a `useEffect` hook that ran AFTER the state update and re-render cycle, creating a window where API calls would use stale/missing headers.

**Solution:** Refactored `MainSiteContext.js`:
1. Created a separate `setupInterceptor()` helper function
2. Interceptor is now set BEFORE `setMainSite()` is called in `fetchMainSite()`
3. Interceptor is cleared immediately when `mainSiteSlug` changes (before fetching new site)
4. This ensures the interceptor is always up-to-date before any child component makes API calls

**Testing:**
- Created new test site, verified Shows & Content pages show "No content yet" ✅
- Switched between Radiogroep (with data) and DBNT Studio (empty), data isolation maintained ✅
- Switched back to Radiogroep, data still correct ✅

**Files Changed:**
- `/app/frontend/src/context/MainSiteContext.js` - Complete refactor of interceptor lifecycle management




### February 14, 2026 - Extended Multisite Data Isolation (P0)

**Problem:** User reported that Team Settings, WordPress, and Activity Logs were still showing shared data from Radiogroep MFY/GRK in the new DBNT Studio site.

**Root Cause:** The previous data isolation fix only covered core content types (Shows, Media, Content). Other sections like Teams, WordPress Sites, Audit Logs, and Users were not filtering by `main_site_id`.

**Solution:** Extended the `main_site_id` filtering to all remaining routers and performed a data migration.

#### Backend Changes
- **Updated `/app/backend/routers/teams.py`:**
  - Added `Request` parameter and `get_main_site_id_from_header()` to GET/PUT endpoints
  - Team settings are now isolated per main_site_id

- **Updated `/app/backend/routers/wordpress.py`:**
  - Added `main_site_id` filtering to all WordPress site CRUD operations
  - New WordPress sites are stored with `main_site_id`
  - Query filtering in GET/PUT/DELETE endpoints

- **Updated `/app/backend/routers/logs.py`:**
  - Added `main_site_id` filtering to all audit log endpoints
  - Stats, archive dates, archive logs, and users filter endpoints all updated

- **Updated `/app/backend/routers/users.py`:**
  - GET /api/users now filters by users who have access to the current main_site
  - POST /api/users/invite now also creates main_site_users access record

- **Updated `/app/backend/services/audit.py`:**
  - Added `main_site_id` parameter to `log_action()` function
  - New audit logs are stored with the main_site_id context

#### Data Migration
- Ran migration script to add `main_site_id` to existing records:
  - 2 WordPress sites migrated to Radiogroep main_site_id
  - 842 audit logs migrated to Radiogroep main_site_id

#### Verification Results (All Passing)
- **WordPress Sites:** Radiogroep shows 2 sites (MFY, GRK), DBNT shows 0 sites ✅
- **Activity Logs:** Radiogroep shows 842 logs, DBNT shows 0 logs ✅
- **Team Members:** Radiogroep shows 2 members, DBNT shows 1 member ✅
- **Log Stats:** Properly isolated per main_site ✅


### February 14, 2026 - Mini Sites Bug Fix (Multisite)
- [x] **P0 Bug Fix: Mini Site Creation and Access**:
  - Bug: Creating mini-sites threw an error, and after refresh they appeared but were inaccessible ("Page Not Found")
  - Root causes identified and fixed:
    1. `sites.py` `get_sites` endpoint didn't filter by `main_site_id` header
    2. `sites.py` `create_site` endpoint used body `main_site_id` instead of `X-Main-Site-ID` header  
    3. `sites.py` `get_site` endpoint didn't validate main site context
    4. `sites.py` returned MongoDB `_id` in response causing serialization error
    5. `SitesListPage.js` used `fetch` instead of `axios`, missing the `X-Main-Site-ID` header interceptor
    6. `SiteDashboard.js` also needed `axios` and `mainSiteSlug` for proper header and URL display
  - Fixes implemented:
    - Added `get_main_site_id_from_header` dependency to `GET /api/sites`, `POST /api/sites`, `GET /api/sites/{id}`
    - Added `site_doc.pop("_id", None)` after MongoDB insert
    - Updated `SitesListPage.js` to use `axios` and `useMainSite` context
    - Updated `SiteDashboard.js` with `mainSiteSlug` param for correct URL previews
    - Fixed URL preview in create dialog to show main site slug
  - Files updated:
    - `backend/routers/sites.py` - Added Request import, main_site_id filtering, _id removal
    - `frontend/src/pages/Sites/SitesListPage.js` - Switched to axios, simplified fetching
    - `frontend/src/pages/Sites/SiteDashboard.js` - Added mainSiteSlug, axios, URL fixes
  - Tested: All mini-site operations working (create, list, edit, public access)
  - Data isolation verified: DBNT Studio shows 0 sites, Radiogroep MFY/GRK shows 4 sites

### February 14, 2026 - Mini Site Dashboard Menu Bug Fix
- [x] **P0 Bug Fix: Mini Site Dashboard Menu Not Working**:
  - Bug: The sidebar navigation menu within a mini-site's dashboard did not work. Clicking icons highlighted them but the content area did not update.
  - Root causes identified and fixed:
    1. **Race condition in DashboardLayout.js**: API calls (`fetchCurrentSite`, `fetchSites`, `fetchSubmissionCount`) were executed before `MainSiteContext` had configured the axios interceptor with `X-Main-Site-ID` header
    2. **Missing siteTabChange event in MainSiteDashboardLayout.js**: The onClick handlers for sidebar tabs only called `setSiteTab()` but did NOT dispatch the `siteTabChange` custom event that `SiteDashboard.js` listens for
  - Fixes implemented:
    - **DashboardLayout.js**: Added `useMainSite()` hook and modified all API fetching functions to:
      - Wait for `mainSite?.id` to be available before making API calls
      - Manually add `X-Main-Site-ID` header to each request
    - **MainSiteDashboardLayout.js** (fixed by testing agent): Added `window.dispatchEvent(new CustomEvent('siteTabChange', { detail: item.tab }))` to:
      - `renderIconNavigation()` onClick handler
      - `renderGroupedNavItem()` onClick handler for tab items
  - Files updated:
    - `frontend/src/components/DashboardLayout.js` - Added mainSite context, fixed API calls
    - `frontend/src/components/MainSiteDashboardLayout.js` - Added siteTabChange event dispatch
  - Tested: All 6 sidebar tabs (General, Media, Form, Styling, Submissions, Users) now correctly update content when clicked
  - 100% frontend test success rate

### February 15, 2026 - Sidebar Navigation & AlertDialog Improvements
- [x] **P0 Bug Fix: Mini Site Dashboard Menu Still Not Working**:
  - Bug: Despite previous fix, sidebar menu items still did not change content when clicked.
  - Root cause: The window event-based communication between MainSiteDashboardLayout and SiteDashboard was unreliable due to React rendering lifecycle.
  - Proper fix implemented:
    - **SiteDashboard.js**: Now uses `useOutletContext()` from react-router-dom to get `siteTab` state directly from the layout component instead of relying on window events
    - **DashboardLayout.js**: Now passes `siteTab` and `setSiteTab` via Outlet context when in site context
  - This approach uses React's proper state management instead of browser events, making it more reliable.

- [x] **UI Improvement: Replace Browser Confirm Dialogs with Styled AlertDialogs**:
  - User requested styled confirmation dialogs instead of native browser `window.confirm()` dialogs
  - Replaced all `window.confirm()` calls with shadcn/ui AlertDialog components
  - Files updated:
    1. **SitesListPage.js**: Delete site confirmation with Dutch text ("Site verwijderen", "Annuleren", "Verwijderen")
    2. **RDSOutputManager.js**: Delete output confirmation
    3. **AudioTriggersPage.js**: Delete audio trigger confirmation
    4. **RDSSchedulerPage.js**: Delete scheduled text confirmation
  - All dialogs match the app's dark theme (bg-zinc-900, border-zinc-800) and use red accent for destructive actions
  - Tested and verified: 100% success rate


### December 2025 - Multisite Database Migration Tool
- [x] **In-App Migration Tool for Network Admins**:
  - Feature: Safe, UI-based database migration from single-site to multisite architecture
  - Auto-detection of existing site information from team data
  - Migration status dashboard showing: total documents, already migrated, needs migration
  - Collection-by-collection breakdown of migration status
  - Dry-run mode to preview changes without applying them
  - Full migration execution with confirmation
  - Backend endpoints:
    - `GET /api/admin/migration/detect-site-info` - Auto-detect site name from team data
    - `GET /api/admin/migration/status` - Get current migration status
    - `POST /api/admin/migration/run` - Execute migration (with dry_run option)
  - Frontend component: `MigrationTool.js` in Network Admin dashboard
  - Auto-fills Main Site name from detected team name ("Radiogroep MFY/GRK")
  - Dutch localized UI text for auto-detection banner
  - Files created/updated:
    - `backend/routers/migration.py` - Added detect-site-info endpoint
    - `frontend/src/pages/Network/MigrationTool.js` - Enhanced with auto-detection
  - Tested: 20/20 backend tests passed, 100% frontend verification


### February 15, 2026 - Critical Multisite Post-Migration Hotfix
- [x] **P0 Critical Bug Fix: Application broken after multisite migration**:
  - Bug: Multiple critical features stopped working after database migration to multisite architecture:
    - RDS Settings page failed to load
    - Team Chat failed to load  
    - Content Library navigation links were broken
    - Creating new content failed
    - Site Settings showed "Failed to load team data" error
    - Admin user switching didn't work
  - Root causes identified and fixed:
    1. **Backend**: Many API endpoints still used `team_id` from user token instead of `main_site_id` from `X-Main-Site-ID` header
    2. **Frontend**: Navigation calls used absolute paths without `mainSiteSlug` prefix (e.g., `/shows` instead of `/radiogroep/shows`)
    3. **User switching**: Backend API only searched users by `team_id`, not by `main_site_id`
  
  - **Backend Fixes**:
    - Added `get_data_isolation_filter()` helper in `/app/backend/services/main_site_context.py`
    - Updated `/app/backend/routers/chat.py`:
      - `get_chat_threads()` - Now uses main_site_id from header
      - `get_or_create_team_thread()` - Added Request parameter and main_site_id lookup
      - `create_chat_thread()` - Uses query_filter with main_site_id
      - All member validation checks main_site_users collection
    - Updated `/app/backend/server.py`:
      - `switch_to_user()` - Now checks main_site_users collection for target user access
      - `exit_impersonation()` - Returns to network admin or site admin based on context
    - Updated `/app/backend/routers/shows.py`:
      - `get_presenters_info()` - Now accepts main_site_id parameter
      - `update_show_title()` - Added Request parameter for main_site_id context
  
  - **Frontend Fixes**:
    - Updated `/app/frontend/src/pages/TeamSettingsPage.js`:
      - `switchToUser()` onClick now navigates to `/${mainSiteSlug}/shows`
      - Admin redirect uses mainSite context
    - Updated `/app/frontend/src/pages/ShowDetailPage.js`:
      - Added `useMainSite` hook
      - All `navigate()` calls use mainSite slug prefix
    - Updated `/app/frontend/src/pages/ShowsPage.js`:
      - Added `navTo()` helper function
      - Show card clicks use `navTo('/shows/${id}')`
    - Updated `/app/frontend/src/pages/ContentDetailPage.js`:
      - Added `useMainSite` hook
      - Back button and delete redirect use mainSite context
    - Updated `/app/frontend/src/pages/RDSBuilderPage.js`:
      - Added `useParams` for mainSiteSlug
      - Navigation to audio-triggers and rds-scheduler use mainSite prefix
    - Updated `/app/frontend/src/pages/RDSSchedulerPage.js`:
      - Added `navTo()` helper
      - Back button uses mainSite prefix
    - Updated `/app/frontend/src/pages/LogsPage.js`:
      - Added `navTo()` helper
      - Admin redirect uses mainSite context

  - **Test Results** (All Passing):
    - Login flow: Network admin login works ✅
    - Main sites list: 4 sites found (Radiogroep, DBNT Studio, etc.) ✅
    - RDS Settings: Loads at `/radiogroep/rds` with configuration ✅
    - Chat: Loads at `/radiogroep/chat` with team messages ✅
    - Content Library: Shows 132 items at `/radiogroep/content` ✅
    - Site Settings: Shows 8 team members at `/radiogroep/team` ✅
    - User Switching: Works and preserves URL prefix ✅
    - Data Isolation: Radiogroep has 132 items, DBNT Studio has 0 ✅
  
  - **11/11 Backend API tests passed**
  - **100% Frontend verification success**
  - Test report: `/app/test_reports/iteration_44.json`



### February 16, 2026 - Multisite Navigation Fix ROUND 2 (CRITICAL)

**Problem:** After previous deployment, user reported the same issues persisting:
- Links still missing `/radiogroep/` prefix
- Content not loading
- Navigation broken on shows and content pages

**Root Cause Analysis:**
The previous fix used `useMainSite()` context hook to get `mainSite?.slug`. However, the `mainSite` object is loaded **asynchronously** and can be `null` when the user clicks on a link. This caused the slug to be empty (`''`), resulting in links without the prefix.

**Final Solution:**
Replace `useMainSite()` with `useParams()` to get `mainSiteSlug` directly from the URL. The URL parameter is **always available immediately** since the user is already on the page.

**Pattern Change:**
```javascript
// OLD (unreliable - async loading)
const { mainSite } = useMainSite();
const navTo = (path) => {
  const slug = mainSite?.slug || '';  // CAN BE NULL!
  return slug ? `/${slug}${path}` : path;
};

// NEW (reliable - from URL)
const { mainSiteSlug } = useParams();
const navTo = (path) => mainSiteSlug ? `/${mainSiteSlug}${path}` : path;
```

**Files Updated:**
- `/app/frontend/src/pages/ShowsPage.js` - Changed to `useParams`
- `/app/frontend/src/pages/ShowDetailPage.js` - Changed to `useParams`
- `/app/frontend/src/pages/ContentDetailPage.js` - Changed to `useParams`
- `/app/frontend/src/pages/ContentLibraryPage.js` - Removed unused `useMainSite`
- `/app/frontend/src/pages/CalendarPage.js` - Changed to `useParams`
- `/app/frontend/src/pages/ContentCalendarPage.js` - Changed to `useParams`
- `/app/frontend/src/pages/AdminApprovalPage.js` - Changed to `useParams`
- `/app/frontend/src/pages/TrashPage.js` - Changed to `useParams`
- `/app/frontend/src/pages/ShowManagementPage.js` - Changed to `useParams`
- `/app/frontend/src/pages/WordPressSettingsPage.js` - Changed to `useParams`
- `/app/frontend/src/pages/TeamSettingsPage.js` - Changed to `useParams`

**Verified Working:**
- Shows navigation: `/radiogroep/shows/03a9e943-...` ✅
- Content navigation: `/radiogroep/content/8301110f-...` ✅
- All links now correctly include the mainSiteSlug prefix

---

### February 16, 2026 - Multisite Navigation & Backend API Fixes (P0)

**Problem:** Production deployment at `clara.koodh.com` reported broken links and navigation. Show links were generated without the required `/radiogroep/` slug prefix (e.g., `/shows/some-id` instead of `/radiogroep/shows/some-id`). Additionally, show detail pages failed to load with "Show not found" errors.

**Root Cause:** Two separate issues:
1. **Frontend:** Several pages (CalendarPage, ContentCalendarPage, AdminApprovalPage, TrashPage, ShowManagementPage, WordPressSettingsPage, RDSBuilderPage) had hardcoded `navigate()` calls without the `mainSiteSlug` prefix.
2. **Backend:** The `get_show`, `update_show`, `delete_show`, `get_rundown`, and `create_rundown_item` endpoints in `/app/backend/routers/shows.py` were still using `team_id` filtering instead of the new `main_site_id` from the `X-Main-Site-ID` header.

**Solution:**

#### Frontend Fixes
- **Updated `/app/frontend/src/pages/CalendarPage.js`:**
  - Added `useMainSite` import and hook
  - Added `navTo()` helper function for context-aware navigation
  - Changed `navigate(\`/shows/${show.id}\`)` to `navigate(navTo(\`/shows/${show.id}\`))`

- **Updated `/app/frontend/src/pages/ContentCalendarPage.js`:**
  - Added `useMainSite` import and hook
  - Added `navTo()` helper function
  - Fixed `handleSelectEvent()` to use `navTo()` for content detail navigation
  - Fixed "List View" button to use `navTo('/content')`

- **Updated `/app/frontend/src/pages/AdminApprovalPage.js`:**
  - Added `useMainSite` import and hook
  - Added `navTo()` helper function
  - Fixed redirect after admin approval check
  - Fixed "View" button link for content items

- **Updated `/app/frontend/src/pages/TrashPage.js`:**
  - Added `useMainSite` import and hook
  - Added `navTo()` helper function
  - Fixed redirect for non-admin users
  - Fixed "View" button link for deleted content items

- **Updated `/app/frontend/src/pages/ShowManagementPage.js`:**
  - Added `useMainSite` import and hook
  - Added `navTo()` helper function
  - Fixed redirect for non-admin users

- **Updated `/app/frontend/src/pages/WordPressSettingsPage.js`:**
  - Added `useMainSite` import and hook
  - Added `navTo()` helper function
  - Fixed redirect for non-admin users

- **Updated `/app/frontend/src/pages/RDSBuilderPage.js`:**
  - Added `navTo` prop to `ScheduledTextsManager` component
  - Fixed "Open Full Scheduler" button to use `navTo('/rds-scheduler')`

#### Backend Fixes
- **Updated `/app/backend/routers/shows.py`:**
  - `get_show()` - Now checks `X-Main-Site-ID` header and uses `main_site_id` for query
  - `update_show()` - Added Request parameter, uses `main_site_id` for finding show
  - `delete_show()` - Added Request parameter, uses `main_site_id` for finding and deleting shows
  - `get_rundown()` - Added Request parameter, uses `main_site_id` for show validation
  - `create_rundown_item()` - Added Request parameter, uses `main_site_id` for show validation
  - `get_presenters_info()` - Updated to accept `main_site_id` parameter

#### Test Results (All Passing)
- **Backend:** 11/11 tests passed (100%)
- **Frontend:** All critical navigation flows working (100%)

**Verified Features:**
- Shows page navigation: Clicking show navigates to `/radiogroep/shows/{id}` ✅
- Show detail page: Loads correctly with main_site_id filtering ✅
- Calendar show links: Navigate to correct prefixed URLs ✅
- Content Library navigation: Clicking content navigates to `/radiogroep/content/{id}` ✅
- Rundown API: GET/POST endpoints work with `X-Main-Site-ID` header ✅
- Data isolation: Wrong `X-Main-Site-ID` returns 404 as expected ✅

**Test Report:** `/app/test_reports/iteration_45.json`

### February 16, 2026 - Backend Multisite API Fixes (P0)

**Problem:** Production deployment (`clara.koodh.com`) reported:
1. Content Library showing "content not loaded" errors
2. Content Approval page not loading
3. RDS Cache Logs not working
4. Team Settings page showing blank screen

**Root Cause:** Backend API routers (`content.py`, `rds.py`) were still using old `team_id` logic instead of `main_site_id` from `X-Main-Site-ID` header.

**Solution:**

#### Frontend Fix - TeamSettingsPage.js
- Added missing `mainSite` state variable
- Added fetch for main site info to display site name correctly
- Fixed "undefined" error that caused blank page

#### Backend Fixes - content.py
Updated ALL endpoints to support multisite context using `X-Main-Site-ID` header:
- `PUT /{content_id}/approval` - Content approval endpoint
- `GET /admin/pending-approval` - Pending approval list
- `DELETE /{content_id}` - Delete content
- `GET /{content_id}/audit-logs` - Content audit logs
- `GET /{content_id}/audit-logs/export-pdf` - PDF export
- `POST /{content_id}/featured-image` - Featured image upload
- `DELETE /{content_id}/featured-image` - Featured image delete
- `GET /{content_id}/featured-images` - Get featured images
- `POST /{content_id}/featured-images/{site_id}` - Upload per-site featured image
- `DELETE /{content_id}/featured-images/{site_id}` - Delete per-site featured image
- `GET /{content_id}/publish/{site_id}` - Get publish status

#### Backend Fix - rds.py
- Fixed `debug-live-shows` endpoint that referenced undefined `team_id` variable
- Added missing `@rds_router.get("/cached-rundown")` decorator

**Files Updated:**
- `/app/frontend/src/pages/TeamSettingsPage.js`
- `/app/backend/routers/content.py`
- `/app/backend/routers/rds.py`

**Verified Working:**
- Team Settings page loads correctly ✅
- Content Library shows 132 items ✅
- Content Approval shows 119 pending items ✅
- RDS Settings page loads with configuration ✅
- Shoutcast Logs display now playing tracks ✅

### February 16, 2026 - Network Admin Support Fix (P0)

**Problem:** After initial multisite fixes, user still reported "Failed to load team data" and "Failed to load content" errors.

**Root Cause:** The logged-in user (`admkoodh@koodh.com`) is a **Network Admin** with `team_id: None`. The backend code assumed all users have a `team_id`, causing:
1. Teams endpoint to fail because it couldn't find a team with `id: null`
2. Content endpoints to return empty arrays when filtering by `team_id: null`

**Solution:**

#### teams.py Fix
- Added check for network admins without team_id
- Returns default "Network Administration" team object for network admins
- Ensures response model validation passes with valid `created_at` timestamp

#### content.py Fixes
- Added `is_network_admin` check to content queries
- Network admins without team_id now see ALL content (not filtered by team)
- Pending approval endpoint also supports network admins

**Files Updated:**
- `/app/backend/routers/teams.py`
- `/app/backend/routers/content.py`

**Verified Working:**
- Team Settings: Shows "Network Administration" with 8 team members ✅
- Content Library: Shows 132 items ✅
- Content Approval: Shows 119 pending items ✅
- All API endpoints return correct data ✅

### February 17, 2026 - Production Deployment Fix (P0 Critical)
**Root Cause:** Pydantic `ResponseValidationError` - `team_id: str` in response models rejected `None` values from MongoDB for Network Admin content items.

**Error:** `{'type': 'string_type', 'loc': ('response', 0, 'team_id'), 'msg': 'Input should be a valid string', 'input': None}`

**Fix Applied:** Changed `team_id: str` to `team_id: Optional[str] = None` across ALL Pydantic response models:
- `models/content.py` - ContentItemResponse
- `models/shows.py` - ShowTitleResponse, StudioResponse
- `models/sites.py` - SiteResponse
- `models/series.py` - ShowSeriesResponse, ShowOccurrenceResponse
- `models/media.py` - MediaAssetResponse, MediaFolderResponse
- `models/chat.py` - ChatThreadResponse
- `models/wordpress.py` - WordPressSiteResponse
- `routers/rds.py` - RDSSettingsResponse, RDSCacheLog

**Verified Working in Preview:**
- `/api/content` returns 132 items ✅
- `/api/content/admin/pending-approval` returns correctly ✅

### February 17, 2026 - Four Bug Fixes

**Fix 1: Featured Images in Content Library**
- Added batch enrichment of `publish_statuses` with featured images to `get_content_items` endpoint
- Fetches `content_item_publishes`, `content_item_featured_images`, and `wordpress_sites` in bulk queries
- All 132 items now display featured images correctly

**Fix 2: RDS Cache Interval → 1 minute**
- Changed scheduler interval from 300s (5min) to 60s (1min)
- Default `cache_refresh_interval` in settings changed from 5 to 1
- Scheduler forces all existing DB settings to 1 minute on startup

**Fix 3: Brussels Timezone (Europe/Brussels)**
- Replaced hardcoded UTC+1 with proper `zoneinfo.ZoneInfo('Europe/Brussels')` (handles CET/CEST automatically)
- Updated all timestamp formatting in scheduler and debug endpoints
- Frontend uses `date-fns-tz` `formatInTimeZone` for Brussels timezone display

**Fix 4: Activity Logs for Network Admin**
- Added `is_network_admin` check to all log endpoints (GET /logs, /logs/stats, /logs/users, /logs/archive-dates, /logs/archive/{date})

### February 17, 2026 - RDS Cache Refresh & Mini Sites UI Fix

**Fix 1: Last Cache Refresh hangt**
- `last_cache_refresh` wordt nu ALTIJD bijgewerkt, ook als er geen live shows zijn
- Updated `rds_settings` query to use `$or` for both `team_id` and `main_site_id` matching

**Fix 2: Cache Logs leeg**
- Logs worden nu altijd aangemaakt (ook "no_show" status)
- `/api/rds/logs` endpoint query updated met `$or` filter voor multisite context
- `run_scheduled_cache_refresh` gebruikt nu `main_site_id` OR `team_id` als identifier

**Fix 3: Mini Sites container outlines verwijderd**
- `SitesListPage.js`: Removed `border border-zinc-800` from site cards and empty state

### February 17, 2026 - RDS Live Show Detection Fix

**Root Cause:** The scheduler queried shows by `team_id: main_site_id`, but shows have `team_id` from child sites. The main_site_id and child site team_ids are different UUIDs.

**Fix Applied:**
- `refresh_live_show_cache()` now resolves `main_site_id` → fetches all child site `team_ids` from `sites` collection → queries shows with ALL resolved team_ids using `$in`
- `get_rds_query_filter()` now returns `$or` query matching both `team_id` and `main_site_id` fields
- Debug endpoint also resolves child site team_ids for accurate show detection
- show_titles lookup uses fallback search without team filter
- Enhanced log messages show how many team_ids were searched


### February 17, 2026 - Network Admin Test & Debug Features

**New Feature: Health Check (Test) Button**
- `POST /api/main-sites/{id}/health-check` - Runs comprehensive checks per main site
- Checks: Mini Sites count, Content Items, Shows (today + total), Users, RDS Cache, WordPress Sites, Media Assets
- Resolves child site team_ids automatically
- Results saved to `health_checks` collection with history
- Frontend modal with green/amber/red status indicators

**New Feature: Debug Panel Button**
- `GET /api/main-sites/{id}/debug` - Returns live debug snapshot
- Shows: Today's shows (with live indicator), Traffic last hour, RDS cache logs, Active rundowns, Shoutcast logs, Recent audit logs, Child sites & team IDs
- Results saved to `debug_snapshots` collection
- Frontend collapsible sections with Refresh button

**Fix: RDS Show Detection**
- Scheduler now resolves `main_site_id` → child site `team_ids` from `sites` collection
- Queries shows with `$in` over all resolved team_ids
- `get_rds_query_filter` returns `$or` query matching both fields

- `SiteDashboard.js`: Removed `border border-zinc-800` from all 8 content containers

- Network Admins with `team_id: null` now see ALL logs across all teams

- No more ResponseValidationError ✅

### February 17, 2026 - RDS Stale Data Bug Fix (P0 Critical)

**Root Cause:** When a scheduled text ended, the RDS Builder would set `scheduled_text_active: false` but keep showing the old `current_text`. If the main sequence was disabled, the scheduler would return early without clearing the stale content.

**Symptoms:**
- `/api/rds-builder/output/{station}.txt` showed "Nieuws update elk uur" (ended scheduled text) at 03:21 Brussels time
- `scheduled_text_ends_at` was "02:03:00" (over an hour ago)
- `scheduled_text_active: false` but `current_item_type: "scheduled_text"` and `current_index: -1`

**Fix Applied in `rds_builder_scheduler.py`:**
1. **Stale State Detection:** Added check for `current_item_type == "scheduled_text" && current_index == -1` when `scheduled_text_active: false` → force refresh
2. **Disabled Sequence Handling:** When sequence is disabled AND output has stale scheduled text, clear it with default text ("altijd dichtbij" / "the feelgood station")
3. **Same fix applied to `process_named_output()` for named RDS outputs (streaming, dab, fm)**

**Verified Working:**
- MFY Output: "altijd dichtbij" ✅ (instead of stale "Nieuws update elk uur")
- GRK Output: "the feelgood station" ✅
- All `/api/rds/{station}/live` endpoints show correct fallback text ✅
- Cache logs correctly show "Geen live show gevonden" with Brussels timezone ✅

### February 17, 2026 - RDS Monitor Dashboard (Improvement)

**New Feature: Real-time RDS Monitoring Dashboard**

Located at `/rds-monitor` - a standalone page accessible without authentication for monitoring displays.

**Backend Endpoints:**
- `GET /api/rds-builder/monitor` - Returns real-time data for both stations + history
- `GET /api/rds-builder/monitor/history` - Returns detailed change history (up to 500 entries)

**Frontend Page: RDSMonitorPage.js**
- Real-time station cards showing:
  - Current RDS output text (large display)
  - Live show info (if active)
  - Now Playing song from Shoutcast
  - Listener count
  - Sequence enabled/disabled status
  - Online/Offline stream status
- History table showing all recent text changes with:
  - Timestamp
  - Station badge (MFY/GRK)
  - Item type icon (Show, Now Playing, Custom, Scheduled, Audio Trigger)
  - Text content
  - Reason for change
- Auto-refresh toggle (2 second interval)
- Manual refresh button

**Backend History Logging:**
- Added `log_text_change()` function to `rds_builder_scheduler.py`
- Logs to `rds_output_history` collection
- Only logs when text actually changes (prevents spam)
- Auto-cleanup keeps max 500 entries per station

**Navigation:**
- Added to sidebar under "Streaming & RDS" group
- Uses Activity icon from lucide-react

**Files Created/Modified:**
- `/app/frontend/src/pages/RDSMonitorPage.js` (NEW)
- `/app/backend/routers/rds_builder.py` (added monitor endpoints)
- `/app/backend/services/rds_builder_scheduler.py` (added history logging)
- `/app/frontend/src/components/DashboardLayout.js` (added nav item)
- `/app/frontend/src/components/MainSiteDashboardLayout.js` (added nav item)
- `/app/frontend/src/App.js` (added standalone route)

### February 18, 2026 - FFmpeg Persistent Installation Fix

**Critical Fix: FFmpeg Auto-Installation on Startup**

**Problem:** FFmpeg was installed manually via `apt-get` but was lost after every container restart, causing Audio Triggers to fail silently.

**Solution:**
- Created `/app/backend/scripts/ensure_ffmpeg.py` - Script that checks and installs ffmpeg if missing
- Modified `server.py` startup to call `ensure_ffmpeg()` before starting schedulers
- Added graceful error handling in `audio_trigger.py` - checks `FFMPEG_AVAILABLE` before processing streams
- New status endpoint: `GET /api/audio-triggers/system/status` - returns ffmpeg/libs/scheduler status

**Implementation Details:**
1. **ensure_ffmpeg.py**: 
   - `check_ffmpeg_installed()` - Uses `shutil.which("ffmpeg")`
   - `install_ffmpeg()` - Runs `apt-get update && apt-get install -y ffmpeg`
   - `ensure_ffmpeg()` - Combined check + install
   - Cached availability to avoid repeated system calls

2. **server.py startup**:
   - FFmpeg check runs before `AudioTriggerScheduler.start()`
   - Logs "FFmpeg is available for audio processing" or warning if not

3. **audio_trigger.py**:
   - Module-level `FFMPEG_AVAILABLE = is_ffmpeg_available()`
   - `analyze_stream_for_trigger()` returns `(False, 0.0)` gracefully if ffmpeg missing
   - Clear warning logged: "FFmpeg not available - cannot process audio stream"

4. **Status Endpoint Response**:
```json
{
  "ffmpeg_available": true,
  "audio_libs_available": true,
  "scheduler_running": true,
  "fully_operational": true,
  "issues": []
}
```

**Files Modified:**
- `/app/backend/scripts/ensure_ffmpeg.py` (NEW)
- `/app/backend/server.py` (startup ffmpeg check)
- `/app/backend/services/audio_trigger.py` (graceful degradation)
- `/app/backend/routers/audio_trigger.py` (status endpoint)

**Testing:**
- Backend restarted successfully
- FFmpeg installation verified via logs
- `/api/audio-triggers/system/status` returns `fully_operational: true`

### December 2025 - Mini Site Password Update Authorization Fix (P0)

**Problem:** When attempting to set a password for a mini-site, the user received a "Site niet gevonden" (Site not found) error.

**Root Cause:** The `update_site` function in `backend/routers/sites.py` used `team_id` from the user object for authorization. Network admins have `team_id: None`, which caused the database query to fail even though they should have access.

**Fix Applied:**
The authorization logic was completely rewritten to use a multi-step access check:
1. First finds the site by ID (without team restriction)
2. Then verifies user has access via one of these methods:
   - `X-Main-Site-ID` header matches site's `main_site_id`
   - User's `team_id` matches site's `team_id`
   - Network admin has access via `main_site_users` collection
   - Admin role with matching team

**File Updated:**
- `/app/backend/routers/sites.py` - `update_site` function (PUT /api/sites/{site_id})

**Verified Working:**
- Password update for mini-site: ✅
- Password verification on public page: ✅
- Tested with network admin account `admkoodh@koodh.com`


### December 2025 - Public Schedule API for WordPress Integration

**Feature:** Created a public, unauthenticated API endpoint to serve Clara schedule data to WordPress websites.

**Implementation:**
- **New Router:** `/app/backend/routers/public_schedule.py` (already existed)
- **Router Registration:** Added `public_schedule_router` to `server.py`
- **Endpoint:** `GET /api/public/schedule/{station}` 
  - `station` can be: `mfy`, `grk`, or `both`
  - Requires `X-Main-Site-ID` header OR `main_site_id` query parameter
  - Returns weekly schedule grouped by day (maandag, dinsdag, etc.)

**API Response Format:**
```json
{
  "maandag": [
    {
      "id": "uuid",
      "title": "Show Name",
      "description": "Show description",
      "start_time": "19:00",
      "end_time": "20:00",
      "date": "2026-02-16",
      "presenter": "Presenter Name",
      "image": "https://s3.url/image.jpg",
      "rds_station": "mfy"
    }
  ],
  "dinsdag": [],
  ...
}
```

**Additional Endpoints:**
- `GET /api/public/schedule/{station}/today` - Returns today's shows only
- `GET /api/public/schedule/{station}/day/{day}` - Returns shows for specific day

**Files Modified:**
- `/app/backend/server.py` - Added `public_schedule_router` import and registration

**Testing:**
- Endpoint tested with curl and returns correct schedule data ✅
- Works with both header and query parameter ✅
- Station filtering works correctly (mfy, grk, both) ✅

**Next Steps:**
- User needs to create WordPress plugin that consumes this API
- Plugin code was provided in previous session chat history
- Cleanup of old ProRadio sync code recommended after verification

### Timezone Fix - GMT+1 Enforcement (February 2026)

**Issue:** Incorrect times were displayed throughout the application due to inconsistent timezone handling (using UTC + timedelta(hours=1) instead of proper Europe/Brussels timezone).

**Solution:** Created a centralized timezone utility module and updated ALL time-related code to use Brussels timezone.

**New Module:** `/app/backend/services/timezone_utils.py`
- `BRUSSELS_TZ` - ZoneInfo('Europe/Brussels')
- `now_brussels()` - Get current time in Brussels
- `today_brussels()` - Get today's date in Brussels (YYYY-MM-DD)
- `current_time_brussels()` - Get current time as HH:MM
- `yesterday_brussels()` - Get yesterday's date
- `is_time_between()` - Check if time is in range (handles midnight-crossing)
- `format_datetime_brussels()` - Format datetime with Brussels TZ

**Files Modified:**
- `/app/backend/services/rds_scheduler.py` - Live show detection
- `/app/backend/services/rds_builder_scheduler.py` - Scheduled text timing
- `/app/backend/services/shoutcast.py` - Now playing timestamps
- `/app/backend/services/audio_trigger.py` - Time window checking
- `/app/backend/routers/rds_builder.py` - Monitor and scheduled texts
- `/app/backend/routers/public_schedule.py` - Public schedule API
- `/app/backend/routers/shows.py` - Show management
- `/app/backend/server.py` - RDS live endpoints

**Key Pattern:**
```python
# OLD (Wrong)
now = datetime.now(timezone.utc)
now_cet = now + timedelta(hours=1)  # Doesn't handle DST!

# NEW (Correct)
from services.timezone_utils import now_brussels, BRUSSELS_TZ
now = now_brussels()  # Automatically handles CET/CEST
```

**Testing:**
- RDS Monitor now shows correct Brussels time ✅
- Public Schedule API returns correct schedule ✅
- All timestamps in API responses are GMT+1 ✅

### Scheduled Text Priority Change (February 2026)

**Change:** Scheduled texts now have priority OVER live shows.

**New Priority Order (high to low):**
1. Audio triggers (highest - e.g., commercial break detection)
2. Scheduled texts (e.g., news updates)
3. Live shows
4. Normal sequence (lowest)

**Rationale:** User requested that scheduled texts (like news updates) should always be shown, even when a live show is active.

**Code Changed:**
- `/app/backend/services/rds_builder_scheduler.py`: Removed live show checks from `get_active_scheduled_text_for_station()` function

**Testing:**
- Verified: Scheduled text appears on station even with active live show ✅
- Audio triggers still have highest priority ✅

### Two-Factor Authentication (2FA) Implementation (March 2026)

**Feature:** TOTP-based Two-Factor Authentication for enhanced account security.

**How it works:**
1. User sets up 2FA in Personal Settings by scanning QR code with authenticator app
2. On next login, user must enter 6-digit code from authenticator app
3. 10 backup codes are generated for emergency access
4. Each backup code can only be used once

**Supported Authenticator Apps:**
- Google Authenticator
- Microsoft Authenticator
- Authy
- 1Password
- Any TOTP-compatible app

**Backend Endpoints:**
- `POST /api/auth/login` - Modified to support 2FA (returns `requires_2fa: true` if enabled)
- `POST /api/auth/2fa/setup` - Generate secret and QR code
- `POST /api/auth/2fa/verify-setup` - Verify and activate 2FA
- `POST /api/auth/2fa/disable` - Disable 2FA (requires current code)
- `GET /api/auth/2fa/status` - Get 2FA status and remaining backup codes
- `POST /api/auth/2fa/regenerate-backup-codes` - Generate new backup codes

**Files Created:**
- `/app/backend/services/two_factor.py` - TOTP generation, verification, backup codes
- `/app/frontend/src/components/TwoFactorSetup.js` - 2FA setup UI component

**Files Modified:**
- `/app/backend/routers/auth.py` - Added 2FA endpoints and login flow
- `/app/backend/models/auth.py` - Added `totp_enabled` field
- `/app/backend/services/auth.py` - Added `expires_minutes` parameter to `create_token()`
- `/app/frontend/src/pages/LoginPage.js` - 2FA login flow
- `/app/frontend/src/context/AuthContext.js` - Updated login function, added `refreshUser`
- `/app/frontend/src/pages/PersonalSettingsPage.js` - Added 2FA setup section

**Dependencies Added:**
- `pyotp==2.9.0` - TOTP generation/verification
- `qrcode[pil]==8.2` - QR code generation

**Security Features:**
- TOTP codes valid for 30 seconds (with 1 window tolerance for time drift)
- Backup codes are hashed before storage
- Temporary tokens (5 min) for 2FA verification step
- Audit logging for 2FA enable/disable events


### March 1, 2026 - Global 2FA Settings on Network Dashboard
- [x] **Security Dialog on Clara Global Dashboard**:
  - Network Admins can now manage 2FA directly from the Network Dashboard
  - "Beveiliging" button in header opens "Account Beveiliging" dialog
  - "2FA Instellen" button in warning banner also opens the dialog
  - Dialog renders the existing TwoFactorSetup component
  - Warning banner shown when 2FA is not yet enabled
  - Button shows green "2FA Actief" state when 2FA is enabled
  - Added DialogDescription for accessibility compliance
  - File: `/app/frontend/src/pages/Network/NetworkDashboard.js`
  - Tested: 8/8 frontend tests passed (100% success rate)


### March 1, 2026 - Site-Specific Role Permission Fix (Content Approval)
- [x] **Bug Fix: Content Approval denied for site-specific admins**:
  - Root cause: `require_can_approve_content` only checked global role, not site-specific role
  - Users with 'presenter' globally but 'admin' on a specific site were blocked from approving content
  - Fix: Created `get_effective_role()` helper in `services/main_site_context.py`
    - Checks both global role and site-specific role (from `main_site_users` collection)
    - Returns the higher-privilege role when `X-Main-Site-ID` header is present
    - Falls back to global role when no site context
  - Updated endpoints: `PUT /api/content/{id}/approval`, `GET /api/content/admin/pending-approval`
  - Files: `backend/services/main_site_context.py`, `backend/routers/content.py`
  - Tested: 11/11 backend tests passed (100% success rate)

### March 1, 2026 - WordPress & Permission Fixes for DBNT
- [x] **WordPress page access for site-specific admins**:
  - Changed from `useAuth().isAdmin` (global) to `useMainSite().isAdmin()` (site-specific)
  - Site admins on DBNT can now access WordPress settings
- [x] **"Geen toegang" message instead of redirect to shows**:
  - WordPressSettingsPage: Shows access denied message with ShieldAlert icon
  - TeamSettingsPage: Same "Geen toegang" message + fixed loading state bug
- [x] **WordPress backend endpoints - site-specific roles**:
  - All WordPress endpoints (CRUD, test, sync) now use `get_effective_role()` 
  - Site admins can manage WordPress settings for their site
- [x] **Category sync improvements**:
  - Sync now updates category names (not just WP IDs)
  - Removes categories that no longer exist in WordPress
  - Response includes removed count
- [x] **Category creation - site-specific roles**:
  - `POST /api/content/categories` now uses `get_effective_role()` 
- Files modified: `WordPressSettingsPage.js`, `TeamSettingsPage.js`, `wordpress.py`, `content.py`
- Tested: 9/9 backend + 6/6 frontend tests passed (100%)



### March 1, 2026 - Image Resize Feature for Oversized Uploads
- [x] **Client-side image resize when file > 5MB**:
  - Created reusable `ImageResizeDialog` component with progress bar
  - Canvas-based compression: scales dimensions (max 2400px) + reduces quality (0.85→0.4)
  - Progress indicator shows 0-100% during resize
  - Auto-uploads after successful resize
  - Graceful error handling when compression can't reach target size
  - Integrated in: MediaLibraryPage, ContentDetailPage, ShowManagementPage
  - Files: `utils/imageResize.js`, `components/ImageResizeDialog.js`
  - Tested: 9/9 frontend tests passed (100%)

### March 1, 2026 - Login Page Language Fix
- [x] Reverted login page text from Dutch back to English


### March 1, 2026 - Image Resize Fix (PNG→JPEG) & Avatar Multi-Site Fix
- [x] **Image resize now works for all formats (including PNG)**:
  - Root cause: PNG is lossless, canvas quality parameter has no effect
  - Fix: Always convert to JPEG for compression, white background for transparency
  - More aggressive: 10 attempts (was 6), quality down to 0.3, 75% dimension reduction
  - File: `utils/imageResize.js`
- [x] **Avatar upload/delete works on all main sites**:
  - Root cause: `require_admin` only checked global role, user lookup only by admin's team_id
  - Fix: `get_effective_role()` for site admin check + `main_site_users` fallback for user lookup
  - File: `backend/routers/users.py` (upload + delete endpoints)
- Tested: 10/10 tests passed (7 backend + 3 frontend, 100%)

### March 1, 2026 - Media Share Links S3 Fix
- [x] Share endpoint now redirects to S3 URL for S3-stored files
- File: `backend/server.py`


### March 1, 2026 - 2FA Enforcement After Login
- [x] **2FA enforcement dialog after login**:
  - Shows "Secure your account" dialog when user has no 2FA enabled
  - "Set up 2FA now" button opens TwoFactorSetup component
  - "Skip for now (X times remaining)" button allows up to 3 skips
  - After 3 skips: "Two-factor authentication required" - no skip button, mandatory setup
  - Skip count persists in database (`totp_skip_count` field on user)
  - Dialog prevents closing via click-outside or escape key
  - Session-based dismissal: reappears on next login
- Backend: `POST /api/auth/2fa/skip` endpoint, `totp_skip_count` in user model + responses
- Frontend: `TwoFactorEnforcement.js` component, integrated via `TwoFactorEnforcementWrapper` in App.js

### March 1, 2026 - Content Calendar Rewrite
- [x] **Content Calendar matched to Shows Calendar layout**:
  - Completely rewritten from react-big-calendar to custom grid layout
  - Same styling: month grid, day cells with dots, sidebar with details
  - Shows published articles (green dots) and scheduled articles (orange dots)
  - Click a date → sidebar shows articles with title, time, site name, category, featured image
  - Click an article → navigates to content detail page
  - "Back to list" button returns to content library
  - File: `ContentCalendarPage.js`
  - Tested: Layout verified identical to CalendarPage.js, all UI elements present
- [x] **2FA enforcement dialog - hideClose prop**:
  - Removed X (close) button from 2FA enforcement dialogs
  - Added `hideClose` prop to Dialog component

- Tested: 14/14 tests passed (6 backend + 8 frontend, 100%)


### March 1, 2026 - Content Statistics & Analytics Dashboard (Network Admin)
- [x] **New Feature: Comprehensive Statistics Page per Main Site**:
  - Network admin only — accessible from Clara Global Dashboard via "Stats" button on each site card
  - Route: `/statistics/:mainSiteId`
  - **KPI Cards**: Total Articles, Published, Scheduled, Failed
  - **Per WordPress Site Stats**: Published/Scheduled counts per WP site (MFY, GRK, etc.)
  - **Monthly Trend Chart**: Area chart showing Created/Published/Scheduled over 12 months (recharts)
  - **Approval Status**: Donut chart (Approved/Pending/Rejected)
  - **Publishing per WordPress Site**: Stacked bar chart per month per WP site
  - **Weekly Content Activity**: Bar chart showing weekly content creation
  - **Content per Category**: Horizontal progress bars with counts
  - **Top Content Creators**: Ranked table with avatars, total items, approved, published to WP, pending
  - **PDF Export**: Server-side PDF generation with ReportLab (dark theme, landscape A4, vector text, proper charts)
  - Backend: 6 endpoints in `/app/backend/routers/statistics.py`
    - `GET /api/statistics/{main_site_id}/overview`
    - `GET /api/statistics/{main_site_id}/monthly`
    - `GET /api/statistics/{main_site_id}/top-authors`
    - `GET /api/statistics/{main_site_id}/per-site-monthly`
    - `GET /api/statistics/{main_site_id}/weekly-activity`
    - `GET /api/statistics/{main_site_id}/export-pdf`
  - PDF Service: `/app/backend/services/pdf_report.py`
  - Frontend: `/app/frontend/src/pages/Network/StatisticsPage.js`
  - Dependencies added: recharts (frontend), reportlab (backend)
  - Tested: 100% backend + 100% frontend (iteration_53.json)


### March 1, 2026 - Backup Management & Site Cloning System (Network Admin)
- [x] **New Feature: Backup Management Dashboard** (`/backups`):
  - Network admin only — accessible from "Backups" button in Clara Global header
  - **Per-site backup list** with status indicators (completed/failed/in-progress)
  - **Manual backup creation** — dumps all site data to gzipped JSON, uploads to S3
  - **Automatic daily backups** at 03:00 UTC via background scheduler
  - **Restore from backup** with automatic safety backup (pre-restore)
  - **30-day retention** — expired backups auto-cleaned
  - **Status cards**: Total Backups, Last Backup, Failed count, Storage Used
- [x] **New Feature: Site Cloning**:
  - Clone any main site with all data (content, shows, WordPress config, settings)
  - Child sites get `[CLONE]` prefix, clone site gets unique slug
  - Delete clones when done testing
  - Clone listing per source site
- Backend: `/app/backend/routers/backups.py`, `/app/backend/services/backup_service.py`, `/app/backend/services/backup_scheduler.py`
  - `GET /api/backups/{main_site_id}` — list backups
  - `POST /api/backups/{main_site_id}` — create manual backup
  - `POST /api/backups/{main_site_id}/restore` — restore with safety net
  - `DELETE /api/backups/single/{backup_id}` — delete backup
  - `POST /api/backups/{main_site_id}/clone` — clone site
  - `GET /api/backups/{main_site_id}/clones` — list clones
  - `DELETE /api/backups/clone/{clone_id}` — delete clone
  - `POST /api/backups/system/run-daily` — trigger daily backup manually
- Frontend: `/app/frontend/src/pages/Network/BackupManagementPage.js`
- Collections backed up: main_sites, teams, sites, main_site_users, content_items, content_item_publishes, wordpress_sites, shows, show_titles, show_series, show_occurrences, categories, studios, media_assets, media_folders, rundowns, rds_settings
- Tested: 100% backend + 100% frontend (iteration_54.json)


### March 1, 2026 - Clone DevTools System (Network Admin)
- [x] **New Feature: Clone Sites are Navigable**:
  - Clone sites appear in NetworkDashboard with [CLONE] badge and "Open Clone (DevTools)" button
  - Full navigation within clone works identically to regular sites
  - `cloned_from` field added to MainSiteResponse model
- [x] **New Feature: DevTools Panel (Clone-only)**:
  - Floating panel in bottom-right corner, only on clone sites
  - **Network tab**: Real-time API call interceptor — logs all fetch() calls with method, status, URL, duration, request/response bodies
  - **Inspect tab**: Element inspection mode — hover over elements to see data-testid, component file, API endpoints; click to pin tooltip; view source code
  - **Snapshots tab**: Create/restore snapshots within a clone (uses backup service)
  - Expandable/collapsible panel with maximize mode
  - Click any API call to see full request/response detail in modal
- [x] **New Feature: Source Code Viewer**:
  - Backend endpoint `GET /api/devtools/source?file=path` serves frontend source files
  - Security: only `src/pages/`, `src/components/`, `src/context/`, `src/utils/` paths allowed
  - Path traversal protection
  - Line-numbered code display with basic syntax highlighting
- [x] **Clone Mode Banner**: Cyan banner at top "CLONE MODE — DevTools active"
- Files:
  - `frontend/src/context/DevToolsContext.js` — Fetch interceptor context/provider
  - `frontend/src/components/DevTools/DevToolsPanel.js` — Panel with tabs
  - `frontend/src/components/DevTools/DevToolsInspector.js` — Element hover inspection + code viewer
  - `backend/routers/devtools.py` — Source code endpoint
  - `backend/models/main_sites.py` — Added cloned_from field
- Tested: 100% backend (15/15) + 100% frontend (iteration_55.json)


### March 2, 2026 - Ticketing / Support System (Complete)
- [x] **Help Button**: Floating help button (bottom-left) visible on all main site pages
  - Auto-detects current page name, user name, browser info
  - Shows user journey preview (last 6 pages visited)
  - Priority selector: Low, Normal, High, Urgent
  - Creates ticket via POST /api/tickets/
- [x] **User Journey Tracking**: JourneyProvider context tracks page navigation
  - Records URL, page name, timestamp for each navigation
  - Stores up to 50 steps, deduplicates consecutive same pages
  - Submitted with ticket for admin review
- [x] **Ticket Management Page** (/:mainSiteSlug/tickets):
  - List view with status filters (All, Open, In Progress, Resolved, Closed)
  - Shows ticket title, description, priority, creator, page, timestamp, message count
  - Click to open ticket detail
- [x] **Ticket Detail Page** (/:mainSiteSlug/tickets/:ticketId):
  - Conversation thread with admin/user message distinction
  - Admin badge on admin replies
  - Visual User Journey timeline (color progression green→blue→amber→red)
  - Ticket metadata panel (page, URL, browser, IP, site)
  - Status change buttons for admins
  - Reply input with Enter to send
- [x] **Backend Endpoints**:
  - POST /api/tickets/ - Create ticket
  - GET /api/tickets/ - List tickets (admins see all, users see own)
  - GET /api/tickets/{id} - Get ticket with messages and journey
  - POST /api/tickets/{id}/messages - Add message
  - PUT /api/tickets/{id}/status - Update status (admin only)
  - GET /api/tickets/notifications - Unread notification count
  - POST /api/tickets/notifications/read - Mark notifications as read
- [x] **Navigation**: "Support Tickets" nav item in "Support" group (always visible)
- [x] **Notifications**: Admins notified on new tickets, users notified on admin replies
- Database collections: `tickets`, `ticket_messages`, `ticket_notifications`
- Files:
  - `backend/routers/tickets.py` - All ticket endpoints
  - `frontend/src/context/JourneyContext.js` - User journey tracking
  - `frontend/src/components/Tickets/HelpButton.js` - Floating help button + form
  - `frontend/src/pages/Tickets/TicketsPage.js` - Ticket list + detail views
  - `frontend/src/App.js` - JourneyProvider wrapper, ticket routes
  - `frontend/src/components/MainSiteDashboardLayout.js` - HelpButton render, nav item
- Tested: 100% backend (17/17) + 100% frontend (iteration_56.json)


### March 2, 2026 - Firewall Extended Features (Complete)
**Bug Fix:**
- [x] Activity logs per main site: Fixed $or query that was leaking logs from other main sites (removed fallback `team_id: None` match)

**New Features:**
- [x] **Security Audit** (GET /api/firewall/audit/{main_site_id}):
  - Score 0-100 with grade (good/moderate/poor)
  - Checks: firewall enabled, brute force config, geo-blocking, IP rules, 2FA adoption, temp passwords, password age
  - Lists weak password users with "Force Change" and "Block" action buttons
  - Lists users without 2FA
  - Rescan button for live audit
- [x] **Live Session Monitoring** (Sessions tab):
  - All active sessions with user name, email, IP, geolocation, browser, start time
  - Live duration timer updating every second
  - Per-session terminate button (remote logout)
  - Per-user terminate all sessions
- [x] **User Blocking**:
  - Block/unblock user accounts manually
  - Blocked users cannot login (403) and all sessions terminated on block
  - Network admins cannot be blocked (protection)
- [x] **Force Password Change**:
  - Admin can force any user to change password
  - ForcePasswordChangeModal blocks entire UI until password changed
  - Appears on login and when already logged in
  - Password change resets the flag
- [x] **Session Tracking**: Every login creates a session record with IP, user-agent, timestamps
  - Logout marks sessions as inactive
  - get_current_user checks session validity (terminated sessions rejected)
- Backend Endpoints:
  - GET /api/firewall/audit/{main_site_id}
  - GET /api/firewall/sessions, POST /api/firewall/sessions/{id}/terminate, POST /api/firewall/sessions/terminate-user/{id}
  - POST /api/firewall/users/{id}/block, POST /api/firewall/users/{id}/unblock
  - POST /api/firewall/users/{id}/force-password-change, POST /api/firewall/users/{id}/cancel-force-password-change
- Database collections updated: `sessions` (new)
- Files:
  - `backend/routers/firewall.py` - Extended with sessions, user blocking, audit, force pw endpoints
  - `backend/routers/auth.py` - Session creation, blocked user check, force pw in responses
  - `backend/services/auth.py` - Session validation in get_current_user
  - `backend/routers/logs.py` - Fixed activity logs main site filter
  - `frontend/src/pages/Network/FirewallPage.js` - 7 tabs: Overview, Security Audit, Sessions, IP Rules, Blocked IPs, Security Logs, Settings
  - `frontend/src/components/Auth/ForcePasswordChangeModal.js` - Modal for forced password change
  - `frontend/src/context/AuthContext.js` - force_password_change support
- Tested: 100% backend (23/23) + 100% frontend (iteration_58.json)


### March 2, 2026 - Firewall & Security System (Complete)
- [x] **Firewall Middleware**: Intercepts every /api request, checks IP blocks, rate limits, IP rules, geo-blocking
- [x] **IP Rules per Main Site**: Whitelist (only allow) and Blacklist (block) with IP addresses and CIDR ranges
- [x] **Brute Force Protection**: Auto-blocks IPs after configurable failed login attempts (default: 5 in 15min → 30min ban)
  - Network admins CAN be locked out by brute force (as requested)
  - Successful login clears attempt counter
- [x] **Rate Limiting**: Configurable per-IP request limits (default: 200 req/60s), auto-blocks at 3x threshold
- [x] **Geo-Blocking**: Uses ip-api.com for IP geolocation, block by country code (ISO 3166-1 alpha-2)
  - 1-hour geo cache, network admins bypass geo rules
- [x] **Security Monitoring Dashboard** (/:mainSiteSlug/firewall):
  - Overview: Stats cards (active blocks, events 24h, failed/successful logins, rate limited, geo blocked)
  - IP Rules: Create/edit/toggle/delete whitelist & blacklist rules
  - Blocked IPs: Manual block/unblock with geo info, auto-blocked IPs shown with reason
  - Security Logs: Filtered by event type, paginated, shows IP/geo/timestamp/details
  - Settings: Configure brute force, rate limiting, geo-blocking per site
- [x] **Network Admin Bypass**: Network admins bypass IP rules and geo-blocking, but NOT brute force or rate limits
- [x] **Auto-Blocking**: Automatic IP blocking on brute force detection and severe rate limit abuse
- Backend Endpoints:
  - GET/PUT /api/firewall/settings/{main_site_id}
  - GET/POST /api/firewall/rules/{main_site_id}, PUT/DELETE /api/firewall/rules/{main_site_id}/{rule_id}
  - GET /api/firewall/blocks, POST /api/firewall/blocks, DELETE /api/firewall/blocks/{ip}
  - GET /api/firewall/logs, GET /api/firewall/logs/stats
  - GET /api/firewall/geo/{ip}
- Database collections: `firewall_settings`, `firewall_rules`, `firewall_blocks`, `security_logs`
- Files:
  - `backend/services/firewall_service.py` - Core firewall logic
  - `backend/routers/firewall.py` - API endpoints
  - `backend/middleware/firewall_middleware.py` - Request interceptor
  - `backend/routers/auth.py` - Brute force integration
  - `frontend/src/pages/Network/FirewallPage.js` - Admin dashboard
- Tested: 100% backend (25/25) + 100% frontend (iteration_57.json)


### March 3, 2026 - Endpoint Protection Verification (Complete)
- [x] **Endpoint Protection Feature Verified**:
  - Formally tested with testing agent: 21/21 backend tests passed, 100% frontend verified
  - All 18 configurable endpoint groups working correctly
  - Toggle public/private per main site works
  - Live connection monitoring with 10s auto-refresh
  - Middleware enforcement: private endpoints reject unauth, public endpoints accessible
  - Always-public endpoints (RDS, uploads, shares) always accessible
  - Test report: `/app/test_reports/iteration_59.json`
  - Test file: `/app/backend/tests/test_endpoint_protection.py`


### March 3, 2026 - Firewall Overview Stats Bug Fix
- [x] **Bug Fix: Firewall Overview showed no data**:
  - Root cause: Stats query filtered on exact `main_site_id`, but login events, IP blocks, etc. are logged without a site context (`main_site_id=None`)
  - Fix: Changed both `/api/firewall/logs/stats` and `/api/firewall/logs` to include global events (`main_site_id=None`) alongside site-specific events using `$in` query
  - Result: Overview now shows all 6 stat cards with real data (successful logins, failed logins, events 24h, etc.)
  - Security Logs tab also now shows all relevant events
  - Files updated: `backend/routers/firewall.py`


### March 4, 2026 - Roles & Permissions Management System
- [x] **Roles & Permissions per Main Site**:
  - Network Admin can manage roles per main site via "Roles" button on site card
  - CRUD for custom roles (create, rename, change color, delete)
  - Default roles seeded automatically: Admin (system), Editor, Presenter, Viewer
  - Granular permissions matrix: 19 features × 4 actions (view/create/edit/delete)
  - 6 permission groups: Shows, Content, Communication, Streaming & RDS, Sites, Administration
  - Bulk toggles: per group, per action column, per feature row
  - System roles (Admin) protected from rename/delete
  - Test report: `/app/test_reports/iteration_61.json` - 18/18 backend, 100% frontend
  - **New files:** `backend/routers/roles.py`, `frontend/src/pages/Network/RolesManager.js`

### March 4, 2026 - Permissions Enforcement (Complete)
- [x] **Backend Permission Middleware** (`middleware/permission_middleware.py`):
  - Maps API route prefixes to features (shows, content_library, media_library, etc.)
  - Maps HTTP methods to actions (GET=view, POST=create, PUT=edit, DELETE=delete)
  - Network admins and site admins bypass all checks
  - Exempt paths: /api/auth, /api/health, /api/main-sites, /api/firewall, /api/roles, /api/tickets, /api/calls/join
  - Returns 403 with descriptive message when permission denied
- [x] **Backend Permission Service** (`services/permissions.py`):
  - `get_user_permissions()`, `has_permission()`, `check_permission()`, `require_permission()` dependency
- [x] **Frontend PermissionsContext** (`context/PermissionsContext.js`):
  - Provides `can(feature, action)`, `canView()`, `canCreate()`, `canEdit()`, `canDelete()` hooks
  - Fetches permissions via `GET /api/auth/me/permissions` with X-Main-Site-ID header
- [x] **Sidebar filtering**: Menu items hidden when user lacks "view" permission for that feature
- [x] **Page-level UI**: Create buttons (e.g. "+ New Show") hidden when user lacks "create" permission
- [x] Test report: `/app/test_reports/iteration_62.json` — 18/18 backend, 100% frontend


### March 4, 2026 - Permission Audit Log
- [x] **Permission Audit Logging**: Middleware logs every 403 permission denial to `permission_audit_logs` collection with user_email, role, feature, action, path, method, IP, timestamp
- [x] **Audit API Endpoints**: `GET /api/roles/audit/logs` (filterable by email, feature, main_site) + `GET /api/roles/audit/stats` (total denials, 24h count, top blocked users/features)
- [x] **Audit Dashboard Panel**: Network Admin only panel accessible from "Permission Audit" button on Network Dashboard. Shows stats cards + filterable/sortable log table with color-coded action badges.
- [x] **New files:** `backend/middleware/permission_middleware.py` (updated), `frontend/src/pages/Network/PermissionAuditPanel.js`
- [x] **DB collection:** `permission_audit_logs` {user_id, user_email, role, main_site_id, feature, action, path, method, ip_address, result, timestamp}

  - **DB collection:** `roles` {id, main_site_id, name, slug, is_system, description, color, permissions, sort_order}


### March 4, 2026 - Bug Fix: "User not found" in Team Settings (Production)
- [x] **Root cause:** User management endpoints (`PUT /users/{id}`, `PUT /users/{id}/role`, `PUT /users/{id}/password`, `DELETE /users/{id}`, `GET /invite/{id}/password`) filtered on `team_id` match. In multi-site context, users assigned to a main site can have different `team_id`s. This caused "User not found" when trying to edit or update their roles.
- [x] **Fix:** Created `_find_user_in_context()` helper that:
  - In multisite context (X-Main-Site-ID header): verifies user via `main_site_users` access
  - Fallback: uses `team_id` matching for backwards compatibility
- [x] **Also fixed:** Role updates now sync to `main_site_users` collection for consistency
- [x] **Files changed:** `backend/routers/users.py` (5 endpoints updated)


### March 3, 2026 - Call Studio Feature Toggle + Clone Visibility
- [x] **Call Studio als feature toggle**: `call_studio` toegevoegd aan AVAILABLE_FEATURES (group: streaming). Network Admin kan het per main site in-/uitschakelen. Verschijnt alleen in sidebar als het is ingeschakeld.
- [x] **Clone sites zichtbaarheid beperkt**:
  - Network Admin: ziet alle sites inclusief clones
  - Admin van parent site: ziet clones van hun main site
  - Editor/Presenter/Viewer: zien GEEN clones
  - Toegepast op zowel `GET /api/main-sites` als `GET /api/main-sites/my/access`
  - Logica getest met unit tests: 3/3 scenarios passed (editor=hidden, admin=visible, viewer=hidden)


### March 3, 2026 - Call Studio Feature (Phase 1) Implemented
- [x] **Call Studio - Phase 1 Complete**:
  - Audio Profiles: CRUD for saving input/output device configurations per user (Studio A, Home Setup, etc.)
  - Device availability detection: warns when saved devices are no longer available
  - Invite Link System: create shareable links for external callers to join calls
  - Public Call Page: external callers can view invite info, enter name, accept & join (no auth required)
  - WebRTC peer-to-peer audio signaling via WebSocket (/ws/call/{room_id})
  - Connection quality monitoring (RTT-based: good/fair/poor indicator)
  - Volume control slider for caller audio
  - Mute/unmute toggle with visual feedback
  - Persistent floating CallWidget: stays visible while navigating through Clara
  - Call History tab: view ended calls with duration
  - Test report: `/app/test_reports/iteration_60.json` - 26/26 backend tests passed, 100% frontend
  - Backend test file: `/app/backend/tests/test_calls.py`

  **New files created:**
  - `backend/models/calls.py` - Pydantic models
  - `backend/routers/calls.py` - API endpoints
  - `backend/services/call_signaling.py` - WebSocket signaling manager
  - `frontend/src/pages/CallPage.js` - Call Studio main page
  - `frontend/src/pages/PublicCallPage.js` - Public caller join page
  - `frontend/src/components/Call/CallWidget.js` - Persistent floating call widget
  - `frontend/src/context/CallContext.js` - Global call state management

  **DB collections:**
  - `audio_profiles`: {id, user_id, name, input_device_id, input_device_label, output_device_id, output_device_label}
  - `call_invites`: {id, token, label, created_by, status, caller_name, call_started_at, call_ended_at, duration_seconds}

## Upcoming: Call Studio Phase 2
- Group calls (multiple callers linked to a group)
- Callback functionality (re-call ended callers)
- Individual caller controls in group context (mute individual, kick, bring back)
- Integration with broadcast mixer (caller audio as a fader input)

## Current Status (March 4, 2026)
### Open Issues
- **P0: Clone Login Bug (Production)** - Users unable to log into cloned main sites on production. Enhanced error handling added for diagnostics. Waiting for user feedback with screenshots/network tab info.

### Recently Completed (March 6, 2026)
- **Bug Fix: Twee live shows op verschillende zenders** - RDS cache nu gekey'd op `team_id + rds_station`. `get_now_playing_station_for()` gefixt: elke station gebruikt altijd eigen shoutcast data.
- **Station Labels op Calendars** - Show Calendar en Content Calendar tonen nu MFY/GRK/Both labels:
  - Shows: rds_station vanuit show_titles, dots gekleurd per station (oranje=MFY, cyaan=GRK, paars=Both)
  - Content: station automatisch afgeleid van WordPress site naam (MFY/GRK)
  - Legenda bijgewerkt met station-kleuren
- **Activity Logs uitgebreid** - Content, Shows, WordPress en Media acties worden nu gelogd
- **Firewall Cross-Site isolatie** - Alle firewall endpoints strikt gefilterd per `main_site_id`


### March 7, 2026 - ZeroTier Network Monitoring Integration
- [x] **ZeroTier Integration (COMPLETE)**:
  - New "technical" site type for main sites (`site_type: "radio" | "technical"`)
  - Technical sites have limited sidebar: Team Settings, ZeroTier, Support only
  - Auto-redirect: navigating to technical site root goes to `/zerotier`
  - Create Main Site dialog with Radio/Technical type selector
  - Technical type hides feature checklist (auto-sets team_settings + zerotier)
  - "Technical" badge on site cards in Network Admin dashboard
  - Backend: ZeroTier config CRUD (API token + Network ID per main site)
  - Backend: ZeroTier network info, member list, authorize/deauthorize endpoints
  - Backend: Masked API token in responses for security
  - Frontend: Full ZeroTier monitoring page with config panel, network overview, member list
  - Frontend: Auto-refresh every 30 seconds, manual refresh button
  - Frontend: Member detail expansion with IP, physical address, client version
  - Backend feature: `zerotier` added to AVAILABLE_FEATURES (technical group)
  - Files: `backend/routers/zerotier.py`, `frontend/src/pages/ZeroTierPage.js`

### March 7, 2026 - Clara Global Enhancements & RBAC Bug Fix
- [x] **View Mode Toggle (COMPLETE)**: Grid/list toggle voor Clara Global Network Dashboard, opgeslagen in user preferences
- [x] **Multiple Network Admins (COMPLETE)**: CRUD voor network admins met primary admin bescherming
- [x] **Network Admin Permissions (COMPLETE)**: Granulaire permissies (manage_sites, manage_users, manage_roles, view_firewall, view_logs, manage_settings) + read-only modus
- [x] **RBAC Page Access Bug Fix (COMPLETE)**: Harde `!isAdmin` redirects vervangen door RBAC permissie checks op ShowManagement, Trash, Logs en RDS pagina's. Race condition fix met permissionsLoading guard.
- [x] **Site Type Labels (COMPLETE)**: Standard/Technical/Clone labels in het MIJN SITES dropdown menu
- [x] **Create Main Site Labels (COMPLETE)**: "Clara Standard" en "Clara Technical" naamgeving

### March 7, 2026 - E-mail Meldingen Systeem
- [x] **SMTP Configuratie (COMPLETE)**: Provider templates (Microsoft 365, Google, Outlook, Custom), auto-fill host/port, test verbinding, test e-mail
- [x] **Notificatie Categorieën (COMPLETE)**: Security, Firewall, Content Library, Show Management, Users, WordPress, System
- [x] **Per-Rol Meldingen (COMPLETE)**: Per rol categorieën aan/uit, meldingstype (Real-time, Daily, Both)
- [x] **Backend Trigger System (COMPLETE)**: `trigger_notification()` functie die real-time e-mails stuurt op basis van rol configuratie
- [x] **Technical Site Grayed Out (COMPLETE)**: Health Check, Debug, Stats, Roles disabled voor technical sites in grid en lijst
- [x] **Zerotier verborgen voor gewone sites (COMPLETE)**: Feature tags en feature checklist filteren zerotier uit voor radio/clone sites
- Tested: 22/22 backend + 100% frontend (iteration_66.json)

### March 8, 2026 - Email Notification System Finalized
- [x] **Full English Translation (COMPLETE)**: All SMTP provider help text, category descriptions, error messages, email templates, and UI labels translated from Dutch to English
- [x] **Notification Triggering Wired Up (COMPLETE)**: 
  - `log_action()` in `services/audit.py` now automatically triggers notifications via `asyncio.create_task()`
  - `log_security_event()` in `services/firewall_service.py` triggers notifications for security/firewall events
  - Audit categories mapped to notification categories (auth→security, user→users, show→shows, content→content, etc.)
  - Noisy events filtered out (api_access, successful_login, Login, Logout, Page view)
- [x] **Daily Digest Scheduler (COMPLETE)**:
  - New service: `services/notification_scheduler.py`
  - Runs daily at 07:00 UTC (08:00 CET)
  - Aggregates last 24h events per role/category
  - Sends HTML summary emails to users with "daily" or "both" notification mode
  - Manual trigger: `POST /api/notifications/send-daily-digest`
- [x] **Notification History Tab (COMPLETE)**:
  - New "History" tab in NotificationSettings dialog
  - Shows recent notification events with category, type, details, timestamp, delivery count
  - "Send Daily Digest Now" button for manual trigger
- [x] **Network Dashboard English Translation (COMPLETE)**:
  - All button labels: "Notifications", "2FA Active"/"Security", "Account Security"
  - All empty states: "No shows today", "No traffic", "No cache logs", etc.
  - Debug Panel: "Shows Today", "Traffic (last hour)", "Active Rundowns", "Recent Activity"
  - Health Check: "Running tests...", "Errors Found", "Warnings", "Previous checks"
  - User Access Debug: "Total Users", "Users WITHOUT site access", loading states
  - All toast messages translated to English
- Tested: 16/16 backend + 100% frontend (iteration_67.json)

### March 8, 2026 - Network Dashboard Sidebar & Per-Site Notifications
- [x] **Network Dashboard Sidebar (COMPLETE)**: Exact match met MainSiteDashboardLayout — glass background, Collapsible groups, orange active state, user dropdown, sticky header, mobile responsive
- [x] **Per-Site Notification Settings (COMPLETE)**: Site selector, per-site role fetching, per-site settings storage with fallback to global
- [x] **Full English Translation Expanded (COMPLETE)**: TwoFactorSetup, NetworkAdminManager, all remaining Dutch text

### March 8, 2026 - System Alert Email, Approval Notifications, Brussels TZ
- [x] **System Alert Email (COMPLETE)**: Fixed email address (clara.global@koodh.com) that receives ALL notifications from ALL sites. Configurable mode (realtime/daily/both). New "System Alert" tab in UI.
- [x] **Content Approval Notifications (COMPLETE)**:
  - When content status → "ready" (pending approval): email to all admins/news_admins on that site + network admins
  - When approved/rejected: email to the content creator with status + reason
  - HTML templates: green gradient (approved), red gradient (rejected), amber gradient (pending)
- [x] **Brussels Timezone (COMPLETE)**: All email timestamps use `Europe/Brussels` (CET/CEST, auto DST)
- [x] **Clara Global Protect Branding (COMPLETE)**: Footer in all emails, test email subject, daily digest subject
- Tested: 17/17 backend + 100% frontend (iteration_69.json)


### Ticket Notification System (COMPLETE - Feb 2026)
- [x] Email notifications on ticket creation → sent to creator + support.ops.clara@koodh.com
- [x] Email notifications on new message/reply → sent to creator + support email (excludes sender)
- [x] Email notifications on status change/closure → sent to creator + support email
- [x] HTML email templates matching Clara Global Protect branding
- [x] Fire-and-forget async email sending via asyncio.create_task
- Tested: 18/18 backend + 100% frontend (iteration_70.json)

### Forgot Password Flow (COMPLETE - Feb 2026)
- [x] "Forgot password?" link on login page
- [x] Forgot password form with email input and back navigation
- [x] POST /api/auth/forgot-password endpoint (no auth required)
- [x] Generates random temporary password, hashes and stores it
- [x] Sets force_password_change=true on user
- [x] Sends temp password via email (Clara Global Protect branded)
- [x] Login response includes force_password_change flag
- [x] ForcePasswordChangeModal forces new password on next login
- [x] Password changed confirmation email sent after successful change
- [x] **Bug fix**: change_password route was missing @auth_router.post decorator
- [x] **Bug fix**: Parameter mismatch fixed (current_password vs old_password)
- Tested: 18/18 backend + 100% frontend (iteration_70.json)

### System Admin Alerts for Backups & Main Sites (COMPLETE - Feb 2026)
- [x] Audit logging added to backup creation (`POST /api/backups/{id}`)
- [x] Audit logging added to backup restore (`POST /api/backups/{id}/restore`)
- [x] Audit logging added to main site creation (`POST /api/main-sites`)
- [x] Audit logging added to main site update (`PUT /api/main-sites/{id}`)
- [x] Audit logging added to main site deletion (`DELETE /api/main-sites/{id}`)
- [x] All events go through centralized audit → notification → system alert pipeline
- [x] System alert email (`clara.global@koodh.com`) receives all these events automatically


### Clara Server Edition - XML Import Module (COMPLETE - Feb 2026)
- [x] New `server` site_type added alongside `radio` and `technical`
- [x] Network Dashboard shows "Clara Server" as third option with "XML imports & sync" description
- [x] Server sites auto-redirect to `/xml-imports` on entry
- [x] **XML Import Dashboard**: Table with search, status filters (All/Processing/Success/Failed), date sort, pagination
- [x] **XML Upload**: Drag-and-drop zone, .xml validation, max 50MB, background processing
- [x] **XML Details**: Full import info, parsed metadata (project, version, date, elements), XML preview
- [x] **XML Parsing**: Extracts project_name, version, date from XML content; handles errors gracefully
- [x] **API Key Management**: Create/list/deactivate keys per main site, key shown only once, hashed storage
- [x] **Agent Upload API**: `POST /api/xml-imports/agent/upload` with `Authorization: Bearer <key>` (no JWT needed)
- [x] **Team Settings**: Server sites support user assignment with roles, same as other site types
- [x] S3 storage with local fallback for XML files
- [x] Sidebar: "Server" nav group with XML Imports + API Keys
- Database: `xml_imports` collection, `xml_api_keys` collection
- Backend: `/app/backend/routers/xml_imports.py`
- Frontend: `/app/frontend/src/pages/Server/` (XmlDashboard, XmlUpload, XmlDetails, ApiKeysPage)
- Tested: 20/20 backend + 100% frontend (iteration_71.json)


### March 8, 2026 - Clara Global Label & UI Verification
- [x] **Clara Global Label (COMPLETE)**: Changed "Clara Global" text in Network Dashboard to "Clara" + yellow "Global" label badge (matching Server/Technical label pattern)
  - Updated 3 locations: mobile header, desktop sidebar, mobile sidebar
  - Yellow color scheme: bg-yellow-500/15 text-yellow-400 border-yellow-500/25
  - File: `frontend/src/pages/Network/NetworkDashboard.js`
- [x] **UI Bug Fixes Verified (from previous agent)**:
  - "Server" labels correctly displayed in dropdown menus (red)
  - "Technical" labels correctly displayed (green)
  - "Clone" labels correctly displayed (amber)
  - Role shows "Network Admin" (not "Admin") in dropdown
  - All site type labels working in MainSiteDashboardLayout dropdown

### March 8, 2026 - Platform-wide Header Consistency Fix
- [x] **Labels verplaatst van sidebar naar header bar**: Alle site-type labels (Standard, Server, Technical, Global) staan nu uitsluitend in de page header bar naast de sitenaam
  - Sidebar toont overal alleen "Clara" zonder labels
  - Network Dashboard header: "Network Management" + geel "Global" label
  - Standard sites header: Site naam + grijs "Standard" label (NIEUW)
  - Server sites header: Linked site naam + rood "Server" label
  - Technical sites header: Site naam + groen "Technical" label
  - Files: `MainSiteDashboardLayout.js`, `NetworkDashboard.js`, `DashboardLayout.js`


### March 8, 2026 - vMix Director Module (NEW FEATURE - COMPLETE)
- [x] **vMix Director Canvas Editor**: Full video director environment for managing vMix overlay elements
  - **Backend**: New router `/api/vmix/` with config CRUD, logo upload, ticker messages CRUD, now playing data, HTML overlay endpoints
  - **Frontend**: Canvas-based 16:9 preview editor with draggable overlay elements

### March 9, 2026 (Session 3) - Rundown Enhancement: Members + Live Viewers (COMPLETE)
- [x] **Rundown Member Management** — per-show member management (editorial staff, not just presenters)
  - Backend: `GET/PUT /api/shows/{show_id}/members` endpoints
  - Frontend: Member avatars in rundown header + member picker dialog
  - Fixed: avatar field resolution (avatar object → avatar_url flat field)
  - Fixed: MainSiteContext hook usage (was using localStorage incorrectly)
- [x] **Live Viewer Presence (WebSocket)** — real-time display of who is viewing a rundown
  - Backend: `/ws/show/{show_id}` WebSocket endpoint with presence broadcasting
  - Frontend: Green live viewer indicators with avatars + count
  - Fixed: WebSocket hook now supports both show and occurrence paths via `wsType` parameter
- [x] **Avatar URL fixes across platform**
  - Fixed `shows.py`, `task_boards.py`, `server.py` WebSocket, `main_sites.py` to correctly resolve `avatar.s3_url`
  - Added `avatar_url` field to `MainSiteUserResponse` Pydantic model
- Tested: iteration_76 (10/10 backend + 100% frontend verified)

### March 9, 2026 (Session 3b) - Rundown Attribution + Live Collaborative Editing (COMPLETE)
- [x] **Rundown Item Attribution** — each rundown item shows who created/last edited it
  - Backend: `created_by` and `last_edited_by` fields with `{id, name, avatar_url}` on create/update
  - Frontend: UserAvatar component with tooltip on hover showing user name
  - Show members (not just editors/admins) can now add/edit rundown items
- [x] **Live Collaborative Editing** — real-time editing via WebSocket
  - WebSocket relay: `editing_start`, `editing_update`, `editing_end` message types
  - Frontend: RundownItemDialog broadcasts field changes as user types (150ms throttle)
  - Frontend: SortableRundownItem shows amber border + pencil icon when someone else edits
  - Frontend: Live text preview - other users see typed text updating in real-time
  - Backend: WebSocket disconnect sends `editing_end` to all remaining viewers
- Tested: iteration_77 (9/9 backend + 100% frontend verified)

### March 9, 2026 (Session 3c) - Platform-wide Avatar Fix (COMPLETE)
- [x] **Unified avatar resolution** — created `getAvatarUrl()` utility for frontend and `resolve_avatar_url()` for backend
  - Backend: resolves `avatar.s3_url` (S3) or `avatar.file_key` (local → `/api/uploads/avatars/{file_key}`)
  - Frontend: `frontend/src/utils/avatar.js` handles all avatar formats (flat avatar_url, avatar.s3_url, avatar.url, avatar.file_key)
- [x] **Fixed 12+ frontend files**: DashboardLayout, MainSiteDashboardLayout, RundownEditor, SortableRundownItem, CreateShowDialog, ShowDetailPage, ShowManagementPage, TaskBoardsPage, TeamSettingsPage, NetworkDashboard, StatisticsPage, ChatPage
- [x] **Fixed 4 backend files**: shows.py, task_boards.py, main_sites.py, server.py (WebSocket)
- [x] Updated Pydantic model `MainSiteUserResponse` to include `avatar_url` field
- Tested: iteration_78 (6/6 backend + 100% frontend verified)

### March 9, 2026 (Session 3d) - Platform Branding & Login Customization (COMPLETE)
- [x] **Quick fix**: "Clara Tasks" → "Tasks" in all site type labels/badges
- [x] **Platform Branding** (Network Admin):
  - Backend: `GET/PUT /api/branding`, upload endpoints for logo, favicon, login images
  - Frontend: BrandingSettings page with full customization controls
  - Dynamic brand name/logo in all sidebars (DashboardLayout, MainSiteDashboardLayout, NetworkDashboard)
  - BrandingContext provider for app-wide branding data
  - BrandLogo component replaces all hardcoded "Clara" text
  - Dynamic favicon updates via BrandingContext
- [x] **Login Page Customization**:
  - Image position: left, right, or fullscreen
  - Image type: static or carousel (with auto-rotate)
  - Upload/delete login background images
  - Live preview in settings
- Tested: iteration_79 (11/11 backend + 100% frontend verified)

  - **5 Overlay Elements**: Logo (uploadable), Clock (live), Ticker (scrolling/static), Now Playing Show, Now Playing Track
  - **Ticker Features**: Configurable separators (bullet, dash, pipe, star, custom), scrolling toggle, text/bg colors, font size
  - **Now Playing**: Linked to XML Server imports for show/track data, presenter photo support
  - **vMix Integration**: Public HTML overlay URLs for vMix Web Browser Input (no auth required)
  - **Overlay URLs Section**: Copy URL buttons for each overlay type
  - **Testing**: 17/17 backend tests passed, all frontend features verified
  - **DB Collections**: `vmix_configs`, `vmix_ticker_messages`
  - **Files**: `backend/routers/vmix.py`, `frontend/src/pages/Server/VmixDirector.js`
  - **Feature ID**: `vmix_director` (added to AVAILABLE_FEATURES and enabled on server sites)

### March 9, 2026 - Backup Support for Server & Technical Sites
- [x] **Backend**: Server-specifieke collections (xml_imports, api_keys, vmix_configs, vmix_ticker_messages) toegevoegd aan backup/restore/clone
- [x] **Frontend**: Site type labels (Server/Technical) toegevoegd aan Backup page site selector
- [x] **Verified**: Server backup bevat xml_imports (3), vmix_configs (1), vmix_ticker_messages (1). Technical backup werkt ook correct.

### March 9, 2026 - Server Mode Selection (XML vs vMix)
- [x] XML Imports en vMix Director zijn nu mutually exclusive keuzes bij het aanmaken van een Server site
- [x] Technical sites tonen ZeroTier als always-enabled grayed-out feature

### March 9, 2026 - Mini Site Form Builder Enhancement (COMPLETE)
- [x] **New field types**: date picker, number (with min/max), letters only, dropdown (select), file upload
- [x] **File upload per field**: Supports image, audio, video or all file types with S3 storage
- [x] **Field configuration**: Placeholder text, required toggle, type-specific options
- [x] **Backend model extended**: FormField model now supports `placeholder`, `file_accept`, `min_value`, `max_value`
- [x] **Public form renders all new types**: Date picker, number input, letters-only validation, dropdown, per-field file upload
- [x] **Admin form builder UI**: Enhanced with all new types, inline placeholder editing, file accept filter buttons, min/max for numbers, textarea for dropdown options
- Files: `backend/models/sites.py`, `frontend/src/pages/Sites/SiteDashboard.js`, `frontend/src/pages/Sites/PublicSitePage.js`

- [x] Beide types: team_settings, firewall, activity_logs als togglebare optional features


### March 9, 2026 (Session 2) - vMix Enhancements + Emails + Board Members
- [x] **vMix Director: Production URL fixed** — hardcoded to `https://clara.koodh.com`, not editable
- [x] **vMix Director: Alignment Grid** — toggleable grid overlay with rule-of-thirds, center crosshair, quarter marks, safe area (90%)
- [x] **vMix Director: Advanced Backgrounds** — all overlay elements (ticker, clock, now_playing) support: transparent, solid color, gradient (2 colors + angle), high-res image upload
- [x] **Email: Clara Tasks site label** — creating a task_scheduler site shows "Clara Tasks" in notification emails
- [x] **Email: User Invite** — team settings invite sends branded email with Clara logo, temp password, site name, role. User gets `force_password_change: true`
- [x] **Email: Task Status Notifications** — moving tasks between columns emails all board members + assignee with status change details
- [x] **Task Scheduler: Board Members** — per-board member selection (not everyone from team settings). Avatar display in board header. Member picker dropdown.
- Tested: iteration_75 (13/13 backend + all frontend verified)


### March 17, 2026 - Configurable Stale Now Playing Timeout
- [x] **Configurable timeout**: Previously hardcoded 15-min stale timeout is now configurable (1-120 min) from RDS Settings page
  - DB: `stale_config` collection with `timeout_minutes`, `recovery_seconds`, `fallback_text`
  - Backend: `GET/PUT /api/rds-builder/stale-config` with validation
  - Frontend: New section on RDS Settings page with timeout input, recovery threshold, and per-station fallback text
  - Shoutcast service loads config from DB on every cycle (no restart needed)
- Files: `services/shoutcast.py`, `routers/rds_builder.py`, `pages/RDSSettingsPage.js`
- Tested: API endpoints verified with curl (get, update, validation)

### March 17, 2026 - Media/Audio S3 AccessDenied Fix
- [x] **Fixed audio/media upload in content library**: Direct S3 URLs returned by editor-files upload and media library were inaccessible (AccessDenied)
  - Created proxy endpoint `GET /api/uploads/editor-files/s3/{file_key}` — 302 redirect to presigned URL
  - Created proxy endpoint `GET /api/media/serve/{asset_id}` — 302 redirect to presigned URL for media library
  - Editor upload now returns proxy URL instead of direct S3 URL
  - Frontend `getFileUrl()` now uses `/api/media/serve/{id}` proxy
  - Added `audio_template_callback` in TinyMCE for proper audio embeds
  - Startup migration: existing content with direct S3 URLs auto-migrated to proxy URLs
- Files: `server.py`, `routers/media.py`, `pages/MediaLibraryPage.js`, `components/RichTextEditor.js`
- Tested: 12/12 tests passed (testing agent), uploads verified with S3 presigned URL redirect

### March 17, 2026 - Radioplayer.org Integration
- [x] **Radioplayer Ingest API Integration**: Full backend service for pushing data to Radioplayer.org
  - **Now Playing Push**: Automatically pushes current track (artist/title) as SPI XML PE (Programme Event) when GRK song changes via shoutcast scheduler hook
  - **Schedule Push**: Automatically pushes 7-day programme schedule as SPI XML PI (Programme Info) when shows are created/updated/deleted
  - **Manual Push**: Admin can manually trigger NP and schedule pushes via UI buttons
  - Config: RPID=056028, Country=056 (Belgium), Ingest URL=core-ingest.radioplayer.cloud
  - Push Log: All push attempts logged with type, status, HTTP code, response body
  - Auto-migration: Adds 'radioplayer' feature to main sites with streaming features on startup
- Backend: `services/radioplayer.py` (core service), `routers/radioplayer.py` (API endpoints), hooks in `shoutcast.py` and `shows.py`
- Frontend: `pages/RadioplayerPage.js` (config + push log), nav link in Streaming & RDS group
- **NOTE**: Radioplayer API returns HTTP 403 — credentials need to be verified with Radioplayer support. The integration is fully built and will work once proper API auth is configured.
- Tested: 17/17 backend tests passed (iteration_86.json), frontend verified

### March 14, 2026 - RDS Monitor Performance Fix
- [x] **Fixed page hanging/freezing**: Refactored RDSMonitorPage.js to fix critical performance issues:
  - Moved `StationCard` outside parent component + wrapped with `React.memo()` to prevent unmount/remount cycles
  - Consolidated 3 separate countdown state updates per second into 1 using refs
  - Increased auto-sync throttle from 10s to 30s to prevent refresh storms
  - Moved helper functions outside component to avoid recreation on each render
- Files: `frontend/src/pages/RDSMonitorPage.js`
- Tested: Visual verification on preview, API response times confirmed < 0.25s
- [x] **Client/Server Categorization**: Members can be categorized as "Client" or "Server"
  - Backend: `PUT /api/zerotier/{site_id}/member/{member_id}/category` — stores in `zerotier_member_meta` collection
  - Category included in `GET /members` response (default: "client")
  - Frontend: Category badge per member, toggle in expanded detail, filter bar (All/Clients/Servers)
- [x] **IP Address Editing**: Edit IP assignments for any ZeroTier member
  - Backend: `PUT /api/zerotier/{site_id}/member/{member_id}/ip` — calls ZeroTier API
  - Frontend: Clickable IP in expanded detail, opens AlertDialog with warning about device unreachability
- [x] **Dutch → English toast fixes**: 4 remaining Dutch toast messages converted to English
- Files: `backend/routers/zerotier.py`, `frontend/src/pages/ZeroTierPage.js`
- Tested: 17/17 backend tests passed (iteration_85.json), frontend code review 100%
- [x] **Delete ZeroTier Client**: New DELETE endpoint removes a member from the ZeroTier network and cleans up associated alert settings
  - Endpoint: `DELETE /api/zerotier/{main_site_id}/member/{member_id}`
  - Frontend: Delete button in expanded member detail with confirmation AlertDialog
- [x] **Auto-Deauthorize after 30 Days Offline**: Scheduler automatically deauthorizes clients that have been offline for 30+ days
  - Runs as part of the existing 60-second alert check loop
  - Logs auto-deauthorize events to `zerotier_alert_history` with `new_status: "auto_deauthorized"`
  - At-risk clients (offline 20+ days) highlighted in daily summary emails
- [x] **Daily ZeroTier Summary Email**: Comprehensive network status report sent daily at 07:00 UTC
  - Recipients: All team members from team settings + `clara.global@koodh.com`
  - Content: Online/offline member counts, member tables with IPs, at-risk warnings, recent events (last 24h), auto-deauthorize policy notice
  - Manual trigger: `POST /api/zerotier/{main_site_id}/send-daily-summary` + "Send Summary" button in UI
  - Scheduler: `_daily_summary_loop()` calculates wait until next 07:00 UTC
- Files: `backend/routers/zerotier.py`, `backend/services/zerotier_alerts.py`, `frontend/src/pages/ZeroTierPage.js`
- Tested: 14/14 backend tests passed (iteration_84.json), 100% frontend verified

- [x] **Root Cause**: Users with "Redactie Verantwoordelijke" role had Calendar permissions but couldn't edit/delete shows because: (1) `/api/shows` only checked "shows" permissions, not "calendar", (2) `require_admin` at endpoint level blocked all non-admin users regardless of role permissions.
- [x] **Fix**: (a) Added `FEATURE_ALIASES` in middleware so "shows" and "calendar" permissions are interchangeable, (b) Middleware sets `request.state.permission_approved = True` when approved, (c) Legacy auth dependencies (`require_admin`, `require_editor_or_admin`, etc.) check this flag and skip legacy role check, (d) `/api/auth/me/permissions` merges alias permissions for frontend UI.
- Files: `backend/middleware/permission_middleware.py`, `backend/services/auth.py`, `backend/services/permissions.py`
- Tested: iteration_82 (14/14 backend tests passed, 100%)

- [x] **Calendar View for Tasks**: New `TaskCalendarView.js` component with Month and Week views, toggle button in board header, priority color coding, overdue counter, and Done-task exclusion.
- [x] **Task Count Fix**: Board list now shows only non-Done tasks in the count (backend query excludes tasks in columns named "Done").
- [x] **Login Page Image Fix**: Fixed S3 AccessDenied errors by migrating direct S3 URLs to proxy URLs (`/api/branding/file/{key}`). Created migration endpoint and public download proxy.
- [x] **S3 await Bug Fix**: Fixed missing `await` on `upload_file_to_s3()` in `task_boards.py` and `vmix.py`.
- [x] **S3 Presigned URL Proxies**: Updated `server.py` media/image endpoints and branding uploads to use presigned URLs.
- Files: `frontend/src/pages/Tasks/TaskCalendarView.js` (new), `frontend/src/pages/Tasks/TaskBoardsPage.js`, `backend/routers/task_boards.py`, `backend/routers/branding.py`, `backend/routers/vmix.py`, `backend/server.py`
- Tested: iteration_81 (10/10 backend, 12/12 frontend features passed, 100%)

- [x] **Dynamic Email Headers**: All email templates now use a centralized `_build_dynamic_header()` helper that renders either the uploaded brand logo (img tag) or the platform name (h1 tag) based on the branding settings configured in Network Admin.
- [x] **_get_branding_info() helper**: New async function that fetches `brand_name` and `brand_logo_url` from the `platform_settings` MongoDB collection.
- [x] **Invitation Email**: Deliberately has NO "Clara Global Protect" footer — uses only the dynamic brand identity.
- [x] **All Other Emails**: Notification, ticket, password reset, password changed, approval, task status, and daily summary emails all retain the "Clara Global Protect" footer while using dynamic headers.
- [x] **Updated callers**: `routers/notifications.py` and `services/notification_scheduler.py` now fetch and pass branding info to email builders.
- Files: `backend/services/email_service.py`, `backend/routers/notifications.py`, `backend/services/notification_scheduler.py`
- Tested: iteration_80 (29/29 backend tests passed, 100%)

### Upcoming Tasks
- **P1: Calendar Integration** — Google Calendar & Outlook sync for task deadlines
- **P0: Production email alerts** — wacht op feedback
- **P1: Clone login bug op productie** — geblokkeerd
- **P2: RDS Settings page laadt niet** — onbevestigd


### March 9, 2026 - Task Scheduler / Kanban Boards (COMPLETE)
- [x] **New Site Type: Task Scheduler**
  - Added as 4th site type alongside Clara Standard, Clara Technical, Clara Server
  - Violet themed badges, icons, and highlights throughout the platform
  - Core feature: Task Boards (always enabled)
  - Optional features: Team Settings, Firewall, Activity Logs
  - Auto-redirect to /task-boards when entering site
  - Dedicated sidebar with Tasks group + Administration group
  - Backup/restore/clone support via SERVER_COLLECTIONS
  - Badge shown in: Network Dashboard (list + grid), site switcher dropdown, Backup Management

- [x] **Full Kanban Board System**
  - Trello-like Kanban board with drag-and-drop (@dnd-kit)
  - Unlimited boards per site with name, description, color
  - Default columns: To Do, In Progress, Review, Done
  - Column CRUD: Add, rename, delete, reorder
  - Task cards: title, description, priority (low/medium/high/urgent), deadline, assignee, labels, checklist, comments, file attachments
  - Task detail modal with all editable fields
  - S3 file upload for attachments (max 10MB)
  - Comments system with add/delete
  - 18 API endpoints in `/api/task-boards/*`

- Tested: iteration_73 (24/24 backend), iteration_74 (9/9 backend + all frontend flows)


### March 17, 2026 - Media Library: Upload Progress & Audio/Video Compression

- [x] **Upload Progress Overlay**:
  - Full-screen overlay with file name, progress bar, and percentage during uploads
  - data-testid='upload-progress-overlay' for testing
  - Prevents user confusion about "hanging" uploads

- [x] **Axios Timeout (5 minutes)**:
  - Set 300000ms timeout on media upload and editor upload requests
  - Prevents indefinite hanging on network issues

- [x] **Audio/Video Compression (FFmpeg.wasm)**:
  - New `MediaCompressDialog` component (similar to existing ImageResizeDialog)
  - Triggers for audio/video files > 5MB
  - Audio: Compressed to 128kbps MP3, stereo, 44.1kHz
  - Video: Compressed to max 720p, CRF 28, AAC audio
  - "Upload without compressing" skip option available
  - Uses @ffmpeg/ffmpeg v0.12.15 + @ffmpeg/util v0.12.2
  - Files: `frontend/src/utils/mediaCompress.js`, `frontend/src/components/MediaCompressDialog.js`

- [x] **Video File Support**:
  - File input accept attribute extended with .mp4, .mov, .webm
  - Video type filter option in dropdown (alongside Documents, Audio, Images)
  - Purple icon/badge for video assets
  - Video preview in preview dialog
  - Video thumbnail placeholder in asset cards

- [x] **RichTextEditor Upload Improvements**:
  - Added 5-minute timeout on editor file uploads
  - Prevents hanging during large file uploads in content editor

- [x] **Direct S3 URLs** (replaces proxy redirect approach):
  - Frontend `getFileUrl` now uses `s3_url` directly when available
  - Editor upload endpoint returns direct S3 URLs instead of proxy URLs
  - Startup migration reversed: proxy URLs in content bodies converted back to direct S3 URLs
  - S3 files uploaded with ACL='public-read', direct access confirmed working (HTTP 200)

- Tested: iteration_87 (11/11 backend, 100% frontend features verified)

### Bug Fix: Rich Text Editor Media Upload (March 17, 2026)
- [x] **Audio file size limit increased**: Editor upload endpoint now allows 100MB for audio AND video (was 10MB for audio)
- [x] **Error handling improved**: Non-image file uploads now show error notifications instead of failing silently
- [x] **Upload overlay enhanced**: Shows success checkmark after completion, error toast on failure
- [x] **Operator precedence bug fixed**: `is_video` check in backend had incorrect boolean evaluation
- Tested: iteration_88 (14/14 backend, 100% frontend features verified)

### Bug Fix: News Admin Role Permissions & Header Display (March 17, 2026)
- [x] **news_admin role missing from roles collection**: Created `news_admin` in DEFAULT_ROLES with near-full permissions
- [x] **Startup migration**: `migrate_create_missing_roles()` auto-creates role documents for any role slugs used in `main_site_users` but missing from `roles` collection
- [x] **Dynamic role display in header**: DashboardLayout and MainSiteDashboardLayout now use `roleInfo.name` from PermissionsContext instead of hardcoded labels - supports all custom roles
- [x] **Hadewig Weyen (news_admin)**: Can now load shows (416), edit shows, access content - all verified
- Tested: iteration_89 (8/8 backend, 100% API verification)

### Feature: License Manager (March 18, 2026)
- [x] **License Package CRUD**: Create, edit, delete license packages with features, pricing (monthly/yearly), and currency
- [x] **3 Default Packages**: Standard (10 features), Technical (8 features), Server (5 features) - auto-seeded at startup
- [x] **License Assignments**: Assign/remove licenses to/from main sites with Monthly/Yearly/Lifetime billing cycles
- [x] **Lifetime Licenses**: Lifetime option requires no payment, marked with `is_lifetime=true`
- [x] **Feature Sync**: When a license is assigned, the site's `enabled_features` are synced to match the package
- [x] **License Overview**: Dashboard showing all sites with their license status, stats cards
- [x] **No License Banner**: Sites without a license show a warning banner with contact info (info@koodh.com)
- [x] **Payment Preparation**: Data model includes `payment_provider` and `payment_reference` fields for future Mollie/Stripe integration
- [x] **Network Admin Navigation**: License Manager added to Management section in sidebar
- Tested: iteration_90 (13/13 backend, 100% frontend verification)

### Enhancement: License Blocking & Demo Mode (March 18, 2026)
- [x] **No License = Blocked**: Sites without a license show a full-page "No Active License" block with info@koodh.com contact
- [x] **Demo Mode**: Sites marked as `is_demo=true` bypass license requirements and show all content
- [x] **Demo Badge**: "Demo" label in amber shown in the header next to the site type badge
- [x] **Demo Toggle**: Network Admin can toggle demo mode per site from the License Manager overview
- [x] **Backend `is_demo` field**: Added to MainSiteCreate, MainSiteUpdate, MainSiteResponse, MainSiteListResponse models
- Tested: iteration_91 (10/10 backend, 100% frontend verification)

### Enhancement: License Expiry Reminders & Header Warning (March 18, 2026)
- [x] **Expiry badge in header**: Shows "License expires in X days" when < 30 days (blue > amber > red based on urgency)
- [x] **expires_at calculated**: Monthly = +30 days, Yearly = +365 days, Lifetime = null
- [x] **Reminder scheduler**: Daily check for expiring licenses, sends emails every 10 days
- [x] **Email recipients**: Site admins + network admins + clara.license@koodh.com
- [x] **HTML email template**: Branded, shows days remaining, site name, package, billing cycle, "Contact Us to Renew" button
- [x] **days_remaining in API**: `/api/licenses/check/{id}` returns days_remaining for frontend
- Tested: Screenshot verified - expiry badge shows "License expires in 19 days" in header

### Feature: Multi-Environment System (March 18, 2026)
- [x] **Environments**: Create/edit/delete Clara environments (Production auto-seeded as default)
- [x] **System Administrator**: Global admin role (`is_system_admin`), cannot be deleted, access to everything
- [x] **Environment Admins**: Assign network admins per environment
- [x] **Site Copy**: Copy site structure (features, roles) to another environment (data stays empty)
- [x] **Environment Badge**: Non-Production environments show colored badge in site header
- [x] **Grouped Site Selector**: MainSiteSelector groups sites by environment with color-coded headers
- [x] **Backend Migration**: All existing sites linked to Production environment, primary admin set as System Admin
- [x] **Network Dashboard**: "Environments" section added to Management navigation
- Tested: iteration_92 (10/11 backend, 100% frontend verification)


### March 18, 2026 - Bug Fixes (Environment Button & License Expiry Text)
- [x] **Bug Fix: "New Environment" button not visible on production (P0)**:
  - Root cause: `is_system_admin` migration only ran during first-time environment creation; on production the environment already existed so migration was skipped
  - Fix: Moved `is_system_admin` update to run BEFORE environment existence check in `seed_default_environment()`, so it always runs on server startup
  - File: `backend/routers/environments.py` lines 61-67
  - Status: FIXED (requires production deployment to take effect)

- [x] **Bug Fix: License expiry warning as plain red text (P2)**:
  - Changed from `text-[11px] text-red-500 font-medium` to `text-sm text-red-600 font-semibold`
  - Removed `flex items-center gap-1` layout classes for simpler text appearance
  - Updated `data-testid` from "license-expiry-badge" to "license-expiry-warning"
  - File: `frontend/src/components/MainSiteDashboardLayout.js` lines 1114-1121
  - Status: VERIFIED WORKING (iteration_93)

### March 19, 2026 - Environment Switcher + User List Fix + Admin Assignment
- [x] **Feature: Environment Switcher Dropdown in Header**:
  - Added dropdown in Network Management header (data-testid='env-switcher')
  - Shows "All Environments", "Production" (9 sites), "Staging" (2 sites) with color indicators
  - Filters Sites Overview grid by selected environment
  - Files: `frontend/src/pages/Network/NetworkDashboard.js`

- [x] **Bug Fix: Empty user list for Network Admins (P0)**:
  - Root cause: GET /api/users returned 0 users for system admin (no team_id, no site context)
  - Fix: Added check for is_network_admin/is_system_admin to return ALL users without site filter
  - File: `backend/routers/users.py` lines 74-81

- [x] **Feature: Select existing user in Add Network Admin dialog**:
  - Added "Select existing user" dropdown (data-testid='select-existing-user')
  - Auto-fills name and email when user selected
  - Filters out users who are already admins
  - File: `frontend/src/pages/Network/NetworkAdminManager.js`

- [x] **Feature: Environment admin assignment with user list**:
  - Admins dialog on environment cards now shows populated user dropdown
  - Works because of the /api/users fix above
  - File: `frontend/src/pages/Network/EnvironmentManager.js`

- [x] **Backend: Main Sites enriched with environment data**:
  - GET /api/main-sites now returns environment_id, environment_name, environment_color
  - File: `backend/routers/main_sites.py`, `backend/models/main_sites.py`

### March 19, 2026 - Clara CLI Feature
- [x] **Feature: Clara CLI - Server-level admin operations**:
  - Terminal-like UI with monospace font, dark theme, color-coded output
  - Commands: /commands, /help, /roles list|repair|sync|reset, /users list|reset-role, /site info|features, /health, /cache clear, /clear
  - Access control: System/Network admins auto-approved, regular admins must request access
  - Approval flow: POST /api/cli/request-access, GET /api/cli/pending-requests, PUT /api/cli/approve/{id}
  - CLI button visible only for admins in main site dashboard (bottom-right corner)
  - Arrow Up/Down for command history navigation
  - Backend: /app/backend/routers/cli.py (new)
  - Frontend: /app/frontend/src/components/ClaraCLI.js (new)
  - DB collections: cli_access (access requests), cli_logs (command audit trail)

### March 19, 2026 - Clara CLI Expansion (45+ Commands)
- [x] **Expanded CLI from 12 to ~45 commands across 8 categories:**
  - **General**: /commands, /help, /clear
  - **Roles**: /roles list, repair, sync, reset, reset-all, permissions, assign, compare
  - **Users**: /users list, info, add, remove, sessions, search, reset-role
  - **Firewall**: /firewall status, scan, logs, block, unblock, blocked
  - **Site**: /site info, features, features enable/disable, demo on/off, stats
  - **Environment**: /env list, info, admins, assign, sites
  - **License**: /license info, packages, assign, remove
  - **Logs**: /logs recent, cli, errors
  - **System**: /health, /cache clear, /db stats, /backup list|create, /whoami
  - File: backend/routers/cli.py (complete rewrite)
  - Status: VERIFIED (iteration_96 - 100% pass rate, 27/27 backend + all frontend)


### March 19, 2026 - Clara Global Protect (File Security Scanner)
- [x] **Feature: Clara Global Protect — 6-layer file scanning before S3 upload**:
  - Layer 1: Extension validation (42 allowed, 49 blocked)
  - Layer 2: MIME type detection (python-magic)
  - Layer 3: MIME mismatch detection (anti-spoofing, e.g. exe renamed to .jpg)
  - Layer 4: Malware signature scan (PE, ELF, Mach-O, Java, shell scripts)
  - Layer 5: Content pattern scanning (XSS, eval, encoded payloads, EICAR)
  - Layer 6: Double extension attack detection
  - Integrated into ALL upload endpoints: editor-files, media, avatars, sites, branding, chat, task_boards, audio_trigger
  - Blocked files return HTTP 403 with "Blocked by Clara Global Protect: [threat details]"
  - All scans logged to `global_protect_logs` collection
  - CLI commands: /protect status, /protect logs, /protect blocked, /protect rules, /protect threats
  - File size limits: image 15MB, video 150MB, audio 100MB, document 25MB
  - Backend: services/global_protect.py (new), s3_storage.py (modified), server.py, media.py, sites.py, users.py, chat.py, branding.py, task_boards.py, audio_trigger.py, shows.py (all modified)
  - Status: VERIFIED (iteration_97 - 100% pass rate, 16/16 tests)

  - Status: VERIFIED (iteration_95 - 100% pass rate, 15/15 backend + all frontend)


- Status: ALL VERIFIED (iteration_94 - 100% pass rate)



### February 2026 - Top Loader & Setup Wizard
- [x] **Feature: Global Top Loading Bar (TopLoader)**:
  - Thin 3px orange gradient progress bar at very top of page (z-[9999])
  - Replaces old full-page loading spinners throughout the app
  - Integrated via React Context (TopLoaderProvider) wrapping entire App
  - Used in NetworkDashboard (fetchMainSites) and MainSiteDashboardLayout (loading state)
  - Components: TopLoader.js (provider + hook + UI)
  - Status: VERIFIED (iteration_98 - 100% pass rate)

- [x] **Feature: Setup Wizard for Site Creation**:
  - Multi-step popup modal when creating a new site
  - 8 animated steps with icons and progress messages
  - Steps: creating site, workspace setup, datacenter connection, menu creation, preparation, firewall setup, Global Protect setup, completion
  - Green "Get Started" button appears when all steps complete
  - Component: SetupWizard.js, triggered from NetworkDashboard.js
  - Status: VERIFIED (iteration_98 - 100% pass rate)

- [x] **Fix: License Expiry Warning Styling**:
  - Confirmed as plain red text (text-red-600 font-semibold), not a badge
  - data-testid="license-expiry-warning" in MainSiteDashboardLayout.js
  - Status: VERIFIED (iteration_98 - already correct)

### February 2026 - License Request on Site Creation
- [x] **Feature: Automatic License Request on Site Creation**:
  - When any main site is created (standard, technical, server, tasks), a license request is automatically created
  - Request stored in `license_requests` collection with status 'pending'
  - Email notification sent to clara.license@koodh.com via Microsoft 365 SMTP
  - Email includes: site name, type, slug, environment, requester name/email, date
  - New "Requests" tab in License Manager with pending badge counter
  - Network admin can approve or deny requests

### February 2026 - Bug Fix: Shows Not Loading (500 Error)
- [x] **Bug Fix: GET /api/shows/{show_id} returning 500 error**:
  - Root cause: `NameError: name 'background_tasks' is not defined` in `get_show()` function (shows.py line 1027)
  - The function referenced `background_tasks.add_task(_trigger_radioplayer_schedule_push)` but didn't have `BackgroundTasks` as a parameter
  - Fix: Added `background_tasks: BackgroundTasks` parameter to the `get_show` endpoint
  - This broke: calendar → show detail navigation, direct show/rundown access
  - Status: VERIFIED (API returns 200, show detail page loads correctly)

  - Setup Wizard shows step: "A license request has been sent to your license administrator"

### February 2026 - Canva Director (Server Site Feature)
- [x] **Feature: Canva Director integration for Server sites**:
  - Full Canva Connect API integration with OAuth 2.0 flow
  - Configuration page: Client ID, Client Secret, Redirect URI (like ZeroTier)
  - Designs tab: browse, search, create, edit (opens in Canva), export designs
  - Activity log: tracks all design creation and export actions per site
  - OAuth connect/disconnect per user
  - Feature flag: canva_director (server group)
  - Backend: routers/canva.py (config, auth, designs, exports, assets, activity endpoints)
  - Frontend: CanvaDirectorPage.js with 3 tabs (Designs, Activity, Configuration)
  - DB collections: canva_config, canva_tokens, canva_oauth_states, canva_activity

### February 2026 - Custom Roles Permission Fix
- [x] **Bug Fix: Custom roles not working in ShowDetailPage and ContentDetailPage**:
  - Root cause: `isEditor` in AuthContext only checked hardcoded roles (admin/editor/news_admin). Custom roles were ignored.
  - Fix: Added `usePermissions()` context to ShowDetailPage.js and ContentDetailPage.js with fallback to legacy `isEditor`
  - ShowsPage and ContentLibraryPage were already fixed in a previous session
  - Status: VERIFIED (iteration_102 - 100% pass rate)

- [x] **Feature: CLI command `/fix custom roles`**:
  - Finds all custom roles for the site
  - Adds missing feature permission entries (uses editor template)
  - Ensures all permission keys (view/create/edit/delete) exist
  - Status: VERIFIED (iteration_102 - fixed 2 custom roles in test)

  - Available to all users in the site, config restricted to admins
  - Status: VERIFIED (iteration_100 - 100% pass rate, 8/8 backend + all frontend)

  - Backend: services/license_request.py (new), routers/main_sites.py (modified), routers/licenses.py (extended)
  - Frontend: LicenseManager.js (3 tabs: Overview, Requests, Packages), SetupWizard.js (9 steps)
  - DB collection: license_requests {id, main_site_id, site_name, site_type, site_slug, environment_id, environment_name, requester_id, requester_name, requester_email, status, created_at, updated_at, reviewed_by, reviewed_at, notes}
  - Status: VERIFIED (iteration_99 - 100% pass rate, 6/6 backend + all frontend)

### March 2026 - License Manager Resilience Fix
- [x] **Bug Fix: License Manager broke when any single API call failed**:
  - Root cause: `Promise.all` in `fetchData` caused ALL data to fail if any one of the 4 API endpoints returned an error
  - Fix: Replaced with independent try-catch blocks per endpoint; partial data now loads even if one fails
  - File: `frontend/src/pages/Network/LicenseManager.js` (lines 70-107)
  - Status: VERIFIED (iteration_103 - 100% pass rate)

### March 2026 - Login Wizard Persistence Fix
- [x] **Bug Fix: Login wizard reappeared on every page navigation**:
  - Root cause: No guard against re-showing the wizard; event listener and sessionStorage logic allowed multiple triggers
  - Fix: Added `login_wizard_shown` sessionStorage flag that prevents re-showing; cleared on logout
  - Files: `frontend/src/App.js` (LoginWizardWrapper), `frontend/src/context/AuthContext.js` (logout)
  - Status: VERIFIED (iteration_103 - 100% pass rate)

### March 2026 - Domain Management System (Fase 1 + 2 + 3 voorbereiding)
- [x] **Feature: Domain Manager**:
  - Full domain management UI in Network Dashboard (sidebar: "Domain Manager")
  - 4 tabs: Overzicht, Site Domeinen, Subdomain Routing, Cloudflare
  - Per-site domain configuration: koodh.com subdomain (auto-verified, SSL) or custom domain with CNAME verification flow
  - Subdomain routing system: clara.koodh.com (app), login.koodh.com (auth), global.koodh.com (network) — Microsoft-style architecture
  - Routes can be toggled active/inactive, edited, or new custom routes added
  - Cloudflare API integration prepared (placeholder for API Token + Zone ID)
  - DNS verification using dnspython for custom domain CNAME checks
  - Backend: `routers/domains.py` — full CRUD for domain configs, subdomain routes, and Cloudflare config
  - Frontend: `pages/Network/DomainManager.js` — complete UI with dialogs, toggles, status indicators
  - DB collections: `domain_configs`, `subdomain_routes`, `cloudflare_config`
  - Status: VERIFIED (iteration_104 - 100% backend + 100% frontend pass rate)

### March 2026 - Cross-Subdomain Authentication (Exchange Token System)
- [x] **Feature: Microsoft-style cross-subdomain login flow**:
  - Niet-ingelogde gebruikers op clara.koodh.com worden doorgestuurd naar login.koodh.com
  - Na succesvolle login wordt een eenmalig exchange token aangemaakt (30s geldig, single-use)
  - Redirect terug naar clara.koodh.com met exchange token in URL
  - Frontend wisselt het token automatisch in voor een echte JWT en ruimt de URL op
  - Veiligheidsmaatregelen: eenmalig gebruik, 30s verloopdatum, IP tracking, audit logging
  - Backend: 3 nieuwe endpoints in `routers/auth.py`:
    - `POST /api/auth/exchange-token/create` (vereist auth)
    - `POST /api/auth/exchange-token/redeem` (publiek endpoint)
    - `GET /api/auth/subdomain-config` (publiek, retourneert actieve routing)
  - Frontend: `services/subdomainAuth.js` (volledige helper service)
  - Frontend: `AuthContext.js` redeemt exchange tokens bij initialisatie
  - Frontend: `ProtectedRoute` (App.js) detecteert subdomain en redirect naar login.koodh.com
  - Frontend: `LoginPage.js` maakt exchange token en redirect na cross-subdomain login
  - Redirect activeert ALLEEN op *.koodh.com hostnames (preview omgeving onaangetast)
  - DB collection: `exchange_tokens`
  - Status: VERIFIED (iteration_105 - 100% pass rate, security checks verified)

### March 2026 - Auth Security Fix: Anti-Cache + Stale Impersonation Protection
- [x] **Bug Fix: Random user appearing as logged-in user**:
  - Root cause: Geen anti-cache headers op API responses → CDN/proxy kon authenticated responses cachen en aan andere gebruikers serveren. Plus stale impersonation tokens in localStorage na het sluiten van een tab.
  - Fix 1: `NoCacheMiddleware` — `Cache-Control: no-store, no-cache, must-revalidate` + `Vary: Authorization, X-Main-Site-ID` op ALLE `/api` responses
  - Fix 2: Frontend detectie van stale impersonation tokens — JWT met `impersonated_by` claim maar zonder `impersonating` localStorage flag wordt automatisch gewist
  - Fix 3: Backend validatie — `get_current_user` controleert of de impersonerende admin nog bestaat en niet geblokkeerd is
  - Fix 4: Frontend `fetchUser`/`refreshUser` sturen `Cache-Control: no-cache` header mee
  - Files: `middleware/no_cache_middleware.py` (NEW), `server.py`, `services/auth.py`, `AuthContext.js`
  - Status: VERIFIED (iteration_106 - 100% pass rate, security checks verified)

### March 2026 - Permission Scoping Fix: Environment Admins vs System Admins
- [x] **Bug Fix: Environment admin (Chiel) zag alles in Network Dashboard**:
  - Root cause: `is_network_admin: true` werd in de `/me` response automatisch omgezet naar `is_system_admin: true`, waardoor ELKE environment admin volledige systeemtoegang kreeg
  - Fix 1: `/me`, login en exchange token responses berekenen `is_system_admin` nu correct: alleen `true` als `is_system_admin: true` OF `is_primary_network_admin: true`
  - Fix 2: `list_environments` gescopet — environment admins zien alleen hun toegewezen environments, niet alle
  - Fix 3: `get_all_main_sites` gescopet — environment admins zien alleen sites in hun toegewezen environments
  - Fix 4: `get_main_site` controleert environment scope voor niet-system admins
  - Fix 5: Network Dashboard sidebar verbergt admin-only secties (Network Admins, Domains, Licenses, Branding, Debug, External) voor niet-system admins
  - Helper: `get_admin_environment_ids()` in main_sites.py — retourneert `None` voor system admins (alles), of lijst van environment IDs voor environment admins
  - Files: `routers/auth.py`, `routers/main_sites.py`, `routers/environments.py`, `services/auth.py`, `pages/Network/NetworkDashboard.js`
  - Status: VERIFIED (iteration_107 - 100% pass rate, 15 backend tests + frontend verified)

### March 2026 - ZeroTier Offline Alert Timer Fix
- [x] **Bug Fix: ZeroTier client offline notificaties werkten niet**:
  - Root cause: Oude logica miste eerste detectie (als `last_known_status` null was) en stuurde alerts onmiddellijk bij statuswijziging zonder 5-minuten bevestiging
  - Nieuwe flow: (1) Client offline → `offline_since` timestamp opslaan (2) Na 5+ min bevestigd offline → melding versturen (3) Client terug online → recovery melding + timer resetten
  - Nieuwe velden op `zerotier_alerts`: `offline_since` (ISO timestamp), `offline_alert_sent` (boolean)
  - Constante: `OFFLINE_ALERT_DELAY_SECONDS = 300` (5 minuten)
  - File: `services/zerotier_alerts.py` — volledige herschrijving van `_check_alerts` functie
  - Status: VERIFIED (iteration_108 - 100% pass rate, 14 backend tests + code review verified)

### March 2026 - Radioplayer Auto-Sync Scheduler + Custom Icon
- [x] **Feature: Radioplayer auto-sync (zoals RDS monitor)**:
  - `RadioplayerScheduler` class met twee sync loops:
    - Now Playing: elke 60 seconden — controleert of het huidige nummer is veranderd, pusht naar Radioplayer
    - Schedule: elke 30 minuten — pusht de komende 7 dagen showschema
  - Alleen actief als `auto_np` / `auto_schedule` aan staan in de config
  - Frontend: auto-refresh elke 30 seconden + "Auto-sync actief" indicator + handmatige refresh knop
  - Files: `services/radioplayer_scheduler.py` (NEW), `server.py` (start/stop), `pages/RadioplayerPage.js`
- [x] **Feature: Custom Radioplayer icoon**:
  - SVG icon (cirkel + play driehoek + signaal golven), 24x24, stroke-based, erft `currentColor` (wit in sidebar)
  - Gebruikt in sidebar + page header (vervangt generiek Radio icoon)
  - Files: `components/icons/RadioplayerIcon.js` (NEW), `components/MainSiteDashboardLayout.js`, `pages/RadioplayerPage.js`
  - Status: VERIFIED (iteration_109 - 100% pass rate, auto-refresh timestamp change bevestigd)

### March 2026 - Radioplayer API Key + Config Update
- [x] **Feature: Radioplayer API Key (Bearer Token) ondersteuning**:
  - API Key veld toegevoegd aan config (heeft voorrang boven Basic Auth als beide ingesteld)
  - Credentials bijgewerkt: API Key `515907f3-...`, RPUID `0566028`, Station `Radio GRK`
  - Backend: `_build_request_kwargs()` helper voor Bearer/Basic Auth selectie
  - Frontend: API Key veld bovenaan config form + Station Naam veld
  - Gemaskeerd in API responses (`...dc9a0ba0`)
  - Files: `services/radioplayer.py`, `routers/radioplayer.py`, `pages/RadioplayerPage.js`

## Pending/Backlog
- [ ] (P0) "Oops! Page not found" op `/radiogroep/dashboard` — redirect toevoegen
- [ ] (P1) "Something went wrong" bij login intermittent — subdomain auth race condition
- [ ] (P1) Cloudflare API Token + Zone ID functionaliteit in Domain Manager
- [ ] (P1) Calendar Integration for Clara Tasks (Google Calendar / Outlook)
- [ ] (P1) WordPress Plugin Integration finalization
- [ ] (P1) Cleanup old ProRadio sync code
- [ ] (P1) Network admin assignment to multiple environments (USER VERIFICATION PENDING)
- [ ] (P2) Canva Director feature verification on new server sites (USER VERIFICATION PENDING)
- [ ] (P2) Payment Gateway integration (Stripe/Mollie)
- [ ] (P2) Stream Monitor VU Meters
- [ ] (P2) Cloudflare API actief verbinden (na invoeren API Token + Zone ID door gebruiker)

### March 21, 2026 - Login Page Locked Down
- [x] **My Sites menu gegroepeerd per environment** — Production/Staging/etc. headers met kleur-indicator
- [x] **CLI Save Wizard sluit nu automatisch** na voltooiing (was: bleef open staan). Gebruikt useRef voor stabiele onClose callback
- [x] **Network admin privacy fix** — network admins zien nu alleen sites in hun eigen environments, niet alle environments. Alleen system_admin ziet alles
- [x] **ZeroTier send summary** — stuurt nu alleen de summary voor de specifieke ZeroTier config (main_site_id filter), niet alle configs
- [x] **CLI Save Wizard popup** bij write-commands (license assign/remove, site update, etc.)
  - Toont 3-staps animatie: "CLI is saving the changes." → "Uploading to the Clara Datacenter." → "Changes saved successfully."
  - Detecteert automatisch write-commands via prefix matching (30+ prefixes)
  - Auto-close na voltooiing, niet afsluitbaar tijdens executie
  - Files: `frontend/src/components/CLISaveWizard.js` (nieuw), `frontend/src/components/ClaraCLI.js`

- [x] **Login pagina oranje feller** — gradient nu #7a3000/#a54200/#c75200 i.p.v. #2d1200/#3d1a00, matching met button orange-500
- [x] **System Administrator bypass voor license check** — Canva Director en andere features nu zichtbaar op Clara Server
  - Root cause: `isLicenseBlocked` was alleen gebruikt voor sidebar items, maar de content area had een aparte license check
  - Beide checks nu gecentraliseerd via `isLicenseBlocked` variabele met `isSystemAdmin` bypass
  - Files: `frontend/src/components/MainSiteDashboardLayout.js`
  - Vaste subtiele oranje gradient achtergrond met CSS animatie (gradientDrift + glowPulse)
  - Glasmorfisme login kaart gecentreerd
  - Verwijderd: Image panel, carousel, layout opties (left/right/fullscreen), login_images upload
  - Branding instellingen Login Page sectie volledig verwijderd uit BrandingSettings.js
  - Platform naam en logo nog steeds aanpasbaar via branding
  - Files: `frontend/src/pages/LoginPage.js` (herschreven), `frontend/src/pages/Network/BrandingSettings.js` (Login sectie verwijderd)
- [x] **P0 Bug Fix: CLI License Assignment**
  - Root cause: CLI functions used `site_id` while License Manager API used `main_site_id`
  - CLI used `type` instead of `billing_cycle`
  - CLI didn't set `status: "active"` field
  - Fixed `_cmd_license_assign`, `_cmd_license_info`, `_cmd_license_remove`, `_cmd_site_info`
  - Added DB migration on startup to convert legacy `site_id` records to `main_site_id`
  - Made `licenses.py` overview/assignments endpoints defensive for legacy data
  - Fixed price field name mismatch (`price_monthly` vs `monthly_price`)
  - Files: `backend/routers/cli.py`, `backend/routers/licenses.py`, `backend/server.py`
  - Tested: iteration_110 - 14/14 backend tests passed (100%), frontend verified

### March 21, 2026 - Copy Site & Notification Access Fixes
- [x] **Copy Site kopieert nu ALLE configuratie-data** inclusief ZeroTier, Canva, Firewall, RDS, vMix, etc.
  - Toegevoegd aan MAIN_SITE_COLLECTIONS: zerotier_config, zerotier_member_meta, zerotier_alerts, canva_config, audio_triggers, endpoint_settings, firewall_rules, firewall_settings, domain_configs, folder_shares, occurrence_assignments, series_assignments
  - Toegevoegd aan SERVER_COLLECTIONS: xml_api_keys
  - ID mapping is nu dynamisch (alle data uit _collect_backup_data wordt automatisch geremapped)
  - Getest: ZeroTier Monitor copy → 14 docs inclusief 1 zt_config + 3 member_meta + 8 alerts
  - Files: `backend/services/backup_service.py`, `backend/routers/environments.py`

- [x] **Notification Access beperkt tot System Administrator**
  - Backend: Alle notification endpoints gebruiken nu `require_system_admin` i.p.v. `require_network_admin`
  - Frontend: Notifications sidebar item alleen zichtbaar voor `isSystemAdmin`
  - Files: `backend/routers/notifications.py`, `frontend/src/pages/Network/NetworkDashboard.js`
  - Tested: iteration_111 - verified both backend restriction and frontend sidebar

### March 21, 2026 - Bug Fixes (Dashboard 404 & Login Error Handling)
- [x] **Bug Fix: "Oops! Page not found" on /:slug/dashboard (P2)**:
  - Added `dashboard` child route inside `/:mainSiteSlug` that renders `<MainSiteIndex />`
  - Now `/radiogroep/dashboard` correctly redirects to the first enabled feature (e.g. `/radiogroep/shows`)
  - File: `frontend/src/App.js`
  - Tested: Verified via screenshot - redirect works correctly

- [x] **Bug Fix: Intermittent "Something went wrong" at login (P2)**:
  - Improved error handling in LoginPage.js to distinguish between:
    - Network errors → "Connection error. Please try again."
    - String error details → Shows exact server message
    - Array error details (FastAPI validation) → Joins messages
    - HTTP errors without detail → "Login failed (status). Please try again."
  - Prevents generic "Something went wrong" from confusing users
  - File: `frontend/src/pages/LoginPage.js`

- [x] **Canva Director & Radioplayer in Site Creation Modal (carried from previous session)**:
  - Added `canva_director` and `radioplayer` as optional features when creating Clara Server type sites
  - File: `frontend/src/pages/Network/NetworkDashboard.js`
  - Verified via screenshot in previous session


- [x] **S3 Cloud Resources Toggle per Environment (P1)**:
  - Added `s3_enabled` field to environments (default: True)
  - PUT /api/environments/{env_id} with `s3_enabled: false/true` to toggle
  - `check_cloud_resources_enabled(main_site_id)` in s3_storage.py checks site → environment → s3_enabled
  - All S3 upload routers (media, content, shows, chat, sites, task_boards, xml_imports, editor) now pass main_site_id and propagate 403
  - Cache system for fast lookups with invalidation on toggle
  - Frontend: Cloud Resources toggle in EnvironmentManager (System Admin only)
  - Error message: "Cloud Resources are disabled. Please contact Clara Support."
  - Tested: 100% pass rate (iteration_113)

- [x] **Cloudflare DNS Sync Integration (P1)**:
  - Backend: Real Cloudflare API integration via httpx (verify token, list DNS records, sync, create/delete records)
  - `POST /api/domains/cloudflare/sync` — automatisch synchroniseert alle Clara subdomain routes + site domeinen naar Cloudflare DNS
  - `POST /api/domains/cloudflare/verify-token` — test API token + zone access
  - `GET /api/domains/cloudflare/dns-records` — lijst alle DNS records uit Cloudflare zone
  - `POST/DELETE /api/domains/cloudflare/dns-records` — individuele records beheren
  - Frontend: Volledig herontworpen Cloudflare tab met:
    - Verbinding status card (API Token, Zone ID, Base Domain)
    - "Sync with Cloudflare" knop met sync results dialog (aangemaakt/bijgewerkt/ongewijzigd/fouten)
    - DNS Records overzicht met record types, proxied status, en delete optie

- [x] **Domain Manager Complete Rewrite — English UI + Step Wizards (P1)**:
  - All text translated from Dutch to English across all tabs
  - Cloudflare setup: 4-step wizard (API Token → Zone ID → Verify Connection → Sync DNS)
  - Each step has direct "Open Cloudflare" links to relevant Cloudflare dashboard pages
  - Domain setup: Step wizard for koodh.com subdomains (3 steps) and custom domains (4 steps with DNS instructions + Cloudflare link)
  - StepIndicator component: orange ring for current step, green checkmark for completed
  - Removed unprofessional descriptions from routing tab
  - Subtitle in NetworkDashboard.js also updated to English
  - Tested: 100% pass rate (iteration_115) — all 14 UI checks passed, no Dutch text remaining

- [x] **Radioplayer verplaatst van streaming naar server groep**:
  - Radioplayer verschijnt niet meer op standaard sites, alleen op server site types
  - Extra check: server NAV_GROUP wordt gefilterd op `mainSite.site_type === 'server'`
  - Server iconen bijgewerkt: XML Imports → FileCode, API Keys → KeyRound, vMix → Video
  - File: `frontend/src/components/MainSiteDashboardLayout.js`
  - Tested: Verified via screenshots — standard site = no Radioplayer, server site = Radioplayer visible

- [x] **Main Site Creation Wizard + New Package System (P1)**:
  - Step-based creation wizard: Name (auto-slug) → Package → Confirm
  - 5 packages: Clara Radio, Clara Tasks, Clara Virtual Datacenter, Clara Data Connection, Clara External Host
  - Each package has pre-configured features that are locked during creation
  - Auto-slug generation based on site name with uniqueness check
  - New site type labels: Radio (was Standard), Tasks, Virtual Datacenter (was Server), Data Connection (was Technical), External Host (NEW)
  - Updated badges/colors in site list (card + list view), header, and My Sites dropdown
  - CLI `/disconnect configuration` command opens feature toggle dialog
  - PUT `/api/cli/features-config/{main_site_id}` to save feature configuration
  - ALL_AVAILABLE_FEATURES defined per site type in backend
  - Files: NetworkDashboard.js, MainSiteDashboardLayout.js, ClaraCLI.js, cli.py
  - Tested: 100% pass rate (iteration_116) — 3 bugs found and fixed by testing agent



    - "Verbinding testen" knop voor token verificatie
  - Files: `backend/routers/domains.py`, `frontend/src/pages/Network/DomainManager.js`
  - Tested: 100% pass rate (iteration_114)
  - Note: Needs real Cloudflare API Token + Zone ID from user to actually push DNS updates




### 2026-03-21: Grid/List View Color Consistency Fix
- Fixed List View card backgrounds, icons, and badges for all 5 site packages to match Grid View styling
- Changes: `server` type changed from red to blue (matching "Virtual Datacenter"), added missing `external_host` (cyan) and `task_scheduler` (violet) styling to List View card backgrounds and icon containers
- Added missing `external_host` badge to List View
- File: `NetworkDashboard.js` (lines 1078-1106)
- Verified via screenshot: Both List and Grid views now show consistent package colors

### Pending Tasks
- (P1) Calendar Integration (Google Calendar / Outlook) for Clara Tasks
- (P1) WordPress Plugin Integration (`clara-radio-schedule`)
- (P2) Payment Gateway (Stripe/Mollie) for License Manager
- (P2) Stream Monitor VU Meters
- (P2) Cleanup Obsolete ProRadio Sync Code

### 2026-03-21: Badge Labels & Network Admin Dropdown Fix
- Updated ALL badge labels across the entire app from old names to new package names:
  - "Server" → "Virtual Datacenter" (blue), "Technical" → "Data Connection" (emerald)
  - Added missing "External Host" (cyan) badges everywhere
- Fixed files: BackupManagementPage.js, DomainManager.js, MainSiteDashboardLayout.js, CanvaDirectorPage.js
- Fixed `/api/main-sites/my/access` endpoint: non-system network admins now see ALL sites (not just explicitly assigned ones)
- Tested: iteration_117 - 100% pass rate (backend + frontend)


### 2026-03-21: CLI Site Convert Command
- Added `/site convert <package>` CLI command to switch a main site between package types
- Supported packages: radio, tasks, virtual-datacenter, data-connection, external-host (with aliases)
- Converts site_type and updates enabled_features to new package defaults
- Handles: usage help, same-type warning, invalid package error
- File: `backend/routers/cli.py` (COMMANDS registry + execute_command handler + _cmd_site_convert function)
- Tested: API curl tests (all 5 scenarios pass) + visual CLI verification via screenshot

### 2026-03-21: ZeroTier Network Guard for Network Admins
- Implemented ZeroTier-based login protection: network admins must be connected to a configured ZeroTier network to log in
- Backend: `services/zt_guard.py` verifies client IP against online ZeroTier members (physical address + IP assignments)
- Login integration: `auth.py` checks ZT Guard for network admins (system admins exempt)
- Strict mode: login blocked if ZeroTier API is unreachable
- API endpoints: GET/PUT `/api/auth/zt-guard/config`, POST `/api/auth/zt-guard/test`
- CLI commands: `/zt-guard status|enable|disable|set|test`
- Frontend: ZT Guard config panel in Network Dashboard → Account Security (system admin only)
- Tested: iteration_118 - 100% pass rate (12/12 tests)


- (P2) Refactoring: Split `MainSiteDashboardLayout.js` and `NetworkDashboard.js` into smaller components
