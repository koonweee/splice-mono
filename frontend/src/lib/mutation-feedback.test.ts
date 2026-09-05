import { afterEach, describe, expect, it, vi } from 'vitest'
import { notifyMutationError, notifyMutationSuccess } from './mutation-feedback'

const { show } = vi.hoisted(() => ({ show: vi.fn() }))

vi.mock('@mantine/notifications', () => ({ notifications: { show } }))

afterEach(() => vi.clearAllMocks())

describe('mutation feedback', () => {
  it('shows server validation messages together for failed row actions', () => {
    notifyMutationError({
      title: 'Pause failed',
      error: {
        response: { data: { message: ['Schedule ended.', 'Refresh first.'] } },
      },
      fallback: 'Unable to pause.',
    })

    expect(show).toHaveBeenCalledWith({
      title: 'Pause failed',
      message: 'Schedule ended. Refresh first.',
      color: 'red',
    })
  })

  it('uses the action-specific fallback when there is no server message', () => {
    notifyMutationError({
      title: 'Pause failed',
      error: new Error('Network unavailable'),
      fallback: 'Unable to pause. Try again.',
    })

    expect(show).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Unable to pause. Try again.',
      }),
    )
  })

  it('announces the completed action', () => {
    notifyMutationSuccess({
      title: 'Schedule paused',
      message: 'Rent was paused.',
    })
    expect(show).toHaveBeenCalledWith({
      title: 'Schedule paused',
      message: 'Rent was paused.',
      color: 'green',
    })
  })
})
