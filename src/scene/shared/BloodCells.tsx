import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Color, InstancedMesh, Matrix4, Object3D, Quaternion, Vector3, type Curve } from 'three';
import { runtime } from '../runtime';
import { PALETTE } from '../palette';
import { createRbcGeometry } from './cellGeometry';
import { computePathFrames, samplePath } from './pathFrames';

export interface BloodCellsProps {
  curve: Curve<Vector3>;
  /** 혈관 안쪽 반지름(t별) */
  radius: (t: number) => number;
  count: number;
  /** 흐름 속도(월드 단위/초) */
  speed: number;
  /** 산소 상태에 따른 적혈구 색(두 경우 모두 붉은색) */
  o2: 'rich' | 'poor';
  /** 적혈구 반지름 */
  size?: number;
  /** 경로 중 혈구가 존재하는 구간 */
  tRange?: [number, number];
  /** 탐사선 주변에서 비워 둘 반지름(혈구가 탐사선과 겹치지 않게) */
  clearRadius?: number;
  /** 모세혈관처럼 한 줄로 지나가며 모양이 살짝 변형됨 */
  singleFile?: boolean;
  /** 동맥처럼 박동에 맞춰 흐름이 빨라짐 */
  pulsatile?: boolean;
  seed?: number;
}

interface Cell {
  s: number; // 경로 길이 위치
  ang: number;
  rf: number; // 반지름 비율 0~1
  axis: Vector3;
  spin: number;
  rot: number;
  sp: number; // 개별 속도 배율
}

const UP = new Vector3(0, 1, 0);

function rand(seed: number) {
  let h = seed * 9973 + 17;
  return () => {
    h = (h * 16807) % 2147483647;
    return (h - 1) / 2147483646;
  };
}

/**
 * 경로를 따라 흐르는 적혈구(InstancedMesh). React 상태를 갱신하지 않고 useFrame에서 행렬만 바꾼다.
 */
export function BloodCells({
  curve,
  radius,
  count,
  speed,
  o2,
  size = 0.45,
  tRange = [0, 1],
  clearRadius = 1.6,
  singleFile = false,
  pulsatile = false,
  seed = 1,
}: BloodCellsProps) {
  const mesh = useRef<InstancedMesh>(null);
  const frames = useMemo(() => computePathFrames(curve, 220), [curve]);
  const geometry = useMemo(() => createRbcGeometry(size, 12), [size]);
  const cells = useMemo<Cell[]>(() => {
    const r = rand(seed);
    const L = frames.length;
    const s0 = tRange[0] * L;
    const s1 = tRange[1] * L;
    return Array.from({ length: count }, () => ({
      s: s0 + r() * (s1 - s0),
      ang: r() * Math.PI * 2,
      rf: Math.sqrt(r()),
      axis: new Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize(),
      spin: 0.3 + r() * 0.9,
      rot: r() * Math.PI * 2,
      sp: 0.8 + r() * 0.4,
    }));
  }, [count, seed, frames, tRange]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  const tmp = useMemo(
    () => ({
      o: new Object3D(),
      p: new Vector3(),
      T: new Vector3(),
      N: new Vector3(),
      B: new Vector3(),
      q: new Quaternion(),
      q2: new Quaternion(),
      m: new Matrix4(),
      vehicleS: 0,
    }),
    [],
  );

  useFrame((_, dtRaw) => {
    const m = mesh.current;
    if (!m) return;
    const dt = Math.min(dtRaw, 0.05);
    const L = frames.length;
    const s0 = tRange[0] * L;
    const s1 = tRange[1] * L;
    const span = Math.max(0.001, s1 - s0);
    const factor = pulsatile ? 0.55 + 1.3 * runtime.contraction : 1;
    const vehicleS = runtime.pathT * L;
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      c.s += speed * factor * c.sp * dt;
      if (c.s > s1) c.s -= span;
      c.rot += c.spin * dt;
      const t = c.s / L;
      samplePath(frames, t, tmp.p, tmp.T, tmp.N, tmp.B);
      const R = radius(t);
      let scale = 1;
      let r: number;
      if (singleFile) {
        r = Math.min(R * 0.25, 0.15) * c.rf;
        // 탐사선 앞뒤 일정 거리 안에서는 서서히 작아지며 숨는다(겹침 방지)
        const d = Math.abs(c.s - vehicleS);
        scale = Math.min(1, Math.max(0, (d - 2.4) / 1.0));
      } else {
        const inner = Math.min(clearRadius, R * 0.6);
        r = inner + (R * 0.86 - inner) * c.rf;
      }
      tmp.p.addScaledVector(tmp.N, Math.cos(c.ang) * r).addScaledVector(tmp.B, Math.sin(c.ang) * r);
      tmp.o.position.copy(tmp.p);
      if (singleFile) {
        // 좁은 길에서 흐름 방향으로 휘어지는 모습(학습용 단순화)
        tmp.o.quaternion.setFromUnitVectors(UP, tmp.T);
        tmp.o.scale.set(0.82 * scale, 1.25 * scale, 0.82 * scale);
      } else {
        tmp.q.setFromAxisAngle(c.axis, c.rot);
        tmp.o.quaternion.copy(tmp.q);
        tmp.o.scale.setScalar(scale);
      }
      tmp.o.updateMatrix();
      m.setMatrixAt(i, tmp.o.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });

  const color = useMemo(() => new Color(o2 === 'rich' ? PALETTE.rbcRich : PALETTE.rbcPoor), [o2]);

  return (
    <instancedMesh ref={mesh} args={[geometry, undefined, count]} frustumCulled={false}>
      <meshStandardMaterial color={color} roughness={0.55} flatShading emissive={color} emissiveIntensity={0.12} />
    </instancedMesh>
  );
}
