import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { channels, type KartographerApi } from '@shared/api'
import type { RemoteCommand, RemoteProjection } from '@shared/remote'
import type { Command, GmState, PlayerProjection, RemotePeer } from '@shared/types'

const api: KartographerApi = {
  getState: () => ipcRenderer.invoke(channels.getState) as Promise<GmState>,
  getPlayerState: () => ipcRenderer.invoke(channels.getPlayerState) as Promise<PlayerProjection>,
  onState: (callback) => {
    const listener = (_event: IpcRendererEvent, state: GmState) => callback(state)
    ipcRenderer.on(channels.gmState, listener)
    return () => {
      ipcRenderer.removeListener(channels.gmState, listener)
    }
  },
  onPlayerState: (callback) => {
    const listener = (_event: IpcRendererEvent, state: PlayerProjection) => callback(state)
    ipcRenderer.on(channels.playerState, listener)
    return () => {
      ipcRenderer.removeListener(channels.playerState, listener)
    }
  },
  command: async (command: Command) => {
    await ipcRenderer.invoke(channels.command, command)
  },
  importScenes: async () => {
    await ipcRenderer.invoke(channels.importScenes)
  },
  chooseTokenImage: async (tokenId: string) => {
    await ipcRenderer.invoke(channels.chooseTokenImage, tokenId)
  },
  stageTokenImage: () => ipcRenderer.invoke(channels.stageTokenImage) as Promise<string | null>,
  releaseStagedImage: async (file: string) => {
    await ipcRenderer.invoke(channels.releaseStagedImage, file)
  },
  openPlayerWindow: async (displayId: number | null) => {
    await ipcRenderer.invoke(channels.openPlayerWindow, displayId)
  },
  closePlayerWindow: async () => {
    await ipcRenderer.invoke(channels.closePlayerWindow)
  },
  revealCampaign: async () => {
    await ipcRenderer.invoke(channels.revealCampaign)
  },
  createCampaignFolder: async () => {
    await ipcRenderer.invoke(channels.createCampaignFolder)
  },
  openCampaignFolder: async () => {
    await ipcRenderer.invoke(channels.openCampaignFolder)
  },
  switchCampaign: async (folder: string) => {
    await ipcRenderer.invoke(channels.switchCampaign, folder)
  },
  forgetCampaign: async (folder: string) => {
    await ipcRenderer.invoke(channels.forgetCampaign, folder)
  },
  setRemotePeers: async (peers: RemotePeer[]) => {
    await ipcRenderer.invoke(channels.setRemotePeers, peers)
  },
  applyRemoteCommand: async (peerId: string, command: RemoteCommand) => {
    await ipcRenderer.invoke(channels.applyRemoteCommand, peerId, command)
  },
  getRemoteProjection: (peerId: string) =>
    ipcRenderer.invoke(channels.getRemoteProjection, peerId) as Promise<RemoteProjection | null>,
  readRemoteAsset: (hash: string) =>
    ipcRenderer.invoke(channels.readRemoteAsset, hash) as Promise<{ mime: string; data: Uint8Array } | null>,
  writeRemoteAsset: (hash: string, data: Uint8Array, mime: string) =>
    ipcRenderer.invoke(channels.writeRemoteAsset, hash, data, mime) as Promise<boolean>
}

contextBridge.exposeInMainWorld('kartographer', api)
