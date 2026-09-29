import type { Tool } from '@renderer/tools'

const tools: Array<{ id: Tool; label: string; keyLabel: string; hint: string }> = [
  { id: 'pan', label: 'Pan', keyLabel: 'V', hint: 'Drag to move the map. Space also pans.' },
  { id: 'pointer', label: 'Pointer', keyLabel: 'P', hint: 'Click to ping a spot players can see.' },
  { id: 'reveal', label: 'Reveal', keyLabel: 'R', hint: 'Paint grid cells the players can see.' },
  { id: 'hide', label: 'Hide', keyLabel: 'H', hint: 'Paint grid cells shut again.' },
  { id: 'token', label: 'Token', keyLabel: 'T', hint: 'Create a library token, place an existing one, or drop a temporary token.' },
  { id: 'grid', label: 'Grid', keyLabel: 'G', hint: 'Align the grid to the map.' },
  { id: 'ruler', label: 'Ruler', keyLabel: 'M', hint: 'Drag from a cell to measure the distance in whole cells.' }
]

type Props = {
  tool: Tool
  mapTools: boolean
  onTool: (tool: Tool) => void
  onRevealAll: () => void
  onCoverAll: () => void
}

export function Toolbar(props: Props): React.JSX.Element {
  return (
    <div className="toolbar">
      <div className="tool-group" role="toolbar" aria-label="Map tools">
        {tools.map((tool) => {
          const disabled = tool.id !== 'pan' && tool.id !== 'pointer' && !props.mapTools
          return (
            <button
              key={tool.id}
              type="button"
              title={`${tool.hint} (${tool.keyLabel})`}
              aria-pressed={props.tool === tool.id}
              disabled={disabled}
              onClick={() => props.onTool(tool.id)}
            >
              {tool.label}
              <kbd>{tool.keyLabel}</kbd>
            </button>
          )
        })}
      </div>
      <div className="tool-group">
        <button type="button" disabled={!props.mapTools} onClick={props.onRevealAll}>
          Show map
        </button>
        <button type="button" disabled={!props.mapTools} onClick={props.onCoverAll}>
          Cover map
        </button>
      </div>
    </div>
  )
}
