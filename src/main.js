import { createGame } from './game.js'
import {
  sections,
  defaultValue,
  loadSettings,
  formatSetting,
  settingsRows,
} from './settings.js'

const $ = (selector) => document.querySelector(selector)
const icon = (name) =>
  '<svg aria-hidden="true"><use href="#' + name + '"/></svg>'
const title = $('#title-screen')
const hud = $('#hud')
const layer = $('#modal-layer')
const panel = $('.panel')
let game,
  modal = '',
  dialogOrigin
let tapeNumber = 0
let latest = null
let markedAt = -Infinity
const visited = new Set()
const tapeLabel = (number) =>
  'TAPE ' + String(Math.max(1, number)).padStart(3, '0')
const settings = loadSettings()
let settingsTab = 'audio'
let guideDevice = 'keyboard'
let guideOrigin = ''
let controller = null
let inputMode = matchMedia('(pointer:coarse)').matches ? 'touch' : 'keyboard'
const desktopHint = $('#control-hint').innerHTML
const panelTitles = {
  audio: 'Audio',
  display: 'Display',
  input: 'Input',
  keyboard: 'Keyboard',
  controller: 'Controller',
  touch: 'Touch',
}
const tabIcons = { audio: 'sound', display: 'display', input: 'pad' }
let lastVolume = settings.volume || 0.65
function syncSettings(persist = true) {
  game?.setSettings(settings)
  const muted = settings.muted || settings.volume === 0
  document.body.classList.toggle('no-grain', !settings.filmGrain)
  document.body.classList.toggle('muted', muted)
  const button = $('#audio-button')
  button.setAttribute('aria-pressed', String(!muted))
  button.setAttribute('aria-label', muted ? 'Unmute audio' : 'Mute audio')
  button.innerHTML =
    icon(muted ? 'muted' : 'sound') +
    '<span>AUDIO ' +
    (muted ? 'OFF' : 'ON') +
    '</span>'
  if (!persist) return
  try {
    localStorage.setItem('liminal-options', JSON.stringify(settings))
  } catch {}
}
function timecode(t) {
  return [Math.floor(t / 3600), Math.floor(t / 60) % 60, Math.floor(t) % 60]
    .map((v) => String(v).padStart(2, '0'))
    .join(':')
}
function screen(mode) {
  document.body.dataset.mode = mode
  title.hidden = mode !== 'title'
  hud.hidden = mode !== 'playing'
  $('#system-status').textContent = {
    title: 'SYSTEM ONLINE',
    playing: 'FEED ACTIVE',
    paused: 'FEED PAUSED',
    lost: 'SIGNAL LOST',
  }[mode]
  if (mode !== 'playing') delete document.body.dataset.interference
}
function closePanel() {
  modal = ''
  delete layer.dataset.panel
  delete document.body.dataset.panel
  layer.hidden = true
  title.inert = false
  hud.inert = false
  $('.topbar').inert = false
  if (dialogOrigin?.isConnected && dialogOrigin.offsetParent)
    dialogOrigin.focus({ preventScroll: true })
  dialogOrigin = null
}
function showPanel(kind, content) {
  if (!modal) dialogOrigin = document.activeElement
  modal = kind
  layer.dataset.panel = kind
  document.body.dataset.panel = kind
  panel.innerHTML = content
  layer.hidden = false
  title.inert = true
  hud.inert = true
  $('.topbar').inert = true
  panel.focus({ preventScroll: true })
}
const label = (text) => '<div class="level-label"><i></i>' + text + '</div>'
const closeButton = (name) =>
  '<button class="close" data-action="back" aria-label="Close ' +
  name +
  '">' +
  icon('cross') +
  '</button>'
function bindingsRow(action, keys) {
  return (
    '<div><dt>' +
    action +
    '</dt><dd>' +
    keys.map((key) => '<kbd>' + key + '</kbd>').join('') +
    '</dd></div>'
  )
}
function tabs(keys, selected, name) {
  return (
    '<div class="option-tabs" role="tablist" aria-label="' +
    name +
    '">' +
    keys
      .map(
        (key) =>
          '<button role="tab" type="button" id="tab-' +
          key +
          '" data-tab="' +
          key +
          '" aria-controls="tab-content" aria-selected="' +
          (key === selected) +
          '" tabindex="' +
          (key === selected ? 0 : -1) +
          '"' +
          (key === selected ? ' data-menu-default' : '') +
          '>' +
          (tabIcons[key] ? icon(tabIcons[key]) : '') +
          panelTitles[key] +
          '</button>',
      )
      .join('') +
    '</div>'
  )
}
function controllerStatus() {
  return controller
    ? 'Controller connected'
    : 'Press a button on your controller to connect.'
}
function updateController(info) {
  controller = info
  $('#input-status').textContent = info ? 'GAMEPAD CONNECTED' : 'WEBGL'
  const status = $('#controller-status')
  if (status) status.textContent = controllerStatus()
  if (!info && inputMode === 'gamepad')
    updateInputMode(
      matchMedia('(pointer:coarse)').matches ? 'touch' : 'keyboard',
    )
}
function updateInputMode(mode) {
  if (mode !== inputMode || !document.body.dataset.input) {
    inputMode = mode
    document.body.dataset.input = mode
    $('#control-hint').innerHTML =
      mode === 'gamepad'
        ? '<kbd>LS</kbd><span>Move</span><kbd>RS</kbd><span>Look</span><kbd>L1 / LB</kbd><span>Sprint</span>'
        : desktopHint
  }
}
function guideRows() {
  if (guideDevice === 'touch')
    return (
      '<dl class="bindings">' +
      bindingsRow('Move', ['Drag left side']) +
      bindingsRow('Look around', ['Drag right side']) +
      bindingsRow('Sprint', ['Hold Run']) +
      bindingsRow('Flashlight', ['Light']) +
      bindingsRow('Leave a tape marker', ['Mark']) +
      bindingsRow('Pause', ['Ⅱ']) +
      '</dl>'
    )
  if (guideDevice === 'controller')
    return (
      '<dl class="bindings">' +
      bindingsRow('Move / look', ['Left stick', 'Right stick']) +
      bindingsRow('Sprint', ['Hold LB / L1', 'or L3']) +
      bindingsRow('Flashlight', ['Y / △']) +
      bindingsRow('Leave a tape marker', ['X / □']) +
      bindingsRow('Pause / resume', ['Menu / Options']) +
      bindingsRow('Navigate menus', ['D-pad', 'Left stick']) +
      bindingsRow('Select / back', ['A / ×', 'B / ○']) +
      '</dl>'
    )
  return (
    '<dl class="bindings">' +
    bindingsRow('Move', ['W', 'A', 'S', 'D']) +
    bindingsRow('Look around', ['Mouse', '←', '→']) +
    bindingsRow('Sprint', ['Shift']) +
    bindingsRow('Flashlight', ['F']) +
    bindingsRow('Leave a tape marker', ['E']) +
    bindingsRow('Pause', ['Esc']) +
    '</dl>'
  )
}
function controls() {
  guideOrigin = modal
  guideDevice =
    inputMode === 'gamepad'
      ? 'controller'
      : inputMode === 'touch'
        ? 'touch'
        : 'keyboard'
  showPanel(
    'controls',
    closeButton('controls') +
      '<h2 id="panel-title">Controls</h2>' +
      tabs(['keyboard', 'controller', 'touch'], guideDevice, 'Control scheme') +
      '<div id="tab-content" role="tabpanel" aria-labelledby="tab-' +
      guideDevice +
      '">' +
      guideRows() +
      '</div>' +
      '<p class="field-note">If the footsteps keep pace with yours, aim your flashlight at the figure or break its line of sight.</p>' +
      '<div class="panel-actions"><button class="secondary" data-action="back">Back</button></div>',
  )
}
function sectionContent() {
  let body = settingsRows(settingsTab, settings)
  if (settingsTab === 'audio')
    body +=
      '<button class="inline-action" data-action="soundCheck">' +
      icon('play') +
      'Test mix</button>'
  if (settingsTab === 'input')
    body +=
      '<div class="input-guide"><small id="controller-status">' +
      controllerStatus() +
      '</small><button class="inline-action" data-action="controls">' +
      icon('keys') +
      'Button layout</button></div>'
  return body
}
function openSettings() {
  showPanel(
    'settings',
    '<div class="settings-header"><div class="settings-title">' +
      icon('adjust') +
      '<h2 id="panel-title">Settings</h2></div>' +
      closeButton('settings') +
      '</div>' +
      tabs(['audio', 'display', 'input'], settingsTab, 'Settings category') +
      '<div class="option-content" role="tabpanel" id="tab-content" aria-labelledby="tab-' +
      settingsTab +
      '">' +
      sectionContent() +
      '</div>' +
      '<div class="settings-footer"><button class="inline-action reset-tab" data-action="resetTab">' +
      icon('reset-icon') +
      'Reset tab</button><span class="settings-feedback" aria-live="polite"></span><button class="primary" data-action="back">Done</button></div>',
  )
}
function selectTab(key) {
  if (modal === 'settings') settingsTab = key
  else guideDevice = key
  for (const btn of panel.querySelectorAll('[role=tab]')) {
    const selected = btn.dataset.tab === key
    btn.setAttribute('aria-selected', String(selected))
    btn.tabIndex = selected ? 0 : -1
    btn.toggleAttribute('data-menu-default', selected)
  }
  const content = $('#tab-content')
  content.setAttribute('aria-labelledby', 'tab-' + key)
  content.innerHTML = modal === 'settings' ? sectionContent() : guideRows()
  if (modal === 'settings') $('.settings-feedback').textContent = ''
}
function resetTab() {
  for (const option of sections[settingsTab])
    settings[option.key] = defaultValue(option)
  syncSettings()
  selectTab(settingsTab)
  $('.settings-feedback').textContent = 'Defaults restored'
}
let soundFeedbackTimer
function soundCheck() {
  const feedback = $('.settings-feedback')
  clearTimeout(soundFeedbackTimer)
  if (settings.muted || settings.volume === 0) {
    feedback.textContent = 'Master muted'
    return
  }
  if (!settings.ambience && !settings.effects) {
    feedback.textContent = 'Channels muted'
    return
  }
  const status = game?.previewAudio('mix')
  if (status === 'activation')
    feedback.textContent = 'Click or press a key to enable audio'
  else if (status !== 'playing') feedback.textContent = 'Audio unavailable'
  else {
    feedback.textContent = 'Testing mix'
    soundFeedbackTimer = setTimeout(() => {
      if (feedback.textContent === 'Testing mix') feedback.textContent = ''
    }, 1100)
  }
}
panel.addEventListener('input', (event) => {
  const input = event.target
  if (!input.dataset.option) return
  const option = sections[settingsTab].find(
    (o) => o.key === input.dataset.option,
  )
  if (!option) return
  const value = input.type === 'checkbox' ? input.checked : input.valueAsNumber
  settings[option.key] = value
  if (input.type === 'range') {
    input.nextElementSibling.value = formatSetting(option, value)
    input.setAttribute('aria-valuetext', formatSetting(option, value))
    input.style.setProperty(
      '--fill',
      ((value - option.min) / (option.max - option.min)) * 100 + '%',
    )
    if (option.key === 'volume' && value > 0) lastVolume = value
  }
  $('.settings-feedback').textContent = ''
  syncSettings()
})
function pauseMenu() {
  screen('paused')
  showPanel(
    'pause',
    label(tapeLabel(tapeNumber) + ' / STANDBY') +
      '<h2 id="panel-title">Paused</h2>' +
      recordingSummary(latest) +
      '<div class="panel-actions"><button class="primary" data-action="resume" data-menu-default>' +
      icon('play') +
      'Resume</button><button class="secondary" data-action="settings">Settings</button><button class="secondary" data-action="controls">Controls</button><button class="secondary" data-action="quit">Return to title</button></div>',
  )
}
function resume() {
  closePanel()
  screen('playing')
  game.resume()
}
function start() {
  if (!game) return
  closePanel()
  tapeNumber++
  latest = null
  markedAt = -Infinity
  visited.clear()
  $('#tape-number').textContent = tapeLabel(tapeNumber)
  screen('playing')
  document.activeElement?.blur()
  game.start()
}
function back() {
  if (modal === 'controls' && guideOrigin === 'settings') {
    openSettings()
    panel.querySelector('[data-action=controls]')?.focus()
  } else if (document.body.dataset.mode === 'paused') {
    const previous = modal
    pauseMenu()
    panel.querySelector('[data-action="' + previous + '"]')?.focus()
  } else closePanel()
}
function quit() {
  closePanel()
  screen('title')
  game.reset()
  $('#timecode').textContent = timecode(0)
  $('#tape-number').textContent = tapeLabel(tapeNumber + 1)
  $('#begin').focus({ preventScroll: true })
}
function formatRange(meters) {
  return Math.round(meters || 0).toLocaleString() + ' m'
}
function recordingSummary(run) {
  if (!run) return ''
  return (
    '<dl class="record-summary"><div><dt>Recording length</dt><dd>' +
    timecode(run.elapsed) +
    '</dd></div><div><dt>Farthest range</dt><dd>' +
    formatRange(run.distance) +
    '</dd></div><div><dt>Areas recorded</dt><dd>' +
    [...visited].join(' · ') +
    '</dd></div></dl>'
  )
}
function lost(run) {
  screen('lost')
  showPanel(
    'lost',
    label(tapeLabel(tapeNumber) + ' / END OF RECORDING') +
      '<h2 id="panel-title">Signal lost</h2><p>The last sound on the tape is a second set of footsteps.</p>' +
      recordingSummary(run) +
      '<div class="panel-actions"><button class="primary" data-action="again" data-menu-default>' +
      icon('play') +
      'New expedition</button><button class="secondary" data-action="quit">Return to title</button></div>',
  )
}
function showHud(state) {
  if (document.body.dataset.mode !== 'playing') return
  if (state.area) visited.add(state.area)
  if (state.markers > (latest?.markers ?? 0)) markedAt = state.elapsed
  latest = state
  const markerVisible = state.elapsed < markedAt + 2
  const message =
    state.threat ||
    (markerVisible
      ? 'Tape marker ' + String(state.markers).padStart(2, '0') + ' placed'
      : '')
  const fieldMessage = $('#field-message')
  if (fieldMessage.textContent !== message) fieldMessage.textContent = message
  fieldMessage.hidden = !message
  fieldMessage.classList.toggle('warning', Boolean(state.threat))
  if (state.threat)
    document.body.dataset.interference =
      state.threat === 'Signal fading' ? 'near' : 'distant'
  else delete document.body.dataset.interference
  $('.control-hint').classList.toggle(
    'faded',
    state.elapsed >= 8 || Boolean(message),
  )
  $('#timecode').textContent = timecode(state.elapsed)
  $('#heading').textContent = state.heading || 'N'
  $('#area-name').textContent = state.area || 'The Lobby'
  $('#range').textContent = formatRange(state.distance)
  $('#lamp').textContent = state.flashlight ? 'LIGHT ON' : 'LIGHT OFF'
  $('#stamina').value = state.stamina
}
panel.onclick = (e) => {
  const tab = e.target.closest('[data-tab]')
  if (tab) {
    selectTab(tab.dataset.tab)
    return
  }
  const actions = {
    resume,
    back,
    controls,
    settings: openSettings,
    resetTab,
    soundCheck,
    quit,
    again: start,
  }
  const action = e.target.closest('button')?.dataset.action
  if (action) actions[action]?.()
}
$('#begin').onclick = start
$('#controls').onclick = controls
$('#settings').onclick = openSettings
$('#pause').onclick = () => game?.pause()
$('#light').onclick = () => game?.toggleFlashlight()
$('#mark').onclick = () => game?.interact()
$('#run').onpointerdown = (e) => {
  e.target.setPointerCapture(e.pointerId)
  game?.setSprint(true)
}
$('#run').onlostpointercapture = () => game?.setSprint(false)
$('#audio-button').onclick = () => {
  if (settings.muted || !settings.volume) {
    settings.muted = false
    if (!settings.volume) settings.volume = lastVolume
  } else {
    lastVolume = settings.volume
    settings.muted = true
  }
  syncSettings()
}
const fullscreenButton = $('#fullscreen-button')
if (
  !document.documentElement.requestFullscreen ||
  !document.fullscreenEnabled
) {
  fullscreenButton.hidden = true
  $('.tool-divider').hidden = true
}
fullscreenButton.onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await document.documentElement.requestFullscreen()
  } catch {
    fullscreenButton.title = 'Fullscreen unavailable in this window'
  }
}
document.addEventListener('fullscreenchange', () => {
  fullscreenButton.innerHTML = icon(
    document.fullscreenElement ? 'collapse' : 'expand',
  )
  fullscreenButton.setAttribute(
    'aria-label',
    document.fullscreenElement ? 'Leave fullscreen' : 'Enter fullscreen',
  )
})
document.addEventListener('keydown', (e) => {
  if (
    document.activeElement?.matches('[role=tab]') &&
    ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)
  ) {
    const items = [...panel.querySelectorAll('[role=tab]')]
    const index = items.indexOf(document.activeElement)
    const next =
      e.key === 'Home'
        ? 0
        : e.key === 'End'
          ? items.length - 1
          : (index + (e.key === 'ArrowRight' ? 1 : -1) + items.length) %
            items.length
    e.preventDefault()
    selectTab(items[next].dataset.tab)
    items[next].focus()
    return
  }
  if (modal && e.key === 'Tab') {
    const items = [...panel.querySelectorAll('button,input')].filter(
      (el) => el.tabIndex >= 0 && !el.disabled,
    )
    if (
      e.shiftKey &&
      (document.activeElement === panel || document.activeElement === items[0])
    ) {
      e.preventDefault()
      items.at(-1)?.focus()
    } else if (!e.shiftKey && document.activeElement === items.at(-1)) {
      e.preventDefault()
      items[0]?.focus()
    }
  }
  if (e.key !== 'Escape' || !modal || e.repeat) return
  e.preventDefault()
  e.stopPropagation()
  if (modal === 'controls' || modal === 'settings') back()
  else if (modal === 'pause') resume()
})
try {
  game = createGame($('#scene'), {
    onHud: showHud,
    onPause: pauseMenu,
    onLost: lost,
    onInputMode: updateInputMode,
    onControllerChange: updateController,
    onMenuBack(button) {
      if (modal === 'pause') resume()
      else if (modal === 'settings' || modal === 'controls') back()
      else if (modal === 'lost' && button === 'back') quit()
    },
  })
  syncSettings(false)
  updateInputMode(inputMode)
  $('#system-status').textContent = 'SYSTEM ONLINE'
  $('#begin').disabled = false
} catch (e) {
  console.error(e)
  $('#load-error').hidden = false
  $('#load-error').textContent =
    'The 3D view needs WebGL 2. Enable hardware acceleration in your browser and reload.'
  $('#system-status').textContent = 'FEED OFFLINE'
}
$('#begin-label').textContent = 'Enter level'
$('#settings').disabled = false
$('#controls').disabled = false
