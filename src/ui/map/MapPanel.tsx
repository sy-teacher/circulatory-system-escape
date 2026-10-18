// 지도 창(모달): 탐험 지도 + 범례 + 학습 상태 표시 + 단계별 목록.
// 아직 해결하지 않은 핵심 단계는 번호와 이름 모두 '?'로 둔다. 복습은 응답한 뒤에만 이름을 보여 준다.

import { useId, useMemo, useRef, useState } from 'react';
import { STEP_MAP } from '../../data/route';
import { buildReport } from '../../report/buildReport';
import { locationLabel, mapCurrentNode, progressCounts, stepAt } from '../../state/selectors';
import { useApp } from '../../state/store';
import type { GameState, Phase } from '../../state/types';
import { Icon } from '../controls/Icon';
import { useDialogA11y } from '../settings/SettingsPanel';
import { CirculationMap, MapLegend, StatusBadge, StatusLegend } from './CirculationMap';
import './MapPanel.css';

export function MapPanel() {
  const open = useApp((s) => s.mapOpen);
  const game = useApp((s) => s.game);
  if (!open || !game) return null;
  return <MapDialog game={game} />;
}

/** '지금 여기' 표시를 할 국면(단계 안에 있을 때) */
const STEP_PHASES: Phase[] = ['travel', 'arrival', 'remembered', 'observe', 'question', 'feedback', 'stepOutro'];

function MapDialog({ game }: { game: GameState }) {
  const setMapOpen = useApp((s) => s.setMapOpen);
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const close = () => setMapOpen(false);
  useDialogA11y(ref, close, closeRef);

  const [now] = useState(() => Date.now());
  const report = useMemo(() => buildReport(game, now), [game, now]);
  const counts = progressCounts(game);
  const currentStepId = STEP_PHASES.includes(game.phase) ? stepAt(game).id : null;
  const complete = game.escaped;

  return (
    <div
      className="modal-backdrop map-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div ref={ref} className="map-dialog panel" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <header className="map-head">
          <h2 id={titleId} className="map-title">
            <Icon name="map" />
            순환계 지도
          </h2>
          <p className="map-progress">
            <span className="chip">
              핵심 단계 {counts.coreSolved}/{counts.coreTotal}
            </span>
            <span className="chip">
              복습 {counts.reviewDone}/{counts.reviewTotal}
            </span>
          </p>
          <button ref={closeRef} type="button" className="btn btn-ghost btn-icon map-close" aria-label="지도 닫기" onClick={close}>
            <Icon name="close" />
          </button>
        </header>

        <div className="map-body">
          <div className="map-col-map">
            <div className="map-scroll">
              <CirculationMap
                record={game}
                currentNode={mapCurrentNode(game)}
                currentLabel={locationLabel(game)}
                mode={complete ? 'complete' : 'play'}
                showCirculation={complete}
                legend="none"
              />
            </div>
            <MapLegend as="div" className="is-standalone" showCirculation={complete} />
            <p className="map-tip">문제를 해결할 때마다 지도에 새 구역과 연결선이 나타나요. 틀린 답은 지도에 그려지지 않고, 학습 상태로만 기록돼요.</p>
          </div>

          <div className="map-col-list">
            <section className="map-section" aria-labelledby={`${titleId}-legend`}>
              <h3 id={`${titleId}-legend`} className="map-section-title">
                학습 상태 표시
              </h3>
              <StatusLegend />
            </section>

            <section className="map-section" aria-labelledby={`${titleId}-core`}>
              <h3 id={`${titleId}-core`} className="map-section-title">
                핵심 단계
              </h3>
              <ol className="map-steps">
                {report.zones.map((z) => {
                  const known = complete || !!game.latest[STEP_MAP[z.stepId].questionId]?.solved;
                  return (
                    <li key={z.stepId} className={`map-step${known ? ' is-known' : ''}`}>
                      <span className="map-step-name">
                        {known ? `${z.order}단계 · ${z.name}` : '?단계 · 아직 밝혀내지 못한 구역'}
                      </span>
                      <StatusBadge status={z.status} />
                      {currentStepId === z.stepId && (
                        <span className="chip map-here">
                          <span aria-hidden="true">📍</span> 지금 여기
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>

            <section className="map-section" aria-labelledby={`${titleId}-review`}>
              <h3 id={`${titleId}-review`} className="map-section-title">
                복습(보너스 관찰)
              </h3>
              <ol className="map-steps">
                {report.reviewRows.map((r) => {
                  const answered = r.status !== 'unchecked';
                  return (
                    <li key={r.stepId} className={`map-step${answered ? ' is-known' : ''}`}>
                      <span className="map-step-name">{answered ? r.name : `복습 ${r.order} · 아직 만나지 않은 관찰`}</span>
                      <StatusBadge status={r.status} />
                      {currentStepId === r.stepId && (
                        <span className="chip map-here">
                          <span aria-hidden="true">📍</span> 지금 여기
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>
              <p className="map-tip">복습 문제는 틀려도 오답 수가 늘지 않아요.</p>
            </section>
          </div>
        </div>

        <footer className="map-foot">
          <span className="map-keys">
            <kbd className="kbd">M</kbd> 또는 <kbd className="kbd">Esc</kbd>로 닫기
          </span>
          <button type="button" className="btn btn-primary" onClick={close}>
            닫기
          </button>
        </footer>
      </div>
    </div>
  );
}
