# Radio Show Planning & Rundown Dashboard - PRD

## Original Problem Statement
Build a web-based dashboard that allows radio editors to plan radio shows and prepare detailed rundowns. The focus of this MVP is show preparation, not live broadcasting. Features include:
- MVP 1: Show planning and rundown management
- MVP 2: Team and user management with roles
- MVP 3: Content Library and Multi-site WordPress Publishing

## Architecture
- **Frontend**: React 19 with TailwindCSS, Shadcn/UI components
- **Backend**: FastAPI (Python) with async MongoDB (Motor)
- **Database**: MongoDB
- **Authentication**: JWT-based email/password login with role-based access
- **Drag & Drop**: @dnd-kit/core and @dnd-kit/sortable
- **WordPress Integration**: httpx for REST API calls

## User Personas
### Admin
- Can manage team settings and users
- Full access to create, edit, delete shows
- Can invite new users and assign roles
- Can connect multiple WordPress sites for publishing

### Editor
- Can create and edit shows and rundowns
- Can create and manage content library items
- Can publish content to connected WordPress sites
- Cannot manage team, users, or WordPress connections

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
2. User Roles: Admin, Editor, Viewer with different permissions
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
- [x] Navigation links for Content Library and WordPress

### January 9, 2026 - MVP 3.1 Extension
- [x] Featured Image model (ContentItemFeaturedImage) - per content+site
- [x] Featured image upload API (POST /api/content/{id}/featured-images/{site_id})
- [x] Featured image delete API (DELETE /api/content/{id}/featured-images/{site_id})
- [x] Featured image file serving (GET /api/uploads/featured_images/{file_key})
- [x] Featured image included in content detail API response
- [x] Publish dialog shows per-site featured image upload area
- [x] WordPress media upload during publish (sets featured_media)
- [x] File validation: JPEG, PNG, GIF, WebP only, max 5MB

## Database Collections
### users
- id, email, password_hash, name, role, team_id, created_at, temp_password

### teams
- id, name, created_at

### shows
- id, title, description, date, start_time, end_time, status, editor_id, team_id, created_at, updated_at

### rundown_items
- id, show_id, type, title, notes, duration, order, created_at, content_ids (optional)

### content_items
- id, team_id, title, type, body, excerpt, external_url, tags, status, created_by, created_at, updated_at

### wordpress_sites
- id, team_id, name, wp_base_url, username, app_password, default_post_type, default_publish_status, is_active, created_at, updated_at

### content_item_publishes
- id, content_item_id, wordpress_site_id, wp_post_id, wp_post_type, wp_status, wp_permalink, sync_status, sync_error_message, last_synced_at, created_at, updated_at

## API Endpoints
### Authentication
- POST /api/auth/register - Register new user (creates team)
- POST /api/auth/login - Login user
- GET /api/auth/me - Get current user with role and team

### Teams (Admin only)
- GET /api/teams/current - Get current team
- PUT /api/teams/current - Update team name

### Users (Admin only)
- GET /api/users - List team members
- POST /api/users/invite - Invite new user
- GET /api/users/invite/{id}/password - Get temp password
- PUT /api/users/{id}/role - Update user role
- DELETE /api/users/{id} - Remove user

### Shows
- GET /api/shows - List team shows
- POST /api/shows - Create show (editor+)
- GET /api/shows/{id} - Get show
- PUT /api/shows/{id} - Update show (editor+)
- DELETE /api/shows/{id} - Delete show (editor+)

### Rundown
- GET /api/shows/{id}/rundown - Get items
- POST /api/shows/{id}/rundown - Add item (editor+)
- PUT /api/shows/{id}/rundown/reorder - Reorder (editor+)
- PUT /api/shows/{id}/rundown/{item_id} - Update (editor+)
- DELETE /api/shows/{id}/rundown/{item_id} - Delete (editor+)

### Content Library
- GET /api/content - List content items (with filters)
- POST /api/content - Create content item (editor+)
- GET /api/content/{id} - Get content with publish statuses
- PUT /api/content/{id} - Update content (editor+)
- DELETE /api/content/{id} - Delete content (editor+)
- POST /api/content/{id}/publish - Publish to WordPress sites (editor+)

### WordPress Sites (Admin only)
- GET /api/wordpress/sites - List connected sites
- POST /api/wordpress/sites - Add new site
- GET /api/wordpress/sites/{id} - Get site details
- PUT /api/wordpress/sites/{id} - Update site
- DELETE /api/wordpress/sites/{id} - Delete site
- POST /api/wordpress/sites/{id}/test - Test connection

### RDS (Public)
- GET /api/rds/live - Current live show title (plain text)

## Prioritized Backlog
### P0 (Complete)
- [x] Core show and rundown management (MVP 1)
- [x] Team and user management with roles (MVP 2)
- [x] Content Library and WordPress Publishing (MVP 3)

### P1 (Near-term)
- [ ] Show cloning/templating
- [ ] Attach content items to rundown items
- [ ] Print-friendly rundown export (PDF)
- [ ] Email invitations (currently shows temp password)
- [ ] Password change after first login prompt

### P2 (Future)
- [ ] Multiple teams per user
- [ ] Show history/versioning
- [ ] Segment templates library
- [ ] Advanced permissions
- [ ] Audit logs
- [ ] Customizable WPM setting for speaking time

## Test Credentials
- Email: demo@radio.com
- Password: password123

## Notes
- WordPress integration is one-way sync (dashboard → WordPress)
- No two-way sync or WordPress media management
- WordPress requires Application Password authentication
