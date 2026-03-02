export type { CloudProvider, CloudInstance, CloudRegion, CloudSize, CloudSshKey, CreateInstanceOptions } from './types'
import type { CloudProvider } from './types'
import { DigitalOceanProvider } from './digitalocean'

export function createProvider(provider: string | undefined, token: string): CloudProvider {
  switch (provider || 'digitalocean') {
    case 'digitalocean':
      return new DigitalOceanProvider(token)
    default:
      throw new Error(`Unknown cloud provider: ${provider}`)
  }
}
