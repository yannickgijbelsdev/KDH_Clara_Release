# Radio Show Planning & Rundown Dashboard - PRD

## Original Problem Statement
Build a web-based dashboard that allows radio editors to plan radio shows and prepare detailed rundowns. The focus of this MVP is show preparation, not live broadcasting.

## Architecture
- **Frontend**: React 19 with TailwindCSS, Shadcn/UI components, Framer Motion
- **Backend**: FastAPI (Python) with async MongoDB (Motor)
- **Database**: MongoDB
- **Authentication**: JWT-based email/password login with role-based access
- **UI Theme**: Light/frosted-glass canvas with horizontal pill-tab navigation
- **AI**: GPT-5.2 via Emergent Universal Key (emergentintegrations library)

## What's Been Implemented

### April 7, 2026 - Clara AI Assistant
- [x] **Backend**: 4 new endpoints in `/api/clara-assistant/`:
  - `POST /chat` - Conversational AI with SEO and error help modes, session persistence
  - `POST /seo/generate` - Generate full SEO-optimized articles from topic/keywords
  - `POST /seo/improve` - Analyze and improve existing content for SEO
  - `POST /error-help` - Context-aware error troubleshooting
- [x] **Frontend**: Floating panel component (`ClaraAssistant.js`) with:
  - Sparkles button bottom-right, slide-in panel
  - Two modes: SEO Schrijfhulp + Foutmelding Hulp
  - Quick actions: Article generation form (topic, keywords, length) and content improvement
  - Chat interface with message history, copy and "insert into editor" buttons
  - Auto-language detection
- [x] **Context**: `ClaraAssistantContext.js` bridges editor content with Clara panel
- [x] **Integration**: ContentDetailPage registers editor content for Clara to read/write
- [x] **LLM**: GPT-5.2 via Emergent Universal Key, chat history in MongoDB

### April 7, 2026 - WordPress Publish Animation Fix
- [x] Deploy animation now shows real API call results: red X on failure, skipped steps marked
- [x] Error details box with actual error message
- [x] Added `deployFailed`, `deployFailStep`, `deployErrorMsg` states

### April 7, 2026 - Content Type Fix
- [x] Added "audio" to `ContentItemCreate` and `ContentItemUpdate` Pydantic models

### April 7, 2026 - Dark Mode Complete Cleanup (52+ files)
- [x] Three-pass bulk fix: inputs, selects, headings, dialogs, spans all converted to light mode
- [x] SelectTrigger, DialogContent, DialogTitle all fixed

### April 7, 2026 - Backup/Explorer Redesign + Global Search + Rack Scaling
- [x] BackupManagementPage and ApiExplorerPage fully redesigned (light theme)
- [x] Global search bar in topbar with debounced API search
- [x] ServerRackView responsive scaling (0.45x-2.2x based on viewport)
- [x] Avatar dropdown site-list removed
- [x] Content Approval badge fix (expanded is_admin check)

## Prioritized Backlog

### P0 - Critical
- (none currently)

### P1 - High Priority
- [ ] Calendar Integration (Google Calendar / Outlook) for Clara Tasks
- [ ] WordPress Plugin Integration (clara-radio-schedule)

### P2 - Medium Priority
- [ ] Python linting cleanup (unused variables)
- [ ] Payment Gateway (Stripe/Mollie) for License Manager
- [ ] Stream Monitor VU Meters
- [ ] Refactoring: NetworkDashboard.js decomposition
- [ ] Accessibility: DialogTitle for wizard dialogs

## Key API Endpoints
- `POST /api/clara-assistant/chat` - AI chat (SEO/error modes)
- `POST /api/clara-assistant/seo/generate` - Generate SEO article
- `POST /api/clara-assistant/seo/improve` - Improve content SEO
- `POST /api/clara-assistant/error-help` - Error troubleshooting
- `GET /api/search` - Global search across content/shows/media
- `GET /api/menu/counts` - Navigation badge counts

## Test Credentials
- System Administrator: admkoodh@koodh.com / KYLovie13monx
- Network Admin: yannick.gijbels@koodh.com / test

## 3rd Party Integrations
- Cloudflare (WAF/DNS) - User API Key
- WordPress - Application Password
- Radioplayer - API Key
- ZeroTier - Active
- GPT-5.2 (OpenAI) - Emergent Universal Key
