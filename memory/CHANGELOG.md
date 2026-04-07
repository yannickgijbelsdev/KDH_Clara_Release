# Changelog

## 2026-04-07 — Isometric Image Cards (All Network Pages)
- Upgraded ALL Network pages from CSS gradient card headers to isometric 3D illustration-based headers
- Cards now use h-[180px] image areas with `/images/env_*.jpg` and radial-gradient vignette masks
- White glassmorphism badges (bg-white/90 backdrop-blur-lg) throughout
- Hover effects: scale-[1.02] + shadow increase + image scale-105
- Pages updated: Environments, Domain Manager (4 tabs), License Manager (3 tabs), Notifications, Branding
- Fixed EnvironmentManager.js missing `motion` import (runtime crash bug)
- Testing: 100% pass rate (iteration_135.json)

## 2026-04-07 — 260px Card Grid Migration (Initial CSS Gradient Version)
- First pass: converted all Network pages to 260px card grids with CSS gradient headers
- Testing: 100% pass rate (iteration_134.json)

## Previous Sessions
- Extracted NetworkHeader.js from NetworkDashboard.js
- Fixed routing for technical/task_scheduler/server site types
- Redesigned Clara Assistant to centered overlay messenger layout
- Migrated Network tabs from dark to light theme
- Fixed RDS stuck data, PWA install prompt, WP publishing, Cloudflare WAF sync
- Filtered avatar site dropdown for Network Admins
- Automated RDS background refresh (3-minute interval)
