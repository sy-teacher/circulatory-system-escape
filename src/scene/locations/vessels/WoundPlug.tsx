// R4: 가는 정맥 벽의 작은 틈. 처음엔 적혈구 몇 개가 천천히 새어 나가다가,
// 작은 노란 조각(혈소판)이 모여 서로 엉기고, 가는 실 그물이 생겨 틈을 막는다. 약 9초마다 반복.
// R4 단계가 아니면 막힌 상태로 멈춰 있다. (부드럽고 무섭지 않게: 튀김·번쩍임 없음)

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  CanvasTexture,
  Color,
  CylinderGeometry,
  IcosahedronGeometry,
  Matrix4,
  Object3D,
  Quaternion,
  SRGBColorSpace,
  Vector3,
  type InstancedMesh,
  type Mesh,
  type MeshBasicMaterial,
} from 'three';
import { runtime } from '../../runtime';
import { PALETTE } from '../../palette';
import { createRbcGeometry } from '../../shared/cellGeometry';
import { clamp01, seeded, smoothstep, wallBasis, type VesselLayout } from './common';

export interface WoundPlugProps {
  layout: VesselLayout;
  t: number;
  angle: number;
  /** R4 단계일 때만 반복 재생 */
  playing: boolean;
  lowSpec: boolean;
  reduceMotion: boolean;
}

const LOOP = 9;
const FROZEN = 7.5;
const GAP_A = 0.75;
const GAP_B = 0.32;
const LEAK = [0, 0.7, 1.4, 2.1];

interface Platelet {
  from: Vector3;
  to: Vector3;
  arrive: number;
  scale: Vector3;
  rot: Quaternion;
  wob: number;
}

interface Strand {
  center: Vector3;
  dir: Vector3;
  len: number;
  start: number;
}

function makeMeshTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, 128, 64);
    ctx.fillStyle = 'rgba(255, 236, 200, 0.55)';
    ctx.beginPath();
    ctx.ellipse(64, 32, 62, 30, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 250, 235, 0.95)';
    ctx.lineWidth = 2;
    const rnd = seeded(41);
    for (let i = 0; i < 16; i++) {
      ctx.beginPath();
      ctx.moveTo(rnd() * 128, rnd() * 64);
      ctx.lineTo(rnd() * 128, rnd() * 64);
      ctx.stroke();
    }
  }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

export function WoundPlug({ layout, t, angle, playing, lowSpec, reduceMotion }: WoundPlugProps) {
  const rbcRef = useRef<InstancedMesh>(null);
  const pltRef = useRef<InstancedMesh>(null);
  const fibRef = useRef<InstancedMesh>(null);
  const meshRef = useRef<Mesh>(null);
  const clock = useRef(0);

  const NP = lowSpec ? 9 : 14;
  const NF = lowSpec ? 6 : 10;

  // 국소 좌표: x = 흐름 방향, y = 둘레 방향, z = 혈관 안쪽
  const frame = useMemo(() => {
    const w = wallBasis(layout, t, angle, layout.radius(t) * 0.05 + 0.02);
    const z = w.out.clone().negate();
    const q = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(w.tangent, w.around, z));
    return { pos: w.pos, quat: q };
  }, [layout, t, angle]);

  const rbcGeo = useMemo(() => createRbcGeometry(0.3, 12), []);
  const pltGeo = useMemo(() => new IcosahedronGeometry(0.12, 0), []);
  const fibGeo = useMemo(() => new CylinderGeometry(0.018, 0.018, 1, 4, 1), []);
  const meshTex = useMemo(() => makeMeshTexture(), []);
  useEffect(() => () => rbcGeo.dispose(), [rbcGeo]);
  useEffect(() => () => pltGeo.dispose(), [pltGeo]);
  useEffect(() => () => fibGeo.dispose(), [fibGeo]);
  useEffect(() => () => meshTex.dispose(), [meshTex]);

  const platelets = useMemo<Platelet[]>(() => {
    const r = seeded(17);
    return Array.from({ length: NP }, (_, k) => {
      const ang = r() * Math.PI * 2;
      const rr = Math.sqrt(r()) * 0.85;
      const to = new Vector3(Math.cos(ang) * rr * GAP_A, Math.sin(ang) * rr * GAP_B, 0.06 + r() * 0.12);
      const from = new Vector3(-3.0 - r() * 1.4, to.y * 1.5 + (r() - 0.5) * 0.9, 0.7 + r() * 0.9);
      const rot = new Quaternion().setFromAxisAngle(new Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize(), r() * Math.PI);
      return {
        from,
        to,
        arrive: 1.8 + (2.6 * k) / Math.max(1, NP - 1),
        scale: new Vector3(1 + 0.5 * r(), 0.7 + 0.4 * r(), 0.8 + 0.5 * r()),
        rot,
        wob: r() * Math.PI * 2,
      };
    });
  }, [NP]);

  const strands = useMemo<Strand[]>(() => {
    const r = seeded(29);
    return Array.from({ length: NF }, (_, k) => {
      const psi = (k / NF) * Math.PI + (r() - 0.5) * 0.5;
      return {
        center: new Vector3((r() - 0.5) * 0.5, (r() - 0.5) * 0.2, 0.17 + r() * 0.06),
        dir: new Vector3(Math.cos(psi), Math.sin(psi) * 0.55, 0).normalize(),
        len: 0.9 + r() * 0.6,
        start: 4.6 + k * 0.2,
      };
    });
  }, [NF]);

  const tmp = useMemo(
    () => ({ o: new Object3D(), up: new Vector3(0, 1, 0) }),
    [],
  );

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    if (playing) clock.current = (clock.current + dt) % LOOP;
    const tau = playing ? clock.current : FROZEN;
    const k = reduceMotion ? 0.3 : 1;
    const reset = playing ? 1 - smoothstep(8.3, 8.9, tau) : 1;
    const o = tmp.o;

    // 새어 나가는 적혈구(막히기 전까지)
    const rm = rbcRef.current;
    if (rm) {
      for (let i = 0; i < LEAK.length; i++) {
        const u = (tau - LEAK[i]) / 1.6;
        if (!playing || u < 0 || u > 1) {
          o.scale.setScalar(0);
        } else {
          const e = u * u * (3 - 2 * u);
          o.position.set(-1.3 + i * 0.25 + 1.3 * e - i * 0.25 * e, (i % 2 ? 0.12 : -0.1) * (1 - e), 0.9 - 1.25 * e);
          // 원반 면이 틈의 긴 방향과 나란하도록 세워서 좁은 틈으로 빠져나가게(기본 자세의 두께 방향 = y)
          o.quaternion.identity();
          o.scale.setScalar(smoothstep(-0.35, 0.1, o.position.z));
        }
        o.updateMatrix();
        rm.setMatrixAt(i, o.matrix);
      }
      rm.instanceMatrix.needsUpdate = true;
    }

    // 모여들어 붙는 혈소판
    const pm = pltRef.current;
    if (pm) {
      for (let i = 0; i < platelets.length; i++) {
        const p = platelets[i];
        const u = clamp01((tau - (p.arrive - 1.6)) / 1.6);
        const visible = tau >= p.arrive - 1.6;
        const e = u * u * (3 - 2 * u);
        o.position.lerpVectors(p.from, p.to, e);
        if (u < 1) o.position.z += Math.sin(u * Math.PI) * 0.25;
        const stuck = smoothstep(p.arrive, p.arrive + 0.6, tau);
        o.quaternion.copy(p.rot);
        const wob = 1 + 0.06 * k * Math.sin(runtime.time * 2 + p.wob) * stuck;
        o.scale.copy(p.scale).multiplyScalar((visible ? 1 : 0) * (1 + 0.35 * stuck) * wob * reset);
        o.updateMatrix();
        pm.setMatrixAt(i, o.matrix);
      }
      pm.instanceMatrix.needsUpdate = true;
    }

    // 가는 실 그물
    const fm = fibRef.current;
    if (fm) {
      for (let i = 0; i < strands.length; i++) {
        const s = strands[i];
        const g = smoothstep(s.start, s.start + 0.9, tau) * reset;
        o.position.copy(s.center);
        o.quaternion.setFromUnitVectors(tmp.up, s.dir);
        o.scale.set(1, Math.max(0.0001, s.len * g), 1);
        if (g <= 0) o.scale.setScalar(0);
        o.updateMatrix();
        fm.setMatrixAt(i, o.matrix);
      }
      fm.instanceMatrix.needsUpdate = true;
    }

    const mm = meshRef.current;
    if (mm) {
      const a = smoothstep(5.0, 6.5, tau) * reset;
      (mm.material as MeshBasicMaterial).opacity = 0.9 * a;
      mm.visible = a > 0.01;
    }
  });

  const pltColor = useMemo(() => new Color(PALETTE.platelet), []);
  const rbcColor = useMemo(() => new Color(PALETTE.rbcPoor), []);

  return (
    <group position={frame.pos} quaternion={frame.quat}>
      {/* 작은 틈(어두운 붉은 틈새와 부드러운 가장자리) */}
      <mesh position={[0, 0, 0.02]} scale={[GAP_A, GAP_B, 1]}>
        <circleGeometry args={[1, 24]} />
        <meshLambertMaterial color="#6a2338" emissive="#3a0f1e" emissiveIntensity={0.4} />
      </mesh>
      <mesh position={[0, GAP_B + 0.05, 0.03]} scale={[GAP_A * 1.1, 0.12, 0.1]}>
        <sphereGeometry args={[1, 12, 6]} />
        <meshLambertMaterial color={PALETTE.veinWall} />
      </mesh>
      <mesh position={[0, -GAP_B - 0.05, 0.03]} scale={[GAP_A * 1.1, 0.12, 0.1]}>
        <sphereGeometry args={[1, 12, 6]} />
        <meshLambertMaterial color={PALETTE.veinWall} />
      </mesh>
      <instancedMesh ref={rbcRef} args={[rbcGeo, undefined, LEAK.length]} frustumCulled={false}>
        <meshStandardMaterial color={rbcColor} emissive={rbcColor} emissiveIntensity={0.12} roughness={0.55} flatShading />
      </instancedMesh>
      <instancedMesh ref={pltRef} args={[pltGeo, undefined, NP]} frustumCulled={false}>
        <meshStandardMaterial color={pltColor} emissive={pltColor} emissiveIntensity={0.25} roughness={0.6} flatShading />
      </instancedMesh>
      <instancedMesh ref={fibRef} args={[fibGeo, undefined, NF]} frustumCulled={false}>
        <meshBasicMaterial color="#fff4dc" toneMapped={false} />
      </instancedMesh>
      <mesh ref={meshRef} position={[0, 0, 0.2]} scale={[GAP_A * 2.2, GAP_B * 2.4, 1]}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={meshTex} transparent opacity={0} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}
