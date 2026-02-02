import { Button, FileInput, Modal, Stack, Text } from '@mantine/core'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { IconUpload } from '@tabler/icons-react'
import { useQueryClient } from '@tanstack/react-query'
import { axios } from '../../api/axios'
import {
  getAccountControllerFindAllQueryKey,
  getBalanceQueryControllerGetAllBalancesQueryKey,
  getBalanceQueryControllerGetBalancesQueryKey,
  useBalanceSnapshotControllerImportCsv,
} from '../../api/clients/spliceAPI'

interface BackfillModalProps {
  opened: boolean
  onClose: () => void
}

export function BackfillModal({ opened, onClose }: BackfillModalProps) {
  const queryClient = useQueryClient()
  const importCsv = useBalanceSnapshotControllerImportCsv()

  const form = useForm<{ file: File | null }>({
    initialValues: {
      file: null,
    },
    validate: {
      file: (value) => (value ? null : 'Please select a file'),
    },
  })

  const handleDownloadTemplate = async () => {
    try {
      const blob = await axios<Blob>({
        url: '/balance-snapshot/template',
        method: 'GET',
        responseType: 'blob',
      })

      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', 'balance-template.csv')
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to download template',
        color: 'red',
      })
    }
  }

  const handleSubmit = (values: typeof form.values) => {
    if (!values.file) return

    importCsv.mutate(
      {
        data: {
          file: values.file,
        },
      },
      {
        onSuccess: (data: any) => {
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
            title: 'Import Successful',
            message: `Successfully imported ${data.imported} balance snapshots.`,
            color: 'green',
          })
          onClose()
          form.reset()
        },
        onError: (error: any) => {
          notifications.show({
            title: 'Import Failed',
            message: error?.response?.data?.message || 'Failed to import CSV',
            color: 'red',
          })
        },
      },
    )
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Manual Backfill via CSV"
      centered
      size="lg"
    >
      <Stack>
        <Text size="sm">
          Download the template CSV, which contains your current accounts. Fill
          in the balances for each date you want to record.
        </Text>
        <Text size="sm" c="dimmed">
          Format rules:
          <ul>
            <li>Dates in header: YYYY-MM-DD</li>
            <li>Positive values for assets, negative for liabilities</li>
            <li>Leave cells empty to skip</li>
          </ul>
        </Text>

        <Button variant="light" onClick={handleDownloadTemplate}>
          Download Template
        </Button>

        <form onSubmit={form.onSubmit(handleSubmit)}>
          <Stack>
            <FileInput
              label="Upload Filled CSV"
              placeholder="Select CSV file"
              accept=".csv"
              leftSection={<IconUpload size={14} />}
              {...form.getInputProps('file')}
            />
            <Button type="submit" loading={importCsv.isPending}>
              Import
            </Button>
          </Stack>
        </form>
      </Stack>
    </Modal>
  )
}
