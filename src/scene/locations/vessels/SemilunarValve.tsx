// 반달 모양 판막(막 3장). 혈관 쪽에서 보면 세 개의 오목한 주머니가 Y자로 맞물려 닫혀 있다.
// 심실이 수축할 때(압력이 더 높을 때)만 조금 열리고, 그 뒤에는 닫혀 거꾸로 흐르지 않게 한다. 판막은 펌프가 아니다.

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Matrix4,
  MeshLambertMaterial,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  type Mesh,
} from 'three';
import { runtime } from '../../runtime';
import { PALETTE } from '../../palette';

export interface SemilunarValveProps {
  center: Vector3;
  /** 혈액이 흘러가는 방향(하류) */
  downstream: Vector3;
  up: Vector3;
  radius: number;
  lowSpec: boolean;
  reduceMotion: boolean;
}

interface CuspData {
  geo: BufferGeometry;
  /** 정점별 (r̂, u, 각도) */
  params: Float32Array;
}

const GAP = 0.035;

function buildCusps(R: number, nu: number, nr: number): CuspData {
  const per = (nu + 1) * (nr + 1);
  const total = per * 3;
  const pos = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  const params = new Float32Array(total * 3);
  const base = new Color(PALETTE.valve);
  const edge = new Color(PALETTE.valveEdge);
  const tmp = new Color();
  const idx: number[] = [];
  const span = (Math.PI * 2) / 3;
  for (let k = 0; k < 3; k++) {
    const phi0 = Math.PI / 2 + k * span + GAP;
    const phi1 = Math.PI / 2 + (k + 1) * span - GAP;
    for (let i = 0; i <= nr; i++) {
      const rh = 0.03 + (0.97 * i) / nr;
      for (let j = 0; j <= nu; j++) {
        const u = j / nu;
        const v = k * per + i * (nu + 1) + j;
        params[v * 3] = rh;
        params[v * 3 + 1] = u;
        params[v * 3 + 2] = phi0 + (phi1 - phi0) * u;
        const e = Math.max(0, 1 - Math.min(u, 1 - u) * 5, 1 - rh * 4);
        tmp.copy(base).lerp(edge, Math.min(1, e));
        col[v * 3] = tmp.r;
        col[v * 3 + 1] = tmp.g;
        col[v * 3 + 2] = tmp.b;
      }
    }
    for (let i = 0; i < nr; i++) {
      for (let j = 0; j < nu; j++) {
        const a = k * per + i * (nu + 1) + j;
        const b = a + nu + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setAttribute('color', new BufferAttribute(col, 3));
  geo.setIndex(idx);
  applyOpening(geo, params, R, 0);
  geo.computeBoundingSphere();
  return { geo, params };
}

/** 열린 정도 o(0 = 닫힘)에 맞춰 정점을 옮긴다. 국소 +z = 상류(심실 쪽) */
function applyOpening(geo: BufferGeometry, params: Float32Array, R: number, o: number): void {
  const attr = geo.getAttribute('position') as BufferAttribute;
  const arr = attr.array as Float32Array;
  const D = R * 0.32;
  for (let v = 0; v < params.length / 3; v++) {
    const rh = params[v * 3];
    const u = params[v * 3 + 1];
    const phi = params[v * 3 + 2];
    // 닫힌 모양: 가장자리(벽에 붙은 곳)와 맞닿는 선은 평평하고, 가운데가 심실 쪽으로 오목
    const zc = D * Math.pow(Math.sin(Math.PI * rh), 0.9) * Math.pow(Math.sin(Math.PI * u), 0.7);
    // 열림: 막이 벽 쪽(바깥·하류)으로 젖혀진다
    const r = R * (1 - (1 - rh) * (1 - 0.7 * o));
    const z = zc * (1 - o) - o * (1 - rh) * R * 0.5;
    arr[v * 3] = Math.cos(phi) * r;
    arr[v * 3 + 1] = Math.sin(phi) * r;
    arr[v * 3 + 2] = z;
  }
  attr.needsUpdate = true;
}

export function SemilunarValve({ center, downstream, up, radius, lowSpec, reduceMotion }: SemilunarValveProps) {
  const mesh = useRef<Mesh>(null);
  const last = useRef(-1);
  const data = useMemo(() => buildCusps(radius, lowSpec ? 7 : 12, lowSpec ? 4 : 7), [radius, lowSpec]);
  const mat = useMemo(() => {
    const o = { vertexColors: true, flatShading: true, side: DoubleSide, emissive: new Color(PALETTE.valve), emissiveIntensity: 0.18 };
    return lowSpec ? new MeshLambertMaterial(o) : new MeshStandardMaterial({ ...o, roughness: 0.55 });
  }, [lowSpec]);
  useEffect(() => () => data.geo.dispose(), [data]);
  useEffect(() => () => mat.dispose(), [mat]);

  const quat = useMemo(() => {
    // 국소 x = 오른쪽, y = 위, z = 상류(−하류) : 오른손 좌표계
    const z = downstream.clone().normalize().negate();
    const y = up.clone().sub(z.clone().multiplyScalar(up.dot(z))).normalize();
    const x = new Vector3().crossVectors(y, z).normalize();
    return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x, y, z));
  }, [downstream, up]);

  useFrame(() => {
    // 장면 공통 박동(심실 수축)에 맞춰 열린다 — 효과음·혈류·압력계와 같은 시계
    const o = runtime.contraction * 0.55 * (reduceMotion ? 0.3 : 1);
    if (Math.abs(o - last.current) < 0.004) return;
    last.current = o;
    applyOpening(data.geo, data.params, radius, o);
  });

  return (
    <group position={center} quaternion={quat}>
      <mesh ref={mesh} geometry={data.geo} material={mat} frustumCulled={false} />
      {/* 판막 너머(심실 안쪽): 열린 틈으로만 보이는 어두운 근육 면 */}
      <mesh position={[0, 0, radius * 0.3]}>
        <circleGeometry args={[radius * 1.15, lowSpec ? 16 : 28]} />
        <meshLambertMaterial color={PALETTE.muscleDeep} emissive={PALETTE.muscle} emissiveIntensity={0.25} side={DoubleSide} />
      </mesh>
      {/* 판막이 붙어 있는 고리 */}
      <mesh>
        <torusGeometry args={[radius * 0.99, radius * 0.045, 6, lowSpec ? 24 : 40]} />
        <meshLambertMaterial color={PALETTE.valveEdge} />
      </mesh>
    </group>
  );
}
