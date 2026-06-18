# Pantry & Shopping — Design Spec (Plan 5)

**Date:** 2026-06-18
**Status:** Approved
**Prerequisite:** Plan 4 (Plan & Today) merged

---

## 1. Goal

Build the Pantry screen (household staple tracking with bulk status updates) and the Shopping screen (ingredient aggregation from weekly pool or tomorrow's picks, minus pantry items). These complete the core weekly loop: shortlist → shop → pick → cook.

---

## 2. Pantry Screen (`/pantry`)

### Data Model

**Table: `pantry_items`**
- `id` uuid PK
- `household_id` uuid FK → households, cascade delete
- `name` text, not null, trimmed
- `status` text, check (`good`, `low`, `out`), default `good`
- `created_at` timestamptz, default now()
- Unique: (household_id, name) — no duplicate item names per household
- RLS via `current_household_id()`

### UI

**Header:** "Pantry" title + filter toggle (All / Running low) + "Select" button.

**Filter toggle:**
- **All** — shows every pantry item
- **Running low** — shows only items with status `low` or `out`

**Item list:** Each item shows:
- Name (left)
- Status badge (right): colored pill — green "Good", orange "Low", red "Out"
- Tap an item (in normal mode) → cycles status: Good → Low → Out → Good

**Add item:** A sticky input bar at the bottom with a text field + "Add" button. Adds with status `good`. If the name already exists in the household, show an error.

**Multi-select mode:**
- Tap "Select" in the header → enters selection mode
- Each item gets a checkbox on the left
- Tap items to select/deselect; "Select all" option at top
- Bottom action bar appears with status buttons: **Good / Low / Out / Delete**
- Tapping a status button bulk-updates all selected items to that status
- Tapping Delete removes all selected items (with brief confirmation)
- "Done" button exits selection mode

**Empty state:** "No pantry items yet. Add your staples below."

---

## 3. Shopping Screen (`/shop`)

### Data Model

**Table: `shopping_checks`**
- `id` uuid PK
- `household_id` uuid FK → households, cascade delete
- `item` text, not null (the ingredient item name, lowercased)
- `week_start` date, not null
- `created_at` timestamptz, default now()
- Unique: (household_id, item, week_start) — one check per item per week
- RLS via `current_household_id()`

### Ingredient Derivation

**"This week" mode:** Collect all `ingredients` arrays from recipes in `week_pool` for the current week. Each ingredient entry becomes a shopping list row showing: `amount` + `item` (from the recipe ingredient) and recipe name in small text.

**"Just tomorrow" mode:** Collect all `ingredients` arrays from recipes in `daily_picks` for tomorrow's date. Same display format.

**No amount aggregation** in v1 — if two recipes both need "2 eggs", they appear as two separate rows. Each row shows which recipe it belongs to.

### Pantry Matching

For each ingredient `item`, check if any `pantry_items.name` matches via case-insensitive substring (pantry name contained in ingredient item, or vice versa). If the matching pantry item has status `good`, the ingredient is marked **"In pantry"** and sorted to the bottom of the list, greyed out.

Items with pantry status `low` or `out` are NOT excluded — they stay in the buy list.

### Check-off

- Tap an item to check it off (toggle). Persisted in `shopping_checks` keyed by (household_id, lowercased item, week_start).
- Both "this week" and "tomorrow" views share the same check state for the current week.
- Checked items sort below unchecked items (but above "In pantry" items).

### UI

**Header:** "Shop" title + mode toggle (This Week / Just Tomorrow).

**List sections** (top to bottom):
1. **To buy** — unchecked items, not in pantry
2. **Checked off** — items the user has tapped as purchased (strikethrough, muted)
3. **In pantry** — items matched to a Good pantry item (greyed out, "In pantry ✓" badge)

Each item row: checkbox + amount + item name + recipe name (small, grey).

**Empty state:** "No ingredients to show. Add recipes to your weekly pool first."

**Counter:** Header shows "X of Y items" remaining to buy.

---

## 4. Pantry-to-Shopping Matching Logic

Case-insensitive substring match between `pantry_items.name` and recipe ingredient `item`:
- `pantry.name.toLowerCase()` is checked against `ingredient.item.toLowerCase()`
- Match if either contains the other (handles "eggs" matching "eggs" and "eggs, beaten")
- Simple and imperfect — good enough for v1

---

## 5. Technical Approach

**New files:**
- `supabase/migrations/0005_pantry_shopping.sql` — pantry_items + shopping_checks tables
- `src/lib/pantry.ts` — types (PantryItem, PantryStatus, ShoppingCheck) + pantry matching util
- `src/lib/pantryData.ts` — Supabase CRUD for pantry items + shopping checks
- `src/components/PantryList.tsx` — item list with status cycling + multi-select
- `src/components/ShoppingList.tsx` — derived shopping list with check-off
- `src/routes/Pantry.tsx` — rewrite placeholder
- `src/routes/Shop.tsx` — rewrite placeholder

**Conventions:** Same as prior plans — cast Supabase results (no generated types), default exports for routes, named exports for lib, verify with `npx tsc -b`.

---

## 6. Out of Scope

- Aisle grouping (deferred)
- Amount aggregation across recipes (deferred)
- Barcode scanning for pantry
- Pantry item categories
- Shopping list sharing/export
