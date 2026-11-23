import * as THREE from 'three'
import {
  AREAS,
  CHUNK_SIZE,
  HEIGHT,
  createLayout,
  getChunkCoordinates,
} from './world-layout.js'
import { bakeChunk } from './world-mesh.js'
import { createDetailsKit } from './world-details.js'

const SPAWN = {
  x: -0.9,
  z: 9.65,
  yaw: 0.16,
  pitch: 0.015,
  height: 1.54,
  fov: 64,
}
const STREAM_RADIUS = 2
const MAX_CHUNKS = (2 * STREAM_RADIUS + 1) ** 2

function canvasMap(w, h, paint) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  paint(canvas.getContext('2d'), w, h)
  const map = new THREE.CanvasTexture(canvas)
  map.colorSpace = THREE.SRGBColorSpace
  return map
}

function randomSequence(seed) {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
}

// Pack broad stain density, directional grain and fine speckle in one mipmapped
// noise tile. The shader samples it at physical scales independent of the art UVs.
function finishMap() {
  const size = 256,
    rand = randomSequence(0xb1adf00d)
  const field = new Uint8Array(size * size)
  for (let i = 0; i < field.length; i++) field[i] = rand() * 256
  const at = (x, y) => field[(x & 255) + ((y & 255) << 8)] / 255
  function smooth(x, y, period) {
    const fx = x / period,
      fy = y / period,
      ix = Math.floor(fx),
      iy = Math.floor(fy)
    let s = fx - ix,
      t = fy - iy
    s = s * s * (3 - 2 * s)
    t = t * t * (3 - 2 * t)
    const stride = 256 / period
    const n = (a, b) => at((a % stride) * period, (b % stride) * period)
    return (
      (1 - t) * ((1 - s) * n(ix, iy) + s * n(ix + 1, iy)) +
      t * ((1 - s) * n(ix, iy + 1) + s * n(ix + 1, iy + 1))
    )
  }
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = (x + y * size) * 4
      data[i] =
        255 *
        (0.44 * smooth(x, y, 32) +
          0.3 * smooth(x, y, 16) +
          0.17 * smooth(x, y, 8) +
          0.09 * smooth(x, y, 4))
      data[i + 1] =
        255 *
        (0.45 * at(x, y) +
          0.26 * at(x - 1, y) +
          0.17 * at(x - 2, y) +
          0.12 * at(x - 3, y + 1))
      data[i + 2] = field[x + y * size]
      data[i + 3] = 255
    }
  const tex = new THREE.DataTexture(data, size, size)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.generateMipmaps = true
  tex.needsUpdate = true
  return tex
}

function finishArtwork(map, name) {
  const wallpaper = name.startsWith('wall_yellow_pattern')
  const acoustic = name === 'ceiling_medium' || name === 'ceiling_small'
  if (!wallpaper && !acoustic) return
  const source = map.image,
    canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 512
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  if (wallpaper) {
    // The stock art combines moulding, wallpaper and skirting. Keep the trim
    // at architectural scale while repeating the printed field more densely.
    ctx.drawImage(source, 0, 0, 64, 12, 0, 0, 256, 14)
    for (let i = 0; i < 3; i++)
      ctx.drawImage(source, 0, 32, 64, 64, 0, 14 + i * 156, 256, 156)
    ctx.drawImage(source, 0, 112, 64, 16, 0, 482, 256, 30)
  } else {
    const rand = randomSequence(name === 'ceiling_medium' ? 12893 : 776)
    const panelWidth = 128,
      panelHeight = 256
    for (let y = 0; y < 512; y += panelHeight)
      for (let x = 0; x < 256; x += panelWidth) {
        // The fibreboard substrate and color still come from the supplied tile.
        ctx.drawImage(
          source,
          10,
          3 + Math.floor(rand() * 3),
          4,
          6,
          x,
          y,
          panelWidth,
          panelHeight,
        )
        ctx.fillStyle = 'rgba(35,32,26,' + rand() * 0.045 + ')'
        ctx.fillRect(x, y, panelWidth, panelHeight)
        for (let i = 0; i < 1300; i++) {
          const px = x + rand() * panelWidth,
            py = y + rand() * panelHeight
          ctx.fillStyle = 'rgba(45,43,32,' + (0.05 + rand() * 0.25) + ')'
          ctx.fillRect(px, py, 0.7 + rand(), 0.55 + rand())
          if (i % 5 === 0) ctx.fillRect(px + 1, py + 1, 1.25, 1.5)
        }
        ctx.fillStyle = 'rgba(49,46,37,.54)'
        ctx.fillRect(x, y, 2.6, panelHeight)
        ctx.fillRect(x, y, panelWidth, 2.6)
        ctx.fillStyle = 'rgba(225,220,199,.72)'
        ctx.fillRect(x + 2.6, y + 2.6, 1.8, panelHeight - 2.6)
        ctx.fillRect(x + 2.6, y + 2.6, panelWidth - 2.6, 1.8)
      }
  }
  map.image = canvas
  map.needsUpdate = true
}

function diffuserMap() {
  return canvasMap(384, 128, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h)
    for (const [at, color] of [
      [0, '#6e7164'],
      [0.03, '#98998a'],
      [0.11, '#c9c9b1'],
      [0.18, '#e4e1c7'],
      [0.22, '#fffff4'],
      [0.32, '#fffce9'],
      [0.35, '#dddac2'],
      [0.45, '#c2c1aa'],
      [0.5, '#93988b'],
      [0.54, '#bcbeac'],
      [0.64, '#e8e5ce'],
      [0.68, '#fffef0'],
      [0.78, '#fffcea'],
      [0.83, '#dedbc2'],
      [0.96, '#babda9'],
      [1, '#767b70'],
    ])
      g.addColorStop(at, color)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
    for (let x = 0; x < w; x += 4) {
      ctx.fillStyle = 'rgba(76,77,61,.12)'
      ctx.fillRect(x, 0, 1, h)
    }
    // Thin transverse louvers and opaque end sockets silhouette the tubes.
    for (let x = 34; x < w - 4; x += 43) {
      ctx.fillStyle = 'rgba(68,68,53,.66)'
      ctx.fillRect(x, 1, 2, h - 2)
      ctx.fillStyle = 'rgba(255,255,239,.6)'
      ctx.fillRect(x + 2, 1, 1, h - 2)
    }
    const ends = ctx.createLinearGradient(0, 0, w, 0)
    ends.addColorStop(0, 'rgba(55,61,51,.71)')
    ends.addColorStop(0.035, 'rgba(65,64,52,0)')
    ends.addColorStop(0.956, 'rgba(65,64,52,0)')
    ends.addColorStop(1, 'rgba(55,61,51,.76)')
    ctx.fillStyle = ends
    ctx.fillRect(0, 0, w, h)
  })
}

export function createWorld(scene, renderer, { seed = 0 } = {}) {
  const layout = createLayout(seed)
  const root = new THREE.Group()
  root.name = 'Procedural world'
  scene.add(root)
  scene.background = new THREE.Color(0x211f16)
  const fog = new THREE.FogExp2(0x1a1b14, 0.049)
  scene.fog = fog
  const fogColors = {
    yellow: new THREE.Color(0x1a1b14),
    office: new THREE.Color(0x19201f),
    maintenance: new THREE.Color(0x191711),
    pool: new THREE.Color(0x193030),
  }
  root.add(new THREE.AmbientLight(0xffffff, Math.PI))
  const manager = new THREE.LoadingManager()
  const ready = new Promise((resolve) => {
    manager.onLoad = resolve
  })
  const loader = new THREE.TextureLoader(manager)
  const maps = new Map(),
    materials = new Map(),
    fixturesGeometry = new THREE.BoxGeometry(1, 1, 1),
    glassGeometry = new THREE.PlaneGeometry()
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
  const surfaceNoise = finishMap()
  surfaceNoise.anisotropy = anisotropy
  function texture(name) {
    if (!maps.has(name)) {
      const map = loader.load(
        import.meta.env.BASE_URL + 'textures/' + name + '.png',
        (loaded) => finishArtwork(loaded, name),
      )
      map.colorSpace = THREE.SRGBColorSpace
      map.wrapS = map.wrapT = THREE.RepeatWrapping
      map.anisotropy = anisotropy
      maps.set(name, map)
    }
    return maps.get(name)
  }
  function material(name) {
    if (!materials.has(name)) {
      const mat = new THREE.MeshLambertMaterial({
        map: texture(name),
        vertexColors: true,
      })
      const finish = name.startsWith('carpet_')
        ? 'CARPET'
        : name.startsWith('pool_')
          ? 'TILE'
          : name.startsWith('ceiling_')
            ? 'CEILING'
            : name.startsWith('wall_concrete')
              ? 'CONCRETE'
              : 'PAPER'
      mat.defines = { ['FINISH_' + finish]: 1 }
      if (name.startsWith('wall_yellow_pattern')) mat.defines.PRINTED_PAPER = 1
      if (name === 'ceiling_medium' || name === 'ceiling_small')
        mat.defines.ACOUSTIC = 1
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.finishNoise = { value: surfaceNoise }
        shader.vertexShader = shader.vertexShader
          .replace(
            '#include <common>',
            `
          #include <common>
          varying vec2 finishUv;
          #ifdef FINISH_TILE
            attribute vec3 lampDirection;
            varying vec3 keyLight;
          #endif
        `,
          )
          .replace(
            '#include <begin_vertex>',
            `
          #include <begin_vertex>
          // Rebase every 384m (an integer multiple of every finish period).
          vec3 p=position+mod(modelMatrix[3].xyz,384.);
          finishUv = abs(normal.y)>.5 ? p.xz : vec2(p.x+p.z,p.y);
          #ifdef FINISH_TILE
            keyLight=mat3(viewMatrix)*lampDirection;
          #endif
        `,
          )
        shader.fragmentShader = shader.fragmentShader
          // Vertex colors store lamp irradiance. Let the torch light the actual
          // albedo independently, even when a surface is in fluorescent shadow.
          .replace('#include <color_fragment>', '')
          .replace(
            '#include <lights_fragment_end>',
            '#include <lights_fragment_end>\n reflectedLight.indirectDiffuse *= vColor;',
          )
          .replace(
            '#include <common>',
            `
          #include <common>
          uniform sampler2D finishNoise;
          varying vec2 finishUv;
          #ifdef FINISH_TILE
            varying vec3 keyLight;
          #endif
        `,
          )
          .replace(
            '#include <map_fragment>',
            `
          #include <map_fragment>
          vec4 broad = texture2D(finishNoise,finishUv*.0625);
          vec4 mid = texture2D(finishNoise,finishUv*vec2(.25,.125)+vec2(.37,.79));
          float patina = broad.r-.5;
          #ifdef FINISH_CARPET
            // Irregular lay of the matted pile catches the lamps in broad swaths.
            vec3 tuft=texture2D(finishNoise,finishUv*vec2(1.5,2.)).rgb;
            float thread=(tuft.g-.5)*.46 + (tuft.b-.5)*.20;
            float traffic=smoothstep(.38,.67,broad.r*.67+mid.r*.33);
            // Broad, faded patches in the Kenney carpet sit below the weave.
            // Keep traffic marks irregular instead of repeating a square stain.
            vec3 groundTone=dot(diffuseColor.rgb,vec3(.24,.64,.12))*vec3(1.05,1.,.83);
            diffuseColor.rgb=mix(diffuseColor.rgb,groundTone,.21);
            diffuseColor.rgb*= (.68 + .31*traffic + thread) * vec3(.93,.91,.85);
          #elif defined(FINISH_PAPER)
            vec2 wall=finishUv;
            vec4 fibre=texture2D(finishNoise,wall*vec2(1.,3.));
            float damp=smoothstep(.51,.77,mid.r*.55+broad.r*.45);
            float rising=1.-smoothstep(.04,.30+damp*.66,wall.y);
            float runs=texture2D(finishNoise,wall*vec2(.75,.03125)).r;
            float runoff=smoothstep(.53,.70,runs)*smoothstep(2.22,3.10,wall.y);
            float weather=.90+patina*.42+(mid.r-.5)*.14+(fibre.g-.5)*.23;
            #ifdef PRINTED_PAPER
              float field=smoothstep(.060,.076,vMapUv.y)*(1.-smoothstep(.966,.977,vMapUv.y));
              diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.53,.397,.245),.31*field);
              float sheet=fract(vMapUv.x*3.);
              float seam=smoothstep(.981,1.,sheet)*(1.-smoothstep(.009,.06,fwidth(vMapUv.x)));
              weather-=field*seam*(.06+.20*damp);
            #endif
            weather-=damp*rising*.28+runoff*.15;
            diffuseColor.rgb*=vec3(weather,weather*(1.-.035*damp),weather*(1.-.085*damp));
          #elif defined(FINISH_CEILING)
            float damp=broad.r*.62+mid.r*.38;
            float leak=smoothstep(.59,.67,damp);
            float tide=leak*(1.-smoothstep(.64,.69,damp));
            diffuseColor.rgb*=vec3(.94,.95,.92)+vec3(patina*.18)-leak*vec3(.10,.18,.27)-vec3(.10)*tide;
            #ifdef ACOUSTIC
              // Occasional slotted return-air grilles sit flush in the T-grid.
              vec2 grid=finishUv/vec2(.6,1.2);
              vec2 cell=floor(grid);
              if(mod(dot(cell,vec2(37.,11.)),149.)<.5) {
                vec2 bay=abs(fract(grid)-.5);
                float edge=max(bay.x/.43,bay.y/.218);
                float frame=1.-smoothstep(.985,1.,edge);
                float grille=1.-smoothstep(.93,.95,edge);
                float vane=fract(grid.y*44.);
                float slots=(1.-smoothstep(.10,.51,vane))*smoothstep(.005,.10,vane);
                slots=mix(slots,.27,smoothstep(.15,.8,fwidth(grid.y*44.)));
                diffuseColor.rgb*=1.-frame*.18-grille*(.12+.65*slots);
              }
            #endif
          #elif defined(FINISH_CONCRETE)
            vec3 pores=texture2D(finishNoise,finishUv*1.5).rgb;
            float deposit=smoothstep(.47,.75,mid.r)*smoothstep(.46,.72,broad.r);
            diffuseColor.rgb*=(.96+patina*.44+(pores.b-.5)*.34-deposit*.26);
          #else
            float scum=smoothstep(.49,.76,mid.r*.6+broad.r*.4);
            diffuseColor.rgb*=vec3(1.,1.,.98)*(1.-scum*.14+patina*.16);
          #endif
        `,
          )
          .replace(
            '#include <opaque_fragment>',
            `
          #ifdef FINISH_TILE
            // Glazed ceramic catches a soft, camera-dependent reflection of
            // the strongest visible fluorescent. Grout stays rough.
            float strength=length(keyLight);
            vec3 halfDir=normalize(keyLight/max(.001,strength)+normalize(vViewPosition));
            float lobe=pow(max(dot(normal,halfDir),0.),38.);
            float glaze=smoothstep(.16,.56,dot(diffuseColor.rgb,vec3(.21,.72,.07)));
            outgoingLight+=vec3(.54,.69,.68)*lobe*strength*glaze*.34;
          #endif
          #include <opaque_fragment>
        `,
          )
      }
      materials.set(name, mat)
    }
    return materials.get(name)
  }
  for (const area of Object.values(AREAS)) {
    for (const key of [area.wall, area.worn, area.floor, area.ceiling])
      material(key)
  }
  const details = createDetailsKit(THREE, texture)
  const diffuser = diffuserMap(),
    lens = new THREE.MeshBasicMaterial({ map: diffuser })
  const frame = new THREE.MeshLambertMaterial({ color: 0x575449 })
  const dummy = new THREE.Object3D(),
    color = new THREE.Color()
  function mountLights(chunk, group) {
    const fixtures = chunk.fixtures,
      count = fixtures.length
    const bases = new THREE.InstancedMesh(fixturesGeometry, frame, count)
    const glass = new THREE.InstancedMesh(glassGeometry, lens, count)
    fixtures.forEach(([x, z, power, along], i) => {
      const industrial = chunk.area.id === 'maintenance',
        sealed = chunk.area.id === 'pool'
      const length = industrial ? 1.64 : 1.2,
        width = industrial ? 0.19 : sealed ? 0.34 : 0.6
      const depth = industrial ? 0.095 : sealed ? 0.062 : 0.022
      dummy.position.set(x, HEIGHT - depth * 0.5, z)
      dummy.rotation.set(0, (along * Math.PI) / 2, 0)
      dummy.scale.set(length, depth, width)
      dummy.updateMatrix()
      bases.setMatrixAt(i, dummy.matrix)
      dummy.position.y = HEIGHT - depth - 0.001
      dummy.rotation.set(Math.PI / 2, 0, (along * Math.PI) / 2)
      dummy.scale.set(length - 0.036, width - 0.035, 1)
      dummy.updateMatrix()
      glass.setMatrixAt(i, dummy.matrix)
      const [r, g, b] = chunk.area.tint
      glass.setColorAt(
        i,
        color
          .setRGB(0.84 + 0.34 * r, 0.85 + 0.33 * g, 0.79 + 0.36 * b)
          .multiplyScalar(
            power < 0.68
              ? 0.37 + power * 0.35
              : Math.min(1.34, 0.72 + power * 0.33),
          ),
      )
    })
    group.add(bases, glass)
    return [bases, glass]
  }

  const entryInk = canvasMap(256, 320, (ctx) => {
    ctx.fillStyle = '#52452e'
    ctx.textAlign = 'left'
    ctx.font = 'bold 42px sans-serif'
    ctx.fillText('LEVEL', 18, 70)
    ctx.font = 'bold 190px sans-serif'
    ctx.fillText('0', 8, 245)
    ctx.fillRect(18, 267, 103, 8)
  })
  const ink = new THREE.MeshBasicMaterial({
    map: entryInk,
    transparent: true,
    opacity: 0.73,
    depthWrite: false,
  })
  const entryGrille = new THREE.MeshLambertMaterial({ color: 0x877d64 })
  function entryDetails(group) {
    const stencil = new THREE.Mesh(glassGeometry, ink)
    stencil.scale.set(0.69, 0.86, 1)
    stencil.position.set(15.13, 1.67, 15.654)
    group.add(stencil)
    function box(mat, x, y, z, w, h, d) {
      const mesh = new THREE.Mesh(fixturesGeometry, mat)
      mesh.position.set(x + 12, y, z + 12)
      mesh.scale.set(w, h, d)
      group.add(mesh)
    }
    box(frame, 3, 0.39, 3.654, 0.57, 0.26, 0.024)
    for (let i = 0; i < 6; i++)
      box(entryGrille, 3, 0.306 + i * 0.033, 3.678, 0.51, 0.013, 0.024)
    for (const z of [5.8, 8]) {
      box(entryGrille, -3.183, 0.36, z, 0.028, 0.12, 0.085)
      box(frame, -3.167, 0.36, z, 0.006, 0.021, 0.038)
    }
  }

  const active = new Map()
  let wanted = new Set(),
    queue = [],
    lastX,
    lastZ,
    worker,
    inFlight = false,
    disposed = false
  const key = (x, z) => x + ',' + z
  function mount(cx, cz, surfaces) {
    const id = key(cx, cz)
    if (active.has(id)) return
    const c = layout.chunk(cx, cz),
      group = new THREE.Group(),
      owned = []
    group.name = 'Chunk ' + id
    group.position.set(c.x, 0, c.z)
    for (const data of surfaces) {
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(data.positions, 3),
      )
      geometry.setAttribute(
        'normal',
        new THREE.BufferAttribute(data.normals, 3),
      )
      geometry.setAttribute('color', new THREE.BufferAttribute(data.colors, 3))
      geometry.setAttribute('uv', new THREE.BufferAttribute(data.uvs, 2))
      geometry.setIndex(new THREE.BufferAttribute(data.indices, 1))
      if (data.lampDirections)
        geometry.setAttribute(
          'lampDirection',
          new THREE.BufferAttribute(data.lampDirections, 3, true),
        )
      const surface = new THREE.Mesh(geometry, material(data.key))
      surface.castShadow = true
      surface.receiveShadow = true
      group.add(surface)
      owned.push(geometry)
    }
    const lamps = mountLights(c, group)
    if (!cx && !cz) entryDetails(group)
    details.decorate(group, c)
    root.add(group)
    active.set(id, { group, owned, lamps })
  }
  function remove(id) {
    const c = active.get(id)
    root.remove(c.group)
    for (const geo of c.owned) geo.dispose()
    for (const lamp of c.lamps) lamp.dispose()
    active.delete(id)
  }
  function next() {
    if (inFlight || disposed) return
    while (queue.length) {
      const [cx, cz] = queue.shift()
      if (active.has(key(cx, cz))) continue
      if (worker) {
        inFlight = true
        worker.postMessage({ seed, cx, cz })
      } else mount(cx, cz, bakeChunk(layout, cx, cz))
      break
    }
  }
  function plan(x, z) {
    const { cx, cz } = getChunkCoordinates(x, z)
    if (cx === lastX && cz === lastZ) return
    lastX = cx
    lastZ = cz
    queue = []
    wanted = new Set()
    for (let j = -STREAM_RADIUS; j <= STREAM_RADIUS; j++)
      for (let i = -STREAM_RADIUS; i <= STREAM_RADIUS; i++) {
        const a = cx + i,
          b = cz + j,
          id = key(a, b)
        wanted.add(id)
        if (!active.has(id)) queue.push([a, b])
      }
    for (const id of active.keys()) if (!wanted.has(id)) remove(id)
    // Rare teleports must never expose a missing collision floor.
    if (!active.has(key(cx, cz))) mount(cx, cz, bakeChunk(layout, cx, cz))
    queue.sort(
      (a, b) =>
        (a[0] * CHUNK_SIZE - x) ** 2 +
        (a[1] * CHUNK_SIZE - z) ** 2 -
        (b[0] * CHUNK_SIZE - x) ** 2 -
        (b[1] * CHUNK_SIZE - z) ** 2,
    )
  }

  try {
    worker = new Worker(new URL('./world-worker.js', import.meta.url), {
      type: 'module',
    })
    worker.onmessage = ({ data }) => {
      inFlight = false
      if (disposed) return
      if (wanted.has(key(data.cx, data.cz)))
        mount(data.cx, data.cz, data.surfaces)
      next()
    }
    worker.onerror = () => {
      worker.terminate()
      worker = null
      inFlight = false
      lastX = undefined // rebuild the queue, including the interrupted request
    }
  } catch {
    // Environments without workers bake one peripheral chunk per update.
    worker = null
  }

  function update(time, delta, x = SPAWN.x, z = SPAWN.z) {
    if (disposed) return
    plan(x, z)
    next()
    details.update?.(time)
    const area = layout.getArea(x, z)
    fog.color.lerp(
      fogColors[area.id],
      1 - Math.exp(-Math.min(delta, 0.1) * 1.8),
    )
    const brightness =
      0.979 + 0.021 * Math.sin(time * 29) * Math.sin(time * 2.7)
    lens.color.setRGB(brightness, brightness, brightness)
  }
  update(0, 0)
  function dispose() {
    if (disposed) return
    disposed = true
    worker?.terminate()
    for (const id of active.keys()) remove(id)
    scene.remove(root)
    if (scene.fog === fog) scene.fog = null
    details.dispose()
    for (const mat of materials.values()) mat.dispose()
    for (const map of maps.values()) map.dispose()
    for (const resource of [
      fixturesGeometry,
      glassGeometry,
      diffuser,
      surfaceNoise,
      lens,
      frame,
      entryInk,
      ink,
      entryGrille,
    ])
      resource.dispose()
    materials.clear()
    maps.clear()
    queue = []
    wanted.clear()
    layout.clear()
  }
  return {
    spawn: SPAWN,
    ready,
    canStand: layout.canStand,
    getArea: layout.getArea,
    getCeilingLight: layout.getCeilingLight,
    update,
    dispose,
    getStreamStats: () => ({
      chunks: active.size,
      cacheSize: layout.cacheSize,
      maxChunks: MAX_CHUNKS,
    }),
  }
}
