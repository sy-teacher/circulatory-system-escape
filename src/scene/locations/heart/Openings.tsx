// 입구·출구 둘레(테두리 고리), 추가 입구 혈관, 관 끝 마개, 두 갈래 혈관(우심실), 두꺼운 벽 단면(좌심방에서 본 다음 방)
import { useEffect, useMemo } from 'react';
import {
  BufferAttribute,
  CatmullRomCurve3,
  Color,
  DoubleSide,
  Matrix4,
  MeshBasicMaterial,
  Path,
  Quaternion,
  RingGeometry,
  Shape,
  ShapeGeometry,
  TorusGeometry,
  Vector3,
  type BufferGeometry,
} from 'three';
import { PALETTE } from '../../palette';
import { BloodCells } from '../../shared/BloodCells';
import type { ChamberScene, Lip } from './design';
import { createHeartMaterial } from './materials';
import { basisFacing, buildDiscGeometry, buildTubeGeometry } from './roomModel';

const Z = new Vector3(0, 0, 1);
const FLOW_RANGE: [number, number] = [0, 1];

function LipRing({ lip, lowSpec }: { lip: Lip; lowSpec: boolean }) {
  const q = useMemo(() => new Quaternion().setFromUnitVectors(Z, lip.axis.clone().normalize()), [lip]);
  const { material } = useMemo(() => createHeartMaterial({ lowSpec, color: lip.color, selfLit: 0.32 }), [lowSpec, lip.color]);
  const geometry = useMemo(() => new TorusGeometry(lip.radius, lip.minor, lowSpec ? 6 : 9, lowSpec ? 32 : 52), [lip, lowSpec]);
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh position={lip.center} quaternion={q} geometry={geometry} material={material} />;
}

function Disc({ geometry }: { geometry: BufferGeometry }) {
  const material = useMemo(() => new MeshBasicMaterial({ vertexColors: true, side: DoubleSide }), []);
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} material={material} />;
}

/** 단면 고리: 연한 단면 위 결 무늬(근육 층) — 벽이 얼마나 두꺼운지 보여 주는 학습용 표현 */
function ThickRing({ ring, lowSpec }: { ring: NonNullable<ChamberScene['thickRing']>; lowSpec: boolean }) {
  const geometry = useMemo(() => {
    const g = new RingGeometry(ring.inner, ring.outer, lowSpec ? 32 : 56, 8);
    const pos = g.getAttribute('position');
    const col = new Float32Array(pos.count * 3);
    // 근육 단면: 진한 근육 바탕에 밝은 결 무늬(출발점 방 입구의 두꺼운 테두리와 같은 색)
    const a = new Color('#ffb7be');
    const b = new Color('#c2405a');
    const c = new Color();
    for (let i = 0; i < pos.count; i++) {
      const r = Math.hypot(pos.getX(i), pos.getY(i));
      const e = (r - ring.inner) / (ring.outer - ring.inner);
      const stripe = 0.5 + 0.5 * Math.cos(e * Math.PI * 2 * 3.5);
      c.copy(a).lerp(b, stripe * 0.55 + e * 0.2);
      c.toArray(col, i * 3);
    }
    g.setAttribute('color', new BufferAttribute(col, 3));
    // 고리 면이 들어오는 쪽(-axis)을 보게 한다
    g.applyMatrix4(basisFacing(ring.center, ring.axis.clone().negate()));
    return g;
  }, [ring, lowSpec]);
  const { material } = useMemo(() => createHeartMaterial({ lowSpec, vertexColors: true, selfLit: 0.35, doubleSide: true }), [lowSpec]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  const lip = useMemo<Lip>(() => ({ center: ring.center, axis: ring.axis, radius: ring.inner, minor: 0.32, color: '#e0566c' }), [ring]);
  return (
    <group>
      <mesh geometry={geometry} material={material} />
      <LipRing lip={lip} lowSpec={lowSpec} />
    </group>
  );
}

/** 출구 너머에서 혈관이 두 갈래로 나뉘는 모습(양쪽 폐 방향) */
function SplitVessel({ split, lowSpec }: { split: NonNullable<ChamberScene['split']>; lowSpec: boolean }) {
  const parts = useMemo(() => {
    const { center, T, N, B, trunkR, branchR, offset } = split;
    // 갈림 마개: 구멍 두 개가 난 원판(가운데 능선이 두 길을 나눈다)
    const shape = new Shape();
    shape.absarc(0, 0, trunkR + 0.25, 0, Math.PI * 2, false);
    for (const sx of [-1, 1]) {
      const h = new Path();
      h.absarc(sx * offset, 0, branchR, 0, Math.PI * 2, true);
      shape.holes.push(h);
    }
    const cap = new ShapeGeometry(shape, lowSpec ? 16 : 28);
    const pos = cap.getAttribute('position');
    const col = new Float32Array(pos.count * 3);
    const ca = new Color(PALETTE.arteryWall);
    const cb = new Color(PALETTE.arteryWallDeep);
    const c = new Color();
    for (let i = 0; i < pos.count; i++) {
      c.copy(ca).lerp(cb, Math.min(1, Math.abs(pos.getY(i)) / (trunkR + 0.3)));
      c.toArray(col, i * 3);
    }
    cap.setAttribute('color', new BufferAttribute(col, 3));
    // x: 오른쪽(B), y: 위(N), z: 뒤쪽(-T) — 탐사선 쪽을 바라본다
    cap.applyMatrix4(new Matrix4().makeBasis(B, N, T.clone().negate()).setPosition(center));

    const branches = [-1, 1].map((sx) => {
      const start = center.clone().addScaledVector(B, sx * offset).addScaledVector(T, -0.05);
      const pts = [
        start,
        start.clone().addScaledVector(T, 1.2).addScaledVector(B, sx * 0.4),
        start.clone().addScaledVector(T, 2.8).addScaledVector(B, sx * 1.6).addScaledVector(N, 0.2),
        start.clone().addScaledVector(T, 4.2).addScaledVector(B, sx * 3.4).addScaledVector(N, 0.3),
      ];
      const tube = buildTubeGeometry({
        points: pts,
        radius: () => branchR,
        radial: lowSpec ? 10 : 16,
        tubular: lowSpec ? 10 : 18,
        colorA: PALETTE.arteryWall,
        colorB: PALETTE.arteryWallDeep,
        seed: sx + 3,
      });
      const end = pts[3];
      const facing = pts[2].clone().sub(pts[3]).normalize();
      const disc = buildDiscGeometry(end.clone().addScaledVector(facing, 0.05), facing, branchR + 0.3, '#4a0f1f', PALETTE.arteryWallDeep);
      const lip: Lip = { center: start, axis: T.clone(), radius: branchR, minor: 0.12, color: '#ffb0b8' };
      return { tube, disc, lip };
    });
    return { cap, branches };
  }, [split, lowSpec]);
  const { material } = useMemo(() => createHeartMaterial({ lowSpec, vertexColors: true, selfLit: 0.3 }), [lowSpec]);
  const { material: capMat } = useMemo(() => createHeartMaterial({ lowSpec, vertexColors: true, selfLit: 0.3, doubleSide: true }), [lowSpec]);
  useEffect(
    () => () => {
      parts.cap.dispose();
      for (const b of parts.branches) b.tube.dispose();
    },
    [parts],
  );
  useEffect(
    () => () => {
      material.dispose();
      capMat.dispose();
    },
    [material, capMat],
  );
  return (
    <group>
      <mesh geometry={parts.cap} material={capMat} />
      {parts.branches.map((b, i) => (
        <group key={i}>
          <mesh geometry={b.tube} material={material} />
          <Disc geometry={b.disc} />
          <LipRing lip={b.lip} lowSpec={lowSpec} />
        </group>
      ))}
    </group>
  );
}

/** 방 벽에 난 추가 입구(판막 없음) 뒤로 이어지는 혈관과 그 속을 흐르는 혈구 */
function ExtraInlets({ sc, lowSpec }: { sc: ChamberScene; lowSpec: boolean }) {
  const parts = useMemo(
    () =>
      sc.extraInlets.map((e, i) => {
        const c = e.hole.center;
        const pts = [c.clone().addScaledVector(e.hole.axis, -0.35), e.flow[2], e.flow[1], e.flow[0]];
        const tube = buildTubeGeometry({
          points: pts,
          radius: () => e.radius,
          radial: lowSpec ? 10 : 16,
          tubular: lowSpec ? 10 : 18,
          colorA: sc.extraTube[0],
          colorB: sc.extraTube[1],
          seed: i + 7,
        });
        const end = pts[3];
        const facing = pts[2].clone().sub(pts[3]).normalize();
        const disc = buildDiscGeometry(end.clone().addScaledVector(facing, 0.05), facing, e.radius + 0.3, sc.o2 === 'rich' ? '#5e1424' : '#4a0f1f', sc.extraTube[1]);
        const lip: Lip = { center: c.clone(), axis: e.hole.axis.clone(), radius: e.radius, minor: sc.lips[0]?.minor ?? 0.17, color: sc.lips[0]?.color ?? PALETTE.valveEdge };
        const flow = new CatmullRomCurve3(e.flow);
        return { tube, disc, lip, flow, r: e.radius };
      }),
    [sc, lowSpec],
  );
  const { material } = useMemo(() => createHeartMaterial({ lowSpec, vertexColors: true, selfLit: 0.3 }), [lowSpec]);
  useEffect(() => () => material.dispose(), [material]);
  useEffect(
    () => () => {
      for (const p of parts) p.tube.dispose();
    },
    [parts],
  );
  return (
    <group>
      {parts.map((p, i) => (
        <group key={i}>
          <mesh geometry={p.tube} material={material} />
          <Disc geometry={p.disc} />
          <LipRing lip={p.lip} lowSpec={lowSpec} />
          {sc.stubCells.extra > 0 && (
            <BloodCells curve={p.flow} radius={() => p.r * 0.92} count={sc.stubCells.extra} speed={2.2} o2={sc.o2} tRange={FLOW_RANGE} clearRadius={0.5} seed={i + 31} />
          )}
        </group>
      ))}
    </group>
  );
}

export function Openings({ sc, lowSpec }: { sc: ChamberScene; lowSpec: boolean }) {
  const caps = useMemo(() => sc.caps.map((c) => buildDiscGeometry(c.center, c.facing, c.radius, c.inner, c.outer)), [sc]);
  return (
    <group>
      {sc.lips.map((l, i) => (
        <LipRing key={i} lip={l} lowSpec={lowSpec} />
      ))}
      {caps.map((g, i) => (
        <Disc key={i} geometry={g} />
      ))}
      <ExtraInlets sc={sc} lowSpec={lowSpec} />
      {sc.split && <SplitVessel split={sc.split} lowSpec={lowSpec} />}
      {sc.thickRing && <ThickRing ring={sc.thickRing} lowSpec={lowSpec} />}
    </group>
  );
}
