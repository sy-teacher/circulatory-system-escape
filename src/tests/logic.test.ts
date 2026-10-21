// 게임 규칙(src/state/logic.ts) 자동 검증. 실제 데이터와 실제 규칙 함수만 사용한다(모의 객체 없음).

import { describe, expect, it } from 'vitest';
import { getConcept } from '../data/concepts';
import { GAME_CONFIG } from '../data/config';
import { CIRCULATION_ACTIVITY, getQuestion } from '../data/questions';
import { ROUTE, STEP_MAP } from '../data/route';
import type { NodeId, Question } from '../data/types';
import * as L from '../state/logic';
import { optionOrder, questionStatus, recheckConceptIds } from '../state/selectors';
import type { GameState, LearningRecord } from '../state/types';

// ── 도움 함수 ───────────────────────────────────────────────

let clock = 1_000;
const tick = () => (clock += 10);
const MAX = GAME_CONFIG.maxWrongPerRun;
const P: NodeId[] = [...CIRCULATION_ACTIVITY.pulmonary];
const S: NodeId[] = [...CIRCULATION_ACTIVITY.systemic];
const idxOf = (stepId: string) => ROUTE.findIndex((s) => s.id === stepId);

/** 현재 대화를 끝까지 넘긴다 */
function drain(g: GameState, rules?: L.RuleOptions): GameState {
  for (let guard = 0; g.dialogue && guard < 100; guard++) g = L.advanceDialogue(g, rules, tick());
  expect(g.dialogue).toBeNull();
  return g;
}

/** 대화·이동(기억한 구역 포함)을 넘겨 학생이 직접 해야 할 일(관찰·활동 등)에서 멈춘다 */
function settle(g: GameState, rules?: L.RuleOptions): GameState {
  for (let guard = 0; guard < 300; guard++) {
    if (g.dialogue) g = L.advanceDialogue(g, rules, tick());
    else if (g.phase === 'travel') g = L.arrive(g, tick());
    else return g;
  }
  throw new Error('진행이 멈추지 않음');
}

function startGame(sessionId = 'logic-test'): GameState {
  const g = settle(L.newGame(sessionId, 0));
  expect(g.phase).toBe('observe');
  expect(L.currentStep(g).id).toBe('S1');
  return g;
}

const currentQ = (g: GameState): Question => getQuestion(L.currentStep(g).questionId);

/** 모든 단서를 확인하고 추론 화면을 연다 */
function toQuestion(g: GameState): GameState {
  if (g.phase === 'question') return g;
  const step = L.currentStep(g);
  for (const c of step.clues) {
    if (L.canInfer(g)) break;
    g = L.observeClue(g, c.id, tick());
  }
  g = L.openQuestion(g, tick());
  expect(g.phase).toBe('question');
  return g;
}

type Mode = 'correct' | 'wrong' | 'reasonOnly' | 'answerOnly';

function wrongIds(q: Question) {
  return {
    answers: q.options.filter((o) => o.id !== q.correctAnswer).map((o) => o.id),
    reasons: q.reasonOptions.filter((o) => o.id !== q.correctReason).map((o) => o.id),
  };
}

/** n: 몇 번째 오답 선택지를 고를지(시도마다 다른 오답을 고르게) */
function sub(q: Question, mode: Mode, n = 0): L.Submission {
  const w = wrongIds(q);
  const wa = w.answers[n % w.answers.length];
  const wr = w.reasons[n % w.reasons.length];
  switch (mode) {
    case 'correct':
      return { questionId: q.id, answerId: q.correctAnswer, reasonId: q.correctReason };
    case 'wrong':
      return { questionId: q.id, answerId: wa, reasonId: wr };
    case 'reasonOnly':
      return { questionId: q.id, answerId: q.correctAnswer, reasonId: wr };
    case 'answerOnly':
      return { questionId: q.id, answerId: wa, reasonId: q.correctReason };
  }
}

function answer(g: GameState, mode: Mode, n = 0, rules?: L.RuleOptions): GameState {
  g = toQuestion(g);
  const next = L.submitAnswer(g, sub(currentQ(g), mode, n), tick(), rules);
  expect(next.phase).toBe('feedback');
  return next;
}

function submitIds(g: GameState, answerId: string, reasonId: string, rules?: L.RuleOptions): GameState {
  g = toQuestion(g);
  const next = L.submitAnswer(g, { questionId: currentQ(g).id, answerId, reasonId }, tick(), rules);
  expect(next.phase).toBe('feedback');
  return next;
}

function proceed(g: GameState, rules?: L.RuleOptions): GameState {
  return settle(L.continueAfterFeedback(g, rules, tick()), rules);
}

const solve = (g: GameState, rules?: L.RuleOptions) => proceed(answer(g, 'correct', 0, rules), rules);

/** 앞 단계를 모두 정답으로 풀며 stepId의 관찰 단계까지 간다 */
function advanceTo(g: GameState, stepId: string): GameState {
  for (let guard = 0; !(L.currentStep(g).id === stepId && (g.phase === 'observe' || g.phase === 'question')); guard++) {
    if (guard > 40 || g.phase === 'activity') throw new Error(`${stepId}에 도착하지 못함`);
    g = solve(g);
  }
  return g;
}

const roundtrip = (g: GameState): LearningRecord => JSON.parse(JSON.stringify(L.toRecord(g))) as LearningRecord;

// ── 오답 규칙과 출발점 귀환 ─────────────────────────────────

describe('오답 규칙: 1~3번째는 계속, 4번째는 출발점 귀환', () => {
  it('핵심 오답 1~3번째는 같은 자리에서 다시 추론하고, 4번째 오답이 귀환을 결정한다', () => {
    let g = startGame();
    g = solve(g); // S1
    g = advanceTo(g, 'S2');
    for (let i = 1; i <= MAX; i++) {
      g = answer(g, 'wrong', i);
      expect(g.phase).toBe('feedback');
      expect(g.feedback).toMatchObject({ isCorrect: false, kind: 'core', runWrongAfter: i, triggeredReturn: false, attemptIndex: i });
      expect(g.runWrong).toBe(i);
      expect(g.pendingReturn).toBe(false);
      g = L.continueAfterFeedback(g, undefined, tick());
      expect(g.phase).toBe('question');
      expect(g.feedback).toBeNull();
      expect(L.currentStep(g).id).toBe('S2');
    }
    g = answer(g, 'wrong', MAX + 1);
    expect(g.feedback).toMatchObject({ isCorrect: false, runWrongAfter: MAX + 1, triggeredReturn: true });
    expect(g.pendingReturn).toBe(true);
    expect(g.runWrong).toBe(MAX + 1);
    // 귀환이 결정되면 단서를 다시 보러 가거나 다시 제출할 수 없다
    expect(L.backToObserve(g, tick())).toBe(g);
    expect(L.submitAnswer(g, sub(currentQ(g), 'correct'), tick())).toBe(g);

    g = L.continueAfterFeedback(g, undefined, tick());
    expect(g.phase).toBe('returning');
    expect(g.dialogue?.kind).toBe('returning');
    expect(g.dialogue?.lines[0].text).toContain(`${MAX + 1}번째 오답`);
    expect(g.stepIndex).toBe(idxOf('S2'));

    g = drain(g);
    expect(g).toMatchObject({ runId: 2, restartCount: 1, runWrong: 0, pendingReturn: false, stepIndex: 0, phase: 'travel' });
    expect(g.travel).toEqual({ from: idxOf('S2'), to: 0, mode: 'teleport', fast: true });
    expect(g.returnLog).toEqual([{ fromRunId: 1, atQuestionId: 'q-s2', at: expect.any(Number) }]);

    // 기록은 남아 있다
    expect(g.responses).toHaveLength(2 + MAX + 1); // S1 + R1 + S2 오답 4번
    expect(g.firstResponses['q-s2']).toMatchObject({ isCorrect: false, attemptIndex: 1, runId: 1 });

    g = L.arrive(g, tick());
    expect(L.currentStep(g).id).toBe('S1');
    expect(g.phase).toBe('remembered');
    expect(g.dialogue?.kind).toBe('remembered');
    expect(g.dialogue?.lines[0].text).toContain(STEP_MAP.S1.solvedName);
  });

  it('S1을 해결하지 못한 채 귀환하면 출발점을 다시 관찰한다', () => {
    let g = startGame();
    for (let i = 0; i < MAX; i++) {
      g = answer(g, 'wrong', i);
      g = L.continueAfterFeedback(g, undefined, tick());
    }
    g = answer(g, 'wrong', MAX);
    expect(g.feedback?.triggeredReturn).toBe(true);
    g = drain(L.continueAfterFeedback(g, undefined, tick()));
    expect(g.phase).toBe('travel');
    g = L.arrive(g, tick());
    expect(g.phase).toBe('arrival');
    expect(g.dialogue?.kind).toBe('arrival');
    g = drain(g);
    expect(g.phase).toBe('observe');
    expect(L.currentStep(g).id).toBe('S1');
  });

  it('오답이 여러 단계에 나뉘어도 합산되고(S2 1 + S3 2 + S4 1), 귀환 후 해결한 구역만 기억한 구역으로 지나간다', () => {
    let g = startGame();
    g = solve(g); // S1
    g = solve(g); // R1
    expect(L.currentStep(g).id).toBe('S2');
    g = answer(g, 'wrong');
    expect(g.runWrong).toBe(1);
    g = solve(L.continueAfterFeedback(g, undefined, tick())); // S2 해결 → R6
    expect(L.currentStep(g).id).toBe('R6');
    g = proceed(answer(g, 'wrong')); // 복습 오답은 오답 수에 포함되지 않는다
    expect(g.runWrong).toBe(1);
    expect(L.currentStep(g).id).toBe('R4');
    g = solve(g);
    expect(L.currentStep(g).id).toBe('S3');
    for (let i = 0; i < 2; i++) {
      g = answer(g, 'wrong', i);
      g = L.continueAfterFeedback(g, undefined, tick());
    }
    expect(g.runWrong).toBe(3);
    g = solve(g); // S3 해결 → S4
    expect(L.currentStep(g).id).toBe('S4');
    g = answer(g, 'reasonOnly');
    expect(g.runWrong).toBe(4);
    expect(g.feedback?.triggeredReturn).toBe(true);
    g = drain(L.continueAfterFeedback(g, undefined, tick()));
    expect(g).toMatchObject({ runId: 2, restartCount: 1, runWrong: 0, stepIndex: 0, phase: 'travel' });
    expect(g.returnLog.map((r) => r.atQuestionId)).toEqual(['q-s4']);

    // 출발점부터 다시: 해결한 구역 → 기억한 구역(빠른 이동), 틀렸던 복습·미해결 구역 → 다시 관찰
    const seen: string[] = [];
    g = L.arrive(g, tick());
    while (L.currentStep(g).id !== 'S4') {
      const step = L.currentStep(g);
      if (g.phase === 'remembered') {
        seen.push(`${step.id}:remembered`);
        g = L.passRemembered(g, tick());
      } else {
        expect(g.phase).toBe('arrival');
        seen.push(`${step.id}:arrival`);
        g = drain(g);
        expect(g.phase).toBe('observe');
        g = drain(L.continueAfterFeedback(answer(g, 'correct'), undefined, tick()));
      }
      expect(g.phase).toBe('travel');
      expect(g.travel?.mode).toBe('path');
      expect(g.travel?.fast).toBe(L.isStepSolved(g, g.stepIndex));
      g = L.arrive(g, tick());
    }
    expect(seen).toEqual(['S1:remembered', 'R1:remembered', 'S2:remembered', 'R6:arrival', 'R4:remembered', 'S3:remembered']);
    expect(g.phase).toBe('arrival');
    g = drain(g);
    expect(g.phase).toBe('observe');
    // 지난 탐험에서 확인한 단서도 기록으로 남아 있다
    expect(L.canInfer(g)).toBe(true);

    g = L.continueAfterFeedback(answer(g, 'correct'), undefined, tick());
    const s4 = g.responses.filter((r) => r.questionId === 'q-s4');
    expect(s4.map((r) => [r.runId, r.attemptIndex, r.isCorrect])).toEqual([
      [1, 1, false],
      [2, 2, true],
    ]);
    // 최초 응답은 그대로
    expect(g.firstResponses['q-s2']).toMatchObject({ isCorrect: false, attemptIndex: 1 });
    expect(g.firstResponses['q-s4']).toMatchObject({ isCorrect: false, answerCorrect: true, reasonCorrect: false, runId: 1 });
    expect(g.firstResponses['q-r6']).toMatchObject({ isCorrect: false, kind: 'review' });
    expect(g.latest['q-r6']).toMatchObject({ solved: true, attempts: 2, solvedRunId: 2 });
    expect(questionStatus(g, 'q-r6')).toBe('wrong-then-solved');
  });

  it('교사 설정(maxWrongPerRun)을 바꾸면 귀환 시점과 안내 대사도 바뀐다', () => {
    const rules: L.RuleOptions = { maxWrongPerRun: 1 };
    let g = startGame();
    g = answer(g, 'wrong', 0, rules);
    expect(g.feedback?.triggeredReturn).toBe(false);
    g = L.continueAfterFeedback(g, rules, tick());
    g = answer(g, 'wrong', 1, rules);
    expect(g.feedback?.triggeredReturn).toBe(true);
    g = L.continueAfterFeedback(g, rules, tick());
    expect(g.dialogue?.lines[0].text).toContain('2번째 오답');
    g = drain(g, rules);
    expect(g.runId).toBe(2);
  });
});

// ── 응답 기록 ───────────────────────────────────────────────

describe('응답 기록', () => {
  it('최초 응답은 나중의 정답으로 덮어쓰지 않고, 시도 번호는 재시작 후에도 이어서 센다', () => {
    let g = startGame();
    const q = currentQ(g);
    const first = sub(q, 'wrong', 0);
    g = L.submitAnswer(toQuestion(g), first, tick());
    for (let i = 1; i <= MAX; i++) {
      g = answer(L.continueAfterFeedback(g, undefined, tick()), 'wrong', i);
    }
    expect(g.pendingReturn).toBe(true);
    g = settle(L.continueAfterFeedback(g, undefined, tick()));
    expect(g.runId).toBe(2);
    expect(L.currentStep(g).id).toBe('S1');
    g = answer(g, 'correct');

    const all = g.responses.filter((r) => r.questionId === q.id);
    expect(all.map((r) => r.attemptIndex)).toEqual([1, 2, 3, 4, 5]);
    expect(all.map((r) => r.runId)).toEqual([1, 1, 1, 1, 2]);
    expect(all.map((r) => r.isCorrect)).toEqual([false, false, false, false, true]);
    expect(all.every((r) => r.kind === 'core')).toBe(true);
    expect(all.slice(0, 4).every((r) => r.countedAsMistake)).toBe(true);
    expect(all[4].countedAsMistake).toBe(false);

    expect(g.firstResponses[q.id]).toMatchObject({
      selectedAnswer: first.answerId,
      selectedReason: first.reasonId,
      isCorrect: false,
      attemptIndex: 1,
      runId: 1,
    });
    expect(g.latest[q.id]).toMatchObject({ solved: true, attempts: 5, solvedRunId: 2, solvedAttemptIndex: 5 });
    expect(g.feedback?.attemptIndex).toBe(5);
    expect(questionStatus(g, q.id)).toBe('wrong-then-solved');
  });

  it('위치는 맞고 근거가 틀리면 answerCorrect true / reasonCorrect false로 기록되고 오답으로 센다', () => {
    let g = answer(startGame(), 'reasonOnly');
    const r = g.responses[0];
    expect(r).toMatchObject({ answerCorrect: true, reasonCorrect: false, isCorrect: false, countedAsMistake: true });
    expect(g.runWrong).toBe(1);
    expect(g.latest['q-s1'].solved).toBe(false);
    expect(g.feedback).toMatchObject({ answerCorrect: true, reasonCorrect: false, isCorrect: false });
    // 근거만 맞은 경우도 오답
    g = answer(L.continueAfterFeedback(g, undefined, tick()), 'answerOnly');
    expect(g.responses[1]).toMatchObject({ answerCorrect: false, reasonCorrect: true, isCorrect: false, countedAsMistake: true });
    expect(g.runWrong).toBe(2);
  });

  it('정답이면 지도에 지점이 나타나고, S1 정답이면 탐사 표식을 꽂는다', () => {
    let g = startGame();
    expect(g.discovered).toEqual([]);
    expect(g.flagPlanted).toBe(false);
    g = answer(g, 'correct');
    expect(g.discovered).toEqual(STEP_MAP.S1.reveals);
    expect(g.flagPlanted).toBe(true);
    // 정답 뒤 이어지는 대사(afterCorrect)가 있으면 stepOutro를 거쳐 다음 단계로 이동
    g = L.continueAfterFeedback(g, undefined, tick());
    expect(g.phase).toBe('stepOutro');
    g = drain(g);
    expect(g.phase).toBe('travel');
    expect(g.travel).toEqual({ from: 0, to: 1, mode: 'path', fast: false });
    expect(g.stepIndex).toBe(1);
  });

  it('중복 제출·잘못된 시점의 제출·다른 문항의 선택지 id는 무시한다', () => {
    const obs = startGame();
    // 관찰 단계에서는 제출할 수 없다
    expect(L.submitAnswer(obs, sub(currentQ(obs), 'correct'), tick())).toBe(obs);

    const g = toQuestion(obs);
    const q = currentQ(g);
    const q2 = getQuestion('q-s2');
    const bad: L.Submission[] = [
      { questionId: q.id, answerId: q2.correctAnswer, reasonId: q.correctReason },
      { questionId: q.id, answerId: q.correctAnswer, reasonId: q2.correctReason },
      { questionId: q.id, answerId: q.correctReason, reasonId: q.correctAnswer }, // 묶음을 바꾼 id
      { questionId: q2.id, answerId: q2.correctAnswer, reasonId: q2.correctReason }, // 현재 단계가 아닌 문항
      { questionId: 'q-unknown', answerId: 'x', reasonId: 'y' },
    ];
    for (const b of bad) expect(L.submitAnswer(g, b, tick())).toBe(g);

    const s = sub(q, 'wrong');
    const once = L.submitAnswer(g, s, tick());
    const twice = L.submitAnswer(once, s, tick());
    expect(twice).toBe(once);
    expect(twice.responses).toHaveLength(1);
    expect(twice.runWrong).toBe(1);
    // 피드백이 없는 상태에서 '계속'도 무시
    expect(L.continueAfterFeedback(g, undefined, tick())).toBe(g);
  });

  it('toRecord는 화면 상태를 빼고 저장할 부분만 남긴다', () => {
    const g = answer(startGame(), 'wrong');
    const rec = L.toRecord(g);
    for (const k of ['dialogue', 'travel', 'feedback', 'activityFeedback', 'recheckIndex', 'escapeStage']) {
      expect(Object.keys(rec)).not.toContain(k);
    }
    expect(rec.responses).toHaveLength(1);
    expect(rec.version).toBe(1);
  });
});

// ── 힌트와 복습 ─────────────────────────────────────────────

describe('힌트와 복습 문항', () => {
  it('힌트는 오답 수를 바꾸지 않고 기록만 남긴다', () => {
    const obs = startGame();
    const q = currentQ(obs);
    expect(L.revealHint(obs, q.id, tick())).toBe(obs); // 추론 화면에서만
    let g = toQuestion(obs);
    expect(L.revealHint(g, 'q-s2', tick())).toBe(g); // 다른 문항
    for (let i = 0; i < q.hints.length; i++) {
      g = L.revealHint(g, q.id, tick());
      expect(g.hintsRevealed[q.id]).toBe(i + 1);
      expect(g.runWrong).toBe(0);
    }
    expect(L.revealHint(g, q.id, tick())).toBe(g); // 준비된 힌트보다 많이 열 수 없다
    expect(g.hintLog.map((h) => [h.questionId, h.hintIndex, h.runId])).toEqual(q.hints.map((_, i) => [q.id, i, 1]));
    expect(g.responses).toHaveLength(0);

    g = answer(g, 'correct');
    expect(g.responses[0]).toMatchObject({ isCorrect: true, hintsUsed: q.hints.length, countedAsMistake: false });
    expect(g.runWrong).toBe(0);
    expect(questionStatus(g, q.id)).toBe('hint-correct');
  });

  it('복습 오답은 기록되지만 오답 수에 포함되지 않고 귀환도 일으키지 않는다', () => {
    let g = startGame();
    for (let i = 0; i < MAX; i++) g = answer(L.continueAfterFeedback(g, undefined, tick()), 'wrong', i);
    expect(g.runWrong).toBe(MAX);
    g = solve(L.continueAfterFeedback(g, undefined, tick())); // S1 해결
    expect(L.currentStep(g).id).toBe('R1');
    expect(g.runWrong).toBe(MAX);

    g = answer(g, 'wrong');
    expect(g.feedback).toMatchObject({ kind: 'review', isCorrect: false, triggeredReturn: false, runWrongAfter: MAX });
    expect(g.runWrong).toBe(MAX);
    expect(g.pendingReturn).toBe(false);
    const r = g.responses[g.responses.length - 1];
    expect(r).toMatchObject({ questionId: 'q-r1', kind: 'review', isCorrect: false, countedAsMistake: false });
    expect(g.firstResponses['q-r1']).toBe(r);
    expect(g.latest['q-r1'].solved).toBe(false);
    // 복습 오답 뒤에는 다시 추론하지 않고 다음 구역으로 이동한다
    expect(L.backToObserve(g, tick())).toBe(g);
    g = L.continueAfterFeedback(g, undefined, tick());
    expect(g.phase).toBe('travel');
    expect(ROUTE[g.stepIndex].id).toBe('S2');

    // 복습 오답이 세지지 않았으므로, 다음 핵심 오답이 비로소 4번째
    g = answer(settle(g), 'wrong');
    expect(g.feedback?.triggeredReturn).toBe(true);
  });
});

// ── 관찰 ───────────────────────────────────────────────────

describe('관찰과 추론 시작', () => {
  it('모든 단서를 확인하기 전에는 추론 화면을 열 수 없다', () => {
    let g = startGame();
    const step = L.currentStep(g);
    expect(L.canInfer(g)).toBe(false);
    expect(L.openQuestion(g, tick())).toBe(g);
    for (let i = 0; i < step.clues.length - 1; i++) g = L.observeClue(g, step.clues[i].id, tick());
    expect(L.observedCount(g)).toBe(step.clues.length - 1);
    expect(L.openQuestion(g, tick())).toBe(g);
    // 같은 단서를 다시 봐도 수가 늘지 않는다
    expect(L.observeClue(g, step.clues[0].id, tick())).toBe(g);
    g = L.observeClue(g, step.clues[step.clues.length - 1].id, tick());
    expect(L.canInfer(g)).toBe(true);
    g = L.openQuestion(g, tick());
    expect(g.phase).toBe('question');
    // 추론 중에도 확인한 단서를 다시 볼 수 있다.
    expect(L.observeClue(g, step.clues[0].id, tick())).toBe(g);
    expect(g.observedClues[step.id]).toHaveLength(step.clues.length);
    expect(L.backToObserve(g, tick()).phase).toBe('observe');
  });

  it('다른 단계의 단서·없는 단서·대화 중 관찰은 무시한다', () => {
    let arriving = L.newGame('obs', 0);
    while (arriving.phase !== 'arrival') arriving = L.advanceDialogue(arriving, undefined, tick());
    expect(L.observeClue(arriving, STEP_MAP.S1.clues[0].id, tick())).toBe(arriving);

    const g = startGame();
    expect(L.observeClue(g, STEP_MAP.S2.clues[0].id, tick())).toBe(g);
    expect(L.observeClue(g, STEP_MAP.S10.clues[1].id, tick())).toBe(g); // 같은 방(좌심실)이라도 다른 단계의 단서
    expect(L.observeClue(g, 'no-such-clue', tick())).toBe(g);
    expect(g.observedClues).toEqual({});
  });

  it('복습 단계도 모든 단서를 확인해야 추론할 수 있다', () => {
    let g = solve(startGame());
    const step = L.currentStep(g);
    expect(step.kind).toBe('review');
    for (const clue of step.clues) {
      expect(L.openQuestion(g, tick())).toBe(g);
      g = L.observeClue(g, clue.id, tick());
    }
    expect(L.openQuestion(g, tick()).phase).toBe('question');
  });

  it('핵심 오답 뒤 단서를 다시 보러 갈 수 있다(오답 수는 유지)', () => {
    let g = answer(startGame(), 'wrong');
    g = L.backToObserve(g, tick());
    expect(g.phase).toBe('observe');
    expect(g.feedback).toBeNull();
    expect(g.runWrong).toBe(1);
    expect(L.openQuestion(g, tick()).phase).toBe('question');
  });
});

// ── id 채점 ─────────────────────────────────────────────────

describe('채점은 표시 순서가 아니라 id로 한다', () => {
  it('섞인 순서에서 정답이 어느 자리에 있든 정답 id면 정답이다', () => {
    const correctSlots: number[] = [];
    for (let s = 0; s < 3; s++) {
      let g = startGame(`grade-${s}`);
      for (let guard = 0; g.phase !== 'activity' && guard < 40; guard++) {
        g = toQuestion(g);
        const q = currentQ(g);
        const order = optionOrder(g, q.id);
        expect([...order.answers].sort()).toEqual(q.options.map((o) => o.id).sort());
        expect([...order.reasons].sort()).toEqual(q.reasonOptions.map((o) => o.id).sort());
        const ai = order.answers.indexOf(q.correctAnswer);
        const ri = order.reasons.indexOf(q.correctReason);
        correctSlots.push(ai, ri);
        // 정답이 아닌 첫 자리를 누르면 오답, 정답 자리를 누르면 정답
        const wrongSlot = ai === 0 ? 1 : 0;
        const wrong = L.submitAnswer(g, { questionId: q.id, answerId: order.answers[wrongSlot], reasonId: order.reasons[ri] }, tick());
        expect(wrong.feedback?.answerCorrect).toBe(false);
        const right = L.submitAnswer(g, { questionId: q.id, answerId: order.answers[ai], reasonId: order.reasons[ri] }, tick());
        expect(right.feedback?.isCorrect).toBe(true);
        g = proceed(right);
      }
      expect(g.phase).toBe('activity');
    }
    // 정답 위치가 한 자리에 고정되어 있지 않다
    expect(new Set(correctSlots).size).toBeGreaterThanOrEqual(3);
  });

  it('문항마다 시드에 따라 정답 위치가 달라지고, 같은 시도에서는 순서가 같다', () => {
    for (const step of ROUTE) {
      const q = getQuestion(step.questionId);
      const slots = new Set<number>();
      const reasonSlots = new Set<number>();
      for (let s = 0; s < 30; s++) {
        const st = { sessionId: `seed-${s}`, runId: 1, latest: {} };
        const o = optionOrder(st, q.id);
        expect(optionOrder(st, q.id)).toEqual(o);
        slots.add(o.answers.indexOf(q.correctAnswer));
        reasonSlots.add(o.reasons.indexOf(q.correctReason));
      }
      expect(slots.size, q.id).toBeGreaterThanOrEqual(2);
      expect(reasonSlots.size, q.id).toBeGreaterThanOrEqual(2);
    }
  });

  it('오답 뒤 다시 풀 때는 순서가 새로 섞일 수 있다(시도 번호가 시드에 들어감)', () => {
    let changed = 0;
    for (let s = 0; s < 10; s++) {
      const a = optionOrder({ sessionId: `re-${s}`, runId: 1, latest: {} }, 'q-s1');
      const b = optionOrder({ sessionId: `re-${s}`, runId: 1, latest: { 'q-s1': { solved: false, attempts: 1 } } }, 'q-s1');
      if (a.answers.join() !== b.answers.join() || a.reasons.join() !== b.reasons.join()) changed++;
    }
    expect(changed).toBeGreaterThan(0);
  });
});

// ── 마지막 활동·재확인·탈출 ─────────────────────────────────

describe('허파순환·온몸순환 범위 활동', () => {
  function toActivity(sessionId: string): GameState {
    let g = advanceTo(startGame(sessionId), 'S10');
    g = L.continueAfterFeedback(answer(g, 'correct'), undefined, tick());
    expect(g.phase).toBe('activity');
    expect(g.dialogue?.kind).toBe('activityIntro');
    expect(g.stepIndex).toBe(ROUTE.length - 1);
    return g;
  }

  it('오답 선택은 기록되고 다시 할 수 있으며, 정답이면 재확인으로 넘어간다', () => {
    let g = toActivity('act');
    expect(L.submitActivity(g, P, S, tick())).toBe(g); // 안내 대화 중에는 제출 불가
    g = drain(g);
    const wrongP: NodeId[] = ['ra', 'rv', 'pa', 'lungCap', 'pv'];
    const wrongS: NodeId[] = ['lv', 'aorta', 'sysCap', 'venaCava', 'la'];
    g = L.submitActivity(g, wrongP, wrongS, tick());
    expect(g.activitySolved).toBe(false);
    expect(g.activityAttempts).toHaveLength(1);
    expect(g.activityAttempts[0]).toMatchObject({ runId: 1, pulmonaryCorrect: false, systemicCorrect: false, pulmonary: wrongP });
    expect(g.activityFeedback).toEqual({
      pulmonaryCorrect: false,
      systemicCorrect: false,
      missingPulmonary: ['la'],
      extraPulmonary: ['ra'],
      missingSystemic: ['ra'],
      extraSystemic: ['la'],
    });
    expect(L.finishActivity(g, tick())).toBe(g); // 아직 해결 전

    // 한쪽만 맞은 경우
    g = L.submitActivity(g, P, wrongS, tick());
    expect(g.activityFeedback).toMatchObject({ pulmonaryCorrect: true, systemicCorrect: false });
    expect(g.activitySolved).toBe(false);

    // 순서와 상관없이 같은 구역이면 정답
    g = L.submitActivity(g, [...P].reverse(), [...S].reverse(), tick());
    expect(g.activitySolved).toBe(true);
    expect(g.activityAttempts).toHaveLength(3);
    expect(L.submitActivity(g, wrongP, wrongS, tick())).toBe(g); // 해결 후 재제출 무시

    g = L.finishActivity(g, tick());
    expect(g.phase).toBe('recheck');
    // 첫 활동 시도에서 틀린 범위의 개념을 다시 확인한다
    expect(recheckConceptIds(g)).toEqual([...CIRCULATION_ACTIVITY.conceptIds.pulmonary, ...CIRCULATION_ACTIVITY.conceptIds.systemic]);
    expect(g.dialogue?.kind).toBe('recheckIntro');
  });

  it('같은 구역을 두 번 고르고 하나를 빠뜨린 선택은 정답이 아니다', () => {
    const g = drain(toActivity('dup'));
    const dupP: NodeId[] = ['rv', 'rv', 'pa', 'lungCap', 'pv']; // la 빠짐
    const r = L.submitActivity(g, dupP, S, tick());
    expect(r.activitySolved).toBe(false);
    expect(r.activityFeedback?.pulmonaryCorrect).toBe(false);
    expect(r.activityFeedback?.missingPulmonary).toEqual(['la']);
  });

  it('한 번도 틀리지 않았으면 재확인 없이(recheckNone) 바로 탈출한다', () => {
    let g = drain(toActivity('clean'));
    g = L.submitActivity(g, P, S, tick());
    g = L.finishActivity(g, tick());
    expect(g.phase).toBe('recheck');
    expect(g.dialogue?.kind).toBe('recheckNone');
    g = L.advanceDialogue(g, undefined, tick());
    expect(g.phase).toBe('escape');
    expect(g.escaped).toBe(true);
    expect(g.escapedAt).toBeTypeOf('number');
    expect(g.dialogue?.kind).toBe('escape');
    expect(g.escapeStage).toBe('dialogue');
    g = drain(g);
    expect(g.escapeStage).toBe('message');
  });
});

describe('오답 개념 재확인', () => {
  it('첫 응답만 기록하고, 답하기 전에는 다음으로 갈 수 없으며, 마지막 문항 뒤 탈출한다', () => {
    let g = advanceTo(startGame('recheck'), 'S5');
    g = submitIds(g, 's5-a-rv', 's5-r-gravity'); // 중력 오개념 → flow-cause, valve
    g = advanceTo(L.continueAfterFeedback(g, undefined, tick()), 'S6');
    g = submitIds(g, 's6-a-pa', 's6-r-lowo2'); // 산소 양으로 동맥·정맥 판단 → artery-vein
    g = L.continueAfterFeedback(g, undefined, tick());
    for (let guard = 0; g.phase !== 'activity' && guard < 40; guard++) g = solve(g);
    g = L.finishActivity(L.submitActivity(g, P, S, tick()), tick());
    expect(g.phase).toBe('recheck');
    expect(g.dialogue?.kind).toBe('recheckIntro');

    const ids = recheckConceptIds(g);
    expect(ids).toEqual(['flow-cause', 'valve', 'artery-vein']);
    const c0 = getConcept(ids[0]);
    expect(L.answerRecheck(g, ids[0], c0.recheck.answer, c0.recheck.answer, tick())).toBe(g); // 대화 중
    g = drain(g);
    expect(g.recheckIndex).toBe(0);
    expect(L.nextRecheck(g, tick())).toBe(g); // 아직 답하지 않음
    expect(L.answerRecheck(g, ids[1], true, true, tick())).toBe(g); // 현재 문항이 아님

    // 첫 문항: 틀리게 답한 뒤 다시 답해도 첫 응답이 남는다
    g = L.answerRecheck(g, ids[0], !c0.recheck.answer, c0.recheck.answer, tick());
    expect(g.recheck[ids[0]]).toMatchObject({ answer: !c0.recheck.answer, correct: false });
    expect(L.answerRecheck(g, ids[0], c0.recheck.answer, c0.recheck.answer, tick())).toBe(g);
    g = L.nextRecheck(g, tick());
    expect(g.recheckIndex).toBe(1);

    for (let i = 1; i < ids.length; i++) {
      const c = getConcept(ids[i]);
      g = L.answerRecheck(g, ids[i], c.recheck.answer, c.recheck.answer, tick());
      expect(g.recheck[ids[i]].correct).toBe(true);
      g = L.nextRecheck(g, tick());
    }
    expect(g.phase).toBe('escape');
    expect(g.escaped).toBe(true);
    expect(g.dialogue?.kind).toBe('escape');
    g = drain(g);
    expect(g.escapeStage).toBe('message');
    expect(Object.keys(g.recheck).sort()).toEqual([...ids].sort());
  });
});

// ── 이어하기 ───────────────────────────────────────────────

describe('저장된 기록에서 이어하기(resumeGame)', () => {
  it('진행 중(미해결 단계의 오답 설명 화면) → 현재 단계로 순간 이동해 다시 도착한다', () => {
    let g = advanceTo(startGame('resume'), 'S2');
    g = answer(g, 'wrong');
    const r = L.resumeGame(roundtrip(g));
    expect(r.phase).toBe('travel');
    expect(r.stepIndex).toBe(idxOf('S2'));
    expect(r.travel).toEqual({ from: null, to: idxOf('S2'), mode: 'teleport', fast: true });
    expect(r.dialogue).toBeNull();
    expect(r.feedback).toBeNull();
    expect(r.runWrong).toBe(1);
    expect(r.responses).toHaveLength(g.responses.length);
    const a = L.arrive(r, tick());
    expect(a.phase).toBe('arrival');
    expect(drain(a).phase).toBe('observe');
  });

  it('정답 직후(설명·마무리 대사)에 저장했다면 다음 단계로 이동한다', () => {
    let g = advanceTo(startGame('resume2'), 'S2');
    g = answer(g, 'correct');
    expect(L.resumeGame(roundtrip(g))).toMatchObject({ phase: 'travel', stepIndex: idxOf('S2') + 1 });
    // S1 마무리 대사(stepOutro) 중 저장
    let s1 = L.continueAfterFeedback(answer(startGame('resume3'), 'correct'), undefined, tick());
    expect(s1.phase).toBe('stepOutro');
    expect(L.resumeGame(roundtrip(s1))).toMatchObject({ phase: 'travel', stepIndex: 1 });
    // 이동 중 저장: 목적지 단계는 그대로
    s1 = drain(s1);
    expect(s1.phase).toBe('travel');
    expect(L.resumeGame(roundtrip(s1))).toMatchObject({ phase: 'travel', stepIndex: 1 });
  });

  it('S10 해결 직후 저장 → 마지막 활동, 활동·재확인 중 저장 → 그 단계를 다시 시작', () => {
    let g = advanceTo(startGame('resume4'), 'S10');
    g = answer(g, 'correct');
    const act = L.resumeGame(roundtrip(g));
    expect(act.phase).toBe('activity');
    expect(act.dialogue?.kind).toBe('activityIntro');

    g = drain(L.continueAfterFeedback(g, undefined, tick()));
    expect(L.resumeGame(roundtrip(g)).phase).toBe('activity');
    g = L.finishActivity(L.submitActivity(g, P, S, tick()), tick());
    expect(g.phase).toBe('recheck');
    const re = L.resumeGame(roundtrip(g));
    expect(re.phase).toBe('recheck');
    expect(re.recheckIndex).toBe(0);
  });

  it('귀환이 결정된 상태(pendingReturn)에서 저장 → 귀환 대화부터 다시', () => {
    let g = startGame('resume5');
    for (let i = 0; i < MAX; i++) g = answer(L.continueAfterFeedback(g, undefined, tick()), 'wrong', i);
    g = answer(L.continueAfterFeedback(g, undefined, tick()), 'wrong', MAX);
    expect(g.pendingReturn).toBe(true);
    const r = L.resumeGame(roundtrip(g));
    expect(r.phase).toBe('returning');
    expect(r.dialogue?.kind).toBe('returning');
    const after = drain(r);
    expect(after).toMatchObject({ runId: 2, restartCount: 1, runWrong: 0, pendingReturn: false, stepIndex: 0, phase: 'travel' });
  });

  it('탈출한 기록 → 탈출 메시지, 도입을 마치지 않은 기록 → 놀이공원 도입부터', () => {
    let g = advanceTo(startGame('resume6'), 'S10');
    g = settle(L.continueAfterFeedback(answer(g, 'correct'), undefined, tick()));
    g = drain(L.finishActivity(L.submitActivity(g, P, S, tick()), tick()));
    expect(g.escaped).toBe(true);
    const r = L.resumeGame(roundtrip(g));
    expect(r.phase).toBe('escape');
    expect(r.escapeStage).toBe('message');
    expect(r.dialogue).toBeNull();

    const fresh = L.resumeGame(roundtrip(L.newGame('intro', 0)));
    expect(fresh.phase).toBe('intro');
    expect(fresh.dialogue?.kind).toBe('introPark');
  });
});

describe('대화 건너뛰기', () => {
  it('skipDialogue는 대화를 끝까지 읽은 것과 같은 결과를 낸다', () => {
    const g = L.newGame('skip', 0);
    const skipped = L.skipDialogue(L.skipDialogue(g, undefined, 1), undefined, 2);
    expect(skipped.introDone).toBe(true);
    expect(skipped.phase).toBe('arrival');
    expect(L.skipDialogue(skipped, undefined, 3).phase).toBe('observe');
    expect(L.skipDialogue(drain(skipped), undefined, 4).phase).toBe('observe');
  });
});
