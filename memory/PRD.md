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

### April 7, 2026 - Backup Management Page Redesign (Isometric)
- [x] **Redesigned to match Server Rack view**: Isometric 3D room cards per site (260px fixed width)
- [x] **Environment grouping**: Sites grouped by environment (Production, Staging, etc.) with labels
- [x] **Click-to-open detail panel**: Clicking a card opens a slide-in panel showing all backups for that site
- [x] **Full backup operations in panel**: Create backup, restore, delete, clone, search
- [x] **All UI text in English**: Translated from Dutch to English

### April 7, 2026 - API Explorer Page Redesign (Isometric)
- [x] **Redesigned to match Server Rack view**: 260px isometric category cards replacing list-based layout
- [x] **Click-to-open detail panel**: Clicking a category opens endpoint list with method badges, search, copy
- [x] **Canvas-style layout**: Same dot pattern, floating panels, accent bars as other isometric pages
- [x] **All UI text in English**: Translated from Dutch

### April 7, 2026 - Global Error Handling & Clara Assistant Integration
- [x] **Eliminated all native browser `alert()` popups** from the entire frontend codebase
- [x] **Upgraded `claraToast.js`**: Global `openClara` storage + `init()` method + monkey-patches sonner `toast.error` to auto-add Clara Assistent button
- [x] **`ClaraToastInit` component**: Initializes Clara toast at app root (renders null)
- [x] **Moved `ClaraAssistantProvider` to App.js root**: All components now have access to Clara context (was previously limited to MainSiteDashboardLayout)
- [x] **Wizard deploy failure UI**: Both `CreateMainSiteWizard` and `CreateEnvironmentWizard` show red cross indicators on failed deploy steps with inline `ClaraErrorButton`
- [x] **All ~50+ `toast.error()` calls** across the codebase now automatically include "Clara Assistent" action button via sonner monkey-patch

### April 7, 2026 - Python Linting Cleanup
- [x] Removed unused variables: `wp_date_gmt`, `wp_modified`, `clara_status` from `wordpress.py`
- [x] Removed unused import `current_time_brussels` from `rds_builder_scheduler.py`
- [x] Fixed f-string without placeholders in `wordpress.py`

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

### April 7, 2026 - Network Pages Light Theme Migration
- [x] **DomainManager.js**: 84 dark-mode patronen omgezet naar licht thema (bg-zinc-900→bg-white, text-zinc-200→text-zinc-700, etc.)
- [x] **LicenseManager.js**: 23 dark-mode patronen gefixed
- [x] **NotificationSettings.js**: 33 dark-mode patronen gefixed, SMTP form licht thema
- [x] **BrandingSettings.js**: 4 dark-mode patronen gefixed (toggle buttons)
- [x] **EnvironmentManager.js**: Was al grotendeels licht, minimale fixes

### April 7, 2026 - Clara Assistent Redesign & Universal Layout
- [x] **Clara Assistent → Centered overlay**: Herschreven van side-panel naar centered popup met backdrop blur
- [x] **Messenger layout**: Chat bubbles, user/assistant berichten, copy/insert knoppen
- [x] **Error-help vereenvoudigd**: Backend prompt geeft nu 3 eenvoudige stappen i.p.v. technische uitleg
- [x] **Support formulier**: Na mislukte stappen kan gebruiker direct een support ticket aanmaken via Clara
- [x] **Clara AI knop in content editor**: Nieuwe "Clara AI" knop naast Save voor SEO schrijfhulp
- [x] **Support ticket endpoint**: POST /api/clara-assistant/support-ticket (met bugfix voor user_id)

### April 7, 2026 - Universal Layout & Dashboard Fix
- [x] **NetworkHeader universeel gemaakt**: NetworkDashboard gebruikt nu het herbruikbare NetworkHeader component (i.p.v. 160 regels inline header)
- [x] **Dashboard voor elk site-type**: technical, task_scheduler en server sites tonen nu een dashboard i.p.v. direct redirecten
- [x] **NetworkHeader props uitgebreid**: Ondersteunt `activeSection`/`onSectionChange` voor tab-switching, en `environments`/`selectedEnvId`/`onEnvChange` voor environment state passthrough
- [x] **Backups & Explorer**: Behouden NetworkHeader met "Enterprise Global" label

### April 7, 2026 - NetworkHeader Extraction & Reuse
- [x] **Extracted reusable `NetworkHeader.js` component** from `NetworkDashboard.js` header section
- [x] **Applied to `BackupManagementPage.js`**: Replaced static Clara header with full navigation bar
- [x] **Applied to `ApiExplorerPage.js`**: Same full navigation bar with pill tabs, env switcher, user menu
- [x] **Responsive**: Mobile hamburger menu, desktop pill tabs, environment switcher all functional
- [x] **Active page highlighting**: Backups/Explorer highlighted in "More" dropdown when on those pages

## Prioritized Backlog

### P1 - High Priority
- [ ] Calendar Integration (Google Calendar / Outlook) for Clara Tasks
- [ ] WordPress Plugin Integration (clara-radio-schedule)

### P2 - Medium Priority
- [x] Python linting cleanup (unused variables) — DONE
- [ ] Payment Gateway (Stripe/Mollie)
- [ ] Stream Monitor VU Meters
- [x] Refactoring: NetworkHeader extraction (step 1 of NetworkDashboard.js decomposition) — DONE
- [x] Refactoring: NetworkDashboard.js uses NetworkHeader component — DONE
- [x] Dashboard for all site types (technical, task_scheduler, server) — DONE
- [ ] Refactoring: Further decompose remaining NetworkDashboard.js sections
- [ ] React Hook warnings (ShowsPage.js, TrashPage.js, ZeroTierPage.js)

## Test Credentials
- System Administrator: admkoodh@koodh.com / KYLovie13monx
- Network Admin: yannick.gijbels@koodh.com / test

## 3rd Party Integrations
- Cloudflare (WAF/DNS), WordPress, Radioplayer, ZeroTier
- GPT-5.2 (OpenAI) via Emergent Universal Key
