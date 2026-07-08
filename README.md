# Real Estate CRM

A production-ready CRM for real estate companies — leads, properties, sales pipeline, site
visits, tasks, attendance, team performance, reports and integrations.

**Stack:** React 19 · TypeScript · Vite · TailwindCSS · TanStack Query · React Hook Form · Zod ·
Framer Motion · Express · Prisma · PostgreSQL · JWT (access + rotating refresh tokens) ·
Multer/Cloudinary · Docker · NGINX · GitHub Actions

## Quick start (local development)

```bash
# 1. Start PostgreSQL — pick ONE:
docker compose up -d db            # a) Docker
# — or, with no Docker/Postgres installed (keep this terminal open):
cd server && npm install && npm run db:dev   # b) embedded Postgres on :5432

# 2. API
cd server
cp .env.example .env          # fill in JWT secrets
npm install
npx prisma migrate deploy     # apply migrations
npm run seed                  # roles, permissions, demo users + dummy data
npm run dev                   # http://localhost:4000

# 3. Web app (new terminal)
cd client
npm install
npm run dev                   # http://localhost:5173
```

**Demo login:** mobile `9000000001` · password `Password@123` (Super Admin).
Other demo users: `9000000002`–`9000000008` (same password) covering Admin, Manager,
Sales Executive, Telecaller, Marketing, Accountant roles.

## Quick start (Docker, everything)

```bash
JWT_ACCESS_SECRET=$(openssl rand -hex 48) \
JWT_REFRESH_SECRET=$(openssl rand -hex 48) \
docker compose up -d --build
# App: http://localhost:8080  ·  API: http://localhost:4000
```

## Repository layout

```
real-estate-crm/
├── client/                 # React SPA (Vite + Tailwind + shadcn-style components)
│   └── src/
│       ├── components/     # ui primitives, data-table, layout (sidebar/topbar/search)
│       ├── features/       # auth, dashboard, leads, properties, pipeline, site-visits,
│       │                   # customers, tasks, attendance, team, reports, integrations,
│       │                   # settings, profile, shared
│       └── lib/            # api client (axios + refresh interceptor), auth context,
│                           # lookups, types, utils
├── server/                 # Express REST API (TypeScript)
│   ├── prisma/             # schema.prisma, migrations/, seed.ts
│   ├── src/
│   │   ├── config/         # zod-validated env
│   │   ├── lib/            # prisma, tokens, password, uploader (Cloudinary/local)
│   │   ├── middleware/     # auth (JWT + RBAC), validation, error handling
│   │   ├── modules/        # one folder per resource (auth, leads, properties, …)
│   │   └── utils/          # pagination, audit log, notifications
│   └── tests/              # vitest unit tests
├── docs/                   # installation, deployment, API, testing guides
├── docker-compose.yml      # postgres + api + nginx web
└── .github/workflows/      # CI: typecheck, test, build, docker
```

## Feature highlights

- **Auth:** mobile + password login, remember-me, forgot/reset password, JWT access tokens with
  rotating httpOnly refresh cookies, logout everywhere, rate-limited login.
- **RBAC:** 8 seeded roles with a fully editable permission matrix (resource × action) in Settings.
- **Leads:** advanced filters, sort, pagination, live duplicate detection, bulk assign/delete,
  Excel import/export, full activity timeline, notes, documents, call/WhatsApp/email logging,
  recurring follow-ups with overdue color codes.
- **Pipeline:** drag-and-drop kanban with custom stages and lost-reason capture.
- **Properties:** projects + unit inventory, multiple images/brochures, price history,
  availability status that syncs with bookings.
- **Site visits:** scheduling, executive assignment, GPS check-in, feedback, statuses.
- **Bookings:** converts leads to customers transactionally and updates unit availability.
- **Tasks:** priorities, due dates, recurring tasks, checklists, comments.
- **Attendance:** GPS check-in/out, working hours, late detection, leave management.
- **Dashboard & reports:** 8 KPI cards, revenue/source/funnel/performance charts, lost-reason
  analysis, target vs achievement, Excel export.
- **Integrations:** inbound webhook (n8n/Zapier/Facebook/landing pages) with token auth,
  SMTP/Cloudinary/WhatsApp toggles.
- **Hardening:** Helmet, CORS allowlist, global + per-route rate limits, zod validation on every
  input, Prisma (parameterized queries), file type/size validation, soft deletes, audit logs.

## Documentation

| Guide | Path |
|---|---|
| Installation | [docs/INSTALLATION.md](docs/INSTALLATION.md) |
| **Go live on Hostinger (domain + HTTPS)** | [docs/HOSTINGER.md](docs/HOSTINGER.md) |
| Deployment (Docker/NGINX/CI) | [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) |
| REST API reference | [docs/API.md](docs/API.md) |
| Testing guide | [docs/TESTING.md](docs/TESTING.md) |

## Scripts

| Where | Command | What |
|---|---|---|
| server | `npm run dev` | API with hot reload |
| server | `npm run build && npm start` | production build |
| server | `npm run typecheck` / `npm test` | TS check / vitest |
| server | `npm run seed` | idempotent seed (roles, options, demo data) |
| client | `npm run dev` | Vite dev server (proxies `/api` → :4000) |
| client | `npm run build` | typecheck + production bundle |
