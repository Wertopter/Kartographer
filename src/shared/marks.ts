export type MapSketch =
  | { kind: 'stroke'; color: string; points: Array<{ x: number; y: number }> }
  | { kind: 'circle'; color: string; x: number; y: number; radius: number }
  | { kind: 'line'; color: string; x1: number; y1: number; x2: number; y2: number }

export type RulerMark = {
  x1: number
  y1: number
  x2: number
  y2: number
  cells: number
}

export type AuthorMarks = {
  authorId: string
  authorName: string
  sceneId: string
  sketches: MapSketch[]
  draft: MapSketch | null
  ruler: RulerMark | null
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function color(value: unknown): string | null {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : null
}

function point(value: unknown): { x: number; y: number } | null {
  if (!value || typeof value !== 'object') return null
  const item = value as { x?: unknown; y?: unknown }
  if (!finite(item.x) || !finite(item.y)) return null
  return { x: item.x, y: item.y }
}

export function sanitizeSketch(value: unknown): MapSketch | null {
  if (!value || typeof value !== 'object') return null
  const sketch = value as { kind?: unknown; color?: unknown; points?: unknown; x?: unknown; y?: unknown; radius?: unknown; x1?: unknown; y1?: unknown; x2?: unknown; y2?: unknown }
  const ink = color(sketch.color)
  if (!ink) return null
  if (sketch.kind === 'stroke' && Array.isArray(sketch.points)) {
    const points = sketch.points.map(point).filter((item): item is { x: number; y: number } => item != null).slice(0, 500)
    if (points.length < 2) return null
    return { kind: 'stroke', color: ink, points }
  }
  if (sketch.kind === 'circle' && finite(sketch.x) && finite(sketch.y) && finite(sketch.radius) && sketch.radius > 0) {
    return { kind: 'circle', color: ink, x: sketch.x, y: sketch.y, radius: sketch.radius }
  }
  if (sketch.kind === 'line' && finite(sketch.x1) && finite(sketch.y1) && finite(sketch.x2) && finite(sketch.y2)) {
    return { kind: 'line', color: ink, x1: sketch.x1, y1: sketch.y1, x2: sketch.x2, y2: sketch.y2 }
  }
  return null
}

export function sanitizeRuler(value: unknown): RulerMark | null {
  if (!value || typeof value !== 'object') return null
  const ruler = value as Partial<RulerMark>
  if (!finite(ruler.x1) || !finite(ruler.y1) || !finite(ruler.x2) || !finite(ruler.y2) || !finite(ruler.cells)) return null
  return { x1: ruler.x1, y1: ruler.y1, x2: ruler.x2, y2: ruler.y2, cells: Math.max(0, Math.round(ruler.cells)) }
}

export function sanitizeAuthorMarks(value: unknown): AuthorMarks | null {
  if (!value || typeof value !== 'object') return null
  const marks = value as Partial<AuthorMarks>
  if (typeof marks.authorId !== 'string' || !/^(gm|[a-f0-9]{32})$/.test(marks.authorId)) return null
  if (typeof marks.authorName !== 'string') return null
  if (typeof marks.sceneId !== 'string' || marks.sceneId.length > 80) return null
  if (!Array.isArray(marks.sketches)) return null
  const sketches = marks.sketches.map(sanitizeSketch).filter((item): item is MapSketch => item != null).slice(0, 40)
  return {
    authorId: marks.authorId,
    authorName: marks.authorName.trim().slice(0, 24) || 'Player',
    sceneId: marks.sceneId,
    sketches,
    draft: sanitizeSketch(marks.draft),
    ruler: sanitizeRuler(marks.ruler)
  }
}

export function sanitizeMarkBoard(value: unknown): AuthorMarks[] {
  if (!Array.isArray(value)) return []
  return value.map(sanitizeAuthorMarks).filter((item): item is AuthorMarks => item != null).slice(0, 9)
}
