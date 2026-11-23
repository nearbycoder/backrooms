// World generation is independent of Three.js. Everything in a chunk is a pure
// function of its coordinates and the expedition seed, including shared doors.
export const CHUNK_SIZE = 24
export const HEIGHT = 3.12
const HALF = CHUNK_SIZE / 2
const PLAYER_RADIUS = 0.25
const CACHE_LIMIT = 128

export const AREAS = {
  yellow: {
    id: 'yellow',
    name: 'The Lobby',
    wall: 'wall_yellow_pattern',
    worn: 'wall_yellow_pattern_damaged',
    floor: 'carpet_green_detail',
    ceiling: 'ceiling_medium',
    tint: [1.32, 1.14, 0.65],
  },
  office: {
    id: 'office',
    name: 'Office Annex',
    wall: 'wall_blue_stripes_panel',
    worn: 'wall_blue_stripes_panel_damaged',
    floor: 'carpet_red_detail',
    ceiling: 'ceiling_small',
    tint: [0.88, 1.08, 1.13],
  },
  maintenance: {
    id: 'maintenance',
    name: 'Maintenance',
    wall: 'wall_concrete',
    worn: 'wall_concrete_dirt',
    floor: 'wall_concrete_small',
    ceiling: 'ceiling_large',
    tint: [1.34, 0.96, 0.66],
  },
  pool: {
    id: 'pool',
    name: 'Poolrooms',
    wall: 'pool_wall',
    worn: 'pool_wall_uneven_dirt',
    floor: 'pool_tiles_medium',
    ceiling: 'pool_tiles_small',
    tint: [0.78, 1.23, 1.24],
  },
}
const palette = Object.values(AREAS)

function seedHash(seed) {
  let h = 2166136261
  for (const char of String(seed ?? 0))
    h = Math.imul(h ^ char.charCodeAt(0), 16777619)
  return h >>> 0
}

function hash(seed, x, z, tag = 0) {
  let h =
    seed ^
    Math.imul(x, 0x85ebca6b) ^
    Math.imul(z, 0xc2b2ae35) ^
    Math.imul(tag, 0x27d4eb2d)
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d)
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b)
  return (h ^ (h >>> 16)) >>> 0
}

function random(seed) {
  let n = seed
  return () => {
    n = (n + 0x6d2b79f5) >>> 0
    let t = Math.imul(n ^ (n >>> 15), n | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function getChunkCoordinates(x, z) {
  return {
    cx: Math.floor((x + HALF) / CHUNK_SIZE),
    cz: Math.floor((z + HALF) / CHUNK_SIZE),
  }
}

const entryWalls = [
  [-3.72, 2.7, -3.2, 10.6],
  [-8.7, 2.7, -3.72, 3.02],
  [2.45, 0.6, 4, 3.65],
  [4, 0.6, 8.65, 1.02],
  [8.25, 1.02, 8.65, 7.5],
  [-10.55, 6.7, -7.1, 7.1],
  [-7.5, 7.1, -7.1, 10.3],
  [-3.05, -4.65, -2.5, -1.25],
  [-7.9, -4.65, -3.05, -4.12],
  [-8.3, -6.5, -7.9, 0.85],
  [-3.9, -10.6, -3.45, -7.4],
  [2.54, -7.15, 3.48, -4],
  [3.48, -7.15, 8.8, -6.68],
  [8.4, -6.68, 8.8, -2],
  [4.1, -10.5, 7.52, -10.05],
]
const entryLights = [
  [-0.65, 6.55, 0.78, 1],
  [1.1, 3, 1.8, 1],
  [-0.85, -2.75, 0.66, 1],
  [1.15, -7.55, 1.2, 1],
  [-5.8, 0.5, 0.68, 0],
  [-7, 5.45, 0.88, 1],
  [-10.1, -3.8, 0.6, 0],
  [-6.3, -8.6, 0.94, 1],
  [6.6, 4.2, 0.83, 0],
  [10.1, 8.6, 0.65, 1],
  [5.65, -2.6, 0.87, 1],
  [10.45, -9.2, 0.84, 0],
]

function interior(chunk, rng) {
  // A randomized spanning tree connects the sixteen rooms. Additional open
  // edges form loops and suites; jambs and variable bay widths shape doorways.
  const cuts = () => [0, ...[6, 12, 18].map((n) => n + (rng() - 0.5) * 2.5), 24]
  const xs = cuts(),
    zs = cuts()
  const edges = []
  for (let j = 0; j < 4; j++)
    for (let i = 0; i < 4; i++) {
      const a = j * 4 + i
      if (i < 3)
        edges.push({
          a,
          b: a + 1,
          vertical: true,
          at: xs[i + 1],
          lo: zs[j],
          hi: zs[j + 1],
          rank: rng(),
        })
      if (j < 3)
        edges.push({
          a,
          b: a + 4,
          vertical: false,
          at: zs[j + 1],
          lo: xs[i],
          hi: xs[i + 1],
          rank: rng(),
        })
    }
  const parents = Array.from({ length: 16 }, (_, i) => i)
  function root(i) {
    while (parents[i] !== i) i = parents[i]
    return i
  }
  const width = chunk.area.id === 'maintenance' ? 0.24 : 0.38
  const openness = chunk.area.id === 'pool' ? 0.54 : 0.28 + rng() * 0.24
  for (const edge of edges.sort((a, b) => a.rank - b.rank)) {
    const { a, b, vertical, at, lo, hi } = edge
    const pa = root(a),
      pb = root(b)
    const open = pa !== pb || rng() < openness
    parents[pa] = pb
    const wall = (start, end) => {
      if (end - start < 0.25) return
      chunk.walls.push(
        vertical
          ? [at - width / 2, start, at + width / 2, end]
          : [start, at - width / 2, end, at + width / 2],
      )
    }
    if (!open) wall(lo, hi)
    else if (rng() < 0.65) {
      const gap = 1.75 + rng() * Math.min(3.1, hi - lo - 2)
      const begin = lo + (hi - lo - gap) * rng()
      wall(lo, begin)
      wall(begin + gap, hi)
    }
  }
  for (let j = 0; j < 4; j++)
    for (let i = 0; i < 4; i++) {
      if (rng() < 0.17) continue
      const x = (xs[i] + xs[i + 1]) * 0.5 + (rng() - 0.5) * 1.7
      const z = (zs[j] + zs[j + 1]) * 0.5 + (rng() - 0.5) * 1.7
      chunk.fixtures.push([x, z, 0.55 + rng() * 0.78, rng() < 0.5 ? 0 : 1])
    }
}

export function occluded(x, z, dx, dz, w) {
  const ex = x + dx,
    ez = z + dz
  if (
    Math.max(x, ex) < w[0] ||
    Math.min(x, ex) > w[2] ||
    Math.max(z, ez) < w[1] ||
    Math.min(z, ez) > w[3]
  )
    return false
  const ax = (w[0] - x) / (dx || 0.00001),
    bx = (w[2] - x) / (dx || 0.00001)
  const az = (w[1] - z) / (dz || 0.00001),
    bz = (w[3] - z) / (dz || 0.00001)
  return (
    Math.max(0.001, Math.min(ax, bx), Math.min(az, bz)) <
    Math.min(0.999, Math.max(ax, bx), Math.max(az, bz))
  )
}

export function createLayout(seed = 0) {
  const salt = seedHash(seed)
  const cache = new Map()
  const rotation = salt % 4
  function areaFor(cx, cz) {
    if (cx === 0 && cz === 0) return AREAS.yellow
    const cardinal =
      cx === 0 && Math.abs(cz) === 1
        ? cz < 0
          ? 0
          : 2
        : cz === 0 && Math.abs(cx) === 1
          ? cx > 0
            ? 1
            : 3
          : -1
    if (cardinal >= 0) return palette[(cardinal + rotation) % 4]
    // Jittered district centres grow coherent wings across multiple chunks.
    const X = cx / 2.1,
      Z = cz / 2.1,
      gx = Math.floor(X),
      gz = Math.floor(Z)
    let distance = Infinity,
      selected = 0
    for (let j = gz - 1; j <= gz + 1; j++)
      for (let i = gx - 1; i <= gx + 1; i++) {
        const h = hash(salt, i, j, 83)
        const dx = X - i - 0.15 - (h & 1023) / 1461,
          dz = Z - j - 0.15 - ((h >>> 10) & 1023) / 1461
        if (dx * dx + dz * dz < distance) {
          distance = dx * dx + dz * dz
          selected = h >>> 22
        }
      }
    return palette[selected % 4]
  }
  function portal(cx, cz, axis) {
    // The coordinate belongs to the chunk on the east or south of the seam.
    // Both rooms therefore derive the very same opening.
    const h = hash(salt, cx, cz, axis + 17)
    const index = cx === 0 && cz === 0 && axis === 1 ? 2 : h % 4
    return [3 + 6 * index, 2.7 + ((h >>> 8) % 13) * 0.11]
  }
  function chunk(cx, cz) {
    const key = cx + ',' + cz
    let value = cache.get(key)
    if (value) return value
    const h = hash(salt, cx, cz, 2),
      rng = random(h)
    value = {
      cx,
      cz,
      x: cx * 24 - HALF,
      z: cz * 24 - HALF,
      hash: h,
      area: areaFor(cx, cz),
      walls: [],
      fixtures: [],
      portals: {},
    }
    if (!cx && !cz) {
      value.walls = entryWalls.map((w) => w.map((c) => c + HALF))
      value.fixtures = entryLights.map(([x, z, p, a]) => [
        x + HALF,
        z + HALF,
        p,
        a,
      ])
      // Only the camera-facing entry bay is fixed. The outer offices vary.
      if (rng() < 0.5) value.walls.push([1.65, 14, 2.12, 18.2])
    } else interior(value, rng)
    // Recessed troffers occupy a real bay in the suspended ceiling grid.
    // Service strips and pool bulkheads are surface mounted, in either direction.
    const recessed = value.area.id === 'office' || value.area.id === 'yellow'
    if (recessed) {
      for (const lamp of value.fixtures) {
        lamp[0] = (Math.floor(lamp[0] / 0.6) + 0.5) * 0.6
        lamp[1] = (Math.floor(lamp[1] / 1.2) + 0.5) * 1.2
        lamp[3] = 1
      }
    }
    value.interiorWallCount = value.walls.length
    for (const [side, axis, bx, bz, low] of [
      ['west', 0, cx, cz, true],
      ['east', 0, cx + 1, cz, false],
      ['north', 1, cx, cz, true],
      ['south', 1, cx, cz + 1, false],
    ]) {
      const [center, width] = portal(bx, bz, axis)
      value.portals[side] = center
      const min = low ? 0 : CHUNK_SIZE - 0.16,
        max = low ? 0.16 : CHUNK_SIZE
      for (const [a, b] of [
        [0, center - width / 2],
        [center + width / 2, CHUNK_SIZE],
      ]) {
        value.walls.push(axis === 0 ? [min, a, max, b] : [a, min, b, max])
      }
    }
    cache.set(key, value)
    if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value)
    return value
  }
  function canStand(x, z) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return false
    const min = getChunkCoordinates(x - PLAYER_RADIUS, z - PLAYER_RADIUS)
    const max = getChunkCoordinates(x + PLAYER_RADIUS, z + PLAYER_RADIUS)
    for (let j = min.cz; j <= max.cz; j++)
      for (let i = min.cx; i <= max.cx; i++) {
        const c = chunk(i, j),
          lx = x - c.x,
          lz = z - c.z
        for (const [x0, z0, x1, z1] of c.walls) {
          const dx = Math.max(x0 - lx, 0, lx - x1),
            dz = Math.max(z0 - lz, 0, lz - z1)
          if (dx * dx + dz * dz <= PLAYER_RADIUS * PLAYER_RADIUS) return false
        }
      }
    return true
  }
  // Dynamic actors share the walls and local fixtures used for the static
  // light bake. Test only candidate sources within that bake's radius.
  function getCeilingLight(x, z) {
    const min = getChunkCoordinates(x - 8, z - 8),
      max = getChunkCoordinates(x + 8, z + 8)
    const nearby = [],
      candidates = []
    for (let j = min.cz; j <= max.cz; j++)
      for (let i = min.cx; i <= max.cx; i++) {
        const room = chunk(i, j)
        nearby.push(room)
        for (const [lx, lz, power] of room.fixtures) {
          const dx = room.x + lx - x,
            dz = room.z + lz - z,
            d2 = dx * dx + dz * dz
          if (d2 <= 62)
            candidates.push({
              dx,
              dz,
              power,
              tint: room.area.tint,
              score: (power * (power < 0.68 ? 0.48 : 1)) / (2 + d2),
            })
        }
      }
    candidates.sort((a, b) => b.score - a.score)
    for (const lamp of candidates) {
      const blocked = nearby.some((room) =>
        room.walls.some((w) =>
          occluded(x - room.x, z - room.z, lamp.dx, lamp.dz, w),
        ),
      )
      if (!blocked)
        return {
          x: x + lamp.dx,
          z: z + lamp.dz,
          power: lamp.power,
          tint: lamp.tint,
        }
    }
    return null
  }
  function getArea(x, z) {
    const { cx, cz } = getChunkCoordinates(x, z)
    return chunk(cx, cz).area
  }
  return {
    chunk,
    canStand,
    getArea,
    getCeilingLight,
    areaFor,
    clear: () => cache.clear(),
    get cacheSize() {
      return cache.size
    },
  }
}
