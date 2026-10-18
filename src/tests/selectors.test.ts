// 화면 표시용 선택자(src/state/selectors.ts) 자동 검증.
// 핵심 규칙: 해결 전 핵심 단계의 장소 이름은 HUD·지도에 나오지 않는다.

import { describe, expect, it } from 'vitest';
import { CIRCULATION_ACTIVITY, getQuestion } from '../data/questions';
import { MAP_EDGES, MAP_NODES } from '../data/map';
import { ROUTE, STEP_MAP } from '../data/route';
import type { NodeId, Question } from '../data/types';
import * as L from '../state/logic';
import {
  choiceText,
  conceptsForResponse,
  isReasonOnlyMiss,
  locationLabel,
  mapCurrentNode,
  nodeStatuses,
  progressCounts,
  questionStatus,
  recheckConceptIds,
  sceneLocation,
  shuffledIds,
  stepAt,
  supplementConceptIds,
  visibleEdges,
} from '../state/selectors';
import type { GameState, ResponseRecord } from '../state/types';

// ── 도움 함수 ───────────────────────────────────────────────

let clock = 50_000;
const tick = () => (clock += 10);
const NO_LIMIT: L.RuleOptions = { maxWrongPerRun: 999 };
const P: NodeId[] = [...CIRCULATION_ACTIVITY.pulmonary];
const S: NodeId[] = [...CIRCULATION_ACTIVITY.systemic];

const drain = (g: GameState): GameState => {
  for (let guard = 0; g.dialogue && guard < 100; guard++) g = L.advanceDialogue(g, NO_LIMIT, tick());
  return g;
};
function settle(g: GameState): GameState {
  for (let guard = 0; guard < 300; guard++) {
    if (g.dialogue) g = L.advanceDialogue(g, NO_LIMIT, tick());
    else if (g.phase === 'travel') g = L.arrive(g, tick());
    else return g;
  }
  throw new Error('진행이 멈추지 않음');
}
const currentQ = (g: GameState): Question => getQuestion(L.currentStep(g).questionId);
function toQuestion(g: GameState): GameState {
  if (g.phase === 'question') return g;
  for (const c of L.currentStep(g).clues) {
    if (L.canInfer(g)) break;
    g = L.observeClue(g, c.id, tick());
  }
  return L.openQuestion(g, tick());
}
function submitIds(g: GameState, answerId: string, reasonId: string): GameState {
  g = toQuestion(g);
  return L.submitAnswer(g, { questionId: currentQ(g).id, answerId, reasonId }, tick(), NO_LIMIT);
}
const correct = (g: GameState) => submitIds(g, currentQ(g).correctAnswer, currentQ(g).correctReason);
function wrong(g: GameState): GameState {
  const q = currentQ(g);
  return submitIds(g, q.options.find((o) => o.id !== q.correctAnswer)!.id, q.reasonOptions.find((o) => o.id !== q.correctReason)!.id);
}
const solve = (g: GameState) => settle(L.continueAfterFeedback(correct(g), NO_LIMIT, tick()));

/** 이 단계가 풀리기 전 숨겨야 하는 이름: 핵심 단계는 자기 정답, 복습 단계는 같은 장소의 다음 핵심 단계 정답 */
function hiddenTerms(i: number): string[] {
  const step = ROUTE[i];
  if (step.kind === 'core') return step.answerTerms;
  const next = ROUTE.slice(i + 1).find((s) => s.kind === 'core');
  return next && next.locationId === step.locationId ? next.answerTerms : [];
}

function solvedSteps(g: GameState): Set<string> {
  return new Set(ROUTE.filter((s) => g.latest[s.questionId]?.solved).map((s) => s.id));
}

/** 해결 전 화면에서 정답 이름이 드러나지 않는지 확인 */
function checkHidden(g: GameState, i: number, where: string) {
  const step = ROUTE[i];
  expect(stepAt(g).id, where).toBe(step.id);
  const label = locationLabel(g);
  for (const t of hiddenTerms(i)) expect(label, `${where}: ${label}`).not.toContain(t);
  if (step.kind === 'core') {
    expect(g.latest[step.questionId]?.solved ?? false).toBe(false);
    expect(label).toBe('? (추론 중)');
    expect(mapCurrentNode(g), where).toBeNull();
  } else if (!g.discovered.includes(step.locationId as NodeId)) {
    expect(label).toBe('? (아직 모르는 곳)');
    expect(mapCurrentNode(g), where).toBeNull();
  }
  // 지도의 연결선은 그 선을 밝히는 핵심 단계를 해결했을 때만 보인다
  const solved = solvedSteps(g);
  const edges = visibleEdges(g);
  for (const e of edges) expect(solved.has(e.revealedBy), `${where}: ${e.from}→${e.to}`).toBe(true);
  expect(edges).toHaveLength(MAP_EDGES.filter((e) => solved.has(e.revealedBy)).length);
  expect(sceneLocation(g)).toBe(step.locationId);
}

// ── 정답 노출 방지 ─────────────────────────────────────────

describe('HUD 위치 이름·지도 현재 위치·연결선', () => {
  it('모든 단계에서 해결 전에는 정답 이름이 나오지 않고, 해결 후에는 이름이 나온다', () => {
    let g = L.newGame('sel', 0);
    expect(locationLabel(g)).toBe('놀이공원');
    expect(mapCurrentNode(g)).toBeNull();
    expect(sceneLocation(g)).toBe('park');
    while (g.dialogue?.kind === 'introPark') g = L.advanceDialogue(g, NO_LIMIT, tick());
    expect(sceneLocation(g)).toBe('lv'); // 혈액 속에서 깨어나는 장면
    expect(locationLabel(g)).toBe('? (추론 중)'); // 깨어난 뒤에는 위치를 모른다
    while (g.phase === 'intro') g = L.advanceDialogue(g, NO_LIMIT, tick());

    for (let i = 0; i < ROUTE.length; i++) {
      const step = ROUTE[i];
      if (g.phase === 'travel') {
        checkHidden(g, i, `${step.id} 이동 중`);
        g = L.arrive(g, tick());
      }
      expect(g.phase).toBe('arrival');
      checkHidden(g, i, `${step.id} 도착`);
      g = drain(g);
      expect(g.phase).toBe('observe');
      checkHidden(g, i, `${step.id} 관찰`);
      g = toQuestion(g);
      expect(g.phase).toBe('question');
      checkHidden(g, i, `${step.id} 추론`);
      if (step.kind === 'core') {
        g = wrong(g);
        expect(g.phase).toBe('feedback');
        checkHidden(g, i, `${step.id} 오답 설명`);
        g = L.continueAfterFeedback(g, NO_LIMIT, tick());
        checkHidden(g, i, `${step.id} 다시 추론`);
      }
      g = correct(g);
      expect(g.feedback?.isCorrect).toBe(true);
      if (step.kind === 'core') {
        expect(locationLabel(g)).toBe(step.solvedName);
        expect(mapCurrentNode(g)).toBe(step.locationId);
        expect(visibleEdges(g).map((e) => e.revealedBy)).toContain(step.id);
      }
      g = drain(L.continueAfterFeedback(g, NO_LIMIT, tick()));
    }
    expect(g.phase).toBe('activity');
    expect(locationLabel(g)).toBe('좌심실(출발점)');
    expect(mapCurrentNode(g)).toBe('lv');
    expect(sceneLocation(g)).toBe('lv');
    expect(visibleEdges(g)).toHaveLength(MAP_EDGES.length);

    g = drain(L.finishActivity(L.submitActivity(g, P, S, tick()), tick()));
    // 핵심 단계마다 한 번씩 틀렸으므로 재확인을 거친다
    expect(g.phase).toBe('recheck');
    for (let guard = 0; g.phase === 'recheck' && guard < 30; guard++) {
      expect(locationLabel(g)).toBe('좌심실(출발점)');
      expect(sceneLocation(g)).toBe('lv');
      g = L.answerRecheck(g, recheckConceptIds(g)[g.recheckIndex], true, true, tick());
      g = drain(L.nextRecheck(g, tick()));
    }
    expect(g.phase).toBe('escape');
    expect(locationLabel(g)).toBe('놀이공원');
    expect(mapCurrentNode(g)).toBeNull();
    expect(sceneLocation(g)).toBe('park');
  });

  it('복습 단계의 위치 이름은 지도에 이미 나타난 지점일 때만 보인다', () => {
    let g = L.newGame('sel-review', 0);
    g = settle(g);
    g = solve(g); // S1 → R1(대동맥: S1이 밝혀 둔 지점)
    expect(L.currentStep(g).id).toBe('R1');
    expect(locationLabel(g)).toBe(MAP_NODES.aorta.name);
    expect(mapCurrentNode(g)).toBe('aorta');
    g = solve(solve(solve(g))); // R1, S2, R6 → R4(대정맥 단계보다 먼저)
    expect(L.currentStep(g).id).toBe('R4');
    expect(locationLabel(g)).toBe('? (아직 모르는 곳)');
    expect(locationLabel(g)).not.toContain(STEP_MAP.S3.solvedName);
    expect(mapCurrentNode(g)).toBeNull();
  });

  it('기억한 구역(이미 해결한 단계)을 다시 지날 때는 이름을 보여 준다', () => {
    let g = settle(L.newGame('sel-remember', 0));
    g = solve(g); // S1
    // S2에서 4번 틀려 귀환(기본 규칙)
    for (let i = 0; i < 4; i++) {
      g = L.continueAfterFeedback(g, undefined, tick());
      if (g.phase !== 'question') g = settle(g);
      if (L.currentStep(g).id === 'R1') g = solve(g);
      g = toQuestion(g);
      const q = currentQ(g);
      g = L.submitAnswer(g, { questionId: q.id, answerId: q.options[1].id, reasonId: q.reasonOptions[1].id }, tick());
    }
    expect(g.pendingReturn).toBe(true);
    g = L.arrive(drain(L.continueAfterFeedback(g, undefined, tick())), tick());
    expect(g.phase).toBe('remembered');
    expect(locationLabel(g)).toBe(STEP_MAP.S1.solvedName);
    expect(mapCurrentNode(g)).toBe('lv');
  });
});

// ── 학습 상태 ───────────────────────────────────────────────

describe('문항 학습 상태(questionStatus)', () => {
  it('다섯 가지 상태를 모두 구분한다', () => {
    let g = settle(L.newGame('status', 0));
    g = solve(g); // S1: 처음부터 정답
    g = toQuestion(g);
    g = L.revealHint(g, 'q-r1', tick());
    g = solve(g); // R1: 힌트 후 정답
    g = wrong(g); // S2: 오답 후 해결
    g = solve(L.continueAfterFeedback(g, NO_LIMIT, tick()));
    g = settle(L.continueAfterFeedback(wrong(g), NO_LIMIT, tick())); // R6: 복습 오답(미해결로 남음)
    g = solve(g); // R4
    g = wrong(g); // S3: 오답, 아직 미해결

    expect(questionStatus(g, 'q-s1')).toBe('first-correct');
    expect(questionStatus(g, 'q-r1')).toBe('hint-correct');
    expect(questionStatus(g, 'q-s2')).toBe('wrong-then-solved');
    expect(questionStatus(g, 'q-r6')).toBe('needs-review');
    expect(questionStatus(g, 'q-s3')).toBe('needs-review');
    expect(questionStatus(g, 'q-s4')).toBe('unchecked');

    // 지도 노드 배지
    expect(nodeStatuses(g, 'lv')).toEqual([
      { stepId: 'S1', status: 'first-correct' },
      { stepId: 'S10', status: 'unchecked' },
    ]);
    expect(nodeStatuses(g, 'venaCava')).toEqual([{ stepId: 'S3', status: 'needs-review' }]);

    expect(progressCounts(g)).toEqual({ coreSolved: 2, coreTotal: 10, reviewDone: 3, reviewTotal: 6 });
  });

  it('힌트를 쓰고 처음에 틀렸다가 해결하면 wrong-then-solved(첫 응답 기준)', () => {
    let g = toQuestion(settle(L.newGame('status2', 0)));
    g = L.revealHint(g, 'q-s1', tick());
    g = wrong(g);
    g = correct(L.continueAfterFeedback(g, NO_LIMIT, tick()));
    expect(questionStatus(g, 'q-s1')).toBe('wrong-then-solved');
  });

  it('위치만 맞힌 최초 응답을 reasonOnly로 판별한다', () => {
    let g = toQuestion(settle(L.newGame('ro', 0)));
    g = submitIds(g, 's1-a-lv-aorta', 's1-r-lung');
    expect(isReasonOnlyMiss(g, 'q-s1')).toBe(true);
    g = correct(L.continueAfterFeedback(g, NO_LIMIT, tick()));
    expect(isReasonOnlyMiss(g, 'q-s1')).toBe(true); // 최초 응답 기준이므로 그대로
    expect(isReasonOnlyMiss(g, 'q-s2')).toBe(false);
  });
});

describe('보충 개념(supplementConceptIds)', () => {
  it('힌트 사용만으로는 개념을 추가하지 않는다', () => {
    let g = toQuestion(settle(L.newGame('sup', 0)));
    for (let i = 0; i < getQuestion('q-s1').hints.length; i++) g = L.revealHint(g, 'q-s1', tick());
    g = correct(g);
    expect(g.hintsRevealed['q-s1']).toBeGreaterThan(0);
    expect(supplementConceptIds(g)).toEqual([]);
    expect(recheckConceptIds(g)).toEqual([]);
  });

  it('오답의 위치·근거 선택에 맞는 개념을 순서대로, 중복 없이 모은다', () => {
    let g = toQuestion(settle(L.newGame('sup2', 0)));
    g = submitIds(g, 's1-a-rv-pa', 's1-r-oxygen'); // lv-wall, heart-sides + lv-wall
    g = submitIds(L.continueAfterFeedback(g, NO_LIMIT, tick()), 's1-a-lv-vc', 's1-r-force'); // artery-vein
    expect(supplementConceptIds(g)).toEqual(['lv-wall', 'heart-sides', 'artery-vein']);
    // 위치가 맞으면 근거 쪽 개념만
    g = submitIds(L.continueAfterFeedback(g, NO_LIMIT, tick()), 's1-a-lv-aorta', 's1-r-receive');
    expect(supplementConceptIds(g)).toEqual(['lv-wall', 'heart-sides', 'artery-vein', 'heart-chambers']);
  });

  it('활동은 첫 시도에서 틀린 범위만 개념으로 더한다', () => {
    const base = { responses: [] as ResponseRecord[] };
    const att = (pulmonaryCorrect: boolean, systemicCorrect: boolean) => ({ runId: 1, pulmonary: [], systemic: [], pulmonaryCorrect, systemicCorrect, at: 0 });
    expect(supplementConceptIds({ ...base, activityAttempts: [att(true, true), att(false, false)] })).toEqual([]);
    expect(supplementConceptIds({ ...base, activityAttempts: [att(false, true), att(true, true)] })).toEqual(CIRCULATION_ACTIVITY.conceptIds.pulmonary);
    expect(supplementConceptIds({ ...base, activityAttempts: [att(true, false)] })).toEqual(CIRCULATION_ACTIVITY.conceptIds.systemic);
  });

  it('conceptsForResponse: 정답은 개념 없음, 개념이 지정되지 않은 오답은 문항 개념으로 대신한다', () => {
    const q = getQuestion('q-s3');
    const r = (a: string, rs: string, isCorrect = false): ResponseRecord => ({
      questionId: q.id,
      runId: 1,
      selectedAnswer: a,
      selectedReason: rs,
      isCorrect,
      answerCorrect: a === q.correctAnswer,
      reasonCorrect: rs === q.correctReason,
      hintsUsed: 0,
      attemptIndex: 1,
      kind: 'core',
      countedAsMistake: !isCorrect,
      at: 0,
    });
    expect(conceptsForResponse(r(q.correctAnswer, q.correctReason, true))).toEqual([]);
    expect(conceptsForResponse(r('s3-a-pv', 's3-r-oxygen'))).toEqual(['systemic-path', 'artery-vein']);
    const bare: Question = { ...q, misconceptionConcepts: {} };
    expect(conceptsForResponse(r('s3-a-pv', q.correctReason), bare)).toEqual(q.conceptIds);
  });
});

// ── 기타 선택자 ─────────────────────────────────────────────

describe('기타 선택자', () => {
  it('shuffledIds는 같은 시드에 같은 순열을, 다른 시드에 다른 순열을 낸다', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const x = shuffledIds(ids, 'seed');
    expect(shuffledIds(ids, 'seed')).toEqual(x);
    expect([...x].sort()).toEqual(ids);
    expect(ids).toEqual(['a', 'b', 'c', 'd', 'e']); // 원본을 바꾸지 않는다
    const variants = new Set(Array.from({ length: 20 }, (_, i) => shuffledIds(ids, `s${i}`).join('')));
    expect(variants.size).toBeGreaterThan(5);
  });

  it('choiceText는 위치·근거 선택지의 문구를 찾고, 없으면 id를 돌려준다', () => {
    const q = getQuestion('q-s1');
    expect(choiceText(q, 's1-a-lv-aorta')).toBe('좌심실 → 대동맥');
    expect(choiceText(q, q.correctReason)).toBe(q.reasonOptions.find((o) => o.id === q.correctReason)!.text);
    expect(choiceText(q, 'unknown-id')).toBe('unknown-id');
  });

  it('stepAt은 범위를 벗어난 stepIndex를 안전하게 자른다', () => {
    expect(stepAt({ stepIndex: -5 }).id).toBe(ROUTE[0].id);
    expect(stepAt({ stepIndex: 99 }).id).toBe(ROUTE[ROUTE.length - 1].id);
  });

  it('처음부터 끝까지 정답이면 진행 수가 모두 찬다', () => {
    let g = settle(L.newGame('progress', 0));
    expect(progressCounts(g)).toEqual({ coreSolved: 0, coreTotal: 10, reviewDone: 0, reviewTotal: 6 });
    for (let guard = 0; g.phase !== 'activity' && guard < 40; guard++) g = solve(g);
    expect(progressCounts(g)).toEqual({ coreSolved: 10, coreTotal: 10, reviewDone: 6, reviewTotal: 6 });
  });
});
