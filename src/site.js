import { initFieldFeed } from './site-feed.js'
import { initDemo } from './site-demo.js'

const nav = document.querySelector('#main-nav')
const toggle = document.querySelector('.menu-toggle')
const navLinks = [...nav.querySelectorAll('a')]

function setMenu(open) {
  nav.classList.toggle('open', open)
  toggle.setAttribute('aria-expanded', String(open))
  toggle.setAttribute(
    'aria-label',
    open ? 'Close navigation' : 'Open navigation',
  )
  toggle
    .querySelector('use')
    .setAttribute('href', open ? '#close-icon' : '#menu-icon')
}

toggle.addEventListener('click', () => setMenu(!nav.classList.contains('open')))
nav.addEventListener('click', () => setMenu(false))
document.addEventListener('click', (event) => {
  if (nav.classList.contains('open') && !event.target.closest('.masthead'))
    setMenu(false)
})
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && nav.classList.contains('open')) {
    setMenu(false)
    toggle.focus()
  }
})

const sections = navLinks.map((link) => document.querySelector(link.hash))
function updateNav() {
  const cutoff = window.innerHeight * 0.35
  const selected = sections.findLastIndex(
    (section) => section.getBoundingClientRect().top <= cutoff,
  )
  navLinks.forEach((link, index) => {
    if (index === Math.max(0, selected))
      link.setAttribute('aria-current', 'location')
    else link.removeAttribute('aria-current')
  })
}
updateNav()
let navPending = false
window.addEventListener(
  'scroll',
  () => {
    if (navPending) return
    navPending = true
    requestAnimationFrame(() => {
      updateNav()
      navPending = false
    })
  },
  { passive: true },
)

for (const dialog of document.querySelectorAll('dialog')) {
  dialog
    .querySelector('[data-close]')
    .addEventListener('click', () => dialog.close())
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return
    const bounds = dialog.getBoundingClientRect()
    if (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    )
      dialog.close()
  })
}

const trailer = document.querySelector('#trailer-dialog')
const video = trailer.querySelector('video')
const watch = document.querySelector('#watch-trailer')
function shouldOpen(event, dialog) {
  return (
    typeof dialog.showModal === 'function' &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    !event.altKey
  )
}
function showTrailer(event, startTime) {
  if (!shouldOpen(event, trailer)) return
  event.preventDefault()
  if (!video.getAttribute('src')) {
    video.poster = video.dataset.poster
    video.src = video.dataset.src
  }
  trailer.showModal()
  video.currentTime = startTime
  video.play().catch(() => {
    // Native controls also work in browsers that require another gesture.
  })
}
watch.addEventListener('click', (event) => showTrailer(event, 0))
document
  .querySelector('#review-encounter')
  .addEventListener('click', (event) => showTrailer(event, 17.5))
trailer.addEventListener('close', () => video.pause())

const gallery = document.querySelector('#location-dialog')
const locations = [...document.querySelectorAll('.location-link')]
const photo = gallery.querySelector('img')
const title = gallery.querySelector('#location-title')
const description = gallery.querySelector('#location-description')
let activeLocation = 0
function showLocation(index) {
  activeLocation = (index + locations.length) % locations.length
  const location = locations[activeLocation]
  photo.src = location.href
  photo.alt = location.querySelector('img').alt
  title.textContent = location.querySelector('h3').textContent
  description.textContent =
    location.parentElement.querySelector('.observation').textContent
}
locations.forEach((link, index) => {
  link.addEventListener('click', (event) => {
    if (!shouldOpen(event, gallery)) return
    event.preventDefault()
    showLocation(index)
    gallery.showModal()
  })
})
gallery
  .querySelector('#previous')
  .addEventListener('click', () => showLocation(activeLocation - 1))
gallery
  .querySelector('#next')
  .addEventListener('click', () => showLocation(activeLocation + 1))
gallery.addEventListener('keydown', (event) => {
  if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return
  event.preventDefault()
  showLocation(activeLocation + (event.key === 'ArrowRight' ? 1 : -1))
})

initFieldFeed()
initDemo()

const reveal = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      entry.target.classList.add('in-view')
      reveal.unobserve(entry.target)
    }
  },
  { threshold: 0.12 },
)
for (const item of document.querySelectorAll(
  '.location, .encounter, .guide-note, .entry-inner',
)) {
  reveal.observe(item)
}
