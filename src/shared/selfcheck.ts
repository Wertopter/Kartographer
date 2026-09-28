import assert from 'node:assert/strict'
import { applyFogPaint } from '@shared/fog'
import { cellAt, gridMetrics, presentView, snapToCell } from '@shared/geometry'
import { toPlayerProjection } from '@shared/projection'
import { normalizeSoundtrack, parseSoundtrackUrl } from '@shared/soundtrack'
import type { Campaign, GridSettings } from '@shared/types'

const grid: GridSettings = {
  enabled: true,
  shape: 'square',
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

const pointy: GridSettings = { ...grid, shape: 'pointy', cellSize: 70, offsetX: 0, offsetY: 0 }
const pointyNear = cellAt(10, 30, 400, 400, pointy)
const pointyEast = cellAt(70, 30, 400, 400, pointy)
assert.notEqual(pointyNear, null)
assert.notEqual(pointyEast, null)
assert.notEqual(pointyNear, pointyEast)
const pointyCenter = snapToCell(70, 30, pointy, true)
assert.ok(Math.abs(pointyCenter.x - 70) < 0.01)
assert.ok(Math.abs(pointyCenter.y) < 0.01)

const flat: GridSettings = { ...grid, shape: 'flat', cellSize: 80, offsetX: 40, offsetY: 40 }
assert.deepEqual(snapToCell(40, 40, flat, true), { x: 40, y: 40 })
assert.notEqual(cellAt(40, 40, 400, 400, flat), cellAt(120, 40, 400, 400, flat))

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
  library: [],
  soundtrack: normalizeSoundtrack(undefined)
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

assert.equal(normalizeSoundtrack(undefined).length, 8)
const grown = normalizeSoundtrack([
  { url: '  https://youtu.be/dQw4w9WgXcQ  ', volume: 140, title: '  Tavern ambience  ' }
])
assert.equal(grown[0]?.volume, 100)
assert.equal(grown[0]?.title, 'Tavern ambience')
assert.equal(grown[0]?.url, 'https://youtu.be/dQw4w9WgXcQ')
assert.equal(grown[7]?.url, '')
assert.equal(grown[7]?.title, '')
assert.equal(normalizeSoundtrack([{ url: 'https://youtu.be/dQw4w9WgXcQ', volume: Number.NaN }])[0]?.volume, 80)
assert.equal(normalizeSoundtrack([{ title: 'x'.repeat(80) }])[0]?.title.length, 60)
assert.deepEqual(parseSoundtrackUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=abc'), {
  videoId: 'dQw4w9WgXcQ',
  playlistId: null
})
assert.deepEqual(parseSoundtrackUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLabcdefghijklmnop'), {
  videoId: 'dQw4w9WgXcQ',
  playlistId: 'PLabcdefghijklmnop'
})
assert.deepEqual(parseSoundtrackUrl('https://www.youtube.com/playlist?list=PLabcdefghijklmnop'), {
  videoId: null,
  playlistId: 'PLabcdefghijklmnop'
})
assert.deepEqual(parseSoundtrackUrl('https://youtu.be/dQw4w9WgXcQ?list=PLabcdefghijklmnop'), {
  videoId: 'dQw4w9WgXcQ',
  playlistId: 'PLabcdefghijklmnop'
})
assert.deepEqual(parseSoundtrackUrl('https://www.youtube.com/embed/videoseries?list=PLabcdefghijklmnop'), {
  videoId: null,
  playlistId: 'PLabcdefghijklmnop'
})
assert.deepEqual(parseSoundtrackUrl('https://youtu.be/dQw4w9WgXcQ'), {
  videoId: 'dQw4w9WgXcQ',
  playlistId: null
})
assert.deepEqual(parseSoundtrackUrl('https://www.youtube.com/embed/dQw4w9WgXcQ'), {
  videoId: 'dQw4w9WgXcQ',
  playlistId: null
})
assert.deepEqual(parseSoundtrackUrl('https://music.youtube.com/watch?v=dQw4w9WgXcQ'), {
  videoId: 'dQw4w9WgXcQ',
  playlistId: null
})
assert.equal(parseSoundtrackUrl(''), null)
assert.equal(parseSoundtrackUrl('https://vimeo.com/123'), null)
assert.equal(parseSoundtrackUrl('https://open.spotify.com/track/6rqhFgbbKwnb9MLmUQDhG6'), null)

console.log('selfcheck ok')
