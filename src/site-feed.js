export function initFieldFeed() {
  const screen = document.querySelector('.viewfinder')
  const player = document.querySelector('#field-feed')
  const poster = document.querySelector('#feed-poster')
  const channels = [...document.querySelectorAll('.channel')]
  const playButton = document.querySelector('#toggle-motion')
  const audioButton = document.querySelector('#toggle-audio')
  const state = document.querySelector('#playback-state')
  const clock = document.querySelector('#feed-clock')
  const track = document.querySelector('.tape-track i')
  const feedDirectory = new URL('.', poster.src)
  const motionPreference = matchMedia('(prefers-reduced-motion: reduce)')
  let wantsPlayback =
    !motionPreference.matches && !navigator.connection?.saveData
  let inView = false
  let pageActive = true
  let playRequest = 0
  let channel = channels[0]

  function updateControls() {
    const playLabel = wantsPlayback ? 'Pause footage' : 'Play footage'
    playButton.setAttribute('aria-label', playLabel)
    playButton.title = playLabel
    playButton
      .querySelector('use')
      .setAttribute('href', wantsPlayback ? '#pause-feed-icon' : '#play-icon')
    const audioLabel = player.muted
      ? 'Enable ambient sound'
      : 'Mute ambient sound'
    audioButton.setAttribute('aria-label', audioLabel)
    audioButton.title = audioLabel
    audioButton.setAttribute('aria-pressed', String(!player.muted))
    audioButton
      .querySelector('use')
      .setAttribute('href', player.muted ? '#speaker-off' : '#speaker-on')
    audioButton.querySelector('span').textContent = player.muted
      ? 'Sound off'
      : 'Sound on'
    const moving =
      !player.paused && player.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
    screen.dataset.transport = moving ? 'playing' : 'still'
    state.textContent = moving
      ? 'PLAY'
      : screen.classList.contains('has-frame')
        ? 'HOLD'
        : 'STILL'
  }

  function updateClock() {
    const seconds = Math.floor(player.currentTime || 0)
    clock.textContent = '00:00:' + String(seconds).padStart(2, '0')
    track.style.transform =
      'scaleX(' +
      (player.duration ? player.currentTime / player.duration : 0) +
      ')'
  }

  function syncPlayback() {
    const request = ++playRequest
    const visible =
      inView &&
      pageActive &&
      !document.hidden &&
      !document.querySelector('dialog[open]')
    if (!wantsPlayback || !visible) {
      player.pause()
    } else {
      if (!player.hasAttribute('src'))
        player.src = new URL(channel.dataset.feed + '.mp4', feedDirectory).href
      player.play().catch((error) => {
        if (request !== playRequest || error.name === 'AbortError') return
        wantsPlayback = false
        updateControls()
      })
    }
    updateControls()
  }

  function tune(button) {
    if (button === channel) return
    ++playRequest
    channel = button
    for (const item of channels)
      item.setAttribute('aria-pressed', String(item === channel))
    screen.dataset.channel = channel.dataset.feed
    screen.classList.remove('has-frame')
    poster.src = new URL(channel.dataset.feed + '.webp', feedDirectory).href
    document.querySelector('#channel-code').textContent =
      'CAM ' + channel.dataset.code
    document.querySelector('#channel-name').textContent =
      channel.querySelector('b').textContent
    if (player.hasAttribute('src')) {
      player.pause()
      player.removeAttribute('src')
      player.load()
    }
    updateClock()
    if (!motionPreference.matches) {
      screen.querySelector('.tracking-band').animate(
        [
          { opacity: 0, transform: 'translateY(-55%)' },
          { opacity: 0.65, offset: 0.32 },
          { opacity: 0, transform: 'translateY(55%)' },
        ],
        { duration: 420, easing: 'ease-out' },
      )
    }
    syncPlayback()
  }

  channels.forEach((button, index) => {
    button.addEventListener('click', () => tune(button))
    button.addEventListener('keydown', (event) => {
      const keys = {
        ArrowLeft: (index + channels.length - 1) % channels.length,
        ArrowRight: (index + 1) % channels.length,
        Home: 0,
        End: channels.length - 1,
      }
      if (!Object.hasOwn(keys, event.key)) return
      event.preventDefault()
      const target = channels[keys[event.key]]
      target.focus()
      tune(target)
    })
  })
  playButton.addEventListener('click', () => {
    wantsPlayback = !wantsPlayback
    syncPlayback()
  })
  audioButton.addEventListener('click', () => {
    player.muted = !player.muted
    syncPlayback()
  })
  player.addEventListener('playing', () => {
    screen.classList.add('has-frame')
    updateControls()
  })
  player.addEventListener('pause', updateControls)
  player.addEventListener('timeupdate', updateClock)
  player.addEventListener('error', () => {
    if (!player.hasAttribute('src')) return
    screen.classList.remove('has-frame')
    wantsPlayback = false
    updateControls()
  })
  motionPreference.addEventListener('change', (event) => {
    wantsPlayback = !event.matches && !navigator.connection?.saveData
    syncPlayback()
  })
  const dialogs = new MutationObserver(syncPlayback)
  for (const dialog of document.querySelectorAll('dialog')) {
    dialogs.observe(dialog, { attributes: true, attributeFilter: ['open'] })
  }
  document.addEventListener('visibilitychange', syncPlayback)
  window.addEventListener('pagehide', () => {
    pageActive = false
    syncPlayback()
  })
  window.addEventListener('pageshow', () => {
    pageActive = true
    syncPlayback()
  })
  new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting
    syncPlayback()
  }).observe(screen)
  updateControls()
}
