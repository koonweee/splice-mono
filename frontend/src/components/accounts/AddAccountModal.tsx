import {
  ActionIcon,
  Alert,
  Button,
  Group,
  Loader,
  Modal,
  NumberInput,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  IconArrowLeft,
  IconBuildingBank,
  IconPencil,
  IconWallet,
} from '@tabler/icons-react'
import type { ComponentType } from 'react'
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  getAccountControllerFindAllQueryKey,
  useAccountControllerCreate,
  useBankLinkControllerInitiateLinking,
} from '../../api/clients/spliceAPI'
import type { InitiateLinkRequestNetwork } from '../../api/models'

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
  {
    id: 'crypto',
    name: 'Crypto Wallet',
    icon: IconWallet,
  },
  {
    id: 'manual',
    name: 'Manual Account',
    icon: IconPencil,
  },
]

interface AddAccountModalProps {
  opened: boolean
  onClose: () => void
}

export function AddAccountModal({ opened, onClose }: AddAccountModalProps) {
  const queryClient = useQueryClient()
  const initiateLinking = useBankLinkControllerInitiateLinking()
  const createAccount = useAccountControllerCreate()
  const [selectedProvider, setSelectedProvider] = useState<string | undefined>(
    undefined,
  )
  const [showCryptoForm, setShowCryptoForm] = useState(false)
  const [showManualForm, setShowManualForm] = useState(false)
  const [walletAddress, setWalletAddress] = useState('')
  const [network, setNetwork] = useState<InitiateLinkRequestNetwork>('ethereum')
  const [manualName, setManualName] = useState('')
  const [manualCurrency, setManualCurrency] = useState('USD')
  const [manualBalance, setManualBalance] = useState<number | string>(0)

  const handleClose = () => {
    setShowCryptoForm(false)
    setShowManualForm(false)
    setWalletAddress('')
    setNetwork('ethereum')
    setManualName('')
    setManualBalance(0)
    setSelectedProvider(undefined)
    onClose()
  }

  const handleProviderClick = (providerId: string) => {
    if (providerId === 'crypto') {
      setShowCryptoForm(true)
      return
    }
    if (providerId === 'manual') {
      setShowManualForm(true)
      return
    }

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
          setSelectedProvider(undefined)
        },
      },
    )
  }

  const handleCryptoSubmit = () => {
    setSelectedProvider('crypto')
    initiateLinking.mutate(
      {
        provider: 'crypto',
        data: {
          walletAddress,
          network,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getAccountControllerFindAllQueryKey(),
          })
          notifications.show({
            title: 'Wallet Added',
            message: `Your ${network === 'ethereum' ? 'Ethereum' : 'Bitcoin'} wallet has been linked successfully`,
            color: 'green',
          })
          handleClose()
        },
        onSettled: () => {
          setSelectedProvider(undefined)
        },
      },
    )
  }

  const handleManualSubmit = () => {
    const amountInCents = Math.round(Number(manualBalance) * 100)

    createAccount.mutate(
      {
        data: {
          name: manualName,
          type: 'manual',
          subType: null,
          availableBalance: {
            money: { amount: amountInCents, currency: manualCurrency },
            sign: amountInCents >= 0 ? 'positive' : 'negative',
          },
          currentBalance: {
            money: { amount: amountInCents, currency: manualCurrency },
            sign: amountInCents >= 0 ? 'positive' : 'negative',
          },
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getAccountControllerFindAllQueryKey(),
          })
          notifications.show({
            title: 'Account Created',
            message: 'Manual account created successfully',
            color: 'green',
          })
          handleClose()
        },
      },
    )
  }

  const renderManualForm = () => (
    <Stack gap="md">
      <Group gap="xs">
        <ActionIcon variant="subtle" onClick={() => setShowManualForm(false)}>
          <IconArrowLeft size={16} />
        </ActionIcon>
        <Text fw={500}>Add Manual Account</Text>
      </Group>

      <TextInput
        label="Account Name"
        placeholder="e.g. Cash in Wallet"
        required
        value={manualName}
        onChange={(e) => setManualName(e.target.value)}
      />

      <Select
        label="Currency"
        data={['USD', 'SGD', 'EUR', 'GBP', 'JPY']}
        value={manualCurrency}
        onChange={(v) => setManualCurrency(v || 'USD')}
      />

      <NumberInput
        label="Current Balance"
        decimalScale={2}
        fixedDecimalScale
        prefix={manualCurrency === 'USD' ? '$' : ''}
        value={manualBalance}
        onChange={setManualBalance}
      />

      <Button
        onClick={handleManualSubmit}
        loading={createAccount.isPending}
        disabled={!manualName.trim()}
      >
        Create Account
      </Button>
    </Stack>
  )

  const renderCryptoForm = () => (
    <Stack gap="md">
      <Group gap="xs">
        <ActionIcon variant="subtle" onClick={() => setShowCryptoForm(false)}>
          <IconArrowLeft size={16} />
        </ActionIcon>
        <Text fw={500}>Add Crypto Wallet</Text>
      </Group>

      {initiateLinking.isError && (
        <Alert color="red" title="Error">
          Failed to add wallet. Please check the address format and try again.
        </Alert>
      )}

      <Select
        label="Network"
        data={[
          { value: 'ethereum', label: 'Ethereum (ETH)' },
          { value: 'bitcoin', label: 'Bitcoin (BTC)' },
        ]}
        value={network}
        onChange={(v) => setNetwork(v as InitiateLinkRequestNetwork)}
      />

      <TextInput
        label="Wallet Address"
        placeholder={
          network === 'ethereum' ? '0x...' : 'bc1... or 1... or 3...'
        }
        value={walletAddress}
        onChange={(e) => setWalletAddress(e.target.value)}
        description={
          network === 'ethereum'
            ? 'Enter your Ethereum wallet address (0x...)'
            : 'Enter your Bitcoin wallet address'
        }
      />

      <Button
        onClick={handleCryptoSubmit}
        loading={initiateLinking.isPending && selectedProvider === 'crypto'}
        disabled={!walletAddress.trim()}
      >
        Add Wallet
      </Button>
    </Stack>
  )

  const renderProviderList = () => (
    <Stack gap="md">
      {initiateLinking.isError && !showCryptoForm ? (
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
  )

  return (
    <Modal opened={opened} onClose={handleClose} title="Add Account" centered>
      {showCryptoForm
        ? renderCryptoForm()
        : showManualForm
          ? renderManualForm()
          : renderProviderList()}
    </Modal>
  )
}
