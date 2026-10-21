// 결과 보고서를 복사용 일반 텍스트로 만든다(이름 등 개인 정보 없음).

import { STATUS_META } from '../state/types';
import type { Report } from './buildReport';

function fmtDate(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function reportToText(r: Report): string {
  const L: string[] = [];
  L.push(`《순환계 방탈출: 수연쌤과 혈관 탐험》 학습 진단 보고서 — ${r.title}`);
  L.push(`작성: ${fmtDate(r.generatedAt)} · 탐험 시간 약 ${r.elapsedMinutes}분 · 재시작 ${r.restartCount}회`);
  L.push('');
  L.push(`[핵심 10단계] 해결 ${r.core.solved}/${r.core.total}`);
  L.push(
    `  처음부터 정답 ${r.core['first-correct']} · 힌트 후 정답 ${r.core['hint-correct']} · 오답 후 해결 ${r.core['wrong-then-solved']} · 보충 학습 필요 ${r.core['needs-review']} · 미확인 ${r.core.unchecked}`,
  );
  for (const z of r.zones) {
    const m = STATUS_META[z.status];
    L.push(`  ${z.order}. ${z.name} — ${m.icon} ${m.label}${z.reasonOnly ? ' (위치는 맞혔지만 근거 확인이 필요함)' : ''}`);
  }
  L.push('');
  L.push(`[복습 6개] 응답 ${r.review.answered}/${r.review.total} · 처음부터 정답 ${r.review.correctFirst}`);
  for (const z of r.reviewRows) {
    const m = STATUS_META[z.status];
    L.push(`  ${z.name} — ${m.icon} ${m.label}`);
  }
  L.push('');
  if (r.wrongItems.length === 0) {
    L.push('[틀렸던 문제] 없음');
  } else {
    L.push('[틀렸던 문제]');
    for (const it of r.wrongItems) {
      L.push(`- ${it.label}`);
      L.push(`  문제: ${it.prompt}`);
      L.push(`  나의 첫 답: ${it.firstAnswerText} / ${it.firstReasonText}`);
      L.push(`  정답: ${it.correctAnswerText ? `${it.correctAnswerText} / ${it.correctReasonText}` : '(해결하면 공개됩니다)'}`);
      if (it.explanation) L.push(`  정답 설명: ${it.explanation}`);
    }
  }
  L.push('');
  if (r.conceptGroups.length) {
    L.push('[보충할 개념]');
    for (const g of r.conceptGroups) {
      L.push(`■ ${g.concept.name}`);
      L.push(`  설명: ${g.concept.explanation}`);
    }
    L.push('');
  }
  if (r.hintItems.length) {
    L.push('[힌트 사용] (힌트 사용은 개념을 모른다는 뜻이 아니에요)');
    for (const h of r.hintItems) L.push(`  ${h.label} — 힌트 ${h.hints}개`);
    L.push('');
  }
  L.push(
    `[허파순환·온몸순환 범위 활동] ${r.activity.attempts === 0 ? '아직 하지 않음' : r.activity.solved ? `완료(${r.activity.firstCorrect ? '처음부터 정답' : '다시 생각한 뒤 해결'})` : '진행 중'}`,
  );
  L.push('');
  L.push('설명 활동: 혈액은 심장과 허파, 온몸을 어떤 순서로 이동하며, 각 순환에서 산소의 양은 어떻게 달라질까요?');
  return L.join('\n');
}
