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

  // Outer Cyan Ring
  const outerGeom = new THREE.TorusGeometry(2.5, 0.08, 16, 100)
  const outerMat = new THREE.MeshPhysicalMaterial({
    color: 0x22d3ee,
    emissive: 0x22d3ee,
    emissiveIntensity: 0.8,
    roughness: 0.1,
    metalness: 0.8,
    transmission: 0.5,
    thickness: 0.5,
    transparent: true,
    opacity: 0.6,
  })
  const outerRing = new THREE.Mesh(outerGeom, outerMat)
  ringsGroup.add(outerRing)

  // Inner Blue Ring
  const innerGeom = new THREE.TorusGeometry(1.8, 0.1, 16, 100)
  const innerMat = new THREE.MeshPhysicalMaterial({
    color: 0x3b82f6,
    emissive: 0x3b82f6,
    emissiveIntensity: 1.2,
    roughness: 0.2,
    metalness: 0.9,
    transparent: true,
    opacity: 0.8,
  })
  const innerRing = new THREE.Mesh(innerGeom, innerMat)
  ringsGroup.add(innerRing)

  // Group for floating core
  const coreGroup = new THREE.Group()
  scene.add(coreGroup)

  // Glowing Sphere
  const sphereGeom = new THREE.SphereGeometry(0.7, 64, 64)
  const sphereMat = new THREE.MeshPhysicalMaterial({
    color: 0x0ea5e9,
    emissive: 0x22d3ee,
    emissiveIntensity: 2,
    roughness: 0.2,
    metalness: 0.8,
  })
  const sphere = new THREE.Mesh(sphereGeom, sphereMat)
  coreGroup.add(sphere)

  // Inner solid core (white)
  const solidCoreGeom = new THREE.SphereGeometry(0.4, 32, 32)
  const solidCoreMat = new THREE.MeshBasicMaterial({ color: 0xffffff })
  const solidCore = new THREE.Mesh(solidCoreGeom, solidCoreMat)
  coreGroup.add(solidCore)

  // Core Point Light
  const coreLight = new THREE.PointLight(0x22d3ee, 20, 10, 2)
  coreLight.position.set(0, 0, 0)
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

  // Animation Loop
  const clock = new THREE.Clock()

  function animate() {
    requestAnimationFrame(animate)

    const elapsed = clock.getElapsedTime()

    // Rings rotation
    outerRing.rotation.x = Math.sin(elapsed * 0.5) * 0.5
    outerRing.rotation.y = elapsed * 0.8

    innerRing.rotation.x = Math.cos(elapsed * 0.5) * 0.5
    innerRing.rotation.y = -elapsed * 1.2
    innerRing.rotation.z = Math.sin(elapsed * 0.3) * 0.5

    // Core floating
    coreGroup.position.y = Math.sin(elapsed * 2.5) * 0.15
    coreGroup.rotation.y = elapsed * 0.5
    coreGroup.rotation.x = Math.cos(elapsed * 0.5) * 0.2

    // Interactive tilt
    if (interactive) {
      scene.rotation.x += (targetRotationY - scene.rotation.x) * 0.05
      scene.rotation.y += (targetRotationX - scene.rotation.y) * 0.05
    }

    // Organic pulse for the core sphere material
    const pulse = Math.sin(elapsed * 3) * 0.5 + 0.5
    sphere.scale.setScalar(1 + pulse * 0.05)
    outerRing.scale.setScalar(1 + Math.cos(elapsed * 2) * 0.02)

    renderer.render(scene, camera)
  }

  animate()

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
