import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Camera, GmState, GmToken, GridSettings, SoundtrackChannel } from '@shared/types'
import { TOKEN_COLORS } from '@shared/types'
import { CampaignList } from '@renderer/gm/CampaignList'
import { GridPanel } from '@renderer/gm/GridPanel'
import { SceneList } from '@renderer/gm/SceneList'
import { TokenInspector } from '@renderer/gm/TokenInspector'
import { TokenPlacePanel, type TokenPlaceMode } from '@renderer/gm/TokenPlacePanel'
import { SoundtrackMixer } from '@renderer/gm/SoundtrackMixer'
import { Toolbar } from '@renderer/gm/Toolbar'
import { isTypingTarget, type Tool } from '@renderer/tools'
import { throttle } from '@renderer/throttle'
import { MapViewport } from '@renderer/viewport/MapViewport'

function useGmState(): GmState | null {
  const [state, setState] = useState<GmState | null>(null)
  useEffect(() => {
    let live = false
    const unsubscribe = window.kartographer.onState((next) => {
      live = true
      setState(next)
    })
    void window.kartographer.getState().then((next) => {
      if (!live && next) setState(next)
    })
    return unsubscribe
  }, [])
  return state
}

export function GmApp(): React.JSX.Element {
  const state = useGmState()
  const [tool, setTool] = useState<Tool>('pan')
  const [calibrate, setCalibrate] = useState<'slide' | 'cell'>('slide')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [displayId, setDisplayId] = useState<number | null>(null)
  const [campaignName, setCampaignName] = useState('')
  const [tokenMode, setTokenMode] = useState<TokenPlaceMode>('new')
  const [tokenLabel, setTokenLabel] = useState('')
  const [tokenColor, setTokenColor] = useState<string>(TOKEN_COLORS[0])
  const [tokenVisible, setTokenVisible] = useState(true)
  const [tokenImage, setTokenImage] = useState<string | null>(null)
  const [libraryPick, setLibraryPick] = useState<string | null>(null)
  const [gmTab, setGmTab] = useState<'map' | 'soundtrack'>('map')

  const scene = state?.scenes.find((item) => item.id === state.activeSceneId) ?? null
  const sceneIdRef = useRef<string | null>(null)
  const tokensRef = useRef<GmToken[]>([])
  sceneIdRef.current = scene?.id ?? null
  tokensRef.current = state?.tokens ?? []

  useEffect(() => setCampaignName(state?.campaignName ?? ''), [state?.campaignName])
  useEffect(() => setSelectedId(null), [scene?.id])
  useEffect(() => {
    setTokenImage((current) => {
      if (current) void window.kartographer.releaseStagedImage(current)
      return null
    })
    setLibraryPick(null)
    setTokenLabel('')
  }, [state?.campaignDir])
  useEffect(() => {
    if (selectedId && state && !state.tokens.some((token) => token.id === selectedId)) setSelectedId(null)
  }, [selectedId, state])

  useEffect(() => {
    if (!state) return
    setDisplayId((current) => {
      if (current != null && state.displays.some((display) => display.id === current)) return current
      return state.displays.find((display) => !display.primary)?.id ?? state.displays[0]?.id ?? null
    })
  }, [state])

  const sendCamera = useMemo(
    () =>
      throttle((camera: Camera) => {
        const sceneId = sceneIdRef.current
        if (!sceneId) return
        void window.kartographer.command({ type: 'updateCamera', sceneId, camera })
      }, 32),
    []
  )
  const sendPaint = useMemo(
    () =>
      throttle((cells: number[], mode: 'reveal' | 'hide') => {
        const sceneId = sceneIdRef.current
        if (!sceneId) return
        void window.kartographer.command({ type: 'paintFog', sceneId, cells, mode })
      }, 40),
    []
  )
  const sendMove = useMemo(
    () =>
      throttle((tokenId: string, x: number, y: number) => {
        const token = tokensRef.current.find((item) => item.id === tokenId)
        if (!token) return
        void window.kartographer.command({
          type: 'updateToken',
          tokenId,
          x,
          y,
          size: token.size,
          label: token.label,
          color: token.color,
          visibleToPlayers: token.visibleToPlayers
        })
      }, 32),
    []
  )
  const sendGrid = useMemo(
    () =>
      throttle((grid: GridSettings) => {
        const sceneId = sceneIdRef.current
        if (!sceneId) return
        void window.kartographer.command({ type: 'updateGrid', sceneId, grid })
      }, 40),
    []
  )
  const endInteraction = useCallback(() => {
    sendCamera.flush()
    sendPaint.flush()
    sendMove.flush()
    sendGrid.flush()
  }, [sendCamera, sendGrid, sendMove, sendPaint])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return
      const next: Partial<Record<string, Tool>> = {
        v: 'pan',
        p: 'pointer',
        r: 'reveal',
        h: 'hide',
        t: 'token',
        g: 'grid',
        m: 'ruler'
      }
      const toolKey = next[event.key.toLowerCase()]
      if (!toolKey) return
      event.preventDefault()
      setTool(toolKey)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (isTypingTarget(event.target)) return
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId) {
        event.preventDefault()
        void window.kartographer.command({ type: 'deleteToken', tokenId: selectedId })
      }
      if (event.key === 'Escape') setSelectedId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId])

  if (!state) {
    return (
      <div className="boot">
        <p className="wordmark">Kartographer</p>
        <p>Opening Kartographer…</p>
      </div>
    )
  }

  const mapTools = scene?.kind === 'map'
  const activeTool = mapTools || tool === 'pan' || tool === 'pointer' ? tool : 'pan'
  const sceneTokens = scene && mapTools ? state.tokens.filter((token) => token.sceneId === scene.id) : []
  const selected = sceneTokens.find((token) => token.id === selectedId) ?? null
  const multipleDisplays = state.displays.length > 1
  const selectedDisplay = state.displays.find((display) => display.id === displayId) ?? null

  return (
    <div className="gm-app">
      <aside className="sidebar">
        <div className="brand">
          <p className="wordmark">Kartographer</p>
          {state.campaignOpen && (
            <input
              aria-label="Campaign name"
              value={campaignName}
              onChange={(event) => setCampaignName(event.target.value)}
              onBlur={() => {
                if (campaignName.trim() && campaignName !== state.campaignName) {
                  void window.kartographer.command({ type: 'renameCampaign', name: campaignName })
                }
              }}
            />
          )}
        </div>
        <CampaignList
          currentPath={state.campaignDir}
          campaigns={state.recentCampaigns}
          onCreate={() => void window.kartographer.createCampaignFolder()}
          onBrowse={() => void window.kartographer.openCampaignFolder()}
          onOpen={(folder) => void window.kartographer.switchCampaign(folder)}
          onForget={(folder) => void window.kartographer.forgetCampaign(folder)}
        />
        <div className="sidebar-head">
          <h2>Scenes</h2>
          <button
            type="button"
            className="primary"
            disabled={!state.campaignOpen}
            onClick={() => void window.kartographer.importScenes()}
          >
            Import
          </button>
        </div>
        {!state.campaignOpen ? (
          <p className="empty-copy">Open a campaign folder to add scenes.</p>
        ) : state.scenes.length === 0 ? (
          <p className="empty-copy">Import a battle map, handout, or splash image. Maps start covered in fog.</p>
        ) : (
          <SceneList
            scenes={state.scenes}
            activeSceneId={state.activeSceneId}
            onActivate={(sceneId) => void window.kartographer.command({ type: 'setActiveScene', sceneId })}
            onRename={(sceneId, name) => void window.kartographer.command({ type: 'renameScene', sceneId, name })}
            onDelete={(sceneId) => void window.kartographer.command({ type: 'deleteScene', sceneId })}
            onKind={(sceneId, kind) => void window.kartographer.command({ type: 'setSceneKind', sceneId, kind })}
          />
        )}
      </aside>
      <section className="stage">
        <div className="stage-tabs" role="tablist" aria-label="GM view">
          <button type="button" role="tab" aria-selected={gmTab === 'map'} onClick={() => setGmTab('map')}>
            Map
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={gmTab === 'soundtrack'}
            onClick={() => setGmTab('soundtrack')}
          >
            Soundtrack
          </button>
        </div>
        {gmTab === 'map' ? (
          <Toolbar
            tool={activeTool}
            mapTools={Boolean(mapTools)}
            onTool={setTool}
            onRevealAll={() => {
              if (scene) void window.kartographer.command({ type: 'revealAll', sceneId: scene.id })
            }}
            onCoverAll={() => {
              if (scene) void window.kartographer.command({ type: 'coverAll', sceneId: scene.id })
            }}
          />
        ) : null}
        <div className="stage-body">
          <div className="map-pane stage-pane" hidden={gmTab !== 'map'}>
          {!state.campaignOpen ? (
            <div className="viewport-empty">
              <p className="wordmark">Choose a campaign</p>
              <p>Give each campaign its own folder. That folder keeps the maps, fog, and tokens.</p>
              <div className="campaign-actions">
                <button type="button" className="primary" onClick={() => void window.kartographer.createCampaignFolder()}>
                  New folder…
                </button>
                <button type="button" onClick={() => void window.kartographer.openCampaignFolder()}>
                  Open folder…
                </button>
              </div>
            </div>
          ) : scene ? (
            <MapViewport
              role="gm"
              sceneId={scene.id}
              imageUrl={scene.imageUrl}
              imageWidth={scene.width}
              imageHeight={scene.height}
              camera={scene.camera}
              grid={scene.grid}
              showGrid={mapTools === true && scene.grid.enabled}
              fog={scene.fog}
              fogStyle={mapTools ? 'dim' : 'none'}
              tokens={sceneTokens.map((token) => ({
                id: token.id,
                x: token.x,
                y: token.y,
                size: token.size,
                label: token.label,
                color: token.color,
                imageUrl: token.imageUrl,
                hiddenFromPlayers: !token.visibleToPlayers
              }))}
              selectedTokenId={selected?.id ?? null}
              pointer={state.pointer?.sceneId === scene.id ? state.pointer : null}
              tool={activeTool}
              calibrate={calibrate}
              onCamera={sendCamera}
              onPaint={sendPaint}
              onPointer={(x, y) => void window.kartographer.command({ type: 'pointer', sceneId: scene.id, x, y })}
              onPlaceToken={(x, y) => {
                if (tokenMode === 'existing') {
                  if (!libraryPick) return
                  void window.kartographer.command({
                    type: 'placeLibraryToken',
                    sceneId: scene.id,
                    x,
                    y,
                    libraryId: libraryPick
                  })
                  return
                }
                void window.kartographer.command({
                  type: 'addToken',
                  sceneId: scene.id,
                  x,
                  y,
                  kind: tokenMode,
                  label: tokenLabel,
                  color: tokenColor,
                  imageFile: tokenImage,
                  visibleToPlayers: tokenVisible
                })
              }}
              onMoveToken={sendMove}
              onSelectToken={setSelectedId}
              onGridOffset={(offsetX, offsetY) => sendGrid({ ...scene.grid, offsetX, offsetY })}
              onCellSize={(cellSize) => sendGrid({ ...scene.grid, cellSize })}
              onInteractionEnd={endInteraction}
            />
          ) : (
            <div className="viewport-empty">
              <p className="wordmark">No scene yet</p>
              <p>Import an image to put it on the player view.</p>
              <button type="button" className="primary" onClick={() => void window.kartographer.importScenes()}>
                Import images
              </button>
            </div>
          )}
          {(scene && mapTools && (activeTool === 'grid' || activeTool === 'token')) || selected ? (
            <div className="settings-dock">
              {scene && mapTools && activeTool === 'grid' && (
                <GridPanel
                  grid={scene.grid}
                  imageWidth={scene.width}
                  imageHeight={scene.height}
                  calibrate={calibrate}
                  onCalibrate={setCalibrate}
                  onChange={sendGrid}
                />
              )}
              {scene && mapTools && activeTool === 'token' && (
                <TokenPlacePanel
                  mode={tokenMode}
                  onMode={setTokenMode}
                  label={tokenLabel}
                  onLabel={setTokenLabel}
                  color={tokenColor}
                  onColor={setTokenColor}
                  visible={tokenVisible}
                  onVisible={setTokenVisible}
                  imageFile={tokenImage}
                  onChooseImage={() => {
                    void window.kartographer.stageTokenImage().then((file) => {
                      if (!file) return
                      setTokenImage((current) => {
                        if (current && current !== file) void window.kartographer.releaseStagedImage(current)
                        return file
                      })
                    })
                  }}
                  onClearImage={() => {
                    setTokenImage((current) => {
                      if (current) void window.kartographer.releaseStagedImage(current)
                      return null
                    })
                  }}
                  library={state.library}
                  selectedLibraryId={libraryPick}
                  onSelectLibrary={setLibraryPick}
                  onDeleteLibrary={(libraryId) => {
                    if (libraryPick === libraryId) setLibraryPick(null)
                    void window.kartographer.command({ type: 'deleteLibraryToken', libraryId })
                  }}
                />
              )}
              {selected && (
                <TokenInspector
                  token={selected}
                  onChange={(token) =>
                    void window.kartographer.command({
                      type: 'updateToken',
                      tokenId: token.id,
                      x: token.x,
                      y: token.y,
                      size: token.size,
                      label: token.label,
                      color: token.color,
                      visibleToPlayers: token.visibleToPlayers
                    })
                  }
                  onDelete={(tokenId) => void window.kartographer.command({ type: 'deleteToken', tokenId })}
                  onChooseImage={(tokenId) => void window.kartographer.chooseTokenImage(tokenId)}
                  onClearImage={(tokenId) => void window.kartographer.command({ type: 'clearTokenImage', tokenId })}
                />
              )}
            </div>
          ) : null}
          </div>
          <SoundtrackMixer
            channels={state.soundtrack}
            disabled={!state.campaignOpen}
            parked={gmTab !== 'soundtrack'}
            onChange={(channels: SoundtrackChannel[]) => {
              void window.kartographer.command({ type: 'updateSoundtrack', channels })
            }}
          />
        </div>
      </section>
      <footer className="statusbar">
        <div className="status-group">
          <label>
            Player display
            <select
              value={displayId ?? ''}
              onChange={(event) => setDisplayId(event.target.value === '' ? null : Number(event.target.value))}
            >
              {state.displays.map((display) => (
                <option key={display.id} value={display.id}>
                  {display.label}
                </option>
              ))}
            </select>
          </label>
          {multipleDisplays ? (
            <button
              type="button"
              className="primary"
              disabled={displayId == null}
              onClick={() => void window.kartographer.openPlayerWindow(displayId)}
            >
              Send to display
            </button>
          ) : (
            <button type="button" className="primary" onClick={() => void window.kartographer.openPlayerWindow(null)}>
              Open player view
            </button>
          )}
          {multipleDisplays && (
            <button type="button" onClick={() => void window.kartographer.openPlayerWindow(null)}>
              Open in a window
            </button>
          )}
          {state.playerWindowOpen && (
            <button type="button" onClick={() => void window.kartographer.closePlayerWindow()}>
              Close player view
            </button>
          )}
        </div>
        <p className="status-note">
          {selectedDisplay?.primary && multipleDisplays
            ? 'That display is the main screen. Sending the player view there covers this window.'
            : 'Players see revealed map cells, visible tokens, and pointer pings.'}
          {state.status ? ` ${state.status}` : ''}
        </p>
        <button
          type="button"
          className="path"
          title={state.campaignDir}
          disabled={!state.campaignOpen}
          onClick={() => void window.kartographer.revealCampaign()}
        >
          Show campaign folder
        </button>
      </footer>
    </div>
  )
}
