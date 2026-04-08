# Radio Show Planning & Management Platform — PRD

## Original Problem Statement
Multi-environment SaaS platform for radio station management built with React frontend, FastAPI backend, and MongoDB. Integrates with Cloudflare, WordPress, Radioplayer, ZeroTier, and OpenAI.

## Core Features
- Network-level management dashboard for multi-site radio operations
- WordPress content publishing and security
- Clara AI Assistant, Clara Enterprise Code Assistant (Claude), Enterprise Support
- **Clara Voice Support** — Real-time AI voice calls using ElevenLabs Conversational AI
- Support Ticket System with S3 file attachments
- PWA installation support
- RDS metadata monitoring with auto-refresh

## Architecture
```
/app
├── backend/ (FastAPI)
│   ├── routers/
│   │   ├── voice_support.py         # ElevenLabs signed URL + transcript CRUD
│   │   ├── enterprise_assistant.py  # Claude-powered code generation & support
│   │   ├── support_tickets.py       # Tickets with S3 file storage
│   │   └── clara_assistant.py, auth.py, main_sites.py, etc.
│   └── services/
│       ├── object_storage.py        # Emergent S3-compatible storage
│       └── rds_builder_scheduler.py
├── frontend/ (React)
│   └── src/
│       ├── components/
│       │   ├── VoiceCallWidget.js        # ElevenLabs voice call UI
│       │   ├── MainSiteDashboardLayout.js # Dynamic nav, ConversationProvider
│       │   ├── ClaraAssistant.js          # "Call Clara Support" button
│       │   └── UserTicketsPanel.js
│       ├── pages/
│       │   ├── EnterpriseAssistantPage.js # 3D isometric room cards
│       │   └── Network/SupportTicketsPage.js
│       └── context/
│           └── ClaraAssistantContext.js   # voiceCallRequested bridge
└── memory/
```

## Voice Support (ElevenLabs)
### Flow
1. User clicks green phone icon in header (Enterprise only) or "Call Clara Support" in Clara Assistant
2. Incoming call overlay appears with pulsing animation
3. User accepts → ElevenLabs WebRTC session starts via signed URL
4. AI (Sarah voice) greets user and asks for preferred language
5. Real-time voice conversation
6. User can mute/unmute, minimize widget, or hang up
7. Transcript saved to MongoDB on hang up

### API Endpoints
- `GET /api/voice-support/signed-url?main_site_id=X` — Get ElevenLabs signed WebSocket URL
- `POST /api/voice-support/save-transcript` — Save transcript after call
- `GET /api/voice-support/sessions?main_site_id=X` — Session history
- `GET /api/voice-support/session/{id}` — Full transcript

### Configuration
- ElevenLabs Agent ID: agent_8101knpxmcfjfsrbfee7taaq3jjx
- Voice: Sarah (EXAVITQu4vr4xnSDxMaL)
- Frontend SDK: @elevenlabs/react with ConversationProvider

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
