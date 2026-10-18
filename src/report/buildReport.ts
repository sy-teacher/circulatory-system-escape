// 학생의 실제 응답 기록으로 학습 진단 보고서를 만든다(점수판이 아님).

import { getConcept } from '../data/concepts';
import { GAME_CONFIG } from '../data/config';
import { CIRCULATION_ACTIVITY, getQuestion } from '../data/questions';
import { ROUTE } from '../data/route';
import type { Concept, QuestionKind } from '../data/types';
import { choiceText, conceptsForResponse, isReasonOnlyMiss, questionStatus, supplementConceptIds } from '../state/selectors';
import type { LearningRecord, QuestionStatus, RecheckResult, ReturnEvent } from '../state/types';

export interface ReportItem {
  questionId: string;
  stepId: string;
  kind: QuestionKind;
  label: string;
  prompt: string;
  status: QuestionStatus;
  /** 최초 응답에서 위치(이름)는 맞혔지만 근거(역할)가 틀림 */
  reasonOnly: boolean;
  answerLabel: string;
  reasonLabel: string;
  firstAnswerText: string;
  firstReasonText: string;
  firstAnswerCorrect: boolean;
  firstReasonCorrect: boolean;
  /** 아직 해결하지 않은 핵심 문항은 정답을 공개하지 않는다(null) */
  correctAnswerText: string | null;
  correctReasonText: string | null;
  /** 최초 오답에 대한 설명 */
  firstFeedback: string[];
  conceptIds: string[];
  attempts: number;
  resolved: boolean;
  resolvedRunId?: number;
  firstHintsUsed: number;
  explanation: string | null;
}

export interface ConceptGroup {
  concept: Concept;
  questionLabels: string[];
  recheck?: RecheckResult;
}

export interface ZoneRow {
  stepId: string;
  order: number;
  name: string;
  status: QuestionStatus;
  reasonOnly: boolean;
  attempts: number;
}

export interface Report {
  title: '탈출 성공' | '탐험 중간 기록';
  complete: boolean;
  generatedAt: number;
  startedAt: number;
  elapsedMinutes: number;
  runId: number;
  restartCount: number;
  runWrong: number;
  maxWrong: number;
  core: Record<QuestionStatus, number> & { solved: number; total: number };
  review: { answered: number; correctFirst: number; total: number };
  zones: ZoneRow[];
  reviewRows: ZoneRow[];
  wrongItems: ReportItem[];
  reasonOnlyItems: ReportItem[];
  hintItems: { label: string; hints: number; status: QuestionStatus }[];
  conceptGroups: ConceptGroup[];
  activity: { attempts: number; solved: boolean; firstCorrect: boolean | null };
  returnLog: ReturnEvent[];
  totalHints: number;
}

function stepLabel(record: LearningRecord, stepId: string): string {
  const step = ROUTE.find((s) => s.id === stepId)!;
  const q = getQuestion(step.questionId);
  if (step.kind === 'core') {
    const solved = record.latest[q.id]?.solved;
    return `${step.order}단계 · ${solved || record.escaped ? step.solvedName : '아직 밝혀내지 못한 구역'}`;
  }
  const names: Record<string, string> = {
    R1: '적혈구',
    R2: '혈장',
    R3: '백혈구',
    R4: '혈소판',
    R5: '혈관 구조',
    R6: '세포호흡',
  };
  // 아직 만나지 않은 복습은 이름(=정답)을 숨긴다
  if (!record.firstResponses[q.id] && !record.escaped) return `복습 ${step.order} · 아직 만나지 않은 관찰`;
  return `복습 ${step.order} · ${names[step.id] ?? ''}`;
}

export function buildReport(record: LearningRecord, now: number): Report {
  /** 정답·설명·보충 개념을 보여 줘도 되는 문항(복습, 해결한 핵심 문항, 탈출 후 전체) */
  const revealable = (questionId: string) =>
    getQuestion(questionId).kind === 'review' || !!record.latest[questionId]?.solved || record.escaped;

  // 아직 풀지 않은 핵심 단계의 정답 장소 이름이 들어 있는 개념 설명은 탈출 전까지 숨긴다
  const solvedTerms = new Set(
    ROUTE.filter((s) => s.kind === 'core' && record.latest[s.questionId]?.solved).flatMap((s) => s.answerTerms),
  );
  const hiddenTerms = record.escaped
    ? []
    : ROUTE.filter((s) => s.kind === 'core' && !record.latest[s.questionId]?.solved)
        .flatMap((s) => s.answerTerms)
        .filter((t) => !solvedTerms.has(t));
  const conceptLeaks = (cid: string) => {
    const c = getConcept(cid);
    return hiddenTerms.some((t) => c.name.includes(t) || c.explanation.includes(t) || c.rethink.includes(t));
  };
  const items: ReportItem[] = [];
  for (const step of ROUTE) {
    const q = getQuestion(step.questionId);
    const first = record.firstResponses[q.id];
    if (!first) continue;
    const latest = record.latest[q.id];
    const solved = !!latest?.solved;
    const reveal = revealable(q.id);
    const fb: string[] = [];
    if (!first.answerCorrect && q.misconceptionFeedback[first.selectedAnswer]) fb.push(q.misconceptionFeedback[first.selectedAnswer]);
    if (!first.reasonCorrect && q.misconceptionFeedback[first.selectedReason]) {
      const t = q.misconceptionFeedback[first.selectedReason];
      if (!fb.includes(t)) fb.push(t);
    }
    items.push({
      questionId: q.id,
      stepId: step.id,
      kind: q.kind,
      label: stepLabel(record, step.id),
      prompt: q.prompt,
      status: questionStatus(record, q.id),
      reasonOnly: isReasonOnlyMiss(record, q.id),
      answerLabel: q.answerLabel,
      reasonLabel: q.reasonLabel,
      firstAnswerText: choiceText(q, first.selectedAnswer),
      firstReasonText: choiceText(q, first.selectedReason),
      firstAnswerCorrect: first.answerCorrect,
      firstReasonCorrect: first.reasonCorrect,
      correctAnswerText: reveal ? choiceText(q, q.correctAnswer) : null,
      correctReasonText: reveal ? choiceText(q, q.correctReason) : null,
      firstFeedback: fb,
      // 해결 전 핵심 문항의 개념 이름·설명에는 정답 장소가 들어갈 수 있으므로 해결 후에 공개한다
      conceptIds: reveal ? conceptsForResponse(first, q).filter((id) => !conceptLeaks(id)) : [],
      attempts: latest?.attempts ?? 1,
      resolved: solved,
      resolvedRunId: latest?.solvedRunId,
      firstHintsUsed: first.hintsUsed,
      explanation: reveal ? q.explanation : null,
    });
  }

  const wrongItems = items.filter((i) => i.status === 'wrong-then-solved' || i.status === 'needs-review');
  const reasonOnlyItems = wrongItems.filter((i) => i.reasonOnly);

  // 보충 개념별 묶음(최초 오답뿐 아니라 이후 시도에서 드러난 개념도 포함).
  // 아직 해결하지 않은 핵심 문항에서만 드러난 개념은 해결할 때까지 보여 주지 않는다(정답 노출 방지).
  const conceptIds = supplementConceptIds(record);
  const allGroups: ConceptGroup[] = conceptIds.map((cid) => {
    const labels: string[] = [];
    for (const r of record.responses) {
      if (!revealable(r.questionId)) continue;
      if (conceptsForResponse(r).includes(cid)) {
        const step = ROUTE.find((s) => s.questionId === r.questionId)!;
        const label = stepLabel(record, step.id);
        if (!labels.includes(label)) labels.push(label);
      }
    }
    const firstAct = record.activityAttempts[0];
    if (firstAct) {
      if (!firstAct.pulmonaryCorrect && CIRCULATION_ACTIVITY.conceptIds.pulmonary.includes(cid)) labels.push('마지막 활동 · 허파순환 범위');
      if (!firstAct.systemicCorrect && CIRCULATION_ACTIVITY.conceptIds.systemic.includes(cid)) labels.push('마지막 활동 · 온몸순환 범위');
    }
    return { concept: getConcept(cid), questionLabels: labels, recheck: record.recheck[cid] };
  });
  const conceptGroups = allGroups.filter((g) => g.questionLabels.length > 0 && !conceptLeaks(g.concept.id));

  const coreSteps = ROUTE.filter((s) => s.kind === 'core');
  const reviewSteps = ROUTE.filter((s) => s.kind === 'review');
  const core = {
    'first-correct': 0,
    'hint-correct': 0,
    'wrong-then-solved': 0,
    'needs-review': 0,
    unchecked: 0,
    solved: 0,
    total: coreSteps.length,
  } as Report['core'];
  const zones: ZoneRow[] = coreSteps.map((s) => {
    const status = questionStatus(record, s.questionId);
    core[status] += 1;
    if (record.latest[s.questionId]?.solved) core.solved += 1;
    return {
      stepId: s.id,
      order: s.order,
      name: record.latest[s.questionId]?.solved || record.escaped ? s.solvedName : '아직 밝혀내지 못한 구역',
      status,
      reasonOnly: isReasonOnlyMiss(record, s.questionId),
      attempts: record.latest[s.questionId]?.attempts ?? 0,
    };
  });
  const reviewRows: ZoneRow[] = [...reviewSteps]
    .sort((a, b) => a.order - b.order)
    .map((s) => ({
      stepId: s.id,
      order: s.order,
      name: stepLabel(record, s.id),
      status: questionStatus(record, s.questionId),
      reasonOnly: isReasonOnlyMiss(record, s.questionId),
      attempts: record.latest[s.questionId]?.attempts ?? 0,
    }));

  const hintItems = items
    .filter((i) => (record.hintsRevealed[i.questionId] ?? 0) > 0)
    .map((i) => ({ label: i.label, hints: record.hintsRevealed[i.questionId] ?? 0, status: i.status }));

  return {
    title: record.escaped ? '탈출 성공' : '탐험 중간 기록',
    complete: record.escaped,
    generatedAt: now,
    startedAt: record.startedAt,
    elapsedMinutes: Math.max(0, Math.round((now - record.startedAt) / 60000)),
    runId: record.runId,
    restartCount: record.restartCount,
    runWrong: record.runWrong,
    maxWrong: GAME_CONFIG.maxWrongPerRun,
    core,
    review: {
      answered: reviewSteps.filter((s) => record.firstResponses[s.questionId]).length,
      correctFirst: reviewSteps.filter((s) => record.firstResponses[s.questionId]?.isCorrect).length,
      total: reviewSteps.length,
    },
    zones,
    reviewRows,
    wrongItems,
    reasonOnlyItems,
    hintItems,
    conceptGroups,
    activity: {
      attempts: record.activityAttempts.length,
      solved: record.activitySolved,
      firstCorrect: record.activityAttempts[0] ? record.activityAttempts[0].pulmonaryCorrect && record.activityAttempts[0].systemicCorrect : null,
    },
    returnLog: record.returnLog,
    totalHints: Object.values(record.hintsRevealed).reduce((a, b) => a + b, 0),
  };
}
