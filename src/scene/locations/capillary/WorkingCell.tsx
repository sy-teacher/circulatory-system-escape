// R6: 혈관 옆 세포 하나를 크게, 한쪽을 잘라 낸 모습으로 보여 준다.
// 산소·영양소가 들어가면 세포 안의 작은 알갱이들이 부드럽게 빛나고(깜빡임 없음), 반짝이는 '에너지' 표시가 천천히 떠오른다.
// (세포 크기와 반짝임은 학습용 시각화)

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  CapsuleGeometry,
  CircleGeometry,
  DoubleSide,
  InstancedMesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  Object3D,
  OctahedronGeometry,
  SphereGeometry,
  Vector3,
  type Quaternion,
} from 'three';
import { PALETTE } from '../../palette';
import { runtime } from '../../runtime';

/** 잘라 낸 쪽(눈을 향함, 로컬 +z) 폭: 120° */
const OPEN_FROM = Math.PI / 6;
const OPEN_TO = (5 * Math.PI) / 6;

const FACTORIES: [number, number, number, number][] = [
  // x, y, z, 회전
  [0.55, 0.45, 0.85, 0.6],
  [-0.2, -0.55, 1.05, -0.4],
  [0.75, -0.25, 0.55, 1.2],
  [-0.55, 0.6, 0.7, 2.0],
  [0.15, 0.05, 1.35, -1.0],
];

export function WorkingCell({
  center,
  radius,
  quaternion,
  lowSpec,
  reduceMotion,
}: {
  center: Vector3;
  radius: number;
  quaternion: Quaternion;
  lowSpec: boolean;
  reduceMotion: boolean;
}) {
  const sparkleRef = useRef<InstancedMesh>(null);
  const sparkleCount = lowSpec ? 8 : 16;

  const geo = useMemo(
    () => ({
      // 바깥 막: 앞쪽 120°를 비워 둔 구
      shell: new SphereGeometry(radius, lowSpec ? 18 : 28, lowSpec ? 12 : 18, OPEN_TO, Math.PI * 2 - (OPEN_TO - OPEN_FROM)),
      cut: new CircleGeometry(radius * 0.995, lowSpec ? 14 : 24, -Math.PI / 2, Math.PI),
      nucleus: new SphereGeometry(radius * 0.3, lowSpec ? 10 : 16, lowSpec ? 8 : 12),
      factory: new CapsuleGeometry(0.13, 0.36, 3, 8),
      sparkle: new OctahedronGeometry(0.075, 0),
      glow: new SphereGeometry(radius * 0.55, 14, 10),
    }),
    [radius, lowSpec],
  );
  const mats = useMemo(() => {
    const make = (color: string, emissive: string, ei: number) =>
      lowSpec
        ? new MeshLambertMaterial({ color, emissive, emissiveIntensity: ei, side: DoubleSide, flatShading: true })
        : new MeshStandardMaterial({ color, emissive, emissiveIntensity: ei, roughness: 0.7, metalness: 0, side: DoubleSide, flatShading: true });
    return {
      shell: make(PALETTE.tissue, PALETTE.tissue, 0.12),
      cut: make('#ffd9a6', '#ffcf8a', 0.18),
      nucleus: make(PALETTE.tissueNucleus, PALETTE.tissueNucleus, 0.08),
      factory: make('#ffb347', '#ffc861', 0.35),
      sparkle: new MeshBasicMaterial({ color: '#fff3b0', toneMapped: false }),
      glow: new MeshBasicMaterial({ color: '#ffe7a3', transparent: true, opacity: 0.16, depthWrite: false, toneMapped: false }),
    };
  }, [lowSpec]);
  useEffect(
    () => () => {
      Object.values(geo).forEach((g) => g.dispose());
    },
    [geo],
  );
  useEffect(
    () => () => {
      Object.values(mats).forEach((m) => m.dispose());
    },
    [mats],
  );

  // 반짝이 출발 위치(열린 쪽, 알갱이 근처)
  const sparkles = useMemo(() => {
    const out: { base: Vector3; phase: number; drift: Vector3 }[] = [];
    for (let i = 0; i < sparkleCount; i++) {
      const f = FACTORIES[i % FACTORIES.length];
      const a = i * 2.39996;
      out.push({
        base: new Vector3(f[0] + Math.cos(a) * 0.25, f[1] + Math.sin(a) * 0.25, f[2] + 0.15),
        phase: (i * 0.618) % 1,
        drift: new Vector3(Math.cos(a) * 0.25, 0.55, 0.35),
      });
    }
    return out;
  }, [sparkleCount]);
  const tmp = useMemo(() => new Object3D(), []);

  useFrame(() => {
    const t = runtime.time;
    // 부드러운 밝기 변화(주기 2.8초, 깜빡이지 않음). 움직임 줄이기면 일정하게.
    const glow = reduceMotion ? 0.5 : 0.5 + 0.5 * Math.sin((t * Math.PI * 2) / 2.8);
    mats.factory.emissiveIntensity = 0.3 + 0.35 * glow;
    mats.cut.emissiveIntensity = 0.14 + 0.1 * glow;
    mats.glow.opacity = 0.1 + 0.1 * glow;
    const m = sparkleRef.current;
    if (!m) return;
    for (let i = 0; i < sparkles.length; i++) {
      const s = sparkles[i];
      const k = (((t / 3.2 + s.phase) % 1) + 1) % 1;
      const amp = reduceMotion ? 0.3 : 1;
      tmp.position.copy(s.base).addScaledVector(s.drift, k * amp);
      const sc = reduceMotion ? 0.7 : 0.35 + 0.65 * Math.sin(Math.PI * k);
      tmp.scale.setScalar(sc);
      tmp.rotation.set(0, t * 0.6 * amp + i, 0.4);
      tmp.updateMatrix();
      m.setMatrixAt(i, tmp.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });

  const cutA = Math.PI + OPEN_FROM;
  const cutB = Math.PI + OPEN_TO;
  return (
    <group position={center} quaternion={quaternion}>
      <mesh geometry={geo.shell} material={mats.shell} />
      <mesh geometry={geo.cut} material={mats.cut} rotation={[0, cutA, 0]} />
      <mesh geometry={geo.cut} material={mats.cut} rotation={[0, cutB, 0]} />
      <mesh geometry={geo.nucleus} material={mats.nucleus} position={[-0.45, 0.2, 0.15]} />
      {FACTORIES.map((f, i) => (
        <mesh key={i} geometry={geo.factory} material={mats.factory} position={[f[0], f[1], f[2]]} rotation={[f[3], f[3] * 0.7, 0.3]} />
      ))}
      {!lowSpec ? <mesh geometry={geo.glow} material={mats.glow} position={[0.2, 0, 0.7]} renderOrder={3} /> : null}
      <instancedMesh ref={sparkleRef} args={[geo.sparkle, mats.sparkle, sparkleCount]} frustumCulled={false} />
    </group>
  );
}
