/**
 * Permission Flow Demo Component
 *
 * Demo/test component to showcase the permission request flow UI.
 * Useful for development and testing without needing to trigger actual audio capture.
 *
 * Task 9.7: Demo component for permission request flow
 */

import React, { useState } from 'react'
import { PermissionRequestFlow } from './PermissionRequestFlow'
import { ScreenRecordingPermissionDialog } from './ScreenRecordingPermissionDialog'
import type { ScreenRecordingGuidance } from '../../types/ipc'

export const PermissionFlowDemo: React.FC = () => {
  const [showPermissionFlow, setShowPermissionFlow] = useState(false)
  const [showPermissionDialog, setShowPermissionDialog] = useState(false)
  const [log, setLog] = useState<string[]>([])

  const addLog = (message: string) => {
    setLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`])
  }

  const mockGuidance: ScreenRecordingGuidance = {
    title: 'How to Enable Screen Recording Permission',
    steps: [
      'Click "Open System Settings" below',
      'Navigate to Privacy & Security → Screen Recording',
      'Find "BlueArkive" in the list',
      'Toggle the switch to ON',
      'Return to this app and click "Check Again"',
      'You may need to restart the app for changes to take effect',
    ],
    link: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
  }

  return (
    <div style={{ padding: '40px', maxWidth: '800px', margin: '0 auto' }}>
      <h1>Permission Flow Demo</h1>
      <p>
        This demo showcases the permission request flow UI components. Click the buttons below to
        see different states.
      </p>

      <div style={{ marginTop: '30px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        <button
          onClick={() => {
            setShowPermissionFlow(true)
            addLog('Opened PermissionRequestFlow')
          }}
          style={{
            padding: '12px 24px',
            fontSize: '16px',
            backgroundColor: '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
          }}
        >
          Show Permission Request Flow
        </button>

        <button
          onClick={() => {
            setShowPermissionDialog(true)
            addLog('Opened ScreenRecordingPermissionDialog')
          }}
          style={{
            padding: '12px 24px',
            fontSize: '16px',
            backgroundColor: '#dc2626',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
          }}
        >
          Show Permission Denied Dialog
        </button>

        <button
          onClick={() => {
            setLog([])
          }}
          style={{
            padding: '12px 24px',
            fontSize: '16px',
            backgroundColor: '#6b7280',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
          }}
        >
          Clear Log
        </button>
      </div>

      <div style={{ marginTop: '30px' }}>
        <h2>Component Information</h2>
        <div
          style={{
            backgroundColor: '#f9fafb',
            padding: '20px',
            borderRadius: '8px',
            marginTop: '12px',
          }}
        >
          <h3 style={{ marginTop: 0 }}>PermissionRequestFlow</h3>
          <p>
            <strong>Purpose:</strong> Initial permission request for not-determined state
          </p>
          <p>
            <strong>Features:</strong>
          </p>
          <ul>
            <li>Checks permission status automatically</li>
            <li>Shows explanation and benefits</li>
            <li>Provides "Grant Permission" button</li>
            <li>Provides "Skip - Use Microphone" option</li>
            <li>Handles all permission states</li>
            <li>Shows permission status indicator</li>
          </ul>
        </div>

        <div
          style={{
            backgroundColor: '#fef2f2',
            padding: '20px',
            borderRadius: '8px',
            marginTop: '12px',
          }}
        >
          <h3 style={{ marginTop: 0 }}>ScreenRecordingPermissionDialog</h3>
          <p>
            <strong>Purpose:</strong> Handle denied permission state with detailed instructions
          </p>
          <p>
            <strong>Features:</strong>
          </p>
          <ul>
            <li>Error message explaining permission is denied</li>
            <li>Step-by-step instructions to enable</li>
            <li>"Open System Settings" button</li>
            <li>Fallback options (microphone, cloud)</li>
            <li>Links to documentation and Apple Support</li>
          </ul>
        </div>
      </div>

      <div style={{ marginTop: '30px' }}>
        <h2>Event Log</h2>
        <div
          style={{
            backgroundColor: '#1f2937',
            color: '#f9fafb',
            padding: '16px',
            borderRadius: '8px',
            fontFamily: 'monospace',
            fontSize: '14px',
            maxHeight: '300px',
            overflowY: 'auto',
          }}
        >
          {log.length === 0 ? (
            <div style={{ color: '#9ca3af' }}>No events yet...</div>
          ) : (
            log.map((entry, index) => <div key={index}>{entry}</div>)
          )}
        </div>
      </div>

      {/* Permission Request Flow */}
      {showPermissionFlow && (
        <PermissionRequestFlow
          onGranted={() => {
            addLog('✅ Permission granted - would start system audio capture')
            setShowPermissionFlow(false)
          }}
          onSkip={() => {
            addLog('⏭️ User skipped - would start microphone capture')
            setShowPermissionFlow(false)
          }}
          onClose={() => {
            addLog('❌ User closed permission flow')
            setShowPermissionFlow(false)
          }}
        />
      )}

      {/* Permission Denied Dialog */}
      {showPermissionDialog && (
        <ScreenRecordingPermissionDialog
          guidance={mockGuidance}
          onClose={() => {
            addLog('❌ User closed permission dialog')
            setShowPermissionDialog(false)
          }}
          onUseMicrophone={() => {
            addLog('🎤 User chose microphone fallback')
            setShowPermissionDialog(false)
          }}
          onUseCloud={() => {
            addLog('☁️ User chose cloud transcription')
            setShowPermissionDialog(false)
          }}
        />
      )}
    </div>
  )
}
