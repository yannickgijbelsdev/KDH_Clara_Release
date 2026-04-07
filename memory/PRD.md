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

### April 7, 2026 - Login Page Redesign (Floating Isometric Rooms)
- [x] **Custom AI-generated isometric rooms** (radio studio + data analytics office) in Clara's signature style
- [x] **Transparent background**: Programmatic background removal (Python/PIL) for seamless floating effect
- [x] **Mouse parallax effect**: Rooms and text follow cursor with 3D perspective transforms
- [x] **Responsive scaling**: Rooms auto-scale from mobile (390px) to large screens (1920px+)
- [x] **Clean light theme**: Warm beige (#f5f2ed) background, glassmorphism login panel

### April 7, 2026 - Clara AI Assistant (Integrated)
- [x] Content Creation Choice: Step 2 of CreateContentDialog shows "Write your own" vs "Write with Clara"
- [x] Error Assistance: `claraToast.error()` utility adds Clara action button to error toasts
- [x] WP Publish Error: Red error box shows inline Clara button
- [x] Backend: 4 endpoints: `/api/clara-assistant/chat`, `/seo/generate`, `/seo/improve`, `/error-help`

### April 7, 2026 - WordPress Publish Animation Fix
- [x] Deploy animation shows real API results: red X on failure, skipped steps marked

### April 7, 2026 - Content Type Fix + Dark Mode Cleanup
- [x] Added "audio" to ContentItemCreate/Update Pydantic models
- [x] Three-pass bulk dark mode cleanup (52+ files)

### April 7, 2026 - Backup/Explorer Redesign + Global Search + Rack Scaling
- [x] BackupManagementPage and ApiExplorerPage redesigned (light theme)
- [x] Global search bar in topbar
- [x] ServerRackView responsive scaling
- [x] Avatar dropdown cleanup, Content Approval badge fix

## Prioritized Backlog

### P1 - High Priority
- [ ] Calendar Integration (Google Calendar / Outlook) for Clara Tasks
- [ ] WordPress Plugin Integration (clara-radio-schedule)

### P2 - Medium Priority
- [ ] Python linting cleanup (unused variables)
- [ ] Payment Gateway (Stripe/Mollie)
- [ ] Stream Monitor VU Meters
- [ ] Refactoring: NetworkDashboard.js decomposition
- [ ] React Hook warnings (ShowsPage.js, TrashPage.js, ZeroTierPage.js)

## Test Credentials
- System Administrator: admkoodh@koodh.com / KYLovie13monx
- Network Admin: yannick.gijbels@koodh.com / test

## 3rd Party Integrations
- Cloudflare (WAF/DNS), WordPress, Radioplayer, ZeroTier
- GPT-5.2 (OpenAI) via Emergent Universal Key
