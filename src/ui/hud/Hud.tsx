// 상단 HUD: 현재 위치(정답 비공개), 진행도, 현재 탐험의 오답·남은 기회, 학습 기록 지표, 메뉴 버튼.

import { GAME_CONFIG } from '../../data/config';
import { resetView } from '../../scene/runtime';
import { useApp } from '../../state/store';
import { HeartIcon, Icon, type IconName } from '../controls/Icon';
import { HelpPopover } from './HelpPopover';
import './Hud.css';

const MAX_WRONG = GAME_CONFIG.maxWrongPerRun;

/** 남은 기회 하트 + 현재 탐험의 오답(아이콘과 글자로 함께 표시) */
export function LivesMeter({ runWrong, pendingReturn = false }: { runWrong: number; pendingReturn?: boolean }) {
  const remaining = Math.max(0, MAX_WRONG - runWrong);
  return (
    <div className="hud-lives">
      <span className="hud-hearts" role="img" aria-label={`남은 기회 ${remaining}개 (최대 ${MAX_WRONG}개)`}>
        {Array.from({ length: MAX_WRONG }, (_, i) => (
          <HeartIcon key={i} full={i < remaining} />
        ))}
      </span>
      {pendingReturn ? (
        <span className="hud-wrong">
          현재 탐험의 오답: <strong>{runWrong}번째</strong> · 출발점으로 돌아가요
        </span>
      ) : (
        <span className="hud-wrong">
          현재 탐험의 오답: <strong>{Math.min(runWrong, MAX_WRONG)}/{MAX_WRONG}</strong>
          <span className="hud-remaining"> (남은 기회 {remaining})</span>
        </span>
      )}
    </div>
  );
}

export function HudInfo() {
  const game = useApp((s) => s.game);
  if (!game || (game.phase === 'intro' && game.dialogue?.kind === 'introPark')) return null;
  return (
    <section className="hud-info panel" aria-label="탐험 상태">
      <LivesMeter runWrong={game.runWrong} pendingReturn={game.pendingReturn} />
      <p className="hud-rule">{MAX_WRONG + 1}번째 오답이면 출발점으로 돌아갑니다.</p>
    </section>
  );
}

interface HudButtonProps {
  icon: IconName;
  label: string;
  kbd?: string;
  pressed?: boolean;
  /** 좁은 화면에서는 숨김(일시정지 메뉴에서 같은 기능 제공) */
  wideOnly?: boolean;
  onClick: () => void;
}

function HudButton({ icon, label, kbd, pressed, wideOnly, onClick }: HudButtonProps) {
  return (
    <button
      type="button"
      className={`btn hud-btn${wideOnly ? ' hud-wide-only' : ''}`}
      aria-label={label}
      title={kbd ? `${label} (${kbd})` : label}
      aria-pressed={pressed}
      aria-keyshortcuts={kbd}
      onClick={onClick}
    >
      <Icon name={icon} />
      <span className="hud-btn-label" aria-hidden="true">
        {label}
        {pressed && ' 켜짐'}
      </span>
      {kbd && (
        <span className="kbd hud-kbd" aria-hidden="true">
          {kbd}
        </span>
      )}
    </button>
  );
}

export function HudActions() {
  const muted = useApp((s) => s.settings.muted);
  const simplified = useApp((s) => s.simplified);
  const setMapOpen = useApp((s) => s.setMapOpen);
  const openReport = useApp((s) => s.openReport);
  const setSettings = useApp((s) => s.setSettings);
  const setSettingsOpen = useApp((s) => s.setSettingsOpen);
  const setPaused = useApp((s) => s.setPaused);

  return (
    <nav className="hud-actions" aria-label="게임 메뉴">
      <HudButton icon="map" label="지도" kbd="M" onClick={() => setMapOpen(true)} />
      <HudButton icon="report" label="지금까지 결과 보기" onClick={() => openReport()} />
      {!simplified && <HudButton icon="recenter" label="시점 초기화" kbd="R" onClick={resetView} />}
      <HudButton
        icon={muted ? 'mute' : 'volume'}
        label="음소거"
        pressed={muted}
        onClick={() => setSettings({ muted: !muted })}
      />
      <HudButton icon="settings" label="설정" wideOnly onClick={() => setSettingsOpen(true)} />
      <HudButton icon="pause" label="일시정지" kbd="P" onClick={() => setPaused(true)} />
      <HelpPopover className="hud-wide-only" />
    </nav>
  );
}
