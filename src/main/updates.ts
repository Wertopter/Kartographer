import { app, BrowserWindow, dialog, type MessageBoxOptions } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateStatus } from '@shared/api'

type Parent = () => BrowserWindow | null

let configured = false
let prompting = false
let interactive = false
let readyVersion: string | null = null
let status: UpdateStatus = { phase: 'idle' }
let onStatus: ((status: UpdateStatus) => void) | null = null

function showMessage(getParent: Parent, options: MessageBoxOptions): Promise<Electron.MessageBoxReturnValue> {
  const parent = getParent()
  if (parent && !parent.isDestroyed()) return dialog.showMessageBox(parent, options)
  return dialog.showMessageBox(options)
}

function publish(next: UpdateStatus): void {
  status = next
  onStatus?.(status)
}

export function currentUpdateStatus(): UpdateStatus {
  return status
}

export function subscribeUpdateStatus(listener: (status: UpdateStatus) => void): void {
  onStatus = listener
  listener(status)
}

function promptInstall(getParent: Parent, version: string): void {
  if (prompting) return
  prompting = true
  void showMessage(getParent, {
    type: 'info',
    buttons: ['Restart', 'Later'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
    title: 'Kartographer',
    message: `Kartographer ${version} is ready to install.`,
    detail: 'Restart to finish the update. Otherwise it installs the next time you quit.'
  }).then(({ response }) => {
    prompting = false
    if (response === 0) installUpdate()
  })
}

function configure(getParent: Parent): void {
  if (configured) return
  configured = true
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.disableWebInstaller = true

  autoUpdater.on('update-available', () => {
    if (readyVersion) return
    publish({ phase: 'downloading', percent: 0 })
  })

  autoUpdater.on('download-progress', (info) => {
    if (readyVersion) return
    const percent = Number.isFinite(info.percent) ? Math.max(0, Math.min(100, info.percent)) : 0
    publish({ phase: 'downloading', percent })
  })

  autoUpdater.on('update-not-available', () => {
    const asked = interactive
    interactive = false
    publish(asked ? { phase: 'current' } : { phase: 'idle' })
    if (!asked) return
    void showMessage(getParent, {
      type: 'info',
      title: 'Kartographer',
      message: `Kartographer ${app.getVersion()} is up to date.`
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    readyVersion = info.version
    interactive = false
    publish({ phase: 'ready', version: info.version })
    promptInstall(getParent, info.version)
  })

  autoUpdater.on('error', (error) => {
    console.error(error)
    const asked = interactive
    interactive = false
    if (!asked || readyVersion) {
      if (!readyVersion) publish({ phase: 'idle' })
      return
    }
    publish({ phase: 'error', detail: error.message })
    void showMessage(getParent, {
      type: 'error',
      title: 'Kartographer',
      message: 'Kartographer could not check for updates.',
      detail: error.message
    })
  })
}

export function setupAutoUpdate(getParent: Parent): void {
  if (!app.isPackaged) return
  configure(getParent)
  publish({ phase: 'checking' })
  void autoUpdater.checkForUpdates().catch(() => {
    // The error event reports a manual check. A background failure stays quiet.
  })
}

export function checkForUpdates(getParent: Parent): void {
  if (!app.isPackaged) {
    void showMessage(getParent, {
      type: 'info',
      title: 'Kartographer',
      message: 'Updates are checked from the installed app.',
      detail: 'Install Kartographer to download a newer version.'
    })
    return
  }
  configure(getParent)
  if (readyVersion) {
    publish({ phase: 'ready', version: readyVersion })
    promptInstall(getParent, readyVersion)
    return
  }
  interactive = true
  publish({ phase: 'checking' })
  void autoUpdater.checkForUpdates().catch(() => {
    // Reported by the error event when this check was started from the menu.
  })
}

export function installUpdate(): void {
  if (!readyVersion || !app.isPackaged) return
  autoUpdater.quitAndInstall(true, true)
}
