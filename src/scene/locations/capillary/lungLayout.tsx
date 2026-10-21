// 허파의 모세혈관 배치(순수 계산, 화면 그리기 없음).
// 가는 동맥 → 모세혈관이 허파꽈리 A의 바깥 표면을 감싸며 돎(S7) → 반대로 주머니 B를 감싸며 돎(R2) → 가는 혈관으로 모임.
// 탐사선·적혈구는 주머니 안으로 들어가지 않는다(혈관 벽이 주머니 표면과 겹치지 않도록 계산).

import { CatmullRomCurve3, Vector3 } from 'three';
import type { MoleculeRoute } from '../../shared/Molecules';
import {
  AXIS_LIFT,
  CAP_OUTER,
  CAP_RADIUS,
  axisFrames,
  eyeAt,
  facing,
  makeAround,
  makeCurves,
  makeLocal,
  seeded,
  smooth,
  turtlePath,
  type TubeSpec,
} from './common';

/** 숨쉬기: 크기 변화 ±6%(움직임 줄이기: ±2%), 주기 4.5초 */
export const BREATH_AMP = 0.06;
export const BREATH_AMP_REDUCED = 0.02;
export const BREATH_PERIOD = 4.5;
/** 주머니를 감싸는 그물 관이 주머니 표면보다 바깥으로 나오는 비율 */
export const NET_SHELL = 1.045;
export const NET_TUBE = 0.045;

export const RA = 5.5;
export const RB = 4.6;
const GAP = 0.05;
const RAX_A = RA * (1 + BREATH_AMP) + CAP_OUTER + GAP;
const RAX_B = RB * (1 + BREATH_AMP) + CAP_OUTER + GAP;
const ARC_A = 140;
const ARC_B = 140;

const TURTLE = turtlePath(new Vector3(0, AXIS_LIFT, 0), [
  { kind: 'line', len: 11 },
  { kind: 'arc', radius: RAX_A, angle: ARC_A },
  // 두 주머니 사이의 짧은 곧은 구간
  { kind: 'line', len: 4 },
  { kind: 'arc', radius: RAX_B, angle: -ARC_B },
  { kind: 'line', len: 8 },
]);

export const LUNG = makeCurves(TURTLE.points);
export const LUNG_L = LUNG.length;
export const LUNG_FRAMES = axisFrames(LUNG.axis);
const around = makeAround(LUNG_FRAMES);
const local = makeLocal(LUNG_FRAMES);
const L = LUNG_L;

export const S7_T = 0.42;
export const R2_T = 0.72;
const sS7 = S7_T * L;
const sR2 = R2_T * L;
export const EYE_S7 = eyeAt(LUNG.path, S7_T);
export const EYE_R2 = eyeAt(LUNG.path, R2_T);

/** 혈관 안쪽 반지름: 가는 동맥 2.6 → 모세혈관 1.55 → 출구 쪽 2.2 */
export function lungRadius(t: number): number {
  const s = t * L;
  const narrow = smooth(2, 9.5, s);
  const widen = smooth(L - 8, L - 0.5, s);
  return 2.6 + (CAP_RADIUS - 2.6) * narrow + (2.2 - CAP_RADIUS) * widen;
}

/** 산소가 적은 적혈구 → (정지 지점 바로 앞에서) 산소가 풍부한 적혈구 */
export const POOR_RANGE: [number, number] = [0, 0.48];
export const RICH_RANGE: [number, number] = [0.48, 1];

// ─────────────────────────────────────────────
//  허파꽈리
// ─────────────────────────────────────────────

export interface Sac {
  id: string;
  c: Vector3;
  r: number;
  /** 숨쉬기 위상(라디안, 거의 같게) */
  phase: number;
  /** 그물 방향 */
  yaw: number;
}

const CA = (TURTLE.centers[1] as Vector3).clone();
const CB = (TURTLE.centers[3] as Vector3).clone();
const psiA0 = 0;
const psiB0 = (ARC_A * Math.PI) / 180;

/** 주머니 A 기준 위치: 경로 각 φ(도), 위도(도), 중심에서의 거리 */
export function onA(phiDeg: number, latDeg: number, r: number): Vector3 {
  const p = (phiDeg * Math.PI) / 180;
  const l = (latDeg * Math.PI) / 180;
  return CA.clone().add(new Vector3(Math.cos(p) * Math.cos(l) * r, Math.sin(l) * r, -Math.sin(p) * Math.cos(l) * r));
}
/** 주머니 B 기준 위치: 경로 각 ψ(도, 140 → 0으로 줄어듦), 위도, 거리 */
export function onB(psiDeg: number, latDeg: number, r: number): Vector3 {
  const p = (psiDeg * Math.PI) / 180;
  const l = (latDeg * Math.PI) / 180;
  return CB.clone().add(new Vector3(-Math.cos(p) * Math.cos(l) * r, Math.sin(l) * r, Math.sin(p) * Math.cos(l) * r));
}

/** 정지 지점의 주머니 기준 각도 */
export const PHI_S7 = ((sS7 - TURTLE.segStart[1]) / RAX_A) * (180 / Math.PI) + psiA0;
export const PSI_R2 = (psiB0 - (sR2 - TURTLE.segStart[3]) / RAX_B) * (180 / Math.PI);

// 혈관 축 표본(겹침 검사용)
const AXIS_SAMPLES: { p: Vector3; r: number }[] = [];
for (let i = 0; i <= 400; i++) {
  const t = i / 400;
  AXIS_SAMPLES.push({ p: LUNG.axis.getPointAt(t), r: lungRadius(t) * 1.06 + 0.02 });
}

/** 주머니(그물 포함)가 혈관 벽과 닿지 않도록 필요한 최소 거리 */
export function sacClearance(c: Vector3, r: number): number {
  let m = Infinity;
  for (const s of AXIS_SAMPLES) m = Math.min(m, c.distanceTo(s.p) - s.r - r * (1 + BREATH_AMP) * (NET_SHELL + NET_TUBE));
  return m;
}

function placeSac(id: string, want: Vector3, r: number, placed: Sac[], phase: number, yaw: number): Sac {
  const c = want.clone();
  const dir = new Vector3();
  for (let iter = 0; iter < 200; iter++) {
    let moved = false;
    // 혈관에서 밀어내기
    let best = Infinity;
    let bp: Vector3 | null = null;
    let br = 0;
    for (const s of AXIS_SAMPLES) {
      const d = c.distanceTo(s.p) - s.r;
      if (d < best) {
        best = d;
        bp = s.p;
        br = s.r;
      }
    }
    const need = r * (1 + BREATH_AMP) * (NET_SHELL + NET_TUBE) + 0.08;
    if (bp && c.distanceTo(bp) - br < need) {
      dir.copy(c).sub(bp).normalize();
      c.addScaledVector(dir, 0.08);
      moved = true;
    }
    // 다른 주머니와 너무 겹치지 않게
    for (const o of placed) {
      const d = c.distanceTo(o.c);
      const minD = (r + o.r) * 1.04;
      if (d < minD) {
        dir.copy(c).sub(o.c).normalize();
        c.addScaledVector(dir, 0.08);
        moved = true;
      }
    }
    if (!moved) break;
  }
  return { id, c, r, phase, yaw };
}

export const SACS: Sac[] = (() => {
  const list: Sac[] = [
    { id: 'A', c: CA, r: RA, phase: 0, yaw: 0 },
    { id: 'B', c: CB, r: RB, phase: 0.15, yaw: 0.4 },
  ];
  const add = (id: string, want: Vector3, r: number, phase: number, yaw: number) => list.push(placeSac(id, want, r, list, phase, yaw));
  // S7 앞 오른쪽 아래(숨쉬는 모습을 관찰하는 주머니)
  add('C', local(sS7, 4.5, 4.6, -2.2), 3.0, 0.3, 1.1);
  // A 위에 얹힌 주머니
  add('D', CA.clone().add(new Vector3(0.8, 9.4, -0.6)), 3.5, 0.1, 2.0);
  // A의 반대쪽
  add('F', onA(240, 4, 10.6), 4.2, 0.25, 0.7);
  // B의 반대쪽
  add('G', onB(-60, 16, 9.6), 3.6, 0.2, 1.6);
  // 출구 양옆
  add('H', local(L - 6, 0, 6.6, 1.4), 3.0, 0.35, 2.4);
  add('I', local(L - 7.5, 0, -7.2, -1.0), 3.3, 0.05, 0.9);
  // 입구 오른쪽
  add('J', local(8, 0, 6.0, 1.2), 3.0, 0.4, 3.0);
  // 두 주머니 사이 곧은 구간의 위쪽
  add('K', local(TURTLE.segStart[2] + 2, 0, -1, 9), 3.3, 0.2, 0.3);
  return list;
})();

export const SAC_A = SACS[0];
export const SAC_B = SACS[1];
const SAC_C = SACS[2];

/**
 * 주머니를 감싸는 그물 관(반지름 1인 구 기준 선들). 우리가 지나는 혈관이 닿는 적도 띠(±22°)는 비워 둔다.
 */
export function sacNetLines(lowSpec: boolean): Vector3[][] {
  const lines: Vector3[][] = [];
  const P = (lonDeg: number, latDeg: number) => {
    const lo = (lonDeg * Math.PI) / 180;
    const la = (latDeg * Math.PI) / 180;
    return new Vector3(Math.cos(la) * Math.cos(lo), Math.sin(la), Math.cos(la) * Math.sin(lo)).multiplyScalar(NET_SHELL);
  };
  const lons = lowSpec ? 6 : 8;
  for (let i = 0; i < lons; i++) {
    const lon = (i / lons) * 360 + (i % 2) * 8;
    for (const sign of [1, -1]) {
      const pts: Vector3[] = [];
      for (let k = 0; k <= 8; k++) pts.push(P(lon + Math.sin(k * 0.9 + i) * 6, sign * (22 + (k / 8) * 62)));
      lines.push(pts);
    }
  }
  const lats = lowSpec ? [40, -40] : [38, -38, 62, -62];
  for (const lat of lats) {
    const pts: Vector3[] = [];
    for (let k = 0; k <= 36; k++) pts.push(P((k / 36) * 360, lat + Math.sin((k / 36) * Math.PI * 8) * 3));
    lines.push(pts);
  }
  return lines;
}

// ─────────────────────────────────────────────
//  가지 혈관
// ─────────────────────────────────────────────

function tube(points: Vector3[], r0: number, r1: number, seed: number): TubeSpec {
  const curve = new CatmullRomCurve3(points, false, 'centripetal');
  return { curve, radius: (t) => r0 + (r1 - r0) * t, tubular: 48, seed };
}

export const LUNG_TUBES: TubeSpec[] = [
  { curve: LUNG.axis, radius: lungRadius, tubular: 260, seed: 4 },
  // 입구: 가는 동맥에서 갈라져 나감(위·아래)
  tube([around(3.5, 12, 1.9), around(5.5, 14, 3.4), around(8.5, 17, 5.6), around(12, 20, 7.4), around(16, 23, 8.8)], 1.15, 0.55, 6),
  tube([around(5.5, 172, 1.8), around(7.5, 170, 3.2), around(10.5, 166, 5.2), around(14, 162, 6.8), around(18, 158, 7.8)], 1.0, 0.5, 8),
  // 출구: 가는 혈관이 모여듦
  tube([local(L - 17, 0, 3.4, 8.0), local(L - 12.5, 0, 2.3, 6.3), local(L - 9, 0, 0.8, 4.6), local(L - 6.5, 0, 0.4, 2.9), local(L - 4.5, 0, 0, 1.9)], 0.5, 0.95, 10),
  tube([local(L - 18, 0, -0.5, -8.2), local(L - 13, 0, -0.3, -6.6), local(L - 9, 0, -0.1, -4.6), local(L - 6, 0, 0, -2.9), local(L - 3.8, 0, 0, -1.9)], 0.5, 0.9, 12),
];

// ─────────────────────────────────────────────
//  S7: 기체 교환(학습용 시각화)
// ─────────────────────────────────────────────

const AX_IN = RAX_A - 0.22; // 혈관 축 가까이(적혈구 쪽)
const SAC_IN = RA * 0.62; // 주머니 안쪽(공기 쪽)

export const S7_ROUTES: { o2: MoleculeRoute[]; co2: MoleculeRoute[] } = {
  o2: [
    [16, -8],
    [21, 4],
    [26, 10],
    [31, -3],
    [36, 7],
    [24, -12],
  ].map(([d, lat]) => ({ from: onA(PHI_S7 + d, lat + 4, SAC_IN), to: onA(PHI_S7 + d + 1.5, lat * 0.2, AX_IN) })),
  co2: [
    [18, 2],
    [24, -5],
    [29, 8],
    [34, -9],
  ].map(([d, lat]) => ({ from: onA(PHI_S7 + d, lat * 0.2, AX_IN), to: onA(PHI_S7 + d + 2, lat - 3, SAC_IN) })),
};

export interface LungArrow {
  from: Vector3;
  to: Vector3;
  kind: 'o2' | 'co2';
}

export const S7_ARROWS: LungArrow[] = [
  { from: onA(PHI_S7 + 19, 6, RA * 0.88), to: onA(PHI_S7 + 19, 3, RAX_A - 0.55), kind: 'o2' },
  { from: onA(PHI_S7 + 33, 9, RA * 0.88), to: onA(PHI_S7 + 33, 5, RAX_A - 0.55), kind: 'o2' },
  { from: onA(PHI_S7 + 27, -4, RAX_A - 0.55), to: onA(PHI_S7 + 27, -6, RA * 0.88), kind: 'co2' },
];

/** 주머니 안에 떠 있는 산소(공기 공간) */
export function airRoutes(lowSpec: boolean): MoleculeRoute[] {
  const r = seeded(31);
  const out: MoleculeRoute[] = [];
  const per: Record<string, number> = lowSpec ? { A: 5, B: 3, C: 2, D: 2 } : { A: 8, B: 5, C: 3, D: 3, F: 2, G: 2, K: 2 };
  const rnd = (sac: Sac) => {
    const v = new Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize().multiplyScalar(sac.r * (0.25 + r() * 0.45));
    return sac.c.clone().add(v);
  };
  for (const sac of SACS) {
    const n = per[sac.id] ?? 0;
    for (let i = 0; i < n; i++) out.push({ from: rnd(sac), to: rnd(sac) });
  }
  return out;
}

export const S7_SIGN = (() => {
  const pos = local(sS7, 4.6, 1.5, 1.4);
  return { pos, quat: facing(pos, EYE_S7), width: 1.9 };
})();

/** '공기' 글자 위치(주머니 안) */
export const AIR_LABELS: Vector3[] = [
  onA(PHI_S7 + 30, 10, RA * 0.6),
  CB.clone().addScaledVector(EYE_S7.clone().sub(CB).normalize(), RB * 0.4).add(new Vector3(0, 0.9, 0)),
  SAC_C.c.clone().addScaledVector(local(sS7, 2.5, 0, 0.35).sub(SAC_C.c).normalize(), SAC_C.r * 0.5).add(new Vector3(0, SAC_C.r * 0.42, 0)),
];

// ─────────────────────────────────────────────
//  R2: 확대 관찰 창 + 분리 캡슐
// ─────────────────────────────────────────────

export const R2_VIEWER = (() => {
  const magnifier = local(sR2, 4.4, -2.3, 1.6);
  const capsule = local(sR2, 6.2, -3.4, 0.5);
  return {
    magnifier,
    magnifierQuat: facing(magnifier, EYE_R2),
    magnifierRadius: 1.1,
    capsule,
    capsuleQuat: facing(capsule, new Vector3(EYE_R2.x, capsule.y, EYE_R2.z)),
    /** 확대 창이 들여다보는 곳(탐사선 앞 혈관 속) */
    focus: LUNG.axis.getPointAt(Math.min(1, (sR2 + 3.2) / L)),
  };
})();

// ─────────────────────────────────────────────
//  관찰 지점
// ─────────────────────────────────────────────

const tuple = (v: Vector3): [number, number, number] => [v.x, v.y, v.z];

export const LUNG_ANCHORS: Record<string, [number, number, number]> = {
  // 가장 가까운 주머니 표면(왼쪽 위)
  'lc-alveoli': tuple(onA(PHI_S7 + 34, 18, RA * (1 + BREATH_AMP) + 0.12)),
  // 숨 쉬듯 부풀었다 줄어드는 주머니 C(앞 오른쪽 아래) — 앞쪽을 향한 표면
  'lc-breath': tuple(
    SAC_C.c.clone().addScaledVector(local(sS7, 2.5, 0, 0.35).sub(SAC_C.c).normalize(), SAC_C.r * (1 + BREATH_AMP) + 0.3),
  ),
  // 기체 입자와 화살표
  'lc-gas': tuple(onA(PHI_S7 + 30, 2, RAX_A - 0.95)),
  // 두 얇은 벽이 맞닿은 곳
  'lc-wall': tuple(onA(PHI_S7 + 23, -7, RAX_A - CAP_RADIUS)),
  // R2: 확대 관찰 창
  'lc-plasma': tuple(R2_VIEWER.magnifier.clone().addScaledVector(EYE_R2.clone().sub(R2_VIEWER.magnifier).normalize(), 1.3)),
};
