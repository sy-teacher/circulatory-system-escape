// 판막(박동에 맞춰 열리고 닫힘)과 힘줄(꼭지근 → 방실판막 가장자리)
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { CylinderGeometry, InstancedMesh, Mesh, Object3D, Vector3 } from 'three';
import { PALETTE } from '../../palette';
import { runtime } from '../../runtime';
import type { ChamberId, ChordLink, Papillary } from './design';
import { chamberK } from './design';
import { createHeartMaterial } from './materials';
import { smoothstep } from './roomModel';
import { buildValveGeometry, edgePointAt, type ValveSpec } from './valveMath';

/** 판막 상태(0 = 열림, 1 = 닫힘). 힘줄이 같은 값을 읽는다. */
export interface ValveState {
  closed: number;
}

export interface ValveProps {
  spec: ValveSpec;
  state: ValveState;
  /** true면 탐사선이 지나가는 중이므로 열어 둔다 */
  forceOpen: () => boolean;
  lowSpec: boolean;
  reduceMotion: boolean;
}

/** 박동에 따른 목표 상태: 방실판막은 심실 수축기에 닫히고, 반달판막은 수축기에만 열린다 */
export function valveTarget(kind: ValveSpec['kind'], ventricle: number): number {
  return kind === 'av' ? smoothstep(0.02, 0.2, ventricle) : 1 - smoothstep(0.12, 0.4, ventricle);
}

export function Valve({ spec, state, forceOpen, lowSpec, reduceMotion }: ValveProps) {
  const mesh = useRef<Mesh>(null);
  const geometry = useMemo(() => buildValveGeometry(spec, lowSpec ? 6 : 10, lowSpec ? 4 : 7), [spec, lowSpec]);
  const { material } = useMemo(() => createHeartMaterial({ lowSpec, vertexColors: true, selfLit: 0.42, doubleSide: true, roughness: 0.55 }), [lowSpec]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const target = forceOpen() ? 0 : valveTarget(spec.kind, runtime.contraction);
    // 동작 줄이기에서도 판막은 움직이되(학습 내용) 천천히 부드럽게
    const rate = reduceMotion ? 7 : 14;
    state.closed += (target - state.closed) * (1 - Math.exp(-rate * dt));
    const m = mesh.current;
    if (!m) return;
    if (!m.morphTargetInfluences) m.updateMorphTargets();
    if (m.morphTargetInfluences) m.morphTargetInfluences[0] = state.closed;
  });

  return <mesh ref={mesh} geometry={geometry} material={material} frustumCulled={false} />;
}

export interface ChordaeProps {
  chamber: ChamberId;
  spec: ValveSpec;
  state: ValveState;
  papillary: Papillary[];
  links: ChordLink[];
  center: Vector3;
  lowSpec: boolean;
  reduceMotion: boolean;
}

/** 힘줄: 하얀 가는 끈. 꼭지근 끝(벽과 함께 수축)과 판막 가장자리(열림·닫힘)를 잇는다. */
export function Chordae({ chamber, spec, state, papillary, links, center, lowSpec, reduceMotion }: ChordaeProps) {
  const mesh = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => {
    const g = new CylinderGeometry(1, 1, 1, lowSpec ? 4 : 5, 1, true);
    g.translate(0, 0.5, 0);
    return g;
  }, [lowSpec]);
  const { material } = useMemo(() => createHeartMaterial({ lowSpec, color: PALETTE.chordae, selfLit: 0.55 }), [lowSpec]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  const ends = useMemo(
    () =>
      links.map((l) => ({
        tip: papillary[l.tip].tip,
        open: edgePointAt(spec, l.phi, false, new Vector3()),
        shut: edgePointAt(spec, l.phi, true, new Vector3()),
      })),
    [links, papillary, spec],
  );
  const tmp = useMemo(() => ({ a: new Vector3(), b: new Vector3(), d: new Vector3(), up: new Vector3(0, 1, 0), o: new Object3D() }), []);

  useFrame(() => {
    const m = mesh.current;
    if (!m) return;
    const k = chamberK(chamber, runtime.contraction, runtime.atrialContraction, reduceMotion);
    for (let i = 0; i < ends.length; i++) {
      const e = ends[i];
      tmp.a.copy(e.tip).sub(center).multiplyScalar(1 - k).add(center);
      tmp.b.copy(e.open).lerp(e.shut, state.closed);
      tmp.d.copy(tmp.b).sub(tmp.a);
      const len = Math.max(0.01, tmp.d.length());
      tmp.o.position.copy(tmp.a);
      tmp.o.quaternion.setFromUnitVectors(tmp.up, tmp.d.multiplyScalar(1 / len));
      tmp.o.scale.set(0.045, len, 0.045);
      tmp.o.updateMatrix();
      m.setMatrixAt(i, tmp.o.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });

  return <instancedMesh ref={mesh} args={[geometry, material, ends.length]} frustumCulled={false} />;
}
