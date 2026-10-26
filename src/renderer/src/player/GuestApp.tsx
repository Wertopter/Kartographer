import { useEffect, useRef, useState } from 'react'
import { PlayerStage } from '@renderer/player/PlayerApp'
import { GuestRoom, type GuestSnapshot } from '@renderer/remote/guestRoom'

type Props = {
  onLeave: () => void
  initialName?: string
  initialCode?: string
  autoStart?: boolean
}

export function GuestApp(props: Props): React.JSX.Element {
  const [name, setName] = useState(props.initialName ?? '')
  const [code, setCode] = useState(props.initialCode ?? '')
  const [error, setError] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<GuestSnapshot | null>(null)
  const [connecting, setConnecting] = useState(Boolean(props.autoStart))
  const roomRef = useRef<GuestRoom | null>(null)

  useEffect(() => {
    return () => roomRef.current?.stop()
  }, [])

  async function connect(nextCode: string, nextName: string): Promise<void> {
    setError(null)
    setConnecting(true)
    const room = new GuestRoom(setSnapshot)
    roomRef.current = room
    try {
      await room.start(nextCode, nextName)
    } catch (caught) {
      room.stop()
      roomRef.current = null
      setSnapshot(null)
      setError(caught instanceof Error ? caught.message : 'The share could not reach the connection service.')
    } finally {
      setConnecting(false)
    }
  }

  useEffect(() => {
    if (!props.autoStart) return
    void connect(props.initialCode ?? '', props.initialName ?? '')
    // Start once for the name and code chosen on the landing page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.autoStart, props.initialCode, props.initialName])

  function leave(): void {
    roomRef.current?.stop()
    roomRef.current = null
    props.onLeave()
  }

  if (!snapshot) {
    return (
      <div className="player-wait">
        <form
          className="join-card"
          onSubmit={(event) => {
            event.preventDefault()
            void connect(code, name)
          }}
        >
          <p className="wordmark">Kartographer</p>
          <p>{connecting ? 'Joining the campaign…' : 'Join a shared player view.'}</p>
          <label>
            Name
            <input value={name} maxLength={24} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            Join code
            <input
              value={code}
              autoCapitalize="none"
              spellCheck={false}
              placeholder="xxxx-xxxx-xxxx"
              onChange={(event) => setCode(event.target.value)}
            />
          </label>
          {error && <p className="hint">{error}</p>}
          <div className="tool-group">
            <button type="submit" className="primary" disabled={connecting || !name.trim() || !code.trim()}>
              Join
            </button>
            <button type="button" onClick={props.onLeave}>
              Back
            </button>
          </div>
        </form>
      </div>
    )
  }

  return (
    <PlayerStage
      projection={snapshot.projection}
      waiting={snapshot.status || 'Waiting for the GM.'}
      onLeave={leave}
      remote={{
        movableTokenIds: snapshot.controlledTokenIds,
        onPointer: (x, y) => roomRef.current?.send({ type: 'pointer', x, y }),
        onMoveToken: (tokenId, x, y) => roomRef.current?.send({ type: 'moveToken', tokenId, x, y })
      }}
    />
  )
}
