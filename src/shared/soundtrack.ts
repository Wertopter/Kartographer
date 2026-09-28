import type { SoundtrackChannel } from '@shared/types'

export const SOUNDTRACK_CHANNELS = 8
const TITLE_LIMIT = 60

export type SoundtrackSource = {
  videoId: string | null
  playlistId: string | null
}

export type { SoundtrackChannel }

export function normalizeSoundtrack(value: unknown): SoundtrackChannel[] {
  const incoming = Array.isArray(value) ? value : []
  return Array.from({ length: SOUNDTRACK_CHANNELS }, (_, index) => {
    const item = incoming[index]
    const record =
      item && typeof item === 'object' ? (item as { title?: unknown; url?: unknown; volume?: unknown }) : null
    const title = typeof record?.title === 'string' ? record.title.trim().slice(0, TITLE_LIMIT) : ''
    const url = typeof record?.url === 'string' ? record.url.trim().slice(0, 2000) : ''
    const volume =
      typeof record?.volume === 'number' && Number.isFinite(record.volume)
        ? Math.min(100, Math.max(0, Math.round(record.volume)))
        : 80
    return { id: `ch-${index + 1}`, title, url, volume }
  })
}

export function parseSoundtrackUrl(input: string): SoundtrackSource | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null

  const host = url.hostname.toLowerCase().replace(/^www\./, '')
  const youtubeHost = host === 'youtu.be' || host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com'
  if (!youtubeHost) return null

  const playlistId = playlistIdFrom(url)
  if (host === 'youtu.be') {
    const videoId = url.pathname.split('/').filter(Boolean)[0]
    if (!isYoutubeId(videoId)) return playlistId ? { videoId: null, playlistId } : null
    return { videoId, playlistId }
  }

  const parts = url.pathname.split('/').filter(Boolean)
  if (parts[0] === 'watch' || parts[0] === 'playlist') {
    const videoParam = url.searchParams.get('v')
    const videoId = isYoutubeId(videoParam) ? videoParam : null
    if (!videoId && !playlistId) return null
    return { videoId, playlistId }
  }
  if (parts[0] === 'embed' && parts[1] === 'videoseries') {
    return playlistId ? { videoId: null, playlistId } : null
  }
  if ((parts[0] === 'embed' || parts[0] === 'shorts' || parts[0] === 'live') && isYoutubeId(parts[1])) {
    return { videoId: parts[1], playlistId }
  }
  return playlistId ? { videoId: null, playlistId } : null
}

function playlistIdFrom(url: URL): string | null {
  const list = url.searchParams.get('list')
  return isPlaylistId(list) ? list : null
}

function isPlaylistId(value: string | null): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{13,}$/.test(value)
}

function isYoutubeId(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{11}$/.test(value)
}
