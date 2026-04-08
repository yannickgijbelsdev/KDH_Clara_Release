# Radio Show Planning & Management Platform — PRD

## Original Problem Statement
Multi-environment SaaS platform for radio station management built with React frontend, FastAPI backend, and MongoDB.

## Core Features
- Network-level management dashboard with **rack carousel** (3 visible, scrollable)
- **Clara Voice Support** — Real-time AI voice calls using ElevenLabs Conversational AI
- Clara Enterprise Code Assistant (Claude) with 3D isometric room cards
- Support Ticket System with S3 file attachments
- WordPress content publishing and security
- PWA installation support, RDS metadata auto-refresh

## Architecture
```
/app
├── backend/routers/
│   ├── voice_support.py         # ElevenLabs signed URL + transcript CRUD
│   ├── enterprise_assistant.py  # Claude code generation
│   ├── support_tickets.py       # S3 file storage
│   └── ...
├── frontend/src/
│   ├── components/
│   │   ├── VoiceCallWidget.js        # @11labs/client direct WebRTC
│   │   ├── workspace/ServerRackView.js # Rack carousel (3 visible)
│   │   └── MainSiteDashboardLayout.js
│   └── pages/
│       ├── EnterpriseAssistantPage.js
│       └── Network/NetworkDashboard.js
└── memory/
```

## Voice Support (ElevenLabs)
- Agent: agent_8101knpxmcfjfsrbfee7taaq3jjx (Sarah voice)
- SDK: @11labs/client (Conversation.startSession)
- Rendered via React Portal on document.body (z-10000)
- Enterprise-only feature

## Credentials
- System Admin: admkoodh@koodh.com / KYLovie13monx
- Network Admin: yannick.gijbels@koodh.com / test

## Recent Fixes
- **Rundown delete bug** (Apr 2026): Fixed `delete_rundown_item` endpoint — added multisite context (`X-Main-Site-ID`) and changed from admin-only to editor/admin/member permissions (consistent with create/update)
- **Clara Assistant error handling** (Apr 2026): Improved error messages when LLM key hits rate limit — now shows actionable message directing users to create support tickets directly
- **Clara Voice Support client tools** (Apr 2026): 
  - Added 3 ElevenLabs client tools: `hang_up`, `highlight_element`, `navigate_to_page`
  - Created `ClaraGuideOverlay.js` — spotlight/glow overlay system that highlights UI elements
  - Created `ClaraNavigationListener` — handles page navigation triggered by voice commands
  - Updated agent prompt: Clara now actively uses tools to show/highlight/navigate instead of just describing
  - Endpoint `POST /api/voice-support/setup-agent-tools` for tool creation
  - Endpoint `POST /api/voice-support/update-agent-prompt` for prompt updates

## Backlog
### P0
- Dynamic Step-by-Step RDS Builder Wizard (4 steps: Station Source → Metadata Fields → Shows/Playlist → Preview & Activate)
### P1
- Calendar Integration (Google Calendar / Outlook) for Clara Tasks
- WordPress Plugin Integration (clara-radio-schedule)
### P2
- Payment Gateway (Stripe/Mollie), Stream Monitor VU Meters
- React Hook warnings, MainSiteDashboardLayout refactoring
