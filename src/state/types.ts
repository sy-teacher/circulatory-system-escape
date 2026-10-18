import type { DialogueLine, NodeId, QuestionKind } from '../data/types';

/**
 * 게임 진행 상태(상태 머신)
 *
 *  intro ─▶ arrival ─▶ observe ─▶ question ─▶ feedback ─┬▶ (stepOutro) ─▶ travel ─▶ arrival …
 *                                    ▲            │      │
 *                                    └── 재추론 ◀─┘      ├▶ returning ─▶ travel(출발점) ─▶ remembered …
 *                                                        └▶ (S10 해결) activity ─▶ recheck ─▶ escape
 *  travel ─▶ remembered(이미 해결한 구역) ─▶ travel(빠르게) …
 */
export type Phase =
  | 'intro'
  | 'travel'
  | 'arrival'
  | 'remembered'
  | 'observe'
  | 'question'
  | 'feedback'
  | 'stepOutro'
  | 'returning'
  | 'activity'
  | 'recheck'
  | 'escape';

export type DialogueKind =
  | 'introPark'
  | 'introWake'
  | 'arrival'
  | 'remembered'
  | 'stepOutro'
  | 'returning'
  | 'activityIntro'
  | 'recheckIntro'
  | 'recheckNone'
  | 'escape';

export interface DialogueState {
  kind: DialogueKind;
  lines: DialogueLine[];
  index: number;
}

/** 응답 기록 1건 */
export interface ResponseRecord {
  questionId: string;
  runId: number;
  selectedAnswer: string;
  selectedReason: string;
  isCorrect: boolean;
  answerCorrect: boolean;
  reasonCorrect: boolean;
  /** 이 응답을 제출할 때까지 공개한 힌트 수 */
  hintsUsed: number;
  /** 이 문항에 대한 전체 시도 중 몇 번째인지(1부터, 재시작해도 이어서 센다) */
  attemptIndex: number;
  kind: QuestionKind;
  /** 현재 탐험의 오답 수에 포함되었는지(핵심 문항 오답만 true) */
  countedAsMistake: boolean;
  at: number;
}

/** 문항별 가장 최근 해결 상태 */
export interface LatestStatus {
  solved: boolean;
  attempts: number;
  solvedRunId?: number;
  solvedAttemptIndex?: number;
  lastAnswer?: string;
  lastReason?: string;
}

export interface HintEvent {
  questionId: string;
  runId: number;
  hintIndex: number;
  at: number;
}

export interface ReturnEvent {
  fromRunId: number;
  atQuestionId: string;
  at: number;
}

export interface ActivityAttempt {
  runId: number;
  pulmonary: NodeId[];
  systemic: NodeId[];
  pulmonaryCorrect: boolean;
  systemicCorrect: boolean;
  at: number;
}

export interface RecheckResult {
  answer: boolean;
  correct: boolean;
  at: number;
}

/** localStorage에 저장되는 학습 기록 */
export interface LearningRecord {
  version: 1;
  sessionId: string;
  startedAt: number;
  updatedAt: number;
  /** 현재 탐험 번호(1부터) */
  runId: number;
  restartCount: number;
  /** 현재 탐험의 오답 수(핵심 문항) */
  runWrong: number;
  /** 4번째 오답이 나와 귀환해야 하는 상태 */
  pendingReturn: boolean;
  stepIndex: number;
  phase: Phase;
  introDone: boolean;
  /** 전체 응답 이력(삭제·수정하지 않는다) */
  responses: ResponseRecord[];
  /** 문항별 최초 응답(나중에 정답을 맞혀도 덮어쓰지 않는다) */
  firstResponses: Record<string, ResponseRecord>;
  /** 문항별 가장 최근 해결 상태 */
  latest: Record<string, LatestStatus>;
  /** 문항별 공개한 힌트 수 */
  hintsRevealed: Record<string, number>;
  hintLog: HintEvent[];
  /** 단계별 확인한 단서 id */
  observedClues: Record<string, string[]>;
  /** 지도에 나타난 지점 */
  discovered: NodeId[];
  flagPlanted: boolean;
  activityAttempts: ActivityAttempt[];
  activitySolved: boolean;
  recheck: Record<string, RecheckResult>;
  returnLog: ReturnEvent[];
  escaped: boolean;
  escapedAt?: number;
}

export interface TravelState {
  /** 출발 단계(null이면 출발점 없이 바로 나타남) */
  from: number | null;
  to: number;
  /** path: 경로를 따라 이동 / teleport: 화면 전환(귀환·이어하기) */
  mode: 'path' | 'teleport';
  /** 이미 해결한 구역을 지날 때 짧게 이동 */
  fast: boolean;
}

export interface FeedbackInfo {
  questionId: string;
  kind: QuestionKind;
  isCorrect: boolean;
  answerCorrect: boolean;
  reasonCorrect: boolean;
  selectedAnswer: string;
  selectedReason: string;
  attemptIndex: number;
  runWrongAfter: number;
  /** 이 오답으로 귀환이 결정됨 */
  triggeredReturn: boolean;
}

export interface ActivityFeedback {
  pulmonaryCorrect: boolean;
  systemicCorrect: boolean;
  missingPulmonary: NodeId[];
  extraPulmonary: NodeId[];
  missingSystemic: NodeId[];
  extraSystemic: NodeId[];
}

/** 게임 전체 상태 = 저장되는 학습 기록 + 이번 화면에서만 쓰는 상태 */
export interface GameState extends LearningRecord {
  dialogue: DialogueState | null;
  travel: TravelState | null;
  feedback: FeedbackInfo | null;
  activityFeedback: ActivityFeedback | null;
  recheckIndex: number;
  escapeStage: 'dialogue' | 'message';
}

export type QuestionStatus = 'first-correct' | 'hint-correct' | 'wrong-then-solved' | 'needs-review' | 'unchecked';

export const STATUS_META: Record<QuestionStatus, { icon: string; label: string }> = {
  'first-correct': { icon: '✓', label: '처음부터 정답' },
  'hint-correct': { icon: '💡', label: '힌트 후 정답' },
  'wrong-then-solved': { icon: '↻', label: '처음에는 오답, 이후 해결' },
  'needs-review': { icon: '!', label: '보충 학습 필요' },
  unchecked: { icon: '○', label: '아직 확인하지 않음' },
};
