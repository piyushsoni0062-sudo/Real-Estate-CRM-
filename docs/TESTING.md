# Testing Guide

## Automated tests

```bash
cd server
npm test            # vitest unit tests (tokens, password hashing, pagination)
npm run typecheck   # strict TypeScript across the API
cd ../client
npm run build       # tsc -b + Vite build — fails on any type or bundling error
```

CI (`.github/workflows/ci.yml`) runs all of the above plus Docker image builds on every push.

## API smoke tests (manual / scriptable)

With the API seeded and running on :4000:

```bash
# health
curl -s localhost:4000/api/health

# login → capture access token + refresh cookie
curl -s -c cookies.txt -X POST localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"mobile":"9000000001","password":"Password@123","rememberMe":true}'

TOKEN=<accessToken from response>

# authenticated requests
curl -s -H "Authorization: Bearer $TOKEN" "localhost:4000/api/leads?limit=5"
curl -s -H "Authorization: Bearer $TOKEN" localhost:4000/api/dashboard

# refresh rotation
curl -s -b cookies.txt -c cookies.txt -X POST localhost:4000/api/auth/refresh

# validation failure (400 with field details)
curl -s -X POST localhost:4000/api/auth/login -H "Content-Type: application/json" \
  -d '{"mobile":"123","password":""}'
```

## Role-based access checklist

Log in as each demo user and verify:

| User | Expect |
|---|---|
| 9000000001 Super Admin | every sidebar item, Settings → Roles editable |
| 9000000003 Manager | no Settings→Backup; Team visible; role matrix read-only |
| 9000000006 Telecaller | Leads/Properties/Tasks only; no Team, Reports, Integrations |
| 9000000008 Accountant | Dashboard, Customers, Reports; no lead editing |

API-level: repeat a forbidden call (e.g. `DELETE /api/leads/:id` as Telecaller) and expect `403`.

## Functional QA checklist

- **Auth:** wrong password → clear error; 21st login attempt in 15 min → rate-limited;
  logout-all invalidates other sessions; access token expiry (15 min) silently refreshes.
- **Leads:** duplicate mobile shows inline warning and server returns 409; import an Excel with
  Name/Mobile columns; export downloads .xlsx; bulk assign notifies the assignee (bell icon).
- **Pipeline:** drag card to Lost → reason prompt → appears in Reports → Lost Reason Analysis.
- **Booking:** book an available unit → unit becomes BOOKED, customer auto-created, revenue on
  dashboard updates; cancel booking → unit AVAILABLE again.
- **Site visit:** GPS check-in requires browser location permission; completing captures feedback
  on the lead timeline.
- **Attendance:** check-in after 10:00 marks LATE; check-out computes hours.
- **Follow-ups:** create one due in the past → red OVERDUE badge + bell reminder; recurring
  follow-up re-spawns on completion.
- **Uploads:** >10 MB or .exe rejected; images preview in gallery; delete removes the file.
- **UI states:** every list shows skeletons while loading, an empty state with guidance, an error
  state with retry (stop the API to test), success toasts on every mutation, and confirmation
  dialogs for all deletes.
- **Responsive:** verify 375px (sidebar becomes drawer, cards stack), 768px, and 1280px.
- **Dark mode:** toggle in the topbar; check contrast of tables, badges and charts.

## Performance

- Dashboard aggregates everything in one API round-trip; verify < 2s on seeded data.
- Lists are paginated server-side (max 100/page) and keyed by filters for cache reuse
  (TanStack Query `keepPreviousData`).
- Route-level code splitting: confirm in devtools that e.g. `ReportsPage-*.js` loads only when
  visiting Reports, and `charts`/`excel` chunks load on demand.
