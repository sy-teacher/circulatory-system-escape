// R3: 백혈구(적혈구보다 크고 모양이 일정하지 않은 하얀 세포, 여러 갈래의 보라색 핵)가
// 막대 모양 세균을 쫓아가 위족으로 감싸 삼킨다. 약 8초마다 반복. 귀엽고 무섭지 않게.

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  BufferAttribute,
  CapsuleGeometry,
  Color,
  IcosahedronGeometry,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
  type Group,
  type Mesh,
} from 'three';
import { runtime } from '../../runtime';
import { PALETTE } from '../../palette';
import { smoothstep, type V3 } from './common';

export interface WbcChaseProps {
  center: V3;
  /** 장면 회전(+z가 탐사선 쪽) */
  quaternion: Quaternion;
  visible: boolean;
  lowSpec: boolean;
  reduceMotion: boolean;
}

const LOOP = 8;
const BODY_R = 0.72;
const BACT_BASE: V3[] = [
  [0.78, 0.22, 0.1],
  [-0.6, 0.78, -0.2],
  [0.15, -0.8, 0.15],
];
const WBC_HOME = new Vector3(-0.38, -0.12, 0);

export function WbcChase({ center, quaternion, visible, lowSpec, reduceMotion }: WbcChaseProps) {
  const root = useRef<Group>(null);
  const cell = useRef<Group>(null);
  const body = useRef<Mesh>(null);
  const arms = useRef<(Mesh | null)[]>([]);
  const bact = useRef<(Mesh | null)[]>([]);
  const clock = useRef(0);
  const show = useRef(0);

  const bodyGeo = useMemo(() => new IcosahedronGeometry(BODY_R, lowSpec ? 1 : 2), [lowSpec]);
  const basePos = useMemo(() => Float32Array.from((bodyGeo.getAttribute('position') as BufferAttribute).array as Float32Array), [bodyGeo]);
  const armGeo = useMemo(() => new SphereGeometry(1, lowSpec ? 8 : 12, lowSpec ? 6 : 8), [lowSpec]);
  const nucGeo = useMemo(() => new SphereGeometry(1, lowSpec ? 8 : 12, lowSpec ? 6 : 8), [lowSpec]);
  const bactGeo = useMemo(() => new CapsuleGeometry(0.075, 0.3, 3, 8), []);
  const bodyMat = useMemo(
    () =>
      new MeshStandardMaterial({
        color: new Color(PALETTE.wbc),
        emissive: new Color('#fff6ea'),
        emissiveIntensity: 0.2,
        roughness: 0.6,
        flatShading: true,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
      }),
    [],
  );
  useEffect(() => () => bodyGeo.dispose(), [bodyGeo]);
  useEffect(() => () => armGeo.dispose(), [armGeo]);
  useEffect(() => () => nucGeo.dispose(), [nucGeo]);
  useEffect(() => () => bactGeo.dispose(), [bactGeo]);
  useEffect(() => () => bodyMat.dispose(), [bodyMat]);

  const home = useMemo(() => new Vector3(...center), [center]);
  const tmp = useMemo(
    () => ({
      pos: new Vector3(),
      target: new Vector3(),
      dir: new Vector3(),
      perp: new Vector3(),
      base: new Vector3(),
      tip: new Vector3(),
      v: new Vector3(),
      zAxis: new Vector3(0, 0, 1),
    }),
    [],
  );

  useFrame((_, dtRaw) => {
    const g = root.current;
    if (!g) return;
    const dt = Math.min(dtRaw, 0.05);
    const k = reduceMotion ? 0.3 : 1;
    // 나타남·사라짐(탐사선이 아주 가까이 오면 비켜 준다)
    const near = smoothstep(1.6, 2.8, runtime.vehiclePosition.distanceTo(home));
    show.current += ((visible ? near : 0) - show.current) * Math.min(1, dt * 4);
    g.visible = show.current > 0.01;
    g.scale.setScalar(Math.max(0.001, show.current));
    if (!g.visible) return;

    clock.current = (clock.current + dt) % LOOP;
    const tau = clock.current;
    const T = runtime.time;

    // 세균 위치(꿈틀꿈틀)
    const b0 = BACT_BASE[0];
    const flee = 0.15 * smoothstep(0, 3, tau) * (1 - smoothstep(6.6, 7.2, tau));
    tmp.target.set(b0[0] + flee + 0.06 * k * Math.sin(T * 1.7), b0[1] + 0.05 * k * Math.sin(T * 2.3), b0[2]);

    // 백혈구가 다가갔다가 돌아온다
    const approach = smoothstep(0.3, 3.4, tau) * (1 - smoothstep(6.0, 7.8, tau));
    tmp.dir.copy(tmp.target).sub(WBC_HOME).normalize();
    tmp.pos.copy(WBC_HOME).lerp(tmp.v.copy(tmp.target).addScaledVector(tmp.dir, -0.95), approach);
    if (cell.current) cell.current.position.copy(tmp.pos);
    tmp.dir.copy(tmp.target).sub(tmp.pos).normalize();

    const extend = smoothstep(2.4, 3.6, tau) * (1 - smoothstep(5.2, 5.9, tau));
    const wrap = smoothstep(3.6, 4.8, tau);
    const engulf = smoothstep(4.6, 5.8, tau);

    // 몸통: 일정하지 않은 모양으로 꿈틀거리고, 세균 쪽으로 불룩 나온다
    const bm = body.current;
    if (bm) {
      const attr = bm.geometry.getAttribute('position') as BufferAttribute;
      const arr = attr.array as Float32Array;
      const bulge = 0.28 * extend;
      for (let i = 0; i < arr.length; i += 3) {
        const x = basePos[i];
        const y = basePos[i + 1];
        const z = basePos[i + 2];
        const nx = x / BODY_R;
        const ny = y / BODY_R;
        const nz = z / BODY_R;
        const d = Math.max(0, nx * tmp.dir.x + ny * tmp.dir.y + nz * tmp.dir.z);
        const r = 1 + 0.09 * k * Math.sin(nx * 3 + T * 1.3) * Math.sin(ny * 2.5 + T) + 0.05 * Math.sin(nz * 4 + 1.1) + bulge * d * d * d;
        arr[i] = x * r;
        arr[i + 1] = y * r;
        arr[i + 2] = z * r;
      }
      attr.needsUpdate = true;
    }

    // 위족 두 개가 세균 양옆을 감싼다
    tmp.perp.crossVectors(tmp.dir, tmp.zAxis);
    if (tmp.perp.lengthSq() < 1e-4) tmp.perp.set(0, 1, 0);
    tmp.perp.normalize();
    for (let a = 0; a < 2; a++) {
      const m = arms.current[a];
      if (!m) continue;
      const side = a === 0 ? 1 : -1;
      if (extend < 0.01) {
        m.visible = false;
        continue;
      }
      m.visible = true;
      // 시작점: 몸통 표면(세균 쪽에서 양옆으로 비켜난 곳), 끝점: 세균 옆 → 감싸며 세균 앞쪽으로
      tmp.base.copy(tmp.pos).addScaledVector(tmp.dir, BODY_R * 0.75).addScaledVector(tmp.perp, side * BODY_R * 0.45);
      tmp.tip
        .copy(tmp.target)
        .addScaledVector(tmp.perp, side * (0.34 * (1 - wrap) + 0.05))
        .addScaledVector(tmp.dir, 0.18 * wrap);
      tmp.tip.lerp(tmp.base, 1 - extend);
      tmp.v.copy(tmp.tip).sub(tmp.base);
      const len = Math.max(0.05, tmp.v.length());
      m.position.copy(tmp.base).addScaledVector(tmp.v, 0.5);
      m.quaternion.setFromUnitVectors(tmp.zAxis, tmp.v.normalize());
      m.scale.set(0.15 * extend + 0.02, 0.13 * extend + 0.02, len * 0.55);
    }

    // 세균
    for (let i = 0; i < 3; i++) {
      const m = bact.current[i];
      if (!m) continue;
      const bb = BACT_BASE[i];
      if (i === 0) {
        // 몸 속으로 들어가 사라졌다가, 다음 반복 전에 처음 자리에 다시 나타난다
        let s: number;
        if (tau < 7.2) {
          tmp.v.copy(tmp.pos).addScaledVector(tmp.dir, 0.2);
          m.position.copy(tmp.target).lerp(tmp.v, engulf);
          s = (1 - 0.45 * engulf) * (1 - smoothstep(5.8, 6.6, tau));
        } else {
          m.position.copy(tmp.target);
          s = smoothstep(7.2, 8.0, tau);
        }
        m.scale.setScalar(Math.max(0.0001, s));
      } else {
        m.position.set(bb[0] + 0.08 * k * Math.sin(T * 1.5 + i * 2), bb[1] + 0.06 * k * Math.sin(T * 2.1 + i), bb[2]);
        m.scale.setScalar(1);
      }
      m.rotation.set(0, 0, 0.9 + i * 1.1 + 0.5 * k * Math.sin(T * 1.9 + i));
    }
  });

  return (
    <group ref={root} position={center} quaternion={quaternion}>
      <group ref={cell}>
        {/* 여러 갈래로 나뉜 핵 */}
        <group rotation={[0.3, 0.2, 0.4]}>
          {[
            [-0.2, 0.08, 0.02, 0.19],
            [0.0, -0.06, 0.05, 0.21],
            [0.2, 0.07, 0.0, 0.18],
          ].map(([x, y, z, r], i) => (
            <mesh key={i} geometry={nucGeo} position={[x, y, z]} scale={[r, r * 0.85, r * 0.85]}>
              <meshStandardMaterial color={PALETTE.wbcNucleus} emissive={PALETTE.wbcNucleus} emissiveIntensity={0.25} roughness={0.6} flatShading />
            </mesh>
          ))}
        </group>
        <mesh ref={body} geometry={bodyGeo} material={bodyMat} renderOrder={2} />
      </group>
      {[0, 1].map((i) => (
        <mesh
          key={i}
          ref={(m) => {
            arms.current[i] = m;
          }}
          geometry={armGeo}
          material={bodyMat}
          renderOrder={2}
          visible={false}
        />
      ))}
      {[0, 1, 2].map((i) => (
        <mesh
          key={i}
          ref={(m) => {
            bact.current[i] = m;
          }}
          geometry={bactGeo}
        >
          <meshStandardMaterial color={PALETTE.bacteria} emissive={PALETTE.bacteria} emissiveIntensity={0.2} roughness={0.6} flatShading />
        </mesh>
      ))}
    </group>
  );
}
