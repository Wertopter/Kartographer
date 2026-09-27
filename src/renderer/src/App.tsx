import { GmApp } from '@renderer/gm/GmApp'
import { PlayerApp } from '@renderer/player/PlayerApp'

export function App(): React.JSX.Element {
  if (!window.kartographer) {
    return (
      <div className="boot">
        <p className="wordmark">Kartographer</p>
        <p>This window only runs inside the Kartographer app.</p>
      </div>
    )
  }
  const view = new URLSearchParams(window.location.search).get('view')
  return view === 'player' ? <PlayerApp /> : <GmApp />
}
