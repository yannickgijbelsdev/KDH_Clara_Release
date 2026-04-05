# Radio Show Planning & Rundown Dashboard - PRD

## Original Problem Statement
Build a web-based dashboard that allows radio editors to plan radio shows and prepare detailed rundowns. The focus of this MVP is show preparation, not live broadcasting.

## Architecture
- **Frontend**: React 19 with TailwindCSS, Shadcn/UI components, Framer Motion
- **Backend**: FastAPI (Python) with async MongoDB (Motor)
- **Database**: MongoDB
- **Authentication**: JWT-based email/password login with role-based access
- **UI Theme**: Light/frosted-glass canvas with horizontal pill-tab navigation

## What's Been Implemented

### April 5, 2026 - Login Wizard Redesign & UI Fixes
- [x] **LoginWizard rewritten** with circle loader → checkmark animation (matching deployment wizard style)
  - 4 loading steps: "Logging in to Clara", "Making a secure connection to the Clara Datacenter", "Connecting to the Clara Global Protect services", "Preparing {sitename} to show all the data"
  - After completion: animated transition to welcome popup "Welcome, {username} to {sitename}!"
  - "Enter Clara" / "Enter {sitename}" button
  - Files: `frontend/src/components/LoginWizard.js`, `frontend/src/App.js`
- [x] **Production environment dropdown** made visible (was white-on-white)
  - Changed from `bg-white/60 border-black/[0.08]` to `bg-zinc-100 border-zinc-300 text-zinc-700`
  - File: `frontend/src/pages/Network/NetworkDashboard.js`
- [x] **SetupWizard** converted to light theme (`bg-white` instead of `bg-[#0c0c0c]`)
  - File: `frontend/src/components/SetupWizard.js`
- [x] **LoginWizard** converted to light theme with wider layout (`sm:max-w-lg`)

## Prioritized Backlog

### P0 - Critical
- [ ] Verify CreateMainSiteWizard backend integration (POST /api/main-sites/ payload)

### P1 - High Priority
- [ ] Calendar Integration (Google Calendar / Outlook) for Clara Tasks
- [ ] WordPress Plugin Integration (clara-radio-schedule)

### P2 - Medium Priority
- [ ] Python linting cleanup (unused variables in wordpress.py, rds_builder_scheduler.py)
- [ ] CLISaveWizard.js convert to light theme
- [ ] Payment Gateway (Stripe/Mollie) for License Manager
- [ ] Stream Monitor VU Meters
- [ ] Refactoring: NetworkDashboard.js decomposition (1500+ lines)
- [ ] Cleanup obsolete ProRadio sync code

## Test Credentials
- System Administrator: admkoodh@koodh.com / KYLovie13monx
- Network Admin: yannick.gijbels@koodh.com / test
