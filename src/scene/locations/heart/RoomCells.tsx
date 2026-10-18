// 방 안을 소용돌이치며 입구에서 출구 쪽으로 흘러가는 적혈구(InstancedMesh).
// 탐사선 주변은 비워 두고, 벽이 수축하면 함께 안쪽으로 모인다. 혈구는 벽 밖으로 나가지 않는다.
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { InstancedMesh, Object3D, Vector3 } from 'three';
import { PALETTE } from '../../palette';
import { runtime } from '../../runtime';
import { createRbcGeometry } from '../../shared/cellGeometry';
import { chamberK, type ChamberScene } from './design';
import { createHeartMaterial } from './materials';

const CLEAR = 2.3;

export function RoomCells({ sc, lowSpec, reduceMotion }: { sc: ChamberScene; lowSpec: boolean; reduceMotion: boolean }) {
  const mesh = useRef<InstancedMesh>(null);
  const count = sc.cells.count;
  const geometry = useMemo(() => createRbcGeometry(0.46, lowSpec ? 10 : 14), [lowSpec]);
  const color = sc.o2 === 'rich' ? PALETTE.rbcRich : PALETTE.rbcPoor;
  const { material } = useMemo(() => createHeartMaterial({ lowSpec, color, selfLit: 0.16, roughness: 0.55 }), [lowSpec, color]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  const cells = useMemo(() => {
    const m = sc.model;
    const a = m.sIn + 0.3;
    const b = m.sOut - 0.3;
    const s = new Float32Array(count);
    const th = new Float32Array(count);
    const rf = new Float32Array(count);
    const dth = new Float32Array(count);
    const sp = new Float32Array(count);
    const rot = new Float32Array(count);
    const spin = new Float32Array(count);
    const axis: Vector3[] = [];
    for (let i = 0; i < count; i++) {
      // 넓은 곳일수록 천천히 흐르므로 더 많이 머문다(넓이에 비례해 배치)
      let guard = 0;
      do {
        s[i] = a + Math.random() * (b - a);
        th[i] = Math.random() * Math.PI * 2;
      } while (guard++ < 8 && Math.random() * 10 > m.radiusFast(s[i], th[i]));
      rf[i] = 0.3 + 0.65 * Math.sqrt(Math.random());
      dth[i] = (Math.random() < 0.5 ? -1 : 1) * (0.12 + Math.random() * 0.3);
      sp[i] = 0.75 + Math.random() * 0.5;
      rot[i] = Math.random() * Math.PI * 2;
      spin[i] = 0.4 + Math.random() * 1.0;
      axis.push(new Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize());
    }
    return { s, th, rf, dth, sp, rot, spin, axis };
  }, [count, sc]);

  const tmp = useMemo(() => ({ p: new Vector3(), n: new Vector3(), b: new Vector3(), d: new Vector3(), veh: new Vector3(), o: new Object3D() }), []);

  useFrame((_, dtRaw) => {
    const im = mesh.current;
    if (!im) return;
    const dt = Math.min(dtRaw, 0.05);
    const m = sc.model;
    const C = m.center;
    const k = chamberK(sc.id, runtime.contraction, runtime.atrialContraction, reduceMotion);
    // 심실은 수축기에 출구 쪽으로 세게, 심방은 비교적 고르게 흐른다
    const flow = sc.role === 'ventricle' ? 0.45 + 1.7 * runtime.contraction : 0.8 + 0.5 * runtime.atrialContraction;
    tmp.veh.copy(runtime.vehiclePosition);
    im.worldToLocal(tmp.veh);
    const { s, th, rf, dth, sp, rot, spin, axis } = cells;
    const sEnd = m.sOut - 0.25;
    for (let i = 0; i < count; i++) {
      let rw = m.radiusFast(s[i], th[i]);
      s[i] += sc.cells.speed * flow * sp[i] * dt * Math.min(1, Math.max(0.3, 3.6 / rw));
      th[i] += dth[i] * dt;
      if (s[i] > sEnd) {
        // 출구로 빠져나간 혈구는 입구 쪽에서 다시 들어온다
        s[i] = m.sIn + 0.25 + Math.random() * 1.2;
        th[i] = Math.random() * Math.PI * 2;
        rf[i] = 0.3 + 0.65 * Math.sqrt(Math.random());
      }
      rw = m.radiusFast(s[i], th[i]);
      m.frameFast(s[i], tmp.p, tmp.n, tmp.b);
      const r = Math.max(0.4, rf[i] * (rw - 0.8));
      tmp.p.addScaledVector(tmp.n, Math.cos(th[i]) * r).addScaledVector(tmp.b, Math.sin(th[i]) * r);
      // 벽과 함께 수축
      const w = m.weight(s[i]);
      if (k !== 0 && w > 0) tmp.p.sub(C).multiplyScalar(1 - k * w).add(C);
      // 탐사선 주변 비우기
      tmp.d.copy(tmp.p).sub(tmp.veh);
      const dl = tmp.d.length();
      if (dl < CLEAR) {
        if (dl < 1e-3) tmp.d.set(0, 1, 0);
        else tmp.d.multiplyScalar(1 / dl);
        tmp.p.copy(tmp.veh).addScaledVector(tmp.d, CLEAR);
      }
      rot[i] += spin[i] * dt;
      tmp.o.position.copy(tmp.p);
      tmp.o.quaternion.setFromAxisAngle(axis[i], rot[i]);
      tmp.o.updateMatrix();
      im.setMatrixAt(i, tmp.o.matrix);
    }
    im.instanceMatrix.needsUpdate = true;
  });

  return <instancedMesh ref={mesh} args={[geometry, material, count]} frustumCulled={false} />;
}
