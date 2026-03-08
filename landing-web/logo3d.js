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

  // --- Rings Group ---
  const ringsGroup = new THREE.Group()
  scene.add(ringsGroup)

  // Outer ring (cyan glow) match from icon.svg
  const outerGeom = new THREE.TorusGeometry(2.8, 0.04, 32, 100)
  const outerMat = new THREE.MeshStandardMaterial({
    color: 0x06b6d4,
    emissive: 0x06b6d4,
    emissiveIntensity: 0.5,
    transparent: true,
    opacity: 0.6,
  })
  const outerRing = new THREE.Mesh(outerGeom, outerMat)
  ringsGroup.add(outerRing)

  // Inner spinning ring group
  const innerRingsGroup = new THREE.Group()
  ringsGroup.add(innerRingsGroup)

  // Inner spinning ring match from icon.svg
  const innerGeom = new THREE.TorusGeometry(2.2, 0.08, 32, 100)
  const innerMat = new THREE.MeshStandardMaterial({
    color: 0x3b82f6,
    emissive: 0x3b82f6,
    emissiveIntensity: 0.8,
    transparent: true,
    opacity: 0.8,
  })
  const innerRing = new THREE.Mesh(innerGeom, innerMat)
  innerRingsGroup.add(innerRing)

  // Wave arcs (Left and Right) match from icon.svg
  const arcGeom = new THREE.TorusGeometry(2.22, 0.1, 32, 64, Math.PI / 2)
  const arcMat = new THREE.MeshStandardMaterial({
    color: 0x22d3ee,
    emissive: 0x22d3ee,
    emissiveIntensity: 2.5,
  })

  const arc1 = new THREE.Mesh(arcGeom, arcMat)
  arc1.rotation.set(0, 0, Math.PI / 4)
  innerRingsGroup.add(arc1)

  const arc2 = new THREE.Mesh(arcGeom, arcMat)
  arc2.rotation.set(0, 0, Math.PI / 4 + Math.PI)
  innerRingsGroup.add(arc2)

  // --- Core Group ---
  const coreGroup = new THREE.Group()
  scene.add(coreGroup)

  // Center solid recording dot match from icon.svg (#22D3EE)
  const solidDotGeom = new THREE.SphereGeometry(0.8, 64, 64)
  const solidDotMat = new THREE.MeshPhysicalMaterial({
    color: 0x22d3ee,
    emissive: 0x06b6d4,
    emissiveIntensity: 0.2,
    roughness: 0.1,
    metalness: 0.2,
    clearcoat: 1.0,
    clearcoatRoughness: 0.1,
  })
  const solidDot = new THREE.Mesh(solidDotGeom, solidDotMat)
  coreGroup.add(solidDot)

  // Dot inner highlight match from icon.svg (#0EA5E9)
  const highlightGeom = new THREE.SphereGeometry(0.5, 32, 32)
  const highlightMat = new THREE.MeshBasicMaterial({
    color: 0x0ea5e9,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const highlight = new THREE.Mesh(highlightGeom, highlightMat)
  highlight.position.set(0, 0, 0.4)
  coreGroup.add(highlight)

  // Illuminating the entire scene from the center dot
  const coreLight = new THREE.PointLight(0x22d3ee, 10, 15, 2)
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
  let lastTime = 0
  let elapsed = 0

  function animate(time) {
    if (!lastTime) lastTime = time
    const delta = (time - lastTime) / 1000
    lastTime = time
    elapsed += delta

    requestAnimationFrame(animate)

    // Outer ring slow breathing tilt
    outerRing.rotation.x = Math.sin(elapsed * 0.5) * 0.2
    outerRing.rotation.y = Math.cos(elapsed * 0.5) * 0.2

    // Inner ring smooth spinning
    innerRingsGroup.rotation.z = -elapsed * 1.5
    innerRingsGroup.rotation.x = 0.1
    innerRingsGroup.rotation.y = Math.sin(elapsed) * 0.1

    // Core floating and subtle rotation
    coreGroup.position.y = Math.sin(elapsed * 2) * 0.1
    coreGroup.rotation.y = elapsed * 0.2
    coreGroup.rotation.x = Math.sin(elapsed) * 0.1

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
    if (container.clientWidth > 0 && container.clientHeight > 0) {
      camera.aspect = container.clientWidth / container.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(container.clientWidth, container.clientHeight)
    }
  }

  window.addEventListener('resize', handleResize)
  setTimeout(handleResize, 100)

  return {
    destroy: () => {
      window.removeEventListener('resize', handleResize)
      renderer.dispose()
    },
  }
}

// Mount automatically where requested
document.addEventListener('DOMContentLoaded', () => {
  const navContainer = document.getElementById('nav-logo-3d')
  if (navContainer) {
    createLogo3D(navContainer, { width: 32, height: 32, interactive: false, cameraZ: 6 })
  }

  const heroContainer = document.getElementById('hero-logo-3d')
  if (heroContainer) {
    createLogo3D(heroContainer, {
      width: heroContainer.clientWidth || 300,
      height: heroContainer.clientHeight || 300,
      interactive: true,
    })
  }
})
