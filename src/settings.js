// Values are kept in game units so the renderer, audio mix, and controls
// receive exactly the values shown by the settings panel.
export const sections = {
  audio: [
    {
      key: 'volume',
      label: 'Master volume',
      detail: 'Overall recording volume',
      min: 0,
      max: 1,
      step: 0.01,
      initial: 0.65,
    },
    {
      key: 'ambience',
      label: 'Ambience',
      detail: 'Room tone, fluorescent hum and distant sounds',
      min: 0,
      max: 1,
      step: 0.01,
      initial: 1,
    },
    {
      key: 'effects',
      label: 'Sound effects',
      detail: 'Footsteps, equipment and encounters',
      min: 0,
      max: 1,
      step: 0.01,
      initial: 1,
    },
    { key: 'muted', label: 'Mute all audio', initial: false },
  ],
  display: [
    {
      key: 'brightness',
      label: 'Brightness',
      min: 0.65,
      max: 1.5,
      step: 0.01,
      initial: 1,
    },
    {
      key: 'baseFov',
      label: 'Field of view',
      detail: 'Vertical camera angle at walking speed',
      min: 55,
      max: 88,
      step: 1,
      initial: 64,
    },
    {
      key: 'bloom',
      label: 'Light bloom',
      detail: 'Soft glow around bright fixtures',
      initial: true,
    },
    {
      key: 'filmGrain',
      label: 'Film grain',
      detail: 'Analog noise across the camera feed',
      initial: true,
    },
    {
      key: 'reducedMotion',
      label: 'Reduce motion',
      detail: 'Steady camera while walking and sprinting',
      initial: false,
    },
  ],
  input: [
    {
      key: 'sensitivity',
      label: 'Mouse & touch sensitivity',
      min: 0,
      max: 1,
      step: 0.01,
      initial: 0.5,
    },
    {
      key: 'controllerSensitivity',
      label: 'Controller sensitivity',
      detail: 'Right stick turning speed',
      min: 0,
      max: 1,
      step: 0.01,
      initial: 0.5,
    },
    {
      key: 'invertY',
      label: 'Invert controller look',
      detail: 'Push the right stick up to look down',
      initial: false,
    },
  ],
}

export function defaultValue(option) {
  if (option.key === 'reducedMotion')
    return matchMedia('(prefers-reduced-motion: reduce)').matches
  return option.initial
}

export function loadSettings() {
  let saved
  try {
    saved = JSON.parse(localStorage.getItem('liminal-options'))
  } catch {}
  const result = {}
  for (const option of Object.values(sections).flat()) {
    const value = saved?.[option.key]
    if (option.min !== undefined && Number.isFinite(value)) {
      result[option.key] = Math.max(option.min, Math.min(option.max, value))
    } else if (
      typeof option.initial === 'boolean' &&
      typeof value === 'boolean'
    ) {
      result[option.key] = value
    } else result[option.key] = defaultValue(option)
  }
  return result
}

export function formatSetting(option, value) {
  return option.key === 'baseFov'
    ? Math.round(value) + '°'
    : Math.round(value * 100) + '%'
}

export function settingsRows(section, settings) {
  return sections[section]
    .map((option) => {
      const { key, label, detail, min, max, step } = option
      const id = 'opt-' + key
      const description = detail ? ' aria-describedby="desc-' + key + '"' : ''
      const name =
        '<div class="option-caption"><label for="' +
        id +
        '">' +
        label +
        '</label>' +
        (detail ? '<small id="desc-' + key + '">' + detail + '</small>' : '') +
        '</div>'
      if (min === undefined) {
        return (
          '<div class="option-row">' +
          name +
          '<input class="setting-switch" type="checkbox" id="' +
          id +
          '" data-option="' +
          key +
          '"' +
          description +
          (settings[key] ? ' checked' : '') +
          '></div>'
        )
      }
      const value = settings[key]
      return (
        '<div class="option-row slider-row">' +
        name +
        '<div class="slider-control"><input id="' +
        id +
        '" type="range" data-option="' +
        key +
        '" min="' +
        min +
        '" max="' +
        max +
        '" step="' +
        step +
        '" value="' +
        value +
        '"' +
        description +
        ' aria-valuetext="' +
        formatSetting(option, value) +
        '" style="--fill:' +
        ((value - min) / (max - min)) * 100 +
        '%">' +
        '<output for="' +
        id +
        '">' +
        formatSetting(option, value) +
        '</output></div></div>'
      )
    })
    .join('')
}
