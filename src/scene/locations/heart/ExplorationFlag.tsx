// 탐사 표식: 첫 수수께끼를 푼 뒤 벽에 꽂는 작은 노란 깃발(하트 무늬). 돌아왔을 때 알아보는 단서가 된다.
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { CanvasTexture, DoubleSide, Group, Matrix4, Mesh, PlaneGeometry, Quaternion, SRGBColorSpace, Vector3 } from 'three';
import { runtime } from '../../runtime';
import { Hotspot } from '../../shared/Hotspot';

const POLE = 2.3;
const CLOTH_W = 1.25;
const CLOTH_H = 0.82;

function drawFlagTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 168;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#ffd84a';
    ctx.fillRect(0, 0, 256, 168);
    // 가장자리 줄무늬
    ctx.fillStyle = '#ffb92e';
    ctx.fillRect(0, 0, 256, 14);
    ctx.fillRect(0, 154, 256, 14);
    // 하트 무늬
    ctx.fillStyle = '#ff5a6e';
    ctx.beginPath();
    const x = 128;
    const y = 92;
    const s = 46;
    ctx.moveTo(x, y + s * 0.85);
    ctx.bezierCurveTo(x - s * 1.5, y - s * 0.1, x - s * 0.7, y - s * 1.2, x, y - s * 0.45);
    ctx.bezierCurveTo(x + s * 0.7, y - s * 1.2, x + s * 1.5, y - s * 0.1, x, y + s * 0.85);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 7;
    ctx.stroke();
    // 반짝임
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x - 18, y - 22, 7, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** 저사양이면 Lambert, 아니면 Standard. 스스로 조금 빛난다. */
function Soft({ lowSpec, color, glow }: { lowSpec: boolean; color: string; glow: number }) {
  return lowSpec ? (
    <meshLambertMaterial color={color} emissive={color} emissiveIntensity={glow} />
  ) : (
    <meshStandardMaterial color={color} emissive={color} emissiveIntensity={glow} roughness={0.45} />
  );
}

export interface ExplorationFlagProps {
  base: Vector3;
  /** 깃대 방향(벽 안쪽 + 위쪽) */
  dir: Vector3;
  /** 깃발 천이 바라볼 곳(정지 지점의 눈 위치) */
  viewer: Vector3;
  lowSpec: boolean;
  reduceMotion: boolean;
  anchor: string;
  active: boolean;
  observed: boolean;
  label?: string;
  onSelect: (anchor: string) => void;
}

export function ExplorationFlag({ base, dir, viewer, lowSpec, reduceMotion, anchor, active, observed, label, onSelect }: ExplorationFlagProps) {
  const group = useRef<Group>(null);
  const cloth = useRef<Mesh>(null);
  const born = useRef<number | null>(null);

  const quaternion = useMemo(() => {
    const y = dir.clone().normalize();
    const z = viewer.clone().sub(base);
    z.addScaledVector(y, -z.dot(y)).normalize();
    const x = new Vector3().crossVectors(y, z).normalize();
    return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x, y, z));
  }, [base, dir, viewer]);

  const texture = useMemo(() => drawFlagTexture(), []);
  const clothGeo = useMemo(() => {
    const g = new PlaneGeometry(CLOTH_W, CLOTH_H, 8, 1);
    // 깃대 쪽(왼쪽 끝)을 원점에 둔다
    g.translate(CLOTH_W / 2, 0, 0);
    return g;
  }, []);
  const rest = useMemo(() => Float32Array.from(clothGeo.getAttribute('position').array as ArrayLike<number>), [clothGeo]);
  useEffect(() => () => texture.dispose(), [texture]);
  useEffect(() => () => clothGeo.dispose(), [clothGeo]);

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    // 꽂히는 순간 살짝 커지며 나타난다(동작 줄이기에서는 바로 표시)
    if (born.current === null) born.current = runtime.time;
    const age = runtime.time - born.current;
    const k = reduceMotion ? 1 : Math.min(1, age / 0.6);
    const pop = reduceMotion ? 1 : 1 + 0.12 * Math.sin(Math.min(1, age / 0.6) * Math.PI);
    g.scale.setScalar(Math.max(0.001, k * pop));
    // 천이 가볍게 나부낀다
    const m = cloth.current;
    if (!m) return;
    const pos = m.geometry.getAttribute('position');
    const arr = pos.array as Float32Array;
    const amp = reduceMotion ? 0.02 : 0.07;
    for (let i = 0; i < pos.count; i++) {
      const x = rest[i * 3];
      arr[i * 3 + 2] = rest[i * 3 + 2] + amp * (x / CLOTH_W) * Math.sin(x * 4 - runtime.time * 3);
    }
    pos.needsUpdate = true;
  });

  return (
    <group ref={group} position={base} quaternion={quaternion}>
      {/* 벽에 꽂힌 받침 */}
      <mesh position={[0, 0.05, 0]}>
        <sphereGeometry args={[0.2, 10, 8]} />
        <Soft lowSpec={lowSpec} color="#f0f0f0" glow={0.15} />
      </mesh>
      {/* 깃대 */}
      <mesh position={[0, POLE / 2, 0]}>
        <cylinderGeometry args={[0.05, 0.05, POLE, 8]} />
        <Soft lowSpec={lowSpec} color="#f7f7f2" glow={0.2} />
      </mesh>
      <mesh position={[0, POLE + 0.07, 0]}>
        <sphereGeometry args={[0.11, 10, 8]} />
        <Soft lowSpec={lowSpec} color="#ffd84a" glow={0.4} />
      </mesh>
      {/* 천 */}
      <mesh ref={cloth} geometry={clothGeo} position={[0.04, POLE - CLOTH_H / 2 - 0.04, 0]}>
        {lowSpec ? (
          <meshLambertMaterial map={texture} side={DoubleSide} emissive="#ffffff" emissiveMap={texture} emissiveIntensity={0.35} />
        ) : (
          <meshStandardMaterial map={texture} side={DoubleSide} emissive="#ffffff" emissiveMap={texture} emissiveIntensity={0.35} roughness={0.7} />
        )}
      </mesh>
      <Hotspot
        anchor={anchor}
        position={[CLOTH_W * 0.55, POLE - CLOTH_H / 2, 0.45]}
        active={active}
        observed={observed}
        label={label}
        onSelect={onSelect}
        size={0.6}
      />
    </group>
  );
}
