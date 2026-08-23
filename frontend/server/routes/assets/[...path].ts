import { defineEventHandler } from 'h3'

export function createMissingAssetResponse(): Response {
  return new Response('Not Found', {
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
    status: 404,
  })
}

export default defineEventHandler(() => createMissingAssetResponse())
