import {
  Alert,
  Button,
  Code,
  Group,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import {
  AccessTokensSkeleton,
  LoadingSkeleton,
  RowSkeleton,
} from '../loading/LoadingSkeleton'
import { DataState } from '../DataState'
import { invalidateMutationFamilies } from '../../lib/query-invalidation'
import {
  assertAuthGeneration,
  getAuthGeneration,
} from '../../lib/auth-generation'
import {
  getUserControllerListTokensQueryKey,
  useUserControllerCreateToken,
  useUserControllerListTokens,
  useUserControllerRevokeToken,
} from '../../api/clients/spliceAPI'
import {
  getActivePersonalAccessTokens,
  getPersonalAccessTokenUsageText,
  normalizePersonalAccessTokenName,
} from '../../lib/personal-access-tokens'
import type {
  CreatePersonalAccessTokenResponse,
  PersonalAccessToken,
} from '../../api/models'

const PAT_NAME_LIMIT = 100

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  return fallback
}

function buildTokenFromCreateResponse(
  response: CreatePersonalAccessTokenResponse,
): PersonalAccessToken {
  return {
    id: response.id,
    name: response.name,
    tokenPreview: response.tokenPreview,
    lastUsedAt: null,
    expiresAt: response.expiresAt,
    revokedAt: null,
    createdAt: response.createdAt,
  }
}

export function PersonalAccessTokenSection() {
  const queryClient = useQueryClient()
  const tokensQuery = useUserControllerListTokens({
    query: { refetchOnMount: false },
  })
  const createTokenMutation = useUserControllerCreateToken()
  const revokeTokenMutation = useUserControllerRevokeToken()

  const [tokenName, setTokenName] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const [revealedToken, setRevealedToken] = useState<string | null>(null)
  const [revealedTokenId, setRevealedTokenId] = useState<string | null>(null)
  const [clipboardFeedback, setClipboardFeedback] = useState<string | null>(
    null,
  )
  const [revokeErrors, setRevokeErrors] = useState<
    Record<string, string | undefined>
  >({})
  const trimmedTokenName = tokenName.trim()
  const canCreateToken =
    trimmedTokenName.length > 0 && !createTokenMutation.isPending

  const handleCreateToken = () => {
    setCreateError(null)

    let normalizedName: string

    try {
      normalizedName = normalizePersonalAccessTokenName(tokenName)
    } catch (error) {
      setCreateError(
        getErrorMessage(
          error,
          'Enter a personal access token name before creating one.',
        ),
      )
      return
    }

    const generation = getAuthGeneration()
    createTokenMutation.mutate(
      { data: { name: normalizedName } },
      {
        onSuccess: (response) => {
          assertAuthGeneration(generation)
          setRevealedToken(response.token)
          setRevealedTokenId(response.id)
          setClipboardFeedback(null)
          setTokenName('')
          setCreateError(null)

          const newToken = buildTokenFromCreateResponse(response)
          queryClient.setQueryData(
            getUserControllerListTokensQueryKey(),
            (current: Array<PersonalAccessToken> | undefined) => {
              const activeCurrent = getActivePersonalAccessTokens(current ?? [])
              const withoutExisting = activeCurrent.filter(
                (token) => token.id !== newToken.id,
              )

              return [...withoutExisting, newToken]
            },
          )

          void invalidateMutationFamilies(queryClient, ['tokens'])
        },
        onError: (error) => {
          setCreateError(
            getErrorMessage(error, 'Failed to create personal access token.'),
          )
        },
      },
    )
  }

  const handleRevokeToken = (token: PersonalAccessToken) => {
    setRevokeErrors((current) => {
      const next = { ...current }
      delete next[token.id]
      return next
    })

    const generation = getAuthGeneration()
    revokeTokenMutation.mutate(
      { id: token.id },
      {
        onSuccess: () => {
          assertAuthGeneration(generation)
          queryClient.setQueryData(
            getUserControllerListTokensQueryKey(),
            (current: Array<PersonalAccessToken> | undefined) =>
              (current ?? []).filter((candidate) => candidate.id !== token.id),
          )

          if (revealedTokenId === token.id) {
            setRevealedToken(null)
            setRevealedTokenId(null)
            setClipboardFeedback(null)
          }

          void invalidateMutationFamilies(queryClient, ['tokens'])
        },
        onError: (error) => {
          setRevokeErrors((current) => ({
            ...current,
            [token.id]: getErrorMessage(
              error,
              `Failed to revoke ${token.name}.`,
            ),
          }))
        },
      },
    )
  }

  const handleCopyToken = async () => {
    if (revealedToken == null) {
      return
    }

    try {
      await navigator.clipboard.writeText(revealedToken)
      setClipboardFeedback('Copied to clipboard.')
    } catch {
      setClipboardFeedback('Unable to copy token.')
    }
  }

  const activeTokens = useMemo(
    () => getActivePersonalAccessTokens(tokensQuery.data ?? []),
    [tokensQuery.data],
  )

  if (tokensQuery.isPending) {
    return (
      <div data-testid="pat-section">
        <div data-testid="pat-section-loader">
          <LoadingSkeleton label="Loading access tokens…">
            <AccessTokensSkeleton />
          </LoadingSkeleton>
        </div>
      </div>
    )
  }

  return (
    <Paper withBorder p="lg" radius="md" data-testid="pat-section">
      <Stack gap="lg">
        <Stack gap={4}>
          <Title order={3}>Personal access tokens</Title>
          <Text size="sm" c="dimmed">
            Create tokens for REST API automation. The token is shown only once.
          </Text>
        </Stack>

        <Stack gap="sm">
          <TextInput
            label="Token name"
            description="Leading and trailing spaces are trimmed. Up to 100 characters."
            value={tokenName}
            size="md"
            disabled={createTokenMutation.isPending}
            onChange={(event) => {
              setTokenName(event.currentTarget.value)
              if (createError != null) {
                setCreateError(null)
              }
            }}
            maxLength={PAT_NAME_LIMIT}
            data-testid="pat-name-input"
          />

          <Group
            gap="sm"
            wrap="wrap"
            align="flex-end"
            data-testid="pat-form-actions"
          >
            <Button
              onClick={handleCreateToken}
              loading={createTokenMutation.isPending}
              disabled={!canCreateToken}
            >
              Create token
            </Button>
            <Text size="xs" c="dimmed">
              Token names are limited to {PAT_NAME_LIMIT} characters.
            </Text>
          </Group>

          {createError != null && (
            <Alert color="red" title="Unable to create token">
              {createError}
            </Alert>
          )}
        </Stack>

        {revealedToken != null && revealedTokenId != null && (
          <Alert
            color="blue"
            title="New token revealed"
            data-testid="pat-reveal-panel"
          >
            <Stack gap="xs">
              <Text size="sm">
                Copy this token now. You will not be able to see it again.
              </Text>
              <Code
                data-testid="pat-revealed-token"
                style={{
                  display: 'block',
                  overflowWrap: 'anywhere',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {revealedToken}
              </Code>
              <Group gap="sm" wrap="wrap">
                <Button variant="light" onClick={handleCopyToken}>
                  Copy token
                </Button>
                {clipboardFeedback != null && (
                  <Text
                    size="sm"
                    c={
                      clipboardFeedback === 'Copied to clipboard.'
                        ? 'dimmed'
                        : 'red'
                    }
                  >
                    {clipboardFeedback}
                  </Text>
                )}
              </Group>
            </Stack>
          </Alert>
        )}

        <Stack gap="sm">
          <Title order={4}>Active tokens</Title>

          <DataState
            hasData={activeTokens.length > 0}
            isError={tokensQuery.isError}
            isFetching={tokensQuery.isFetching}
            onRetry={() => {
              void tokensQuery.refetch()
            }}
            errorTitle="Failed to load active tokens"
            errorMessage={getErrorMessage(
              tokensQuery.error,
              'Unable to load personal access tokens.',
            )}
            emptyMessage="No active personal access tokens."
            loadingFallback={<RowSkeleton rows={2} />}
          >
            <Stack gap="sm">
              {activeTokens.map((token) => (
                <Paper
                  key={token.id}
                  withBorder
                  p="sm"
                  radius="md"
                  data-testid={`pat-token-row-${token.id}`}
                >
                  <Stack gap={8}>
                    <Group
                      justify="space-between"
                      align="flex-start"
                      wrap="wrap"
                      gap="sm"
                    >
                      <Stack gap={2}>
                        <Text fw={500}>{token.name}</Text>
                        <Text size="sm" c="dimmed">
                          {token.tokenPreview}
                        </Text>
                        <Text size="sm" c="dimmed">
                          {getPersonalAccessTokenUsageText(token.lastUsedAt)}
                        </Text>
                      </Stack>
                      <Button
                        variant="light"
                        color="red"
                        size="xs"
                        onClick={() => handleRevokeToken(token)}
                      >
                        Revoke {token.name}
                      </Button>
                    </Group>

                    {revokeErrors[token.id] != null && (
                      <Text
                        size="xs"
                        c="red"
                        data-testid={`pat-revoke-error-${token.id}`}
                      >
                        {revokeErrors[token.id]}
                      </Text>
                    )}
                  </Stack>
                </Paper>
              ))}
            </Stack>
          </DataState>
        </Stack>
      </Stack>
    </Paper>
  )
}
