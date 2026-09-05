import { Alert, Button, FileInput, Stack, Text } from '@mantine/core'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { IconUpload } from '@tabler/icons-react'
import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { invalidateMutationFamilies } from '../../lib/query-invalidation'
import { axios } from '../../api/axios'
import { useBalanceSnapshotControllerImportCsv } from '../../api/clients/spliceAPI'
import { getApiErrorMessage } from '../../lib/api-errors'
import { EditorModal } from '../forms/EditorModal'
import { FormActions } from '../forms/FormActions'

interface BackfillModalProps {
  opened: boolean
  onClose: () => void
}

export function BackfillModal({ opened, onClose }: BackfillModalProps) {
  const queryClient = useQueryClient()
  const importCsv = useBalanceSnapshotControllerImportCsv()
  const [importError, setImportError] = useState<string | null>(null)
  const importing = useRef(false)

  const handleClose = () => {
    if (importing.current || importCsv.isPending) return
    setImportError(null)
    onClose()
  }

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
      window.URL.revokeObjectURL(url)
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to download template',
        color: 'red',
      })
    }
  }

  const handleSubmit = (values: typeof form.values) => {
    if (!values.file || importing.current || importCsv.isPending) return
    importing.current = true
    setImportError(null)

    importCsv.mutate(
      {
        data: {
          file: values.file,
        },
      },
      {
        onSuccess: (data) => {
          void invalidateMutationFamilies(queryClient, ['accounts', 'balances'])
          notifications.show({
            title: 'Import successful',
            message:
              typeof data.imported === 'number'
                ? `Successfully imported ${data.imported} balance snapshots.`
                : 'Your balance snapshots have been imported.',
            color: 'green',
          })
          onClose()
          form.reset()
        },
        onError: (error: unknown) => {
          setImportError(getApiErrorMessage(error, 'Failed to import CSV'))
        },
        onSettled: () => {
          importing.current = false
        },
      },
    )
  }

  return (
    <EditorModal
      opened={opened}
      onClose={handleClose}
      title="Manual backfill via CSV"
      closeOnEscape={!importCsv.isPending}
      closeOnClickOutside={!importCsv.isPending}
      closeButtonProps={{ disabled: importCsv.isPending }}
      size="lg"
    >
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Stack>
          {importError && (
            <Alert color="red" role="alert" title="Import failed">
              {importError}
            </Alert>
          )}
          <Text size="sm">
            Download the template CSV, which contains your current accounts.
            Fill in the balances for each date you want to record.
          </Text>
          <Text component="div" size="sm" c="dimmed">
            Format rules:
            <ul>
              <li>Dates in header: YYYY-MM-DD</li>
              <li>Positive values for assets, negative for liabilities</li>
              <li>Leave cells empty to skip</li>
            </ul>
          </Text>

          <Button variant="light" onClick={handleDownloadTemplate}>
            Download template
          </Button>

          <FileInput
            label="Upload filled CSV"
            placeholder="Select CSV file"
            accept=".csv"
            leftSection={<IconUpload size={14} />}
            size="md"
            disabled={importCsv.isPending}
            {...form.getInputProps('file')}
          />
          <FormActions
            onCancel={handleClose}
            cancelDisabled={importCsv.isPending}
          >
            <Button type="submit" loading={importCsv.isPending}>
              Import
            </Button>
          </FormActions>
        </Stack>
      </form>
    </EditorModal>
  )
}
