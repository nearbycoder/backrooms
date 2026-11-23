import * as THREE from 'three'

const LIMIT = 24

export function createTrail(scene) {
  const tags = []
  const geometry = new THREE.PlaneGeometry(0.34, 0.64)
  let count = 0

  function label(number) {
    const canvas = document.createElement('canvas')
    canvas.width = 96
    canvas.height = 160
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#cfdf8b'
    ctx.beginPath()
    ctx.moveTo(48, 4)
    ctx.lineTo(92, 57)
    ctx.lineTo(73, 57)
    ctx.lineTo(73, 152)
    ctx.lineTo(23, 156)
    ctx.lineTo(23, 57)
    ctx.lineTo(4, 57)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#203125'
    ctx.font = 'bold 28px monospace'
    ctx.textAlign = 'center'
    ctx.fillText(String(number), 48, 129, 46)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    return texture
  }

  function remove(tag) {
    tag.removeFromParent()
    tag.material.map.dispose()
    tag.material.dispose()
  }

  function mark(pos, yaw, world) {
    const x = pos.x - Math.sin(yaw) * 0.95,
      z = pos.z - Math.cos(yaw) * 0.95
    const clear = world.canStand(x, z)
    const point = new THREE.Vector3(clear ? x : pos.x, 0.019, clear ? z : pos.z)
    if (tags.some((tag) => tag.position.distanceToSquared(point) < 0.15))
      return false
    if (tags.length === LIMIT) remove(tags.shift())
    count++
    const material = new THREE.MeshBasicMaterial({
      map: label(count),
      transparent: true,
      alphaTest: 0.25,
    })
    const tag = new THREE.Mesh(geometry, material)
    tag.position.copy(point)
    tag.rotation.set(-Math.PI / 2, yaw, 0, 'YXZ')
    scene.add(tag)
    tags.push(tag)
    return true
  }
  return {
    mark,
    get count() {
      return count
    },
    clear() {
      for (const tag of tags) remove(tag)
      tags.length = 0
      count = 0
    },
    dispose() {
      this.clear()
      geometry.dispose()
    },
  }
}
