import type { MapEdge, MapNode, NodeId } from './types';

// 순환계 지도(정면도). 그림 속 사람이 학생을 마주 보고 있으므로
// 몸의 오른쪽(우심방·우심실)이 화면 왼쪽, 몸의 왼쪽(좌심방·좌심실)이 화면 오른쪽에 그려진다.

export const MAP_VIEWBOX = { width: 600, height: 540 };

export const MAP_NODES: Record<NodeId, MapNode> = {
  lungCap: { id: 'lungCap', name: '폐의 모세혈관', x: 300, y: 62, circulation: 'pulmonary', kind: 'capillary' },
  pa: { id: 'pa', name: '폐동맥', x: 168, y: 150, circulation: 'pulmonary', kind: 'vessel' },
  pv: { id: 'pv', name: '폐정맥', x: 432, y: 150, circulation: 'pulmonary', kind: 'vessel' },
  ra: { id: 'ra', name: '우심방', x: 252, y: 236, circulation: 'systemic', kind: 'chamber' },
  la: { id: 'la', name: '좌심방', x: 348, y: 236, circulation: 'pulmonary', kind: 'chamber' },
  rv: { id: 'rv', name: '우심실', x: 252, y: 318, circulation: 'pulmonary', kind: 'chamber' },
  lv: { id: 'lv', name: '좌심실', x: 348, y: 318, circulation: 'systemic', kind: 'chamber' },
  venaCava: { id: 'venaCava', name: '대정맥', x: 120, y: 396, circulation: 'systemic', kind: 'vessel' },
  aorta: { id: 'aorta', name: '대동맥', x: 480, y: 396, circulation: 'systemic', kind: 'vessel' },
  sysCap: { id: 'sysCap', name: '온몸의 모세혈관', x: 300, y: 486, circulation: 'systemic', kind: 'capillary' },
};

/**
 * 순환 경로의 연결선. revealedBy 단계의 문항을 해결해야 지도에 나타난다.
 * o2: 이 구간을 흐르는 혈액의 산소 상태(지도에서는 기호색 + 글자 + 아이콘으로 함께 표시)
 */
export const MAP_EDGES: MapEdge[] = [
  { from: 'lv', to: 'aorta', revealedBy: 'S1', o2: 'rich' },
  { from: 'aorta', to: 'sysCap', revealedBy: 'S2', o2: 'rich' },
  { from: 'sysCap', to: 'venaCava', revealedBy: 'S3', o2: 'poor' },
  { from: 'venaCava', to: 'ra', revealedBy: 'S4', o2: 'poor' },
  { from: 'ra', to: 'rv', revealedBy: 'S5', o2: 'poor' },
  { from: 'rv', to: 'pa', revealedBy: 'S6', o2: 'poor' },
  { from: 'pa', to: 'lungCap', revealedBy: 'S7', o2: 'poor' },
  { from: 'lungCap', to: 'pv', revealedBy: 'S8', o2: 'rich' },
  { from: 'pv', to: 'la', revealedBy: 'S9', o2: 'rich' },
  { from: 'la', to: 'lv', revealedBy: 'S10', o2: 'rich' },
];

/** 물질 교환으로 산소량이 바뀌는 지점 */
export const EXCHANGE_ZONES: { node: NodeId; change: 'up' | 'down'; label: string }[] = [
  { node: 'lungCap', change: 'up', label: '산소가 풍부해지는 구간' },
  { node: 'sysCap', change: 'down', label: '산소가 적어지는 구간' },
];

/** 지도 노드별로 학습 상태를 보여 줄 문항(핵심 단계) */
export const NODE_STEPS: Record<NodeId, string[]> = {
  lv: ['S1', 'S10'],
  aorta: ['S1'],
  sysCap: ['S2'],
  venaCava: ['S3'],
  ra: ['S4'],
  rv: ['S5'],
  pa: ['S6'],
  lungCap: ['S7'],
  pv: ['S8'],
  la: ['S9'],
};

export const O2_LABEL = {
  rich: { text: '산소 풍부', icon: '●●●' },
  poor: { text: '산소 적음', icon: '●○○' },
} as const;

export const MAP_COLOR_NOTE =
  '선 색은 이해를 돕기 위한 기호색입니다. 실제 혈액은 산소가 적어도 붉은색이며, 산소가 0이 되지는 않습니다.';
export const MAP_SIDE_NOTE = '마주 보고 그린 그림이에요. 심장의 왼쪽·오른쪽은 몸 주인 기준이라, 몸의 오른쪽이 화면의 왼쪽에 있어요.';
