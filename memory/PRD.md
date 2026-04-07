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

### April 7, 2026 - Backup/Explorer Redesign + Global Search
- [x] **BackupManagementPage.js** - Full light-theme redesign: glassmorphism header, pill site selector, solid white status cards, Dutch labels, backup search filter
- [x] **ApiExplorerPage.js** - Full light-theme redesign: glassmorphism header, method filter pills, solid white category cards, Dutch labels
- [x] **Global Search Bar** - Added to main site dashboard topbar with debounced search across content, shows, and media
- [x] **Backend /api/search endpoint** - Searches content_items, shows, and media_items within current main site context
- [x] **Avatar dropdown cleanup** - Removed PRODUCTION site list (already in topbar site-switcher)
- [x] **Content Approval badge fix** - Extended is_admin check to include is_network_admin, is_system_admin, and news_admin roles

### April 7, 2026 - Glassmorphism + Animated Pill Navigation
- [x] Animated sliding pill indicator using framer-motion `layoutId` (spring animation between tabs)
- [x] Glassmorphism on navigation elements only, solid white for content panels
- [x] Counter badges added to pill navigation (Content Library, Media Library, Trash, Content Approval)
- [x] TinyMCE switched to light mode `oxide` skin

### April 6, 2026 - Multi-Step Wizard Refactor (All Dialogs)
- [x] CreateShowDialog, CreateContentDialog, RundownItemDialog - Wizard refactors
- [x] CreateEnvironmentWizard, TeamSettingsPage, ShowManagementPage - Wizard layouts

### April 5, 2026 - Login Wizard Redesign & UI Fixes
- [x] LoginWizard rewritten with circle loader -> checkmark animation
- [x] WizardStepIndicator.js shared component
- [x] CreateMainSiteWizard.js, CreateEnvironmentWizard.js
- [x] Dashboard Canvas with floating panels
- [x] Dark mode removal complete

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
- Network Admin: yannick.gijbels@koodh.com / test (may need password reset)
