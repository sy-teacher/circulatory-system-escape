import { Matrix4, Quaternion, Vector3, type Curve } from 'three';

/**
 * 경로를 일정 간격으로 샘플링한 좌표계. 탐사선·혈구·혈관 벽이 모두 같은 좌표계를 쓴다.
 * T: 진행 방향, N: 위쪽, B: 오른쪽(= T × N)
 */
export interface PathFrames {
  count: number;
  length: number;
  points: Vector3[];
  tangents: Vector3[];
  normals: Vector3[];
  binormals: Vector3[];
}

const WORLD_UP = new Vector3(0, 1, 0);

export function computePathFrames(curve: Curve<Vector3>, samples = 256, up: Vector3 = WORLD_UP): PathFrames {
  const points: Vector3[] = [];
  const tangents: Vector3[] = [];
  const normals: Vector3[] = [];
  const binormals: Vector3[] = [];
  let prevN: Vector3 | null = null;
  for (let i = 0; i < samples; i++) {
    const t = i / (samples - 1);
    const p = curve.getPointAt(t);
    const T = curve.getTangentAt(t).normalize();
    // 세계의 위쪽을 진행 방향에 수직으로 투영(뒤틀림이 적은 '위쪽')
    let N = up.clone().sub(T.clone().multiplyScalar(up.dot(T)));
    if (N.lengthSq() < 0.04 && prevN) {
      N = prevN.clone().sub(T.clone().multiplyScalar(prevN.dot(T)));
    }
    N.normalize();
    const B = new Vector3().crossVectors(T, N).normalize();
    points.push(p);
    tangents.push(T);
    normals.push(N);
    binormals.push(B);
    prevN = N;
  }
  return { count: samples, length: curve.getLength(), points, tangents, normals, binormals };
}

const _a = new Vector3();

/** t(0~1) 위치의 점과 좌표축을 보간해 out에 넣는다 */
export function samplePath(
  f: PathFrames,
  t: number,
  outPos: Vector3,
  outT?: Vector3,
  outN?: Vector3,
  outB?: Vector3,
): void {
  const x = Math.min(Math.max(t, 0), 1) * (f.count - 1);
  const i = Math.min(Math.floor(x), f.count - 2);
  const k = x - i;
  outPos.copy(f.points[i]).lerp(f.points[i + 1], k);
  if (outT) outT.copy(f.tangents[i]).lerp(f.tangents[i + 1], k).normalize();
  if (outN) outN.copy(f.normals[i]).lerp(f.normals[i + 1], k).normalize();
  if (outB) outB.copy(f.binormals[i]).lerp(f.binormals[i + 1], k).normalize();
}

const _m = new Matrix4();
const _T = new Vector3();
const _N = new Vector3();
const _B = new Vector3();

/**
 * 경로 위 t 지점의 자세. 물체의 -z가 진행 방향, +y가 위쪽, +x가 오른쪽이 되도록 한다.
 * lateral: 오른쪽(+)/왼쪽(-) 이동 거리, lift: 위쪽 이동 거리
 */
export function poseOnPath(f: PathFrames, t: number, lateral: number, lift: number, outPos: Vector3, outQuat: Quaternion): void {
  samplePath(f, t, outPos, _T, _N, _B);
  outPos.addScaledVector(_B, lateral).addScaledVector(_N, lift);
  _a.copy(_T).negate();
  _m.makeBasis(_B, _N, _a);
  outQuat.setFromRotationMatrix(_m);
}

/** 경로 위 t 지점에서 각도 angle(0 = 위쪽, +는 오른쪽으로 회전), 거리 r 떨어진 점 */
export function pointAround(f: PathFrames, t: number, angle: number, r: number, out: Vector3): Vector3 {
  samplePath(f, t, out, _T, _N, _B);
  return out.addScaledVector(_N, Math.cos(angle) * r).addScaledVector(_B, Math.sin(angle) * r);
}
