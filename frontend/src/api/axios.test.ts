import type {
  AxiosAdapter,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  refreshSession: vi.fn(),
  isConfirmedLoggedOutError: vi.fn(),
}))

vi.mock('../lib/session-refresh', () => ({
  refreshSession: mocks.refreshSession,
  isConfirmedLoggedOutError: mocks.isConfirmedLoggedOutError,
}))

describe('axios auth refresh interceptor', () => {
  afterEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('refreshes and retries the original request after a 401', async () => {
    const { axiosInstance } = await import('./axios')
    const adapter = makeAdapter([
      (config) =>
        Promise.reject({
          config,
          response: { status: 401 },
          isAxiosError: true,
        }),
      (config) => Promise.resolve(makeResponse(config, { ok: true })),
    ])
    axiosInstance.defaults.adapter = adapter
    mocks.refreshSession.mockResolvedValue(undefined)

    await expect(axiosInstance.get('/accounts')).resolves.toMatchObject({
      data: { ok: true },
    })

    expect(mocks.refreshSession).toHaveBeenCalledTimes(1)
    expect(adapter).toHaveBeenCalledTimes(2)
  })

  it('does not refresh auth endpoints', async () => {
    const { axiosInstance } = await import('./axios')
    const adapter = makeAdapter([
      (config) =>
        Promise.reject({
          config,
          response: { status: 401 },
          isAxiosError: true,
        }),
    ])
    axiosInstance.defaults.adapter = adapter

    await expect(axiosInstance.post('/user/refresh', {})).rejects.toMatchObject({
      response: { status: 401 },
    })

    expect(mocks.refreshSession).not.toHaveBeenCalled()
  })

  it('does not redirect for transient refresh failures', async () => {
    const { authRedirect, axiosInstance } = await import('./axios')
    const transientError = new Error('temporary outage')
    const redirectSpy = vi
      .spyOn(authRedirect, 'toLogin')
      .mockImplementation(() => {})
    const adapter = makeAdapter([
      (config) =>
        Promise.reject({
          config,
          response: { status: 401 },
          isAxiosError: true,
        }),
    ])
    axiosInstance.defaults.adapter = adapter
    mocks.refreshSession.mockRejectedValue(transientError)
    mocks.isConfirmedLoggedOutError.mockReturnValue(false)

    await expect(axiosInstance.get('/accounts')).rejects.toBe(transientError)

    expect(mocks.isConfirmedLoggedOutError).toHaveBeenCalledWith(transientError)
    expect(redirectSpy).not.toHaveBeenCalled()
  })

  it('redirects to login for confirmed refresh auth failures', async () => {
    const { authRedirect, axiosInstance } = await import('./axios')
    const confirmedError = new Error('logged out')
    const redirectSpy = vi
      .spyOn(authRedirect, 'toLogin')
      .mockImplementation(() => {})
    const adapter = makeAdapter([
      (config) =>
        Promise.reject({
          config,
          response: { status: 401 },
          isAxiosError: true,
        }),
    ])
    axiosInstance.defaults.adapter = adapter
    mocks.refreshSession.mockRejectedValue(confirmedError)
    mocks.isConfirmedLoggedOutError.mockReturnValue(true)

    await expect(axiosInstance.get('/accounts')).rejects.toBe(confirmedError)

    expect(mocks.isConfirmedLoggedOutError).toHaveBeenCalledWith(confirmedError)
    expect(redirectSpy).toHaveBeenCalledTimes(1)
  })

  it('builds login redirects with the current path preserved', async () => {
    const { buildLoginRedirectUrl } = await import('./axios')

    expect(buildLoginRedirectUrl('/transactions?page=1#row')).toBe(
      '/?login=true&redirect=%2Ftransactions%3Fpage%3D1%23row',
    )
    expect(buildLoginRedirectUrl('/')).toBe('/?login=true')
  })
})

function makeAdapter(
  responses: Array<
    (config: InternalAxiosRequestConfig) => Promise<AxiosResponse>
  >,
): AxiosAdapter {
  const adapter = vi.fn((config: InternalAxiosRequestConfig) => {
    const next = responses.shift()
    if (!next) {
      throw new Error('Unexpected axios request')
    }

    return next(config)
  })

  return adapter
}

function makeResponse(
  config: InternalAxiosRequestConfig,
  data: unknown,
): AxiosResponse {
  return {
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
  }
}
