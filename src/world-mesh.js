import { CHUNK_SIZE as SIZE, HEIGHT, occluded } from './world-layout.js'

function lighting(layout, chunk) {
  // Include the next room's lamps and blockers across all four seams. The
  // same world-space point receives the same light whichever chunk owns it.
  const walls = [],
    lights = []
  for (let j = -1; j <= 1; j++)
    for (let i = -1; i <= 1; i++) {
      const c = layout.chunk(chunk.cx + i, chunk.cz + j)
      const dx = i * SIZE,
        dz = j * SIZE
      for (const w of c.walls) {
        if (!i && !j) walls.push(w)
        else if (
          w[2] + dx >= -8 &&
          w[0] + dx <= SIZE + 8 &&
          w[3] + dz >= -8 &&
          w[1] + dz <= SIZE + 8
        ) {
          walls.push([w[0] + dx, w[1] + dz, w[2] + dx, w[3] + dz])
        }
      }
      for (const [x, z, p, along] of c.fixtures) {
        const lx = x + dx,
          lz = z + dz
        if (lx >= -8 && lx <= SIZE + 8 && lz >= -8 && lz <= SIZE + 8)
          lights.push([lx, lz, p, c.area.tint, along])
      }
    }
  const tiles = []
  for (let j = 0; j < 6; j++)
    for (let i = 0; i < 6; i++) {
      const x = i * 4,
        z = j * 4
      tiles.push({
        near: walls.filter(
          (w) =>
            w[2] >= x - 2 && w[0] <= x + 6 && w[3] >= z - 2 && w[1] <= z + 6,
        ),
        lamps: lights
          .filter(
            ([lx, lz]) =>
              lx >= x - 8 && lx <= x + 12 && lz >= z - 8 && lz <= z + 12,
          )
          .map(([lx, lz, p, tint, along]) => ({
            along,
            lx,
            lz,
            p,
            tint,
            blocks: walls.filter(
              (w) =>
                w[2] >= Math.min(x - 0.1, lx) &&
                w[0] <= Math.max(x + 4.1, lx) &&
                w[3] >= Math.min(z - 0.1, lz) &&
                w[1] <= Math.max(z + 4.1, lz),
            ),
          })),
      })
    }
  return function sample(
    colors,
    lampDirections,
    x,
    y,
    z,
    nx,
    ny,
    nz,
    sourceWall,
  ) {
    const tile =
      tiles[
        Math.min(5, Math.max(0, Math.floor(x / 4))) +
          6 * Math.min(5, Math.max(0, Math.floor(z / 4)))
      ]
    const sx = x + nx * 0.035,
      sz = z + nz * 0.035
    let near = 4
    for (const w of tile.near)
      if (w !== sourceWall) {
        const dx = Math.max(w[0] - sx, 0, sx - w[2]),
          dz = Math.max(w[1] - sz, 0, sz - w[3])
        near = Math.min(near, dx * dx + dz * dz)
      }
    const contact = 1 - 0.54 * Math.exp(-Math.sqrt(near) * 1.9)
    let r = 0,
      g = 0,
      b = 0
    let strongest = 0,
      lightX = 0,
      lightY = 0,
      lightZ = 0
    for (const { lx, lz, p, tint, along, blocks } of tile.lamps) {
      const dx = lx - sx,
        dz = lz - sz,
        horizontal = dx * dx + dz * dz
      if (horizontal > 62) continue
      const inc =
        ny === 0
          ? Math.max(0, (dx * nx + dz * nz) / Math.sqrt(horizontal + 0.12))
          : 1
      if (!inc) continue
      let blocked = false
      for (const w of blocks)
        if (w !== sourceWall && occluded(sx, sz, dx, dz, w)) {
          blocked = true
          break
        }
      if (blocked) continue
      const dy = HEIGHT - y
      const heightSquared = dy * dy
      const radius2 = heightSquared + horizontal + 0.16
      const distance = Math.sqrt(radius2)
      const emission = 0.24 + (0.76 * dy) / distance
      const incidence = ny > 0 ? dy / distance : inc
      // The diffuser throws a broad downward cone. The ceiling only catches
      // indirect spill, with a tight fringe around the length of the housing.
      const cross = along ? dx : dz,
        length = along ? dz : dx
      const edgeRadius =
        cross * cross + Math.max(0, Math.abs(length) - 0.52) ** 2
      const falloff =
        ny < 0
          ? 0.8 * Math.exp(-edgeRadius * 0.79) + 0.76 / (1 + horizontal * 0.62)
          : (14.6 * (0.16 + 0.84 * incidence) * emission) / (0.73 + radius2)
      const workingPower = p < 0.68 ? p * 0.48 : p
      const power = workingPower * falloff
      r += power * tint[0] * (p < 0.68 ? 1.12 : 1)
      g += power * tint[1]
      b += power * tint[2] * (p < 0.68 ? 0.73 : 1)
      if (lampDirections && power > strongest) {
        strongest = power
        lightX = dx / distance
        lightY = dy / distance
        lightZ = dz / distance
      }
    }
    if (lampDirections) {
      const magnitude = 127 * Math.min(1, strongest)
      lampDirections.push(
        Math.round(lightX * magnitude),
        Math.round(lightY * magnitude),
        Math.round(lightZ * magnitude),
      )
    }
    const edge =
      ny === 0
        ? 1 - 0.31 * Math.exp(-y * 3) - 0.23 * Math.exp(-(HEIGHT - y) * 4.3)
        : 1
    const direct = ny < 0 ? 0.46 : ny > 0 ? 0.6 : 0.78
    // A small neutral bounce retains detail in unlit passages, even with the
    // torch off. The direct component carries the district's lamp temperature.
    const ambient = ny < 0 ? 0.072 : 0.052
    const a = contact * edge
    const wx = x + chunk.x,
      wz = z + chunk.z
    const along = Math.max(0, Math.min(1, (-2 - wz) / 8, (wz + 21) / 8))
    const across = Math.max(0, Math.min(1, (13 - Math.abs(wx)) / 6))
    const dimming = 1 - 0.43 * along * across
    colors.push(
      a * (ambient * 0.96 + direct * r * dimming) * (ny === 0 ? 1 : 0.81),
      a * (ambient + direct * g * dimming) * (ny === 0 ? 1 : 0.86),
      a * (ambient * 0.85 + direct * b * dimming) * (ny === 0 ? 1 : 0.98),
    )
  }
}

export function bakeChunk(layout, cx, cz) {
  const c = layout.chunk(cx, cz),
    area = c.area,
    batches = new Map()
  const shade = lighting(layout, c)
  function face(
    key,
    x,
    y,
    z,
    ux,
    uz,
    vx,
    vy,
    vz,
    uvW,
    uvH,
    sourceWall,
    uOffset = 0,
    vOffset = 0,
  ) {
    let batch = batches.get(key)
    if (!batch) {
      batch = {
        key,
        positions: [],
        normals: [],
        colors: [],
        uvs: [],
        indices: [],
        lampDirections: key.startsWith('pool_') ? [] : null,
      }
      batches.set(key, batch)
    }
    const { positions, normals, colors, uvs, indices } = batch
    const length = Math.hypot(ux, uz),
      height = Math.hypot(vx, vy, vz)
    const nx = (-uz * vy) / (length * height),
      ny = (uz * vx - ux * vz) / (length * height),
      nz = (ux * vy) / (length * height)
    const spacing = cx === 0 && cz === 0 ? 0.65 : 0.95
    const cols = Math.ceil(length / spacing),
      rows = Math.ceil(height / spacing),
      start = positions.length / 3
    for (let j = 0; j <= rows; j++)
      for (let i = 0; i <= cols; i++) {
        const s = i / cols,
          t = j / rows,
          px = x + s * ux + t * vx,
          py = y + t * vy,
          pz = z + s * uz + t * vz
        positions.push(px, py, pz)
        normals.push(nx, ny, nz)
        uvs.push(uOffset + s * uvW, vOffset + t * uvH)
        shade(colors, batch.lampDirections, px, py, pz, nx, ny, nz, sourceWall)
        if (i < cols && j < rows) {
          const a = start + j * (cols + 1) + i
          indices.push(
            a,
            a + 1,
            a + cols + 1,
            a + 1,
            a + cols + 2,
            a + cols + 1,
          )
        }
      }
  }
  const north = layout.areaFor(cx, cz - 1),
    west = layout.areaFor(cx - 1, cz)
  // The carpet or tile continues beyond a district doorway. New wallpaper and
  // fluorescent colors appear before the floor changes inside the threshold.
  const westBay = west.id !== area.id,
    northBay = north.id !== area.id
  const N = c.portals.north,
    W = c.portals.west
  const cuts = (hasEntrance, hasCrossBay, center) => {
    const points = new Set([0, SIZE])
    if (hasEntrance) points.add(3)
    if (hasCrossBay) {
      points.add(Math.max(0, center - 3))
      points.add(Math.min(SIZE, center + 3))
    }
    return [...points].sort((a, b) => a - b)
  }
  const xs = cuts(westBay, northBay, N),
    zs = cuts(northBay, westBay, W)
  for (let i = 0; i < xs.length - 1; i++)
    for (let j = 0; j < zs.length - 1; j++) {
      const x = xs[i],
        z = zs[j],
        w = xs[i + 1] - x,
        d = zs[j + 1] - z
      const inWest = westBay && x < 3 && Math.abs(z + d / 2 - W) < 3
      const inNorth = northBay && z < 3 && Math.abs(x + w / 2 - N) < 3
      const floor = (inWest ? west : inNorth ? north : area).floor
      face(
        floor,
        x,
        0,
        z + d,
        w,
        0,
        0,
        0,
        -d,
        w / 1.5,
        d / 1.5,
        null,
        x / 1.5,
        -(z + d) / 1.5,
      )
    }
  const acoustic = area.id === 'yellow' || area.id === 'office'
  face(
    area.ceiling,
    0,
    HEIGHT,
    0,
    SIZE,
    0,
    0,
    0,
    SIZE,
    acoustic ? SIZE / 1.2 : 16,
    acoustic ? SIZE / 2.4 : 16,
  )
  c.walls.forEach((wall, index) => {
    const [x0, z0, x1, z1] = wall,
      w = x1 - x0,
      d = z1 - z0
    const mat =
      index < c.interiorWallCount && (index + c.hash) % 11 === 0
        ? area.worn
        : area.wall
    const tileWidth = area.id === 'yellow' ? 1.52 : 2.32
    face(mat, x0, 0, z1, w, 0, 0, HEIGHT, 0, w / tileWidth, 1, wall)
    face(mat, x1, 0, z0, -w, 0, 0, HEIGHT, 0, w / tileWidth, 1, wall)
    face(mat, x0, 0, z0, 0, d, 0, HEIGHT, 0, d / tileWidth, 1, wall)
    face(mat, x1, 0, z1, 0, -d, 0, HEIGHT, 0, d / tileWidth, 1, wall)
  })
  return [...batches.values()].map((b) => ({
    key: b.key,
    positions: new Float32Array(b.positions),
    normals: new Float32Array(b.normals),
    colors: new Float32Array(b.colors),
    uvs: new Float32Array(b.uvs),
    indices: new Uint16Array(b.indices),
    lampDirections: b.lampDirections ? new Int8Array(b.lampDirections) : null,
  }))
}
