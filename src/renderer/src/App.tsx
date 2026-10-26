import { useState } from 'react'
import { GmApp } from '@renderer/gm/GmApp'
import { LandingPage } from '@renderer/LandingPage'
import { GuestApp } from '@renderer/player/GuestApp'
import { PlayerApp } from '@renderer/player/PlayerApp'

type Screen =
  | { kind: 'landing' }
  | { kind: 'host' }
  | { kind: 'guest'; name: string; code: string }

export function App(): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>({ kind: 'landing' })
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
  if (screen.kind === 'guest') {
    return (
      <GuestApp
        initialName={screen.name}
        initialCode={screen.code}
        autoStart
        onLeave={() => setScreen({ kind: 'landing' })}
      />
    )
  }
  if (screen.kind === 'host') return <GmApp onHome={() => setScreen({ kind: 'landing' })} />
  return (
    <LandingPage
      onHost={() => setScreen({ kind: 'host' })}
      onJoin={(name, code) => setScreen({ kind: 'guest', name, code })}
    />
  )
}
