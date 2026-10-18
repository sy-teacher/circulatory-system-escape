// R1: 탐사선 옆에 크게 떠 있는 적혈구 모형(가운데가 오목한 붉은 원반, 핵 없음) + 은은한 돋보기 고리.
// 크기는 학습을 위해 키웠다(‘확대 모형’ 표시).

import { Billboard } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Color, DoubleSide, Vector3, type Group, type Mesh } from 'three';
import { runtime } from '../../runtime';
import { PALETTE } from '../../palette';
import { createRbcGeometry } from '../../shared/cellGeometry';
import { makeLabelTexture, smoothstep, type V3 } from './common';

export interface BigRbcProps {
  position: V3;
  lowSpec: boolean;
  reduceMotion: boolean;
}

export function BigRbc({ position, lowSpec, reduceMotion }: BigRbcProps) {
  const root = useRef<Group>(null);
  const cell = useRef<Mesh>(null);
  const geo = useMemo(() => createRbcGeometry(1.0, lowSpec ? 20 : 32), [lowSpec]);
  const label = useMemo(
    () => makeLabelTexture('확대 모형(학습용)', { width: 320, height: 72, fontSize: 30, color: '#fff8f2', bg: 'rgba(60,20,40,0.55)' }),
    [],
  );
  useEffect(() => () => geo.dispose(), [geo]);
  useEffect(() => () => label.dispose(), [label]);
  const color = useMemo(() => new Color(PALETTE.rbcRich), []);
  const home = useMemo(() => new Vector3(...position), [position]);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const k = reduceMotion ? 0.3 : 1;
    const c = cell.current;
    if (c) {
      // 천천히 구르듯 돈다
      c.rotation.x += dt * 0.35 * k;
      c.rotation.z += dt * 0.22 * k;
    }
    const g = root.current;
    if (g) {
      g.position.copy(home);
      g.position.y += Math.sin(runtime.time * 0.9) * 0.12 * k;
      // 탐사선이 아주 가까이 오면 비켜 주듯 작아진다(겹침 방지)
      const d = runtime.vehiclePosition.distanceTo(home);
      g.scale.setScalar(0.05 + 0.95 * smoothstep(1.6, 2.6, d));
    }
  });

  return (
    <group ref={root} position={position}>
      <mesh ref={cell} geometry={geo} rotation={[1.0, 0.3, 0.2]}>
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.18} roughness={0.5} flatShading />
      </mesh>
      <Billboard>
        {/* 돋보기 고리와 손잡이 */}
        <mesh>
          <torusGeometry args={[1.5, 0.05, 6, lowSpec ? 32 : 56]} />
          <meshBasicMaterial color="#fff6e8" transparent opacity={0.75} toneMapped={false} />
        </mesh>
        <mesh>
          <circleGeometry args={[1.48, lowSpec ? 24 : 40]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.06} depthWrite={false} side={DoubleSide} toneMapped={false} />
        </mesh>
        <mesh position={[1.32, -1.32, 0]} rotation={[0, 0, Math.PI / 4]}>
          <boxGeometry args={[0.16, 0.85, 0.08]} />
          <meshBasicMaterial color="#fff6e8" transparent opacity={0.6} toneMapped={false} />
        </mesh>
        <mesh position={[0, -1.85, 0]}>
          <planeGeometry args={[1.6, 0.36]} />
          <meshBasicMaterial map={label} transparent depthWrite={false} toneMapped={false} />
        </mesh>
      </Billboard>
    </group>
  );
}
