// 흐름 표시 선(학습용 시각화): 혈관을 따라 놓인 가는 선 위로 작은 화살표가 일정한 속도로 천천히 움직인다.
// 박동에 맞춰 출렁이지 않고 고르게 흐르는 느낌을 보여 준다.

import { Billboard } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  CatmullRomCurve3,
  ConeGeometry,
  MeshBasicMaterial,
  Object3D,
  TubeGeometry,
  Vector3,
  type InstancedMesh,
} from 'three';
import { pointAround } from '../../shared/pathFrames';
import { makeLabelTexture, type V3, type VesselLayout } from './common';

export interface FlowLine {
  angle: number;
  /** 반지름 대비 거리(0~1) */
  rf: number;
}

export interface FlowMarkersProps {
  layout: VesselLayout;
  range: [number, number];
  lines: FlowLine[];
  /** 화살표 속도(월드 단위/초) */
  speed: number;
  labelAt: V3;
  lowSpec: boolean;
  reduceMotion: boolean;
}

const PER_LINE = 5;

export function FlowMarkers({ layout, range, lines, speed, labelAt, lowSpec, reduceMotion }: FlowMarkersProps) {
  const used = useMemo(() => (lowSpec ? lines.slice(0, 3) : lines), [lines, lowSpec]);
  const curves = useMemo(
    () =>
      used.map((ln) => {
        const pts: Vector3[] = [];
        const n = 14;
        for (let i = 0; i <= n; i++) {
          const t = range[0] + ((range[1] - range[0]) * i) / n;
          pts.push(pointAround(layout.frames, t, ln.angle, ln.rf * layout.radius(t), new Vector3()));
        }
        return new CatmullRomCurve3(pts, false, 'centripetal');
      }),
    [used, layout, range],
  );
  const lineGeos = useMemo(() => curves.map((c) => new TubeGeometry(c, lowSpec ? 30 : 60, 0.035, 4, false)), [curves, lowSpec]);
  const lineMat = useMemo(() => new MeshBasicMaterial({ color: '#fff0f3', transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false }), []);
  const coneGeo = useMemo(() => new ConeGeometry(0.13, 0.36, 6), []);
  const label = useMemo(
    () => makeLabelTexture('흐름 표시(학습용)', { width: 320, height: 72, fontSize: 30, color: '#fff8f2', bg: 'rgba(60,20,40,0.55)' }),
    [],
  );
  useEffect(() => () => lineGeos.forEach((g) => g.dispose()), [lineGeos]);
  useEffect(() => () => lineMat.dispose(), [lineMat]);
  useEffect(() => () => coneGeo.dispose(), [coneGeo]);
  useEffect(() => () => label.dispose(), [label]);

  const lengths = useMemo(() => curves.map((c) => c.getLength()), [curves]);
  // 화살표별 선 위 위치(0~1). 선마다 출발 위치를 조금씩 엇갈리게 둔다.
  const us = useMemo(
    () => Array.from({ length: curves.length * PER_LINE }, (_, i) => ((i % PER_LINE) + ((Math.floor(i / PER_LINE) * 0.37) % 1)) / PER_LINE),
    [curves],
  );
  const mesh = useRef<InstancedMesh>(null);
  const tmp = useMemo(() => ({ o: new Object3D(), p: new Vector3(), d: new Vector3(), up: new Vector3(0, 1, 0) }), []);

  useFrame((_, dtRaw) => {
    const m = mesh.current;
    if (!m) return;
    const dt = Math.min(dtRaw, 0.05);
    const v = speed * (reduceMotion ? 0.5 : 1);
    for (let i = 0; i < us.length; i++) {
      const li = Math.floor(i / PER_LINE);
      const c = curves[li];
      let u = us[i] + (v * dt) / lengths[li];
      if (u > 1) u -= 1;
      us[i] = u;
      c.getPointAt(u, tmp.p);
      c.getTangentAt(u, tmp.d);
      tmp.o.position.copy(tmp.p);
      tmp.o.quaternion.setFromUnitVectors(tmp.up, tmp.d);
      // 양 끝에서는 작아졌다가 사라진다
      const s = Math.min(1, u * 8, (1 - u) * 8);
      tmp.o.scale.setScalar(Math.max(0.0001, s));
      tmp.o.updateMatrix();
      m.setMatrixAt(i, tmp.o.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      {lineGeos.map((g, i) => (
        <mesh key={i} geometry={g} material={lineMat} />
      ))}
      <instancedMesh ref={mesh} args={[coneGeo, undefined, curves.length * PER_LINE]} frustumCulled={false}>
        <meshBasicMaterial color="#fffaf0" transparent opacity={0.85} toneMapped={false} />
      </instancedMesh>
      <Billboard position={labelAt}>
        <mesh>
          <planeGeometry args={[1.6, 0.36]} />
          <meshBasicMaterial map={label} transparent depthWrite={false} toneMapped={false} />
        </mesh>
      </Billboard>
    </group>
  );
}
