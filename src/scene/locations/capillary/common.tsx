// 두 모세혈관 공간(온몸·폐)이 함께 쓰는 도구: 경로 만들기, 좌표 계산, 얇은 혈관 벽.

import { useEffect, useMemo } from 'react';
import { CatmullRomCurve3, Matrix4, Quaternion, Vector3, type BufferGeometry, type Curve } from 'three';
import { PALETTE } from '../../palette';
import { computePathFrames, samplePath, type PathFrames } from '../../shared/pathFrames';
import { usePulseMaterial } from '../../shared/usePulse';
import { buildVesselGeometry } from '../../shared/vesselGeometry';

/** 탐사선 바닥 중심(경로)에서 혈관 중심축까지의 높이. 눈높이(0.95)는 축보다 0.35 위. */
export const AXIS_LIFT = 0.6;
/** 모세혈관 안쪽 반지름(학습용으로 키운 크기) */
export const CAP_RADIUS = 1.55;
/** 벽의 울퉁불퉁함까지 고려한 바깥쪽 한계 */
export const CAP_OUTER = CAP_RADIUS * 1.06 + 0.02;

// ─────────────────────────────────────────────
//  거북이 방식 경로: 직선·원호를 이어 붙여 접선이 끊기지 않는 경로를 만든다.
//  heading ψ: -z에서 왼쪽으로 돈 각도(라디안). 진행 방향 h = (-sinψ, 0, -cosψ)
// ─────────────────────────────────────────────

export type TurtleSeg =
  | { kind: 'line'; len: number; rise?: number }
  /** angle: 도(°), +는 왼쪽으로 돌기, -는 오른쪽으로 돌기 */
  | { kind: 'arc'; radius: number; angle: number; rise?: number };

export interface TurtleResult {
  points: Vector3[];
  /** 원호 구간마다의 중심(입력 순서대로, 직선은 null) */
  centers: (Vector3 | null)[];
  /** 각 구간이 시작하는 경로 길이 위치 */
  segStart: number[];
  length: number;
}

const heading = (psi: number, out: Vector3) => out.set(-Math.sin(psi), 0, -Math.cos(psi));
const leftOf = (psi: number, out: Vector3) => out.set(-Math.cos(psi), 0, Math.sin(psi));

export function turtlePath(start: Vector3, segs: TurtleSeg[], step = 0.5): TurtleResult {
  const pos = start.clone();
  let psi = 0;
  let s = 0;
  const points: Vector3[] = [pos.clone()];
  const centers: (Vector3 | null)[] = [];
  const segStart: number[] = [];
  const h = new Vector3();
  const l = new Vector3();
  for (const seg of segs) {
    segStart.push(s);
    const rise = seg.rise ?? 0;
    if (seg.kind === 'line') {
      const n = Math.max(1, Math.ceil(seg.len / step));
      heading(psi, h);
      const y0 = pos.y;
      const p0 = pos.clone();
      for (let i = 1; i <= n; i++) {
        const k = i / n;
        // 높이는 부드럽게(양 끝 기울기 0) 바꾼다
        const e = k * k * (3 - 2 * k);
        pos.copy(p0).addScaledVector(h, seg.len * k);
        pos.y = y0 + rise * e;
        points.push(pos.clone());
      }
      s += seg.len;
      centers.push(null);
    } else {
      const sign = Math.sign(seg.angle) || 1;
      const total = (Math.abs(seg.angle) * Math.PI) / 180;
      const len = seg.radius * total;
      const n = Math.max(2, Math.ceil(len / step));
      // 중심: 왼쪽으로 돌면 왼쪽, 오른쪽으로 돌면 오른쪽
      leftOf(psi, l);
      const c = pos.clone().addScaledVector(l, sign * seg.radius);
      const y0 = pos.y;
      const psi0 = psi;
      for (let i = 1; i <= n; i++) {
        const k = i / n;
        const e = k * k * (3 - 2 * k);
        const ps = psi0 + sign * total * k;
        leftOf(ps, l);
        pos.copy(c).addScaledVector(l, -sign * seg.radius);
        pos.y = y0 + rise * e;
        points.push(pos.clone());
      }
      psi = psi0 + sign * total;
      s += len;
      centers.push(new Vector3(c.x, y0, c.z));
    }
  }
  return { points, centers, segStart, length: s };
}

/** 혈관 중심축 곡선과 탐사선 경로(축보다 AXIS_LIFT 아래) */
export function makeCurves(axisPoints: Vector3[]): { axis: CatmullRomCurve3; path: CatmullRomCurve3; length: number } {
  const axis = new CatmullRomCurve3(axisPoints, false, 'centripetal');
  axis.arcLengthDivisions = 1200;
  const path = new CatmullRomCurve3(
    axisPoints.map((p) => new Vector3(p.x, p.y - AXIS_LIFT, p.z)),
    false,
    'centripetal',
  );
  path.arcLengthDivisions = 1200;
  return { axis, path, length: axis.getLength() };
}

/** 축 좌표계에서 위치 계산: 길이 위치 s, 각도(도, 0 = 위, +는 오른쪽), 축에서의 거리 rho */
export function makeAround(frames: PathFrames) {
  const T = new Vector3();
  const N = new Vector3();
  const B = new Vector3();
  return (s: number, angleDeg: number, rho: number, out = new Vector3()): Vector3 => {
    const t = s / frames.length;
    samplePath(frames, t, out, T, N, B);
    const a = (angleDeg * Math.PI) / 180;
    return out.addScaledVector(N, Math.cos(a) * rho).addScaledVector(B, Math.sin(a) * rho);
  };
}

/** 정지 지점 s의 좌표계 기준 위치: 앞(fwd)·오른쪽(right)·위(up) 거리 */
export function makeLocal(frames: PathFrames) {
  const T = new Vector3();
  const N = new Vector3();
  const B = new Vector3();
  return (s: number, fwd: number, right: number, up: number, out = new Vector3()): Vector3 => {
    samplePath(frames, s / frames.length, out, T, N, B);
    return out.addScaledVector(T, fwd).addScaledVector(B, right).addScaledVector(N, up);
  };
}

/** 경로 길이 위치 s의 진행 방향 */
export function makeTangent(frames: PathFrames) {
  const p = new Vector3();
  return (s: number, out = new Vector3()): Vector3 => {
    samplePath(frames, s / frames.length, p, out);
    return out;
  };
}

export function axisFrames(axis: Curve<Vector3>, samples = 480): PathFrames {
  return computePathFrames(axis, samples);
}

/** 눈 위치(정지 지점 t에서 경로 위 0.95) */
export function eyeAt(path: Curve<Vector3>, t: number): Vector3 {
  return path.getPointAt(t).add(new Vector3(0, 0.95, 0));
}

/** +z가 target을 향하는 회전(평면 표지판이 눈을 바라보게) */
export function facing(from: Vector3, target: Vector3): Quaternion {
  const m = new Matrix4().lookAt(target, from, new Vector3(0, 1, 0));
  return new Quaternion().setFromRotationMatrix(m);
}

/** 결정적 난수(같은 배치가 매번 나오도록) */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const smooth = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

/** 점 p에서 선분 ab까지의 거리 */
export function distToSegment(p: Vector3, a: Vector3, b: Vector3): number {
  const ab = b.clone().sub(a);
  const k = Math.min(1, Math.max(0, p.clone().sub(a).dot(ab) / Math.max(1e-6, ab.lengthSq())));
  return a.clone().addScaledVector(ab, k).distanceTo(p);
}

export interface TubeSpec {
  curve: Curve<Vector3>;
  radius: (t: number) => number;
  tubular: number;
  seed: number;
}

/**
 * 아주 얇고 반투명한 모세혈관 벽(+ 갈라져 나가는 가지 혈관들). 같은 맥동 재질을 함께 쓴다.
 * 양면으로 그려 안에서도 밖에서도 보인다. 투명 물체 중 나중에 그려지도록 renderOrder 2.
 */
export function ThinVessels({
  tubes,
  lowSpec,
  reduceMotion,
  opacity = 0.35,
  colorA = PALETTE.capillaryWall,
  colorB = '#ff9aa8',
}: {
  tubes: TubeSpec[];
  lowSpec: boolean;
  reduceMotion: boolean;
  opacity?: number;
  colorA?: string;
  colorB?: string;
}) {
  const geometries = useMemo<BufferGeometry[]>(
    () =>
      tubes.map((tb) =>
        buildVesselGeometry({
          curve: tb.curve,
          radius: tb.radius,
          tubularSegments: lowSpec ? Math.ceil(tb.tubular * 0.6) : tb.tubular,
          radialSegments: lowSpec ? 12 : 18,
          bumpiness: 0.05,
          colorA,
          colorB,
          streaks: 5,
          seed: tb.seed,
        }),
      ),
    [tubes, lowSpec, colorA, colorB],
  );
  useEffect(() => () => geometries.forEach((g) => g.dispose()), [geometries]);
  const material = usePulseMaterial({
    lowSpec,
    transparent: true,
    opacity,
    doubleSide: true,
    emissive: '#ffd0d6',
    emissiveIntensity: 0.18,
    amp: 0.025,
    waves: 2,
    reduceMotion,
  });
  return (
    <group>
      {geometries.map((g, i) => (
        <mesh key={i} geometry={g} material={material} renderOrder={2} frustumCulled={false} />
      ))}
    </group>
  );
}
