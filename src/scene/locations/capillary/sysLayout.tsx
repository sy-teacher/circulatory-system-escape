// 온몸의 모세혈관 배치(순수 계산, 화면 그리기 없음).
// 작은 동맥(반지름 2.6) → 갈라지며 가늘어짐 → 모세혈관(1.55) → 끝에서 가는 혈관이 모이며 조금 굵어짐.
// 길이 단위: 월드 단위(탐사선 2.6 × 1.7 × 1.3). 크기는 학습용으로 조정했다.

import { CatmullRomCurve3, Color, Matrix4, Quaternion, Vector3 } from 'three';
import { PALETTE } from '../../palette';
import type { MoleculeRoute } from '../../shared/Molecules';
import {
  AXIS_LIFT,
  CAP_RADIUS,
  axisFrames,
  eyeAt,
  facing,
  makeAround,
  makeCurves,
  makeTangent,
  seeded,
  smooth,
  turtlePath,
  type TubeSpec,
} from './common';

const TURTLE = turtlePath(new Vector3(0, AXIS_LIFT, 0), [
  { kind: 'line', len: 11 },
  { kind: 'arc', radius: 40, angle: -12 },
  { kind: 'line', len: 8, rise: 0.6 },
  { kind: 'arc', radius: 35, angle: 20 },
  { kind: 'line', len: 10, rise: -0.5 },
  { kind: 'arc', radius: 40, angle: -10 },
  { kind: 'line', len: 12, rise: 0.4 },
  { kind: 'arc', radius: 30, angle: 8 },
  { kind: 'line', len: 8 },
]);

export const SYS = makeCurves(TURTLE.points);
export const SYS_L = SYS.length;
export const SYS_FRAMES = axisFrames(SYS.axis);
const around = makeAround(SYS_FRAMES);
const tangent = makeTangent(SYS_FRAMES);

export const S2_T = 0.45;
export const R6_T = 0.7;
const sS2 = S2_T * SYS_L;
const sR6 = R6_T * SYS_L;
export const EYE_S2 = eyeAt(SYS.path, S2_T);
export const EYE_R6 = eyeAt(SYS.path, R6_T);

/** 혈관 안쪽 반지름: 입구의 작은 동맥 2.6 → 모세혈관 1.55 → 출구 쪽 2.1 */
export function sysRadius(t: number): number {
  const s = t * SYS_L;
  const narrow = smooth(2, 10.5, s);
  const widen = smooth(SYS_L - 8, SYS_L - 0.5, s);
  return 2.6 + (CAP_RADIUS - 2.6) * narrow + (2.1 - CAP_RADIUS) * widen;
}

/** 산소가 풍부한 적혈구 무리 / 산소가 적은 적혈구 무리의 구간(정지 지점 바로 앞에서 바뀜) */
export const RICH_RANGE: [number, number] = [0, 0.5];
export const POOR_RANGE: [number, number] = [0.5, 1];

// ─────────────────────────────────────────────
//  가지 혈관(입구에서 갈라져 나감, 출구에서 모여듦)
// ─────────────────────────────────────────────

function tube(points: Vector3[], r0: number, r1: number, seed: number): TubeSpec {
  const curve = new CatmullRomCurve3(points, false, 'centripetal');
  return { curve, radius: (t) => r0 + (r1 - r0) * t, tubular: 48, seed };
}

const L = SYS_L;

export const SYS_TUBES: TubeSpec[] = [
  { curve: SYS.axis, radius: sysRadius, tubular: 280, seed: 3 },
  // 입구: 작은 동맥에서 갈라져 나가는 가지
  tube([around(3.5, -50, 1.9), around(6, -48, 3.3), around(10, -42, 5.4), around(15, -36, 7.3), around(22, -30, 8.6)], 1.2, 0.6, 5),
  tube([around(6.5, 140, 1.7), around(9, 138, 3.1), around(13, 132, 5.1), around(18, 126, 6.9), around(25, 120, 8.0)], 1.05, 0.55, 7),
  // 출구: 가는 혈관들이 모여든다
  tube([around(L - 22, 8, 8.4), around(L - 16, 6, 7.0), around(L - 11, 4, 4.9), around(L - 7.5, 2, 3.0), around(L - 5, 0, 1.9)], 0.55, 1.0, 9),
  tube([around(L - 20, 188, 8.2), around(L - 14.5, 186, 6.6), around(L - 10, 184, 4.6), around(L - 6.5, 182, 2.9), around(L - 4, 180, 1.9)], 0.5, 0.95, 11),
];

// ─────────────────────────────────────────────
//  주변의 다른 모세혈관 그물(바깥에서 보이는 가는 관, 불투명)
// ─────────────────────────────────────────────

export const NET_RHO = 4.0;
export const NET_RADIUS = 0.3;
const NET_BASE = [45, 135, 225, 315];
const netAngle = (k: number, s: number) => NET_BASE[k] + 6 * Math.sin(0.27 * s + k * 1.3);
const NET_S0 = 16;
const NET_S1 = L - 14;

export interface Polyline {
  points: Vector3[];
  radius: number;
}

function netPolylines(): Polyline[] {
  const out: Polyline[] = [];
  // 혈관과 나란히 달리는 관 4개
  for (let k = 0; k < 4; k++) {
    const pts: Vector3[] = [];
    for (let s = NET_S0; s <= NET_S1 + 0.01; s += 2) pts.push(around(s, netAngle(k, s), NET_RHO));
    out.push({ points: pts, radius: NET_RADIUS });
  }
  // 이웃한 관을 잇는 가지(비스듬히)
  const cross: [number, number][] = [
    [20, 0],
    [29, 2],
    [33, 3],
    [50, 1],
    [63.5, 2],
    [66, 0],
  ];
  for (const [s, k] of cross) {
    const k2 = (k + 1) % 4;
    const a0 = netAngle(k, s);
    let a1 = netAngle(k2, s + 2.5);
    if (a1 < a0) a1 += 360;
    const pts: Vector3[] = [];
    for (let i = 0; i <= 6; i++) {
      const u = i / 6;
      pts.push(around(s + 2.5 * u, a0 + (a1 - a0) * u, NET_RHO));
    }
    out.push({ points: pts, radius: NET_RADIUS * 0.9 });
  }
  // 우리가 지나는 모세혈관에서 그물 쪽으로 이어지는 가지
  const links: [number, number][] = [
    [17, 0],
    [25, 2],
    [47, 1],
    [68, 3],
  ];
  for (const [s, k] of links) {
    const a = netAngle(k, s + 2.2);
    const pts = [around(s, a - 14, 1.68), around(s + 0.8, a - 9, 2.45), around(s + 1.6, a - 4, 3.3), around(s + 2.2, a, NET_RHO)];
    out.push({ points: pts, radius: NET_RADIUS * 0.85 });
  }
  return out;
}

export const SYS_NETWORK: Polyline[] = netPolylines();

// ─────────────────────────────────────────────
//  S2: 물질 교환(학습용 시각화)
// ─────────────────────────────────────────────

const IN_R = 0.72; // 혈관 안쪽(혈액)
const CELL_R = 2.0; // 세포 표면 근처

const outRoute = (ds: number, a: number): MoleculeRoute => ({ from: around(sS2 + ds, a, IN_R), to: around(sS2 + ds + 0.3, a + 3, CELL_R) });
const inRoute = (ds: number, a: number): MoleculeRoute => ({ from: around(sS2 + ds, a, CELL_R), to: around(sS2 + ds + 0.3, a - 3, IN_R) });

export const S2_ROUTES = {
  o2: [outRoute(3.0, 105), outRoute(3.9, 125), outRoute(4.8, 145), outRoute(3.4, -100), outRoute(4.6, -125), outRoute(5.4, 160)],
  nutrient: [outRoute(3.6, 115), outRoute(5.2, 135), outRoute(4.2, -112)],
  co2: [inRoute(3.2, 118), inRoute(4.5, 138), inRoute(3.8, -95), inRoute(5.2, -120)],
  waste: [inRoute(4.0, 102), inRoute(5.4, 150), inRoute(4.9, -108)],
};

export interface ArrowSpec {
  from: Vector3;
  to: Vector3;
  kind: 'o2' | 'co2' | 'nutrient' | 'waste' | 'water';
}

const outArrow = (ds: number, a: number, kind: ArrowSpec['kind']): ArrowSpec => ({
  from: around(sS2 + ds, a, 0.9),
  to: around(sS2 + ds + 0.3, a, 2.05),
  kind,
});
const inArrow = (ds: number, a: number, kind: ArrowSpec['kind']): ArrowSpec => ({
  from: around(sS2 + ds, a, 2.05),
  to: around(sS2 + ds + 0.3, a, 0.9),
  kind,
});

export const S2_ARROWS: ArrowSpec[] = [
  outArrow(3.5, 112, 'o2'),
  outArrow(3.2, -98, 'o2'),
  outArrow(4.6, 130, 'nutrient'),
  inArrow(4.0, 121, 'co2'),
  inArrow(4.4, -116, 'co2'),
  inArrow(5.2, 141, 'waste'),
];

export const S2_SIGN = (() => {
  const pos = around(sS2 + 6.5, 90, 3.3);
  return { pos, quat: facing(pos, EYE_S2), width: 2.6 };
})();

// ─────────────────────────────────────────────
//  R6: 혈관 옆 세포 하나를 크게(잘라 낸 모습)
// ─────────────────────────────────────────────

/** 큰 세포가 정지 지점보다 얼마나 앞에 있는지(앞쪽 시야 안에 들어오도록) */
const R6_AHEAD = 5.0;

export const R6_CELL = (() => {
  const center = around(sR6 + R6_AHEAD, -90, 4.05);
  return { center, radius: 2.1, quat: facing(center, EYE_R6) };
})();

const toEye6 = EYE_R6.clone().sub(R6_CELL.center).normalize();

function insideCell(rand: () => number): Vector3 {
  // 열린 쪽(눈을 향한 쪽)에 가까운 세포 안쪽 점
  const v = new Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(1.1);
  return R6_CELL.center.clone().addScaledVector(toEye6, 0.55).add(v);
}

export const R6_ROUTES = (() => {
  const r = seeded(61);
  const vin = (ds: number, a: number) => around(sR6 + R6_AHEAD - 2.8 + ds, a, 0.6);
  return {
    o2: [2.1, 2.5, 2.9, 3.3, 3.7].map((ds, i) => ({ from: vin(ds, -90 + (i - 2) * 7), to: insideCell(r) })),
    nutrient: [2.3, 3.1, 3.5].map((ds, i) => ({ from: vin(ds, -84 - i * 6), to: insideCell(r) })),
    co2: [2.2, 2.7, 3.2, 3.6].map((ds, i) => ({ from: insideCell(r), to: vin(ds + 0.4, -78 - i * 8) })),
    water: [2.4, 3.0, 3.4].map((ds, i) => ({ from: insideCell(r), to: vin(ds + 0.4, -100 + i * 6) })),
  };
})();

const cellArrow = (ds: number, a: number, kind: ArrowSpec['kind'], inward: boolean): ArrowSpec => {
  const s = sR6 + R6_AHEAD - 2.8 + ds;
  const v = around(s, a, 0.9);
  const c = around(s + (inward ? 0.15 : -0.15), a, 2.2);
  return inward ? { from: v, to: c, kind } : { from: c, to: v, kind };
};

export const R6_ARROWS: ArrowSpec[] = [
  cellArrow(2.2, -84, 'o2', true),
  cellArrow(3.0, -96, 'nutrient', true),
  cellArrow(2.6, -74, 'co2', false),
  cellArrow(3.4, -104, 'water', false),
];

export const R6_SIGN = (() => {
  const pos = around(sR6 + R6_AHEAD + 1.0, 0, 2.65);
  return { pos, quat: facing(pos, EYE_R6), width: 2.4 };
})();

// ─────────────────────────────────────────────
//  관찰 지점
// ─────────────────────────────────────────────

const tuple = (v: Vector3): [number, number, number] => [v.x, v.y, v.z];

export const SYS_ANCHORS: Record<string, [number, number, number]> = {
  // 아주 얇은 벽(왼쪽 위 벽면)
  'sc-thin': tuple(around(sS2 + 2.6, -55, CAP_RADIUS - 0.05)),
  // 앞쪽의 좁은 한 줄 통로
  'sc-narrow': tuple(around(sS2 + 4.6, 180, 0.15)),
  // 교환되는 입자와 화살표(오른쪽 아래)
  'sc-exchange': tuple(around(sS2 + 3.9, 122, 1.75)),
  // 바깥의 세포들(왼쪽 아래)
  'sc-cells': tuple(around(sS2 + 3.9, -112, 1.8)),
  // R6: 크게 보여 주는 세포
  'sc-respiration': tuple(R6_CELL.center.clone().addScaledVector(toEye6, R6_CELL.radius + 0.25)),
};

// ─────────────────────────────────────────────
//  조직 세포(근육 세포처럼 길쭉한 세포) 배치
// ─────────────────────────────────────────────

interface Obstacle {
  a: Vector3;
  b: Vector3;
  r: number;
  /** 빠른 거리 판정용 경계 구 */
  c: Vector3;
  br: number;
}

function obstacle(a: Vector3, b: Vector3, r: number): Obstacle {
  const c = a.clone().add(b).multiplyScalar(0.5);
  return { a, b, r, c, br: a.distanceTo(b) / 2 + r };
}

function polylineObstacles(pts: Vector3[], r: number): Obstacle[] {
  const out: Obstacle[] = [];
  for (let i = 0; i < pts.length - 1; i++) out.push(obstacle(pts[i], pts[i + 1], r));
  return out;
}

function curveObstacles(spec: TubeSpec, n: number): Obstacle[] {
  const out: Obstacle[] = [];
  for (let i = 0; i < n; i++) {
    const t0 = i / n;
    const t1 = (i + 1) / n;
    out.push(obstacle(spec.curve.getPointAt(t0), spec.curve.getPointAt(t1), Math.max(spec.radius(t0), spec.radius(t1)) * 1.06 + 0.08));
  }
  return out;
}

const _ab = new Vector3();
const _ap = new Vector3();
const _q = new Vector3();
function segDist(p: Vector3, o: Obstacle): number {
  _ab.copy(o.b).sub(o.a);
  _ap.copy(p).sub(o.a);
  const k = Math.min(1, Math.max(0, _ap.dot(_ab) / Math.max(1e-6, _ab.lengthSq())));
  _q.copy(o.a).addScaledVector(_ab, k);
  return _q.distanceTo(p);
}

/** 조직 세포를 둘 수 없는 곳(가지 혈관, 그물 관, 표지판, 큰 세포, 시야) */
export function sysObstacles(): Obstacle[] {
  const obs: Obstacle[] = [];
  for (const tb of SYS_TUBES.slice(1)) obs.push(...curveObstacles(tb, 24));
  for (const pl of SYS_NETWORK) obs.push(...polylineObstacles(pl.points, pl.radius + 0.08));
  // S2 표지판과 그 시야
  obs.push(obstacle(S2_SIGN.pos, S2_SIGN.pos, 1.55));
  obs.push(obstacle(EYE_S2, S2_SIGN.pos, 0.5));
  // R6 큰 세포와 그 시야, 표지판
  obs.push(obstacle(R6_CELL.center, R6_CELL.center, R6_CELL.radius + 0.25));
  obs.push(obstacle(EYE_R6, R6_CELL.center, 1.25));
  obs.push(obstacle(R6_SIGN.pos, R6_SIGN.pos, 1.45));
  obs.push(obstacle(EYE_R6, R6_SIGN.pos, 0.45));
  return obs;
}

export interface TissueLayout {
  cells: Matrix4[];
  colors: Color[];
  nuclei: Matrix4[];
}

/** 혈관 바로 바깥에 빽빽한 1층(+ 사양이 낮지 않으면 바깥 2층) */
export function buildTissue(lowSpec: boolean): TissueLayout {
  const rand = seeded(lowSpec ? 7 : 8);
  const obs = sysObstacles();
  const cells: Matrix4[] = [];
  const colors: Color[] = [];
  const nuclei: Matrix4[] = [];
  const base = new Color(PALETTE.tissue);
  const warm = new Color('#ffc98a');
  const deep = new Color('#ee9a52');
  const T = new Vector3();
  const tilt = new Vector3();
  const q = new Quaternion();
  const Y = new Vector3(0, 1, 0);
  const pos = new Vector3();
  const probe = new Vector3();
  const radial = new Vector3();
  const side = new Vector3();
  const axisP = new Vector3();

  const layers = lowSpec
    ? [{ rho: 2.6, cr: 0.72, n: 9, step: 4.0 }]
    : [
        { rho: 2.6, cr: 0.72, n: 10, step: 3.8 },
        { rho: 5.35, cr: 0.85, n: 17, step: 4.3 },
      ];
  const s0 = 11.5;
  const s1 = L - 9;

  for (const layer of layers) {
    let ring = 0;
    for (let s = s0; s <= s1; s += layer.step, ring++) {
      for (let k = 0; k < layer.n; k++) {
        const ang = (k / layer.n) * 360 + (ring % 2) * (180 / layer.n) + (rand() - 0.5) * 8;
        const ss = s + (rand() - 0.5) * 0.6;
        const cr = layer.cr * (0.9 + rand() * 0.16);
        const ly = 0.88 + rand() * 0.18;
        around(ss, ang, layer.rho + (rand() - 0.5) * 0.12, pos);
        tangent(ss, T);
        tilt.set(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(0.06);
        T.add(tilt).normalize();
        // 다른 물체와 겹치면 두지 않는다
        const half = cr * (1.5 * ly + 1);
        let blocked = false;
        for (const o of obs) {
          if (o.c.distanceTo(pos) > o.br + half + cr + 0.1) continue;
          for (let i = -2; i <= 2 && !blocked; i++) {
            probe.copy(pos).addScaledVector(T, (i / 2) * cr * 1.5 * ly);
            if (segDist(probe, o) < o.r + cr + 0.05) blocked = true;
          }
          if (blocked) break;
        }
        if (blocked) continue;
        q.setFromUnitVectors(Y, T);
        const m = new Matrix4().compose(pos.clone(), q.clone(), new Vector3(cr, cr * ly, cr));
        cells.push(m);
        const c = base.clone().lerp(rand() < 0.5 ? warm : deep, rand() * 0.45);
        colors.push(c);
        // 핵: 혈관 쪽(안쪽)을 향한 세포 가장자리에 납작하게
        around(ss, 0, 0, axisP);
        radial.copy(pos).sub(axisP);
        radial.addScaledVector(T, -radial.dot(T)).normalize();
        side.crossVectors(T, radial).normalize();
        const nucCount = ly > 0.98 ? 2 : 1;
        for (let j = 0; j < nucCount; j++) {
          const along = nucCount === 1 ? (rand() - 0.5) * 0.6 : (j === 0 ? -0.55 : 0.55) * cr;
          const sideK = (rand() - 0.5) * 0.9;
          const dir = radial.clone().multiplyScalar(-Math.cos(sideK)).addScaledVector(side, Math.sin(sideK)).normalize();
          const np = pos.clone().addScaledVector(dir, cr * 0.84).addScaledVector(T, along);
          const sideDir = new Vector3().crossVectors(T, dir).normalize();
          const nm = new Matrix4().makeBasis(
            sideDir.multiplyScalar(cr * 0.36),
            T.clone().multiplyScalar(cr * 0.62),
            dir.clone().multiplyScalar(cr * 0.2),
          );
          nm.setPosition(np);
          nuclei.push(nm);
        }
      }
    }
  }
  // 입구 쪽(작은 동맥) 둘레에도 듬성듬성 세포
  for (let i = 0; i < (lowSpec ? 8 : 16); i++) {
    const ss = 2 + rand() * 9;
    const ang = rand() * 360;
    const cr = 0.8 + rand() * 0.2;
    around(ss, ang, sysRadius(ss / L) * 1.06 + 3.2 + rand() * 1.5, pos);
    let blocked = false;
    for (const o of obs) {
      if (segDist(pos, o) < o.r + cr * 2.5) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;
    tangent(ss, T);
    q.setFromUnitVectors(Y, T);
    cells.push(new Matrix4().compose(pos.clone(), q.clone(), new Vector3(cr, cr, cr)));
    colors.push(base.clone().lerp(warm, rand() * 0.4));
  }
  return { cells, colors, nuclei };
}
