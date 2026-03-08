import React, { useRef, Suspense } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Float, Sphere, Torus, Icosahedron } from '@react-three/drei'
import * as THREE from 'three'

interface Logo3DProps {
  className?: string
}

const AnimatedRings = () => {
  const ring1Ref = useRef<THREE.Mesh>(null)
  const ring2Ref = useRef<THREE.Mesh>(null)
  const ring3Ref = useRef<THREE.Mesh>(null)
  const particlesRef = useRef<THREE.Points>(null)

  useFrame(state => {
    const elapsed = state.clock.getElapsedTime()
    if (ring1Ref.current) {
      ring1Ref.current.rotation.x = elapsed * 0.3
      ring1Ref.current.rotation.y = Math.sin(elapsed * 0.2) * 0.5
    }
    if (ring2Ref.current) {
      ring2Ref.current.rotation.y = elapsed * 0.4
      ring2Ref.current.rotation.z = Math.cos(elapsed * 0.2) * 0.5
    }
    if (ring3Ref.current) {
      ring3Ref.current.rotation.z = elapsed * 0.5
      ring3Ref.current.rotation.x = Math.sin(elapsed * 0.3) * 0.5
    }
    if (particlesRef.current) {
      particlesRef.current.rotation.y = elapsed * 0.05
    }
  })

  // Generate a subtle ambient particle field
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

  return (
    <group>
      {/* Three ultra-thin, sleek neon rings forming a precision gyroscope */}
      <Torus ref={ring1Ref} args={[2.4, 0.015, 64, 128]}>
        <meshStandardMaterial
          color="#3b82f6"
          emissive="#3b82f6"
          emissiveIntensity={2}
          toneMapped={false}
        />
      </Torus>
      <Torus ref={ring2Ref} args={[2.0, 0.02, 64, 128]} rotation={[Math.PI / 2, 0, 0]}>
        <meshStandardMaterial
          color="#22d3ee"
          emissive="#22d3ee"
          emissiveIntensity={2}
          toneMapped={false}
        />
      </Torus>
      <Torus ref={ring3Ref} args={[1.6, 0.025, 64, 128]} rotation={[0, Math.PI / 2, 0]}>
        <meshStandardMaterial
          color="#818cf8"
          emissive="#818cf8"
          emissiveIntensity={2}
          toneMapped={false}
        />
      </Torus>

      {/* Ambient data particles orbiting the core */}
      <points ref={particlesRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={particlesCount}
            array={positions}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial size={0.04} color="#22d3ee" transparent opacity={0.6} sizeAttenuation />
      </points>
    </group>
  )
}

const GlowingCore = () => {
  const shellRef = useRef<THREE.Mesh>(null)

  useFrame(state => {
    if (shellRef.current) {
      shellRef.current.rotation.y = state.clock.getElapsedTime() * 0.2
      shellRef.current.rotation.x = state.clock.getElapsedTime() * 0.15
    }
  })

  return (
    <Float speed={1.5} rotationIntensity={0.2} floatIntensity={0.2}>
      {/* Outer high-tech glass/wireframe shell - Icosahedron for an AI 'Core' look */}
      <Icosahedron ref={shellRef} args={[0.9, 1]}>
        <meshPhysicalMaterial
          color="#0f172a"
          emissive="#0ea5e9"
          emissiveIntensity={0.8}
          wireframe={true}
          transparent={true}
          opacity={0.4}
          roughness={0}
          metalness={1}
        />
      </Icosahedron>

      {/* Intense glowing solid inner core */}
      <Sphere args={[0.45, 32, 32]}>
        <meshBasicMaterial color="#ffffff" />
      </Sphere>

      {/* Soft translucent glow aura */}
      <Sphere args={[0.65, 32, 32]}>
        <meshBasicMaterial
          color="#22d3ee"
          transparent
          opacity={0.15}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </Sphere>

      <pointLight color="#22d3ee" intensity={15} distance={10} decay={2} />
    </Float>
  )
}

/** CSS-only fallback logo shown while 3D loads or if WebGL fails */
const FallbackLogo = () => (
  <div className="w-full h-full flex items-center justify-center">
    <div className="relative w-20 h-20 rounded-full flex items-center justify-center">
      {/* Rings mimicking the 3D gyroscope */}
      <div
        className="absolute inset-0 rounded-full border border-blue-500/40 animate-[spin_4s_linear_infinite]"
        style={{ transform: 'rotateX(60deg)' }}
      />
      <div
        className="absolute inset-0 rounded-full border border-cyan-400/50 animate-[spin_3s_linear_reverse_infinite]"
        style={{ transform: 'rotateY(60deg)' }}
      />
      <div
        className="absolute w-16 h-16 rounded-full border border-indigo-400/40 animate-[spin_5s_linear_infinite]"
        style={{ transform: 'rotateZ(45deg) rotateX(45deg)' }}
      />
      {/* Core glow */}
      <div className="absolute w-8 h-8 rounded-full bg-white shadow-[0_0_20px_#22d3ee,0_0_40px_#3b82f6] animate-[pulse_2s_ease-in-out_infinite]" />
    </div>
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
