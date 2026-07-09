# Onboarding a New Client (White-Label)

This CRM is sold as a **separate copy per client** — each company gets its own domain,
login, and database, fully isolated from every other client. Only the **company name**
changes; everything else is the same product.

Follow this checklist each time you sell to a new company. Budget ~30 minutes.

---

## What each client needs

| Item | Notes |
|---|---|
| A VPS | One Hostinger KVM 1 (~₹500/mo) per client keeps data fully isolated |
| A domain or subdomain | e.g. `crm.theirdomain.com`, or `theirname.yourdomain.com` |
| Their company name | e.g. "Sharma Properties CRM" |
| Their admin mobile + password | The client's first login |

---

## Steps

### 1. Get a VPS + point the domain
- Buy a Hostinger **KVM 1** with the **Ubuntu + Docker** template. Note its IP.
- In DNS, add an **A record** pointing the client's (sub)domain to the VPS IP.
  (If using a subdomain of *your* domain, add it under your domain's DNS.)

### 2. Connect and get the code
```bash
ssh root@THEIR_VPS_IP
# install Docker if the template didn't include it:
curl -fsSL https://get.docker.com | sh
# clone the code (set up a Deploy Key first for private repos — see docs/HOSTINGER.md)
git clone <your-repo-url> crm && cd crm
```

### 3. Configure this client
```bash
cp .env.production.example .env
# generate three secrets:
openssl rand -hex 48   # JWT_ACCESS_SECRET
openssl rand -hex 48   # JWT_REFRESH_SECRET
openssl rand -hex 24   # POSTGRES_PASSWORD
nano .env
```
Fill in for **this client**:
| Variable | Value |
|---|---|
| `APP_NAME` | the client's name, e.g. `Sharma Properties CRM` |
| `DOMAIN` | their domain, e.g. `crm.sharmaproperties.com` |
| `TLS_EMAIL` | your (or their) email |
| `POSTGRES_PASSWORD` | the `rand -hex 24` value |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | the two `rand -hex 48` values |
| `ADMIN_NAME` | the client owner's name |
| `ADMIN_MOBILE` | their login mobile |
| `ADMIN_PASSWORD` | a strong first password |

> ⚠️ **Every client must get their own fresh secrets and password** — never reuse them.

### 4. Launch
```bash
docker compose -f docker-compose.prod.yml up -d --build
```
Caddy fetches the HTTPS certificate automatically. In a few minutes the CRM is live at
`https://THEIR_DOMAIN`, showing **their** company name in the sidebar, login page, browser
tab, and installable app.

### 5. Hand over
- Give the client their URL + admin mobile/password.
- Tell them to open the site on their phone → **Add to Home Screen** to install the app.
- They add their own team, projects and properties from inside the CRM.

---

## Changing a client's name later
Two places:
1. **In-app** (instant): Settings → Company → change the name (used on reports/documents).
2. **App title / sidebar / installed-app name** (needs a rebuild): update `APP_NAME` in that
   client's `.env`, then `./deploy.sh` (or `docker compose -f docker-compose.prod.yml up -d --build`).

## Updating all clients when you improve the CRM
Each client is its own deployment. After you push an improvement to the code:
- On each client's VPS: `cd crm && ./deploy.sh`
- (The `deploy.sh` script pulls the latest code and rebuilds — same for every client.)

## Tips for scaling as a reseller
- Keep a simple spreadsheet: client name, VPS IP, domain, admin mobile.
- One VPS per client is the simplest and safest (isolated data). Running several clients on
  one bigger VPS is possible but needs a shared reverse proxy — ask before attempting.
- Charge a one-time setup + monthly fee that covers the VPS cost and your support.
