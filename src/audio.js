// Generate the ballast hum and carpet footsteps locally so sound follows the run.
export function createAudio() {
  let context, master, ambienceBus, effectsBus, roomGate, eventGate, noise, hum
  const unlockEvents = new AbortController()
  let area = 'yellow'
  const mix = { volume: 0.65, ambience: 1, effects: 1, muted: false }
  let previewEnds = -Infinity
  let audible = false

  function open() {
    if (context) return
    const Audio = window.AudioContext || window.webkitAudioContext
    if (!Audio) return
    try {
      context = new Audio()
    } catch {
      return
    }
    master = context.createGain()
    master.gain.value = mix.muted ? 0 : mix.volume
    master.connect(context.destination)
    function bus(level, destination) {
      const node = context.createGain()
      node.gain.value = level
      node.connect(destination)
      return node
    }
    ambienceBus = bus(mix.ambience, master)
    effectsBus = bus(mix.effects, master)
    // Pausing closes the game gates. The menu sound check uses the same mix
    // and can play one sample without resuming an expedition or its timers.
    roomGate = bus(audible ? 1 : 0, ambienceBus)
    eventGate = bus(audible ? 1 : 0, effectsBus)
    hum = bus(ambientLevel(), roomGate)
    // Some browsers accept a gamepad for navigation before granting Web Audio
    // user activation. Retry the existing context on a trusted input event.
    for (const name of ['pointerdown', 'keydown', 'touchend']) {
      window.addEventListener(
        name,
        () => {
          if (audible || context.currentTime < previewEnds) resumeContext()
        },
        { capture: true, passive: true, signal: unlockEvents.signal },
      )
    }
    for (const [frequency, level] of [
      [60, 0.04],
      [120.15, 0.016],
      [179.93, 0.006],
    ]) {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      gain.gain.value = level
      oscillator.frequency.value = frequency
      oscillator.connect(gain).connect(hum)
      oscillator.start()
    }
    const flutter = context.createOscillator()
    const depth = context.createGain()
    flutter.frequency.value = 0.83
    depth.gain.value = 0.12
    flutter.connect(depth).connect(hum.gain)
    flutter.start()

    noise = context.createBuffer(
      1,
      Math.round(context.sampleRate * 0.38),
      context.sampleRate,
    )
    const samples = noise.getChannelData(0)
    let previous = 0
    for (let i = 0; i < samples.length; i++) {
      previous = (previous + 0.12 * (Math.random() * 2 - 1)) / 1.12
      samples[i] = previous * 3
    }
  }

  function ambientLevel() {
    return area === 'maintenance' ? 1.32 : area === 'pool' ? 0.4 : 0.8
  }

  function resumeContext() {
    if (context && context.state !== 'running' && context.state !== 'closed')
      context.resume().catch(() => {})
  }

  function fade(node, value, seconds = 0.04) {
    const now = context.currentTime
    node.gain.cancelScheduledValues(now)
    node.gain.setTargetAtTime(value, now, seconds)
  }

  function play() {
    audible = true
    open()
    if (!context) return
    resumeContext()
    fade(roomGate, 1)
    fade(eventGate, 1)
  }

  function setMix(settings) {
    const previousMaster = mix.muted ? 0 : mix.volume
    for (const key of ['volume', 'ambience', 'effects']) {
      if (!Number.isFinite(settings[key])) continue
      const value = Math.min(1, Math.max(0, settings[key]))
      if (mix[key] === value) continue
      mix[key] = value
      if (master && key === 'ambience') fade(ambienceBus, value)
      if (master && key === 'effects') fade(effectsBus, value)
    }
    if (typeof settings.muted === 'boolean') mix.muted = settings.muted
    const masterLevel = mix.muted ? 0 : mix.volume
    if (master && masterLevel !== previousMaster) fade(master, masterLevel)
  }

  function tone(
    frequency,
    delay,
    duration,
    level,
    type = 'sine',
    pan = 0,
    output = eventGate,
  ) {
    if (!output || !mix.volume || mix.muted) return
    // A suspended context's clock stands still. Discard missed footsteps and
    // encounter cues instead of playing them together when audio unlocks.
    if (output !== effectsBus && (!audible || context.state !== 'running'))
      return
    if (!(output === roomGate ? mix.ambience : mix.effects)) return
    const oscillator = context.createOscillator()
    const envelope = context.createGain()
    const start = context.currentTime + delay
    oscillator.type = type
    oscillator.frequency.value = frequency
    envelope.gain.setValueAtTime(0.0001, start)
    envelope.gain.exponentialRampToValueAtTime(level, start + 0.008)
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    const spatial =
      pan && context.createStereoPanner ? context.createStereoPanner() : null
    oscillator.connect(envelope)
    if (spatial) {
      spatial.pan.value = pan
      envelope.connect(spatial).connect(output)
    } else {
      envelope.connect(output)
    }
    oscillator.start(start)
    oscillator.stop(start + duration + 0.03)
    oscillator.onended = () => {
      oscillator.disconnect()
      envelope.disconnect()
      spatial?.disconnect()
    }
  }

  function step(running) {
    if (
      !audible ||
      !noise ||
      context.state !== 'running' ||
      !mix.volume ||
      !mix.effects ||
      mix.muted
    )
      return
    const source = context.createBufferSource()
    const filter = context.createBiquadFilter()
    const envelope = context.createGain()
    const now = context.currentTime
    source.buffer = noise
    source.playbackRate.value = 0.82 + Math.random() * 0.25
    filter.type = 'lowpass'
    const hardFloor = area === 'pool' || area === 'maintenance'
    filter.frequency.value = hardFloor ? 1120 : running ? 790 : 570
    if (area === 'pool') tone(475, 0.055, 0.19, running ? 0.017 : 0.011)
    envelope.gain.setValueAtTime(0.001, now)
    envelope.gain.exponentialRampToValueAtTime(
      running ? 0.23 : 0.16,
      now + 0.018,
    )
    envelope.gain.exponentialRampToValueAtTime(0.001, now + 0.17)
    source.connect(filter).connect(envelope).connect(eventGate)
    source.start(now)
    source.stop(now + 0.19)
    source.onended = () => {
      source.disconnect()
      filter.disconnect()
      envelope.disconnect()
    }
  }

  function mark(output = eventGate, delay = 0) {
    tone(260, delay, 0.052, 0.023, 'triangle', 0, output)
    tone(805, delay + 0.12, 0.04, 0.016, 'triangle', 0, output)
  }

  function preview(channel = 'mix') {
    if (mix.muted || !mix.volume) return 'muted'
    open()
    if (!context) return 'unavailable'
    resumeContext()
    const needsGesture =
      context.state === 'suspended' &&
      globalThis.navigator?.userActivation?.hasBeenActive === false
    const now = context.currentTime
    if (now >= previewEnds) {
      previewEnds = now + 1.05
      if (channel !== 'effects' && !audible) {
        fade(roomGate, 1)
        roomGate.gain.setTargetAtTime(0, previewEnds - 0.12, 0.04)
      }
      if (channel !== 'ambience') mark(effectsBus, 0.3)
    }
    return needsGesture ? 'activation' : 'playing'
  }

  return {
    play,
    preview,
    setMix,
    mark,
    step,
    pause() {
      audible = false
      if (context) {
        fade(roomGate, 0)
        fade(eventGate, 0)
      }
    },
    switchClick() {
      tone(135, 0, 0.038, 0.035, 'triangle')
    },
    setArea(id) {
      if (area === id) return
      area = id
      if (hum) {
        hum.gain.cancelScheduledValues(context.currentTime)
        hum.gain.setTargetAtTime(ambientLevel(), context.currentTime, 1.4)
      }
    },
    anomaly(kind, pan, incidental = false) {
      // For example, a pipe ticking in an empty room belongs to ambience;
      // the Listener's warning from that same direction belongs to effects.
      const cue = (frequency, delay, duration, level, type, location) =>
        tone(
          frequency,
          delay,
          duration,
          level,
          type,
          location,
          incidental ? roomGate : eventGate,
        )
      if (kind === 'knock') {
        cue(159, 0, 0.18, 0.07, 'triangle', pan)
        cue(177, 0.27, 0.22, 0.041, 'triangle', pan)
      } else if (kind === 'ballast') {
        cue(113, 0, 0.15, 0.036, 'sawtooth', pan)
        if (hum && audible) {
          const now = context.currentTime
          hum.gain.cancelScheduledValues(now)
          hum.gain.setTargetAtTime(0.19, now, 0.13)
          hum.gain.setTargetAtTime(ambientLevel(), now + 0.8, 0.35)
        }
      } else if (kind === 'pipe') {
        cue(297, 0, 0.37, 0.034, 'triangle', pan)
        cue(601, 0.03, 0.26, 0.014, 'sine', pan)
        cue(293, 0.28, 0.4, 0.011, 'triangle', -pan * 0.5)
      } else if (kind === 'chair') {
        cue(218, 0, 0.34, 0.022, 'sawtooth', pan)
        cue(197, 0.16, 0.44, 0.016, 'sawtooth', pan)
      } else if (kind === 'drip') {
        cue(1050, 0, 0.06, 0.024, 'sine', pan)
        cue(761, 0.08, 0.18, 0.018, 'sine', pan * 0.6)
        cue(754, 0.3, 0.22, 0.01, 'sine', -pan * 0.4)
      } else if (kind === 'scrape') {
        cue(105, 0, 0.45, 0.018, 'sawtooth', pan)
        cue(690, 0.14, 0.37, 0.012, 'triangle', pan)
      } else if (kind === 'breath') {
        cue(195, 0, 0.52, 0.038, 'sawtooth', pan)
        cue(194.1, 0.05, 0.6, 0.017, 'sine', pan)
      } else {
        cue(147, 0, 0.49, 0.036, 'triangle', pan)
        cue(302, 0.075, 0.31, 0.013, 'sawtooth', pan)
      }
    },
    stalkerStep(pan, near) {
      tone(72, 0, 0.19, 0.035 + near * 0.1, 'sine', pan)
      tone(307, 0.03, 0.095, 0.013 + near * 0.018, 'triangle', pan)
    },
    dispose() {
      unlockEvents.abort()
      if (context) context.close().catch(() => {})
    },
  }
}
