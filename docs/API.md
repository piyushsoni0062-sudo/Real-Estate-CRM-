# REST API Reference

Base URL: `http://localhost:4000/api`

- All responses: `{ "success": boolean, "data"?: …, "message"?: string, "details"?: … }`
- List endpoints return `{ items: [...], meta: { total, page, limit, totalPages } }` and accept
  `page`, `limit` (≤100), `search`, `sortBy`, `sortOrder`.
- Authentication: `Authorization: Bearer <accessToken>` (15 min TTL). The refresh token is an
  httpOnly cookie scoped to `/api/auth`; call `POST /auth/refresh` to rotate.
- Authorization: each route requires a `resource:action` permission (or `resource:manage`);
  Super Admin bypasses checks. `403` is returned with the missing permission name.
- Errors: `400` validation (with `details[]`), `401` auth, `403` permission, `404` missing,
  `409` conflict/duplicate, `429` rate limit.

## Auth — `/auth`

| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/auth/login` | `{ mobile, password, rememberMe? }` | rate-limited 20/15min; sets refresh cookie |
| POST | `/auth/refresh` | – | rotates refresh token, returns new access token + user |
| POST | `/auth/logout` | – | revokes current refresh token |
| POST | `/auth/logout-all` 🔒 | – | revokes all sessions |
| GET | `/auth/me` 🔒 | – | current user + permission list |
| POST | `/auth/change-password` 🔒 | `{ currentPassword, newPassword }` | |
| POST | `/auth/forgot-password` | `{ mobile }` | always 200; token via SMTP or server log |
| POST | `/auth/reset-password` | `{ mobile, token, newPassword }` | revokes all sessions |

## Leads — `/leads` (permissions: `leads:*`)

| Method | Path | Notes |
|---|---|---|
| GET | `/leads` | filters: `statusId, sourceId, stageId, assignedToId, projectId, city, from, to, search` |
| GET | `/leads/export` | flat rows (≤5000) for Excel; requires `leads:export` |
| GET | `/leads/check-duplicate?mobile=&excludeId=` | duplicate detection |
| POST | `/leads` | 409 with `duplicateId` if mobile exists |
| POST | `/leads/import` | `{ rows: [{ name, mobile, email?, city?, requirement?, source? }] }` ≤2000; skips invalid/duplicates |
| POST | `/leads/bulk` | `{ ids[], action: assign\|status\|stage\|delete, … }` |
| GET | `/leads/:id` | full detail: timeline, notes, documents, follow-ups, visits, tasks, bookings |
| PATCH | `/leads/:id` | logs status/stage/assignment changes to the timeline |
| DELETE | `/leads/:id` | soft delete |
| POST | `/leads/:id/notes` · DELETE `/leads/:id/notes/:noteId` | |
| POST | `/leads/:id/interactions` | `{ type: CALL\|WHATSAPP\|EMAIL, title, description? }` |
| POST | `/leads/:id/followups` | `{ dueAt, repeat?, notes?, assignedToId? }` |
| PATCH | `/leads/:id/followups/:followUpId` | `status: DONE` auto-creates next occurrence for repeating |

## Pipeline — `/pipeline` (`leads:view/update`, stages: `settings:update`)

| Method | Path | Notes |
|---|---|---|
| GET | `/pipeline` | stages ordered with up to 100 leads each (kanban) |
| POST | `/pipeline/move` | `{ leadId, stageId, lostReason? }` |
| POST/PATCH/DELETE | `/pipeline/stages[/:id]` | custom pipelines; delete blocked while stage has leads |

## Properties & Projects (`properties:*`)

| Method | Path | Notes |
|---|---|---|
| GET/POST | `/properties` | filters: `type, status, projectId, priceMin, priceMax, search` |
| GET/PATCH/DELETE | `/properties/:id` | detail includes price history + bookings; price changes append history |
| GET/POST | `/projects` | includes unit/lead counts |
| GET/PATCH/DELETE | `/projects/:id` | detail includes inventory summary by status |

## Customers — `/customers` (`customers:*`) — standard CRUD, soft delete, 409 on duplicate mobile.

## Site Visits — `/site-visits` (`siteVisits:*`)

| Method | Path | Notes |
|---|---|---|
| GET/POST | `/site-visits` | filters: `status, assignedToId, from, to, search` |
| PATCH | `/site-visits/:id` | status/feedback/reschedule (auto-marks RESCHEDULED) |
| POST | `/site-visits/:id/check-in` | `{ lat, lng }` GPS check-in, once per visit |
| DELETE | `/site-visits/:id` | |

## Bookings — `/bookings` (`bookings:*`)

- `POST /bookings` `{ leadId, propertyId, amount, tokenAmount?, paymentPlan?, notes? }` —
  transactional: creates/reuses customer from lead, sets unit → BOOKED, logs timeline. 409 if the
  unit is already booked/sold.
- `PATCH /bookings/:id` — status changes sync unit availability
  (CANCELLED → AVAILABLE, COMPLETED → SOLD).

## Tasks — `/tasks` (`tasks:*`)

- `GET /tasks` — filters: `status, priority, assignedToId, mine, overdue, search`
- `POST /tasks` — checklist array, repeat interval; assignment notifies the user
- `PATCH /tasks/:id` — completing a repeating task spawns the next occurrence
- `POST /tasks/:id/comments`, `DELETE /tasks/:id`

## Attendance — `/attendance`

| Method | Path | Notes |
|---|---|---|
| GET | `/attendance/me/today` 🔒 | own record |
| POST | `/attendance/check-in` / `check-out` 🔒 | optional `{ lat, lng }`; late after 10:00 |
| GET | `/attendance?date=\|month=YYYY-MM&userId=` | requires `attendance:view` |
| GET/POST | `/attendance/leaves` 🔒 | own leaves; managers see all |
| PATCH | `/attendance/leaves/:id` | `{ status: APPROVED\|REJECTED }` requires `attendance:manage` |

## Dashboard & Reports

- `GET /dashboard` (`dashboard:view`) — all cards, charts and lists in one call.
- `GET /reports/summary?from=&to=` (`reports:view`) — overview, source/status splits, lost
  reasons, employee performance vs target, visit & attendance stats, inventory matrix.

## Notifications — `/notifications` 🔒

- `GET /notifications?unreadOnly=` — includes due follow-ups (next 24h) and overdue task count
- `POST /notifications/read` `{ ids? }` — mark some/all read
- `DELETE /notifications/:id`

## Search — `GET /search?q=` 🔒 — leads, customers, properties, users (permission-aware, 5 each).

## Files — `/uploads` (`files:*`)

- `POST /uploads` — multipart `file` + optional `leadId|propertyId|projectId|customerId|taskId`,
  `title`. Allowed: images, PDF, Excel/CSV, ≤ `MAX_UPLOAD_MB`. Stored on Cloudinary when
  configured, else local `/uploads/*`.
- `DELETE /uploads/:id`

## Settings — `/settings`

- `GET /settings` · `PUT /settings/:key` — JSON key-value (company profile, theme…)
- `GET/POST/PATCH/DELETE /settings/lead-statuses[/:id]` and `/settings/lead-sources[/:id]` —
  system options protected; delete blocked while in use
- `GET/POST/PATCH/DELETE /settings/templates[/:id]` — EMAIL / WHATSAPP templates
- `GET /settings/integrations` · `PATCH /settings/integrations/:key` — enable + config JSON
- `GET/POST /settings/departments`
- `GET /settings/audit-logs?page=&entity=`
- `GET /settings/backup` · `POST /settings/restore` — requires `settings:manage`

## Users & Roles

- `GET/POST /users`, `GET/PATCH/DELETE /users/:id` (`users:*`) — detail includes performance
  stats; delete = soft delete + session revocation; `PATCH /users/me/profile` for self-service.
- `GET /roles` — roles with permissions + full permission catalog
- `POST /roles`, `PATCH /roles/:id` (replace permission set), `DELETE /roles/:id` — system roles
  can't be renamed/deleted; roles with users can't be deleted.

## Inbound webhooks (public, credential-guarded)

All inbound endpoints share one pipeline: mobile validation, duplicate detection (repeat
enquiries are logged on the existing lead instead of duplicated), admin notifications, and —
when the WhatsApp integration is configured — an automatic welcome message logged on the lead
timeline. Rate-limited 120/min.

**Generic (n8n / Zapier / landing pages):**

```
POST /api/webhooks/leads?token=<token from Integrations → Inbound Webhook>
{ "name": "...", "mobile": "98…", "email"?, "city"?, "requirement"?, "source"? }
```

**Facebook Lead Ads** (configure `verifyToken` + `pageAccessToken` in Integrations):

- `GET /api/webhooks/facebook` — Meta verification handshake (`hub.verify_token` must match;
  echoes `hub.challenge`).
- `POST /api/webhooks/facebook` — receives `leadgen` events, fetches full lead data from the
  Graph API with the page access token, and captures it. Always answers 200 fast (Meta retries
  otherwise); fetch failures are logged server-side.

**Google Ads lead forms** (configure `key` in Integrations):

```
POST /api/webhooks/google-ads
{ "google_key": "...", "user_column_data": [{ "column_id": "FULL_NAME|PHONE_NUMBER|EMAIL|CITY", "string_value": "..." }] }
```

`is_test: true` payloads (Google's “Send test data” button) are validated without creating a lead.

## Integration test hooks (🔒 `integrations:update`)

- `POST /api/settings/integrations/smtp/test` `{ to }` — sends a test email via the configured
  SMTP (integration config first, `SMTP_*` env fallback).
- `POST /api/settings/integrations/whatsapp/test` `{ mobile }` — sends a test WhatsApp text via
  the Meta Cloud API (`phoneNumberId` + `accessToken` config).
