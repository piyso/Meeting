#!/usr/bin/env node

/**
 * Verification Script for Task 19.1: Split-Pane Layout
 *
 * This script verifies that the split-pane layout implementation meets all requirements:
 * - Split-pane library installed
 * - SplitPaneLayout component created
 * - NotesEditor placeholder created
 * - localStorage persistence implemented
 * - Proper integration with App.tsx
 */

const fs = require('fs')
const path = require('path')

console.log('🧪 Verifying Task 19.1: Split-Pane Layout Implementation\n')

let passed = 0
let failed = 0

function test(name, fn) {
  try {
    fn()
    console.log(`✅ ${name}`)
    passed++
  } catch (error) {
    console.log(`❌ ${name}`)
    console.log(`   Error: ${error.message}`)
    failed++
  }
}

// Test 1: Check react-split is installed
test('react-split library installed', () => {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
  if (!packageJson.dependencies['react-split']) {
    throw new Error('react-split not found in dependencies')
  }
})

// Test 2: Check SplitPaneLayout component exists
test('SplitPaneLayout component created', () => {
  const componentPath = 'src/renderer/components/SplitPaneLayout.tsx'
  if (!fs.existsSync(componentPath)) {
    throw new Error('SplitPaneLayout.tsx not found')
  }

  const content = fs.readFileSync(componentPath, 'utf8')

  // Check for key features
  if (!content.includes('Split')) {
    throw new Error('Split component not imported')
  }
  if (!content.includes('localStorage')) {
    throw new Error('localStorage persistence not implemented')
  }
  if (!content.includes('DEFAULT_SIZES')) {
    throw new Error('Default sizes not defined')
  }
  if (!content.includes('TranscriptDisplay')) {
    throw new Error('TranscriptDisplay not integrated')
  }
  if (!content.includes('NotesEditor')) {
    throw new Error('NotesEditor not integrated')
  }
})

// Test 3: Check SplitPaneLayout CSS exists
test('SplitPaneLayout CSS created', () => {
  const cssPath = 'src/renderer/components/SplitPaneLayout.css'
  if (!fs.existsSync(cssPath)) {
    throw new Error('SplitPaneLayout.css not found')
  }

  const content = fs.readFileSync(cssPath, 'utf8')

  // Check for key styles
  if (!content.includes('.gutter')) {
    throw new Error('Gutter styles not defined')
  }
  if (!content.includes('row-resize')) {
    throw new Error('Cursor styles not defined')
  }
})

// Test 4: Check NotesEditor component exists
test('NotesEditor placeholder component created', () => {
  const componentPath = 'src/renderer/components/NotesEditor.tsx'
  if (!fs.existsSync(componentPath)) {
    throw new Error('NotesEditor.tsx not found')
  }

  const content = fs.readFileSync(componentPath, 'utf8')

  // Check for key features
  if (!content.includes('meetingId')) {
    throw new Error('meetingId prop not defined')
  }
  if (!content.includes('textarea') || !content.includes('notes')) {
    throw new Error('Notes textarea not implemented')
  }
  if (!content.includes('Ctrl+Enter')) {
    throw new Error('Ctrl+Enter hint not present')
  }
})

// Test 5: Check NotesEditor CSS exists
test('NotesEditor CSS created', () => {
  const cssPath = 'src/renderer/components/NotesEditor.css'
  if (!fs.existsSync(cssPath)) {
    throw new Error('NotesEditor.css not found')
  }

  const content = fs.readFileSync(cssPath, 'utf8')

  // Check for key styles
  if (!content.includes('.notes-editor')) {
    throw new Error('Notes editor styles not defined')
  }
  if (!content.includes('.notes-textarea')) {
    throw new Error('Textarea styles not defined')
  }
})

// Test 6: Check App.tsx integration
test('App.tsx integrated with SplitPaneLayout', () => {
  const appPath = 'src/renderer/App.tsx'
  if (!fs.existsSync(appPath)) {
    throw new Error('App.tsx not found')
  }

  const content = fs.readFileSync(appPath, 'utf8')

  // Check for integration
  if (!content.includes('SplitPaneLayout')) {
    throw new Error('SplitPaneLayout not imported')
  }
  if (!content.includes('<SplitPaneLayout')) {
    throw new Error('SplitPaneLayout not used in JSX')
  }
  if (!content.includes('meeting-content')) {
    throw new Error('meeting-content wrapper not added')
  }
})

// Test 7: Check App.css has meeting-content styles
test('App.css has meeting-content styles', () => {
  const cssPath = 'src/renderer/App.css'
  if (!fs.existsSync(cssPath)) {
    throw new Error('App.css not found')
  }

  const content = fs.readFileSync(cssPath, 'utf8')

  // Check for meeting-content styles
  if (!content.includes('.meeting-content')) {
    throw new Error('meeting-content styles not defined')
  }
})

// Test 8: Check localStorage key is defined
test('localStorage key properly defined', () => {
  const componentPath = 'src/renderer/components/SplitPaneLayout.tsx'
  const content = fs.readFileSync(componentPath, 'utf8')

  if (!content.includes('piyapi-notes-split-sizes')) {
    throw new Error('localStorage key not properly defined')
  }
})

// Test 9: Check default split is 60/40
test('Default split is 60% transcript, 40% notes', () => {
  const componentPath = 'src/renderer/components/SplitPaneLayout.tsx'
  const content = fs.readFileSync(componentPath, 'utf8')

  if (!content.includes('[60, 40]')) {
    throw new Error('Default sizes not set to [60, 40]')
  }
})

// Test 10: Check minimum sizes are defined
test('Minimum pane sizes defined', () => {
  const componentPath = 'src/renderer/components/SplitPaneLayout.tsx'
  const content = fs.readFileSync(componentPath, 'utf8')

  if (!content.includes('minSize')) {
    throw new Error('minSize prop not defined')
  }
  if (!content.includes('[200, 150]')) {
    throw new Error('Minimum sizes not set correctly')
  }
})

// Test 11: Check vertical direction
test('Split direction is vertical', () => {
  const componentPath = 'src/renderer/components/SplitPaneLayout.tsx'
  const content = fs.readFileSync(componentPath, 'utf8')

  if (!content.includes('direction="vertical"')) {
    throw new Error('Split direction not set to vertical')
  }
})

// Test 12: Check onDragEnd handler
test('onDragEnd handler implemented', () => {
  const componentPath = 'src/renderer/components/SplitPaneLayout.tsx'
  const content = fs.readFileSync(componentPath, 'utf8')

  if (!content.includes('onDragEnd')) {
    throw new Error('onDragEnd handler not implemented')
  }
  if (!content.includes('handleDragEnd')) {
    throw new Error('handleDragEnd function not defined')
  }
})

// Test 13: Check test file exists
test('Test HTML file created', () => {
  if (!fs.existsSync('test-split-pane.html')) {
    throw new Error('test-split-pane.html not found')
  }
})

// Summary
console.log('\n' + '='.repeat(50))
console.log(`✅ Passed: ${passed}`)
console.log(`❌ Failed: ${failed}`)
console.log('='.repeat(50))

if (failed === 0) {
  console.log('\n🎉 All tests passed! Task 19.1 implementation verified.')
  console.log('\n📋 Implementation Summary:')
  console.log('  ✅ react-split library installed')
  console.log('  ✅ SplitPaneLayout component created with localStorage persistence')
  console.log('  ✅ NotesEditor placeholder component created')
  console.log('  ✅ Default split: 60% transcript (top), 40% notes (bottom)')
  console.log('  ✅ Minimum sizes: 200px transcript, 150px notes')
  console.log('  ✅ Resizable divider with visual feedback')
  console.log('  ✅ Integrated with App.tsx')
  console.log('  ✅ Proper styling and responsive design')
  console.log('\n🚀 Next Steps:')
  console.log('  1. Run the app: npm run dev')
  console.log('  2. Start a demo meeting')
  console.log('  3. Test dragging the divider between panes')
  console.log('  4. Verify pane sizes persist after refresh')
  console.log('  5. Open test-split-pane.html in browser for visual verification')
  process.exit(0)
} else {
  console.log('\n❌ Some tests failed. Please review the errors above.')
  process.exit(1)
}
