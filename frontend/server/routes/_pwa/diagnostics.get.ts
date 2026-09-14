import { createHash } from 'node:crypto'
import { hostname } from 'node:os'
import { defineHandler } from 'h3'

// Opaque container identity lets reports correlate routing without exposing hostnames.
const instance = createHash('sha256')
  .update(hostname())
  .digest('hex')
  .slice(0, 12)
export default defineHandler(
  () =>
    new Response(JSON.stringify({ instance }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    }),
)
