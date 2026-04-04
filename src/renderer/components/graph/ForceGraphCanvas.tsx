import React, { useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Sphere, Line } from '@react-three/drei'
import * as THREE from 'three'

interface NodeData {
  id: string
  label: string
  x: number
  y: number
  z: number
  color: string
}

interface EdgeData {
  source: string
  target: string
}

// Scaffolding for the WebGL Graph Canvas
const GraphMesh: React.FC<{ nodes: NodeData[]; edges: EdgeData[] }> = ({ nodes, edges }) => {
  const groupRef = useRef<THREE.Group>(null)

  // Gentle idle rotation to make the graph feel "alive"
  useFrame(state => {
    if (groupRef.current) {
      groupRef.current.rotation.y += 0.001
      groupRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.1
    }
  })

  // Extract line segments for optimized rendering
  const lines = useMemo(() => {
    const points: [number, number, number][] = []
    edges.forEach(edge => {
      const source = nodes.find(n => n.id === edge.source)
      const target = nodes.find(n => n.id === edge.target)
      if (source && target) {
        points.push([source.x, source.y, source.z])
        points.push([target.x, target.y, target.z])
      }
    })
    return points
  }, [nodes, edges])

  return (
    <group ref={groupRef}>
      {/* Nodes */}
      {nodes.map(node => (
        <Sphere args={[0.15, 16, 16]} position={[node.x, node.y, node.z]} key={node.id}>
          <meshStandardMaterial
            color={node.color}
            emissive={node.color}
            emissiveIntensity={0.5}
            roughness={0.2}
            metalness={0.8}
          />
        </Sphere>
      ))}

      {/* Edges */}
      {lines.length > 0 && (
        <Line
          points={lines as [number, number, number][]}
          color="rgba(167, 139, 250, 0.4)"
          lineWidth={1}
          transparent
          segments
        />
      )}
    </group>
  )
}

export const ForceGraphCanvas: React.FC = () => {
  // Mock Knowledge Graph
  const nodes: NodeData[] = [
    { id: '1', label: 'Vector DB', x: -1, y: 1, z: 0, color: '#a78bfa' },
    { id: '2', label: 'Local LLM', x: 1, y: 0.5, z: 1, color: '#34d399' },
    { id: '3', label: 'Memory Fabric', x: 0, y: -1, z: -0.5, color: '#fbbf24' },
    { id: '4', label: 'GPU Engine', x: 1.5, y: -0.5, z: -1, color: '#f43f5e' },
  ]

  const edges: EdgeData[] = [
    { source: '1', target: '2' },
    { source: '2', target: '3' },
    { source: '3', target: '1' },
    { source: '4', target: '2' },
  ]

  return (
    <div className="w-full h-full bg-black rounded-2xl overflow-hidden border border-border-inset shadow-macos-lg relative">
      <div className="absolute top-4 left-4 z-10 text-white flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-emerald animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
        <span className="text-[11px] font-mono tracking-widest uppercase font-bold text-emerald">
          Knowledge Graph
        </span>
      </div>

      <Canvas camera={{ position: [0, 0, 5], fov: 45 }}>
        <color attach="background" args={['#050507']} />
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} intensity={1.5} color="#ffffff" />
        <spotLight position={[-10, -10, -10]} intensity={2} color="#a78bfa" />

        <GraphMesh nodes={nodes} edges={edges} />

        <OrbitControls
          enablePan={false}
          enableZoom={true}
          minDistance={2}
          maxDistance={10}
          autoRotate={false}
        />
      </Canvas>
    </div>
  )
}
