// 결과 보고서(src/report/buildReport.ts, reportText.ts) 자동 검증.
// 실제 규칙(logic.ts)으로 응답을 쌓은 기록에서 보고서를 만든다.

import { describe, expect, it } from 'vitest';
import { getConcept } from '../data/concepts';
import { GAME_CONFIG } from '../data/config';
import { CIRCULATION_ACTIVITY, getQuestion } from '../data/questions';
import { ROUTE, STEP_MAP } from '../data/route';
import type { NodeId, Question } from '../data/types';
import { buildReport } from '../report/buildReport';
import { reportToText } from '../report/reportText';
import * as L from '../state/logic';
import { choiceText, recheckConceptIds } from '../state/selectors';
import type { GameState } from '../state/types';

// ── 도움 함수 ───────────────────────────────────────────────

let clock = 10_000;
const tick = () => (clock += 10);
const MAX = GAME_CONFIG.maxWrongPerRun;
const NO_LIMIT: L.RuleOptions = { maxWrongPerRun: 999 };
const P: NodeId[] = [...CIRCULATION_ACTIVITY.pulmonary];
const S: NodeId[] = [...CIRCULATION_ACTIVITY.systemic];
/** 금지 용어(소스에 그대로 쓰지 않도록 나누어 적는다) */
const FORBIDDEN = ['정맥' + '혈', '동맥' + '혈'];

function settle(g: GameState, rules?: L.RuleOptions): GameState {
  for (let guard = 0; guard < 300; guard++) {
    if (g.dialogue) g = L.advanceDialogue(g, rules, tick());
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
  g = L.openQuestion(g, tick());
  expect(g.phase).toBe('question');
  return g;
}

function submitIds(g: GameState, answerId: string, reasonId: string, rules?: L.RuleOptions): GameState {
  g = toQuestion(g);
  const next = L.submitAnswer(g, { questionId: currentQ(g).id, answerId, reasonId }, tick(), rules);
  expect(next.phase).toBe('feedback');
  return next;
}

function correct(g: GameState, rules?: L.RuleOptions): GameState {
  const q = currentQ(g);
  return submitIds(g, q.correctAnswer, q.correctReason, rules);
}

function firstWrong(q: Question, n = 0) {
  return {
    a: q.options.filter((o) => o.id !== q.correctAnswer)[n % (q.options.length - 1)].id,
    r: q.reasonOptions.filter((o) => o.id !== q.correctReason)[n % (q.reasonOptions.length - 1)].id,
  };
}

const proceed = (g: GameState, rules?: L.RuleOptions) => settle(L.continueAfterFeedback(g, rules, tick()), rules);
const solve = (g: GameState, rules?: L.RuleOptions) => proceed(correct(g, rules), rules);

function startGame(sessionId: string): GameState {
  const g = settle(L.newGame(sessionId, 0));
  expect(L.currentStep(g).id).toBe('S1');
  return g;
}

function advanceTo(g: GameState, stepId: string, rules?: L.RuleOptions): GameState {
  for (let guard = 0; !(L.currentStep(g).id === stepId && (g.phase === 'observe' || g.phase === 'question')); guard++) {
    if (guard > 40 || g.phase === 'activity') throw new Error(`${stepId}에 도착하지 못함`);
    g = solve(g, rules);
  }
  return g;
}

/** 남은 단계를 정답으로 풀고 활동·재확인을 마쳐 탈출한다 */
function finishGame(g: GameState, rules?: L.RuleOptions, activityFirst?: [NodeId[], NodeId[]]): GameState {
  for (let guard = 0; g.phase !== 'activity' && guard < 60; guard++) g = solve(g, rules);
  expect(g.phase).toBe('activity');
  if (activityFirst) g = L.submitActivity(g, activityFirst[0], activityFirst[1], tick());
  g = L.submitActivity(g, P, S, tick());
  g = settle(L.finishActivity(g, tick()));
  while (g.phase === 'recheck') {
    const id = recheckConceptIds(g)[g.recheckIndex];
    const c = getConcept(id);
    g = L.answerRecheck(g, id, c.recheck.answer, c.recheck.answer, tick());
    g = settle(L.nextRecheck(g, tick()));
  }
  expect(g.escaped).toBe(true);
  return g;
}

const report = (g: GameState, now = g.startedAt + 12 * 60_000) => buildReport(L.toRecord(g), now);

// ── 보고서 내용 ─────────────────────────────────────────────

describe('진행 중 보고서', () => {
  it('첫 답·근거 텍스트가 실리고, 해결하지 못한 핵심 문항의 정답은 공개하지 않는다', () => {
    let g = startGame('rep-mid');
    g = submitIds(g, 's1-a-rv-pa', 's1-r-lung'); // S1 첫 응답: 오답
    g = solve(L.continueAfterFeedback(g, undefined, tick())); // S1 해결
    g = solve(g); // R1
    g = submitIds(g, 's2-a-lungcap', 's2-r-alveoli'); // S2 오답(미해결 상태로 저장)

    const r = report(g, g.startedAt + 5 * 60_000);
    expect(r.title).toBe('탐험 중간 기록');
    expect(r.complete).toBe(false);
    expect(r.elapsedMinutes).toBe(5);
    expect(r.runWrong).toBe(2);
    expect(r.maxWrong).toBe(MAX);

    const q1 = getQuestion('q-s1');
    const s1 = r.wrongItems.find((i) => i.questionId === 'q-s1');
    expect(s1).toMatchObject({
      status: 'wrong-then-solved',
      label: '1단계 · 좌심실',
      firstAnswerText: '우심실 → 폐동맥',
      firstReasonText: choiceText(q1, 's1-r-lung'),
      firstAnswerCorrect: false,
      firstReasonCorrect: false,
      correctAnswerText: choiceText(q1, q1.correctAnswer),
      correctReasonText: choiceText(q1, q1.correctReason),
      explanation: q1.explanation,
      resolved: true,
      resolvedRunId: 1,
      attempts: 2,
    });
    expect(s1?.firstFeedback).toEqual([q1.misconceptionFeedback['s1-a-rv-pa'], q1.misconceptionFeedback['s1-r-lung']]);
    // 아직 풀지 않은 단계의 장소 이름(우심실·우심방)이 들어 있는 개념은 탈출 전까지 숨긴다
    expect(s1?.conceptIds).toEqual([]);
    const full = buildReport({ ...L.toRecord(g), escaped: true }, g.startedAt + 5 * 60_000);
    expect(full.wrongItems.find((i) => i.questionId === 'q-s1')?.conceptIds).toEqual(['lv-wall', 'heart-sides']);

    const q2 = getQuestion('q-s2');
    const s2 = r.wrongItems.find((i) => i.questionId === 'q-s2');
    expect(s2).toMatchObject({
      status: 'needs-review',
      label: '2단계 · 아직 밝혀내지 못한 구역',
      firstAnswerText: choiceText(q2, 's2-a-lungcap'),
      firstReasonText: choiceText(q2, 's2-r-alveoli'),
      correctAnswerText: null,
      correctReasonText: null,
      explanation: null,
      resolved: false,
    });
    // 미해결 문항과 연결된 개념(이름에 정답 장소가 들어갈 수 있음)도 아직 보여 주지 않는다
    expect(s2?.conceptIds).toEqual([]);
    // lv-wall·heart-sides 설명에는 아직 풀지 않은 우심실·우심방이 나오므로 진행 중에는 숨긴다
    expect(r.conceptGroups.map((c) => c.concept.id)).toEqual([]);
    expect(r.conceptGroups.flatMap((c) => c.questionLabels)).not.toContain(s2?.label);
    expect(r.zones.map((z) => z.name).slice(0, 2)).toEqual(['좌심실', '아직 밝혀내지 못한 구역']);
    expect(r.core).toMatchObject({ solved: 1, 'wrong-then-solved': 1, 'needs-review': 1, unchecked: 8, total: 10 });
    expect(r.review).toEqual({ answered: 1, correctFirst: 1, total: 6 });

    const text = reportToText(r);
    expect(text).toContain('탐험 중간 기록');
    expect(text).toContain('(해결하면 공개됩니다)');
    expect(text).toContain(`나의 첫 답: ${choiceText(q2, 's2-a-lungcap')} / ${choiceText(q2, 's2-r-alveoli')}`);
    expect(text).toContain('재도전 결과: 아직 해결하지 못함');
    for (const t of [STEP_MAP.S2.solvedName, choiceText(q2, q2.correctAnswer), choiceText(q2, q2.correctReason)]) {
      expect(text).not.toContain(t);
    }

    // 해결한 뒤에는 정답·설명·개념이 공개된다
    g = correct(L.continueAfterFeedback(g, undefined, tick()));
    const r2 = report(g);
    const s2b = r2.wrongItems.find((i) => i.questionId === 'q-s2');
    expect(s2b).toMatchObject({
      status: 'wrong-then-solved',
      label: `2단계 · ${STEP_MAP.S2.solvedName}`,
      correctAnswerText: choiceText(q2, q2.correctAnswer),
      correctReasonText: choiceText(q2, q2.correctReason),
      explanation: q2.explanation,
      resolved: true,
      attempts: 2,
      firstAnswerText: choiceText(q2, 's2-a-lungcap'), // 첫 답은 그대로
    });
    // pulmonary-exchange 설명에는 아직 풀지 않은 7단계의 '폐포'가 나오므로 진행 중에는 숨긴다
    expect(s2b?.conceptIds).toEqual(['systemic-exchange']);
    const groups = Object.fromEntries(r2.conceptGroups.map((c) => [c.concept.id, c.questionLabels]));
    expect(groups['systemic-exchange']).toEqual([`2단계 · ${STEP_MAP.S2.solvedName}`]);
    expect(reportToText(r2)).toContain(`정답: ${choiceText(q2, q2.correctAnswer)} / ${choiceText(q2, q2.correctReason)}`);
  });

  it('어느 핵심 단계에서 어떤 오답을 골라도, 해결 전 보고서에는 정답·설명·개념이 나오지 않는다', () => {
    for (const step of ROUTE.filter((s) => s.kind === 'core')) {
      const q = getQuestion(step.questionId);
      const base = advanceTo(startGame(`leak-${step.id}`), step.id);
      const wrongs = [
        ...q.options.filter((o) => o.id !== q.correctAnswer).map((o) => [o.id, q.correctReason]),
        ...q.reasonOptions.filter((o) => o.id !== q.correctReason).map((o) => [q.correctAnswer, o.id]),
      ];
      for (const [a, rs] of wrongs) {
        const g = submitIds(base, a, rs);
        const r = report(g);
        const item = r.wrongItems.find((i) => i.questionId === q.id);
        expect(item, `${step.id} ${a}/${rs}`).toBeDefined();
        expect(item).toMatchObject({ correctAnswerText: null, correctReasonText: null, explanation: null, conceptIds: [] });
        expect(item?.label).toBe(`${step.order}단계 · 아직 밝혀내지 못한 구역`);
        // 앞 단계는 모두 처음부터 정답이므로 보충 개념 묶음이 비어 있어야 한다
        expect(r.conceptGroups, `${step.id} ${a}/${rs}`).toEqual([]);
        expect(reportToText(r)).not.toContain(q.explanation);
      }
    }
  });
});

describe('위치는 맞혔지만 근거가 틀린 경우', () => {
  it('reasonOnly로 따로 분류하고 텍스트에도 표시한다', () => {
    let g = startGame('rep-reason');
    g = submitIds(g, 's1-a-lv-aorta', 's1-r-oxygen'); // 위치 정답 + 근거 오답
    g = solve(L.continueAfterFeedback(g, undefined, tick()));
    g = advanceTo(g, 'S2');
    g = submitIds(g, 's2-a-artery', 's2-r-cells'); // 위치 오답 + 근거 정답
    g = solve(L.continueAfterFeedback(g, undefined, tick()));

    const r = report(g);
    expect(r.wrongItems.map((i) => i.questionId)).toEqual(['q-s1', 'q-s2']);
    expect(r.reasonOnlyItems.map((i) => i.questionId)).toEqual(['q-s1']);
    const s1 = r.reasonOnlyItems[0];
    expect(s1).toMatchObject({ reasonOnly: true, firstAnswerCorrect: true, firstReasonCorrect: false });
    // 위치가 맞았으므로 근거에 대한 설명만 붙는다
    expect(s1.firstFeedback).toEqual([getQuestion('q-s1').misconceptionFeedback['s1-r-oxygen']]);
    expect(r.zones[0].reasonOnly).toBe(true);
    expect(r.zones[1].reasonOnly).toBe(false);
    expect(reportToText(r)).toContain('위치는 맞혔지만 근거 확인이 필요함');
  });
});

describe('보충 개념 묶음', () => {
  it('같은 개념을 진단한 여러 문항(S6 산소가 적어서 정맥, S8 산소가 풍부해서 동맥)을 하나로 묶는다', () => {
    let g = advanceTo(startGame('rep-concept'), 'S6');
    g = submitIds(g, 's6-a-pa', 's6-r-lowo2');
    g = advanceTo(L.continueAfterFeedback(g, undefined, tick()), 'S8');
    g = submitIds(g, 's8-a-pv', 's8-r-richo2');
    g = solve(L.continueAfterFeedback(g, undefined, tick()));

    const r = report(g);
    expect(r.conceptGroups).toHaveLength(1);
    expect(r.conceptGroups[0].concept.id).toBe('artery-vein');
    expect(r.conceptGroups[0].questionLabels).toEqual(['6단계 · 폐동맥', '8단계 · 폐정맥']);
    expect(r.reasonOnlyItems.map((i) => i.questionId)).toEqual(['q-s6', 'q-s8']);
    const text = reportToText(r);
    expect(text).toContain(`■ ${getConcept('artery-vein').name}  (관련: 6단계 · 폐동맥, 8단계 · 폐정맥)`);
  });

  it('같은 문항을 여러 번 틀려도 관련 문항 이름은 한 번만, 이후 시도에서 드러난 개념도 포함한다', () => {
    let g = startGame('rep-repeat');
    g = submitIds(g, 's1-a-lv-vc', 's1-r-force'); // artery-vein
    g = submitIds(L.continueAfterFeedback(g, undefined, tick()), 's1-a-la-aorta', 's1-r-force'); // heart-chambers
    g = submitIds(L.continueAfterFeedback(g, undefined, tick()), 's1-a-lv-vc', 's1-r-force'); // artery-vein 다시
    g = solve(L.continueAfterFeedback(g, undefined, tick()));
    // 진행 중에는 아직 풀지 않은 장소 이름(폐동맥·우심방 등)이 들어 있는 개념 설명을 숨긴다
    expect(report(g).conceptGroups).toEqual([]);
    const r = buildReport({ ...L.toRecord(g), escaped: true }, g.startedAt + 12 * 60_000);
    expect(r.conceptGroups.map((c) => c.concept.id)).toEqual(['artery-vein', 'heart-chambers']);
    for (const c of r.conceptGroups) expect(c.questionLabels).toEqual(['1단계 · 좌심실']);
    // 틀렸던 문제 목록에는 최초 응답 기준의 개념만
    expect(r.wrongItems[0].conceptIds).toEqual(['artery-vein']);
    expect(r.wrongItems[0].attempts).toBe(4);
  });

  it('힌트만 사용하고 맞힌 경우에는 보충 개념을 만들지 않는다', () => {
    let g = toQuestion(startGame('rep-hint'));
    g = L.revealHint(g, 'q-s1', tick());
    g = solve(g);
    g = toQuestion(g);
    g = L.revealHint(g, 'q-r1', tick());
    g = solve(g);

    const r = report(g);
    expect(r.conceptGroups).toEqual([]);
    expect(r.wrongItems).toEqual([]);
    expect(r.core['hint-correct']).toBe(1);
    expect(r.core['first-correct']).toBe(0);
    expect(r.totalHints).toBe(2);
    expect(r.hintItems).toEqual([
      { label: '1단계 · 좌심실', hints: 1, status: 'hint-correct' },
      { label: '복습 1 · 적혈구', hints: 1, status: 'hint-correct' },
    ]);
    const text = reportToText(r);
    expect(text).toContain('[틀렸던 문제] 없음');
    expect(text).toContain('[힌트 사용]');
    expect(text).not.toContain('[보충할 개념]');
  });

  it('마지막 활동의 첫 시도에서 틀린 범위는 활동 개념으로 묶인다', () => {
    const g = finishGame(startGame('rep-activity'), undefined, [
      ['ra', 'rv', 'pa', 'lungCap', 'pv'],
      ['lv', 'aorta', 'sysCap', 'venaCava', 'la'],
    ]);
    const r = report(g);
    expect(r.activity).toEqual({ attempts: 2, solved: true, firstCorrect: false });
    expect(r.conceptGroups.map((c) => [c.concept.id, c.questionLabels])).toEqual([
      ['pulmonary-path', ['마지막 활동 · 허파순환 범위']],
      ['systemic-path', ['마지막 활동 · 온몸순환 범위']],
    ]);
    expect(reportToText(r)).toContain('완료(다시 생각한 뒤 해결)');
  });
});

describe('재시작과 탈출', () => {
  it('출발점으로 돌아가도 처음 고른 오답이 보고서에 남고, 탈출하면 제목이 바뀐다', () => {
    let g = startGame('rep-restart');
    g = submitIds(g, 's1-a-la-aorta', 's1-r-receive'); // 첫 응답
    for (let i = 1; i <= MAX; i++) {
      const w = firstWrong(getQuestion('q-s1'), i);
      g = submitIds(L.continueAfterFeedback(g, undefined, tick()), w.a, w.r);
    }
    expect(g.pendingReturn).toBe(true);
    g = proceed(g); // 귀환 → 새 탐험 → S1 다시 관찰

    const mid = report(g);
    expect(mid.title).toBe('탐험 중간 기록');
    expect(mid.restartCount).toBe(1);
    expect(mid.runId).toBe(2);
    expect(mid.returnLog).toHaveLength(1);
    expect(mid.wrongItems[0]).toMatchObject({ questionId: 'q-s1', firstAnswerText: '좌심방 → 대동맥', correctAnswerText: null });

    g = finishGame(g);
    const r = report(g);
    expect(r.title).toBe('탈출 성공');
    expect(r.complete).toBe(true);
    expect(r.restartCount).toBe(1);
    expect(r.core).toMatchObject({ solved: 10, 'first-correct': 9, 'wrong-then-solved': 1, 'needs-review': 0, unchecked: 0 });
    expect(r.review).toEqual({ answered: 6, correctFirst: 6, total: 6 });
    expect(r.wrongItems).toHaveLength(1);
    expect(r.wrongItems[0]).toMatchObject({
      questionId: 'q-s1',
      firstAnswerText: '좌심방 → 대동맥',
      firstReasonText: choiceText(getQuestion('q-s1'), 's1-r-receive'),
      status: 'wrong-then-solved',
      attempts: MAX + 2,
      resolvedRunId: 2,
      correctAnswerText: '좌심실 → 대동맥',
    });
    // 재확인 결과가 개념 묶음에 붙는다
    const hc = r.conceptGroups.find((c) => c.concept.id === 'heart-chambers');
    expect(hc?.recheck?.correct).toBe(true);
    expect(r.reviewRows.map((z) => z.name)).toEqual([
      '복습 1 · 적혈구',
      '복습 2 · 혈장',
      '복습 3 · 백혈구',
      '복습 4 · 혈소판',
      '복습 5 · 혈관 구조',
      '복습 6 · 세포호흡',
    ]);

    const text = reportToText(r);
    expect(text).toContain('탈출 성공');
    expect(text).toContain('재시작 1회');
    expect(text).toContain(`재도전 결과: 해결함(${MAX + 2}번째 시도)`);
    expect(text).toContain('마지막 재확인: 맞힘');
    expect(text).toContain('완료(처음부터 정답)');
  });
});

describe('보고서 텍스트', () => {
  it('주요 구역이 모두 들어가고 금지 용어가 없다', () => {
    // 모든 핵심·복습 문항의 첫 응답을 오답으로 하고(귀환 없음 설정), 이후 해결해 모든 개념 문장이 나오게 한다
    let g = startGame('rep-text');
    for (let guard = 0; g.phase !== 'activity' && guard < 60; guard++) {
      const q = currentQ(g);
      const w = firstWrong(q);
      g = submitIds(g, w.a, w.r, NO_LIMIT);
      g = proceed(g, NO_LIMIT);
      if (q.kind === 'core') g = solve(g, NO_LIMIT);
    }
    g = finishGame(g, NO_LIMIT, [[...S], [...P]]);
    const r = report(g);
    expect(r.core['wrong-then-solved']).toBe(10);
    expect(r.review.correctFirst).toBe(0);
    expect(r.wrongItems).toHaveLength(10 + 6);
    expect(r.conceptGroups.length).toBeGreaterThan(5);

    const texts = [reportToText(report(L.newGame('empty', 0))), reportToText(r)];
    for (const text of texts) {
      for (const section of ['학습 진단 보고서', '[핵심 10단계]', '[복습 6개]', '[틀렸던 문제]', '[허파순환·온몸순환 범위 활동]', '설명 활동:']) {
        expect(text).toContain(section);
      }
      for (const bad of FORBIDDEN) expect(text).not.toContain(bad);
    }
    const full = texts[1];
    expect(full).toContain('[보충할 개념]');
    expect(full).toContain('설명: ');
    expect(full).toContain('다시 생각하기: ');
    for (const g2 of r.conceptGroups) expect(full).toContain(g2.concept.name);
    // 빈 기록
    const empty = report(L.newGame('empty', 0));
    expect(empty.title).toBe('탐험 중간 기록');
    expect(empty.core.unchecked).toBe(10);
    expect(empty.activity).toEqual({ attempts: 0, solved: false, firstCorrect: null });
    expect(reportToText(empty)).toContain('아직 하지 않음');
  });
});

describe('진행 중 보고서의 정답 노출 방지', () => {
  it('앞 단계에서 틀렸더라도 중간 보고서에 아직 풀지 않은 단계의 장소 이름이 나오지 않는다', () => {
    let g = startGame('rep-leak');
    g = advanceTo(g, 'S3');
    g = submitIds(g, 's3-a-pv', 's3-r-return');
    g = solve(L.continueAfterFeedback(g, undefined, tick()));
    g = advanceTo(g, 'S4');
    expect(reportToText(report(g))).not.toContain('우심방');
    g = advanceTo(g, 'S5');
    g = submitIds(g, 's5-a-lv', 's5-r-tolung');
    g = solve(L.continueAfterFeedback(g, undefined, tick()));
    g = advanceTo(g, 'S6');
    const text = reportToText(report(g));
    // '폐정맥'은 S3에서 학생이 직접 고른 첫 답이라 보고서에 남는다(정답 노출이 아님)
    for (const t of ['폐동맥', '좌심방']) expect(text).not.toContain(t);
  });
});
