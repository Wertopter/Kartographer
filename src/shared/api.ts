import type { Command, DisplayInfo, GmState, PlayerProjection } from '@shared/types'

export const channels = {
  getState: 'kartographer:get-state',
  getPlayerState: 'kartographer:get-player-state',
  command: 'kartographer:command',
  importScenes: 'kartographer:import-scenes',
  chooseTokenImage: 'kartographer:choose-token-image',
  openPlayerWindow: 'kartographer:open-player-window',
  closePlayerWindow: 'kartographer:close-player-window',
  revealCampaign: 'kartographer:reveal-campaign',
  gmState: 'kartographer:gm-state',
  playerState: 'kartographer:player-state'
} as const

export type KartographerApi = {
  getState: () => Promise<GmState>
  getPlayerState: () => Promise<PlayerProjection>
  onState: (callback: (state: GmState) => void) => () => void
  onPlayerState: (callback: (state: PlayerProjection) => void) => () => void
  command: (command: Command) => Promise<void>
  importScenes: () => Promise<void>
  chooseTokenImage: (tokenId: string) => Promise<void>
  openPlayerWindow: (displayId: number | null) => Promise<void>
  closePlayerWindow: () => Promise<void>
  revealCampaign: () => Promise<void>
}

export type { DisplayInfo }
