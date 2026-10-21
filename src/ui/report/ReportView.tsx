// 학습 진단 보고서(점수판이 아님): 어떤 개념을 다시 보면 좋을지 알려 준다.
// 이름을 입력받지 않고, 어디에도 전송하지 않는다(인쇄·복사는 학생이 직접).
// 인쇄할 때 보고서만 보이도록 document.body 바로 아래에 그린다(@media print에서 나머지를 숨김).

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ROUTE } from '../../data/route';
import { buildReport, type Report, type ReportItem } from '../../report/buildReport';
import { reportToText } from '../../report/reportText';
import { useApp } from '../../state/store';
import type { LearningRecord, QuestionStatus } from '../../state/types';
import { Icon } from '../controls/Icon';
import { CirculationMap, StatusBadge, StatusLegend } from '../map/CirculationMap';
import { useDialogA11y } from '../settings/SettingsPanel';
import { ExplainActivity } from './ExplainActivity';
import { EXPLAIN_ACTIVITY } from '../../data/dialogue';
import './ReportView.css';

export function ReportView() {
  const open = useApp((s) => s.reportOpen);
  const reportRecord = useApp((s) => s.reportRecord);
  const game = useApp((s) => s.game);
  const saved = useApp((s) => s.savedRecord);
  if (!open || typeof document === 'undefined') return null;
  const record: LearningRecord | null = reportRecord ?? game ?? saved;
  const currentId = (game ?? saved)?.sessionId;
  const archived = !!reportRecord && reportRecord.sessionId !== currentId;
  return createPortal(<ReportDialog record={record} archived={archived} />, document.body);
}

function fmtDate(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 클립보드 API를 쓸 수 없을 때(오래된 브라우저·권한 거부) */
function legacyCopy(text: string): boolean {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.top = '-1000px';
  ta.style.left = '0';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  document.body.removeChild(ta);
  return ok;
}

type CopyState = 'idle' | 'copied' | 'failed';

function ReportDialog({ record, archived }: { record: LearningRecord | null; archived: boolean }) {
  const closeReport = useApp((s) => s.closeReport);
  const largeText = useApp((s) => s.settings.largeText);
  const reduceMotion = useApp((s) => s.settings.reduceMotion);
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const copyRef = useRef<HTMLButtonElement>(null);
  const imageBusy = useRef(false);
  const imageMounted = useRef(true);
  const [imageStatus, setImageStatus] = useState<'idle' | 'preparing' | 'ready' | 'failed'>('idle');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  useEffect(() => () => { if (imageUrl) URL.revokeObjectURL(imageUrl); }, [imageUrl]);
  useEffect(() => {
    imageMounted.current = true;
    return () => { imageMounted.current = false; };
  }, []);
  const titleId = useId();
  useDialogA11y(ref, closeReport, closeRef);

  const [now] = useState(() => Date.now());
  const report = useMemo(() => (record ? buildReport(record, now) : null), [record, now]);
  const [copy, setCopy] = useState<CopyState>('idle');

  const doCopy = async () => {
    if (!report) return;
    const text = reportToText(report);
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(text);
      setCopy('copied');
    } catch {
      const ok = legacyCopy(text);
      copyRef.current?.focus({ preventScroll: true });
      setCopy(ok ? 'copied' : 'failed');
    }
  };

  const imageName = `순환계-학습결과-${fmtDate(now).slice(0, 10).replaceAll('.', '-')}.png`;
  const doDownloadImage = async () => {
    const sheet = ref.current?.querySelector<HTMLElement>('article.report-sheet');
    if (!sheet || imageBusy.current) return;
    imageBusy.current = true;
    setImageStatus('preparing');
    setImageUrl(null);
    try {
      const { renderReportImage } = await import('../../report/reportImage');
      const blob = await renderReportImage(sheet);
      if (!imageMounted.current) return;
      const url = URL.createObjectURL(blob);
      setImageUrl(url);
      setImageStatus('ready');
      const link = document.createElement('a');
      link.href = url;
      link.download = imageName;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      setImageStatus('failed');
    } finally {
      imageBusy.current = false;
    }
  };

  const rootClass = ['report-root', largeText ? 'is-large-text' : '', reduceMotion ? 'is-reduced-motion' : ''].filter(Boolean).join(' ');

  return (
    <div className={rootClass}>
      <div ref={ref} className="report-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="report-toolbar" role="toolbar" aria-label="보고서 도구">
          <span className="report-toolbar-title" aria-hidden="true">
            <Icon name="report" size={20} />
            학습 결과
          </span>
          <div className="report-toolbar-btns">
            <button type="button" className="btn btn-small" onClick={doDownloadImage} disabled={!report || imageStatus === 'preparing'} aria-busy={imageStatus === 'preparing'}>
              <Icon name="report" size={18} />
              {imageStatus === 'preparing' ? '이미지 만드는 중…' : '이미지 다운로드'}
            </button>
            <button type="button" className="btn btn-small" onClick={() => window.print()} disabled={!report}>
              <Icon name="report" size={18} />
              인쇄
            </button>
            <button ref={copyRef} type="button" className="btn btn-small" onClick={doCopy} disabled={!report}>
              <Icon name="book" size={18} />
              결과 텍스트 복사
            </button>
            <button ref={closeRef} type="button" className="btn btn-primary btn-small" onClick={closeReport}>
              <Icon name="close" size={18} />
              닫기
            </button>
          </div>
          <p className="report-copy-msg" aria-live="polite">
            {imageStatus === 'preparing' && '보고서 전체를 PNG 이미지로 만들고 있어요. 잠시 기다려 주세요.'}
            {imageStatus === 'failed' && '이미지 저장을 완료하지 못했어요. 이미지 다운로드를 다시 눌러 주세요.'}
            {imageStatus === 'ready' && imageUrl && <a href={imageUrl} download={imageName}>PNG 이미지 저장 · 자동으로 저장되지 않았다면 눌러 주세요.</a>}
            {copy === 'copied' && '결과 텍스트를 복사했어요. 원하는 곳에 붙여 넣으세요.'}
            {copy === 'failed' && '자동 복사가 되지 않았어요. 아래 상자의 글을 직접 선택해서 복사해 주세요.'}
          </p>
        </div>

        {copy === 'failed' && report && (
          <div className="report-sheet report-fallback no-print">
            <label htmlFor={`${titleId}-text`} className="report-fallback-label">
              결과 텍스트(전체 선택: Ctrl+A, 복사: Ctrl+C)
            </label>
            <textarea id={`${titleId}-text`} readOnly value={reportToText(report)} rows={8} onFocus={(e) => e.currentTarget.select()} />
          </div>
        )}

        {report && record ? (
          <ReportSheet report={report} record={record} archived={archived} titleId={titleId} />
        ) : (
          <div className="report-sheet">
            <h1 id={titleId} className="report-title">
              아직 결과가 없어요
            </h1>
            <p>탐험을 시작하면 응답과 학습 상태가 이 기기에 기록되고, 여기에서 학습 진단 보고서를 볼 수 있어요.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 보고서 본문 ──────────────────────────────────────────────────

const STATUS_ORDER: QuestionStatus[] = ['first-correct', 'hint-correct', 'wrong-then-solved', 'needs-review', 'unchecked'];

function stepLabelFor(report: Report, record: LearningRecord, questionId: string): string {
  const item = report.wrongItems.find((i) => i.questionId === questionId);
  if (item) return item.label;
  const step = ROUTE.find((s) => s.questionId === questionId);
  if (!step) return '어느 단계';
  if (step.kind === 'review') return `복습 ${step.order}`;
  const solved = record.escaped || !!record.latest[questionId]?.solved;
  return `${step.order}단계 · ${solved ? step.solvedName : '아직 밝혀내지 못한 구역'}`;
}

function ReportSheet({ report, record, archived, titleId }: { report: Report; record: LearningRecord; archived: boolean; titleId: string }) {
  const r = report;
  return (
    <article className="report-sheet">
      <header className="report-head">
        <p className="report-kicker">《순환계 방탈출: 수연쌤과 혈관 탐험》 학습 진단 보고서</p>
        <h1 id={titleId} className="report-title">
          <span aria-hidden="true">{r.complete ? '🎉 ' : '🧭 '}</span>
          {r.title}
          {archived && <span className="report-chip">지난 기록</span>}
        </h1>
        <p className="report-meta">
          작성 {fmtDate(r.generatedAt)} · 탐험 시작 {fmtDate(r.startedAt)} · 탐험 시간 약 {r.elapsedMinutes}분
        </p>
        <p className="report-lead">
          이 보고서는 점수가 아니라 <strong>어떤 개념을 다시 보면 좋을지</strong> 알려 주는 학습 진단 기록이에요. 틀렸던 문제는 오답노트로 정리해
          보세요.
        </p>
      </header>

      <section className="report-section" aria-labelledby={`${titleId}-sum`}>
        <h2 id={`${titleId}-sum`}>한눈에 보기</h2>
        <div className="report-summary">
          <div className="report-stat">
            <span className="report-stat-label">핵심 단계 해결</span>
            <strong className="report-stat-value">
              {r.core.solved}/{r.core.total}
            </strong>
          </div>
          <div className="report-stat">
            <span className="report-stat-label">복습 응답</span>
            <strong className="report-stat-value">
              {r.review.answered}/{r.review.total}
            </strong>
            <span className="report-stat-sub">처음부터 정답 {r.review.correctFirst}</span>
          </div>
          <div className="report-stat">
            <span className="report-stat-label">출발점으로 돌아간 횟수</span>
            <strong className="report-stat-value">{r.restartCount}회</strong>
          </div>
          <div className="report-stat">
            <span className="report-stat-label">사용한 힌트</span>
            <strong className="report-stat-value">{r.totalHints}개</strong>
          </div>
        </div>
        <ul className="report-status-counts" aria-label="핵심 단계 학습 상태별 개수">
          {STATUS_ORDER.map((s) => (
            <li key={s}>
              <StatusBadge status={s} />
              <strong>{r.core[s]}</strong>
            </li>
          ))}
        </ul>
      </section>

      <section className="report-section report-map-section" aria-labelledby={`${titleId}-map`}>
        <h2 id={`${titleId}-map`}>나의 순환계 지도</h2>
        <CirculationMap
          record={record}
          currentNode={null}
          currentLabel={null}
          mode={r.complete ? 'complete' : 'play'}
          showCirculation={r.complete}
          label={r.complete ? '완성한 순환계 지도' : '지금까지 밝혀낸 순환계 지도'}
        />
        {!r.complete && <p className="report-note">아직 해결하지 않은 구역은 지도에 나타나지 않아요.</p>}
      </section>

      <section className="report-section" aria-labelledby={`${titleId}-zones`}>
        <h2 id={`${titleId}-zones`}>구역별 학습 상태</h2>
        <StatusLegend className="report-legend" />
        <div className="report-table-wrap">
          <table className="report-table">
            <caption className="visually-hidden">핵심 10단계의 처음 응답 결과와 학습 상태</caption>
            <thead>
              <tr>
                <th scope="col">단계</th>
                <th scope="col">구역</th>
                <th scope="col">학습 상태</th>
                <th scope="col">시도</th>
              </tr>
            </thead>
            <tbody>
              {r.zones.map((z) => (
                <tr key={z.stepId} className={`is-${z.status}`}>
                  <td>{z.order}단계</td>
                  <td>{z.name}</td>
                  <td>
                    <StatusBadge status={z.status} />
                    {z.reasonOnly && <span className="report-flag">위치는 맞혔지만 근거 확인이 필요함</span>}
                  </td>
                  <td>{z.attempts > 0 ? `${z.attempts}번` : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 className="report-h3">복습(보너스 관찰) — 오답 수에 포함되지 않아요</h3>
        <div className="report-table-wrap">
          <table className="report-table">
            <caption className="visually-hidden">복습 6개의 처음 응답 결과</caption>
            <thead>
              <tr>
                <th scope="col">복습</th>
                <th scope="col">학습 상태</th>
                <th scope="col">시도</th>
              </tr>
            </thead>
            <tbody>
              {r.reviewRows.map((z) => (
                <tr key={z.stepId}>
                  <td>{z.status === 'unchecked' ? `복습 ${z.order} · 아직 만나지 않은 관찰` : z.name}</td>
                  <td>
                    <StatusBadge status={z.status} />
                    {z.reasonOnly && <span className="report-flag">이름은 맞혔지만 역할 확인이 필요함</span>}
                  </td>
                  <td>{z.attempts > 0 ? `${z.attempts}번` : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="report-section" aria-labelledby={`${titleId}-wrong`}>
        <h2 id={`${titleId}-wrong`}>틀렸던 문제 다시 보기</h2>
        {r.wrongItems.length === 0 ? (
          <p className="report-empty">처음 응답에서 틀린 문제가 없어요. 단서를 꼼꼼히 살펴본 덕분이에요!</p>
        ) : (
          <div className="report-cards">
            {r.wrongItems.map((it) => (
              <WrongCard key={it.questionId} item={it} />
            ))}
          </div>
        )}
      </section>

      <section className="report-section" aria-labelledby={`${titleId}-concepts`}>
        <h2 id={`${titleId}-concepts`}>보충할 개념</h2>
        {r.conceptGroups.length === 0 ? (
          <p className="report-empty">보충이 필요한 개념이 발견되지 않았어요.</p>
        ) : (
          <div className="report-cards">
            {r.conceptGroups.map((g) => (
              <article key={g.concept.id} className="report-card is-concept">
                <h3 className="report-card-title">{g.concept.name}</h3>
                <p>{g.concept.explanation}</p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="report-section" aria-labelledby={`${titleId}-hints`}>
        <h2 id={`${titleId}-hints`}>힌트 사용</h2>
        <p className="report-note is-strong">힌트 사용은 개념을 모른다는 뜻이 아니에요. 단서를 더 찾아보며 스스로 생각한 기록이에요.</p>
        {r.hintItems.length === 0 ? (
          <p className="report-empty">힌트를 사용하지 않았어요.</p>
        ) : (
          <ul className="report-list">
            {r.hintItems.map((h) => (
              <li key={h.label}>
                <span>{h.label}</span> <span className="report-chip">힌트 {h.hints}개</span> <StatusBadge status={h.status} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="report-section" aria-labelledby={`${titleId}-returns`}>
        <h2 id={`${titleId}-returns`}>출발점으로 돌아간 기록</h2>
        <p>
          한 탐험에서 오답이 {r.maxWrong + 1}번째가 되면 출발점으로 돌아가요. 돌아가도 처음 고른 답과 학습 기록은 모두 남아 있어요.
        </p>
        {r.returnLog.length === 0 ? (
          <p className="report-empty">출발점으로 돌아간 적이 없어요. (지금 탐험 {r.runId}번째 · 이번 탐험 오답 {r.runWrong}개)</p>
        ) : (
          <ol className="report-list">
            {r.returnLog.map((e, i) => (
              <li key={`${e.at}-${i}`}>
                {fmtDate(e.at)} · {e.fromRunId}번째 탐험 · {stepLabelFor(r, record, e.atQuestionId)}에서 출발점으로 돌아감
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="report-section" aria-labelledby={`${titleId}-act`}>
        <h2 id={`${titleId}-act`}>허파순환·온몸순환 범위 활동</h2>
        <p>
          {r.activity.attempts === 0
            ? '아직 하지 않았어요. 한 바퀴를 모두 돌면 완성된 지도에서 두 순환의 범위를 골라 봐요.'
            : r.activity.solved
              ? r.activity.firstCorrect
                ? '✓ 처음부터 두 순환의 범위를 모두 맞혔어요.'
                : `↻ 다시 생각한 뒤 두 순환의 범위를 맞혔어요. (모두 ${r.activity.attempts}번 제출)`
              : `진행 중이에요. (지금까지 ${r.activity.attempts}번 제출)`}
        </p>
      </section>

      <section className="report-section" aria-labelledby={`${titleId}-explain`}>
        {r.complete ? (
          <ExplainActivity record={record} showMap={false} headingId={`${titleId}-explain`} />
        ) : (
          <>
            <h2 id={`${titleId}-explain`}>30초 설명 활동</h2>
            <p className="report-note">
              <strong>질문</strong> {EXPLAIN_ACTIVITY.question}
            </p>
            <p className="report-note">탈출에 성공하면 완성된 지도를 보며 짝이나 선생님께 30초 동안 말로 설명해 보세요.</p>
          </>
        )}
      </section>

      <footer className="report-foot">
        이 보고서에는 이름 같은 개인 정보가 없어요. 이 기기의 브라우저에 저장된 기록으로 만들었으며, 어디에도 전송되지 않아요.
      </footer>
    </article>
  );
}

function WrongCard({ item: it }: { item: ReportItem }) {
  return (
    <article className={`report-card is-${it.status}`}>
      <p className="report-prompt">
        <strong>문제</strong> {it.prompt}
      </p>
      <dl className="report-dl">
        <dt>나의 첫 답</dt>
        <dd>
          <span className={`report-answer ${it.firstAnswerCorrect ? 'is-ok' : 'is-no'}`}>
            {it.answerLabel}: {it.firstAnswerText} <span className="report-answer-mark">{it.firstAnswerCorrect ? '(맞음 ✓)' : '(다시 확인 ✗)'}</span>
          </span>
          <span className="report-sep" aria-hidden="true">
            {' / '}
          </span>
          <span className={`report-answer ${it.firstReasonCorrect ? 'is-ok' : 'is-no'}`}>
            {it.reasonLabel}: {it.firstReasonText} <span className="report-answer-mark">{it.firstReasonCorrect ? '(맞음 ✓)' : '(다시 확인 ✗)'}</span>
          </span>
        </dd>
        <dt>정답</dt>
        <dd>
          {it.correctAnswerText ? (
            <>
              {it.answerLabel}: {it.correctAnswerText} / {it.reasonLabel}: {it.correctReasonText}
            </>
          ) : (
            <span className="report-hidden-answer">(해결하면 공개됩니다)</span>
          )}
        </dd>
        {it.explanation && (
          <>
            <dt>정답 설명</dt>
            <dd>{it.explanation}</dd>
          </>
        )}
      </dl>
    </article>
  );
}
