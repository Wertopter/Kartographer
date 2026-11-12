import { app, BrowserWindow, dialog, type MessageBoxOptions } from 'electron'
import { autoUpdater } from 'electron-updater'

type Parent = () => BrowserWindow | null

let configured = false
let prompting = false
let interactive = false
let readyVersion: string | null = null

function showMessage(getParent: Parent, options: MessageBoxOptions): Promise<Electron.MessageBoxReturnValue> {
  const parent = getParent()
  if (parent && !parent.isDestroyed()) return dialog.showMessageBox(parent, options)
  return dialog.showMessageBox(options)
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
    if (response === 0) autoUpdater.quitAndInstall(true, true)
  })
}

function configure(getParent: Parent): void {
  if (configured) return
  configured = true
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.disableWebInstaller = true

  autoUpdater.on('update-not-available', () => {
    if (!interactive) return
    interactive = false
    void showMessage(getParent, {
      type: 'info',
      title: 'Kartographer',
      message: `Kartographer ${app.getVersion()} is up to date.`
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    readyVersion = info.version
    interactive = false
    promptInstall(getParent, info.version)
  })

  autoUpdater.on('error', (error) => {
    console.error(error)
    if (!interactive) return
    interactive = false
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
    promptInstall(getParent, readyVersion)
    return
  }
  interactive = true
  void autoUpdater.checkForUpdates().catch(() => {
    // Reported by the error event when this check was started from the menu.
  })
}
