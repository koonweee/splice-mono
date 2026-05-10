import { MantineProvider } from '@mantine/core'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CategorySelect } from './CategorySelect'

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    value: vi.fn().mockImplementation(() => ({
      matches: false,
      media: '',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
    configurable: true,
  })

  Object.defineProperty(window, 'ResizeObserver', {
    value: vi.fn().mockImplementation(() => ({
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
    })),
    configurable: true,
  })

  Element.prototype.scrollIntoView = vi.fn()
})

describe('CategorySelect', () => {
  it('renders category color swatches and keeps clear behavior', async () => {
    const onChange = vi.fn()
    const { container } = render(
      <MantineProvider>
        <CategorySelect
          aria-label="Category"
          data={[
            {
              value: 'food',
              primary: 'Food',
              secondary: 'Restaurants',
              color: '#112233',
            },
          ]}
          onChange={onChange}
          value="food"
        />
      </MantineProvider>,
    )

    fireEvent.click(screen.getByRole('textbox', { name: 'Category' }))

    expect(await screen.findByText('Restaurants')).toBeTruthy()
    expect(container.ownerDocument.body.innerHTML).toContain(
      'background-color: rgb(17, 34, 51)',
    )

    fireEvent.click(screen.getByLabelText('Clear category'))

    expect(onChange).toHaveBeenCalledWith(null, null)
  })
})
