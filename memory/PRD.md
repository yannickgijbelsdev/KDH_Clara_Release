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

## Design System — 260px Isometric Card Grid
All Network pages use a consistent card layout:
- **Width**: `w-[260px]` with `flex flex-wrap justify-center gap-4 sm:gap-6`
- **Image area**: `h-[180px]` with isometric 3D illustrations from `/images/env_*.jpg`
- **Image mask**: `radial-gradient(ellipse 60% 65% at center 55%, black 50%, transparent 100%)`
- **Badges**: White glassmorphism (`bg-white/90 backdrop-blur-lg rounded-lg`)
- **Accent bar**: `h-1` gradient at card bottom matching entity color
- **Animations**: Framer Motion staggered entrance (delay: i * 0.08, y: 30)
- **Hover**: `scale-[1.02]` + shadow increase + image `scale-105`

### Available isometric images:
- `/images/env_radio.jpg` — Radio sites
- `/images/env_server.jpg` — Servers/Datacenters
- `/images/env_technical.jpg` — Technical/Data connections
- `/images/env_task_scheduler.jpg` — Task schedulers
- `/images/env_external_host.jpg` — External hosts
- `/images/env_wp_security.jpg` — WordPress Security

## Key Pages & Features (All using isometric card grid)
- Sites Overview
- Environments
- Domain Manager (Overview, Site Domains, Subdomain Routing, Cloudflare)
- License Manager (Overview, Packages, Requests)
- Notifications (Roles, History)
- Branding (Platform Name, Logo, Favicon)
- Backups
- API Explorer
- Clara AI Assistant (centered overlay messenger)
- PWA Install Prompt
- RDS Monitor (auto-refresh every 3 min)
- 2FA Enforcement (conditional, with 3 permanent skips)

## 2FA Enforcement System
- **Conditional enforcement**: 2FA is mandatory if user is a Network Admin OR if their main_site has `require_2fa=True`
- **Skip mechanism**: Users can skip setup up to 3 times (permanent, stored in DB `totp_skip_count`). After 3 skips, setup is mandatory.
- **Backup codes**: 10 auto-generated codes during setup with Copy, Download (.txt), and Email delivery options
- **Site setting**: `require_2fa` boolean toggle on each main site (EditMainSiteWizard > General Settings)
- **Backend endpoints**: `/api/auth/2fa/enforcement-status`, `/api/auth/2fa/email-backup-codes`, `/api/auth/2fa/skip`
- **Frontend**: `TwoFactorEnforcementWrapper` in App.js only activates when `user.force_2fa === true`

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
