# Radio Show Planning & Management Platform — PRD

## Original Problem Statement
Multi-environment SaaS platform for radio station management built with React frontend, FastAPI backend, and MongoDB. Integrates with Cloudflare, WordPress, Radioplayer, ZeroTier, and OpenAI GPT-5.2.

## Core Requirements
- Network-level management dashboard for multi-site radio operations
- Environment management (Production, Staging, Dev)
- Domain management with Cloudflare integration
- License management for sites and packages
- WordPress content publishing and security
- Clara AI Assistant for error troubleshooting and SEO
- PWA installation support
- RDS metadata monitoring with auto-refresh
- Two-Factor Authentication (2FA) enforcement
- License enforcement with grayed-out menus
- **Full Support Ticket System** with messenger-style chat, status tracking, email notifications, screen recording, and user impersonation

## Architecture
```
/app
├── backend/ (FastAPI)
│   ├── routers/
│   │   ├── support_tickets.py    # NEW: Full CRUD support ticket system
│   │   ├── auth.py, main_sites.py, wordpress.py, etc.
│   ├── services/
│   └── .env
├── frontend/ (React)
│   ├── src/components/
│   │   ├── UserTicketsPanel.js    # NEW: User-side ticket slide panel
│   │   ├── TicketUpdatePopup.js   # NEW: Login popup for ticket updates
│   │   ├── LicenseBlockedOverlay.js
│   │   ├── ClaraAssistant.js      # Modified: All English, < logo icon
│   │   ├── MainSiteDashboardLayout.js  # Modified: ticket icon, search popup
│   │   └── NetworkHeader.js       # Modified: Support badge in More dropdown
│   ├── src/pages/Network/
│   │   └── SupportTicketsPage.js  # NEW: Admin messenger-style support page
│   └── .env
└── memory/
```

## Support Ticket System
### Statuses
- **Open** — counts towards badge counter
- **Searching for a solution** — does NOT count
- **Solution found** — does NOT count
- **Closed** — does NOT count

### Features
- **Messenger-style chat**: Text bubbles with timestamps, sender roles (user/admin)
- **Attachments**: Image upload, screen recording (navigator.mediaDevices.getDisplayMedia)
- **Emoji support**: @emoji-mart/react integration
- **Status management**: Admin-only dropdown to change ticket status
- **User impersonation**: "Login as user" button for admins to verify issues
- **Email notifications**: On ticket creation, status change, and new messages
- **User-side**: Ticket icon next to Clara logo with counter badge, slide-over panel
- **Login popup**: Notification popup when user has unread ticket updates

### API Endpoints
- `POST /api/support-tickets` — Create ticket
- `GET /api/support-tickets` — List tickets (admin=all, user=own)
- `GET /api/support-tickets/counts` — Badge counter
- `GET /api/support-tickets/user-updates` — Unread updates for popup
- `GET /api/support-tickets/{id}` — Full ticket with messages
- `PUT /api/support-tickets/{id}/status` — Change status (admin only)
- `POST /api/support-tickets/{id}/messages` — Add message
- `POST /api/support-tickets/{id}/messages/attachment` — Upload image
- `POST /api/support-tickets/{id}/recording` — Upload screen recording

## UI Changes (Current Session)
- **Topbar**: Transparent background, no glassmorphism/blur/border
- **Pill nav**: No container border/shadow
- **Search bar**: Icon-only button that opens centered popup overlay (no inline expand)
- **Date**: English format (Wednesday, April 8, 2026)
- **Clara Assistant**: Full English UI, `<` logo icon
- **Quick-action bars**: Consistent pattern across Content Library, Shows, Rundown

## Credentials
- System Admin: admkoodh@koodh.com / KYLovie13monx
- Network Admin: yannick.gijbels@koodh.com / test

## Backlog
### P1
- Finalize Calendar Integration (Google Calendar / Outlook) for Clara Tasks
- Finalize WordPress Plugin Integration (clara-radio-schedule)

### P2
- Integrate Payment Gateway (Stripe/Mollie) for License Manager
- Implement Stream Monitor VU Meters
- Cleanup Obsolete ProRadio Sync Code
- Fix React Hook dependency warnings
- Refactoring: Split MainSiteDashboardLayout.js and NetworkDashboard.js
