import { assetUrl } from '@shared/projection'
import { TOKEN_COLORS, type GmLibraryToken } from '@shared/types'

export type TokenPlaceMode = 'new' | 'existing' | 'temporary'

type Props = {
  mode: TokenPlaceMode
  onMode: (mode: TokenPlaceMode) => void
  label: string
  onLabel: (value: string) => void
  color: string
  onColor: (value: string) => void
  visible: boolean
  onVisible: (value: boolean) => void
  imageFile: string | null
  onChooseImage: () => void
  onClearImage: () => void
  library: GmLibraryToken[]
  selectedLibraryId: string | null
  onSelectLibrary: (id: string) => void
  onDeleteLibrary: (id: string) => void
}

const modes: Array<{ id: TokenPlaceMode; label: string; hint: string }> = [
  { id: 'new', label: 'Create a new token', hint: 'Click the map to place it. It is saved in the token library.' },
  { id: 'existing', label: 'Select from existing tokens', hint: 'Pick a saved token, then click the map to place a copy.' },
  { id: 'temporary', label: 'Temporary token', hint: 'Click the map to place it. It is not saved in the library.' }
]

export function TokenPlacePanel(props: Props): React.JSX.Element {
  const hint = modes.find((mode) => mode.id === props.mode)?.hint
  return (
    <form className="floating-panel token-panel" onSubmit={(event) => event.preventDefault()}>
      <header>
        <h2>Token library</h2>
        <p>{hint}</p>
      </header>
      <div className="token-modes">
        {modes.map((mode) => (
          <button
            key={mode.id}
            type="button"
            aria-pressed={props.mode === mode.id}
            onClick={() => props.onMode(mode.id)}
          >
            {mode.label}
          </button>
        ))}
      </div>
      {props.mode === 'existing' ? (
        props.library.length === 0 ? (
          <p className="hint">No saved tokens yet. Create one to add it here.</p>
        ) : (
          <div className="library-list">
            {props.library.map((token) => (
              <div key={token.id} className="library-row">
                <button
                  type="button"
                  className="library-card"
                  aria-pressed={token.id === props.selectedLibraryId}
                  onClick={() => props.onSelectLibrary(token.id)}
                >
                  {token.imageUrl ? (
                    <img src={token.imageUrl} alt="" />
                  ) : (
                    <span className="library-swatch" style={{ background: token.color }} />
                  )}
                  <span>
                    <span className="campaign-name">{token.label}</span>
                    <span className="campaign-path">{token.visibleToPlayers ? 'Visible' : 'Hidden from players'}</span>
                  </span>
                </button>
                <button
                  type="button"
                  className="danger campaign-forget"
                  title="Remove this token from the library. Tokens already on the map stay there."
                  onClick={() => props.onDeleteLibrary(token.id)}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )
      ) : (
        <>
          <label>
            Name
            <input
              value={props.label}
              maxLength={24}
              placeholder="Token"
              onChange={(event) => props.onLabel(event.target.value)}
            />
          </label>
          <div className="swatches" role="listbox" aria-label="Token color">
            {TOKEN_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className={props.color === color ? 'swatch selected' : 'swatch'}
                style={{ background: color }}
                aria-label={color}
                onClick={() => props.onColor(color)}
              />
            ))}
            <input
              type="color"
              aria-label="Custom token color"
              value={props.color}
              onChange={(event) => props.onColor(event.target.value)}
            />
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={props.visible}
              onChange={(event) => props.onVisible(event.target.checked)}
            />
            Visible to players
          </label>
          <div className="staged-image">
            {props.imageFile ? <img src={assetUrl(props.imageFile)} alt="" /> : <span className="library-swatch" style={{ background: props.color }} />}
            <button type="button" onClick={props.onChooseImage}>
              Use image
            </button>
            <button type="button" disabled={!props.imageFile} onClick={props.onClearImage}>
              Clear image
            </button>
          </div>
        </>
      )}
    </form>
  )
}
