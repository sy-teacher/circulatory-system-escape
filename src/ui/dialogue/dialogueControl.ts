// 대화 상자와 키보드 훅의 연결점.
// Space/Enter도 '타이핑 먼저 완성 → 그다음 줄 넘기기' 규칙을 따르도록 대화 상자가 자신의 처리 함수를 등록한다.

export const dialogueControl: {
  /** 대화 상자가 보이는 동안에만 등록된다(접혀 있으면 null) */
  advance: (() => void) | null;
} = { advance: null };
