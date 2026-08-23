import {
  ActionIcon,
  Alert,
  Button,
  Group,
  Loader,
  Modal,
  NumberInput,
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
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  getAccountControllerFindAllQueryKey,
  getBalanceQueryControllerGetAllBalancesQueryKey,
  getBalanceQueryControllerGetBalancesQueryKey,
  investmentControllerSearchSecurities,
  useAccountControllerCreate,
  useBankLinkControllerInitiateLinking,
  useInvestmentControllerCreateManualBrokerageAccount,
} from '../../api/clients/spliceAPI'
import { AccountSubType, AccountType } from '../../api/models'
import { getApiErrorMessage } from '../../lib/api-errors'
import { createMoneyWithSign } from '../../lib/balance-utils'
import { getDecimalPlaces } from '../../lib/format'
import { useIsMobile } from '../../lib/hooks'
import { Pressable } from '../Pressable'
import {
  ManualBrokeragePositionsEditor,
  isPositiveDecimal,
} from '../investments/ManualBrokeragePositionsEditor'
import type { InitiateLinkRequestNetwork } from '../../api/models'
import type { ComponentType } from 'react'
import type { ManualBrokeragePositionDraft } from '../investments/ManualBrokeragePositionsEditor'

interface Provider {
  id: string
  name: string
  icon: ComponentType<{ size: number }>
}

const MANUAL_ACCOUNT_TYPES = [
  {
    label: 'Cash',
    value: 'cash',
    type: AccountType.depository,
    subType: null,
  },
  {
    label: 'Savings',
    value: 'savings',
    type: AccountType.depository,
    subType: AccountSubType.savings,
  },
  {
    label: 'Checking',
    value: 'checking',
    type: AccountType.depository,
    subType: AccountSubType.checking,
  },
  {
    label: 'Credit card',
    value: 'credit_card',
    type: AccountType.credit,
    subType: AccountSubType.credit_card,
  },
  {
    label: 'Loan',
    value: 'loan',
    type: AccountType.loan,
    subType: AccountSubType.loan,
  },
  {
    label: 'Brokerage (holdings)',
    value: 'brokerage_holdings',
    type: AccountType.investment,
    subType: AccountSubType.brokerage,
  },
  {
    label: 'Investment (balance only)',
    value: 'investment',
    type: AccountType.investment,
    subType: AccountSubType.brokerage,
  },
  {
    label: 'Investment (401k)',
    value: '401k',
    type: AccountType.investment,
    subType: AccountSubType['401k'],
  },
  {
    label: 'Investment (HSA)',
    value: 'hsa',
    type: AccountType.investment,
    subType: AccountSubType.hsa,
  },
  {
    label: 'Other',
    value: 'other',
    type: AccountType.other,
    subType: AccountSubType.other,
  },
] as const

const PROVIDERS: Array<Provider> = [
  {
    id: 'plaid',
    name: 'Plaid',
    icon: IconBuildingBank,
  },
  {
    id: 'crypto',
    name: 'Crypto wallet',
    icon: IconWallet,
  },
  {
    id: 'manual',
    name: 'Manual account',
    icon: IconPencil,
  },
]

interface AddAccountModalProps {
  opened: boolean
  onClose: () => void
}

export function AddAccountModal({ opened, onClose }: AddAccountModalProps) {
  const isMobile = useIsMobile()
  const queryClient = useQueryClient()
  const initiateLinking = useBankLinkControllerInitiateLinking()
  const createAccount = useAccountControllerCreate()
  const createBrokerage = useInvestmentControllerCreateManualBrokerageAccount()
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
  const [manualTypeSelection, setManualTypeSelection] = useState('cash')
  const [manualPositions, setManualPositions] = useState<
    Array<ManualBrokeragePositionDraft>
  >([])

  const isManualBrokerage = manualTypeSelection === 'brokerage_holdings'

  const handleClose = () => {
    setShowCryptoForm(false)
    setShowManualForm(false)
    setWalletAddress('')
    setNetwork('ethereum')
    setManualName('')
    setManualBalance(0)
    setManualTypeSelection('cash')
    setManualPositions([])
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
            title: 'Wallet added',
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
    const typeDef =
      MANUAL_ACCOUNT_TYPES.find((t) => t.value === manualTypeSelection) ??
      MANUAL_ACCOUNT_TYPES[0]

    if (isManualBrokerage) {
      createBrokerage.mutate(
        {
          data: {
            name: manualName.trim(),
            accountCurrency: manualCurrency,
            positions: manualPositions.map(({ symbol, quantity }) => ({
              symbol,
              quantity: quantity.trim(),
            })),
          },
        },
        {
          onSuccess: (response) => {
            queryClient.invalidateQueries({
              queryKey: getAccountControllerFindAllQueryKey(),
            })
            queryClient.invalidateQueries({
              queryKey: getBalanceQueryControllerGetBalancesQueryKey(),
            })
            queryClient.invalidateQueries({
              queryKey: getBalanceQueryControllerGetAllBalancesQueryKey(),
            })
            notifications.show({
              title: 'Brokerage created',
              message:
                response.staleSymbols.length > 0
                  ? `Created using cached prices for ${response.staleSymbols.join(', ')}.`
                  : 'Manual brokerage created successfully.',
              color: response.staleSymbols.length > 0 ? 'yellow' : 'green',
            })
            handleClose()
          },
        },
      )
      return
    }

    // For 401(k) and HSA accounts, effective balance = available + current,
    // so set available to zero to avoid doubling.
    const isInvestmentType = typeDef.type === AccountType.investment
    const balancePayload = createMoneyWithSign(
      Number(manualBalance),
      manualCurrency,
    )
    const zeroBalance = createMoneyWithSign(0, manualCurrency)

    createAccount.mutate(
      {
        data: {
          name: manualName,
          type: typeDef.type,
          subType: typeDef.subType,
          availableBalance: isInvestmentType ? zeroBalance : balancePayload,
          currentBalance: balancePayload,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getAccountControllerFindAllQueryKey(),
          })
          notifications.show({
            title: 'Account created',
            message: 'Manual account created successfully',
            color: 'green',
          })
          handleClose()
        },
      },
    )
  }

  const brokerageErrorMessage = getApiErrorMessage(
    createBrokerage.error,
    'Unable to value these positions. Check the symbols and try again.',
  )

  const renderManualForm = () => (
    <Stack gap="md">
      <Group gap="xs">
        <ActionIcon variant="subtle" onClick={() => setShowManualForm(false)}>
          <IconArrowLeft size={16} />
        </ActionIcon>
        <Text fw={500}>Add manual account</Text>
      </Group>

      <TextInput
        label="Account name"
        placeholder="e.g. Emergency fund"
        required
        size="md"
        value={manualName}
        onChange={(e) => setManualName(e.target.value)}
      />

      <Select
        label="Account type"
        data={MANUAL_ACCOUNT_TYPES.map((t) => ({
          value: t.value,
          label: t.label,
        }))}
        value={manualTypeSelection}
        onChange={(v) => setManualTypeSelection(v || 'cash')}
        allowDeselect={false}
        size="md"
      />

      <Select
        label="Currency"
        data={['USD', 'SGD', 'EUR', 'GBP', 'JPY']}
        value={manualCurrency}
        onChange={(v) => setManualCurrency(v || 'USD')}
        size="md"
      />

      {isManualBrokerage ? (
        <>
          {createBrokerage.isError && (
            <Alert color="red" role="alert" title="Brokerage not created">
              {brokerageErrorMessage ||
                'Unable to value these positions. Check the symbols and try again.'}
            </Alert>
          )}
          <ManualBrokeragePositionsEditor
            disabled={createBrokerage.isPending}
            onChange={setManualPositions}
            positions={manualPositions}
            searchSecurities={(query, signal) =>
              investmentControllerSearchSecurities({ query, limit: 10 }, signal)
            }
          />
        </>
      ) : (
        <NumberInput
          label="Current balance"
          decimalScale={getDecimalPlaces(manualCurrency)}
          fixedDecimalScale
          prefix={manualCurrency === 'USD' ? '$' : ''}
          size="md"
          value={manualBalance}
          onChange={setManualBalance}
        />
      )}

      <Button
        onClick={handleManualSubmit}
        loading={
          isManualBrokerage
            ? createBrokerage.isPending
            : createAccount.isPending
        }
        disabled={
          !manualName.trim() ||
          (isManualBrokerage &&
            (manualPositions.length === 0 ||
              !manualPositions.every((position) =>
                isPositiveDecimal(position.quantity),
              )))
        }
      >
        Create account
      </Button>
    </Stack>
  )

  const renderCryptoForm = () => (
    <Stack gap="md">
      <Group gap="xs">
        <ActionIcon variant="subtle" onClick={() => setShowCryptoForm(false)}>
          <IconArrowLeft size={16} />
        </ActionIcon>
        <Text fw={500}>Add crypto wallet</Text>
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
        size="md"
      />

      <TextInput
        label="Wallet address"
        placeholder={
          network === 'ethereum' ? '0x...' : 'bc1... or 1... or 3...'
        }
        value={walletAddress}
        onChange={(e) => setWalletAddress(e.target.value)}
        size="md"
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
        Add wallet
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
          <Pressable
            aria-label={`Add account with ${provider.name}`}
            key={provider.id}
            onClick={() => handleProviderClick(provider.id)}
            style={{
              border: '1px solid var(--mantine-color-default-border)',
              borderRadius: 'var(--mantine-radius-md)',
              padding: 'var(--mantine-spacing-md)',
            }}
          >
            <Group>
              <Icon size={24} />
              <Text fw={500}>{provider.name}</Text>
              {isLoading && <Loader size="sm" />}
            </Group>
          </Pressable>
        )
      })}
    </Stack>
  )

  return (
    <Modal
      centered
      fullScreen={isMobile}
      onClose={handleClose}
      opened={opened}
      title="Add account"
    >
      {showCryptoForm
        ? renderCryptoForm()
        : showManualForm
          ? renderManualForm()
          : renderProviderList()}
    </Modal>
  )
}
