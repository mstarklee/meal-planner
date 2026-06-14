# Healthy Weekly Meal Planner — Design Document

**Date:** 2026-06-14
**Status:** Approved (design phase)
**Author:** Mouni + Claude (brainstorming session)

---

## 1. Problem & Goal

Working professionals struggle to cook regularly and, especially, to cook *healthy*. The goal is a mobile app that removes the daily decision load:

- The night before, the user picks the next day's meals and knows exactly what to cook in the morning.
- The user always has the ingredients on hand (or knows in advance what to buy).
- Meals are healthy, with visibility into daily **protein, fiber, and calories**.
- Recipes are effortless to add — captured from YouTube, blogs, handwritten photos, or pasted text via AI, not typed by hand.

**One-line vision:** *Shortlist weekly → shop once → pick nightly → wake up and just cook.*

---

## 2. Users & Scope

- **Primary users:** the user + spouse, sharing one household plan (shared account / live sync).
- **Distribution:** shareable with friends, who each run their **own private household**. Friends differ in family size, so household composition (number of kids) is **dynamic/configurable**.
- **Shared recipe library:** a common pool of recipes all users can contribute to and pull from, on top of each household's private recipes.
- **Out of scope for v1:** AI meal *suggestion/generation* (explicitly removed), detailed micronutrient tracking, collaborating with friends on a *single shared plan*.

---

## 3. Platform & Technical Decisions

| Concern | Decision | Rationale |
|---|---|---|
| App type | **PWA** (installable web app, "Add to Home Screen" on iPhone) | Developed on Windows, targets iPhone, free to share with friends via a link, no App Store / Mac / $99 fee |
| Frontend | **React + TypeScript**, mobile-first, service worker for offline/install | Standard, fast to build, good PWA support |
| Backend / data | **Supabase** (Postgres, Auth, Realtime, Storage) | Accounts, you↔spouse live sync, shared recipe library, recipe photos — all in one managed service with a generous free tier |
| AI recipe import | **Claude multimodal model** via a Supabase Edge Function | Handles text *and* images (handwriting/cookbook photos); cheap per import |
| Reminders | **Web Push** + a scheduled job (Supabase cron / edge function) | Evening + morning pings; works on iOS 16.4+ when added to home screen |
| Hosting | **Vercel** or **Netlify** free tier | One-click deploy; share the URL |

**Known caveats (accepted):**
- iOS PWA push requires the app be added to the home screen (iOS 16.4+).
- YouTube import relies on the video having captions or a recipe in the description; caption-less videos are hit-or-miss.
- AI-estimated nutrition is approximate and is labeled "≈ estimated."

---

## 4. Core Concepts (Data Model — conceptual)

- **Household** — the unit a plan belongs to. Has members: adults + a **dynamic list of kids** (each with a name). Owns nutrition targets and reminder settings.
- **User / Account** — belongs to a household (user + spouse share one). Auth via Supabase.
- **Recipe** — name, photo, optional video/blog link, ingredients (amount + item), **simple numbered steps**, nutrition (**calories, protein, fiber**; may be AI-estimated & flagged), tags (healthy / high-protein / kid-friendly / cheat / veg…), meal-type suitability (breakfast / lunch / dinner / kid), and visibility (**private** to household, or **shared** to the common library).
- **Shortlist (Weekly Pool)** — per meal slot, ~6–7 candidate recipes the household is happy to cook this week. Drives the shopping list.
- **Daily Pick** — the recipe chosen for each slot on a given day (the nightly "lock in tomorrow" action). Drives the Today screen.
- **Pantry Item** — something the household has, with status **Good / Low / Out**. Low/Out items surface on the shopping list.
- **Shopping List** — derived: aggregated ingredients from the shortlist (or just tomorrow's picks) **minus** pantry items, grouped by aisle.

### Meal slots
Breakfast, Lunch, Dinner (family) + **Kid's school box**: packed lunch + one snack (healthy or cheat). Kid count is dynamic per household (default examples assume 1 kid).

---

## 5. Screens & Navigation

**Bottom tab bar (5 tabs):** Today · Plan · Recipes · Shop · Pantry.

### 5.1 Today (home)
- Greeting + date.
- **Green nutrition strip:** day totals for **Calories · Protein · Fiber**, with a ✓ when the family hits its target.
- Family meals (Breakfast / Lunch / Dinner) each as a card: photo, name, tags, per-meal cal/protein/fiber.
- **Kid's school box** section (orange accent): school lunch + snack (cheat clearly tagged).
- **Tap a meal card → steps unfold in place** (accordion; *no navigation away* — chosen for minimal clicks). Expanded card shows ingredients, numbered steps, and an optional **"▶ Watch video / open blog"** button.

### 5.2 Plan
Two-part model (replaces day-by-day planning):
1. **This Week's Pool (weekly, once):** a tab per slot (B'fast / Lunch / Dinner / Kid). Tick ~7 recipes into each pool from **My Recipes** or **Shared Library**. Counter shows progress ("6 of 7"). Pool drives the shopping list.
2. **Plan Tomorrow (nightly, ~30 sec):** opened by the evening reminder. For each slot, shows only the pool; tap one per slot; **"Lock in tomorrow."** Fills tomorrow's Today screen + prep.

### 5.3 Recipes
- **Library:** toggle **My Recipes / Shared Library**; search + filter by tag. Shared recipes show a "↗ Shared" badge.
- **Add recipe — two paths:**
  - **⭐ AI Import (primary):** pick a source — **YouTube link · Blog link · Photo (handwritten/cookbook) · Paste text/message**. AI returns a structured draft (name, tags, **≈ estimated** nutrition, ingredients, steps). User **Edits** or **Approves & Saves**. Default save target: **My Recipes (private)**; sharing is a separate explicit action.
  - **Manual form (fallback):** photo, name, meal type(s), tags, nutrition (cal/protein/fiber), ingredients (amount + item), numbered steps, optional video/blog link, "Share to friends' library" toggle.

### 5.4 Shop
- Toggle **This week / Just tomorrow**.
- Ingredients summed from the shortlist (or tomorrow's picks), **grouped by aisle**.
- Items already owned show **"In pantry"** and are excluded from the buy list.
- Check items off as purchased.

### 5.5 Pantry
- Staples / fridge items with **Good / Low / Out** status; filter "All / Running low".
- Quick **+ Add pantry item**.
- Marking **Low/Out** auto-surfaces the item on the shopping list ("do I have it?" engine with minimal upkeep).

### 5.6 First-time Setup (onboarding)
- **Household:** user + spouse (shared account); **dynamic number of kids**, each with a name.
- **Daily nutrition targets:** family protein / fiber / calorie goals (sensible defaults, editable) — drive the Today ✓ checkmarks.
- **Reminder times:** evening "plan tomorrow" + morning "cook today."

---

## 6. Key Flows

**Weekly setup:** Plan → build pool (~7 per slot) → Shop ("This week") → buy what's missing.

**Nightly (the core ritual):** Evening reminder → "Plan Tomorrow" → tap one per slot → "Lock in." Optionally check "Just tomorrow" shopping list.

**Morning:** Morning reminder → Today screen → tap a meal → steps unfold → cook.

**Adding a recipe:** Recipes → AI Import → paste link/photo/text → review draft → Approve & Save (→ private) → optionally share / add to a pool.

---

## 7. Reminders

- **Evening "plan tomorrow":** opens the nightly pick flow; includes a peek at any still-missing ingredients.
- **Morning "cook today":** today's meals at a glance.
- Both delivered via Web Push at household-configured times.

---

## 8. Nutrition Approach

- Per recipe: **Calories, Protein, Fiber** only (no deep micronutrients).
- AI estimates these on import when the source omits them, labeled **"≈ estimated"** and user-editable.
- Today screen rolls up the day's totals and shows ✓ against the household's targets so the family reliably gets enough protein/fiber.

---

## 9. Build Order (suggested for the implementation plan)

1. Project scaffold: React + TS PWA, Supabase project, auth, household + dynamic-kids onboarding.
2. Recipe model + manual add form + library (My / Shared).
3. **AI Import** (text → blog → photo → YouTube), preview/approve.
4. Plan: weekly pool + nightly pick.
5. Today screen with nutrition roll-up + unfold-in-place steps.
6. Pantry + Shopping (week/tomorrow toggle, pantry-aware).
7. Reminders (web push + scheduler).
8. Shared library contribution/sync polish + deploy.

---

## 10. Open Questions / Future (not v1)

- AI meal suggestions (deferred by choice).
- Moderation/quality control of the shared library as it grows.
- Per-kid different food (currently single shared kid box pattern; model supports multiple kids but UI assumes shared packing).
- Servings scaling (recipe nutrition is per serving; multiplying for family size is a future refinement).
