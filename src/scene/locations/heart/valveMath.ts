// 판막 모양 계산(순수 함수). 열린 모양과 닫힌 모양을 만들어 모프 타깃으로 섞는다.
// 판막은 펌프가 아니다: 양쪽 압력 차이에 따라 열리고 닫혀 역류를 막는다.
//  - 방실판막(삼첨판·이첨판): 심실 이완기에 열림(심방 쪽 압력이 높음), 심실 수축기에 닫힘
//  - 반달판막(폐동맥판·대동맥판): 심실 수축기에 열림, 이완기에 닫힘

import { BufferAttribute, BufferGeometry, Color, Vector3 } from 'three';
import { PALETTE } from '../../palette';
import { angDiff } from './roomModel';

const TAU = Math.PI * 2;

export interface ValveSpec {
  kind: 'av' | 'semilunar';
  /** 판막 막 수(삼첨판 3, 이첨판 2, 반달판막 3) */
  n: number;
  /** 고리(판막이 붙은 곳) 중심과 좌표축. T는 혈액이 흐르는 방향 */
  center: Vector3;
  T: Vector3;
  N: Vector3;
  B: Vector3;
  /** 고리 반지름 */
  R: number;
  /** 막의 길이 */
  len: number;
  /** 첫 막이 시작하는 각도 */
  phi0: number;
}

const _d = new Vector3();
const _rim = new Vector3();
const _co = new Vector3();

function dir(spec: ValveSpec, phi: number, out: Vector3): Vector3 {
  return out.copy(spec.N).multiplyScalar(Math.cos(phi)).addScaledVector(spec.B, Math.sin(phi));
}

/** 닫혔을 때 막의 자유 가장자리가 만나는 선(맞닿는 선) 위의 점 */
function coapt(spec: ValveSpec, k: number, u: number, out: Vector3): Vector3 {
  const span = TAU / spec.n;
  const p0 = spec.phi0 + k * span;
  if (u < 0.5) dir(spec, p0, out).multiplyScalar(spec.R * (1 - 2 * u));
  else dir(spec, p0 + span, out).multiplyScalar(spec.R * (2 * u - 1));
  return out.add(spec.center);
}

/** 막 k의 (u: 가로 0~1, v: 붙은 곳 0 → 자유 가장자리 1) 점. closed: 닫힌 모양 */
export function leafletPoint(spec: ValveSpec, k: number, u: number, v: number, closed: boolean, out: Vector3): Vector3 {
  const span = TAU / spec.n;
  const phi = spec.phi0 + (k + u) * span;
  const su = Math.sin(Math.PI * u);
  const sv = Math.sin(Math.PI * v);
  if (spec.kind === 'av') {
    if (!closed) {
      // 열림: 벽을 따라 혈액이 나가는 쪽으로 늘어진 깔때기
      const r = spec.R * (1 - 0.13 * v - 0.04 * su * sv);
      const z = spec.len * v * (1 - 0.14 * (1 - su));
      return out.copy(spec.center).add(dir(spec, phi, _d).multiplyScalar(r)).addScaledVector(spec.T, z);
    }
    // 닫힘: 가장자리끼리 맞닿고 몸통은 심방 쪽(-T)으로 살짝 부푼다
    _rim.copy(spec.center).add(dir(spec, phi, _d).multiplyScalar(spec.R));
    coapt(spec, k, u, _co).addScaledVector(spec.T, -0.12);
    return out.copy(_rim).lerp(_co, v).addScaledVector(spec.T, -spec.R * 0.22 * sv * su);
  }
  // 반달판막: 붙은 선이 U자 모양(가운데가 가장 깊다)
  const H = spec.len * 0.72;
  const zh = H * (1 - su);
  if (!closed) {
    // 열림: 동맥 벽 쪽으로 눌려 붙는다
    const r = spec.R * (0.95 - 0.07 * sv * su);
    const z = zh + v * (spec.len - zh);
    return out.copy(spec.center).add(dir(spec, phi, _d).multiplyScalar(r)).addScaledVector(spec.T, z);
  }
  // 닫힘: 세 장이 가운데에서 맞닿고, 동맥 쪽으로 열린 주머니(컵) 모양이 된다
  _rim.copy(spec.center).add(dir(spec, phi, _d).multiplyScalar(spec.R)).addScaledVector(spec.T, zh);
  coapt(spec, k, u, _co).addScaledVector(spec.T, spec.len * 0.62);
  return out.copy(_rim).lerp(_co, v).addScaledVector(spec.T, -spec.R * 0.32 * sv * su);
}

/** 각도 phi에 있는 자유 가장자리 점(힘줄 연결용) */
export function edgePointAt(spec: ValveSpec, phi: number, closed: boolean, out: Vector3): Vector3 {
  const span = TAU / spec.n;
  let rel = angDiff(phi, spec.phi0);
  if (rel < 0) rel += TAU;
  const k = Math.min(spec.n - 1, Math.floor(rel / span));
  const u = Math.min(0.95, Math.max(0.05, (rel - k * span) / span));
  return leafletPoint(spec, k, u, 1, closed, out);
}

/** 열린 모양(position) + 닫힌 모양(morph 0) 지오메트리 */
export function buildValveGeometry(spec: ValveSpec, segU: number, segV: number): BufferGeometry {
  const per = (segU + 1) * (segV + 1);
  const total = per * spec.n;
  const open = new Float32Array(total * 3);
  const shut = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  const base = new Color(PALETTE.valve);
  const edge = new Color(PALETTE.valveEdge);
  const c = new Color();
  const p = new Vector3();
  let q = 0;
  for (let k = 0; k < spec.n; k++) {
    for (let i = 0; i <= segV; i++) {
      const v = i / segV;
      for (let j = 0; j <= segU; j++) {
        const u = j / segU;
        leafletPoint(spec, k, u, v, false, p).toArray(open, q * 3);
        leafletPoint(spec, k, u, v, true, p).toArray(shut, q * 3);
        c.copy(base).lerp(edge, Math.min(1, v * v * 1.2 + (k % 2) * 0.08));
        c.toArray(col, q * 3);
        q++;
      }
    }
  }
  const idx: number[] = [];
  for (let k = 0; k < spec.n; k++) {
    const o = k * per;
    for (let i = 0; i < segV; i++) {
      for (let j = 0; j < segU; j++) {
        const a = o + i * (segU + 1) + j;
        const b = a + segU + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(open, 3));
  g.setAttribute('color', new BufferAttribute(col, 3));
  g.morphAttributes.position = [new BufferAttribute(shut, 3)];
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}
