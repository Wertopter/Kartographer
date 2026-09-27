import { useEffect, useState } from 'react'
import type { PlayerProjection } from '@shared/types'
import { MapViewport } from '@renderer/viewport/MapViewport'

function usePlayerState(): PlayerProjection | null {
  const [state, setState] = useState<PlayerProjection | null>(null)
  useEffect(() => {
    let live = false
    const unsubscribe = window.kartographer.onPlayerState((next) => {
      live = true
      setState(next)
    })
    void window.kartographer.getPlayerState().then((next) => {
      if (!live && next) setState(next)
    })
    return unsubscribe
  }, [])
  return state
}

export function PlayerApp(): React.JSX.Element {
  const state = usePlayerState()
  if (!state?.scene) {
    return (
      <div className="player-wait">
        <p className="wordmark">Kartographer</p>
        <p>Waiting for the GM.</p>
      </div>
    )
  }
  const scene = state.scene
  return (
    <div className="player-root">
      <MapViewport
        role="player"
        sceneId={scene.id}
        imageUrl={scene.imageUrl}
        imageWidth={scene.width}
        imageHeight={scene.height}
        camera={scene.camera}
        grid={scene.grid}
        showGrid={scene.showGrid}
        fog={scene.fog}
        fogStyle={scene.fog.mode === 'none' ? 'none' : 'opaque'}
        tokens={state.tokens.map((token) => ({
          ...token,
          hiddenFromPlayers: false
        }))}
        selectedTokenId={null}
        pointer={state.pointer}
        tool="pan"
        calibrate="slide"
        onCamera={() => undefined}
        onPaint={() => undefined}
        onPointer={() => undefined}
        onPlaceToken={() => undefined}
        onMoveToken={() => undefined}
        onSelectToken={() => undefined}
        onGridOffset={() => undefined}
        onCellSize={() => undefined}
        onInteractionEnd={() => undefined}
      />
    </div>
  )
}
