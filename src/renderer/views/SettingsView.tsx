import { SettingsView } from '../components/settings/SettingsView'

export default function SettingsViewWrapper() {
  return (
    <div className="ui-view-settings sovereign-scrollbar">
      <SettingsView />
    </div>
  )
}
