import { cellAt, isCellRevealed } from '@shared/geometry'
import { sanitizeAuthorMarks, sanitizeMarkBoard, type AuthorMarks } from '@shared/marks'
import type { Command, PlayerProjection, PointerPing, Scene, Token } from '@shared/types'

/** Deployed Worker origin, without a trailing slash. Replace this after `wrangler deploy`. */
export const SIGNAL_URL = 'https://kartographer-signal.adamlbrower.workers.dev'

const INVITE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
const ASSET_PREFIX = 'kartographer://assets/'

export const ASSET_CHUNK_BYTES = 12_000
export const MAX_ASSET_BYTES = 80_000_000
export const SESSION_MS = 8 * 60 * 60 * 1000

export type IceServer = {
  urls: string | string[]
  username?: string
  credential?: string
}

export type IceCandidate = {
  candidate?: string
  sdpMid?: string | null
  sdpMLineIndex?: number | null
  usernameFragment?: string | null
}

export type SignalPayload =
  | { kind: 'offer'; sdp: string }
  | { kind: 'answer'; sdp: string }
  | { kind: 'ice'; candidate: IceCandidate }

export type RemoteToken = {
  id: string
  x: number
  y: number
  size: number
  label: string
  color: string
  imageHash: string | null
}

export type RemoteProjection = {
  scene: {
    id: string
    name: string
    kind: Scene['kind']
    width: number
    height: number
    imageHash: string
    camera: Scene['camera']
    grid: Scene['grid']
    showGrid: boolean
    fog: NonNullable<PlayerProjection['scene']>['fog']
  } | null
  tokens: RemoteToken[]
  pointer: PointerPing | null
  controlledTokenIds: string[]
}

export type RemoteCommand =
  | { type: 'pointer'; x: number; y: number }
  | { type: 'moveToken'; tokenId: string; x: number; y: number }

export type RemoteSoundtrackChannel = {
  id: string
  url: string
  volume: number
  playing: boolean
  position: number
  at: number
  /** The exact video the host is hearing. Players load this instead of shuffling a playlist themselves. */
  videoId: string | null
  playlistIndex: number | null
  shuffle: boolean
  loop: boolean
}

export type RemoteSoundtrack = {
  channels: RemoteSoundtrackChannel[]
}

export type DataMessage =
  | { type: 'projection'; projection: RemoteProjection }
  | { type: 'soundtrack'; soundtrack: RemoteSoundtrack }
  | { type: 'marks'; marks: AuthorMarks }
  | { type: 'mark-board'; board: AuthorMarks[] }
  | { type: 'need'; hashes: string[] }
  | { type: 'asset'; hash: string; mime: string; index: number; count: number; data: string }
  | { type: 'command'; command: RemoteCommand }

export type SignalServerMessage =
  | { type: 'hello'; peerId: string; role: 'host' | 'guest'; hostPeerId: string; hostReady: boolean; iceServers: IceServer[] }
  | { type: 'host-ready' }
  | { type: 'peer'; action: 'joined' | 'left'; peerId: string; name: string }
  | { type: 'signal'; from: string; payload: SignalPayload }
  | { type: 'room-closed' }

export function signalHttp(path: string): string {
  return `${SIGNAL_URL}${path}`
}

export function signalWebSocket(code: string, token: string): string {
  const origin = SIGNAL_URL.replace(/^http/, 'ws')
  return `${origin}/rooms/${code}/socket?token=${encodeURIComponent(token)}`
}

export function signalOrigin(): string {
  try {
    return new URL(SIGNAL_URL).origin
  } catch {
    return SIGNAL_URL
  }
}

export function createInviteCode(bytes: Uint8Array): string {
  if (bytes.length < 12) throw new Error('Invite code needs 12 random bytes.')
  let raw = ''
  for (let index = 0; index < 12; index += 1) raw += INVITE_ALPHABET[bytes[index] % INVITE_ALPHABET.length]
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`
}

export function normalizeInviteCode(input: string): string | null {
  const raw = input.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (raw.length !== 12) return null
  if ([...raw].some((char) => !INVITE_ALPHABET.includes(char))) return null
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`
}

export function remoteAssetUrl(hash: string): string {
  return `kartographer://remote/${hash}`
}

export function assetFileName(url: string): string | null {
  if (!url.startsWith(ASSET_PREFIX)) return null
  try {
    const file = decodeURIComponent(url.slice(ASSET_PREFIX.length))
    if (!file || file.includes('/') || file.includes('\\') || file.includes('..')) return null
    return file
  } catch {
    return null
  }
}

export function playerMayPing(scene: Scene, x: number, y: number): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false
  if (scene.kind === 'handout') return true
  const cell = cellAt(x, y, scene.width, scene.height, scene.grid)
  return isCellRevealed(scene.fog, cell)
}

export function controlledTokenIds(
  assignments: { tokenId: string; peerId: string }[],
  peerId: string,
  visibleIds: string[]
): string[] {
  const visible = new Set(visibleIds)
  return assignments.filter((item) => item.peerId === peerId && visible.has(item.tokenId)).map((item) => item.tokenId)
}

export function remoteMoveCommand(token: Token, x: number, y: number): Extract<Command, { type: 'updateToken' }> {
  return {
    type: 'updateToken',
    tokenId: token.id,
    x,
    y,
    size: token.size,
    label: token.label,
    color: token.color,
    visibleToPlayers: token.visibleToPlayers
  }
}

export function buildRemoteProjection(
  projection: PlayerProjection,
  files: Map<string, string>,
  controlled: string[]
): RemoteProjection {
  const sceneFile = projection.scene ? assetFileName(projection.scene.imageUrl) : null
  const imageHash = sceneFile ? files.get(sceneFile) : undefined
  return {
    scene:
      projection.scene && imageHash
        ? {
            id: projection.scene.id,
            name: projection.scene.name,
            kind: projection.scene.kind,
            width: projection.scene.width,
            height: projection.scene.height,
            imageHash,
            camera: projection.scene.camera,
            grid: projection.scene.grid,
            showGrid: projection.scene.showGrid,
            fog: projection.scene.fog
          }
        : null,
    tokens: projection.tokens.map((token) => {
      const file = token.imageUrl ? assetFileName(token.imageUrl) : null
      return {
        id: token.id,
        x: token.x,
        y: token.y,
        size: token.size,
        label: token.label,
        color: token.color,
        imageHash: file ? files.get(file) ?? null : null
      }
    }),
    pointer: projection.pointer,
    controlledTokenIds: controlled
  }
}

export function projectionAssets(projection: RemoteProjection): string[] {
  const hashes: string[] = []
  if (projection.scene) hashes.push(projection.scene.imageHash)
  for (const token of projection.tokens) {
    if (token.imageHash) hashes.push(token.imageHash)
  }
  return [...new Set(hashes)]
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isHash(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
}

export function parseRemoteCommand(value: unknown): RemoteCommand | null {
  if (!value || typeof value !== 'object') return null
  const command = value as { type?: unknown; x?: unknown; y?: unknown; tokenId?: unknown }
  if (command.type === 'pointer' && finite(command.x) && finite(command.y)) {
    return { type: 'pointer', x: command.x, y: command.y }
  }
  if (
    command.type === 'moveToken' &&
    typeof command.tokenId === 'string' &&
    /^[a-zA-Z0-9-]{8,80}$/.test(command.tokenId) &&
    finite(command.x) &&
    finite(command.y)
  ) {
    return { type: 'moveToken', tokenId: command.tokenId, x: command.x, y: command.y }
  }
  return null
}

export function parseDataMessage(raw: string): DataMessage | null {
  let value: unknown
  try {
    value = JSON.parse(raw) as unknown
  } catch {
    return null
  }
  if (!value || typeof value !== 'object') return null
  const message = value as {
    type?: unknown
    projection?: unknown
    hashes?: unknown
    hash?: unknown
    mime?: unknown
    index?: unknown
    count?: unknown
    data?: unknown
    command?: unknown
    soundtrack?: unknown
    marks?: unknown
    board?: unknown
  }
  if (message.type === 'command') {
    const command = parseRemoteCommand(message.command)
    return command ? { type: 'command', command } : null
  }
  if (message.type === 'need' && Array.isArray(message.hashes)) {
    const hashes = message.hashes.filter(isHash).slice(0, 32)
    return { type: 'need', hashes }
  }
  if (
    message.type === 'asset' &&
    isHash(message.hash) &&
    typeof message.mime === 'string' &&
    Number.isInteger(message.index) &&
    Number.isInteger(message.count) &&
    typeof message.data === 'string' &&
    (message.index as number) >= 0 &&
    (message.count as number) > 0 &&
    (message.index as number) < (message.count as number) &&
    (message.count as number) <= 8_000 &&
    message.data.length <= 20_000
  ) {
    return {
      type: 'asset',
      hash: message.hash,
      mime: message.mime,
      index: message.index as number,
      count: message.count as number,
      data: message.data
    }
  }
  if (message.type === 'projection') {
    const projection = parseProjection(message.projection)
    return projection ? { type: 'projection', projection } : null
  }
  if (message.type === 'soundtrack') {
    const soundtrack = parseSoundtrack(message.soundtrack)
    return soundtrack ? { type: 'soundtrack', soundtrack } : null
  }
  if (message.type === 'marks') {
    const marks = sanitizeAuthorMarks(message.marks)
    return marks ? { type: 'marks', marks } : null
  }
  if (message.type === 'mark-board') {
    return { type: 'mark-board', board: sanitizeMarkBoard(message.board) }
  }
  return null
}

function parseSoundtrack(value: unknown): RemoteSoundtrack | null {
  if (!value || typeof value !== 'object') return null
  const channels = (value as { channels?: unknown }).channels
  if (!Array.isArray(channels)) return null
  const parsed: RemoteSoundtrackChannel[] = []
  for (const item of channels.slice(0, 8)) {
    if (!item || typeof item !== 'object') return null
    const channel = item as Partial<RemoteSoundtrackChannel>
    if (typeof channel.id !== 'string' || !/^ch-[1-8]$/.test(channel.id)) return null
    if (typeof channel.url !== 'string' || channel.url.length > 2000) return null
    if (!finite(channel.volume) || !finite(channel.position) || !finite(channel.at)) return null
    if (typeof channel.playing !== 'boolean') return null
    if (typeof channel.shuffle !== 'boolean' || typeof channel.loop !== 'boolean') return null
    const playlistIndex =
      channel.playlistIndex == null
        ? null
        : Number.isInteger(channel.playlistIndex) && (channel.playlistIndex as number) >= 0
          ? (channel.playlistIndex as number)
          : null
    const videoId =
      typeof channel.videoId === 'string' && /^[A-Za-z0-9_-]{11}$/.test(channel.videoId) ? channel.videoId : null
    parsed.push({
      id: channel.id,
      url: channel.url,
      volume: Math.min(100, Math.max(0, Math.round(channel.volume))),
      playing: channel.playing,
      position: Math.max(0, channel.position),
      at: channel.at,
      videoId,
      playlistIndex,
      shuffle: channel.shuffle,
      loop: channel.loop
    })
  }
  return { channels: parsed }
}

function parseProjection(value: unknown): RemoteProjection | null {
  if (!value || typeof value !== 'object') return null
  const projection = value as {
    scene?: unknown
    tokens?: unknown
    pointer?: unknown
    controlledTokenIds?: unknown
  }
  const scene = parseScene(projection.scene)
  if (projection.scene != null && !scene) return null
  if (!Array.isArray(projection.tokens)) return null
  const tokens: RemoteToken[] = []
  for (const item of projection.tokens) {
    const token = parseToken(item)
    if (!token) return null
    tokens.push(token)
  }
  const pointer = parsePointer(projection.pointer)
  if (projection.pointer != null && !pointer) return null
  const controlledTokenIds = Array.isArray(projection.controlledTokenIds)
    ? projection.controlledTokenIds.filter((id): id is string => typeof id === 'string').slice(0, 64)
    : []
  return { scene, tokens, pointer, controlledTokenIds }
}

function parseScene(value: unknown): RemoteProjection['scene'] {
  if (value == null) return null
  if (!value || typeof value !== 'object') return null
  const scene = value as RemoteProjection['scene']
  if (!scene) return null
  if (typeof scene.id !== 'string' || typeof scene.name !== 'string') return null
  if (scene.kind !== 'map' && scene.kind !== 'handout') return null
  if (!finite(scene.width) || !finite(scene.height) || scene.width <= 0 || scene.height <= 0) return null
  if (!isHash(scene.imageHash)) return null
  if (!scene.camera || !finite(scene.camera.x) || !finite(scene.camera.y) || !finite(scene.camera.scale)) return null
  if (!scene.fog || typeof scene.fog !== 'object' || typeof scene.fog.mode !== 'string') return null
  return {
    id: scene.id,
    name: scene.name.slice(0, 80),
    kind: scene.kind,
    width: scene.width,
    height: scene.height,
    imageHash: scene.imageHash,
    camera: scene.camera,
    grid: scene.grid,
    showGrid: Boolean(scene.showGrid),
    fog: scene.fog
  }
}

function parseToken(value: unknown): RemoteToken | null {
  if (!value || typeof value !== 'object') return null
  const token = value as RemoteToken
  if (typeof token.id !== 'string' || typeof token.label !== 'string' || typeof token.color !== 'string') return null
  if (!finite(token.x) || !finite(token.y) || !finite(token.size)) return null
  if (token.imageHash != null && !isHash(token.imageHash)) return null
  return {
    id: token.id,
    x: token.x,
    y: token.y,
    size: token.size,
    label: token.label.slice(0, 24),
    color: token.color,
    imageHash: token.imageHash
  }
}

function parsePointer(value: unknown): PointerPing | null {
  if (value == null) return null
  if (!value || typeof value !== 'object') return null
  const pointer = value as PointerPing
  if (typeof pointer.id !== 'string' || typeof pointer.sceneId !== 'string') return null
  if (!finite(pointer.x) || !finite(pointer.y) || !finite(pointer.at)) return null
  return pointer
}

export function presentRemoteProjection(projection: RemoteProjection, ready: ReadonlySet<string>): PlayerProjection | null {
  if (!projection.scene || !ready.has(projection.scene.imageHash)) return null
  return {
    scene: {
      id: projection.scene.id,
      name: projection.scene.name,
      kind: projection.scene.kind,
      width: projection.scene.width,
      height: projection.scene.height,
      imageUrl: remoteAssetUrl(projection.scene.imageHash),
      camera: projection.scene.camera,
      grid: projection.scene.grid,
      showGrid: projection.scene.showGrid,
      fog: projection.scene.fog
    },
    tokens: projection.tokens.map((token) => ({
      id: token.id,
      x: token.x,
      y: token.y,
      size: token.size,
      label: token.label,
      color: token.color,
      imageUrl: token.imageHash && ready.has(token.imageHash) ? remoteAssetUrl(token.imageHash) : null
    })),
    pointer: projection.pointer
  }
}
