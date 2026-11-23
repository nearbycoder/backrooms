import * as THREE from 'three'

// Photograph-like reflector falloff: a pale hotspot, a wide spill and a
// soft, irregular ring near the edge of the pressed-glass lens.
function beamTexture() {
  const size = 192,
    canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  const image = ctx.createImageData(size, size)
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = ((x + 0.5) / size) * 2 - 1,
        dy = ((y + 0.5) / size) * 2 - 1
      const angle = Math.atan2(dy, dx)
      const r =
        Math.hypot(dx, dy) *
        (1 + 0.014 * Math.sin(7 * angle) + 0.009 * Math.cos(11 * angle))
      const spot = 0.74 * Math.exp(-r * r * 8.8)
      const spill = 0.29 * Math.exp(-r * r * 1.9)
      const ring = 0.045 * Math.exp(-((r - 0.64) ** 2) * 380)
      const k = Math.min(1, spot + spill + ring)
      const i = (y * size + x) * 4
      image.data[i] = k * 255
      image.data[i + 1] = k * (250 + 5 * spot)
      image.data[i + 2] = k * (226 + 29 * spot)
      image.data[i + 3] = 255
    }
  ctx.putImageData(image, 0, 0)
  return new THREE.CanvasTexture(canvas)
}

function casingTexture() {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 128
  const ctx = c.getContext('2d')
  const pixels = ctx.createImageData(c.width, c.height)
  let seed = 0x7261
  const random = () =>
    (seed = (Math.imul(1664525, seed) + 1013904223) >>> 0) / 4294967296
  for (let y = 0; y < c.height; y++)
    for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4
      const cross = (x + y) % 8 === 0 || (x - y + 256) % 8 === 0
      const brightness = (cross ? 138 : 186) + random() * 29
      pixels.data[i] = brightness
      pixels.data[i + 1] = brightness
      pixels.data[i + 2] = brightness
      pixels.data[i + 3] = 255
    }
  ctx.putImageData(pixels, 0, 0)
  for (let i = 0; i < 100; i++) {
    const x = random() * c.width,
      y = random() * c.height
    ctx.strokeStyle = 'rgba(220,215,190,' + (0.15 + random() * 0.45) + ')'
    ctx.lineWidth = 0.5
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + random() * 9, y + random() * 2 - 1)
    ctx.stroke()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function bezelFinish() {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 96
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#4f5048'
  ctx.fillRect(0, 0, 512, 96)
  // Uneven anodizing, old silkscreen and worn high points of the front ring.
  for (let y = 0; y < 96; y++) {
    ctx.fillStyle = y % 9 === 0 ? '#45463f' : 'rgba(185,186,161,.06)'
    ctx.fillRect(0, y, 512, 0.5)
  }
  ctx.font = 'bold 15px monospace'
  ctx.fillStyle = '#c0bda7'
  ctx.textAlign = 'center'
  for (let n = 0; n < 4; n++) {
    const x = 64 + n * 128
    ctx.fillText('L-04', x, 57)
    for (let i = 0; i < 5; i++) ctx.fillRect(x - 21 + i * 10, 29, 6, 3)
  }
  for (let i = 0; i < 210; i++) {
    const x = (i * 131) % 509,
      y = (i * 109) % 83
    ctx.fillStyle = i % 4 ? 'rgba(45,46,39,.35)' : 'rgba(207,201,174,.5)'
    ctx.fillRect(x, y, 1 + (i % 7), 1)
  }
  const t = new THREE.CanvasTexture(canvas)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

export function createFlashlightView(light) {
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(64, 1, 0.04, 3)
  const housing = new THREE.Group()
  const key = new THREE.DirectionalLight(0xffeac4, 2.5)
  key.position.set(-2, 4, -1)
  const rim = new THREE.DirectionalLight(0xc9d9d7, 2.1)
  rim.position.set(3, 1, -3)
  scene.add(
    housing,
    key,
    rim,
    new THREE.HemisphereLight(0xd3d0bc, 0x252922, 1.2),
  )
  const gripMap = casingTexture()
  const beam = beamTexture()
  const bezelMap = bezelFinish()
  light.map = beam
  light.castShadow = true
  light.shadow.mapSize.set(512, 512)
  light.shadow.bias = -0.00035
  light.shadow.normalBias = 0.018
  light.shadow.camera.near = 0.07
  const metal = (color, roughness, metalness = 0) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness })
  const enamel = metal(0x41433b, 0.37, 0.4)
  const anodized = metal(0x252923, 0.51, 0.35)
  const nickel = metal(0x9a9b8e, 0.32, 0.52)
  const rubber = metal(0x191b18, 0.87)
  const band = metal(0xe1e0d9, 0.53, 0.29)
  band.map = bezelMap
  enamel.roughnessMap = gripMap
  const grip = metal(0x4e5047, 0.72, 0.15)
  grip.map = gripMap
  grip.bumpMap = gripMap
  grip.bumpScale = 0.00027
  const meshes = []
  function add(geometry, mat, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(geometry, mat)
    m.position.set(x, y, z)
    housing.add(m)
    meshes.push(m)
    return m
  }
  // Profiles are specified in metres from the front of the reflector.
  function shell(points, mat) {
    add(
      new THREE.LatheGeometry(
        points.map(([r, z]) => new THREE.Vector2(r, z)),
        40,
      ).rotateX(Math.PI / 2),
      mat,
    )
  }
  shell(
    [
      [0.043, 0],
      [0.048, 0],
      [0.051, 0.004],
      [0.051, 0.011],
      [0.048, 0.014],
      [0.048, 0.032],
      [0.051, 0.035],
      [0.051, 0.041],
      [0.047, 0.043],
      [0.047, 0.049],
      [0.05, 0.051],
      [0.05, 0.056],
      [0.046, 0.059],
      [0.044, 0.078],
      [0.033, 0.101],
      [0.031, 0.113],
    ],
    enamel,
  )
  shell(
    [
      [0.048, 0.002],
      [0.0512, 0.003],
      [0.0512, 0.005],
      [0.0502, 0.006],
    ],
    nickel,
  )
  shell(
    [
      [0.031, 0.108],
      [0.033, 0.115],
      [0.033, 0.17],
      [0.031, 0.176],
      [0.031, 0.31],
    ],
    anodized,
  )
  shell(
    [
      [0.031, 0.172],
      [0.034, 0.177],
      [0.034, 0.355],
      [0.032, 0.361],
    ],
    grip,
  )
  shell(
    [
      [0.0483, 0.0145],
      [0.0483, 0.0317],
    ],
    band,
  )
  for (const z of [0.117, 0.168, 0.181, 0.345])
    shell(
      [
        [0.032, z],
        [0.0345, z + 0.001],
        [0.0345, z + 0.003],
        [0.032, z + 0.004],
      ],
      anodized,
    )
  const switchBezel = add(
    new THREE.CylinderGeometry(0.013, 0.013, 0.004, 24),
    nickel,
    0,
    0.031,
    0.139,
  )
  switchBezel.rotation.z = -0.2
  const button = add(
    new THREE.SphereGeometry(1, 18, 10),
    rubber,
    0.001,
    0.034,
    0.139,
  )
  button.scale.set(0.011, 0.004, 0.011)

  // A work-glove thumb rests along the switch; the cuff and the rest of the
  // grip continue below the camera edge. Broad seams pick up the side light.
  const leather = metal(0x302b24, 0.92)
  leather.bumpMap = gripMap
  leather.bumpScale = 0.00016
  const thumbPath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.045, -0.018, 0.217),
    new THREE.Vector3(0.048, 0.01, 0.182),
    new THREE.Vector3(0.036, 0.029, 0.156),
    new THREE.Vector3(0.022, 0.039, 0.125),
  ])
  const thumb = add(
    new THREE.TubeGeometry(thumbPath, 14, 0.014, 12, false),
    leather,
  )
  thumb.scale.y = 0.85
  const tip = add(
    new THREE.SphereGeometry(1, 14, 10),
    leather,
    0.022,
    0.033,
    0.124,
  )
  tip.scale.set(0.014, 0.012, 0.014)
  for (let i = 0; i < 3; i++) {
    const knuckle = add(
      new THREE.SphereGeometry(1, 14, 10),
      leather,
      -0.02,
      -0.022,
      0.177 + i * 0.029,
    )
    knuckle.scale.set(0.03, 0.023, 0.016)
    knuckle.rotation.z = -0.26
  }

  const forward = new THREE.Vector3(0, 0, -1),
    aim = new THREE.Vector3()
  const dtClamp = (time) => Math.min(time, 0.1)
  let raise = 0
  function update(view, enabled, delta, sway = 0) {
    raise = THREE.MathUtils.damp(raise, enabled ? 1 : 0, 24, dtClamp(delta))
    housing.visible = enabled || raise > 0.015
    if (!housing.visible) return
    if (view.fov !== camera.fov || view.aspect !== camera.aspect) {
      camera.fov = view.fov
      camera.aspect = view.aspect
      camera.updateProjectionMatrix()
    }
    // Keep the torch at the lower edge on portrait and wide screens alike.
    const half = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    const size = 0.85 * Math.min(1, Math.max(0.55, view.aspect))
    const z = -0.41
    housing.position.set(
      0.59 * half * view.aspect * -z + sway * 0.0015,
      -0.69 * half * -z - (1 - raise) * 0.15 + sway * 0.0025,
      z,
    )
    housing.scale.setScalar(size)
    aim.set(0, 0.04, -1.25).sub(housing.position).normalize()
    housing.quaternion.setFromUnitVectors(forward, aim)
  }
  return {
    update,
    render(renderer) {
      if (!housing.visible || raise < 0.015) return
      const clear = renderer.autoClear
      renderer.autoClear = false
      renderer.clearDepth()
      renderer.render(scene, camera)
      renderer.autoClear = clear
    },
    dispose() {
      for (const m of meshes) m.geometry.dispose()
      for (const m of [enamel, anodized, nickel, rubber, grip, band, leather])
        m.dispose()
      light.map = null
      light.shadow.dispose()
      gripMap.dispose()
      beam.dispose()
      bezelMap.dispose()
    },
  }
}
