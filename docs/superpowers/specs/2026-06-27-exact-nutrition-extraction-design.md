# Exact-matching nutrition extraction

**Date:** 2026-06-27
**Status:** Approved

## Problem

The recipe import page (paste text / photo / blog link / YouTube link → **Generate draft** →
review form → submit) is already built and works end-to-end. The one weak spot is **nutrition
accuracy**: the shared `NUTRITION_RULE` in `server/src/prompt.ts` currently tells the model to
"estimate sensible numbers", which produces vague guesses rather than exact values.

## Goal

Nutrition must be exact, not eyeballed:

- If the source/user **states** nutrition values, use them **verbatim** — no recompute, round, or adjust.
- If not, the AI **computes per ingredient, then sums** — a calculation, not a single guess.

## Decisions

- **Approach:** stronger prompt only (no food-composition database / external API). (Option 2.)
- **Scope:** both AI flows — import (`SYSTEM`) and manual "Generate draft" (`DRAFT_SYSTEM`) — via the
  shared `NUTRITION_RULE`. (Option 1 of scope question.)

## The change — `NUTRITION_RULE` in `server/src/prompt.ts`

Rewrite the shared rule with explicit precedence and a bound method:

1. **Prefer stated values.** If the content explicitly states a nutrition value (label,
   "per serving" block, or user-typed), use that number **exactly as written** — do not recompute,
   round, or adjust. When every emitted value came from stated data, set `nutrition_estimated=false`.
2. **Otherwise compute per-ingredient.** For each ingredient, derive its contribution from standard
   food-composition values at the given quantity, then **sum across all ingredients** per nutrient.
   The model must reason ingredient-by-ingredient before emitting the total. Set
   `nutrition_estimated=true`.
3. **Mixed sources** → keep stated values exact, compute the rest, `nutrition_estimated=true`.
4. **Units & per-person scaling unchanged** — same keys, same units; existing `SERVING_RULE` /
   `DRAFT_SERVING_RULE` continue to govern per-one-person scaling.
5. `null` only when a value genuinely cannot be determined.

## Out of scope (unchanged)

- Import page UI, the 4 source tabs, the review-form-then-submit flow.
- The form already lets the user override any nutrition value; form values win on submit.
- Recipe schema, nutrient keys, units, model (`gpt-4o`), serving logic.

## Testing

Extend `server/src/prompt.test.ts` to assert the new rule appears in **both** system prompts:
the stated-values-exact clause, the per-ingredient-sum clause, and the precedence ordering.
No runtime behavioral tests (output is model-generated) — matches existing prompt test style.
