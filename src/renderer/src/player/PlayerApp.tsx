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
  return <PlayerStage projection={state} />
}

export function PlayerStage(props: {
  projection: PlayerProjection | null
  waiting?: string
  remote?: {
    movableTokenIds: string[]
    onPointer: (x: number, y: number) => void
    onMoveToken: (id: string, x: number, y: number) => void
  }
  onLeave?: () => void
}): React.JSX.Element {
  const state = props.projection
  if (!state?.scene) {
    return (
      <div className="player-wait">
        <p className="wordmark">Kartographer</p>
        <p>{props.waiting || 'Waiting for the GM.'}</p>
        {props.onLeave && (
          <button type="button" onClick={props.onLeave}>
            Back
          </button>
        )}
      </div>
    )
  }
  const scene = state.scene
  return (
    <div className="player-root">
      {props.onLeave && (
        <button type="button" className="remote-leave" onClick={props.onLeave}>
          Leave
        </button>
      )}
      <MapViewport
        role="player"
        remote={props.remote != null}
        movableTokenIds={props.remote?.movableTokenIds}
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
        onPointer={(x, y) => props.remote?.onPointer(x, y)}
        onPlaceToken={() => undefined}
        onMoveToken={(id, x, y) => props.remote?.onMoveToken(id, x, y)}
        onSelectToken={() => undefined}
        onGridOffset={() => undefined}
        onCellSize={() => undefined}
        onInteractionEnd={() => undefined}
      />
    </div>
  )
}
