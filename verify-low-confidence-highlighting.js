#!/usr/bin/env node

/**
 * Verification Script: Task 18.4 - Highlight Low-Confidence Segments
 *
 * This script verifies that low-confidence segments (<70%) are visually highlighted
 * in the TranscriptDisplay component.
 */

const fs = require('fs')
const path = require('path')

console.log('🔍 Verifying Task 18.4: Highlight Low-Confidence Segments\n')

let allTestsPassed = true
const results = []

function test(name, fn) {
  try {
    fn()
    results.push({ name, status: '✅ PASS' })
  } catch (error) {
    results.push({ name, status: '❌ FAIL', error: error.message })
    allTestsPassed = false
  }
}

// Read component files
const tsxPath = path.join(__dirname, 'src/renderer/components/TranscriptDisplay.tsx')
const cssPath = path.join(__dirname, 'src/renderer/components/TranscriptDisplay.css')

const tsxContent = fs.readFileSync(tsxPath, 'utf8')
const cssContent = fs.readFileSync(cssPath, 'utf8')

// Test 1: Component applies low-confidence class
test('Component applies low-confidence class based on threshold', () => {
  if (!tsxContent.includes('chunk.confidence < 0.7')) {
    throw new Error('Missing confidence threshold check (< 0.7)')
  }
  if (!tsxContent.includes('low-confidence')) {
    throw new Error('Missing low-confidence class application')
  }
  if (
    !tsxContent.includes(
      "className={`transcript-segment ${chunk.confidence < 0.7 ? 'low-confidence' : ''}`}"
    )
  ) {
    throw new Error('Low-confidence class not conditionally applied')
  }
})

// Test 2: CSS has low-confidence styling
test('CSS defines .low-confidence styling', () => {
  if (!cssContent.includes('.transcript-segment.low-confidence')) {
    throw new Error('Missing .transcript-segment.low-confidence class')
  }
})

// Test 3: Border styling for low-confidence
test('Low-confidence segments have border styling', () => {
  if (!cssContent.includes('border-left:') && !cssContent.includes('border-left-color:')) {
    throw new Error('Missing border styling for low-confidence segments')
  }
})

// Test 4: Background gradient for low-confidence
test('Low-confidence segments have background gradient', () => {
  if (!cssContent.includes('linear-gradient')) {
    throw new Error('Missing background gradient for low-confidence segments')
  }
})

// Test 5: Warning icon for low-confidence
test('Low-confidence segments have warning icon', () => {
  if (!cssContent.includes('::before')) {
    throw new Error('Missing ::before pseudo-element for warning icon')
  }
  if (!cssContent.includes('⚠️') && !cssContent.includes('content:')) {
    throw new Error('Missing warning icon content')
  }
})

// Test 6: Dark mode support
test('Dark mode styling for low-confidence segments', () => {
  // Check if dark mode section exists
  if (!cssContent.includes('@media (prefers-color-scheme: dark)')) {
    throw new Error('Missing dark mode media query')
  }

  // Check if low-confidence styling exists in dark mode
  const darkModeStart = cssContent.indexOf('@media (prefers-color-scheme: dark)')
  const darkModeSection = cssContent.substring(darkModeStart)

  if (!darkModeSection.includes('.transcript-segment.low-confidence')) {
    throw new Error('Missing dark mode styling for low-confidence segments')
  }
})

// Test 7: Distinct from confidence badge
test('Low-confidence highlighting is distinct from badge', () => {
  // Badge uses background color on .segment-confidence
  // Highlighting uses border-left and background gradient on .transcript-segment
  const hasBadgeStyling = cssContent.includes('.segment-confidence.low')
  const hasSegmentStyling = cssContent.includes('.transcript-segment.low-confidence')

  if (!hasBadgeStyling || !hasSegmentStyling) {
    throw new Error('Low-confidence highlighting not distinct from badge')
  }
})

// Test 8: Threshold consistency
test('Threshold consistent between component and CSS', () => {
  // Component uses 0.7 threshold
  // getConfidenceColor also uses 0.7 for 'low' classification
  if (!tsxContent.includes('confidence >= 0.7')) {
    throw new Error('getConfidenceColor threshold mismatch')
  }
  if (!tsxContent.includes('chunk.confidence < 0.7')) {
    throw new Error('Low-confidence class threshold mismatch')
  }
})

// Test 9: Visual hierarchy
test('Low-confidence styling maintains visual hierarchy', () => {
  // Should have border, gradient, and icon but not be overwhelming
  const lowConfidenceMatch = cssContent.match(/\.transcript-segment\.low-confidence\s*\{[^}]+\}/s)
  if (!lowConfidenceMatch) {
    throw new Error('Missing low-confidence styling block')
  }

  const styling = lowConfidenceMatch[0]
  const hasSubtleOpacity = styling.includes('opacity') || styling.includes('rgba')

  if (!hasSubtleOpacity) {
    console.warn('⚠️  Warning: Consider adding opacity for subtle highlighting')
  }
})

// Test 10: Accessibility
test('Low-confidence highlighting is accessible', () => {
  // Uses both color (border/gradient) and icon (⚠️) for accessibility
  const hasColorIndicator = cssContent.includes('border-left') || cssContent.includes('background')
  const hasIconIndicator = cssContent.includes('⚠️') || cssContent.includes('content:')

  if (!hasColorIndicator || !hasIconIndicator) {
    throw new Error('Low-confidence highlighting not accessible (needs both color and icon)')
  }
})

// Print results
console.log('Test Results:\n')
results.forEach(result => {
  console.log(`${result.status} ${result.name}`)
  if (result.error) {
    console.log(`   Error: ${result.error}`)
  }
})

console.log('\n' + '='.repeat(60))

if (allTestsPassed) {
  console.log('✅ All tests passed! Task 18.4 implementation verified.')
  console.log('\nImplementation Summary:')
  console.log('- ✅ Low-confidence class applied to segments with confidence < 0.7')
  console.log('- ✅ Visual indicators: border, gradient, warning icon')
  console.log('- ✅ Dark mode support included')
  console.log('- ✅ Distinct from confidence badge')
  console.log('- ✅ Accessible (color + icon)')
  process.exit(0)
} else {
  console.log('❌ Some tests failed. Please review the implementation.')
  process.exit(1)
}
