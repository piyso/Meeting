export type ThemeName = 'monochrome' | 'ocean' | 'neon' | 'emerald'

export const THEMES = {
  monochrome: {
    aurora:
      'radial-gradient(circle at 20% 20%, rgba(255, 255, 255, 0.05) 0%, transparent 55%), radial-gradient(circle at 80% 80%, rgba(255, 255, 255, 0.03) 0%, transparent 55%), radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.02) 0%, transparent 65%)',
    viz: 'rgba(255,255,255,0.95)',
    vizShadow: '0 0 10px rgba(255,255,255,0.5)',
    chipBg: 'bg-white/[0.04]',
    chipBorder: 'border-white/[0.08]',
    chipIcon: 'text-white/50',
    chipText: 'text-white/80',
    pickerBg: 'bg-white',
  },
  ocean: {
    aurora:
      'radial-gradient(circle at 20% 20%, rgba(59, 130, 246, 0.18) 0%, transparent 55%), radial-gradient(circle at 80% 80%, rgba(56, 189, 248, 0.15) 0%, transparent 55%), radial-gradient(circle at 50% 50%, rgba(96, 165, 250, 0.12) 0%, transparent 65%)',
    viz: '#38bdf8',
    vizShadow: '0 0 10px rgba(56, 189, 248, 0.6)',
    chipBg: 'bg-blue-500/10',
    chipBorder: 'border-blue-500/20',
    chipIcon: 'text-blue-400',
    chipText: 'text-blue-100',
    pickerBg: 'bg-sky-400',
  },
  neon: {
    aurora:
      'radial-gradient(circle at 20% 20%, rgba(167, 139, 250, 0.15) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(244, 63, 94, 0.12) 0%, transparent 50%), radial-gradient(circle at 50% 50%, rgba(56, 189, 248, 0.08) 0%, transparent 60%)',
    viz: '#a78bfa',
    vizShadow: '0 0 10px rgba(167, 139, 250, 0.6)',
    chipBg: 'bg-fuchsia-500/10',
    chipBorder: 'border-fuchsia-500/20',
    chipIcon: 'text-fuchsia-400',
    chipText: 'text-fuchsia-100',
    pickerBg: 'bg-fuchsia-400',
  },
  emerald: {
    aurora:
      'radial-gradient(circle at 20% 20%, rgba(16, 185, 129, 0.15) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(52, 211, 153, 0.12) 0%, transparent 50%), radial-gradient(circle at 50% 50%, rgba(110, 231, 183, 0.08) 0%, transparent 60%)',
    viz: '#34d399',
    vizShadow: '0 0 10px rgba(52, 211, 153, 0.6)',
    chipBg: 'bg-emerald-500/10',
    chipBorder: 'border-emerald-500/20',
    chipIcon: 'text-emerald-400',
    chipText: 'text-emerald-100',
    pickerBg: 'bg-emerald-400',
  },
}
