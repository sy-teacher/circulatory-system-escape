// 혈관 끝 너머로 보이는 심장의 한 방(이름표 없음). 박동에 맞춰 부풀었다 줄었다 한다.
// 탐사선은 이 공간 안으로 들어가지 않는다(다음 공간에서 그려진다).

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  BackSide,
  BufferAttribute,
  Color,
  IcosahedronGeometry,
  MeshLambertMaterial,
  MeshStandardMaterial,
  type Group,
} from 'three';
import { runtime } from '../../runtime';
import { PALETTE } from '../../palette';
import { seeded, type V3 } from './common';

export interface ChamberGlimpseProps {
  center: V3;
  radius: number;
  lowSpec: boolean;
  reduceMotion: boolean;
  seed?: number;
}

export function ChamberGlimpse({ center, radius, lowSpec, reduceMotion, seed = 5 }: ChamberGlimpseProps) {
  const group = useRef<Group>(null);
  const geo = useMemo(() => {
    const g = new IcosahedronGeometry(radius, lowSpec ? 2 : 3);
    const pos = g.getAttribute('position') as BufferAttribute;
    const rnd = seeded(seed);
    const cols = new Float32Array(pos.count * 3);
    const palette = [new Color(PALETTE.muscle), new Color(PALETTE.muscleLight), new Color('#e8606f')];
    // 면(삼각형)마다 색과 울퉁불퉁함을 준다(낮은 다각형 근육 느낌)
    for (let f = 0; f < pos.count; f += 3) {
      const c = palette[Math.floor(rnd() * palette.length)];
      for (let k = 0; k < 3; k++) {
        cols[(f + k) * 3] = c.r;
        cols[(f + k) * 3 + 1] = c.g;
        cols[(f + k) * 3 + 2] = c.b;
      }
    }
    for (let v = 0; v < pos.count; v++) {
      const x = pos.getX(v);
      const y = pos.getY(v);
      const z = pos.getZ(v);
      const n = 1 + 0.04 * Math.sin(x * 0.9 + y * 1.3) * Math.cos(z * 1.1 - y * 0.7);
      pos.setXYZ(v, x * n, y * n, z * n);
    }
    g.setAttribute('color', new BufferAttribute(cols, 3));
    g.computeVertexNormals();
    return g;
  }, [radius, lowSpec, seed]);
  const mat = useMemo(() => {
    const o = {
      vertexColors: true,
      flatShading: true,
      side: BackSide,
      emissive: new Color(PALETTE.muscle),
      emissiveIntensity: 0.3,
    };
    return lowSpec ? new MeshLambertMaterial(o) : new MeshStandardMaterial({ ...o, roughness: 0.8 });
  }, [lowSpec]);
  useEffect(() => () => geo.dispose(), [geo]);
  useEffect(() => () => mat.dispose(), [mat]);

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const b = { ventricle: runtime.contraction, atrium: runtime.atrialContraction };
    // 심실이 수축하는 동안 혈액이 들어와 부풀고, 다음 박동 직전에 살짝 수축한다
    const k = reduceMotion ? 0.3 : 1;
    g.scale.setScalar(1 + k * (0.035 * b.ventricle - 0.05 * b.atrium));
  });

  return (
    <group ref={group} position={center}>
      <mesh geometry={geo} material={mat} />
    </group>
  );
}
