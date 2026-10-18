// 상단 HUD: 현재 위치(정답 비공개), 진행도, 현재 탐험의 오답·남은 기회, 학습 기록 지표, 메뉴 버튼.

import { useMemo, useState } from 'react';
import { GAME_CONFIG } from '../../data/config';
import { resetView } from '../../scene/runtime';
import { locationLabel, progressCounts, sceneLocation, supplementConceptIds } from '../../state/selectors';
import { useApp } from '../../state/store';
import { HeartIcon, Icon, type IconName } from '../controls/Icon';
import { COMPACT_QUERY, useMediaQuery } from '../controls/useMediaQuery';
import { HelpPopover } from './HelpPopover';
import './Hud.css';

const MAX_WRONG = GAME_CONFIG.maxWrongPerRun;

/** 현재 위치 글자(해결 전 단계는 '?') */
function useLocationText(): string {
  const game = useApp((s) => s.game);
  return game ? locationLabel(game) : '';
}

function LocationChip({ variant }: { variant: 'top' | 'info' }) {
  const label = useLocationText();
  return (
    <span className={`hud-loc hud-loc--${variant}`} title={`현재 위치: ${label}`}>
      <Icon name="pin" size={20} />
      <span className="visually-hidden">현재 위치: </span>
      <span className="hud-loc-text">{label}</span>
    </span>
  );
}

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

/** 좁은 화면에서 단서 목록·문항이 자리를 많이 쓰는 국면(이때는 HUD를 기본으로 간단히 보여 준다) */
const BUSY_PHASES = new Set(['observe', 'question', 'feedback']);

export function HudInfo() {
  const game = useApp((s) => s.game);
  const compactScreen = useMediaQuery(COMPACT_QUERY);
  // 사용자가 직접 접거나 편 상태(국면이 바뀌면 기본값으로 돌아간다)
  const [override, setOverride] = useState<{ key: string; compact: boolean } | null>(null);
  const responses = game?.responses;
  const attempts = game?.activityAttempts;
  const supplementCount = useMemo(
    () => (responses && attempts ? supplementConceptIds({ responses, activityAttempts: attempts }).length : 0),
    [responses, attempts],
  );
  if (!game) return null;

  // 놀이공원 도입부에서는 탐험 정보를 아직 보여 주지 않는다.
  const inPark = game.phase === 'intro' && game.dialogue?.kind === 'introPark';
  const p = progressCounts(game);
  const loc = sceneLocation(game);
  const showVizChip = loc === 'sysCap' || loc === 'lungCap';
  const key = game.phase;
  const compact = override?.key === key ? override.compact : compactScreen && BUSY_PHASES.has(game.phase);

  return (
    <section className={`hud-info panel${compact ? ' is-compact' : ''}`} aria-label="탐험 상태">
      <div className="hud-row hud-row--main">
        <LocationChip variant="info" />
        {!inPark && (
          <span className="hud-progress">
            핵심 {p.coreSolved}/{p.coreTotal} · 복습 {p.reviewDone}/{p.reviewTotal}
          </span>
        )}
        {!inPark && (
          <button
            type="button"
            className="btn btn-ghost btn-icon hud-compact-toggle"
            aria-expanded={!compact}
            aria-label={compact ? '탐험 정보 자세히 보기' : '탐험 정보 간단히 보기'}
            onClick={() => setOverride({ key, compact: !compact })}
          >
            <Icon name={compact ? 'down' : 'up'} size={20} />
          </button>
        )}
      </div>
      {!inPark && (
        <>
          <LivesMeter runWrong={game.runWrong} pendingReturn={game.pendingReturn} />
          <p className="hud-rule">{MAX_WRONG + 1}번째 오답이면 출발점으로 돌아갑니다.</p>
          <div className="hud-chips">
            <span className="chip chip-record">
              <Icon name="retry" size={16} />
              재시작 {game.restartCount}회
            </span>
            <span className="chip chip-record">
              <Icon name="book" size={16} />
              보충 개념 {supplementCount}개
            </span>
            <span className="chip chip-note">
              <Icon name="ruler" size={16} />
              크기는 학습용으로 조정됨
            </span>
            {showVizChip && (
              <span className="chip chip-note">
                <Icon name="sparkle" size={16} />
                입자·화살표는 학습용 시각화
              </span>
            )}
          </div>
        </>
      )}
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
      <LocationChip variant="top" />
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
