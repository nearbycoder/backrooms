import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createGamepad } from '../src/gamepad.js'

test('gamepad rejects drift, normalizes diagonals, and suppresses held inputs across reconnects', (t) => {
  const pad = {
    index: 0,
    connected: true,
    mapping: 'standard',
    id: 'DualSense Wireless Controller',
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
  }
  let current = pad
  const originalNavigator = Object.getOwnPropertyDescriptor(
    globalThis,
    'navigator',
  )
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { getGamepads: () => [current] },
  })
  const oldDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { hidden: false, hasFocus: () => true },
  })
  t.after(() => {
    if (originalNavigator)
      Object.defineProperty(globalThis, 'navigator', originalNavigator)
    else delete globalThis.navigator
    if (oldDocument) Object.defineProperty(globalThis, 'document', oldDocument)
    else delete globalThis.document
  })
  const changes = []
  let clicks = 0,
    disconnects = 0,
    time = 0
  const input = createGamepad({
    getMode: () => 'playing',
    isActive: () => true,
    onActive() {},
    onChange: (value) => changes.push(value?.family ?? null),
    onDisconnect: () => disconnects++,
    onLight: () => clicks++,
  })
  const poll = () => input.poll((time += 16))
  pad.buttons[3].pressed = true
  pad.axes = [0.8, 0, 0, 0]
  poll()
  poll()
  assert.equal(clicks, 0)
  assert.equal(input.move.x, 0)
  pad.buttons[3].pressed = false
  pad.axes = [0.09, 0.08, 0.06, 0.07]
  poll()
  assert.deepEqual(input.move, { x: 0, y: 0 })
  assert.deepEqual(input.aim, { x: 0, y: 0 })
  pad.axes = [0.58, 0, 1, -1]
  pad.buttons[4].pressed = true
  pad.buttons[3].pressed = true
  poll()
  poll()
  assert.equal(clicks, 1)
  assert.equal(input.sprint, true)
  assert.ok(Math.abs(input.move.x - 0.5) < 1e-6)
  assert.ok(Math.abs(Math.hypot(input.aim.x, input.aim.y) - 1) < 1e-6)
  input.suspend()
  poll()
  assert.equal(clicks, 1)
  assert.equal(input.sprint, false)
  current = null
  poll()
  assert.deepEqual(input.move, { x: 0, y: 0 })
  assert.equal(disconnects, 1)
  current = pad
  poll()
  poll()
  assert.equal(clicks, 1)
  assert.equal(input.sprint, false)
  pad.buttons[3].pressed = false
  pad.buttons[4].pressed = false
  pad.axes.fill(0)
  poll()
  pad.buttons[10].pressed = true
  pad.buttons[3].pressed = true
  poll()
  assert.equal(clicks, 2)
  assert.equal(input.sprint, true)
  assert.deepEqual(changes, ['playstation', null, 'playstation'])
})
