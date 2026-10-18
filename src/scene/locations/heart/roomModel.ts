// 심장 방(안쪽에서 바라보는 둥근 공간)을 만드는 순수 함수들.
// 탐사선 경로를 따라 단면 반지름 r(s, θ)를 정해 벽을 쓸어 만든다(입구·출구가 자연스럽게 뚫린다).
// s: 경로 호의 길이(0 = 경로 시작, L = 경로 끝, 범위 밖은 끝 방향으로 곧게 연장)
// θ: 0 = 위쪽(N), +π/2 = 오른쪽(B) — shared/pathFrames의 pointAround와 같은 약속

import { BufferAttribute, BufferGeometry, CatmullRomCurve3, Color, Matrix4, Vector3, type Curve } from 'three';

const UP = new Vector3(0, 1, 0);
const TAU = Math.PI * 2;

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export function smoothstep(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

/** 각도 차이(-π~π) */
export function angDiff(a: number, b: number): number {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** 종 모양 함수(x = 0에서 1, |x| = w에서 약 0.37) */
export function bell(x: number, w: number): number {
  const k = x / w;
  return Math.exp(-k * k);
}

function h3(x: number, y: number, z: number, seed: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 19.19) * 43758.5453;
  return s - Math.floor(s);
}

/** 부드러운 3차원 값 잡음(0~1) */
export function noise3(x: number, y: number, z: number, seed = 0): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = x - xi;
  const yf = y - yi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const w = zf * zf * (3 - 2 * zf);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const x00 = l(h3(xi, yi, zi, seed), h3(xi + 1, yi, zi, seed), u);
  const x10 = l(h3(xi, yi + 1, zi, seed), h3(xi + 1, yi + 1, zi, seed), u);
  const x01 = l(h3(xi, yi, zi + 1, seed), h3(xi + 1, yi, zi + 1, seed), u);
  const x11 = l(h3(xi, yi + 1, zi + 1, seed), h3(xi + 1, yi + 1, zi + 1, seed), u);
  return l(l(x00, x10, v), l(x01, x11, v), w);
}

/** 벽 위 잡음. 둘레 방향으로 끊김 없이 이어진다. fTh: 둘레 방향 촘촘함, fS: 길이 방향 촘촘함 */
export function wallNoise(s: number, th: number, fTh: number, fS: number, seed: number): number {
  return noise3(Math.cos(th) * fTh, Math.sin(th) * fTh, s * fS, seed);
}

/** 위·아래·왼쪽·오른쪽 반지름이 다른 타원 단면 */
export function ellipseR(th: number, e: { up: number; down: number; left: number; right: number }): number {
  const c = Math.cos(th);
  const sn = Math.sin(th);
  const ay = c >= 0 ? e.up : e.down;
  const ax = sn >= 0 ? e.right : e.left;
  return 1 / Math.sqrt((c / ay) * (c / ay) + (sn / ax) * (sn / ax));
}

/** 방의 부풀기(입구·출구에서 0, 가운데에서 1). pIn·pOut이 작을수록 앞뒤 벽이 평평하다. */
export function bulb(s: number, sIn: number, sOut: number, pIn: number, pOut: number): number {
  const u = (s - sIn) / (sOut - sIn);
  if (u <= 0 || u >= 1) return 0;
  return Math.pow(Math.sin(Math.PI * u), u < 0.5 ? pIn : pOut);
}

// ─────────────────────────────────────────────────────────────
//  경로 좌표축
// ─────────────────────────────────────────────────────────────

export interface PathSampler {
  curve: Curve<Vector3>;
  L: number;
  /** 호의 길이 s 위치의 점과 좌표축(T 진행, N 위, B 오른쪽) */
  frame(s: number, p: Vector3, t: Vector3, n: Vector3, b: Vector3): void;
}

export function createSampler(curve: Curve<Vector3>): PathSampler {
  const L = curve.getLength();
  const p0 = curve.getPointAt(0);
  const t0 = curve.getTangentAt(0).normalize();
  const p1 = curve.getPointAt(1);
  const t1 = curve.getTangentAt(1).normalize();
  return {
    curve,
    L,
    frame(s, p, t, n, b) {
      if (s <= 0) {
        t.copy(t0);
        p.copy(p0).addScaledVector(t0, s);
      } else if (s >= L) {
        t.copy(t1);
        p.copy(p1).addScaledVector(t1, s - L);
      } else {
        curve.getPointAt(s / L, p);
        curve.getTangentAt(s / L, t).normalize();
      }
      // computePathFrames와 같은 방식(세계의 위쪽을 진행 방향에 수직으로 투영)
      n.copy(UP).addScaledVector(t, -UP.dot(t)).normalize();
      b.crossVectors(t, n).normalize();
    },
  };
}

// ─────────────────────────────────────────────────────────────
//  방 모델
// ─────────────────────────────────────────────────────────────

export interface HoleSpec {
  /** 구멍 중심이 놓인 벽 위치 */
  s: number;
  th: number;
  radius: number;
  /** 바깥쪽 축 방향(생략하면 벽 법선) */
  axis?: Vector3;
  /** 축 방향으로 잘라 낼 범위(±) */
  depth?: number;
}

export interface ResolvedHole {
  center: Vector3;
  axis: Vector3;
  radius: number;
  depth: number;
}

export interface RoomShape {
  curve: Curve<Vector3>;
  /** 입구(경로 t≈0.12)·출구(t≈0.88)의 호 길이 */
  sIn: number;
  sOut: number;
  /** 경로 앞뒤로 연장할 벽 길이 */
  extBefore: number;
  extAfter: number;
  radius: (s: number, th: number) => number;
  color: (s: number, th: number, r: number, out: Color) => void;
  holes: HoleSpec[];
}

export interface RoomModel {
  shape: RoomShape;
  sampler: PathSampler;
  L: number;
  sIn: number;
  sOut: number;
  sStop: number;
  /** 수축 중심 */
  center: Vector3;
  holes: ResolvedHole[];
  /** 벽 수축 가중치(입구·출구 0, 방 가운데 1) */
  weight(s: number): number;
  frame(s: number, p: Vector3, t: Vector3, n: Vector3, b: Vector3): void;
  /** 경로 위 s에서 θ 방향으로 r만큼 떨어진 점 */
  pointAt(s: number, th: number, r: number, out: Vector3): Vector3;
  /** 벽 위의 점(inset만큼 안쪽으로) */
  wallPoint(s: number, th: number, inset: number, out: Vector3): Vector3;
  /** 벽의 바깥쪽 법선 */
  wallNormal(s: number, th: number, out: Vector3): Vector3;
  /** 미리 계산한 격자(혈구용, 빠름) */
  radiusFast(s: number, th: number): number;
  frameFast(s: number, p: Vector3, n: Vector3, b: Vector3): void;
}

const _p = new Vector3();
const _t = new Vector3();
const _n = new Vector3();
const _b = new Vector3();

export function createRoomModel(shape: RoomShape, center?: Vector3): RoomModel {
  const sampler = createSampler(shape.curve);
  const L = sampler.L;
  const { sIn, sOut } = shape;
  const sStop = L * 0.5;
  const s0 = -shape.extBefore;
  const s1 = L + shape.extAfter;

  const pointAt = (s: number, th: number, r: number, out: Vector3) => {
    sampler.frame(s, _p, _t, _n, _b);
    return out.copy(_p).addScaledVector(_n, Math.cos(th) * r).addScaledVector(_b, Math.sin(th) * r);
  };

  // 혈구가 매 프레임 쓰는 격자
  const DS = 0.2;
  const nS = Math.ceil((s1 - s0) / DS) + 1;
  const nTh = 48;
  const gridR = new Float32Array(nS * nTh);
  const gridP = new Float32Array(nS * 3);
  const gridN = new Float32Array(nS * 3);
  const gridB = new Float32Array(nS * 3);
  for (let i = 0; i < nS; i++) {
    const s = s0 + i * DS;
    sampler.frame(s, _p, _t, _n, _b);
    _p.toArray(gridP, i * 3);
    _n.toArray(gridN, i * 3);
    _b.toArray(gridB, i * 3);
    for (let j = 0; j < nTh; j++) gridR[i * nTh + j] = shape.radius(s, (j / nTh) * TAU);
  }
  // 매 프레임 호출되므로 객체를 만들지 않고 cellI·cellK에 결과를 담는다
  let cellI = 0;
  let cellK = 0;
  const cell = (s: number) => {
    const x = Math.min(Math.max((s - s0) / DS, 0), nS - 1.0001);
    cellI = Math.floor(x);
    cellK = x - cellI;
  };

  const model: RoomModel = {
    shape,
    sampler,
    L,
    sIn,
    sOut,
    sStop,
    center: center ?? sampler.curve.getPointAt(0.5),
    holes: [],
    weight(s) {
      return smoothstep(sIn + 0.4, sIn + 2.6, s) * (1 - smoothstep(sOut - 2.6, sOut - 0.4, s));
    },
    frame: sampler.frame,
    pointAt,
    wallPoint(s, th, inset, out) {
      return pointAt(s, th, shape.radius(s, th) - inset, out);
    },
    wallNormal(s, th, out) {
      const e = 0.05;
      const a = pointAt(s, th, shape.radius(s, th), new Vector3());
      const ds = pointAt(s + e, th, shape.radius(s + e, th), new Vector3()).sub(a);
      const dt = pointAt(s, th + e, shape.radius(s, th + e), new Vector3()).sub(a);
      out.crossVectors(ds, dt).normalize();
      // 경로에서 벽 쪽(바깥)을 향하게
      sampler.frame(s, _p, _t, _n, _b);
      if (out.dot(a.sub(_p)) < 0) out.negate();
      return out;
    },
    radiusFast(s, th) {
      cell(s);
      const i = cellI;
      const k = cellK;
      let x = ((th % TAU) + TAU) % TAU;
      x = (x / TAU) * nTh;
      const j = Math.floor(x) % nTh;
      const j2 = (j + 1) % nTh;
      const q = x - Math.floor(x);
      const a = gridR[i * nTh + j] * (1 - q) + gridR[i * nTh + j2] * q;
      const b = gridR[(i + 1) * nTh + j] * (1 - q) + gridR[(i + 1) * nTh + j2] * q;
      return a + (b - a) * k;
    },
    frameFast(s, p, n, b) {
      cell(s);
      const i = cellI;
      const k = cellK;
      const i3 = i * 3;
      const j3 = i3 + 3;
      p.set(
        gridP[i3] + (gridP[j3] - gridP[i3]) * k,
        gridP[i3 + 1] + (gridP[j3 + 1] - gridP[i3 + 1]) * k,
        gridP[i3 + 2] + (gridP[j3 + 2] - gridP[i3 + 2]) * k,
      );
      n.set(
        gridN[i3] + (gridN[j3] - gridN[i3]) * k,
        gridN[i3 + 1] + (gridN[j3 + 1] - gridN[i3 + 1]) * k,
        gridN[i3 + 2] + (gridN[j3 + 2] - gridN[i3 + 2]) * k,
      ).normalize();
      b.set(
        gridB[i3] + (gridB[j3] - gridB[i3]) * k,
        gridB[i3 + 1] + (gridB[j3 + 1] - gridB[i3 + 1]) * k,
        gridB[i3 + 2] + (gridB[j3 + 2] - gridB[i3 + 2]) * k,
      ).normalize();
    },
  };

  model.holes = shape.holes.map((h) => ({
    center: model.wallPoint(h.s, h.th, 0, new Vector3()),
    axis: h.axis ? h.axis.clone().normalize() : model.wallNormal(h.s, h.th, new Vector3()),
    radius: h.radius,
    depth: h.depth ?? 1.6,
  }));
  return model;
}

/** 입구·출구 근처에 고리를 촘촘히 배치한 s 샘플 */
function ringSamples(m: RoomModel, count: number): number[] {
  const a = -m.shape.extBefore;
  const b = m.L + m.shape.extAfter;
  const density = (s: number) => {
    let d = s < m.sIn || s > m.sOut ? 0.5 : 1;
    d += 2.4 * bell(s - m.sIn - 0.6, 1.3) + 2.4 * bell(s - m.sOut + 0.6, 1.3);
    return d;
  };
  const N = 2400;
  const cum = new Float64Array(N + 1);
  for (let i = 1; i <= N; i++) cum[i] = cum[i - 1] + density(a + ((i - 0.5) / N) * (b - a));
  const total = cum[N];
  const out: number[] = [];
  let k = 0;
  for (let r = 0; r < count; r++) {
    const target = (r / (count - 1)) * total;
    while (k < N - 1 && cum[k + 1] < target) k++;
    const seg = cum[k + 1] - cum[k];
    const f = seg > 0 ? (target - cum[k]) / seg : 0;
    out.push(a + ((k + Math.min(1, Math.max(0, f))) / N) * (b - a));
  }
  // 입구·출구 고리를 정확한 위치에 둔다(테두리 고리와 판막이 딱 맞게)
  for (const s of [m.sIn, m.sOut]) {
    let best = 1;
    for (let i = 1; i < out.length - 1; i++) if (Math.abs(out[i] - s) < Math.abs(out[best] - s)) best = i;
    out[best] = s;
  }
  return out;
}

/**
 * 방 벽 지오메트리. 안쪽에서 앞면이 보인다.
 * 속성: position, normal, color, aW(수축 가중치)
 */
export function buildRoomGeometry(m: RoomModel, rings: number, radial: number): BufferGeometry {
  const ss = ringSamples(m, rings);
  const nI = ss.length;
  const nJ = radial + 1;
  const vCount = nI * nJ;
  const pos = new Float32Array(vCount * 3);
  const col = new Float32Array(vCount * 3);
  const aw = new Float32Array(vCount);
  const c = new Color();
  const p = new Vector3();
  const t = new Vector3();
  const n = new Vector3();
  const b = new Vector3();
  let k = 0;
  for (let i = 0; i < nI; i++) {
    const s = ss[i];
    m.frame(s, p, t, n, b);
    const w = m.weight(s);
    for (let j = 0; j < nJ; j++) {
      const th = ((j % radial) / radial) * TAU;
      const r = m.shape.radius(s, th);
      const cs = Math.cos(th);
      const sn = Math.sin(th);
      pos[k * 3] = p.x + (n.x * cs + b.x * sn) * r;
      pos[k * 3 + 1] = p.y + (n.y * cs + b.y * sn) * r;
      pos[k * 3 + 2] = p.z + (n.z * cs + b.z * sn) * r;
      m.shape.color(s, th, r, c);
      col[k * 3] = c.r;
      col[k * 3 + 1] = c.g;
      col[k * 3 + 2] = c.b;
      aw[k] = w;
      k++;
    }
  }

  // 구멍 가장자리 근처 정점을 원 위로 옮겨 깔끔한 구멍을 만든다
  const v = new Vector3();
  const d = new Vector3();
  for (const h of m.holes) {
    const tol = Math.min(0.85, Math.max(0.35, 0.62 * ((TAU * 7) / radial)));
    for (let q = 0; q < vCount; q++) {
      v.fromArray(pos, q * 3);
      d.copy(v).sub(h.center);
      const along = d.dot(h.axis);
      if (Math.abs(along) > h.depth) continue;
      d.addScaledVector(h.axis, -along);
      const dist = d.length();
      if (dist > 1e-4 && Math.abs(dist - h.radius) < tol) {
        v.copy(h.center).addScaledVector(h.axis, along).addScaledVector(d, h.radius / dist);
        v.toArray(pos, q * 3);
      }
    }
  }

  const inHole = (ax: number, ay: number, az: number) => {
    for (const h of m.holes) {
      d.set(ax, ay, az).sub(h.center);
      const along = d.dot(h.axis);
      if (Math.abs(along) > h.depth) continue;
      d.addScaledVector(h.axis, -along);
      if (d.length() < h.radius * 0.999) return true;
    }
    return false;
  };

  const idx: number[] = [];
  for (let i = 0; i < nI - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * nJ + j;
      const bb = (i + 1) * nJ + j;
      const cc = (i + 1) * nJ + j + 1;
      const dd = i * nJ + j + 1;
      // 안쪽에서 앞면이 보이는 감김 순서(vesselGeometry와 같다)
      for (const [x, y, z] of [
        [a, bb, dd],
        [bb, cc, dd],
      ]) {
        if (m.holes.length) {
          const cx = (pos[x * 3] + pos[y * 3] + pos[z * 3]) / 3;
          const cy = (pos[x * 3 + 1] + pos[y * 3 + 1] + pos[z * 3 + 1]) / 3;
          const cz = (pos[x * 3 + 2] + pos[y * 3 + 2] + pos[z * 3 + 2]) / 3;
          if (inHole(cx, cy, cz)) continue;
        }
        idx.push(x, y, z);
      }
    }
  }

  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('color', new BufferAttribute(col, 3));
  g.setAttribute('aW', new BufferAttribute(aw, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

// ─────────────────────────────────────────────────────────────
//  짧은 혈관 관(구멍 뒤 연결 혈관 등) — 평행 이동 좌표축이라 수직 방향도 괜찮다
// ─────────────────────────────────────────────────────────────

export interface TubeOptions {
  points: Vector3[];
  radius: (t: number) => number;
  radial: number;
  tubular: number;
  colorA: string;
  colorB: string;
  seed?: number;
  /** 벽 울퉁불퉁함(0~0.2) */
  bump?: number;
}

export function buildTubeGeometry(o: TubeOptions): BufferGeometry {
  const curve = new CatmullRomCurve3(o.points);
  const nI = o.tubular + 1;
  const nJ = o.radial + 1;
  const pos = new Float32Array(nI * nJ * 3);
  const col = new Float32Array(nI * nJ * 3);
  const ca = new Color(o.colorA);
  const cb = new Color(o.colorB);
  const c = new Color();
  const T = new Vector3();
  const N = new Vector3();
  const B = new Vector3();
  const p = new Vector3();
  const tmp = new Vector3();
  const seed = o.seed ?? 1;
  const bump = o.bump ?? 0.05;
  let k = 0;
  for (let i = 0; i < nI; i++) {
    const t = i / o.tubular;
    curve.getPointAt(t, p);
    curve.getTangentAt(t, T).normalize();
    if (i === 0) {
      // 진행 방향과 가장 덜 나란한 축으로 첫 위쪽 방향을 정한다
      tmp.set(0, 1, 0);
      if (Math.abs(T.dot(tmp)) > 0.9) tmp.set(1, 0, 0);
      N.copy(tmp).addScaledVector(T, -tmp.dot(T)).normalize();
    } else {
      // 평행 이동: 이전 N을 새 진행 방향에 수직으로 투영
      N.addScaledVector(T, -N.dot(T)).normalize();
    }
    B.crossVectors(T, N).normalize();
    const r0 = o.radius(t);
    for (let j = 0; j < nJ; j++) {
      const th = ((j % o.radial) / o.radial) * TAU;
      const nz = noise3(Math.cos(th) * 1.6, Math.sin(th) * 1.6, t * 6, seed);
      const r = r0 * (1 + bump * (nz - 0.5) * 2);
      const cs = Math.cos(th);
      const sn = Math.sin(th);
      pos[k * 3] = p.x + (N.x * cs + B.x * sn) * r;
      pos[k * 3 + 1] = p.y + (N.y * cs + B.y * sn) * r;
      pos[k * 3 + 2] = p.z + (N.z * cs + B.z * sn) * r;
      c.copy(ca).lerp(cb, Math.min(1, t * 0.9 + nz * 0.25));
      col[k * 3] = c.r;
      col[k * 3 + 1] = c.g;
      col[k * 3 + 2] = c.b;
      k++;
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < o.tubular; i++) {
    for (let j = 0; j < o.radial; j++) {
      const a = i * nJ + j;
      const b = (i + 1) * nJ + j;
      const cc = (i + 1) * nJ + j + 1;
      const d = i * nJ + j + 1;
      idx.push(a, b, d, b, cc, d);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('color', new BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** 원판(관 끝을 막는 깊은 색 마개 등). +Z가 facing 방향을 보도록 놓는다. 정점색: 가운데 → 가장자리 */
export function buildDiscGeometry(
  center: Vector3,
  facing: Vector3,
  radius: number,
  inner: string,
  outer: string,
  segments = 28,
): BufferGeometry {
  const rings = 4;
  const pos: number[] = [0, 0, 0];
  const col: number[] = [];
  const ci = new Color(inner);
  const co = new Color(outer);
  const c = new Color();
  col.push(ci.r, ci.g, ci.b);
  for (let r = 1; r <= rings; r++) {
    const f = r / rings;
    c.copy(ci).lerp(co, f * f);
    for (let j = 0; j < segments; j++) {
      const a = (j / segments) * TAU;
      pos.push(Math.cos(a) * radius * f, Math.sin(a) * radius * f, 0);
      col.push(c.r, c.g, c.b);
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < segments; j++) idx.push(0, 1 + j, 1 + ((j + 1) % segments));
  for (let r = 1; r < rings; r++) {
    const a0 = 1 + (r - 1) * segments;
    const b0 = 1 + r * segments;
    for (let j = 0; j < segments; j++) {
      const j2 = (j + 1) % segments;
      idx.push(a0 + j, b0 + j, b0 + j2, a0 + j, b0 + j2, a0 + j2);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  g.setIndex(idx);
  g.applyMatrix4(basisFacing(center, facing));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** +Z가 facing을 향하는 변환 행렬(위치 center) */
export function basisFacing(center: Vector3, facing: Vector3): Matrix4 {
  const z = facing.clone().normalize();
  const ref = Math.abs(z.y) > 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
  const x = new Vector3().crossVectors(ref, z).normalize();
  const y = new Vector3().crossVectors(z, x).normalize();
  return new Matrix4().makeBasis(x, y, z).setPosition(center);
}
