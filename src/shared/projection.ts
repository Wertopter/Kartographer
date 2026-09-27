import { isCellRevealed, cellAt } from '@shared/geometry'
import type { Campaign, PlayerProjection, PointerPing } from '@shared/types'
import { POINTER_MS } from '@shared/types'

export function assetUrl(file: string): string {
  return `kartographer://assets/${encodeURIComponent(file)}`
}

export function toPlayerProjection(
  campaign: Campaign,
  pointer: PointerPing | null,
  now = Date.now()
): PlayerProjection {
  const scene = campaign.scenes.find((item) => item.id === campaign.activeSceneId) ?? null
  if (!scene) return { scene: null, tokens: [], pointer: null }

  const handout = scene.kind === 'handout'
  const playerFog = handout ? ({ mode: 'none' } as const) : scene.fog
  const tokens = campaign.tokens
    .filter((token) => token.sceneId === scene.id && token.visibleToPlayers)
    .filter((token) => {
      if (handout) return false
      if (scene.fog.mode === 'revealed') return true
      const cell = cellAt(token.x, token.y, scene.width, scene.height, scene.grid)
      return isCellRevealed(scene.fog, cell)
    })
    .map((token) => ({
      id: token.id,
      x: token.x,
      y: token.y,
      size: token.size,
      label: token.label,
      color: token.color,
      imageUrl: token.imageFile ? assetUrl(token.imageFile) : null
    }))

  let playerPointer: PointerPing | null = null
  if (
    pointer &&
    pointer.sceneId === scene.id &&
    now - pointer.at <= POINTER_MS
  ) {
    if (handout || scene.fog.mode === 'revealed') {
      playerPointer = pointer
    } else {
      const cell = cellAt(pointer.x, pointer.y, scene.width, scene.height, scene.grid)
      if (isCellRevealed(scene.fog, cell)) playerPointer = pointer
    }
  }

  return {
    scene: {
      id: scene.id,
      name: scene.name,
      kind: scene.kind,
      width: scene.width,
      height: scene.height,
      imageUrl: assetUrl(scene.assetFile),
      camera: scene.camera,
      grid: scene.grid,
      showGrid: !handout && scene.grid.enabled,
      fog: playerFog
    },
    tokens,
    pointer: playerPointer
  }
}
