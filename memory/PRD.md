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

### April 7, 2026 - Avatar Dropdown Cleanup & Approval Badge Fix
- [x] Removed site-list from avatar/profile dropdown in `MainSiteDashboardLayout.js` (sites already visible in topbar site-switcher)
- [x] Fixed `is_admin` check in `/api/menu/counts` to include `is_network_admin`, `is_system_admin`, and `news_admin` roles for approval badge
- [x] Removed unnecessary `status: "ready"` filter from approval count query

### April 7, 2026 - Glassmorphism + Animated Pill Navigation
- [x] Animated sliding pill indicator using framer-motion `layoutId` (spring animation between tabs)
- [x] Full glassmorphism treatment: `bg-white/50 backdrop-blur-lg border-white/60` on all panels, cards, dialogs
- [x] Network Dashboard: topbar, pill nav, cards, dialogs all glassy
- [x] Main Site Dashboard: floating panels, CanvasPanel, dropdowns all glassy
- [x] All wizard dialogs: `bg-white/80 backdrop-blur-2xl` with soft shadows
- [x] Batch-updated 20+ page files: ContentLibrary, ShowManagement, TeamSettings, MediaLibrary, RDS, Calendar, etc.
- [x] Counter badges added to pill navigation (Content Library, Media Library, Trash, Content Approval)
- [x] TinyMCE switched to light mode `oxide` skin

### April 6, 2026 - Multi-Step Wizard Refactor (All Dialogs)
- [x] **CreateShowDialog.js** - Converted to 3-step wizard (Show Info, Schedule, Team & Status)
- [x] **CreateContentDialog.js** - Converted to 3-step wizard (Type & Title, Content, Settings)
- [x] **RundownItemDialog.js** - Converted to 2-step wizard (Item Info, Details)
- [x] **CreateEnvironmentWizard.js** - Updated deploy step to match MainSiteWizard
- [x] **TeamSettingsPage.js** - All dialogs converted to wizard layout
- [x] **ShowManagementPage.js** - Show Title and Studio dialogs converted to wizard layout

### April 5, 2026 - Login Wizard Redesign & UI Fixes
- [x] **LoginWizard rewritten** with circle loader -> checkmark animation
- [x] **Production environment dropdown** made visible
- [x] **SetupWizard** converted to light theme
- [x] **WizardStepIndicator.js** - Shared step component created
- [x] **CreateMainSiteWizard.js** - Reference wizard with deploy animation
- [x] **CreateEnvironmentWizard.js** - Multi-step env creator with max_racks
- [x] **Dashboard Canvas** - Floating panels, live time/date, full-page backgrounds
- [x] **Dark mode removal** - All dark mode remnants removed

## Prioritized Backlog

### P0 - Critical
- (none currently)

### P1 - High Priority
- [ ] Calendar Integration (Google Calendar / Outlook) for Clara Tasks
- [ ] WordPress Plugin Integration (clara-radio-schedule)

### P2 - Medium Priority
- [ ] Python linting cleanup (unused variables in wordpress.py, rds_builder_scheduler.py)
- [ ] Payment Gateway (Stripe/Mollie) for License Manager
- [ ] Stream Monitor VU Meters
- [ ] Refactoring: NetworkDashboard.js decomposition (1500+ lines)
- [ ] Cleanup obsolete ProRadio sync code
- [ ] Accessibility: Add VisuallyHidden DialogTitle to wizard dialogs

## Test Credentials
- System Administrator: admkoodh@koodh.com / KYLovie13monx
- Network Admin: yannick.gijbels@koodh.com / test
