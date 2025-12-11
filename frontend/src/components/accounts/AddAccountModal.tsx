import { Alert, Group, Loader, Modal, Paper, Stack, Text } from '@mantine/core'
import { IconBuildingBank } from '@tabler/icons-react'
import type { ComponentType } from 'react'
import { useState } from 'react'
import { useBankLinkControllerInitiateLinking } from '../../api/clients/spliceAPI'

interface Provider {
  id: string
  name: string
  icon: ComponentType<{ size: number }>
}

const PROVIDERS: Provider[] = [
  {
    id: 'plaid',
    name: 'Plaid',
    icon: IconBuildingBank,
  },
]

interface AddAccountModalProps {
  opened: boolean
  onClose: () => void
}

export function AddAccountModal({ opened, onClose }: AddAccountModalProps) {
  const initiateLinking = useBankLinkControllerInitiateLinking()
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null)

  const handleProviderClick = (providerId: string) => {
    setSelectedProvider(providerId)

    // Ensure HTTPS for redirect URI (required by Plaid)
    const redirectUri = window.location.href.replace(/^http:/, 'https:')

    initiateLinking.mutate(
      {
        provider: providerId,
        data: {
          redirectUri,
        },
      },
      {
        onSuccess: (response) => {
          if (response.linkUrl) {
            window.location.href = response.linkUrl
          }
        },
        onSettled: () => {
          setSelectedProvider(null)
        },
      },
    )
  }

  return (
    <Modal opened={opened} onClose={onClose} title="Add Account" centered>
      <Stack gap="md">
        {initiateLinking.isError ? (
          <Alert color="red" title="Error">
            Failed to initiate account linking. Please try again.
          </Alert>
        ) : null}

        {PROVIDERS.map((provider) => {
          const Icon = provider.icon
          const isLoading =
            initiateLinking.isPending && selectedProvider === provider.id

          return (
            <Paper
              key={provider.id}
              withBorder
              p="md"
              radius="md"
              style={{ cursor: 'pointer' }}
              onClick={() => handleProviderClick(provider.id)}
            >
              <Group>
                <Icon size={24} />
                <Text fw={500}>{provider.name}</Text>
                {isLoading && <Loader size="sm" />}
              </Group>
            </Paper>
          )
        })}
      </Stack>
    </Modal>
  )
}
