import * as THREE from 'three'

// Each ring describes height, centre and elliptical radii in local space.
// Slightly uneven profiles give the figure a continuous, asymmetrical outline
// in ambient light, with sunken facial planes visible in the flashlight.
export function createListenerModel() {
  const figure = new THREE.Group()
  figure.name = 'The Listener'
  const bark = new THREE.MeshStandardMaterial({
    color: 0x302e29,
    roughness: 0.98,
    vertexColors: true,
    metalness: 0,
  })
  const skin = bark.clone()
  skin.color.set(0x57544a)
  const geometry = []
  const rig = new THREE.Group()
  figure.add(rig)

  // The level's ceiling light is baked into its surfaces. Shape only the
  // ambient contribution here; direct flashlight intensity and shadowing
  // continue through Three's standard lighting path.
  const ceiling = { value: new THREE.Vector3(-0.65, 0.68, 0.34).normalize() }
  const tint = { value: new THREE.Color(1.04, 0.98, 0.85) }
  const energy = { value: 1 }
  for (const mat of [skin, bark]) {
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, {
        listenerLightDir: ceiling,
        listenerTint: tint,
        listenerEnergy: energy,
      })
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform vec3 listenerLightDir;
          uniform vec3 listenerTint;
          uniform float listenerEnergy;`,
        )
        .replace(
          '#include <aomap_fragment>',
          `#include <aomap_fragment>
          vec3 fixtureDir = (viewMatrix * vec4(listenerLightDir, 0.0)).xyz;
          float wrap = clamp((dot(normal,fixtureDir) + 0.25) / 1.25,0.0,1.0);
          reflectedLight.directSpecular *= 0.40;
          reflectedLight.indirectDiffuse *= (0.30 + listenerEnergy * 1.70 * wrap) * listenerTint;`,
        )
    }
  }

  // A broad penumbra extends away from the fixture; shorter contact patches
  // track each moving foot. All three share a small, softly feathered texture.
  const size = 64,
    pixels = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const r = Math.hypot((2 * x + 1) / size - 1, (2 * y + 1) / size - 1)
      const falloff = Math.max(0, 1 - r * r)
      const k = (y * size + x) * 4
      pixels[k] = pixels[k + 1] = pixels[k + 2] = 255
      pixels[k + 3] = Math.round(255 * falloff ** 2.4)
    }
  const softness = new THREE.DataTexture(pixels, size, size)
  softness.magFilter = softness.minFilter = THREE.LinearFilter
  softness.needsUpdate = true
  const groundPlane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
  geometry.push(groundPlane)
  const shadows = []
  function patch() {
    const material = new THREE.MeshBasicMaterial({
      map: softness,
      color: 0x0b0a07,
      transparent: true,
      depthWrite: false,
    })
    const mesh = new THREE.Mesh(groundPlane, material)
    mesh.position.y = -0.002
    mesh.renderOrder = -1
    figure.add(mesh)
    shadows.push(mesh)
    return mesh
  }
  const penumbra = patch(),
    footContacts = [patch(), patch()]
  const targetLight = new THREE.Vector3(),
    targetTint = new THREE.Color()
  let targetEnergy = 1,
    opacity = 1
  const foot = new THREE.Vector3()
  function sample(light) {
    if (light) {
      targetLight
        .set(light.x - figure.position.x, 1.9, light.z - figure.position.z)
        .normalize()
      const c = light.tint || [1.06, 1.0, 0.88]
      targetTint.setRGB(
        0.58 + c[0] * 0.43,
        0.57 + c[1] * 0.42,
        0.55 + c[2] * 0.42,
      )
      targetEnergy = THREE.MathUtils.clamp(light.power, 0.55, 1.3)
    } else {
      targetLight.set(-0.55, 0.8, 0.3).normalize()
      targetTint.setRGB(0.98, 0.97, 0.92)
      targetEnergy = 0.68
    }
  }
  function illuminate(dt) {
    const blend = 1 - Math.exp(-6 * dt)
    ceiling.value.lerp(targetLight, blend).normalize()
    tint.value.lerp(targetTint, blend)
    energy.value += (targetEnergy - energy.value) * blend
    // Convert the direction away from the ceiling light to figure space.
    const angle =
      Math.atan2(-ceiling.value.x, -ceiling.value.z) - figure.rotation.y
    const shift = 0.45 * Math.hypot(ceiling.value.x, ceiling.value.z)
    penumbra.rotation.y = angle
    penumbra.position.x = Math.sin(angle) * shift
    penumbra.position.z = Math.cos(angle) * shift
    penumbra.scale.set(0.94, 1, 1.0 + shift * 2.2)
    penumbra.material.opacity = (0.24 + 0.14 * energy.value) * opacity
  }
  sample(null)
  illuminate(1)

  function joint(parent, x, y, z) {
    const group = new THREE.Group()
    group.position.set(x, y, z)
    parent.add(group)
    return group
  }

  function shell(parent, rings, mat = bark, facial = false) {
    const n = facial ? 24 : 12
    const vertices = [],
      colors = [],
      indices = []
    const rows = rings.slice().sort((a, b) => a[0] - b[0])
    for (const [y, cx, cz, rx, rz] of rows) {
      for (let i = 0; i < n; i++) {
        const theta = (i / n) * Math.PI * 2
        const side = Math.cos(theta),
          front = Math.sin(theta)
        const rib =
          1 +
          0.047 * Math.cos(5 * theta + 1.7 * y) +
          0.034 * Math.sin(3 * theta - y)
        const x = cx + rx * side * rib
        let z = cz + rz * front * rib
        // Variation follows the length of each form. The lighter edge and
        // irregular creases remain visible in a straight-on flashlight beam.
        const crease = Math.max(0, Math.cos(3 * theta + 1.6 * y)) ** 6
        let shade = 0.81 + 0.18 * rib + 0.14 * side - 0.2 * crease
        if (parent === upper && front > 0) {
          const collar = Math.exp(
            -((y - 0.7 + 0.14 * Math.abs(x)) ** 2 / 0.006),
          )
          const sternum = Math.exp(-((x * x) / 0.001 + (y - 0.52) ** 2 / 0.06))
          z += front * (0.021 * collar - 0.028 * sternum)
          shade *= 1 + 0.1 * collar - 0.28 * sternum
        }
        if (facial && front > 0) {
          // Brow overhang, a narrow nasal ridge and paired deep sockets.
          const socket = Math.exp(
            -((Math.abs(x) - 0.055) ** 2 / 0.00065 + (y - 0.19) ** 2 / 0.00036),
          )
          const ridge = Math.exp(
            -((x * x) / 0.00036 + (y - 0.135) ** 2 / 0.0025),
          )
          z += front * (0.045 * ridge - 0.047 * socket)
          shade *= 1 - 0.64 * socket * front
        }
        vertices.push(x, y, z)
        colors.push(shade, shade * 0.986, shade * 0.957)
      }
    }
    for (let j = 0; j < rows.length - 1; j++) {
      for (let i = 0; i < n; i++) {
        const a = j * n + i,
          b = j * n + ((i + 1) % n)
        indices.push(a, a + n, b, b, a + n, b + n)
      }
    }
    const top = (rows.length - 1) * n
    for (let i = 1; i < n - 1; i++)
      indices.push(0, i, i + 1, top, top + i + 1, top + i)
    const shape = new THREE.BufferGeometry()
    shape.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(vertices, 3),
    )
    shape.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    shape.setIndex(indices)
    shape.computeVertexNormals()
    geometry.push(shape)
    const mesh = new THREE.Mesh(shape, mat)
    mesh.castShadow = true
    mesh.receiveShadow = true
    parent.add(mesh)
  }

  const upper = joint(rig, 0, 1.05, 0)
  shell(upper, [
    [-0.075, 0, -0.02, 0.075, 0.058],
    [0.01, -0.01, -0.025, 0.137, 0.109],
    [0.17, -0.026, -0.015, 0.111, 0.087],
    [0.33, -0.043, 0.01, 0.115, 0.099],
    [0.53, -0.052, 0.028, 0.185, 0.123],
    [0.71, -0.045, 0.053, 0.223, 0.118],
    [0.79, -0.078, 0.066, 0.145, 0.093],
    [0.83, -0.09, 0.077, 0.075, 0.072],
    [0.99, -0.097, 0.128, 0.077, 0.07],
  ])
  const head = joint(upper, -0.098, 0.925, 0.14)
  shell(
    head,
    [
      [0, -0.008, -0.004, 0.041, 0.035],
      [0.038, -0.005, 0.014, 0.064, 0.074],
      [0.09, -0.01, 0.005, 0.091, 0.088],
      [0.14, -0.012, -0.002, 0.111, 0.093],
      [0.17, -0.011, -0.009, 0.117, 0.091],
      [0.195, -0.009, -0.009, 0.122, 0.102],
      [0.215, -0.008, -0.002, 0.121, 0.114],
      [0.255, -0.005, -0.015, 0.118, 0.106],
      [0.31, 0.001, -0.034, 0.104, 0.096],
      [0.354, 0.009, -0.047, 0.073, 0.071],
      [0.371, 0.011, -0.047, 0.028, 0.033],
    ],
    skin,
    true,
  )

  const hips = [],
    knees = [],
    shoulders = [],
    elbows = []
  for (const s of [-1, 1]) {
    const hip = joint(rig, s * 0.084, 1.075, -0.028)
    const knee = joint(hip, s * 0.054, -0.529, 0.053)
    shell(hip, [
      [0, 0, 0, 0.086, 0.097],
      [-0.17, s * 0.018, 0.009, 0.091, 0.083],
      [-0.35, s * 0.043, 0.034, 0.068, 0.066],
      [-0.53, s * 0.054, 0.053, 0.053, 0.058],
    ])
    shell(knee, [
      [0.025, 0, 0, 0.054, 0.06],
      [-0.095, s * 0.004, -0.012, 0.06, 0.056],
      [-0.23, s * 0.019, -0.045, 0.051, 0.054],
      [-0.45, s * 0.042, -0.077, 0.031, 0.038],
      [-0.514, s * 0.042, -0.037, 0.046, 0.092],
      [-0.542, s * 0.043, 0.003, 0.051, 0.125],
    ])
    const shoulder = joint(
      upper,
      -0.049 + s * 0.185,
      s < 0 ? 0.745 : 0.705,
      0.048,
    )
    const elbow = joint(shoulder, s * 0.097, -0.505, -0.073)
    shell(shoulder, [
      [0.026, 0, 0, 0.069, 0.069],
      [-0.109, s * 0.04, -0.015, 0.07, 0.069],
      [-0.33, s * 0.083, -0.047, 0.049, 0.05],
      [-0.51, s * 0.097, -0.073, 0.042, 0.043],
    ])
    shell(elbow, [
      [0.012, 0, 0, 0.046, 0.045],
      [-0.152, -s * 0.014, 0.019, 0.052, 0.047],
      [-0.396, -s * 0.045, 0.066, 0.029, 0.031],
      [-0.509, -s * 0.053, 0.087, 0.026, 0.031],
      [-0.565, -s * 0.065, 0.112, 0.044, 0.035],
      [-0.64, -s * 0.059, 0.132, 0.032, 0.029],
      [-0.714, -s * 0.035, 0.13, 0.009, 0.013],
    ])
    hips.push(hip)
    knees.push(knee)
    shoulders.push(shoulder)
    elbows.push(elbow)
  }
  figure.visible = false
  function pose(phase, stride, animate = true) {
    const amount = animate ? stride : 0
    const breath = animate ? Math.sin(phase * 0.65) : 0
    let supportHeight = Infinity
    upper.rotation.z = -0.041 + amount * 0.025 * Math.sin(phase)
    upper.rotation.x = 0.047 + amount * 0.04
    head.rotation.z = 0.245 + 0.046 * breath
    head.rotation.y = -0.095 + 0.075 * breath
    for (let i = 0; i < 2; i++) {
      const t = phase + i * Math.PI
      const swing = amount * Math.sin(t)
      hips[i].rotation.x = -0.045 + swing * 0.5
      knees[i].rotation.x = 0.04 + amount * Math.max(0, Math.cos(t)) * 0.65
      shoulders[i].rotation.x = (i ? 0.06 : -0.11) - swing * (i ? 0.09 : 0.21)
      elbows[i].rotation.x = (i ? -0.15 : -0.25) - 0.09 * Math.max(0, swing)
      hips[i].updateMatrix()
      knees[i].updateMatrix()
      foot
        .set(i ? 0.043 : -0.043, -0.542, 0.003)
        .applyMatrix4(knees[i].matrix)
        .applyMatrix4(hips[i].matrix)
      const shadow = footContacts[i]
      shadow.position.x = foot.x
      shadow.position.z = foot.z
      // Either the heel or the toe carries the figure's weight as it steps.
      const ankleAngle = knees[i].rotation.x + hips[i].rotation.x
      shadow.userData.soleHeight =
        foot.y - Math.abs(Math.sin(ankleAngle)) * 0.12
      supportHeight = Math.min(supportHeight, shadow.userData.soleHeight)
    }
    rig.position.y = -0.012 - supportHeight
    for (const shadow of footContacts) {
      const lift = THREE.MathUtils.clamp(
        shadow.userData.soleHeight - supportHeight,
        0,
        0.35,
      )
      shadow.scale.set(0.33 + lift, 1, 0.49 + lift)
      shadow.material.opacity = opacity * (0.59 - lift * 1.2)
    }
  }
  pose(0, 0)
  return {
    figure,
    pose,
    sample,
    illuminate,
    lean(angle) {
      rig.rotation.x = angle
    },
    fade(alpha) {
      opacity = alpha
      const fading = alpha < 1
      for (const mat of [skin, bark]) {
        if (mat.transparent !== fading) {
          mat.transparent = fading
          mat.needsUpdate = true
        }
        mat.opacity = alpha
      }
      if (alpha === 0) for (const mesh of shadows) mesh.material.opacity = 0
    },
    dispose() {
      figure.removeFromParent()
      for (const g of geometry) g.dispose()
      bark.dispose()
      skin.dispose()
      softness.dispose()
      for (const mesh of shadows) mesh.material.dispose()
    },
  }
}
