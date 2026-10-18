import { useEffect } from 'react';
import { connectAudioToGameEvents, setAudioSuspended, setAudioVolume } from './audio/sfx';
import { detectWebGL2 } from './lib/webgl';
import { useApp } from './state/store';
import { GameScreen } from './ui/GameScreen';
import { ReportView } from './ui/report/ReportView';
import { SettingsPanel } from './ui/settings/SettingsPanel';
import { TitleScreen } from './ui/title/TitleScreen';

export default function App() {
  const screen = useApp((s) => s.screen);
  const settings = useApp((s) => s.settings);
  const paused = useApp((s) => s.paused);
  const hidden = useApp((s) => s.hidden);
  const setWebgl = useApp((s) => s.setWebgl);
  const setHidden = useApp((s) => s.setHidden);

  useEffect(() => {
    setWebgl(detectWebGL2());
  }, [setWebgl]);

  // 탭이 보이지 않으면 렌더링과 소리를 멈춘다
  useEffect(() => {
    const onVis = () => setHidden(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [setHidden]);

  useEffect(() => connectAudioToGameEvents(), []);

  useEffect(() => {
    setAudioVolume(settings.volume, settings.muted);
  }, [settings.volume, settings.muted]);

  useEffect(() => {
    setAudioSuspended(paused || hidden || screen !== 'game');
  }, [paused, hidden, screen]);

  return (
    <div
      className={[
        'app',
        settings.largeText ? 'is-large-text' : '',
        settings.reduceMotion ? 'is-reduced-motion' : '',
      ].join(' ')}
    >
      {screen === 'title' ? <TitleScreen /> : <GameScreen />}
      <ReportView />
      <SettingsPanel />
    </div>
  );
}
