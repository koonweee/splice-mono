import { LifecycleBadge } from '../LifecycleBadge'
import type { LifecycleStatus } from '../LifecycleBadge'

export function SettingsStatusBadge({ status }: { status: LifecycleStatus }) {
  return <LifecycleBadge status={status} />
}
