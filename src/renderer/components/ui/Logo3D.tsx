import React, { useRef, Suspense } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Float, Sphere, Torus, MeshDistortMaterial } from '@react-three/drei'
import * as THREE from 'three'

interface Logo3DProps {
  className?: string
}

const AnimatedRings = () => {
  const outerRingRef = useRef<THREE.Mesh>(null)
  const innerRingRef = useRef<THREE.Mesh>(null)

  useFrame(state => {
    const elapsed = state.clock.getElapsedTime()
    // Rotate rings in opposite directions
    if (outerRingRef.current) {
      outerRingRef.current.rotation.x = Math.sin(elapsed * 0.5) * 0.5
      outerRingRef.current.rotation.y = elapsed * 0.8
    }

    if (innerRingRef.current) {
      innerRingRef.current.rotation.x = Math.cos(elapsed * 0.5) * 0.5
      innerRingRef.current.rotation.y = -elapsed * 1.2
      innerRingRef.current.rotation.z = elapsed * 0.5
    }
  })

  return (
    <group>
      {/* Outer Cyan Ring */}
      <Torus
        ref={outerRingRef}
        args={[2.5, 0.08, 16, 100]}
        material-transparent
        material-opacity={0.6}
      >
        <meshPhysicalMaterial
          color="#22d3ee" // cyan-400
          emissive="#22d3ee"
          emissiveIntensity={0.8}
          roughness={0.1}
          metalness={0.8}
          transmission={0.5}
          thickness={0.5}
        />
      </Torus>

      {/* Inner Blue Ring */}
      <Torus
        ref={innerRingRef}
        args={[1.8, 0.1, 16, 100]}
        material-transparent
        material-opacity={0.8}
      >
        <meshPhysicalMaterial
          color="#3b82f6" // blue-500
          emissive="#3b82f6"
          emissiveIntensity={1.2}
          roughness={0.2}
          metalness={0.9}
        />
      </Torus>
    </group>
  )
}

const GlowingCore = () => {
  return (
    <Float speed={2.5} rotationIntensity={0.5} floatIntensity={1.5}>
      <Sphere args={[0.7, 64, 64]}>
        <MeshDistortMaterial
          color="#0ea5e9" // sky-500
          emissive="#22d3ee"
          emissiveIntensity={2}
          distort={0.4}
          speed={3}
          roughness={0.2}
          metalness={0.8}
        />
      </Sphere>

      {/* Inner solid core representation of the recording dot */}
      <Sphere args={[0.4, 32, 32]}>
        <meshBasicMaterial color="#ffffff" />
      </Sphere>

      {/* Core Point Light */}
      <pointLight color="#22d3ee" intensity={20} distance={10} decay={2} />
    </Float>
  )
}

/** CSS-only fallback logo shown while 3D loads or if WebGL fails */
const FallbackLogo = () => (
  <div
    style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    <div
      style={{
        width: 80,
        height: 80,
        borderRadius: '50%',
        background: 'radial-gradient(circle, #22d3ee 0%, #3b82f6 60%, transparent 70%)',
        boxShadow: '0 0 40px rgba(34, 211, 238, 0.4), 0 0 80px rgba(59, 130, 246, 0.2)',
        animation: 'pulse 2s ease-in-out infinite',
      }}
    />
  </div>
)

export const Logo3D: React.FC<Logo3DProps> = ({ className = '' }) => {
  return (
    <div className={`relative w-48 h-48 mx-auto ${className}`}>
      {/* Subtle background glow for the container */}
      <div className="absolute inset-0 bg-blue-500/10 blur-[40px] rounded-full pointer-events-none" />

      <Suspense fallback={<FallbackLogo />}>
        <Canvas
          camera={{ position: [0, 0, 7], fov: 45 }}
          dpr={[1, 2]} // Optimize for high DPI displays like Mac retina
          gl={{ antialias: true, alpha: true }}
          onCreated={({ gl }) => {
            // Graceful degradation if WebGL context is lost
            gl.domElement.addEventListener('webglcontextlost', e => {
              e.preventDefault()
              console.warn('[Logo3D] WebGL context lost')
            })
          }}
        >
          <ambientLight intensity={0.5} />
          <directionalLight position={[10, 10, 5]} intensity={1.5} color="#ffffff" />
          <directionalLight position={[-10, -5, -5]} intensity={1} color="#3b82f6" />
          {/* Fill light from below for premium reflections */}
          <directionalLight position={[0, -8, 3]} intensity={0.6} color="#22d3ee" />
          <pointLight position={[5, 5, 5]} intensity={0.8} color="#a78bfa" />

          <AnimatedRings />
          <GlowingCore />

          {/* No Environment preset — uses lights only for offline Electron compatibility */}
        </Canvas>
      </Suspense>
    </div>
  )
}
