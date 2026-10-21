import type { Settings } from '../../game/difficulty';
import AppearancePicker from '../Appearance/AppearancePicker';
import DifficultyControl from '../DifficultyControl/DifficultyControl';

export default function SettingsPanel({ settings, onChange, engineUnavailable }: {
  settings: Settings;
  onChange: (next: Settings) => void;
  engineUnavailable: boolean;
}) {
  return <>
    <div className="app-panel-heading">
      <h2>Settings</h2>
      <p>Your preferences save automatically on this device.</p>
    </div>
    <AppearancePicker />
    <section className="settings-opponent" aria-label="Opponent and hints">
      <h3>Opponent &amp; hints</h3>
      <DifficultyControl settings={settings} onChange={onChange} disabled={engineUnavailable} advanced="visible" />
    </section>
  </>;
}
