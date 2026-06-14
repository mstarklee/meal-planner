# Meal Planner — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up an installable React + TypeScript PWA backed by Supabase, with email auth and a first-time onboarding flow that creates a household with a dynamic number of kids and editable nutrition targets — landing on an app shell with the 5-tab bottom navigation.

**Architecture:** Vite + React + TypeScript single-page PWA. Supabase provides Postgres, Auth, and Row-Level Security. A `HouseholdProvider` React context exposes the signed-in user's household + members to the app. Routing via React Router with an auth guard and an onboarding guard (users without a household are sent to onboarding). Pure, framework-free logic (default nutrition targets, validation) lives in `src/lib/` and is unit-tested with Vitest; UI flows are tested with React Testing Library.

**Tech Stack:** Vite, React 18, TypeScript, React Router, Tailwind CSS, `vite-plugin-pwa`, `@supabase/supabase-js`, Zod, Vitest, `@testing-library/react`, `@testing-library/user-event`.

> **Security note:** Never commit real Supabase keys. All secrets go in `.env.local` (gitignored). Use `[REDACTED]`-style placeholders in `.env.example` and in any docs.

---

## File Structure

```
meal-planner/
├── .env.example                         # placeholder env vars (committed)
├── .env.local                           # real keys (gitignored)
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts                       # Vite + PWA + Vitest config
├── tailwind.config.js
├── postcss.config.js
├── public/
│   ├── manifest.webmanifest             # PWA manifest
│   └── icons/                           # app icons (192,512)
├── supabase/
│   └── migrations/
│       └── 0001_foundation.sql          # households, kids, profiles, settings + RLS
├── src/
│   ├── main.tsx                         # app entry, router mount
│   ├── App.tsx                          # route definitions + guards
│   ├── index.css                        # Tailwind directives + theme tokens
│   ├── lib/
│   │   ├── supabase.ts                  # configured Supabase client
│   │   ├── householdDefaults.ts         # default nutrition targets (pure)
│   │   └── onboardingSchema.ts          # Zod schema for onboarding form (pure)
│   ├── context/
│   │   ├── AuthProvider.tsx             # session state from Supabase auth
│   │   └── HouseholdProvider.tsx        # current household + members
│   ├── components/
│   │   ├── BottomTabBar.tsx             # 5-tab nav
│   │   └── AppShell.tsx                 # layout: <Outlet/> + BottomTabBar
│   ├── routes/
│   │   ├── guards.tsx                   # RequireAuth, RequireHousehold
│   │   ├── Login.tsx                    # sign up / sign in
│   │   ├── Onboarding.tsx               # household + kids + targets
│   │   ├── Today.tsx                    # placeholder screen
│   │   ├── Plan.tsx                     # placeholder screen
│   │   ├── Recipes.tsx                  # placeholder screen
│   │   ├── Shop.tsx                     # placeholder screen
│   │   └── Pantry.tsx                   # placeholder screen
│   └── test/
│       └── setup.ts                     # Vitest + jsdom setup
└── tests are colocated as *.test.ts(x) next to source
```

---

## Task 1: Scaffold the Vite + React + TS project

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/index.css`

- [ ] **Step 1: Scaffold with Vite**

Run from the repo root (the directory already contains `.git` and `docs/`):

```bash
npm create vite@latest . -- --template react-ts
```

If prompted that the directory is not empty, choose **"Ignore files and continue"** (it will not delete `.git`, `docs/`, or `.gitignore`).

- [ ] **Step 2: Install dependencies**

```bash
npm install
npm install react-router-dom @supabase/supabase-js zod
npm install -D tailwindcss postcss autoprefixer vite-plugin-pwa vitest jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom
```

- [ ] **Step 3: Verify the dev server boots**

Run: `npm run dev`
Expected: Vite prints a `localhost` URL and the default page loads without errors. Stop the server (Ctrl+C) after confirming.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite React TS project"
```

---

## Task 2: Configure Tailwind, theme tokens, and base CSS

**Files:**
- Create: `tailwind.config.js`, `postcss.config.js`
- Modify: `src/index.css`

- [ ] **Step 1: Init Tailwind config**

Create `tailwind.config.js`:

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#2e7d52', dark: '#246343', soft: '#eef4ef', mint: '#dfeee4' },
        kid: '#e6a23c',
        cheat: '#c8783a',
      },
    },
  },
  plugins: [],
}
```

Create `postcss.config.js`:

```js
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
}
```

- [ ] **Step 2: Replace `src/index.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root { color-scheme: light; }
body { @apply bg-[#f6f8f4] text-[#1c1c1e] antialiased; }
```

- [ ] **Step 3: Verify Tailwind compiles**

Replace `src/App.tsx` with a minimal probe:

```tsx
export default function App() {
  return <h1 className="text-brand text-2xl font-bold p-4">Meal Planner</h1>
}
```

Run: `npm run dev`
Expected: "Meal Planner" renders in green (`#2e7d52`) bold text. Stop the server.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: add Tailwind and brand theme tokens"
```

---

## Task 3: Configure Vitest

**Files:**
- Create: `src/test/setup.ts`
- Modify: `vite.config.ts`, `package.json`

- [ ] **Step 1: Create the test setup file**

`src/test/setup.ts`:

```ts
import '@testing-library/jest-dom'
```

- [ ] **Step 2: Configure Vite + Vitest + PWA**

Replace `vite.config.ts`:

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false, // we supply public/manifest.webmanifest manually
      workbox: { navigateFallback: '/index.html' },
    }),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
```

- [ ] **Step 3: Add the test script**

In `package.json`, add to `"scripts"`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Add a smoke test**

Create `src/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest'

describe('test harness', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 5: Run the test to verify the harness works**

Run: `npm test`
Expected: PASS — 1 test passed.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: configure Vitest and PWA plugin"
```

---

## Task 4: PWA manifest and installability

**Files:**
- Create: `public/manifest.webmanifest`, `public/icons/icon-192.png`, `public/icons/icon-512.png`
- Modify: `index.html`

- [ ] **Step 1: Create the manifest**

`public/manifest.webmanifest`:

```json
{
  "name": "Meal Planner",
  "short_name": "Meals",
  "description": "Plan healthy weekly meals",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#f6f8f4",
  "theme_color": "#2e7d52",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

- [ ] **Step 2: Add placeholder icons**

Generate two solid-green placeholder PNGs (replace with real art later):

```bash
node -e "const fs=require('fs');const png=(n)=>{const s=n,c=Buffer.alloc(s*s*4);for(let i=0;i<c.length;i+=4){c[i]=46;c[i+1]=125;c[i+2]=82;c[i+3]=255;}const z=require('zlib');const chunks=[];const u32=(x)=>{const b=Buffer.alloc(4);b.writeUInt32BE(x>>>0);return b};const crc=(t,d)=>{const buf=Buffer.concat([t,d]);let c=~0;for(const x of buf){c^=x;for(let k=0;k<8;k++)c=(c>>>1)^(0xEDB88320&-(c&1))}return u32(~c>>>0)};const chunk=(t,d)=>{const tb=Buffer.from(t);return Buffer.concat([u32(d.length),tb,d,crc(tb,d)])};const sig=Buffer.from([137,80,78,71,13,10,26,10]);const ihdr=Buffer.concat([u32(s),u32(s),Buffer.from([8,6,0,0,0])]);const raw=Buffer.alloc((s*4+1)*s);for(let y=0;y<s;y++){raw[y*(s*4+1)]=0;c.copy(raw,y*(s*4+1)+1,y*s*4,(y+1)*s*4)}const idat=z.deflateSync(raw);return Buffer.concat([sig,chunk('IHDR',ihdr),chunk('IDAT',idat),chunk('IEND',Buffer.alloc(0))])};fs.mkdirSync('public/icons',{recursive:true});fs.writeFileSync('public/icons/icon-192.png',png(192));fs.writeFileSync('public/icons/icon-512.png',png(512));console.log('icons written')"
```

Expected output: `icons written`, and two files exist under `public/icons/`.

- [ ] **Step 3: Link the manifest in `index.html`**

Inside `<head>` of `index.html`, add:

```html
<link rel="manifest" href="/manifest.webmanifest" />
<meta name="theme-color" content="#2e7d52" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
<meta name="apple-mobile-web-app-title" content="Meals" />
```

- [ ] **Step 4: Verify build produces a service worker**

Run: `npm run build`
Expected: build succeeds and `dist/sw.js` exists.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add PWA manifest and installability"
```

---

## Task 5: Environment config and Supabase client

**Files:**
- Create: `.env.example`, `src/lib/supabase.ts`
- Modify: `.gitignore` (already ignores `.env.*`; confirm)

> **Prerequisite (manual, one-time):** Create a free project at supabase.com. Copy the Project URL and the anon public key into `.env.local` (NOT committed). Use placeholders in `.env.example`.

- [ ] **Step 1: Create `.env.example`**

```bash
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=[REDACTED_ANON_KEY]
```

- [ ] **Step 2: Create `.env.local` with real values**

Create `.env.local` (gitignored) with the real Project URL and anon key from the Supabase dashboard. Confirm `git status` does NOT list `.env.local`.

- [ ] **Step 3: Create the Supabase client**

`src/lib/supabase.ts`:

```ts
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!url || !anon) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
}

export const supabase = createClient(url, anon, {
  auth: { persistSession: true, autoRefreshToken: true },
})
```

- [ ] **Step 4: Verify it imports without throwing**

Create `src/lib/supabase.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'

describe('supabase client', () => {
  it('constructs when env vars are present', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key')
    const mod = await import('./supabase')
    expect(mod.supabase).toBeTruthy()
    vi.unstubAllEnvs()
  })
})
```

Run: `npm test src/lib/supabase.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add .env.example src/lib/supabase.ts src/lib/supabase.test.ts
git commit -m "feat: add Supabase client and env config"
```

---

## Task 6: Database schema and Row-Level Security

**Files:**
- Create: `supabase/migrations/0001_foundation.sql`

> Apply this SQL via the Supabase dashboard SQL editor (or the Supabase CLI). It is committed for reproducibility.

- [ ] **Step 1: Write the migration**

`supabase/migrations/0001_foundation.sql`:

```sql
-- Households
create table households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- Profiles: one row per auth user, linked to a household
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  household_id uuid references households(id) on delete set null,
  display_name text,
  created_at timestamptz not null default now()
);

-- Kids: dynamic number per household
create table kids (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

-- Per-household settings: nutrition targets + reminder times
create table household_settings (
  household_id uuid primary key references households(id) on delete cascade,
  target_calories int not null default 2000,
  target_protein int not null default 90,
  target_fiber int not null default 30,
  evening_reminder_time time not null default '20:00',
  morning_reminder_time time not null default '07:00'
);

-- Helper: the caller's household id
create or replace function current_household_id()
returns uuid language sql stable security definer set search_path = public as $$
  select household_id from profiles where id = auth.uid()
$$;

-- Auto-create a profile row when a user signs up
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name) values (new.id, new.raw_user_meta_data->>'display_name');
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function handle_new_user();

-- RLS
alter table households enable row level security;
alter table profiles enable row level security;
alter table kids enable row level security;
alter table household_settings enable row level security;

-- profiles: a user can read/update their own row
create policy "own profile read" on profiles for select using (id = auth.uid());
create policy "own profile update" on profiles for update using (id = auth.uid());

-- households: members can read; any authenticated user can create; members can update
create policy "household read" on households for select using (id = current_household_id());
create policy "household insert" on households for insert with check (auth.uid() is not null);
create policy "household update" on households for update using (id = current_household_id());

-- kids: scoped to caller's household
create policy "kids read" on kids for select using (household_id = current_household_id());
create policy "kids write" on kids for all
  using (household_id = current_household_id())
  with check (household_id = current_household_id());

-- settings: scoped to caller's household
create policy "settings read" on household_settings for select using (household_id = current_household_id());
create policy "settings write" on household_settings for all
  using (household_id = current_household_id())
  with check (household_id = current_household_id());
```

- [ ] **Step 2: Apply the migration**

Paste the SQL into the Supabase dashboard → SQL Editor → Run.
Expected: "Success. No rows returned." Verify the four tables appear under Table Editor.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0001_foundation.sql
git commit -m "feat: add foundation DB schema with RLS"
```

---

## Task 7: Default nutrition targets (pure logic, TDD)

**Files:**
- Create: `src/lib/householdDefaults.ts`, `src/lib/householdDefaults.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/householdDefaults.test.ts`:

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
    })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test src/lib/householdDefaults.test.ts`
Expected: FAIL — cannot find module `./householdDefaults`.

- [ ] **Step 3: Implement**

`src/lib/householdDefaults.ts`:

```ts
export interface HouseholdSettings {
  target_calories: number
  target_protein: number
  target_fiber: number
  evening_reminder_time: string
  morning_reminder_time: string
}

export function defaultTargets(): HouseholdSettings {
  return {
    target_calories: 2000,
    target_protein: 90,
    target_fiber: 30,
    evening_reminder_time: '20:00',
    morning_reminder_time: '07:00',
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test src/lib/householdDefaults.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/householdDefaults.ts src/lib/householdDefaults.test.ts
git commit -m "feat: default nutrition targets"
```

---

## Task 8: Onboarding form validation schema (pure, TDD)

**Files:**
- Create: `src/lib/onboardingSchema.ts`, `src/lib/onboardingSchema.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/onboardingSchema.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { onboardingSchema } from './onboardingSchema'

describe('onboardingSchema', () => {
  it('accepts a household with zero kids', () => {
    const r = onboardingSchema.safeParse({
      householdName: 'Star Family',
      displayName: 'Mouni',
      kids: [],
      target_calories: 2000, target_protein: 90, target_fiber: 30,
      evening_reminder_time: '20:00', morning_reminder_time: '07:00',
    })
    expect(r.success).toBe(true)
  })

  it('accepts a dynamic list of named kids', () => {
    const r = onboardingSchema.safeParse({
      householdName: 'Star Family', displayName: 'Mouni',
      kids: [{ name: 'Aanya' }, { name: 'Vihaan' }],
      target_calories: 2000, target_protein: 90, target_fiber: 30,
      evening_reminder_time: '20:00', morning_reminder_time: '07:00',
    })
    expect(r.success).toBe(true)
  })

  it('rejects an empty household name', () => {
    const r = onboardingSchema.safeParse({
      householdName: '', displayName: 'Mouni', kids: [],
      target_calories: 2000, target_protein: 90, target_fiber: 30,
      evening_reminder_time: '20:00', morning_reminder_time: '07:00',
    })
    expect(r.success).toBe(false)
  })

  it('rejects a kid with a blank name', () => {
    const r = onboardingSchema.safeParse({
      householdName: 'Star Family', displayName: 'Mouni',
      kids: [{ name: '' }],
      target_calories: 2000, target_protein: 90, target_fiber: 30,
      evening_reminder_time: '20:00', morning_reminder_time: '07:00',
    })
    expect(r.success).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test src/lib/onboardingSchema.test.ts`
Expected: FAIL — cannot find module `./onboardingSchema`.

- [ ] **Step 3: Implement**

`src/lib/onboardingSchema.ts`:

```ts
import { z } from 'zod'

export const onboardingSchema = z.object({
  householdName: z.string().trim().min(1, 'Household name is required'),
  displayName: z.string().trim().min(1, 'Your name is required'),
  kids: z.array(z.object({ name: z.string().trim().min(1, 'Kid name is required') })),
  target_calories: z.number().int().positive(),
  target_protein: z.number().int().positive(),
  target_fiber: z.number().int().positive(),
  evening_reminder_time: z.string().regex(/^\d{2}:\d{2}$/),
  morning_reminder_time: z.string().regex(/^\d{2}:\d{2}$/),
})

export type OnboardingInput = z.infer<typeof onboardingSchema>
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test src/lib/onboardingSchema.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/onboardingSchema.ts src/lib/onboardingSchema.test.ts
git commit -m "feat: onboarding validation schema"
```

---

## Task 9: AuthProvider context

**Files:**
- Create: `src/context/AuthProvider.tsx`

- [ ] **Step 1: Implement the provider**

`src/context/AuthProvider.tsx`:

```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

interface AuthState {
  session: Session | null
  loading: boolean
}

const AuthContext = createContext<AuthState>({ session: null, loading: true })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  return <AuthContext.Provider value={{ session, loading }}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/context/AuthProvider.tsx
git commit -m "feat: AuthProvider session context"
```

---

## Task 10: HouseholdProvider context

**Files:**
- Create: `src/context/HouseholdProvider.tsx`

- [ ] **Step 1: Implement the provider**

`src/context/HouseholdProvider.tsx`:

```tsx
import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthProvider'

interface Kid { id: string; name: string }
interface HouseholdState {
  householdId: string | null
  kids: Kid[]
  loading: boolean
  refresh: () => Promise<void>
}

const HouseholdContext = createContext<HouseholdState>({
  householdId: null, kids: [], loading: true, refresh: async () => {},
})

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const [householdId, setHouseholdId] = useState<string | null>(null)
  const [kids, setKids] = useState<Kid[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!session) { setHouseholdId(null); setKids([]); setLoading(false); return }
    setLoading(true)
    const { data: profile } = await supabase
      .from('profiles').select('household_id').eq('id', session.user.id).single()
    const hid = profile?.household_id ?? null
    setHouseholdId(hid)
    if (hid) {
      const { data: k } = await supabase.from('kids').select('id,name').eq('household_id', hid)
      setKids(k ?? [])
    } else {
      setKids([])
    }
    setLoading(false)
  }, [session])

  useEffect(() => { void refresh() }, [refresh])

  return (
    <HouseholdContext.Provider value={{ householdId, kids, loading, refresh }}>
      {children}
    </HouseholdContext.Provider>
  )
}

export const useHousehold = () => useContext(HouseholdContext)
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/context/HouseholdProvider.tsx
git commit -m "feat: HouseholdProvider context"
```

---

## Task 11: Route guards

**Files:**
- Create: `src/routes/guards.tsx`

- [ ] **Step 1: Implement guards**

`src/routes/guards.tsx`:

```tsx
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthProvider'
import { useHousehold } from '../context/HouseholdProvider'

export function RequireAuth() {
  const { session, loading } = useAuth()
  if (loading) return <div className="p-6 text-center text-gray-400">Loading…</div>
  return session ? <Outlet /> : <Navigate to="/login" replace />
}

export function RequireHousehold() {
  const { householdId, loading } = useHousehold()
  if (loading) return <div className="p-6 text-center text-gray-400">Loading…</div>
  return householdId ? <Outlet /> : <Navigate to="/onboarding" replace />
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/routes/guards.tsx
git commit -m "feat: auth and household route guards"
```

---

## Task 12: Login / Sign-up screen

**Files:**
- Create: `src/routes/Login.tsx`

- [ ] **Step 1: Implement the screen**

`src/routes/Login.tsx`:

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Login() {
  const nav = useNavigate()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    const fn = mode === 'signup'
      ? supabase.auth.signUp({ email, password })
      : supabase.auth.signInWithPassword({ email, password })
    const { error } = await fn
    setBusy(false)
    if (error) { setError(error.message); return }
    nav('/')
  }

  return (
    <div className="min-h-screen flex flex-col justify-center px-6 max-w-md mx-auto">
      <h1 className="text-2xl font-bold text-brand mb-1">Meal Planner</h1>
      <p className="text-gray-500 mb-6">{mode === 'signup' ? 'Create your account' : 'Welcome back'}</p>
      <form onSubmit={submit} className="space-y-3">
        <input className="w-full border rounded-xl p-3" type="email" placeholder="Email"
          value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className="w-full border rounded-xl p-3" type="password" placeholder="Password"
          value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button disabled={busy} className="w-full bg-brand text-white font-bold rounded-xl p-3 disabled:opacity-50">
          {busy ? '…' : mode === 'signup' ? 'Sign up' : 'Sign in'}
        </button>
      </form>
      <button className="mt-4 text-brand text-sm" onClick={() => setMode(mode === 'signup' ? 'signin' : 'signup')}>
        {mode === 'signup' ? 'Have an account? Sign in' : "New here? Create an account"}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/routes/Login.tsx
git commit -m "feat: login and sign-up screen"
```

---

## Task 13: Onboarding screen (with dynamic kids)

**Files:**
- Create: `src/routes/Onboarding.tsx`, `src/routes/Onboarding.test.tsx`

- [ ] **Step 1: Implement the screen**

`src/routes/Onboarding.tsx`:

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthProvider'
import { useHousehold } from '../context/HouseholdProvider'
import { defaultTargets } from '../lib/householdDefaults'
import { onboardingSchema } from '../lib/onboardingSchema'

export default function Onboarding() {
  const nav = useNavigate()
  const { session } = useAuth()
  const { refresh } = useHousehold()
  const t = defaultTargets()
  const [householdName, setHouseholdName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [kids, setKids] = useState<{ name: string }[]>([])
  const [targets, setTargets] = useState(t)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function addKid() { setKids([...kids, { name: '' }]) }
  function setKid(i: number, name: string) {
    setKids(kids.map((k, idx) => (idx === i ? { name } : k)))
  }
  function removeKid(i: number) { setKids(kids.filter((_, idx) => idx !== i)) }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const parsed = onboardingSchema.safeParse({ householdName, displayName, kids, ...targets })
    if (!parsed.success) { setError(parsed.error.issues[0].message); return }
    if (!session) { setError('Not signed in'); return }
    setBusy(true)

    const { data: hh, error: e1 } = await supabase
      .from('households').insert({ name: householdName }).select('id').single()
    if (e1 || !hh) { setBusy(false); setError(e1?.message ?? 'Failed to create household'); return }

    const { error: e2 } = await supabase
      .from('profiles').update({ household_id: hh.id, display_name: displayName }).eq('id', session.user.id)
    if (e2) { setBusy(false); setError(e2.message); return }

    await supabase.from('household_settings').insert({ household_id: hh.id, ...targets })
    if (kids.length) {
      await supabase.from('kids').insert(kids.map((k) => ({ household_id: hh.id, name: k.name })))
    }

    await refresh()
    setBusy(false)
    nav('/')
  }

  return (
    <div className="min-h-screen px-6 py-8 max-w-md mx-auto">
      <h1 className="text-2xl font-bold text-brand mb-1">Set up your household</h1>
      <p className="text-gray-500 mb-6">You can change all of this later.</p>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="text-xs font-bold text-gray-500 uppercase">Household name</label>
          <input className="w-full border rounded-xl p-3 mt-1" value={householdName}
            onChange={(e) => setHouseholdName(e.target.value)} placeholder="e.g. Star Family" />
        </div>
        <div>
          <label className="text-xs font-bold text-gray-500 uppercase">Your name</label>
          <input className="w-full border rounded-xl p-3 mt-1" value={displayName}
            onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. Mouni" />
        </div>

        <div>
          <label className="text-xs font-bold text-gray-500 uppercase">Kids</label>
          <div className="space-y-2 mt-1">
            {kids.map((k, i) => (
              <div key={i} className="flex gap-2">
                <input className="flex-1 border rounded-xl p-3" aria-label={`Kid ${i + 1} name`}
                  value={k.name} onChange={(e) => setKid(i, e.target.value)} placeholder="Kid's name" />
                <button type="button" aria-label={`Remove kid ${i + 1}`}
                  className="px-3 text-red-500" onClick={() => removeKid(i)}>✕</button>
              </div>
            ))}
          </div>
          <button type="button" onClick={addKid}
            className="mt-2 text-brand font-semibold text-sm">+ Add a kid</button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <label className="text-xs text-gray-500">Calories
            <input type="number" className="w-full border rounded-xl p-2 mt-1" value={targets.target_calories}
              onChange={(e) => setTargets({ ...targets, target_calories: Number(e.target.value) })} />
          </label>
          <label className="text-xs text-gray-500">Protein g
            <input type="number" className="w-full border rounded-xl p-2 mt-1" value={targets.target_protein}
              onChange={(e) => setTargets({ ...targets, target_protein: Number(e.target.value) })} />
          </label>
          <label className="text-xs text-gray-500">Fiber g
            <input type="number" className="w-full border rounded-xl p-2 mt-1" value={targets.target_fiber}
              onChange={(e) => setTargets({ ...targets, target_fiber: Number(e.target.value) })} />
          </label>
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button disabled={busy} className="w-full bg-brand text-white font-bold rounded-xl p-3 disabled:opacity-50">
          {busy ? 'Saving…' : 'Create household'}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Write the dynamic-kids test**

`src/routes/Onboarding.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../lib/supabase', () => ({ supabase: {} }))
vi.mock('../context/AuthProvider', () => ({ useAuth: () => ({ session: null, loading: false }) }))
vi.mock('../context/HouseholdProvider', () => ({ useHousehold: () => ({ refresh: vi.fn() }) }))

import Onboarding from './Onboarding'

function renderPage() {
  return render(<MemoryRouter><Onboarding /></MemoryRouter>)
}

describe('Onboarding dynamic kids', () => {
  beforeEach(() => vi.clearAllMocks())

  it('starts with no kid inputs', () => {
    renderPage()
    expect(screen.queryByLabelText('Kid 1 name')).not.toBeInTheDocument()
  })

  it('adds kid inputs when "Add a kid" is clicked', async () => {
    renderPage()
    await userEvent.click(screen.getByText('+ Add a kid'))
    await userEvent.click(screen.getByText('+ Add a kid'))
    expect(screen.getByLabelText('Kid 1 name')).toBeInTheDocument()
    expect(screen.getByLabelText('Kid 2 name')).toBeInTheDocument()
  })

  it('removes a kid input', async () => {
    renderPage()
    await userEvent.click(screen.getByText('+ Add a kid'))
    await userEvent.click(screen.getByLabelText('Remove kid 1'))
    expect(screen.queryByLabelText('Kid 1 name')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run the test to verify it passes**

Run: `npm test src/routes/Onboarding.test.tsx`
Expected: PASS — 3 tests.

- [ ] **Step 4: Commit**

```bash
git add src/routes/Onboarding.tsx src/routes/Onboarding.test.tsx
git commit -m "feat: onboarding screen with dynamic kids"
```

---

## Task 14: Bottom tab bar and app shell

**Files:**
- Create: `src/components/BottomTabBar.tsx`, `src/components/AppShell.tsx`

- [ ] **Step 1: Implement the tab bar**

`src/components/BottomTabBar.tsx`:

```tsx
import { NavLink } from 'react-router-dom'

const tabs = [
  { to: '/', label: 'Today', icon: '🏠', end: true },
  { to: '/plan', label: 'Plan', icon: '📅' },
  { to: '/recipes', label: 'Recipes', icon: '📖' },
  { to: '/shop', label: 'Shop', icon: '🛒' },
  { to: '/pantry', label: 'Pantry', icon: '🧺' },
]

export default function BottomTabBar() {
  return (
    <nav className="fixed bottom-0 inset-x-0 bg-white border-t flex justify-around py-2 pb-3">
      {tabs.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.end}
          className={({ isActive }) =>
            `flex-1 text-center text-[10px] ${isActive ? 'text-brand font-bold' : 'text-gray-400'}`}>
          <span className="block text-lg">{t.icon}</span>{t.label}
        </NavLink>
      ))}
    </nav>
  )
}
```

- [ ] **Step 2: Implement the shell**

`src/components/AppShell.tsx`:

```tsx
import { Outlet } from 'react-router-dom'
import BottomTabBar from './BottomTabBar'

export default function AppShell() {
  return (
    <div className="min-h-screen pb-20">
      <Outlet />
      <BottomTabBar />
    </div>
  )
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/BottomTabBar.tsx src/components/AppShell.tsx
git commit -m "feat: bottom tab bar and app shell"
```

---

## Task 15: Placeholder tab screens

**Files:**
- Create: `src/routes/Today.tsx`, `src/routes/Plan.tsx`, `src/routes/Recipes.tsx`, `src/routes/Shop.tsx`, `src/routes/Pantry.tsx`

- [ ] **Step 1: Create five placeholder screens**

Each file follows the same shape. `src/routes/Today.tsx`:

```tsx
import { supabase } from '../lib/supabase'

export default function Today() {
  return (
    <div className="px-4 pt-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-brand">Today</h1>
        <button className="text-sm text-gray-400" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </div>
      <p className="text-gray-500 mt-2">Coming soon.</p>
    </div>
  )
}
```

`src/routes/Plan.tsx`:

```tsx
export default function Plan() {
  return <div className="px-4 pt-6"><h1 className="text-2xl font-bold text-brand">Plan</h1><p className="text-gray-500 mt-2">Coming soon.</p></div>
}
```

`src/routes/Recipes.tsx`:

```tsx
export default function Recipes() {
  return <div className="px-4 pt-6"><h1 className="text-2xl font-bold text-brand">Recipes</h1><p className="text-gray-500 mt-2">Coming soon.</p></div>
}
```

`src/routes/Shop.tsx`:

```tsx
export default function Shop() {
  return <div className="px-4 pt-6"><h1 className="text-2xl font-bold text-brand">Shop</h1><p className="text-gray-500 mt-2">Coming soon.</p></div>
}
```

`src/routes/Pantry.tsx`:

```tsx
export default function Pantry() {
  return <div className="px-4 pt-6"><h1 className="text-2xl font-bold text-brand">Pantry</h1><p className="text-gray-500 mt-2">Coming soon.</p></div>
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/routes/Today.tsx src/routes/Plan.tsx src/routes/Recipes.tsx src/routes/Shop.tsx src/routes/Pantry.tsx
git commit -m "feat: placeholder tab screens"
```

---

## Task 16: Wire up routing and providers

**Files:**
- Modify: `src/App.tsx`, `src/main.tsx`

- [ ] **Step 1: Define routes in `App.tsx`**

Replace `src/App.tsx`:

```tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthProvider'
import { HouseholdProvider } from './context/HouseholdProvider'
import { RequireAuth, RequireHousehold } from './routes/guards'
import AppShell from './components/AppShell'
import Login from './routes/Login'
import Onboarding from './routes/Onboarding'
import Today from './routes/Today'
import Plan from './routes/Plan'
import Recipes from './routes/Recipes'
import Shop from './routes/Shop'
import Pantry from './routes/Pantry'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <HouseholdProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<RequireAuth />}>
              <Route path="/onboarding" element={<Onboarding />} />
              <Route element={<RequireHousehold />}>
                <Route element={<AppShell />}>
                  <Route index element={<Today />} />
                  <Route path="plan" element={<Plan />} />
                  <Route path="recipes" element={<Recipes />} />
                  <Route path="shop" element={<Shop />} />
                  <Route path="pantry" element={<Pantry />} />
                </Route>
              </Route>
            </Route>
          </Routes>
        </HouseholdProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
```

- [ ] **Step 2: Confirm `main.tsx` mounts App with global CSS**

Ensure `src/main.tsx` reads:

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>,
)
```

- [ ] **Step 3: Full typecheck + tests**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors; all tests pass.

- [ ] **Step 4: Manual end-to-end verification**

Run: `npm run dev`, open the URL, then:
1. Sign up with a test email/password → redirected to `/onboarding`.
2. Enter household name + your name, click "+ Add a kid" twice, fill names, click "Create household" → lands on **Today** with the 5-tab bar.
3. Switch tabs (Plan/Recipes/Shop/Pantry) → each placeholder renders, tab bar highlights the active tab.
4. Click "Sign out" on Today → returns to `/login`.
5. Sign back in → goes straight to Today (household already exists, onboarding skipped).

Expected: all five steps behave as described.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/main.tsx
git commit -m "feat: wire routing, providers, and guards"
```

---

## Task 17: README and push

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write a minimal README**

`README.md`:

```markdown
# Meal Planner

Healthy weekly meal planner PWA. See `docs/superpowers/specs/` for the design and `docs/superpowers/plans/` for build plans.

## Setup
1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in your Supabase URL + anon key.
3. Apply `supabase/migrations/0001_foundation.sql` in your Supabase project.
4. `npm run dev`

## Scripts
- `npm run dev` — dev server
- `npm test` — run tests
- `npm run build` — production build
```

- [ ] **Step 2: Push the branch**

```bash
git add README.md
git commit -m "docs: add README"
git push
```

Expected: push succeeds to `origin/main`.

---

## Self-Review

- **Spec coverage (Foundation slice):** PWA scaffold ✅ (T1–T4), Supabase ✅ (T5–T6), auth ✅ (T9, T12), household + dynamic kids onboarding ✅ (T8, T10, T13), nutrition targets ✅ (T7, T13), 5-tab shell ✅ (T14–T16). Recipes / AI import / Plan / Shopping / Pantry / Reminders are intentionally deferred to Plans 2–6.
- **Placeholder scan:** No "TBD"/"handle errors" placeholders; every code step shows complete code. Placeholder *screens* (T15) are intentional and fully specified.
- **Type consistency:** `HouseholdSettings` (T7) reused by onboarding; `onboardingSchema` field names match the Onboarding form payload (T13); `current_household_id()` used consistently across all RLS policies (T6); provider hooks `useAuth`/`useHousehold` names consistent across T9–T16.
```
