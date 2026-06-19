# Reminders & Deploy — Design Spec (Plan 6)

**Date:** 2026-06-19
**Status:** Approved
**Prerequisite:** Plans 1–5 merged

---

## 1. Goal

Take the meal-planner to production on Vercel (static PWA frontend + the existing Hono backend as serverless functions, same origin) and add the reminder loop: an evening "plan tomorrow" web-push ping and a morning "cook today" ping, delivered at each household's configured local times via the iOS-installed PWA.

This is the final milestone. After it, the app is live, installable on iPhone, and self-driving via reminders.

---

## 2. Key Constraints (from research)

- **iOS web push** works only for a PWA **added to the Home Screen** on **iOS 16.4+**, over **HTTPS**, with permission requested **from a user gesture**. No Apple Developer account needed — standard W3C Push API + VAPID.
- **vite-plugin-pwa must use `injectManifest`** to host custom `push`/`notificationclick` handlers (the current `generateSW` strategy cannot).
- **Vercel Hobby cron is once-per-day with ±59-min jitter** — unusable for 07:00/20:00 per-household reminders. Scheduling must live in **Supabase `pg_cron`** (1-minute granularity, free tier).
- The Node **`web-push`** library runs on Vercel's Node runtime (it does **not** run in Deno), so the push **sender lives in the Hono backend** on Vercel; `pg_cron` + `pg_net` trigger it.
- Push subscriptions are **per-device** (one user → many devices), pruned on HTTP **404/410**.
- Testing the iOS push path **requires a real iPhone against the live HTTPS URL** — it cannot be verified on the Windows dev machine. Therefore **deploy ships first**.

---

## 3. Architecture

```
                 Supabase (Postgres)
                 ┌───────────────────────────────┐
                 │ pg_cron  ── every 5 min ──┐    │
                 │                           ▼    │
                 │  pg_net.http_post ──────────────────┐
                 └───────────────────────────────┘     │  x-cron-secret
                                                        ▼
   iPhone PWA  ───subscribe──►  Vercel (one project)  /api/cron/reminders
   (Home screen)               ┌────────────────────────────────────┐
        ▲                      │  Vite static build  (dist/, CDN)    │
        │  web-push (HTTPS)    │  api/[[...route]].ts → Hono app     │
        └──────────────────────┤    /api/import-recipe (existing)   │
                               │    /api/push/subscribe (new)        │
                               │    /api/cron/reminders  (new)       │
                               └────────────────────────────────────┘
```

- **One Vercel project**, same origin → no CORS in production. Static assets from `dist/` via CDN; `api/` runs the Hono app as a serverless function.
- **Scheduling** is in Supabase (`pg_cron`); **sending** is in Hono (Node `web-push`). `pg_net` bridges them with a shared secret.

---

## 4. Part A — Production Deploy

### 4.1 Hono on Vercel
- New file `api/[[...route]].ts`:
  ```ts
  import { handle } from 'hono/vercel'
  import { app } from '../server/src/app'
  export const GET = handle(app)
  export const POST = handle(app)
  export const OPTIONS = handle(app)
  ```
- `server/src/app.ts`: set `new Hono().basePath('/api')` and **trim routes** to `/health`, `/import-recipe` (so they resolve to `/api/health`, `/api/import-recipe`). Avoids the double-`/api` 404 trap.
- CORS: make the `cors()` middleware **dev-only** (apply only when not on Vercel / when `ALLOWED_ORIGIN` is set), since production is same-origin. `server/src/index.ts` (the `@hono/node-server` adapter) stays for local dev only.

### 4.2 vercel.json (repo root)
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api" },
    { "source": "/(.*)", "destination": "/index.html" }
  ],
  "headers": [
    { "source": "/sw.js", "headers": [{ "key": "Cache-Control", "value": "public, max-age=0, must-revalidate" }] },
    { "source": "/(.*).html", "headers": [{ "key": "Cache-Control", "value": "public, max-age=0, must-revalidate" }] },
    { "source": "/manifest.webmanifest", "headers": [{ "key": "Content-Type", "value": "application/manifest+json" }] },
    { "source": "/assets/(.*)", "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] }
  ]
}
```
API rewrite **before** the SPA fallback. Never long-cache `sw.js`.

### 4.3 Service worker registration
- `main.tsx` currently never registers the SW. With `injectManifest` (Part B), register via `virtual:pwa-register` (`registerSW({ immediate: true })`).

### 4.4 Same-origin client
- Set `VITE_IMPORT_API_URL=""` in production so `src/lib/recipeImport.ts` calls `/api/import-recipe` on its own origin. (Confirm the code yields `/api/import-recipe` when the base is empty.)

### 4.5 Environment variables
**Vercel dashboard (Production + Preview):**
- Server secrets (unprefixed, runtime): `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (new — cron reads across households), `VAPID_PRIVATE_KEY` (new), `VAPID_SUBJECT` (new, `mailto:`), `CRON_SECRET` (new).
- Client build vars (public, baked into bundle): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_VAPID_PUBLIC_KEY` (new), `VITE_IMPORT_API_URL=""`.

All committed files use placeholders (`[REDACTED]`); `.env.example` and `server/.env.example` document every key.

---

## 5. Part B — Web Push

### 5.1 Migration `0006_push_reminders.sql`
- **`push_subscriptions`**: `id` uuid PK; `household_id` uuid FK→households cascade; `user_id` uuid FK→auth.users; `endpoint` text **unique**; `p256dh` text; `auth` text; `created_at`; `last_seen`. RLS via `current_household_id()` for read/insert/delete; insert/update upsert on `endpoint`.
- **`reminder_log`**: `id` uuid PK; `household_id` uuid FK cascade; `slot` text check (`evening`,`morning`); `sent_on` date; unique `(household_id, slot, sent_on)`. RLS read for household; writes happen via service-role from the cron route (bypasses RLS).
- **`household_settings.timezone`**: `add column timezone text not null default 'UTC'` (IANA name).

### 5.2 vite-plugin-pwa → injectManifest
- `vite.config.ts`: `strategies: 'injectManifest'`, `srcDir: 'src'`, `filename: 'sw.ts'`, keep `registerType: 'autoUpdate'`, keep manual manifest.
- Add devDeps: `workbox-precaching`, `workbox-core` (as needed).
- `src/sw.ts`:
  - `precacheAndRoute(self.__WB_MANIFEST)` (preserves PWA caching).
  - `push` handler → `showNotification(title, { body, icon, badge, data: { url } })` inside `event.waitUntil`.
  - `notificationclick` handler → focus existing client or `clients.openWindow(url)`.
  - `pushsubscriptionchange` → re-subscribe and re-POST.
- tsconfig: add `WebWorker` lib for the SW; type `self` as `ServiceWorkerGlobalScope`.

### 5.3 VAPID keys
- Generate once: `npx web-push generate-vapid-keys --json`.
- Public → `VITE_VAPID_PUBLIC_KEY`; private → `VAPID_PRIVATE_KEY` (server only). Document in `.env.example`.

### 5.4 Client subscription (`src/lib/push.ts`)
- `isPushSupported()`: `'serviceWorker' in navigator && 'PushManager' in window`.
- `isStandalone()`: `window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone`.
- `urlBase64ToUint8Array(base64)` helper.
- `subscribeToPush()`: **called from a tap handler** → `Notification.requestPermission()` → `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })` → POST `subscription.toJSON()` to `/api/push/subscribe` with the Supabase access token.
- `getSubscriptionState()`: returns current permission + whether already subscribed.

### 5.5 Hono `POST /api/push/subscribe`
- Auth via existing Supabase token verification (`server/src/auth.ts`).
- Body: `{ endpoint, keys: { p256dh, auth } }`.
- Upsert into `push_subscriptions` on conflict(`endpoint`), setting `household_id` (from the user's profile), `user_id`, `last_seen = now()`.

---

## 6. Part C — Scheduling engine

### 6.1 Hono `POST /api/cron/reminders`
- **Guard**: require header `x-cron-secret === process.env.CRON_SECRET`; else 401.
- Use a **service-role** Supabase client (`SUPABASE_SERVICE_ROLE_KEY`) to read across all households.
- Logic:
  1. For each household, compute local time = `now() AT TIME ZONE timezone`.
  2. Determine the "due" slot: `evening` if local time is within the poll window (±5 min) of `evening_reminder_time`; `morning` if within window of `morning_reminder_time`.
  3. Skip if a `reminder_log` row exists for `(household_id, slot, today-local-date)` (idempotency).
  4. Load that household's `push_subscriptions`; send via `web-push` with the slot's payload.
  5. On send rejection with status **404/410**, delete that subscription row.
  6. Insert `reminder_log(household_id, slot, sent_on)`.
- Returns a summary `{ processed, sent, pruned }` (for observability; body not sensitive).
- **Implementation note:** the per-household due-slot match may be done in SQL (a view/function returning due households) or in TS after loading rows. Spec leaves this to the plan; the TS approach is simpler and fine at this scale.

### 6.2 Payloads
- **evening** → `{ title: "Plan tomorrow's meals 🍽️", body: "Pick what you'll cook tomorrow.", url: "/plan" }`
- **morning** → `{ title: "Time to cook ☀️", body: "Here's today's plan.", url: "/" }`

### 6.3 SQL artifact `supabase/migrations/0007_cron_schedule.sql` (applied manually)
- `create extension if not exists pg_cron;`
- `create extension if not exists pg_net;`
- Store the Vercel cron URL + `CRON_SECRET` in Supabase Vault.
- `cron.schedule('meal-reminders', '*/5 * * * *', $$ select net.http_post(url := <vault url>, headers := jsonb_build_object('Content-Type','application/json','x-cron-secret', <vault secret>), body := '{}'::jsonb) $$);`
- Comments document that the dashboard values replace placeholders.

---

## 7. Part D — Settings screen + reminder UI

- New route `src/routes/Settings.tsx`, reachable via a **⚙️ icon in the Today header** (not a 6th bottom tab).
- Sections:
  1. **Notifications** — "Enable reminders" button. If not installed (not standalone) on iOS, show guidance to "Add to Home Screen" first. Shows current state (enabled / blocked / not supported).
  2. **Reminder times** — time pickers for evening + morning, persisted to `household_settings`.
  3. **Timezone** — IANA timezone picker (default `UTC`; offer the browser's `Intl.DateTimeFormat().resolvedOptions().timeZone` as the suggested value), persisted to `household_settings`.
  4. **Sign out** — moved here from the Today header.
- Data layer additions in `src/lib/householdData.ts` (or extend existing): `updateReminderSettings(householdId, { evening_reminder_time, morning_reminder_time, timezone })`.

---

## 8. Testing & Verification

- **Local (Windows):** type-check (`npx tsc -b`), build (`npm run build`), and confirm the SW builds and registers in desktop Chrome (DevTools → Application → Service Workers). Desktop Chrome can also exercise the subscribe flow + a manually-triggered `/api/cron/reminders` (with the secret) end-to-end.
- **Production (iPhone):** after Vercel deploy — open the `*.vercel.app` URL in iOS Safari, **Add to Home Screen**, launch, open Settings → Enable reminders (tap-triggered), accept permission. Trigger the cron route manually (or wait for pg_cron) and confirm the notification arrives and deep-links correctly.
- The plan must clearly mark which steps are **device-only** (cannot be verified on the dev machine).

---

## 9. Files Touched (summary)

```
api/[[...route]].ts                         # NEW — Vercel/Hono adapter
vercel.json                                 # NEW — routing + PWA headers
src/sw.ts                                    # NEW — custom service worker (push handlers)
src/lib/push.ts                              # NEW — client subscription
src/routes/Settings.tsx                      # NEW — settings + enable reminders
supabase/migrations/0006_push_reminders.sql  # NEW — push_subscriptions, reminder_log, timezone
supabase/migrations/0007_cron_schedule.sql   # NEW — pg_cron + pg_net (manual apply)
server/src/app.ts                            # MODIFY — basePath, dev-only CORS, new routes
server/src/push.ts                           # NEW — web-push sender + due-household logic
server/src/cron.ts                           # NEW — /cron/reminders handler (or in app.ts)
server/src/subscribe.ts                      # NEW — /push/subscribe handler (or in app.ts)
vite.config.ts                               # MODIFY — injectManifest strategy
src/main.tsx                                 # MODIFY — registerSW
src/routes/Today.tsx                         # MODIFY — ⚙️ link, remove inline sign-out
src/lib/recipeImport.ts                      # VERIFY/MODIFY — empty base → /api/import-recipe
.env.example / server/.env.example           # MODIFY — document new keys (placeholders)
package.json                                 # MODIFY — add web-push, workbox-* deps
src/App.tsx                                   # MODIFY — add /settings route
```

---

## 10. Out of Scope

- Push for browsers other than the installed iOS PWA (works incidentally on desktop Chrome but not a target).
- Rich notification actions/buttons, images in notifications.
- Per-kid or per-meal granular reminders.
- Retry/backoff queues for failed sends (beyond 404/410 pruning).
- Analytics on notification open rates.
- Multi-timezone per household (one timezone per household).
