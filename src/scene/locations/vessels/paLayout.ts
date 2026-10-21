// 폐동맥 공간의 배치. 판막 바로 뒤에서 시작해 왼쪽으로 휘고(뒤 왼쪽에 판막이 보이도록),
// t≈0.45에서 두 갈래(양쪽 허파)로 갈라진 뒤 한 갈래를 따라간다.

import { Vector3 } from 'three';
import { makeVessel, pathOffset, radiusKnots, wallBasis, type V3, type WallHole } from './common';

export const PA_STOP_S6 = 0.35;
export const PA_STOP_R5 = 0.62;

export const paRadius = radiusKnots([
  [0, 4.6],
  [0.4, 4.5],
  [0.56, 3.4],
  [1, 3.2],
]);

/**
 * 수평면에서 직선·원호를 이어 붙인 중심축 제어점(높이는 따로 완만하게).
 * 왼쪽으로 52° 휘었다가(판막이 정차 지점의 왼쪽 뒤에 오도록) 갈림길을 지나 오른쪽으로 60° 휜다.
 */
function paAxisPoints(): V3[] {
  const pts: V3[] = [];
  let x = 0;
  let z = 0;
  let heading = 0; // 0 = −z 방향, +는 왼쪽으로 회전
  let s = 0;
  const push = () => {
    // 살짝 올라갔다가 평평해지는 높이
    const y = 1.1 * Math.sin(Math.min(1, s / 14) * Math.PI * 0.5);
    pts.push([x, y, z]);
  };
  push();
  const segs: [number, number][] = [
    // [길이, 곡률 반지름(+왼쪽, −오른쪽, 0 직선)]
    [0.6, 0],
    [6.0, 6.6],
    [0.8, 0],
    [9.4, -9],
    [2.6, 0],
  ];
  const step = 0.6;
  for (const [len, rc] of segs) {
    const n = Math.max(1, Math.round(len / step));
    for (let i = 0; i < n; i++) {
      const ds = len / n;
      const dh = rc === 0 ? 0 : ds / rc;
      const hm = heading + dh / 2;
      x += -Math.sin(hm) * ds;
      z += -Math.cos(hm) * ds;
      heading += dh;
      s += ds;
      push();
    }
  }
  return pts;
}

export const PA = makeVessel(paAxisPoints(), paRadius);

/** 판막과 뿌리 부분: 경로 시작점보다 이만큼 뒤 */
export const PA_VALVE_BACK = 1.5;
export const PA_ROOT_LENGTH = 4.2;

/** 다른 쪽 허파로 가는 갈래(왼쪽) */
export const PA_FORK_HOLE: WallHole = { t: 0.47, angle: -1.5, a: 2.4, b: 2.15 };
export const PA_FORK_FORWARD = 1.0;
export const PA_FORK_LENGTH = 13;

/** 두꺼운 벽 단면을 보여 주는 관찰 창(오른쪽 위) */
export const PA_WALL_WINDOW: WallHole = { t: 0.44, angle: 0.95, a: 1.15, b: 1.05 };

export const PA_ALL_HOLES: WallHole[] = [PA_FORK_HOLE, PA_WALL_WINDOW];

/** 판막 가운데와 방향 */
export function paValveFrame(): { center: Vector3; T: Vector3; N: Vector3 } {
  const T = PA.frames.tangents[0].clone();
  const N = PA.frames.normals[0].clone();
  const center = PA.frames.points[0].clone().addScaledVector(T, -PA_VALVE_BACK);
  return { center, T, N };
}

/** 'pa-valveback': 판막 면에서 정차 지점에 가까운 쪽(왼쪽)에 둔다 → 고개를 왼쪽 뒤로 약 130° 돌리면 보인다 */
export const PA_VALVE_ANCHOR: V3 = (() => {
  const { center, T, N } = paValveFrame();
  const B = PA.frames.binormals[0];
  const p = center.clone().addScaledVector(B, -2.3).addScaledVector(N, 0.7).addScaledVector(T, 0.6);
  return [p.x, p.y, p.z] as V3;
})();

/** 'pa-fork': 두 갈래 사이의 갈림 능선(구멍 앞쪽 가장자리)에서 안쪽으로 들어온 곳 */
export const PA_FORK_ANCHOR: V3 = (() => {
  const w = wallBasis(PA, PA_FORK_HOLE.t + (PA_FORK_HOLE.a * 0.75) / PA.length, PA_FORK_HOLE.angle, 1.1);
  return [w.pos.x, w.pos.y, w.pos.z] as V3;
})();

/** 'pa-wall': 관찰 창을 가리지 않도록 창의 앞쪽 가장자리 옆(벽에서 조금 안쪽) */
export const PA_WALL_ANCHOR: V3 = (() => {
  const w = wallBasis(PA, PA_WALL_WINDOW.t + (PA_WALL_WINDOW.a + 0.45) / PA.length, PA_WALL_WINDOW.angle, 0.45);
  return [w.pos.x, w.pos.y, w.pos.z] as V3;
})();

/** 홀로그램: R5 정차 지점 3 앞, 눈높이보다 조금 위 */
export const PA_HOLO_AHEAD = 3;
export const PA_HOLO: V3 = pathOffset(PA, PA_STOP_R5, PA_HOLO_AHEAD, 1.15, 0);
/** 'pa-holo' 관찰 표시는 모형을 가리지 않도록 홀로그램 바로 아래에 둔다 */
export const PA_HOLO_SPOT: V3 = pathOffset(PA, PA_STOP_R5, PA_HOLO_AHEAD, 1.15 - 1.6, 0);
