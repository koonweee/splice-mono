/** Workbench fixtures never persist private previews or touch real browser state. */
export function useSaveHomeSnapshot() {}
export const getHomeSnapshotEpoch = () => null
export const readHomeSnapshot = () => Promise.resolve(null)
export const subscribeHomeSnapshot = (_listener: () => void) => () => {}
export const clearHomeSnapshot = () => {}
export const setHomeSnapshotIdentity = (_identity: string) => {}
export const saveHomeSnapshot = () => Promise.resolve(false)
