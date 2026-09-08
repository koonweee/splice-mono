import { Button, Group, Switch, TextInput } from '@mantine/core'
import { FormActions } from '../forms/FormActions'
import {
  ManualTransactionFormFrame,
  manualTransactionLabels,
} from './ManualTransactionFormFrame'
/** Known controls retain their label metrics while the editor module loads. */
export function ManualTransactionModalSkeleton({
  editing = false,
}: {
  editing?: boolean
}) {
  return (
    <ManualTransactionFormFrame pending>
      <TextInput label={manualTransactionLabels.account} required disabled />
      <Group align="flex-start" grow>
        <TextInput label={manualTransactionLabels.amount} required disabled />
        <TextInput label={manualTransactionLabels.currency} disabled />
      </Group>
      <TextInput label={manualTransactionLabels.date} required disabled />
      <TextInput label={manualTransactionLabels.merchant} required disabled />
      <TextInput label={manualTransactionLabels.category} required disabled />
      {!editing && (
        <Switch label={manualTransactionLabels.recurring} disabled />
      )}
      <FormActions onCancel={() => {}} cancelDisabled>
        <Button disabled>Save</Button>
      </FormActions>
    </ManualTransactionFormFrame>
  )
}
