import React, { useRef, Suspense } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Sphere, Torus } from '@react-three/drei'
import * as THREE from 'three'

interface Logo3DProps {
  className?: string
}

const AnimatedRings = () => {
  const outerRingRef = useRef<THREE.Mesh>(null)
  const innerRingRef = useRef<THREE.Group>(null)

  useFrame(state => {
    const elapsed = state.clock.getElapsedTime()
    if (outerRingRef.current) {
      // Slow, subtle breathing tilt for the outer ring
      outerRingRef.current.rotation.x = Math.sin(elapsed * 0.5) * 0.2
      outerRingRef.current.rotation.y = Math.cos(elapsed * 0.5) * 0.2
    }
    if (innerRingRef.current) {
      // The inner ring and its arcs spin smoothly
      innerRingRef.current.rotation.z = -elapsed * 1.5
      // Slight tilt on the inner ring for 3D depth
      innerRingRef.current.rotation.x = 0.1
      innerRingRef.current.rotation.y = Math.sin(elapsed) * 0.1
    }
  })

  return (
    <group>
      {/* Outer ring (cyan glow) match from icon.svg */}
      <Torus ref={outerRingRef} args={[2.8, 0.04, 32, 100]}>
        <meshStandardMaterial
          color="#06b6d4"
          emissive="#06b6d4"
          emissiveIntensity={0.5}
          transparent
          opacity={0.6}
          toneMapped={false}
        />
      </Torus>

      <group ref={innerRingRef}>
        {/* Inner spinning ring match from icon.svg */}
        <Torus args={[2.2, 0.08, 32, 100]}>
          <meshStandardMaterial
            color="#3b82f6"
            emissive="#3b82f6"
            emissiveIntensity={0.8}
            transparent
            opacity={0.8}
            toneMapped={false}
          />
        </Torus>

        {/* Wave arcs (Left and Right) match from icon.svg */}
        {/* Highlighting exactly one quadrant on opposite sides */}
        <Torus args={[2.22, 0.1, 32, 64, Math.PI / 2]} rotation={[0, 0, Math.PI / 4]}>
          <meshStandardMaterial
            color="#22d3ee"
            emissive="#22d3ee"
            emissiveIntensity={2.5}
            toneMapped={false}
          />
        </Torus>
        <Torus args={[2.22, 0.1, 32, 64, Math.PI / 2]} rotation={[0, 0, Math.PI / 4 + Math.PI]}>
          <meshStandardMaterial
            color="#22d3ee"
            emissive="#22d3ee"
            emissiveIntensity={2.5}
            toneMapped={false}
          />
        </Torus>
      </group>
    </group>
  )
}

const AppIconCore = () => {
  const coreRef = useRef<THREE.Group>(null)

  useFrame(state => {
    if (coreRef.current) {
      // Gentle floating exactly like the official icon
      coreRef.current.position.y = Math.sin(state.clock.getElapsedTime() * 2) * 0.1
      // Very slow rotation so it feels solid
      coreRef.current.rotation.y = state.clock.getElapsedTime() * 0.2
      coreRef.current.rotation.x = Math.sin(state.clock.getElapsedTime()) * 0.1
    }
  })

  return (
    <group ref={coreRef}>
      {/* Center solid recording dot match from icon.svg (#22D3EE) */}
      <Sphere args={[0.8, 64, 64]}>
        <meshPhysicalMaterial
          color="#22d3ee"
          emissive="#06b6d4"
          emissiveIntensity={0.2}
          roughness={0.1}
          metalness={0.2}
          clearcoat={1.0}
          clearcoatRoughness={0.1}
        />
      </Sphere>

      {/* Dot inner highlight match from icon.svg (#0EA5E9) */}
      <Sphere args={[0.5, 32, 32]} position={[0, 0, 0.4]}>
        <meshBasicMaterial
          color="#0ea5e9"
          transparent
          opacity={0.8}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </Sphere>

      {/* Illuminating the entire scene from the center dot */}
      <pointLight color="#22d3ee" intensity={10} distance={15} decay={2} />
    </group>
  )
}

/** CSS-only fallback logo that perfectly mimics the SVG icon */
const FallbackLogo = () => (
  <div className="w-full h-full flex items-center justify-center">
    <div className="relative w-20 h-20 rounded-full flex items-center justify-center bg-[#0F172A]">
      {/* Outer Cyan Ring */}
      <div className="absolute inset-2 rounded-full border border-[rgba(6,182,212,0.4)]" />
      {/* Inner Blue Ring */}
      <div className="absolute inset-4 rounded-full border-2 border-[rgba(59,130,246,0.6)] animate-[spin_3s_linear_infinite]">
        {/* Wave arcs */}
        <div className="absolute -inset-[2px] rounded-full border-2 border-transparent border-t-[#22d3ee] border-b-[#22d3ee]" />
      </div>
      {/* Center Solid Dot */}
      <div className="absolute w-6 h-6 rounded-full bg-[#22d3ee] shadow-[0_0_15px_#22d3ee] flex items-center justify-center">
        {/* Inner Highlight */}
        <div className="w-3.5 h-3.5 rounded-full bg-[#0ea5e9] opacity-80" />
      </div>
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
          <AppIconCore />

          {/* No Environment preset — uses lights only for offline Electron compatibility */}
        </Canvas>
      </Suspense>
    </div>
  )
}
