// 바깥에서 보이는 가는 관(다른 모세혈관 그물). 여러 관을 하나의 형상으로 합쳐 그리기 호출을 줄인다.

import { useEffect, useMemo } from 'react';
import { CatmullRomCurve3, MeshLambertMaterial, MeshStandardMaterial, SphereGeometry, TubeGeometry, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Polyline } from './sysLayout';

/** 혈액이 든 가는 관의 색(붉은 기운이 도는 분홍) */
export const NET_COLOR = '#ec7486';

export function StaticTubes({ lines, lowSpec, color = NET_COLOR }: { lines: Polyline[]; lowSpec: boolean; color?: string }) {
  const geometry = useMemo<BufferGeometry | null>(() => {
    if (lines.length === 0) return null;
    const parts: BufferGeometry[] = [];
    const radial = lowSpec ? 5 : 7;
    for (const pl of lines) {
      if (pl.points.length < 2) continue;
      const curve = new CatmullRomCurve3(pl.points, false, 'centripetal');
      parts.push(new TubeGeometry(curve, Math.max(6, pl.points.length * (lowSpec ? 2 : 3)), pl.radius, radial, false));
      // 끝을 둥글게 막는다
      for (const p of [pl.points[0], pl.points[pl.points.length - 1]]) {
        parts.push(new SphereGeometry(pl.radius, radial, Math.max(3, radial - 2)).translate(p.x, p.y, p.z));
      }
    }
    const merged = mergeGeometries(parts, false);
    parts.forEach((p) => p.dispose());
    return merged;
  }, [lines, lowSpec]);
  const material = useMemo(
    () =>
      lowSpec
        ? new MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.15 })
        : new MeshStandardMaterial({ color, roughness: 0.55, metalness: 0, emissive: color, emissiveIntensity: 0.12 }),
    [lowSpec, color],
  );
  useEffect(() => () => geometry?.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  if (!geometry) return null;
  return <mesh geometry={geometry} material={material} />;
}
