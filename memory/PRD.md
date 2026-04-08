# Radio Show Planning & Management Platform — PRD

## Original Problem Statement
Multi-environment SaaS platform for radio station management built with React frontend, FastAPI backend, and MongoDB. Integrates with Cloudflare, WordPress, Radioplayer, ZeroTier, and OpenAI.

## Core Features
- Network-level management dashboard for multi-site radio operations
- WordPress content publishing and security
- Clara AI Assistant, Clara Enterprise Code Assistant (Claude), Enterprise Support
- **Clara Voice Support** — Real-time AI voice calls using OpenAI Realtime API (WebRTC)
- Support Ticket System with S3 file attachments
- PWA installation support
- RDS metadata monitoring with auto-refresh
- Two-Factor Authentication (2FA) enforcement

## Architecture
```
/app
├── backend/ (FastAPI)
│   ├── routers/
│   │   ├── voice_support.py         # NEW: AI voice calls via OpenAI Realtime WebRTC
│   │   ├── enterprise_assistant.py  # Claude-powered code generation & support
│   │   ├── support_tickets.py       # Tickets with S3 file storage
│   │   ├── clara_assistant.py       # Clara AI assistant
│   │   └── main_sites.py, wordpress.py, auth.py, etc.
│   └── services/
│       ├── object_storage.py        # Emergent S3-compatible storage
│       └── rds_builder_scheduler.py # Auto-refresh background loop
├── frontend/ (React)
│   └── src/
│       ├── components/
│       │   ├── VoiceCallWidget.js        # NEW: Voice call UI (ringing/active/ended)
│       │   ├── MainSiteDashboardLayout.js # Dynamic nav, voice call integration
│       │   ├── UserTicketsPanel.js        # User-side ticket panel (S3 URLs)
│       │   ├── ClaraAssistant.js          # "Call Clara Support" button
│       │   └── ClaraCLI.js
│       ├── pages/
│       │   ├── EnterpriseAssistantPage.js # 3D isometric room cards
│       │   └── Network/SupportTicketsPage.js
│       └── context/
│           └── ClaraAssistantContext.js   # voiceCallRequested state
└── memory/
```

## Voice Support Feature
### Flow
1. User clicks green phone icon in header (Enterprise only) or "Call Clara Support" in Clara Assistant
2. Incoming call overlay appears with pulsing animation
3. User accepts → WebRTC connection established via backend negotiate endpoint
4. AI greets user and asks for preferred language
5. Real-time voice conversation with live transcript
6. User can mute/unmute, minimize widget, or hang up
7. Transcript saved to MongoDB on hang up

### API Endpoints
- `POST /api/voice-support/start-session?main_site_id=X` — Create session (Enterprise only)
- `POST /api/voice-support/realtime/session` — Get OpenAI ephemeral session
- `POST /api/voice-support/realtime/negotiate` — WebRTC SDP negotiation
- `POST /api/voice-support/save-transcript` — Save transcript after call
- `GET /api/voice-support/sessions?main_site_id=X` — Session history
- `GET /api/voice-support/session/{id}` — Full transcript

### DB Schema
- `voice_support_sessions`: session_id, main_site_id, user_id, user_name, status, messages[], language, duration_seconds, started_at, ended_at

## Support Ticket S3 Storage
- Attachments uploaded via `object_storage.py` to Emergent S3
- Proxy endpoint: `GET /api/support-tickets/files/{path}?auth=TOKEN`
- Frontend helper `getAttachmentUrl()` supports both S3 URLs and legacy base64

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
- Refactoring: Split MainSiteDashboardLayout.js
