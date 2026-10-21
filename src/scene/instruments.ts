// 탐사선 계기판에 표시할 값(공간별). 정답 장소 이름은 쓰지 않는다.

import type { LocationId } from '../data/types';

export interface InstrumentState {
  /** 산소 측정기 값(0.15~1). 0이 되지 않는다. */
  o2: number;
  /** 산소 측정기 글자 */
  o2Label: '산소 풍부' | '산소 적음' | '산소 증가 중' | '산소 감소 중' | '측정 대기';
  /** 산소가 변하는 공간에서 측정기 값이 움직이는 방향 */
  o2Trend: 'up' | 'down' | 'steady';
  /** 인체 내비게이터: 출발 쪽 → 도착 쪽 */
  nav: { from: '심장' | '허파' | '온몸' | '심장 안'; to: '심장' | '허파' | '온몸' | '심장 안'; label: string } | null;
}

export const INSTRUMENTS: Record<LocationId, InstrumentState> = {
  park: { o2: 0, o2Label: '측정 대기', o2Trend: 'steady', nav: null },
  lv: { o2: 0.95, o2Label: '산소 풍부', o2Trend: 'steady', nav: { from: '심장 안', to: '온몸', label: '심장 → 온몸' } },
  aorta: { o2: 0.95, o2Label: '산소 풍부', o2Trend: 'steady', nav: { from: '심장', to: '온몸', label: '심장 → 온몸' } },
  // 모세혈관에서는 방향 신호를 끈다(장소 이름이 드러나지 않도록 — 물질 이동 방향이 핵심 단서)
  sysCap: { o2: 0.95, o2Label: '산소 감소 중', o2Trend: 'down', nav: null },
  venaCava: { o2: 0.35, o2Label: '산소 적음', o2Trend: 'steady', nav: { from: '온몸', to: '심장', label: '온몸 → 심장' } },
  ra: { o2: 0.35, o2Label: '산소 적음', o2Trend: 'steady', nav: { from: '온몸', to: '심장 안', label: '온몸 → 심장 안' } },
  rv: { o2: 0.35, o2Label: '산소 적음', o2Trend: 'steady', nav: { from: '심장 안', to: '허파', label: '심장 → 허파' } },
  pa: { o2: 0.35, o2Label: '산소 적음', o2Trend: 'steady', nav: { from: '심장', to: '허파', label: '심장 → 허파' } },
  lungCap: { o2: 0.35, o2Label: '산소 증가 중', o2Trend: 'up', nav: null },
  pv: { o2: 0.95, o2Label: '산소 풍부', o2Trend: 'steady', nav: { from: '허파', to: '심장', label: '허파 → 심장' } },
  la: { o2: 0.95, o2Label: '산소 풍부', o2Trend: 'steady', nav: { from: '허파', to: '심장 안', label: '허파 → 심장 안' } },
};

/**
 * 탐사선 계기판에 붙어 있는 관찰 지점. 이 anchor들은 공간 컴포넌트가 아니라
 * 탐사선(Vehicle) 컴포넌트가 계기 위치에 관찰 표시를 그린다.
 */
export const DASHBOARD_ANCHORS: Record<string, 'o2' | 'nav' | 'pressure'> = {
  'sc-o2meter': 'o2',
  'vc-o2': 'o2',
  'pa-o2': 'o2',
  'lc-o2': 'o2',
  'pv-o2': 'o2',
  'la-o2': 'o2',
  'vc-nav': 'nav',
  'pa-nav': 'nav',
  'pv-nav': 'nav',
  'lv-pressure': 'pressure',
};

export function isDashboardAnchor(anchor: string): boolean {
  return anchor in DASHBOARD_ANCHORS;
}
