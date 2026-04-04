import React from 'react'
import { Activity, Webhook, CheckCircle2, AlertTriangle, Clock } from 'lucide-react'

interface LogEntry {
  id: string
  timestamp: Date
  event: string
  url: string
  status: 'success' | 'failed' | 'pending'
  statusCode?: number
}

export const StatusLog: React.FC = () => {
  // Mock Data
  const logs: LogEntry[] = [
    {
      id: 'l1',
      timestamp: new Date(),
      event: 'meeting.ended',
      url: 'https://hooks.zapier.com/hooks/catch/...',
      status: 'success',
      statusCode: 200,
    },
    {
      id: 'l2',
      timestamp: new Date(Date.now() - 1000 * 60 * 5),
      event: 'action_item.created',
      url: 'https://hooks.zapier.com/hooks/catch/...',
      status: 'failed',
      statusCode: 502,
    },
    {
      id: 'l3',
      timestamp: new Date(Date.now() - 1000 * 60 * 30),
      event: 'meeting.started',
      url: 'https://hooks.zapier.com/hooks/catch/...',
      status: 'success',
      statusCode: 200,
    },
  ]

  const StatusIcon = ({ status }: { status: LogEntry['status'] }) => {
    switch (status) {
      case 'success':
        return <CheckCircle2 size={16} className="text-emerald" />
      case 'failed':
        return <AlertTriangle size={16} className="text-rose" />
      case 'pending':
        return <Clock size={16} className="text-amber" />
    }
  }

  return (
    <div className="flex flex-col h-full bg-glass border border-border-subtle rounded-2xl overflow-hidden shadow-macos-md">
      <div className="flex items-center gap-2 p-4 border-b border-border/50 bg-black/40">
        <Activity size={16} className="text-blue" />
        <h3 className="text-sm font-semibold text-primary">Delivery History</h3>
      </div>

      <div className="flex-1 overflow-y-auto sovereign-scrollbar">
        {logs.map((log, index) => (
          <div
            key={log.id}
            className={`p-3 grid grid-cols-[auto_1fr_auto] gap-4 items-center hover:bg-glass/50 transition-colors cursor-pointer ${
              index !== logs.length - 1 ? 'border-b border-border-inset' : ''
            }`}
          >
            <StatusIcon status={log.status} />

            <div className="flex flex-col overflow-hidden">
              <span className="text-[13px] font-mono font-semibold text-primary truncate">
                {log.event}
              </span>
              <div className="flex items-center gap-2 mt-1">
                <Webhook size={10} className="text-tertiary" />
                <span className="text-[11px] font-mono text-tertiary truncate">
                  {log.url.substring(0, 30)}...
                </span>
              </div>
            </div>

            <div className="flex flex-col items-end gap-1">
              <span className="text-[11px] font-medium text-secondary">
                {log.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              {log.statusCode && (
                <span
                  className={`text-[10px] font-mono font-bold px-1.5 rounded ${
                    log.statusCode === 200 ? 'bg-emerald/10 text-emerald' : 'bg-rose/10 text-rose'
                  }`}
                >
                  {log.statusCode}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
