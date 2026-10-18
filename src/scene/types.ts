import type { ComponentType } from 'react';
import type { Curve, Vector3 } from 'three';
import type { LocationId } from '../data/types';

/** 각 공간(장면) 컴포넌트가 받는 속성 */
export interface LocationProps {
  /** 지금 관찰할 수 있는 관찰 지점 이름(현재 단계의 단서 중 탐사선 계기판이 아닌 것) */
  activeAnchors: string[];
  /** 이미 확인한 관찰 지점 이름 */
  observedAnchors: string[];
  /** 관찰 지점을 눌렀을 때 */
  onAnchorClick: (anchor: string) => void;
  /** 관찰 지점 이름 → 표시 제목(정답 이름이 아닌 일반 이름, 예: '벽 두께 비교 장치') */
  anchorLabels: Record<string, string>;
  /** 현재 단계 id(S1, R1 …). 같은 공간이라도 단계에 따라 연출이 다를 때 사용 */
  stepId: string;
  /** S1을 해결해 좌심실 벽에 탐사 표식을 꽂았는지 */
  flagPlanted: boolean;
  lowSpec: boolean;
  reduceMotion: boolean;
}

export interface LocationDef {
  id: LocationId;
  /** 탐사선이 따라가는 경로(t: 0 = 입구, 1 = 출구). 공간 원점 기준 월드 좌표. */
  path: Curve<Vector3>;
  /** 경로 위치 t에서 탐사선 중심이 움직일 수 있는 좌우 여유(조향 한계, 0이면 조향 불가) */
  laneHalfWidth: (t: number) => number;
  /** 배경색·안개 */
  background: string;
  fog: { color: string; near: number; far: number };
  /** 조명 기본값 */
  ambient: { sky: string; ground: string; intensity: number };
  /** 'probe': 탐사선 + 수연쌤 표시 / 'none': 공간 컴포넌트가 직접 탈것을 그림(놀이공원) */
  vehicle: 'probe' | 'none';
  /** 효과음 심장박동 크기(0~1) */
  heartbeat: number;
  Component: ComponentType<LocationProps>;
}
