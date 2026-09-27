import { app, BrowserWindow, screen, type Rectangle } from 'electron'
import { join } from 'path'
import type { DisplayInfo } from '@shared/types'

export function listDisplays(): DisplayInfo[] {
  const primaryId = screen.getPrimaryDisplay().id
  let externalOrdinal = 0
  return screen.getAllDisplays().map((display) => {
    const primary = display.id === primaryId
    let kind = 'External display'
    if (primary) kind = 'Main display'
    else if (display.internal) kind = 'Built-in display'
    else {
      externalOrdinal += 1
      kind = `External ${externalOrdinal}`
    }
    const platformName = display.label ? ` (${display.label})` : ''
    return {
      id: display.id,
      label: `${kind}${platformName} · ${Math.round(display.bounds.width)}×${Math.round(display.bounds.height)}`,
      bounds: {
        x: display.bounds.x,
        y: display.bounds.y,
        width: display.bounds.width,
        height: display.bounds.height
      },
      scaleFactor: display.scaleFactor,
      primary,
      internal: display.internal
    }
  })
}

export function externalDisplayId(): number | null {
  const displays = screen.getAllDisplays()
  if (displays.length < 2) return null
  const primaryId = screen.getPrimaryDisplay().id
  return displays.find((display) => display.id !== primaryId)?.id ?? null
}

export function createGmWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: 'Kartographer',
    backgroundColor: '#14110e',
    autoHideMenuBar: false,
    acceptFirstMouse: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  window.on('ready-to-show', () => window.show())
  watchRenderer(window)
  loadView(window, 'gm')
  return window
}

export function createPlayerWindow(fill: Rectangle | null): BrowserWindow {
  const window = new BrowserWindow({
    title: 'Kartographer — Players',
    frame: fill == null,
    fullscreen: false,
    fullscreenable: false,
    backgroundColor: '#000000',
    show: false,
    autoHideMenuBar: true,
    acceptFirstMouse: true,
    hasShadow: fill == null,
    thickFrame: fill == null,
    roundedCorners: fill == null,
    ...(fill
      ? { x: fill.x, y: fill.y, width: fill.width, height: fill.height }
      : { width: 1280, height: 720, minWidth: 640, minHeight: 360 }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  window.setMenuBarVisibility(false)
  window.setFullScreenable(false)
  if (fill && process.platform === 'darwin') {
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  }
  window.once('ready-to-show', () => {
    if (fill) window.setBounds(fill)
    window.show()
  })
  window.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape') {
      event.preventDefault()
      window.close()
    }
  })
  watchRenderer(window)
  loadView(window, 'player')
  return window
}

function watchRenderer(window: BrowserWindow): void {
  window.webContents.on('console-message', (event) => {
    if (event.level !== 'error') return
    console.error(`[renderer] ${event.message} (${event.sourceId}:${event.lineNumber})`)
  })
  window.webContents.on('did-fail-load', (_event, code, description, url) => {
    console.error(`[renderer] failed to load ${url} (${code} ${description})`)
  })
}

function loadView(window: BrowserWindow, view: 'gm' | 'player'): void {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devUrl) {
    const url = new URL(devUrl)
    url.searchParams.set('view', view)
    void window.loadURL(url.toString())
    return
  }
  void window.loadFile(join(__dirname, '../renderer/index.html'), { query: { view } })
}
