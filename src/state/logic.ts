// 게임 규칙(순수 함수). React·Three.js와 무관하므로 자동 검증으로 확인할 수 있다.
// 모든 함수는 (상태, 입력) → 새 상태 를 돌려주며, 허용되지 않는 입력은 상태를 그대로 돌려준다.

import { GAME_CONFIG } from '../data/config';
import {
  ACTIVITY_INTRO,
  buildIntroWake,
  buildReturnLines,
  ESCAPE_LINES,
  INTRO_PARK,
  RECHECK_INTRO,
  RECHECK_NONE,
  rememberedLine,
} from '../data/dialogue';
import { CIRCULATION_ACTIVITY, getQuestion } from '../data/questions';
import { ROUTE } from '../data/route';
import type { DialogueLine, NodeId } from '../data/types';
import type {
  ActivityFeedback,
  DialogueKind,
  GameState,
  LearningRecord,
  ResponseRecord,
} from './types';
import { recheckConceptIds } from './selectors';

export interface RuleOptions {
  maxWrongPerRun: number;
}

const DEFAULT_RULES: RuleOptions = { maxWrongPerRun: GAME_CONFIG.maxWrongPerRun };

// ── 생성 ───────────────────────────────────────────────────

export function createRecord(sessionId: string, now: number): LearningRecord {
  return {
    version: 1,
    sessionId,
    startedAt: now,
    updatedAt: now,
    runId: 1,
    restartCount: 0,
    runWrong: 0,
    pendingReturn: false,
    stepIndex: 0,
    phase: 'intro',
    introDone: false,
    responses: [],
    firstResponses: {},
    latest: {},
    hintsRevealed: {},
    hintLog: [],
    observedClues: {},
    discovered: [],
    flagPlanted: false,
    activityAttempts: [],
    activitySolved: false,
    recheck: {},
    returnLog: [],
    escaped: false,
  };
}

function sessionDefaults(): Omit<GameState, keyof LearningRecord> {
  return {
    dialogue: null,
    travel: null,
    feedback: null,
    activityFeedback: null,
    recheckIndex: 0,
    escapeStage: 'dialogue',
  };
}

export function newGame(sessionId: string, now: number): GameState {
  return {
    ...createRecord(sessionId, now),
    ...sessionDefaults(),
    dialogue: { kind: 'introPark', lines: INTRO_PARK, index: 0 },
  };
}

/** 저장할 부분만 꺼낸다 */
export function toRecord(state: GameState): LearningRecord {
  const {
    dialogue: _d,
    travel: _t,
    feedback: _f,
    activityFeedback: _a,
    recheckIndex: _r,
    escapeStage: _e,
    ...record
  } = state;
  return record;
}

/** 저장된 기록에서 이어서 하기. 화면 상태는 안전한 지점에서 다시 시작한다. */
export function resumeGame(saved: LearningRecord, rules: RuleOptions = DEFAULT_RULES): GameState {
  let state: GameState = { ...saved, ...sessionDefaults() };
  if (state.escaped) {
    return { ...state, phase: 'escape', escapeStage: 'message' };
  }
  if (!state.introDone) {
    return { ...state, phase: 'intro', stepIndex: 0, dialogue: { kind: 'introPark', lines: INTRO_PARK, index: 0 } };
  }
  if (state.pendingReturn) {
    return { ...state, phase: 'returning', dialogue: { kind: 'returning', lines: buildReturnLines(rules.maxWrongPerRun), index: 0 } };
  }
  if (state.phase === 'activity' && !state.activitySolved) {
    return startActivity(state);
  }
  if (state.phase === 'activity' || state.phase === 'recheck') {
    return startRecheck(state);
  }
  // 현재 단계가 이미 해결되었다면 다음 단계로 넘어가 둔다.
  let idx = Math.min(Math.max(state.stepIndex, 0), ROUTE.length - 1);
  if (isStepSolved(state, idx) && state.phase !== 'travel' && state.phase !== 'remembered') {
    if (idx === ROUTE.length - 1) return startActivity(state);
    idx += 1;
  }
  state = { ...state, stepIndex: idx, phase: 'travel', travel: { from: null, to: idx, mode: 'teleport', fast: true } };
  return state;
}

// ── 도움 함수 ───────────────────────────────────────────────

export function currentStep(state: Pick<LearningRecord, 'stepIndex'>) {
  return ROUTE[Math.min(Math.max(state.stepIndex, 0), ROUTE.length - 1)];
}

export function isStepSolved(state: Pick<LearningRecord, 'latest'>, stepIndex: number): boolean {
  const step = ROUTE[stepIndex];
  return !!state.latest[step.questionId]?.solved;
}

function withDialogue(state: GameState, kind: DialogueKind, lines: DialogueLine[]): GameState {
  return { ...state, dialogue: lines.length ? { kind, lines, index: 0 } : null };
}

function touch(state: GameState, now?: number): GameState {
  return now === undefined ? state : { ...state, updatedAt: now };
}

// ── 대화 ───────────────────────────────────────────────────

export function advanceDialogue(state: GameState, rules: RuleOptions = DEFAULT_RULES, now?: number): GameState {
  const d = state.dialogue;
  if (!d) return state;
  if (d.index < d.lines.length - 1) {
    return { ...state, dialogue: { ...d, index: d.index + 1 } };
  }
  return completeDialogue(state, rules, now);
}

/** 대화 전체 건너뛰기(마지막 줄까지 읽은 것으로 처리) */
export function skipDialogue(state: GameState, rules: RuleOptions = DEFAULT_RULES, now?: number): GameState {
  if (!state.dialogue) return state;
  return completeDialogue(state, rules, now);
}

function completeDialogue(state: GameState, rules: RuleOptions, now?: number): GameState {
  const d = state.dialogue;
  if (!d) return state;
  const cleared: GameState = { ...state, dialogue: null };
  switch (d.kind) {
    case 'introPark':
      return withDialogue(cleared, 'introWake', buildIntroWake(rules.maxWrongPerRun));
    case 'introWake':
      return arriveAt({ ...cleared, introDone: true, stepIndex: 0 }, now);
    case 'arrival':
      return touch({ ...cleared, phase: 'observe' }, now);
    case 'remembered':
      return goToNextStep(cleared, now);
    case 'stepOutro':
      return goToNextStep(cleared, now);
    case 'returning':
      return doReturn(cleared, now);
    case 'activityIntro':
      return cleared;
    case 'recheckIntro':
      return cleared;
    case 'recheckNone':
      return startEscape(cleared, now);
    case 'escape':
      return touch({ ...cleared, escapeStage: 'message' }, now);
  }
}

// ── 이동과 도착 ─────────────────────────────────────────────

/** 현재 stepIndex에 도착한 상태로 만든다 */
function arriveAt(state: GameState, now?: number): GameState {
  const step = currentStep(state);
  const base: GameState = { ...state, travel: null, feedback: null };
  if (isStepSolved(state, state.stepIndex)) {
    return touch(
      { ...base, phase: 'remembered', dialogue: { kind: 'remembered', lines: [rememberedLine(step.solvedName)], index: 0 } },
      now,
    );
  }
  return touch({ ...base, phase: 'arrival', dialogue: { kind: 'arrival', lines: step.arrival, index: 0 } }, now);
}

/** 3D 이동 연출이 끝났을 때(또는 건너뛰었을 때) 호출 */
export function arrive(state: GameState, now?: number): GameState {
  if (state.phase !== 'travel') return state;
  return arriveAt(state, now);
}

function goToNextStep(state: GameState, now?: number): GameState {
  if (state.stepIndex >= ROUTE.length - 1) {
    return touch(startActivity(state), now);
  }
  const to = state.stepIndex + 1;
  return touch(
    {
      ...state,
      phase: 'travel',
      stepIndex: to,
      feedback: null,
      dialogue: null,
      travel: { from: state.stepIndex, to, mode: 'path', fast: isStepSolved(state, to) },
    },
    now,
  );
}

/** '통과하기' 버튼: 기억한 구역을 빠르게 지난다 */
export function passRemembered(state: GameState, now?: number): GameState {
  if (state.phase !== 'remembered') return state;
  return goToNextStep({ ...state, dialogue: null }, now);
}

// ── 관찰 ───────────────────────────────────────────────────

export function observeClue(state: GameState, clueId: string, now?: number): GameState {
  if (state.phase !== 'observe' && state.phase !== 'question') return state;
  const step = currentStep(state);
  if (!step.clues.some((c) => c.id === clueId)) return state;
  const seen = state.observedClues[step.id] ?? [];
  if (seen.includes(clueId)) return state;
  return touch({ ...state, observedClues: { ...state.observedClues, [step.id]: [...seen, clueId] } }, now);
}

export function observedCount(state: GameState): number {
  const step = currentStep(state);
  const seen = state.observedClues[step.id] ?? [];
  return seen.filter((id) => step.clues.some((c) => c.id === id)).length;
}

export function canInfer(state: GameState): boolean {
  const step = currentStep(state);
  const seen = state.observedClues[step.id] ?? [];
  return state.phase === 'observe' && step.clues.every((clue) => seen.includes(clue.id));
}

export function openQuestion(state: GameState, now?: number): GameState {
  if (!canInfer(state)) return state;
  return touch({ ...state, phase: 'question' }, now);
}

/** 응답 중이나 오답 설명 뒤에 단서를 다시 보러 간다(벌점 없음) */
export function backToObserve(state: GameState, now?: number): GameState {
  if (state.phase === 'question') return touch({ ...state, phase: 'observe' }, now);
  if (state.phase === 'feedback' && state.feedback && !state.feedback.isCorrect && state.feedback.kind === 'core' && !state.feedback.triggeredReturn) {
    return touch({ ...state, phase: 'observe', feedback: null }, now);
  }
  return state;
}

// ── 힌트 ───────────────────────────────────────────────────

export function revealHint(state: GameState, questionId: string, now: number): GameState {
  if (state.phase !== 'question') return state;
  const step = currentStep(state);
  if (step.questionId !== questionId) return state;
  const q = getQuestion(questionId);
  const used = state.hintsRevealed[questionId] ?? 0;
  if (used >= q.hints.length) return state;
  return {
    ...state,
    updatedAt: now,
    hintsRevealed: { ...state.hintsRevealed, [questionId]: used + 1 },
    hintLog: [...state.hintLog, { questionId, runId: state.runId, hintIndex: used, at: now }],
  };
}

// ── 응답 ───────────────────────────────────────────────────

export interface Submission {
  questionId: string;
  answerId: string;
  reasonId: string;
}

export function submitAnswer(state: GameState, sub: Submission, now: number, rules: RuleOptions = DEFAULT_RULES): GameState {
  // 중복 클릭·잘못된 시점의 제출은 무시한다.
  if (state.phase !== 'question') return state;
  const step = currentStep(state);
  if (step.questionId !== sub.questionId) return state;
  const q = getQuestion(sub.questionId);
  if (!q.options.some((o) => o.id === sub.answerId)) return state;
  if (!q.reasonOptions.some((o) => o.id === sub.reasonId)) return state;

  const answerCorrect = sub.answerId === q.correctAnswer;
  const reasonCorrect = sub.reasonId === q.correctReason;
  const isCorrect = answerCorrect && reasonCorrect;
  const prev = state.latest[q.id];
  const attemptIndex = (prev?.attempts ?? 0) + 1;
  const countedAsMistake = q.kind === 'core' && !isCorrect;

  const record: ResponseRecord = {
    questionId: q.id,
    runId: state.runId,
    selectedAnswer: sub.answerId,
    selectedReason: sub.reasonId,
    isCorrect,
    answerCorrect,
    reasonCorrect,
    hintsUsed: state.hintsRevealed[q.id] ?? 0,
    attemptIndex,
    kind: q.kind,
    countedAsMistake,
    at: now,
  };

  const runWrong = state.runWrong + (countedAsMistake ? 1 : 0);
  const triggeredReturn = countedAsMistake && runWrong > rules.maxWrongPerRun;
  const wasSolved = !!prev?.solved;

  let discovered = state.discovered;
  if (isCorrect && q.kind === 'core') {
    discovered = [...discovered];
    for (const n of step.reveals) if (!discovered.includes(n)) discovered.push(n);
  }

  return {
    ...state,
    updatedAt: now,
    phase: 'feedback',
    runWrong,
    pendingReturn: triggeredReturn,
    responses: [...state.responses, record],
    firstResponses: state.firstResponses[q.id] ? state.firstResponses : { ...state.firstResponses, [q.id]: record },
    latest: {
      ...state.latest,
      [q.id]: {
        solved: wasSolved || isCorrect,
        attempts: attemptIndex,
        solvedRunId: wasSolved ? prev?.solvedRunId : isCorrect ? state.runId : undefined,
        solvedAttemptIndex: wasSolved ? prev?.solvedAttemptIndex : isCorrect ? attemptIndex : undefined,
        lastAnswer: sub.answerId,
        lastReason: sub.reasonId,
      },
    },
    discovered,
    flagPlanted: state.flagPlanted || (isCorrect && step.id === 'S1'),
    feedback: {
      questionId: q.id,
      kind: q.kind,
      isCorrect,
      answerCorrect,
      reasonCorrect,
      selectedAnswer: sub.answerId,
      selectedReason: sub.reasonId,
      attemptIndex,
      runWrongAfter: runWrong,
      triggeredReturn,
    },
  };
}

/** 설명을 읽은 뒤 '계속' */
export function continueAfterFeedback(state: GameState, rules: RuleOptions = DEFAULT_RULES, now?: number): GameState {
  if (state.phase !== 'feedback' || !state.feedback) return state;
  const fb = state.feedback;
  if (fb.triggeredReturn) {
    return touch(
      { ...state, phase: 'returning', dialogue: { kind: 'returning', lines: buildReturnLines(rules.maxWrongPerRun), index: 0 } },
      now,
    );
  }
  if (fb.kind === 'review' || fb.isCorrect) {
    const step = currentStep(state);
    if (fb.isCorrect && step.afterCorrect?.length) {
      return touch({ ...state, phase: 'stepOutro', feedback: null, dialogue: { kind: 'stepOutro', lines: step.afterCorrect, index: 0 } }, now);
    }
    return goToNextStep({ ...state, feedback: null }, now);
  }
  // 핵심 문항 오답(1~3번째): 같은 자리에서 다시 추론한다.
  return touch({ ...state, phase: 'question', feedback: null }, now);
}

// ── 귀환(4번째 오답) ────────────────────────────────────────

function doReturn(state: GameState, now?: number): GameState {
  if (!state.pendingReturn) return state;
  const step = currentStep(state);
  return touch(
    {
      ...state,
      runId: state.runId + 1,
      restartCount: state.restartCount + 1,
      runWrong: 0,
      pendingReturn: false,
      returnLog: [...state.returnLog, { fromRunId: state.runId, atQuestionId: step.questionId, at: now ?? state.updatedAt }],
      stepIndex: 0,
      phase: 'travel',
      feedback: null,
      dialogue: null,
      travel: { from: state.stepIndex, to: 0, mode: 'teleport', fast: true },
    },
    now,
  );
}

// ── 마지막 활동: 허파순환·온몸순환 범위 ─────────────────────

function startActivity(state: GameState): GameState {
  return {
    ...state,
    phase: 'activity',
    stepIndex: ROUTE.length - 1,
    travel: null,
    feedback: null,
    activityFeedback: null,
    dialogue: { kind: 'activityIntro', lines: ACTIVITY_INTRO, index: 0 },
  };
}

function sameSet(a: readonly NodeId[], b: readonly NodeId[]): boolean {
  // 양방향으로 확인한다(같은 구역을 두 번 고르고 하나를 빠뜨린 선택이 정답 처리되지 않게).
  return a.length === b.length && a.every((x) => b.includes(x)) && b.every((x) => a.includes(x));
}

export function submitActivity(state: GameState, pulmonary: NodeId[], systemic: NodeId[], now: number): GameState {
  if (state.phase !== 'activity' || state.dialogue || state.activitySolved) return state;
  const P = CIRCULATION_ACTIVITY.pulmonary;
  const S = CIRCULATION_ACTIVITY.systemic;
  const pulmonaryCorrect = sameSet(pulmonary, P);
  const systemicCorrect = sameSet(systemic, S);
  const fb: ActivityFeedback = {
    pulmonaryCorrect,
    systemicCorrect,
    missingPulmonary: P.filter((n) => !pulmonary.includes(n)),
    extraPulmonary: pulmonary.filter((n) => !(P as readonly NodeId[]).includes(n)),
    missingSystemic: S.filter((n) => !systemic.includes(n)),
    extraSystemic: systemic.filter((n) => !(S as readonly NodeId[]).includes(n)),
  };
  return {
    ...state,
    updatedAt: now,
    activityAttempts: [
      ...state.activityAttempts,
      { runId: state.runId, pulmonary: [...pulmonary], systemic: [...systemic], pulmonaryCorrect, systemicCorrect, at: now },
    ],
    activitySolved: pulmonaryCorrect && systemicCorrect,
    activityFeedback: fb,
  };
}

/** 활동을 마친 뒤(정답 확인 후) 오답 개념 재확인으로 */
export function finishActivity(state: GameState, now?: number): GameState {
  if (state.phase !== 'activity' || !state.activitySolved) return state;
  return touch(startRecheck(state), now);
}

// ── 오답 개념 재확인 ────────────────────────────────────────

function startRecheck(state: GameState): GameState {
  const ids = recheckConceptIds(state);
  if (ids.length === 0) {
    return { ...state, phase: 'recheck', activityFeedback: null, recheckIndex: 0, dialogue: { kind: 'recheckNone', lines: RECHECK_NONE, index: 0 } };
  }
  return { ...state, phase: 'recheck', activityFeedback: null, recheckIndex: 0, dialogue: { kind: 'recheckIntro', lines: RECHECK_INTRO, index: 0 } };
}

export function answerRecheck(state: GameState, conceptId: string, answer: boolean, correctAnswer: boolean, now: number): GameState {
  if (state.phase !== 'recheck' || state.dialogue) return state;
  const ids = recheckConceptIds(state);
  if (ids[state.recheckIndex] !== conceptId) return state;
  if (state.recheck[conceptId]) return state; // 첫 응답만 기록
  return {
    ...state,
    updatedAt: now,
    recheck: { ...state.recheck, [conceptId]: { answer, correct: answer === correctAnswer, at: now } },
  };
}

export function nextRecheck(state: GameState, now?: number): GameState {
  if (state.phase !== 'recheck' || state.dialogue) return state;
  const ids = recheckConceptIds(state);
  const id = ids[state.recheckIndex];
  if (id && !state.recheck[id]) return state; // 먼저 답해야 한다
  if (state.recheckIndex + 1 < ids.length) return touch({ ...state, recheckIndex: state.recheckIndex + 1 }, now);
  return startEscape(state, now);
}

// ── 탈출 ───────────────────────────────────────────────────

function startEscape(state: GameState, now?: number): GameState {
  return touch(
    {
      ...state,
      phase: 'escape',
      escaped: true,
      escapedAt: now ?? state.updatedAt,
      escapeStage: 'dialogue',
      dialogue: { kind: 'escape', lines: ESCAPE_LINES, index: 0 },
    },
    now,
  );
}
