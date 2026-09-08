import { ClipboardList } from 'lucide-react'
import { PageLayout } from '../PageLayout'
import { DateRangeControl } from '../DateRangeControl'
import { loadAnalysisAuditDrawer } from '../../lib/feature-loaders'
import type { ReactNode } from 'react'
import type { DatesRangeValue } from '@mantine/dates'

export function AnalysisPageFrame({
  children,
  dateRange,
  onDateRangeChange,
  onAudit,
}: {
  children: ReactNode
  dateRange: DatesRangeValue
  onDateRangeChange?: (range: DatesRangeValue) => void
  onAudit?: () => void
}) {
  return (
    <PageLayout
      title="Analysis"
      actions={{
        primary: {
          id: 'audit',
          label: 'Audit',
          icon: ClipboardList,
          onClick: onAudit ?? (() => {}),
          disabled: !onAudit,
          onPrepare: () => {
            void loadAnalysisAuditDrawer().catch(() => undefined)
          },
        },
      }}
      toolbar={
        <DateRangeControl
          growOnMobile
          value={dateRange}
          onChange={onDateRangeChange ?? (() => {})}
          disabled={!onDateRangeChange}
          clearable={false}
        />
      }
    >
      {children}
    </PageLayout>
  )
}
