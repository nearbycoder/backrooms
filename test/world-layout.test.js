import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CHUNK_SIZE,
  createLayout,
  getChunkCoordinates,
} from '../src/world-layout.js'

const samples = [
  [0, 0],
  [-1, 0],
  [0, -1],
  [1, 1],
  [-3, 5],
  [17, -9],
  [-401, -735],
  [1001, 230],
]
const step = 0.5
const width = CHUNK_SIZE / step

test('revisits rebuild the same chunk independently of discovery order', () => {
  const first = createLayout(4317)
  const second = createLayout(4317)
  const snapshots = samples.map(([cx, cz]) =>
    JSON.stringify(first.chunk(cx, cz)),
  )
  for (let i = samples.length - 1; i >= 0; i--) {
    const [cx, cz] = samples[i]
    assert.equal(JSON.stringify(second.chunk(cx, cz)), snapshots[i])
    const { x, z } = second.chunk(cx, cz)
    assert.deepEqual(getChunkCoordinates(x + 0.1, z + 0.1), { cx, cz })
    assert.deepEqual(
      getChunkCoordinates(x + CHUNK_SIZE - 0.1, z + CHUNK_SIZE - 0.1),
      { cx, cz },
    )
  }
  const other = createLayout(1981)
  assert.ok(
    samples.some(
      ([cx, cz]) =>
        JSON.stringify(first.chunk(cx, cz).walls) !==
        JSON.stringify(other.chunk(cx, cz).walls),
    ),
  )
})

function checkConnectivity(layout, cx, cz) {
  const { x, z, portals } = layout.chunk(cx, cz)
  const boundaries = [
    [portals.north, 0, 0, -1, 'south'],
    [CHUNK_SIZE, portals.east, 1, 0, 'west'],
    [portals.south, CHUNK_SIZE, 0, 1, 'north'],
    [0, portals.west, -1, 0, 'east'],
  ]
  for (const [px, pz, dx, dz, opposite] of boundaries) {
    assert.equal(
      layout.chunk(cx + dx, cz + dz).portals[opposite],
      dx === 0 ? px : pz,
    )
    for (const offset of [-0.6, 0, 0.6]) {
      assert.ok(
        layout.canStand(x + px + dx * offset, z + pz + dz * offset),
        'blocked chunk seam at ' + [cx, cz, px, pz],
      )
    }
  }
  // Flood-fill player-sized walkable samples inside this chunk. Each portal
  // must be reachable without leaving and re-entering through another chunk.
  const visited = new Uint8Array(width * width)
  const cells = []
  const portalCell = ([px, pz]) => {
    const index = (coordinate) =>
      Math.min(width - 1, Math.max(0, Math.floor(coordinate / step)))
    return index(pz) * width + index(px)
  }
  const start = portalCell(boundaries[0])
  visited[start] = 1
  cells.push(start)
  for (let i = 0; i < cells.length; i++) {
    const gx = cells[i] % width
    const gz = Math.floor(cells[i] / width)
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = gx + dx,
        nz = gz + dz,
        index = nz * width + nx
      if (nx < 0 || nz < 0 || nx >= width || nz >= width || visited[index])
        continue
      if (layout.canStand(x + (nx + 0.5) * step, z + (nz + 0.5) * step)) {
        visited[index] = 1
        cells.push(index)
      }
    }
  }
  for (const edge of boundaries)
    assert.ok(visited[portalCell(edge)], 'isolated exit in chunk ' + [cx, cz])
}

test('all four matching seams are walkable and connected inside each sampled chunk', () => {
  for (const seed of [0, 81729, 0xffffffff]) {
    const layout = createLayout(seed)
    for (const [cx, cz] of samples) checkConnectivity(layout, cx, cz)
  }
})

test('old chunks regenerate after eviction and districts change the texture set', () => {
  const layout = createLayout('tape-205')
  const origin = layout.chunk(0, 0)
  const visited = new Map()
  for (let x = -512; x <= 512; x++) {
    const chunk = layout.chunk(x, Math.trunc(x / 3))
    const { id, wall, ceiling, floor } = layout.getArea(
      chunk.x + 1,
      chunk.z + 1,
    )
    visited.set(id, { wall, ceiling, floor })
  }
  assert.ok(layout.cacheSize <= 128)
  assert.notStrictEqual(layout.chunk(0, 0), origin)
  assert.deepEqual(layout.chunk(0, 0), origin)
  for (const material of ['wall', 'floor', 'ceiling']) {
    assert.equal(
      new Set([...visited.values()].map((area) => area[material])).size,
      4,
    )
  }
})
