import React, { useEffect, useRef } from 'react'
// NOTE: Full d3 import kept because 60+ `d3.x` references in this file.
// This component IS code-split via React.lazy, so it doesn't affect initial load.
// TODO: Future optimization — switch to individual d3 submodule imports.
import * as d3 from 'd3'
import type { GraphNode, GraphEdge, Contradiction } from '../../../types/ipc'

interface GraphCanvasProps {
  nodes: GraphNode[]
  edges: GraphEdge[]
  contradictions: Contradiction[]
  onNodeClick?: (node: GraphNode) => void
}

// Ensure d3 typing for forces
interface D3Node extends d3.SimulationNodeDatum, GraphNode {
  radius?: number
}
interface D3Edge extends d3.SimulationLinkDatum<D3Node>, Omit<GraphEdge, 'source' | 'target'> {}

const getRadius = (type: GraphNode['type']) => {
  switch (type) {
    case 'meeting':
      return 12
    case 'topic':
      return 10
    default:
      return 6
  }
}

export const GraphCanvas: React.FC<GraphCanvasProps> = ({
  nodes,
  edges,
  contradictions,
  onNodeClick,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const simulationRef = useRef<d3.Simulation<D3Node, D3Edge> | null>(null)

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || nodes.length === 0) return

    // Stop any existing simulation before creating a new one
    if (simulationRef.current) {
      simulationRef.current.stop()
      simulationRef.current = null
    }

    const width = containerRef.current.clientWidth
    const height = containerRef.current.clientHeight

    const svg = d3.select(svgRef.current)
    // Use targeted group removal instead of selectAll('*').remove()
    svg.selectAll('g.graph-content').remove()
    svg.selectAll('defs').remove()

    // Make deep copies to avoid mutating React state
    const d3Nodes: D3Node[] = nodes.map(n => ({ ...n, radius: getRadius(n.type) }))
    const d3Edges: D3Edge[] = edges.map(e => ({ ...e }))

    // Identify targets for contradictions to highlight them
    const contradictionMeetingIds = new Set<string>()
    contradictions.forEach(c => {
      if (c.meeting1?.id) contradictionMeetingIds.add(c.meeting1.id)
      if (c.meeting2?.id) contradictionMeetingIds.add(c.meeting2.id)
    })

    // Setup simulation
    const simulation = d3
      .forceSimulation<D3Node>(d3Nodes)
      .force(
        'link',
        d3
          .forceLink<D3Node, D3Edge>(d3Edges)
          .id(d => d.id)
          .distance(50)
      )
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force(
        'collide',
        d3.forceCollide().radius(d => ((d as D3Node).radius || 10) + 2)
      )
      // OPT: Ensure simulation converges and stops — prevents indefinite CPU burn
      .alphaMin(0.01)
      .velocityDecay(0.4)

    // Store ref for cleanup
    simulationRef.current = simulation

    // Zoom container
    const g = svg.append('g').attr('class', 'graph-content')

    // Add zoom behavior
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', event => {
        g.attr('transform', event.transform)
      })

    svg.call(zoom)

    // Defs for arrows, gradients, and filters
    const defs = svg.append('defs')

    // Normal arrow
    defs
      .append('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 20) // adjust based on node radius
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('fill', '#9ca3af')
      .attr('d', 'M0,-5L10,0L0,5')

    // Contradicts arrow
    defs
      .append('marker')
      .attr('id', 'arrow-contradicts')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 20)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('fill', '#ef4444')
      .attr('d', 'M0,-5L10,0L0,5')

    // Radial Gradients for nodes
    const createGradient = (id: string, color: string) => {
      const grad = defs
        .append('radialGradient')
        .attr('id', id)
        .attr('cx', '30%')
        .attr('cy', '30%')
        .attr('r', '70%')
      grad
        .append('stop')
        .attr('offset', '0%')
        .attr('stop-color', d3.color(color)?.brighter(0.8).formatHex() || color)
      grad.append('stop').attr('offset', '100%').attr('stop-color', color)
    }

    createGradient('grad-meeting', '#4f46e5')
    createGradient('grad-person', '#059669')
    createGradient('grad-topic', '#d97706')
    createGradient('grad-decision', '#dc2626')
    createGradient('grad-action', '#2563eb')
    createGradient('grad-default', '#6b7280')

    const getGradientId = (type: string) => {
      if (type === 'action_item') return 'url(#grad-action)'
      if (['meeting', 'person', 'topic', 'decision', 'action'].includes(type)) {
        return `url(#grad-${type})`
      }
      return 'url(#grad-default)'
    }

    // Glow Filter for Contradictions
    const glowFilter = defs.append('filter').attr('id', 'red-glow')
    glowFilter.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'coloredBlur')
    const feMerge = glowFilter.append('feMerge')
    feMerge.append('feMergeNode').attr('in', 'coloredBlur')
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic')

    // Draw lines for edges
    const link = g
      .append('g')
      .selectAll('line')
      .data(d3Edges)
      .join('line')
      .attr('stroke', d => (d.type === 'contradicts' ? '#ef4444' : '#9ca3af'))
      .attr('stroke-width', d => Math.max(1.5, (Number(d.weight) || 1) * 1.5))
      .attr('stroke-opacity', d =>
        d.type === 'contradicts' ? 0.9 : 0.3 + (Number(d.weight) || 0.1) * 0.2
      )
      .attr('stroke-dasharray', d => (d.type === 'contradicts' ? '4,4' : 'none'))
      .attr('filter', d => (d.type === 'contradicts' ? 'url(#red-glow)' : null))
      .attr('marker-end', d => `url(#arrow${d.type === 'contradicts' ? '-contradicts' : ''})`)

    // Draw nodes
    const node = g
      .append('g')
      .selectAll('circle')
      .data(d3Nodes)
      .join('circle')
      .attr('r', d => d.radius || 10)
      .attr('fill', d => getGradientId(d.type))
      .attr('stroke', d => (contradictionMeetingIds.has(d.id) ? '#ef4444' : '#fff'))
      .attr('stroke-width', d => (contradictionMeetingIds.has(d.id) ? 3 : 1))
      .attr('stroke-opacity', d => (contradictionMeetingIds.has(d.id) ? 1 : 0.2))
      .attr('filter', d => (contradictionMeetingIds.has(d.id) ? 'url(#red-glow)' : null))
      .style('cursor', 'pointer')
      .style('transition', 'r 200ms ease, stroke-opacity 200ms ease, filter 200ms ease')
      .call(
        d3
          .drag<SVGCircleElement, D3Node>()
          .on('start', dragstarted)
          .on('drag', dragged)
          .on('end', dragended) as unknown as (
          sel: d3.Selection<SVGCircleElement | d3.BaseType, D3Node, SVGGElement, unknown>
        ) => void
      )

    // Hover interactions
    node
      .on('mouseover', function (_event, d) {
        d3.select(this)
          .attr('r', (d.radius || 10) * 1.3)
          .attr('stroke-opacity', 0.8)
          .attr('filter', 'drop-shadow(0 4px 8px rgba(0,0,0,0.5))')
      })
      .on('mouseout', function (_event, d) {
        d3.select(this)
          .attr('r', d.radius || 10)
          .attr('stroke-opacity', contradictionMeetingIds.has(d.id) ? 1 : 0.2)
          .attr('filter', contradictionMeetingIds.has(d.id) ? 'url(#red-glow)' : null)
      })

    // Node click
    if (onNodeClick) {
      node.on('click', (_event, d) => onNodeClick(d))
    }

    // Add labels
    const label = g
      .append('g')
      .selectAll('text')
      .data(d3Nodes)
      .join('text')
      .text(d => d.label)
      .attr('font-size', '10px')
      .attr('fill', 'var(--color-text-primary, #e5e7eb)') // Matches dark mode
      .style('pointer-events', 'none')
      .attr('dx', 15)
      .attr('dy', 4)

    // Physics tick
    simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as D3Node).x || 0)
        .attr('y1', d => (d.source as D3Node).y || 0)
        .attr('x2', d => (d.target as D3Node).x || 0)
        .attr('y2', d => (d.target as D3Node).y || 0)

      node.attr('cx', d => d.x || 0).attr('cy', d => d.y || 0)
      label.attr('x', d => d.x || 0).attr('y', d => d.y || 0)
    })

    // Drag handlers
    function dragstarted(event: d3.D3DragEvent<SVGCircleElement, D3Node, D3Node>, d: D3Node) {
      if (!event.active) simulation.alphaTarget(0.3).restart()
      d.fx = d.x
      d.fy = d.y
    }
    function dragged(event: d3.D3DragEvent<SVGCircleElement, D3Node, D3Node>, d: D3Node) {
      d.fx = event.x
      d.fy = event.y
    }
    function dragended(event: d3.D3DragEvent<SVGCircleElement, D3Node, D3Node>, d: D3Node) {
      if (!event.active) simulation.alphaTarget(0)
      d.fx = null
      d.fy = null
    }

    return () => {
      simulation.stop()
      simulationRef.current = null
    }
  }, [nodes, edges, contradictions, onNodeClick])

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <svg ref={svgRef} style={{ width: '100%', height: '100%' }} />
      <div className="graph-legend">
        <div className="graph-legend-item">
          <div className="graph-legend-color" style={{ background: '#4f46e5' }} /> Meeting
        </div>
        <div className="graph-legend-item">
          <div className="graph-legend-color" style={{ background: '#059669' }} /> Person
        </div>
        <div className="graph-legend-item">
          <div className="graph-legend-color" style={{ background: '#d97706' }} /> Topic
        </div>
        <div className="graph-legend-item">
          <div className="graph-legend-color" style={{ background: '#dc2626' }} /> Decision
        </div>
        <div className="graph-legend-item">
          <div className="graph-legend-color" style={{ background: '#2563eb' }} /> Action
        </div>
      </div>
    </div>
  )
}
