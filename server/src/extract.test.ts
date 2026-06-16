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
