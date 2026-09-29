import { cellOutline, eachHexInRect, gridMetrics, gridShape, hexCenter, hexCorners, worldToScreen, type Letterbox } from '@shared/geometry'
import type { Camera, Fog, GridSettings, PointerPing } from '@shared/types'
import { POINTER_MS } from '@shared/types'

export type DrawToken = {
  id: string
  x: number
  y: number
  size: number
  label: string
  color: string
  image: CanvasImageSource | null
  hiddenFromPlayers: boolean
  selected: boolean
}

export type DrawParams = {
  cssWidth: number
  cssHeight: number
  dpr: number
  image: CanvasImageSource | null
  imageWidth: number
  imageHeight: number
  camera: Camera
  grid: GridSettings | null
  showGrid: boolean
  fog: Fog | { mode: 'none' }
  fogStyle: 'dim' | 'opaque' | 'none'
  tokens: DrawToken[]
  pointer: PointerPing | null
  now: number
  measure: { x1: number; y1: number; x2: number; y2: number } | null
  ruler: { x1: number; y1: number; x2: number; y2: number; cells: number } | null
  letterbox: Letterbox
}

export function drawMap(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  params: DrawParams
): void {
  const width = Math.max(1, params.cssWidth)
  const height = Math.max(1, params.cssHeight)
  const dpr = params.dpr || 1
  canvas.width = Math.floor(width * dpr)
  canvas.height = Math.floor(height * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  const box = params.letterbox
  if (box.width < 1 || box.height < 1) return
  ctx.save()
  ctx.beginPath()
  ctx.rect(box.x, box.y, box.width, box.height)
  ctx.clip()
  ctx.translate(box.x, box.y)

  if (params.camera.scale <= 0 || params.imageWidth <= 0) {
    ctx.restore()
    return
  }

  const viewWidth = box.width
  const viewHeight = box.height
  const origin = worldToScreen(params.camera, 0, 0, viewWidth, viewHeight)
  const drawnWidth = params.imageWidth * params.camera.scale
  const drawnHeight = params.imageHeight * params.camera.scale

  drawSceneImage(ctx, params, origin, drawnWidth, drawnHeight, viewWidth, viewHeight)
  if (params.showGrid && params.grid) {
    drawGrid(ctx, params, origin, drawnWidth, drawnHeight, viewWidth, viewHeight)
  }
  for (const token of params.tokens) drawToken(ctx, token, params.camera, viewWidth, viewHeight)
  drawPointer(ctx, params, viewWidth, viewHeight)
  drawMeasure(ctx, params, viewWidth, viewHeight)
  drawRuler(ctx, params, viewWidth, viewHeight)
  ctx.restore()
}

function drawSceneImage(
  ctx: CanvasRenderingContext2D,
  params: DrawParams,
  origin: { x: number; y: number },
  drawnWidth: number,
  drawnHeight: number,
  viewWidth: number,
  viewHeight: number
): void {
  const { image, fog, fogStyle, camera, grid, imageWidth, imageHeight } = params
  if (!image) return
  const paintFull =
    fogStyle === 'none' || fog.mode === 'none' || fog.mode === 'revealed' || !grid
  if (paintFull) {
    ctx.drawImage(image, origin.x, origin.y, drawnWidth, drawnHeight)
    return
  }
  if (fogStyle === 'dim') {
    ctx.drawImage(image, origin.x, origin.y, drawnWidth, drawnHeight)
    ctx.save()
    ctx.beginPath()
    ctx.rect(origin.x, origin.y, drawnWidth, drawnHeight)
    ctx.clip()
    ctx.fillStyle = 'rgba(6, 5, 4, 0.72)'
    ctx.fillRect(origin.x, origin.y, drawnWidth, drawnHeight)
    if (fog.mode === 'partial') {
      paintCells(ctx, image, fog.cells, grid, imageWidth, imageHeight, camera, viewWidth, viewHeight)
    }
    ctx.restore()
    return
  }
  if (fog.mode === 'partial') {
    ctx.save()
    ctx.beginPath()
    ctx.rect(origin.x, origin.y, drawnWidth, drawnHeight)
    ctx.clip()
    paintCells(ctx, image, fog.cells, grid, imageWidth, imageHeight, camera, viewWidth, viewHeight)
    ctx.restore()
  }
}

function paintCells(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  cells: number[],
  grid: GridSettings,
  imageWidth: number,
  imageHeight: number,
  camera: Camera,
  viewWidth: number,
  viewHeight: number
): void {
  const metrics = gridMetrics(imageWidth, imageHeight, grid)
  if (!metrics) return
  for (const cell of cells) {
    if (cell < 0 || cell >= metrics.count) continue
    const outline = cellOutline(cell, grid, metrics)
    const xs = outline.map((point) => point.x)
    const ys = outline.map((point) => point.y)
    let sourceX = Math.min(...xs)
    let sourceY = Math.min(...ys)
    let sourceW = Math.max(...xs) - sourceX
    let sourceH = Math.max(...ys) - sourceY
    if (sourceX < 0) {
      sourceW += sourceX
      sourceX = 0
    }
    if (sourceY < 0) {
      sourceH += sourceY
      sourceY = 0
    }
    if (sourceX + sourceW > imageWidth) sourceW = imageWidth - sourceX
    if (sourceY + sourceH > imageHeight) sourceH = imageHeight - sourceY
    if (sourceW <= 0 || sourceH <= 0) continue
    const dest = worldToScreen(camera, sourceX, sourceY, viewWidth, viewHeight)
    const destW = sourceW * camera.scale
    const destH = sourceH * camera.scale
    if (dest.x + destW < 0 || dest.y + destH < 0 || dest.x > viewWidth || dest.y > viewHeight) continue
    ctx.save()
    ctx.beginPath()
    traceOutline(ctx, outline, camera, viewWidth, viewHeight)
    ctx.clip()
    ctx.drawImage(image, sourceX, sourceY, sourceW, sourceH, dest.x, dest.y, destW, destH)
    ctx.restore()
  }
}

function traceOutline(
  ctx: CanvasRenderingContext2D,
  outline: Array<{ x: number; y: number }>,
  camera: Camera,
  viewWidth: number,
  viewHeight: number
): void {
  outline.forEach((point, index) => {
    const screen = worldToScreen(camera, point.x, point.y, viewWidth, viewHeight)
    if (index === 0) ctx.moveTo(screen.x, screen.y)
    else ctx.lineTo(screen.x, screen.y)
  })
  ctx.closePath()
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  params: DrawParams,
  origin: { x: number; y: number },
  drawnWidth: number,
  drawnHeight: number,
  viewWidth: number,
  viewHeight: number
): void {
  const grid = params.grid
  if (!grid || grid.cellSize <= 0) return
  ctx.save()
  ctx.beginPath()
  ctx.rect(origin.x, origin.y, drawnWidth, drawnHeight)
  ctx.clip()
  if (params.fogStyle === 'opaque' && params.fog.mode === 'partial' && params.fog.cells.length > 0) {
    const metrics = gridMetrics(params.imageWidth, params.imageHeight, grid)
    if (metrics) {
      ctx.beginPath()
      for (const cell of params.fog.cells) {
        traceOutline(ctx, cellOutline(cell, grid, metrics), params.camera, viewWidth, viewHeight)
      }
      ctx.clip()
    }
  }
  if (params.fogStyle === 'opaque' && params.fog.mode === 'covered') {
    ctx.restore()
    return
  }
  ctx.beginPath()
  ctx.strokeStyle = grid.color
  ctx.globalAlpha = Math.min(1, Math.max(0, grid.alpha))
  ctx.lineWidth = 1
  if (gridShape(grid) === 'square') {
    const worldLeft = params.camera.x - viewWidth / 2 / params.camera.scale
    const worldTop = params.camera.y - viewHeight / 2 / params.camera.scale
    const worldRight = params.camera.x + viewWidth / 2 / params.camera.scale
    const worldBottom = params.camera.y + viewHeight / 2 / params.camera.scale
    const firstCol = Math.floor((worldLeft - grid.offsetX) / grid.cellSize) - 1
    const lastCol = Math.ceil((worldRight - grid.offsetX) / grid.cellSize) + 1
    const firstRow = Math.floor((worldTop - grid.offsetY) / grid.cellSize) - 1
    const lastRow = Math.ceil((worldBottom - grid.offsetY) / grid.cellSize) + 1
    for (let col = firstCol; col <= lastCol; col += 1) {
      const x = worldToScreen(params.camera, grid.offsetX + col * grid.cellSize, 0, viewWidth, viewHeight).x
      ctx.moveTo(x, origin.y)
      ctx.lineTo(x, origin.y + drawnHeight)
    }
    for (let row = firstRow; row <= lastRow; row += 1) {
      const y = worldToScreen(params.camera, 0, grid.offsetY + row * grid.cellSize, viewWidth, viewHeight).y
      ctx.moveTo(origin.x, y)
      ctx.lineTo(origin.x + drawnWidth, y)
    }
  } else {
    const worldLeft = params.camera.x - viewWidth / 2 / params.camera.scale
    const worldTop = params.camera.y - viewHeight / 2 / params.camera.scale
    const worldRight = params.camera.x + viewWidth / 2 / params.camera.scale
    const worldBottom = params.camera.y + viewHeight / 2 / params.camera.scale
    eachHexInRect(worldLeft, worldTop, worldRight, worldBottom, grid, (q, r) => {
      traceOutline(ctx, hexCorners(hexCenter(q, r, grid), grid), params.camera, viewWidth, viewHeight)
    })
  }
  ctx.stroke()
  ctx.restore()
}

function drawToken(
  ctx: CanvasRenderingContext2D,
  token: DrawToken,
  camera: Camera,
  viewWidth: number,
  viewHeight: number
): void {
  const center = worldToScreen(camera, token.x, token.y, viewWidth, viewHeight)
  const radius = (token.size / 2) * camera.scale
  if (radius < 1) return
  ctx.save()
  ctx.beginPath()
  ctx.arc(center.x, center.y, radius, 0, Math.PI * 2)
  ctx.closePath()
  ctx.clip()
  if (token.image) ctx.drawImage(token.image, center.x - radius, center.y - radius, radius * 2, radius * 2)
  else {
    ctx.fillStyle = token.color
    ctx.fill()
  }
  ctx.restore()
  ctx.beginPath()
  ctx.arc(center.x, center.y, radius, 0, Math.PI * 2)
  ctx.lineWidth = token.selected ? 3 : 2
  ctx.strokeStyle = token.selected ? '#f6f1e7' : 'rgba(12, 10, 8, 0.8)'
  ctx.setLineDash(token.hiddenFromPlayers ? [5, 4] : [])
  ctx.stroke()
  ctx.setLineDash([])
  if (!token.label) return
  const labelY = token.image ? center.y + radius + Math.max(12, radius * 0.28) : center.y
  ctx.font = `600 ${Math.max(12, Math.min(28, radius * 0.45))}px "Segoe UI", "Avenir Next", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineWidth = 4
  ctx.strokeStyle = 'rgba(8, 7, 6, 0.85)'
  ctx.strokeText(token.label, center.x, labelY)
  ctx.fillStyle = '#f6f1e7'
  ctx.fillText(token.label, center.x, labelY)
}

function drawPointer(
  ctx: CanvasRenderingContext2D,
  params: DrawParams,
  viewWidth: number,
  viewHeight: number
): void {
  const pointer = params.pointer
  if (!pointer) return
  const age = params.now - pointer.at
  if (age < 0 || age > POINTER_MS) return
  const t = age / POINTER_MS
  const center = worldToScreen(params.camera, pointer.x, pointer.y, viewWidth, viewHeight)
  ctx.save()
  ctx.beginPath()
  ctx.arc(center.x, center.y, 16 + t * 72, 0, Math.PI * 2)
  ctx.strokeStyle = `rgba(226, 177, 90, ${1 - t})`
  ctx.lineWidth = 3
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(center.x, center.y, 5, 0, Math.PI * 2)
  ctx.fillStyle = `rgba(246, 241, 231, ${1 - t})`
  ctx.fill()
  ctx.restore()
}

function drawMeasure(
  ctx: CanvasRenderingContext2D,
  params: DrawParams,
  viewWidth: number,
  viewHeight: number
): void {
  const measure = params.measure
  if (!measure || params.camera.scale <= 0) return
  const start = worldToScreen(params.camera, measure.x1, measure.y1, viewWidth, viewHeight)
  const end = worldToScreen(params.camera, measure.x2, measure.y2, viewWidth, viewHeight)
  ctx.save()
  ctx.strokeStyle = '#e2b15a'
  ctx.lineWidth = 2
  ctx.setLineDash([6, 4])
  ctx.beginPath()
  ctx.moveTo(start.x, start.y)
  ctx.lineTo(end.x, end.y)
  ctx.stroke()
  ctx.restore()
}

function drawRuler(
  ctx: CanvasRenderingContext2D,
  params: DrawParams,
  viewWidth: number,
  viewHeight: number
): void {
  const ruler = params.ruler
  if (!ruler || params.camera.scale <= 0) return
  const start = worldToScreen(params.camera, ruler.x1, ruler.y1, viewWidth, viewHeight)
  const end = worldToScreen(params.camera, ruler.x2, ruler.y2, viewWidth, viewHeight)
  ctx.save()
  ctx.strokeStyle = '#f6f1e7'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(start.x, start.y)
  ctx.lineTo(end.x, end.y)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(start.x, start.y, 4, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(end.x, end.y, 4, 0, Math.PI * 2)
  ctx.fill()
  const label = `${ruler.cells}`
  ctx.font = '600 16px "Segoe UI", "Avenir Next", sans-serif'
  const pad = 8
  const textWidth = ctx.measureText(label).width
  const labelX = end.x + 12
  const labelY = end.y - 14
  ctx.fillStyle = 'rgba(18, 16, 13, 0.9)'
  ctx.beginPath()
  ctx.roundRect(labelX - pad, labelY - 12, textWidth + pad * 2, 24, 6)
  ctx.fill()
  ctx.fillStyle = '#f6f1e7'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, labelX, labelY)
  ctx.restore()
}
