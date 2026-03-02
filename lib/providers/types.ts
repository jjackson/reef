export interface CloudInstance {
  providerId: string
  name: string
  ip: string
  region?: string
  status?: string
}

export interface CloudRegion {
  slug: string
  name: string
}

export interface CloudSize {
  slug: string
  label: string
  memory: number
  vcpus: number
  disk: number
  priceMonthly: number
  regions: string[]
}

export interface CloudSshKey {
  id: number | string
  name: string
  publicKey: string
  fingerprint: string
}

export interface CreateInstanceOptions {
  name: string
  region: string
  size: string
  image: string
  sshKeyIds: (number | string)[]
  tags?: string[]
}

export interface CloudProvider {
  readonly type: string
  listInstances(): Promise<CloudInstance[]>
  getInstance(providerId: string): Promise<CloudInstance | null>
  rebootInstance(providerId: string): Promise<{ success: boolean; error?: string }>
  listRegions(): Promise<CloudRegion[]>
  listSizes(): Promise<CloudSize[]>
  createInstance(opts: CreateInstanceOptions): Promise<CloudInstance>
  listSshKeys(): Promise<CloudSshKey[]>
  addSshKey(name: string, publicKey: string): Promise<CloudSshKey>
}
