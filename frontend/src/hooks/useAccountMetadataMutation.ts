import { useRef } from 'react'
import {
  accountControllerUpdate,
  useAccountControllerUpdate,
} from '../api/clients/spliceAPI'
import { assertAuthGeneration, getAuthGeneration } from '../lib/auth-generation'

/** Serialize edits to an account and bind queued writes to this mounted identity. */
export function useAccountMetadataMutation(accountId?: string) {
  const generation = useRef(getAuthGeneration()).current
  return useAccountControllerUpdate({
    mutation: {
      scope: { id: `account-metadata:${accountId ?? 'closed'}` },
      mutationFn: ({ id, data }) => {
        assertAuthGeneration(generation)
        return accountControllerUpdate(id, data)
      },
    },
  })
}
