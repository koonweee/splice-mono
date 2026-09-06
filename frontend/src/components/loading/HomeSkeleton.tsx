import { Box, Grid, Group, Paper, Skeleton, Text, Title } from '@mantine/core'
import { RowSkeleton } from './LoadingSkeleton'

/** Summary and chart use the same spacing as the loaded Home card. */
export function HomeSkeleton() {
  return (
    <>
      <Paper mb="xl">
        <Group mb={4} h={22}>
          <Skeleton h={14} w={100} />
        </Group>
        <Box pos="relative">
          <Title order={2} size="h1">
            {'\u00A0'}
          </Title>
          <Skeleton h="75%" w={210} pos="absolute" top="12.5%" />
        </Box>
        <Box pos="relative">
          <Text size="sm">{'\u00A0'}</Text>
          <Skeleton h={14} w={180} pos="absolute" top="15%" />
        </Box>
        <Skeleton mt="md" h={200} />
      </Paper>
      <Grid>
        {['Assets', 'Liabilities'].map((label) => (
          <Grid.Col span={{ base: 12, md: 6 }} key={label}>
            <Group mb="xs" px={4} py={2}>
              <Skeleton h={22} w={90} />
            </Group>
            <Paper p={0} withBorder>
              <RowSkeleton rows={3} />
            </Paper>
          </Grid.Col>
        ))}
      </Grid>
    </>
  )
}
