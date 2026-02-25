import React from 'react'

export const NoteExpansionLoader: React.FC = () => {
  return (
    <div className="inline-flex gap-1 py-1 px-2 mt-2 bg-[rgba(167,139,250,0.05)] rounded-[var(--radius-sm)] border border-[rgba(167,139,250,0.1)]">
      {[0, 1, 2].map((i) => (
        <div 
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-[var(--color-violet)]"
          style={{
            animation: `float 1s ease-in-out ${i * 0.15}s infinite alternate`
          }}
        />
      ))}
      <style>{`
        @keyframes float {
          0% { transform: translateY(0) scale(1); opacity: 0.5; }
          100% { transform: translateY(-2px) scale(1.3); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
