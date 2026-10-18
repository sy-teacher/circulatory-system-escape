// 추론 문항(오른쪽 패널, 좁은 화면에서는 아래쪽 시트).
// 선택지는 표시 순서가 아니라 id로 제출한다. 제출 전에는 자유롭게 바꿀 수 있다.

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { getQuestion } from '../../data/questions';
import { CORE_STEPS } from '../../data/route';
import type { Choice, Question, RouteStep } from '../../data/types';
import { optionOrder, stepAt } from '../../state/selectors';
import { useApp } from '../../state/store';
import { Icon } from '../controls/Icon';
import './Quiz.css';

/** 선택지 앞 표시(순서 표시일 뿐 채점과 무관) */
const MARKS = ['가', '나', '다', '라', '마', '바', '사', '아'];

/** 접거나 단서를 다시 보러 가도 고른 답을 기억해 둔다(같은 시도 안에서만) */
const drafts = new Map<string, { answer: string | null; reason: string | null }>();

export function QuizPanel() {
  const game = useApp((s) => s.game);
  if (!game || game.phase !== 'question') return null;
  const step = stepAt(game);
  const q = getQuestion(step.questionId);
  const attempt = (game.latest[q.id]?.attempts ?? 0) + 1;
  const formKey = `${game.sessionId}|${q.id}|${game.runId}|${attempt}`;
  const order = optionOrder(game, q.id);
  return <QuizForm key={formKey} formKey={formKey} q={q} step={step} answerIds={order.answers} reasonIds={order.reasons} />;
}

interface FormProps {
  formKey: string;
  q: Question;
  step: RouteStep;
  answerIds: string[];
  reasonIds: string[];
}

function QuizForm({ formKey, q, step, answerIds, reasonIds }: FormProps) {
  const hintsRevealed = useApp((s) => s.game?.hintsRevealed[q.id] ?? 0);
  const collapsed = useApp((s) => s.quizCollapsed);
  const setQuizCollapsed = useApp((s) => s.setQuizCollapsed);
  const revealHint = useApp((s) => s.revealHint);
  const backToObserve = useApp((s) => s.backToObserve);
  const submitAnswer = useApp((s) => s.submitAnswer);

  const draft = drafts.get(formKey);
  const [answer, setAnswer] = useState<string | null>(draft?.answer ?? null);
  const [reason, setReason] = useState<string | null>(draft?.reason ?? null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  const titleRef = useRef<HTMLHeadingElement>(null);
  const reopenRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    drafts.set(formKey, { answer, reason });
  }, [formKey, answer, reason]);

  // 처음 열릴 때는 질문으로, 접고 펼 때는 해당 버튼·질문으로 포커스를 옮긴다.
  useEffect(() => {
    if (collapsed) reopenRef.current?.focus({ preventScroll: true });
    else titleRef.current?.focus({ preventScroll: true });
  }, [collapsed]);

  const isReview = q.kind === 'review';
  const ready = !!answer && !!reason;
  const totalHints = q.hints.length;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!answer || !reason || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    drafts.delete(formKey);
    submitAnswer({ questionId: q.id, answerId: answer, reasonId: reason });
  };

  return (
    <section className={`quiz panel${collapsed ? ' is-collapsed' : ''}${isReview ? ' is-review' : ''}`} aria-labelledby="quiz-title">
      {collapsed && (
        <div className="quiz-mini">
          <p className="quiz-mini-status">
            <span>추론 중</span>
            <span>
              {answer ? '✓' : '○'} {q.answerLabel}
            </span>
            <span>
              {reason ? '✓' : '○'} {q.reasonLabel}
            </span>
          </p>
          <button ref={reopenRef} type="button" className="btn btn-primary" onClick={() => setQuizCollapsed(false)}>
            <Icon name="up" />
            추론 이어서 하기
          </button>
        </div>
      )}

      <div className="quiz-inner" hidden={collapsed}>
        <div className="quiz-head">
          <p className={`quiz-kind${isReview ? ' is-review' : ''}`}>
            {isReview ? (
              <>
                <Icon name="star" size={18} filled />
                보너스 복습 — 틀려도 오답 수가 늘지 않아요
              </>
            ) : (
              <>
                <Icon name="hint" size={18} />
                핵심 추론 {step.order}/{CORE_STEPS.length} · 위치와 근거를 함께 골라요
              </>
            )}
          </p>
          <button type="button" className="btn btn-ghost quiz-collapse" onClick={() => setQuizCollapsed(true)}>
            <Icon name="down" size={20} />
            관찰하러 잠시 접기
          </button>
        </div>

        <h2 id="quiz-title" ref={titleRef} tabIndex={-1} className="quiz-prompt">
          {q.prompt}
        </h2>

        <form className="quiz-form" onSubmit={onSubmit}>
          <ChoiceGroup name={`${formKey}|a`} legend={q.answerLabel} ids={answerIds} choices={q.options} value={answer} onChange={setAnswer} />
          <ChoiceGroup name={`${formKey}|r`} legend={q.reasonLabel} ids={reasonIds} choices={q.reasonOptions} value={reason} onChange={setReason} />

          <div className="quiz-hints">
            <div className="quiz-hint-bar">
              <button
                type="button"
                className="btn btn-ghost quiz-hint-btn"
                disabled={hintsRevealed >= totalHints}
                onClick={() => revealHint(q.id)}
              >
                <Icon name="hint" />
                {hintsRevealed >= totalHints ? '힌트를 모두 열었어요' : `힌트 보기 (${hintsRevealed}/${totalHints})`}
              </button>
              <span className="quiz-hint-note">힌트를 써도 오답 수는 늘지 않아요</span>
            </div>
            <ol className="quiz-hint-list" aria-live="polite">
              {q.hints.slice(0, hintsRevealed).map((h, i) => (
                <li key={i}>
                  <strong>힌트 {i + 1}</strong> {h}
                </li>
              ))}
            </ol>
          </div>

          {!ready && (
            <p className="quiz-need">
              ‘{q.answerLabel}’과 ‘{q.reasonLabel}’에서 하나씩 고르면 제출할 수 있어요.
            </p>
          )}
          <div className="quiz-actions">
            <button type="button" className="btn btn-ghost" onClick={backToObserve}>
              <Icon name="search" />
              단서 다시 보기
            </button>
            <button type="submit" className="btn btn-primary quiz-submit" disabled={!ready || submitting}>
              {submitting ? '제출 중…' : '제출'}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

interface GroupProps {
  name: string;
  legend: string;
  ids: string[];
  choices: Choice[];
  value: string | null;
  onChange: (id: string) => void;
}

function ChoiceGroup({ name, legend, ids, choices, value, onChange }: GroupProps) {
  return (
    <fieldset className="quiz-group">
      <legend className="quiz-legend">
        {legend}
        <span className="quiz-legend-state">{value ? '✓ 골랐어요' : '하나를 골라요'}</span>
      </legend>
      <div className="quiz-options">
        {ids.map((id, i) => {
          const c = choices.find((o) => o.id === id);
          if (!c) return null;
          const checked = value === id;
          return (
            <label key={id} className={`quiz-option${checked ? ' is-checked' : ''}`}>
              <input type="radio" name={name} value={id} checked={checked} onChange={() => onChange(id)} />
              <span className="quiz-option-mark" aria-hidden="true">
                {MARKS[i] ?? i + 1}
              </span>
              <span className="quiz-option-text">{c.text}</span>
              {checked && (
                <span className="quiz-option-check" aria-hidden="true">
                  <Icon name="check" size={18} />
                </span>
              )}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
