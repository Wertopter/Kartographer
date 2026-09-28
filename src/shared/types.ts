export type SceneKind = 'map' | 'handout'

export type Camera = {
  x: number
  y: number
  /** CSS pixels per world pixel on the GM view. */
  scale: number
  /** GM viewport size that defines the framed rectangle the player view matches. */
  viewWidth: number
  viewHeight: number
}

export type GridSettings = {
  enabled: boolean
  cellSize: number
  offsetX: number
  offsetY: number
  color: string
}

/** Fully covered and fully revealed avoid storing every cell. Partial stores revealed indexes only. */
export type Fog =
  | { mode: 'covered' }
  | { mode: 'revealed' }
  | { mode: 'partial'; cells: number[] }

export type Scene = {
  id: string
  name: string
  kind: SceneKind
  assetFile: string
  width: number
  height: number
  camera: Camera
  grid: GridSettings
  fog: Fog
}

export type Token = {
  id: string
  sceneId: string
  x: number
  y: number
  size: number
  label: string
  color: string
  imageFile: string | null
  visibleToPlayers: boolean
  /** Set when this token was saved to, or placed from, the library. */
  libraryId: string | null
  /** A temporary token is not written to the library. */
  temporary: boolean
}

export type LibraryToken = {
  id: string
  label: string
  color: string
  imageFile: string | null
  visibleToPlayers: boolean
}

export type SoundtrackChannel = {
  id: string
  /** GM label for what this channel is used for, such as tavern ambience or combat. */
  title: string
  url: string
  volume: number
}

export type Campaign = {
  version: 1
  name: string
  activeSceneId: string | null
  scenes: Scene[]
  tokens: Token[]
  library: LibraryToken[]
  soundtrack: SoundtrackChannel[]
}

export type PointerPing = {
  id: string
  sceneId: string
  x: number
  y: number
  at: number
}

export type DisplayInfo = {
  id: number
  label: string
  bounds: { x: number; y: number; width: number; height: number }
  scaleFactor: number
  primary: boolean
  internal: boolean
}

export type PlayerToken = {
  id: string
  x: number
  y: number
  size: number
  label: string
  color: string
  imageUrl: string | null
}

export type PlayerScene = {
  id: string
  name: string
  kind: SceneKind
  width: number
  height: number
  imageUrl: string
  camera: Camera
  grid: GridSettings
  showGrid: boolean
  fog: Fog | { mode: 'none' }
}

export type PlayerProjection = {
  scene: PlayerScene | null
  tokens: PlayerToken[]
  pointer: PointerPing | null
}

export type GmScene = Scene & { imageUrl: string }
export type GmToken = Token & { imageUrl: string | null }
export type GmLibraryToken = LibraryToken & { imageUrl: string | null }

export type RecentCampaign = {
  path: string
  name: string
  missing: boolean
}

export type GmState = {
  campaignOpen: boolean
  campaignName: string
  campaignDir: string
  recentCampaigns: RecentCampaign[]
  activeSceneId: string | null
  scenes: GmScene[]
  tokens: GmToken[]
  library: GmLibraryToken[]
  soundtrack: SoundtrackChannel[]
  pointer: PointerPing | null
  displays: DisplayInfo[]
  playerWindowOpen: boolean
  status: string | null
}

export type Command =
  | { type: 'renameCampaign'; name: string }
  | { type: 'renameScene'; sceneId: string; name: string }
  | { type: 'deleteScene'; sceneId: string }
  | { type: 'setActiveScene'; sceneId: string }
  | { type: 'setSceneKind'; sceneId: string; kind: SceneKind }
  | { type: 'updateCamera'; sceneId: string; camera: Camera }
  | { type: 'updateGrid'; sceneId: string; grid: GridSettings }
  | { type: 'paintFog'; sceneId: string; cells: number[]; mode: 'reveal' | 'hide' }
  | { type: 'revealAll'; sceneId: string }
  | { type: 'coverAll'; sceneId: string }
  | {
      type: 'addToken'
      sceneId: string
      x: number
      y: number
      kind: 'new' | 'temporary'
      label: string
      color: string
      imageFile: string | null
      visibleToPlayers: boolean
    }
  | { type: 'placeLibraryToken'; sceneId: string; x: number; y: number; libraryId: string }
  | { type: 'deleteLibraryToken'; libraryId: string }
  | {
      type: 'updateToken'
      tokenId: string
      x: number
      y: number
      size: number
      label: string
      color: string
      visibleToPlayers: boolean
    }
  | { type: 'deleteToken'; tokenId: string }
  | { type: 'clearTokenImage'; tokenId: string }
  | { type: 'pointer'; sceneId: string; x: number; y: number }
  | { type: 'updateSoundtrack'; channels: SoundtrackChannel[] }

export const TOKEN_COLORS = [
  '#d4764e',
  '#3f8f6b',
  '#4f78a8',
  '#c45c6a',
  '#e0a45a',
  '#8a6bb5',
  '#d9d3c7'
] as const

export const POINTER_MS = 1400
export const MAX_FOG_CELLS = 250_000
