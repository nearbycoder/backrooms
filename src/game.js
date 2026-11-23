import * as THREE from 'three'
import { createCameraFinish } from './camera-finish.js'
import { createFlashlightView } from './flashlight.js'
import { createAudio } from './audio.js'
import { createApparition } from './apparition.js'
import { createWorld } from './world.js'
import { createTrail } from './trail.js'
import { createGamepad } from './gamepad.js'

const GAME_KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ShiftLeft',
  'ShiftRight',
  'KeyE',
  'KeyF',
  'Escape',
])
const clamp = THREE.MathUtils.clamp
const WALK_SPEED = 2.65
const RUN_SPEED = 7.6
const SPRINT_SECONDS = 10
const RECOVERY_SECONDS = 6.5
const HEADINGS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

export function createGame(
  canvas,
  {
    onHud,
    onPause,
    onLost,
    onReady,
    onInputMode,
    onMenuBack,
    onControllerChange,
  } = {},
) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  const optics = createCameraFinish(renderer)
  const scene = new THREE.Scene()
  let world = createWorld(scene, renderer)
  let baseFov = world.spawn.fov ?? 64
  const camera = new THREE.PerspectiveCamera(baseFov, 1, 0.055, 160)
  camera.rotation.order = 'YXZ'
  scene.add(camera)

  const flashlight = new THREE.SpotLight(
    0xfff0ca,
    37,
    23,
    Math.PI / 5.4,
    0.6,
    1.5,
  )
  flashlight.position.set(0.16, -0.15, -0.15)
  flashlight.target.position.set(0, -0.23, -9)
  flashlight.visible = false
  camera.add(flashlight, flashlight.target)

  const torch = createFlashlightView(flashlight)
  const audio = createAudio()
  const trail = createTrail(scene)
  let apparition = null
  let distance = 0
  let previousSeed = 0
  let motionOverride
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')
  const held = new Set()
  const events = new AbortController()
  const listener = (target, name, handler) =>
    target.addEventListener(name, handler, { signal: events.signal })
  let mode = 'title'
  let disposed = false
  let yaw, pitch
  let elapsed = 0
  let stamina = 1
  let exhausted = false
  let recoveryDelay = 0
  let velocityX = 0
  let velocityZ = 0
  let flashlightOn = false
  let sensitivity = 0.5
  let stepDistance = 0
  let bobPhase = 0
  let bobAmount = 0
  let lastHud = ''
  let previousTime = 0
  let lockedOnce = false
  let drag = null
  let walkTouch = null
  let lookTouch = null
  let touchSprint = false
  let inputMode = 'keyboard'
  let controllerSensitivity
  let invertY = false
  const pad = createGamepad({
    getMode: () => mode,
    isActive: () => inputMode === 'gamepad',
    onActive: () => setInputMode('gamepad'),
    onChange: onControllerChange,
    onDisconnect() {
      if (inputMode === 'gamepad') {
        pause()
        setInputMode(
          window.matchMedia('(pointer: coarse)').matches ? 'touch' : 'keyboard',
        )
      }
    },
    onBack: onMenuBack,
    onPause: pause,
    onLight: toggleFlashlight,
    onMark: interact,
  })
  function setInputMode(input) {
    if (inputMode === input) return
    inputMode = input
    if (input === 'gamepad' && document.pointerLockElement === canvas) unlock()
    onInputMode?.(input)
  }
  listener(window, 'pointerdown', (event) =>
    setInputMode(event.pointerType === 'touch' ? 'touch' : 'keyboard'),
  )
  window.addEventListener('keydown', () => setInputMode('keyboard'), {
    capture: true,
    signal: events.signal,
  })

  canvas.style.touchAction = 'none'

  function resize() {
    const width = Math.max(1, canvas.clientWidth)
    const height = Math.max(1, canvas.clientHeight)
    renderer.setSize(width, height, false)
    optics.resize()
    camera.aspect = width / height
    camera.updateProjectionMatrix()
  }
  const observer = new ResizeObserver(resize)
  observer.observe(canvas)
  resize()

  function placeCamera() {
    yaw = world.spawn.yaw || 0
    pitch = world.spawn.pitch || 0
    camera.position.set(
      world.spawn.x,
      world.spawn.height ?? 1.62,
      world.spawn.z,
    )
    camera.rotation.set(pitch, yaw, 0)
  }

  function clearInput() {
    pad.clear()
    held.clear()
    walkTouch = null
    lookTouch = null
    drag = null
    touchSprint = false
    velocityX = 0
    velocityZ = 0
    bobAmount = 0
  }

  function requestLook() {
    if (!canvas.requestPointerLock || document.pointerLockElement === canvas)
      return
    try {
      canvas.requestPointerLock()?.catch(() => {})
    } catch {
      // Drag-to-look remains available when this browser disables pointer lock.
    }
  }

  function unlock() {
    lockedOnce = false
    if (document.pointerLockElement === canvas) document.exitPointerLock?.()
  }

  function begin() {
    clearInput()
    mode = 'playing'
    previousTime = performance.now()
    audio.play()
    if (
      inputMode !== 'gamepad' &&
      !window.matchMedia('(pointer: coarse)').matches
    )
      requestLook()
    reportHud(true)
  }

  function setLamp(active) {
    flashlightOn = active
    flashlight.visible = active
    world.setFlashlight?.(active)
  }

  function resetRun(seed) {
    apparition?.dispose()
    world.dispose()
    trail.clear()
    world = createWorld(scene, renderer, seed === undefined ? {} : { seed })
    apparition =
      seed === undefined ? null : createApparition(scene, world, audio)
    camera.fov = baseFov
    camera.updateProjectionMatrix()
    distance = 0
    clearInput()
    elapsed = 0
    stamina = 1
    exhausted = false
    recoveryDelay = 0
    stepDistance = 0
    bobPhase = 0
    setLamp(false)
    placeCamera()
  }

  function start() {
    const random = new Uint32Array(1)
    window.crypto.getRandomValues(random)
    const seed = random[0] === previousSeed ? (random[0] + 1) >>> 0 : random[0]
    previousSeed = seed
    resetRun(seed)
    begin()
  }

  function pause() {
    if (mode !== 'playing') return
    mode = 'paused'
    clearInput()
    unlock()
    audio.pause()
    onPause?.()
  }

  function reset() {
    mode = 'title'
    unlock()
    audio.pause()
    resetRun()
    reportHud(true)
  }

  function look(dx, dy, touch = false) {
    const scale = (touch ? 0.0035 : 0.00115) * (0.45 + 2.4 * sensitivity)
    yaw -= dx * scale
    pitch = clamp(pitch - dy * scale, -1.36, 1.36)
    camera.rotation.set(pitch, yaw, 0)
  }

  function snapshot() {
    const current = world.getArea(camera.position.x, camera.position.z)
    const octant = THREE.MathUtils.euclideanModulo(
      Math.round(-yaw / (Math.PI / 4)),
      8,
    )
    return {
      area: current.name,
      areaId: current.id,
      heading: HEADINGS[octant],
      distance: Math.floor(distance),
      markers: trail.count,
      flashlight: flashlightOn,
      stamina: Math.round(stamina * 100) / 100,
      elapsed: Math.floor(elapsed),
      threat: apparition?.threat || '',
    }
  }

  function reportHud(force = false) {
    const hud = snapshot()
    audio.setArea(hud.areaId)
    const key = JSON.stringify(hud)
    if (force || key !== lastHud) {
      lastHud = key
      onHud?.(hud)
    }
  }

  function interact() {
    if (mode !== 'playing') return
    if (trail.mark(camera.position, yaw, world)) {
      audio.mark()
      reportHud(true)
    }
  }

  function loseSignal() {
    mode = 'lost'
    clearInput()
    unlock()
    audio.pause()
    onLost?.(snapshot())
  }

  function toggleFlashlight() {
    if (mode !== 'playing') return
    setLamp(!flashlightOn)
    audio.switchClick()
    reportHud(true)
  }

  function updateMovement(delta, reducedMotion) {
    const turn = Number(held.has('ArrowLeft')) - Number(held.has('ArrowRight'))
    yaw += turn * 1.74 * delta
    const rotationSpeed = 0.85 + 2.55 * (controllerSensitivity ?? sensitivity)
    const stickCurve = 0.55 + 0.45 * Math.hypot(pad.aim.x, pad.aim.y)
    yaw -= pad.aim.x * stickCurve * rotationSpeed * delta
    pitch = clamp(
      pitch -
        pad.aim.y *
          (invertY ? -1 : 1) *
          stickCurve *
          rotationSpeed *
          0.77 *
          delta,
      -1.36,
      1.36,
    )
    let strafe =
      Number(held.has('KeyD')) -
      Number(held.has('KeyA')) +
      (walkTouch?.x || 0) +
      pad.move.x
    let forward =
      Number(held.has('KeyW') || held.has('ArrowUp')) -
      Number(held.has('KeyS') || held.has('ArrowDown')) -
      (walkTouch?.y || 0) -
      pad.move.y
    const strength = Math.hypot(strafe, forward)
    if (strength > 1) {
      strafe /= strength
      forward /= strength
    }
    const sprintHeld =
      held.has('ShiftLeft') ||
      held.has('ShiftRight') ||
      touchSprint ||
      pad.sprint
    const running = sprintHeld && !exhausted && strength > 0.15
    const targetSpeed = running ? RUN_SPEED : WALK_SPEED
    const targetX =
      (Math.cos(yaw) * strafe - Math.sin(yaw) * forward) * targetSpeed
    const targetZ =
      (-Math.sin(yaw) * strafe - Math.cos(yaw) * forward) * targetSpeed
    const changeX = targetX - velocityX,
      changeZ = targetZ - velocityZ
    const braking = !strength || velocityX * changeX + velocityZ * changeZ < 0
    const acceleration = braking ? 58 : running ? 43 : 36
    const amount = Math.min(
      1,
      (acceleration * delta) / (Math.hypot(changeX, changeZ) || 1),
    )
    velocityX += changeX * amount
    velocityZ += changeZ * amount

    const fromX = camera.position.x,
      fromZ = camera.position.z
    const nextX = fromX + velocityX * delta,
      nextZ = fromZ + velocityZ * delta
    // Release velocity against the blocked axis so changing direction at a
    // corner is immediate. The tangential component still slides along it.
    if (world.canStand(nextX, fromZ)) camera.position.x = nextX
    else velocityX = 0
    if (world.canStand(camera.position.x, nextZ)) camera.position.z = nextZ
    else velocityZ = 0
    const moved = Math.hypot(
      camera.position.x - fromX,
      camera.position.z - fromZ,
    )
    const speed = delta > 0 ? moved / delta : 0
    if (running && speed > WALK_SPEED + 0.15) {
      stamina = Math.max(0, stamina - delta / SPRINT_SECONDS)
      recoveryDelay = 0.55
      if (!stamina) exhausted = true
    } else {
      recoveryDelay = Math.max(0, recoveryDelay - delta)
      if (!recoveryDelay)
        stamina = Math.min(1, stamina + delta / RECOVERY_SECONDS)
      if (exhausted && stamina >= (sprintHeld ? 0.55 : 0.3)) exhausted = false
    }

    const sprintFraction = clamp(
      (speed - WALK_SPEED) / (RUN_SPEED - WALK_SPEED),
      0,
      1,
    )
    const targetFov = baseFov + 5 * sprintFraction
    const fov = reducedMotion
      ? baseFov
      : THREE.MathUtils.damp(camera.fov, targetFov, 7, delta)
    if (Math.abs(camera.fov - fov) > 0.0003) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }

    stepDistance += moved
    const stride = 1.3 + 1.04 * sprintFraction
    if (stepDistance >= stride) {
      stepDistance -= stride
      audio.step(sprintFraction > 0.35)
    }
    bobPhase += (moved / stride) * Math.PI
    bobAmount = THREE.MathUtils.damp(bobAmount, moved > 0.001 ? 1 : 0, 8, delta)
    camera.position.y =
      (world.spawn.height ?? 1.62) +
      (reducedMotion
        ? 0
        : Math.sin(bobPhase * 2) * bobAmount * (0.019 + 0.005 * sprintFraction))
    camera.rotation.set(pitch, yaw, 0)
  }

  listener(window, 'keydown', (event) => {
    if (
      mode !== 'playing' ||
      !GAME_KEYS.has(event.code) ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    )
      return
    event.preventDefault()
    held.add(event.code)
    if (event.repeat) return
    if (event.code === 'Escape') pause()
    if (event.code === 'KeyE') interact()
    if (event.code === 'KeyF') toggleFlashlight()
  })
  listener(window, 'keyup', (event) => held.delete(event.code))
  listener(window, 'blur', () => {
    pad.suspend()
    pause()
  })
  listener(document, 'visibilitychange', () => {
    if (document.hidden) pause()
  })
  listener(document, 'pointerlockchange', () => {
    if (document.pointerLockElement === canvas) {
      if (mode !== 'playing') {
        unlock()
        return
      }
      lockedOnce = true
      drag = null
    } else if (lockedOnce) {
      lockedOnce = false
      pause()
    }
  })
  listener(document, 'mousemove', (event) => {
    if (mode === 'playing' && document.pointerLockElement === canvas)
      look(event.movementX, event.movementY)
  })

  listener(canvas, 'pointerdown', (event) => {
    if (mode !== 'playing') return
    if (event.pointerType === 'touch') {
      setInputMode('touch')
      const rect = canvas.getBoundingClientRect()
      if (event.clientX < rect.left + rect.width / 2) {
        if (walkTouch) return
        walkTouch = {
          id: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          x: 0,
          y: 0,
        }
      } else {
        if (lookTouch) return
        lookTouch = { id: event.pointerId, x: event.clientX, y: event.clientY }
      }
    } else {
      if (event.button !== 0 || document.pointerLockElement === canvas) return
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY }
      requestLook()
    }
    canvas.setPointerCapture(event.pointerId)
  })
  listener(canvas, 'pointermove', (event) => {
    if (mode !== 'playing') return
    if (walkTouch?.id === event.pointerId) {
      walkTouch.x = clamp((event.clientX - walkTouch.startX) / 48, -1, 1)
      walkTouch.y = clamp((event.clientY - walkTouch.startY) / 48, -1, 1)
      return
    }
    const active = lookTouch?.id === event.pointerId ? lookTouch : drag
    if (
      active?.id !== event.pointerId ||
      document.pointerLockElement === canvas
    )
      return
    look(
      event.clientX - active.x,
      event.clientY - active.y,
      active === lookTouch,
    )
    active.x = event.clientX
    active.y = event.clientY
  })
  function releasePointer(event) {
    if (walkTouch?.id === event.pointerId) walkTouch = null
    if (lookTouch?.id === event.pointerId) lookTouch = null
    if (drag?.id === event.pointerId) drag = null
  }
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'])
    listener(canvas, name, releasePointer)

  placeCamera()
  renderer.setAnimationLoop((now) => {
    pad.poll(now)
    const elapsedSeconds = Math.max(0, (now - previousTime) / 1000)
    const delta = Math.min(elapsedSeconds, 0.25)
    previousTime = now
    const reducedMotion = motionOverride ?? motionPreference.matches
    if (mode === 'playing') {
      elapsed += elapsedSeconds
      // Bound individual collision steps even when streaming briefly slows a
      // frame. Movement and encounter timers then stay in sync on slower GPUs.
      const steps = Math.max(1, Math.ceil(delta / 0.04))
      const step = delta / steps
      let caught = false
      for (let i = 0; i < steps && !caught; i++) {
        updateMovement(step, reducedMotion)
        caught = apparition.update(camera, step, flashlightOn, reducedMotion)
      }
      distance = Math.max(
        distance,
        Math.hypot(
          camera.position.x - world.spawn.x,
          camera.position.z - world.spawn.z,
        ),
      )
      flashlight.intensity =
        37 * (1 - (reducedMotion ? 0 : apparition.surge * 0.32))
      reportHud()
      if (caught) loseSignal()
    }
    world.update(
      reducedMotion ? 0 : now / 1000,
      delta,
      camera.position.x,
      camera.position.z,
    )
    torch.update(
      camera,
      mode === 'playing' && flashlightOn,
      delta,
      reducedMotion ? 0 : Math.sin(bobPhase) * bobAmount,
    )
    optics.render(scene, camera, torch)
  })
  const menuWorld = world
  Promise.resolve(menuWorld.ready).then(() => {
    if (disposed || world !== menuWorld) return
    optics.render(scene, camera)
    onReady?.()
  })

  return {
    start,
    reset,
    pause,
    interact,
    toggleFlashlight,
    previewAudio: audio.preview,
    resume() {
      if (mode === 'paused') begin()
    },
    setSprint(held) {
      touchSprint = !!held
    },
    setSettings(settings) {
      if (Number.isFinite(settings.controllerSensitivity))
        controllerSensitivity = clamp(settings.controllerSensitivity, 0, 1)
      if (typeof settings.invertY === 'boolean') invertY = settings.invertY
      if (typeof settings.reducedMotion === 'boolean')
        motionOverride = settings.reducedMotion
      if (Number.isFinite(settings.baseFov) && settings.baseFov !== baseFov) {
        baseFov = clamp(settings.baseFov, 55, 88)
        camera.fov = baseFov
        camera.updateProjectionMatrix()
      }
      if (motionOverride ?? motionPreference.matches) {
        camera.position.y = world.spawn.height ?? 1.62
        if (camera.fov !== baseFov) {
          camera.fov = baseFov
          camera.updateProjectionMatrix()
        }
      }
      audio.setMix(settings)
      optics.setSettings(settings)
      if (Number.isFinite(settings.sensitivity))
        sensitivity = clamp(settings.sensitivity, 0, 1)
    },
    dispose() {
      disposed = true
      mode = 'disposed'
      unlock()
      events.abort()
      observer.disconnect()
      renderer.setAnimationLoop(null)
      audio.dispose()
      apparition?.dispose()
      trail.dispose()
      world.dispose()
      torch.dispose()
      optics.dispose()
      renderer.dispose()
    },
  }
}
