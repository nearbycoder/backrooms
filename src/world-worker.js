import { createLayout } from './world-layout.js'
import { bakeChunk } from './world-mesh.js'

let layout
self.onmessage = ({ data }) => {
  layout ??= createLayout(data.seed)
  const surfaces = bakeChunk(layout, data.cx, data.cz)
  const buffers = surfaces.flatMap((surface) =>
    [
      surface.positions,
      surface.normals,
      surface.colors,
      surface.uvs,
      surface.indices,
      surface.lampDirections,
    ]
      .filter(Boolean)
      .map((array) => array.buffer),
  )
  self.postMessage({ cx: data.cx, cz: data.cz, surfaces }, buffers)
}
