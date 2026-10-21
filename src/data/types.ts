// 콘텐츠(데이터) 타입 정의. 렌더링 코드와 분리되어 있어 교사가 data 폴더만 수정해도 된다.

/** 지도에 표시되는 순환 경로의 주요 지점 */
export type NodeId =
  | 'lv'
  | 'aorta'
  | 'sysCap'
  | 'venaCava'
  | 'ra'
  | 'rv'
  | 'pa'
  | 'lungCap'
  | 'pv'
  | 'la';

/** 3D 장면(공간) */
export type LocationId = 'park' | NodeId;

export type Speaker = 'suyeon' | 'student' | 'friend' | 'narration';
/**
 * 수연쌤 표정(캐릭터 시트 기준)
 * smile: 기본(눈 감고 웃음) · open: 정면(눈 뜸) · cheer: 활짝 웃음
 * surprised: 놀람 · wink: 윙크 · worried: 걱정
 */
export type Mood = 'smile' | 'open' | 'cheer' | 'surprised' | 'wink' | 'worried';

export interface DialogueLine {
  speaker: Speaker;
  text: string;
  mood?: Mood;
}

export interface Choice {
  id: string;
  text: string;
}

export type QuestionKind = 'core' | 'review';

export interface Question {
  id: string;
  /** 이 문항이 제시되는 단계(RouteStep.id) */
  stageId: string;
  kind: QuestionKind;
  /** 이 문항이 다루는 핵심 개념 */
  conceptIds: string[];
  prompt: string;
  /** 첫 번째 선택 묶음의 제목(예: 현재 위치, 이름) */
  answerLabel: string;
  /** 두 번째 선택 묶음의 제목(예: 근거, 주된 역할) */
  reasonLabel: string;
  options: Choice[];
  correctAnswer: string;
  reasonOptions: Choice[];
  correctReason: string;
  hints: string[];
  /** 정답 확인 후(복습은 응답 후) 보여 주는 설명 */
  explanation: string;
  /** 정답일 때 수연쌤의 첫 반응 */
  correctLine: string;
  /** 오답 선택지 id → 그 선택에 대응하는 설명(오개념 진단) */
  misconceptionFeedback: Record<string, string>;
  /** 오답 선택지 id → 보충해야 할 개념 id */
  misconceptionConcepts: Record<string, string[]>;
  /** 핵심 문항 오답 뒤에 추가로 제공하는 단서(정답 이름은 쓰지 않는다) */
  extraClue?: string;
}

export interface Clue {
  id: string;
  /** 3D 장면 안의 관찰 지점 이름(anchor). 장면 컴포넌트가 이 이름으로 위치를 찾는다. */
  anchor: string;
  /** 관찰 지점의 이름. 정답 장소 이름을 쓰지 않는다. */
  title: string;
  text: string;
}

export interface RouteStep {
  id: string;
  kind: QuestionKind;
  /** 핵심 단계 번호(1~10) 또는 복습 번호(1~6) */
  order: number;
  locationId: Exclude<LocationId, 'park'>;
  /** 장면 경로(0~1) 위에서 탐사선이 정차하는 지점 */
  stop: number;
  questionId: string;
  clues: Clue[];
  /** 이동 중 화면에 표시하는 짧은 설명 */
  travelCaption: string;
  arrival: DialogueLine[];
  /** 정답 후 추가로 이어지는 대사 */
  afterCorrect?: DialogueLine[];
  /** 해결되면 지도에 나타나는 지점 */
  reveals: NodeId[];
  /** 해결 후 HUD에 표시할 장소 이름 */
  solvedName: string;
  /** 자동 검증용: 이 단계의 정답 장소 이름(단서·힌트·대사에 나오면 안 됨) */
  answerTerms: string[];
}

export interface Concept {
  id: string;
  name: string;
  explanation: string;
  rethink: string;
  recheck: { statement: string; answer: boolean; explanation: string };
}

export type O2Level = 'rich' | 'poor';
export type Circulation = 'pulmonary' | 'systemic';

export interface MapNode {
  id: NodeId;
  name: string;
  x: number;
  y: number;
  circulation: Circulation;
  kind: 'chamber' | 'vessel' | 'capillary';
}

export interface MapEdge {
  from: NodeId;
  to: NodeId;
  /** 이 연결선은 해당 핵심 단계를 해결해야 지도에 나타난다 */
  revealedBy: string;
  o2: O2Level;
}
