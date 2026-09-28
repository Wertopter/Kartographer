import { randomUUID } from 'crypto'
import { nativeImage } from 'electron'
import { access, copyFile, mkdir, readdir, rm, stat } from 'fs/promises'
import { basename, extname, join, resolve } from 'path'
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
  RecentCampaign,
  Scene,
  Token
} from '@shared/types'
import { TOKEN_COLORS } from '@shared/types'
import { normalizeSoundtrack } from '@shared/soundtrack'
import { assetUrl, toPlayerProjection } from '@shared/projection'
import {
  campaignPaths,
  createCampaign,
  describeCampaignFolder,
  libraryFile,
  loadCampaign,
  loadLibrary,
  saveCampaign,
  saveLibrary,
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
  private paths: CampaignPaths | null = null
  private recentFolders: string[] = []
  private recent: RecentCampaign[] = []
  private readonly libraryPath: string
  private readonly legacyCampaign: string
  private readonly stagedImages = new Set<string>()

  constructor(userData: string) {
    this.libraryPath = libraryFile(userData)
    this.legacyCampaign = join(userData, 'campaign')
  }

  get assetDirectory(): string {
    return this.paths?.assets ?? ''
  }

  get campaignFile(): string {
    return this.paths?.file ?? ''
  }

  setListener(listener: () => void): void {
    this.listener = listener
  }

  async init(): Promise<void> {
    this.recentFolders = await loadLibrary(this.libraryPath)
    if (this.recentFolders.length === 0 && (await fileExists(join(this.legacyCampaign, 'campaign.json')))) {
      this.recentFolders = [this.legacyCampaign]
      await saveLibrary(this.libraryPath, this.recentFolders)
    }
    await this.refreshRecent()
    const existing = await this.firstExistingFolder()
    if (existing) await this.openCampaignFolder(existing, false)
  }

  async flush(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    if (!this.paths) return
    await saveCampaign(this.paths.file, this.campaign)
  }

  async openCampaignFolder(folder: string, asNew: boolean): Promise<void> {
    const dir = resolve(folder)
    try {
      const info = await stat(dir)
      if (!info.isDirectory()) {
        this.status = 'Choose a folder for the campaign.'
        this.emit(false)
        return
      }
    } catch {
      this.status = 'That folder could not be opened.'
      this.emit(false)
      return
    }

    if (this.paths && samePath(this.paths.dir, dir)) return
    await this.flush()
    await this.discardStagedImages()
    this.pointer = null
    const paths = campaignPaths(dir)
    await mkdir(paths.assets, { recursive: true })
    const alreadySaved = await fileExists(paths.file)
    if (!alreadySaved) {
      this.campaign = createCampaign()
      this.campaign.name = basename(dir) || 'Campaign'
      await saveCampaign(paths.file, this.campaign)
      this.status = null
    } else {
      this.campaign = await loadCampaign(paths.file)
      this.status = asNew ? 'That folder already has a campaign, so it was opened.' : null
    }
    this.paths = paths
    this.remember(dir)
    await saveLibrary(this.libraryPath, this.recentFolders)
    await this.refreshRecent()
    this.emit(false)
  }

  async forgetCampaign(folder: string): Promise<void> {
    const dir = resolve(folder)
    if (this.paths && samePath(this.paths.dir, dir)) return
    this.recentFolders = this.recentFolders.filter((item) => !samePath(item, dir))
    await saveLibrary(this.libraryPath, this.recentFolders)
    await this.refreshRecent()
    this.emit(false)
  }

  getGmState(): GmState {
    const open = this.paths != null
    return {
      campaignOpen: open,
      campaignName: open ? this.campaign.name : '',
      campaignDir: this.paths?.dir ?? '',
      recentCampaigns: this.recent.map((item) =>
        this.paths && samePath(item.path, this.paths.dir)
          ? { ...item, name: this.campaign.name, missing: false }
          : item
      ),
      activeSceneId: open ? this.campaign.activeSceneId : null,
      scenes: open
        ? this.campaign.scenes.map((scene) => ({
            ...scene,
            imageUrl: assetUrl(scene.assetFile)
          }))
        : [],
      tokens: open
        ? this.campaign.tokens.map((token) => ({
            ...token,
            imageUrl: token.imageFile ? assetUrl(token.imageFile) : null
          }))
        : [],
      library: open
        ? this.campaign.library.map((token) => ({
            ...token,
            imageUrl: token.imageFile ? assetUrl(token.imageFile) : null
          }))
        : [],
      soundtrack: normalizeSoundtrack(open ? this.campaign.soundtrack : undefined),
      pointer: open ? this.pointer : null,
      displays: this.displays,
      playerWindowOpen: this.playerWindowOpen,
      status: this.status
    }
  }

  getPlayerProjection(): PlayerProjection {
    if (!this.paths) return { scene: null, tokens: [], pointer: null }
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
    if (!this.paths) return
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
        this.addToken(command)
        break
      case 'placeLibraryToken':
        this.placeLibraryToken(command.sceneId, command.x, command.y, command.libraryId)
        break
      case 'deleteLibraryToken':
        this.deleteLibraryToken(command.libraryId)
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
      case 'updateSoundtrack':
        this.updateSoundtrack(command.channels)
        break
      default: {
        const unreachable: never = command
        void unreachable
      }
    }
  }

  async importSceneFiles(filePaths: string[]): Promise<void> {
    if (!this.paths) {
      this.status = 'Choose a campaign folder before importing images.'
      this.emit(false)
      return
    }
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
    if (!this.paths) return
    const token = this.campaign.tokens.find((item) => item.id === tokenId)
    if (!token) return
    const assetFile = await this.copyImageAsset(sourcePath)
    if (!assetFile) return
    token.imageFile = assetFile
    await this.sweepAssets()
    this.status = null
    this.emit(true)
  }

  async stageTokenImage(sourcePath: string): Promise<string | null> {
    const assetFile = await this.copyImageAsset(sourcePath)
    if (assetFile) this.stagedImages.add(assetFile)
    return assetFile
  }

  async releaseStagedImage(file: string): Promise<void> {
    if (!this.stagedImages.has(file)) return
    this.stagedImages.delete(file)
    if (!this.paths || this.isAssetUsed(file)) return
    await rm(join(this.paths.assets, file), { force: true })
  }

  private updateSoundtrack(channels: Campaign['soundtrack']): void {
    this.campaign.soundtrack = normalizeSoundtrack(channels)
    this.emit(true)
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
    const shape = grid.shape === 'flat' || grid.shape === 'pointy' ? grid.shape : 'square'
    const next: GridSettings = {
      enabled: Boolean(grid.enabled),
      shape,
      cellSize: clamp(grid.cellSize, minCell, Math.max(minCell, scene.width, scene.height)),
      offsetX: Math.round(grid.offsetX * 100) / 100,
      offsetY: Math.round(grid.offsetY * 100) / 100,
      color: typeof grid.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(grid.color) ? grid.color : scene.grid.color
    }
    const alignmentChanged =
      next.cellSize !== scene.grid.cellSize ||
      next.offsetX !== scene.grid.offsetX ||
      next.offsetY !== scene.grid.offsetY
    scene.grid = next
    if (alignmentChanged && !fogIsClear(scene.fog)) {
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

  private addToken(command: Extract<Command, { type: 'addToken' }>): void {
    const scene = this.findScene(command.sceneId)
    if (!scene || scene.kind !== 'map' || !finite(command.x) || !finite(command.y)) return
    const appearance = this.appearanceFrom(command.label, command.color, command.imageFile, command.visibleToPlayers)
    let libraryId: string | null = null
    if (command.kind === 'new') {
      libraryId = randomUUID()
      this.campaign.library.push({ id: libraryId, ...appearance })
      this.stagedImages.delete(appearance.imageFile ?? '')
    }
    this.campaign.tokens.push(this.makeToken(scene, command.x, command.y, appearance, libraryId, command.kind === 'temporary'))
    if (command.kind === 'temporary' && appearance.imageFile) this.stagedImages.delete(appearance.imageFile)
    this.emit(true)
  }

  private placeLibraryToken(sceneId: string, x: number, y: number, libraryId: string): void {
    const scene = this.findScene(sceneId)
    const entry = this.campaign.library.find((token) => token.id === libraryId)
    if (!scene || scene.kind !== 'map' || !entry || !finite(x) || !finite(y)) {
      if (!entry) {
        this.status = 'Choose a token from the library first.'
        this.emit(false)
      }
      return
    }
    this.campaign.tokens.push(
      this.makeToken(
        scene,
        x,
        y,
        {
          label: entry.label,
          color: entry.color,
          imageFile: entry.imageFile,
          visibleToPlayers: entry.visibleToPlayers
        },
        entry.id,
        false
      )
    )
    this.emit(true)
  }

  private deleteLibraryToken(libraryId: string): void {
    if (!this.campaign.library.some((token) => token.id === libraryId)) return
    this.campaign.library = this.campaign.library.filter((token) => token.id !== libraryId)
    for (const token of this.campaign.tokens) {
      if (token.libraryId === libraryId) token.libraryId = null
    }
    void this.sweepAssets()
    this.emit(true)
  }

  private appearanceFrom(
    label: string,
    color: string,
    imageFile: string | null,
    visibleToPlayers: boolean
  ): { label: string; color: string; imageFile: string | null; visibleToPlayers: boolean } {
    const trimmed = label.trim().slice(0, 24)
    return {
      label: trimmed || 'Token',
      color: /^#[0-9a-fA-F]{6}$/.test(color) ? color : TOKEN_COLORS[0],
      imageFile: this.knownAsset(imageFile),
      visibleToPlayers: Boolean(visibleToPlayers)
    }
  }

  private makeToken(
    scene: Scene,
    x: number,
    y: number,
    appearance: { label: string; color: string; imageFile: string | null; visibleToPlayers: boolean },
    libraryId: string | null,
    temporary: boolean
  ): Token {
    const snapped = snapToCell(x, y, scene.grid, scene.grid.enabled)
    return {
      id: randomUUID(),
      sceneId: scene.id,
      x: snapped.x,
      y: snapped.y,
      size: Math.max(24, scene.grid.cellSize * 0.92),
      label: appearance.label,
      color: appearance.color,
      imageFile: appearance.imageFile,
      visibleToPlayers: appearance.visibleToPlayers,
      libraryId,
      temporary
    }
  }

  private knownAsset(file: string | null): string | null {
    if (!file || !/^[\w.-]+$/.test(file)) return null
    return file
  }

  private async copyImageAsset(sourcePath: string): Promise<string | null> {
    if (!this.paths) return null
    const extension = extname(sourcePath).toLowerCase()
    if (!IMAGE_EXTENSIONS.has(extension)) {
      this.status = 'Token images need to be PNG, JPEG, WebP, or GIF.'
      this.emit(false)
      return null
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
        return null
      }
      return assetFile
    } catch {
      this.status = 'Could not copy that token image.'
      this.emit(false)
      return null
    }
  }

  private async discardStagedImages(): Promise<void> {
    const paths = this.paths
    const staged = [...this.stagedImages]
    this.stagedImages.clear()
    if (!paths) return
    await Promise.all(
      staged.filter((file) => !this.isAssetUsed(file)).map((file) => rm(join(paths.assets, file), { force: true }))
    )
  }

  private isAssetUsed(file: string): boolean {
    if (this.campaign.scenes.some((scene) => scene.assetFile === file)) return true
    if (this.campaign.tokens.some((token) => token.imageFile === file)) return true
    return this.campaign.library.some((token) => token.imageFile === file)
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
      const paths = this.paths
      if (!paths) return
      void saveCampaign(paths.file, this.campaign).catch((error: unknown) => {
        console.error('Failed to save campaign', error)
      })
    }, 400)
  }

  private async sweepAssets(): Promise<void> {
    const paths = this.paths
    if (!paths) return
    const used = new Set<string>()
    for (const scene of this.campaign.scenes) used.add(scene.assetFile)
    for (const token of this.campaign.tokens) {
      if (token.imageFile) used.add(token.imageFile)
    }
    for (const token of this.campaign.library) {
      if (token.imageFile) used.add(token.imageFile)
    }
    const files = await readdir(paths.assets).catch(() => [] as string[])
    await Promise.all(
      files
        .filter((file) => !used.has(file) && !this.stagedImages.has(file))
        .map((file) => rm(join(paths.assets, file), { force: true }))
    )
  }

  private remember(dir: string): void {
    this.recentFolders = [dir, ...this.recentFolders.filter((item) => !samePath(item, dir))].slice(0, 20)
  }

  private async refreshRecent(): Promise<void> {
    this.recent = await Promise.all(
      this.recentFolders.map(async (folder) => {
        const described = await describeCampaignFolder(folder)
        return { path: folder, ...described }
      })
    )
  }

  private async firstExistingFolder(): Promise<string | null> {
    for (const folder of this.recentFolders) {
      try {
        const info = await stat(folder)
        if (info.isDirectory()) return folder
      } catch {
        // Skip folders that were moved or deleted.
      }
    }
    return null
  }
}

function sceneName(filePath: string): string {
  const name = basename(filePath, extname(filePath)).trim()
  return name.slice(0, 80) || 'Scene'
}

function samePath(left: string, right: string): boolean {
  const a = resolve(left)
  const b = resolve(right)
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b
}

async function fileExists(file: string): Promise<boolean> {
  try {
    await access(file)
    return true
  } catch {
    return false
  }
}
