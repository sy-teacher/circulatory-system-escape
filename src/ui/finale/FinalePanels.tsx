// 마지막 단계 화면들
//  ActivityPanel: 완성된 지도에서 허파순환·온몸순환 범위 고르기(오답 수와 무관, 몇 번이든 다시)
//  RecheckPanel: 보충 개념 O/X 재확인(오답 수와 무관)
//  EscapeScreen: 손에 든 종이 지도 + 탈출 메시지

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { getConcept } from '../../data/concepts';
import { ESCAPE_MESSAGE } from '../../data/dialogue';
import { MAP_NODES } from '../../data/map';
import { CIRCULATION_ACTIVITY } from '../../data/questions';
import { CIRCULATION_ORDER } from '../../data/route';
import type { Circulation, NodeId } from '../../data/types';
import { recheckConceptIds } from '../../state/selectors';
import { useApp } from '../../state/store';
import type { ActivityFeedback, GameState } from '../../state/types';
import { Icon } from '../controls/Icon';
import { CirculationMap } from '../map/CirculationMap';
import { ExplainActivityDialog } from '../report/ExplainActivity';
import './FinalePanels.css';

const CIRC_LABEL: Record<Circulation, string> = { pulmonary: '허파순환', systemic: '온몸순환' };

function sortByRoute(ids: NodeId[]): NodeId[] {
  return [...ids].sort((a, b) => CIRCULATION_ORDER.indexOf(a) - CIRCULATION_ORDER.indexOf(b));
}

/** 목록으로 고를 때의 순서(가나다순) */
const CHIP_ORDER: NodeId[] = [...CIRCULATION_ORDER].sort((a, b) => MAP_NODES[a].name.localeCompare(MAP_NODES[b].name, 'ko'));

function names(ids: readonly NodeId[]): string {
  return ids.map((n) => MAP_NODES[n].name).join(', ');
}

/** 패널이 처음 나타날 때 제목으로 포커스를 옮긴다(화면 읽기 프로그램이 새 내용을 읽도록) */
function useFocusOnMount<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  return ref;
}

// ── 범위 활동 ─────────────────────────────────────────────────────

export function ActivityPanel() {
  const game = useApp((s) => s.game);
  if (!game || game.phase !== 'activity' || game.dialogue) return null;
  return <ActivityInner game={game} />;
}

function ActivityInner({ game }: { game: GameState }) {
  const submitActivity = useApp((s) => s.submitActivity);
  const finishActivity = useApp((s) => s.finishActivity);
  const last = game.activityAttempts[game.activityAttempts.length - 1];
  const [pulmonary, setPulmonary] = useState<NodeId[]>(() => (last ? sortByRoute(last.pulmonary) : []));
  const [systemic, setSystemic] = useState<NodeId[]>(() => (last ? sortByRoute(last.systemic) : []));
  const [active, setActive] = useState<Circulation>('pulmonary');
  const headRef = useFocusOnMount<HTMLHeadingElement>();
  const uid = useId();
  const tabIds: Record<Circulation, string> = { pulmonary: `${uid}-tab-p`, systemic: `${uid}-tab-s` };
  const panelId = `${uid}-panel`;
  const tabRefs = useRef<Record<Circulation, HTMLButtonElement | null>>({ pulmonary: null, systemic: null });

  const solved = game.activitySolved;
  const fb = game.activityFeedback;

  const toggle = (n: NodeId) => {
    const set = active === 'pulmonary' ? setPulmonary : setSystemic;
    set((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : sortByRoute([...prev, n])));
  };

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const next: Circulation = active === 'pulmonary' ? 'systemic' : 'pulmonary';
    const target: Circulation = e.key === 'Home' ? 'pulmonary' : e.key === 'End' ? 'systemic' : next;
    setActive(target);
    tabRefs.current[target]?.focus();
  };

  const canSubmit = pulmonary.length > 0 && systemic.length > 0;

  return (
    <div className="finale-layer">
      <section className="finale-panel activity panel" aria-labelledby={`${uid}-title`}>
        <header className="finale-head">
          <h2 id={`${uid}-title`} ref={headRef} tabIndex={-1} className="finale-title">
            <Icon name="map" />
            마지막 활동: 두 순환의 범위
          </h2>
          <p className="finale-prompt">{CIRCULATION_ACTIVITY.prompt}</p>
          <p className="finale-safe">
            <span aria-hidden="true">🛟</span> 이 활동은 오답 수(기회)와 상관없어요. 맞힐 때까지 몇 번이든 다시 골라도 돼요.
          </p>
        </header>

        {solved ? (
          <div className="activity-solved">
            <p className="activity-result is-ok" role="status">
              <span aria-hidden="true">🎉</span> 정확해요! 두 순환의 범위를 모두 찾았어요.
            </p>
            <div className="activity-grid">
              <div className="activity-map">
                <CirculationMap record={game} currentNode="lv" mode="complete" showCirculation showStatus={false} legend="mini" />
              </div>
              <div className="activity-side">
                <div className="activity-range is-pulmonary">
                  <h3>허파순환</h3>
                  <p>{CIRCULATION_ACTIVITY.pulmonary.map((n) => MAP_NODES[n].name).join(' → ')}</p>
                  <p className="activity-range-note">심장(우심실)에서 나간 혈액이 허파를 거쳐 심장(좌심방)으로 돌아와요. 허파의 모세혈관에서 산소가 풍부해져요.</p>
                </div>
                <div className="activity-range is-systemic">
                  <h3>온몸순환</h3>
                  <p>{CIRCULATION_ACTIVITY.systemic.map((n) => MAP_NODES[n].name).join(' → ')}</p>
                  <p className="activity-range-note">심장(좌심실)에서 나간 혈액이 온몸을 거쳐 심장(우심방)으로 돌아와요. 온몸의 모세혈관에서 산소가 적어져요.</p>
                </div>
                <button type="button" className="btn btn-primary finale-next" onClick={finishActivity}>
                  다음 <span aria-hidden="true">▶</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="activity-grid">
            <div className="activity-map">
              <div className="activity-tabs" role="tablist" aria-label="고를 순환">
                {(['pulmonary', 'systemic'] as const).map((c) => (
                  <button
                    key={c}
                    id={tabIds[c]}
                    ref={(el) => {
                      tabRefs.current[c] = el;
                    }}
                    type="button"
                    role="tab"
                    aria-selected={active === c}
                    aria-controls={panelId}
                    tabIndex={active === c ? 0 : -1}
                    className={`activity-tab is-${c}${active === c ? ' is-active' : ''}`}
                    onClick={() => setActive(c)}
                    onKeyDown={onTabKey}
                  >
                    <span className="activity-tab-swatch" aria-hidden="true" />
                    {CIRC_LABEL[c]} 고르기
                    <span className="activity-tab-count">{(c === 'pulmonary' ? pulmonary : systemic).length}곳</span>
                  </button>
                ))}
              </div>
              <div id={panelId} role="tabpanel" aria-labelledby={tabIds[active]} className="activity-tabpanel">
                <p className="activity-howto">
                  지금 <strong>{CIRC_LABEL[active]}</strong>에 들어갈 구역을 고르는 중이에요. 지도의 구역을 누르면(또는 <kbd className="kbd">Enter</kbd>) 넣거나 뺄 수
                  있어요.
                </p>
                <CirculationMap
                  record={game}
                  currentNode={null}
                  currentLabel={null}
                  mode="complete"
                  selection={{ pulmonary, systemic, active, onToggle: toggle }}
                  legend="mini"
                  label={`${CIRC_LABEL[active]} 고르기 지도`}
                />
                {/* 좁은 화면에서는 지도 글자가 작아지므로 목록으로도 고를 수 있게 한다(가나다순: 순서가 힌트가 되지 않게) */}
                <div className="activity-chips" role="group" aria-label={`${CIRC_LABEL[active]}에 넣을 구역을 목록으로 고르기`}>
                  {CHIP_ORDER.map((n) => {
                    const inP = pulmonary.includes(n);
                    const inS = systemic.includes(n);
                    const pressed = active === 'pulmonary' ? inP : inS;
                    return (
                      <button key={n} type="button" className={`activity-chip${pressed ? ' is-pressed' : ''}`} aria-pressed={pressed} onClick={() => toggle(n)}>
                        {MAP_NODES[n].name}
                        {inP && <span className="activity-chip-tag is-pulmonary">허파 ✔</span>}
                        {inS && <span className="activity-chip-tag is-systemic">온몸 ✔</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="activity-side">
              <div className="activity-picked">
                <h3>고른 구역</h3>
                <p className={`activity-picked-row is-pulmonary${active === 'pulmonary' ? ' is-active' : ''}`}>
                  <strong>허파순환 ({pulmonary.length})</strong> {pulmonary.length ? names(pulmonary) : '아직 고르지 않았어요'}
                </p>
                <p className={`activity-picked-row is-systemic${active === 'systemic' ? ' is-active' : ''}`}>
                  <strong>온몸순환 ({systemic.length})</strong> {systemic.length ? names(systemic) : '아직 고르지 않았어요'}
                </p>
              </div>

              <button type="button" className="btn btn-primary" disabled={!canSubmit} onClick={() => submitActivity(pulmonary, systemic)}>
                <Icon name="check" />
                {fb ? '다시 제출하기' : '제출하기'}
              </button>
              {!canSubmit && <p className="finale-hint">두 순환을 모두 골라야 제출할 수 있어요.</p>}

              <div aria-live="polite">{fb && <ActivityFeedbackView fb={fb} />}</div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function ActivityFeedbackView({ fb }: { fb: ActivityFeedback }) {
  const rows: { c: Circulation; ok: boolean; missing: NodeId[]; extra: NodeId[] }[] = [
    { c: 'pulmonary', ok: fb.pulmonaryCorrect, missing: fb.missingPulmonary, extra: fb.extraPulmonary },
    { c: 'systemic', ok: fb.systemicCorrect, missing: fb.missingSystemic, extra: fb.extraSystemic },
  ];
  return (
    <div className="activity-feedback">
      <p className="activity-feedback-lead">
        <span aria-hidden="true">🙂</span> 거의 다 왔어! 혈액이 심장에서 나가 다시 심장으로 들어올 때까지를 한 순환으로 따라가 보자.
      </p>
      <ul>
        {rows.map((r) => (
          <li key={r.c} className={r.ok ? 'is-ok' : 'is-retry'}>
            <strong>
              {r.ok ? '✓' : '↻'} {CIRC_LABEL[r.c]}
            </strong>{' '}
            {r.ok ? '범위가 정확해요!' : '조금만 고쳐 보자.'}
            {!r.ok && r.missing.length > 0 && <span className="activity-fb-line">빠진 구역: {names(r.missing)}</span>}
            {!r.ok && r.extra.length > 0 && (
              <span className="activity-fb-line">
                {CIRC_LABEL[r.c]}에 속하지 않는 구역: {names(r.extra)}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── 개념 재확인 ───────────────────────────────────────────────────

export function RecheckPanel() {
  const game = useApp((s) => s.game);
  if (!game || game.phase !== 'recheck' || game.dialogue) return null;
  const items = recheckConceptIds(game);
  const id = items[game.recheckIndex];
  if (!id) return null;
  return <RecheckInner key={id} game={game} conceptId={id} index={game.recheckIndex} total={items.length} />;
}

function RecheckInner({ game, conceptId, index, total }: { game: GameState; conceptId: string; index: number; total: number }) {
  const answerRecheck = useApp((s) => s.answerRecheck);
  const nextRecheck = useApp((s) => s.nextRecheck);
  const concept = getConcept(conceptId);
  const result = game.recheck[conceptId];
  const headRef = useFocusOnMount<HTMLHeadingElement>();
  const nextRef = useRef<HTMLButtonElement>(null);
  const uid = useId();
  const isLast = index + 1 >= total;

  // 답한 뒤에는 '다음' 버튼으로 포커스를 옮긴다.
  const answered = !!result;
  useEffect(() => {
    if (answered) nextRef.current?.focus({ preventScroll: true });
  }, [answered]);

  return (
    <div className="finale-layer">
      <section className="finale-panel recheck panel" aria-labelledby={`${uid}-title`}>
        <header className="finale-head">
          <p className="recheck-progress">
            개념 재확인 <strong>{index + 1}</strong>/{total}
          </p>
          <h2 id={`${uid}-title`} ref={headRef} tabIndex={-1} className="finale-title">
            {concept.name}
          </h2>
          <p className="finale-safe">
            <span aria-hidden="true">🛟</span> 오답 수와 상관없는 짧은 재확인이에요.
          </p>
        </header>

        <p className="recheck-statement" id={`${uid}-st`}>
          {concept.recheck.statement}
        </p>
        <div className="recheck-ox" role="group" aria-label="이 문장이 맞으면 O, 틀리면 X" aria-describedby={`${uid}-st`}>
          {([true, false] as const).map((v) => (
            <button
              key={String(v)}
              type="button"
              className={`btn recheck-btn ${v ? 'is-o' : 'is-x'}${result?.answer === v ? ' is-chosen' : ''}`}
              aria-pressed={result ? result.answer === v : undefined}
              disabled={answered}
              onClick={() => answerRecheck(conceptId, v)}
            >
              <span className="recheck-symbol" aria-hidden="true">
                {v ? 'O' : 'X'}
              </span>
              {v ? '맞아요' : '틀려요'}
            </button>
          ))}
        </div>

        <div aria-live="polite">
          {result && (
            <div className={`recheck-result ${result.correct ? 'is-ok' : 'is-retry'}`}>
              <p className="recheck-verdict">
                {result.correct ? '✓ 맞았어요!' : '↻ 다시 한번 짚어 볼까요?'} 정답은 <strong>{concept.recheck.answer ? 'O' : 'X'}</strong>예요.
              </p>
              <p>{concept.recheck.explanation}</p>
              <p className="recheck-concept">
                <strong>개념 정리</strong> {concept.explanation}
              </p>
            </div>
          )}
        </div>

        <div className="finale-actions">
          <button ref={nextRef} type="button" className="btn btn-primary finale-next" disabled={!answered} onClick={nextRecheck}>
            {isLast ? '돌아가기' : '다음'} <span aria-hidden="true">▶</span>
          </button>
        </div>
      </section>
    </div>
  );
}

// ── 탈출 화면 ─────────────────────────────────────────────────────

export function EscapeScreen() {
  const game = useApp((s) => s.game);
  if (!game || game.phase !== 'escape' || game.escapeStage !== 'message' || game.dialogue) return null;
  return <EscapeInner game={game} />;
}

function Hand({ side }: { side: 'left' | 'right' }) {
  return (
    <svg className={`escape-hand is-${side}`} viewBox="0 0 80 110" aria-hidden="true" focusable="false">
      {/* 손바닥과 손가락(종이 뒤), 엄지(종이 앞) */}
      <rect x={14} y={30} width={56} height={74} rx={26} className="escape-skin" />
      <rect x={10} y={8} width={16} height={44} rx={8} className="escape-skin" />
      <rect x={28} y={2} width={16} height={46} rx={8} className="escape-skin" />
      <rect x={46} y={6} width={16} height={44} rx={8} className="escape-skin" />
      <ellipse cx={62} cy={44} rx={11} ry={20} className="escape-skin is-thumb" transform="rotate(-24 62 44)" />
      <path d="M22 96 Q42 104 62 96" className="escape-sleeve" />
    </svg>
  );
}

function EscapeInner({ game }: { game: GameState }) {
  const openReport = useApp((s) => s.openReport);
  const goTitle = useApp((s) => s.goTitle);
  const [explainOpen, setExplainOpen] = useState(false);
  const headRef = useFocusOnMount<HTMLHeadingElement>();
  const uid = useId();

  return (
    <div className="finale-layer escape-layer">
      <section className="escape" aria-labelledby={`${uid}-title`}>
        <h2 id={`${uid}-title`} ref={headRef} tabIndex={-1} className="visually-hidden">
          탈출 성공 — 손에 든 순환계 지도
        </h2>
        <div className="escape-holder">
          <Hand side="left" />
          <div className="escape-paper">
            <p className="escape-paper-title">
              <span aria-hidden="true">🗺️</span> 나의 순환계 지도
            </p>
            <CirculationMap record={game} currentNode={null} currentLabel={null} mode="complete" showCirculation legend="mini" label="탈출할 때 손에 든 완성된 순환계 지도" />
          </div>
          <Hand side="right" />
        </div>

        <div className="escape-message">
          <p className="escape-main">{ESCAPE_MESSAGE.main}</p>
          <p className="escape-warning">{ESCAPE_MESSAGE.warning}</p>
        </div>

        <div className="escape-actions">
          <button type="button" className="btn btn-primary" onClick={() => openReport()}>
            <Icon name="report" />
            학습 결과 보기
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setExplainOpen(true)}>
            <Icon name="chat" />
            30초 설명 활동
          </button>
          <button type="button" className="btn" onClick={goTitle}>
            <Icon name="home" />
            처음 화면으로
          </button>
        </div>
      </section>
      {explainOpen && <ExplainActivityDialog record={game} onClose={() => setExplainOpen(false)} />}
    </div>
  );
}
