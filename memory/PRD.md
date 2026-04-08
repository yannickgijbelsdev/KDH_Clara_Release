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
- **Clara Enterprise Assistant** with Code Assistant (Claude) and Enterprise Support modes
- **S3 Object Storage** for support ticket attachments (migrated from base64)

## Architecture
```
/app
├── backend/ (FastAPI)
│   ├── routers/
│   │   ├── support_tickets.py    # Support tickets with S3 file storage
│   │   ├── enterprise_assistant.py # Claude-powered code generation & support
│   │   ├── auth.py, main_sites.py, wordpress.py, etc.
│   ├── services/
│   │   ├── object_storage.py     # Emergent S3-compatible storage
│   │   └── rds_builder_scheduler.py # Auto-refresh background loop
│   └── .env
├── frontend/ (React)
│   ├── src/components/
│   │   ├── UserTicketsPanel.js    # User-side ticket slide panel (S3 URLs)
│   │   ├── MainSiteDashboardLayout.js # Dynamic nav with ResizeObserver
│   │   └── ClaraAssistant.js
│   ├── src/pages/
│   │   ├── EnterpriseAssistantPage.js # Enterprise code/support with 3D cards
│   │   └── Network/SupportTicketsPage.js # Admin support page (S3 URLs)
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
- Messenger-style chat with text bubbles and timestamps
- **S3 file attachments** (images, screen recordings) via Emergent Object Storage
- Emoji support (@emoji-mart/react)
- Status management (admin-only dropdown)
- User impersonation for admins
- Email notifications (async background tasks)
- Login popup for unread ticket updates

### API Endpoints
- `POST /api/support-tickets` — Create ticket
- `GET /api/support-tickets` — List tickets
- `GET /api/support-tickets/counts` — Badge counter
- `GET /api/support-tickets/user-updates` — Unread updates
- `GET /api/support-tickets/{id}` — Full ticket with messages
- `PUT /api/support-tickets/{id}/status` — Change status (admin)
- `POST /api/support-tickets/{id}/messages` — Add message
- `POST /api/support-tickets/{id}/messages/attachment` — Upload image to S3
- `POST /api/support-tickets/{id}/recording` — Upload recording to S3
- `GET /api/support-tickets/files/{path}?auth=TOKEN` — Proxy S3 files

## Enterprise Assistant
- `POST /api/enterprise-assistant/chat` — Claude chat (code/support)
- `GET /api/enterprise-assistant/sessions` — Chat history
- Requires `clara_enterprise` site flag

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
