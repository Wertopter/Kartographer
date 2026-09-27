import { memo, useEffect, useState } from 'react'
import type { GmScene, SceneKind } from '@shared/types'

type Props = {
  scenes: GmScene[]
  activeSceneId: string | null
  onActivate: (sceneId: string) => void
  onRename: (sceneId: string, name: string) => void
  onDelete: (sceneId: string) => void
  onKind: (sceneId: string, kind: SceneKind) => void
}

export const SceneList = memo(function SceneList(props: Props): React.JSX.Element {
  return (
    <div className="scene-list">
      {props.scenes.map((scene) => (
        <SceneRow key={scene.id} scene={scene} active={scene.id === props.activeSceneId} {...props} />
      ))}
    </div>
  )
}, (prev, next) => {
  if (prev.activeSceneId !== next.activeSceneId || prev.scenes.length !== next.scenes.length) return false
  return prev.scenes.every((scene, index) => {
    const other = next.scenes[index]
    return (
      scene.id === other.id &&
      scene.name === other.name &&
      scene.kind === other.kind &&
      scene.imageUrl === other.imageUrl
    )
  })
})

function SceneRow(
  props: Props & { scene: GmScene; active: boolean }
): React.JSX.Element {
  const { scene } = props
  const [name, setName] = useState(scene.name)
  useEffect(() => setName(scene.name), [scene.name])

  return (
    <article className={props.active ? 'scene-card active' : 'scene-card'}>
      <button type="button" className="scene-open" onClick={() => props.onActivate(scene.id)}>
        <img src={scene.imageUrl} alt="" draggable={false} />
        <span className="scene-kind">{scene.kind === 'map' ? 'Map' : 'Handout'}</span>
      </button>
      <div className="scene-fields">
        <input
          aria-label={`Rename ${scene.name}`}
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => {
            if (name.trim() && name !== scene.name) props.onRename(scene.id, name)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
          }}
        />
        <div className="scene-actions">
          <select
            aria-label={`Scene type for ${scene.name}`}
            value={scene.kind}
            onChange={(event) => props.onKind(scene.id, event.target.value as SceneKind)}
          >
            <option value="map">Map</option>
            <option value="handout">Handout</option>
          </select>
          <button
            type="button"
            className="danger"
            onClick={() => {
              if (window.confirm(`Remove ${scene.name}?`)) props.onDelete(scene.id)
            }}
          >
            Remove
          </button>
        </div>
      </div>
    </article>
  )
}
