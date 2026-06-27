# AI Recipe Draft — per-person nutrition, steps & tags

**Date:** 2026-06-27
**Branch:** feat/personalized-nutrition-targets (or a new feature branch)

## Problem

Creating a recipe by hand on the **New recipe** form (`src/routes/RecipeForm.tsx`) never
calls the AI. Nutrition is whatever the user types, so recipes get saved with empty
nutrition. The only AI path that fills nutrients is `/api/import-recipe`, and its prompt
**always divides by the serving count** — which is wrong for sources that are already a
single serving.

## Goal

1. A **"Generate draft"** button on the recipe form that takes the entered name +
   ingredients and fills in per-one-person nutrition, cooking steps, and meal types/tags
   for the user to review before saving.
2. Make serving-count scaling **content-driven** rather than unconditional, so it applies
   correctly across every source.

## Scaling rule (shared by import + draft)

The model detects the serving count from the content and scales only when it finds one:

- Content states a serving count (e.g. "serves 3", "makes 4 portions") **> 1** → DIVIDE all
  nutrition values **and** ingredient amounts by that count → per one person.
- No serving count stated → treat the recipe as already single-serving; use values as-is.
- **Never guess** a serving count.

This single rule covers blog, YouTube, pasted text, photo, and the manual ingredient list
(which states no count, so it defaults to single).

## Backend (`server/src`)

### `prompt.ts`
- Replace the current unconditional *"DIVIDE all nutrition by the serving count"* and
  *"NORMALIZE amounts to ONE serving"* lines with the detection rule above (covers both
  nutrition and ingredient amounts).
- Add `buildDraftRequest(model, { name, ingredients })`:
  - Reuses the existing strict `RECIPE_JSON_SCHEMA`.
  - Same detection rule (defaults to single — no count present).
  - Additional instruction: generate `steps` (short imperative) and pick `meal_types` /
    `tags` from the allowed lists, based on the ingredient list and name.
  - User content is the name + a formatted ingredient list.

### `draftHandler.ts` (new)
- `handleDraftRecipe(body, apiKey)`:
  - Validate body `{ name?: string, ingredients: [{ amount, item, staple? }] }` — require at
    least one ingredient with a non-empty `item`; else `ImportError(400)`.
  - Call `callOpenAI(apiKey, buildDraftRequest(MODEL, …))`.
  - Re-validate the model output with `recipeDraftSchema`.
  - **Echo back the user's own ingredients** (preserve order + `staple` flags) rather than
    trusting the model to repeat them; merge model nutrition/steps/meal_types/tags.
  - Return `{ draft: RecipeDraft }`.

### `app.ts`
- `POST /draft-recipe` with the same OPENAI_API_KEY + Supabase auth guard as
  `/import-recipe` and `/suggest-activity`.

## Frontend

### `src/lib/draftRecipe.ts` (new)
- `draftRecipe({ name, ingredients })` → POSTs to `/api/draft-recipe` (mirrors
  `src/lib/activityAssist.ts`: same-origin in prod, `VITE_IMPORT_API_URL` in dev, Bearer
  token from Supabase session). Returns `{ draft: RecipeDraft }`.

### `src/routes/RecipeForm.tsx`
- A "✨ Generate draft" button near the Nutrition section, enabled when there is ≥1
  ingredient with a non-empty item and not already busy.
- On click: set a local `drafting` spinner → call `draftRecipe` with the current name +
  ingredient rows → on success merge into form state: `nutrients`, `nutrition_estimated`
  (true), `steps`, `meal_types`, `tags`. **Name and ingredient rows are kept as typed**
  (staple flags preserved).
- Errors surface inline using the existing `error` state.

## Behavior notes
- Generate draft **overwrites** the nutrition/steps/meal-type/tag fields so the draft is
  internally coherent; the user then edits and saves.
- It never alters the user's name or ingredient rows.
- Single-person in → single-person out unless the content itself declares a larger count.

## Tests
- `server/src/draftHandler.test.ts` — echoes the user's ingredients; surfaces model
  nutrition/steps/tags; rejects empty-ingredient bodies.
- `server/src/prompt.test.ts` — assert the new serving-detection wording and that
  `buildDraftRequest` asks for steps + tags.
- `src/routes/RecipeForm.test.tsx` — button disabled with no ingredients; clicking it
  merges a mocked draft's nutrition/steps/tags while preserving ingredients.

## Out of scope
- No new DB columns or migrations.
- No change to how saved recipes are scaled/displayed downstream.
