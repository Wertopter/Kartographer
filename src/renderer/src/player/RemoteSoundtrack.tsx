import { useEffect, useRef, useState } from 'react'
import type { RemoteSoundtrack, RemoteSoundtrackChannel } from '@shared/remote'
import { parseSoundtrackUrl } from '@shared/soundtrack'
import { destroyEmbed, loadYoutubeApi, type YoutubePlayer } from '@renderer/gm/soundtrackApi'

type Props = {
  soundtrack: RemoteSoundtrack | null
}

export function RemoteSoundtrackPlayer(props: Props): React.JSX.Element | null {
  const [heard, setHeard] = useState(false)
  const [listenerVolume, setListenerVolume] = useState(100)
  const channels = props.soundtrack?.channels.filter((channel) => parseSoundtrackUrl(channel.url)) ?? []
  const shouldPlay = channels.some((channel) => channel.playing)

  useEffect(() => {
    if (!shouldPlay) setHeard(false)
  }, [shouldPlay])

  if (!props.soundtrack || channels.length === 0) return null
  return (
    <>
      <label className="remote-volume">
        Music
        <input
          type="range"
          min={0}
          max={100}
          aria-label="Your music volume"
          value={listenerVolume}
          onChange={(event) => setListenerVolume(Number(event.target.value))}
        />
      </label>
      {shouldPlay && !heard && (
        <button type="button" className="remote-hear" onClick={() => setHeard(true)}>
          Hear the soundtrack
        </button>
      )}
      <div className="remote-soundtrack" aria-hidden="true">
        {channels.map((channel) => (
          <Listener
            key={`${channel.id}:${sourceKey(channel.url)}`}
            channel={channel}
            listenerVolume={listenerVolume}
            unlock={heard}
            onPlaying={() => setHeard(true)}
          />
        ))}
      </div>
    </>
  )
}

function heardVolume(hostVolume: number, listenerVolume: number): number {
  return Math.round((hostVolume * listenerVolume) / 100)
}

function sourceKey(url: string): string {
  const source = parseSoundtrackUrl(url)
  if (!source) return ''
  return `${source.videoId ?? ''}|${source.playlistId ?? ''}`
}

function Listener(props: {
  channel: RemoteSoundtrackChannel
  listenerVolume: number
  unlock: boolean
  onPlaying: () => void
}): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<YoutubePlayer | null>(null)
  const [ready, setReady] = useState(false)
  const playingRef = useRef(props.channel.playing)
  const onPlayingRef = useRef(props.onPlaying)
  playingRef.current = props.channel.playing
  onPlayingRef.current = props.onPlaying
  const source = parseSoundtrackUrl(props.channel.url)
  const sourceKey = source ? `${source.videoId ?? ''}|${source.playlistId ?? ''}` : ''

  useEffect(() => {
    const host = hostRef.current
    if (!host || !source) return
    host.replaceChildren()
    playerRef.current = null
    setReady(false)
    let cancelled = false
    const playlistId = source.playlistId
    const videoId = source.videoId
    void loadYoutubeApi()
      .then((YT) => {
        if (cancelled) return
        const mount = document.createElement('div')
        host.appendChild(mount)
        const origin =
          window.location.protocol === 'http:' || window.location.protocol === 'https:' ? window.location.origin : ''
        const player = new YT.Player(mount, {
          width: 128,
          height: 72,
          ...(videoId ? { videoId } : {}),
          playerVars: {
            playsinline: 1,
            rel: 0,
            ...(playlistId ? { list: playlistId, listType: 'playlist' } : {}),
            ...(origin ? { origin } : {})
          },
          events: {
            onReady: (event) => {
              if (cancelled) return
              playerRef.current = event.target
              setReady(true)
            },
            onStateChange: (event) => {
              if (cancelled) return
              if (event.data === YT.PlayerState.PLAYING) onPlayingRef.current()
              if (event.data === YT.PlayerState.ENDED && videoId && !playlistId && playingRef.current) {
                event.target.seekTo(0, true)
                event.target.playVideo()
              }
            }
          }
        })
        playerRef.current = player
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
      destroyEmbed(playerRef.current)
      playerRef.current = null
      host.replaceChildren()
    }
  }, [sourceKey])

  useEffect(() => {
    const player = playerRef.current
    const currentSource = parseSoundtrackUrl(props.channel.url)
    if (!ready || !player || !currentSource) return
    try {
      player.setVolume(heardVolume(props.channel.volume, props.listenerVolume))
    } catch {
      // Volume applies once the player can accept it.
    }
    if (currentSource.playlistId) {
      try {
        player.setShuffle(props.channel.shuffle)
        player.setLoop(props.channel.loop)
      } catch {
        // Playlist options apply once the list is ready.
      }
      const index = player.getPlaylistIndex?.()
      if (props.channel.playlistIndex != null && index !== props.channel.playlistIndex) {
        try {
          player.playVideoAt?.(props.channel.playlistIndex)
        } catch {
          // The playlist index applies once the list has loaded.
        }
      }
    }
    const expected = props.channel.playing
      ? props.channel.position + Math.max(0, Date.now() - props.channel.at) / 1000
      : props.channel.position
    let current = Number.NaN
    try {
      current = player.getCurrentTime()
    } catch {
      current = Number.NaN
    }
    if (Number.isFinite(current) && Math.abs(current - expected) > 2.5) {
      try {
        player.seekTo(Math.max(0, expected), true)
      } catch {
        // A seek waits until the video has a duration.
      }
    }
    try {
      if (props.channel.playing) player.playVideo()
      else player.pauseVideo()
    } catch {
      // Play and pause apply once the player is ready.
    }
  }, [
    ready,
    sourceKey,
    props.unlock,
    props.listenerVolume,
    props.channel.url,
    props.channel.volume,
    props.channel.playing,
    props.channel.position,
    props.channel.at,
    props.channel.shuffle,
    props.channel.loop,
    props.channel.playlistIndex
  ])

  return <div ref={hostRef} className="channel-player" />
}
