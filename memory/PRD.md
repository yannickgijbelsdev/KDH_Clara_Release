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

### April 7, 2026 - Counter Badges in Pill Navigation
- [x] Added counter badges to the horizontal pill-tab navigation for: Content Library, Media Library, Trash, Content Approval
- [x] Backend: Added `media` count to `/api/menu/counts` endpoint
- [x] Frontend: Pill tabs show small rounded badges (inverted when active tab)
- [x] Frontend: "More" dropdown also shows badges for overflow items
- [x] TinyMCE RichTextEditor switched from `oxide-dark` to `oxide` (light mode skin)

### April 6, 2026 - Multi-Step Wizard Refactor (All Dialogs)
- [x] **CreateShowDialog.js** - Converted to 3-step wizard (Show Info, Schedule, Team & Status)
- [x] **CreateContentDialog.js** - Converted to 3-step wizard (Type & Title, Content, Settings)
- [x] **RundownItemDialog.js** - Converted to 2-step wizard (Item Info, Details)
- [x] **CreateEnvironmentWizard.js** - Updated deploy step to match MainSiteWizard (hero background image, large green checkmark circles)
- [x] **TeamSettingsPage.js** - All dialogs (Invite User, Add Existing User, Edit User, Reset Password, Temp Password) converted to wizard layout
- [x] **ShowManagementPage.js** - Show Title and Studio dialogs converted to wizard layout
- All dialogs now use: WizardStepIndicator, white bg, rounded-[24px], px-8 padding, border-t footer with Back/Continue buttons

### April 5, 2026 - Login Wizard Redesign & UI Fixes
- [x] **LoginWizard rewritten** with circle loader -> checkmark animation
- [x] **Production environment dropdown** made visible
- [x] **SetupWizard** converted to light theme
- [x] **LoginWizard** converted to light theme with wider layout
- [x] **WizardStepIndicator.js** - Shared step component created
- [x] **CreateMainSiteWizard.js** - Reference wizard with deploy animation
- [x] **CreateEnvironmentWizard.js** - Multi-step env creator with max_racks
- [x] **Dashboard Canvas** - Floating panels, live time/date, full-page backgrounds
- [x] **Dark mode removal** - All dark mode remnants removed from sub-components

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
- [ ] Accessibility: Add VisuallyHidden DialogTitle to wizard dialogs for screen reader compliance

## Test Credentials
- System Administrator: admkoodh@koodh.com / KYLovie13monx
- Network Admin: yannick.gijbels@koodh.com / test
