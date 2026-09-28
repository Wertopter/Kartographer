import { access, mkdir, readFile, rename, writeFile } from 'fs/promises'
import { basename, dirname, join } from 'path'
import { normalizeSoundtrack } from '@shared/soundtrack'
import type { Campaign } from '@shared/types'

export type CampaignPaths = {
  dir: string
  file: string
  assets: string
}

export function campaignPaths(dir: string): CampaignPaths {
  return {
    dir,
    file: join(dir, 'campaign.json'),
    assets: join(dir, 'assets')
  }
}

export function libraryFile(userData: string): string {
  return join(userData, 'library.json')
}

export async function loadLibrary(file: string): Promise<string[]> {
  try {
    const parsed: unknown = JSON.parse(await readFile(file, 'utf8'))
    if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { recent?: unknown }).recent)) return []
    return (parsed as { recent: unknown[] }).recent.filter(
      (item): item is string => typeof item === 'string' && item.trim() !== ''
    )
  } catch {
    return []
  }
}

export async function saveLibrary(file: string, recent: string[]): Promise<void> {
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify({ recent }, null, 2), 'utf8')
}

export async function describeCampaignFolder(dir: string): Promise<{ name: string; missing: boolean }> {
  const fallback = basename(dir) || 'Campaign'
  try {
    await access(dir)
  } catch {
    return { name: fallback, missing: true }
  }
  try {
    const parsed: unknown = JSON.parse(await readFile(join(dir, 'campaign.json'), 'utf8'))
    if (isCampaign(parsed) && parsed.name.trim()) return { name: parsed.name.trim(), missing: false }
  } catch {
    // A new folder has no campaign file yet.
  }
  return { name: fallback, missing: false }
}

export function createCampaign(): Campaign {
  return {
    version: 1,
    name: 'Campaign',
    activeSceneId: null,
    scenes: [],
    tokens: [],
    library: [],
    soundtrack: normalizeSoundtrack(undefined)
  }
}

function isCampaign(value: unknown): value is Campaign {
  if (!value || typeof value !== 'object') return false
  const campaign = value as Campaign
  return campaign.version === 1 && Array.isArray(campaign.scenes) && Array.isArray(campaign.tokens)
}

function isLibraryToken(value: unknown): value is Campaign['library'][number] {
  if (!value || typeof value !== 'object') return false
  const token = value as Campaign['library'][number]
  return typeof token.id === 'string' && typeof token.label === 'string' && typeof token.color === 'string'
}

function normalizeCampaign(campaign: Campaign): Campaign {
  const library = Array.isArray(campaign.library) ? campaign.library.filter(isLibraryToken) : []
  return {
    ...campaign,
    library: library.map((token) => ({
      id: token.id,
      label: token.label.slice(0, 24),
      color: token.color,
      imageFile: typeof token.imageFile === 'string' ? token.imageFile : null,
      visibleToPlayers: token.visibleToPlayers !== false
    })),
    tokens: campaign.tokens.filter((token) => token && typeof token.id === 'string').map((token) => ({
      ...token,
      imageFile: token.imageFile ?? null,
      visibleToPlayers: token.visibleToPlayers !== false,
      libraryId: typeof token.libraryId === 'string' ? token.libraryId : null,
      temporary: token.temporary === true
    })),
    soundtrack: normalizeSoundtrack(campaign.soundtrack)
  }
}

export async function loadCampaign(file: string): Promise<Campaign> {
  try {
    const raw = await readFile(file, 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (!isCampaign(parsed)) throw new Error('Invalid campaign file')
    if (typeof parsed.name !== 'string' || parsed.name.trim() === '') parsed.name = 'Campaign'
    return normalizeCampaign(parsed)
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
