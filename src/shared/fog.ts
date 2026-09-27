import type { Fog } from '@shared/types'

function uniqueSorted(cells: Iterable<number>): number[] {
  return [...new Set(cells)].sort((a, b) => a - b)
}

export function applyFogPaint(
  fog: Fog,
  cellCount: number,
  cells: number[],
  mode: 'reveal' | 'hide'
): Fog {
  const paint = cells.filter((cell) => cell >= 0 && cell < cellCount)
  if (paint.length === 0 || cellCount <= 0) return fog

  if (mode === 'reveal') {
    if (fog.mode === 'revealed') return fog
    if (fog.mode === 'covered') return { mode: 'partial', cells: uniqueSorted(paint) }
    const next = uniqueSorted([...fog.cells, ...paint])
    if (next.length >= cellCount) return { mode: 'revealed' }
    return { mode: 'partial', cells: next }
  }

  if (fog.mode === 'covered') return fog
  const hidden = new Set(paint)
  const source =
    fog.mode === 'revealed' ? Array.from({ length: cellCount }, (_, index) => index) : fog.cells
  const next = source.filter((cell) => !hidden.has(cell))
  if (next.length === 0) return { mode: 'covered' }
  if (next.length >= cellCount) return { mode: 'revealed' }
  return { mode: 'partial', cells: next }
}

export function fogIsClear(fog: Fog): boolean {
  return fog.mode === 'covered'
}
