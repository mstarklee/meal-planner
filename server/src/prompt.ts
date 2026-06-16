import { MEAL_TYPES, RECIPE_TAGS } from '../../src/lib/recipe'

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
  '- Nutrition (calories, protein, fiber) is PER SERVING. If the content states them, use those and set nutrition_estimated=false. If not, estimate sensible integers and set nutrition_estimated=true. Use null only if you truly cannot estimate.',
  '- ingredients: each has an amount (e.g. "200 g", "1 cup", or "" if none) and an item (the food).',
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
      calories: { type: ['integer', 'null'] },
      protein: { type: ['integer', 'null'] },
      fiber: { type: ['integer', 'null'] },
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
    required: ['name', 'meal_types', 'tags', 'calories', 'protein', 'fiber', 'nutrition_estimated', 'ingredients', 'steps'],
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
