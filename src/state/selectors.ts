// 상태에서 화면에 보여 줄 값을 계산하는 순수 함수들.
// 정답 노출 규칙: 아직 해결하지 않은 핵심 단계의 장소 이름은 HUD·지도에 나오지 않는다.

import { CIRCULATION_ACTIVITY, getQuestion } from '../data/questions';
import { MAP_EDGES, MAP_NODES } from '../data/map';
import { ROUTE, STEP_MAP } from '../data/route';
import type { LocationId, MapEdge, NodeId, Question } from '../data/types';
import type { GameState, LearningRecord, QuestionStatus, ResponseRecord } from './types';

type Rec = Pick<
  LearningRecord,
  'latest' | 'firstResponses' | 'responses' | 'discovered' | 'stepIndex' | 'activityAttempts' | 'phase' | 'escaped'
> & { dialogue?: { kind: string } | null };

export function stepAt(state: Pick<LearningRecord, 'stepIndex'>) {
  return ROUTE[Math.min(Math.max(state.stepIndex, 0), ROUTE.length - 1)];
}

/** 문항의 학습 상태(지도 배지·결과 보고서) */
export function questionStatus(state: Pick<LearningRecord, 'firstResponses' | 'latest'>, questionId: string): QuestionStatus {
  const first = state.firstResponses[questionId];
  if (!first) return 'unchecked';
  if (first.isCorrect) return first.hintsUsed > 0 ? 'hint-correct' : 'first-correct';
  return state.latest[questionId]?.solved ? 'wrong-then-solved' : 'needs-review';
}

/** 최초 응답에서 위치는 맞혔지만 근거가 틀린 경우 */
export function isReasonOnlyMiss(state: Pick<LearningRecord, 'firstResponses'>, questionId: string): boolean {
  const first = state.firstResponses[questionId];
  return !!first && first.answerCorrect && !first.reasonCorrect;
}

/** 오답 응답 1건이 진단하는 보충 개념 */
export function conceptsForResponse(r: ResponseRecord, q: Question = getQuestion(r.questionId)): string[] {
  if (r.isCorrect) return [];
  const ids = new Set<string>();
  if (!r.answerCorrect) for (const c of q.misconceptionConcepts[r.selectedAnswer] ?? []) ids.add(c);
  if (!r.reasonCorrect) for (const c of q.misconceptionConcepts[r.selectedReason] ?? []) ids.add(c);
  if (ids.size === 0) for (const c of q.conceptIds) ids.add(c);
  return [...ids];
}

/** 전체 학습에서 확인된 보충 개념(순서 유지, 중복 제거). 힌트 사용만으로는 추가하지 않는다. */
export function supplementConceptIds(state: Pick<LearningRecord, 'responses' | 'activityAttempts'>): string[] {
  const out: string[] = [];
  const add = (id: string) => {
    if (!out.includes(id)) out.push(id);
  };
  for (const r of state.responses) for (const c of conceptsForResponse(r)) add(c);
  const firstActivity = state.activityAttempts[0];
  if (firstActivity) {
    if (!firstActivity.pulmonaryCorrect) for (const c of CIRCULATION_ACTIVITY.conceptIds.pulmonary) add(c);
    if (!firstActivity.systemicCorrect) for (const c of CIRCULATION_ACTIVITY.conceptIds.systemic) add(c);
  }
  return out;
}

/** 마지막 재확인 대상 개념 */
export function recheckConceptIds(state: Pick<LearningRecord, 'responses' | 'activityAttempts'>): string[] {
  return supplementConceptIds(state);
}

/** HUD에 표시하는 현재 위치 이름. 해결 전 핵심 단계는 '?' */
export function locationLabel(state: Rec): string {
  // 탐사선에서 깨어난 뒤에는 아직 위치를 모른다
  if (state.phase === 'intro') return state.dialogue?.kind === 'introWake' ? '? (추론 중)' : '놀이공원';
  if (state.phase === 'escape') return '놀이공원';
  const step = stepAt(state);
  if (state.phase === 'activity' || state.phase === 'recheck') return '좌심실(출발점)';
  if (step.kind === 'core') {
    return state.latest[step.questionId]?.solved ? step.solvedName : '? (추론 중)';
  }
  const node = step.locationId as NodeId;
  return state.discovered.includes(node) ? MAP_NODES[node].name : '? (아직 모르는 곳)';
}

/** 지도에 '현재 위치' 표시를 할 노드. 해결 전 핵심 단계에서는 null(위치 비공개) */
export function mapCurrentNode(state: Rec): NodeId | null {
  if (state.phase === 'intro' || state.phase === 'escape') return null;
  const step = stepAt(state);
  const node = step.locationId as NodeId;
  if (state.phase === 'activity' || state.phase === 'recheck') return 'lv';
  if (step.kind === 'core') return state.latest[step.questionId]?.solved ? node : null;
  return state.discovered.includes(node) ? node : null;
}

export function visibleEdges(state: Pick<LearningRecord, 'latest'>): MapEdge[] {
  return MAP_EDGES.filter((e) => state.latest[STEP_MAP[e.revealedBy].questionId]?.solved);
}

/** 지도 노드의 학습 상태 배지(그 노드를 밝혀낸 핵심 단계들) */
export function nodeStatuses(state: Pick<LearningRecord, 'firstResponses' | 'latest'>, node: NodeId): { stepId: string; status: QuestionStatus }[] {
  const steps: Record<NodeId, string[]> = {
    lv: ['S1', 'S10'],
    aorta: ['S1'],
    sysCap: ['S2'],
    venaCava: ['S3'],
    ra: ['S4'],
    rv: ['S5'],
    pa: ['S6'],
    lungCap: ['S7'],
    pv: ['S8'],
    la: ['S9'],
  };
  return steps[node].map((stepId) => ({ stepId, status: questionStatus(state, STEP_MAP[stepId].questionId) }));
}

/** 3D 장면에 보여 줄 공간(이동 중에는 장면 쪽에서 from/to를 따로 처리한다) */
export function sceneLocation(state: Pick<GameState, 'phase' | 'dialogue' | 'stepIndex'>): LocationId {
  if (state.phase === 'escape') return 'park';
  if (state.phase === 'intro') return state.dialogue?.kind === 'introWake' ? 'lv' : 'park';
  if (state.phase === 'activity' || state.phase === 'recheck') return 'lv';
  return stepAt(state).locationId;
}

export function progressCounts(state: Pick<LearningRecord, 'latest' | 'firstResponses'>) {
  const core = ROUTE.filter((s) => s.kind === 'core');
  const review = ROUTE.filter((s) => s.kind === 'review');
  return {
    coreSolved: core.filter((s) => state.latest[s.questionId]?.solved).length,
    coreTotal: core.length,
    reviewDone: review.filter((s) => state.firstResponses[s.questionId]).length,
    reviewTotal: review.length,
  };
}

/** 표시 순서를 섞되 같은 시도에서는 항상 같은 순서가 나오게 한다(id로 채점하므로 순서와 무관). */
export function shuffledIds(ids: string[], seedText: string): string[] {
  let h = 2166136261;
  for (let i = 0; i < seedText.length; i++) {
    h ^= seedText.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const rand = () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...ids];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function optionOrder(state: Pick<LearningRecord, 'sessionId' | 'runId' | 'latest'>, questionId: string) {
  const q = getQuestion(questionId);
  const attempt = (state.latest[questionId]?.attempts ?? 0) + 1;
  const seed = `${state.sessionId}|${questionId}|${state.runId}|${attempt}`;
  return {
    answers: shuffledIds(q.options.map((o) => o.id), seed + '|a'),
    reasons: shuffledIds(q.reasonOptions.map((o) => o.id), seed + '|r'),
  };
}

export function choiceText(q: Question, id: string): string {
  return q.options.find((o) => o.id === id)?.text ?? q.reasonOptions.find((o) => o.id === id)?.text ?? id;
}
