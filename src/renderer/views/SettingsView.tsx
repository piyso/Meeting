import { SettingsView } from '../components/settings/SettingsView'

export default function SettingsViewWrapper() {
  return (
    <div className="ui-view-settings scrollbar-webkit">
      <SettingsView />
    </div>
  )
}
