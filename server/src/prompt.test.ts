import { describe, it, expect } from 'vitest'
import { buildExtractionRequest, buildDraftRequest } from './prompt'
import { MEAL_TYPES } from '../../src/lib/recipe'

describe('buildExtractionRequest', () => {
  it('embeds pasted text and a strict json_schema', () => {
    const req = buildExtractionRequest('gpt-4o', { kind: 'text', text: 'Boil pasta' })
    const rf = req.response_format as {
      type: string
      json_schema: { strict: boolean; schema: { properties: { meal_types: { items: { enum: string[] } } } } }
    }
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
  it('only scales when the content states a serving count', () => {
    const sys = JSON.stringify(buildExtractionRequest('gpt-4o', { kind: 'text', text: 'x' }).messages)
    expect(sys).toContain('serves')
    expect(sys).toContain('If no serving count is stated')
    expect(sys).toContain('Never guess a serving count')
  })
})

describe('buildDraftRequest', () => {
  it('lists the typed ingredients and asks for steps + the strict schema', () => {
    const req = buildDraftRequest('gpt-4o', {
      name: 'Rice Bowl',
      ingredients: [{ amount: '1 cup', item: 'rice' }, { amount: '', item: 'salt' }],
    })
    const body = JSON.stringify(req.messages)
    expect(body).toContain('Rice Bowl')
    expect(body).toContain('1 cup rice')
    expect(body).toContain('salt')
    expect(body).toContain('imperative cooking instructions')
    expect(body).toContain('already for one person')
    const rf = req.response_format as { type: string; json_schema: { strict: boolean } }
    expect(rf.type).toBe('json_schema')
    expect(rf.json_schema.strict).toBe(true)
  })
  it('forbids inferring a serving count or scaling the typed quantities', () => {
    const body = JSON.stringify(buildDraftRequest('gpt-4o', {
      name: '', ingredients: [{ amount: '100 g', item: 'paneer' }, { amount: '2', item: 'egg' }],
    }).messages)
    expect(body).toContain('EXACTLY ONE person')
    expect(body).toContain('Do NOT infer a serving count')
    expect(body).toContain('Do NOT divide or multiply')
    // The import-only detect-and-divide rule must NOT leak into the draft prompt.
    expect(body).not.toContain('If you find one greater than 1, DIVIDE')
  })
})
