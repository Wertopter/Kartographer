import { useEffect, useState } from 'react'
import { gridMetrics, minimumCellSize } from '@shared/geometry'
import type { GridSettings } from '@shared/types'

type Props = {
  grid: GridSettings
  imageWidth: number
  imageHeight: number
  calibrate: 'slide' | 'cell'
  onCalibrate: (mode: 'slide' | 'cell') => void
  onChange: (grid: GridSettings) => void
}

export function GridPanel(props: Props): React.JSX.Element {
  const minCell = minimumCellSize(props.imageWidth, props.imageHeight)
  const metrics = gridMetrics(props.imageWidth, props.imageHeight, props.grid)
  return (
    <form className="floating-panel grid-panel" onSubmit={(event) => event.preventDefault()}>
      <header>
        <h2>Grid</h2>
        <p>Drag the map to slide the grid. Changing the offset or shape keeps the map visible. Changing the cell size clears revealed fog.</p>
      </header>
      <div className="token-modes">
        <button
          type="button"
          aria-pressed={props.grid.shape === 'square'}
          onClick={() => props.onChange({ ...props.grid, shape: 'square' })}
        >
          Square
        </button>
        <button
          type="button"
          aria-pressed={props.grid.shape === 'flat'}
          onClick={() => props.onChange({ ...props.grid, shape: 'flat' })}
        >
          Vertical hex, flat top
        </button>
        <button
          type="button"
          aria-pressed={props.grid.shape === 'pointy'}
          onClick={() => props.onChange({ ...props.grid, shape: 'pointy' })}
        >
          Horizontal hex, pointed top
        </button>
      </div>
      <label className="check">
        <input
          type="checkbox"
          checked={props.grid.enabled}
          onChange={(event) => props.onChange({ ...props.grid, enabled: event.target.checked })}
        />
        Show grid to everyone
      </label>
      <NumberField
        label={props.grid.shape === 'square' ? 'Cell size' : 'Hex width'}
        value={props.grid.cellSize}
        min={minCell}
        max={Math.max(minCell, props.imageWidth)}
        onCommit={(cellSize) => props.onChange({ ...props.grid, cellSize })}
      />
      <div className="pair">
        <NumberField
          label="Offset X"
          value={props.grid.offsetX}
          onCommit={(offsetX) => props.onChange({ ...props.grid, offsetX })}
        />
        <NumberField
          label="Offset Y"
          value={props.grid.offsetY}
          onCommit={(offsetY) => props.onChange({ ...props.grid, offsetY })}
        />
      </div>
      <label>
        Line color
        <input
          type="color"
          value={props.grid.color}
          onChange={(event) => props.onChange({ ...props.grid, color: event.target.value })}
        />
      </label>
      <label>
        Alpha (A)
        <span className="alpha-row">
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={props.grid.alpha}
            aria-valuetext={`${Math.round(props.grid.alpha * 100)} percent`}
            onChange={(event) => props.onChange({ ...props.grid, alpha: Number(event.target.value) })}
          />
          <span>{Math.round(props.grid.alpha * 100)}%</span>
        </span>
      </label>
      <div className="tool-group">
        <button type="button" aria-pressed={props.calibrate === 'slide'} onClick={() => props.onCalibrate('slide')}>
          Slide grid
        </button>
        <button type="button" aria-pressed={props.calibrate === 'cell'} onClick={() => props.onCalibrate('cell')}>
          {props.grid.shape === 'square' ? 'Drag one cell' : 'Drag one hex width'}
        </button>
      </div>
      <p className="hint">
        {metrics ? `${metrics.columns} × ${metrics.rows} cells` : 'Grid is not ready.'} Minimum cell {minCell}px.
      </p>
    </form>
  )
}

function NumberField(props: {
  label: string
  value: number
  min?: number
  max?: number
  onCommit: (value: number) => void
}): React.JSX.Element {
  const [draft, setDraft] = useState(String(props.value))
  useEffect(() => setDraft(String(props.value)), [props.value])
  return (
    <label>
      {props.label}
      <input
        type="number"
        min={props.min}
        max={props.max}
        step={1}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          const next = Number(draft)
          if (Number.isFinite(next)) props.onCommit(next)
          else setDraft(String(props.value))
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
        }}
      />
    </label>
  )
}
