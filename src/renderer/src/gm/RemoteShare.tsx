import { useEffect, useRef, useState } from 'react'
import type { RemotePeer } from '@shared/types'
import { HostRoom } from '@renderer/remote/hostRoom'

type Phase = 'idle' | 'live' | 'error'

export function RemoteShare(props: { campaignOpen: boolean }): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>('idle')
  const [code, setCode] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [peers, setPeers] = useState<RemotePeer[]>([])
  const roomRef = useRef<HostRoom | null>(null)

  useEffect(() => {
    return () => roomRef.current?.stop()
  }, [])

  useEffect(() => {
    if (phase !== 'live') return
    const push = (): void => roomRef.current?.schedulePush()
    const unsubscribe = window.kartographer.onState(() => push())
    push()
    return unsubscribe
  }, [phase])

  function stop(): void {
    roomRef.current?.stop()
    roomRef.current = null
    setPhase('idle')
    setCode(null)
    setPeers([])
    setMessage(null)
  }

  async function start(): Promise<void> {
    stop()
    const room = new HostRoom({
      onCode: (next) => {
        setCode(next)
        setPhase('live')
      },
      onPeers: setPeers,
      onStatus: setMessage,
      onFailed: (next) => {
        room.stop()
        if (roomRef.current === room) roomRef.current = null
        setPhase('error')
        setMessage(next)
        setCode(null)
        setPeers([])
      }
    })
    roomRef.current = room
    setMessage('Opening a share…')
    try {
      await room.start()
    } catch (caught) {
      if (roomRef.current !== room) return
      room.stop()
      roomRef.current = null
      setPhase('error')
      setCode(null)
      setMessage(caught instanceof Error ? caught.message : 'The share could not reach the connection service.')
    }
  }

  const names = peers.map((peer) => peer.name).join(', ')

  return (
    <div className="status-group">
      {phase === 'live' && code ? (
        <>
          <p className="share-code">{code}</p>
          <button type="button" onClick={stop}>
            Stop sharing
          </button>
        </>
      ) : (
        <button type="button" className="primary" disabled={!props.campaignOpen} onClick={() => void start()}>
          Share player view
        </button>
      )}
      {(names || message) && <span className="hint">{names ? `Joined: ${names}. ` : ''}{message ?? ''}</span>}
    </div>
  )
}
