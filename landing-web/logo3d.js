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

  /*
   * Geometry Reference (matches icon.svg exactly):
   *   SVG: center=512, outerOrbit=300, midRing=220, innerRing=140, core=80
   *   Ratios (normalized to midRing=2.2):
   *     outerOrbit = 300/220 * 2.2 = 3.0
   *     midRing    = 2.2
   *     innerRing  = 140/220 * 2.2 = 1.4
   *     core       = 80/220  * 2.2 = 0.8
   *   Arc sweep = 90° = Math.PI/2  (quarter circle, NOT 120°)
   */

  // Lights — dramatic, high contrast
  scene.add(new THREE.AmbientLight(0xffffff, 0.15))

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.2)
  keyLight.position.set(8, 8, 10)
  scene.add(keyLight)

  const fillLight = new THREE.DirectionalLight(0x0066ff, 1.0)
  fillLight.position.set(-8, -4, -5)
  scene.add(fillLight)

  // ――― RINGS GROUP ―――
  const ringsGroup = new THREE.Group()
  scene.add(ringsGroup)

  // 1. Outer Orbit (r=3.0) — faint dashed-style precision track
  const outerGeom = new THREE.TorusGeometry(3.0, 0.015, 16, 128)
  const outerMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.08,
  })
  const outerRing = new THREE.Mesh(outerGeom, outerMat)
  ringsGroup.add(outerRing)

  // Inner spinning group (holds mid ring + arcs)
  const innerRingsGroup = new THREE.Group()
  ringsGroup.add(innerRingsGroup)

  // 2. Mid Ring (r=2.2) — dark glass structural ring
  const midGeom = new THREE.TorusGeometry(2.2, 0.06, 64, 128)
  const midMat = new THREE.MeshPhysicalMaterial({
    color: 0x0a0f1d,
    emissive: 0x00ccff,
    emissiveIntensity: 0.08,
    roughness: 0.15,
    metalness: 0.9,
    clearcoat: 1.0,
    clearcoatRoughness: 0.1,
    transparent: true,
    opacity: 0.85,
  })
  const midRing = new THREE.Mesh(midGeom, midMat)
  innerRingsGroup.add(midRing)

  // 3. Inner Ring (r=1.4) — precision frame
  const innerGeom = new THREE.TorusGeometry(1.4, 0.015, 16, 100)
  const innerMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.04,
  })
  const innerRing = new THREE.Mesh(innerGeom, innerMat)
  ringsGroup.add(innerRing)

  // 4. Wave Arcs — 90° quarter-circles on r=2.2, 180° rotationally symmetric
  //    Math.PI/2 = 90° sweep (matches SVG exactly)
  const arcGeom = new THREE.TorusGeometry(2.2, 0.12, 64, 64, Math.PI / 2)

  // Arc 1: Cyan → Blue (top-left in SVG)
  const arc1Mat = new THREE.MeshPhysicalMaterial({
    color: 0x00f0ff,
    emissive: 0x00f0ff,
    emissiveIntensity: 3.5,
    roughness: 0.2,
    metalness: 0.7,
  })
  const arc1 = new THREE.Mesh(arcGeom, arc1Mat)
  // Rotate so it sweeps from "left" to "top" (like M 292 512 → 512 292 in SVG)
  arc1.rotation.set(0, 0, Math.PI / 2)
  innerRingsGroup.add(arc1)

  // Arc 2: Blue → Cyan (bottom-right in SVG, 180° opposite)
  const arc2Mat = new THREE.MeshPhysicalMaterial({
    color: 0x0055ff,
    emissive: 0x0055ff,
    emissiveIntensity: 3.5,
    roughness: 0.2,
    metalness: 0.7,
  })
  const arc2 = new THREE.Mesh(arcGeom, arc2Mat)
  // 180° rotated from arc1, perfectly symmetric
  arc2.rotation.set(0, 0, Math.PI / 2 + Math.PI)
  innerRingsGroup.add(arc2)

  // ――― CORE GROUP ―――
  const coreGroup = new THREE.Group()
  scene.add(coreGroup)

  // 5. Core Orb (r=0.8) — glossy glass sphere
  const coreGeom = new THREE.SphereGeometry(0.8, 64, 64)
  const coreMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    emissive: 0x0284c7,
    emissiveIntensity: 1.2,
    roughness: 0.05,
    metalness: 0.4,
    clearcoat: 1.0,
    clearcoatRoughness: 0.0,
    transmission: 0.5,
    thickness: 2.0,
  })
  const core = new THREE.Mesh(coreGeom, coreMat)
  coreGroup.add(core)

  // 6. Inner white-hot center
  const hotGeom = new THREE.SphereGeometry(0.4, 32, 32)
  const hotMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.9,
  })
  const hotCenter = new THREE.Mesh(hotGeom, hotMat)
  coreGroup.add(hotCenter)

  // 7. Core lighting
  const coreLight = new THREE.PointLight(0x00f0ff, 18, 12, 1.5)
  const blueLight = new THREE.PointLight(0x0044ff, 12, 20, 2)
  coreGroup.add(coreLight)
  coreGroup.add(blueLight)

  // ――― INTERACTION ―――
  let targetRotX = 0
  let targetRotY = 0

  if (interactive) {
    document.addEventListener('mousemove', e => {
      targetRotX = ((e.clientX / window.innerWidth) * 2 - 1) * 0.3
      targetRotY = (-(e.clientY / window.innerHeight) * 2 + 1) * 0.3
    })
  }

  // ――― ANIMATION ―――
  let lastTime = 0
  let elapsed = 0

  function animate(time) {
    if (!lastTime) lastTime = time
    const delta = (time - lastTime) / 1000
    lastTime = time
    elapsed += delta

    requestAnimationFrame(animate)

    // Outer orbit: gentle breathing tilt
    outerRing.rotation.x = Math.sin(elapsed * 0.4) * 0.15
    outerRing.rotation.y = Math.cos(elapsed * 0.4) * 0.15

    // Mid ring + arcs: slow spin
    innerRingsGroup.rotation.z = -elapsed * 0.8
    innerRingsGroup.rotation.x = Math.sin(elapsed * 0.6) * 0.08

    // Core: subtle float and slow rotation
    coreGroup.position.y = Math.sin(elapsed * 1.5) * 0.08
    coreGroup.rotation.y = elapsed * 0.15

    // Interactive tilt (lerp for smoothness)
    if (interactive) {
      scene.rotation.x += (targetRotY - scene.rotation.x) * 0.04
      scene.rotation.y += (targetRotX - scene.rotation.y) * 0.04
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
