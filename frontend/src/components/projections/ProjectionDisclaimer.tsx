import { Alert } from '@mantine/core'
import { Info } from 'lucide-react'

export function ProjectionDisclaimer() {
  return (
    <Alert color="gray" icon={<Info size={16} />} variant="light">
      Projections are estimates based on editable assumptions and are not
      financial advice.
    </Alert>
  )
}
