# Radio Show Planning & Rundown Dashboard - PRD

## Original Problem Statement
Build a web-based dashboard that allows radio editors to plan radio shows and prepare detailed rundowns. The focus of this MVP is show preparation, not live broadcasting, CMS publishing, or external integrations.

## Architecture
- **Frontend**: React 19 with TailwindCSS, Shadcn/UI components
- **Backend**: FastAPI (Python) with async MongoDB (Motor)
- **Database**: MongoDB
- **Authentication**: JWT-based email/password login
- **Drag & Drop**: @dnd-kit/core and @dnd-kit/sortable

## User Personas
### Editor (Primary User)
- Radio professionals who plan and prepare shows
- Need to create shows with schedules
- Build detailed rundowns with music, talk segments, ads

## Core Requirements (Static)
1. **Authentication**: Email/password login with JWT tokens
2. **Show Management**: Create, edit, delete shows with title, description, date, times, status
3. **Rundown Management**: Add/edit/delete rundown items with drag-drop reordering
4. **Status Filtering**: Filter shows by draft/scheduled/completed
5. **Clean Dashboard UI**: Professional dark theme with sidebar navigation

## What's Been Implemented
### January 6, 2026
- [x] JWT authentication (register/login/logout)
- [x] Shows CRUD with status filtering
- [x] Rundown items CRUD with drag & drop reorder
- [x] Dark theme with Chivo/Manrope/JetBrains Mono fonts
- [x] Glassmorphism sidebar navigation
- [x] Type-colored rundown items (music=green, talk=purple, item=orange, ad=red)
- [x] Duration tracking with total calculation
- [x] Calendar date picker for shows
- [x] Edit/Delete show functionality
- [x] Responsive design

## API Endpoints
- POST /api/auth/register - Register new user
- POST /api/auth/login - Login user
- GET /api/auth/me - Get current user
- GET /api/shows - List shows (optional status filter)
- POST /api/shows - Create show
- GET /api/shows/{id} - Get show details
- PUT /api/shows/{id} - Update show
- DELETE /api/shows/{id} - Delete show
- GET /api/shows/{id}/rundown - Get rundown items
- POST /api/shows/{id}/rundown - Add rundown item
- PUT /api/shows/{id}/rundown/reorder - Reorder items
- PUT /api/shows/{id}/rundown/{item_id} - Update item
- DELETE /api/shows/{id}/rundown/{item_id} - Delete item

## Prioritized Backlog
### P0 (MVP Complete)
- [x] All core features implemented and tested

### P1 (Near-term)
- [ ] Show cloning/templating
- [ ] Print-friendly rundown export
- [ ] Show search functionality
- [ ] Cumulative timing (show where you are in the show)

### P2 (Future)
- [ ] Multiple editors collaboration
- [ ] Show history/versioning
- [ ] Segment templates library
- [ ] Integration with music libraries

## Next Tasks
1. Add print/export rundown to PDF
2. Implement show templates for quick creation
3. Add cumulative timing in rundown view
4. Consider adding show cloning feature
