// 응답 후 설명(퀴즈와 같은 자리). 자동으로 넘어가지 않는다.
// 핵심 문항 오답에서는 정답 선택지를 절대 보여 주지 않는다. 말투는 친절하게, 비난하지 않는다.

import { useEffect, useRef } from 'react';
import { GAME_CONFIG } from '../../data/config';
import { ANSWER_ONLY_OPENER, REASON_ONLY_OPENER, WRONG_OPENERS } from '../../data/dialogue';
import { getQuestion } from '../../data/questions';
import { ROUTE } from '../../data/route';
import type { Mood, Question, RouteStep } from '../../data/types';
import { choiceText, stepAt } from '../../state/selectors';
import { useApp } from '../../state/store';
import type { FeedbackInfo } from '../../state/types';
import { HeartIcon, Icon } from '../controls/Icon';
import { Portrait } from '../dialogue/Portrait';
import './Quiz.css';

const MAX_WRONG = GAME_CONFIG.maxWrongPerRun;
const REVIEW_WRONG_LINE = '괜찮아! 보너스 복습이니까 같이 정리해 보자.';

export function FeedbackPanel() {
  const game = useApp((s) => s.game);
  if (!game || game.phase !== 'feedback' || !game.feedback) return null;
  const fb = game.feedback;
  const step = stepAt(game);
  return (
    <FeedbackCard
      key={`${game.runId}|${fb.questionId}|${fb.attemptIndex}`}
      fb={fb}
      step={step}
      isLastStep={game.stepIndex >= ROUTE.length - 1}
    />
  );
}

/** 고른 선택지 각각에 대한 오개념 설명(같은 문장은 한 번만) */
function misconceptionTexts(q: Question, fb: FeedbackInfo): string[] {
  const out: string[] = [];
  const add = (id: string) => {
    const t = q.misconceptionFeedback[id];
    if (t && !out.includes(t)) out.push(t);
  };
  if (!fb.answerCorrect) add(fb.selectedAnswer);
  if (!fb.reasonCorrect) add(fb.selectedReason);
  return out;
}

function coreWrongOpener(fb: FeedbackInfo): string {
  if (fb.answerCorrect && !fb.reasonCorrect) return REASON_ONLY_OPENER;
  if (!fb.answerCorrect && fb.reasonCorrect) return ANSWER_ONLY_OPENER;
  return WRONG_OPENERS[Math.max(0, fb.attemptIndex - 1) % WRONG_OPENERS.length];
}

function Speech({ mood, text }: { mood: Mood; text: string }) {
  return (
    <div className="fb-speech">
      <Portrait speaker="suyeon" mood={mood} decorative />
      <p className="fb-speech-text">
        <span className="fb-speaker">수연쌤</span>
        {text}
      </p>
    </div>
  );
}

/** 위치·근거 각각 맞았는지(아이콘 + 글자) */
function CheckLines({ q, fb, answerLabel, reasonLabel }: { q: Question; fb: FeedbackInfo; answerLabel: string; reasonLabel: string }) {
  const rows = [
    { label: answerLabel, ok: fb.answerCorrect, picked: choiceText(q, fb.selectedAnswer) },
    { label: reasonLabel, ok: fb.reasonCorrect, picked: choiceText(q, fb.selectedReason) },
  ];
  return (
    <ul className="fb-checks">
      {rows.map((r) => (
        <li key={r.label} className={r.ok ? 'is-ok' : 'is-retry'}>
          <span className="fb-check-icon" aria-hidden="true">
            <Icon name={r.ok ? 'check' : 'retry'} size={18} />
          </span>
          <span className="fb-check-body">
            <strong>
              {r.label}: {r.ok ? '맞았어요' : '다시 생각해 봐요'}
            </strong>
            <span className="fb-picked">내 선택: {r.picked}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function RunCounter({ runWrong }: { runWrong: number }) {
  const remaining = Math.max(0, MAX_WRONG - runWrong);
  return (
    <div className="fb-counter">
      <span className="hud-hearts" role="img" aria-label={`남은 기회 ${remaining}개`}>
        {Array.from({ length: MAX_WRONG }, (_, i) => (
          <HeartIcon key={i} full={i < remaining} />
        ))}
      </span>
      <span>
        <strong>
          현재 탐험의 오답 {Math.min(runWrong, MAX_WRONG)}/{MAX_WRONG}
        </strong>
        <span className="fb-counter-note">
          {' '}
          · 남은 기회 {remaining} · {MAX_WRONG + 1}번째 오답이면 출발점으로 돌아가요
        </span>
      </span>
    </div>
  );
}

interface CardProps {
  fb: FeedbackInfo;
  step: RouteStep;
  isLastStep: boolean;
}

function FeedbackCard({ fb, step, isLastStep }: CardProps) {
  const continueAfterFeedback = useApp((s) => s.continueAfterFeedback);
  const backToObserve = useApp((s) => s.backToObserve);
  const setMapOpen = useApp((s) => s.setMapOpen);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const q = getQuestion(fb.questionId);
  const misc = misconceptionTexts(q, fb);

  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, []);

  // ── 복습(보너스): 맞든 틀리든 정답 이름과 역할을 보여 준다 ──
  if (fb.kind === 'review') {
    return (
      <section className="feedback panel is-review" aria-labelledby="fb-title">
        <h2 id="fb-title" ref={titleRef} tabIndex={-1} className="fb-title">
          <span className="fb-badge is-bonus">
            <Icon name="star" size={18} filled />
            보너스 복습
          </span>
          {fb.isCorrect ? '정답이에요!' : '함께 정리해요'}
        </h2>
        <Speech mood={fb.isCorrect ? 'cheer' : 'smile'} text={fb.isCorrect ? q.correctLine : REVIEW_WRONG_LINE} />
        <div className="fb-answer">
          <p className="fb-answer-title">정답</p>
          <p>
            <strong>{q.answerLabel}:</strong> {choiceText(q, q.correctAnswer)}
          </p>
          <p>
            <strong>{q.reasonLabel}:</strong> {choiceText(q, q.correctReason)}
          </p>
        </div>
        <CheckLines q={q} fb={fb} answerLabel={q.answerLabel} reasonLabel={q.reasonLabel} />
        <div className="fb-explain">
          <p>{q.explanation}</p>
        </div>
        {!fb.isCorrect &&
          misc.map((t) => (
            <p key={t} className="fb-misc">
              {t}
            </p>
          ))}
        {!fb.isCorrect && (
          <p className="fb-note">
            <Icon name="book" size={18} />
            오답 수에는 영향이 없고, 보충 개념으로 기록했어요
          </p>
        )}
        <div className="fb-actions">
          <button type="button" className="btn btn-primary" onClick={continueAfterFeedback}>
            계속 ▶
          </button>
        </div>
      </section>
    );
  }

  // ── 핵심 문항 정답 ──
  if (fb.isCorrect) {
    return (
      <section className="feedback panel is-correct" aria-labelledby="fb-title">
        <h2 id="fb-title" ref={titleRef} tabIndex={-1} className="fb-title">
          <span className="fb-badge is-correct">
            <Icon name="check" size={18} />
            정답
          </span>
          추론 성공!
        </h2>
        <Speech mood="cheer" text={q.correctLine} />
        <CheckLines q={q} fb={fb} answerLabel="위치(이름)" reasonLabel="근거" />
        <div className="fb-explain">
          <p>{q.explanation}</p>
        </div>
        {step.reveals.length > 0 && (
          <div className="fb-map-note">
            <Icon name="map" />
            <span>지도에 새 구역이 표시되었어요</span>
            <button type="button" className="btn btn-ghost" onClick={() => setMapOpen(true)}>
              지도 보기
            </button>
          </div>
        )}
        <div className="fb-actions">
          <button type="button" className="btn btn-primary" onClick={continueAfterFeedback}>
            {isLastStep ? '출발점에 도착! 계속 ▶' : '다음 구역으로 출발 ▶'}
          </button>
        </div>
      </section>
    );
  }

  // ── 핵심 문항 오답(정답 선택지는 보여 주지 않는다) ──
  const opener = coreWrongOpener(fb);
  if (fb.triggeredReturn) {
    return (
      <section className="feedback panel is-return" aria-labelledby="fb-title">
        <h2 id="fb-title" ref={titleRef} tabIndex={-1} className="fb-title">
          <span className="fb-badge is-return">
            <Icon name="home" size={18} />
            출발점으로
          </span>
          다시 차근차근!
        </h2>
        <Speech mood="worried" text={opener} />
        <CheckLines q={q} fb={fb} answerLabel="위치(이름)" reasonLabel="근거" />
        {misc.map((t) => (
          <p key={t} className="fb-misc">
            {t}
          </p>
        ))}
        <p className="fb-return">
          이번 탐험의 {MAX_WRONG + 1}번째 오답이에요. 출발점으로 돌아가지만, 기록은 모두 남아 있어요.
        </p>
        <div className="fb-actions">
          <button type="button" className="btn btn-primary" onClick={continueAfterFeedback}>
            <Icon name="home" />
            출발점으로 돌아가기
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="feedback panel is-wrong" aria-labelledby="fb-title">
      <h2 id="fb-title" ref={titleRef} tabIndex={-1} className="fb-title">
        <span className="fb-badge is-retry">
          <Icon name="retry" size={18} />
          다시 생각해 보기
        </span>
        한 번 더 추론해요
      </h2>
      <Speech mood="open" text={opener} />
      <CheckLines q={q} fb={fb} answerLabel="위치(이름)" reasonLabel="근거" />
      {misc.map((t) => (
        <p key={t} className="fb-misc">
          {t}
        </p>
      ))}
      {q.extraClue && (
        <p className="fb-extra">
          <Icon name="search" size={18} />
          <span>
            <strong>추가 단서: </strong>
            {q.extraClue}
          </span>
        </p>
      )}
      <RunCounter runWrong={fb.runWrongAfter} />
      <div className="fb-actions">
        <button type="button" className="btn btn-secondary" onClick={backToObserve}>
          <Icon name="search" />
          단서 다시 보기
        </button>
        <button type="button" className="btn btn-primary" onClick={continueAfterFeedback}>
          <Icon name="retry" />
          다시 추론하기
        </button>
      </div>
    </section>
  );
}
