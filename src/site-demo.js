// Keep the WebGL renderer, game bundle and audio context out of the homepage
// until a visitor actually starts an expedition.
export function initDemo() {
  const launch = document.querySelector('#launch-demo')
  const dialog = document.querySelector('#demo-dialog')
  const mount = document.querySelector('#demo-mount')
  if (!launch || !mount || typeof dialog?.showModal !== 'function') return

  let frame
  function unload() {
    if (!frame) return
    if (
      document.fullscreenElement &&
      dialog.contains(document.fullscreenElement)
    )
      document.exitFullscreen?.().catch(() => {})
    frame.contentDocument?.dispatchEvent(new Event('archive-demo-dispose'))
    mount.replaceChildren()
    mount.removeAttribute('aria-busy')
    frame = null
  }

  launch.addEventListener('click', (event) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey ||
      launch.origin !== location.origin ||
      dialog.open
    )
      return
    // Outside a supported browser the anchor continues to the standalone game.
    if (!window.WebGL2RenderingContext) return
    dialog.showModal()
    event.preventDefault()
    unload()
    const status = document.createElement('span')
    status.className = 'demo-loading'
    status.setAttribute('role', 'status')
    status.textContent = 'Loading expedition…'
    frame = document.createElement('iframe')
    frame.dataset.gameDemo = ''
    frame.title = 'The Backrooms playable demo'
    frame.allow = 'autoplay; fullscreen; gamepad'
    frame.src = launch.href
    // Browsers can fire load even for a failed frame navigation. The game
    // entry marks its document before opening WebGL, so a missing script or
    // unavailable page can still leave a meaningful status in the host.
    frame.addEventListener('load', (event) => {
      if (event.currentTarget !== frame) return
      const doc = frame.contentDocument
      if (doc?.URL === 'about:blank' || doc?.body?.hasAttribute('data-demo'))
        return
      mount.removeAttribute('aria-busy')
      status.textContent = 'Demo unavailable. Open the full game to try again.'
    })
    frame.style.opacity = '0'
    mount.setAttribute('aria-busy', 'true')
    mount.replaceChildren(status, frame)
    frame.focus({ preventScroll: true })
  })

  window.addEventListener('message', (event) => {
    if (
      !frame ||
      !dialog.open ||
      event.origin !== location.origin ||
      event.source !== frame.contentWindow
    )
      return
    if (event.data === 'archive-demo-exit') dialog.close()
    if (event.data === 'archive-demo-ready') {
      mount.querySelector('.demo-loading')?.remove()
      mount.removeAttribute('aria-busy')
      frame.style.removeProperty('opacity')
    }
  })
  dialog.addEventListener('close', () => {
    if (dialog.open || !frame) return
    unload()
    launch.focus({ preventScroll: true })
  })
  window.addEventListener('pagehide', () => {
    if (dialog.open) dialog.close()
    unload()
  })
}
