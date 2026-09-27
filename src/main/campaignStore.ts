import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import type { Campaign } from '@shared/types'

export type CampaignPaths = {
  dir: string
  file: string
  assets: string
}

export function campaignPaths(userData: string): CampaignPaths {
  const dir = join(userData, 'campaign')
  return {
    dir,
    file: join(dir, 'campaign.json'),
    assets: join(dir, 'assets')
  }
}

export function createCampaign(): Campaign {
  return {
    version: 1,
    name: 'Campaign',
    activeSceneId: null,
    scenes: [],
    tokens: []
  }
}

function isCampaign(value: unknown): value is Campaign {
  if (!value || typeof value !== 'object') return false
  const campaign = value as Campaign
  return campaign.version === 1 && Array.isArray(campaign.scenes) && Array.isArray(campaign.tokens)
}

export async function loadCampaign(file: string): Promise<Campaign> {
  try {
    const raw = await readFile(file, 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (!isCampaign(parsed)) throw new Error('Invalid campaign file')
    if (typeof parsed.name !== 'string' || parsed.name.trim() === '') parsed.name = 'Campaign'
    return parsed
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return createCampaign()
    await rename(file, `${file}.bak`).catch(() => undefined)
    return createCampaign()
  }
}

export async function saveCampaign(file: string, campaign: Campaign): Promise<void> {
  await mkdir(dirname(file), { recursive: true })
  const temp = join(dirname(file), 'campaign.json.tmp')
  await writeFile(temp, JSON.stringify(campaign, null, 2), 'utf8')
  await rename(temp, file)
}
