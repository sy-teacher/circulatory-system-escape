// R5: 탐사선 앞 홀로그램 — 혈관 단면 모형 3개(A·B·C, 이름 없음).
// A: 여러 겹의 두껍고 탄력 있는 벽 / B: 비교적 얇은 벽 + 안쪽의 판막 한 쌍 / C: 세포 한 층 두께의 벽 + 적혈구 1개.
// 적혈구는 홀로그램 안에서도 붉은색으로 그린다(혈액을 파랗게 표현하지 않음).

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { AdditiveBlending, Color, DoubleSide, Quaternion, Shape, ShapeGeometry, Vector3, type Group } from 'three';
import { runtime } from '../../runtime';
import { PALETTE } from '../../palette';
import { createRbcGeometry } from '../../shared/cellGeometry';
import { makeLabelTexture, smoothstep, type V3 } from './common';

export interface VesselHologramProps {
  position: V3;
  quaternion: Quaternion;
  visible: boolean;
  lowSpec: boolean;
  reduceMotion: boolean;
}

const HOLO = PALETTE.holo;

function HoloRing({ inner, outer, opacity, seg }: { inner: number; outer: number; opacity: number; seg: number }) {
  return (
    <mesh>
      <ringGeometry args={[inner, outer, seg]} />
      <meshBasicMaterial color={HOLO} transparent opacity={opacity} blending={AdditiveBlending} depthWrite={false} side={DoubleSide} toneMapped={false} />
    </mesh>
  );
}

/** 정맥 판막 한 장(왼쪽 벽에 붙은 얇은 막) */
function flapShape(): Shape {
  const s = new Shape();
  s.moveTo(-0.5, 0.3);
  s.quadraticCurveTo(-0.12, 0.16, -0.03, 0.0);
  s.quadraticCurveTo(-0.12, -0.16, -0.5, -0.3);
  s.quadraticCurveTo(-0.3, 0, -0.5, 0.3);
  return s;
}

export function VesselHologram({ position, quaternion, visible, lowSpec, reduceMotion }: VesselHologramProps) {
  const root = useRef<Group>(null);
  const scan = useRef<Group>(null);
  const show = useRef(0);
  const seg = lowSpec ? 28 : 48;

  const title = useMemo(
    () => makeLabelTexture('혈관 단면 비교(학습용 모형)', { width: 768, height: 96, fontSize: 52, color: '#e9feff', glow: HOLO }),
    [],
  );
  const letters = useMemo(
    () => ['A', 'B', 'C'].map((s) => makeLabelTexture(s, { width: 96, height: 96, fontSize: 72, color: '#e9feff', glow: HOLO, weight: 800 })),
    [],
  );
  const flapGeo = useMemo(() => new ShapeGeometry(flapShape(), 8), []);
  const rbcGeo = useMemo(() => createRbcGeometry(0.17, 16), []);
  useEffect(() => () => title.dispose(), [title]);
  useEffect(() => () => letters.forEach((l) => l.dispose()), [letters]);
  useEffect(() => () => flapGeo.dispose(), [flapGeo]);
  useEffect(() => () => rbcGeo.dispose(), [rbcGeo]);
  const rbcColor = useMemo(() => new Color(PALETTE.rbcRich), []);
  const home = useMemo(() => new Vector3(...position), [position]);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const g = root.current;
    if (!g) return;
    // 탐사선이 바로 앞까지 오면 겹치지 않게 사라진다
    const near = smoothstep(1.4, 2.4, runtime.vehiclePosition.distanceTo(home));
    const target = visible ? near : 0;
    show.current += (target - show.current) * Math.min(1, dt * 4);
    const s = show.current;
    g.visible = s > 0.01;
    g.scale.setScalar(Math.max(0.001, s));
    g.position.copy(home);
    if (!reduceMotion) g.position.y += Math.sin(runtime.time * 1.2) * 0.05;
    const sc = scan.current;
    if (sc) {
      sc.visible = !reduceMotion;
      sc.position.y = -1.2 + ((runtime.time * 0.5) % 1) * 2.4;
    }
  });

  return (
    <group ref={root} position={position} quaternion={quaternion}>
      {/* 바탕 판과 테두리 */}
      <mesh position={[0, 0, -0.02]}>
        <planeGeometry args={[4.6, 2.7]} />
        <meshBasicMaterial color="#123a46" transparent opacity={0.55} depthWrite={false} side={DoubleSide} toneMapped={false} />
      </mesh>
      {[
        [0, 1.35, 4.6, 0.035],
        [0, -1.35, 4.6, 0.035],
        [-2.3, 0, 0.035, 2.7],
        [2.3, 0, 0.035, 2.7],
      ].map(([x, y, w, h], i) => (
        <mesh key={i} position={[x, y, 0]}>
          <planeGeometry args={[w, h]} />
          <meshBasicMaterial color={HOLO} transparent opacity={0.9} blending={AdditiveBlending} depthWrite={false} side={DoubleSide} toneMapped={false} />
        </mesh>
      ))}
      <group ref={scan}>
        <mesh>
          <planeGeometry args={[4.5, 0.05]} />
          <meshBasicMaterial color={HOLO} transparent opacity={0.25} blending={AdditiveBlending} depthWrite={false} side={DoubleSide} toneMapped={false} />
        </mesh>
      </group>
      <mesh position={[0, 1.02, 0.01]}>
        <planeGeometry args={[3.8, 0.475]} />
        <meshBasicMaterial map={title} transparent depthWrite={false} side={DoubleSide} toneMapped={false} />
      </mesh>

      {/* A: 여러 겹의 두꺼운 벽 */}
      <group position={[-1.45, -0.05, 0]}>
        <HoloRing inner={0.26} outer={0.31} opacity={0.95} seg={seg} />
        <HoloRing inner={0.33} outer={0.4} opacity={0.6} seg={seg} />
        <HoloRing inner={0.42} outer={0.49} opacity={0.75} seg={seg} />
        <HoloRing inner={0.51} outer={0.57} opacity={0.6} seg={seg} />
        <HoloRing inner={0.59} outer={0.65} opacity={0.45} seg={seg} />
      </group>

      {/* B: 비교적 얇은 벽 + 판막 한 쌍 */}
      <group position={[0, -0.05, 0]} scale={[1, 0.86, 1]}>
        <HoloRing inner={0.5} outer={0.57} opacity={0.9} seg={seg} />
        <HoloRing inner={0.59} outer={0.61} opacity={0.4} seg={seg} />
        <mesh geometry={flapGeo}>
          <meshBasicMaterial color={HOLO} transparent opacity={0.55} blending={AdditiveBlending} depthWrite={false} side={DoubleSide} toneMapped={false} />
        </mesh>
        <mesh geometry={flapGeo} scale={[-1, 1, 1]}>
          <meshBasicMaterial color={HOLO} transparent opacity={0.55} blending={AdditiveBlending} depthWrite={false} side={DoubleSide} toneMapped={false} />
        </mesh>
      </group>

      {/* C: 세포 한 층 두께의 아주 얇은 벽 + 적혈구 한 개 */}
      <group position={[1.45, -0.05, 0]}>
        <HoloRing inner={0.27} outer={0.295} opacity={0.95} seg={seg} />
        {[0.6, 2.7, 4.6].map((a, i) => (
          <mesh key={i} position={[Math.cos(a) * 0.283, Math.sin(a) * 0.283, 0.005]} rotation={[0, 0, a + Math.PI / 2]} scale={[1, 0.4, 1]}>
            <circleGeometry args={[0.06, 10]} />
            <meshBasicMaterial color={HOLO} transparent opacity={0.9} blending={AdditiveBlending} depthWrite={false} side={DoubleSide} toneMapped={false} />
          </mesh>
        ))}
        <mesh geometry={rbcGeo} rotation={[Math.PI / 2 - 0.35, 0, 0.2]} position={[0, 0, 0.05]}>
          <meshStandardMaterial color={rbcColor} emissive={rbcColor} emissiveIntensity={0.35} roughness={0.5} flatShading />
        </mesh>
      </group>

      {/* 기호 A·B·C */}
      {letters.map((tex, i) => (
        <mesh key={i} position={[-1.45 + i * 1.45, -0.98, 0.01]}>
          <planeGeometry args={[0.42, 0.42]} />
          <meshBasicMaterial map={tex} transparent depthWrite={false} side={DoubleSide} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}
