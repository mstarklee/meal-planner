import { MEAL_TYPES, RECIPE_TAGS } from '../../src/lib/recipe'
import { NUTRIENT_KEYS } from '../../src/lib/nutrients'

export interface ExtractionRequest {
  model: string
  messages: Array<{ role: 'system' | 'user'; content: unknown }>
  response_format: unknown
}

export type ExtractionInput =
  | { kind: 'text'; text: string }
  | { kind: 'image'; imageDataUrl: string }

// Detect-and-scale rule shared by the import and draft prompts. The model only scales when
// the content itself states a serving count; otherwise the recipe is treated as one serving.
const SERVING_RULE = [
  '- Servings: look for an explicit serving count in the content (e.g. "serves 4", "makes 6 servings", "4 portions").',
  '  If you find one greater than 1, DIVIDE all nutrition values AND ingredient amounts by that count so everything is per ONE person.',
  '  If no serving count is stated, treat the recipe as already a single serving and use the values as-is. Never guess a serving count.',
].join('\n')

const NUTRITION_RULE = [
  '- Nutrition: provide a `nutrients` object with PER-ONE-PERSON values for these keys: ' + NUTRIENT_KEYS.join(', ') + '.',
  '  Units: calories=kcal; protein/carbs/healthy_fats/fiber/omega_3=grams; vitamin_a/vitamin_d/folate=µg; vitamin_b12=µg; vitamin_c/choline/iron/calcium/potassium/zinc/magnesium=mg.',
  '  Use stated values when present; otherwise estimate sensible numbers. Use null only when you truly cannot estimate. Set nutrition_estimated=true if any value was estimated.',
].join('\n')

const SYSTEM = [
  'You extract a single cooking recipe from the provided content and return it as JSON matching the schema.',
  'Rules:',
  '- Use only information present in the content. Do not invent ingredients or steps.',
  '- meal_types: pick all that apply from the allowed list; if unsure pick the single most likely.',
  '- tags: pick zero or more from the allowed list that genuinely fit.',
  SERVING_RULE,
  NUTRITION_RULE,
  '- ingredients: amount (e.g. "200 g", "1 cup", or "") and item.',
  '- steps: short imperative instructions in order.',
  '- If the content is not a recipe, return name="" with empty ingredients and steps.',
].join('\n')

// The manual "Generate draft" flow: the user has typed an ingredient list that is ALREADY
// exactly one person's portion. Unlike the import flow, the model must NOT infer a serving
// count from the quantities (e.g. "2 eggs" does not mean "serves 2") and must NOT scale.
const DRAFT_SERVING_RULE = [
  '- Servings: the listed ingredient quantities are for EXACTLY ONE person. Do NOT infer a serving count from them.',
  '  Do NOT divide or multiply. Compute nutrition for exactly the quantities given by summing each ingredient\'s contribution.',
].join('\n')

const DRAFT_SYSTEM = [
  'You complete a single-person cooking recipe from the name and ingredient list the user typed, and return it as JSON matching the schema.',
  'Rules:',
  '- Keep the given ingredients; do not add or remove ingredients.',
  '- meal_types: pick all that apply from the allowed list; if unsure pick the single most likely.',
  '- tags: pick zero or more from the allowed list that genuinely fit.',
  DRAFT_SERVING_RULE,
  NUTRITION_RULE,
  '- steps: write short imperative cooking instructions in order that use the given ingredients.',
].join('\n')

const RECIPE_JSON_SCHEMA = {
  name: 'recipe',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      name: { type: 'string' },
      meal_types: { type: 'array', items: { type: 'string', enum: [...MEAL_TYPES] } },
      tags: { type: 'array', items: { type: 'string', enum: [...RECIPE_TAGS] } },
      nutrients: {
        type: 'object',
        additionalProperties: false,
        properties: Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, { type: ['number', 'null'] }])),
        required: [...NUTRIENT_KEYS],
      },
      nutrition_estimated: { type: 'boolean' },
      ingredients: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: { amount: { type: 'string' }, item: { type: 'string' } },
          required: ['amount', 'item'],
        },
      },
      steps: { type: 'array', items: { type: 'string' } },
    },
    required: ['name', 'meal_types', 'tags', 'nutrients', 'nutrition_estimated', 'ingredients', 'steps'],
  },
} as const

export function buildExtractionRequest(model: string, input: ExtractionInput): ExtractionRequest {
  const instruction = 'Extract the recipe as JSON using the provided schema.'
  const content =
    input.kind === 'text'
      ? [{ type: 'text', text: `${instruction}\n\nContent:\n${input.text}` }]
      : [
          { type: 'text', text: `${instruction} The image may be a handwritten card or a cookbook page.` },
          { type: 'image_url', image_url: { url: input.imageDataUrl } },
        ]
  return {
    model,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content },
    ],
    response_format: { type: 'json_schema', json_schema: RECIPE_JSON_SCHEMA },
  }
}

export interface DraftInput {
  name: string
  ingredients: Array<{ amount: string; item: string }>
}

export function buildDraftRequest(model: string, input: DraftInput): ExtractionRequest {
  const list = input.ingredients
    .map((i) => `- ${[i.amount, i.item].filter(Boolean).join(' ')}`)
    .join('\n')
  const text = [
    'Complete this recipe as JSON using the provided schema.',
    input.name ? `Name: ${input.name}` : 'Name: (none given — you may suggest one)',
    'Ingredients (already for one person):',
    list,
  ].join('\n')
  return {
    model,
    messages: [
      { role: 'system', content: DRAFT_SYSTEM },
      { role: 'user', content: [{ type: 'text', text }] },
    ],
    response_format: { type: 'json_schema', json_schema: RECIPE_JSON_SCHEMA },
  }
}
