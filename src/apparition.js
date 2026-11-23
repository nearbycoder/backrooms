import * as THREE from 'three'

import { createListenerModel } from './listener-model.js'

export function createApparition(scene, world, audio) {
  const body = createListenerModel()
  const figure = body.figure
  scene.add(figure)
  const look = new THREE.Vector3()
  const target = new THREE.Vector3()
  const lastSeen = new THREE.Vector3()
  let phase = 'quiet'
  let wait = 9 + Math.random() * 3
  let eventNumber = 0
  let ambientWait = 4.5 + Math.random() * 3
  let ambientIndex = 0
  const sounds = {
    yellow: ['ballast', 'breath', 'static'],
    office: ['chair', 'breath', 'scrape'],
    maintenance: ['scrape', 'pipe', 'ballast'],
    pool: ['drip', 'pipe', 'drip'],
  }
  let age = 0
  let noSight = 0
  let fixtureCountdown = 0
  let sightCountdown = 0
  let hasSight = true
  let beamTime = 0
  let contact = 0
  let footTimer = 0
  let gait = 0
  let threat = ''
  let surge = 0

  function clearPath(a, dx, dz, distance) {
    // canStand includes player clearance; a half-meter sample cannot cross
    // the clearance envelope of a wall without testing a blocked point.
    for (let d = 0.35; d < distance; d += 0.42) {
      if (!world.canStand(a.x + dx * d, a.z + dz * d)) return false
    }
    return world.canStand(a.x + dx * distance, a.z + dz * distance)
  }

  function place(camera, hunt) {
    const pos = camera.position
    const preferred = hunt
      ? Math.PI * (0.4 + Math.random() * 0.9)
      : 0.24 + Math.random() * 0.22
    const side = Math.random() < 0.5 ? -1 : 1
    const yaw = camera.rotation.y
    for (let i = 0; i < 18; i++) {
      const offset =
        i === 0
          ? preferred * side
          : (((i % 2 ? 1 : -1) * Math.ceil(i / 2)) / 9) * Math.PI
      const angle = yaw + offset
      const dx = -Math.sin(angle),
        dz = -Math.cos(angle)
      let distance = 0
      for (let d = 0.35; d <= 12.5; d += 0.42) {
        if (!world.canStand(pos.x + dx * d, pos.z + dz * d)) break
        distance = d
      }
      if (distance < (hunt ? 6.7 : 5.5)) continue
      figure.position.set(pos.x + dx * distance, 0.015, pos.z + dz * distance)
      // Rotate the creature's local +Z toward the player.
      figure.rotation.y = angle
      figure.visible = true
      body.lean(0)
      body.sample(world.getCeilingLight?.(figure.position.x, figure.position.z))
      body.illuminate(2)
      fixtureCountdown = 0.25
      body.fade(1)
      body.pose(0, 0)
      age = 0
      beamTime = 0
      contact = 0
      noSight = 0
      footTimer = 0
      gait = 0
      sightCountdown = 0
      hasSight = true
      lastSeen.copy(pos)
      phase = hunt ? 'warning' : 'glimpse'
      threat = hunt ? 'Footsteps nearby' : 'Signal interference'
      audio.anomaly(hunt ? 'knock' : 'static', Math.sin(yaw - angle))
      surge = 1
      return true
    }
    return false
  }

  function rest(seconds) {
    figure.visible = false
    phase = 'quiet'
    wait = seconds
    ambientWait =
      Math.random() < 0.22 ? Infinity : seconds * (0.26 + Math.random() * 0.43)
    threat = ''
  }

  // Brief quiet events alternate with physical encounters. A failed spawn
  // retries later, allowing the player to leave a tight corner first.
  function update(camera, dt, lamp, reducedMotion) {
    surge = Math.max(0, surge - dt * 0.85)
    if (phase === 'quiet') {
      ambientWait -= dt
      if (ambientWait <= 0) {
        // An echo or a ballast sag can arrive in an otherwise empty room.
        // Keep at most one incidental cue between physical encounters.
        const area = world.getArea(camera.position.x, camera.position.z).id
        const choices = sounds[area] || sounds.yellow
        const kind = choices[ambientIndex % choices.length]
        audio.anomaly(
          kind,
          (Math.random() < 0.5 ? -1 : 1) * (0.45 + Math.random() * 0.48),
          true,
        )
        if (kind === 'ballast' || kind === 'static') surge = 0.58
        ambientIndex++
        ambientWait = Infinity
      }
      wait -= dt
      if (wait > 0) return false
      const hunt = eventNumber % 2 === 1
      if (place(camera, hunt)) {
        eventNumber++
      } else {
        wait = 1.7
      }
      return false
    }
    age += dt
    fixtureCountdown -= dt
    if (fixtureCountdown <= 0) {
      body.sample(world.getCeilingLight?.(figure.position.x, figure.position.z))
      fixtureCountdown = 0.25
    }
    body.illuminate(dt)
    const pos = camera.position
    const dx = pos.x - figure.position.x,
      dz = pos.z - figure.position.z
    const distance = Math.max(0.001, Math.hypot(dx, dz))
    const pan = THREE.MathUtils.clamp(
      (-dx * Math.cos(camera.rotation.y) + dz * Math.sin(camera.rotation.y)) /
        distance,
      -1,
      1,
    )
    if (phase === 'recoil') {
      const x = figure.position.x - (dx / distance) * 3.2 * dt
      const z = figure.position.z - (dz / distance) * 3.2 * dt
      if (world.canStand(x, z)) figure.position.set(x, 0.015, z)
      body.lean(reducedMotion ? 0 : -0.12)
      body.pose(age * 8.5, 0.6, !reducedMotion)
      body.fade(Math.max(0, 1 - age / 0.8))
      if (age >= 0.8) rest(23 + Math.random() * 29)
      return false
    }
    sightCountdown -= dt
    if (sightCountdown <= 0) {
      hasSight = clearPath(
        figure.position,
        dx / distance,
        dz / distance,
        distance,
      )
      sightCountdown = 0.14
    }
    if (hasSight) lastSeen.copy(pos)
    noSight = hasSight ? 0 : noSight + dt
    target.copy(figure.position)
    target.y += 1.55
    const aim = camera.getWorldDirection(look).dot(target.sub(pos).normalize())
    const lit = lamp && hasSight && distance <= 18 && aim > 0.94
    beamTime = lit ? beamTime + dt : Math.max(0, beamTime - dt * 1.9)
    figure.rotation.y = Math.atan2(dx, dz)

    if (phase === 'glimpse') {
      body.pose(age, 0, !reducedMotion)
      if (age > 2.4 || distance < 4.3 || beamTime > 0.22 || noSight > 0.6) {
        rest(
          eventNumber === 1 ? 13 + Math.random() * 6 : 19 + Math.random() * 20,
        )
      }
      return false
    }
    if (beamTime >= 0.69) {
      audio.anomaly('breath', pan)
      surge = 0.75
      phase = 'recoil'
      age = 0
      threat = ''
      return false
    }
    if (noSight > 2.9 || distance > 18 || age > 34) {
      rest(24 + Math.random() * 31)
      return false
    }
    footTimer -= dt
    if (footTimer <= 0) {
      audio.stalkerStep(pan, Math.max(0, 1 - distance / 18))
      footTimer = phase === 'warning' ? 1.05 : 0.55
    }
    if (phase === 'warning') {
      body.pose(age * 0.8, 0, !reducedMotion)
      if (age >= 3.4) phase = 'pursuit'
      return false
    }

    const destX = lastSeen.x - figure.position.x,
      destZ = lastSeen.z - figure.position.z
    const remaining = Math.hypot(destX, destZ)
    const travel = Math.min(remaining, dt * (lit ? 0.3 : 3.05))
    if (remaining > 0.025) {
      const x = figure.position.x + (travel * destX) / remaining
      const z = figure.position.z + (travel * destZ) / remaining
      if (world.canStand(x, figure.position.z)) figure.position.x = x
      if (world.canStand(figure.position.x, z)) figure.position.z = z
    }
    gait += dt * (lit ? 2 : 8.2)
    body.pose(gait, lit ? 0.18 : 1, !reducedMotion)
    threat = distance < 3.2 ? 'Signal fading' : 'Signal interference'
    contact =
      distance < 0.9 && hasSight && !lit
        ? contact + dt
        : Math.max(0, contact - dt * 2)
    return contact >= 0.8
  }

  return {
    update,
    get threat() {
      return threat
    },
    get surge() {
      return surge
    },
    dispose: body.dispose,
  }
}
