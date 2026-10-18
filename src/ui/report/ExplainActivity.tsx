// 마지막 30초 설명 활동: 완성된 지도를 보며 짝이나 선생님께 말로 설명한다.
// 마이크·녹음을 쓰지 않는다. 타이머는 선택 사항이며, 자기 점검표는 이 화면에서만 쓰는 상태다.

import { useEffect, useId, useRef, useState } from 'react';
import { GAME_CONFIG } from '../../data/config';
import { EXPLAIN_ACTIVITY } from '../../data/dialogue';
import { useApp } from '../../state/store';
import { Icon } from '../controls/Icon';
import { CirculationMap, type MapRecord } from '../map/CirculationMap';
import { useDialogA11y } from '../settings/SettingsPanel';
import './ExplainActivity.css';

export interface ExplainActivityProps {
  /** 지도의 학습 상태 배지에 쓸 기록(생략하면 현재 게임 → 저장된 기록) */
  record?: MapRecord | null;
  /** 완성 지도를 함께 보여 줄지(보고서 안에서는 이미 지도가 있으므로 끌 수 있다) */
  showMap?: boolean;
  /** 제목 요소의 id(감싸는 모달의 aria-labelledby에 쓴다) */
  headingId?: string;
  className?: string;
}

const EMPTY_RECORD: MapRecord = { discovered: [], latest: {}, firstResponses: {} };

/** 빈칸(___)을 보기 좋은 밑줄 칸으로 */
function Starter({ text }: { text: string }) {
  const parts = text.split('___');
  return (
    <>
      {parts.map((p, i) => (
        <span key={i}>
          {p}
          {i < parts.length - 1 && (
            <span className="explain-blank" aria-label="빈칸">
              {'　　　'}
            </span>
          )}
        </span>
      ))}
    </>
  );
}

export function ExplainActivity({ record, showMap = true, headingId, className }: ExplainActivityProps) {
  const storeRecord = useApp((s) => s.game ?? s.savedRecord);
  const mapRecord = record ?? storeRecord ?? EMPTY_RECORD;
  const autoId = useId();
  const hid = headingId ?? `${autoId}-title`;
  const [checks, setChecks] = useState<boolean[]>(() => EXPLAIN_ACTIVITY.checklist.map(() => false));
  const done = checks.filter(Boolean).length;

  return (
    <section className={['explain', className].filter(Boolean).join(' ')} aria-labelledby={hid}>
      <h2 id={hid} className="explain-title">
        <Icon name="chat" />
        30초 설명 활동
      </h2>
      <p className="explain-question">
        <strong>질문</strong> {EXPLAIN_ACTIVITY.question}
      </p>
      <p className="explain-guide">
        지도를 보며 짝이나 선생님께 {GAME_CONFIG.explainSeconds}초 동안 말로 설명해 보세요.
        <span className="explain-guide-sub"> (녹음하지 않아요. 마이크도 쓰지 않아요.)</span>
      </p>

      <div className={`explain-grid${showMap ? '' : ' no-map'}`}>
        {showMap && (
          <div className="explain-map">
            <CirculationMap record={mapRecord} currentNode={null} currentLabel={null} mode="complete" showCirculation legend="mini" label="설명할 때 볼 완성된 순환계 지도" />
          </div>
        )}

        <div className="explain-side">
          <div className="explain-card">
            <h3 className="explain-sub">이렇게 시작해 보세요</h3>
            <ol className="explain-starters">
              {EXPLAIN_ACTIVITY.starters.map((s, i) => (
                <li key={i}>
                  <Starter text={s} />
                </li>
              ))}
            </ol>
          </div>

          <div className="explain-card">
            <h3 className="explain-sub">
              스스로 점검하기{' '}
              <span className="explain-count">
                {done}/{checks.length}
              </span>
            </h3>
            <ul className="explain-checks">
              {EXPLAIN_ACTIVITY.checklist.map((c, i) => (
                <li key={i}>
                  <label className="explain-check">
                    <input
                      type="checkbox"
                      checked={checks[i]}
                      onChange={(e) => {
                        const v = e.target.checked;
                        setChecks((prev) => prev.map((x, j) => (j === i ? v : x)));
                      }}
                    />
                    <span>{c}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>

          <ExplainTimer />
        </div>
      </div>
    </section>
  );
}

/** 선택 사항: 30초 타이머(시작 · 처음부터) */
function ExplainTimer() {
  const total = GAME_CONFIG.explainSeconds;
  const [left, setLeft] = useState<number>(total);
  const [running, setRunning] = useState(false);
  const endAt = useRef(0);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      const s = Math.max(0, Math.ceil((endAt.current - Date.now()) / 1000));
      setLeft(s);
      if (s <= 0) setRunning(false);
    }, 200);
    return () => window.clearInterval(id);
  }, [running]);

  const start = () => {
    const from = left <= 0 ? total : left;
    endAt.current = Date.now() + from * 1000;
    setLeft(from);
    setRunning(true);
  };
  const reset = () => {
    setRunning(false);
    setLeft(total);
  };

  // 화면 읽기 프로그램에는 매초가 아니라 중요한 순간에만 알린다.
  let announce = '';
  if (running && left > 10) announce = `${total}초 타이머를 시작했어요. 설명을 시작하세요.`;
  else if (running && left > 0) announce = '10초 남았어요.';
  else if (!running && left <= 0) announce = '시간이 다 됐어요. 설명을 잘 마쳤나요?';

  const r = 26;
  const circ = 2 * Math.PI * r;
  const ratio = Math.max(0, Math.min(1, left / total));

  return (
    <div className="explain-card explain-timer no-print">
      <h3 className="explain-sub">
        {total}초 타이머 <span className="explain-optional">(선택)</span>
      </h3>
      <div className="explain-timer-row">
        <svg className="explain-ring" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
          <circle cx={32} cy={32} r={r} className="explain-ring-bg" />
          <circle
            cx={32}
            cy={32}
            r={r}
            className={`explain-ring-fg${left <= 10 ? ' is-low' : ''}`}
            strokeDasharray={circ}
            strokeDashoffset={circ * (1 - ratio)}
            transform="rotate(-90 32 32)"
          />
        </svg>
        <div className="explain-time" role="timer" aria-live="off" aria-label={`남은 시간 ${left}초`}>
          {left}
          <span className="explain-time-unit">초</span>
        </div>
        <div className="explain-timer-btns">
          <button type="button" className="btn btn-secondary btn-small" onClick={start} disabled={running}>
            <Icon name="play" filled size={18} />
            {left <= 0 || left === total ? '시작' : '이어서'}
          </button>
          <button type="button" className="btn btn-small" onClick={reset} disabled={!running && left === total}>
            <Icon name="retry" size={18} />
            처음부터
          </button>
        </div>
      </div>
      <p className="visually-hidden" aria-live="polite">
        {announce}
      </p>
      {!running && left <= 0 && <p className="explain-done">시간 끝! 점검표를 보며 빠뜨린 내용이 있는지 확인해 보세요.</p>}
    </div>
  );
}

/** 탈출 화면 등에서 쓰는 모달 */
export function ExplainActivityDialog({ onClose, record }: { onClose: () => void; record?: MapRecord | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const hid = useId();
  useDialogA11y(ref, onClose, closeRef);
  return (
    <div
      className="modal-backdrop explain-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={ref} className="explain-dialog" role="dialog" aria-modal="true" aria-labelledby={`${hid}-t`} tabIndex={-1}>
        <button ref={closeRef} type="button" className="btn btn-ghost btn-icon explain-close" aria-label="설명 활동 닫기" onClick={onClose}>
          <Icon name="close" />
        </button>
        <ExplainActivity record={record} headingId={`${hid}-t`} />
        <div className="explain-dialog-actions">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            다 했어요
          </button>
        </div>
      </div>
    </div>
  );
}
