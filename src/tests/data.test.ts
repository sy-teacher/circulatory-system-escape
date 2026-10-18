// 교육 데이터(src/data/*) 자동 검증: 문항·개념·경로·지도·심장 구조의 일관성과 과학 표현 규칙.

import { describe, expect, it } from 'vitest';
import * as conceptsMod from '../data/concepts';
import { CONCEPTS, CONCEPT_MAP, getConcept } from '../data/concepts';
import { GAME_CONFIG } from '../data/config';
import * as dialogueMod from '../data/dialogue';
import { buildIntroWake, buildReturnLines, introRuleLine, rememberedLine } from '../data/dialogue';
import * as heartMod from '../data/heart';
import { CHAMBERS, VALVE_LEAFLETS, wallComparison, type ChamberSpec } from '../data/heart';
import * as mapMod from '../data/map';
import { EXCHANGE_ZONES, MAP_COLOR_NOTE, MAP_EDGES, MAP_NODES, NODE_STEPS } from '../data/map';
import * as questionsMod from '../data/questions';
import { ALL_QUESTIONS, CIRCULATION_ACTIVITY, CORE_QUESTIONS, REVIEW_QUESTIONS, getQuestion } from '../data/questions';
import * as routeMod from '../data/route';
import { CIRCULATION_ORDER, ROUTE, STEP_MAP, getStep } from '../data/route';
import type { NodeId, Question, RouteStep } from '../data/types';
import { nodeStatuses } from '../state/selectors';

const CYCLE: NodeId[] = ['lv', 'aorta', 'sysCap', 'venaCava', 'ra', 'rv', 'pa', 'lungCap', 'pv', 'la'];
/** 금지 용어(소스에 그대로 쓰지 않도록 나누어 적는다) */
const FORBIDDEN = ['정맥' + '혈', '동맥' + '혈'];
const NEGATION = /(않|아니|아님|아닙|아냐|없이도)/;

// ── 문자열 수집 ─────────────────────────────────────────────

interface Str {
  path: string;
  text: string;
}

function collect(value: unknown, path: string, out: Str[], seen = new Set<object>()): Str[] {
  if (typeof value === 'string') out.push({ path, text: value });
  else if (Array.isArray(value)) value.forEach((v, i) => collect(v, `${path}[${i}]`, out, seen));
  else if (value && typeof value === 'object') {
    if (seen.has(value)) return out;
    seen.add(value);
    for (const [k, v] of Object.entries(value)) collect(v, `${path}.${k}`, out, seen);
  }
  return out;
}

/** data 폴더의 모든 문자열(함수가 만드는 대사 포함) */
function allDataStrings(): Str[] {
  const out: Str[] = [];
  collect(questionsMod, 'questions', out);
  collect(conceptsMod, 'concepts', out);
  collect(dialogueMod, 'dialogue', out);
  collect(routeMod, 'route', out);
  collect(mapMod, 'map', out);
  collect(heartMod, 'heart', out);
  for (const n of [1, 2, 3, 5]) {
    collect(buildIntroWake(n), `buildIntroWake(${n})`, out);
    collect(buildReturnLines(n), `buildReturnLines(${n})`, out);
    collect(introRuleLine(n), `introRuleLine(${n})`, out);
  }
  for (const s of ROUTE) collect(rememberedLine(s.solvedName), `rememberedLine(${s.id})`, out);
  for (const id of Object.keys(CHAMBERS) as ChamberSpec['id'][]) collect(wallComparison(id), `wallComparison(${id})`, out);
  return out;
}

/** 학생이 '판단할 대상'으로 보는 오개념 문장: 오답 선택지와 답이 '거짓'인 재확인 문장 */
function misconceptionTexts(): Set<string> {
  const s = new Set<string>();
  for (const q of ALL_QUESTIONS) {
    for (const o of q.options) if (o.id !== q.correctAnswer) s.add(o.text);
    for (const o of q.reasonOptions) if (o.id !== q.correctReason) s.add(o.text);
  }
  for (const c of CONCEPTS) if (!c.recheck.answer) s.add(c.recheck.statement);
  return s;
}

const ALL = allDataStrings();
const MISCONCEPTIONS = misconceptionTexts();

// ── 문항 ───────────────────────────────────────────────────

describe('문항 데이터', () => {
  it('핵심 10개 + 복습 6개, id가 겹치지 않는다', () => {
    expect(CORE_QUESTIONS).toHaveLength(10);
    expect(REVIEW_QUESTIONS).toHaveLength(6);
    expect(CORE_QUESTIONS.every((q) => q.kind === 'core')).toBe(true);
    expect(REVIEW_QUESTIONS.every((q) => q.kind === 'review')).toBe(true);
    const ids = ALL_QUESTIONS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    // 선택지 id는 전체 문항에서 유일(근거 묶음과 위치 묶음 사이도 겹치지 않음)
    const choiceIds = ALL_QUESTIONS.flatMap((q) => [...q.options, ...q.reasonOptions].map((o) => o.id));
    expect(new Set(choiceIds).size).toBe(choiceIds.length);
    expect(() => getQuestion('q-none')).toThrow();
  });

  it('정답 id가 선택지에 있고, 선택지 문구가 문항 안에서 겹치지 않는다', () => {
    for (const q of ALL_QUESTIONS) {
      expect(q.options.some((o) => o.id === q.correctAnswer), q.id).toBe(true);
      expect(q.reasonOptions.some((o) => o.id === q.correctReason), q.id).toBe(true);
      expect(q.options.length, q.id).toBeGreaterThanOrEqual(3);
      expect(q.reasonOptions.length, q.id).toBeGreaterThanOrEqual(3);
      const texts = [...q.options, ...q.reasonOptions].map((o) => o.text.trim());
      expect(new Set(texts).size, q.id).toBe(texts.length);
      expect(q.hints.length, q.id).toBeGreaterThanOrEqual(1);
      expect(q.explanation.length, q.id).toBeGreaterThan(10);
      expect(q.correctLine.length, q.id).toBeGreaterThan(0);
      if (q.kind === 'core') expect(q.extraClue, q.id).toBeTruthy();
    }
  });

  it('모든 오답 선택지에 오개념 설명과 보충 개념이 있고, 존재하지 않는 선택지 id를 가리키지 않는다', () => {
    for (const q of ALL_QUESTIONS) {
      const wrong = [...q.options.filter((o) => o.id !== q.correctAnswer), ...q.reasonOptions.filter((o) => o.id !== q.correctReason)].map(
        (o) => o.id,
      );
      for (const id of wrong) {
        expect(q.misconceptionFeedback[id], `${q.id} ${id} 설명`).toBeTruthy();
        const cs = q.misconceptionConcepts[id];
        expect(cs?.length, `${q.id} ${id} 개념`).toBeGreaterThan(0);
        for (const c of cs) expect(CONCEPT_MAP[c], `${q.id} ${id} → ${c}`).toBeDefined();
      }
      expect(Object.keys(q.misconceptionFeedback).sort(), q.id).toEqual([...wrong].sort());
      expect(Object.keys(q.misconceptionConcepts).sort(), q.id).toEqual([...wrong].sort());
    }
  });

  it('문항과 경로 단계가 서로 정확히 대응한다', () => {
    for (const q of ALL_QUESTIONS) {
      const step = getStep(q.stageId);
      expect(step.questionId).toBe(q.id);
      expect(step.kind).toBe(q.kind);
    }
    for (const s of ROUTE) expect(getQuestion(s.questionId).stageId).toBe(s.id);
  });
});

// ── 개념 ───────────────────────────────────────────────────

describe('보충 개념 데이터', () => {
  it('어디서든 참조하는 개념 id가 모두 존재하고, 쓰이지 않는 개념이 없다', () => {
    const ids = CONCEPTS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    const referenced = new Set<string>();
    for (const q of ALL_QUESTIONS) {
      for (const c of q.conceptIds) referenced.add(c);
      for (const cs of Object.values(q.misconceptionConcepts)) for (const c of cs) referenced.add(c);
    }
    for (const c of [...CIRCULATION_ACTIVITY.conceptIds.pulmonary, ...CIRCULATION_ACTIVITY.conceptIds.systemic]) referenced.add(c);
    for (const c of referenced) expect(CONCEPT_MAP[c], c).toBeDefined();
    for (const c of ids) expect(referenced.has(c), `${c}는 어디에서도 쓰이지 않음`).toBe(true);
    expect(() => getConcept('none')).toThrow();
  });

  it('모든 개념에 설명·다시 생각하기·참거짓 재확인 문항이 있다', () => {
    for (const c of CONCEPTS) {
      expect(c.name && c.explanation && c.rethink && c.recheck.statement && c.recheck.explanation, c.id).toBeTruthy();
      expect(typeof c.recheck.answer).toBe('boolean');
    }
  });

  it('동맥·정맥은 산소량이 아니라 심장 기준의 방향으로 정의한다', () => {
    const av = getConcept('artery-vein');
    expect(av.explanation).toContain('심장에서 나가');
    expect(av.explanation).toContain('심장으로 들어오');
    expect(av.recheck.answer).toBe(false); // '산소가 풍부하므로 동맥' 문장은 거짓
  });
});

// ── 경로·지도·심장 ─────────────────────────────────────────

describe('순환 경로', () => {
  it('핵심 단계 순서 + 지도 연결선이 정확히 하나의 순환(lv→…→la→lv)을 이룬다', () => {
    const core = ROUTE.filter((s) => s.kind === 'core');
    expect(core.map((s) => s.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(core.map((s) => s.locationId)).toEqual(['lv', 'sysCap', 'venaCava', 'ra', 'rv', 'pa', 'lungCap', 'pv', 'la', 'lv']);
    expect(CIRCULATION_ORDER).toEqual(CYCLE);

    // 연결선: 노드마다 나가는 선·들어오는 선이 하나씩
    expect(MAP_EDGES).toHaveLength(CYCLE.length);
    for (const n of CYCLE) {
      expect(MAP_EDGES.filter((e) => e.from === n), n).toHaveLength(1);
      expect(MAP_EDGES.filter((e) => e.to === n), n).toHaveLength(1);
    }
    const walk: NodeId[] = ['lv'];
    for (let i = 0; i < CYCLE.length; i++) walk.push(MAP_EDGES.find((e) => e.from === walk[walk.length - 1])!.to);
    expect(walk).toEqual([...CYCLE, 'lv']);

    // 연결선은 핵심 단계 순서대로 하나씩 드러나고, 도착 지점은 그 단계가 밝혀내는 지점이다
    expect(MAP_EDGES.map((e) => e.revealedBy)).toEqual(core.map((s) => s.id));
    for (const e of MAP_EDGES) expect(STEP_MAP[e.revealedBy].reveals).toContain(e.to);
    // 연결선이 드러날 때 출발 지점은 이미 지도에 있다
    const discovered = new Set<NodeId>();
    for (const s of core) {
      for (const n of s.reveals) discovered.add(n);
      const e = MAP_EDGES.find((x) => x.revealedBy === s.id)!;
      expect(discovered.has(e.from) && discovered.has(e.to), s.id).toBe(true);
    }
    expect([...discovered].sort()).toEqual([...CYCLE].sort());
  });

  it('전체 경로의 장소를 연속 중복 없이 나열하면 한 바퀴 순서와 같다', () => {
    const seq: string[] = [];
    for (const s of ROUTE) if (seq[seq.length - 1] !== s.locationId) seq.push(s.locationId);
    expect(seq).toEqual([...CYCLE, 'lv']);
    expect(ROUTE).toHaveLength(16);
    expect(ROUTE[0].id).toBe('S1');
    expect(ROUTE[ROUTE.length - 1].id).toBe('S10');
  });

  it('단계·단서 데이터가 일관된다', () => {
    const stepIds = ROUTE.map((s) => s.id);
    expect(new Set(stepIds).size).toBe(stepIds.length);
    const clueIds = ROUTE.flatMap((s) => s.clues.map((c) => c.id));
    expect(new Set(clueIds).size).toBe(clueIds.length);
    for (const s of ROUTE) {
      expect(s.minClues).toBe(s.kind === 'core' ? GAME_CONFIG.minCluesCore : GAME_CONFIG.minCluesReview);
      expect(s.clues.length, s.id).toBeGreaterThanOrEqual(s.minClues);
      const anchors = s.clues.map((c) => c.anchor);
      expect(new Set(anchors).size, s.id).toBe(anchors.length);
      for (const c of s.clues) expect(c.anchor && c.title && c.text, c.id).toBeTruthy();
      expect(s.stop).toBeGreaterThan(0);
      expect(s.stop).toBeLessThan(1);
      expect(s.arrival.length, s.id).toBeGreaterThan(0);
      if (s.kind === 'review') {
        expect(s.reveals, s.id).toEqual([]);
        expect(s.answerTerms, s.id).toEqual([]);
      } else {
        expect(s.reveals.length, s.id).toBeGreaterThan(0);
        expect(s.answerTerms.length, s.id).toBeGreaterThan(0);
        expect(s.solvedName).toBe(MAP_NODES[s.locationId].name);
      }
    }
    expect(ROUTE.filter((s) => s.kind === 'review').map((s) => s.order).sort()).toEqual([1, 2, 3, 4, 5, 6]);
    // 같은 공간에서 연달아 정차할 때는 앞으로만 이동한다
    for (let i = 1; i < ROUTE.length; i++) {
      if (ROUTE[i].locationId === ROUTE[i - 1].locationId) expect(ROUTE[i].stop, ROUTE[i].id).toBeGreaterThan(ROUTE[i - 1].stop);
    }
    expect(() => getStep('nope')).toThrow();
  });
});

describe('지도', () => {
  it('지도 노드 상태 배지가 사용하는 단계가 데이터와 선택자에서 같다', () => {
    for (const n of CYCLE) {
      expect(nodeStatuses({ firstResponses: {}, latest: {} }, n).map((x) => x.stepId)).toEqual(NODE_STEPS[n]);
      for (const sid of NODE_STEPS[n]) expect(STEP_MAP[sid].kind).toBe('core');
    }
  });

  it('산소 상태는 모세혈관에서만 바뀌고, 선 색이 기호색임을 알린다', () => {
    const o2 = (from: NodeId) => MAP_EDGES.find((e) => e.from === from)!.o2;
    const into = (to: NodeId) => MAP_EDGES.find((e) => e.to === to)!.o2;
    expect(into('sysCap')).toBe('rich');
    expect(o2('sysCap')).toBe('poor');
    expect(into('lungCap')).toBe('poor');
    expect(o2('lungCap')).toBe('rich');
    for (const n of CYCLE) if (MAP_NODES[n].kind !== 'capillary') expect(into(n), n).toBe(o2(n));
    expect(EXCHANGE_ZONES).toEqual(
      expect.arrayContaining([expect.objectContaining({ node: 'lungCap', change: 'up' }), expect.objectContaining({ node: 'sysCap', change: 'down' })]),
    );
    for (const id of Object.keys(CHAMBERS) as ChamberSpec['id'][]) expect(CHAMBERS[id].o2, id).toBe(o2(id));
    expect(MAP_COLOR_NOTE).toContain('기호색');
    expect(MAP_COLOR_NOTE).toContain('붉은');
  });

  it('마지막 활동의 순환 범위가 지도의 순환 구분과 같다', () => {
    const pul = CYCLE.filter((n) => MAP_NODES[n].circulation === 'pulmonary');
    const sys = CYCLE.filter((n) => MAP_NODES[n].circulation === 'systemic');
    expect([...CIRCULATION_ACTIVITY.pulmonary].sort()).toEqual(pul.sort());
    expect([...CIRCULATION_ACTIVITY.systemic].sort()).toEqual(sys.sort());
    expect(pul.length + sys.length).toBe(CYCLE.length);
    // 허파순환: 우심실 → 폐동맥 → 폐의 모세혈관 → 폐정맥 → 좌심방
    expect(CIRCULATION_ACTIVITY.pulmonary).toEqual(['rv', 'pa', 'lungCap', 'pv', 'la']);
    expect(CIRCULATION_ACTIVITY.systemic).toEqual(['lv', 'aorta', 'sysCap', 'venaCava', 'ra']);
  });
});

describe('심장 구조', () => {
  it('방의 입구·출구 연결이 경로와 같다(대정맥→우심방→우심실→폐동맥, 폐정맥→좌심방→좌심실→대동맥)', () => {
    expect(CHAMBERS.ra.inlet.from).toBe('venaCava');
    expect(CHAMBERS.ra.outlet.to).toBe('rv');
    expect(CHAMBERS.rv.inlet.from).toBe('ra');
    expect(CHAMBERS.rv.outlet.to).toBe('pa');
    expect(CHAMBERS.la.inlet.from).toBe('pv');
    expect(CHAMBERS.la.outlet.to).toBe('lv');
    expect(CHAMBERS.lv.inlet.from).toBe('la');
    expect(CHAMBERS.lv.outlet.to).toBe('aorta');
    for (const c of Object.values(CHAMBERS)) {
      const next = CYCLE[(CYCLE.indexOf(c.id) + 1) % CYCLE.length];
      const prev = CYCLE[(CYCLE.indexOf(c.id) + CYCLE.length - 1) % CYCLE.length];
      expect(c.outlet.to, c.id).toBe(next);
      expect(c.inlet.from, c.id).toBe(prev);
    }
  });

  it('정상 경로에서 왼쪽 방과 오른쪽 방은 직접 연결되지 않는다', () => {
    const isChamber = (n: NodeId): n is ChamberSpec['id'] => n in CHAMBERS;
    for (const c of Object.values(CHAMBERS)) {
      for (const n of [c.inlet.from, c.outlet.to]) {
        if (isChamber(n)) expect(CHAMBERS[n].side, `${c.id}↔${n}`).toBe(c.side);
      }
    }
    for (const e of MAP_EDGES) {
      if (isChamber(e.from) && isChamber(e.to)) expect(CHAMBERS[e.from].side).toBe(CHAMBERS[e.to].side);
    }
  });

  it('심방은 받고 심실은 내보낸다: 판막 배치와 막의 수, 벽 두께', () => {
    expect(VALVE_LEAFLETS.tricuspid).toBe(3);
    expect(VALVE_LEAFLETS.mitral).toBe(2);
    expect(VALVE_LEAFLETS.pulmonary).toBe(3);
    expect(VALVE_LEAFLETS.aortic).toBe(3);
    // 정맥과 심방 사이(대정맥 안 포함)에는 판막이 없다
    expect(CHAMBERS.ra.inlet.valve).toBeNull();
    expect(CHAMBERS.la.inlet.valve).toBeNull();
    expect(CHAMBERS.ra.outlet.valve).toBe('tricuspid');
    expect(CHAMBERS.rv.inlet.valve).toBe('tricuspid');
    expect(CHAMBERS.la.outlet.valve).toBe('mitral');
    expect(CHAMBERS.lv.inlet.valve).toBe('mitral');
    expect(CHAMBERS.rv.outlet.valve).toBe('pulmonary');
    expect(CHAMBERS.lv.outlet.valve).toBe('aortic');
    for (const c of Object.values(CHAMBERS)) {
      expect(c.role).toBe(c.id.endsWith('a') ? 'atrium' : 'ventricle');
      expect(c.side).toBe(c.id.startsWith('r') ? 'right' : 'left');
    }
    // 단서 문장의 판막 막 수가 데이터와 같다
    expect(STEP_MAP.S4.clues.find((c) => c.anchor === 'ra-valve')!.text).toContain(`얇은 막 ${VALVE_LEAFLETS.tricuspid}장`);
    expect(STEP_MAP.S9.clues.find((c) => c.anchor === 'la-valve')!.text).toContain(`얇은 막 ${VALVE_LEAFLETS.mitral}장`);
    // 벽 두께: 좌심실 > 우심실 > 두 심방
    const w = (id: ChamberSpec['id']) => CHAMBERS[id].wallIndex;
    expect(w('lv')).toBeGreaterThan(w('rv'));
    expect(w('rv')).toBeGreaterThan(Math.max(w('ra'), w('la')));
    expect(CHAMBERS.ra.inletCount).toBe(2);
    expect(CHAMBERS.la.inletCount).toBe(4);
  });

  it('벽 두께 비교 장치는 현재 방 외에는 이름 없이 A·B·C로 표시한다', () => {
    const names = ['좌심실', '우심실', '좌심방', '우심방', '심실', '심방'];
    for (const id of Object.keys(CHAMBERS) as ChamberSpec['id'][]) {
      const bars = wallComparison(id);
      expect(bars.map((b) => b.label)).toEqual(['현재 방', '다른 방 A', '다른 방 B', '다른 방 C']);
      expect(bars.filter((b) => b.current)).toHaveLength(1);
      expect(bars[0].value).toBe(CHAMBERS[id].wallIndex);
      for (const b of bars) for (const n of names) expect(b.label).not.toContain(n);
    }
  });

  it('대정맥 단계의 단서·대사에는 판막이 나오지 않는다(대정맥 안에는 판막이 없음)', () => {
    const s3 = STEP_MAP.S3;
    for (const t of [...s3.clues.flatMap((c) => [c.title, c.text]), ...s3.arrival.map((l) => l.text)]) expect(t).not.toContain('판막');
  });
});

// ── 정답 노출 검사 ─────────────────────────────────────────

/** 해결 전 학생에게 보이는 문장들 */
function visibleBeforeSolving(step: RouteStep, q: Question): Str[] {
  const out: Str[] = [];
  step.clues.forEach((c) => out.push({ path: `${c.id}.title`, text: c.title }, { path: `${c.id}.text`, text: c.text }));
  step.arrival.forEach((l, i) => out.push({ path: `${step.id}.arrival[${i}]`, text: l.text }));
  out.push({ path: `${step.id}.travelCaption`, text: step.travelCaption });
  out.push({ path: `${q.id}.prompt`, text: q.prompt }, { path: `${q.id}.answerLabel`, text: q.answerLabel }, { path: `${q.id}.reasonLabel`, text: q.reasonLabel });
  q.hints.forEach((h, i) => out.push({ path: `${q.id}.hints[${i}]`, text: h }));
  if (q.extraClue) out.push({ path: `${q.id}.extraClue`, text: q.extraClue });
  // 오답 직후 보여 주는 설명도 아직 해결 전이다
  for (const [k, v] of Object.entries(q.misconceptionFeedback)) out.push({ path: `${q.id}.feedback.${k}`, text: v });
  return out;
}

describe('정답 노출 방지', () => {
  it('핵심 단계의 단서·도착 대사·문항·힌트·추가 단서·오답 설명에 그 단계의 정답 장소 이름이 없다', () => {
    const leaks: string[] = [];
    for (const step of ROUTE.filter((s) => s.kind === 'core')) {
      const q = getQuestion(step.questionId);
      for (const s of visibleBeforeSolving(step, q)) {
        for (const term of step.answerTerms) if (s.text.includes(term)) leaks.push(`${s.path}: "${term}" ← ${s.text}`);
      }
    }
    expect(leaks).toEqual([]);
  });

  it('같은 장소의 핵심 단계보다 먼저 나오는 복습 단계에도 그 핵심 단계의 정답 이름이 없다', () => {
    const leaks: string[] = [];
    let checked = 0;
    ROUTE.forEach((step, i) => {
      if (step.kind !== 'review') return;
      const nextCore = ROUTE.slice(i + 1).find((s) => s.kind === 'core');
      if (!nextCore || nextCore.locationId !== step.locationId) return;
      checked++;
      const q = getQuestion(step.questionId);
      const texts: Str[] = [
        ...visibleBeforeSolving(step, q),
        { path: `${step.id}.solvedName`, text: step.solvedName },
        { path: `${q.id}.explanation`, text: q.explanation },
        { path: `${q.id}.correctLine`, text: q.correctLine },
        ...[...q.options, ...q.reasonOptions].map((o) => ({ path: o.id, text: o.text })),
      ];
      for (const s of texts) for (const term of nextCore.answerTerms) if (s.text.includes(term)) leaks.push(`${s.path}: "${term}" ← ${s.text}`);
    });
    expect(checked).toBeGreaterThan(0); // R4(대정맥 단계 앞)
    expect(leaks).toEqual([]);
  });

  it('해결 후 이름(solvedName)은 그 단계의 정답 이름을 담고 있다(검증 대상 용어가 실제 정답과 맞는지)', () => {
    for (const step of ROUTE.filter((s) => s.kind === 'core')) {
      expect(step.answerTerms.some((t) => step.solvedName.includes(t) || getQuestion(step.questionId).options.find((o) => o.id === getQuestion(step.questionId).correctAnswer)!.text.includes(t)), step.id).toBe(true);
    }
  });
});

// ── 과학 표현 규칙 ─────────────────────────────────────────

describe('과학 표현 규칙', () => {
  it('수집한 문자열이 충분하다(검사가 실제로 데이터 전체를 훑는지)', () => {
    expect(ALL.length).toBeGreaterThan(500);
    expect(ALL.some((s) => s.path.startsWith('dialogue.INTRO_PARK'))).toBe(true);
    expect(ALL.some((s) => s.path.startsWith('concepts.CONCEPTS'))).toBe(true);
    expect(ALL.some((s) => s.path.startsWith('map.MAP_NODES'))).toBe(true);
  });

  it('금지 용어(산소량으로 부르는 혈액 이름)를 쓰지 않는다', () => {
    const hits = ALL.filter((s) => FORBIDDEN.some((f) => s.text.includes(f))).map((s) => `${s.path}: ${s.text}`);
    expect(hits).toEqual([]);
  });

  it('혈액이 파랗다는 표현이 없다', () => {
    const BLUE = [
      /(파란|파랑|푸른|청색|남색)\s*(색\s*)?(의\s*)?(혈액|피|혈장|혈구|적혈구)/,
      /(혈액|혈장|피)\s*(은|는|이|가|의\s*색은|의\s*색이)?\s*(파랗|파란|파래|푸르|푸른|청색)/,
    ];
    const hits = ALL.filter((s) => BLUE.some((re) => re.test(s.text))).map((s) => `${s.path}: ${s.text}`);
    expect(hits).toEqual([]);
  });

  it('산소가 0이 된다는 주장이 없다(부정문과 거짓 판단용 문장은 예외)', () => {
    // 부정이 붙으면 허용되는 표현
    const SOFT = [/산소\s*(가|이)?\s*(없는|없어|없다|없음|없습|없게)/, /산소\s*(가|의\s*양이|량이)?\s*0/, /(?<![0-9.])0\s*(이|은|는|%|퍼센트)/, /산소를?\s*(모두|전부)\s*(잃|빼앗|내주|써)/];
    // 부정이 붙어도 '0'을 뜻하는 표현(예: 산소가 전혀 남아 있지 않다)
    const HARD = [/산소\s*(가|를|는)?\s*전혀/, /산소\s*(가|는)?\s*하나도/];
    const hits: string[] = [];
    for (const s of ALL) {
      if (MISCONCEPTIONS.has(s.text)) continue;
      for (const re of HARD) if (re.test(s.text)) hits.push(`${s.path}: ${s.text}`);
      for (const re of SOFT) {
        const m = re.exec(s.text);
        if (!m) continue;
        const after = s.text.slice(m.index, m.index + m[0].length + 20);
        if (!NEGATION.test(after)) hits.push(`${s.path}: ${s.text}`);
      }
    }
    expect(hits).toEqual([]);
    // 거짓 판단용 문장('산소가 전혀 남아 있지 않다')의 해설은 '0이 되지는 않음'을 바로잡아 준다
    for (const c of CONCEPTS) {
      if (c.recheck.answer || !HARD.some((re) => re.test(c.recheck.statement))) continue;
      expect(c.recheck.explanation, c.id).toMatch(/0이 되지는? 않/);
    }
    // 산소가 적은 혈액을 설명하는 측정기 단서는 0이 아님을 함께 밝힌다
    for (const id of ['s2-c-o2', 's3-c-o2', 's6-c-o2']) {
      const clue = ROUTE.flatMap((s) => s.clues).find((c) => c.id === id)!;
      expect(clue.text, id).toMatch(/0이 되지는 않|0은 아님/);
    }
  });

  it('혈액의 이동을 중력이나 "산소를 찾아서"로 설명하지 않는다(오개념 선택지는 예외, 그 외에는 부정문만)', () => {
    const hits = ALL.filter((s) => /중력|산소를 찾아/.test(s.text) && !MISCONCEPTIONS.has(s.text) && !NEGATION.test(s.text)).map(
      (s) => `${s.path}: ${s.text}`,
    );
    expect(hits).toEqual([]);
    // 중력 오개념 선택지에는 바로잡는 설명이 붙어 있다
    for (const q of ALL_QUESTIONS) {
      for (const o of [...q.options, ...q.reasonOptions]) {
        if (!/중력|산소를 찾아/.test(o.text)) continue;
        expect(q.misconceptionFeedback[o.id], o.id).toMatch(/압력 차이/);
      }
    }
  });

  it('판막을 펌프로 설명하지 않는다(오개념 선택지·거짓 문장 제외)', () => {
    const hits = ALL.filter((s) => /판막/.test(s.text) && /펌프/.test(s.text) && !MISCONCEPTIONS.has(s.text) && !NEGATION.test(s.text)).map(
      (s) => `${s.path}: ${s.text}`,
    );
    expect(hits).toEqual([]);
    expect(getConcept('valve').explanation).toMatch(/압력 차이/);
    expect(getConcept('valve').explanation).toMatch(/거꾸로|역류/);
  });

  it('S6에서 폐정맥을 고르면 "심장에서 나가"는 방향을 짚어 준다', () => {
    const q = getQuestion('q-s6');
    expect(q.misconceptionFeedback['s6-a-pv']).toContain('심장에서 나가');
    expect(q.misconceptionFeedback['s6-r-lowo2']).toContain('심장에서 나가');
    expect(q.misconceptionConcepts['s6-a-pv']).toContain('artery-vein');
    expect(q.misconceptionConcepts['s6-r-lowo2']).toContain('artery-vein');
  });

  it('S8 "산소가 풍부해서 동맥" 오개념 설명은 흐름 방향으로 바로잡는다', () => {
    const q = getQuestion('q-s8');
    const id = q.reasonOptions.find((o) => /산소가 풍부/.test(o.text) && /동맥/.test(o.text))!.id;
    expect(id).toBe('s8-r-richo2');
    const fb = q.misconceptionFeedback[id];
    expect(fb).toContain('심장으로 들어가');
    expect(fb).toContain('방향');
    expect(q.misconceptionConcepts[id]).toContain('artery-vein');
    // S3의 '산소가 적어서 정맥' 근거도 심장 기준으로 바로잡는다
    expect(getQuestion('q-s3').misconceptionFeedback['s3-r-oxygen']).toContain('심장을 기준');
  });

  it('모세혈관에서 혈구는 혈관 밖으로 나가지 않고, 적혈구는 폐포 안으로 들어가지 않는다', () => {
    const cap = getConcept('capillary');
    expect(cap.explanation).toContain('혈구는 혈관 밖으로 나가지 않');
    expect(cap.recheck.answer).toBe(false);
    expect(getConcept('pulmonary-exchange').recheck.answer).toBe(false);
    expect(getQuestion('q-s7').explanation).toContain('적혈구가 폐포 안으로 들어가지는 않');
    expect(STEP_MAP.S2.clues.find((c) => c.id === 's2-c-narrow')!.text).toContain('한 줄로');
  });

  it('크기는 학습용으로 바꾼 것이고, 입자·화살표는 학습용 시각화임을 밝힌다', () => {
    expect(ALL.some((s) => s.path.startsWith('dialogue.INTRO_SCALE_NOTE') && /크기/.test(s.text))).toBe(true);
    for (const id of ['s2-c-exchange', 's7-c-gas']) {
      expect(ROUTE.flatMap((s) => s.clues).find((c) => c.id === id)!.text, id).toContain('학습용 시각화');
    }
  });

  it('심장의 좌우는 몸 주인 기준임을 안내한다', () => {
    expect(STEP_MAP.S4.arrival.some((l) => /몸 주인 기준/.test(l.text))).toBe(true);
    expect(mapMod.MAP_SIDE_NOTE).toContain('몸의 오른쪽');
    expect(getConcept('heart-sides').explanation).toContain('몸 주인을 기준');
  });
});
