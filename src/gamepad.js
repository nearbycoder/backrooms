// The W3C standard mapping uses the same indices for Xbox and PlayStation pads.
const CONFIRM = 0,
  BACK = 1,
  MARK = 2,
  LIGHT = 3,
  BUMPER = 4,
  MENU = 9,
  L3 = 10
const UP = 12,
  DOWN = 13,
  LEFT = 14,
  RIGHT = 15
const FIRST_REPEAT = 360,
  NEXT_REPEAT = 100
const interactive =
  'button, input:not([type="hidden"]), select, a[href], summary, [role="button"][tabindex]'

function stick(axes, first, deadzone, out) {
  const x = Number(axes[first]) || 0,
    y = Number(axes[first + 1]) || 0
  const radius = Math.hypot(x, y)
  if (radius <= deadzone) {
    out.x = out.y = 0
    return
  }
  const scale = Math.min(1, (radius - deadzone) / (1 - deadzone)) / radius
  out.x = x * scale
  out.y = y * scale
}

function family(id) {
  if (/dualsense|dualshock|playstation|054c|sony wireless/i.test(id))
    return 'playstation'
  if (/xbox|xinput|045e/i.test(id)) return 'xbox'
  return 'standard'
}

function focusable(scope) {
  return [...scope.querySelectorAll(interactive)].filter(
    (el) =>
      !el.matches(':disabled,[aria-disabled="true"]') &&
      !el.closest('[hidden],[inert],[aria-hidden="true"]') &&
      el.getClientRects().length > 0 &&
      getComputedStyle(el).visibility !== 'hidden',
  )
}

function menuScope() {
  return (
    document.querySelector(
      '#modal-layer:not([hidden]) [role="dialog"],dialog[open]',
    ) || document
  )
}

function focus(el) {
  if (!el) return
  el.focus({ preventScroll: true })
  el.scrollIntoView({
    block: 'nearest',
    inline: 'nearest',
    behavior: 'instant',
  })
}

function startingItem(items) {
  return items.find((el) => el.hasAttribute('data-menu-default')) || items[0]
}

function adjust(el, sign) {
  if (el.matches('input[type="range"]')) {
    const previous = el.value
    if (el.step === 'any') {
      const low = el.min === '' ? 0 : Number(el.min),
        high = el.max === '' ? 100 : Number(el.max)
      el.value = String(
        Math.max(
          low,
          Math.min(high, Number(el.value) + (sign * (high - low)) / 100),
        ),
      )
    } else if (sign > 0) el.stepUp()
    else el.stepDown()
    if (previous !== el.value) {
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    }
    return true
  }
  if (el.matches('input[type="checkbox"]')) {
    if (el.checked !== sign > 0) el.click()
    return true
  }
  if (el.matches('select')) {
    let index = el.selectedIndex + sign
    while (el.options[index]?.disabled) index += sign
    if (el.options[index]) {
      el.selectedIndex = index
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    }
    return true
  }
  return false
}

// Compare the visible controls in the direction of travel. Collinear buttons
// stay in their row, while Up/Down can reach controls in the next panel row.
function navigate(scope, dir) {
  const items = focusable(scope)
  const active = document.activeElement
  const index = items.indexOf(active)
  if (index === -1) {
    focus(startingItem(items))
    return
  }
  const horizontal = dir === 'left' || dir === 'right'
  const sign = dir === 'left' || dir === 'up' ? -1 : 1
  if (horizontal && adjust(active, sign)) return
  const bounds = (el) =>
    (el.closest('.option-row, label') || el).getBoundingClientRect()
  const rect = bounds(active)
  let closest,
    sameLane = false,
    lowest = Infinity
  for (const item of items) {
    if (item === active) continue
    const r = bounds(item)
    const dx = (r.left + r.right - rect.left - rect.right) / 2
    const dy = (r.top + r.bottom - rect.top - rect.bottom) / 2
    const forward = (horizontal ? dx : dy) * sign
    const side = Math.abs(horizontal ? dy : dx)
    const gap = horizontal
      ? Math.max(0, r.top - rect.bottom, rect.top - r.bottom)
      : Math.max(0, r.left - rect.right, rect.left - r.right)
    if (forward < 2 || gap > 2 * forward + 16) continue
    const score = forward + gap * 3 + side * 0.12
    const aligned = gap <= 1
    if ((aligned && !sameLane) || (aligned === sameLane && score < lowest)) {
      sameLane = aligned
      lowest = score
      closest = item
    }
  }
  focus(closest || items[(index + sign + items.length) % items.length])
}

export function createGamepad({
  getMode,
  isActive,
  onActive,
  onChange,
  onDisconnect,
  onBack,
  onPause,
  onLight,
  onMark,
}) {
  const move = { x: 0, y: 0 },
    aim = { x: 0, y: 0 }
  let slot = -1,
    id = '',
    down = 0,
    blocked = 0
  let suppressMove = false,
    suppressAim = false,
    previousScreen
  let rawMoveHeld = false,
    rawAimHeld = false
  let direction = '',
    repeatAt = 0,
    sprint = false
  let denied = false

  function clear() {
    blocked |= down
    suppressMove = rawMoveHeld
    suppressAim = rawAimHeld
    move.x = move.y = aim.x = aim.y = 0
    sprint = false
    direction = ''
    repeatAt = 0
  }

  function poll(time) {
    if (denied || !navigator.getGamepads) return
    let pads
    try {
      pads = navigator.getGamepads()
    } catch {
      denied = true
      return
    }
    const eligible = (p) =>
      p && p.connected !== false && p.mapping === 'standard'
    let pad = pads[slot]
    if (!eligible(pad)) pad = Array.from(pads).find(eligible)
    if (!pad) {
      if (slot !== -1) {
        slot = -1
        id = ''
        down = blocked = 0
        rawMoveHeld = rawAimHeld = false
        clear()
        onChange?.(null)
        onDisconnect?.()
      }
      return
    }
    let mask = 0
    for (let i = 0; i < Math.min(pad.buttons.length, 17); i++) {
      const b = pad.buttons[i]
      if (b?.pressed || b?.value > 0.55) mask |= 1 << i
    }
    stick(pad.axes, 0, 0.16, move)
    stick(pad.axes, 2, 0.13, aim)
    rawMoveHeld = Boolean(move.x || move.y)
    rawAimHeld = Boolean(aim.x || aim.y)
    const mode = getMode()
    const scope = mode === 'playing' ? null : menuScope()
    const screen =
      scope && scope !== document ? scope.firstElementChild || scope : mode
    const switched = slot !== pad.index || id !== pad.id
    const previous = down
    down = mask
    if (
      switched ||
      previousScreen !== screen ||
      document.hidden ||
      !document.hasFocus()
    ) {
      previousScreen = screen
      clear()
      if (switched) {
        const replaced = slot !== -1
        slot = pad.index
        id = pad.id
        if (replaced) onDisconnect?.()
        onChange?.({ id: pad.id, family: family(pad.id) })
      }
      if (document.hidden || !document.hasFocus()) return
      if (switched && (mask || rawMoveHeld || rawAimHeld)) onActive()
      if (scope && isActive()) {
        const items = focusable(scope)
        if (!items.includes(document.activeElement)) focus(startingItem(items))
      }
      return
    }

    blocked &= mask
    if (!rawMoveHeld) suppressMove = false
    if (!rawAimHeld) suppressAim = false
    if (suppressMove) move.x = move.y = 0
    if (suppressAim) aim.x = aim.y = 0
    const held = mask & ~blocked
    const pressed = held & ~previous
    const hit = (button) => Boolean(pressed & (1 << button))
    if (pressed || move.x || move.y || aim.x || aim.y) onActive()

    if (mode === 'playing') {
      sprint = Boolean(held & ((1 << BUMPER) | (1 << L3)))
      if (hit(MENU)) {
        onPause()
        return
      }
      if (hit(LIGHT)) onLight()
      if (hit(MARK)) onMark()
      return
    }
    sprint = false
    if (hit(BACK) || hit(MENU)) {
      onBack?.(hit(BACK) ? 'back' : 'start')
      return
    }
    if (hit(CONFIRM)) {
      const items = focusable(scope)
      const el = items.includes(document.activeElement)
        ? document.activeElement
        : startingItem(items)
      if (el) {
        focus(el)
        if (!el.matches('input[type="range"]')) el.click()
      }
      return
    }
    let next = ''
    if (held & (1 << UP)) next = 'up'
    else if (held & (1 << DOWN)) next = 'down'
    else if (held & (1 << LEFT)) next = 'left'
    else if (held & (1 << RIGHT)) next = 'right'
    else if (
      Math.max(Math.abs(move.x), Math.abs(move.y)) > (direction ? 0.36 : 0.49)
    ) {
      next =
        Math.abs(move.x) > Math.abs(move.y)
          ? move.x < 0
            ? 'left'
            : 'right'
          : move.y < 0
            ? 'up'
            : 'down'
    }
    if (next && (next !== direction || time >= repeatAt)) {
      navigate(scope, next)
      repeatAt = time + (next === direction ? NEXT_REPEAT : FIRST_REPEAT)
    }
    direction = next
  }
  return {
    move,
    aim,
    poll,
    clear,
    suspend() {
      previousScreen = undefined
      clear()
    },
    get sprint() {
      return sprint
    },
  }
}
