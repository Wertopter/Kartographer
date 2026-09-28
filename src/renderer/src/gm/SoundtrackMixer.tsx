import { useEffect, useRef, useState } from 'react'
import type { SoundtrackChannel } from '@shared/types'
import { parseSoundtrackUrl, type SoundtrackSource } from '@shared/soundtrack'
import { destroyEmbed, loadYoutubeApi, type YoutubePlayer } from '@renderer/gm/soundtrackApi'

type Phase = 'idle' | 'loading' | 'paused' | 'playing'

type Props = {
  channels: SoundtrackChannel[]
  disabled: boolean
  parked: boolean
  onChange: (channels: SoundtrackChannel[]) => void
}

export function SoundtrackMixer(props: Props): React.JSX.Element {
  const channelsRef = useRef(props.channels)
  const stamp = channelStamp(props.channels)
  const stampRef = useRef(stamp)
  if (stampRef.current !== stamp) {
    stampRef.current = stamp
    channelsRef.current = props.channels
  }

  function patch(id: string, partial: Partial<Pick<SoundtrackChannel, 'title' | 'url' | 'volume'>>): void {
    if (props.disabled) return
    const next = channelsRef.current.map((channel) => (channel.id === id ? { ...channel, ...partial } : channel))
    channelsRef.current = next
    stampRef.current = channelStamp(next)
    props.onChange(next)
  }

  return (
    <section
      className={props.parked ? 'soundtrack-panel stage-pane parked' : 'soundtrack-panel stage-pane'}
      aria-hidden={props.parked}
      inert={props.parked}
      aria-label="Soundtrack"
    >
      <p className="soundtrack-intro">
        Paste a YouTube video or playlist link on each channel. A video repeats when it ends. A playlist plays through. All eight play together, each with its own volume. Name a channel so you remember what it is for.
      </p>
      {props.disabled ? <p className="empty-copy">Open a campaign folder to keep a soundtrack with the campaign.</p> : null}
      <div className="channel-list">
        {props.channels.map((channel, index) => (
          <ChannelRow
            key={channel.id}
            channel={channel}
            index={index + 1}
            disabled={props.disabled}
            onTitle={(title) => patch(channel.id, { title })}
            onUrl={(url) => patch(channel.id, { url })}
            onVolume={(volume) => patch(channel.id, { volume })}
          />
        ))}
      </div>
    </section>
  )
}

type RowProps = {
  channel: SoundtrackChannel
  index: number
  disabled: boolean
  onTitle: (title: string) => void
  onUrl: (url: string) => void
  onVolume: (volume: number) => void
}

function ChannelRow(props: RowProps): React.JSX.Element {
  const source = parseSoundtrackUrl(props.channel.url)
  const sourceKey = sourceKeyOf(source)
  const [draft, setDraft] = useState(props.channel.url)
  const [titleDraft, setTitleDraft] = useState(props.channel.title)
  const [phase, setPhase] = useState<Phase>('idle')
  const [title, setTitle] = useState('')
  const [playerError, setPlayerError] = useState('')
  const [progress, setProgress] = useState({ position: 0, duration: 0 })
  const scrubbing = useRef(false)
  const hostRef = useRef<HTMLDivElement>(null)
  const sourceRef = useRef(source)
  const ytRef = useRef<YoutubePlayer | null>(null)
  sourceRef.current = source
  const volumeRef = useRef(props.channel.volume)
  const stopRequested = useRef(false)
  const [playlistShuffle, setPlaylistShuffle] = useState(false)
  const [playlistLoop, setPlaylistLoop] = useState(false)
  const shuffleRef = useRef(false)
  const loopPlaylistRef = useRef(false)
  volumeRef.current = props.channel.volume

  useEffect(() => setDraft(props.channel.url), [props.channel.url])
  useEffect(() => setTitleDraft(props.channel.title), [props.channel.title])

  useEffect(() => {
    const host = hostRef.current
    const source = sourceRef.current
    if (!host) return
    host.replaceChildren()
    ytRef.current = null
    if (!source) {
      setPhase('idle')
      setTitle('')
      setPlayerError('')
      setProgress({ position: 0, duration: 0 })
      return
    }

    let cancelled = false
    const videoId = source.videoId
    const playlistId = source.playlistId
    const loopVideo = Boolean(videoId) && !playlistId
    stopRequested.current = false
    shuffleRef.current = false
    loopPlaylistRef.current = false
    setPlaylistShuffle(false)
    setPlaylistLoop(false)
    setPhase('loading')
    setPlayerError('')
    setProgress({ position: 0, duration: 0 })
    setTitle('YouTube')

    void loadYoutubeApi()
      .then((YT) => {
        if (cancelled) return
        const mount = document.createElement('div')
        host.appendChild(mount)
        const origin =
          window.location.protocol === 'http:' || window.location.protocol === 'https:'
            ? window.location.origin
            : ''
        const player = new YT.Player(mount, {
          width: 128,
          height: 72,
          ...(videoId ? { videoId } : {}),
          playerVars: {
            playsinline: 1,
            rel: 0,
            ...(playlistId ? { list: playlistId, listType: 'playlist' } : {}),
            ...(loopVideo && videoId ? { loop: 1, playlist: videoId } : {}),
            ...(origin ? { origin } : {})
          },
          events: {
            onReady: (event) => {
              if (cancelled) return
              ytRef.current = event.target
              event.target.setVolume(volumeRef.current)
              if (playlistId && !videoId) {
                try {
                  event.target.cuePlaylist({ listType: 'playlist', list: playlistId, index: 0 })
                } catch {
                  // The playlist parameters already cue the first video.
                }
              }
              if (playlistId) {
                try {
                  event.target.setShuffle(shuffleRef.current)
                  event.target.setLoop(loopPlaylistRef.current)
                } catch {
                  // Shuffle and loop apply once the playlist is ready.
                }
              }
              const nextTitle = event.target.getVideoData()?.title
              if (nextTitle) setTitle(nextTitle)
              setPhase('paused')
            },
            onStateChange: (event) => {
              if (cancelled) return
              const nextTitle = event.target.getVideoData()?.title
              if (nextTitle) setTitle(nextTitle)
              if (event.data === YT.PlayerState.ENDED && loopVideo && !stopRequested.current) {
                event.target.seekTo(0, true)
                event.target.playVideo()
                setPhase('playing')
                return
              }
              if (event.data === YT.PlayerState.PLAYING) setPhase('playing')
              else if (
                event.data === YT.PlayerState.PAUSED ||
                event.data === YT.PlayerState.CUED ||
                event.data === YT.PlayerState.ENDED
              ) {
                setPhase('paused')
              }
            },
            onError: () => {
              if (!cancelled) setPlayerError('YouTube could not play this video.')
            }
          }
        })
        ytRef.current = player
      })
      .catch(() => {
        if (!cancelled) {
          setPhase('idle')
          setPlayerError('The YouTube player could not be loaded.')
        }
      })

    return () => {
      cancelled = true
      destroyEmbed(ytRef.current)
      ytRef.current = null
      host.replaceChildren()
    }
  }, [sourceKey])

  useEffect(() => {
    try {
      ytRef.current?.setVolume(props.channel.volume)
    } catch {
      // Volume applies once the player is ready.
    }
  }, [props.channel.volume])

  useEffect(() => {
    if (!sourceKey) return
    const timer = window.setInterval(() => {
      const player = ytRef.current
      if (!player || scrubbing.current) return
      try {
        const duration = player.getDuration()
        const position = player.getCurrentTime()
        if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(position)) return
        setProgress({ position, duration })
      } catch {
        // Metadata arrives after the player is ready.
      }
    }, 250)
    return () => window.clearInterval(timer)
  }, [sourceKey])

  function commit(): void {
    const next = draft.trim()
    if (next !== props.channel.url) props.onUrl(next)
  }

  function commitTitle(): void {
    const next = titleDraft.trim()
    if (next !== props.channel.title) props.onTitle(next)
  }

  function togglePlay(): void {
    const player = ytRef.current
    if (!player) return
    stopRequested.current = false
    if (phase === 'playing') player.pauseVideo()
    else player.playVideo()
  }

  function seek(seconds: number): void {
    setProgress((current) => ({ ...current, position: seconds }))
    try {
      ytRef.current?.seekTo(seconds, true)
    } catch {
      // The player accepts a seek once it has a duration.
    }
  }

  function controlPlaylist(action: (player: YoutubePlayer) => void): void {
    const player = ytRef.current
    if (!player) return
    stopRequested.current = false
    try {
      action(player)
    } catch {
      // Playlist controls apply once the list is ready.
    }
  }

  function toggleShuffle(): void {
    const next = !shuffleRef.current
    shuffleRef.current = next
    setPlaylistShuffle(next)
    controlPlaylist((player) => player.setShuffle(next))
  }

  function togglePlaylistLoop(): void {
    const next = !loopPlaylistRef.current
    loopPlaylistRef.current = next
    setPlaylistLoop(next)
    controlPlaylist((player) => player.setLoop(next))
  }

  function stop(): void {
    stopRequested.current = true
    ytRef.current?.stopVideo()
    setProgress((current) => ({ ...current, position: 0 }))
    if (phase === 'playing') setPhase('paused')
  }

  const unrecognized = props.channel.url.trim() !== '' && !source
  const status = playerError || (unrecognized ? 'Paste a YouTube video or playlist link.' : title)
  const transportLocked = props.disabled || !source || phase === 'idle' || phase === 'loading' || playerError !== ''

  return (
    <article className="channel-row">
      <div className="channel-head">
        <p className="channel-index">{props.index}</p>
        <label className="channel-title-label">
          Title
          <input
            className="channel-title"
            type="text"
            aria-label={`Channel ${props.index} title`}
            placeholder="What this track is for"
            maxLength={60}
            disabled={props.disabled}
            value={titleDraft}
            onChange={(event) => setTitleDraft(event.target.value)}
            onBlur={commitTitle}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return
              event.preventDefault()
              commitTitle()
            }}
          />
        </label>
      </div>
      <div className="channel-main">
        <div className="channel-controls">
          <input
            type="text"
            aria-label={`Channel ${props.index} link`}
            placeholder="YouTube video or playlist link"
            spellCheck={false}
            disabled={props.disabled}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onPaste={(event) => {
              const trimmed = event.clipboardData.getData('text').trim()
              if (!parseSoundtrackUrl(trimmed) || trimmed === props.channel.url) return
              event.preventDefault()
              setDraft(trimmed)
              props.onUrl(trimmed)
            }}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return
              event.preventDefault()
              commit()
            }}
          />
          <button type="button" disabled={transportLocked} aria-pressed={phase === 'playing'} onClick={togglePlay}>
            {phase === 'playing' ? 'Pause' : 'Play'}
          </button>
          <button type="button" disabled={transportLocked} onClick={stop}>
            Stop
          </button>
          {source?.playlistId ? (
            <>
              <button type="button" disabled={transportLocked} onClick={() => controlPlaylist((player) => player.previousVideo())}>
                Back
              </button>
              <button type="button" disabled={transportLocked} onClick={() => controlPlaylist((player) => player.nextVideo())}>
                Skip
              </button>
              <button type="button" disabled={transportLocked} aria-pressed={playlistShuffle} onClick={toggleShuffle}>
                Shuffle
              </button>
              <button type="button" disabled={transportLocked} aria-pressed={playlistLoop} onClick={togglePlaylistLoop}>
                Loop
              </button>
            </>
          ) : null}
          <label className="channel-volume-label">
            Volume
            <input
              className="channel-volume"
              type="range"
              min={0}
              max={100}
              aria-label={`Channel ${props.index} volume`}
              disabled={props.disabled}
              value={props.channel.volume}
              onChange={(event) => props.onVolume(Number(event.target.value))}
            />
          </label>
          <button
            type="button"
            className="danger"
            disabled={props.disabled || (props.channel.url === '' && draft === '')}
            onClick={() => {
              setDraft('')
              props.onUrl('')
            }}
          >
            Clear
          </button>
        </div>
        <p className={playerError || unrecognized ? 'channel-meta error' : 'channel-meta'}>{status}</p>
        <label className="channel-playback">
          <span>{formatTime(progress.position)}</span>
          <input
            className="channel-playback-bar"
            type="range"
            min={0}
            max={progress.duration > 0 ? progress.duration : 1}
            step={0.25}
            aria-label={`Channel ${props.index} playback`}
            disabled={transportLocked || progress.duration <= 0}
            value={progress.duration > 0 ? Math.min(progress.position, progress.duration) : 0}
            onPointerDown={() => {
              scrubbing.current = true
            }}
            onPointerUp={() => {
              scrubbing.current = false
            }}
            onPointerCancel={() => {
              scrubbing.current = false
            }}
            onKeyDown={() => {
              scrubbing.current = true
            }}
            onKeyUp={() => {
              scrubbing.current = false
            }}
            onBlur={() => {
              scrubbing.current = false
            }}
            onChange={(event) => seek(Number(event.target.value))}
          />
          <span>{formatTime(progress.duration)}</span>
        </label>
        <div ref={hostRef} className="channel-player" hidden={!source} aria-hidden="true" />
      </div>
    </article>
  )
}

function channelStamp(channels: SoundtrackChannel[]): string {
  return channels.map((channel) => `${channel.id}\0${channel.title}\0${channel.url}\0${channel.volume}`).join('\n')
}

function sourceKeyOf(source: SoundtrackSource | null): string {
  if (!source) return ''
  return `${source.videoId ?? ''}|${source.playlistId ?? ''}`
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.floor(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const remain = String(total % 60).padStart(2, '0')
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${remain}`
  return `${minutes}:${remain}`
}
