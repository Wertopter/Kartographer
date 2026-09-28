import type { Camera, Fog, GridSettings, GridShape } from '@shared/types'
import { MAX_FOG_CELLS } from '@shared/types'

export type GridMetrics = {
  columns: number
  rows: number
  minCol: number
  minRow: number
  cellSize: number
  count: number
}

export function defaultGrid(): GridSettings {
  return {
    enabled: true,
    shape: 'square',
    cellSize: 70,
    offsetX: 0,
    offsetY: 0,
    color: '#f0d7a2'
  }
}

export function unsetCamera(imageWidth: number, imageHeight: number): Camera {
  return {
    x: imageWidth / 2,
    y: imageHeight / 2,
    scale: 0,
    viewWidth: 0,
    viewHeight: 0
  }
}

export function minimumCellSize(width: number, height: number): number {
  const area = Math.max(1, width) * Math.max(1, height)
  return Math.max(16, Math.ceil(Math.sqrt(area / MAX_FOG_CELLS)))
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function gridShape(grid: GridSettings): GridShape {
  return grid.shape === 'flat' || grid.shape === 'pointy' ? grid.shape : 'square'
}

function hexRadius(grid: GridSettings): number {
  if (gridShape(grid) === 'flat') return grid.cellSize / 2
  if (gridShape(grid) === 'pointy') return grid.cellSize / Math.sqrt(3)
  return 0
}

function cubeRound(fracQ: number, fracR: number): { q: number; r: number } {
  const fracS = -fracQ - fracR
  let q = Math.round(fracQ)
  let r = Math.round(fracR)
  let s = Math.round(fracS)
  const qDiff = Math.abs(q - fracQ)
  const rDiff = Math.abs(r - fracR)
  const sDiff = Math.abs(s - fracS)
  if (qDiff > rDiff && qDiff > sDiff) q = -r - s
  else if (rDiff > sDiff) r = -q - s
  return { q, r }
}

function axialFractional(x: number, y: number, grid: GridSettings): { q: number; r: number } {
  const radius = hexRadius(grid)
  const px = x - grid.offsetX
  const py = y - grid.offsetY
  if (gridShape(grid) === 'pointy') {
    return {
      q: ((Math.sqrt(3) / 3) * px - (1 / 3) * py) / radius,
      r: ((2 / 3) * py) / radius
    }
  }
  return {
    q: ((2 / 3) * px) / radius,
    r: ((-1 / 3) * px + (Math.sqrt(3) / 3) * py) / radius
  }
}

function axialRound(x: number, y: number, grid: GridSettings): { q: number; r: number } {
  const axial = axialFractional(x, y, grid)
  return cubeRound(axial.q, axial.r)
}

export function hexCenter(q: number, r: number, grid: GridSettings): { x: number; y: number } {
  const radius = hexRadius(grid)
  if (gridShape(grid) === 'pointy') {
    return {
      x: grid.offsetX + radius * Math.sqrt(3) * (q + r / 2),
      y: grid.offsetY + radius * 1.5 * r
    }
  }
  return {
    x: grid.offsetX + radius * 1.5 * q,
    y: grid.offsetY + radius * Math.sqrt(3) * (r + q / 2)
  }
}

export function hexCorners(center: { x: number; y: number }, grid: GridSettings): Array<{ x: number; y: number }> {
  const radius = hexRadius(grid)
  const pointy = gridShape(grid) === 'pointy'
  const corners: Array<{ x: number; y: number }> = []
  for (let corner = 0; corner < 6; corner += 1) {
    const angle = (Math.PI / 180) * (60 * corner - (pointy ? 30 : 0))
    corners.push({
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle)
    })
  }
  return corners
}

function axialSpan(
  left: number,
  top: number,
  right: number,
  bottom: number,
  grid: GridSettings
): { minQ: number; maxQ: number; minR: number; maxR: number } | null {
  if (hexRadius(grid) <= 0) return null
  const samples = [
    [left, top],
    [right, top],
    [left, bottom],
    [right, bottom]
  ]
  let minQ = Infinity
  let maxQ = -Infinity
  let minR = Infinity
  let maxR = -Infinity
  for (const [x, y] of samples) {
    const axial = axialFractional(x, y, grid)
    minQ = Math.min(minQ, axial.q)
    maxQ = Math.max(maxQ, axial.q)
    minR = Math.min(minR, axial.r)
    maxR = Math.max(maxR, axial.r)
  }
  return {
    minQ: Math.floor(minQ) - 1,
    maxQ: Math.ceil(maxQ) + 1,
    minR: Math.floor(minR) - 1,
    maxR: Math.ceil(maxR) + 1
  }
}

export function eachHexInRect(
  left: number,
  top: number,
  right: number,
  bottom: number,
  grid: GridSettings,
  visit: (q: number, r: number) => void
): void {
  const span = axialSpan(left, top, right, bottom, grid)
  if (!span) return
  for (let r = span.minR; r <= span.maxR; r += 1) {
    for (let q = span.minQ; q <= span.maxQ; q += 1) visit(q, r)
  }
}

export function gridMetrics(width: number, height: number, grid: GridSettings): GridMetrics | null {
  if (grid.cellSize <= 0 || width <= 0 || height <= 0) return null
  if (gridShape(grid) !== 'square') {
    const span = axialSpan(0, 0, width, height, grid)
    if (!span) return null
    const columns = span.maxQ - span.minQ + 1
    const rows = span.maxR - span.minR + 1
    if (columns <= 0 || rows <= 0) return null
    return {
      columns,
      rows,
      minCol: span.minQ,
      minRow: span.minR,
      cellSize: grid.cellSize,
      count: columns * rows
    }
  }
  const minCol = Math.floor((0 - grid.offsetX) / grid.cellSize)
  const minRow = Math.floor((0 - grid.offsetY) / grid.cellSize)
  const maxCol = Math.floor((width - 1e-6 - grid.offsetX) / grid.cellSize)
  const maxRow = Math.floor((height - 1e-6 - grid.offsetY) / grid.cellSize)
  const columns = maxCol - minCol + 1
  const rows = maxRow - minRow + 1
  if (columns <= 0 || rows <= 0) return null
  return {
    columns,
    rows,
    minCol,
    minRow,
    cellSize: grid.cellSize,
    count: columns * rows
  }
}

export function cellAt(
  worldX: number,
  worldY: number,
  width: number,
  height: number,
  grid: GridSettings
): number | null {
  if (worldX < 0 || worldY < 0 || worldX >= width || worldY >= height) return null
  const metrics = gridMetrics(width, height, grid)
  if (!metrics) return null
  const absolute =
    gridShape(grid) === 'square'
      ? {
          q: Math.floor((worldX - grid.offsetX) / grid.cellSize),
          r: Math.floor((worldY - grid.offsetY) / grid.cellSize)
        }
      : axialRound(worldX, worldY, grid)
  const col = absolute.q - metrics.minCol
  const row = absolute.r - metrics.minRow
  if (col < 0 || row < 0 || col >= metrics.columns || row >= metrics.rows) return null
  return row * metrics.columns + col
}

export function cellRect(
  index: number,
  grid: GridSettings,
  metrics: GridMetrics
): { x: number; y: number; w: number; h: number } {
  const outline = cellOutline(index, grid, metrics)
  const xs = outline.map((point) => point.x)
  const ys = outline.map((point) => point.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}

export function cellOutline(
  index: number,
  grid: GridSettings,
  metrics: GridMetrics
): Array<{ x: number; y: number }> {
  const col = index % metrics.columns
  const row = Math.floor(index / metrics.columns)
  const q = col + metrics.minCol
  const r = row + metrics.minRow
  if (gridShape(grid) === 'square') {
    const x = grid.offsetX + q * grid.cellSize
    const y = grid.offsetY + r * grid.cellSize
    return [
      { x, y },
      { x: x + grid.cellSize, y },
      { x: x + grid.cellSize, y: y + grid.cellSize },
      { x, y: y + grid.cellSize }
    ]
  }
  return hexCorners(hexCenter(q, r, grid), grid)
}

export function cellsAlong(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  width: number,
  height: number,
  grid: GridSettings
): number[] {
  const distance = Math.hypot(toX - fromX, toY - fromY)
  const step = Math.max(4, grid.cellSize / 4)
  const steps = Math.max(1, Math.ceil(distance / step))
  const cells: number[] = []
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps
    const cell = cellAt(fromX + (toX - fromX) * t, fromY + (toY - fromY) * t, width, height, grid)
    if (cell != null) cells.push(cell)
  }
  return cells
}

export function isCellRevealed(fog: Fog, cell: number | null): boolean {
  if (cell == null) return false
  if (fog.mode === 'revealed') return true
  if (fog.mode === 'covered') return false
  return fog.cells.includes(cell)
}

export function snapToCell(
  x: number,
  y: number,
  grid: GridSettings,
  enabled: boolean
): { x: number; y: number } {
  if (!enabled || grid.cellSize <= 0) return { x, y }
  if (gridShape(grid) !== 'square') {
    const axial = axialRound(x, y, grid)
    return hexCenter(axial.q, axial.r, grid)
  }
  const col = Math.floor((x - grid.offsetX) / grid.cellSize)
  const row = Math.floor((y - grid.offsetY) / grid.cellSize)
  return {
    x: grid.offsetX + (col + 0.5) * grid.cellSize,
    y: grid.offsetY + (row + 0.5) * grid.cellSize
  }
}

export function screenToWorld(
  camera: Camera,
  screenX: number,
  screenY: number,
  viewWidth: number,
  viewHeight: number
): { x: number; y: number } {
  return {
    x: camera.x + (screenX - viewWidth / 2) / camera.scale,
    y: camera.y + (screenY - viewHeight / 2) / camera.scale
  }
}

export function worldToScreen(
  camera: Camera,
  worldX: number,
  worldY: number,
  viewWidth: number,
  viewHeight: number
): { x: number; y: number } {
  return {
    x: (worldX - camera.x) * camera.scale + viewWidth / 2,
    y: (worldY - camera.y) * camera.scale + viewHeight / 2
  }
}

export function zoomAt(
  camera: Camera,
  screenX: number,
  screenY: number,
  viewWidth: number,
  viewHeight: number,
  factor: number
): Camera {
  const world = screenToWorld(camera, screenX, screenY, viewWidth, viewHeight)
  const scale = clamp(camera.scale * factor, 0.02, 12)
  return {
    x: world.x - (screenX - viewWidth / 2) / scale,
    y: world.y - (screenY - viewHeight / 2) / scale,
    scale,
    viewWidth,
    viewHeight
  }
}

export function panBy(
  camera: Camera,
  screenDx: number,
  screenDy: number,
  viewWidth: number,
  viewHeight: number
): Camera {
  return {
    ...camera,
    x: camera.x - screenDx / camera.scale,
    y: camera.y - screenDy / camera.scale,
    viewWidth,
    viewHeight
  }
}

export function fitCamera(
  imageWidth: number,
  imageHeight: number,
  viewWidth: number,
  viewHeight: number
): Camera {
  const scale = Math.min(viewWidth / imageWidth, viewHeight / imageHeight) * 0.96
  return {
    x: imageWidth / 2,
    y: imageHeight / 2,
    scale: clamp(scale, 0.02, 12),
    viewWidth,
    viewHeight
  }
}

export function clampCamera(camera: Camera, imageWidth: number, imageHeight: number): Camera {
  return {
    ...camera,
    x: clamp(camera.x, -imageWidth * 0.25, imageWidth * 1.25),
    y: clamp(camera.y, -imageHeight * 0.25, imageHeight * 1.25)
  }
}

export type Letterbox = { x: number; y: number; width: number; height: number }

export type Presentation = {
  camera: Camera
  letterbox: Letterbox
}

/** GM draws 1:1 in its window. The player view fits that same world rectangle and letterboxes the rest. */
export function presentView(
  camera: Camera,
  viewWidth: number,
  viewHeight: number,
  mode: 'author' | 'follow'
): Presentation {
  if (mode === 'author' || camera.scale <= 0 || camera.viewWidth <= 0 || camera.viewHeight <= 0) {
    return {
      camera: { ...camera, viewWidth, viewHeight },
      letterbox: { x: 0, y: 0, width: viewWidth, height: viewHeight }
    }
  }
  const worldW = camera.viewWidth / camera.scale
  const worldH = camera.viewHeight / camera.scale
  if (worldW <= 0 || worldH <= 0) {
    return {
      camera: { ...camera, viewWidth, viewHeight },
      letterbox: { x: 0, y: 0, width: viewWidth, height: viewHeight }
    }
  }
  const scale = Math.min(viewWidth / worldW, viewHeight / worldH)
  const width = worldW * scale
  const height = worldH * scale
  return {
    camera: { x: camera.x, y: camera.y, scale, viewWidth: width, viewHeight: height },
    letterbox: {
      x: (viewWidth - width) / 2,
      y: (viewHeight - height) / 2,
      width,
      height
    }
  }
}
