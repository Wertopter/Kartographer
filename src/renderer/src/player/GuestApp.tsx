import { useEffect, useRef, useState } from 'react'
import { PlayerStage } from '@renderer/player/PlayerApp'
import { GuestRoom, type GuestSnapshot } from '@renderer/remote/guestRoom'

type Props = {
  onLeave: () => void
}

export function GuestApp(props: Props): React.JSX.Element {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<GuestSnapshot | null>(null)
  const roomRef = useRef<GuestRoom | null>(null)

  useEffect(() => {
    return () => roomRef.current?.stop()
  }, [])

  async function join(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    setError(null)
    const room = new GuestRoom(setSnapshot)
    roomRef.current = room
    try {
      await room.start(code, name)
    } catch (caught) {
      room.stop()
      roomRef.current = null
      setSnapshot(null)
      setError(caught instanceof Error ? caught.message : 'The share could not reach the connection service.')
    }
  }

  function leave(): void {
    roomRef.current?.stop()
    roomRef.current = null
    props.onLeave()
  }

  if (!snapshot) {
    return (
      <div className="player-wait">
        <form className="join-card" onSubmit={(event) => void join(event)}>
          <p className="wordmark">Kartographer</p>
          <p>Join a shared player view.</p>
          <label>
            Your name
            <input value={name} maxLength={24} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            Invite code
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
            <button type="submit" className="primary">
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
