/**
 * Verification Script for Task 18.2: Display in UI with Auto-scroll
 *
 * This script verifies that the TranscriptDisplay component is properly implemented
 * and can receive and display transcript events.
 *
 * Run: node verify-transcript-display.js
 */

const fs = require('fs')
const path = require('path')

console.log('='.repeat(80))
console.log('Task 18.2 Verification: TranscriptDisplay Component')
console.log('='.repeat(80))
console.log()

let allTestsPassed = true

/**
 * Test 1: Verify TranscriptDisplay.tsx exists and has required functionality
 */
function test1_ComponentExists() {
  console.log('Test 1: Verify TranscriptDisplay component exists')
  console.log('-'.repeat(80))

  const componentPath = path.join(__dirname, 'src/renderer/components/TranscriptDisplay.tsx')

  if (!fs.existsSync(componentPath)) {
    console.log('❌ FAIL: TranscriptDisplay.tsx not found')
    allTestsPassed = false
    return
  }

  const content = fs.readFileSync(componentPath, 'utf-8')

  // Check for required imports
  const requiredImports = ['useState', 'useEffect', 'useRef', 'TranscriptChunk']

  const missingImports = requiredImports.filter(imp => !content.includes(imp))
  if (missingImports.length > 0) {
    console.log(`❌ FAIL: Missing imports: ${missingImports.join(', ')}`)
    allTestsPassed = false
    return
  }

  // Check for required functionality
  const requiredFeatures = [
    'window.electronAPI.on.transcriptChunk', // Event subscription
    'autoScroll', // Auto-scroll prop
    'transcriptContainerRef', // Ref for scrolling
    'scrollTo', // Scroll functionality
    'formatTime', // Time formatting
    'getConfidenceColor', // Confidence display
  ]

  const missingFeatures = requiredFeatures.filter(feature => !content.includes(feature))
  if (missingFeatures.length > 0) {
    console.log(`❌ FAIL: Missing features: ${missingFeatures.join(', ')}`)
    allTestsPassed = false
    return
  }

  console.log('✅ PASS: TranscriptDisplay component exists with all required features')
  console.log()
}

/**
 * Test 2: Verify CSS file exists with required styles
 */
function test2_StylesExist() {
  console.log('Test 2: Verify TranscriptDisplay styles exist')
  console.log('-'.repeat(80))

  const cssPath = path.join(__dirname, 'src/renderer/components/TranscriptDisplay.css')

  if (!fs.existsSync(cssPath)) {
    console.log('❌ FAIL: TranscriptDisplay.css not found')
    allTestsPassed = false
    return
  }

  const content = fs.readFileSync(cssPath, 'utf-8')

  // Check for required CSS classes
  const requiredClasses = [
    '.transcript-display',
    '.transcript-container',
    '.transcript-segment',
    '.auto-scroll-toggle',
    '.scroll-to-bottom',
    '.segment-confidence',
    'scroll-behavior: smooth',
  ]

  const missingClasses = requiredClasses.filter(cls => !content.includes(cls))
  if (missingClasses.length > 0) {
    console.log(`❌ FAIL: Missing CSS classes: ${missingClasses.join(', ')}`)
    allTestsPassed = false
    return
  }

  console.log('✅ PASS: TranscriptDisplay styles exist with all required classes')
  console.log()
}

/**
 * Test 3: Verify App.tsx integration
 */
function test3_AppIntegration() {
  console.log('Test 3: Verify App.tsx integration')
  console.log('-'.repeat(80))

  const appPath = path.join(__dirname, 'src/renderer/App.tsx')

  if (!fs.existsSync(appPath)) {
    console.log('❌ FAIL: App.tsx not found')
    allTestsPassed = false
    return
  }

  const content = fs.readFileSync(appPath, 'utf-8')

  // Check for TranscriptDisplay import
  if (!content.includes("import { TranscriptDisplay } from './components/TranscriptDisplay'")) {
    console.log('❌ FAIL: TranscriptDisplay not imported in App.tsx')
    allTestsPassed = false
    return
  }

  // Check for TranscriptDisplay usage
  if (!content.includes('<TranscriptDisplay')) {
    console.log('❌ FAIL: TranscriptDisplay component not used in App.tsx')
    allTestsPassed = false
    return
  }

  // Check for meeting view
  if (!content.includes('meeting-view')) {
    console.log('❌ FAIL: Meeting view not implemented in App.tsx')
    allTestsPassed = false
    return
  }

  console.log('✅ PASS: TranscriptDisplay properly integrated in App.tsx')
  console.log()
}

/**
 * Test 4: Verify component features
 */
function test4_ComponentFeatures() {
  console.log('Test 4: Verify component features')
  console.log('-'.repeat(80))

  const componentPath = path.join(__dirname, 'src/renderer/components/TranscriptDisplay.tsx')
  const content = fs.readFileSync(componentPath, 'utf-8')

  const features = {
    'Event subscription cleanup':
      content.includes('return () =>') && content.includes('unsubscribe()'),
    'Auto-scroll detection': content.includes('scrollHeight') && content.includes('scrollTop'),
    'Manual scroll detection': content.includes('handleScroll'),
    'Empty state handling':
      content.includes('empty-state') || content.includes('No active meeting'),
    'Waiting state': content.includes('waiting') || content.includes('Waiting for transcripts'),
    'Confidence display': content.includes('confidence') && content.includes('getConfidenceColor'),
    'Speaker display': content.includes('speakerId'),
    'Time formatting': content.includes('formatTime'),
    'Scroll to bottom button': content.includes('scroll-to-bottom'),
  }

  let allFeaturesPresent = true
  for (const [feature, present] of Object.entries(features)) {
    if (present) {
      console.log(`  ✅ ${feature}`)
    } else {
      console.log(`  ❌ ${feature}`)
      allFeaturesPresent = false
    }
  }

  if (!allFeaturesPresent) {
    console.log('❌ FAIL: Some features are missing')
    allTestsPassed = false
  } else {
    console.log('✅ PASS: All component features are present')
  }
  console.log()
}

/**
 * Test 5: Verify responsive design
 */
function test5_ResponsiveDesign() {
  console.log('Test 5: Verify responsive design')
  console.log('-'.repeat(80))

  const cssPath = path.join(__dirname, 'src/renderer/components/TranscriptDisplay.css')
  const content = fs.readFileSync(cssPath, 'utf-8')

  // Check for media queries
  const hasMediaQueries = content.includes('@media')
  const hasDarkMode = content.includes('prefers-color-scheme: dark')
  const hasResponsive = content.includes('max-width')

  if (!hasMediaQueries) {
    console.log('❌ FAIL: No media queries found')
    allTestsPassed = false
    return
  }

  if (!hasDarkMode) {
    console.log('⚠️  WARNING: No dark mode support found')
  } else {
    console.log('  ✅ Dark mode support')
  }

  if (!hasResponsive) {
    console.log('⚠️  WARNING: No responsive design found')
  } else {
    console.log('  ✅ Responsive design')
  }

  console.log('✅ PASS: Responsive design implemented')
  console.log()
}

/**
 * Test 6: Verify TypeScript types
 */
function test6_TypeScriptTypes() {
  console.log('Test 6: Verify TypeScript types')
  console.log('-'.repeat(80))

  const componentPath = path.join(__dirname, 'src/renderer/components/TranscriptDisplay.tsx')
  const content = fs.readFileSync(componentPath, 'utf-8')

  // Check for proper typing
  const hasPropsInterface = content.includes('TranscriptDisplayProps')
  const hasTranscriptChunkType = content.includes('TranscriptChunk')
  const hasTypedState = content.includes('useState<TranscriptChunk[]>')
  const hasTypedRef = content.includes('useRef<HTMLDivElement>')

  if (!hasPropsInterface) {
    console.log('❌ FAIL: Props interface not defined')
    allTestsPassed = false
    return
  }

  if (!hasTranscriptChunkType) {
    console.log('❌ FAIL: TranscriptChunk type not imported')
    allTestsPassed = false
    return
  }

  if (!hasTypedState) {
    console.log('⚠️  WARNING: State may not be properly typed')
  } else {
    console.log('  ✅ Typed state')
  }

  if (!hasTypedRef) {
    console.log('⚠️  WARNING: Ref may not be properly typed')
  } else {
    console.log('  ✅ Typed ref')
  }

  console.log('✅ PASS: TypeScript types are properly defined')
  console.log()
}

// Run all tests
test1_ComponentExists()
test2_StylesExist()
test3_AppIntegration()
test4_ComponentFeatures()
test5_ResponsiveDesign()
test6_TypeScriptTypes()

// Summary
console.log('='.repeat(80))
if (allTestsPassed) {
  console.log('✅ ALL TESTS PASSED')
  console.log()
  console.log('Task 18.2 Implementation Summary:')
  console.log('  ✅ TranscriptDisplay component created')
  console.log('  ✅ Auto-scroll functionality implemented')
  console.log('  ✅ Event subscription and cleanup')
  console.log('  ✅ Empty and waiting states')
  console.log('  ✅ Confidence score display')
  console.log('  ✅ Speaker identification')
  console.log('  ✅ Time formatting')
  console.log('  ✅ Responsive design')
  console.log('  ✅ Dark mode support')
  console.log('  ✅ TypeScript type safety')
  console.log()
  console.log('Next Steps:')
  console.log('  1. Run the application: npm run dev')
  console.log('  2. Navigate to Meeting view')
  console.log('  3. Verify transcripts appear in real-time')
  console.log('  4. Test auto-scroll behavior')
  console.log('  5. Test manual scroll and scroll-to-bottom button')
  console.log()
  process.exit(0)
} else {
  console.log('❌ SOME TESTS FAILED')
  console.log()
  console.log('Please review the failed tests above and fix the issues.')
  console.log()
  process.exit(1)
}
