// 곁가지 입구: 벽에 뚫린 구멍 + 벽 두께를 보여 주는 테두리 + 바깥으로 이어지는 곁가지 관(+ 흐르는 적혈구).
// 맥동하는 벽을 따라 테두리와 곁가지도 같이 움직인다.

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  CatmullRomCurve3,
  Color,
  MeshLambertMaterial,
  MeshStandardMaterial,
  TubeGeometry,
  Vector3,
  type Group,
} from 'three';
import { BEAT_PERIOD, runtime } from '../../runtime';
import { BloodCells } from '../../shared/BloodCells';
import { buildVesselGeometry } from '../../shared/vesselGeometry';
import { holeRimCurve, pulseShape, wallBasis, type VesselLayout, type WallHole } from './common';

export interface WallOpeningProps {
  layout: VesselLayout;
  hole: WallHole;
  /** 곁가지가 앞(흐름 방향, +)이나 뒤(−)로 기울어진 정도 */
  forward: number;
  length: number;
  /** 테두리 굵기(= 벽 두께 느낌) */
  rimThickness: number;
  rimColor: string;
  colorA: string;
  colorB: string;
  /** 곁가지 속 적혈구 흐름: out = 본관 → 곁가지, in = 곁가지 → 본관 */
  flow?: 'out' | 'in';
  cellCount?: number;
  cellSpeed?: number;
  o2: 'rich' | 'poor';
  /** 본관 벽 맥동과 같은 값(테두리가 벽을 따라 움직이게) */
  amp: number;
  waves: number;
  lowSpec: boolean;
  reduceMotion: boolean;
  seed?: number;
}

const CELL_RANGE: [number, number] = [0, 1];

export function WallOpening(p: WallOpeningProps) {
  const { layout, hole, forward, length, rimThickness, lowSpec } = p;
  const group = useRef<Group>(null);

  const basis = useMemo(() => wallBasis(layout, hole.t, hole.angle), [layout, hole]);
  const branchR = Math.max(hole.a, hole.b) * 1.12;

  const branchCurve = useMemo(() => {
    const { pos, out, tangent } = basis;
    const P = (o: number, f: number) => pos.clone().addScaledVector(out, o).addScaledVector(tangent, f);
    return new CatmullRomCurve3(
      [
        P(-0.3, 0),
        P(0.35 * length, forward * 0.12 * length),
        P(0.62 * length, forward * 0.42 * length),
        P(0.85 * length, forward * 0.85 * length),
      ],
      false,
      'centripetal',
    );
  }, [basis, length, forward]);

  /** 적혈구가 흐르는 방향으로 놓인 곡선 */
  const cellCurve = useMemo(() => {
    if (p.flow !== 'in') return branchCurve;
    const pts = branchCurve.points.map((v) => v.clone()).reverse();
    // 본관 입구에서 사라진다(본관의 흐름이 이어받음)
    pts[pts.length - 1] = basis.pos.clone().addScaledVector(basis.out, -0.2);
    return new CatmullRomCurve3(pts, false, 'centripetal');
  }, [branchCurve, p.flow, basis]);

  const branchGeo = useMemo(
    () =>
      buildVesselGeometry({
        curve: branchCurve,
        radius: (s) => branchR * (1 - 0.28 * s),
        tubularSegments: lowSpec ? 10 : 18,
        radialSegments: lowSpec ? 12 : 16,
        bumpiness: 0.04,
        colorA: p.colorA,
        colorB: p.colorB,
        rings: 0,
        streaks: 4,
        seed: (p.seed ?? 3) + 11,
      }),
    [branchCurve, branchR, lowSpec, p.colorA, p.colorB, p.seed],
  );

  const rimGeo = useMemo(
    () => new TubeGeometry(holeRimCurve(layout, hole, lowSpec ? 24 : 36), lowSpec ? 28 : 44, rimThickness, lowSpec ? 5 : 7, true),
    [layout, hole, lowSpec, rimThickness],
  );

  const branchMat = useMemo(
    () =>
      lowSpec
        ? new MeshLambertMaterial({ vertexColors: true, flatShading: true })
        : new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8 }),
    [lowSpec],
  );
  const rimMat = useMemo(() => {
    const c = new Color(p.rimColor);
    return lowSpec
      ? new MeshLambertMaterial({ color: c, flatShading: true, emissive: c, emissiveIntensity: 0.12 })
      : new MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.6, emissive: c, emissiveIntensity: 0.12 });
  }, [lowSpec, p.rimColor]);

  useEffect(() => () => branchGeo.dispose(), [branchGeo]);
  useEffect(() => () => rimGeo.dispose(), [rimGeo]);
  useEffect(() => () => branchMat.dispose(), [branchMat]);
  useEffect(() => () => rimMat.dispose(), [rimMat]);

  const offset = useMemo(() => new Vector3(), []);
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const amp = p.amp * (p.reduceMotion ? 0.3 : 1);
    offset.copy(basis.out).multiplyScalar(amp * pulseShape(hole.t, p.waves, runtime.beatPhase * BEAT_PERIOD));
    g.position.copy(offset);
  });

  const count = p.cellCount ?? 0;
  return (
    <group ref={group}>
      <mesh geometry={rimGeo} material={rimMat} />
      <mesh geometry={branchGeo} material={branchMat} />
      {count > 0 && (
        <BloodCells
          curve={cellCurve}
          radius={() => branchR * 0.62}
          count={lowSpec ? Math.ceil(count / 2) : count}
          speed={p.cellSpeed ?? 2}
          o2={p.o2}
          size={0.4}
          tRange={CELL_RANGE}
          clearRadius={0.2}
          seed={(p.seed ?? 3) * 5 + 1}
        />
      )}
    </group>
  );
}
