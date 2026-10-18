// R2: 떠 있는 '확대 관찰 창'(연한 노란색 액체 속에 떠 있는 붉은 혈구)과 '분리 캡슐(학습용)'.
// 캡슐: 위쪽 연한 노란 액체층 · 가운데 얇은 흰 띠 · 아래쪽 붉은 층. 성분 이름은 쓰지 않는다.

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { PALETTE } from '../../palette';
import { runtime } from '../../runtime';
import { createRbcGeometry } from '../../shared/cellGeometry';
import { CanvasLabel } from '../../shared/Molecules';

const LIQUID = '#f6dc84';
const BAND = '#f4f0e6';
const HOLO = PALETTE.holo;

interface Floater {
  c: Vector3;
  r: number;
  w: number;
  ph: number;
  tilt: number;
}

export function PlasmaViewer({
  magnifier,
  magnifierQuat,
  radius,
  capsule,
  capsuleQuat,
  focus,
  lowSpec,
  reduceMotion,
}: {
  magnifier: Vector3;
  magnifierQuat: Quaternion;
  radius: number;
  capsule: Vector3;
  capsuleQuat: Quaternion;
  /** 확대 창이 들여다보는 혈관 속 지점(옅은 빛줄기로 잇는다) */
  focus: Vector3;
  lowSpec: boolean;
  reduceMotion: boolean;
}) {
  const bob = useRef<Group>(null);
  const cellsRef = useRef<InstancedMesh>(null);
  const count = lowSpec ? 6 : 10;

  const geo = useMemo(
    () => ({
      liquid: new SphereGeometry(radius * 0.94, lowSpec ? 18 : 28, lowSpec ? 12 : 20),
      glass: new SphereGeometry(radius, lowSpec ? 18 : 28, lowSpec ? 12 : 20),
      rim: new TorusGeometry(radius, 0.06, 8, lowSpec ? 32 : 48),
      handle: new CylinderGeometry(0.07, 0.08, 0.95, 8),
      rbc: createRbcGeometry(0.2, 12),
      // 캡슐
      tube: new CylinderGeometry(0.34, 0.34, 1.6, 18, 1, true),
      tubeBottom: new SphereGeometry(0.34, 18, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      red: new CylinderGeometry(0.3, 0.3, 0.48, 18),
      redBottom: new SphereGeometry(0.3, 18, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      band: new CylinderGeometry(0.3, 0.3, 0.07, 18),
      yellow: new CylinderGeometry(0.3, 0.3, 0.97, 18),
      cap: new CylinderGeometry(0.37, 0.37, 0.14, 18),
    }),
    [radius, lowSpec],
  );
  const mats = useMemo(() => {
    const solid = (color: string, ei = 0.12) =>
      lowSpec
        ? new MeshLambertMaterial({ color, emissive: color, emissiveIntensity: ei })
        : new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: ei, roughness: 0.5, metalness: 0 });
    return {
      liquid: new MeshLambertMaterial({ color: LIQUID, emissive: LIQUID, emissiveIntensity: 0.25, transparent: true, opacity: 0.5, depthWrite: false }),
      glass: new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.1, depthWrite: false, side: DoubleSide }),
      holo: new MeshBasicMaterial({ color: HOLO, toneMapped: false }),
      rbc: solid(PALETTE.rbcRich, 0.15),
      tube: new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.22, depthWrite: false, side: DoubleSide }),
      red: solid(PALETTE.rbcRich, 0.1),
      band: solid(BAND, 0.25),
      yellow: solid(LIQUID, 0.25),
    };
  }, [lowSpec]);
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo]);
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);

  const floaters = useMemo<Floater[]>(
    () =>
      Array.from({ length: count }, (_, i) => {
        const a = i * 2.39996;
        const rr = radius * (0.2 + 0.45 * ((i * 0.37) % 1));
        return {
          c: new Vector3(Math.cos(a) * rr, Math.sin(a) * rr * 0.8, ((i % 3) - 1) * radius * 0.25),
          r: 0.08 + 0.06 * ((i * 0.53) % 1),
          w: 0.35 + 0.25 * ((i * 0.71) % 1),
          ph: a,
          tilt: a * 1.3,
        };
      }),
    [count, radius],
  );
  const tmp = useMemo(() => new Object3D(), []);
  // 혈관 속 지점 → 확대 창으로 이어지는 옅은 빛줄기(꼭짓점이 focus 쪽)
  const beam = useMemo(() => {
    const d = magnifier.clone().sub(focus);
    const len = d.length();
    const q = new Quaternion().setFromUnitVectors(new Vector3(0, -1, 0), d.clone().normalize());
    return { len, q, mid: focus.clone().addScaledVector(d, 0.5) };
  }, [focus, magnifier]);

  useFrame(() => {
    const t = runtime.time;
    const amp = reduceMotion ? 0.25 : 1;
    if (bob.current) bob.current.position.y = Math.sin(t * 1.1) * 0.07 * amp;
    const m = cellsRef.current;
    if (!m) return;
    for (let i = 0; i < floaters.length; i++) {
      const f = floaters[i];
      // 액체 속에서 천천히 떠다님
      const a = t * f.w * amp + f.ph;
      tmp.position.set(f.c.x + Math.cos(a) * f.r, f.c.y + Math.sin(a * 1.3) * f.r, f.c.z + Math.sin(a) * f.r);
      tmp.rotation.set(f.tilt + a * 0.4, a * 0.3, f.tilt * 0.5);
      tmp.updateMatrix();
      m.setMatrixAt(i, tmp.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      {/* 확대 관찰 창 */}
      <group position={magnifier} quaternion={magnifierQuat}>
        <group ref={bob}>
          <instancedMesh ref={cellsRef} args={[geo.rbc, mats.rbc, count]} frustumCulled={false} />
          <mesh geometry={geo.liquid} material={mats.liquid} renderOrder={1} />
          {!lowSpec ? <mesh geometry={geo.glass} material={mats.glass} renderOrder={1} /> : null}
          <mesh geometry={geo.rim} material={mats.holo} />
          <mesh geometry={geo.handle} material={mats.holo} position={[radius * 0.98, -radius * 0.98, 0]} rotation={[0, 0, Math.PI / 4]} />
          <CanvasLabel text="확대 관찰 창" position={[0, -radius - 0.45, 0]} height={0.36} />
        </group>
      </group>
      <mesh position={beam.mid} quaternion={beam.q} renderOrder={3}>
        <coneGeometry args={[radius * 0.85, beam.len, lowSpec ? 12 : 20, 1, true]} />
        <meshBasicMaterial color="#fff6c8" transparent opacity={0.12} depthWrite={false} side={DoubleSide} toneMapped={false} />
      </mesh>
      {/* 분리 캡슐(학습용) */}
      <group position={capsule} quaternion={capsuleQuat}>
        <mesh geometry={geo.red} material={mats.red} position={[0, -0.56, 0]} />
        <mesh geometry={geo.redBottom} material={mats.red} position={[0, -0.8, 0]} />
        <mesh geometry={geo.band} material={mats.band} position={[0, -0.285, 0]} />
        <mesh geometry={geo.yellow} material={mats.yellow} position={[0, 0.235, 0]} />
        <mesh geometry={geo.tube} material={mats.tube} renderOrder={1} />
        <mesh geometry={geo.tubeBottom} material={mats.tube} position={[0, -0.8, 0]} renderOrder={1} />
        <mesh geometry={geo.cap} material={mats.holo} position={[0, 0.87, 0]} />
        <CanvasLabel text="분리 캡슐(학습용)" position={[0, 1.35, 0]} height={0.32} />
      </group>
    </group>
  );
}
