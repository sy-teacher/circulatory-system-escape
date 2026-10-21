// 폐정맥 공간의 배치. 허파에서 오는 가는 혈관들이 합쳐지며(t 0~0.45) 중간 굵기가 되고,
// 끝은 심장의 한 방으로 열린다. 중간에 백혈구가 세균을 쫓는 장면(R3)이 있다.

import { Quaternion, Vector3 } from 'three';
import { poseOnPath } from '../../shared/pathFrames';
import { clamp01, makeVessel, pathOffset, radiusKnots, wallBasis, type V3, type WallHole } from './common';

export const PV_STOP_S8 = 0.4;
export const PV_STOP_R3 = 0.68;

export const pvRadius = radiusKnots([
  [0, 2.2],
  [0.08, 2.25],
  [0.15, 2.6],
  [0.23, 2.95],
  [0.31, 3.25],
  [0.46, 3.6],
  [1, 3.6],
]);

export const PV = makeVessel(
  [
    [0, 0, 0],
    [-1.5, 0.2, -10],
    [0, 0.6, -20],
    [2.5, 1.0, -30],
    [2, 1.2, -40],
    [0, 1.2, -50],
  ],
  pvRadius,
);

export interface PvTributary {
  hole: WallHole;
  forward: number;
  length: number;
}

/** 허파에서 오는 가는 혈관들(마지막 것이 'pv-merge') */
export const PV_TRIBUTARIES: PvTributary[] = [
  { hole: { t: 0.1, angle: -1.45, a: 1.05, b: 0.9 }, forward: -0.9, length: 9 },
  { hole: { t: 0.17, angle: 1.7, a: 1.1, b: 0.95 }, forward: -0.9, length: 9 },
  { hole: { t: 0.25, angle: -2.45, a: 1.2, b: 1.0 }, forward: -0.9, length: 9 },
  { hole: { t: 0.32, angle: 0.75, a: 1.2, b: 1.0 }, forward: -0.9, length: 9 },
  { hole: { t: 0.455, angle: -1.0, a: 1.6, b: 1.35 }, forward: -0.85, length: 10 },
];
export const PV_MERGE_INDEX = 4;

export const PV_ALL_HOLES: WallHole[] = PV_TRIBUTARIES.map((b) => b.hole);

export const PV_MERGE_ANCHOR: V3 = (() => {
  const h = PV_TRIBUTARIES[PV_MERGE_INDEX].hole;
  const w = wallBasis(PV, h.t, h.angle, 1.2);
  return [w.pos.x, w.pos.y, w.pos.z] as V3;
})();

export const PV_AHEAD_ANCHOR: V3 = pathOffset(PV, PV_STOP_S8, 6.6, 1.0, 0);

/** 백혈구 장면 가운데: R3 정차 지점 왼쪽 앞, 눈높이보다 조금 위 */
export const PV_WBC_AHEAD = 3.3;
export const PV_WBC_CENTER: V3 = pathOffset(PV, PV_STOP_R3, PV_WBC_AHEAD, 1.45, -1.55);
/** 'pv-wbc' 관찰 표시(장면을 가리지 않도록 조금 아래) */
export const PV_WBC_SPOT: V3 = pathOffset(PV, PV_STOP_R3, PV_WBC_AHEAD, 1.45 - 1.0, -1.55);

/** 백혈구 장면이 탐사선 쪽을 바라보는 회전(경로 방향의 반대) */
export function pvWbcQuaternion(): Quaternion {
  const q = new Quaternion();
  const p = new Vector3();
  poseOnPath(PV.pathFrames, clamp01(PV_STOP_R3 + PV_WBC_AHEAD / PV.length), 0, 0, p, q);
  // 탐사선 자세(−z가 앞)를 그대로 쓰면 장면의 +z가 탐사선 쪽을 향한다
  return q;
}
