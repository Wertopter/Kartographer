import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { channels, type KartographerApi } from '@shared/api'
import type { Command, GmState, PlayerProjection } from '@shared/types'

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
  }
}

contextBridge.exposeInMainWorld('kartographer', api)
