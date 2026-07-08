# Going Live on Hostinger

This CRM is a **Node.js + PostgreSQL** application. Hostinger **Shared / Premium / Business**
hosting only runs **PHP + MySQL**, so it *cannot* run this stack directly. There are two ways to
go live with your Hostinger domain:

| Path | Where the app runs | Best for |
|---|---|---|
| **A. Hostinger VPS** (recommended) | Everything (frontend + backend + PostgreSQL) on one Hostinger VPS | "All on Hostinger", one central DB, simplest long-term |
| **B. Shared hosting + free backend** | Frontend on your current plan; backend + DB on a free tier | Cheapest, but backend is not on Hostinger |

Either way, **every device that logs in talks to the same server and the same database**, so data
is always in sync automatically — that requirement is met by the architecture itself.

---

## Path A — Hostinger VPS (recommended)

### 1. Buy a VPS
In hPanel → **VPS** → get a **KVM 1** (or KVM 2 for more headroom). When asked for the OS/template,
choose **Ubuntu 24.04 with Docker** (Hostinger offers a "Docker" application template — pick it so
Docker is pre-installed). Note the VPS **IP address** and root password.

### 2. Point your domain at the VPS
In hPanel → **Domains → DNS / Nameservers → DNS records** for your domain, add an **A record**:

| Type | Name | Points to | TTL |
|---|---|---|---|
| A | `crm` (for crm.yourdomain.com) — or `@` for the root domain | your VPS IP | 300 |

DNS usually propagates within a few minutes to an hour. You can proceed with the next steps while
it propagates.

### 3. Connect to the VPS
From your computer's terminal (or hPanel → VPS → **Browser terminal**):

```bash
ssh root@YOUR_VPS_IP
```

If Docker wasn't pre-installed, install it:

```bash
curl -fsSL https://get.docker.com | sh
```

### 4. Get the code onto the VPS
Push this project to a GitHub repo, then clone it (private repos: use a deploy token or `gh auth`):

```bash
git clone https://github.com/YOUR_USERNAME/real-estate-crm.git
cd real-estate-crm
```

*(No GitHub? You can `scp -r` the folder from your PC, or zip it and upload via hPanel.)*

### 5. Configure environment
```bash
cp .env.production.example .env
nano .env
```
Fill in **every** value. Generate the secrets right on the server:

```bash
openssl rand -hex 48   # paste as JWT_ACCESS_SECRET
openssl rand -hex 48   # paste as JWT_REFRESH_SECRET (must differ)
openssl rand -hex 24   # paste as POSTGRES_PASSWORD
```
Set `DOMAIN=crm.yourdomain.com`, `TLS_EMAIL=you@yourdomain.com`, and your `ADMIN_MOBILE` /
`ADMIN_PASSWORD` (this becomes your first login). Save with `Ctrl+O`, `Enter`, `Ctrl+X`.

### 6. Launch 🚀
```bash
docker compose -f docker-compose.prod.yml up -d --build
```
First build takes a few minutes. Caddy then automatically obtains a free HTTPS certificate for your
domain (ports 80 and 443 must be reachable — Hostinger VPS allows this by default).

Check it's healthy:
```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f api   # Ctrl+C to stop watching
```

### 7. Log in
Open **https://crm.yourdomain.com** and sign in with the `ADMIN_MOBILE` / `ADMIN_PASSWORD` you set.
No demo data is created in production — you start with a clean CRM (roles, permissions, lead
statuses, sources, pipeline stages and integrations are pre-configured).

### Day-2 operations

**Update after code changes:**
```bash
cd real-estate-crm && git pull
docker compose -f docker-compose.prod.yml up -d --build
```

**Backups (run daily, e.g. via cron):**
```bash
docker compose -f docker-compose.prod.yml exec -T db \
  pg_dump -U crm real_estate_crm | gzip > ~/crm-backup-$(date +%F).sql.gz
```

**Restore a backup:**
```bash
gunzip -c ~/crm-backup-YYYY-MM-DD.sql.gz | \
  docker compose -f docker-compose.prod.yml exec -T db psql -U crm -d real_estate_crm
```

**Add real team members:** log in → **Team → Add Employee**. Give each person their own mobile +
password and role. Change or remove the initial admin later from the same screen.

**Enable integrations:** **Settings → Integrations** — the webhook/Facebook/Google/WhatsApp/SMTP
callback URLs now use your real HTTPS domain, so Facebook & Google can reach them (they could not
reach `localhost`). See `docs/API.md` for each integration's setup.

---

## Path B — Shared hosting frontend + free backend

Use this if you want to keep your current Hostinger plan and not pay for a VPS.

### Backend + database (free tier)
1. Create a free PostgreSQL DB on **Neon** (neon.tech) or **Supabase** — copy its connection string.
2. Deploy the `server/` folder to **Render** (render.com) or **Railway** as a Web Service:
   - Build: `npm install && npm run build && npx prisma generate`
   - Start: `npx prisma migrate deploy && npx tsx prisma/seed.ts && node dist/index.js`
   - Env vars: `DATABASE_URL` (from step 1), `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`,
     `SEED_DEMO_DATA=false`, `ADMIN_MOBILE`, `ADMIN_PASSWORD`,
     `CORS_ORIGINS=https://yourdomain.com`, `NODE_ENV=production`.
   - Note the backend URL, e.g. `https://crm-api.onrender.com`.

### Frontend on Hostinger shared hosting
1. On your PC, build with the API URL baked in:
   ```bash
   cd client
   echo "VITE_API_URL=https://crm-api.onrender.com/api" > .env.production
   npm run build
   ```
2. In hPanel → **File Manager**, upload the **contents of `client/dist/`** into `public_html`.
3. Create `public_html/.htaccess` so the single-page app routing works:
   ```apache
   <IfModule mod_rewrite.c>
     RewriteEngine On
     RewriteBase /
     RewriteRule ^index\.html$ - [L]
     RewriteCond %{REQUEST_FILENAME} !-f
     RewriteCond %{REQUEST_FILENAME} !-d
     RewriteRule . /index.html [L]
   </IfModule>
   ```
4. Your domain already on Hostinger serves the frontend; it calls the Render backend over HTTPS.

> Note: this requires `client/src/lib/api.ts` to read `import.meta.env.VITE_API_URL`. The app
> defaults to same-origin `/api`, which is why Path A needs no build-time URL. For Path B, set
> `VITE_API_URL` as shown. Free backend tiers may "sleep" when idle (first request is slow).

---

## Which should you pick?

- Want everything on Hostinger, one central database, and a smooth experience for a real sales
  team → **Path A (VPS)**. It's the intended production setup and costs about a VPS plan per month.
- Just testing / lowest cost, and okay with the backend living off-Hostinger → **Path B**.
