export type CryptoNetwork = 'ethereum' | 'bitcoin'

export function getCryptoNetworkFromInstitution(
  institutionName?: string,
): CryptoNetwork | null {
  if (!institutionName) return null
  const name = institutionName.toLowerCase()
  if (name.includes('ethereum')) return 'ethereum'
  if (name.includes('bitcoin')) return 'bitcoin'
  return null
}

export const CRYPTO_ICONS: Record<CryptoNetwork, string> = {
  ethereum: 'Ξ',
  bitcoin: '₿',
}

export const CRYPTO_COLORS: Record<CryptoNetwork, string> = {
  ethereum: '#627EEA',
  bitcoin: '#F7931A',
}
