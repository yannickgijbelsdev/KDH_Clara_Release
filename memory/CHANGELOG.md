# Changelog

## 2026-04-07 — 260px Card Grid Migration (All Network Pages)
- Fixed `EnvironmentManager.js` — Added missing `motion` import from framer-motion (was causing runtime crash)
- Converted `BrandingSettings.js` — Full rewrite to 3 cards (Platform Name, Logo, Favicon) in 260px grid
- Converted `LicenseManager.js` — Overview (stat+site cards), Packages (package cards), Requests (request cards)
- Converted `DomainManager.js` — Overview (stat+route cards), Site Domains (domain cards), Routing (route cards)
- Converted `NotificationSettings.js` — Roles tab (role cards with expand/collapse), History tab (event cards)
- All cards use CSS gradient headers (no AI image generation due to quota), glassmorphism badges, bottom accent bars
- Testing: 100% pass rate via testing agent (iteration_134.json)

## Previous Sessions
- Extracted `NetworkHeader.js` from `NetworkDashboard.js`
- Fixed routing for technical/task_scheduler/server site types
- Redesigned Clara Assistant to centered overlay messenger layout
- Migrated Network tabs from dark to light theme
- Fixed RDS stuck data, PWA install prompt, WP publishing, Cloudflare WAF sync
- Filtered avatar site dropdown for Network Admins
- Automated RDS background refresh (3-minute interval)
