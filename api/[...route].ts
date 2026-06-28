import { handle } from 'hono/vercel'
import { app } from '../server/src/app'

// Single default export — Vercel's /api Node runtime routes ALL methods here,
// and the Hono app dispatches internally. (Named GET/POST exports are the
// Next.js App Router convention and left POST unregistered → 405 in prod.)
export default handle(app)
