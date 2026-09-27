import { randomUUID } from 'crypto'
import { nativeImage } from 'electron'
import { copyFile, mkdir, readdir, rm } from 'fs/promises'
import { basename, extname, join } from 'path'
import { applyFogPaint, fogIsClear } from '@shared/fog'
import {
  clamp,
  clampCamera,
  defaultGrid,
  gridMetrics,
  minimumCellSize,
  snapToCell,
  unsetCamera
} from '@shared/geometry'
import type {
  Camera,
  Campaign,
  Command,
  DisplayInfo,
  GmState,
  GridSettings,
  PlayerProjection,
  PointerPing,
  Scene,
  Token
} from '@shared/types'
import { TOKEN_COLORS } from '@shared/types'
import { assetUrl, toPlayerProjection } from '@shared/projection'
import {
  campaignPaths,
  createCampaign,
  loadCampaign,
  saveCampaign,
  type CampaignPaths
} from './campaignStore'

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export class Session {
  private campaign: Campaign = createCampaign()
  private pointer: PointerPing | null = null
  private displays: DisplayInfo[] = []
  private playerWindowOpen = false
  private status: string | null = null
  private saveTimer: NodeJS.Timeout | null = null
  private listener: (() => void) | null = null
  private paths: CampaignPaths

  constructor(userData: string) {
    this.paths = campaignPaths(userData)
  }

  get assetDirectory(): string {
    return this.paths.assets
  }

  get campaignFile(): string {
    return this.paths.file
  }

  setListener(listener: () => void): void {
    this.listener = listener
  }

  async init(): Promise<void> {
    await mkdir(this.paths.assets, { recursive: true })
    this.campaign = await loadCampaign(this.paths.file)
    await saveCampaign(this.paths.file, this.campaign)
  }

  async flush(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    await saveCampaign(this.paths.file, this.campaign)
  }

  getGmState(): GmState {
    return {
      campaignName: this.campaign.name,
      campaignDir: this.paths.dir,
      activeSceneId: this.campaign.activeSceneId,
      scenes: this.campaign.scenes.map((scene) => ({
        ...scene,
        imageUrl: assetUrl(scene.assetFile)
      })),
      tokens: this.campaign.tokens.map((token) => ({
        ...token,
        imageUrl: token.imageFile ? assetUrl(token.imageFile) : null
      })),
      pointer: this.pointer,
      displays: this.displays,
      playerWindowOpen: this.playerWindowOpen,
      status: this.status
    }
  }

  getPlayerProjection(): PlayerProjection {
    return toPlayerProjection(this.campaign, this.pointer)
  }

  setDisplays(displays: DisplayInfo[]): void {
    this.displays = displays
    this.emit(false)
  }

  setPlayerWindowOpen(open: boolean): void {
    this.playerWindowOpen = open
    this.emit(false)
  }

  setStatus(status: string | null): void {
    this.status = status
    this.emit(false)
  }

  execute(command: Command): void {
    switch (command.type) {
      case 'renameCampaign':
        this.renameCampaign(command.name)
        break
      case 'renameScene':
        this.renameScene(command.sceneId, command.name)
        break
      case 'deleteScene':
        this.deleteScene(command.sceneId)
        break
      case 'setActiveScene':
        this.setActiveScene(command.sceneId)
        break
      case 'setSceneKind':
        this.setSceneKind(command.sceneId, command.kind)
        break
      case 'updateCamera':
        this.updateCamera(command.sceneId, command.camera)
        break
      case 'updateGrid':
        this.updateGrid(command.sceneId, command.grid)
        break
      case 'paintFog':
        this.paintFog(command.sceneId, command.cells, command.mode)
        break
      case 'revealAll':
        this.setFogMode(command.sceneId, 'revealed')
        break
      case 'coverAll':
        this.setFogMode(command.sceneId, 'covered')
        break
      case 'addToken':
        this.addToken(command.sceneId, command.x, command.y)
        break
      case 'updateToken':
        this.updateToken(command)
        break
      case 'deleteToken':
        this.deleteToken(command.tokenId)
        break
      case 'clearTokenImage':
        this.clearTokenImage(command.tokenId)
        break
      case 'pointer':
        this.ping(command.sceneId, command.x, command.y)
        break
      default: {
        const unreachable: never = command
        void unreachable
      }
    }
  }

  async importSceneFiles(filePaths: string[]): Promise<void> {
    const created: string[] = []
    const skipped: string[] = []
    for (const filePath of filePaths) {
      const extension = extname(filePath).toLowerCase()
      if (!IMAGE_EXTENSIONS.has(extension)) {
        skipped.push(basename(filePath))
        continue
      }
      const assetFile = `${randomUUID()}${extension}`
      const destination = join(this.paths.assets, assetFile)
      try {
        await copyFile(filePath, destination)
        const size = nativeImage.createFromPath(destination).getSize()
        if (size.width <= 0 || size.height <= 0) {
          await rm(destination, { force: true })
          skipped.push(basename(filePath))
          continue
        }
        const scene: Scene = {
          id: randomUUID(),
          name: sceneName(filePath),
          kind: 'map',
          assetFile,
          width: size.width,
          height: size.height,
          camera: unsetCamera(size.width, size.height),
          grid: {
            ...defaultGrid(),
            cellSize: Math.max(defaultGrid().cellSize, minimumCellSize(size.width, size.height))
          },
          fog: { mode: 'covered' }
        }
        this.campaign.scenes.push(scene)
        created.push(scene.id)
      } catch {
        skipped.push(basename(filePath))
      }
    }
    if (created.length > 0) this.campaign.activeSceneId = created[0]
    if (created.length === 0 && skipped.length > 0) {
      this.status = `Could not read ${skipped.join(', ')}.`
    } else if (skipped.length > 0) {
      this.status = `Imported ${created.length} image${created.length === 1 ? '' : 's'}. Skipped ${skipped.join(', ')}.`
    } else if (created.length > 0) {
      this.status = null
    }
    this.emit(true)
  }

  async chooseTokenImage(tokenId: string, sourcePath: string): Promise<void> {
    const token = this.campaign.tokens.find((item) => item.id === tokenId)
    if (!token) return
    const extension = extname(sourcePath).toLowerCase()
    if (!IMAGE_EXTENSIONS.has(extension)) {
      this.status = 'Token images need to be PNG, JPEG, WebP, or GIF.'
      this.emit(false)
      return
    }
    const assetFile = `${randomUUID()}${extension}`
    const destination = join(this.paths.assets, assetFile)
    try {
      await copyFile(sourcePath, destination)
      const size = nativeImage.createFromPath(destination).getSize()
      if (size.width <= 0 || size.height <= 0) {
        await rm(destination, { force: true })
        this.status = 'That token image could not be read.'
        this.emit(false)
        return
      }
      token.imageFile = assetFile
      await this.sweepAssets()
      this.status = null
      this.emit(true)
    } catch {
      this.status = 'Could not copy that token image.'
      this.emit(false)
    }
  }

  private renameCampaign(name: string): void {
    const trimmed = name.trim()
    if (!trimmed) return
    this.campaign.name = trimmed.slice(0, 80)
    this.emit(true)
  }

  private renameScene(sceneId: string, name: string): void {
    const scene = this.findScene(sceneId)
    if (!scene) return
    const trimmed = name.trim()
    if (!trimmed) return
    scene.name = trimmed.slice(0, 80)
    this.emit(true)
  }

  private deleteScene(sceneId: string): void {
    const scene = this.findScene(sceneId)
    if (!scene) return
    this.campaign.scenes = this.campaign.scenes.filter((item) => item.id !== sceneId)
    this.campaign.tokens = this.campaign.tokens.filter((token) => token.sceneId !== sceneId)
    if (this.campaign.activeSceneId === sceneId) {
      this.campaign.activeSceneId = this.campaign.scenes[0]?.id ?? null
    }
    if (this.pointer?.sceneId === sceneId) this.pointer = null
    void this.sweepAssets()
    this.emit(true)
  }

  private setActiveScene(sceneId: string): void {
    if (!this.findScene(sceneId)) return
    this.campaign.activeSceneId = sceneId
    this.emit(true)
  }

  private setSceneKind(sceneId: string, kind: Scene['kind']): void {
    const scene = this.findScene(sceneId)
    if (!scene) return
    if (kind !== 'map' && kind !== 'handout') return
    scene.kind = kind
    this.emit(true)
  }

  private updateCamera(sceneId: string, camera: Camera): void {
    const scene = this.findScene(sceneId)
    if (!scene) return
    if (!finite(camera.x) || !finite(camera.y) || !finite(camera.scale) || camera.scale <= 0) return
    scene.camera = clampCamera(
      {
        x: camera.x,
        y: camera.y,
        scale: clamp(camera.scale, 0.02, 12),
        viewWidth: finite(camera.viewWidth) ? Math.max(1, camera.viewWidth) : scene.camera.viewWidth,
        viewHeight: finite(camera.viewHeight) ? Math.max(1, camera.viewHeight) : scene.camera.viewHeight
      },
      scene.width,
      scene.height
    )
    this.emit(true)
  }

  private updateGrid(sceneId: string, grid: GridSettings): void {
    const scene = this.findScene(sceneId)
    if (!scene || scene.kind !== 'map') return
    if (!finite(grid.cellSize) || !finite(grid.offsetX) || !finite(grid.offsetY)) return
    const minCell = minimumCellSize(scene.width, scene.height)
    const next: GridSettings = {
      enabled: Boolean(grid.enabled),
      cellSize: clamp(grid.cellSize, minCell, Math.max(minCell, scene.width, scene.height)),
      offsetX: Math.round(grid.offsetX * 100) / 100,
      offsetY: Math.round(grid.offsetY * 100) / 100,
      color: typeof grid.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(grid.color) ? grid.color : scene.grid.color
    }
    const geometryChanged =
      next.cellSize !== scene.grid.cellSize ||
      next.offsetX !== scene.grid.offsetX ||
      next.offsetY !== scene.grid.offsetY
    scene.grid = next
    if (geometryChanged && !fogIsClear(scene.fog)) {
      scene.fog = { mode: 'covered' }
      this.status = 'Grid alignment changed, so revealed fog was cleared.'
    }
    const metrics = gridMetrics(scene.width, scene.height, scene.grid)
    if (metrics && metrics.count > 250_000) {
      scene.grid.cellSize = minCell
    }
    this.emit(true)
  }

  private paintFog(sceneId: string, cells: number[], mode: 'reveal' | 'hide'): void {
    const scene = this.findScene(sceneId)
    if (!scene || scene.kind !== 'map') return
    const metrics = gridMetrics(scene.width, scene.height, scene.grid)
    if (!metrics) return
    const safeCells = cells.filter((cell) => Number.isInteger(cell))
    scene.fog = applyFogPaint(scene.fog, metrics.count, safeCells, mode)
    this.emit(true)
  }

  private setFogMode(sceneId: string, mode: 'revealed' | 'covered'): void {
    const scene = this.findScene(sceneId)
    if (!scene || scene.kind !== 'map') return
    scene.fog = { mode }
    this.emit(true)
  }

  private addToken(sceneId: string, x: number, y: number): void {
    const scene = this.findScene(sceneId)
    if (!scene || scene.kind !== 'map' || !finite(x) || !finite(y)) return
    const snapped = snapToCell(x, y, scene.grid, scene.grid.enabled)
    const count = this.campaign.tokens.filter((token) => token.sceneId === sceneId).length
    const token: Token = {
      id: randomUUID(),
      sceneId,
      x: snapped.x,
      y: snapped.y,
      size: Math.max(24, scene.grid.cellSize * 0.92),
      label: `P${count + 1}`,
      color: TOKEN_COLORS[count % TOKEN_COLORS.length],
      imageFile: null,
      visibleToPlayers: true
    }
    this.campaign.tokens.push(token)
    this.emit(true)
  }

  private updateToken(command: Extract<Command, { type: 'updateToken' }>): void {
    const token = this.campaign.tokens.find((item) => item.id === command.tokenId)
    if (!token) return
    const scene = this.findScene(token.sceneId)
    if (!scene || !finite(command.x) || !finite(command.y) || !finite(command.size)) return
    const snapped = snapToCell(command.x, command.y, scene.grid, scene.grid.enabled)
    token.x = snapped.x
    token.y = snapped.y
    token.size = clamp(command.size, 16, Math.max(scene.width, scene.height))
    token.label = command.label.slice(0, 24)
    token.color = /^#[0-9a-fA-F]{6}$/.test(command.color) ? command.color : token.color
    token.visibleToPlayers = Boolean(command.visibleToPlayers)
    this.emit(true)
  }

  private deleteToken(tokenId: string): void {
    const token = this.campaign.tokens.find((item) => item.id === tokenId)
    if (!token) return
    this.campaign.tokens = this.campaign.tokens.filter((item) => item.id !== tokenId)
    void this.sweepAssets()
    this.emit(true)
  }

  private clearTokenImage(tokenId: string): void {
    const token = this.campaign.tokens.find((item) => item.id === tokenId)
    if (!token || !token.imageFile) return
    token.imageFile = null
    void this.sweepAssets()
    this.emit(true)
  }

  private ping(sceneId: string, x: number, y: number): void {
    if (!this.findScene(sceneId) || !finite(x) || !finite(y)) return
    this.pointer = { id: randomUUID(), sceneId, x, y, at: Date.now() }
    this.emit(false)
  }

  private findScene(sceneId: string): Scene | undefined {
    return this.campaign.scenes.find((scene) => scene.id === sceneId)
  }

  private emit(save: boolean): void {
    if (save) this.scheduleSave()
    this.listener?.()
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      void saveCampaign(this.paths.file, this.campaign).catch((error: unknown) => {
        console.error('Failed to save campaign', error)
      })
    }, 400)
  }

  private async sweepAssets(): Promise<void> {
    const used = new Set<string>()
    for (const scene of this.campaign.scenes) used.add(scene.assetFile)
    for (const token of this.campaign.tokens) {
      if (token.imageFile) used.add(token.imageFile)
    }
    const files = await readdir(this.paths.assets).catch(() => [] as string[])
    await Promise.all(
      files
        .filter((file) => !used.has(file))
        .map((file) => rm(join(this.paths.assets, file), { force: true }))
    )
  }
}

function sceneName(filePath: string): string {
  const name = basename(filePath, extname(filePath)).trim()
  return name.slice(0, 80) || 'Scene'
}
