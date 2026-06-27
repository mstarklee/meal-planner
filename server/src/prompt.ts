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

const SYSTEM = [
  'You extract a single cooking recipe from the provided content and return it as JSON matching the schema.',
  'Rules:',
  '- Use only information present in the content. Do not invent ingredients or steps.',
  '- meal_types: pick all that apply from the allowed list; if unsure pick the single most likely.',
  '- tags: pick zero or more from the allowed list that genuinely fit.',
  '- Nutrition: provide a `nutrients` object with PER-ONE-PERSON values for these keys: ' + NUTRIENT_KEYS.join(', ') + '.',
  '  Units: calories=kcal; protein/carbs/healthy_fats/fiber/omega_3=grams; vitamin_a/vitamin_d/folate=µg; vitamin_b12=µg; vitamin_c/choline/iron/calcium/potassium/zinc/magnesium=mg.',
  '  If the source serves multiple people, DIVIDE all nutrition by the serving count so values are per one person.',
  '  Use stated values when present; otherwise estimate sensible numbers. Use null only when you truly cannot estimate. Set nutrition_estimated=true if any value was estimated.',
  '- ingredients: amount (e.g. "200 g", "1 cup", or "") and item. NORMALIZE amounts to ONE serving (divide by the source serving count).',
  '- steps: short imperative instructions in order.',
  '- If the content is not a recipe, return name="" with empty ingredients and steps.',
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
