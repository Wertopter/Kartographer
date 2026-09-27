import assert from 'node:assert/strict'
import { applyFogPaint } from '@shared/fog'
import { cellAt, gridMetrics, presentView, snapToCell } from '@shared/geometry'
import { toPlayerProjection } from '@shared/projection'
import type { Campaign, GridSettings } from '@shared/types'

const grid: GridSettings = {
  enabled: true,
  cellSize: 50,
  offsetX: 0,
  offsetY: 0,
  color: '#ffffff'
}

const metrics = gridMetrics(100, 100, grid)
assert.equal(metrics?.count, 4)
assert.equal(cellAt(25, 25, 100, 100, grid), 0)
assert.equal(cellAt(75, 75, 100, 100, grid), 3)
assert.equal(cellAt(-1, 10, 100, 100, grid), null)

const offsetGrid: GridSettings = { ...grid, offsetX: 10, offsetY: 0 }
assert.equal(cellAt(5, 10, 100, 50, offsetGrid), 0)

const snapped = snapToCell(10, 12, grid, true)
assert.equal(snapped.x, 25)
assert.equal(snapped.y, 25)
assert.deepEqual(snapToCell(10, 12, grid, false), { x: 10, y: 12 })

assert.deepEqual(applyFogPaint({ mode: 'covered' }, 4, [0, 1], 'reveal'), {
  mode: 'partial',
  cells: [0, 1]
})
assert.deepEqual(applyFogPaint({ mode: 'revealed' }, 4, [3], 'hide'), {
  mode: 'partial',
  cells: [0, 1, 2]
})
assert.deepEqual(applyFogPaint({ mode: 'partial', cells: [0, 1] }, 4, [0], 'hide'), {
  mode: 'partial',
  cells: [1]
})
assert.deepEqual(applyFogPaint({ mode: 'partial', cells: [0, 1, 2] }, 4, [3], 'reveal'), {
  mode: 'revealed'
})

const campaign: Campaign = {
  version: 1,
  name: 'Table',
  activeSceneId: 's',
  scenes: [
    {
      id: 's',
      name: 'Crypt',
      kind: 'map',
      assetFile: 'a.png',
      width: 100,
      height: 100,
      camera: { x: 50, y: 50, scale: 1, viewWidth: 200, viewHeight: 100 },
      grid,
      fog: { mode: 'partial', cells: [0] }
    }
  ],
  tokens: [
    {
      id: 'shown',
      sceneId: 's',
      x: 25,
      y: 25,
      size: 40,
      label: 'A',
      color: '#fff',
      imageFile: null,
      visibleToPlayers: true,
      libraryId: null,
      temporary: false
    },
    {
      id: 'in-fog',
      sceneId: 's',
      x: 75,
      y: 75,
      size: 40,
      label: 'B',
      color: '#fff',
      imageFile: 'secret.png',
      visibleToPlayers: true,
      libraryId: 'lib-b',
      temporary: false
    },
    {
      id: 'hidden',
      sceneId: 's',
      x: 25,
      y: 25,
      size: 40,
      label: 'Secret',
      color: '#fff',
      imageFile: null,
      visibleToPlayers: false,
      libraryId: null,
      temporary: true
    }
  ],
  library: []
}

const projection = toPlayerProjection(
  campaign,
  { id: 'p', sceneId: 's', x: 75, y: 75, at: 1_000 },
  1_100
)
assert.equal(projection.scene?.fog.mode, 'partial')
if (projection.scene?.fog.mode === 'partial') {
  assert.deepEqual(projection.scene.fog.cells, [0])
}
assert.deepEqual(
  projection.tokens.map((token) => token.id),
  ['shown']
)
assert.equal(projection.pointer, null)
assert.equal(
  toPlayerProjection(campaign, { id: 'p2', sceneId: 's', x: 25, y: 25, at: 1_000 }, 1_100).pointer
    ?.id,
  'p2'
)

const handout = structuredClone(campaign)
handout.scenes[0].kind = 'handout'
const handoutView = toPlayerProjection(handout, { id: 'p', sceneId: 's', x: 10, y: 10, at: 1_000 }, 1_100)
assert.equal(handoutView.scene?.fog.mode, 'none')
assert.equal(handoutView.tokens.length, 0)
assert.equal(handoutView.pointer?.id, 'p')

const framed = presentView({ x: 0, y: 0, scale: 1, viewWidth: 200, viewHeight: 100 }, 400, 100, 'follow')
assert.equal(framed.camera.scale, 1)
assert.equal(framed.letterbox.width, 200)
assert.equal(framed.letterbox.x, 100)
assert.equal(framed.letterbox.y, 0)

console.log('selfcheck ok')
