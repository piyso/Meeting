import React from 'react'
import { Brain } from 'lucide-react'
import { Dialog } from '../ui/Dialog'
import { Button } from '../ui/Button'

interface IntelligenceWallDialogProps {
  open: boolean
  onClose: () => void
  queriesUsed: number
  queryLimit: number
  onUpgrade: () => void
}

export const IntelligenceWallDialog: React.FC<IntelligenceWallDialogProps> = ({ open, onClose, queriesUsed, queryLimit, onUpgrade }) => {
  return (
    <Dialog open={open} onClose={onClose} width={440}>
      <div className="flex flex-col items-center text-center p-[var(--space-8)]">
        <div className="w-16 h-16 rounded-full bg-[rgba(167,139,250,0.1)] flex items-center justify-center mb-[var(--space-16)] text-[var(--color-violet)]">
          <Brain size={32} />
        </div>
        
        <h2 className="text-[var(--text-xl)] font-bold tracking-tight mb-[var(--space-8)] text-[var(--color-text-primary)]">
          AI Query Limit Reached
        </h2>
        
        <p className="text-[var(--text-sm)] text-[var(--color-text-secondary)] mb-[var(--space-24)] leading-relaxed">
          You've used {queriesUsed}/{queryLimit} cloud AI queries this month. Upgrade to Pro for unlimited queries, or continue with local AI (reduced accuracy).
        </p>

        <div className="w-full bg-[var(--color-bg-glass)] border border-[var(--color-border-subtle)] rounded-[var(--radius-md)] p-[var(--space-12)] mb-[var(--space-24)]">
          <div className="flex justify-between text-[var(--text-sm)] mb-2">
            <span className="text-[var(--color-text-secondary)]">Monthly Quota</span>
            <span className="font-semibold text-[var(--color-text-primary)]">{queriesUsed}/{queryLimit}</span>
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
            Continue with Local AI
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
