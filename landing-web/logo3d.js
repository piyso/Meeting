import * as THREE from 'three'

export function createLogo3D(container, options = {}) {
  const { width = 400, height = 400, interactive = true, cameraZ = 7 } = options

  const scene = new THREE.Scene()

  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100)
  camera.position.z = cameraZ

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setSize(width, height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  container.appendChild(renderer.domElement)

  // Lights
  scene.add(new THREE.AmbientLight(0xffffff, 0.5))

  const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.5)
  dirLight1.position.set(10, 10, 5)
  scene.add(dirLight1)

  const dirLight2 = new THREE.DirectionalLight(0x3b82f6, 1)
  dirLight2.position.set(-10, -5, -5)
  scene.add(dirLight2)

  const dirLight3 = new THREE.DirectionalLight(0x22d3ee, 0.6)
  dirLight3.position.set(0, -8, 3)
  scene.add(dirLight3)

  const pointLight = new THREE.PointLight(0xa78bfa, 0.8)
  pointLight.position.set(5, 5, 5)
  scene.add(pointLight)

  // Group for animated rings
  const ringsGroup = new THREE.Group()
  scene.add(ringsGroup)

  // Three ultra-thin, sleek neon rings forming a precision gyroscope
  const r1Geom = new THREE.TorusGeometry(2.4, 0.015, 64, 128)
  const r1Mat = new THREE.MeshStandardMaterial({
    color: 0x3b82f6,
    emissive: 0x3b82f6,
    emissiveIntensity: 2,
  })
  const r1 = new THREE.Mesh(r1Geom, r1Mat)
  ringsGroup.add(r1)

  const r2Geom = new THREE.TorusGeometry(2.0, 0.02, 64, 128)
  const r2Mat = new THREE.MeshStandardMaterial({
    color: 0x22d3ee,
    emissive: 0x22d3ee,
    emissiveIntensity: 2,
  })
  const r2 = new THREE.Mesh(r2Geom, r2Mat)
  r2.rotation.x = Math.PI / 2
  ringsGroup.add(r2)

  const r3Geom = new THREE.TorusGeometry(1.6, 0.025, 64, 128)
  const r3Mat = new THREE.MeshStandardMaterial({
    color: 0x818cf8,
    emissive: 0x818cf8,
    emissiveIntensity: 2,
  })
  const r3 = new THREE.Mesh(r3Geom, r3Mat)
  r3.rotation.y = Math.PI / 2
  ringsGroup.add(r3)

  // Ambient data particles orbiting the core
  const particlesCount = 80
  const positions = new Float32Array(particlesCount * 3)
  for (let i = 0; i < particlesCount * 3; i += 3) {
    const r = 1.8 + Math.random() * 2
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(Math.random() * 2 - 1)
    positions[i] = r * Math.sin(phi) * Math.cos(theta)
    positions[i + 1] = r * Math.sin(phi) * Math.sin(theta)
    positions[i + 2] = r * Math.cos(phi)
  }
  const particlesGeom = new THREE.BufferGeometry()
  particlesGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const particlesMat = new THREE.PointsMaterial({
    size: 0.04,
    color: 0x22d3ee,
    transparent: true,
    opacity: 0.6,
    sizeAttenuation: true,
  })
  const particles = new THREE.Points(particlesGeom, particlesMat)
  ringsGroup.add(particles)

  // Group for floating core
  const coreGroup = new THREE.Group()
  scene.add(coreGroup)

  // Outer high-tech glass/wireframe shell - Icosahedron for an AI 'Core' look
  const shellGeom = new THREE.IcosahedronGeometry(0.9, 1)
  const shellMat = new THREE.MeshPhysicalMaterial({
    color: 0x0f172a,
    emissive: 0x0ea5e9,
    emissiveIntensity: 0.8,
    wireframe: true,
    transparent: true,
    opacity: 0.4,
    roughness: 0,
    metalness: 1,
  })
  const shell = new THREE.Mesh(shellGeom, shellMat)
  coreGroup.add(shell)

  // Intense glowing solid inner core
  const solidCoreGeom = new THREE.SphereGeometry(0.45, 32, 32)
  const solidCoreMat = new THREE.MeshBasicMaterial({ color: 0xffffff })
  const solidCore = new THREE.Mesh(solidCoreGeom, solidCoreMat)
  coreGroup.add(solidCore)

  // Soft translucent glow aura
  const auraGeom = new THREE.SphereGeometry(0.65, 32, 32)
  const auraMat = new THREE.MeshBasicMaterial({
    color: 0x22d3ee,
    transparent: true,
    opacity: 0.15,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const aura = new THREE.Mesh(auraGeom, auraMat)
  coreGroup.add(aura)

  // Core Point Light
  const coreLight = new THREE.PointLight(0x22d3ee, 15, 10, 2)
  coreGroup.add(coreLight)

  // Mouse interactivity
  let targetRotationX = 0
  let targetRotationY = 0

  if (interactive) {
    document.addEventListener('mousemove', event => {
      const mouseX = (event.clientX / window.innerWidth) * 2 - 1
      const mouseY = -(event.clientY / window.innerHeight) * 2 + 1

      targetRotationX = mouseX * 0.5
      targetRotationY = mouseY * 0.5
    })
  }

  // Animation Loop (using requestAnimationFrame directly instead of THREE.Clock to avoid warnings)
  let lastTime = 0
  let elapsed = 0

  function animate(time) {
    if (!lastTime) lastTime = time
    // Convert ms to s
    const delta = (time - lastTime) / 1000
    lastTime = time
    elapsed += delta

    requestAnimationFrame(animate)

    // Rings rotation
    r1.rotation.x = elapsed * 0.3
    r1.rotation.y = Math.sin(elapsed * 0.2) * 0.5

    r2.rotation.y = elapsed * 0.4
    r2.rotation.z = Math.cos(elapsed * 0.2) * 0.5

    r3.rotation.z = elapsed * 0.5
    r3.rotation.x = Math.sin(elapsed * 0.3) * 0.5

    particles.rotation.y = elapsed * 0.05

    // Core rotation
    shell.rotation.y = elapsed * 0.2
    shell.rotation.x = elapsed * 0.15

    // Core floating (subtle)
    coreGroup.position.y = Math.sin(elapsed * 1.5) * 0.05
    coreGroup.rotation.y = elapsed * 0.1
    coreGroup.rotation.x = Math.cos(elapsed * 1.5) * 0.1

    // Interactive tilt
    if (interactive) {
      scene.rotation.x += (targetRotationY - scene.rotation.x) * 0.05
      scene.rotation.y += (targetRotationX - scene.rotation.y) * 0.05
    }

    renderer.render(scene, camera)
  }

  requestAnimationFrame(animate)

  // Resize handler
  const handleResize = () => {
    // Only resize if the container isn't fixed dimensions
    if (container.clientWidth > 0 && container.clientHeight > 0) {
      camera.aspect = container.clientWidth / container.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(container.clientWidth, container.clientHeight)
    }
  }

  window.addEventListener('resize', handleResize)

  // Initial force resize to fix any layout issues
  setTimeout(handleResize, 100)

  return {
    destroy: () => {
      window.removeEventListener('resize', handleResize)
      renderer.dispose()
      // other disposals
    },
  }
}

// Mount automatically where requested
document.addEventListener('DOMContentLoaded', () => {
  // Nav logo (small, non-interactive)
  const navContainer = document.getElementById('nav-logo-3d')
  if (navContainer) {
    createLogo3D(navContainer, { width: 32, height: 32, interactive: false, cameraZ: 6 })
  }

  // Hero logo (large, interactive)
  const heroContainer = document.getElementById('hero-logo-3d')
  if (heroContainer) {
    // Setup generic wrapper that will fit its parent dynamically
    createLogo3D(heroContainer, {
      width: heroContainer.clientWidth || 300,
      height: heroContainer.clientHeight || 300,
      interactive: true,
    })
  }
})
