// 대정맥 공간의 배치. 가는 정맥(작은 틈 관찰)에서 시작 → 옆에서 다른 혈관들이 계속 합쳐지며
// 굵어지고 → 끝은 심장의 한 방 입구로 열린다. 이 혈관 안에는 판막이 없다.

import { Vector3 } from 'three';
import { pointAround } from '../../shared/pathFrames';
import { makeVessel, pathOffset, radiusKnots, wallBasis, type V3, type WallHole } from './common';

export const VC_STOP_R4 = 0.2;
export const VC_STOP_S3 = 0.7;

export const vcRadius = radiusKnots([
  [0, 2.4],
  [0.27, 2.45],
  [0.35, 3.1],
  [0.45, 3.9],
  [0.56, 4.8],
  [0.66, 5.5],
  [0.78, 6.3],
  [0.9, 7.0],
  [1, 7.0],
]);

export const VENA_CAVA = makeVessel(
  [
    [0, 0, 0],
    [1.5, 0.3, -10],
    [0, 0.8, -20],
    [-2.5, 1.5, -30],
    [-2, 2.5, -40],
    [0, 3.5, -50],
    [1, 4, -60],
  ],
  vcRadius,
);

export interface TributarySpec {
  hole: WallHole;
  /** 음수: 뒤쪽(상류)에서 비스듬히 들어와 합쳐진다 */
  forward: number;
  length: number;
}

/** 옆에서 합쳐지는 혈관들(마지막 것이 'vc-merge' 관찰 지점) */
export const VC_TRIBUTARIES: TributarySpec[] = [
  { hole: { t: 0.31, angle: -1.6, a: 1.25, b: 1.0 }, forward: -0.8, length: 10 },
  { hole: { t: 0.42, angle: 1.5, a: 1.5, b: 1.3 }, forward: -0.8, length: 10 },
  { hole: { t: 0.53, angle: -2.3, a: 1.75, b: 1.5 }, forward: -0.8, length: 11 },
  { hole: { t: 0.62, angle: 2.2, a: 2.0, b: 1.7 }, forward: -0.8, length: 11 },
  { hole: { t: 0.745, angle: -0.95, a: 2.5, b: 2.05 }, forward: -0.75, length: 12 },
];
export const VC_MERGE_INDEX = 4;

export const VC_ALL_HOLES: WallHole[] = VC_TRIBUTARIES.map((b) => b.hole);

/** 작은 틈(R4): 정차한 탐사선 오른쪽 앞 벽, 눈높이 근처 */
export const VC_WOUND = { t: 0.24, angle: 1.35 };

/** 'vc-wound' 관찰 지점: 틈을 가리지 않도록 틈 바로 하류 쪽, 벽에서 조금 떨어진 곳 */
export const VC_WOUND_ANCHOR: V3 = (() => {
  const w = wallBasis(VENA_CAVA, VC_WOUND.t + 1.35 / VENA_CAVA.length, VC_WOUND.angle, 0.5);
  return [w.pos.x, w.pos.y, w.pos.z] as V3;
})();

/** 'vc-merge': 합쳐지는 혈관 입구 가운데에서 안쪽으로 들어온 곳 */
export const VC_MERGE_ANCHOR: V3 = (() => {
  const h = VC_TRIBUTARIES[VC_MERGE_INDEX].hole;
  const w = wallBasis(VENA_CAVA, h.t, h.angle, 1.6);
  return [w.pos.x, w.pos.y, w.pos.z] as V3;
})();

/** 흐름 표시 선(학습용)이 지나가는 구간 */
export const VC_FLOW_RANGE: [number, number] = [0.6, 0.86];
export const VC_FLOW_LINES: { angle: number; rf: number }[] = [
  { angle: 1.05, rf: 0.5 },
  { angle: 1.75, rf: 0.58 },
  { angle: 2.45, rf: 0.55 },
  { angle: -2.75, rf: 0.6 },
  { angle: 0.4, rf: 0.6 },
];

function onFlowLine(t: number, lift: number): V3 {
  const ln = VC_FLOW_LINES[0];
  const p = pointAround(VENA_CAVA.frames, t, ln.angle, ln.rf * vcRadius(t), new Vector3());
  return [p.x, p.y + lift, p.z];
}

/** 'vc-flow': 첫 번째 흐름 표시 선 위(정차 지점 오른쪽 앞) */
export const VC_FLOW_ANCHOR: V3 = onFlowLine(VC_STOP_S3 + 3.6 / VENA_CAVA.length, 0);
export const VC_FLOW_LABEL: V3 = onFlowLine(VC_STOP_S3 + 1.6 / VENA_CAVA.length, 0.75);

/** 'vc-ahead': 앞쪽 끝(심장의 방 입구)을 바라보는 방향, 정차 지점 7 앞 */
export const VC_AHEAD_ANCHOR: V3 = pathOffset(VENA_CAVA, VC_STOP_S3, 6.6, 1.1, 0);
