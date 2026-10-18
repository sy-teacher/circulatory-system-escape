// 학습용 시각화 입자(산소·이산화탄소·영양소·노폐물·물), 이동 방향 화살표, 안내 표지판.
// ※ 입자와 화살표는 실제 모양·크기가 아니다. 표지판(LearningSign)으로 반드시 알린다.

import { Billboard } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  BufferAttribute,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  InstancedMesh,
  LatheGeometry,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  SphereGeometry,
  SRGBColorSpace,
  TetrahedronGeometry,
  Vector2,
  Vector3,
  type BufferGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PALETTE } from '../palette';
import { runtime } from '../runtime';

export type MoleculeKind = 'o2' | 'co2' | 'nutrient' | 'waste' | 'water';

export interface MoleculeRoute {
  from: Vector3;
  to: Vector3;
}

export interface MoleculesProps {
  kind: MoleculeKind;
  routes: MoleculeRoute[];
  /** 입자 수(경로마다 고르게 나눈다) */
  count: number;
  /** 이동 속도(월드 단위/초) */
  speed?: number;
  lowSpec?: boolean;
  reduceMotion?: boolean;
  /** 크기 배율 */
  size?: number;
  /** 흔들림 크기(월드 단위) */
  wobble?: number;
  seed?: number;
}

/** 물 입자 색(혈액이 아니므로 아주 연한 색. 혈액·혈장은 파란색으로 그리지 않는다) */
export const WATER_COLOR = '#e8f6fb';

export const KR_FONT = "'Apple SD Gothic Neo','Noto Sans KR','Malgun Gothic',sans-serif";

function paint(g: BufferGeometry, color: string): BufferGeometry {
  const c = new Color(color);
  const n = g.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new BufferAttribute(arr, 3));
  return g;
}

function merge(parts: BufferGeometry[]): BufferGeometry {
  const ni = parts.map((p) => (p.index ? p.toNonIndexed() : p));
  const g = mergeGeometries(ni, false);
  parts.forEach((p) => p.dispose());
  ni.forEach((p) => p.dispose());
  return g;
}

/** 입자 모양(모두 정점 색을 가진다) */
export function createMoleculeGeometry(kind: MoleculeKind, lowSpec = false): BufferGeometry {
  const seg = lowSpec ? 6 : 10;
  switch (kind) {
    case 'o2': {
      // 산소 원자 두 개가 붙은 모양
      const a = paint(new SphereGeometry(0.11, seg, Math.ceil(seg * 0.7)).translate(-0.085, 0, 0), PALETTE.oxygen);
      const b = paint(new SphereGeometry(0.11, seg, Math.ceil(seg * 0.7)).translate(0.085, 0, 0), PALETTE.oxygen);
      return merge([a, b]);
    }
    case 'co2': {
      // 가운데 회색 + 양쪽의 밝은 공
      const c = paint(new SphereGeometry(0.11, seg, Math.ceil(seg * 0.7)), PALETTE.co2);
      const a = paint(new SphereGeometry(0.085, seg, Math.ceil(seg * 0.7)).translate(-0.17, 0, 0), PALETTE.co2Accent);
      const b = paint(new SphereGeometry(0.085, seg, Math.ceil(seg * 0.7)).translate(0.17, 0, 0), PALETTE.co2Accent);
      return merge([c, a, b]);
    }
    case 'nutrient':
      // 작은 육각기둥
      return merge([paint(new CylinderGeometry(0.12, 0.12, 0.09, 6), PALETTE.nutrient)]);
    case 'waste':
      // 작은 사면체
      return merge([paint(new TetrahedronGeometry(0.14), PALETTE.waste)]);
    case 'water': {
      // 작은 물방울
      const pts: Vector2[] = [];
      const steps = 8;
      for (let i = 0; i <= steps; i++) {
        const k = i / steps;
        const y = -0.09 + k * 0.24;
        const r = k < 0.55 ? Math.sin((k / 0.55) * Math.PI * 0.5) * 0.09 : 0.09 * (1 - (k - 0.55) / 0.45) ** 1.3;
        pts.push(new Vector2(Math.max(0.0001, r), y));
      }
      return merge([paint(new LatheGeometry(pts, seg), WATER_COLOR)]);
    }
  }
}

interface Particle {
  route: number;
  phase: number;
  w1: number;
  w2: number;
  wp: number;
  axis: Vector3;
  spin: number;
}

function rng(seed: number) {
  let h = (seed * 2654435761) >>> 0 || 1;
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 100000) / 100000;
  };
}

/**
 * from → to 를 따라 반복해서 움직이는 학습용 입자(InstancedMesh 하나).
 * 출발·도착점에서 서서히 나타나고 사라지며, 가운데에서 살짝 흔들린다. React 상태는 바꾸지 않는다.
 */
export function Molecules({
  kind,
  routes,
  count,
  speed = 0.55,
  lowSpec = false,
  reduceMotion = false,
  size = 1,
  wobble = 0.12,
  seed = 1,
}: MoleculesProps) {
  const mesh = useRef<InstancedMesh>(null);
  const halo = useRef<InstancedMesh>(null);
  const n = routes.length > 0 ? Math.max(1, Math.round(lowSpec ? count * 0.6 : count)) : 0;

  const geometry = useMemo(() => createMoleculeGeometry(kind, lowSpec), [kind, lowSpec]);
  const haloGeometry = useMemo(() => new SphereGeometry(0.24, 8, 6), []);
  const material = useMemo(() => {
    const emissive = new Color(kind === 'o2' ? PALETTE.oxygenGlow : kind === 'water' ? '#ffffff' : '#000000');
    const emissiveIntensity = kind === 'o2' ? 0.45 : kind === 'water' ? 0.2 : 0;
    return lowSpec
      ? new MeshLambertMaterial({ vertexColors: true, emissive, emissiveIntensity })
      : new MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0, emissive, emissiveIntensity });
  }, [kind, lowSpec]);
  const haloMaterial = useMemo(
    () => new MeshBasicMaterial({ color: PALETTE.oxygenGlow, transparent: true, opacity: 0.28, depthWrite: false, toneMapped: false }),
    [],
  );
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  useEffect(
    () => () => {
      haloGeometry.dispose();
      haloMaterial.dispose();
    },
    [haloGeometry, haloMaterial],
  );

  // 경로마다 길이와 흔들림 방향(경로에 수직인 두 축)
  const routeData = useMemo(
    () =>
      routes.map((r) => {
        const d = r.to.clone().sub(r.from);
        const len = Math.max(0.01, d.length());
        d.normalize();
        const ref = Math.abs(d.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0);
        const u = new Vector3().crossVectors(d, ref).normalize();
        const v = new Vector3().crossVectors(d, u).normalize();
        return { from: r.from, to: r.to, len, u, v };
      }),
    [routes],
  );

  const particles = useMemo<Particle[]>(() => {
    const r = rng(seed + n * 7);
    return Array.from({ length: n }, (_, i) => ({
      route: i % Math.max(1, routes.length),
      // 같은 경로의 입자들이 고르게 퍼지도록
      phase: (Math.floor(i / Math.max(1, routes.length)) / Math.max(1, Math.ceil(n / Math.max(1, routes.length))) + r() * 0.25) % 1,
      w1: 1.2 + r() * 1.4,
      w2: 0.9 + r() * 1.3,
      wp: r() * Math.PI * 2,
      axis: new Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize(),
      spin: 0.6 + r() * 1.2,
    }));
  }, [n, routes.length, seed]);

  const tmp = useMemo(() => ({ o: new Object3D(), q: new Quaternion() }), []);

  useFrame(() => {
    const m = mesh.current;
    if (!m || n === 0) return;
    const time = runtime.time;
    const wob = wobble * (reduceMotion ? 0.3 : 1);
    const spinK = reduceMotion ? 0.3 : 1;
    for (let i = 0; i < n; i++) {
      const p = particles[i];
      const r = routeData[p.route];
      const k = (((p.phase + (time * speed) / r.len) % 1) + 1) % 1;
      const env = Math.sin(Math.PI * k);
      const a = Math.sin(time * p.w1 + p.wp) * wob * env;
      const b = Math.cos(time * p.w2 + p.wp * 1.7) * wob * env;
      const o = tmp.o;
      o.position.copy(r.from).lerp(r.to, k).addScaledVector(r.u, a).addScaledVector(r.v, b);
      // 출발·도착 근처에서 서서히 나타나고 사라짐
      const fadeIn = Math.min(1, k / 0.12);
      const fadeOut = Math.min(1, (1 - k) / 0.12);
      const f = Math.min(fadeIn, fadeOut);
      o.scale.setScalar(size * f * f * (3 - 2 * f));
      tmp.q.setFromAxisAngle(p.axis, time * p.spin * spinK + p.wp);
      o.quaternion.copy(tmp.q);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      if (halo.current) halo.current.setMatrixAt(i, o.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
    if (halo.current) halo.current.instanceMatrix.needsUpdate = true;
  });

  if (n === 0) return null;
  return (
    <group>
      <instancedMesh ref={mesh} args={[geometry, material, n]} frustumCulled={false} />
      {kind === 'o2' && !lowSpec ? (
        <instancedMesh ref={halo} args={[haloGeometry, haloMaterial, n]} frustumCulled={false} renderOrder={3} />
      ) : null}
    </group>
  );
}

// ─────────────────────────────────────────────
//  이동 방향 화살표(학습용)
// ─────────────────────────────────────────────

const Y_AXIS = new Vector3(0, 1, 0);

export function FlowArrow({
  from,
  to,
  color,
  radius = 0.045,
}: {
  from: Vector3;
  to: Vector3;
  color: string;
  /** 화살대 굵기 */
  radius?: number;
}) {
  const { len, head, quat } = useMemo(() => {
    const d = to.clone().sub(from);
    const l = d.length();
    return {
      len: l,
      head: Math.min(0.3, l * 0.38),
      quat: new Quaternion().setFromUnitVectors(Y_AXIS, d.normalize()),
    };
  }, [from, to]);
  const shaft = Math.max(0.01, len - head);
  return (
    <group position={from} quaternion={quat}>
      <mesh position={[0, shaft / 2, 0]}>
        <cylinderGeometry args={[radius, radius, shaft, 6]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      <mesh position={[0, shaft + head / 2, 0]}>
        <coneGeometry args={[radius * 2.9, head, 10]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** 입자 종류별 화살표 색 */
export const ARROW_COLOR: Record<MoleculeKind, string> = {
  o2: PALETTE.oxygenGlow,
  co2: PALETTE.co2Accent,
  nutrient: PALETTE.nutrient,
  waste: PALETTE.waste,
  water: '#cfeaf2',
};

// ─────────────────────────────────────────────
//  캔버스 글자(네트워크 글꼴을 쓰지 않는다)
// ─────────────────────────────────────────────

/** 캔버스에 직접 그린 텍스처. draw는 처음 한 번만 실행된다. */
export function useCanvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, key: string) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (ctx) draw(ctx, width, height);
    const t = new CanvasTexture(canvas);
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 4;
    t.needsUpdate = true;
    return t;
    // key가 바뀔 때만 다시 그린다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, key]);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/** 주어진 폭에 들어가도록 글자 크기를 줄인다 */
function fitFont(ctx: CanvasRenderingContext2D, text: string, maxW: number, size: number, weight = 500): number {
  let s = size;
  for (; s > 12; s -= 2) {
    ctx.font = `${weight} ${s}px ${KR_FONT}`;
    if (ctx.measureText(text).width <= maxW) break;
  }
  return s;
}

function drawIcon(ctx: CanvasRenderingContext2D, kind: MoleculeKind, x: number, y: number, r: number) {
  ctx.save();
  ctx.lineWidth = Math.max(2, r * 0.18);
  const circle = (cx: number, cy: number, rr: number, fill: string, stroke?: string) => {
    ctx.beginPath();
    ctx.arc(cx, cy, rr, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.stroke();
    }
  };
  switch (kind) {
    case 'o2':
      circle(x - r * 0.42, y, r * 0.55, PALETTE.oxygen, PALETTE.oxygenGlow);
      circle(x + r * 0.42, y, r * 0.55, PALETTE.oxygen, PALETTE.oxygenGlow);
      break;
    case 'co2':
      circle(x - r * 0.7, y, r * 0.38, PALETTE.co2Accent);
      circle(x + r * 0.7, y, r * 0.38, PALETTE.co2Accent);
      circle(x, y, r * 0.5, PALETTE.co2);
      break;
    case 'nutrient': {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
        const px = x + Math.cos(a) * r * 0.7;
        const py = y + Math.sin(a) * r * 0.7;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = PALETTE.nutrient;
      ctx.fill();
      break;
    }
    case 'waste':
      ctx.beginPath();
      ctx.moveTo(x, y - r * 0.7);
      ctx.lineTo(x + r * 0.72, y + r * 0.55);
      ctx.lineTo(x - r * 0.72, y + r * 0.55);
      ctx.closePath();
      ctx.fillStyle = PALETTE.waste;
      ctx.fill();
      break;
    case 'water':
      ctx.beginPath();
      ctx.moveTo(x, y - r * 0.8);
      ctx.quadraticCurveTo(x + r * 0.7, y + r * 0.05, x, y + r * 0.65);
      ctx.quadraticCurveTo(x - r * 0.7, y + r * 0.05, x, y - r * 0.8);
      ctx.fillStyle = WATER_COLOR;
      ctx.fill();
      ctx.strokeStyle = '#8cc3d1';
      ctx.stroke();
      break;
  }
  ctx.restore();
}

export interface LegendItem {
  kind: MoleculeKind;
  label: string;
}

export const DEFAULT_LEGEND: LegendItem[] = [
  { kind: 'o2', label: 'O₂ 산소' },
  { kind: 'co2', label: 'CO₂ 이산화탄소' },
  { kind: 'nutrient', label: '영양소' },
  { kind: 'waste', label: '노폐물' },
];

export const SIGN_TITLE = '학습용 시각화:';
export const SIGN_BODY = '입자와 화살표는 실제 모양·크기가 아닙니다';
/** 글자를 크게 쓰기 위해 두 줄로 나눈다 */
const SIGN_BODY_LINES = ['입자와 화살표는', '실제 모양·크기가 아닙니다'];
export const SCALE_NOTE = '탐사선과 혈관의 크기도 학습을 위해 조정했어요';

const SIGN_W = 1024;
const LEGEND_PER_ROW = 2;
const LEGEND_ROW_H = 74;

/** 표지판 캔버스 높이(px). 월드 높이 = 폭 × 높이 / 1024 */
export function signCanvasHeight(legendCount: number, hasNote: boolean): number {
  const rows = Math.ceil(legendCount / LEGEND_PER_ROW);
  return 300 + rows * LEGEND_ROW_H + (hasNote ? 62 : 0) + 34;
}

/**
 * 학습용 시각화 안내 표지판(캔버스 글자). 기본 범례: O₂ 산소 · CO₂ 이산화탄소 · 영양소 · 노폐물
 * quaternion을 주지 않으면 항상 카메라를 바라본다.
 */
export function LearningSign({
  position,
  quaternion,
  width = 2.3,
  legend = DEFAULT_LEGEND,
  note = SCALE_NOTE,
}: {
  position: Vector3;
  quaternion?: Quaternion;
  /** 월드 폭 */
  width?: number;
  legend?: LegendItem[];
  /** 맨 아래 작은 안내(없으면 null) */
  note?: string | null;
}) {
  const W = SIGN_W;
  const H = signCanvasHeight(legend.length, !!note);
  const key = legend.map((l) => l.kind + l.label).join('|') + (note ?? '');
  const texture = useCanvasTexture(
    W,
    H,
    (ctx, w, h) => {
      const pad = 20;
      roundRect(ctx, pad, pad, w - pad * 2, h - pad * 2, 44);
      ctx.fillStyle = 'rgba(255,255,255,0.97)';
      ctx.fill();
      ctx.lineWidth = 10;
      ctx.strokeStyle = '#5cc8d8';
      ctx.stroke();
      const inner = w - pad * 2 - 72;
      const x0 = pad + 36;
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#2f2340';
      fitFont(ctx, SIGN_TITLE, inner, 68, 800);
      ctx.fillText(SIGN_TITLE, x0, 96);
      ctx.fillStyle = '#3b2f4a';
      const bodySize = Math.min(...SIGN_BODY_LINES.map((line) => fitFont(ctx, line, inner, 62, 700)));
      ctx.font = `700 ${bodySize}px ${KR_FONT}`;
      SIGN_BODY_LINES.forEach((line, i) => ctx.fillText(line, x0, 178 + i * 74));
      // 범례(한 줄에 두 개씩)
      const iconR = 26;
      const colW = inner / LEGEND_PER_ROW;
      let size = 52;
      for (; size > 18; size -= 2) {
        ctx.font = `700 ${size}px ${KR_FONT}`;
        const widest = Math.max(...legend.map((it) => ctx.measureText(it.label).width));
        if (iconR * 2.6 + 12 + widest <= colW - 12) break;
      }
      legend.forEach((it, i) => {
        const row = Math.floor(i / LEGEND_PER_ROW);
        const col = i % LEGEND_PER_ROW;
        const x = x0 + col * colW;
        const y = 330 + row * LEGEND_ROW_H;
        drawIcon(ctx, it.kind, x + iconR * 1.3, y, iconR);
        ctx.fillStyle = '#2f2340';
        ctx.fillText(it.label, x + iconR * 2.6 + 12, y + 2);
      });
      if (note) {
        ctx.fillStyle = '#6b5f78';
        fitFont(ctx, note, inner, 38, 600);
        ctx.fillText(note, x0, h - pad - 52);
      }
    },
    key,
  );
  const height = (width * H) / W;
  const plane = (
    <mesh>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial map={texture} alphaTest={0.5} side={DoubleSide} toneMapped={false} fog={false} />
    </mesh>
  );
  if (!quaternion) {
    return (
      <Billboard position={position}>
        {plane}
      </Billboard>
    );
  }
  return (
    <group position={position} quaternion={quaternion}>
      {plane}
    </group>
  );
}

/**
 * 작은 글자 표(둥근 바탕 + 글자). 정답 장소 이름은 쓰지 않는다(예: '공기', '확대 관찰 창').
 * 기본은 항상 카메라를 바라본다.
 */
export function CanvasLabel({
  text,
  position,
  height = 0.42,
  color = '#2f2340',
  background = 'rgba(255,255,255,0.95)',
  border = '#5cc8d8',
  billboard = true,
  quaternion,
  renderOrder = 3,
}: {
  text: string;
  position: Vector3 | [number, number, number];
  /** 월드 높이 */
  height?: number;
  color?: string;
  background?: string;
  border?: string;
  billboard?: boolean;
  quaternion?: Quaternion;
  renderOrder?: number;
}) {
  // 글자 폭에 맞춘 캔버스 크기
  const H = 128;
  const W = useMemo(() => {
    const c = document.createElement('canvas').getContext('2d');
    if (!c) return 512;
    c.font = `700 72px ${KR_FONT}`;
    return Math.min(2048, Math.max(160, Math.ceil(c.measureText(text).width + 88)));
  }, [text]);
  const texture = useCanvasTexture(
    W,
    H,
    (ctx, w, h) => {
      roundRect(ctx, 6, 6, w - 12, h - 12, (h - 12) / 2);
      ctx.fillStyle = background;
      ctx.fill();
      ctx.lineWidth = 6;
      ctx.strokeStyle = border;
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.font = `700 72px ${KR_FONT}`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillText(text, w / 2, h / 2 + 3);
    },
    `${text}|${color}|${background}|${border}`,
  );
  const width = (height * W) / H;
  const plane = (
    <mesh renderOrder={renderOrder}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial map={texture} alphaTest={0.5} side={DoubleSide} toneMapped={false} fog={false} />
    </mesh>
  );
  const pos = position instanceof Vector3 ? position : new Vector3(...position);
  if (billboard && !quaternion) return <Billboard position={pos}>{plane}</Billboard>;
  return (
    <group position={pos} quaternion={quaternion}>
      {plane}
    </group>
  );
}
