# Deployment Guide

## Option A — Docker Compose (single VM)

The repo ships three services: `db` (Postgres 16), `api` (Express, migrations + seed run on
boot), `web` (NGINX serving the built SPA and proxying `/api`).

```bash
# on the server
git clone <your-repo> && cd real-estate-crm

# strong secrets are mandatory in production
export JWT_ACCESS_SECRET=$(openssl rand -hex 48)
export JWT_REFRESH_SECRET=$(openssl rand -hex 48)
# optional Cloudinary
export CLOUDINARY_CLOUD_NAME=... CLOUDINARY_API_KEY=... CLOUDINARY_API_SECRET=...

docker compose up -d --build
```

- App: `http://<server>:8080` · API: `http://<server>:4000`
- Uploaded files persist in the `uploads` volume; database in `pgdata`.

### Production hardening checklist

1. **Change every demo password** (Team → Edit) or delete demo users after creating real ones.
2. Put a TLS terminator in front (Caddy, Traefik, or host NGINX with certbot) → proxy to `web:80`.
   The refresh cookie is `secure` when `NODE_ENV=production`, so HTTPS is required for login.
3. Set `CORS_ORIGINS` on the `api` service to your real domain (e.g. `https://crm.example.com`).
4. Remove the `db` port mapping (`5432:5432`) if the database shouldn't be reachable externally.
5. Schedule database backups:
   ```bash
   docker compose exec db pg_dump -U crm real_estate_crm | gzip > backup-$(date +%F).sql.gz
   ```
   Config-level backup/restore (statuses, templates, settings) is available in-app under
   Settings → Backup.

## Option B — Managed platforms

- **API**: any Node host (Railway, Render, Fly.io, ECS). Build with `npm run build`, run
  `npx prisma migrate deploy && node dist/index.js`. Provision Postgres and set the env vars from
  `server/.env.example`.
- **Web**: static hosting (Netlify, Vercel, S3+CloudFront). Build `client` with `npm run build`
  and either proxy `/api` at the edge or set up the API on the same domain to keep cookie auth
  working (`SameSite=Strict`).

## NGINX reference

`client/nginx.conf` (used by the web image) handles:

- SPA fallback (`try_files … /index.html`)
- immutable caching for hashed `/assets/*`
- gzip
- `/api` and `/uploads` reverse proxy with `X-Forwarded-*` headers (the API sets
  `trust proxy`, so rate limiting and IP logging work behind it)
- 15 MB upload limit and basic security headers

## CI/CD — GitHub Actions

`.github/workflows/ci.yml` runs on every push/PR:

1. **server** — `npm ci`, `prisma generate`, `tsc --noEmit`, `vitest`, `tsc build`
2. **client** — `npm ci`, typecheck + Vite build
3. **docker** — builds both images

Extend the `docker` job with a registry push + SSH deploy step for continuous delivery, e.g.:

```yaml
- name: Push image
  run: |
    echo ${{ secrets.GHCR_TOKEN }} | docker login ghcr.io -u ${{ github.actor }} --password-stdin
    docker tag crm-api ghcr.io/${{ github.repository }}/crm-api:${{ github.sha }}
    docker push ghcr.io/${{ github.repository }}/crm-api:${{ github.sha }}
```

## Environment variables (production summary)

| Service | Variable | Value |
|---|---|---|
| api | `NODE_ENV` | `production` |
| api | `DATABASE_URL` | managed Postgres URL |
| api | `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | 96-char random hex, distinct |
| api | `CORS_ORIGINS` | `https://your-domain` |
| api | `CLOUDINARY_*` | recommended in production (containers are ephemeral) |
| api | `SMTP_*` | for password-reset emails |
