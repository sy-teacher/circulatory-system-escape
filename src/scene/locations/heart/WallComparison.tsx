// 벽 두께 비교 장치: 떠 있는 홀로그램 화면. 방 이름 대신 '현재 방', '다른 방 A·B·C'만 표시한다.
import { Billboard } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { CanvasTexture, DoubleSide, Group, SRGBColorSpace, type Vector3 } from 'three';
import { wallComparison } from '../../../data/heart';
import { PALETTE } from '../../palette';
import { runtime } from '../../runtime';
import type { ChamberId } from './design';

const FONT = "'Apple SD Gothic Neo','Noto Sans KR','Malgun Gothic',sans-serif";

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 막대 4개(현재 방 + 다른 방 A·B·C)를 그린 화면 */
export function drawComparisonTexture(chamber: ChamberId): CanvasTexture {
  const W = 512;
  const H = 384;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const bars = wallComparison(chamber);
    // 바탕
    roundRect(ctx, 8, 8, W - 16, H - 16, 26);
    ctx.fillStyle = 'rgba(14, 48, 64, 0.78)';
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = PALETTE.holo;
    ctx.stroke();
    // 제목
    ctx.fillStyle = '#eafeff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold 34px ${FONT}`;
    ctx.fillText('벽 두께 비교 장치', W / 2, 50);
    // 기준선·눈금
    const left = 44;
    const right = W - 44;
    const base = 296;
    const maxH = 178;
    ctx.strokeStyle = 'rgba(125, 249, 255, 0.35)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      const y = base - (maxH * i) / 4;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
      ctx.stroke();
    }
    // 막대
    const col = (right - left) / bars.length;
    bars.forEach((b, i) => {
      const cx = left + col * (i + 0.5);
      const h = Math.max(8, (b.value / 100) * maxH);
      const bw = 62;
      roundRect(ctx, cx - bw / 2, base - h, bw, h, 10);
      ctx.fillStyle = b.current ? '#ffe066' : 'rgba(125, 249, 255, 0.85)';
      ctx.fill();
      if (b.current) {
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
      }
      ctx.fillStyle = b.current ? '#ffe066' : '#eafeff';
      ctx.font = `bold 26px ${FONT}`;
      ctx.fillText(String(b.value), cx, base - h - 18);
      ctx.font = `${b.current ? 'bold ' : ''}22px ${FONT}`;
      ctx.fillText(b.label, cx, base + 24);
    });
    // 설명
    ctx.fillStyle = 'rgba(234, 254, 255, 0.85)';
    ctx.font = `20px ${FONT}`;
    ctx.fillText('벽 두께(상대값)', W / 2, H - 34);
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export interface WallComparisonProps {
  chamber: ChamberId;
  position: Vector3;
  lowSpec: boolean;
  reduceMotion: boolean;
}

export function WallComparison({ chamber, position, lowSpec, reduceMotion }: WallComparisonProps) {
  const group = useRef<Group>(null);
  const texture = useMemo(() => drawComparisonTexture(chamber), [chamber]);
  useEffect(() => () => texture.dispose(), [texture]);

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const amp = reduceMotion ? 0.024 : 0.08;
    g.position.set(position.x, position.y + amp * Math.sin(runtime.time * 1.3), position.z);
  });

  return (
    <group ref={group} position={position}>
      <Billboard>
        <mesh renderOrder={2}>
          <planeGeometry args={[3.0, 2.25]} />
          <meshBasicMaterial map={texture} transparent toneMapped={false} fog={false} depthWrite={false} side={DoubleSide} />
        </mesh>
        <mesh position={[0, 0, -0.03]} renderOrder={1}>
          <planeGeometry args={[3.2, 2.44]} />
          <meshBasicMaterial color={PALETTE.holo} transparent opacity={0.16} toneMapped={false} fog={false} depthWrite={false} side={DoubleSide} />
        </mesh>
      </Billboard>
      {/* 화면을 띄우는 작은 투사기 */}
      <mesh position={[0, -1.55, 0]}>
        <cylinderGeometry args={[0.32, 0.46, 0.22, 14]} />
        {lowSpec ? (
          <meshLambertMaterial color="#eef8fb" emissive="#cfefff" emissiveIntensity={0.35} flatShading />
        ) : (
          <meshStandardMaterial color="#eef8fb" emissive="#cfefff" emissiveIntensity={0.35} roughness={0.4} flatShading />
        )}
      </mesh>
      <mesh position={[0, -1.3, 0]}>
        <cylinderGeometry args={[0.95, 0.28, 0.5, 14, 1, true]} />
        <meshBasicMaterial color={PALETTE.holo} transparent opacity={0.13} toneMapped={false} depthWrite={false} side={DoubleSide} />
      </mesh>
    </group>
  );
}
