import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  protocol,
  screen,
  session as electronSession,
  shell
} from 'electron'
import type { Command } from '@shared/types'
import { channels } from '@shared/api'
import { readAsset } from './assets'
import { Session } from './session'
import { createGmWindow, createPlayerWindow, externalDisplayId, listDisplays } from './windows'

const hasLock = app.requestSingleInstanceLock()
if (!hasLock) {
  app.quit()
} else {
  app.setName('Kartographer')
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'kartographer',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true
      }
    }
  ])

  let session: Session | null = null
  let gmWindow: BrowserWindow | null = null
  let playerWindow: BrowserWindow | null = null
  let playerGeneration = 0
  let playerFillId: number | null = null
  let quitting = false

  function broadcast(): void {
    if (!session) return
    const gmState = session.getGmState()
    const playerState = session.getPlayerProjection()
    if (gmWindow && !gmWindow.isDestroyed()) gmWindow.webContents.send(channels.gmState, gmState)
    if (playerWindow && !playerWindow.isDestroyed()) {
      playerWindow.webContents.send(channels.playerState, playerState)
    }
  }

  function isGm(senderId: number): boolean {
    return gmWindow != null && !gmWindow.isDestroyed() && senderId === gmWindow.webContents.id
  }

  function presentPlayerWindow(displayId: number | null): void {
    if (!session) return
    const display =
      displayId == null ? null : screen.getAllDisplays().find((item) => item.id === displayId) ?? null
    const fill = display ? display.bounds : null
    const generation = ++playerGeneration
    if (playerWindow && !playerWindow.isDestroyed()) playerWindow.close()
    const window = createPlayerWindow(fill)
    playerWindow = window
    playerFillId = fill ? displayId : null
    window.on('closed', () => {
      if (generation !== playerGeneration) return
      playerWindow = null
      playerFillId = null
      session?.setPlayerWindowOpen(false)
    })
    window.once('ready-to-show', () => {
      gmWindow?.focus()
    })
    session.setPlayerWindowOpen(true)
    if (fill) {
      const label = listDisplays().find((item) => item.id === displayId)?.label ?? 'the selected display'
      session.setStatus(`Player view is on ${label}.`)
    } else {
      session.setStatus('Player view opened in a window. Drag it to the TV if you need to.')
    }
  }

  function closePlayerWindow(): void {
    playerFillId = null
    if (playerWindow && !playerWindow.isDestroyed()) playerWindow.close()
  }

  function refreshDisplays(): void {
    if (!session) return
    const displays = listDisplays()
    session.setDisplays(displays)
    if (playerFillId != null && !displays.some((display) => display.id === playerFillId)) {
      presentPlayerWindow(null)
      session.setStatus('The player display was disconnected. The player view is in a window.')
      return
    }
    if (playerFillId != null && playerWindow && !playerWindow.isDestroyed()) {
      const display = screen.getAllDisplays().find((item) => item.id === playerFillId)
      if (display) playerWindow.setBounds(display.bounds)
    }
  }

  async function importScenes(): Promise<void> {
    if (!session || !gmWindow) return
    const result = await dialog.showOpenDialog(gmWindow, {
      title: 'Import maps and images',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return
    await session.importSceneFiles(result.filePaths)
  }

  async function chooseTokenImage(tokenId: string): Promise<void> {
    if (!session || !gmWindow) return
    const result = await dialog.showOpenDialog(gmWindow, {
      title: 'Choose a token image',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return
    await session.chooseTokenImage(tokenId, result.filePaths[0])
  }

  function installMenu(): void {
    const isMac = process.platform === 'darwin'
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        ...(isMac ? [{ role: 'appMenu' as const }] : []),
        {
          label: 'File',
          submenu: [
            { label: 'Import Images…', accelerator: 'CmdOrCtrl+O', click: () => void importScenes() },
            {
              label: 'Show Campaign Folder',
              click: () => {
                if (session) shell.showItemInFolder(session.campaignFile)
              }
            },
            { type: 'separator' },
            isMac ? { role: 'close' } : { role: 'quit' }
          ]
        },
        {
          label: 'Player',
          submenu: [
            {
              label: 'Send Player View to External Display',
              accelerator: 'CmdOrCtrl+Shift+P',
              click: () => presentPlayerWindow(externalDisplayId())
            },
            { label: 'Open Player View in a Window', click: () => presentPlayerWindow(null) },
            { label: 'Close Player View', click: () => closePlayerWindow() }
          ]
        },
        { role: 'editMenu' },
        { role: 'viewMenu' },
        { role: 'windowMenu' }
      ])
    )
  }

  app.whenReady().then(async () => {
    if (process.platform === 'win32') app.setAppUserModelId('com.kartographer.app')
    session = new Session(app.getPath('userData'))
    session.setListener(broadcast)
    await session.init()

    protocol.handle('kartographer', (request) => readAsset(session?.assetDirectory ?? '', request.url))

    if (app.isPackaged) installContentSecurityPolicy()

    installMenu()
    gmWindow = createGmWindow()
    gmWindow.on('closed', () => {
      gmWindow = null
      if (process.platform !== 'darwin') app.quit()
    })
    refreshDisplays()
    screen.on('display-added', refreshDisplays)
    screen.on('display-removed', refreshDisplays)
    screen.on('display-metrics-changed', refreshDisplays)

    ipcMain.handle(channels.getState, (event) => {
      if (!isGm(event.sender.id) || !session) return null
      return session.getGmState()
    })
    ipcMain.handle(channels.getPlayerState, () => session?.getPlayerProjection() ?? null)
    ipcMain.handle(channels.command, (event, command: Command) => {
      if (!isGm(event.sender.id)) return
      session?.execute(command)
    })
    ipcMain.handle(channels.importScenes, (event) => {
      if (!isGm(event.sender.id)) return
      return importScenes()
    })
    ipcMain.handle(channels.chooseTokenImage, (event, tokenId: string) => {
      if (!isGm(event.sender.id) || typeof tokenId !== 'string') return
      return chooseTokenImage(tokenId)
    })
    ipcMain.handle(channels.openPlayerWindow, (event, displayId: number | null) => {
      if (!isGm(event.sender.id)) return
      presentPlayerWindow(typeof displayId === 'number' ? displayId : null)
    })
    ipcMain.handle(channels.closePlayerWindow, (event) => {
      if (!isGm(event.sender.id)) return
      closePlayerWindow()
    })
    ipcMain.handle(channels.revealCampaign, (event) => {
      if (!isGm(event.sender.id) || !session) return
      shell.showItemInFolder(session.campaignFile)
    })
  }).catch((error: unknown) => {
    console.error(error)
    dialog.showErrorBox('Kartographer', 'The campaign could not be opened.')
    app.quit()
  })

  app.on('second-instance', () => {
    if (gmWindow && !gmWindow.isDestroyed()) {
      if (gmWindow.isMinimized()) gmWindow.restore()
      gmWindow.focus()
    }
  })

  app.on('activate', () => {
    if (!session) return
    if (!gmWindow || gmWindow.isDestroyed()) gmWindow = createGmWindow()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', (event) => {
    if (!session || quitting) return
    event.preventDefault()
    quitting = true
    void session.flush().finally(() => app.quit())
  })
}

function installContentSecurityPolicy(): void {
  electronSession.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' kartographer: data: blob:"
        ]
      }
    })
  })
}
