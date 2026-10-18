// 벽 단면 관찰 창: 두꺼운 벽 일부를 잘라 낸 듯한 창으로, 창 둘레에 여러 겹(탄력 섬유 층)이 보인다.
// 박동이 올 때마다 벽이 늘어나며(살짝 얇아지고 바깥으로 밀림) 다시 돌아온다.

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  Matrix4,
  MeshLambertMaterial,
  MeshStandardMaterial,
  Quaternion,
  RepeatWrapping,
  SRGBColorSpace,
  TubeGeometry,
  Vector3,
  type Group,
} from 'three';
import { BEAT_PERIOD, runtime } from '../../runtime';
import { PALETTE } from '../../palette';
import { holeRimCurve, pulseShape, wallBasis, type VesselLayout, type WallHole } from './common';

export interface WallCutawayProps {
  layout: VesselLayout;
  hole: WallHole;
  /** 보여 줄 벽 두께 */
  depth: number;
  amp: number;
  waves: number;
  lowSpec: boolean;
  reduceMotion: boolean;
}

function makeLayerTexture(): CanvasTexture {
  const w = 256;
  const h = 128;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (ctx) {
    // 위쪽 = 바깥 막, 가운데 = 탄력 섬유가 여러 겹인 두꺼운 층, 아래쪽 = 안쪽 얇은 막(혈액 쪽)
    ctx.fillStyle = '#e98a96';
    ctx.fillRect(0, 0, w, h * 0.2);
    ctx.fillStyle = '#f27080';
    ctx.fillRect(0, h * 0.2, w, h * 0.68);
    ctx.fillStyle = '#fff1f3';
    ctx.fillRect(0, h * 0.88, w, h * 0.12);
    ctx.strokeStyle = '#ffe3e8';
    ctx.lineWidth = 3;
    const layers = 6;
    for (let k = 0; k < layers; k++) {
      const y0 = h * (0.26 + (0.56 * k) / (layers - 1));
      ctx.beginPath();
      for (let x = 0; x <= w; x += 4) {
        const y = y0 + Math.sin((x / w) * Math.PI * 2 * 8 + k) * 2.2;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(200, 90, 110, 0.6)';
    ctx.lineWidth = 2;
    for (let x = 6; x < w; x += 22) {
      ctx.beginPath();
      ctx.moveTo(x, h * 0.03);
      ctx.lineTo(x + 8, h * 0.17);
      ctx.stroke();
    }
  }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = RepeatWrapping;
  tex.repeat.set(2, 1);
  return tex;
}

export function WallCutaway({ layout, hole, depth, amp, waves, lowSpec, reduceMotion }: WallCutawayProps) {
  const outer = useRef<Group>(null);
  const inner = useRef<Group>(null);

  const frame = useMemo(() => {
    const w = wallBasis(layout, hole.t, hole.angle);
    // 국소 x = 둘레 방향, y = 진행 방향, z = 바깥쪽 (오른손 좌표계)
    const q = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(w.around, w.tangent, w.out));
    return { pos: w.pos, out: w.out, quat: q };
  }, [layout, hole]);

  const sideGeo = useMemo(() => {
    const g = new CylinderGeometry(1, 1, depth, lowSpec ? 18 : 30, 1, true);
    g.rotateX(Math.PI / 2); // 원기둥 축을 바깥 방향(z)으로
    return g;
  }, [depth, lowSpec]);
  const rimGeo = useMemo(() => new TubeGeometry(holeRimCurve(layout, hole, 28), lowSpec ? 24 : 40, 0.13, 5, true), [layout, hole, lowSpec]);
  const tex = useMemo(() => makeLayerTexture(), []);
  const sideMat = useMemo(() => {
    const o = { map: tex, side: DoubleSide, emissive: new Color('#f27080'), emissiveIntensity: 0.15 };
    return lowSpec ? new MeshLambertMaterial(o) : new MeshStandardMaterial({ ...o, roughness: 0.7 });
  }, [tex, lowSpec]);
  useEffect(() => () => sideGeo.dispose(), [sideGeo]);
  useEffect(() => () => rimGeo.dispose(), [rimGeo]);
  useEffect(() => () => tex.dispose(), [tex]);
  useEffect(() => () => sideMat.dispose(), [sideMat]);

  const off = useMemo(() => new Vector3(), []);
  useFrame(() => {
    const k = reduceMotion ? 0.3 : 1;
    const pw = pulseShape(hole.t, waves, runtime.beatPhase * BEAT_PERIOD);
    if (outer.current) outer.current.position.copy(off.copy(frame.out).multiplyScalar(amp * k * pw));
    if (inner.current) {
      // 늘어날 때 조금 얇아지고 넓어진다(탄력)
      inner.current.scale.set(hole.b * (1 + 0.05 * k * pw), hole.a * (1 + 0.05 * k * pw), 1 - 0.14 * k * pw);
    }
  });

  return (
    <group ref={outer}>
      <mesh geometry={rimGeo}>
        <meshLambertMaterial color={PALETTE.valve} emissive={PALETTE.valveEdge} emissiveIntensity={0.2} />
      </mesh>
      <group position={frame.pos} quaternion={frame.quat}>
        <group ref={inner} scale={[hole.b, hole.a, 1]}>
          <mesh geometry={sideGeo} material={sideMat} position={[0, 0, depth / 2 - 0.12]} />
          <mesh position={[0, 0, depth - 0.12]}>
            <circleGeometry args={[1, lowSpec ? 18 : 30]} />
            <meshLambertMaterial color="#e39aa3" emissive="#c46a78" emissiveIntensity={0.2} side={DoubleSide} />
          </mesh>
        </group>
      </group>
    </group>
  );
}
