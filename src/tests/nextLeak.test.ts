import { describe, expect, it } from 'vitest';
import { getQuestion } from '../data/questions';
import { CORE_STEPS, ROUTE } from '../data/route';

// 정답 설명은 '다음' 핵심 단계의 정답 장소 이름을 미리 알려 주면 안 된다.
// 예외: S9의 근거 "좌심실로 보낸다"는 성취기준이 정한 근거이며, S10은 출발점(이미 아는 곳)으로 돌아오는 단계다.
describe('정답 설명이 다음 단계의 정답을 미리 알려 주지 않는다', () => {
  for (let i = 0; i < CORE_STEPS.length - 1; i++) {
    const step = CORE_STEPS[i];
    const next = CORE_STEPS[i + 1];
    if (step.id === 'S9') continue;
    it(`${step.id} → ${next.id}`, () => {
      const q = getQuestion(step.questionId);
      const texts = [q.explanation, q.correctLine, ...(step.afterCorrect ?? []).map((l) => l.text)];
      for (const term of next.answerTerms) {
        for (const t of texts) expect(t.includes(term), `${step.id} 설명에 "${term}"`).toBe(false);
      }
    });
  }

  it('R1(적혈구)은 S2보다 먼저 나오므로 설명에 "모세혈관"을 쓰지 않는다', () => {
    const r1 = ROUTE.find((s) => s.id === 'R1')!;
    const q = getQuestion(r1.questionId);
    expect(q.explanation.includes('모세혈관')).toBe(false);
  });
});
