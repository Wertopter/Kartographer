export type SceneBitmap = {
  bitmap: CanvasImageSource
  width: number
  height: number
  /** False while the sharp copy is still decoding and `bitmap` is the preview. */
  full: boolean
}

type Listener = (image: SceneBitmap) => void

type Entry = {
  preview: ImageBitmap | null
  full: CanvasImageSource | null
  loading: Promise<void> | null
  listeners: Set<Listener>
}

const PREVIEW_LONG_EDGE = 1280
const FULL_LONG_EDGE = 8192
const MAX_PREVIEWS = 8
const MAX_FULL = 2

const entries = new Map<string, Entry>()
const previewOrder: string[] = []
const fullOrder: string[] = []

function scaledSize(
  width: number,
  height: number,
  longEdge: number
): { width: number; height: number } | null {
  const long = Math.max(width, height)
  if (width <= 0 || height <= 0 || long <= longEdge) return null
  const scale = longEdge / long
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  }
}

function sourcePixels(source: CanvasImageSource): { width: number; height: number } {
  if (source instanceof HTMLImageElement) return { width: source.naturalWidth, height: source.naturalHeight }
  if (source instanceof ImageBitmap || source instanceof HTMLCanvasElement) {
    return { width: source.width, height: source.height }
  }
  return { width: 0, height: 0 }
}

function closeSource(source: CanvasImageSource | null): void {
  if (source instanceof ImageBitmap) source.close()
}

function publish(entry: Entry, source: CanvasImageSource, full: boolean): void {
  const size = sourcePixels(source)
  const image: SceneBitmap = { bitmap: source, width: size.width, height: size.height, full }
  for (const listener of entry.listeners) listener(image)
}

function loadElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      if (image.naturalWidth > 0 && image.naturalHeight > 0) resolve(image)
      else reject(new Error('Map image has no pixels'))
    }
    image.onerror = () => reject(new Error('Could not load map image'))
    image.src = url
  })
}

function remember(order: string[], url: string, limit: number, release: (url: string) => void): void {
  const index = order.indexOf(url)
  if (index >= 0) order.splice(index, 1)
  order.push(url)
  while (order.length > limit) {
    const oldest = order[0]
    if (!oldest) break
    const entry = entries.get(oldest)
    if (!entry) {
      order.shift()
      continue
    }
    if (entry.listeners.size > 0 || entry.loading) break
    order.shift()
    release(oldest)
  }
}

function rememberPreview(url: string): void {
  remember(previewOrder, url, MAX_PREVIEWS, (oldest) => {
    const entry = entries.get(oldest)
    if (!entry?.preview) return
    closeSource(entry.preview)
    entry.preview = null
    if (!entry.full && !entry.loading && entry.listeners.size === 0) entries.delete(oldest)
  })
}

function rememberFull(url: string): void {
  remember(fullOrder, url, MAX_FULL, (oldest) => {
    const entry = entries.get(oldest)
    if (!entry?.full) return
    closeSource(entry.full)
    entry.full = null
    if (!entry.preview && entry.listeners.size === 0) entries.delete(oldest)
  })
}

async function loadEntry(url: string, imageWidth: number, imageHeight: number, entry: Entry): Promise<void> {
  try {
    const element = await loadElement(url)
    const width = imageWidth > 0 ? imageWidth : element.naturalWidth
    const height = imageHeight > 0 ? imageHeight : element.naturalHeight
    const previewSize = scaledSize(width, height, PREVIEW_LONG_EDGE)
    if (previewSize && !entry.preview && !entry.full) {
      try {
        const preview = await createImageBitmap(element, {
          resizeWidth: previewSize.width,
          resizeHeight: previewSize.height,
          resizeQuality: 'low'
        })
        if (entry.full) preview.close()
        else {
          entry.preview = preview
          rememberPreview(url)
          publish(entry, preview, false)
        }
      } catch (error) {
        console.error('Map preview failed', error)
      }
    }

    if (!entry.preview && !entry.full) {
      entry.full = element
      rememberFull(url)
      publish(entry, element, true)
      return
    }

    if (entry.full) return
    const fullSize = scaledSize(width, height, FULL_LONG_EDGE)
    try {
      const full = fullSize
        ? await createImageBitmap(element, {
            resizeWidth: fullSize.width,
            resizeHeight: fullSize.height,
            resizeQuality: 'medium'
          })
        : await createImageBitmap(element)
      if (entry.full) {
        full.close()
        return
      }
      entry.full = full
      rememberFull(url)
      publish(entry, full, true)
    } catch (error) {
      console.error('Sharp map decode failed', error)
      if (!entry.full) {
        entry.full = element
        rememberFull(url)
        publish(entry, element, true)
      }
    }
  } catch (error) {
    console.error('Failed to load map image', error)
  } finally {
    entry.loading = null
  }
}

/** Decode a small preview first, then the full map. Cached previews stay on screen while a sharp copy reloads. */
export function watchSceneImage(
  url: string,
  imageWidth: number,
  imageHeight: number,
  listener: Listener
): () => void {
  let entry = entries.get(url)
  if (!entry) {
    entry = { preview: null, full: null, loading: null, listeners: new Set() }
    entries.set(url, entry)
  }
  entry.listeners.add(listener)
  if (entry.full) {
    rememberFull(url)
    publish(entry, entry.full, true)
  } else if (entry.preview) {
    rememberPreview(url)
    publish(entry, entry.preview, false)
  }
  if (!entry.full && !entry.loading) {
    entry.loading = loadEntry(url, imageWidth, imageHeight, entry)
  }
  return () => {
    entry.listeners.delete(listener)
  }
}
