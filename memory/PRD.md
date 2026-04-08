# Radio Show Planning & Management Platform — PRD

## Original Problem Statement
Multi-environment SaaS platform for radio station management built with React frontend, FastAPI backend, and MongoDB. Integrates with Cloudflare, WordPress, Radioplayer, ZeroTier, and OpenAI GPT-5.2.

## Core Requirements
- Network-level management dashboard for multi-site radio operations
- Environment management (Production, Staging, Dev)
- Domain management with Cloudflare integration
- License management for sites and packages
- WordPress content publishing and security
- Clara AI Assistant for error troubleshooting and SEO
- PWA installation support
- RDS (Radio Data System) metadata monitoring with auto-refresh
- Two-Factor Authentication (2FA) enforcement with conditional rules
- License enforcement with grayed-out menus and Clara-powered help overlay

## Architecture
```
/app
├── backend/ (FastAPI)
│   ├── routers/ (API endpoints)
│   ├── services/ (Business logic, schedulers)
│   └── .env (MONGO_URL, DB_NAME, etc.)
├── frontend/ (React)
│   ├── src/components/ (Shared components)
│   ├── src/pages/Network/ (Network dashboard pages)
│   └── .env (REACT_APP_BACKEND_URL)
└── memory/ (PRD, changelog, credentials)
```

## Design System — Light Mode Theme
All pages use a consistent light-mode design:
- **Backgrounds**: `bg-white`, `bg-zinc-50`, `bg-zinc-100` for containers/cards
- **Text**: `text-zinc-900` for headings, `text-zinc-600`/`text-zinc-500` for secondary
- **Borders**: `border-zinc-200` consistently
- **Form inputs**: `bg-zinc-50 border border-zinc-200 text-zinc-900`
- **Select dropdowns**: `bg-white border-zinc-200`
- **Table headers**: `bg-zinc-100`
- **Badges/tags**: `bg-zinc-100 text-zinc-500` or `bg-zinc-200`
- **Separators**: `bg-zinc-200`
- **Image placeholders**: `bg-zinc-200`
- **Calendar non-current cells**: `bg-zinc-50`
- **Hover states**: `hover:bg-zinc-100` or `hover:bg-zinc-200`

### Intentionally Dark Elements (DO NOT CHANGE):
- Nav pill button: `bg-zinc-900 text-white rounded-full`
- Primary action buttons: `bg-zinc-900 text-white` (dark CTA)
- ClaraAssistant chat bubbles
- DevTools panel
- Tooltips: `bg-zinc-900 text-white`
- Step indicators (active): `bg-zinc-900 text-white`

### 260px Isometric Card Grid (Network pages)
- **Width**: `w-[260px]` with `flex flex-wrap justify-center gap-4 sm:gap-6`
- **Image area**: `h-[180px]` with isometric 3D illustrations from `/images/env_*.jpg`
- **Image mask**: `radial-gradient(ellipse 60% 65% at center 55%, black 50%, transparent 100%)`

## 2FA Enforcement System
- **Conditional enforcement**: 2FA is mandatory if user is a Network Admin OR if their main_site has `require_2fa=True`
- **Skip mechanism**: Users can skip setup up to 3 times (permanent, stored in DB `totp_skip_count`). After 3 skips, setup is mandatory.
- **Backup codes**: 10 auto-generated codes during setup with Copy, Download (.txt), and Email delivery options
- **Site setting**: `require_2fa` boolean toggle on each main site (EditMainSiteWizard > General Settings)
- **Backend endpoints**: `/api/auth/2fa/enforcement-status`, `/api/auth/2fa/email-backup-codes`, `/api/auth/2fa/skip`
- **Frontend**: `TwoFactorEnforcementWrapper` in App.js only activates when `user.force_2fa === true`

## License Enforcement System
- **Condition**: Site menu is blocked when `!isSystemAdmin && !licenseLoading && licenseInfo && !licenseInfo.has_license && !licenseInfo.is_demo`
- **UI behavior**: All navigation items (pill nav, icon sidebar, mobile sidebar, search bar) are grayed out and non-clickable
- **Overlay**: `LicenseBlockedOverlay` component shows a card with:
  - Shield icon + "Geen actieve licentie" title
  - Checklist: Betaalde facturen, Offertes, E-mails van Clara Support
  - "Vraag Clara Assistent" button that opens Clara in 'license' mode
- **Clara license mode**: Auto-sends license help advice and shows "Contact Support" button for ticket creation
- **System admin bypass**: System admins (`is_system_admin=true`) always bypass the license check

## 3rd Party Integrations
- Cloudflare (WAF/DNS) — User API Key required
- WordPress — Application Password required
- Radioplayer — API Key integrated
- ZeroTier — Active
- OpenAI GPT-5.2 — Emergent Universal Key
- Office365 SMTP — For emails (password resets, backup codes, notifications)

## Credentials
- System Admin: admkoodh@koodh.com / KYLovie13monx
- Network Admin: yannick.gijbels@koodh.com / test

## Backlog (Prioritized)
### P1
- Finalize Calendar Integration (Google Calendar / Outlook) for Clara Tasks
- Finalize WordPress Plugin Integration (clara-radio-schedule)

### P2
- Integrate Payment Gateway (Stripe/Mollie) for License Manager
- Implement Stream Monitor VU Meters
- Cleanup Obsolete ProRadio Sync Code
- Fix React Hook dependency warnings (useEffect/useCallback)
- Refactoring: Split MainSiteDashboardLayout.js and NetworkDashboard.js
