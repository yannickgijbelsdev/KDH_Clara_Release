# Radio Show Planning & Rundown Dashboard - PRD

## Original Problem Statement
Build a web-based dashboard that allows radio editors to plan radio shows and prepare detailed rundowns. The focus of this MVP is show preparation, not live broadcasting, CMS publishing, or external integrations.

## Architecture
- **Frontend**: React 19 with TailwindCSS, Shadcn/UI components
- **Backend**: FastAPI (Python) with async MongoDB (Motor)
- **Database**: MongoDB
- **Authentication**: JWT-based email/password login with role-based access
- **Drag & Drop**: @dnd-kit/core and @dnd-kit/sortable

## User Personas
### Admin
- Can manage team settings and users
- Full access to create, edit, delete shows
- Can invite new users and assign roles

### Editor
- Can create and edit shows and rundowns
- Cannot manage team or users

### Viewer
- Read-only access to shows and rundowns
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

### RDS (Public)
- GET /api/rds/live - Current live show title (plain text)

## Prioritized Backlog
### P0 (MVP 1 & 2 Complete)
- [x] Core show and rundown management
- [x] Team and user management with roles

### P1 (Near-term)
- [ ] Show cloning/templating
- [ ] Print-friendly rundown export (PDF)
- [ ] Email invitations (currently shows temp password)
- [ ] Password change after first login prompt

### P2 (Future)
- [ ] Multiple teams per user
- [ ] Show history/versioning
- [ ] Segment templates library
- [ ] Advanced permissions
- [ ] Audit logs

## Next Tasks
1. Add email-based invitation flow
2. Implement password change prompt for new users
3. Add show templates for quick creation
4. Consider adding show cloning feature
