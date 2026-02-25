import { SettingsView } from '../components/settings/SettingsView'

export default function SettingsViewWrapper() {
  return (
    <div className="w-full h-full p-[var(--space-24)] overflow-y-auto scrollbar-webkit">
      <SettingsView />
    </div>
  )
}
