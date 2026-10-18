// 모세혈관 바깥을 빽빽하게 둘러싼 몸의 세포(근육 세포처럼 길쭉한 모양 + 가장자리의 핵). InstancedMesh 2개.

import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { CapsuleGeometry, InstancedMesh, MeshLambertMaterial, MeshStandardMaterial, SphereGeometry } from 'three';
import { PALETTE } from '../../palette';
import type { TissueLayout } from './sysLayout';

export function TissueCells({ layout, lowSpec }: { layout: TissueLayout; lowSpec: boolean }) {
  const cellsRef = useRef<InstancedMesh>(null);
  const nucRef = useRef<InstancedMesh>(null);
  // 반지름 1, 가운데 길이 3 → 인스턴스 크기(반지름)로 늘이고 줄인다
  const cellGeo = useMemo(() => new CapsuleGeometry(1, 3, lowSpec ? 2 : 3, lowSpec ? 6 : 9), [lowSpec]);
  const nucGeo = useMemo(() => new SphereGeometry(1, lowSpec ? 6 : 9, lowSpec ? 4 : 6), [lowSpec]);
  const cellMat = useMemo(
    () =>
      lowSpec
        ? new MeshLambertMaterial({ color: '#ffffff', flatShading: true, emissive: PALETTE.tissue, emissiveIntensity: 0.12 })
        : new MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, metalness: 0, flatShading: true, emissive: PALETTE.tissue, emissiveIntensity: 0.1 }),
    [lowSpec],
  );
  const nucMat = useMemo(
    () =>
      lowSpec
        ? new MeshLambertMaterial({ color: PALETTE.tissueNucleus, flatShading: true })
        : new MeshStandardMaterial({ color: PALETTE.tissueNucleus, roughness: 0.6, metalness: 0, flatShading: true }),
    [lowSpec],
  );
  useEffect(
    () => () => {
      cellGeo.dispose();
      nucGeo.dispose();
      cellMat.dispose();
      nucMat.dispose();
    },
    [cellGeo, nucGeo, cellMat, nucMat],
  );

  useLayoutEffect(() => {
    const cm = cellsRef.current;
    if (cm) {
      layout.cells.forEach((m, i) => {
        cm.setMatrixAt(i, m);
        cm.setColorAt(i, layout.colors[i]);
      });
      cm.instanceMatrix.needsUpdate = true;
      if (cm.instanceColor) cm.instanceColor.needsUpdate = true;
      cm.computeBoundingSphere();
    }
    const nm = nucRef.current;
    if (nm) {
      layout.nuclei.forEach((m, i) => nm.setMatrixAt(i, m));
      nm.instanceMatrix.needsUpdate = true;
      nm.computeBoundingSphere();
    }
  }, [layout, cellGeo, nucGeo]);

  return (
    <group>
      {layout.cells.length > 0 ? <instancedMesh ref={cellsRef} args={[cellGeo, cellMat, layout.cells.length]} /> : null}
      {layout.nuclei.length > 0 ? <instancedMesh ref={nucRef} args={[nucGeo, nucMat, layout.nuclei.length]} /> : null}
    </group>
  );
}
