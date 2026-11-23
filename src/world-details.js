import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

// Landmarks are shallow wall fittings. Each prototype shares its meshes across
// chunks, including one merged geometry for all of its painted metalwork.
export function createDetailsKit(THREE, texture) {
  const ownedGeometry = new Set()
  const ownedMaterials = new Set()
  const drawnTextures = new Set()
  const paint = new THREE.MeshLambertMaterial({ vertexColors: true })
  ownedMaterials.add(paint)

  function seededRandom(seed) {
    return () => {
      seed = (Math.imul(1664525, seed) + 1013904223) >>> 0
      return seed / 4294967296
    }
  }

  // Keep weathering anchored to each printed or painted object instead of
  // laying screen noise over the camera as it moves.
  function patina(ctx, w, h, seed) {
    const random = seededRandom(seed)
    const image = ctx.getImageData(0, 0, w, h)
    const data = image.data
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4
        const edge = Math.min(x, y, w - 1 - x, h - 1 - y)
        const k = (random() - 0.5) * 8 - 9 * Math.exp(-edge / 3)
        data[i] += k
        data[i + 1] += k
        data[i + 2] += k
      }
    ctx.putImageData(image, 0, 0)
  }

  function signMap(width, height, draw) {
    const c = document.createElement('canvas')
    c.width = width
    c.height = height
    draw(c.getContext('2d'), width, height)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    drawnTextures.add(t)
    return t
  }

  function model(assemble) {
    const node = new THREE.Group()
    const pieces = []
    function solid(geometry, color, x, y, z, tilt = 0) {
      geometry.rotateZ(tilt)
      geometry.translate(x, y, z)
      const rgb = new THREE.Color(color)
      const colors = new Float32Array(geometry.attributes.position.count * 3)
      for (let i = 0; i < colors.length; i += 3) rgb.toArray(colors, i)
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
      pieces.push(geometry)
    }
    function box(x, y, z, w, h, d, color, tilt) {
      solid(new THREE.BoxGeometry(w, h, d), color, x, y, z, tilt)
    }
    function pipe(x, y, z, radius, length, color, tilt = 0) {
      solid(
        new THREE.CylinderGeometry(radius, radius, length, 10),
        color,
        x,
        y,
        z,
        tilt,
      )
    }
    function panel(map, x, y, z, w, h, tint = 0xbfbca8) {
      const mat = new THREE.MeshLambertMaterial({ map, color: tint })
      const geo = new THREE.PlaneGeometry(w, h)
      ownedMaterials.add(mat)
      ownedGeometry.add(geo)
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.set(x, y, z)
      node.add(mesh)
    }
    assemble({ box, pipe, panel })
    if (pieces.length) {
      const geometry = mergeGeometries(pieces)
      for (const piece of pieces) piece.dispose()
      ownedGeometry.add(geometry)
      node.add(new THREE.Mesh(geometry, paint))
    }
    for (const mesh of node.children) {
      mesh.castShadow = true
      mesh.receiveShadow = true
    }
    return node
  }

  function plate(heading, caption, background, ink) {
    return signMap(384, 120, (ctx, w, h) => {
      ctx.fillStyle = background
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = ink
      ctx.fillRect(18, 18, 4, h - 36)
      ctx.font = 'bold 40px monospace'
      ctx.fillText(heading, 35, 62)
      ctx.font = '17px monospace'
      ctx.fillText(caption, 36, 93)
      for (const x of [9, w - 9]) {
        ctx.fillStyle = '#332f27'
        ctx.beginPath()
        ctx.arc(x, h / 2, 3, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#9d978a'
        ctx.fillRect(x - 2, h / 2, 4, 1)
      }
      patina(ctx, w, h, 181)
    })
  }

  const maintenance = model(({ box, pipe, panel }) => {
    for (const [x, color] of [
      [-0.58, 0x866846],
      [-0.4, 0x535b54],
    ]) {
      pipe(x, 1.56, 0.115, 0.052, 3.12, color)
      for (const y of [0.35, 1.92, 2.76]) {
        pipe(x, y, 0.115, 0.064, 0.054, 0x45473c)
        box(x, y, 0.065, 0.185, 0.045, 0.1, 0x45473c)
      }
    }
    box(0.15, 1.48, 0.085, 0.67, 0.88, 0.14, 0x535b53)
    box(0.15, 1.48, 0.16, 0.63, 0.83, 0.025, 0x67716a)
    for (let y = 0; y < 5; y++)
      box(0.15, 1.24 + y * 0.035, 0.178, 0.4, 0.012, 0.012, 0x323831)
    box(0.42, 1.5, 0.192, 0.027, 0.12, 0.04, 0x282d27)
    panel(
      plate('HIGH VOLTAGE', 'SERVICE ACCESS ONLY', '#ac944b', '#312d22'),
      0.15,
      1.69,
      0.177,
      0.48,
      0.15,
    )
  })

  const noticeMap = signMap(384, 240, (ctx, w, h) => {
    ctx.fillStyle = '#805e3b'
    ctx.fillRect(0, 0, w, h)
    const sheets = [
      [22, 19, -0.06, 'SHIFT ROSTER'],
      [147, 47, 0.045, 'MEMORANDUM'],
      [256, 64, -0.055, 'INSPECTION'],
    ]
    for (const [x, y, angle, heading] of sheets) {
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(angle)
      ctx.fillStyle = '#473b2c'
      ctx.fillRect(2, 3, 99, 141)
      ctx.fillStyle = '#d8cfb3'
      ctx.fillRect(0, 0, 98, 140)
      ctx.fillStyle = '#675e4a'
      ctx.font = 'bold 11px monospace'
      ctx.fillText(heading, 7, 23)
      for (let i = 0; i < 8; i++)
        ctx.fillRect(8, 35 + i * 8, 78 - (i % 3) * 12, 2)
      ctx.fillStyle = '#763c30'
      ctx.beginPath()
      ctx.arc(48, 5, 3, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
    const corner = ctx.createRadialGradient(3, h, 6, 0, h, h * 0.67)
    corner.addColorStop(0, 'rgba(51,40,25,.36)')
    corner.addColorStop(1, 'rgba(51,40,25,0)')
    ctx.fillStyle = corner
    ctx.fillRect(0, 0, w, h)
    patina(ctx, w, h, 431)
  })
  const office = model(({ box, panel }) => {
    box(0, 1.57, 0.025, 1.45, 0.93, 0.05, 0x564939)
    panel(noticeMap, 0, 1.57, 0.053, 1.39, 0.87)
  })

  const clockFace = signMap(160, 160, (ctx, w, h) => {
    ctx.translate(w / 2, h / 2)
    ctx.fillStyle = '#343b36'
    ctx.beginPath()
    ctx.arc(0, 0, 79, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#c9c5af'
    ctx.beginPath()
    ctx.arc(0, 0, 72, 0, Math.PI * 2)
    ctx.fill()
    for (let i = 0; i < 60; i++) {
      ctx.save()
      ctx.rotate((i * Math.PI) / 30)
      ctx.fillStyle = '#48483e'
      const major = i % 5 === 0
      ctx.fillRect(major ? -2 : -1, -65, major ? 4 : 2, major ? 9 : 4)
      ctx.restore()
    }
    ctx.strokeStyle = '#333930'
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.moveTo(27, 19)
    ctx.lineTo(0, 0)
    ctx.lineTo(43, 11)
    ctx.stroke()
    ctx.strokeStyle = '#8e4537'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(0, 8)
    ctx.lineTo(0, -56)
    ctx.stroke()
  })
  const clock = model(({ panel }) =>
    panel(clockFace, 0, 2.23, 0.042, 0.46, 0.46),
  )
  clock.children[0].material.alphaTest = 0.4

  const pool = model(({ box, panel }) => {
    panel(texture('pool_tiles_no_diving'), 0, 1.62, 0.021, 0.66, 0.66)
    box(0, 0.97, 0.053, 1.58, 0.035, 0.045, 0x797e71)
    for (const x of [-0.68, 0.68])
      box(x, 0.97, 0.028, 0.08, 0.075, 0.055, 0x585f58)
  })

  function sealedDoor(image, caption) {
    return model(({ box, panel }) => {
      box(0, 1.075, 0.019, 1.17, 2.15, 0.038, 0x4c483e)
      panel(texture(image), 0, 1.056, 0.043, 1.105, 2.106, 0xaaa997)
      if (caption) panel(caption, 0, 2.35, 0.024, 0.6, 0.188)
    })
  }
  const boarded = sealedDoor('door_wood_boarded')
  const lift = sealedDoor(
    'door_elevator_tape',
    plate('ELEVATOR', 'OUT OF SERVICE', '#444a41', '#b4b5a3'),
  )
  const pump = sealedDoor(
    'door_emergency_exit_tape',
    plate('PUMP ROOM', 'MAINTENANCE', '#637571', '#d1d7bf'),
  )
  const variants = {
    yellow: [clock, boarded],
    office: [office, lift, clock],
    maintenance: [maintenance, lift],
    pool: [pool, pump],
  }

  // A flooded section reflects the strip light above it. Intersecting the
  // reflected view ray with the ceiling keeps the highlight in place as the
  // camera moves. The substrate and slow caustics both use the Kenney pack.
  const waterTime = { value: 0 }
  const water = new THREE.MeshLambertMaterial({
    map: texture('pool_water_tiles'),
    color: 0xadcbce,
  })
  water.onBeforeCompile = (shader) => {
    shader.uniforms.uWaterTime = waterTime
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `
      #include <common>
      varying vec3 vPoolPosition;
      varying vec3 vPoolLamp;
      varying vec2 vLampAxis;
    `,
      )
      .replace(
        '#include <begin_vertex>',
        `
      #include <begin_vertex>
      vPoolPosition = (modelMatrix * vec4(position, 1.)).xyz;
      vPoolLamp = modelMatrix[3].xyz + vec3(0., 3.05, 0.);
      vLampAxis = normalize(modelMatrix[0].xz);
    `,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `
      #include <common>
      uniform float uWaterTime;
      varying vec3 vPoolPosition;
      varying vec3 vPoolLamp;
      varying vec2 vLampAxis;
    `,
      )
      .replace(
        '#include <map_fragment>',
        `
      vec2 p = vPoolPosition.xz - vPoolLamp.xz;
      vec2 ripple = vec2(sin(5.4*p.x + 2.3*p.y + uWaterTime), cos(4.1*p.y - 2.2*p.x - .8*uWaterTime));
      // Refraction displaces the floor pattern underneath the surface; its
      // displacement stops at the submerged walls of the shallow basin.
      vec2 crossAxis = vec2(-vLampAxis.y, vLampAxis.x);
      vec2 viewOffset = (vPoolPosition.xz-cameraPosition.xz) /
        max(.8,cameraPosition.y-vPoolPosition.y);
      vec2 deepUv = vMapUv + .11 * vec2(dot(viewOffset,vLampAxis)/4.8,-dot(viewOffset,crossAxis)/3.2);
      vec2 bottomUv = clamp(deepUv,.006,.994);
      float side = smoothstep(.002,.026,length(deepUv-bottomUv));
      diffuseColor *= texture2D(map, bottomUv * vec2(3., 2.) + .014*ripple);
      diffuseColor.rgb = mix(diffuseColor.rgb,vec3(.040,.085,.089),side*.65);
    `,
      )
      .replace(
        '#include <opaque_fragment>',
        `
      vec3 waterNormal = normalize(vec3(.033*ripple.x, 1., .027*ripple.y));
      vec3 reflected = reflect(normalize(vPoolPosition-cameraPosition), waterNormal);
      vec2 onCeiling = p + 3.05*reflected.xz / max(.01,reflected.y);
      vec2 local = abs(vec2(dot(onCeiling,vLampAxis),dot(onCeiling,vec2(-vLampAxis.y,vLampAxis.x))));
      float highlight = (1.-smoothstep(.64,.94,local.x)) * (1.-smoothstep(.17,.39,local.y));
      outgoingLight += vec3(.83,.95,.88) * highlight * .72;
      #include <opaque_fragment>
    `,
      )
  }
  ownedMaterials.add(water)
  const basinGeometry = new THREE.PlaneGeometry(4.8, 3.2).rotateX(-Math.PI / 2)
  ownedGeometry.add(basinGeometry)
  const coping = model(({ box }) => {
    // Raised coping catches the edge light and separates the water from
    // the tiled walkway. Tile joints break up the long pool surround.
    for (const side of [-1, 1]) {
      for (let i = 0; i < 8; i++)
        box(-2.1 + i * 0.6, 0.018, side * 1.63, 0.592, 0.052, 0.092, 0x89948e)
      for (let i = 0; i < 6; i++)
        box(
          side * 2.44,
          0.018,
          -1.333 + i * 0.5333,
          0.09,
          0.052,
          0.525,
          0x89948e,
        )
    }
  })
  function addBasin(group, chunk) {
    // All footprints stay away from doorways and clear of partition walls.
    // The surface is shallow enough for the player to wade straight across.
    for (const [x, z, , along] of chunk.fixtures) {
      const wide = along ? 1.6 : 2.4,
        deep = along ? 2.4 : 1.6
      if (x - wide < 3 || z - deep < 3 || x + wide > 21 || z + deep > 21)
        continue
      if (
        chunk.walls.some(
          ([x0, z0, x1, z1]) =>
            x + wide > x0 && x - wide < x1 && z + deep > z0 && z - deep < z1,
        )
      )
        continue
      const basin = new THREE.Mesh(basinGeometry, water)
      basin.name = 'Shallow tiled basin'
      basin.receiveShadow = true
      basin.rotation.y = (along * Math.PI) / 2
      basin.position.set(x, 0.009, z)
      const rim = coping.clone()
      rim.position.set(x, 0, z)
      rim.rotation.y = basin.rotation.y
      group.add(basin, rim)
      return
    }
  }
  // Round the upper part of tiled doorways while preserving the full opening
  // at player height. Reuse the arch for passages of different widths.
  const archOutline = new THREE.Shape()
  archOutline.moveTo(-1.5, 2.04)
  archOutline.bezierCurveTo(-1.5, 3.21, 1.5, 3.21, 1.5, 2.04)
  archOutline.lineTo(1.5, 3.12)
  archOutline.lineTo(-1.5, 3.12)
  archOutline.closePath()
  const archGeometry = new THREE.ExtrudeGeometry(archOutline, {
    depth: 0.34,
    curveSegments: 14,
    bevelEnabled: false,
  }).translate(0, 0, -0.17)
  const archMaterial = new THREE.MeshLambertMaterial({
    map: texture('pool_tiles_medium'),
    color: 0x82958d,
  })
  ownedGeometry.add(archGeometry)
  ownedMaterials.add(archMaterial)

  function tileDoorways(group, chunk) {
    for (const side of ['north', 'west']) {
      const north = side === 'north'
      const center = chunk.portals[side]
      // Find the jamb ending immediately to the left of this opening.
      const wall = chunk.walls.find(([x0, z0, x1, z1]) =>
        north
          ? z0 === 0 && z1 < 0.2 && x0 === 0 && x1 < center
          : x0 === 0 && x1 < 0.2 && z0 === 0 && z1 < center,
      )
      if (!wall) continue
      const width = 2 * (center - (north ? wall[2] : wall[3]))
      const arch = new THREE.Mesh(archGeometry, archMaterial)
      arch.name = 'Tiled archway'
      arch.castShadow = true
      arch.receiveShadow = true
      arch.scale.x = width / 3
      arch.rotation.y = north ? 0 : Math.PI / 2
      arch.position.set(north ? center : 0.16, 0, north ? 0.16 : center)
      group.add(arch)
    }
  }

  const overhead = model(({ box, pipe }) => {
    for (const [offset, color] of [
      [-0.26, 0x666349],
      [0.05, 0x614c3a],
    ]) {
      pipe(0, 2.76, offset, 0.092, 5.5, color, Math.PI / 2)
      for (const x of [-2, -0.4, 2])
        pipe(x, 2.76, offset, 0.115, 0.075, 0x41463b, Math.PI / 2)
    }
    for (const x of [-2, 2]) {
      box(x, 2.6, -0.105, 0.065, 0.055, 0.72, 0x484d41)
      for (const z of [-0.46, 0.25])
        box(x, 2.87, z, 0.025, 0.54, 0.025, 0x53584a)
    }
  })

  function dressServiceCeiling(group, chunk) {
    let count = 0
    for (const [x0, z0, x1, z1] of chunk.walls.slice(
      0,
      chunk.interiorWallCount,
    )) {
      if (Math.max(x1 - x0, z1 - z0) < 4.6) continue
      const horizontal = x1 - x0 > z1 - z0
      const conduit = overhead.clone()
      conduit.position.set(
        horizontal ? (x1 + x0) / 2 : x1 + 0.58,
        0,
        horizontal ? z1 + 0.58 : (z1 + z0) / 2,
      )
      conduit.rotation.y = horizontal ? 0 : Math.PI / 2
      conduit.scale.x = Math.min(1.6, Math.max(x1 - x0, z1 - z0) / 5.5)
      group.add(conduit)
      if (++count === 3) break
    }
  }

  // The loose acoustic panel hangs below its T-bars. The lifted edge shows
  // the dark plenum, which stays visible at a grazing angle down the hall.
  const mineralFiber = signMap(192, 384, (ctx, w, h) => {
    ctx.fillStyle = '#afa78e'
    ctx.fillRect(0, 0, w, h)
    const r = seededRandom(912)
    for (let i = 0; i < 8800; i++) {
      const x = r() * w,
        y = r() * h
      ctx.fillStyle = i % 4 ? 'rgba(65,61,48,.29)' : 'rgba(234,226,203,.52)'
      ctx.fillRect(x, y, 0.4 + r() * 2.3, 0.45 + r() * 1.3)
    }
    ctx.save()
    ctx.translate(w * 0.95, h * 0.64)
    ctx.scale(1, 1.55)
    ctx.beginPath()
    for (let i = 0; i <= 180; i++) {
      const a = (i / 180) * Math.PI * 2,
        radius =
          76 +
          8 * Math.sin(3 * a) +
          4 * Math.sin(8 * a + 1) +
          1.7 * Math.sin(19 * a)
      const x = radius * Math.cos(a),
        y = radius * Math.sin(a)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
    ctx.fillStyle = 'rgba(116,86,46,.19)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(100,76,47,.29)'
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.restore()
    patina(ctx, w, h, 400)
  })
  const droppedTile = model(({ box, panel }) => {
    box(0, 3.111, 0, 0.598, 0.012, 1.198, 0x302f28)
    for (const side of [-1, 1])
      box(side * 0.301, 3.107, 0, 0.012, 0.022, 1.208, 0x837f6e)
    panel(mineralFiber, 0, 3.061, 0, 0.588, 1.174, 0xb6b3a5)
  })
  const loose = droppedTile.children[0]
  loose.rotation.set(Math.PI / 2 + 0.054, 0.037, 0.005)
  function placeDroppedTile(group, x, z) {
    const tile = droppedTile.clone()
    tile.position.set(x, 0, z)
    group.add(tile)
  }
  function decorate(group, chunk) {
    if (chunk.cx === 0 && chunk.cz === 0) {
      placeDroppedTile(group, 13.8, 16.8)
      return
    }
    if (
      (chunk.area.id === 'yellow' || chunk.area.id === 'office') &&
      chunk.hash % 3 === 0
    ) {
      const lamp = chunk.fixtures[0]
      if (lamp)
        placeDroppedTile(
          group,
          Math.round((lamp[0] + 1.6) / 0.6) * 0.6,
          Math.round(lamp[1] / 1.2) * 1.2,
        )
    }
    if (chunk.area.id === 'pool') {
      addBasin(group, chunk)
      tileDoorways(group, chunk)
    }
    if (chunk.area.id === 'maintenance') dressServiceCeiling(group, chunk)
    let state = chunk.hash >>> 0
    const random = () => {
      state = (Math.imul(1664525, state) + 1013904223) >>> 0
      return state / 4294967296
    }
    // Choose long interior wall faces. All fittings sit inside the collision
    // clearance so they never narrow a doorway or snag the moving player.
    const faces = []
    for (const [x0, z0, x1, z1] of chunk.walls) {
      const x = (x0 + x1) / 2,
        z = (z0 + z1) / 2
      if (x < 0.2 || x > 23.8 || z < 0.2 || z > 23.8) continue
      if (x1 - x0 >= 2.4) faces.push([x, z1, 0], [x, z0, Math.PI])
      if (z1 - z0 >= 2.4)
        faces.push([x1, z, Math.PI / 2], [x0, z, -Math.PI / 2])
    }
    if (!faces.length) return
    const choices = variants[chunk.area.id]
    if (!choices) return
    const count = random() < 0.3 ? 2 : 1
    for (let i = 0; i < count && faces.length; i++) {
      const [x, z, angle] = faces.splice(
        Math.floor(random() * faces.length),
        1,
      )[0]
      const item = choices[Math.floor(random() * choices.length)].clone()
      item.position.set(x, 0, z)
      item.rotation.y = angle
      group.add(item)
    }
  }
  function dispose() {
    for (const geo of ownedGeometry) geo.dispose()
    for (const mat of ownedMaterials) mat.dispose()
    for (const map of drawnTextures) map.dispose()
  }
  return {
    decorate,
    dispose,
    update(time) {
      waterTime.value = time % (10 * Math.PI)
    },
  }
}
