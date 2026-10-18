// 대동맥 공간의 배치(경로·반지름·곁가지·관찰 지점). 화면 코드(Aorta.tsx)와 분리해 수치를 검사할 수 있게 한다.
// 판막 바로 뒤에서 매우 굵게 시작 → 위로 활처럼 휘며(위쪽 곁가지 3개) → 내려가면서 계속 갈라지고 가늘어진다.
// (대동맥은 모세혈관과 바로 이어지지 않는다: 갈라지고 가늘어진 동맥을 지나 다음 공간으로 간다)

import { makeVessel, pathOffset, radiusKnots, wallBasis, type V3, type WallHole } from './common';

export const AORTA_STOP_R1 = 0.42;

export const aortaRadius = radiusKnots([
  [0, 6.5],
  [0.36, 6.4],
  [0.41, 5.9],
  [0.48, 5.9],
  [0.53, 5.3],
  [0.58, 5.3],
  [0.63, 4.6],
  [0.68, 4.6],
  [0.74, 3.9],
  [0.8, 3.8],
  [0.86, 3.0],
  [0.92, 2.6],
  [1, 2.4],
]);

export const AORTA = makeVessel(
  [
    [0, 0, 0],
    [0, 2.2, -9],
    [-1.2, 5.0, -18.5],
    [-6.5, 7.0, -26.5],
    [-14.5, 7.6, -29.5],
    [-22.5, 6.6, -26.5],
    [-28, 4.4, -19],
    [-29.5, 1.6, -9],
    [-29.5, -1.2, 1],
    [-28.5, -3.4, 11],
    [-26.5, -5, 21],
    [-25, -6, 31],
  ],
  aortaRadius,
);

export interface BranchSpec {
  hole: WallHole;
  /** 곁가지가 흐름 방향으로 기울어진 정도 */
  forward: number;
  length: number;
}

/** 활 모양 꼭대기의 곁가지 3개 */
export const AORTA_ARCH_BRANCHES: BranchSpec[] = [
  { hole: { t: 0.235, angle: -0.15, a: 1.75, b: 1.6 }, forward: 0.35, length: 11 },
  { hole: { t: 0.3, angle: -0.05, a: 1.45, b: 1.3 }, forward: 0.3, length: 10 },
  { hole: { t: 0.363, angle: 0.05, a: 1.55, b: 1.4 }, forward: 0.3, length: 10 },
];

/** 관찰 지점 'ao-branch'가 있는 곁가지(정차 지점 바로 앞, 오른쪽 위) */
export const AORTA_STOP_BRANCH: BranchSpec = { hole: { t: 0.462, angle: 0.95, a: 1.55, b: 1.4 }, forward: 0.6, length: 10 };

/** 내려가는 동안 계속 갈라지는 곁가지(마지막은 Y자 갈림) */
export const AORTA_LOWER_BRANCHES: BranchSpec[] = [
  { hole: { t: 0.555, angle: -2.0, a: 1.35, b: 1.2 }, forward: 0.7, length: 9 },
  { hole: { t: 0.655, angle: 1.95, a: 1.2, b: 1.1 }, forward: 0.7, length: 9 },
  { hole: { t: 0.72, angle: -0.75, a: 1.05, b: 0.95 }, forward: 0.8, length: 8 },
  // Y자 갈림: 따라가는 쪽과 비슷한 굵기의 다른 갈래
  { hole: { t: 0.845, angle: 1.65, a: 2.1, b: 1.5 }, forward: 1.25, length: 12 },
];

export const AORTA_ALL_HOLES: WallHole[] = [
  ...AORTA_ARCH_BRANCHES.map((b) => b.hole),
  AORTA_STOP_BRANCH.hole,
  ...AORTA_LOWER_BRANCHES.map((b) => b.hole),
];

/** 크게 보여 주는 적혈구 모형(정차한 탐사선 왼쪽 앞, 눈높이보다 살짝 위) */
export const AORTA_BIG_RBC: V3 = pathOffset(AORTA, AORTA_STOP_R1, 3.0, 1.85, -2.35);

/** 'ao-branch' 관찰 지점: 곁가지 입구 가운데에서 혈관 안쪽으로 조금 들어온 곳 */
export const AORTA_BRANCH_ANCHOR: V3 = (() => {
  const w = wallBasis(AORTA, AORTA_STOP_BRANCH.hole.t, AORTA_STOP_BRANCH.hole.angle, 1.4);
  return [w.pos.x, w.pos.y, w.pos.z] as V3;
})();
