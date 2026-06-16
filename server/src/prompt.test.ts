import { describe, it, expect } from 'vitest'
import { buildExtractionRequest } from './prompt'
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
})
