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
