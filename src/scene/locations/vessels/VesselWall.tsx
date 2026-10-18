// 굵은 혈관의 벽: buildVesselGeometry + 맥동 재질. 곁가지 입구 자리는 구멍을 뚫는다.
// 입구 뒤쪽에 짧은 '뿌리' 관을 덧대어 판막을 감쌀 수 있다.

import { useEffect, useMemo } from 'react';
import { LineCurve3 } from 'three';
import { usePulseMaterial } from '../../shared/usePulse';
import { buildVesselGeometry } from '../../shared/vesselGeometry';
import { punchHoles, type VesselLayout, type WallHole } from './common';

export interface VesselWallProps {
  layout: VesselLayout;
  colorA: string;
  colorB: string;
  rings?: number;
  streaks?: number;
  bumpiness?: number;
  seed?: number;
  holes?: WallHole[];
  /** 맥동 세기(월드 단위)와 경로를 따라 퍼지는 파장 수(정수: 뿌리 관과 이음매가 맞도록) */
  amp: number;
  waves: number;
  /** [길이 방향, 둘레 방향] 분할 수 */
  segments: [number, number];
  lowSegments: [number, number];
  emissive?: string;
  emissiveIntensity?: number;
  /** 입구(t=0) 뒤로 덧대는 관의 길이(0이면 없음) */
  rootLength?: number;
  lowSpec: boolean;
  reduceMotion: boolean;
}

export function VesselWall(p: VesselWallProps) {
  const {
    layout,
    colorA,
    colorB,
    rings = 0,
    streaks = 0,
    bumpiness = 0.04,
    seed = 1,
    holes,
    segments,
    lowSegments,
    rootLength = 0,
    lowSpec,
  } = p;
  const [tub, rad] = lowSpec ? lowSegments : segments;

  const geometry = useMemo(() => {
    const g = buildVesselGeometry({
      curve: layout.axis,
      radius: layout.radius,
      tubularSegments: tub,
      radialSegments: rad,
      bumpiness,
      colorA,
      colorB,
      rings,
      streaks,
      seed,
    });
    if (holes) punchHoles(g, layout, tub, rad, holes);
    return g;
  }, [layout, tub, rad, bumpiness, colorA, colorB, rings, streaks, seed, holes]);

  const rootGeometry = useMemo(() => {
    if (rootLength <= 0) return null;
    const T = layout.frames.tangents[0];
    const start = layout.frames.points[0];
    const r0 = layout.radius(0) * 1.04;
    const g = buildVesselGeometry({
      curve: new LineCurve3(start.clone().addScaledVector(T, -rootLength), start.clone().addScaledVector(T, 0.4)),
      radius: () => r0,
      tubularSegments: 4,
      radialSegments: rad,
      bumpiness: 0,
      colorA,
      colorB,
      rings: 0,
      streaks,
      seed: seed + 7,
    });
    // 뿌리 관 전체가 입구(t=0)와 같은 박자로 움직이도록 aT를 0으로 둔다(짧은 관에 물결이 몰리지 않게)
    const at = g.getAttribute('aT');
    for (let i = 0; i < at.count; i++) at.setX(i, 0);
    at.needsUpdate = true;
    return g;
  }, [layout, rootLength, rad, colorA, colorB, streaks, seed]);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => rootGeometry?.dispose(), [rootGeometry]);

  const material = usePulseMaterial({
    lowSpec,
    amp: p.amp,
    waves: p.waves,
    reduceMotion: p.reduceMotion,
    emissive: p.emissive,
    emissiveIntensity: p.emissiveIntensity ?? 0,
    roughness: 0.7,
  });

  return (
    <group>
      <mesh geometry={geometry} material={material} frustumCulled={false} />
      {rootGeometry && <mesh geometry={rootGeometry} material={material} />}
    </group>
  );
}
