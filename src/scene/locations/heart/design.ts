// 네 심장 방의 설계(경로, 벽 모양, 판막, 근육, 관찰 지점 위치).
// 정답 방 이름은 화면 글자로 쓰지 않는다. 여기의 이름(ra, rv …)은 코드 안에서만 쓴다.
//
// 공통 약속: 경로 길이 L ≈ 20, 입구 t ≈ 0.12, 정지 t = 0.5, 출구 t ≈ 0.88, 관 반지름 3.2
// 탐사선 눈높이(경로 위 0.95)와 조향 범위(±1.2)를 고려해 벽은 수축했을 때도 경로에서 충분히 떨어져 있다.

import { CatmullRomCurve3, Color, Vector3 } from 'three';
import { CHAMBERS } from '../../../data/heart';
import { PALETTE } from '../../palette';
import {
  angDiff,
  bell,
  bulb,
  clamp01,
  createRoomModel,
  ellipseR,
  smoothstep,
  wallNoise,
  type HoleSpec,
  type ResolvedHole,
  type RoomModel,
} from './roomModel';
import type { ValveSpec } from './valveMath';

export type ChamberId = 'ra' | 'rv' | 'la' | 'lv';

const P = (x: number, y: number, z: number) => new Vector3(x, y, z);
const TAU = Math.PI * 2;

/** 탐사선이 따라가는 경로(LocationDef.path와 같은 객체) */
export const CHAMBER_CURVES: Record<ChamberId, CatmullRomCurve3> = {
  // 우심방: 뒤에서 수평으로 들어와, 앞쪽 아래의 판막으로 내려간다
  ra: new CatmullRomCurve3([P(0, 0, 10.2), P(0, 0, 7.2), P(0, 0.2, 3.2), P(0, 0, 0), P(0.4, -0.8, -3.5), P(0.8, -2.6, -6.6), P(1.0, -4.0, -8.6)]),
  // 우심실: 사이벽(왼쪽)을 감싸듯 휘어 돌아 위쪽 출구로 올라간다
  rv: new CatmullRomCurve3([P(3.0, 1.3, 9.2), P(2.2, 0.5, 6.4), P(0.8, 0, 3.0), P(0, 0, 0), P(-1.1, 0.4, -3.3), P(-2.3, 1.6, -6.3), P(-3.0, 2.9, -8.4)]),
  // 좌심방: 뒤쪽 벽의 입구로 들어와 앞쪽 아래 판막으로 내려간다
  la: new CatmullRomCurve3([P(0, 0.3, 10.2), P(0, 0.2, 7.2), P(0, 0, 3.2), P(0, 0, 0), P(-0.3, -0.8, -3.5), P(-0.6, -2.5, -6.6), P(-0.8, -3.9, -8.6)]),
  // 좌심실: 뒤쪽 판막으로 들어와 앞쪽 위의 출구로 올라간다(아래쪽으로 길쭉한 원뿔 모양 방)
  lv: new CatmullRomCurve3([P(0, -0.6, 10.4), P(0, -0.4, 7.4), P(0, 0, 3.4), P(0, 0, 0), P(0, 0.3, -3.4), P(0.25, 1.4, -6.6), P(0.5, 2.8, -9.2)]),
};

export const T_IN = 0.12;
export const T_OUT = 0.88;
const R_TUBE = 3.2;

/** 경로 t에서의 조향 여유: 입구·출구 근처는 좁게, 방 안에서는 넓게 */
export function chamberLane(t: number): number {
  if (t < 0.18 || t > 0.82) return 0.2;
  if (t < 0.28) return 0.2 + (t - 0.18) * 10;
  if (t > 0.72) return 0.2 + (0.82 - t) * 10;
  return 1.2;
}

// ─────────────────────────────────────────────────────────────
//  설계 결과
// ─────────────────────────────────────────────────────────────

export interface Lip {
  center: Vector3;
  axis: Vector3;
  radius: number;
  minor: number;
  color: string;
}

export interface ExtraInlet {
  hole: ResolvedHole;
  /** 바깥에서 방 쪽으로 흐르는 순서의 점(혈구 흐름용) */
  flow: Vector3[];
  radius: number;
}

export interface Papillary {
  base: Vector3;
  tip: Vector3;
  rBottom: number;
  rTop: number;
}

export interface ChordLink {
  /** papillary 배열 번호 */
  tip: number;
  /** 판막 가장자리 각도 */
  phi: number;
}

export interface Bar {
  a: Vector3;
  b: Vector3;
  r: number;
}

export interface Cap {
  center: Vector3;
  facing: Vector3;
  radius: number;
  inner: string;
  outer: string;
}

export interface ChamberScene {
  id: ChamberId;
  model: RoomModel;
  o2: 'rich' | 'poor';
  role: 'atrium' | 'ventricle';
  lips: Lip[];
  inletValve: ValveSpec | null;
  outletValve: ValveSpec;
  /** pathT가 이 값보다 작으면 입구 판막을 연다(탐사선이 닫힌 판막을 지나지 않게) */
  inletForceT: number;
  /** pathT가 이 값보다 크면 출구 판막을 연다 */
  outletForceT: number;
  extraInlets: ExtraInlet[];
  extraTube: [string, string];
  caps: Cap[];
  papillary: Papillary[];
  chordae: ChordLink[];
  bars: Bar[];
  barColor: string;
  muscleColor: string;
  /** 벽 두께 비교 장치 위치 */
  device: Vector3;
  /** 관찰 지점 위치(공간 좌표) */
  anchors: Record<string, Vector3>;
  /** 벽과 함께 수축하는 관찰 지점 */
  movingAnchors: string[];
  /** 탐사 표식(좌심실만) */
  flag: { base: Vector3; dir: Vector3; viewer: Vector3 } | null;
  /** 출구 너머 두 갈래로 나뉘는 혈관(우심실) */
  split: { center: Vector3; T: Vector3; N: Vector3; B: Vector3; trunkR: number; branchR: number; offset: number } | null;
  /** 판막 너머로 보이는 두꺼운 벽 단면 고리(좌심방) */
  thickRing: { center: Vector3; axis: Vector3; inner: number; outer: number } | null;
  /** 수축하지 않는 근육 기둥(좌심방에서 판막 너머로 보이는 다음 방의 벽) */
  fixedBars: Bar[];
  fixedBarColor: string;
  wallRes: { rings: number; radial: number };
  cells: { count: number; speed: number };
  stubCells: { inlet: number; outlet: number; extra: number };
  light: string;
}

// ─────────────────────────────────────────────────────────────
//  벽 색
// ─────────────────────────────────────────────────────────────

interface ColorCfg {
  sIn: number;
  sOut: number;
  /** 방 안쪽 벽 */
  a: string;
  b: string;
  light: string;
  /** 들어오는 관, 나가는 관 */
  inA: string;
  inB: string;
  outA: string;
  outB: string;
  /** 입구·출구 둘레의 벽 단면 띠 폭(0이면 없음) */
  band: number;
  /** 근육 결(0~1, 밝게 보이는 부분) */
  ridge?: (s: number, th: number) => number;
  /** 추가 색 보정 */
  tint?: (s: number, th: number, r: number, out: Color) => void;
  /** 나가는 관 색을 정하는 함수(있으면 outA/outB 대신) */
  outColor?: (s: number, th: number, r: number, out: Color) => void;
  seed: number;
}

function makeColor(cfg: ColorCfg) {
  const A = new Color(cfg.a);
  const B = new Color(cfg.b);
  const Lt = new Color(cfg.light);
  const inA = new Color(cfg.inA);
  const inB = new Color(cfg.inB);
  const outA = new Color(cfg.outA);
  const outB = new Color(cfg.outB);
  const cutLight = new Color('#ffb7be');
  const cutDark = new Color('#d0566a');
  const tmp = new Color();
  return (s: number, th: number, r: number, out: Color) => {
    const n = wallNoise(s, th, 2.2, 0.45, cfg.seed);
    if (s < cfg.sIn - 0.01) {
      out.copy(inA).lerp(inB, clamp01(n * 0.6 + smoothstep(cfg.sIn - 1, cfg.sIn - 6, s) * 0.5));
      return;
    }
    if (s > cfg.sOut + 0.01) {
      if (cfg.outColor) cfg.outColor(s, th, r, out);
      else out.copy(outA).lerp(outB, clamp01(n * 0.6 + smoothstep(cfg.sOut + 1, cfg.sOut + 7, s) * 0.5));
      return;
    }
    out.copy(A).lerp(B, clamp01(n * 0.9 - 0.05));
    if (cfg.ridge) out.lerp(Lt, cfg.ridge(s, th) * 0.5);
    if (cfg.tint) cfg.tint(s, th, r, out);
    if (cfg.band > 0 && (s - cfg.sIn < 2.6 || cfg.sOut - s < 2.6)) {
      const e = r - R_TUBE;
      if (e < cfg.band) {
        const f = 1 - smoothstep(cfg.band * 0.7, cfg.band, e);
        const stripe = 0.5 + 0.5 * Math.cos((e / 0.8) * TAU);
        tmp.copy(cutLight).lerp(cutDark, stripe * 0.6);
        out.lerp(tmp, f * 0.9);
      }
    }
  };
}

// ─────────────────────────────────────────────────────────────
//  방별 벽 모양
// ─────────────────────────────────────────────────────────────

interface ShapeInfo {
  model: RoomModel;
}

function lenOf(id: ChamberId) {
  const L = CHAMBER_CURVES[id].getLength();
  return { L, sIn: L * T_IN, sOut: L * T_OUT, sStop: L * 0.5 };
}

/** 근육 결(길이 방향으로 길쭉한 능선) 0~1 */
function trabRidge(s: number, th: number, seed: number, fTh: number, fS: number): number {
  const n = wallNoise(s, th, fTh, fS, seed);
  const r = 1 - Math.abs(2 * n - 1);
  return r * r;
}

function buildRa(): ShapeInfo {
  const { sIn, sOut, sStop } = lenOf('ra');
  const sAur = sStop + 1.2;
  const radius = (s: number, th: number) => {
    if (s <= sIn || s >= sOut) return R_TUBE;
    const b = bulb(s, sIn, sOut, 0.5, 0.55);
    let R = ellipseR(th, { up: 7.6, down: 7.0, left: 8.0, right: 8.2 });
    // 귀처럼 튀어나온 주머니(심방의 귀)
    R += 3.4 * bell(angDiff(th, 1.0), 0.42) * bell(s - sAur, 2.1);
    // 얇고 부드러운 벽의 완만한 굴곡
    R += 0.35 * (wallNoise(s, th, 1.6, 0.35, 11) - 0.5);
    return R_TUBE + b * (R - R_TUBE);
  };
  const color = makeColor({
    sIn,
    sOut,
    a: '#ec7d8b',
    b: '#c9506a',
    light: PALETTE.muscleLight,
    inA: PALETTE.veinWall,
    inB: PALETTE.veinWallDeep,
    outA: PALETTE.muscle,
    outB: PALETTE.muscleDeep,
    band: 0,
    ridge: (s, th) => 0.6 * bell(angDiff(th, 1.0), 0.5) * bell(s - sAur, 2.4),
    seed: 3,
  });
  const holes: HoleSpec[] = [
    // 위쪽의 큰 혈관 입구(판막 없음). 축은 뒤쪽으로 조금 기울인다.
    { s: sStop - 2.2, th: -0.2, radius: 2.6, axis: new Vector3(0, 1, 0.42), depth: 1.8 },
  ];
  const model = createRoomModel({ curve: CHAMBER_CURVES.ra, sIn, sOut, extBefore: 5, extAfter: 5, radius, color, holes });
  return { model };
}

function buildRv(): ShapeInfo {
  const { L, sIn, sOut } = lenOf('rv');
  const radius = (s: number, th: number) => {
    if (s <= sIn) return R_TUBE;
    if (s >= sOut) return R_TUBE + 0.2 * smoothstep(sOut, L + 2, s);
    const b = bulb(s, sIn, sOut, 0.38, 0.42);
    let R = ellipseR(th, { up: 6.6, down: 6.4, left: 7.0, right: 9.6 });
    // 왼쪽의 매끈하게 볼록한 사이벽 → 단면이 초승달 모양
    R -= 2.5 * bell(angDiff(th, -Math.PI / 2), 0.55);
    // 바깥 벽 쪽의 근육 기둥
    const free = 1 - bell(angDiff(th, -Math.PI / 2), 0.9);
    R -= 0.5 * trabRidge(s, th, 21, 3.0, 0.32) * free;
    return R_TUBE + b * (R - R_TUBE);
  };
  const sept = new Color('#ef8a98');
  const color = makeColor({
    sIn,
    sOut,
    a: PALETTE.muscle,
    b: PALETTE.muscleDeep,
    light: PALETTE.muscleLight,
    inA: '#ec7d8b',
    inB: '#c9506a',
    outA: PALETTE.arteryWall,
    outB: PALETTE.arteryWallDeep,
    band: 1.0,
    ridge: (s, th) => trabRidge(s, th, 21, 3.0, 0.32) * (1 - bell(angDiff(th, -Math.PI / 2), 0.9)),
    tint: (_s, th, _r, out) => {
      out.lerp(sept, 0.75 * bell(angDiff(th, -Math.PI / 2), 0.6));
    },
    seed: 5,
  });
  const model = createRoomModel({ curve: CHAMBER_CURVES.rv, sIn, sOut, extBefore: 5, extAfter: 3, radius, color, holes: [] });
  return { model };
}

function buildLa(): ShapeInfo {
  const { L, sIn, sOut } = lenOf('la');
  // 판막 너머(다음 방): 넓어지며 두툼한 근육 벽으로 둘러싸인 공간
  const sEnd = L + 6;
  const beyond = (s: number, th: number) => {
    const ds = s - sOut;
    let r = R_TUBE + 2.4 * smoothstep(0.5, 3.6, ds);
    r += 0.9 * (trabRidge(s, th, 41, 3.4, 0.5) - 0.3) * smoothstep(0.8, 2.4, ds);
    // 끝은 둥근 바닥으로 막힌다
    const e = smoothstep(sEnd - 2.6, sEnd, s);
    return r * Math.sqrt(Math.max(0.0025, 1 - e * e));
  };
  const radius = (s: number, th: number) => {
    if (s <= sIn) return R_TUBE;
    if (s >= sOut) return beyond(s, th);
    const b = bulb(s, sIn, sOut, 0.32, 0.55);
    let R = ellipseR(th, { up: 8.4, down: 6.4, left: 9.8, right: 9.4 });
    // 얇고 매끈한 벽
    R += 0.18 * (wallNoise(s, th, 1.4, 0.3, 31) - 0.5);
    return R_TUBE + b * (R - R_TUBE);
  };
  const deepA = new Color(PALETTE.muscle);
  const deepB = new Color(PALETTE.muscleDeep);
  const color = makeColor({
    sIn,
    sOut,
    a: '#f29aa3',
    b: '#d9687a',
    light: '#ffc4ca',
    inA: PALETTE.veinWall,
    inB: PALETTE.veinWallDeep,
    outA: PALETTE.muscle,
    outB: PALETTE.muscleDeep,
    band: 0,
    outColor: (s, th, _r, out) => {
      const rd = trabRidge(s, th, 41, 3.4, 0.5);
      out.copy(deepB).lerp(deepA, clamp01(rd * 0.9 + 0.1));
    },
    seed: 7,
  });
  const holes: HoleSpec[] = [
    // 같은 쪽 위 입구, 반대쪽 위·아래 입구(경로 입구까지 모두 4개)
    { s: sIn + 0.8, th: 0.05, radius: 2.0, depth: 1.3 },
    { s: sIn + 1.0, th: -1.22, radius: 2.0, depth: 1.3 },
    { s: sIn + 1.0, th: -1.95, radius: 2.0, depth: 1.3 },
  ];
  const model = createRoomModel({ curve: CHAMBER_CURVES.la, sIn, sOut, extBefore: 5, extAfter: 6, radius, color, holes });
  return { model };
}

function buildLv(): ShapeInfo {
  const { sIn, sOut, sStop } = lenOf('lv');
  const sApex = sStop + 1.0;
  const radius = (s: number, th: number) => {
    if (s <= sIn) return R_TUBE;
    // 출구 너머: 아주 굵은 혈관이 시작된다
    if (s >= sOut) return R_TUBE + 0.75 * smoothstep(sOut + 0.4, sOut + 5, s);
    const b = bulb(s, sIn, sOut, 0.36, 0.38);
    let R = ellipseR(th, { up: 6.8, down: 7.4, left: 7.8, right: 7.8 });
    // 아래쪽 끝(꼭짓점)으로 길쭉하게 좁아지는 원뿔 모양
    R += 6.2 * bell(angDiff(th, Math.PI), 0.62) * bell(s - sApex, 4.2);
    // 두꺼운 벽의 굵은 근육 기둥
    R -= 0.8 * trabRidge(s, th, 51, 3.4, 0.33);
    return R_TUBE + b * (R - R_TUBE);
  };
  const color = makeColor({
    sIn,
    sOut,
    a: '#d23f55',
    b: '#8f2238',
    light: PALETTE.muscleLight,
    inA: '#f29aa3',
    inB: '#d9687a',
    outA: PALETTE.arteryWall,
    outB: PALETTE.arteryWallDeep,
    band: 1.9,
    ridge: (s, th) => trabRidge(s, th, 51, 3.4, 0.33),
    seed: 9,
  });
  const center = CHAMBER_CURVES.lv.getPointAt(0.5).clone().add(new Vector3(0, -1.5, 0));
  const model = createRoomModel({ curve: CHAMBER_CURVES.lv, sIn, sOut, extBefore: 5, extAfter: 7, radius, color, holes: [] }, center);
  return { model };
}

const SHAPES: Partial<Record<ChamberId, ShapeInfo>> = {};

export function chamberModel(id: ChamberId): RoomModel {
  let s = SHAPES[id];
  if (!s) {
    s = id === 'ra' ? buildRa() : id === 'rv' ? buildRv() : id === 'la' ? buildLa() : buildLv();
    SHAPES[id] = s;
  }
  return s.model;
}

// ─────────────────────────────────────────────────────────────
//  장면 구성
// ─────────────────────────────────────────────────────────────

function rand(seed: number) {
  let h = seed * 9973 + 17;
  return () => {
    h = (h * 16807) % 2147483647;
    return (h - 1) / 2147483646;
  };
}

function valveAt(m: RoomModel, s: number, kind: ValveSpec['kind'], n: number, len: number, phi0: number): ValveSpec {
  const center = new Vector3();
  const T = new Vector3();
  const N = new Vector3();
  const B = new Vector3();
  m.frame(s, center, T, N, B);
  return { kind, n, center, T, N, B, R: R_TUBE - 0.06, len, phi0 };
}

function lipAt(m: RoomModel, s: number, minor: number, color: string): Lip {
  const center = new Vector3();
  const axis = new Vector3();
  const n = new Vector3();
  const b = new Vector3();
  m.frame(s, center, axis, n, b);
  return { center, axis, radius: R_TUBE, minor, color };
}

/** 정지 지점 기준 오프셋(앞 f, 오른쪽 r, 위 u) */
function stopOffset(m: RoomModel, f: number, r: number, u: number): Vector3 {
  const p = new Vector3();
  const t = new Vector3();
  const n = new Vector3();
  const b = new Vector3();
  m.frame(m.sStop, p, t, n, b);
  return p.addScaledVector(t, f).addScaledVector(b, r).addScaledVector(n, u);
}

function at(m: RoomModel, s: number, th: number, r: number): Vector3 {
  return m.pointAt(s, th, r, new Vector3());
}

function wall(m: RoomModel, s: number, th: number, inset: number): Vector3 {
  return m.wallPoint(s, th, inset, new Vector3());
}

/** 벽을 따라 놓인 근육 기둥(양 끝이 벽에 묻힘) */
function barsAlongWall(
  m: RoomModel,
  count: number,
  seed: number,
  sRange: [number, number],
  thPick: (r: () => number) => number,
  len: [number, number],
  rad: [number, number],
  avoid?: (s: number, th: number) => boolean,
): Bar[] {
  const r = rand(seed);
  const out: Bar[] = [];
  let guard = 0;
  while (out.length < count && guard++ < count * 20) {
    const s = sRange[0] + r() * (sRange[1] - sRange[0]);
    const th = thPick(r);
    if (avoid && avoid(s, th)) continue;
    const l = len[0] + r() * (len[1] - len[0]);
    // 주로 길이 방향, 조금 비스듬히
    const tilt = (r() - 0.5) * 1.1;
    const s2 = Math.min(sRange[1] + 1, s + l * Math.cos(tilt));
    const rw = m.shape.radius(s, th);
    const th2 = th + (l * Math.sin(tilt)) / Math.max(3, rw);
    const rr = rad[0] + r() * (rad[1] - rad[0]);
    // 축을 벽 표면에 두어 반쯤 묻힌 능선이 되게 한다
    out.push({ a: wall(m, s, th, rr * 0.1), b: wall(m, s2, th2, rr * 0.1), r: rr });
  }
  return out;
}

function forceT(m: RoomModel, extent: number): number {
  return (m.sIn + extent + 1.7) / m.L;
}

function buildRaScene(lowSpec: boolean): ChamberScene {
  const m = chamberModel('ra');
  const { sIn, sOut, sStop, L } = m;
  const hole = m.holes[0];
  const up = new Vector3(0, 1, 0);
  const back = new Vector3();
  m.frame(sStop, new Vector3(), back, new Vector3(), new Vector3());
  back.negate();
  // 위쪽 입구에 이어진 큰 혈관(위로 올라가며 살짝 뒤로 휜다)
  const top = hole.center.clone();
  const flow = [
    top.clone().addScaledVector(up, 5.2).addScaledVector(back, 2.0),
    top.clone().addScaledVector(up, 3.0).addScaledVector(back, 0.7),
    top.clone().addScaledVector(hole.axis, 1.2),
    top.clone().addScaledVector(hole.axis, -1.6),
  ];
  const sAur = sStop + 1.2;

  // 빗살 모양 근육 능선(심방 앞쪽 벽과 귀 주머니 안)
  const bars: Bar[] = [];
  const ridges = lowSpec ? 4 : 7;
  const segs = lowSpec ? 3 : 4;
  for (let k = 0; k < ridges; k++) {
    const s = sStop - 1.6 + k * (5.8 / (ridges - 1));
    for (let q = 0; q < segs; q++) {
      const th1 = 0.32 + (q * 1.6) / segs;
      const th2 = 0.32 + ((q + 1) * 1.6) / segs;
      bars.push({ a: wall(m, s + q * 0.08, th1, 0.04), b: wall(m, s + (q + 1) * 0.08, th2, 0.04), r: 0.21 });
    }
  }
  // 굵은 능선 하나(능선들이 시작되는 곳)
  const crest = lowSpec ? 2 : 4;
  for (let q = 0; q < crest; q++) {
    const s1 = sStop - 3 + (q * 8) / crest;
    const s2 = sStop - 3 + ((q + 1) * 8) / crest;
    bars.push({ a: wall(m, s1, 0.26, 0.06), b: wall(m, s2, 0.26, 0.06), r: 0.34 });
  }

  const device = stopOffset(m, 3.4, -3.2, 1.4);
  return {
    id: 'ra',
    model: m,
    o2: CHAMBERS.ra.o2,
    role: 'atrium',
    lips: [lipAt(m, sIn, 0.17, '#f4a3ae'), lipAt(m, sOut, 0.2, '#ffc9d0')],
    inletValve: null,
    outletValve: valveAt(m, sOut, 'av', 3, 2.2, -Math.PI / 2 + 0.35),
    inletForceT: 0,
    outletForceT: (sOut - 2.6) / L,
    extraInlets: [{ hole, flow, radius: hole.radius }],
    extraTube: [PALETTE.veinWall, PALETTE.veinWallDeep],
    caps: [],
    papillary: [],
    chordae: [],
    bars,
    barColor: '#ff9aa5',
    muscleColor: PALETTE.muscle,
    device,
    anchors: {
      'ra-inlet': hole.center.clone().addScaledVector(hole.axis, -1.5).addScaledVector(back, 0.6),
      'ra-thickness': device.clone().add(new Vector3(0, 1.55, 0)),
      'ra-fill': at(m, sAur, 1.0, 6.4),
      'ra-valve': at(m, sOut - 0.9, 0.2, 2.8),
    },
    movingAnchors: ['ra-fill'],
    flag: null,
    split: null,
    thickRing: null,
    fixedBars: [],
    fixedBarColor: PALETTE.muscleDeep,
    wallRes: lowSpec ? { rings: 74, radial: 40 } : { rings: 120, radial: 60 },
    cells: { count: lowSpec ? 50 : 120, speed: 2.0 },
    stubCells: lowSpec ? { inlet: 10, outlet: 8, extra: 6 } : { inlet: 24, outlet: 18, extra: 16 },
    light: '#ffe0d8',
  };
}

function buildRvScene(lowSpec: boolean): ChamberScene {
  const m = chamberModel('rv');
  const { sIn, sOut, sStop, L } = m;
  const papillary: Papillary[] = [
    // 앞쪽(바깥 벽) 큰 꼭지근, 아래쪽 작은 꼭지근, 사이벽 쪽 작은 꼭지근
    { base: wall(m, sIn + 5.2, 2.15, 0.3), tip: at(m, sIn + 3.1, 2.0, 3.9), rBottom: 0.95, rTop: 0.38 },
    { base: wall(m, sIn + 4.4, 3.05, 0.3), tip: at(m, sIn + 2.9, 2.9, 3.8), rBottom: 0.7, rTop: 0.3 },
    { base: wall(m, sIn + 3.9, -2.15, 0.25), tip: at(m, sIn + 2.8, -2.0, 3.6), rBottom: 0.55, rTop: 0.26 },
  ];
  const chordae: ChordLink[] = [
    { tip: 0, phi: 0.9 },
    { tip: 0, phi: 1.5 },
    { tip: 0, phi: 2.1 },
    { tip: 1, phi: 2.55 },
    { tip: 1, phi: 3.0 },
    { tip: 1, phi: 3.5 },
    { tip: 2, phi: -1.3 },
    { tip: 2, phi: -1.85 },
    { tip: 2, phi: -2.4 },
  ];
  const bars = barsAlongWall(
    m,
    lowSpec ? 8 : 20,
    23,
    [sIn + 3, sOut - 3],
    (r) => 0.4 + r() * 3.0,
    [1.8, 3.2],
    [0.28, 0.42],
  );
  const split = (() => {
    const center = new Vector3();
    const T = new Vector3();
    const N = new Vector3();
    const B = new Vector3();
    m.frame(L + 3, center, T, N, B);
    return { center, T, N, B, trunkR: R_TUBE + 0.2, branchR: 1.35, offset: 1.6 };
  })();
  const device = stopOffset(m, 3.8, 3.0, 1.8);
  return {
    id: 'rv',
    model: m,
    o2: CHAMBERS.rv.o2,
    role: 'ventricle',
    lips: [lipAt(m, sIn, 0.3, '#f7a3ae'), lipAt(m, sOut, 0.3, '#f7a3ae')],
    inletValve: valveAt(m, sIn, 'av', 3, 2.2, -Math.PI / 2 + 0.35),
    outletValve: valveAt(m, sOut, 'semilunar', 3, 1.7, 0.2),
    inletForceT: forceT(m, 3.1),
    outletForceT: (sOut - 2.6) / L,
    extraInlets: [],
    extraTube: [PALETTE.arteryWall, PALETTE.arteryWallDeep],
    caps: [],
    papillary,
    chordae,
    bars,
    barColor: '#e9697c',
    muscleColor: '#d94d62',
    device,
    anchors: {
      'rv-valveback': at(m, sIn + 1.5, 0.35, 4.0),
      'rv-contract': at(m, sStop - 0.4, 1.95, m.shape.radius(sStop - 0.4, 1.95) - 1.6),
      'rv-thickness': device.clone().add(new Vector3(0, 1.55, 0)),
      'rv-exit': at(m, sOut - 0.9, 0.2, 2.8),
    },
    movingAnchors: ['rv-contract'],
    flag: null,
    split,
    thickRing: null,
    fixedBars: [],
    fixedBarColor: PALETTE.muscleDeep,
    wallRes: lowSpec ? { rings: 74, radial: 40 } : { rings: 120, radial: 60 },
    cells: { count: lowSpec ? 50 : 120, speed: 2.4 },
    stubCells: lowSpec ? { inlet: 10, outlet: 8, extra: 0 } : { inlet: 22, outlet: 18, extra: 0 },
    light: '#ffe0d8',
  };
}

function buildLaScene(lowSpec: boolean): ChamberScene {
  const m = chamberModel('la');
  const { sIn, sOut, L } = m;
  const back = new Vector3();
  m.frame(sIn, new Vector3(), back, new Vector3(), new Vector3());
  back.negate();
  const extraInlets: ExtraInlet[] = m.holes.map((hole) => {
    const c = hole.center;
    return {
      hole,
      radius: hole.radius,
      flow: [
        c.clone().addScaledVector(hole.axis, 4.4).addScaledVector(back, 2.6),
        c.clone().addScaledVector(hole.axis, 2.6).addScaledVector(back, 0.9),
        c.clone().addScaledVector(hole.axis, 0.9),
        c.clone().addScaledVector(hole.axis, -1.4),
      ],
    };
  });
  // 판막 너머 두꺼운 벽 단면 고리(경로 끝보다 3.5 앞) — 판막 틈으로 결 무늬가 보인다
  const rc = new Vector3();
  const rt = new Vector3();
  m.frame(L + 3.5, rc, rt, new Vector3(), new Vector3());
  // 판막 너머 공간의 굵은 근육 기둥(이 방과 함께 수축하지 않는다)
  const fixedBars = barsAlongWall(
    m,
    lowSpec ? 5 : 10,
    43,
    [L + 0.6, L + 3.0],
    (r) => r() * TAU,
    [1.4, 2.2],
    [0.55, 0.8],
  );
  const device = stopOffset(m, 3.6, 3.2, 1.4);
  return {
    id: 'la',
    model: m,
    o2: CHAMBERS.la.o2,
    role: 'atrium',
    lips: [lipAt(m, sIn, 0.16, '#ffb8c0'), lipAt(m, sOut, 0.2, '#ffc9d0')],
    inletValve: null,
    outletValve: valveAt(m, sOut, 'av', 2, 2.4, -Math.PI / 2 + 0.15),
    inletForceT: 0,
    outletForceT: (sOut - 2.6) / L,
    extraInlets,
    extraTube: [PALETTE.veinWall, PALETTE.veinWallDeep],
    caps: [],
    papillary: [],
    chordae: [],
    bars: [],
    barColor: PALETTE.muscleLight,
    muscleColor: PALETTE.muscle,
    device,
    anchors: {
      'la-inlet': at(m, sIn + 2.0, -0.75, 4.6),
      'la-thickness': device.clone().add(new Vector3(0, 1.55, 0)),
      'la-valve': at(m, sOut - 0.9, 0.2, 2.8),
    },
    movingAnchors: [],
    flag: null,
    split: null,
    thickRing: { center: rc, axis: rt, inner: 1.6, outer: 6.2 },
    fixedBars,
    fixedBarColor: '#b0304a',
    wallRes: lowSpec ? { rings: 80, radial: 40 } : { rings: 130, radial: 60 },
    cells: { count: lowSpec ? 50 : 120, speed: 2.0 },
    stubCells: lowSpec ? { inlet: 10, outlet: 6, extra: 5 } : { inlet: 22, outlet: 14, extra: 12 },
    light: '#fff0e8',
  };
}

function buildLvScene(lowSpec: boolean): ChamberScene {
  const m = chamberModel('lv');
  const { sIn, sOut, sStop, L } = m;
  const papillary: Papillary[] = [
    { base: wall(m, sIn + 4.6, Math.PI - 0.85, 0.3), tip: at(m, sIn + 2.9, Math.PI - 0.75, 3.9), rBottom: 1.05, rTop: 0.42 },
    { base: wall(m, sIn + 4.9, Math.PI + 0.9, 0.3), tip: at(m, sIn + 3.0, Math.PI + 0.8, 3.9), rBottom: 1.05, rTop: 0.42 },
  ];
  const chordae: ChordLink[] = [
    // 두 꼭지근 모두 두 장의 막에 힘줄을 보낸다
    { tip: 0, phi: 1.45 },
    { tip: 0, phi: 1.95 },
    { tip: 0, phi: 2.4 },
    { tip: 0, phi: 2.8 },
    { tip: 1, phi: -1.15 },
    { tip: 1, phi: -1.7 },
    { tip: 1, phi: -2.2 },
    { tip: 1, phi: -2.7 },
  ];
  // 탐사 표식: 정지 지점 왼쪽 벽
  const flagS = sStop + 1.6;
  const flagTh = -1.65;
  const flagBase = wall(m, flagS, flagTh, 0.05);
  const inward = m.wallNormal(flagS, flagTh, new Vector3()).negate();
  const flagDir = inward.clone().add(new Vector3(0, 0.55, 0)).normalize();
  const viewer = stopOffset(m, 0, 0, 0.95);
  const bars = barsAlongWall(
    m,
    lowSpec ? 14 : 34,
    53,
    [sIn + 3, sOut - 3],
    (r) => r() * TAU,
    [2.0, 3.4],
    [0.45, 0.75],
    (s, th) => Math.abs(s - flagS) < 2.2 && Math.abs(angDiff(th, flagTh)) < 0.6,
  );
  const device = stopOffset(m, 3.6, 3.2, 1.5);
  return {
    id: 'lv',
    model: m,
    o2: CHAMBERS.lv.o2,
    role: 'ventricle',
    lips: [lipAt(m, sIn, 0.5, '#ffb0b8'), lipAt(m, sOut, 0.5, '#ffb0b8')],
    inletValve: valveAt(m, sIn, 'av', 2, 2.4, -Math.PI / 2 + 0.15),
    outletValve: valveAt(m, sOut, 'semilunar', 3, 1.8, 0.2),
    inletForceT: forceT(m, 3.0),
    outletForceT: (sOut - 2.6) / L,
    extraInlets: [],
    extraTube: [PALETTE.arteryWall, PALETTE.arteryWallDeep],
    caps: [],
    papillary,
    chordae,
    bars,
    barColor: '#de5268',
    muscleColor: '#c43a51',
    device,
    anchors: {
      'lv-thickness': device.clone().add(new Vector3(0, 1.55, 0)),
      'lv-exit': at(m, sOut - 0.8, 0.0, 2.6),
      'lv-inlet': at(m, sIn + 1.6, 0.4, 4.0),
    },
    movingAnchors: [],
    flag: { base: flagBase, dir: flagDir, viewer },
    split: null,
    thickRing: null,
    fixedBars: [],
    fixedBarColor: PALETTE.muscleDeep,
    wallRes: lowSpec ? { rings: 80, radial: 42 } : { rings: 130, radial: 64 },
    cells: { count: lowSpec ? 50 : 120, speed: 2.4 },
    stubCells: lowSpec ? { inlet: 10, outlet: 8, extra: 0 } : { inlet: 22, outlet: 20, extra: 0 },
    light: '#fff0e8',
  };
}

/** 관 양 끝을 막는 깊은 색 마개 */
function addCaps(sc: ChamberScene): ChamberScene {
  const m = sc.model;
  const p = new Vector3();
  const t = new Vector3();
  const n = new Vector3();
  const b = new Vector3();
  const caps: Cap[] = [];
  const dark = sc.o2 === 'rich' ? '#5e1424' : '#4a0f1f';
  // 들어오는 관의 시작
  m.frame(-m.shape.extBefore + 0.05, p, t, n, b);
  caps.push({ center: p.clone(), facing: t.clone(), radius: R_TUBE + 0.5, inner: dark, outer: sc.o2 === 'rich' ? '#a8485a' : '#8a3a50' });
  // 나가는 관의 끝(우심실은 갈림 마개, 좌심방은 둥근 바닥이 있어 따로 막지 않음)
  if (sc.id === 'ra' || sc.id === 'lv') {
    m.frame(m.L + m.shape.extAfter - 0.05, p, t, n, b);
    caps.push({
      center: p.clone(),
      facing: t.clone().negate(),
      radius: m.shape.radius(m.L + m.shape.extAfter, 0) + 0.6,
      inner: dark,
      outer: sc.id === 'lv' ? PALETTE.arteryWallDeep : PALETTE.muscleDeep,
    });
  }
  if (sc.id === 'la') {
    // 둥근 바닥 끝에 남는 아주 작은 틈
    m.frame(m.L + m.shape.extAfter - 0.02, p, t, n, b);
    caps.push({ center: p.clone(), facing: t.clone().negate(), radius: 0.8, inner: PALETTE.muscleDeep, outer: PALETTE.muscleDeep });
  }
  sc.caps = caps;
  return sc;
}

const SCENES = new Map<string, ChamberScene>();

/** 방 장면 구성(저사양 여부에 따라 개수·해상도가 다르다). 같은 설정은 한 번만 만든다. */
export function chamberScene(id: ChamberId, lowSpec: boolean): ChamberScene {
  const key = `${id}-${lowSpec ? 'l' : 'n'}`;
  let sc = SCENES.get(key);
  if (!sc) {
    sc = addCaps(
      id === 'ra' ? buildRaScene(lowSpec) : id === 'rv' ? buildRvScene(lowSpec) : id === 'la' ? buildLaScene(lowSpec) : buildLvScene(lowSpec),
    );
    SCENES.set(key, sc);
  }
  return sc;
}

/**
 * 현재 수축 정도(벽을 중심 쪽으로 당기는 비율). 음수면 부풂.
 * 심방: 심방 수축 때 살짝 줄고, 심실 수축기(혈액이 차오를 때)에 살짝 부푼다.
 * 심실: 심실 수축기에 크게 줄고, 심방 수축 때 살짝 부푼다.
 */
export function chamberK(id: ChamberId, ventricle: number, atrium: number, reduceMotion: boolean): number {
  const amp = CHAMBERS[id].contraction * (reduceMotion ? 0.3 : 1);
  if (CHAMBERS[id].role === 'atrium') return amp * (atrium - 0.5 * ventricle);
  return amp * (ventricle - 0.25 * atrium);
}
