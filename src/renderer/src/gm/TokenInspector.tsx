import { useEffect, useState } from 'react'
import { TOKEN_COLORS, type GmToken } from '@shared/types'

type Props = {
  token: GmToken
  onChange: (token: GmToken) => void
  onDelete: (tokenId: string) => void
  onChooseImage: (tokenId: string) => void
  onClearImage: (tokenId: string) => void
}

export function TokenInspector(props: Props): React.JSX.Element {
  const { token } = props
  const [label, setLabel] = useState(token.label)
  useEffect(() => setLabel(token.label), [token.id, token.label])

  function commit(patch: Partial<GmToken>): void {
    props.onChange({ ...token, ...patch })
  }

  return (
    <form className="floating-panel inspector" onSubmit={(event) => event.preventDefault()}>
      <header>
        <h2>Token</h2>
        <p>{token.visibleToPlayers ? 'Players can see this token.' : 'Hidden from the player view.'}</p>
      </header>
      <label>
        Name
        <input
          value={label}
          maxLength={24}
          onChange={(event) => {
            setLabel(event.target.value)
            commit({ label: event.target.value })
          }}
        />
      </label>
      <label>
        Size
        <input
          type="range"
          min={16}
          max={320}
          value={Math.round(token.size)}
          onChange={(event) => commit({ size: Number(event.target.value) })}
        />
      </label>
      <div className="swatches" role="listbox" aria-label="Token color">
        {TOKEN_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            className={token.color === color ? 'swatch selected' : 'swatch'}
            style={{ background: color }}
            aria-label={color}
            onClick={() => commit({ color })}
          />
        ))}
        <input
          type="color"
          aria-label="Custom token color"
          value={token.color}
          onChange={(event) => commit({ color: event.target.value })}
        />
      </div>
      <label className="check">
        <input
          type="checkbox"
          checked={token.visibleToPlayers}
          onChange={(event) => commit({ visibleToPlayers: event.target.checked })}
        />
        Visible to players
      </label>
      <div className="tool-group">
        <button type="button" onClick={() => props.onChooseImage(token.id)}>
          Use image
        </button>
        <button type="button" disabled={!token.imageFile} onClick={() => props.onClearImage(token.id)}>
          Clear image
        </button>
      </div>
      <button type="button" className="danger" onClick={() => props.onDelete(token.id)}>
        Delete token
      </button>
    </form>
  )
}
