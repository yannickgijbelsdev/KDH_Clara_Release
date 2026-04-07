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

## User Personas
- **System Administrator**: Full platform access, manages all sites and network config
- **Network Admin**: Manages assigned sites, environments, domains
- **Site Admin/Presenter/Editor**: Site-level operations

## Key Pages & Features

### Network Dashboard (`NetworkDashboard.js`)
- **Sites Overview**: Server rack visualization with isometric cards
- **Network Admins**: User management
- **Environments**: 260px card grid with CSS gradient headers ✅
- **Domain Manager**: 260px card grid for stats, domains, routes ✅
- **License Manager**: 260px card grid for stats, sites, packages, requests ✅
- **Notifications**: 260px card grid for role settings ✅
- **Branding**: 260px card grid for platform name, logo, favicon ✅
- **Backups**: 260px card grid (standalone page) ✅
- **API Explorer**: 260px card grid (standalone page) ✅

### Clara AI Assistant
- Centered overlay messenger layout ✅
- Error troubleshooting with structured steps ✅
- SEO writing assistance ✅

### PWA Support
- Install prompt overlay after login ✅
- Settings toggle in Personal Settings ✅

### RDS Monitor
- Auto-refresh background polling every 3 minutes ✅
- Force refresh clears all cached data ✅

## 3rd Party Integrations
- Cloudflare (WAF/DNS) — User API Key required
- WordPress — Application Password required
- Radioplayer — API Key integrated
- ZeroTier — Active
- OpenAI GPT-5.2 — Emergent Universal Key

## Design System
- **Card Layout**: 260px wide cards with CSS gradient headers, glassmorphism, bottom accent bars
- **Animations**: Framer Motion for card entrance (staggered opacity+y)
- **Color Scheme**: White/light backgrounds, orange accent (#f97316), contextual colors per entity
- **Typography**: Zinc color scale for text hierarchy
- **Components**: shadcn/ui library

## Credentials
- System Admin: admkoodh@koodh.com / KYLovie13monx
- Network Admin: yannick.gijbels@koodh.com / test
