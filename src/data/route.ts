import type { NodeId, RouteStep } from './types';
import { GAME_CONFIG } from './config';

// ─────────────────────────────────────────────────────────────
//  탐험 경로: 핵심 10단계(S1~S10)와 복습 6개(R1~R6)
//  좌심실 → 대동맥 → 온몸의 모세혈관 → 대정맥 → 우심방 → 우심실
//  → 폐동맥 → 폐의 모세혈관 → 폐정맥 → 좌심방 → 좌심실
//
//  ※ 단서(clues)와 도착 대사(arrival)에는 그 단계의 정답 장소 이름을 쓰지 않는다.
//    (자동 검증: src/tests/data.test.ts)
//  ※ 단서의 anchor는 3D 장면의 관찰 지점 이름이다(scene/locations/*).
// ─────────────────────────────────────────────────────────────

const C = GAME_CONFIG.minCluesCore;
const R = GAME_CONFIG.minCluesReview;

export const ROUTE: RouteStep[] = [
  {
    id: 'S1',
    kind: 'core',
    order: 1,
    locationId: 'lv',
    stop: 0.5,
    questionId: 'q-s1',
    minClues: C,
    travelCaption: '출발점으로 이동 중…',
    arrival: [
      { speaker: 'suyeon', mood: 'open', text: '자, 첫 번째 수수께끼야. 우리가 있는 이 방은 어디이고, 여기서 나가면 어떤 혈관으로 이어질까?' },
      { speaker: 'suyeon', mood: 'smile', text: '반짝이는 관찰 지점을 눌러 단서를 모아 봐. 다른 방과 벽 두께를 비교하는 장치도 있어!' },
    ],
    afterCorrect: [
      { speaker: 'suyeon', mood: 'wink', text: '출발 기념으로 여기 벽에 탐사 표식을 꽂아 둘게. 나중에 알아볼 수 있게!' },
    ],
    clues: [
      { id: 's1-c-thickness', anchor: 'lv-thickness', title: '벽 두께 비교 장치', text: '비교 장치 화면: 이 방의 근육 벽이 다른 세 방(A·B·C)의 벽보다 훨씬 두껍다.' },
      { id: 's1-c-pressure', anchor: 'lv-pressure', title: '수축 압력계', text: '방이 수축할 때마다 압력계 바늘이 크게 치솟고, 탐사선이 출구 쪽으로 세게 밀린다.' },
      { id: 's1-c-exit', anchor: 'lv-exit', title: '출구 너머', text: '출구의 판막 너머로 아주 굵은 혈관이 이어지고, 인체 내비게이터는 "심장 → 온몸" 방향을 가리킨다.' },
      { id: 's1-c-inlet', anchor: 'lv-inlet', title: '들어온 쪽의 판막', text: '들어온 쪽의 판막은 이 방이 수축할 때 닫혀서 혈액이 거꾸로 흐르지 않게 한다.' },
    ],
    reveals: ['lv', 'aorta'],
    solvedName: '좌심실',
    answerTerms: ['좌심실', '대동맥'],
  },
  {
    id: 'R1',
    kind: 'review',
    order: 1,
    locationId: 'aorta',
    stop: 0.42,
    questionId: 'q-r1',
    minClues: R,
    travelCaption: '대동맥을 따라 이동 중… 큰 혈관에서 여러 동맥이 갈라져 나간다.',
    arrival: [
      { speaker: 'suyeon', mood: 'surprised', text: '잠깐! 바로 옆에 떠 있는 붉은 세포 보여?' },
      { speaker: 'suyeon', mood: 'smile', text: '보너스 관찰이야. 복습 문제는 틀려도 오답 수가 늘지 않아. 대신 기록은 남겨 둘게.' },
    ],
    clues: [
      { id: 'r1-c-cell', anchor: 'ao-rbc', title: '떠다니는 붉은 세포', text: '가운데가 오목한 원반 모양이고 붉은색이다. 핵이 보이지 않는다. 혈액 속에 아주 많다.' },
      { id: 'r1-c-branch', anchor: 'ao-branch', title: '갈라지는 혈관', text: '큰 혈관에서 여러 갈래의 동맥이 갈라져 나간다. 갈라질수록 혈관이 점점 가늘어진다.' },
    ],
    reveals: [],
    solvedName: '대동맥',
    answerTerms: [],
  },
  {
    id: 'S2',
    kind: 'core',
    order: 2,
    locationId: 'sysCap',
    stop: 0.45,
    questionId: 'q-s2',
    minClues: C,
    travelCaption: '동맥이 계속 갈라지며 점점 가늘어지는 중…',
    arrival: [
      { speaker: 'student', text: '와, 엄청 좁아졌다! 벽 너머가 비쳐 보여요.' },
      { speaker: 'suyeon', mood: 'open', text: '그럼 여긴 어디일까? 벽, 주변, 그리고 물질이 움직이는 방향을 잘 봐.' },
    ],
    clues: [
      { id: 's2-c-thin', anchor: 'sc-thin', title: '아주 얇은 벽', text: '벽이 매우 얇아 바깥의 세포가 비쳐 보인다.' },
      { id: 's2-c-narrow', anchor: 'sc-narrow', title: '좁은 통로', text: '혈관이 여러 갈래로 갈라져 아주 가늘어졌다. 적혈구가 한 줄로, 모양을 살짝 바꾸며 지나간다.' },
      { id: 's2-c-exchange', anchor: 'sc-exchange', title: '움직이는 입자', text: '산소·영양소 입자는 혈액에서 바깥 세포 쪽으로, 이산화탄소·노폐물 입자는 세포에서 혈액 쪽으로 이동한다. (입자와 화살표는 학습용 시각화)' },
      { id: 's2-c-o2', anchor: 'sc-o2meter', title: '산소 측정기', text: '산소 측정기의 수치가 점점 내려간다. (산소 풍부 → 산소 적음, 0이 되지는 않음)' },
      { id: 's2-c-cells', anchor: 'sc-cells', title: '바깥의 세포들', text: '혈관 바깥을 근육 세포 같은 몸의 세포들이 둘러싸고 있다. 공기가 든 주머니는 보이지 않는다.' },
    ],
    reveals: ['sysCap'],
    solvedName: '온몸의 모세혈관',
    answerTerms: ['모세혈관'],
  },
  {
    id: 'R6',
    kind: 'review',
    order: 6,
    locationId: 'sysCap',
    stop: 0.7,
    questionId: 'q-r6',
    minClues: R,
    travelCaption: '세포 가까이로 천천히 이동 중…',
    arrival: [
      { speaker: 'suyeon', mood: 'smile', text: '보너스 관찰! 혈관 밖 세포 하나를 가까이 들여다볼까?' },
    ],
    clues: [
      { id: 'r6-c-cell', anchor: 'sc-respiration', title: '일하는 세포', text: '세포가 산소와 영양소를 받아 에너지를 얻으며 빛나고, 이산화탄소와 물을 내보낸다.' },
      { id: 'r6-c-o2', anchor: 'sc-o2meter', title: '산소 측정기', text: '세포 옆을 지날수록 혈액 속 산소가 줄고 이산화탄소가 늘어난다.' },
    ],
    reveals: [],
    solvedName: '온몸의 모세혈관',
    answerTerms: [],
  },
  {
    id: 'R4',
    kind: 'review',
    order: 4,
    locationId: 'venaCava',
    stop: 0.2,
    questionId: 'q-r4',
    minClues: R,
    travelCaption: '가는 혈관들이 서로 모이기 시작한다…',
    arrival: [
      { speaker: 'suyeon', mood: 'surprised', text: '어? 저쪽 벽에 작은 틈이 생겼어. 무슨 일이 일어나는지 볼까?' },
      { speaker: 'suyeon', mood: 'smile', text: '이것도 보너스 관찰이야. 천천히 봐도 돼.' },
    ],
    clues: [
      { id: 'r4-c-wound', anchor: 'vc-wound', title: '작은 틈', text: '벽에 작은 틈이 생기자 아주 작은 조각들이 모여들어 서로 엉기며 틈을 막는다. 새어 나오던 혈액이 멈춘다.' },
    ],
    reveals: [],
    solvedName: '가는 혈관',
    answerTerms: [],
  },
  {
    id: 'S3',
    kind: 'core',
    order: 3,
    locationId: 'venaCava',
    stop: 0.7,
    questionId: 'q-s3',
    minClues: C,
    travelCaption: '작은 혈관들이 계속 합쳐지는 중…',
    arrival: [
      { speaker: 'student', text: '혈관이 점점 굵어지고 있어요. 그리고 저 소리…' },
      { speaker: 'suyeon', mood: 'open', text: '좋은 관찰이야. 소리만 듣지 말고 우리가 어느 쪽으로 가는지도 확인해 봐.' },
    ],
    clues: [
      { id: 's3-c-merge', anchor: 'vc-merge', title: '합쳐지는 혈관', text: '작은 혈관들이 계속 합쳐지며 혈관이 점점 굵어진다.' },
      { id: 's3-c-nav', anchor: 'vc-nav', title: '인체 내비게이터', text: '화살표가 "온몸 → 심장" 방향을 가리킨다. 우리는 심장에 가까워지고 있다.' },
      { id: 's3-c-o2', anchor: 'vc-o2', title: '산소 측정기', text: '산소가 적은 혈액이다(0은 아님). 혈액은 어두운 붉은색이다.' },
      { id: 's3-c-ahead', anchor: 'vc-ahead', title: '앞쪽 끝', text: '심장박동이 점점 크게 들리고, 혈관 끝이 심장의 한 방 입구로 열려 있다.' },
      { id: 's3-c-flow', anchor: 'vc-flow', title: '흐름의 느낌', text: '박동에 맞춰 세차게 출렁이지 않고, 비교적 느리고 고르게 흐른다.' },
    ],
    reveals: ['venaCava'],
    solvedName: '대정맥',
    answerTerms: ['대정맥'],
  },
  {
    id: 'S4',
    kind: 'core',
    order: 4,
    locationId: 'ra',
    stop: 0.5,
    questionId: 'q-s4',
    minClues: C,
    travelCaption: '큰 혈관의 끝을 지나 심장으로 들어가는 중…',
    arrival: [
      { speaker: 'suyeon', mood: 'open', text: '큰 공간에 들어왔어! 방금 지나온 혈관과 어떻게 연결되어 있는지 봐.' },
      { speaker: 'suyeon', mood: 'wink', text: '참, 심장의 왼쪽·오른쪽은 화면 기준이 아니라 몸 주인 기준이야. 헷갈리지 않게 조심!' },
    ],
    clues: [
      { id: 's4-c-inlet', anchor: 'ra-inlet', title: '들어온 입구', text: '방금 지나온 대정맥이 이 방으로 이어져 있고, 위쪽에도 비슷한 큰 혈관 입구가 하나 더 있다.' },
      { id: 's4-c-thickness', anchor: 'ra-thickness', title: '벽 두께 비교 장치', text: '이 방의 벽은 얇은 편이다. 비교한 방들 중 가장 얇은 쪽에 속한다.' },
      { id: 's4-c-fill', anchor: 'ra-fill', title: '방의 움직임', text: '혈액이 들어오며 방이 부풀고, 살짝 수축하며 혈액을 다음 방으로 보낸다.' },
      { id: 's4-c-valve', anchor: 'ra-valve', title: '다음 방으로 가는 판막', text: '아래쪽 방으로 이어지는 판막(얇은 막 3장)이 있다. 이 방 쪽 압력이 높을 때 열리고, 다음 방이 수축할 때는 닫혀 역류를 막는다.' },
    ],
    reveals: ['ra'],
    solvedName: '우심방',
    answerTerms: ['우심방'],
  },
  {
    id: 'S5',
    kind: 'core',
    order: 5,
    locationId: 'rv',
    stop: 0.5,
    questionId: 'q-s5',
    minClues: C,
    travelCaption: '판막이 열린 틈으로 다음 방에 들어가는 중…',
    arrival: [
      { speaker: 'student', text: '우와, 방이 꽉 쥐어지는 느낌이에요!' },
      { speaker: 'suyeon', mood: 'open', text: '그럼 여긴 받아들이는 방일까, 내보내는 방일까? 출구도 찾아봐.' },
    ],
    clues: [
      { id: 's5-c-valveback', anchor: 'rv-valveback', title: '지나온 판막', text: '방금 지나온 판막이 뒤에서 닫혀 혈액이 앞의 방으로 되돌아가지 않는다.' },
      { id: 's5-c-contract', anchor: 'rv-contract', title: '수축하는 벽', text: '방이 꽉 쥐어지듯 수축하며 혈액을 출구로 밀어낸다.' },
      { id: 's5-c-thickness', anchor: 'rv-thickness', title: '벽 두께 비교 장치', text: '이 방의 벽은 심방보다 두껍지만, 비교한 방 중 가장 두꺼운 방보다는 얇다.' },
      { id: 's5-c-exit', anchor: 'rv-exit', title: '출구', text: '출구 판막 너머 혈관이 두 갈래로 나뉘어 양쪽 폐 방향으로 이어진다. (인체 내비게이터: 심장 → 폐)' },
    ],
    reveals: ['rv'],
    solvedName: '우심실',
    answerTerms: ['우심실'],
  },
  {
    id: 'S6',
    kind: 'core',
    order: 6,
    locationId: 'pa',
    stop: 0.35,
    questionId: 'q-s6',
    minClues: C,
    travelCaption: '방이 수축하며 탐사선이 출구 밖으로 밀려 나가는 중…',
    arrival: [
      { speaker: 'suyeon', mood: 'open', text: '방에서 밀려 나왔어. 이 혈관은 어디로 가는 걸까? 측정기도 확인해 봐.' },
    ],
    clues: [
      { id: 's6-c-nav', anchor: 'pa-nav', title: '인체 내비게이터', text: '화살표가 "심장 → 폐" 방향을 가리킨다. 우리는 심장에서 멀어지고 있다.' },
      { id: 's6-c-o2', anchor: 'pa-o2', title: '산소 측정기', text: '산소가 적은 혈액이다(0은 아님). 혈액은 어두운 붉은색이다.' },
      { id: 's6-c-fork', anchor: 'pa-fork', title: '갈림길', text: '혈관이 두 갈래로 나뉘어 각각 왼쪽·오른쪽 폐를 향한다.' },
      { id: 's6-c-wall', anchor: 'pa-wall', title: '탄력 있는 벽', text: '벽이 두껍고 탄력 있어서, 박동이 올 때마다 늘어났다가 줄어든다.' },
      { id: 's6-c-valveback', anchor: 'pa-valveback', title: '뒤쪽 판막', text: '뒤쪽 판막은 방에서 혈액이 나올 때 열리고, 그 뒤에는 닫혀 역류를 막는다.' },
    ],
    reveals: ['pa'],
    solvedName: '폐동맥',
    answerTerms: ['폐동맥'],
  },
  {
    id: 'R5',
    kind: 'review',
    order: 5,
    locationId: 'pa',
    stop: 0.62,
    questionId: 'q-r5',
    minClues: R,
    travelCaption: '갈림길을 지나 한쪽 폐로 향하는 중…',
    arrival: [
      { speaker: 'suyeon', mood: 'smile', text: '이동하는 동안 홀로그램으로 혈관 단면을 비교해 보자. 보너스 관찰이야!' },
    ],
    clues: [
      { id: 'r5-c-holo', anchor: 'pa-holo', title: '혈관 단면 홀로그램', text: 'A: 벽이 두껍고 탄력 있음 / B: 벽이 비교적 얇고 안쪽에 판막 / C: 세포 한 층 정도의 매우 얇은 벽' },
    ],
    reveals: [],
    solvedName: '폐동맥',
    answerTerms: [],
  },
  {
    id: 'S7',
    kind: 'core',
    order: 7,
    locationId: 'lungCap',
    stop: 0.42,
    questionId: 'q-s7',
    minClues: C,
    travelCaption: '혈관이 갈라지며 아주 가늘어지는 중…',
    arrival: [
      { speaker: 'student', text: '바깥에 동글동글한 주머니들이 보여요! 우리 혈관이 그걸 감싸고 있어요.' },
      { speaker: 'suyeon', mood: 'open', text: '주머니 안에는 뭐가 있을까? 입자가 움직이는 방향도 같이 봐.' },
    ],
    clues: [
      { id: 's7-c-sacs', anchor: 'lc-alveoli', title: '바깥의 둥근 주머니', text: '혈관 바깥에 공기가 든 둥근 주머니들이 포도송이처럼 모여 있다. 혈관이 그물처럼 주머니를 감싼다.' },
      { id: 's7-c-breath', anchor: 'lc-breath', title: '주머니의 움직임', text: '주머니가 숨 쉬는 리듬에 맞춰 부풀었다 줄어든다.' },
      { id: 's7-c-gas', anchor: 'lc-gas', title: '움직이는 기체 입자', text: '산소 입자는 주머니에서 혈액으로, 이산화탄소 입자는 혈액에서 주머니 쪽으로 이동한다. (학습용 시각화)' },
      { id: 's7-c-o2', anchor: 'lc-o2', title: '산소 측정기', text: '산소 측정기의 수치가 올라간다. (산소 적음 → 산소 풍부)' },
      { id: 's7-c-wall', anchor: 'lc-wall', title: '얇은 두 겹의 벽', text: '혈관 벽과 주머니 벽이 모두 아주 얇다. 공기는 주머니 안에, 적혈구는 혈관 안에 따로 있다.' },
    ],
    reveals: ['lungCap'],
    solvedName: '폐의 모세혈관',
    answerTerms: ['모세혈관', '폐포'],
  },
  {
    id: 'R2',
    kind: 'review',
    order: 2,
    locationId: 'lungCap',
    stop: 0.72,
    questionId: 'q-r2',
    minClues: R,
    travelCaption: '천천히 이동하며 혈액 성분을 확대 관찰하는 중…',
    arrival: [
      { speaker: 'suyeon', mood: 'smile', text: '보너스 관찰! 혈구들이 떠 있는 이 액체를 확대해 볼까?' },
    ],
    clues: [
      { id: 'r2-c-liquid', anchor: 'lc-plasma', title: '확대 관찰 창', text: '혈구들이 연한 노란색 액체에 떠서 함께 흘러간다. 분리 캡슐에서는 위쪽에 노란 액체층, 아래쪽에 붉은 혈구층이 나뉜다.' },
    ],
    reveals: [],
    solvedName: '폐의 모세혈관',
    answerTerms: [],
  },
  {
    id: 'S8',
    kind: 'core',
    order: 8,
    locationId: 'pv',
    stop: 0.4,
    questionId: 'q-s8',
    minClues: C,
    travelCaption: '가는 혈관들이 모여 다시 굵어지는 중…',
    arrival: [
      { speaker: 'student', text: '혈액 색이 아까보다 더 선명해졌어요.' },
      { speaker: 'suyeon', mood: 'open', text: '그럼 우리는 지금 어디에서 어디로 가고 있을까?' },
    ],
    clues: [
      { id: 's8-c-o2', anchor: 'pv-o2', title: '산소 측정기', text: '산소가 풍부한 혈액이다. 선명한 붉은색이다.' },
      { id: 's8-c-nav', anchor: 'pv-nav', title: '인체 내비게이터', text: '화살표가 "폐 → 심장" 방향을 가리킨다. 심장에 가까워지고 있다.' },
      { id: 's8-c-merge', anchor: 'pv-merge', title: '합쳐지는 혈관', text: '폐의 가는 혈관들이 모여 굵어지고 있다.' },
      { id: 's8-c-ahead', anchor: 'pv-ahead', title: '앞쪽 끝', text: '심장박동이 커지고, 혈관 끝이 심장의 한 방으로 이어져 있다.' },
    ],
    reveals: ['pv'],
    solvedName: '폐정맥',
    answerTerms: ['폐정맥'],
  },
  {
    id: 'R3',
    kind: 'review',
    order: 3,
    locationId: 'pv',
    stop: 0.68,
    questionId: 'q-r3',
    minClues: R,
    travelCaption: '앞쪽에서 무언가 움직인다…',
    arrival: [
      { speaker: 'suyeon', mood: 'surprised', text: '저기 하얀 세포가 뭔가를 쫓고 있어! 보너스 관찰이야.' },
    ],
    clues: [
      { id: 'r3-c-cell', anchor: 'pv-wbc', title: '하얀 세포', text: '핵이 있고 모양이 일정하지 않은 하얀 세포가 막대 모양의 세균을 감싸 삼킨다.' },
    ],
    reveals: [],
    solvedName: '폐정맥',
    answerTerms: [],
  },
  {
    id: 'S9',
    kind: 'core',
    order: 9,
    locationId: 'la',
    stop: 0.5,
    questionId: 'q-s9',
    minClues: C,
    travelCaption: '혈관 끝을 지나 심장으로 들어가는 중…',
    arrival: [
      { speaker: 'suyeon', mood: 'open', text: '또 하나의 방이야. 들어온 입구와 다음 문을 잘 봐.' },
    ],
    clues: [
      { id: 's9-c-inlet', anchor: 'la-inlet', title: '들어온 입구들', text: '방금 지나온 폐정맥이 이 방으로 이어져 있다. 비슷한 입구가 여러 개 보인다.' },
      { id: 's9-c-thickness', anchor: 'la-thickness', title: '벽 두께 비교 장치', text: '벽이 얇은 편이다. 혈액이 들어오며 방이 부푼다.' },
      { id: 's9-c-valve', anchor: 'la-valve', title: '판막과 다음 방', text: '아래쪽 방으로 이어지는 판막(얇은 막 2장). 판막 너머로 아주 두꺼운 근육 벽이 보인다. 출발점에서 본 벽과 닮았다.' },
      { id: 's9-c-o2', anchor: 'la-o2', title: '산소 측정기', text: '산소가 풍부한 혈액이다.' },
    ],
    reveals: ['la'],
    solvedName: '좌심방',
    answerTerms: ['좌심방'],
  },
  {
    id: 'S10',
    kind: 'core',
    order: 10,
    locationId: 'lv',
    stop: 0.5,
    questionId: 'q-s10',
    minClues: C,
    travelCaption: '판막이 열린 틈으로 다음 방에 들어가는 중…',
    arrival: [
      { speaker: 'student', text: '어? 이 방… 어디서 본 것 같은데요?' },
      { speaker: 'suyeon', mood: 'wink', text: '느낌만으로는 안 돼. 확실한 단서를 찾아봐!' },
    ],
    clues: [
      { id: 's10-c-flag', anchor: 'lv-flag', title: '벽에 꽂힌 깃발', text: '벽에 출발할 때 꽂아 둔 탐사 표식이 그대로 있다.' },
      { id: 's10-c-thickness', anchor: 'lv-thickness', title: '벽 두께 비교 장치', text: '이 방의 근육 벽이 다른 세 방보다 훨씬 두껍다.' },
      { id: 's10-c-pressure', anchor: 'lv-pressure', title: '수축 압력계', text: '수축할 때 압력계 바늘이 크게 치솟는다.' },
      { id: 's10-c-inlet', anchor: 'lv-inlet', title: '방금 지나온 판막', text: '방금 지나온 판막(좌심방 쪽)이 이 방이 수축할 때 닫혀 역류를 막는다.' },
    ],
    reveals: ['lv'],
    solvedName: '좌심실',
    answerTerms: ['좌심실'],
  },
];

export const STEP_MAP: Record<string, RouteStep> = Object.fromEntries(ROUTE.map((s) => [s.id, s]));

export function getStep(id: string): RouteStep {
  const s = STEP_MAP[id];
  if (!s) throw new Error(`알 수 없는 단계: ${id}`);
  return s;
}

export const CORE_STEPS = ROUTE.filter((s) => s.kind === 'core');
export const REVIEW_STEPS = ROUTE.filter((s) => s.kind === 'review');

/** 순환 경로 순서(지도·데이터·3D 공간이 모두 이 순서를 따른다) */
export const CIRCULATION_ORDER: NodeId[] = ['lv', 'aorta', 'sysCap', 'venaCava', 'ra', 'rv', 'pa', 'lungCap', 'pv', 'la'];
