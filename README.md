# Meal Planner

A healthy weekly meal-planner PWA (iPhone-first, installable). Plan your week's
meals from a shortlist, pick the next day's meals each night, and shop against
what's already in your pantry. See [`docs/superpowers/specs/`](docs/superpowers/specs/)
for the full design and [`docs/superpowers/plans/`](docs/superpowers/plans/) for build plans.

## Tech stack

React + TypeScript + Vite (PWA) · Tailwind CSS v3 · Supabase (Auth, Postgres, RLS) ·
Vitest + React Testing Library.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in your Supabase **Project URL** and
   **publishable key** (Supabase dashboard → Settings → API):
   ```
   VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
   ```
3. Apply the database schema: open the Supabase dashboard → SQL Editor → paste the
   contents of [`supabase/migrations/0001_foundation.sql`](supabase/migrations/0001_foundation.sql) → Run.
4. (For local auth testing) In the Supabase dashboard → Authentication → Sign In / Providers,
   you may disable "Confirm email" so sign-up logs you in immediately during development.
5. `npm run dev`

## Scripts

- `npm run dev` — start the dev server
- `npm test` — run the test suite (Vitest)
- `npm run build` — production build (also generates the PWA service worker)
- `npm run preview` — preview the production build

## Project layout

- `src/lib/` — framework-free logic (Supabase client, validation, defaults)
- `src/context/` — auth + household React contexts
- `src/routes/` — screens (Login, Onboarding, and the 5 tabs) + route guards
- `src/components/` — shared UI (app shell, bottom tab bar)
- `supabase/migrations/` — database schema
