# Installation Guide

## Prerequisites

- **Node.js 20+** (22 recommended)
- **PostgreSQL 14+** — local install or Docker
- (optional) **Cloudinary account** for CDN file storage; local disk is used otherwise

## 1. Database

Pick any one of the three options:

**a) Docker (easiest when available):**

```bash
docker compose up -d db
```

**b) No Docker or Postgres installed — embedded dev database:**

```bash
cd server
npm install
npm run db:dev     # boots PostgreSQL 17 on :5432 (user crm / crm_password),
                   # data persists in server/.pgdata — keep this terminal open
```

**c) Your own PostgreSQL server:**

Create a database manually and note the connection string:

```sql
CREATE USER crm WITH PASSWORD 'crm_password';
CREATE DATABASE real_estate_crm OWNER crm;
```

## 2. API server

```bash
cd server
cp .env.example .env
```

Edit `.env`:

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | ✅ | `postgresql://crm:crm_password@localhost:5432/real_estate_crm?schema=public` |
| `JWT_ACCESS_SECRET` | ✅ | `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `JWT_REFRESH_SECRET` | ✅ | different value, same method |
| `CORS_ORIGINS` | ✅ | comma-separated; `http://localhost:5173` for dev |
| `ACCESS_TOKEN_TTL` | – | default `15m` (session timeout) |
| `REFRESH_TOKEN_TTL_DAYS` / `_REMEMBER` | – | 7 / 30 days |
| `CLOUDINARY_*` | – | leave empty to store files in `server/uploads/` |
| `MAX_UPLOAD_MB` | – | default 10 |
| `SMTP_*` | – | when empty, reset tokens are printed to the server log |

Then:

```bash
npm install
npx prisma migrate deploy   # applies prisma/migrations
npm run seed                # roles, permissions, statuses, sources, stages,
                            # 8 demo users, 3 projects, 36 units, 60 leads, bookings…
npm run dev                 # http://localhost:4000  (health: GET /api/health)
```

The seed is **idempotent** — it upserts configuration and skips demo data if leads already exist.

## 3. Web client

```bash
cd client
npm install
npm run dev                 # http://localhost:5173
```

The Vite dev server proxies `/api` and `/uploads` to `http://localhost:4000`, so no client env
vars are needed.

## 4. Log in

| Mobile | Role |
|---|---|
| 9000000001 | Super Admin |
| 9000000002 | Admin |
| 9000000003 | Manager |
| 9000000004 / 9000000005 | Sales Executive |
| 9000000006 | Telecaller |
| 9000000007 | Marketing |
| 9000000008 | Accountant |

Password for all demo users: **`Password@123`** — change these in Team → Edit before going live.

## Troubleshooting

- **`P1001: Can't reach database`** — Postgres isn't running or `DATABASE_URL` is wrong.
- **CORS errors in browser** — add your client origin to `CORS_ORIGINS` and restart the API.
- **Login always 401** — check the client is calling through the Vite proxy (same origin) so the
  refresh cookie is stored; clear cookies after changing JWT secrets.
- **File uploads 400** — only images, PDF, and Excel/CSV are accepted, up to `MAX_UPLOAD_MB`.
