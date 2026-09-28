export type YoutubePlayer = {
  playVideo: () => void
  pauseVideo: () => void
  stopVideo: () => void
  setVolume: (volume: number) => void
  getCurrentTime: () => number
  getDuration: () => number
  seekTo: (seconds: number, allowSeekAhead: boolean) => void
  getVideoData: () => { title?: string }
  destroy: () => void
}

type YoutubePlayerEvent = { target: YoutubePlayer; data: number }

type YoutubeNamespace = {
  Player: new (
    element: HTMLElement,
    options: {
      width?: number
      height?: number
      videoId?: string
      playerVars?: Record<string, string | number>
      events?: {
        onReady?: (event: YoutubePlayerEvent) => void
        onStateChange?: (event: YoutubePlayerEvent) => void
        onError?: (event: YoutubePlayerEvent) => void
      }
    }
  ) => YoutubePlayer
  PlayerState: { ENDED: number; PLAYING: number; PAUSED: number; CUED: number }
}

declare global {
  interface Window {
    YT?: YoutubeNamespace
    onYouTubeIframeAPIReady?: () => void
  }
}

let youtubeLoader: Promise<YoutubeNamespace> | null = null

export function loadYoutubeApi(): Promise<YoutubeNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (!youtubeLoader) {
    youtubeLoader = new Promise((resolve, reject) => {
      const previous = window.onYouTubeIframeAPIReady
      window.onYouTubeIframeAPIReady = () => {
        previous?.()
        if (window.YT?.Player) resolve(window.YT)
        else reject(new Error('YouTube player unavailable'))
      }
      const script = document.createElement('script')
      script.src = 'https://www.youtube.com/iframe_api'
      script.async = true
      script.onerror = () => {
        youtubeLoader = null
        script.remove()
        reject(new Error('YouTube player unavailable'))
      }
      document.head.appendChild(script)
    })
  }
  return youtubeLoader
}

export function destroyEmbed(embed: { destroy: () => void } | null): void {
  if (!embed) return
  try {
    embed.destroy()
  } catch {
    // The frame may already be gone.
  }
}
