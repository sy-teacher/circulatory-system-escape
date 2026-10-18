// 벽과 함께 수축하는 부분: 근육 기둥·빗살 능선(InstancedMesh), 꼭지근, 그리고 이들을 묶는 수축 그룹
import { useFrame } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { Group, InstancedMesh, Object3D, Quaternion, SphereGeometry, Vector3 } from 'three';
import { runtime } from '../../runtime';
import { chamberK, type Bar, type ChamberId, type Papillary } from './design';
import { createHeartMaterial } from './materials';

/** 자식들을 방의 수축 중심 쪽으로 함께 당긴다(벽 셰이더와 같은 비율) */
export function ContractGroup({ chamber, center, reduceMotion, children }: { chamber: ChamberId; center: Vector3; reduceMotion: boolean; children: ReactNode }) {
  const g = useRef<Group>(null);
  useFrame(() => {
    const grp = g.current;
    if (!grp) return;
    const s = 1 - chamberK(chamber, runtime.contraction, runtime.atrialContraction, reduceMotion);
    grp.scale.setScalar(s);
    grp.position.copy(center).multiplyScalar(1 - s);
  });
  return <group ref={g}>{children}</group>;
}

/** 벽을 따라 붙은 길쭉한 근육 다발(양 끝은 벽에 묻힘) */
export function MuscleBars({ bars, color, lowSpec }: { bars: Bar[]; color: string; lowSpec: boolean }) {
  const mesh = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => new SphereGeometry(1, lowSpec ? 6 : 8, lowSpec ? 4 : 6), [lowSpec]);
  const { material } = useMemo(() => createHeartMaterial({ lowSpec, color, selfLit: 0.26 }), [lowSpec, color]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const o = new Object3D();
    const up = new Vector3(0, 1, 0);
    const d = new Vector3();
    bars.forEach((b, i) => {
      d.copy(b.b).sub(b.a);
      const len = d.length();
      o.position.copy(b.a).add(b.b).multiplyScalar(0.5);
      o.quaternion.setFromUnitVectors(up, d.normalize());
      o.scale.set(b.r, len / 2 + b.r * 0.6, b.r);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [bars]);

  if (!bars.length) return null;
  return <instancedMesh ref={mesh} args={[geometry, material, bars.length]} frustumCulled={false} />;
}

/** 꼭지근: 벽에서 솟아 힘줄을 붙잡는 원뿔 모양 근육 */
export function PapillaryMuscles({ list, color, lowSpec }: { list: Papillary[]; color: string; lowSpec: boolean }) {
  const { material } = useMemo(() => createHeartMaterial({ lowSpec, color, selfLit: 0.28 }), [lowSpec, color]);
  useEffect(() => () => material.dispose(), [material]);
  const poses = useMemo(
    () =>
      list.map((p) => {
        const d = p.tip.clone().sub(p.base);
        const h = d.length();
        const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), d.normalize());
        return { mid: p.base.clone().lerp(p.tip, 0.5), q, h, p };
      }),
    [list],
  );
  return (
    <group>
      {poses.map(({ mid, q, h, p }, i) => (
        <group key={i}>
          <mesh position={mid} quaternion={q} material={material}>
            <cylinderGeometry args={[p.rTop, p.rBottom, h, lowSpec ? 6 : 9, 2]} />
          </mesh>
          <mesh position={p.tip} material={material}>
            <sphereGeometry args={[p.rTop * 1.25, lowSpec ? 6 : 9, lowSpec ? 4 : 6]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
