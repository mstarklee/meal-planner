# Meal Planner — AI Import (Plan 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.
> **NO TDD (user preference):** implement code directly — do NOT write failing tests first. Still add the unit tests shown here alongside the implementation, and still verify with `npx tsc -b`, `npm run typecheck:server`, `npm test`, and `npm run build`. Start on a feature branch `feat/ai-import` off `main`; do NOT commit to `main`.

**Goal:** Add AI-assisted recipe import: a standalone Node + Hono backend that proxies OpenAI `gpt-4o` (key hidden server-side) to turn a pasted text / photo / blog link / YouTube link into a structured recipe draft, and a client flow that previews the draft in the existing `RecipeForm` for the user to edit and Approve & Save.

**Architecture:** A new `server/` Hono service exposes `POST /api/import-recipe`, JWT-gated via Supabase `getUser`. It resolves each source to text (or an image), calls OpenAI Chat Completions with Structured Outputs (strict `json_schema`), validates the result against a zod schema **shared with the frontend** (`src/lib/recipeDraft.ts`), and returns a `RecipeDraft`. The client (`src/lib/recipeImport.ts`) posts to the server with the Supabase access token, maps the draft to a `RecipeInput`, and navigates to `RecipeForm` prefilled via router state — reusing the entire Plan 2 add/edit/save path.

**Tech Stack (already in place from Plans 1–2):** React 19 + TS + Vite PWA, Tailwind v3 (pinned 3.4.19), `@supabase/supabase-js` 2, `zod` 4, `react-router-dom` 7, Vitest 4 + RTL. New for this plan: `hono`, `@hono/node-server`, `tsx` (dev runner). OpenAI is called over plain `fetch` (no SDK). Node 20+ (global `fetch`, `AbortSignal.timeout`).

> **Conventions to match:** `verbatimModuleSyntax` is on everywhere → type-only imports use `import type`. `noUnusedLocals`/`noUnusedParameters` on. Supabase rows cast manually. Default exports for route screens. The server is typechecked separately via `npm run typecheck:server` (do NOT add it to the frontend `tsc -b`). Use `[REDACTED]` placeholders in any committed `.env.example`.

---

## File Structure

```
server/
├── tsconfig.json                 # Node tsconfig (bundler resolution, noEmit); includes ../src/lib shared files
├── .env.example                  # OPENAI_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, PORT, ALLOWED_ORIGIN (placeholders)
└── src/
    ├── errors.ts                 # ImportError (message + http status)
    ├── prompt.ts                 # buildExtractionRequest + the strict JSON schema (pure)
    ├── prompt.test.ts
    ├── extract.ts                # assertSafeUrl, htmlToText, extractShortDescription, fetchBlogText, fetchYoutubeText
    ├── extract.test.ts
    ├── openai.ts                 # callOpenAI(apiKey, req) -> raw recipe object
    ├── auth.ts                   # verifySupabaseToken(token) -> userId | null
    ├── importHandler.ts          # handleImport(body, apiKey) -> { draft } (orchestration)
    ├── importHandler.test.ts
    ├── app.ts                    # Hono app: CORS, /health, POST /api/import-recipe — exports `app`
    ├── app.test.ts
    └── index.ts                  # entry: imports app, serve() on PORT

src/lib/
├── recipeDraft.ts                # recipeDraftSchema (zod) + RecipeDraft + draftToRecipeInput() — SHARED
├── recipeDraft.test.ts
├── recipeImport.ts               # client: importRecipe(payload) -> RecipeDraft (fetch VITE_IMPORT_API_URL)
├── recipeImport.test.ts
└── image.ts                      # fileToDownscaledDataUrl(file, maxDim) (canvas; browser-only, untested)

src/routes/
├── RecipeImport.tsx              # source picker + inputs + Generate; navigates to /recipes/new with state.draft
└── RecipeForm.tsx                # MODIFY: seed initial state from location.state.draft (new mode only)

src/routes/Recipes.tsx            # MODIFY: "+ Add" -> /recipes/import
src/App.tsx                       # MODIFY: add <Route path="recipes/import">
package.json                      # MODIFY: deps + scripts
.env.example                      # MODIFY: add VITE_IMPORT_API_URL
.gitignore                        # MODIFY: ignore server/.env
```

---

## Task 1: Shared recipe-draft contract (`src/lib/recipeDraft.ts`)

**Files:** Create `src/lib/recipeDraft.ts`, `src/lib/recipeDraft.test.ts`.

- [ ] **Step 1: Implement** `src/lib/recipeDraft.ts`:

```ts
import { z } from 'zod'
import { MEAL_TYPES, RECIPE_TAGS } from './recipe'
import type { RecipeInput } from './recipe'

// What the import backend returns. The model is constrained by the server's strict
// json_schema; this schema re-validates defensively and the client maps it to a RecipeInput.
export const recipeDraftSchema = z.object({
  name: z.string().default(''),
  meal_types: z.array(z.enum(MEAL_TYPES)).default([]),
  tags: z.array(z.enum(RECIPE_TAGS)).default([]),
  calories: z.number().int().nonnegative().nullable().default(null),
  protein: z.number().int().nonnegative().nullable().default(null),
  fiber: z.number().int().nonnegative().nullable().default(null),
  nutrition_estimated: z.boolean().default(false),
  ingredients: z.array(z.object({ amount: z.string().default(''), item: z.string() })).default([]),
  steps: z.array(z.string()).default([]),
  link_url: z.string().default(''),
})

export type RecipeDraft = z.infer<typeof recipeDraftSchema>

export function draftToRecipeInput(draft: RecipeDraft): RecipeInput {
  return {
    name: draft.name,
    photo_url: '',
    link_url: draft.link_url,
    meal_types: draft.meal_types,
    tags: draft.tags,
    calories: draft.calories,
    protein: draft.protein,
    fiber: draft.fiber,
    nutrition_estimated: draft.nutrition_estimated,
    ingredients: draft.ingredients.map((i) => ({ amount: i.amount, item: i.item })),
    steps: draft.steps,
    is_shared: false,
  }
}
```

- [ ] **Step 2: Add tests** `src/lib/recipeDraft.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { recipeDraftSchema, draftToRecipeInput } from './recipeDraft'

describe('recipeDraftSchema', () => {
  it('fills defaults for a sparse payload', () => {
    const out = recipeDraftSchema.parse({ name: 'Soup' })
    expect(out.meal_types).toEqual([])
    expect(out.calories).toBeNull()
    expect(out.nutrition_estimated).toBe(false)
    expect(out.ingredients).toEqual([])
  })
  it('rejects an unknown meal type', () => {
    expect(recipeDraftSchema.safeParse({ name: 'X', meal_types: ['brunch'] }).success).toBe(false)
  })
})

describe('draftToRecipeInput', () => {
  it('maps a draft into a saveable RecipeInput with private defaults', () => {
    const input = draftToRecipeInput(recipeDraftSchema.parse({
      name: 'Dal', meal_types: ['dinner'], tags: ['veg'],
      calories: 300, protein: 18, fiber: 9, nutrition_estimated: true,
      ingredients: [{ amount: '1 cup', item: 'lentils' }], steps: ['Boil'], link_url: 'https://x.test',
    }))
    expect(input.photo_url).toBe('')
    expect(input.is_shared).toBe(false)
    expect(input.link_url).toBe('https://x.test')
    expect(input.ingredients).toEqual([{ amount: '1 cup', item: 'lentils' }])
    expect(input.nutrition_estimated).toBe(true)
  })
})
```

- [ ] **Step 3: Verify** — `npx tsc -b` (clean) and `npm test src/lib/recipeDraft.test.ts` (pass).
- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat: shared recipe-draft schema and mapping" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"`.

---

## Task 2: Backend scaffolding (deps, tsconfig, env, errors, gitignore)

**Files:** Modify `package.json`, `.gitignore`; create `server/tsconfig.json`, `server/.env.example`, `server/src/errors.ts`.

- [ ] **Step 1: Install deps** (run from repo root):

```bash
npm install hono @hono/node-server
npm install -D tsx
```

- [ ] **Step 2: Add scripts** to `package.json` `"scripts"` (keep existing):

```json
"server": "tsx watch server/src/index.ts",
"server:start": "tsx server/src/index.ts",
"typecheck:server": "tsc -p server/tsconfig.json"
```

- [ ] **Step 3: Create `server/tsconfig.json`:**

```json
{
  "compilerOptions": {
    "target": "es2022",
    "lib": ["ES2023"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "types": ["node"],
    "strict": true,
    "verbatimModuleSyntax": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noEmit": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src", "../src/lib/recipe.ts", "../src/lib/recipeDraft.ts"]
}
```

- [ ] **Step 4: Create `server/.env.example`:**

```
# OpenAI key used server-side only (never sent to the browser)
OPENAI_API_KEY=[REDACTED]
# Supabase project — used to verify the caller's access token
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=[REDACTED_PUBLISHABLE_KEY]
# Local dev
PORT=8787
ALLOWED_ORIGIN=http://localhost:5173
```

- [ ] **Step 5: Create `server/src/errors.ts`:**

```ts
export class ImportError extends Error {
  status: number
  detail?: string
  constructor(message: string, status = 400, detail?: string) {
    super(message)
    this.name = 'ImportError'
    this.status = status
    this.detail = detail
  }
}
```

- [ ] **Step 6: Update `.gitignore`** — ensure these lines exist (append if missing):

```
server/.env
.env
```

- [ ] **Step 7: Verify** — `npm run typecheck:server` (clean; only `errors.ts` + shared files present so far). `npx tsc -b` still clean.
- [ ] **Step 8: Commit** — `git add -A && git commit -m "chore: scaffold Hono backend (deps, tsconfig, env, errors)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"`.

---

## Task 3: Prompt builder + strict JSON schema (`server/src/prompt.ts`)

**Files:** Create `server/src/prompt.ts`, `server/src/prompt.test.ts`.

- [ ] **Step 1: Implement** `server/src/prompt.ts`:

```ts
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
```

- [ ] **Step 2: Add tests** `server/src/prompt.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildExtractionRequest } from './prompt'
import { MEAL_TYPES } from '../../src/lib/recipe'

describe('buildExtractionRequest', () => {
  it('embeds pasted text and a strict json_schema', () => {
    const req = buildExtractionRequest('gpt-4o', { kind: 'text', text: 'Boil pasta' })
    const rf = req.response_format as { type: string; json_schema: { strict: boolean; schema: { properties: { meal_types: { items: { enum: string[] } } } } } }
    expect(rf.type).toBe('json_schema')
    expect(rf.json_schema.strict).toBe(true)
    expect(rf.json_schema.schema.properties.meal_types.items.enum).toEqual([...MEAL_TYPES])
    expect(JSON.stringify(req.messages)).toContain('Boil pasta')
  })
  it('sends an image_url part for image input', () => {
    const req = buildExtractionRequest('gpt-4o', { kind: 'image', imageDataUrl: 'data:image/jpeg;base64,AAA' })
    expect(JSON.stringify(req.messages)).toContain('data:image/jpeg;base64,AAA')
    expect(JSON.stringify(req.messages)).toContain('image_url')
  })
})
```

- [ ] **Step 3: Verify** — `npm run typecheck:server` (clean); `npm test server/src/prompt.test.ts` (pass).
- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat: openai extraction prompt + strict recipe json schema" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"`.

---

## Task 4: Source extraction (`server/src/extract.ts`)

**Files:** Create `server/src/extract.ts`, `server/src/extract.test.ts`. Server-side fetch + parse for blog/YouTube, with an SSRF guard. YouTube is best-effort (title + description; captions are not parsed — documented limitation).

- [ ] **Step 1: Implement** `server/src/extract.ts`:

```ts
import { ImportError } from './errors'

function isPrivateHost(host: string): boolean {
  if (host === 'localhost' || host === '0.0.0.0' || host === '::1' || host.endsWith('.local')) return true
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!m) return false
  const a = Number(m[1]), b = Number(m[2])
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 192 && b === 168) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 169 && b === 254) return true
  return false
}

export function assertSafeUrl(raw: string): URL {
  let url: URL
  try { url = new URL(raw) } catch { throw new ImportError("That doesn't look like a valid URL", 400) }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new ImportError('Only http(s) links are supported', 400)
  if (isPrivateHost(url.hostname.toLowerCase())) throw new ImportError('That host is not allowed', 400)
  return url
}

export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function fetchBlogText(rawUrl: string): Promise<string> {
  const url = assertSafeUrl(rawUrl)
  let res: Response
  try {
    res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 meal-planner', 'accept-language': 'en' }, signal: AbortSignal.timeout(10_000) })
  } catch { throw new ImportError('Could not reach that page', 502) }
  if (!res.ok) throw new ImportError(`Could not fetch that page (${res.status})`, 502)
  const text = htmlToText(await res.text())
  if (text.length < 50) throw new ImportError('Could not read recipe text from that page', 422)
  return text.slice(0, 20_000)
}

function youtubeId(url: URL): string | null {
  if (url.hostname === 'youtu.be') return url.pathname.slice(1) || null
  if (url.hostname.endsWith('youtube.com')) return url.searchParams.get('v')
  return null
}

export function extractShortDescription(html: string): string {
  const m = html.match(/"shortDescription":"((?:\\.|[^"\\])*)"/)
  if (!m) return ''
  try { return JSON.parse(`"${m[1]}"`) as string } catch { return '' }
}

export async function fetchYoutubeText(rawUrl: string): Promise<string> {
  const url = assertSafeUrl(rawUrl)
  const id = youtubeId(url)
  if (!id) throw new ImportError('That is not a recognizable YouTube link', 400)
  let html: string
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${id}`, {
      headers: { 'user-agent': 'Mozilla/5.0', 'accept-language': 'en' },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) throw new ImportError(`Could not fetch the video page (${res.status})`, 502)
    html = await res.text()
  } catch (e) {
    if (e instanceof ImportError) throw e
    throw new ImportError('Could not reach YouTube', 502)
  }
  const title = (html.match(/<meta name="title" content="([^"]*)"/)?.[1] ?? '').trim()
  const desc = extractShortDescription(html).trim()
  const combined = [title, desc].filter((s) => s.length > 0).join('\n\n').trim()
  if (combined.length < 40) {
    throw new ImportError("Couldn't read a recipe from this video — try pasting the recipe text or a blog link", 422)
  }
  return combined.slice(0, 20_000)
}
```

- [ ] **Step 2: Add tests** `server/src/extract.test.ts` (pure functions only — no network):

```ts
import { describe, it, expect } from 'vitest'
import { assertSafeUrl, htmlToText, extractShortDescription } from './extract'

describe('assertSafeUrl', () => {
  it('accepts a public https url', () => {
    expect(assertSafeUrl('https://example.com/recipe').hostname).toBe('example.com')
  })
  it('rejects non-http(s) schemes', () => {
    expect(() => assertSafeUrl('file:///etc/passwd')).toThrow()
  })
  it('rejects private / loopback hosts', () => {
    expect(() => assertSafeUrl('http://localhost:8787')).toThrow()
    expect(() => assertSafeUrl('http://127.0.0.1')).toThrow()
    expect(() => assertSafeUrl('http://192.168.1.10')).toThrow()
    expect(() => assertSafeUrl('http://169.254.169.254')).toThrow()
  })
})

describe('htmlToText', () => {
  it('strips tags, scripts, and decodes basic entities', () => {
    const out = htmlToText('<style>x{}</style><p>Salt &amp; Pepper</p><script>bad()</script>')
    expect(out).toBe('Salt & Pepper')
  })
})

describe('extractShortDescription', () => {
  it('pulls and unescapes the YouTube shortDescription', () => {
    const html = 'xx"shortDescription":"Line 1\\nLine 2"yy'
    expect(extractShortDescription(html)).toBe('Line 1\nLine 2')
  })
  it('returns empty string when absent', () => {
    expect(extractShortDescription('<html></html>')).toBe('')
  })
})
```

- [ ] **Step 3: Verify** — `npm run typecheck:server`; `npm test server/src/extract.test.ts`.
- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat: blog/youtube text extraction with SSRF guard" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"`.

---

## Task 5: OpenAI client (`server/src/openai.ts`)

**Files:** Create `server/src/openai.ts`.

- [ ] **Step 1: Implement** `server/src/openai.ts`:

```ts
import type { ExtractionRequest } from './prompt'
import { ImportError } from './errors'

export async function callOpenAI(apiKey: string, req: ExtractionRequest): Promise<unknown> {
  let res: Response
  try {
    res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(req),
      signal: AbortSignal.timeout(45_000),
    })
  } catch { throw new ImportError('Could not reach the AI service', 502) }
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new ImportError(`AI request failed (${res.status})`, 502, detail.slice(0, 500))
  }
  const json = (await res.json().catch(() => null)) as { choices?: { message?: { content?: string } }[] } | null
  const content = json?.choices?.[0]?.message?.content
  if (!content) throw new ImportError('AI returned an empty response', 502)
  try { return JSON.parse(content) } catch { throw new ImportError('AI returned malformed JSON', 502) }
}
```

- [ ] **Step 2: Verify** — `npm run typecheck:server`.
- [ ] **Step 3: Commit** — `git add -A && git commit -m "feat: openai chat-completions client" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"`.

---

## Task 6: Auth + import orchestration (`server/src/auth.ts`, `server/src/importHandler.ts`)

**Files:** Create `server/src/auth.ts`, `server/src/importHandler.ts`, `server/src/importHandler.test.ts`.

- [ ] **Step 1: Implement** `server/src/auth.ts`:

```ts
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL ?? ''
const anonKey = process.env.SUPABASE_ANON_KEY ?? ''
const supabase = createClient(url, anonKey)

// Verifies a Supabase access token and returns the user id, or null if invalid.
export async function verifySupabaseToken(token: string): Promise<string | null> {
  if (!token) return null
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) return null
  return data.user.id
}
```

- [ ] **Step 2: Implement** `server/src/importHandler.ts`:

```ts
import { z } from 'zod'
import { buildExtractionRequest } from './prompt'
import type { ExtractionInput } from './prompt'
import { fetchBlogText, fetchYoutubeText } from './extract'
import { callOpenAI } from './openai'
import { recipeDraftSchema } from '../../src/lib/recipeDraft'
import type { RecipeDraft } from '../../src/lib/recipeDraft'
import { ImportError } from './errors'

const MODEL = 'gpt-4o'

const bodySchema = z.union([
  z.object({ source: z.literal('text'), text: z.string().min(1) }),
  z.object({ source: z.literal('photo'), imageDataUrl: z.string().startsWith('data:image/') }),
  z.object({ source: z.literal('blog'), url: z.string().min(1) }),
  z.object({ source: z.literal('youtube'), url: z.string().min(1) }),
])

export async function handleImport(rawBody: unknown, apiKey: string): Promise<{ draft: RecipeDraft }> {
  const parsed = bodySchema.safeParse(rawBody)
  if (!parsed.success) throw new ImportError('Invalid import request', 400)
  const body = parsed.data

  let input: ExtractionInput
  let linkUrl = ''
  if (body.source === 'text') input = { kind: 'text', text: body.text }
  else if (body.source === 'photo') input = { kind: 'image', imageDataUrl: body.imageDataUrl }
  else if (body.source === 'blog') { input = { kind: 'text', text: await fetchBlogText(body.url) }; linkUrl = body.url }
  else { input = { kind: 'text', text: await fetchYoutubeText(body.url) }; linkUrl = body.url }

  const raw = await callOpenAI(apiKey, buildExtractionRequest(MODEL, input))
  const result = recipeDraftSchema.safeParse({ ...(raw as object), link_url: linkUrl })
  if (!result.success) throw new ImportError('AI returned an unexpected recipe shape', 502)
  return { draft: result.data }
}
```

- [ ] **Step 3: Add tests** `server/src/importHandler.test.ts` (mock `openai` + `extract`):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./openai', () => ({ callOpenAI: vi.fn() }))
vi.mock('./extract', () => ({ fetchBlogText: vi.fn(), fetchYoutubeText: vi.fn() }))

import { handleImport } from './importHandler'
import { callOpenAI } from './openai'
import { fetchBlogText } from './extract'

const MODEL_OUT = {
  name: 'Tomato Soup', meal_types: ['lunch'], tags: ['veg'],
  calories: 180, protein: 5, fiber: 4, nutrition_estimated: true,
  ingredients: [{ amount: '2', item: 'tomatoes' }], steps: ['Blend', 'Heat'],
}

describe('handleImport', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns a validated draft for pasted text', async () => {
    vi.mocked(callOpenAI).mockResolvedValue(MODEL_OUT)
    const { draft } = await handleImport({ source: 'text', text: 'tomato soup recipe' }, 'key')
    expect(draft.name).toBe('Tomato Soup')
    expect(draft.link_url).toBe('')
    expect(draft.ingredients).toEqual([{ amount: '2', item: 'tomatoes' }])
  })

  it('fetches blog text and stamps the source url as link_url', async () => {
    vi.mocked(fetchBlogText).mockResolvedValue('some recipe text')
    vi.mocked(callOpenAI).mockResolvedValue(MODEL_OUT)
    const { draft } = await handleImport({ source: 'blog', url: 'https://x.test/r' }, 'key')
    expect(fetchBlogText).toHaveBeenCalledWith('https://x.test/r')
    expect(draft.link_url).toBe('https://x.test/r')
  })

  it('rejects an invalid body', async () => {
    await expect(handleImport({ source: 'text' }, 'key')).rejects.toThrow()
  })
})
```

- [ ] **Step 4: Verify** — `npm run typecheck:server`; `npm test server/src/importHandler.test.ts`.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: import auth + orchestration handler" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"`.

---

## Task 7: Hono app + entry (`server/src/app.ts`, `server/src/index.ts`)

**Files:** Create `server/src/app.ts`, `server/src/index.ts`, `server/src/app.test.ts`.

- [ ] **Step 1: Implement** `server/src/app.ts`:

```ts
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { handleImport } from './importHandler'
import { verifySupabaseToken } from './auth'
import { ImportError } from './errors'

export const app = new Hono()

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? 'http://localhost:5173'

app.use('*', cors({
  origin: ALLOWED_ORIGIN,
  allowHeaders: ['authorization', 'content-type'],
  allowMethods: ['POST', 'GET', 'OPTIONS'],
}))

app.get('/health', (c) => c.json({ ok: true }))

app.post('/api/import-recipe', async (c) => {
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
```

- [ ] **Step 2: Implement** `server/src/index.ts`:

```ts
import { serve } from '@hono/node-server'
import { app } from './app'

const port = Number(process.env.PORT ?? 8787)
serve({ fetch: app.fetch, port })
console.log(`import server listening on :${port}`)
```

- [ ] **Step 3: Add tests** `server/src/app.test.ts` (mock auth + handler so no network/env needed):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./auth', () => ({ verifySupabaseToken: vi.fn() }))
vi.mock('./importHandler', () => ({ handleImport: vi.fn() }))

import { app } from './app'
import { verifySupabaseToken } from './auth'
import { handleImport } from './importHandler'

beforeEach(() => {
  vi.clearAllMocks()
  process.env.OPENAI_API_KEY = 'test-key'
})

function post(headers: Record<string, string>) {
  return app.request('/api/import-recipe', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ source: 'text', text: 'x' }),
  })
}

describe('POST /api/import-recipe', () => {
  it('401s without a valid token', async () => {
    vi.mocked(verifySupabaseToken).mockResolvedValue(null)
    const res = await post({})
    expect(res.status).toBe(401)
    expect(handleImport).not.toHaveBeenCalled()
  })

  it('returns the draft for an authorized caller', async () => {
    vi.mocked(verifySupabaseToken).mockResolvedValue('u1')
    vi.mocked(handleImport).mockResolvedValue({ draft: { name: 'Soup' } } as never)
    const res = await post({ authorization: 'Bearer good' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ draft: { name: 'Soup' } })
  })
})

describe('GET /health', () => {
  it('responds ok', async () => {
    const res = await app.request('/health')
    expect(await res.json()).toEqual({ ok: true })
  })
})
```

- [ ] **Step 4: Verify** — `npm run typecheck:server`; `npm test server/src/app.test.ts`. If the `ContentfulStatusCode` import path errors in the installed Hono version, replace the cast with `err.status as 400` (any valid numeric literal) — the value is still `err.status` at runtime.
- [ ] **Step 5: Smoke-run (optional, manual):** with a real `server/.env`, `npm run server` then `curl localhost:8787/health` → `{"ok":true}`.
- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: hono import server app + entry" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"`.

---

## Task 8: Client import lib + image downscale (`src/lib/recipeImport.ts`, `src/lib/image.ts`)

**Files:** Create `src/lib/recipeImport.ts`, `src/lib/recipeImport.test.ts`, `src/lib/image.ts`.

- [ ] **Step 1: Implement** `src/lib/image.ts` (browser-only; not unit-tested — jsdom lacks canvas):

```ts
// Reads an image File, downscales its longest side to maxDim, returns a JPEG data URL.
export async function fileToDownscaledDataUrl(file: File, maxDim: number): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Could not read file'))
    reader.readAsDataURL(file)
  })
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error('Could not decode image'))
    el.src = dataUrl
  })
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
  if (scale >= 1) return dataUrl
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * scale)
  canvas.height = Math.round(img.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) return dataUrl
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.85)
}
```

- [ ] **Step 2: Implement** `src/lib/recipeImport.ts`:

```ts
import { supabase } from './supabase'
import { recipeDraftSchema } from './recipeDraft'
import type { RecipeDraft } from './recipeDraft'

export type ImportPayload =
  | { source: 'text'; text: string }
  | { source: 'photo'; imageDataUrl: string }
  | { source: 'blog'; url: string }
  | { source: 'youtube'; url: string }

export async function importRecipe(payload: ImportPayload): Promise<RecipeDraft> {
  const api = import.meta.env.VITE_IMPORT_API_URL as string | undefined
  if (!api) throw new Error('Import is not configured (VITE_IMPORT_API_URL missing)')
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) throw new Error('You must be signed in to import')

  const res = await fetch(`${api}/api/import-recipe`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const json = (await res.json().catch(() => null)) as { draft?: unknown; error?: string } | null
  if (!res.ok) throw new Error(json?.error ?? `Import failed (${res.status})`)
  const parsed = recipeDraftSchema.safeParse(json?.draft)
  if (!parsed.success) throw new Error('Got an unexpected response from the import service')
  return parsed.data
}
```

- [ ] **Step 3: Add tests** `src/lib/recipeImport.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('./supabase', () => ({
  supabase: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'tok' } } }) } },
}))

import { importRecipe } from './recipeImport'

beforeEach(() => { vi.stubEnv('VITE_IMPORT_API_URL', 'http://test.local') })
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('importRecipe', () => {
  it('posts the payload with a bearer token and returns the parsed draft', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ draft: { name: 'Soup', meal_types: ['lunch'] } }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const draft = await importRecipe({ source: 'text', text: 'soup' })
    expect(draft.name).toBe('Soup')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://test.local/api/import-recipe')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok')
  })

  it('throws the server error message on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })))
    await expect(importRecipe({ source: 'text', text: 'x' })).rejects.toThrow('Unauthorized')
  })
})
```

- [ ] **Step 4: Verify** — `npx tsc -b`; `npm test src/lib/recipeImport.test.ts`.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: client recipe-import lib + image downscale" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"`.

---

## Task 9: Import screen (`src/routes/RecipeImport.tsx`)

**Files:** Create `src/routes/RecipeImport.tsx`. Source picker + per-source input + Generate; on success navigates to `/recipes/new` with `state.draft` (a `RecipeInput`). Match brand styling and the `px-6 py-8 max-w-md mx-auto` container.

- [ ] **Step 1: Implement** `src/routes/RecipeImport.tsx`:

```tsx
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { importRecipe } from '../lib/recipeImport'
import type { ImportPayload } from '../lib/recipeImport'
import { draftToRecipeInput } from '../lib/recipeDraft'
import { fileToDownscaledDataUrl } from '../lib/image'

type Source = 'text' | 'photo' | 'blog' | 'youtube'
const SOURCES: { key: Source; label: string }[] = [
  { key: 'text', label: 'Paste text' },
  { key: 'photo', label: 'Photo' },
  { key: 'blog', label: 'Blog link' },
  { key: 'youtube', label: 'YouTube' },
]

export default function RecipeImport() {
  const nav = useNavigate()
  const [source, setSource] = useState<Source>('text')
  const [text, setText] = useState('')
  const [url, setUrl] = useState('')
  const [imageDataUrl, setImageDataUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) { return }
    setError(null)
    try { setImageDataUrl(await fileToDownscaledDataUrl(file, 1024)) }
    catch { setError('Could not read that image') }
  }

  function buildPayload(): ImportPayload | null {
    if (source === 'text') { return text.trim() ? { source, text } : null }
    if (source === 'photo') { return imageDataUrl ? { source, imageDataUrl } : null }
    return url.trim() ? { source, url } : null
  }

  async function generate() {
    const payload = buildPayload()
    if (!payload) { setError('Add something to import first'); return }
    setError(null)
    setBusy(true)
    try {
      const draft = await importRecipe(payload)
      nav('/recipes/new', { state: { draft: draftToRecipeInput(draft) } })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen px-6 py-8 max-w-md mx-auto">
      <h1 className="text-2xl font-bold text-brand mb-1">Import a recipe</h1>
      <p className="text-gray-500 mb-5">AI reads the source and fills in a draft you can review.</p>

      <div role="tablist" aria-label="Import source" className="flex flex-wrap gap-2">
        {SOURCES.map((s) => (
          <button key={s.key} type="button" role="tab" aria-selected={source === s.key}
            onClick={() => { setSource(s.key); setError(null) }}
            className={`text-xs px-3 py-1.5 rounded-full font-semibold border ${
              source === s.key ? 'bg-brand text-white border-brand' : 'border-gray-300 text-gray-500'}`}>
            {s.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {source === 'text' && (
          <textarea aria-label="Recipe text" value={text} onChange={(e) => setText(e.target.value)} rows={8}
            placeholder="Paste a recipe or a message…" className="w-full border rounded-xl p-3" />
        )}
        {source === 'photo' && (
          <div>
            <input type="file" accept="image/*" aria-label="Recipe photo" onChange={onPhoto} />
            {imageDataUrl && <img src={imageDataUrl} alt="" className="w-full rounded-xl mt-3 object-cover" />}
          </div>
        )}
        {(source === 'blog' || source === 'youtube') && (
          <input type="url" aria-label={source === 'blog' ? 'Blog URL' : 'YouTube URL'} value={url}
            onChange={(e) => setUrl(e.target.value)} placeholder="https://…"
            className="w-full border rounded-xl p-3" />
        )}
      </div>

      {error && <p className="text-red-600 text-sm mt-4">{error}</p>}

      <button disabled={busy} onClick={generate}
        className="w-full mt-5 bg-brand text-white font-bold rounded-xl p-3 disabled:opacity-50">
        {busy ? 'Reading…' : 'Generate draft'}
      </button>
      <Link to="/recipes/new" className="block text-center text-brand font-semibold text-sm mt-3">
        Enter manually instead
      </Link>
    </div>
  )
}
```

- [ ] **Step 2: Verify** — `npx tsc -b`. (No test required; logic is thin and the lib it calls is tested.)
- [ ] **Step 3: Commit** — `git add -A && git commit -m "feat: AI import screen" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"`.

---

## Task 10: Wire it together (RecipeForm prefill, library entry, route, env)

**Files:** Modify `src/routes/RecipeForm.tsx`, `src/routes/Recipes.tsx`, `src/App.tsx`, `.env.example`. Update `src/routes/RecipeForm.test.tsx` (a draft-prefill test).

- [ ] **Step 1: Seed `RecipeForm` from router state.** In `src/routes/RecipeForm.tsx`, add `useLocation` to the router import and read the draft. Change the import line:

```tsx
import { useNavigate, useParams, useLocation } from 'react-router-dom'
```

Immediately after `const { id } = useParams()` add:

```tsx
  const location = useLocation()
  const draft = (location.state as { draft?: RecipeInput } | null)?.draft ?? null
```

Then change each initial `useState(...)` for the form fields to seed from `draft` (new mode only — edit mode still loads via `getRecipe`). Replace the state-declaration block with:

```tsx
  const [loading, setLoading] = useState(Boolean(id))
  const [busy, setBusy] = useState(false)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState(() => draft?.name ?? '')
  const [photoUrl, setPhotoUrl] = useState(() => draft?.photo_url ?? '')
  const [mealTypes, setMealTypes] = useState<string[]>(() => draft?.meal_types ?? [])
  const [tags, setTags] = useState<string[]>(() => draft?.tags ?? [])
  const [calories, setCalories] = useState<number | null>(() => draft?.calories ?? null)
  const [protein, setProtein] = useState<number | null>(() => draft?.protein ?? null)
  const [fiber, setFiber] = useState<number | null>(() => draft?.fiber ?? null)
  const [nutritionEstimated, setNutritionEstimated] = useState(() => draft?.nutrition_estimated ?? false)
  const [ingredients, setIngredients] = useState<IngredientRow[]>(
    () => (draft?.ingredients ?? []).map((i) => ({ id: crypto.randomUUID(), amount: i.amount, item: i.item })),
  )
  const [steps, setSteps] = useState<string[]>(() => draft?.steps ?? [])
  const [linkUrl, setLinkUrl] = useState(() => draft?.link_url ?? '')
  const [isShared, setIsShared] = useState(() => draft?.is_shared ?? false)
```

(The edit-mode `useEffect` that calls `getRecipe` is unchanged and only runs when `id` is set, so it overrides these seeds in edit mode. In new mode with no draft, all seeds are the same empty defaults as before.)

- [ ] **Step 2: Library entry point.** In `src/routes/Recipes.tsx`, change the "+ Add" target from `/recipes/new` to `/recipes/import`:

```tsx
        <Link to="/recipes/import" className="bg-brand text-white font-bold rounded-xl px-4 py-2 text-sm">
          + Add
        </Link>
```

- [ ] **Step 3: Route.** In `src/App.tsx`, import the screen and add the route inside the `AppShell` group (next to the other `recipes` routes):

```tsx
import RecipeImport from './routes/RecipeImport'
```

```tsx
                  <Route path="recipes" element={<Recipes />} />
                  <Route path="recipes/import" element={<RecipeImport />} />
                  <Route path="recipes/new" element={<RecipeForm />} />
                  <Route path="recipes/:id" element={<RecipeDetail />} />
                  <Route path="recipes/:id/edit" element={<RecipeForm />} />
```

- [ ] **Step 4: Env.** Append to `.env.example`:

```
# Base URL of the AI-import backend (Hono server). Local dev default:
VITE_IMPORT_API_URL=http://localhost:8787
```

Also add the same line to your real `.env.local` so dev works.

- [ ] **Step 5: Make the router mock cover `useLocation`, then add a prefill test** to `src/routes/RecipeForm.test.tsx`.

> **CRITICAL:** the existing tests render `<RecipeForm />` **bare** (no Router provider) and rely on `useParams`/`useNavigate` being mocked. Adding a real `useLocation` to the component would throw "useLocation() may be used only in the context of a Router" in every existing test. So `useLocation` MUST also be mocked. Do NOT switch the existing tests to `MemoryRouter`.

First, change the mock setup at the top of the file. Replace:

```tsx
let mockParams: { id?: string } = {}
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useParams: () => mockParams, useNavigate: () => vi.fn() }
})
```

with:

```tsx
let mockParams: { id?: string } = {}
let mockLocation: { state: unknown } = { state: null }
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useParams: () => mockParams, useNavigate: () => vi.fn(), useLocation: () => mockLocation }
})
```

Then in the existing `beforeEach`, reset it alongside `mockParams`:

```tsx
  beforeEach(() => { vi.clearAllMocks(); mockParams = {}; mockLocation = { state: null } })
```

Now add this test inside the `describe`:

```tsx
  it('prefills fields from an import draft passed via router state', () => {
    mockLocation = {
      state: {
        draft: {
          name: 'Imported Bowl', photo_url: '', link_url: 'https://x.test',
          meal_types: ['lunch'], tags: ['veg'], calories: 420, protein: 22, fiber: 7,
          nutrition_estimated: true, ingredients: [{ amount: '1 cup', item: 'rice' }], steps: ['Cook'], is_shared: false,
        },
      },
    }
    renderForm()
    expect(screen.getByDisplayValue('Imported Bowl')).toBeInTheDocument()
    expect(screen.getByLabelText('Calories')).toHaveValue(420)
    expect(screen.getByLabelText('Ingredient 1 item')).toHaveValue('rice')
  })
```

- [ ] **Step 6: Verify** — `npx tsc -b` (clean); `npm run typecheck:server` (clean); `npm test` (ALL pass); `npm run build` (emits `dist/sw.js`).
- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat: wire AI import into the recipe flow" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"`.

---

## Task 11: Final verify, adversarial review, manual E2E, finish

- [ ] **Step 1: Full check** — `npx tsc -b` (clean), `npm run typecheck:server` (clean), `npm test` (all green), `npm run build` (sw.js emitted).

- [ ] **Step 2: Adversarial review Workflow** — run a multi-dimension review over `git diff main...HEAD` (dimensions: **security** [SSRF guard completeness, key never reaches client, JWT verification, prompt-injection blast radius], **spec coverage** [all four sources reach the model; draft→form→save loop; manual fallback preserved], **react/TS correctness** [RecipeForm seed vs edit-mode effect interplay; data-url size; error paths], **server correctness** [body validation, status codes, CORS, Hono handler], **test quality**). Verify each finding with an independent skeptic; fix confirmed in-scope issues; re-verify.

- [ ] **Step 3: Manual E2E** (requires `server/.env` with a real `OPENAI_API_KEY`, `npm run server` + `npm run dev`, signed-in user, migration 0003 applied):
  1. Recipes → **+ Add** → lands on Import. Paste a recipe → **Generate draft** → lands on the prefilled form → tweak → **Save recipe** → detail view shows it.
  2. Photo: pick a recipe photo/screenshot → Generate → draft populates.
  3. Blog link: paste a recipe blog URL → Generate → draft populates with `link_url` set.
  4. YouTube link with a recipe in its description → Generate → draft populates (or a clear "couldn't read this video" message).
  5. "Enter manually instead" → blank `/recipes/new` still works.

- [ ] **Step 4: Finish** — use superpowers:finishing-a-development-branch to merge `feat/ai-import` → `main` (local merge, per the user's pattern) after verification.

> **PENDING USER ACTIONS (cannot be automated):** create `server/.env` from `server/.env.example` with a real `OPENAI_API_KEY` (+ `SUPABASE_URL`/`SUPABASE_ANON_KEY`); run `npm run server` alongside `npm run dev`; set `VITE_IMPORT_API_URL` in `.env.local`. For production (Plan 6): deploy `server/` to Render/Railway/Fly, set its env vars, and point `VITE_IMPORT_API_URL` at the deployed URL.

---

## Self-Review (applied)

- **Spec coverage:** all four sources (text/photo/blog/youtube) → one pipeline (T3–T7); structured draft via strict json_schema (T3); draft validated + mapped (T1) and previewed/edited/saved by reusing `RecipeForm` (T9–T10); AI Import primary with manual fallback (T10); nutrition AI-estimated & flagged (T3 system prompt + `nutrition_estimated`). YouTube is description-based best-effort (caption parsing deferred) — documented in T4.
- **Type consistency:** `RecipeDraft`/`recipeDraftSchema`/`draftToRecipeInput` (T1) used by both server (T6) and client (T8); `ExtractionRequest`/`ExtractionInput` (T3) used by `openai.ts` (T5) and `importHandler.ts` (T6); `ImportPayload` (T8) matches the server `bodySchema` (T6) one-for-one (`text`/`imageDataUrl`/`url`).
- **Security:** key only in server env; endpoint JWT-gated via `verifySupabaseToken` (T6/T7); SSRF guard on fetched URLs (T4); image downscaled before upload (T9).
- **No placeholders:** every code step is complete and runnable.
