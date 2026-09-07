import { beforeEach, expect, it, vi } from 'vitest'
import { ConfirmedLoggedOutError } from '../session-refresh'
import route from '../../../server/routes/_pwa/recovery'

const mocks = vi.hoisted(() => ({ request: vi.fn(), client: vi.fn() }))
vi.mock('h3', () => ({ defineHandler: (handler: unknown) => handler }))
vi.mock('../server/api-client.server', () => ({
  createServerApiClient: mocks.client,
}))
const handle = route as unknown as (event: {
  req: Request
}) => Promise<Response>
const call = () =>
  handle({
    req: new Request('https://splice.test/_pwa/recovery', {
      headers: { cookie: 'refresh_token=synthetic' },
    }),
  })

beforeEach(() => {
  vi.resetAllMocks()
  mocks.client.mockImplementation(
    (options: { onSetCookie: (values: Array<string>) => void }) => {
      options.onSetCookie(['refresh_token=replacement; HttpOnly; Path=/'])
      return { request: mocks.request }
    },
  )
})

it('returns an opaque stable scope for the verified user and a different scope after account switch', async () => {
  mocks.request.mockResolvedValue({
    id: 'user-a',
    email: 'private@example.test',
    balance: 999,
  })
  const first = await call()
  const body = (await first.json()) as {
    app: string
    status: string
    controlScope: string
  }
  expect(body).toEqual({
    app: 'splice',
    status: 'ready',
    controlScope: expect.stringMatching(/^[a-f0-9]{64}$/),
  })
  expect(JSON.stringify(body)).not.toMatch(/user-a|private|999/)
  expect(first.headers.get('Cache-Control')).toBe('private, no-store')
  expect(first.headers.get('Set-Cookie')).toContain('refresh_token=replacement')
  expect(mocks.client).toHaveBeenCalledWith(
    expect.objectContaining({
      cookieHeader: 'refresh_token=synthetic',
      signal: expect.any(AbortSignal),
    }),
  )
  expect(mocks.request).toHaveBeenCalledWith({ url: '/user/me' })
  expect(await (await call()).json()).toEqual(body)
  mocks.request.mockResolvedValue({ id: 'user-b' })
  const second = (await (await call()).json()) as { controlScope: string }
  expect(second.controlScope).not.toBe(body.controlScope)
})

it('returns no scope for a confirmed anonymous session', async () => {
  mocks.request.mockRejectedValue(new ConfirmedLoggedOutError())
  const response = await call()
  expect(await response.json()).toEqual({ app: 'splice', status: 'login' })
  expect(response.headers.get('Cache-Control')).toBe('private, no-store')
})

it.each([{}, { id: '' }, { id: 42 }])(
  'fails closed on malformed identity %j',
  async (user) => {
    mocks.request.mockResolvedValue(user)
    const response = await call()
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      app: 'splice',
      status: 'unavailable',
    })
  },
)

it('returns no owner scope while the API is unavailable', async () => {
  mocks.request.mockRejectedValue(new Error('synthetic outage'))
  const response = await call()
  expect(response.status).toBe(503)
  expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  expect(await response.json()).toEqual({
    app: 'splice',
    status: 'unavailable',
  })
})
