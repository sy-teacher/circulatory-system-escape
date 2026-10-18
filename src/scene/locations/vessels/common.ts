// 굵은 혈관 4곳(대동맥·대정맥·폐동맥·폐정맥)이 함께 쓰는 도우미.
// 경로·반지름·벽 구멍(곁가지 입구)·맥동 위치 계산·글자 텍스처를 모아 둔다. (React 없음)

import { BufferGeometry, CanvasTexture, CatmullRomCurve3, SRGBColorSpace, Vector3 } from 'three';
import { BEAT_PERIOD } from '../../runtime';
import { computePathFrames, samplePath, type PathFrames } from '../../shared/pathFrames';

export type V3 = [number, number, number];

/** 탐사선 경로를 혈관 중심축보다 이만큼 아래로 둔다(눈높이 0.95가 축 근처에 오도록) */
export const PATH_DROP = 0.45;
/** 탐사선 좌우 조향 한계 = 반지름 − 이 값 */
export const LANE_MARGIN = 1.6;
/** 탐사선 눈높이(경로 위) */
export const EYE_HEIGHT = 0.95;

export interface VesselLayout {
  /** 혈관 중심축(벽·혈구가 이 축을 기준으로 만들어진다) */
  axis: CatmullRomCurve3;
  /** 탐사선 경로(중심축을 PATH_DROP만큼 내린 곡선, 같은 t에서 같은 위치 관계) */
  path: CatmullRomCurve3;
  radius: (t: number) => number;
  frames: PathFrames;
  pathFrames: PathFrames;
  length: number;
}

export function makeVessel(points: V3[], radius: (t: number) => number): VesselLayout {
  const pts = points.map((p) => new Vector3(p[0], p[1], p[2]));
  const axis = new CatmullRomCurve3(pts, false, 'centripetal');
  // 평행 이동한 제어점 → 같은 호 길이 매개변수(축과 경로의 t가 정확히 대응)
  const drop = new Vector3(0, -PATH_DROP, 0);
  const path = new CatmullRomCurve3(
    pts.map((p) => p.clone().add(drop)),
    false,
    'centripetal',
  );
  const frames = computePathFrames(axis, 400);
  const pathFrames = computePathFrames(path, 400);
  return { axis, path, radius, frames, pathFrames, length: frames.length };
}

export function laneFor(radius: (t: number) => number): (t: number) => number {
  return (t) => Math.max(0, radius(t) - LANE_MARGIN);
}

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export function smoothstep(a: number, b: number, x: number): number {
  const k = clamp01((x - a) / (b - a));
  return k * k * (3 - 2 * k);
}

/**
 * (t, 반지름) 기준점 사이를 부드럽게 잇는 반지름 함수.
 * 각 기준점에서 기울기가 0이 되어 '갈라질 때마다 한 단계씩 가늘어지는' 모양이 된다.
 */
export function radiusKnots(knots: [number, number][]): (t: number) => number {
  return (t) => {
    if (t <= knots[0][0]) return knots[0][1];
    for (let i = 1; i < knots.length; i++) {
      const [t1, r1] = knots[i];
      if (t <= t1) {
        const [t0, r0] = knots[i - 1];
        return r0 + (r1 - r0) * smoothstep(t0, t1, t);
      }
    }
    return knots[knots.length - 1][1];
  };
}

/** 맥동 재질(createPulseMaterial)의 셰이더와 같은 식: 경로 위치 t에서 벽이 바깥으로 부푼 비율(0~1) */
export function pulseShape(t: number, waves: number, time: number): number {
  const w = 0.5 + 0.5 * Math.sin((time * Math.PI * 2) / BEAT_PERIOD - t * waves * Math.PI * 2);
  return w * w;
}

/** 시드 고정 난수 */
export function seeded(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let x = s;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

// ─────────────────────────────────────────────────────────────
//  벽 위의 점과 방향
// ─────────────────────────────────────────────────────────────

export interface WallBasis {
  /** 벽 위의 점(기본 반지름) */
  pos: Vector3;
  /** 바깥쪽(혈관 밖) 방향 */
  out: Vector3;
  /** 진행 방향 */
  tangent: Vector3;
  /** 둘레 방향(각도가 커지는 쪽) */
  around: Vector3;
}

const _p = new Vector3();
const _T = new Vector3();
const _N = new Vector3();
const _B = new Vector3();

/** 중심축 t, 각도 angle(0 = 위, +는 오른쪽)의 벽 기준점. inset만큼 안쪽(혈관 속)으로 당긴다. */
export function wallBasis(L: VesselLayout, t: number, angle: number, inset = 0): WallBasis {
  samplePath(L.frames, t, _p, _T, _N, _B);
  const out = new Vector3()
    .addScaledVector(_N, Math.cos(angle))
    .addScaledVector(_B, Math.sin(angle))
    .normalize();
  const around = new Vector3()
    .addScaledVector(_N, -Math.sin(angle))
    .addScaledVector(_B, Math.cos(angle))
    .normalize();
  const pos = _p.clone().addScaledVector(out, L.radius(t) - inset);
  return { pos, out, tangent: _T.clone(), around };
}

/**
 * 탐사선 경로 기준 위치: t 지점에서 앞(+)으로 ahead, 위로 up, 오른쪽(+)으로 right 만큼 떨어진 점.
 * (탐사선 좌표와 같은 축: 위 = 경로의 N, 오른쪽 = B)
 */
export function pathOffset(L: VesselLayout, t: number, ahead: number, up: number, right: number): V3 {
  const tt = clamp01(t + ahead / L.length);
  samplePath(L.pathFrames, tt, _p, _T, _N, _B);
  _p.addScaledVector(_N, up).addScaledVector(_B, right);
  return [_p.x, _p.y, _p.z];
}

/** 정차 지점에서 탐사선 눈 위치 */
export function eyeAt(L: VesselLayout, t: number): Vector3 {
  const v = pathOffset(L, t, 0, EYE_HEIGHT, 0);
  return new Vector3(v[0], v[1], v[2]);
}

// ─────────────────────────────────────────────────────────────
//  벽 구멍(곁가지 입구·관찰 창)
// ─────────────────────────────────────────────────────────────

/** 혈관 벽의 타원 구멍. a: 길이 방향 반지름, b: 둘레 방향 반지름(월드 단위) */
export interface WallHole {
  t: number;
  angle: number;
  a: number;
  b: number;
}

function wrapAngle(x: number): number {
  let a = x % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  if (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** 경로 위치 t·각도 th가 구멍 안인지 */
export function insideHole(L: VesselLayout, h: WallHole, t: number, th: number, grow = 0): boolean {
  const ds = (t - h.t) * L.length;
  const a = h.a + grow;
  if (Math.abs(ds) > a) return false;
  const arc = wrapAngle(th - h.angle) * L.radius(t);
  const b = h.b + grow;
  return (ds / a) * (ds / a) + (arc / b) * (arc / b) < 1;
}

/**
 * buildVesselGeometry로 만든 벽에서 구멍 안에 들어가는 사각형을 지우고,
 * 구멍 가장자리 정점을 타원 위로 옮겨 테두리가 매끈하게 맞도록 한다.
 * (정점 배치: 고리 i(0..tub) × 둘레 j(0..rad), 각도 0 = 위쪽 N, +는 오른쪽 B — buildVesselGeometry와 같음)
 */
export function punchHoles(geo: BufferGeometry, L: VesselLayout, tub: number, rad: number, holes: WallHole[]): void {
  if (holes.length === 0) return;
  const vCount = (tub + 1) * (rad + 1);
  const kept = new Uint8Array(vCount);
  /** 지운 사각형이 쓰던 정점 → 구멍 번호+1 */
  const cut = new Uint8Array(vCount);
  const idx: number[] = [];
  for (let i = 0; i < tub; i++) {
    const tc = (i + 0.5) / tub;
    for (let j = 0; j < rad; j++) {
      const thc = ((j + 0.5) / rad) * Math.PI * 2;
      let hit = -1;
      for (let k = 0; k < holes.length; k++) {
        if (insideHole(L, holes[k], tc, thc)) {
          hit = k;
          break;
        }
      }
      const a = i * (rad + 1) + j;
      const b = (i + 1) * (rad + 1) + j;
      const c = (i + 1) * (rad + 1) + j + 1;
      const d = i * (rad + 1) + j + 1;
      if (hit >= 0) {
        cut[a] = cut[b] = cut[c] = cut[d] = hit + 1;
        continue;
      }
      kept[a] = kept[b] = kept[c] = kept[d] = 1;
      idx.push(a, b, d, b, c, d);
    }
  }
  geo.setIndex(idx);

  // 가장자리 정점(남은 면과 지운 면이 함께 쓰던 정점)을 타원 위로 옮긴다
  const pos = geo.getAttribute('position');
  const nor = geo.getAttribute('normal');
  const at = geo.getAttribute('aT');
  for (let i = 0; i <= tub; i++) {
    const tv = i / tub;
    for (let j = 0; j <= rad; j++) {
      const v = i * (rad + 1) + j;
      if (!kept[v] || !cut[v]) continue;
      const h = holes[cut[v] - 1];
      const th = (j / rad) * Math.PI * 2;
      const x = ((tv - h.t) * L.length) / h.a;
      const y = (wrapAngle(th - h.angle) * L.radius(tv)) / h.b;
      const rho = Math.hypot(x, y);
      if (rho < 1e-4) continue;
      const t2 = clamp01(h.t + ((x / rho) * h.a) / L.length);
      const R2 = L.radius(t2);
      const th2 = h.angle + ((y / rho) * h.b) / R2;
      samplePath(L.frames, t2, _p, _T, _N, _B);
      const c = Math.cos(th2);
      const s = Math.sin(th2);
      const dx = _N.x * c + _B.x * s;
      const dy = _N.y * c + _B.y * s;
      const dz = _N.z * c + _B.z * s;
      pos.setXYZ(v, _p.x + dx * R2, _p.y + dy * R2, _p.z + dz * R2);
      nor.setXYZ(v, -dx, -dy, -dz);
      if (at) at.setX(v, t2);
    }
  }
  pos.needsUpdate = true;
  nor.needsUpdate = true;
  if (at) at.needsUpdate = true;
}

/** 구멍 가장자리를 따라 벽 위에 놓이는 닫힌 곡선(두꺼운 입구 테두리용) */
export function holeRimCurve(L: VesselLayout, h: WallHole, samples = 32): CatmullRomCurve3 {
  const pts: Vector3[] = [];
  for (let k = 0; k < samples; k++) {
    const phi = (k / samples) * Math.PI * 2;
    const t = clamp01(h.t + (h.a * Math.cos(phi)) / L.length);
    const R = L.radius(t);
    const th = h.angle + (h.b * Math.sin(phi)) / R;
    samplePath(L.frames, t, _p, _T, _N, _B);
    const v = _p.clone().addScaledVector(_N, Math.cos(th) * R).addScaledVector(_B, Math.sin(th) * R);
    pts.push(v);
  }
  return new CatmullRomCurve3(pts, true, 'centripetal');
}

// ─────────────────────────────────────────────────────────────
//  글자 텍스처(외부 글꼴 없이 시스템 한글 글꼴로 그림)
// ─────────────────────────────────────────────────────────────

export const KOREAN_FONT = "'Apple SD Gothic Neo','Noto Sans KR','Malgun Gothic',sans-serif";

export interface LabelOptions {
  width: number;
  height: number;
  fontSize: number;
  color: string;
  /** 배경(둥근 사각형). 없으면 투명 */
  bg?: string;
  /** 글자 테두리 */
  stroke?: string;
  /** 은은한 빛 번짐 */
  glow?: string;
  weight?: number;
}

export function makeLabelTexture(text: string, o: LabelOptions): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = o.width;
  canvas.height = o.height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, o.width, o.height);
    if (o.bg) {
      const r = Math.min(o.height / 2, 28);
      ctx.fillStyle = o.bg;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(2, 2, o.width - 4, o.height - 4, r);
      else ctx.rect(2, 2, o.width - 4, o.height - 4);
      ctx.fill();
    }
    ctx.font = `${o.weight ?? 700} ${o.fontSize}px ${KOREAN_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (o.glow) {
      ctx.shadowColor = o.glow;
      ctx.shadowBlur = o.fontSize * 0.35;
    }
    if (o.stroke) {
      ctx.lineWidth = Math.max(2, o.fontSize * 0.14);
      ctx.strokeStyle = o.stroke;
      ctx.strokeText(text, o.width / 2, o.height / 2 + 1);
    }
    ctx.fillStyle = o.color;
    ctx.fillText(text, o.width / 2, o.height / 2 + 1);
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 2;
  return tex;
}
