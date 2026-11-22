export type SceneBitmap = {
  bitmap: ImageBitmap
  width: number
  height: number
  /** False while the sharp copy is still decoding and `bitmap` is the preview. */
  full: boolean
}

type Listener = (image: SceneBitmap) => void

type Entry = {
  preview: ImageBitmap | null
  full: ImageBitmap | null
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

function publish(entry: Entry, bitmap: ImageBitmap, full: boolean): void {
  const image: SceneBitmap = { bitmap, width: bitmap.width, height: bitmap.height, full }
  for (const listener of entry.listeners) listener(image)
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
    entry.preview.close()
    entry.preview = null
    if (!entry.full && !entry.loading && entry.listeners.size === 0) entries.delete(oldest)
  })
}

function rememberFull(url: string): void {
  remember(fullOrder, url, MAX_FULL, (oldest) => {
    const entry = entries.get(oldest)
    if (!entry?.full) return
    entry.full.close()
    entry.full = null
    if (!entry.preview && entry.listeners.size === 0) entries.delete(oldest)
  })
}

async function loadEntry(url: string, imageWidth: number, imageHeight: number, entry: Entry): Promise<void> {
  try {
    const response = await fetch(url)
    if (!response.ok) return
    const blob = await response.blob()
    const previewSize = scaledSize(imageWidth, imageHeight, PREVIEW_LONG_EDGE)
    if (previewSize && !entry.preview && !entry.full) {
      const preview = await createImageBitmap(blob, {
        resizeWidth: previewSize.width,
        resizeHeight: previewSize.height,
        resizeQuality: 'low'
      })
      if (entry.full) {
        preview.close()
      } else {
        entry.preview = preview
        rememberPreview(url)
        publish(entry, preview, false)
      }
    }

    if (entry.full) return
    const fullSize = scaledSize(imageWidth, imageHeight, FULL_LONG_EDGE)
    const full = fullSize
      ? await createImageBitmap(blob, {
          resizeWidth: fullSize.width,
          resizeHeight: fullSize.height,
          resizeQuality: 'medium'
        })
      : await createImageBitmap(blob)
    if (entry.full) {
      full.close()
      return
    }
    entry.full = full
    rememberFull(url)
    publish(entry, full, true)
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
    listener({ bitmap: entry.full, width: entry.full.width, height: entry.full.height, full: true })
  } else if (entry.preview) {
    rememberPreview(url)
    listener({ bitmap: entry.preview, width: entry.preview.width, height: entry.preview.height, full: false })
  }
  if (!entry.full && !entry.loading) {
    entry.loading = loadEntry(url, imageWidth, imageHeight, entry)
  }
  return () => {
    entry.listeners.delete(listener)
  }
}
