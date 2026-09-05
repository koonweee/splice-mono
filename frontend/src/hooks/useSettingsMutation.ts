import { useRef } from 'react'
import {
  useUserControllerUpdateSettings,
  userControllerUpdateSettings,
} from '../api/clients/spliceAPI'
import { assertAuthGeneration, getAuthGeneration } from '../lib/auth-generation'
import type { UpdateUserSettingsDto } from '../api/models'

/** Share the user's mutation scope while binding every queued write to this mounted identity. */
export function useSettingsMutation() {
  const generation = useRef(getAuthGeneration()).current
  return useUserControllerUpdateSettings({
    mutation: {
      mutationFn: ({ data }: { data: UpdateUserSettingsDto }) => {
        assertAuthGeneration(generation)
        return userControllerUpdateSettings(data)
      },
    },
  })
}
