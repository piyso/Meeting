import React from 'react'
import { Laptop } from 'lucide-react'
import { Dialog } from '../ui/Dialog'
import { Button } from '../ui/Button'

interface DeviceWallDialogProps {
  open: boolean
  onClose: () => void
  currentDevices: number
  maxDevices: number
  onUpgrade: () => void
}

export const DeviceWallDialog: React.FC<DeviceWallDialogProps> = ({ open, onClose, currentDevices, maxDevices, onUpgrade }) => {
  return (
    <Dialog open={open} onClose={onClose} width={440}>
      <div className="flex flex-col items-center text-center p-[var(--space-8)]">
        <div className="w-16 h-16 rounded-full bg-[var(--color-bg-glass)] flex items-center justify-center mb-[var(--space-16)] text-[var(--color-text-tertiary)]">
          <Laptop size={32} />
        </div>
        
        <h2 className="text-[var(--text-xl)] font-bold tracking-tight mb-[var(--space-8)] text-[var(--color-text-primary)]">
          Device Limit Reached
        </h2>
        
        <p className="text-[var(--text-sm)] text-[var(--color-text-secondary)] mb-[var(--space-24)] leading-relaxed">
          Your Starter plan supports up to {maxDevices} devices. Upgrade to Pro for unlimited devices and seamless syncing everywhere.
        </p>

        <div className="w-full bg-[var(--color-bg-glass)] border border-[var(--color-border-subtle)] rounded-[var(--radius-md)] p-[var(--space-12)] mb-[var(--space-24)]">
          <div className="flex justify-between text-[var(--text-sm)] mb-2">
            <span className="text-[var(--color-text-secondary)]">Active Devices</span>
            <span className="font-semibold text-[var(--color-text-primary)]">{currentDevices}/{maxDevices}</span>
          </div>
          <div className="w-full h-[6px] bg-[rgba(255,255,255,0.05)] rounded-full overflow-hidden">
            <div className="h-full bg-[var(--color-violet)]" style={{ width: '100%' }} />
          </div>
        </div>
        
        <div className="flex flex-col w-full gap-[var(--space-12)]">
          <Button variant="primary" size="lg" onClick={onUpgrade} className="w-full">
            Upgrade to Pro
          </Button>
          <Button variant="ghost" size="md" onClick={onClose} className="w-full">
            Manage Devices
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
