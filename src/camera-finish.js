import * as THREE from 'three'

// Separate bright practical lights from the image before diffusing them.
// Filtering a small buffer keeps the carpet, wallpaper and lettering sharp.
const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = position.xy * .5 + .5;
    gl_Position = vec4(position.xy, 0., 1.);
  }
`

function shader(uniforms, fragment) {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader: 'varying vec2 vUv;\n' + fragment,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  })
}

export function createCameraFinish(renderer) {
  const gl = renderer.getContext()
  const hdr = renderer.extensions.has('EXT_color_buffer_float')
  const format = hdr ? gl.RGBA16F : gl.SRGB8_ALPHA8
  const supported = gl.getInternalformatParameter(
    gl.RENDERBUFFER,
    format,
    gl.SAMPLES,
  )
  const samples =
    [...supported].reverse().find((count) => count >= 2 && count <= 4) ?? 0
  const frame = new THREE.WebGLRenderTarget(1, 1, {
    type: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType,
    colorSpace: hdr ? THREE.LinearSRGBColorSpace : THREE.SRGBColorSpace,
    samples,
    generateMipmaps: false,
  })
  const highlights = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false })
  const scratch = highlights.clone()
  const extract = shader(
    {
      frame: { value: frame.texture },
      pixel: { value: new THREE.Vector2() },
    },
    `
    uniform sampler2D frame;
    uniform vec2 pixel;
    vec3 bright(vec2 uv) {
      vec3 col = texture2D(frame, uv).rgb;
      float y = dot(col, vec3(.213,.715,.072));
      return col * smoothstep(.36,.86,y);
    }
    void main() {
      vec2 p = pixel * 1.35;
      gl_FragColor = vec4(.25 * (bright(vUv+p) + bright(vUv-p) +
        bright(vUv+vec2(p.x,-p.y)) + bright(vUv+vec2(-p.x,p.y))), 1.);
    }
  `,
  )
  const blur = shader(
    {
      source: { value: null },
      offset: { value: new THREE.Vector2() },
    },
    `
    uniform sampler2D source;
    uniform vec2 offset;
    void main() {
      vec3 sum = texture2D(source,vUv).rgb * .22703;
      sum += .31622 * (texture2D(source,vUv + offset*1.3846).rgb + texture2D(source,vUv - offset*1.3846).rgb);
      sum += .07027 * (texture2D(source,vUv + offset*3.2308).rgb + texture2D(source,vUv - offset*3.2308).rgb);
      gl_FragColor = vec4(sum,1.);
    }
  `,
  )
  const composite = shader(
    {
      frame: { value: frame.texture },
      glow: { value: highlights.texture },
      brightness: { value: 1 },
      bloomEnabled: { value: true },
    },
    `
    uniform sampler2D frame;
    uniform sampler2D glow;
    uniform float brightness;
    uniform bool bloomEnabled;
    void main() {
      vec3 c = texture2D(frame,vUv).rgb;
      float luminance = dot(c,vec3(.213,.715,.072));
      c = mix(vec3(luminance),c,.94);
      if (bloomEnabled) c += texture2D(glow,vUv).rgb * vec3(.18,.157,.128);
      c *= brightness;
      // A soft shoulder around the diffuser preserves its internal pattern.
      vec3 excess = max(c - .68,0.);
      c = min(c,.68) + .32*(1.-exp(-excess/.32));
      gl_FragColor = vec4(c,1.);
      #include <colorspace_fragment>
    }
  `,
  )
  const triangle = new THREE.BufferGeometry()
  triangle.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3),
  )
  const screen = new THREE.Mesh(triangle, extract)
  screen.frustumCulled = false
  const camera = new THREE.Camera()
  const bufferSize = new THREE.Vector2()
  function resize() {
    renderer.getDrawingBufferSize(bufferSize)
    frame.setSize(bufferSize.x, bufferSize.y)
    const w = Math.max(1, Math.ceil(bufferSize.x / 5))
    const h = Math.max(1, Math.ceil(bufferSize.y / 5))
    highlights.setSize(w, h)
    scratch.setSize(w, h)
    extract.uniforms.pixel.value.set(1 / bufferSize.x, 1 / bufferSize.y)
  }
  function pass(target, material) {
    renderer.setRenderTarget(target)
    screen.material = material
    renderer.render(screen, camera)
  }
  function render(scene, view, foreground) {
    renderer.setRenderTarget(frame)
    renderer.render(scene, view)
    foreground?.render(renderer)
    if (composite.uniforms.bloomEnabled.value) {
      pass(highlights, extract)
      blur.uniforms.source.value = highlights.texture
      blur.uniforms.offset.value.set(2.6 / highlights.width, 0)
      pass(scratch, blur)
      blur.uniforms.source.value = scratch.texture
      blur.uniforms.offset.value.set(0, 2.6 / highlights.height)
      pass(highlights, blur)
    }
    pass(null, composite)
  }
  return {
    resize,
    render,
    setSettings({ brightness, bloom }) {
      if (Number.isFinite(brightness))
        composite.uniforms.brightness.value = THREE.MathUtils.clamp(
          brightness,
          0.65,
          1.5,
        )
      if (typeof bloom === 'boolean')
        composite.uniforms.bloomEnabled.value = bloom
    },
    dispose() {
      for (const item of [
        frame,
        highlights,
        scratch,
        triangle,
        extract,
        blur,
        composite,
      ])
        item.dispose()
    },
  }
}
