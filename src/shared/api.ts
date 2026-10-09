import type { RemoteCommand, RemoteProjection } from '@shared/remote'
import type { Command, DisplayInfo, GmState, PlayerProjection, RemotePeer } from '@shared/types'

export const channels = {
  getState: 'kartographer:get-state',
  getPlayerState: 'kartographer:get-player-state',
  command: 'kartographer:command',
  importScenes: 'kartographer:import-scenes',
  chooseTokenImage: 'kartographer:choose-token-image',
  stageTokenImage: 'kartographer:stage-token-image',
  releaseStagedImage: 'kartographer:release-staged-image',
  openPlayerWindow: 'kartographer:open-player-window',
  closePlayerWindow: 'kartographer:close-player-window',
  revealCampaign: 'kartographer:reveal-campaign',
  createCampaignFolder: 'kartographer:create-campaign-folder',
  openCampaignFolder: 'kartographer:open-campaign-folder',
  switchCampaign: 'kartographer:switch-campaign',
  forgetCampaign: 'kartographer:forget-campaign',
  setRemotePeers: 'kartographer:set-remote-peers',
  applyRemoteCommand: 'kartographer:apply-remote-command',
  getRemoteProjection: 'kartographer:get-remote-projection',
  readRemoteAsset: 'kartographer:read-remote-asset',
  writeRemoteAsset: 'kartographer:write-remote-asset',
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
  stageTokenImage: () => Promise<string | null>
  releaseStagedImage: (file: string) => Promise<void>
  openPlayerWindow: (displayId: number | null) => Promise<void>
  closePlayerWindow: () => Promise<void>
  revealCampaign: () => Promise<void>
  createCampaignFolder: () => Promise<void>
  openCampaignFolder: () => Promise<void>
  switchCampaign: (folder: string) => Promise<void>
  forgetCampaign: (folder: string) => Promise<void>
  setRemotePeers: (peers: RemotePeer[]) => Promise<void>
  applyRemoteCommand: (peerId: string, command: RemoteCommand) => Promise<void>
  getRemoteProjection: (peerId: string) => Promise<RemoteProjection | null>
  readRemoteAsset: (hash: string) => Promise<{ mime: string; data: Uint8Array } | null>
  writeRemoteAsset: (hash: string, data: Uint8Array, mime: string) => Promise<boolean>
}

export type { DisplayInfo }
