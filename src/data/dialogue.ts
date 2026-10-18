import type { DialogueLine } from './types';

// ─────────────────────────────────────────────────────────────
//  이야기 대사. 교사가 자유롭게 고칠 수 있다.
//  speaker: suyeon(수연쌤) · student(나) · friend(친구 지우) · narration(해설)
//  mood(수연쌤 표정): smile(기본 웃음) · open(눈 뜬 정면) · cheer(활짝 웃음)
//                     surprised(놀람) · wink(윙크) · worried(걱정)
// ─────────────────────────────────────────────────────────────

export const SPEAKER_NAMES = {
  suyeon: '수연쌤',
  student: '나',
  friend: '지우',
  narration: '',
} as const;

/** 놀이공원 도입 */
export const INTRO_PARK: DialogueLine[] = [
  { speaker: 'narration', text: '수학여행 둘째 날, 에버랜드.' },
  { speaker: 'friend', text: '야, 이번엔 저 회전 열차 타자! 줄도 짧아!' },
  { speaker: 'student', text: '좋아! 근데 수연쌤이 순환계 수업 열심히 들으라고 했던 게 자꾸 생각나…' },
  { speaker: 'friend', text: '에이, 그건 농담이지~ 출발한다!' },
  { speaker: 'narration', text: '열차가 터널로 들어서자 주변이 천천히 어두워진다…' },
];

/** 혈액 속에서 깨어남 */
export const INTRO_WAKE: DialogueLine[] = [
  { speaker: 'narration', text: '…쿵, 쿵. 부드러운 박동 소리가 들린다.' },
  { speaker: 'student', text: '여긴… 어디지? 지우는? 그리고 이건… 탐사선?' },
  { speaker: 'suyeon', mood: 'cheer', text: '일어났구나! 놀라지 마. 나야, 수연쌤.' },
  { speaker: 'student', text: '수연쌤이 이번 수업 열심히 안 들으면 수학여행에서 길을 잃을 수도 있다고 했는데… 진짜였다니.' },
  { speaker: 'suyeon', mood: 'wink', text: '후후. 우리는 아주 작아져서 혈액 속을 달리는 탐사선에 타고 있어.' },
  { speaker: 'suyeon', mood: 'open', text: '돌아가는 방법은 하나야. 주변을 관찰하고 우리가 어디에 있는지 알아내는 거지.' },
  { speaker: 'suyeon', mood: 'smile', text: '외운 순서를 떠올리기 전에, 여기에 어떤 단서가 있는지 살펴봐.' },
  { speaker: 'suyeon', mood: 'open', text: '화면을 드래그하면 주변을 둘러볼 수 있어. 반짝이는 관찰 지점을 누르면 확대해서 볼 수 있고.' },
  { speaker: 'suyeon', mood: 'smile', text: '단서를 2개 이상 모으면 "추론하기"를 눌러. 위치와 근거를 함께 골라야 해.' },
];

export function introRuleLine(maxWrong: number): DialogueLine {
  return {
    speaker: 'suyeon',
    mood: 'smile',
    text: `틀려도 괜찮아. 한 탐험에서 ${maxWrong}번까지는 계속 갈 수 있고, ${maxWrong + 1}번째 오답이면 출발점으로 돌아가. 힌트는 써도 오답 수가 늘지 않아.`,
  };
}

export const INTRO_SCALE_NOTE: DialogueLine = {
  speaker: 'suyeon',
  mood: 'wink',
  text: '참, 탐사선과 혈관 크기는 이해하기 쉽게 바꿔 놓은 거야. 실제 혈구와 모세혈관은 눈에 보이지 않을 만큼 작아!',
};

export function buildIntroWake(maxWrong: number): DialogueLine[] {
  return [...INTRO_WAKE, introRuleLine(maxWrong), INTRO_SCALE_NOTE];
}

/** 4번째 오답 → 출발점 귀환 */
export function buildReturnLines(maxWrong: number): DialogueLine[] {
  return [
    { speaker: 'suyeon', mood: 'worried', text: `이번 탐험에서 ${maxWrong + 1}번째 오답이 나왔네. 괜찮아, 길을 잃었을 땐 처음부터 차근차근!` },
    { speaker: 'suyeon', mood: 'open', text: '규칙대로 출발점으로 돌아가자. 이미 알아낸 구역은 "기억한 구역"으로 빠르게 지나갈 거야.' },
    { speaker: 'suyeon', mood: 'smile', text: '네가 처음에 고른 답은 모두 기록해 뒀어. 틀렸던 곳에서 단서를 다시 보며 생각해 보자.' },
  ];
}

/** 이미 해결한 구역을 다시 지날 때 */
export function rememberedLine(name: string): DialogueLine {
  return { speaker: 'suyeon', mood: 'smile', text: `여긴 이미 알아낸 "${name}"! 기억한 구역이니까 빠르게 지나가자.` };
}

/** 좌심실 귀환 후 활동 안내 */
export const ACTIVITY_INTRO: DialogueLine[] = [
  { speaker: 'suyeon', mood: 'cheer', text: '한 바퀴를 다 돌았어! 출발점으로 돌아왔다고!' },
  { speaker: 'suyeon', mood: 'open', text: '돌아가기 전에 마지막 활동! 완성된 지도에서 허파순환과 온몸순환의 범위를 각각 골라 볼까?' },
];

/** 오답 개념 재확인 안내 */
export const RECHECK_INTRO: DialogueLine[] = [
  { speaker: 'suyeon', mood: 'open', text: '돌아가기 전에, 헷갈렸던 개념을 짧게 다시 확인하자. 이건 오답 수와 상관없어.' },
];

export const RECHECK_NONE: DialogueLine[] = [
  { speaker: 'suyeon', mood: 'cheer', text: '와, 처음부터 끝까지 한 번도 틀리지 않았어! 바로 돌아가자.' },
];

/** 탈출 */
export const ESCAPE_LINES: DialogueLine[] = [
  { speaker: 'suyeon', mood: 'cheer', text: '잘했어! 이제 돌아갈 시간이야. 지도는 꼭 챙겨!' },
  { speaker: 'narration', text: '…눈을 뜨자 회전 열차가 출발점에 멈춰 있다.' },
  { speaker: 'friend', text: '야, 왜 이렇게 멍해? 손에 든 건 뭐야?' },
  { speaker: 'student', text: '어… 순환계 지도…?' },
];

export const ESCAPE_MESSAGE = {
  main: '탈출을 축하합니다. 틀린 부분은 오답노트 작성하고 공부하세요.',
  warning: '*주의사항: 이 일을 친구들에게 말하면 오답노트 10번씩 써야 합니다…',
  joke: '(이야기 속 수연쌤의 농담이에요. 실제로 반복해서 쓰지 않아도 됩니다.)',
};

/** 마지막 30초 설명 활동 */
export const EXPLAIN_ACTIVITY = {
  question: '혈액은 심장과 폐, 온몸을 어떤 순서로 이동하며, 각 순환에서 산소의 양은 어떻게 달라질까요?',
  starters: [
    '혈액은 좌심실에서 출발해 ___을(를) 지나 온몸의 모세혈관으로 가요.',
    '온몸의 모세혈관에서 산소는 ___(으)로 이동해서, 혈액은 산소가 ___ 혈액이 돼요.',
    '대정맥을 지나 ___(으)로 들어온 혈액은 우심실에서 ___을(를) 통해 폐로 가요.',
    '폐의 모세혈관에서 산소가 ___(으)로 들어와서, 혈액은 산소가 ___ 혈액이 돼요.',
    '폐정맥을 지나 ___(으)로 들어온 혈액은 다시 좌심실로 가요.',
  ],
  checklist: [
    '온몸순환과 허파순환의 순서를 모두 말했다.',
    '산소가 적어지는 곳(온몸의 모세혈관)과 풍부해지는 곳(폐의 모세혈관)을 말했다.',
    '동맥과 정맥을 심장 기준(나감·들어옴)으로 설명했다.',
    '판막이 역류를 막는다는 점을 말했다.',
  ],
};

/** 오답 직후 수연쌤의 첫마디(비난하지 않는 말투) */
export const WRONG_OPENERS = [
  '음, 그렇게 생각한 이유가 있었구나.',
  '좋은 시도야! 한 가지만 다시 보자.',
  '아깝다! 단서 하나를 놓쳤어.',
];

export const REASON_ONLY_OPENER = '위치는 맞혔어! 그런데 근거를 한 번 더 확인해 보자.';
export const ANSWER_ONLY_OPENER = '근거는 좋았어! 그런데 그 근거로 찾은 장소를 다시 생각해 보자.';
