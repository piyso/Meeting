import * as THREE from 'three'

export function createLogo3D(container, options = {}) {
  const { width = 600, height = 600, interactive = true } = options

  const w = container.clientWidth || width
  const h = container.clientHeight || height

  // 1. Setup Scene, Orthographic Camera, Renderer
  const scene = new THREE.Scene()
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setSize(w, h)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  container.appendChild(renderer.domElement)

  // 2. Uniforms for GLSL
  const uniforms = {
    u_time: { value: 0.0 },
    u_resolution: { value: new THREE.Vector2(w, h) },
    u_mouse: { value: new THREE.Vector2(0.5, 0.5) },
    u_scroll: { value: 0.0 },
  }

  // 3. The Shader Material (Fluid Smoke Aura)
  const vertexShader = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position, 1.0);
    }
  `

  const fragmentShader = `
    uniform float u_time;
    uniform vec2 u_resolution;
    uniform vec2 u_mouse;
    uniform float u_scroll;
    varying vec2 vUv;

    // Organic Simplex 2D noise
    vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

    float snoise(vec2 v) {
      const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
      vec2 i  = floor(v + dot(v, C.yy) );
      vec2 x0 = v - i + dot(i, C.xx);
      vec2 i1;
      i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
      vec4 x12 = x0.xyxy + C.xxzz;
      x12.xy -= i1;
      i = mod289(i);
      vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 )) + i.x + vec3(0.0, i1.x, 1.0 ));
      vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
      m = m*m;
      m = m*m;
      vec3 x = 2.0 * fract(p * C.www) - 1.0;
      vec3 h = abs(x) - 0.5;
      vec3 ox = floor(x + 0.5);
      vec3 a0 = x - ox;
      m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
      vec3 g;
      g.x  = a0.x  * x0.x  + h.x  * x0.y;
      g.yz = a0.yz * x12.xz + h.yz * x12.yw;
      return 130.0 * dot(m, g);
    }

    void main() {
      vec2 st = gl_FragCoord.xy / u_resolution.xy;
      
      // Keep ratio
      st.x *= u_resolution.x / u_resolution.y;
      
      // Calculate smooth distance for mouse interaction sphere
      vec2 mouseNorm = u_mouse;
      mouseNorm.x *= u_resolution.x / u_resolution.y;
      float dist = distance(st, mouseNorm);
      
      // Smooth gradient interaction boundary
      float interaction = smoothstep(0.8, 0.1, dist);

      vec2 pos = st * 2.5;
      float time = u_time * 0.15 + u_scroll * 0.003;

      // Triple-layered Fractional Brownian Motion (FBM) for complex fluid movement
      float q = snoise(pos - vec2(time));
      vec2 tr = pos + vec2(q, q) + time * 0.5 + interaction * 0.4;
      
      // Singularity Tier Multi-Octave Noise compute
      float r = snoise(tr);
      r += snoise(tr * 2.1) * 0.5;
      r += snoise(tr * 4.3) * 0.25;
      r = r / 1.75; // Normalize back to 0-1 range

      // Sovereign UI Colors: 
      // Deep space violet / brand lavender / mystic sage
      vec3 color1 = vec3(0.02, 0.05, 0.15);  // Deep background abyss
      vec3 color2 = vec3(0.4, 0.2, 0.9);     // Vibrant core memory
      vec3 color3 = vec3(0.1, 0.7, 0.6);     // Sage / teal interaction spark
      
      float mixFactor = smoothstep(-0.5, 1.0, r);
      vec3 baseMix = mix(color1, color2, mixFactor);
      
      // Intensify the sage glow where the mouse interacts
      vec3 finalColor = mix(baseMix, color3, smoothstep(0.4, 1.0, r) * interaction * 1.5);
      
      // Feathered edges forming the 'orb' or 'aura' boundary
      float centerDist = distance(vUv, vec2(0.5));
      float boundaryFade = smoothstep(0.5, 0.1, centerDist);
      
      float alpha = smoothstep(0.0, 0.6, r + 0.5) * boundaryFade;

      gl_FragColor = vec4(finalColor, alpha);
    }
  `

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    transparent: true,
    depthWrite: false,
  })

  // 4. Fill screen/container with the plane
  const geometry = new THREE.PlaneGeometry(2, 2)
  const mesh = new THREE.Mesh(geometry, material)
  scene.add(mesh)

  // 5. Interaction Tracking
  const targetMouse = new THREE.Vector2(0.5, 0.5)
  if (interactive) {
    container.addEventListener('mousemove', e => {
      const rect = container.getBoundingClientRect()
      // Map mouse position natively inside container
      const mx = (e.clientX - rect.left) / rect.width
      const my = 1.0 - (e.clientY - rect.top) / rect.height
      targetMouse.set(mx, my)
    })

    window.addEventListener('scroll', () => {
      uniforms.u_scroll.value = window.scrollY
    })
  }

  // Handle Resize
  window.addEventListener('resize', () => {
    const cw = container.clientWidth
    const ch = container.clientHeight
    renderer.setSize(cw, ch)
    uniforms.u_resolution.value.set(cw, ch)
  })

  // 6. Animation Loop & Performance Optimization (Intersection Observer)
  const clock = new THREE.Clock()
  let isVisible = true
  let animationFrameId = null

  // Stop rendering when the canvas is off-screen to save battery/CPU (MNC Standard)
  const observer = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        isVisible = entry.isIntersecting
      })
    },
    { threshold: 0 }
  )
  observer.observe(renderer.domElement)

  function animate() {
    animationFrameId = requestAnimationFrame(animate)

    if (isVisible) {
      // Smoothly interpolate mouse for fluid drag effect (stiffness factor)
      uniforms.u_mouse.value.lerp(targetMouse, 0.05)
      uniforms.u_time.value = clock.getElapsedTime()
      renderer.render(scene, camera)
    }
  }

  animate()

  // Return teardown function if needed
  return () => {
    cancelAnimationFrame(animationFrameId)
    observer.disconnect()
    renderer.dispose()
    geometry.dispose()
    material.dispose()
  }
}
