# Meal Planner — Reminders & Deploy (Plan 6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. Start by creating a feature branch (e.g. `feat/reminders-deploy`) off `main`; do NOT commit directly to `main`.

**Goal:** Ship the meal-planner to production on Vercel (Vite PWA + the existing Hono backend as serverless functions, same origin) and add the reminder loop: an evening "plan tomorrow" and a morning "cook today" web-push ping delivered at each household's local times.

**Architecture:** One Vercel project. `api/[[...route]].ts` runs the existing Hono app via `hono/vercel`. The service worker switches to `injectManifest` so it can host push handlers. Subscriptions are stored per-device in Supabase. Scheduling lives in Supabase `pg_cron` (Vercel Hobby cron is once/day — unusable); every 5 minutes `pg_cron` + `pg_net` POST to a secret-guarded Hono route that finds households whose local time matches a reminder slot and sends web-push (Node `web-push` lib), pruning dead subscriptions.

**Tech Stack (already in place):** React 19 + TS + Vite PWA, Tailwind v3 (pinned 3.4.19), `@supabase/supabase-js` 2, `zod` 4, `react-router-dom` 7, Hono 4, `@hono/node-server` (local dev only), `vite-plugin-pwa` 1.3. Frontend tsconfig is `tsconfig.app.json`; server is typechecked via `npm run typecheck:server`.

> **Conventions to match:** Supabase results cast to expected shapes (no generated DB types). Default exports for route screens; named exports for lib modules. Secrets in committed files use placeholders (`[REDACTED]`). Verify each task with `npx tsc -b` (frontend) and `npm run typecheck:server` (server) where relevant. Migrations are committed artifacts applied manually in the Supabase dashboard. User prefers **no TDD** — implement directly; verify with type-check, build, and manual testing. The iOS push path is **device-only** and is verified after deploy.

---

## File Structure

```
api/
└── [[...route]].ts                          # NEW — Vercel adapter wrapping the Hono app
vercel.json                                  # NEW — routing + PWA cache headers
src/
├── sw.ts                                     # NEW — custom service worker (push handlers)
├── lib/
│   ├── push.ts                               # NEW — client subscribe/unsubscribe
│   └── settingsData.ts                       # NEW — update reminder settings
├── routes/
│   └── Settings.tsx                          # NEW — enable reminders, times, timezone, sign out
├── main.tsx                                  # MODIFY — register service worker
├── App.tsx                                   # MODIFY — add /settings route
├── routes/Today.tsx                          # MODIFY — gear link, remove inline sign-out
└── lib/recipeImport.ts                       # MODIFY — same-origin default (empty base)
server/src/
├── supabaseClients.ts                        # NEW — anon (token-scoped) + service-role factories
├── auth.ts                                   # MODIFY — reuse supabaseClients
├── push.ts                                   # NEW — web-push sender (VAPID, send, prune)
├── reminders.ts                              # NEW — due-slot logic + cron handler
├── subscribe.ts                              # NEW — /push/subscribe handler
└── app.ts                                    # MODIFY — basePath('/api'), dev-only CORS, new routes
supabase/migrations/
├── 0006_push_reminders.sql                   # NEW — push_subscriptions, reminder_log, timezone
└── 0007_cron_schedule.sql                    # NEW — pg_cron + pg_net (manual apply)
vite.config.ts                                # MODIFY — injectManifest strategy
tsconfig.app.json                             # MODIFY — WebWorker lib for the SW
.env.example / server/.env.example            # MODIFY — document new keys (placeholders)
package.json                                  # MODIFY — add web-push, @types/web-push, workbox-precaching
```

---

## Task 1: Migration `0006_push_reminders.sql`

**Files:** Create `supabase/migrations/0006_push_reminders.sql`.

- [ ] **Step 1: Write the migration**

```sql
-- Per-device web-push subscriptions
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);

create index push_subscriptions_household_idx on push_subscriptions (household_id);

alter table push_subscriptions enable row level security;

create policy "push_subscriptions read" on push_subscriptions for select
  using (household_id = current_household_id());
create policy "push_subscriptions insert" on push_subscriptions for insert
  with check (household_id = current_household_id());
create policy "push_subscriptions update" on push_subscriptions for update
  using (household_id = current_household_id());
create policy "push_subscriptions delete" on push_subscriptions for delete
  using (household_id = current_household_id());

-- Idempotency log so each reminder fires at most once per household/slot/day
create table reminder_log (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  slot text not null check (slot in ('evening', 'morning')),
  sent_on date not null,
  created_at timestamptz not null default now(),
  unique (household_id, slot, sent_on)
);

create index reminder_log_household_idx on reminder_log (household_id, sent_on);

alter table reminder_log enable row level security;

create policy "reminder_log read" on reminder_log for select
  using (household_id = current_household_id());
-- Inserts/cleanup happen via the service-role key from the cron route (bypasses RLS).

-- Household timezone (IANA name) drives local reminder times
alter table household_settings add column timezone text not null default 'UTC';
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0006_push_reminders.sql
git commit -m "feat: push_subscriptions, reminder_log, household timezone"
```

---

## Task 2: Switch PWA to injectManifest + custom service worker

**Files:** Modify `vite.config.ts`, `tsconfig.app.json`, `src/main.tsx`, `package.json`; create `src/sw.ts`.

- [ ] **Step 1: Add `workbox-precaching` as an explicit devDependency**

In `package.json`, add to `devDependencies` (keep alphabetical-ish ordering near the other workbox/vite entries):

```json
    "workbox-precaching": "^7.3.0",
```

Then run:

```bash
npm install
```

Expected: installs cleanly (workbox-precaching is already present transitively via vite-plugin-pwa; this pins it as a direct dep).

- [ ] **Step 2: Switch vite-plugin-pwa to injectManifest**

Replace the `VitePWA({...})` block in `vite.config.ts` with:

```ts
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      manifest: false, // we supply public/manifest.webmanifest manually
      injectManifest: {
        // precache the built app shell; navigateFallback handled in sw.ts
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
      },
      devOptions: { enabled: false, type: 'module' },
    }),
```

- [ ] **Step 3: Create `src/sw.ts`**

```ts
/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching'
import type { PrecacheEntry } from 'workbox-precaching'

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<PrecacheEntry | string>
}

// Precache the app shell injected at build time.
precacheAndRoute(self.__WB_MANIFEST)

interface PushPayload {
  title: string
  body: string
  url: string
}

self.addEventListener('push', (event: PushEvent) => {
  let payload: PushPayload = { title: 'Meal Planner', body: '', url: '/' }
  try {
    if (event.data) payload = { ...payload, ...(event.data.json() as Partial<PushPayload>) }
  } catch {
    if (event.data) payload.body = event.data.text()
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: payload.url },
    }),
  )
})

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close()
  const url = (event.notification.data as { url?: string } | undefined)?.url ?? '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          void client.focus()
          if ('navigate' in client) void (client as WindowClient).navigate(url)
          return
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})

// When the subscription rotates, re-subscribe locally. We do NOT POST from here:
// the service worker has no Supabase JWT, and /api/push/subscribe requires auth.
// The client re-syncs the (possibly new) subscription via enablePush() — which is
// idempotent (getSubscription reuse + upsert-on-endpoint) — next time the app opens.
self.addEventListener('pushsubscriptionchange', (event: Event) => {
  const e = event as ExtendableEvent & {
    oldSubscription?: PushSubscription
    newSubscription?: PushSubscription
  }
  const applicationServerKey = e.oldSubscription?.options?.applicationServerKey ?? undefined
  if (e.newSubscription || !applicationServerKey) return
  event.waitUntil(
    self.registration.pushManager
      .subscribe({ userVisibleOnly: true, applicationServerKey })
      .then(() => undefined)
      .catch(() => undefined),
  )
})
```

- [ ] **Step 4: Add the WebWorker lib to `tsconfig.app.json`**

Change the `lib` line so the service worker types resolve:

```json
    "lib": ["ES2023", "DOM", "DOM.Iterable", "WebWorker"],
```

- [ ] **Step 5: Register the service worker in `src/main.tsx`**

Replace the whole file with:

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './index.css'

registerSW({ immediate: true })

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>,
)
```

- [ ] **Step 6: Verify** — Run `npx tsc -b` then `npm run build`.

Expected: type-check passes; build emits `dist/sw.js` (injectManifest compiled the SW). If tsc reports `Cannot find module 'virtual:pwa-register'`, confirm `vite-plugin-pwa/client` types are picked up via `"types": ["vite/client"]` in `tsconfig.app.json` — vite-plugin-pwa augments `vite/client`, so no extra type ref is needed. If it still errors, add `/// <reference types="vite-plugin-pwa/client" />` at the top of `src/main.tsx`.

- [ ] **Step 7: Commit**

```bash
git add vite.config.ts tsconfig.app.json src/main.tsx src/sw.ts package.json package-lock.json
git commit -m "feat: injectManifest service worker with push handlers + SW registration"
```

---

## Task 3: Vercel deploy config (adapter, routing, same-origin)

**Files:** Create `api/[[...route]].ts`, `vercel.json`; modify `server/src/app.ts`, `src/lib/recipeImport.ts`, `.env.example`, `server/.env.example`.

- [ ] **Step 1: Align Hono to `basePath('/api')` and make CORS dev-only**

Replace `server/src/app.ts` with:

```ts
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { handleImport } from './importHandler'
import { verifySupabaseToken } from './auth'
import { ImportError } from './errors'
import { handleSubscribe } from './subscribe'
import { handleCronReminders } from './reminders'

export const app = new Hono().basePath('/api')

// CORS is only needed for the split local-dev setup (frontend :5173 → server :8787).
// In production the app is same-origin, so this is a no-op.
const allowedOrigin = process.env.ALLOWED_ORIGIN
if (allowedOrigin) {
  app.use('*', cors({
    origin: allowedOrigin,
    allowHeaders: ['authorization', 'content-type'],
    allowMethods: ['POST', 'GET', 'OPTIONS'],
  }))
}

app.get('/health', (c) => c.json({ ok: true }))

app.post('/import-recipe', async (c) => {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return c.json({ error: 'Server is missing OPENAI_API_KEY' }, 500)

  const authz = c.req.header('authorization') ?? ''
  const token = authz.startsWith('Bearer ') ? authz.slice(7) : ''
  const userId = await verifySupabaseToken(token)
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)

  try {
    const body = await c.req.json().catch(() => null)
    return c.json(await handleImport(body, apiKey))
  } catch (err) {
    if (err instanceof ImportError) return c.json({ error: err.message }, err.status as ContentfulStatusCode)
    return c.json({ error: 'Import failed' }, 500)
  }
})

app.post('/push/subscribe', handleSubscribe)
app.post('/cron/reminders', handleCronReminders)
```

> Note: routes are now relative to the `/api` basePath, so they resolve to `/api/health`, `/api/import-recipe`, `/api/push/subscribe`, `/api/cron/reminders`. `handleSubscribe` and `handleCronReminders` are created in Tasks 6 and 7; this task will not type-check until those exist, so commit this task AFTER Task 7 (the build verification is in Task 7). Create the files in order but verify at Task 7.

Actually, to keep each task independently verifiable, add temporary stubs now and replace them later:

Create `server/src/subscribe.ts`:

```ts
import type { Context } from 'hono'

export async function handleSubscribe(c: Context) {
  return c.json({ error: 'not implemented' }, 501)
}
```

Create `server/src/reminders.ts`:

```ts
import type { Context } from 'hono'

export async function handleCronReminders(c: Context) {
  return c.json({ error: 'not implemented' }, 501)
}
```

These stubs are fully replaced in Tasks 6 and 7.

- [ ] **Step 2: Create the Vercel adapter `api/[[...route]].ts`**

```ts
import { handle } from 'hono/vercel'
import { app } from '../server/src/app'

export const GET = handle(app)
export const POST = handle(app)
export const OPTIONS = handle(app)
```

- [ ] **Step 3: Create `vercel.json`**

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

- [ ] **Step 4: Make `recipeImport.ts` default to same-origin**

In `src/lib/recipeImport.ts`, replace lines 12-13:

```ts
  const api = import.meta.env.VITE_IMPORT_API_URL as string | undefined
  if (!api) throw new Error('Import is not configured (VITE_IMPORT_API_URL missing)')
```

with:

```ts
  // Empty/unset base => same-origin (production on Vercel). Local dev sets it to http://localhost:8787.
  const api = (import.meta.env.VITE_IMPORT_API_URL as string | undefined) ?? ''
```

(The `fetch(\`${api}/api/import-recipe\`)` call then yields `/api/import-recipe` when `api` is empty.)

- [ ] **Step 5: Document new env vars**

Replace `.env.example` with:

```bash
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=[REDACTED_PUBLISHABLE_KEY]

# Base URL of the AI-import backend (Hono server).
# Local dev: http://localhost:8787 (separate server). Production on Vercel: leave EMPTY for same-origin.
VITE_IMPORT_API_URL=http://localhost:8787

# Public VAPID key for Web Push (safe to expose). Generate with: npx web-push generate-vapid-keys
VITE_VAPID_PUBLIC_KEY=[REDACTED_VAPID_PUBLIC_KEY]

# Optional — only needed for running DB migrations via the Supabase CLI.
# DATABASE_URL=postgresql://postgres:[REDACTED]@db.YOUR_PROJECT_REF.supabase.co:5432/postgres
```

Replace `server/.env.example` with:

```bash
# OpenAI key used server-side only (never sent to the browser)
OPENAI_API_KEY=[REDACTED]
# Supabase project — used to verify the caller's access token
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=[REDACTED_PUBLISHABLE_KEY]
# Service-role key — used by the cron route to read across households and write reminder_log.
# SECRET. Never expose to the browser.
SUPABASE_SERVICE_ROLE_KEY=[REDACTED_SERVICE_ROLE_KEY]
# Web Push VAPID keypair (generate with: npx web-push generate-vapid-keys)
VAPID_PUBLIC_KEY=[REDACTED_VAPID_PUBLIC_KEY]
VAPID_PRIVATE_KEY=[REDACTED_VAPID_PRIVATE_KEY]
VAPID_SUBJECT=mailto:you@example.com
# Shared secret guarding POST /api/cron/reminders (pg_cron must send it in x-cron-secret)
CRON_SECRET=[REDACTED_CRON_SECRET]
# Local dev only
PORT=8787
ALLOWED_ORIGIN=http://localhost:5173
```

- [ ] **Step 6: Verify** — Run `npm run typecheck:server` and `npx tsc -b`.

Expected: both pass (subscribe/reminders stubs satisfy the imports). `npm run build` should still succeed.

- [ ] **Step 7: Commit**

```bash
git add api/ vercel.json server/src/app.ts server/src/subscribe.ts server/src/reminders.ts src/lib/recipeImport.ts .env.example server/.env.example
git commit -m "feat: Vercel adapter, same-origin routing, env docs, route stubs"
```

---

## Task 4: Dependencies + server Supabase client factory

**Files:** Modify `package.json`; create `server/src/supabaseClients.ts`; modify `server/src/auth.ts`.

- [ ] **Step 1: Add server push dependencies**

In `package.json`, add to `dependencies`:

```json
    "web-push": "^3.6.7",
```

and to `devDependencies`:

```json
    "@types/web-push": "^3.6.4",
```

Then:

```bash
npm install
```

- [ ] **Step 2: Create `server/src/supabaseClients.ts`**

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const anonKey = process.env.SUPABASE_ANON_KEY

if (!url || !anonKey) throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY env')

// Anonymous client (no user context) — used only for token verification.
export const anonClient: SupabaseClient = createClient(url, anonKey)

// A client scoped to a specific user's JWT, so RLS policies apply as that user.
export function clientForToken(token: string): SupabaseClient {
  return createClient(url!, anonKey!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

// Service-role client — bypasses RLS. Used ONLY by the cron route (server-side, trusted).
// Throws lazily so dev without the key still runs non-cron routes.
export function serviceClient(): SupabaseClient {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY env')
  return createClient(url!, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
}
```

- [ ] **Step 3: Refactor `server/src/auth.ts` to reuse the anon client and drop the key logging**

Replace `server/src/auth.ts` with:

```ts
import { anonClient } from './supabaseClients'

// Verifies a Supabase access token and returns the user id, or null if invalid.
export async function verifySupabaseToken(token: string): Promise<string | null> {
  if (!token) return null
  const { data, error } = await anonClient.auth.getUser(token)
  if (error || !data.user) return null
  return data.user.id
}
```

- [ ] **Step 4: Verify** — Run `npm run typecheck:server`.

Expected: passes. (`@types/web-push` is unused until Task 5 but installing it now is fine.)

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json server/src/supabaseClients.ts server/src/auth.ts
git commit -m "feat: add web-push deps and Supabase client factories (anon/token/service)"
```

---

## Task 5: Web-push sender module

**Files:** Create `server/src/push.ts`.

- [ ] **Step 1: Create `server/src/push.ts`**

```ts
import webpush from 'web-push'

export interface StoredSubscription {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

export interface PushPayload {
  title: string
  body: string
  url: string
}

let configured = false

function ensureConfigured(): boolean {
  if (configured) return true
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT
  if (!publicKey || !privateKey || !subject) return false
  webpush.setVapidDetails(subject, publicKey, privateKey)
  configured = true
  return true
}

export interface SendResult {
  sent: number
  deadSubscriptionIds: string[]
}

// Sends a payload to every subscription; returns ids of subscriptions that are gone (404/410).
export async function sendToSubscriptions(
  subs: StoredSubscription[],
  payload: PushPayload,
): Promise<SendResult> {
  if (!ensureConfigured()) throw new Error('VAPID env not configured')
  const body = JSON.stringify(payload)
  const dead: string[] = []
  let sent = 0

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
        )
        sent += 1
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) dead.push(s.id)
        // other errors (429/5xx) are transient — leave the subscription in place
      }
    }),
  )

  return { sent, deadSubscriptionIds: dead }
}
```

- [ ] **Step 2: Verify** — Run `npm run typecheck:server`.

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add server/src/push.ts
git commit -m "feat: web-push sender with VAPID config and dead-subscription detection"
```

---

## Task 6: Subscribe route + client subscription library

**Files:** Replace `server/src/subscribe.ts`; create `src/lib/push.ts`.

- [ ] **Step 1: Replace `server/src/subscribe.ts` with the real handler**

```ts
import type { Context } from 'hono'
import { verifySupabaseToken } from './auth'
import { clientForToken, serviceClient } from './supabaseClients'

interface SubscribeBody {
  endpoint?: string
  keys?: { p256dh?: string; auth?: string }
}

export async function handleSubscribe(c: Context) {
  const authz = c.req.header('authorization') ?? ''
  const token = authz.startsWith('Bearer ') ? authz.slice(7) : ''
  const userId = await verifySupabaseToken(token)
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)

  const body = (await c.req.json().catch(() => null)) as SubscribeBody | null
  if (!body?.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    return c.json({ error: 'Invalid subscription' }, 400)
  }

  // Resolve the caller's household via their JWT (RLS applies → only their own profile).
  const userClient = clientForToken(token)
  const { data: profile, error: profileErr } = await userClient
    .from('profiles').select('household_id').eq('id', userId).single()
  const householdId = (profile as { household_id: string | null } | null)?.household_id
  if (profileErr || !householdId) return c.json({ error: 'No household' }, 400)

  // Upsert per-device (endpoint is unique). Use service role so an endpoint that moved
  // between users/households is reassigned cleanly.
  const svc = serviceClient()
  const { error } = await svc.from('push_subscriptions').upsert(
    {
      household_id: householdId,
      user_id: userId,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      last_seen: new Date().toISOString(),
    },
    { onConflict: 'endpoint' },
  )
  if (error) return c.json({ error: 'Failed to save subscription' }, 500)

  return c.json({ ok: true })
}
```

- [ ] **Step 2: Create `src/lib/push.ts` (client)**

```ts
import { supabase } from './supabase'

export type PushState = 'unsupported' | 'needs-install' | 'denied' | 'default' | 'granted'

export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export function isStandalone(): boolean {
  const mql = window.matchMedia('(display-mode: standalone)').matches
  const iosStandalone = (navigator as unknown as { standalone?: boolean }).standalone === true
  return mql || iosStandalone
}

export async function getPushState(): Promise<PushState> {
  if (!isPushSupported()) {
    // On iOS, PushManager only exists once installed to the Home Screen.
    return isStandalone() ? 'unsupported' : 'needs-install'
  }
  if (Notification.permission === 'denied') return 'denied'
  if (Notification.permission === 'granted') return 'granted'
  return 'default'
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

// MUST be called from a user gesture (tap). Returns true if subscribed.
export async function enablePush(): Promise<boolean> {
  if (!isPushSupported()) return false
  const vapid = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined
  if (!vapid) throw new Error('Push is not configured (VITE_VAPID_PUBLIC_KEY missing)')

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return false

  const registration = await navigator.serviceWorker.ready
  const existing = await registration.pushManager.getSubscription()
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapid),
    }))

  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) throw new Error('You must be signed in to enable reminders')

  const res = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(subscription.toJSON()),
  })
  if (!res.ok) throw new Error('Failed to register for reminders')
  return true
}
```

- [ ] **Step 3: Verify** — Run `npm run typecheck:server` and `npx tsc -b`.

Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add server/src/subscribe.ts src/lib/push.ts
git commit -m "feat: push subscribe route (RLS-aware) and client subscription lib"
```

---

## Task 7: Cron reminders route + due-slot logic

**Files:** Replace `server/src/reminders.ts`.

- [ ] **Step 1: Replace `server/src/reminders.ts` with the real handler + pure helpers**

```ts
import type { Context } from 'hono'
import { serviceClient } from './supabaseClients'
import { sendToSubscriptions, type StoredSubscription, type PushPayload } from './push'

export type ReminderSlot = 'evening' | 'morning'

const WINDOW_MIN = 5 // must be >= the pg_cron interval

const PAYLOADS: Record<ReminderSlot, PushPayload> = {
  evening: { title: "Plan tomorrow's meals 🍽️", body: "Pick what you'll cook tomorrow.", url: '/plan' },
  morning: { title: 'Time to cook ☀️', body: "Here's today's plan.", url: '/' },
}

interface HouseholdRow {
  household_id: string
  timezone: string
  evening_reminder_time: string // 'HH:MM:SS' or 'HH:MM'
  morning_reminder_time: string
}

// Minutes-since-midnight in a given IANA timezone for an absolute instant.
export function localMinutes(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now)
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? '0') % 24
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? '0')
  return h * 60 + m
}

// 'YYYY-MM-DD' local date in a timezone (for the idempotency log).
export function localDate(now: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now)
}

export function parseHHMM(value: string): number {
  const [h, m] = value.split(':')
  return Number(h) * 60 + Number(m)
}

// Returns the slot that is due "now" for this household, or null.
export function dueSlot(now: Date, row: HouseholdRow): ReminderSlot | null {
  const local = localMinutes(now, row.timezone)
  const evening = parseHHMM(row.evening_reminder_time)
  const morning = parseHHMM(row.morning_reminder_time)
  if (local >= evening && local < evening + WINDOW_MIN) return 'evening'
  if (local >= morning && local < morning + WINDOW_MIN) return 'morning'
  return null
}

export async function handleCronReminders(c: Context) {
  const secret = process.env.CRON_SECRET
  if (!secret || c.req.header('x-cron-secret') !== secret) {
    return c.json({ error: 'Forbidden' }, 401)
  }

  const svc = serviceClient()
  const now = new Date()

  const { data: households, error } = await svc
    .from('household_settings')
    .select('household_id, timezone, evening_reminder_time, morning_reminder_time')
  if (error) return c.json({ error: 'Failed to load households' }, 500)

  const rows = (households ?? []) as HouseholdRow[]
  let processed = 0
  let sent = 0
  let pruned = 0

  for (const row of rows) {
    const slot = dueSlot(now, row)
    if (!slot) continue
    const sentOn = localDate(now, row.timezone)

    // Idempotency: claim the (household, slot, day) by inserting the log row first.
    const { error: logErr } = await svc
      .from('reminder_log')
      .insert({ household_id: row.household_id, slot, sent_on: sentOn })
    if (logErr) continue // unique violation => already sent today; skip

    processed += 1

    const { data: subsData } = await svc
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('household_id', row.household_id)
    const subs = (subsData ?? []) as StoredSubscription[]
    if (subs.length === 0) continue

    const result = await sendToSubscriptions(subs, PAYLOADS[slot])
    sent += result.sent
    if (result.deadSubscriptionIds.length > 0) {
      await svc.from('push_subscriptions').delete().in('id', result.deadSubscriptionIds)
      pruned += result.deadSubscriptionIds.length
    }
  }

  return c.json({ processed, sent, pruned })
}
```

> **Design note (idempotency):** the log row is inserted *before* sending and the unique constraint `(household_id, slot, sent_on)` makes concurrent/duplicate cron runs no-op. If a send later fails transiently, that day's slot won't retry — acceptable for a reminder (the next slot/day still fires). This deliberately favors "never double-notify" over "guaranteed delivery."

- [ ] **Step 2: Verify** — Run `npm run typecheck:server` and `npx tsc -b`, then `npm run build`.

Expected: all pass; `dist/` builds with `sw.js`.

- [ ] **Step 3: Commit**

```bash
git add server/src/reminders.ts
git commit -m "feat: cron reminders route with timezone-aware due-slot matching and idempotency"
```

---

## Task 8: Settings screen + reminder-time editing

**Files:** Create `src/lib/settingsData.ts`, `src/routes/Settings.tsx`; modify `src/App.tsx`, `src/routes/Today.tsx`.

- [ ] **Step 1: Extend the settings type and create the data layer**

In `src/lib/householdDefaults.ts`, add `timezone` to the interface and default. Replace the file with:

```ts
export interface HouseholdSettings {
  target_calories: number
  target_protein: number
  target_fiber: number
  evening_reminder_time: string
  morning_reminder_time: string
  timezone: string
}

export function defaultTargets(): HouseholdSettings {
  return {
    target_calories: 2000,
    target_protein: 90,
    target_fiber: 30,
    evening_reminder_time: '20:00',
    morning_reminder_time: '07:00',
    timezone: 'UTC',
  }
}
```

Update `src/lib/householdDefaults.test.ts` to match (add `timezone: 'UTC'` to the expected object):

```ts
import { describe, it, expect } from 'vitest'
import { defaultTargets } from './householdDefaults'

describe('defaultTargets', () => {
  it('returns sensible family defaults', () => {
    expect(defaultTargets()).toEqual({
      target_calories: 2000,
      target_protein: 90,
      target_fiber: 30,
      evening_reminder_time: '20:00',
      morning_reminder_time: '07:00',
      timezone: 'UTC',
    })
  })
})
```

Create `src/lib/settingsData.ts`:

```ts
import { supabase } from './supabase'

export interface ReminderSettingsInput {
  evening_reminder_time: string
  morning_reminder_time: string
  timezone: string
}

export async function updateReminderSettings(householdId: string, input: ReminderSettingsInput): Promise<void> {
  const { error } = await supabase
    .from('household_settings')
    .update(input)
    .eq('household_id', householdId)
  if (error) throw error
}

export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}
```

- [ ] **Step 2: Create `src/routes/Settings.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useHousehold } from '../context/HouseholdProvider'
import { supabase } from '../lib/supabase'
import { defaultTargets } from '../lib/householdDefaults'
import { updateReminderSettings, browserTimezone } from '../lib/settingsData'
import { enablePush, getPushState, type PushState } from '../lib/push'

// HH:MM:SS or HH:MM -> HH:MM for <input type="time">
function toTimeInput(value: string | undefined): string {
  if (!value) return ''
  return value.slice(0, 5)
}

export default function Settings() {
  const navigate = useNavigate()
  const { householdId, settings, refresh } = useHousehold()
  const base = settings ?? defaultTargets()

  const [evening, setEvening] = useState(toTimeInput(base.evening_reminder_time))
  const [morning, setMorning] = useState(toTimeInput(base.morning_reminder_time))
  const [timezone, setTimezone] = useState(base.timezone && base.timezone !== 'UTC' ? base.timezone : browserTimezone())
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [pushState, setPushState] = useState<PushState>('default')
  const [pushBusy, setPushBusy] = useState(false)
  const [pushMsg, setPushMsg] = useState<string | null>(null)

  useEffect(() => { void getPushState().then(setPushState) }, [])

  async function handleSave() {
    if (!householdId) return
    setSaving(true); setError(null); setSaved(false)
    try {
      await updateReminderSettings(householdId, {
        evening_reminder_time: evening, morning_reminder_time: morning, timezone,
      })
      await refresh()
      setSaved(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleEnablePush() {
    setPushBusy(true); setPushMsg(null)
    try {
      const ok = await enablePush()
      setPushMsg(ok ? 'Reminders enabled on this device.' : 'Permission was not granted.')
      setPushState(await getPushState())
    } catch (e) {
      setPushMsg(e instanceof Error ? e.message : 'Could not enable reminders')
    } finally {
      setPushBusy(false)
    }
  }

  return (
    <div className="px-4 pt-6 pb-10 space-y-6">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => navigate(-1)} className="text-brand text-xl">←</button>
        <h1 className="text-2xl font-bold text-brand">Settings</h1>
      </div>

      {/* Notifications */}
      <section className="space-y-2">
        <h2 className="text-xs font-bold text-gray-400 uppercase">Reminders</h2>
        {pushState === 'needs-install' ? (
          <p className="text-sm text-gray-500">
            To get reminders on iPhone, tap the Share button in Safari and choose
            <span className="font-semibold"> "Add to Home Screen"</span>, then open the app from your home screen.
          </p>
        ) : pushState === 'unsupported' ? (
          <p className="text-sm text-gray-500">Reminders aren't supported on this device/browser.</p>
        ) : pushState === 'denied' ? (
          <p className="text-sm text-gray-500">Notifications are blocked. Enable them in your browser/OS settings, then return here.</p>
        ) : pushState === 'granted' ? (
          <p className="text-sm text-brand font-semibold">Reminders are enabled on this device. ✓</p>
        ) : (
          <button type="button" onClick={handleEnablePush} disabled={pushBusy}
            className="bg-brand text-white font-bold rounded-xl px-4 py-2 text-sm disabled:opacity-50">
            {pushBusy ? 'Enabling…' : 'Enable reminders'}
          </button>
        )}
        {pushMsg && <p className="text-sm text-gray-500">{pushMsg}</p>}
      </section>

      {/* Reminder times */}
      <section className="space-y-3">
        <h2 className="text-xs font-bold text-gray-400 uppercase">Reminder times</h2>
        <label className="flex items-center justify-between">
          <span className="text-sm text-gray-700">Evening — plan tomorrow</span>
          <input type="time" value={evening} onChange={(e) => setEvening(e.target.value)}
            className="border border-gray-200 rounded-lg px-2 py-1 text-sm" />
        </label>
        <label className="flex items-center justify-between">
          <span className="text-sm text-gray-700">Morning — cook today</span>
          <input type="time" value={morning} onChange={(e) => setMorning(e.target.value)}
            className="border border-gray-200 rounded-lg px-2 py-1 text-sm" />
        </label>
        <label className="flex items-center justify-between gap-2">
          <span className="text-sm text-gray-700">Timezone</span>
          <input type="text" value={timezone} onChange={(e) => setTimezone(e.target.value)}
            placeholder="e.g. America/New_York"
            className="border border-gray-200 rounded-lg px-2 py-1 text-sm flex-1 min-w-0" />
        </label>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        {saved && <p className="text-brand text-sm font-semibold">Saved ✓</p>}
        <button type="button" onClick={handleSave} disabled={saving}
          className="w-full bg-brand text-white font-bold rounded-xl py-2.5 text-sm disabled:opacity-50">
          {saving ? 'Saving…' : 'Save'}
        </button>
      </section>

      {/* Account */}
      <section className="space-y-2 pt-2 border-t border-gray-100">
        <h2 className="text-xs font-bold text-gray-400 uppercase">Account</h2>
        <button type="button" onClick={() => supabase.auth.signOut()}
          className="text-sm text-red-600 font-semibold">Sign out</button>
      </section>
    </div>
  )
}
```

- [ ] **Step 3: Add the `/settings` route in `src/App.tsx`**

Add the import after the other route imports (line 15 area):

```tsx
import Settings from './routes/Settings'
```

Add the route inside the `AppShell` block, after the `pantry` route:

```tsx
                  <Route path="settings" element={<Settings />} />
```

- [ ] **Step 4: Add a ⚙️ link in the Today header and remove the inline sign-out**

In `src/routes/Today.tsx`:

Add to imports (after line 2):

```tsx
import { Link } from 'react-router-dom'
```

Replace the header's sign-out button (lines 72-74) with a settings link:

```tsx
        <Link to="/settings" aria-label="Settings" className="text-2xl leading-none text-gray-400">⚙️</Link>
```

(The `supabase` import on line 3 is still used elsewhere? It is only used by the removed sign-out. Remove the now-unused `import { supabase } from '../lib/supabase'` on line 3 to satisfy `noUnusedLocals`.)

- [ ] **Step 5: Verify** — Run `npx tsc -b`, `npm run test`, and `npm run build`.

Expected: type-check passes, the updated `householdDefaults` test passes, build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/lib/householdDefaults.ts src/lib/householdDefaults.test.ts src/lib/settingsData.ts src/routes/Settings.tsx src/App.tsx src/routes/Today.tsx
git commit -m "feat: Settings screen with enable-reminders, reminder times, timezone"
```

---

## Task 9: Cron schedule SQL artifact

**Files:** Create `supabase/migrations/0007_cron_schedule.sql`.

- [ ] **Step 1: Write the manual-apply SQL**

```sql
-- Applied manually in the Supabase dashboard AFTER the app is deployed and the
-- cron URL + secret are known. Stores secrets in Supabase Vault, then schedules
-- a 5-minute job that POSTs to the Hono cron route.
--
-- Prerequisites (run once):
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 1) Store the deployed cron endpoint and the shared secret in Vault.
--    Replace the values with your real Vercel URL and CRON_SECRET.
--    (Vault upsert pattern; run these selects in the SQL editor.)
select vault.create_secret('https://YOUR_APP.vercel.app/api/cron/reminders', 'reminders_url');
select vault.create_secret('[REDACTED_CRON_SECRET]', 'reminders_secret');

-- 2) Schedule the job: every 5 minutes, POST to the cron route with the secret header.
select cron.schedule(
  'meal-reminders',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- To inspect/cancel later:
--   select * from cron.job;
--   select cron.unschedule('meal-reminders');
--   select * from net._http_response order by created desc limit 20;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0007_cron_schedule.sql
git commit -m "feat: pg_cron + pg_net schedule for reminder dispatch (manual apply)"
```

---

## Task 10: Local end-to-end verification (desktop, pre-deploy)

This verifies the full push chain on the dev machine **without** an iPhone, using desktop Chrome (which supports the same Push API).

- [ ] **Step 1: Generate a real VAPID keypair (local only)**

```bash
npx web-push generate-vapid-keys --json
```

Put the public key in `.env.local` as `VITE_VAPID_PUBLIC_KEY` and in `server/.env` as `VAPID_PUBLIC_KEY`; put the private key in `server/.env` as `VAPID_PRIVATE_KEY`. Add `VAPID_SUBJECT=mailto:you@example.com`, a `CRON_SECRET=<random>`, and `SUPABASE_SERVICE_ROLE_KEY=<from Supabase dashboard>` to `server/.env`. (None of these are committed.)

- [ ] **Step 2: Apply migration 0006** in the Supabase dashboard SQL editor (push_subscriptions, reminder_log, timezone column).

- [ ] **Step 3: Run both servers**

```bash
npm run dev
npm run server
```

- [ ] **Step 4: Subscribe** — In desktop Chrome at the dev URL: sign in, open Settings (⚙️), click **Enable reminders**, accept the permission prompt. Confirm a row appears in `push_subscriptions` (Supabase table editor).

- [ ] **Step 5: Trigger the cron route manually** with a reminder time set to "now":
  - In Settings, set the evening or morning time to the current local minute and your real timezone, Save.
  - POST to the cron route:

```bash
curl -X POST http://localhost:8787/api/cron/reminders -H "x-cron-secret: <CRON_SECRET>" -H "content-type: application/json" -d "{}"
```

  Expected JSON like `{"processed":1,"sent":1,"pruned":0}` and a desktop notification appears. Clicking it focuses the app at the right route. A second immediate call returns `{"processed":0,...}` (idempotency).

- [ ] **Step 6: Confirm** there are no console/service-worker errors (Chrome DevTools → Application → Service Workers shows `sw.js` activated).

No commit (verification only). If anything fails, fix the relevant task's code before proceeding to deploy.

---

## Post-Implementation: Deploy & device test

After all tasks pass and `feat/reminders-deploy` is merged to `main`:

1. **Apply migration 0006** in Supabase (if not already done in Task 10).
2. **Deploy to Vercel:**
   - Import the GitHub repo at vercel.com → New Project. Framework preset: **Vite**. Build: `npm run build`. Output: `dist`.
   - Set environment variables (Production + Preview):
     - Server (secret): `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `CRON_SECRET`.
     - Client (public): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_VAPID_PUBLIC_KEY`. Set `VITE_IMPORT_API_URL` to empty (or omit) for same-origin.
   - Deploy. Confirm the live URL serves the app and `GET /api/health` returns `{"ok":true}`.
3. **Apply migration 0007** (cron schedule) in Supabase, replacing the Vault URL with the real `https://<app>.vercel.app/api/cron/reminders` and the real `CRON_SECRET`.
4. **iPhone (device-only) test:**
   - Open the Vercel URL in iOS Safari (iOS 16.4+) → Share → **Add to Home Screen** → launch from the home screen.
   - Settings (⚙️) → **Enable reminders** → accept permission.
   - Set a reminder time a few minutes ahead, Save; wait for the pg_cron tick (≤5 min) and confirm the notification arrives and deep-links correctly.
5. **Verify** `npx tsc -b`, `npm run typecheck:server`, and `npm run build` are all clean.
6. Update the roadmap memory: Plan 6 done — app live.
```
