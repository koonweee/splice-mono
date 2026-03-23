import { ActionIcon, Paper, Textarea } from '@mantine/core'
import { IconArrowUp } from '@tabler/icons-react'
import type { ChangeEvent, FormEvent, KeyboardEvent } from 'react'

type AskComposerProps = {
  input: string
  disabled?: boolean
  onInputChange: (
    event: ChangeEvent<HTMLInputElement> | ChangeEvent<HTMLTextAreaElement>,
  ) => void
  onSubmit: (event?: FormEvent) => void
}

export function AskComposer({
  input,
  disabled,
  onInputChange,
  onSubmit,
}: AskComposerProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) {
      return
    }

    if (disabled || input.trim().length === 0) {
      return
    }

    event.preventDefault()
    onSubmit()
  }

  return (
    <Paper withBorder p="sm" radius="md">
      <form
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit(event)
        }}
      >
        <Textarea
          value={input}
          onChange={onInputChange}
          onKeyDown={handleKeyDown}
          autosize
          minRows={2}
          maxRows={6}
          placeholder="Ask about accounts, cash flow, merchants, or categories..."
          disabled={disabled}
          rightSection={
            <ActionIcon
              type="submit"
              variant="filled"
              color="dark"
              aria-label="Send question"
              disabled={disabled || input.trim().length === 0}
            >
              <IconArrowUp size={16} />
            </ActionIcon>
          }
        />
      </form>
    </Paper>
  )
}
