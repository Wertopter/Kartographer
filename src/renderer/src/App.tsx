import { useState } from 'react'
import { GmApp } from '@renderer/gm/GmApp'
import { GuestApp } from '@renderer/player/GuestApp'
import { PlayerApp } from '@renderer/player/PlayerApp'

export function App(): React.JSX.Element {
  const [joining, setJoining] = useState(false)
  if (!window.kartographer) {
    return (
      <div className="boot">
        <p className="wordmark">Kartographer</p>
        <p>This window only runs inside the Kartographer app.</p>
      </div>
    )
  }
  const view = new URLSearchParams(window.location.search).get('view')
  if (view === 'player') return <PlayerApp />
  if (joining) return <GuestApp onLeave={() => setJoining(false)} />
  return <GmApp onJoin={() => setJoining(true)} />
}
