// 첫 화면: 제목·성취기준·짧은 안내, 새 탐험/이어서 하기/결과 보기/지난 기록/기록 삭제/설정.
// 소리는 '시작'류 버튼을 누른 뒤에만 켠다(unlockAudio).

import { useId, useRef, useState } from 'react';
import { unlockAudio } from '../../audio/sfx';
import { GAME_CONFIG } from '../../data/config';
import { progressCounts } from '../../state/selectors';
import { useApp } from '../../state/store';
import type { LearningRecord } from '../../state/types';
import { Icon } from '../controls/Icon';
import { Portrait } from '../dialogue/Portrait';
import { WebGLNotice } from '../fallback/WebGLNotice';
import { useDialogA11y } from '../settings/SettingsPanel';
import './TitleScreen.css';

function fmtDate(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function recordSummary(r: LearningRecord): string {
  const c = progressCounts(r);
  return r.escaped ? `탈출 성공 · 핵심 ${c.coreSolved}/${c.coreTotal}` : `탐험 중 · 핵심 ${c.coreSolved}/${c.coreTotal} · 복습 ${c.reviewDone}/${c.reviewTotal}`;
}

type Confirm = { kind: 'new'; simplified: boolean } | { kind: 'clear' } | null;

export function TitleScreen() {
  const saved = useApp((s) => s.savedRecord);
  const archive = useApp((s) => s.archive);
  const storageOk = useApp((s) => s.storageOk);
  const webgl2 = useApp((s) => s.webgl2);
  const startNew = useApp((s) => s.startNew);
  const resume = useApp((s) => s.resume);
  const openReport = useApp((s) => s.openReport);
  const clearRecords = useApp((s) => s.clearRecords);
  const setSettingsOpen = useApp((s) => s.setSettingsOpen);
  const setSimplified = useApp((s) => s.setSimplified);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const titleId = useId();

  const noWebgl = webgl2 === false;
  const canResume = !!saved && !saved.escaped;

  const begin = (kind: 'new' | 'resume', simplified: boolean) => {
    unlockAudio();
    if (simplified || noWebgl) setSimplified(true);
    if (kind === 'new') startNew();
    else resume();
  };

  const requestNew = (simplified: boolean) => {
    if (saved) setConfirm({ kind: 'new', simplified });
    else begin('new', simplified);
  };

  return (
    <main className="title-screen" aria-labelledby={titleId}>
      <div className="title-inner">
        <header className="title-hero">
          <TitleArt />
          <div className="title-text">
            <p className="title-kicker">중학교 2학년 과학 · 순환계</p>
            <h1 id={titleId} className="title-name">
              <span className="title-bracket" aria-hidden="true">
                《
              </span>
              순환계 방탈출: <span className="title-name-sub">수연쌤의 혈관 탐험</span>
              <span className="title-bracket" aria-hidden="true">
                》
              </span>
            </h1>
            <p className="title-standard">[9과13-02] 순환계의 구조와 기능을 이해하고, 혈액의 순환 경로를 종합하여 발표할 수 있다.</p>
            <p className="title-meta">
              <span className="chip">
                <span aria-hidden="true">⏱️</span> 약 20분
              </span>
              <span className="chip">
                <span aria-hidden="true">🫀</span> 핵심 10단계 + 복습 6개
              </span>
            </p>
          </div>
        </header>

        {noWebgl && (
          <WebGLNotice
            className="title-notice"
            onStartSimplified={() => requestNew(true)}
            onResumeSimplified={canResume ? () => begin('resume', true) : undefined}
          />
        )}
        {!storageOk && (
          <p className="title-warn" role="note">
            <span aria-hidden="true">💾</span> 이 브라우저에서는 저장소를 쓸 수 없어서 <strong>이번 세션에서만 기록돼요.</strong> 창을 닫으면 기록이 사라져요. 결과 보고서를 인쇄하거나 복사해
            두세요.
          </p>
        )}

        <section className="title-actions panel" aria-label="탐험 시작">
          {canResume && saved && (
            <button type="button" className="btn btn-primary title-main-btn" onClick={() => begin('resume', false)}>
              <Icon name="play" filled />
              이어서 하기
              <span className="title-btn-sub">{recordSummary(saved)}</span>
            </button>
          )}
          <button type="button" className={`btn ${canResume ? 'btn-secondary' : 'btn-primary'} title-main-btn`} onClick={() => requestNew(false)}>
            <Icon name="flag" />새 탐험 시작
          </button>
          <div className="title-sub-actions">
            {saved?.escaped && (
              <button type="button" className="btn" onClick={() => openReport(saved)}>
                <Icon name="report" />
                결과 다시 보기
              </button>
            )}
            {saved && !saved.escaped && (
              <button type="button" className="btn" onClick={() => openReport(saved)}>
                <Icon name="report" />
                지금까지 결과 보기
              </button>
            )}
            {saved?.escaped && (
              <button type="button" className="btn" onClick={() => begin('resume', false)}>
                <Icon name="star" />
                탈출 장면 다시 보기
              </button>
            )}
            <button type="button" className="btn" onClick={() => setSettingsOpen(true)}>
              <Icon name="settings" />
              설정
            </button>
          </div>
        </section>

        <section className="title-howto panel" aria-labelledby={`${titleId}-how`}>
          <h2 id={`${titleId}-how`} className="title-h2">
            <Icon name="help" />
            탐험 방법
          </h2>
          <ol className="title-steps">
            <li>
              <span aria-hidden="true">🖱️</span> 화면을 <strong>드래그</strong>해서 주변을 둘러봐요.
            </li>
            <li>
              <span aria-hidden="true">✨</span> 반짝이는 <strong>관찰 지점</strong>을 눌러 단서를 모아요.
            </li>
            <li>
              <span aria-hidden="true">🔍</span> 단서를 <strong>{GAME_CONFIG.minCluesCore}개 이상</strong> 모으면 ‘추론하기’를 눌러요. (복습은 {GAME_CONFIG.minCluesReview}개)
            </li>
            <li>
              <span aria-hidden="true">📍</span> 지금 있는 <strong>위치</strong>와 그렇게 생각한 <strong>근거</strong>를 함께 골라요.
            </li>
            <li>
              <span aria-hidden="true">❤️</span> 한 탐험에서 <strong>{GAME_CONFIG.maxWrongPerRun}번</strong>까지 틀려도 계속 가요. {GAME_CONFIG.maxWrongPerRun + 1}번째 오답이면 출발점으로
              돌아가지만, 기록은 그대로 남아요.
            </li>
            <li>
              <span aria-hidden="true">💡</span> <strong>힌트는 무료!</strong> 써도 오답 수가 늘지 않아요.
            </li>
          </ol>
        </section>

        {archive.length > 0 && (
          <section className="title-archive panel" aria-labelledby={`${titleId}-arch`}>
            <h2 id={`${titleId}-arch`} className="title-h2">
              <Icon name="book" />
              지난 기록
            </h2>
            <ul className="title-archive-list">
              {archive.map((a, i) => (
                <li key={`${a.record.sessionId}-${a.archivedAt}-${i}`}>
                  <span className="title-archive-text">
                    <strong>{fmtDate(a.record.startedAt)}</strong> 시작 · {recordSummary(a.record)}
                  </span>
                  <button
                    type="button"
                    className="btn btn-small"
                    onClick={() => openReport(a.record)}
                    aria-label={`${fmtDate(a.record.startedAt)}에 시작한 지난 기록 보고서 보기`}
                  >
                    <Icon name="eye" size={18} />
                    보기
                  </button>
                </li>
              ))}
            </ul>
            <p className="title-small">지난 기록은 읽기 전용이에요. 최근 {GAME_CONFIG.archiveLimit}개까지 보관해요.</p>
          </section>
        )}

        <footer className="title-foot">
          <p className="title-privacy">
            <span aria-hidden="true">🔒</span> 이름을 입력하지 않으며, 기록은 이 기기의 브라우저에만 저장돼요.
          </p>
          {(saved || archive.length > 0) && (
            <button type="button" className="btn btn-ghost btn-small title-clear" onClick={() => setConfirm({ kind: 'clear' })}>
              기록 삭제
            </button>
          )}
        </footer>
      </div>

      {confirm?.kind === 'new' && (
        <ConfirmDialog
          title="새 탐험을 시작할까요?"
          message="진행 중인 기록은 지난 기록으로 보관돼요. 언제든 ‘지난 기록’에서 결과 보고서를 다시 볼 수 있어요."
          confirmLabel="새 탐험 시작"
          onConfirm={() => {
            const simplified = confirm.simplified;
            setConfirm(null);
            begin('new', simplified);
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm?.kind === 'clear' && (
        <ConfirmDialog
          title="기록을 모두 삭제할까요?"
          message="이 기기에 저장된 진행 중인 기록과 지난 기록이 모두 지워지고, 되돌릴 수 없어요. (설정은 그대로 남아요.)"
          confirmLabel="모두 삭제"
          danger
          onConfirm={() => {
            setConfirm(null);
            clearRecords();
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </main>
  );
}

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmDialog({ title, message, confirmLabel, danger = false, onConfirm, onCancel }: ConfirmDialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const id = useId();
  // 실수로 지우지 않도록 처음 포커스는 '취소'에 둔다.
  useDialogA11y(ref, onCancel, cancelRef);
  return (
    <div
      className="modal-backdrop title-confirm-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div ref={ref} className="title-confirm panel" role="alertdialog" aria-modal="true" aria-labelledby={`${id}-t`} aria-describedby={`${id}-d`} tabIndex={-1}>
        <h2 id={`${id}-t`} className="title-h2">
          {title}
        </h2>
        <p id={`${id}-d`}>{message}</p>
        <div className="title-confirm-actions">
          <button ref={cancelRef} type="button" className="btn" onClick={onCancel}>
            취소
          </button>
          <button type="button" className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** 혈관 터널 + 적혈구 + 탐사선 + 수연쌤(장식용 그림) */
function TitleArt() {
  return (
    <div className="title-art" aria-hidden="true">
      <svg className="title-tunnel" viewBox="0 0 240 180" focusable="false">
        <defs>
          <radialGradient id="title-tunnel-glow" cx="50%" cy="48%" r="60%">
            <stop offset="0%" stopColor="#ffd2d6" />
            <stop offset="35%" stopColor="#f26d7d" />
            <stop offset="100%" stopColor="#7a1e36" />
          </radialGradient>
        </defs>
        <rect width={240} height={180} rx={28} fill="url(#title-tunnel-glow)" />
        {[0, 1, 2, 3].map((i) => (
          <ellipse key={i} cx={120} cy={88} rx={110 - i * 24} ry={78 - i * 17} fill="none" stroke="#ffb3bd" strokeOpacity={0.55 - i * 0.1} strokeWidth={3} />
        ))}
        <g className="title-cells">
          <g transform="translate(58 58) rotate(-20)">
            <ellipse rx={16} ry={10} fill="#e5323f" />
            <ellipse rx={7} ry={3.5} fill="#000" opacity={0.15} />
          </g>
          <g transform="translate(184 62) rotate(18)">
            <ellipse rx={13} ry={8} fill="#e5323f" />
            <ellipse rx={6} ry={3} fill="#000" opacity={0.15} />
          </g>
          <g transform="translate(170 122) rotate(-8)">
            <ellipse rx={10} ry={6} fill="#a3203a" />
            <ellipse rx={4.5} ry={2.2} fill="#000" opacity={0.15} />
          </g>
        </g>
        {/* 지붕 없는 탐사선 */}
        <g transform="translate(120 140)">
          <ellipse cx={0} cy={10} rx={58} ry={9} fill="#000" opacity={0.18} />
          <path d="M-56 -6 Q-56 10 -40 12 H40 Q56 10 56 -6 Z" fill="#ffcf3f" stroke="#c99a12" strokeWidth={2.5} />
          <rect x={-46} y={-14} width={92} height={10} rx={5} fill="#4fd6c4" stroke="#2a9c8d" strokeWidth={2} />
          <circle cx={-34} cy={4} r={3} fill="#fff" />
          <circle cx={34} cy={4} r={3} fill="#fff" />
        </g>
      </svg>
      <div className="title-portrait">
        <Portrait speaker="suyeon" mood="cheer" size={96} decorative />
      </div>
    </div>
  );
}
