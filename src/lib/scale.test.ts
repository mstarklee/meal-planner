import { describe, it, expect } from 'vitest'
import { scaleAmount, countForSlot } from './scale'

describe('scaleAmount', () => {
  it('multiplies whole numbers and units', () => {
    expect(scaleAmount('200 g', 3)).toBe('600 g')
    expect(scaleAmount('2 cups', 2)).toBe('4 cups')
  })
  it('handles fractions and mixed numbers', () => {
    expect(scaleAmount('1/2 tsp', 3)).toBe('1 1/2 tsp')
    expect(scaleAmount('1 1/2 cup', 2)).toBe('3 cup')
  })
  it('handles decimals', () => {
    expect(scaleAmount('0.5 kg', 2)).toBe('1 kg')
  })
  it('leaves non-numeric and empty unchanged', () => {
    expect(scaleAmount('a pinch', 4)).toBe('a pinch')
    expect(scaleAmount('', 4)).toBe('')
  })
  it('factor 1 is identity', () => {
    expect(scaleAmount('1 1/3 cup', 1)).toBe('1 1/3 cup')
  })
})

describe('countForSlot', () => {
  it('kid slots use kid count', () => {
    expect(countForSlot('kid', 4, 2)).toBe(2)
    expect(countForSlot('kid-lunch', 4, 2)).toBe(2)
    expect(countForSlot('kid-snack', 4, 2)).toBe(2)
  })
  it('family slots use family count', () => {
    expect(countForSlot('breakfast', 4, 2)).toBe(4)
    expect(countForSlot('dinner', 4, 2)).toBe(4)
  })
})
