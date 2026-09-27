import { useEffect, useRef, useState } from 'react'
import { applyFogPaint } from '@shared/fog'
import {
  cellAt,
  cellsAlong,
  clampCamera,
  fitCamera,
  gridMetrics,
  panBy,
  presentView,
  screenToWorld,
  snapToCell,
  zoomAt
} from '@shared/geometry'
import type { Camera, Fog, GridSettings, PointerPing } from '@shared/types'
import { POINTER_MS } from '@shared/types'
import { isTypingTarget, type Tool } from '@renderer/tools'
import { drawMap, type DrawToken } from '@renderer/viewport/draw'

export type ViewportToken = {
  id: string
  x: number
  y: number
  size: number
  label: string
  color: string
  imageUrl: string | null
  hiddenFromPlayers: boolean
}

type Props = {
  role: 'gm' | 'player'
  sceneId: string | null
  imageUrl: string | null
  imageWidth: number
  imageHeight: number
  camera: Camera
  grid: GridSettings | null
  showGrid: boolean
  fog: Fog | { mode: 'none' }
  fogStyle: 'dim' | 'opaque' | 'none'
  tokens: ViewportToken[]
  selectedTokenId: string | null
  pointer: PointerPing | null
  tool: Tool
  calibrate: 'slide' | 'cell'
  onCamera: (camera: Camera) => void
  onPaint: (cells: number[], mode: 'reveal' | 'hide') => void
  onPointer: (x: number, y: number) => void
  onPlaceToken: (x: number, y: number) => void
  onMoveToken: (id: string, x: number, y: number) => void
  onSelectToken: (id: string | null) => void
  onGridOffset: (offsetX: number, offsetY: number) => void
  onCellSize: (cellSize: number) => void
  onInteractionEnd: () => void
}

type Drag =
  | { kind: 'pan'; lastX: number; lastY: number }
  | { kind: 'token'; id: string; moved: boolean }
  | { kind: 'fog'; lastX: number; lastY: number }
  | { kind: 'slide'; offsetX: number; offsetY: number; worldX: number; worldY: number }
  | { kind: 'cell'; x1: number; y1: number; x2: number; y2: number }
  | { kind: 'place'; x: number; y: number; moved: boolean }

export function MapViewport(props: Props): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [liveCamera, setLiveCamera] = useState(props.camera)
  const [spacePan, setSpacePan] = useState(false)
  const [stroke, setStroke] = useState<{ mode: 'reveal' | 'hide'; cells: number[] } | null>(null)
  const [tokenDrag, setTokenDrag] = useState<{ id: string; x: number; y: number } | null>(null)
  const [measure, setMeasure] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  const interacting = useRef(false)
  const dragRef = useRef<Drag | null>(null)
  const strokeRef = useRef(stroke)
  const propsRef = useRef(props)
  const cameraRef = useRef(liveCamera)
  const spaceRef = useRef(false)
  strokeRef.current = stroke
  propsRef.current = props
  cameraRef.current = liveCamera

  const [sceneImage, setSceneImage] = useState<HTMLImageElement | null>(null)
  const [tokenImages, setTokenImages] = useState<Map<string, HTMLImageElement>>(new Map())

  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    const observer = new ResizeObserver(() => {
      const rect = frame.getBoundingClientRect()
      setSize({ w: rect.width, h: rect.height })
    })
    observer.observe(frame)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    interacting.current = false
    setLiveCamera(props.camera)
    setStroke(null)
    strokeRef.current = null
    setTokenDrag(null)
    setMeasure(null)
    dragRef.current = null
  }, [props.sceneId])

  useEffect(() => {
    if (!interacting.current) setLiveCamera(props.camera)
  }, [props.camera])

  useEffect(() => {
    if (!props.imageUrl) {
      setSceneImage(null)
      return
    }
    const image = new Image()
    image.onload = () => setSceneImage(image)
    image.src = props.imageUrl
    return () => {
      image.onload = null
    }
  }, [props.imageUrl])

  const tokenKey = props.tokens.map((token) => token.imageUrl ?? '').join('|')
  useEffect(() => {
    const urls = [...new Set(props.tokens.map((token) => token.imageUrl).filter((url): url is string => !!url))]
    if (urls.length === 0) {
      setTokenImages(new Map())
      return
    }
    let cancelled = false
    const loaded = new Map<string, HTMLImageElement>()
    for (const url of urls) {
      const image = new Image()
      image.onload = () => {
        if (cancelled) return
        loaded.set(url, image)
        setTokenImages(new Map(loaded))
      }
      image.src = url
    }
    return () => {
      cancelled = true
    }
    // tokenKey tracks the image set without retriggering on position changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenKey])

  useEffect(() => {
    if (props.role !== 'gm') return
    if (props.camera.scale > 0 || size.w < 20 || props.imageWidth < 1) return
    const fitted = fitCamera(props.imageWidth, props.imageHeight, size.w, size.h)
    setLiveCamera(fitted)
    props.onCamera(fitted)
  }, [props.role, props.camera.scale, props.imageWidth, props.imageHeight, props.sceneId, size.w, size.h, props.onCamera])

  useEffect(() => {
    if (props.role !== 'gm' || size.w < 20 || liveCamera.scale <= 0) return
    if (Math.abs(liveCamera.viewWidth - size.w) < 1 && Math.abs(liveCamera.viewHeight - size.h) < 1) return
    const next = { ...liveCamera, viewWidth: size.w, viewHeight: size.h }
    setLiveCamera(next)
    props.onCamera(next)
    // Publish the GM frame when the viewport is resized. Camera updates are read from this render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.w, size.h, props.role])

  const presentation = presentView(liveCamera, size.w, size.h, props.role === 'gm' ? 'author' : 'follow')
  const framed = presentation.camera
  const metrics = props.grid ? gridMetrics(props.imageWidth, props.imageHeight, props.grid) : null
  const displayFog =
    stroke && props.fog.mode !== 'none' && metrics
      ? applyFogPaint(props.fog, metrics.count, stroke.cells, stroke.mode)
      : props.fog

  const drawTokens: DrawToken[] = props.tokens.map((token) => {
    const dragged = tokenDrag?.id === token.id ? tokenDrag : null
    return {
      id: token.id,
      x: dragged?.x ?? token.x,
      y: dragged?.y ?? token.y,
      size: token.size,
      label: token.label,
      color: token.color,
      image: token.imageUrl ? tokenImages.get(token.imageUrl) ?? null : null,
      hiddenFromPlayers: token.hiddenFromPlayers,
      selected: token.id === props.selectedTokenId
    }
  })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return
    drawMap(context, canvas, {
      cssWidth: size.w,
      cssHeight: size.h,
      dpr: window.devicePixelRatio || 1,
      image: sceneImage,
      imageWidth: props.imageWidth,
      imageHeight: props.imageHeight,
      camera: framed,
      grid: props.grid,
      showGrid: props.showGrid,
      fog: displayFog,
      fogStyle: props.fogStyle,
      tokens: drawTokens,
      pointer: props.pointer,
      now: Date.now(),
      measure,
      letterbox: presentation.letterbox
    })
  })

  useEffect(() => {
    if (!props.pointer) return
    let frame = 0
    const tick = (): void => {
      const canvas = canvasRef.current
      const context = canvas?.getContext('2d')
      if (canvas && context) {
        const view = presentView(
          cameraRef.current,
          size.w,
          size.h,
          propsRef.current.role === 'gm' ? 'author' : 'follow'
        )
        drawMap(context, canvas, {
          cssWidth: size.w,
          cssHeight: size.h,
          dpr: window.devicePixelRatio || 1,
          image: sceneImage,
          imageWidth: props.imageWidth,
          imageHeight: props.imageHeight,
          camera: view.camera,
          grid: propsRef.current.grid,
          showGrid: propsRef.current.showGrid,
          fog: propsRef.current.fog,
          fogStyle: propsRef.current.fogStyle,
          tokens: drawTokens,
          pointer: propsRef.current.pointer,
          now: Date.now(),
          measure,
          letterbox: view.letterbox
        })
      }
      if (props.pointer && Date.now() - props.pointer.at < POINTER_MS) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [props.pointer, size.w, size.h, sceneImage, measure, drawTokens, props.imageWidth, props.imageHeight])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || props.role !== 'gm') return
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault()
      const rect = canvas.getBoundingClientRect()
      const current = cameraRef.current
      if (current.scale <= 0) return
      const next = clampCamera(
        zoomAt(
          { ...current, viewWidth: rect.width, viewHeight: rect.height },
          event.clientX - rect.left,
          event.clientY - rect.top,
          rect.width,
          rect.height,
          Math.exp(-event.deltaY * 0.0012)
        ),
        propsRef.current.imageWidth,
        propsRef.current.imageHeight
      )
      interacting.current = true
      cameraRef.current = next
      setLiveCamera(next)
      propsRef.current.onCamera(next)
      window.setTimeout(() => {
        interacting.current = false
      }, 180)
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [props.role])

  useEffect(() => {
    if (props.role !== 'gm') return
    const down = (event: KeyboardEvent): void => {
      if (event.code !== 'Space' || isTypingTarget(event.target)) return
      event.preventDefault()
      spaceRef.current = true
      setSpacePan(true)
    }
    const up = (event: KeyboardEvent): void => {
      if (event.code !== 'Space') return
      spaceRef.current = false
      setSpacePan(false)
    }
    const fit = (event: KeyboardEvent): void => {
      if (event.key.toLowerCase() !== 'f' || event.metaKey || event.ctrlKey || event.altKey) return
      if (isTypingTarget(event.target)) return
      const current = propsRef.current
      if (current.imageWidth < 1 || size.w < 20) return
      event.preventDefault()
      const fitted = fitCamera(current.imageWidth, current.imageHeight, size.w, size.h)
      setLiveCamera(fitted)
      current.onCamera(fitted)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('keydown', fit)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('keydown', fit)
    }
  }, [props.role, size.w, size.h])

  function worldAt(event: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number; sx: number; sy: number } {
    const rect = event.currentTarget.getBoundingClientRect()
    const sx = event.clientX - rect.left
    const sy = event.clientY - rect.top
    const world = screenToWorld(framed, sx, sy, rect.width, rect.height)
    return { ...world, sx, sy }
  }

  function hitToken(worldX: number, worldY: number): ViewportToken | null {
    const tokens = props.tokens
    for (let index = tokens.length - 1; index >= 0; index -= 1) {
      const token = tokens[index]
      const dx = worldX - (tokenDrag?.id === token.id ? tokenDrag.x : token.x)
      const dy = worldY - (tokenDrag?.id === token.id ? tokenDrag.y : token.y)
      if (dx * dx + dy * dy <= (token.size / 2) * (token.size / 2)) return token
    }
    return null
  }

  function onPointerDown(event: React.PointerEvent<HTMLCanvasElement>): void {
    if (props.role !== 'gm' || framed.scale <= 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const point = worldAt(event)
    interacting.current = true
    const panning = spaceRef.current || props.tool === 'pan'
    if (panning) {
      const hit = props.tool === 'pan' ? hitToken(point.x, point.y) : null
      if (hit && !spaceRef.current) props.onSelectToken(hit.id)
      else props.onSelectToken(null)
      dragRef.current = { kind: 'pan', lastX: point.sx, lastY: point.sy }
      return
    }
    if (props.tool === 'pointer') {
      props.onPointer(point.x, point.y)
      dragRef.current = null
      return
    }
    if ((props.tool === 'reveal' || props.tool === 'hide') && props.grid) {
      const mode: 'reveal' | 'hide' = props.tool === 'reveal' ? 'reveal' : 'hide'
      const cell = cellAt(point.x, point.y, props.imageWidth, props.imageHeight, props.grid)
      const cells = cell == null ? [] : [cell]
      const next = { mode, cells }
      strokeRef.current = next
      setStroke(next)
      if (cells.length > 0) props.onPaint(cells, mode)
      dragRef.current = { kind: 'fog', lastX: point.x, lastY: point.y }
      return
    }
    if (props.tool === 'token') {
      const hit = hitToken(point.x, point.y)
      if (hit) {
        props.onSelectToken(hit.id)
        dragRef.current = { kind: 'token', id: hit.id, moved: false }
        setTokenDrag({ id: hit.id, x: hit.x, y: hit.y })
      } else {
        props.onSelectToken(null)
        dragRef.current = { kind: 'place', x: point.sx, y: point.sy, moved: false }
      }
      return
    }
    if (props.tool === 'grid' && props.grid) {
      if (props.calibrate === 'cell') {
        dragRef.current = { kind: 'cell', x1: point.x, y1: point.y, x2: point.x, y2: point.y }
        setMeasure({ x1: point.x, y1: point.y, x2: point.x, y2: point.y })
      } else {
        dragRef.current = {
          kind: 'slide',
          offsetX: props.grid.offsetX,
          offsetY: props.grid.offsetY,
          worldX: point.x,
          worldY: point.y
        }
      }
    }
  }

  function onPointerMove(event: React.PointerEvent<HTMLCanvasElement>): void {
    const drag = dragRef.current
    if (!drag || props.role !== 'gm') return
    const point = worldAt(event)
    if (drag.kind === 'pan') {
      const next = clampCamera(
        panBy(cameraRef.current, point.sx - drag.lastX, point.sy - drag.lastY, size.w, size.h),
        props.imageWidth,
        props.imageHeight
      )
      drag.lastX = point.sx
      drag.lastY = point.sy
      cameraRef.current = next
      setLiveCamera(next)
      props.onCamera(next)
      return
    }
    if (drag.kind === 'fog' && props.grid) {
      const mode: 'reveal' | 'hide' = props.tool === 'hide' ? 'hide' : 'reveal'
      const cells = cellsAlong(drag.lastX, drag.lastY, point.x, point.y, props.imageWidth, props.imageHeight, props.grid)
      drag.lastX = point.x
      drag.lastY = point.y
      const current = strokeRef.current ?? { mode, cells: [] }
      const merged = [...new Set([...current.cells, ...cells])]
      const next = { mode, cells: merged }
      strokeRef.current = next
      setStroke(next)
      if (cells.length > 0) props.onPaint(cells, mode)
      return
    }
    if (drag.kind === 'token' && props.grid) {
      const snapped = snapToCell(point.x, point.y, props.grid, props.grid.enabled)
      drag.moved = true
      setTokenDrag({ id: drag.id, x: snapped.x, y: snapped.y })
      props.onMoveToken(drag.id, snapped.x, snapped.y)
      return
    }
    if (drag.kind === 'token') {
      drag.moved = true
      setTokenDrag({ id: drag.id, x: point.x, y: point.y })
      props.onMoveToken(drag.id, point.x, point.y)
      return
    }
    if (drag.kind === 'place') {
      if (Math.hypot(point.sx - drag.x, point.sy - drag.y) > 4) drag.moved = true
      return
    }
    if (drag.kind === 'slide') {
      props.onGridOffset(drag.offsetX + (point.x - drag.worldX), drag.offsetY + (point.y - drag.worldY))
      return
    }
    if (drag.kind === 'cell') {
      drag.x2 = point.x
      drag.y2 = point.y
      setMeasure({ x1: drag.x1, y1: drag.y1, x2: point.x, y2: point.y })
    }
  }

  function onPointerUp(event: React.PointerEvent<HTMLCanvasElement>): void {
    const drag = dragRef.current
    dragRef.current = null
    interacting.current = false
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (!drag) return
    if (drag.kind === 'place' && !drag.moved) {
      const point = worldAt(event)
      props.onPlaceToken(point.x, point.y)
    }
    if (drag.kind === 'cell') {
      const distance = Math.hypot(drag.x2 - drag.x1, drag.y2 - drag.y1)
      if (distance >= 8) props.onCellSize(distance)
      setMeasure(null)
    }
    if (drag.kind === 'fog') {
      const painted = strokeRef.current
      if (painted && painted.cells.length > 0) props.onPaint(painted.cells, painted.mode)
      setStroke(null)
      strokeRef.current = null
    }
    if (drag.kind === 'token') setTokenDrag(null)
    if (drag.kind === 'pan') setLiveCamera(cameraRef.current)
    props.onInteractionEnd()
  }

  const cursor = spacePan || props.tool === 'pan' ? 'grab' : props.tool === 'pointer' ? 'crosshair' : props.tool === 'grid' ? 'move' : 'crosshair'
  const zoom = liveCamera.scale > 0 ? Math.round(liveCamera.scale * 100) : 0

  return (
    <div className={props.role === 'player' ? 'viewport-frame player-frame' : 'viewport-frame'} ref={frameRef}>
      <canvas
        ref={canvasRef}
        className="map-canvas"
        style={{ cursor: props.role === 'gm' ? cursor : 'default' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      {props.role === 'gm' && props.imageUrl && (
        <div className="zoom-hud">
          <span>{zoom}%</span>
          <button
            type="button"
            onClick={() => {
              if (size.w < 20 || props.imageWidth < 1) return
              const fitted = fitCamera(props.imageWidth, props.imageHeight, size.w, size.h)
              setLiveCamera(fitted)
              props.onCamera(fitted)
            }}
          >
            Fit
          </button>
        </div>
      )}
    </div>
  )
}
