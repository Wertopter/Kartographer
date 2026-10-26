import { useEffect, useState } from 'react'
import type { PlayerProjection } from '@shared/types'
import { isTypingTarget, type RemoteTool } from '@renderer/tools'
import { MapViewport } from '@renderer/viewport/MapViewport'
import type { MapSketch } from '@renderer/viewport/draw'

const SKETCH_COLORS = ['#d4764e', '#3f8f6b', '#4f78a8', '#e0a45a', '#f2efe6'] as const

const remoteTools: Array<{ id: RemoteTool; label: string; keyLabel: string }> = [
  { id: 'pan', label: 'Pan', keyLabel: 'V' },
  { id: 'pointer', label: 'Pointer', keyLabel: 'P' },
  { id: 'stroke', label: 'Draw', keyLabel: 'D' },
  { id: 'circle', label: 'Circle', keyLabel: 'C' },
  { id: 'line', label: 'Line', keyLabel: 'L' },
  { id: 'ruler', label: 'Ruler', keyLabel: 'M' }
]

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
  const [tool, setTool] = useState<RemoteTool>('pan')
  const [sketchColor, setSketchColor] = useState<string>(SKETCH_COLORS[2])
  const [sketches, setSketches] = useState<MapSketch[]>([])
  const sceneId = props.projection?.scene?.id ?? null
  const remote = props.remote != null

  useEffect(() => {
    setSketches([])
    setTool('pan')
  }, [sceneId])

  useEffect(() => {
    if (!remote) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return
      const next: Partial<Record<string, RemoteTool>> = {
        v: 'pan',
        p: 'pointer',
        d: 'stroke',
        c: 'circle',
        l: 'line',
        m: 'ruler'
      }
      const picked = next[event.key.toLowerCase()]
      if (!picked) return
      event.preventDefault()
      setTool(picked)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [remote])

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
      {remote && (
        <div className="remote-tools" role="toolbar" aria-label="Player tools">
          {remoteTools.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={tool === item.id}
              onClick={() => setTool(item.id)}
            >
              {item.label}
              <kbd>{item.keyLabel}</kbd>
            </button>
          ))}
          {(tool === 'stroke' || tool === 'circle' || tool === 'line') &&
            SKETCH_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className={sketchColor === color ? 'swatch selected' : 'swatch'}
                style={{ background: color }}
                aria-label={color}
                aria-pressed={sketchColor === color}
                onClick={() => setSketchColor(color)}
              />
            ))}
          <button type="button" disabled={sketches.length === 0} onClick={() => setSketches([])}>
            Clear
          </button>
        </div>
      )}
      {props.onLeave && (
        <button type="button" className="remote-leave" onClick={props.onLeave}>
          Leave
        </button>
      )}
      <MapViewport
        role="player"
        remote={remote}
        movableTokenIds={props.remote?.movableTokenIds}
        sketches={remote ? sketches : undefined}
        sketchColor={sketchColor}
        onSketch={(sketch) => setSketches((current) => [...current.slice(-39), sketch])}
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
        tool={remote ? tool : 'pan'}
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
