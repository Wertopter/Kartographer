import { useEffect, useState } from 'react'
import type { UpdateStatus } from '@shared/api'

function labelFor(status: UpdateStatus): string {
  if (status.phase === 'checking') return 'Checking…'
  if (status.phase === 'downloading') return `Downloading ${Math.round(status.percent)}%`
  if (status.phase === 'ready') return 'Restart to update'
  if (status.phase === 'current') return 'Up to date'
  if (status.phase === 'error') return 'Update failed'
  return 'Check for updates'
}

export function UpdateButton(): React.JSX.Element {
  const [status, setStatus] = useState<UpdateStatus>({ phase: 'idle' })

  useEffect(() => {
    const unsubscribe = window.kartographer.onUpdateStatus(setStatus)
    void window.kartographer.getUpdateStatus().then(setStatus)
    return unsubscribe
  }, [])

  const busy = status.phase === 'checking' || status.phase === 'downloading'
  const detail = status.phase === 'error' ? status.detail : 'Download and install the latest Kartographer.'

  return (
    <button
      type="button"
      className={status.phase === 'ready' ? 'primary update-button' : 'update-button'}
      disabled={busy}
      title={detail}
      onClick={() => {
        if (status.phase === 'ready') void window.kartographer.installUpdate()
        else void window.kartographer.checkForUpdates()
      }}
    >
      {labelFor(status)}
    </button>
  )
}
