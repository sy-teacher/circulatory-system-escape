// 공기 주머니 무리(반투명, 숨쉬듯 부풀었다 줄어듦) + 주머니를 그물처럼 감싼 가는 모세혈관.
// 주머니 안 = 공기 공간, 혈관 안 = 혈액 공간. 둘은 얇은 벽으로 나뉜다.

import { useFrame } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  CatmullRomCurve3,
  Color,
  DoubleSide,
  InstancedMesh,
  MeshLambertMaterial,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  TubeGeometry,
  Vector3,
  type BufferGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PALETTE } from '../../palette';
import { runtime } from '../../runtime';
import { BREATH_AMP, BREATH_AMP_REDUCED, BREATH_PERIOD, NET_TUBE, sacNetLines, type Sac } from './lungLayout';
import { NET_COLOR } from './StaticTubes';

/** 가장자리가 더 진하게 보이는 반투명 막(공기 주머니 벽) */
function createSacMaterial(lowSpec: boolean) {
  const common = {
    color: new Color(PALETTE.alveolus),
    emissive: new Color('#ffe2dc'),
    emissiveIntensity: 0.28,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
    side: DoubleSide,
  };
  const m = lowSpec ? new MeshLambertMaterial(common) : new MeshStandardMaterial({ ...common, roughness: 0.35, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      [
        'float sacRim = 1.0 - abs(dot(normalize(normal), normalize(vViewPosition)));',
        'diffuseColor.a = clamp(diffuseColor.a * (0.5 + 1.9 * sacRim * sacRim), 0.0, 0.9);',
        '#include <opaque_fragment>',
      ].join('\n'),
    );
  };
  m.customProgramCacheKey = () => `sac-rim-${lowSpec ? 'l' : 's'}`;
  return m;
}

export function Alveoli({ sacs, lowSpec, reduceMotion }: { sacs: Sac[]; lowSpec: boolean; reduceMotion: boolean }) {
  const sacRef = useRef<InstancedMesh>(null);
  const netRef = useRef<InstancedMesh>(null);
  const sacGeo = useMemo(() => new SphereGeometry(1, lowSpec ? 20 : 34, lowSpec ? 14 : 24), [lowSpec]);
  const netGeo = useMemo<BufferGeometry>(() => {
    const radial = lowSpec ? 4 : 5;
    const parts = sacNetLines(lowSpec).map(
      (pts) => new TubeGeometry(new CatmullRomCurve3(pts, false, 'centripetal'), Math.max(8, pts.length * 2), NET_TUBE, radial, false),
    );
    const g = mergeGeometries(parts, false);
    parts.forEach((p) => p.dispose());
    return g;
  }, [lowSpec]);
  const sacMat = useMemo(() => createSacMaterial(lowSpec), [lowSpec]);
  const netMat = useMemo(
    () =>
      lowSpec
        ? new MeshLambertMaterial({ color: NET_COLOR, emissive: NET_COLOR, emissiveIntensity: 0.15 })
        : new MeshStandardMaterial({ color: NET_COLOR, roughness: 0.55, metalness: 0, emissive: NET_COLOR, emissiveIntensity: 0.12 }),
    [lowSpec],
  );
  useEffect(
    () => () => {
      sacGeo.dispose();
      netGeo.dispose();
      sacMat.dispose();
      netMat.dispose();
    },
    [sacGeo, netGeo, sacMat, netMat],
  );

  const tmp = useMemo(() => ({ o: new Object3D(), up: new Vector3(0, 1, 0) }), []);

  const apply = () => {
    const sm = sacRef.current;
    const nm = netRef.current;
    if (!sm || !nm) return;
    const amp = reduceMotion ? BREATH_AMP_REDUCED : BREATH_AMP;
    const w = (runtime.time * Math.PI * 2) / BREATH_PERIOD;
    for (let i = 0; i < sacs.length; i++) {
      const s = sacs[i];
      const k = 1 + amp * Math.sin(w + s.phase);
      const o = tmp.o;
      o.position.copy(s.c);
      o.quaternion.setFromAxisAngle(tmp.up, s.yaw);
      o.scale.setScalar(s.r * k);
      o.updateMatrix();
      sm.setMatrixAt(i, o.matrix);
      nm.setMatrixAt(i, o.matrix);
    }
    sm.instanceMatrix.needsUpdate = true;
    nm.instanceMatrix.needsUpdate = true;
  };
  // 첫 화면부터 제자리에 있도록
  useLayoutEffect(apply);
  useFrame(apply);

  return (
    <group>
      <instancedMesh ref={netRef} args={[netGeo, netMat, sacs.length]} frustumCulled={false} />
      <instancedMesh ref={sacRef} args={[sacGeo, sacMat, sacs.length]} frustumCulled={false} renderOrder={1} />
    </group>
  );
}
