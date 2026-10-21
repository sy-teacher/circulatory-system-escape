// 놀이공원(도입·탈출 장면). 맑은 낮의 놀이공원과 '회전 열차'.
// 실제 놀이공원의 로고·놀이기구를 따라 하지 않은 일반적인 모습이다(장소 이름은 대사에만 나온다).
// 탐사선을 그리지 않으므로(vehicle: 'none') 이 컴포넌트가 열차 칸과 친구 '민규'를 직접 그린다.

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  BackSide,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Euler,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Fog,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Shape,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
  type Material,
  type Object3D,
  type Side,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useApp } from '../../state/store';
import { runtime } from '../runtime';
import { PALETTE } from '../palette';
import { computePathFrames, poseOnPath, samplePath, type PathFrames } from '../shared/pathFrames';
import type { LocationDef, LocationProps } from '../types';

// ─────────────────────────────────────────────────────────────
//  기본 값
// ─────────────────────────────────────────────────────────────

const FONT = `'Apple SD Gothic Neo','Noto Sans KR','Malgun Gothic',sans-serif`;

const BACKGROUND = '#bfe6ff';
const FOG = { color: '#d4ecff', near: 38, far: 165 };
const AMBIENT = { sky: '#fff6dc', ground: '#a6d98c', intensity: 1.0 };

/** 이 장면의 해(직접 그리는 조명) */
const SUN_DIR = new Vector3(-0.42, 0.78, 0.46).normalize();
const SUN_INTENSITY = 2.2;
const HEMI_INTENSITY = 0.95;

/** 터널 진입 연출: 어두워지는 시간(초)과 어두운 상태의 색 */
const DIM_SECONDS = 2;
const DIM_FOG = new Color('#2a2540');
const DIM_SKY = new Color('#2f2c48');
const DIM_FOG_NEAR = 6;
const DIM_FOG_FAR = 42;

/** 회전 열차 선로(닫힌 고리). t = 0이 승차장. 완만한 높낮이(수직 접선 없음). */
const TRACK_POINTS: [number, number, number][] = [
  [0, 0.6, 0],
  [0, 0.6, -12],
  [2, 0.9, -24],
  [8, 1.6, -34],
  [20, 2.4, -38],
  [32, 2.2, -30],
  [36, 1.6, -16],
  [32, 1.2, -2],
  [24, 1.8, 8],
  [14, 1.2, 14],
  [6, 0.7, 14],
  [1.2, 0.6, 7],
];

const PARK_TRACK = new CatmullRomCurve3(
  TRACK_POINTS.map(([x, y, z]) => new Vector3(x, y, z)),
  true,
  'centripetal',
);

/** 터널 구간(승차장에서 출발해 선로 길이 기준 거리, 월드 단위) */
const TUNNEL_FROM = 9;
const TUNNEL_TO = 21;
const TUNNEL_R = 2.4;

/** 뒤 칸 간격 */
const TRAILER_GAP = 2.55;

const UP = new Vector3(0, 1, 0);

// ─────────────────────────────────────────────────────────────
//  도우미
// ─────────────────────────────────────────────────────────────

/** 만든 geometry·material·texture를 모아 두었다가 한 번에 정리 */
class Bag {
  private items: { dispose: () => void }[] = [];
  private mats = new Map<string, MeshLambertMaterial>();

  add<T extends { dispose: () => void }>(x: T): T {
    this.items.push(x);
    return x;
  }

  /** 같은 색·옵션의 램버트 재질은 하나만 만든다 */
  lam(color: string, o: { side?: Side; vertexColors?: boolean; smooth?: boolean } = {}): MeshLambertMaterial {
    const key = `${color}|${o.side ?? 0}|${o.vertexColors ? 1 : 0}|${o.smooth ? 1 : 0}`;
    let m = this.mats.get(key);
    if (!m) {
      m = this.add(
        new MeshLambertMaterial({
          color,
          vertexColors: o.vertexColors ?? false,
          flatShading: !o.smooth,
        }),
      );
      if (o.side !== undefined) m.side = o.side;
      this.mats.set(key, m);
    }
    return m;
  }

  dispose(): void {
    for (const x of this.items) x.dispose();
    this.items.length = 0;
    this.mats.clear();
  }
}

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const _m = new Matrix4();
const _q = new Quaternion();
const _e = new Euler();
const _p = new Vector3();
const _s = new Vector3();

function setInst(mesh: InstancedMesh, i: number, x: number, y: number, z: number, ry = 0, sx = 1, sy = sx, sz = sx): void {
  _q.setFromEuler(_e.set(0, ry, 0));
  _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
  mesh.setMatrixAt(i, _m);
}

function finishInst(mesh: InstancedMesh, dynamic = false): InstancedMesh {
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  if (dynamic) mesh.frustumCulled = false;
  else mesh.computeBoundingSphere();
  return mesh;
}

function mesh(geo: BufferGeometry, mat: Material, x = 0, y = 0, z = 0, parent?: Object3D): Mesh {
  const m = new Mesh(geo, mat);
  m.position.set(x, y, z);
  parent?.add(m);
  return m;
}

/** 단위 상자를 크기만큼 늘려 붙인다(작은 부품용) */
function makeBlock(unit: BoxGeometry) {
  return (parent: Object3D, mat: Material, w: number, h: number, d: number, x: number, y: number, z: number): Mesh => {
    const m = new Mesh(unit, mat);
    m.scale.set(w, h, d);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };
}

/** 원기둥·원뿔에 줄무늬 색(면의 각도 기준) */
function striped(src: BufferGeometry, a: string, b: string, segs: number, phase = 0): BufferGeometry {
  const g = src.index ? src.toNonIndexed() : src;
  if (g !== src) src.dispose();
  const pos = g.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  const ca = new Color(a);
  const cb = new Color(b);
  const step = (Math.PI * 2) / segs;
  for (let i = 0; i < pos.count; i += 3) {
    const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
    const cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
    const ang = Math.atan2(cz, cx) + Math.PI + phase;
    const c = Math.floor(ang / step) % 2 === 0 ? ca : cb;
    for (let j = 0; j < 3; j++) {
      col[(i + j) * 3] = c.r;
      col[(i + j) * 3 + 1] = c.g;
      col[(i + j) * 3 + 2] = c.b;
    }
  }
  g.setAttribute('color', new BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

function boxAt(w: number, h: number, d: number, x: number, y: number, z: number): BoxGeometry {
  const g = new BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

/** 여러 상자를 하나의 geometry로 합친다 */
function mergedBoxes(parts: [number, number, number, number, number, number][]): BufferGeometry {
  const list = parts.map((p) => boxAt(...p));
  const merged = mergeGeometries(list, false);
  for (const g of list) g.dispose();
  return merged ?? new BoxGeometry(1, 1, 1);
}

/**
 * 움직이지 않는 작은 부품을 같은 재질끼리 하나의 geometry로 합쳐 그리기 호출을 줄인다.
 * 하위 Group은 그 안에서 따로 합친다(Group 단위 움직임은 유지). userData.keep인 메시는 그대로 둔다.
 */
function bake(group: Object3D, bag: Bag): void {
  const buckets = new Map<Material, Mesh[]>();
  for (const c of [...group.children]) {
    if (c instanceof Group) {
      bake(c, bag);
      continue;
    }
    if (!(c instanceof Mesh) || c instanceof InstancedMesh || c.userData.keep || c.children.length > 0) continue;
    if (Array.isArray(c.material)) continue;
    const mat = c.material as Material;
    const list = buckets.get(mat) ?? [];
    list.push(c);
    buckets.set(mat, list);
  }
  const sig = (g: BufferGeometry) => `${g.index ? 1 : 0}|${Object.keys(g.attributes).sort().join(',')}`;
  for (const [mat, list] of buckets) {
    if (list.length < 2) continue;
    const s0 = sig(list[0].geometry);
    if (list.some((m) => sig(m.geometry) !== s0 || m.renderOrder !== list[0].renderOrder)) continue;
    const geos = list.map((m) => {
      m.updateMatrix();
      return m.geometry.clone().applyMatrix4(m.matrix);
    });
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    bag.add(merged);
    for (const m of list) group.remove(m);
    const one = new Mesh(merged, mat);
    one.renderOrder = list[0].renderOrder;
    group.add(one);
  }
}

// ─────────────────────────────────────────────────────────────
//  글자 그림(CanvasTexture, 시스템 한글 글꼴)
// ─────────────────────────────────────────────────────────────

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d');
  if (g) draw(g);
  const tex = new CanvasTexture(cv);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function fitFont(g: CanvasRenderingContext2D, text: string, maxW: number, size: number, weight = 800): void {
  let s = size;
  for (;;) {
    g.font = `${weight} ${s}px ${FONT}`;
    if (g.measureText(text).width <= maxW || s <= 10) return;
    s -= 2;
  }
}

function signTexture(text: string, bg: string, fg: string, edge: string, w = 512, h = 144): CanvasTexture {
  return canvasTexture(w, h, (g) => {
    roundRect(g, 6, 6, w - 12, h - 12, 28);
    g.fillStyle = bg;
    g.fill();
    g.lineWidth = 10;
    g.strokeStyle = edge;
    g.stroke();
    g.fillStyle = fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    fitFont(g, text, w - 60, Math.floor(h * 0.5));
    g.fillText(text, w / 2, h / 2 + 2);
  });
}

/** 탈출 장면: 손에 든 '순환계 지도'(완성된 지도) */
function drawMapSheet(g: CanvasRenderingContext2D, W: number): void {
  const s = W / 1024;
  g.save();
  g.scale(s, s);
  // 종이
  g.fillStyle = '#fffaf0';
  g.fillRect(0, 0, 1024, 720);
  g.strokeStyle = 'rgba(150, 130, 110, 0.14)';
  g.lineWidth = 2;
  for (let x = 32; x < 1024; x += 48) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, 720);
    g.stroke();
  }
  for (let y = 32; y < 720; y += 48) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(1024, y);
    g.stroke();
  }
  g.strokeStyle = '#e2d3b6';
  g.lineWidth = 10;
  g.strokeRect(5, 5, 1014, 710);

  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#3a2f2a';
  g.font = `900 54px ${FONT}`;
  g.fillText('순환계 지도', 512, 62);

  // 완성 도장
  g.save();
  g.translate(916, 80);
  g.rotate(-0.22);
  g.strokeStyle = '#2f9e5a';
  g.fillStyle = '#2f9e5a';
  g.lineWidth = 6;
  g.beginPath();
  g.arc(0, 0, 50, 0, Math.PI * 2);
  g.stroke();
  g.font = `900 30px ${FONT}`;
  g.fillText('완성', 0, 2);
  g.restore();

  const label = (text: string, x: number, y: number, size: number, color = '#5a3a3a', weight = 700) => {
    g.fillStyle = color;
    g.font = `${weight} ${size}px ${FONT}`;
    g.fillText(text, x, y);
  };
  const place = (text: string, cx: number, cy: number, w: number, h: number, fill: string, edge: string) => {
    roundRect(g, cx - w / 2, cy - h / 2, w, h, 22);
    g.fillStyle = fill;
    g.fill();
    g.lineWidth = 5;
    g.strokeStyle = edge;
    g.stroke();
    label(text, cx, cy + 2, 34, '#4a3030', 800);
  };

  place('허파', 512, 170, 220, 80, '#ffe4e8', '#e48a9a');
  place('온몸', 512, 580, 300, 80, '#fff1d6', '#e0b26a');

  // 심장(앞에서 본 모습: 몸의 오른쪽 = 그림의 왼쪽)
  roundRect(g, 352, 270, 320, 200, 36);
  g.fillStyle = '#ffd9de';
  g.fill();
  g.lineWidth = 6;
  g.strokeStyle = PALETTE.muscle;
  g.stroke();
  g.strokeStyle = PALETTE.muscleDeep;
  g.lineWidth = 9;
  g.beginPath();
  g.moveTo(512, 272);
  g.lineTo(512, 468);
  g.stroke();
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(356, 370);
  g.lineTo(506, 370);
  g.moveTo(518, 370);
  g.lineTo(668, 370);
  g.stroke();
  label('우심방', 432, 321, 27);
  label('우심실', 432, 420, 27);
  label('좌심방', 592, 321, 27);
  label('좌심실', 592, 420, 27);

  const RICH = PALETTE.rbcRich;
  const POOR = PALETTE.rbcPoor;
  const route = (pts: [number, number][], color: string) => {
    g.lineJoin = 'round';
    g.lineCap = 'round';
    for (const [width, c] of [
      [20, '#fffaf0'],
      [10, color],
    ] as const) {
      g.strokeStyle = c;
      g.lineWidth = width;
      g.beginPath();
      g.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
      g.stroke();
    }
    // 화살표: 끝과 가장 긴 구간의 가운데
    const arrow = (x: number, y: number, dx: number, dy: number) => {
      const L = Math.hypot(dx, dy) || 1;
      const ux = dx / L;
      const uy = dy / L;
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x - ux * 24 - uy * 13, y - uy * 24 + ux * 13);
      g.lineTo(x - ux * 24 + uy * 13, y - uy * 24 - ux * 13);
      g.closePath();
      g.fill();
    };
    const n = pts.length;
    arrow(pts[n - 1][0], pts[n - 1][1], pts[n - 1][0] - pts[n - 2][0], pts[n - 1][1] - pts[n - 2][1]);
    let best = 1;
    let bestLen = 0;
    for (let i = 1; i < n; i++) {
      const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (l > bestLen) {
        bestLen = l;
        best = i;
      }
    }
    const [ax, ay] = pts[best - 1];
    const [bx, by] = pts[best];
    arrow((ax + bx) / 2 + (bx - ax) * 0.06, (ay + by) / 2 + (by - ay) * 0.06, bx - ax, by - ay);
  };

  // 온몸 → 우심방(산소가 적은 혈액)
  route(
    [
      [362, 580],
      [200, 580],
      [200, 325],
      [346, 325],
    ],
    POOR,
  );
  // 우심실 → 허파(산소가 적은 혈액) — 위의 선 위로 지나간다
  route(
    [
      [352, 418],
      [290, 418],
      [290, 170],
      [396, 170],
    ],
    POOR,
  );
  // 허파 → 좌심방(산소가 풍부한 혈액)
  route(
    [
      [622, 170],
      [734, 170],
      [734, 322],
      [678, 322],
    ],
    RICH,
  );
  // 좌심실 → 온몸(산소가 풍부한 혈액)
  route(
    [
      [672, 418],
      [824, 418],
      [824, 580],
      [668, 580],
    ],
    RICH,
  );

  label('폐동맥', 245, 250, 22);
  label('대정맥', 150, 470, 22);
  label('폐정맥', 786, 250, 22);
  label('대동맥', 880, 500, 22);
  label('허파순환', 512, 238, 22, '#8a5a66', 800);
  label('온몸순환', 512, 508, 22, '#8a5a66', 800);

  // 범례
  g.lineCap = 'round';
  g.lineWidth = 10;
  g.strokeStyle = RICH;
  g.beginPath();
  g.moveTo(130, 650);
  g.lineTo(180, 650);
  g.stroke();
  g.strokeStyle = POOR;
  g.beginPath();
  g.moveTo(520, 650);
  g.lineTo(570, 650);
  g.stroke();
  g.textAlign = 'left';
  label('산소가 풍부한 혈액', 194, 652, 24, '#4a3030');
  label('산소가 적은 혈액', 584, 652, 24, '#4a3030');
  g.textAlign = 'center';
  label('(선의 색은 산소 상태를 나타낸 기호예요 · 심장의 좌우는 몸 기준)', 512, 692, 19, '#7a6a60', 600);
  g.restore();
}

// ─────────────────────────────────────────────────────────────
//  장면 구성 요소
// ─────────────────────────────────────────────────────────────

interface FrameCtx {
  t: number;
  dt: number;
  /** 어두워진 정도(0~1, 부드럽게 보간된 값) */
  dim: number;
  /** 움직임 크기 배율(움직임 줄이기: 0.3) */
  motion: number;
  camPos: Vector3;
}

type Updater = (c: FrameCtx) => void;

interface World {
  root: Group;
  bag: Bag;
  hemi: HemisphereLight;
  sun: DirectionalLight;
  updaters: Updater[];
}

function buildSky(bag: Bag, root: Group, lowSpec: boolean, updaters: Updater[]): void {
  const R = 95;
  const geo = bag.add(new SphereGeometry(R, lowSpec ? 16 : 28, lowSpec ? 10 : 16));
  const pos = geo.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  const zen = new Color('#3d9cf5');
  const hor = new Color('#c8ecff');
  const low = new Color('#e6f6ff');
  const c = new Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / R;
    if (y >= 0) c.copy(hor).lerp(zen, Math.pow(y, 0.55));
    else c.copy(hor).lerp(low, Math.min(1, -y * 3));
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new BufferAttribute(col, 3));
  const mat = bag.add(new MeshBasicMaterial({ vertexColors: true, side: BackSide, fog: false, depthWrite: false }));
  const sky = new Mesh(geo, mat);
  sky.renderOrder = -10;
  sky.frustumCulled = false;

  const sunGeo = bag.add(new SphereGeometry(1, 16, 12));
  const sunMat = bag.add(new MeshBasicMaterial({ color: '#fff6c8', fog: false, depthWrite: false }));
  const haloMat = bag.add(
    new MeshBasicMaterial({ color: '#fff0b0', fog: false, depthWrite: false, transparent: true, opacity: 0.32 }),
  );
  const sun = new Mesh(sunGeo, sunMat);
  sun.scale.setScalar(4.2);
  sun.position.copy(SUN_DIR).multiplyScalar(86);
  sun.renderOrder = -9;
  const halo = new Mesh(sunGeo, haloMat);
  halo.scale.setScalar(7.5);
  halo.position.copy(sun.position);
  halo.renderOrder = -9;

  const g = new Group();
  g.add(sky, sun, halo);
  root.add(g);
  const white = new Color('#ffffff');
  const sunBase = new Color('#fff6c8');
  updaters.push((ctx) => {
    g.position.copy(ctx.camPos);
    mat.color.copy(white).lerp(DIM_SKY, ctx.dim);
    sunMat.color.copy(sunBase).lerp(DIM_SKY, ctx.dim * 0.85);
    haloMat.opacity = 0.32 * (1 - ctx.dim);
  });
}

function buildClouds(bag: Bag, root: Group, lowSpec: boolean, updaters: Updater[]): void {
  const parts: BufferGeometry[] = [];
  const blobs: [number, number, number, number][] = [
    [0, 0, 0, 3.2],
    [3.4, -0.4, 0.4, 2.5],
    [-3.2, -0.5, -0.2, 2.4],
    [1.2, 1.3, -0.3, 2.2],
    [-1.4, 0.9, 0.6, 2],
  ];
  for (const [x, y, z, r] of blobs) {
    const ico = new IcosahedronGeometry(r, 0);
    ico.translate(x, y, z);
    parts.push(ico);
  }
  const geo = bag.add(mergeGeometries(parts, false) ?? new IcosahedronGeometry(3, 0));
  for (const p of parts) p.dispose();
  const mat = bag.add(
    new MeshLambertMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.45, fog: false, flatShading: true }),
  );
  const n = lowSpec ? 3 : 7;
  const cloud = bag.add(new InstancedMesh(geo, mat, n));
  const r = rng(77);
  const data = Array.from({ length: n }, (_, i) => ({
    x: -80 + (160 * (i + r() * 0.6)) / n,
    y: 30 + r() * 14,
    z: -40 - r() * 50 + (i % 2 === 0 ? 0 : 75),
    s: 0.9 + r() * 0.8,
    ry: r() * Math.PI,
  }));
  root.add(cloud);
  const place = () => {
    data.forEach((d, i) => setInst(cloud, i, d.x, d.y, d.z, d.ry, d.s * 1.4, d.s * 0.8, d.s));
    cloud.instanceMatrix.needsUpdate = true;
  };
  place();
  finishInst(cloud, true);
  updaters.push((ctx) => {
    for (const d of data) {
      d.x += ctx.dt * 0.7 * ctx.motion;
      if (d.x > 95) d.x -= 190;
    }
    place();
    mat.emissiveIntensity = 0.45 * (1 - ctx.dim);
  });
}

function buildGround(bag: Bag, root: Group, lowSpec: boolean): void {
  const grassGeo = bag.add(new CircleGeometry(160, lowSpec ? 28 : 48));
  grassGeo.rotateX(-Math.PI / 2);
  mesh(grassGeo, bag.lam('#8cd067', { smooth: true }), 0, 0, 0, root);

  const overlay = (color: string) =>
    bag.add(new MeshLambertMaterial({ color, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  const sand = overlay('#f2deb0');
  const sand2 = overlay('#f7e7c4');

  const disc = (r: number, x: number, z: number, mat: Material) => {
    const g = bag.add(new CircleGeometry(r, lowSpec ? 18 : 30));
    g.rotateX(-Math.PI / 2);
    mesh(g, mat, x, 0.02, z, root);
  };
  disc(10, -7, -1, sand); // 광장
  disc(8.5, -22, -22, sand2); // 회전목마 바닥
  disc(7.5, 18, -14, sand2); // 천막 바닥

  // 길: 광장 → 회전목마
  const path = (x0: number, z0: number, x1: number, z1: number, w: number) => {
    const L = Math.hypot(x1 - x0, z1 - z0);
    const g = bag.add(new PlaneGeometry(w, L));
    g.rotateX(-Math.PI / 2);
    const m = mesh(g, sand, (x0 + x1) / 2, 0.018, (z0 + z1) / 2, root);
    m.rotation.y = Math.atan2(x1 - x0, z1 - z0);
  };
  path(-9, -6, -20, -18, 3);
}

function buildTrack(bag: Bag, root: Group, frames: PathFrames, lowSpec: boolean): { tA: number; tB: number } {
  const L = frames.length;
  const pts = frames.points.slice(0, -1);
  const offsetCurve = (side: number, down: number) =>
    new CatmullRomCurve3(
      pts.map((p, i) =>
        p.clone().addScaledVector(frames.binormals[i], side).addScaledVector(frames.normals[i], -down),
      ),
      true,
    );
  const segs = lowSpec ? 200 : 360;
  const radial = lowSpec ? 4 : 6;
  const railMat = bag.lam('#ff5d73', { smooth: true });
  for (const side of [-0.45, 0.45]) {
    const geo = bag.add(new TubeGeometry(offsetCurve(side, 0.13), segs, 0.055, radial, true));
    mesh(geo, railMat, 0, 0, 0, root);
  }
  const spine = bag.add(new TubeGeometry(offsetCurve(0, 0.32), lowSpec ? 140 : 240, 0.12, radial, true));
  mesh(spine, bag.lam('#ffd23f', { smooth: true }), 0, 0, 0, root);

  // 침목
  const tieStep = lowSpec ? 1.6 : 0.9;
  const tieN = Math.floor(L / tieStep);
  const ties = bag.add(new InstancedMesh(bag.add(new BoxGeometry(1.15, 0.06, 0.2)), bag.lam('#8a6a55'), tieN));
  const P = new Vector3();
  const T = new Vector3();
  const N = new Vector3();
  const B = new Vector3();
  const basis = new Matrix4();
  for (let i = 0; i < tieN; i++) {
    samplePath(frames, i / tieN, P, T, N, B);
    T.negate();
    basis.makeBasis(B, N, T);
    basis.setPosition(P.addScaledVector(N, -0.2));
    ties.setMatrixAt(i, basis);
  }
  root.add(finishInst(ties));

  // 기둥(터널 구간 제외)
  const tA = TUNNEL_FROM / L;
  const tB = TUNNEL_TO / L;
  const pillarGeo = bag.add(new CylinderGeometry(0.14, 0.2, 1, 6));
  pillarGeo.translate(0, 0.5, 0);
  const spots: Vector3[] = [];
  for (let s = 0; s < L; s += 4) {
    const t = s / L;
    if (t > tA - 0.01 && t < tB + 0.01) continue;
    samplePath(frames, t, P);
    if (P.y - 0.4 > 0.12) spots.push(P.clone());
  }
  const pillars = bag.add(new InstancedMesh(pillarGeo, bag.lam('#ffffff'), spots.length));
  spots.forEach((p, i) => setInst(pillars, i, p.x, 0, p.z, 0, 1, p.y - 0.4, 1));
  root.add(finishInst(pillars));

  buildTunnel(bag, root, frames, tA, tB, lowSpec);
  return { tA, tB };
}

/** 짧고 친근한 터널: 안쪽 벽, 바깥 벽, 양쪽 입구 테두리, 천장의 작은 전구 */
function buildTunnel(bag: Bag, root: Group, frames: PathFrames, tA: number, tB: number, lowSpec: boolean): void {
  const K = lowSpec ? 10 : 16;
  const M = lowSpec ? 8 : 12;
  const P = new Vector3();
  const B = new Vector3();
  const T = new Vector3();

  const profile = (h: number, R: number): [number, number][] => {
    const out: [number, number][] = [[R, -h]];
    for (let a = 0; a <= M; a++) {
      const ang = (Math.PI * a) / M;
      out.push([R * Math.cos(ang), R * Math.sin(ang)]);
    }
    out.push([-R, -h]);
    return out;
  };

  const sweep = (R: number): BufferGeometry => {
    const pos: number[] = [];
    const idx: number[] = [];
    let cols = 0;
    for (let i = 0; i < K; i++) {
      const t = tA + ((tB - tA) * i) / (K - 1);
      samplePath(frames, t, P, undefined, undefined, B);
      B.y = 0;
      B.normalize();
      const prof = profile(P.y + 0.02, R);
      cols = prof.length;
      for (const [x, y] of prof) pos.push(P.x + B.x * x, P.y + y, P.z + B.z * x);
    }
    for (let i = 0; i < K - 1; i++) {
      for (let j = 0; j < cols - 1; j++) {
        const a = i * cols + j;
        const b = (i + 1) * cols + j;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return bag.add(g);
  };

  mesh(sweep(TUNNEL_R), bag.lam('#3f3768', { side: DoubleSide }), 0, 0, 0, root);
  mesh(sweep(TUNNEL_R + 0.55), bag.lam('#a88be6', { side: DoubleSide }), 0, 0, 0, root);

  // 입구 테두리(두께 있는 아치)
  const portal = (t: number, color: string) => {
    samplePath(frames, t, P, T, undefined, B);
    B.y = 0;
    B.normalize();
    const h = P.y + 0.02;
    const Ri = TUNNEL_R - 0.12;
    const Ro = TUNNEL_R + 0.8;
    const pts: Vector2[] = [new Vector2(Ro, -h)];
    for (let a = 0; a <= M; a++) {
      const ang = (Math.PI * a) / M;
      pts.push(new Vector2(Ro * Math.cos(ang), Ro * Math.sin(ang)));
    }
    pts.push(new Vector2(-Ro, -h), new Vector2(-Ri, -h));
    for (let a = M; a >= 0; a--) {
      const ang = (Math.PI * a) / M;
      pts.push(new Vector2(Ri * Math.cos(ang), Ri * Math.sin(ang)));
    }
    pts.push(new Vector2(Ri, -h));
    const geo = bag.add(new ExtrudeGeometry(new Shape(pts), { depth: 0.5, bevelEnabled: false }));
    const Z = new Vector3().crossVectors(B, UP).normalize();
    const m = mesh(geo, bag.lam(color), 0, 0, 0, root);
    m.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(B, UP, Z));
    m.position.copy(P).addScaledVector(Z, -0.25);
    return { P: P.clone(), T: T.clone() };
  };
  const entry = portal(tA, '#ffcf3f');
  portal(tB, '#ff7eb6');

  // 입구 위 간판(들어오는 열차 쪽을 향함)
  const tex = bag.add(signTexture('두근두근 터널', '#fff4c9', '#7a3e9d', '#ff7eb6'));
  const signGeo = bag.add(new PlaneGeometry(3.4, 0.95));
  const sign = mesh(signGeo, bag.add(new MeshLambertMaterial({ map: tex })), 0, 0, 0, root);
  const flatT = entry.T.clone().setY(0).normalize();
  sign.position.copy(entry.P).addScaledVector(UP, TUNNEL_R + 1.4).addScaledVector(flatT, -0.3);
  sign.lookAt(sign.position.clone().sub(flatT));

  // 천장의 작은 전구(빛을 받지 않는 재질: 어두워져도 은은하게 보인다)
  const bulbColors = ['#fff1a8', '#ffc2e0', '#c6ffe0'].map((c) => new Color(c));
  const angles = [0.3, 0.5, 0.7];
  const n = K * angles.length;
  const bulbs = bag.add(
    new InstancedMesh(bag.add(new IcosahedronGeometry(0.09, 0)), bag.add(new MeshBasicMaterial({ color: '#ffffff' })), n),
  );
  let k = 0;
  for (let i = 0; i < K; i++) {
    const t = tA + ((tB - tA) * (i + 0.5)) / K;
    samplePath(frames, t, P, undefined, undefined, B);
    B.y = 0;
    B.normalize();
    for (const a of angles) {
      const ang = Math.PI * a;
      const r = TUNNEL_R - 0.1;
      setInst(bulbs, k, P.x + B.x * r * Math.cos(ang), P.y + r * Math.sin(ang), P.z + B.z * r * Math.cos(ang));
      bulbs.setColorAt(k, bulbColors[(i + k) % bulbColors.length]);
      k++;
    }
  }
  root.add(finishInst(bulbs));
}

function buildStation(bag: Bag, root: Group, block: ReturnType<typeof makeBlock>, updaters: Updater[]): void {
  const g = new Group();
  root.add(g);
  block(g, bag.lam('#e9d8c4'), 1.95, 0.68, 9.5, -1.95, 0.34, 0); // 승강장
  block(g, bag.lam('#ffd23f'), 0.14, 0.012, 9.5, -1.12, 0.686, 0); // 안전선
  block(g, bag.lam('#d9c4ac'), 1.95, 0.34, 1.2, -1.95, 0.17, 5.3); // 계단
  // 지붕 기둥
  const postGeo = bag.add(new CylinderGeometry(0.12, 0.12, 3.4, 8));
  const postMat = bag.lam('#ffffff', { smooth: true });
  for (const [x, z] of [
    [-2.7, -4],
    [-2.7, 4],
    [2.4, -4],
    [2.4, 4],
  ]) {
    mesh(postGeo, postMat, x, 1.7, z, g);
  }
  block(g, bag.lam('#ffffff'), 5.7, 0.14, 9.1, -0.15, 3.38, 0); // 지붕 테두리
  block(g, bag.lam('#ff8fab'), 5.6, 0.25, 9, -0.15, 3.55, 0); // 지붕 판
  const prismGeo = bag.add(new CylinderGeometry(3.2, 3.2, 9, 3, 1, false, Math.PI));
  prismGeo.rotateX(Math.PI / 2);
  const prism = mesh(prismGeo, bag.lam('#ff6f91'), -0.15, 4.4, 0, g);
  prism.scale.set(1, 0.45, 1);

  // 지붕 위 깃발(바람에 살랑)
  const flagGeo = bag.add(new PlaneGeometry(0.9, 0.55));
  flagGeo.translate(0.45, 0, 0);
  const flagPole = bag.add(new CylinderGeometry(0.04, 0.04, 1.4, 6));
  const flags: Mesh[] = [];
  const flagColors = ['#ffd23f', '#4dd4ac', '#ff7eb6'];
  [-3, 0, 3].forEach((z, i) => {
    mesh(flagPole, postMat, -0.15, 5.6, z, g);
    const f = mesh(flagGeo, bag.lam(flagColors[i], { side: DoubleSide }), -0.15, 6.05, z, g);
    f.userData.keep = true;
    flags.push(f);
  });
  updaters.push((ctx) => {
    flags.forEach((f, i) => {
      f.rotation.y = 0.5 + Math.sin(ctx.t * 1.8 + i * 1.7) * 0.3 * ctx.motion;
    });
  });

  // 안내판
  const hanging = bag.add(signTexture('즐거운 여행 되세요!', '#fffdf5', '#e5484d', '#ffd23f', 640, 144));
  const hangGeo = bag.add(new PlaneGeometry(2.7, 0.62));
  mesh(hangGeo, bag.add(new MeshLambertMaterial({ map: hanging })), -0.1, 2.85, -4.25, g);
  block(g, postMat, 0.03, 0.4, 0.03, -1.1, 3.25, -4.25);
  block(g, postMat, 0.03, 0.4, 0.03, 0.9, 3.25, -4.25);

  const nameTex = bag.add(signTexture('회전 열차 · 타는 곳', '#2ec4b6', '#ffffff', '#ffffff', 640, 160));
  const nameSign = mesh(bag.add(new PlaneGeometry(2.3, 0.58)), bag.add(new MeshLambertMaterial({ map: nameTex })), -2.82, 1.75, -1.6, g);
  nameSign.rotation.y = Math.PI / 2;
  block(g, postMat, 0.06, 1.1, 0.06, -2.86, 1.0, -2.6);
  block(g, postMat, 0.06, 1.1, 0.06, -2.86, 1.0, -0.6);
}

function buildBooth(bag: Bag, root: Group, block: ReturnType<typeof makeBlock>): void {
  const g = new Group();
  g.position.set(-9, 0, 3.6);
  g.rotation.y = Math.PI / 2;
  root.add(g);
  block(g, bag.lam('#ff9ec4'), 2.4, 2.2, 2, 0, 1.1, 0);
  block(g, bag.lam('#5a4b7a'), 1.6, 0.8, 0.06, 0, 1.45, 1.0);
  block(g, bag.lam('#ffffff'), 2.0, 0.12, 0.45, 0, 0.98, 1.15);
  const roof = bag.add(striped(new ConeGeometry(2.0, 1.1, 4, 1), '#ffd23f', '#ffffff', 4, Math.PI / 4));
  const r = mesh(roof, bag.lam('#ffffff', { vertexColors: true }), 0, 2.75, 0, g);
  r.rotation.y = Math.PI / 4;
  const tex = bag.add(signTexture('매표소', '#fff4c9', '#c2410c', '#ff9ec4', 384, 128));
  mesh(bag.add(new PlaneGeometry(1.6, 0.53)), bag.add(new MeshLambertMaterial({ map: tex })), 0, 2.02, 1.02, g);
}

function buildPlazaProps(bag: Bag, root: Group, lowSpec: boolean, updaters: Updater[]): void {
  // 가로등(전구는 빛을 받지 않는 재질)
  const lamps: [number, number][] = [
    [-4, -8],
    [-12, -7],
    [-14, 2],
    [-9, 8],
  ];
  const posts = bag.add(new InstancedMesh(bag.add(new CylinderGeometry(0.08, 0.11, 3, 6)), bag.lam('#6d5a8a'), lamps.length));
  const bulbs = bag.add(
    new InstancedMesh(bag.add(new SphereGeometry(0.24, 10, 8)), bag.add(new MeshBasicMaterial({ color: '#fff4c2' })), lamps.length),
  );
  lamps.forEach(([x, z], i) => {
    setInst(posts, i, x, 1.5, z);
    setInst(bulbs, i, x, 3.1, z);
  });
  root.add(finishInst(posts), finishInst(bulbs));

  // 가로등 사이 삼각 깃발 줄
  const spans: [Vector3, Vector3][] = [];
  for (let i = 0; i < lamps.length - 1; i++) {
    spans.push([new Vector3(lamps[i][0], 2.95, lamps[i][1]), new Vector3(lamps[i + 1][0], 2.95, lamps[i + 1][1])]);
  }
  // 승강장 지붕 양옆
  spans.push([new Vector3(-2.75, 3.25, -4), new Vector3(-2.75, 3.25, 4)]);
  spans.push([new Vector3(2.45, 3.25, -4), new Vector3(2.45, 3.25, 4)]);
  const per = lowSpec ? 6 : 10;
  const tri = new BufferGeometry();
  tri.setAttribute('position', new Float32BufferAttribute([-0.17, 0, 0, 0.17, 0, 0, 0, -0.32, 0], 3));
  tri.computeVertexNormals();
  bag.add(tri);
  const flags = bag.add(new InstancedMesh(tri, bag.lam('#ffffff', { side: DoubleSide }), spans.length * per));
  const linePos: number[] = [];
  const colors = ['#ff5d73', '#ffd23f', '#4dd4ac', '#7aa7ff', '#ff9f43', '#c084fc'].map((c) => new Color(c));
  const a = new Vector3();
  const b = new Vector3();
  let k = 0;
  const sag = (u: number) => 0.4 * (1 - (2 * u - 1) ** 2);
  for (const [p0, p1] of spans) {
    const seg = 12;
    for (let j = 0; j < seg; j++) {
      a.lerpVectors(p0, p1, j / seg);
      a.y -= sag(j / seg);
      b.lerpVectors(p0, p1, (j + 1) / seg);
      b.y -= sag((j + 1) / seg);
      linePos.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
    const ry = Math.atan2(p1.z - p0.z, p1.x - p0.x);
    for (let j = 0; j < per; j++) {
      const u = (j + 0.5) / per;
      a.lerpVectors(p0, p1, u);
      setInst(flags, k, a.x, a.y - sag(u), a.z, -ry);
      flags.setColorAt(k, colors[k % colors.length]);
      k++;
    }
  }
  root.add(finishInst(flags));
  const lineGeo = bag.add(new BufferGeometry());
  lineGeo.setAttribute('position', new Float32BufferAttribute(linePos, 3));
  root.add(new LineSegments(lineGeo, bag.add(new LineBasicMaterial({ color: '#ffffff' }))));

  // 벤치
  const benchGeo = bag.add(
    mergedBoxes([
      [1.6, 0.08, 0.45, 0, 0.45, 0],
      [1.6, 0.4, 0.07, 0, 0.75, 0.2],
      [0.08, 0.45, 0.4, -0.7, 0.22, 0],
      [0.08, 0.45, 0.4, 0.7, 0.22, 0],
    ]),
  );
  const benchSpots: [number, number, number][] = [
    [-15.5, -2, Math.PI / 2],
    [-13, -8.5, Math.PI / 3],
    [-5, 9.5, Math.PI],
  ];
  const benches = bag.add(new InstancedMesh(benchGeo, bag.lam('#c07a4a'), benchSpots.length));
  benchSpots.forEach(([x, z, ry], i) => setInst(benches, i, x, 0, z, ry));
  root.add(finishInst(benches));

  // 풍선 다발(매표소 옆)
  const bunch = new Group();
  bunch.position.set(-5.2, 0, 7.2);
  root.add(bunch);
  mesh(bag.add(new CylinderGeometry(0.05, 0.07, 1.3, 6)), bag.lam('#ffffff'), 0, 0.65, 0, bunch);
  const sway = new Group();
  sway.position.y = 1.3;
  bunch.add(sway);
  const balloonGeo = bag.add(new SphereGeometry(0.32, lowSpec ? 8 : 12, lowSpec ? 6 : 10));
  const balloonMat = bag.lam('#ffffff', { smooth: true });
  const bColors = ['#ff5d73', '#ffd23f', '#4dd4ac', '#7aa7ff', '#ff9f43', '#c084fc', '#ff7eb6'].map((c) => new Color(c));
  const nB = lowSpec ? 5 : 7;
  const balloons = bag.add(new InstancedMesh(balloonGeo, balloonMat, nB));
  const strings: number[] = [];
  for (let i = 0; i < nB; i++) {
    const ang = (i / nB) * Math.PI * 2;
    const x = Math.cos(ang) * 0.42;
    const z = Math.sin(ang) * 0.42;
    const y = 1.6 + (i % 3) * 0.3;
    setInst(balloons, i, x, y, z, 0, 1, 1.18, 1);
    balloons.setColorAt(i, bColors[i % bColors.length]);
    strings.push(0, 0, 0, x, y - 0.37, z);
  }
  sway.add(finishInst(balloons));
  const strGeo = bag.add(new BufferGeometry());
  strGeo.setAttribute('position', new Float32BufferAttribute(strings, 3));
  sway.add(new LineSegments(strGeo, bag.add(new LineBasicMaterial({ color: '#f5f5f5' }))));

  // 하늘로 천천히 떠오르는 풍선
  const nF = lowSpec ? 2 : 5;
  const floaters = bag.add(new InstancedMesh(balloonGeo, balloonMat, nF));
  const r = rng(5);
  const fl = Array.from({ length: nF }, (_, i) => ({
    x: -30 + r() * 70,
    z: -60 + r() * 50,
    off: r() * 40,
    c: bColors[(i * 2) % bColors.length],
  }));
  fl.forEach((f, i) => floaters.setColorAt(i, f.c));
  root.add(finishInst(floaters, true));

  updaters.push((ctx) => {
    sway.rotation.z = Math.sin(ctx.t * 0.8) * 0.05 * ctx.motion;
    sway.rotation.x = Math.sin(ctx.t * 0.6 + 1) * 0.04 * ctx.motion;
    for (let i = 0; i < nF; i++) {
      const f = fl[i];
      const y = 2 + ((ctx.t * 0.6 * Math.max(ctx.motion, 0.4) + f.off) % 42);
      setInst(floaters, i, f.x + Math.sin(ctx.t * 0.3 + i) * 0.8 * ctx.motion, y, f.z, 0, 1.6, 1.9, 1.6);
    }
    floaters.instanceMatrix.needsUpdate = true;
  });
}

interface Zone {
  x: number;
  z: number;
  r: number;
}

function makeIsFree(frames: PathFrames, zones: Zone[]) {
  const trackPts = frames.points.filter((_, i) => i % 3 === 0);
  return (x: number, z: number, clear: number): boolean => {
    for (const zn of zones) if (Math.hypot(x - zn.x, z - zn.z) < zn.r + clear) return false;
    for (const p of trackPts) if (Math.hypot(x - p.x, z - p.z) < 3.6 + clear) return false;
    // 승차장에서 정면(관람차 쪽) 시야는 비워 둔다
    if (x > -2 && x < 32 && z < -42 && z > -72) return false;
    return Math.hypot(x - 6, z + 15) < 80;
  };
}

function buildGreenery(bag: Bag, root: Group, frames: PathFrames, lowSpec: boolean): void {
  const zones: Zone[] = [
    { x: -7, z: -1, r: 10.5 },
    { x: -22, z: -22, r: 8.5 },
    { x: 18, z: -14, r: 7 },
    { x: 16, z: -78, r: 10 },
    { x: -14, z: -12, r: 3 },
  ];
  const isFree = makeIsFree(frames, zones);
  const r = rng(2024);

  // 나무: 둥근 나무 + 뾰족한 나무
  const nTree = lowSpec ? 20 : 48;
  const trees: { x: number; z: number; s: number; ry: number; pine: boolean }[] = [];
  let guard = 0;
  while (trees.length < nTree && guard++ < 3000) {
    const x = -62 + r() * 130;
    const z = -95 + r() * 145;
    const s = 0.8 + r() * 0.65;
    if (!isFree(x, z, 1.4 * s)) continue;
    if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < 3.2)) continue;
    trees.push({ x, z, s, ry: r() * Math.PI * 2, pine: r() < 0.38 });
  }
  const trunkGeo = bag.add(new CylinderGeometry(0.18, 0.26, 1.7, 6));
  trunkGeo.translate(0, 0.85, 0);
  const trunks = bag.add(new InstancedMesh(trunkGeo, bag.lam('#9a6a45'), trees.length));
  const rounds = trees.filter((t) => !t.pine);
  const pines = trees.filter((t) => t.pine);
  const roundMesh = bag.add(new InstancedMesh(bag.add(new IcosahedronGeometry(1.5, 0)), bag.lam('#ffffff'), Math.max(1, rounds.length)));
  const pineMesh = bag.add(new InstancedMesh(bag.add(new ConeGeometry(1.35, 3.2, 7)), bag.lam('#ffffff'), Math.max(1, pines.length)));
  const greens = ['#5cbf4a', '#6ccf5a', '#4fae49', '#7bd36b', '#56b85f'].map((c) => new Color(c));
  trees.forEach((t, i) => setInst(trunks, i, t.x, 0, t.z, t.ry, t.s));
  rounds.forEach((t, i) => {
    setInst(roundMesh, i, t.x, 2.6 * t.s, t.z, t.ry, t.s, t.s * 1.1, t.s);
    roundMesh.setColorAt(i, greens[i % greens.length]);
  });
  pines.forEach((t, i) => {
    setInst(pineMesh, i, t.x, 3.1 * t.s, t.z, t.ry, t.s);
    pineMesh.setColorAt(i, greens[(i + 2) % greens.length]);
  });
  roundMesh.count = rounds.length;
  pineMesh.count = pines.length;
  root.add(finishInst(trunks), finishInst(roundMesh), finishInst(pineMesh));

  // 덤불
  const bushSpots: [number, number][] = [
    [-17.5, -4],
    [-17, 3],
    [-15, 8],
    [-11, 10.5],
    [-17, -9],
    [-3.5, -10.5],
    [-12, -11],
    [-5.5, 10.8],
  ];
  const nBush = lowSpec ? 5 : bushSpots.length;
  const bushes = bag.add(new InstancedMesh(bag.add(new IcosahedronGeometry(0.75, 0)), bag.lam('#ffffff'), nBush));
  for (let i = 0; i < nBush; i++) {
    const [x, z] = bushSpots[i];
    setInst(bushes, i, x, 0.45, z, i, 1 + (i % 3) * 0.2, 0.8, 1);
    bushes.setColorAt(i, greens[(i + 1) % greens.length]);
  }
  root.add(finishInst(bushes));

  // 꽃밭
  const beds: [number, number][] = [
    [-16, -7],
    [-16.5, 5.5],
    [-2.5, 10.5],
    [10, -8],
    [24, -20],
    [12, 4],
    [-29, -14],
    [-13, -16],
    [26, -6],
  ];
  const perBed = lowSpec ? 3 : 8;
  const nFlower = beds.length * perBed;
  const flowers = bag.add(new InstancedMesh(bag.add(new IcosahedronGeometry(0.2, 0)), bag.lam('#ffffff'), nFlower));
  const fColors = ['#ff7eb6', '#ffd23f', '#ffffff', '#c084fc', '#ff9f43', '#ff5d73'].map((c) => new Color(c));
  let k = 0;
  for (const [bx, bz] of beds) {
    for (let j = 0; j < perBed; j++) {
      const ang = r() * Math.PI * 2;
      const rad = Math.sqrt(r()) * 1.6;
      setInst(flowers, k, bx + Math.cos(ang) * rad, 0.22, bz + Math.sin(ang) * rad, ang);
      flowers.setColorAt(k, fColors[k % fColors.length]);
      k++;
    }
  }
  root.add(finishInst(flowers));
}

function buildTent(bag: Bag, root: Group): void {
  const g = new Group();
  g.position.set(18, 0, -14);
  root.add(g);
  const wall = bag.add(striped(new CylinderGeometry(5, 5, 3, 12, 1), '#ff5d73', '#ffffff', 12));
  mesh(wall, bag.lam('#ffffff', { vertexColors: true }), 0, 1.5, 0, g);
  const roof = bag.add(striped(new ConeGeometry(5.7, 3.6, 12, 1), '#ffd23f', '#ff5d73', 12));
  mesh(roof, bag.lam('#ffffff', { vertexColors: true }), 0, 4.8, 0, g);
  mesh(bag.add(new CylinderGeometry(0.06, 0.06, 1.6, 6)), bag.lam('#ffffff'), 0, 7.2, 0, g);
  const flagGeo = bag.add(new PlaneGeometry(0.9, 0.5));
  flagGeo.translate(0.45, 0, 0);
  mesh(flagGeo, bag.lam('#4dd4ac', { side: DoubleSide }), 0, 7.7, 0, g);
  // 입구(어두운 휘장)
  const door = mesh(bag.add(new PlaneGeometry(1.8, 2.2)), bag.lam('#7a3e9d', { side: DoubleSide }), 0, 1.1, 0, g);
  door.position.set(-4.0, 1.1, 3.05);
  door.rotation.y = -0.92;
}

function buildCarousel(bag: Bag, root: Group, lowSpec: boolean, updaters: Updater[]): void {
  const g = new Group();
  g.position.set(-22, 0, -22);
  root.add(g);
  mesh(bag.add(new CylinderGeometry(6, 6.3, 0.6, 16)), bag.lam('#f4a7c0'), 0, 0.3, 0, g);
  const spin = new Group();
  g.add(spin);
  mesh(bag.add(new CylinderGeometry(5.8, 5.8, 0.12, 16)), bag.lam('#fff2d6'), 0, 0.66, 0, spin);
  mesh(bag.add(new CylinderGeometry(0.7, 0.7, 4.8, 10)), bag.lam('#ffd166'), 0, 3.1, 0, spin);
  mesh(bag.add(new CylinderGeometry(6.8, 6.8, 0.55, 16)), bag.lam('#ff6f91'), 0, 5.6, 0, spin);
  const roof = bag.add(striped(new ConeGeometry(6.9, 2.6, 16, 1), '#ff6f91', '#fff4e0', 16));
  mesh(roof, bag.lam('#ffffff', { vertexColors: true }), 0, 7.15, 0, spin);
  mesh(bag.add(new SphereGeometry(0.42, 10, 8)), bag.lam('#ffd23f'), 0, 8.6, 0, spin);

  const n = lowSpec ? 6 : 8;
  const R = 4.2;
  const poles = bag.add(new InstancedMesh(bag.add(new CylinderGeometry(0.07, 0.07, 4.7, 6)), bag.lam('#ffe08a', { smooth: true }), n));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    setInst(poles, i, Math.sin(a) * R, 3.0, Math.cos(a) * R);
  }
  spin.add(finishInst(poles));

  // 블록 모양 조랑말(독창적인 단순 모양)
  const ponyGeo = bag.add(
    mergedBoxes([
      [0.5, 0.5, 1.3, 0, 0, 0],
      [0.36, 0.72, 0.38, 0, 0.45, -0.6],
      [0.3, 0.28, 0.42, 0, 0.7, -0.86],
      [0.08, 0.18, 0.1, 0.1, 0.88, -0.56],
      [0.08, 0.18, 0.1, -0.1, 0.88, -0.56],
      [0.14, 0.6, 0.14, 0.16, -0.5, -0.45],
      [0.14, 0.6, 0.14, -0.16, -0.5, -0.45],
      [0.14, 0.6, 0.14, 0.16, -0.5, 0.45],
      [0.14, 0.6, 0.14, -0.16, -0.5, 0.45],
      [0.12, 0.45, 0.12, 0, 0.05, 0.72],
      [0.54, 0.1, 0.5, 0, 0.29, 0],
    ]),
  );
  const ponies = bag.add(new InstancedMesh(ponyGeo, bag.lam('#ffffff'), n));
  const pColors = ['#ffffff', '#ffd6e8', '#fff1b8', '#d6f5ff', '#e8dcff', '#d9ffe0'].map((c) => new Color(c));
  for (let i = 0; i < n; i++) ponies.setColorAt(i, pColors[i % pColors.length]);
  spin.add(finishInst(ponies, true));

  updaters.push((ctx) => {
    spin.rotation.y += ctx.dt * (ctx.motion < 1 ? 0.12 : 0.35);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const y = 1.75 + Math.sin(ctx.t * 1.6 + i * 1.3) * 0.32 * ctx.motion;
      setInst(ponies, i, Math.sin(a) * R, y, Math.cos(a) * R, a - Math.PI / 2);
    }
    ponies.instanceMatrix.needsUpdate = true;
  });
}

function buildFerrisWheel(bag: Bag, root: Group, block: ReturnType<typeof makeBlock>, lowSpec: boolean, updaters: Updater[]): void {
  const g = new Group();
  g.position.set(16, 0, -78);
  root.add(g);
  const H = 17;
  const R = 13;
  const white = bag.lam('#ffffff');
  block(g, bag.lam('#e8e0f0'), 17, 0.5, 6, 0, 0.25, 0);
  const legLen = Math.hypot(7, H);
  const tilt = Math.atan2(7, H);
  for (const z of [-1.9, 1.9]) {
    for (const sx of [-1, 1]) {
      const leg = block(g, white, 0.45, legLen, 0.45, (sx * 7) / 2, H / 2, z);
      leg.rotation.z = sx * tilt;
    }
  }
  const wheel = new Group();
  wheel.position.y = H;
  g.add(wheel);
  const rimGeo = bag.add(new TorusGeometry(R, 0.3, 6, lowSpec ? 28 : 44));
  const rimMat = bag.lam('#ff7eb6', { smooth: true });
  mesh(rimGeo, rimMat, 0, 0, 0.9, wheel);
  mesh(rimGeo, rimMat, 0, 0, -0.9, wheel);
  const hub = mesh(bag.add(new CylinderGeometry(0.9, 0.9, 4.1, 10)), bag.lam('#ffd23f'), 0, 0, 0, wheel);
  hub.rotation.x = Math.PI / 2;
  const spokes = bag.add(new InstancedMesh(bag.add(new BoxGeometry(0.16, R * 2, 0.16)), white, 12));
  for (let i = 0; i < 12; i++) {
    const a = ((i % 6) / 6) * Math.PI;
    _q.setFromEuler(_e.set(0, 0, a));
    _m.compose(_p.set(0, 0, i < 6 ? 0.9 : -0.9), _q, _s.set(1, 1, 1));
    spokes.setMatrixAt(i, _m);
  }
  wheel.add(finishInst(spokes));

  const nG = lowSpec ? 8 : 12;
  const gondolaGeo = bag.add(
    mergedBoxes([
      [1.5, 1.2, 1.3, 0, -0.25, 0],
      [1.7, 0.18, 1.5, 0, 0.44, 0],
      [0.12, 0.62, 0.12, 0, 0.84, 0],
    ]),
  );
  const gondolas = bag.add(new InstancedMesh(gondolaGeo, bag.lam('#ffffff'), nG));
  const gColors = ['#ff5d73', '#ffd23f', '#4dd4ac', '#7aa7ff', '#ff9f43', '#c084fc'].map((c) => new Color(c));
  for (let i = 0; i < nG; i++) gondolas.setColorAt(i, gColors[i % gColors.length]);
  g.add(finishInst(gondolas, true));

  let angle = 0;
  updaters.push((ctx) => {
    angle += ctx.dt * (ctx.motion < 1 ? 0.03 : 0.08);
    wheel.rotation.z = angle;
    for (let i = 0; i < nG; i++) {
      const a = angle + (i / nG) * Math.PI * 2;
      setInst(gondolas, i, Math.cos(a) * R, H + Math.sin(a) * R - 1.15, 0);
    }
    gondolas.instanceMatrix.needsUpdate = true;
  });
}

function buildWorld(frames: PathFrames, lowSpec: boolean): World {
  const bag = new Bag();
  const root = new Group();
  root.name = 'park';
  const updaters: Updater[] = [];
  const unit = bag.add(new BoxGeometry(1, 1, 1));
  const block = makeBlock(unit);

  const hemi = new HemisphereLight(AMBIENT.sky, AMBIENT.ground, HEMI_INTENSITY);
  const sun = new DirectionalLight('#fff1d0', SUN_INTENSITY);
  sun.position.copy(SUN_DIR).multiplyScalar(60);
  root.add(hemi, sun);

  buildSky(bag, root, lowSpec, updaters);
  buildClouds(bag, root, lowSpec, updaters);
  buildGround(bag, root, lowSpec);
  buildTrack(bag, root, frames, lowSpec);
  buildStation(bag, root, block, updaters);
  buildBooth(bag, root, block);
  buildPlazaProps(bag, root, lowSpec, updaters);
  buildGreenery(bag, root, frames, lowSpec);
  buildTent(bag, root);
  buildCarousel(bag, root, lowSpec, updaters);
  buildFerrisWheel(bag, root, block, lowSpec, updaters);
  bake(root, bag);

  return { root, bag, hemi, sun, updaters };
}

// ─────────────────────────────────────────────────────────────
//  열차 칸 + 친구 민규 + (탈출 장면) 손에 든 지도
// ─────────────────────────────────────────────────────────────

interface Cart {
  bag: Bag;
  lead: Group;
  trailer: Group;
  torso: Group;
  head: Group;
  mouth: Mesh;
  sheet: Group;
}

function buildCartBody(
  g: Group,
  bag: Bag,
  block: ReturnType<typeof makeBlock>,
  body: string,
  trim: string,
  seat: string,
  front: boolean,
): void {
  const B = bag.lam(body);
  const Tm = bag.lam(trim);
  const S = bag.lam(seat);
  const dark = bag.lam('#3a3a48');
  block(g, B, 1.6, 0.3, 2.2, 0, 0.23, 0.05); // 차체 바닥
  for (const sx of [-1, 1]) {
    block(g, B, 0.1, 0.34, 2.0, sx * 0.78, 0.55, 0.05); // 옆벽(시야를 덜 가리도록 낮춤)
    block(g, Tm, 0.11, 0.07, 2.02, sx * 0.785, 0.73, 0.05); // 옆 띠
    block(g, S, 0.64, 0.12, 0.5, sx * 0.38, 0.46, 0.05); // 방석
    block(g, S, 0.64, 0.62, 0.1, sx * 0.38, 0.8, 0.36); // 등받이
    block(g, Tm, 0.05, 0.05, 0.42, sx * 0.7, 0.62, -0.47); // 안전바 지지대
  }
  block(g, B, 1.6, 0.62, 0.12, 0, 0.67, 1.1); // 뒷벽
  block(g, Tm, 1.62, 0.07, 0.14, 0, 1.0, 1.1);
  block(g, Tm, 1.4, 0.07, 0.07, 0, 0.62, -0.26); // 안전바(무릎 위)
  if (front) {
    block(g, B, 1.6, 0.36, 0.45, 0, 0.48, -0.98); // 앞부분(운전석 눈높이보다 충분히 낮게)
    block(g, Tm, 1.62, 0.07, 0.47, 0, 0.68, -0.98);
    block(g, Tm, 1.7, 0.16, 0.14, 0, 0.22, -1.22); // 범퍼
    const lightGeo = bag.add(new SphereGeometry(0.09, 10, 8));
    const lightMat = bag.add(new MeshBasicMaterial({ color: '#fffbe0' }));
    mesh(lightGeo, lightMat, -0.5, 0.48, -1.2, g);
    mesh(lightGeo, lightMat, 0.5, 0.48, -1.2, g);
    block(g, bag.lam('#ffffff'), 0.34, 0.18, 0.02, 0, 0.5, -1.21); // 앞 장식판
  } else {
    block(g, B, 1.6, 0.42, 0.12, 0, 0.59, -0.9); // 앞벽
    block(g, Tm, 1.62, 0.07, 0.14, 0, 0.82, -0.9);
  }
  block(g, dark, 0.12, 0.1, 0.42, 0, 0.18, 1.32); // 연결 고리
  const wheelGeo = bag.add(new CylinderGeometry(0.14, 0.14, 0.1, 10));
  wheelGeo.rotateZ(Math.PI / 2);
  for (const sx of [-0.45, 0.45]) for (const sz of [-0.7, 0.75]) mesh(wheelGeo, dark, sx, 0.06, sz, g);
}

/** 앉은 다리(교복 바지) */
function addLegs(g: Group, block: ReturnType<typeof makeBlock>, bag: Bag, x: number): void {
  const pants = bag.lam('#2b2f3a');
  const shoe = bag.lam('#1f1f24');
  block(g, pants, 0.36, 0.12, 0.3, x, 0.58, 0.1);
  for (const dx of [-0.09, 0.09]) {
    block(g, pants, 0.15, 0.13, 0.44, x + dx, 0.6, -0.1);
    block(g, pants, 0.14, 0.22, 0.14, x + dx, 0.48, -0.31);
    block(g, shoe, 0.15, 0.08, 0.22, x + dx, 0.42, -0.37);
  }
}

function buildCart(lowSpec: boolean): Cart {
  const bag = new Bag();
  const unit = bag.add(new BoxGeometry(1, 1, 1));
  const block = makeBlock(unit);

  const lead = new Group();
  lead.name = 'park-ride-cart';
  buildCartBody(lead, bag, block, '#ff6b5a', '#ffd23f', '#2ec4b6', true);
  const trailer = new Group();
  buildCartBody(trailer, bag, block, '#7bd389', '#ffffff', '#ffb347', false);

  // 나(왼쪽 자리, 카메라 위치)의 다리만 그린다
  addLegs(lead, block, bag, -0.38);

  // ── 친구 민규(오른쪽 자리): 남색 재킷, 흰 셔츠, 짧은 검은 머리 ──
  addLegs(lead, block, bag, 0.38);
  const skin = bag.lam('#f6c9a5');
  const hair = bag.lam('#1f1b1b');
  const blazer = bag.lam('#24305e');
  const shirt = bag.lam('#f8f8f4');
  const torso = new Group();
  torso.position.set(0.38, 0.57, 0.13);
  lead.add(torso);
  block(torso, blazer, 0.4, 0.3, 0.24, 0, 0.15, 0);
  block(torso, shirt, 0.13, 0.2, 0.02, 0, 0.19, -0.121);
  block(torso, bag.lam('#d64550'), 0.05, 0.17, 0.02, 0, 0.17, -0.132); // 넥타이
  block(torso, shirt, 0.07, 0.04, 0.05, -0.06, 0.29, -0.11); // 깃
  block(torso, shirt, 0.07, 0.04, 0.05, 0.06, 0.29, -0.11);
  block(torso, bag.lam('#ffd23f'), 0.06, 0.04, 0.01, -0.12, 0.22, -0.122); // 명찰(글자 없음)
  for (const sx of [-1, 1]) {
    const arm = new Group();
    arm.position.set(sx * 0.255, 0.26, 0);
    torso.add(arm);
    block(arm, blazer, 0.11, 0.24, 0.12, 0, -0.1, 0);
    block(arm, blazer, 0.1, 0.1, 0.3, 0, -0.2, -0.13);
    block(arm, skin, 0.09, 0.09, 0.08, 0, -0.2, -0.32);
  }
  const head = new Group();
  head.position.set(0, 0.3, -0.01);
  torso.add(head);
  block(head, skin, 0.12, 0.06, 0.12, 0, 0.02, 0); // 목
  block(head, skin, 0.34, 0.31, 0.31, 0, 0.2, 0);
  block(head, hair, 0.37, 0.1, 0.35, 0, 0.37, 0.01);
  block(head, hair, 0.37, 0.24, 0.08, 0, 0.25, 0.15);
  block(head, hair, 0.04, 0.14, 0.31, -0.18, 0.28, 0.02);
  block(head, hair, 0.04, 0.14, 0.31, 0.18, 0.28, 0.02);
  block(head, hair, 0.36, 0.06, 0.06, 0, 0.32, -0.15); // 앞머리
  block(head, skin, 0.04, 0.08, 0.06, -0.18, 0.19, 0); // 귀
  block(head, skin, 0.04, 0.08, 0.06, 0.18, 0.19, 0);
  const eye = bag.lam('#1b1b1b');
  block(head, eye, 0.05, 0.065, 0.02, -0.075, 0.21, -0.158);
  block(head, eye, 0.05, 0.065, 0.02, 0.075, 0.21, -0.158);
  block(head, bag.lam('#ffffff'), 0.015, 0.018, 0.01, -0.065, 0.225, -0.17);
  block(head, bag.lam('#ffffff'), 0.015, 0.018, 0.01, 0.085, 0.225, -0.17);
  block(head, hair, 0.07, 0.015, 0.02, -0.075, 0.265, -0.158); // 눈썹
  block(head, hair, 0.07, 0.015, 0.02, 0.075, 0.265, -0.158);
  block(head, bag.lam('#ff9eae'), 0.05, 0.03, 0.01, -0.12, 0.14, -0.158); // 볼
  block(head, bag.lam('#ff9eae'), 0.05, 0.03, 0.01, 0.12, 0.14, -0.158);
  const mouth = block(head, bag.lam('#9a3b45'), 0.09, 0.025, 0.02, 0, 0.11, -0.158);
  mouth.userData.keep = true;

  // ── 탈출 장면: 손에 든 '순환계 지도' ──
  const sheet = new Group();
  sheet.position.set(-0.38, 0.76, -0.52);
  sheet.rotation.x = -0.38;
  sheet.visible = false;
  lead.add(sheet);
  const W = lowSpec ? 640 : 1024;
  const tex = bag.add(canvasTexture(W, Math.round((W * 720) / 1024), (g) => drawMapSheet(g, W)));
  const paper = mesh(
    bag.add(new PlaneGeometry(0.4, 0.281)),
    bag.add(new MeshBasicMaterial({ map: tex, color: '#f4f1ea', toneMapped: false })),
    0,
    0,
    0,
    sheet,
  );
  paper.renderOrder = 2;
  paper.userData.keep = true;
  block(sheet, bag.lam('#efe4cf'), 0.404, 0.285, 0.004, 0, 0, -0.004);
  for (const sx of [-1, 1]) {
    block(sheet, skin, 0.06, 0.09, 0.045, sx * 0.205, -0.05, 0.012);
    const sleeve = block(sheet, blazer, 0.085, 0.085, 0.26, sx * 0.225, -0.1, 0.15);
    sleeve.rotation.x = 0.55;
  }

  bake(lead, bag);
  bake(trailer, bag);
  return { bag, lead, trailer, torso, head, mouth, sheet };
}

// ─────────────────────────────────────────────────────────────
//  장면 컴포넌트
// ─────────────────────────────────────────────────────────────

function ParkScene({ lowSpec, reduceMotion }: LocationProps) {
  // 도입: 터널로 들어서는 대사(index 4)부터 천천히 어두워진다
  const dimOn = useApp((s) => {
    const g = s.game;
    const d = g?.dialogue;
    return !!g && g.phase === 'intro' && d?.kind === 'introPark' && d.index >= 4;
  });
  const escape = useApp((s) => s.game?.phase === 'escape');
  const talkKey = useApp((s) => {
    const d = s.game?.dialogue;
    if (!d) return '';
    const line = d.lines[d.index];
    return line && line.speaker === 'friend' ? `${d.kind}:${d.index}` : '';
  });

  const frames = useMemo(() => computePathFrames(PARK_TRACK, 400), []);
  const world = useMemo(() => buildWorld(frames, lowSpec), [frames, lowSpec]);
  useEffect(() => () => world.bag.dispose(), [world]);
  const cart = useMemo(() => buildCart(lowSpec), [lowSpec]);
  useEffect(() => () => cart.bag.dispose(), [cart]);

  const st = useRef({
    dimOn: false,
    escape: false,
    talkKey: '',
    talkStart: 0,
    reduceMotion: false,
    t: 0,
    dim: 0,
    wrote: false,
    torsoYaw: 0,
    headYaw: 0,
    headPitch: 0,
    mouth: 1,
  });
  useEffect(() => {
    st.current.dimOn = dimOn;
  }, [dimOn]);
  useEffect(() => {
    st.current.escape = escape;
  }, [escape]);
  useEffect(() => {
    st.current.reduceMotion = reduceMotion;
  }, [reduceMotion]);
  useEffect(() => {
    st.current.talkKey = talkKey;
    st.current.talkStart = st.current.t;
  }, [talkKey]);

  const tmp = useMemo(
    () => ({
      cam: new Vector3(),
      a: new Vector3(),
      b: new Vector3(),
      baseFog: new Color(FOG.color),
      baseBg: new Color(BACKGROUND),
      ctx: { t: 0, dt: 0, dim: 0, motion: 1, camPos: new Vector3() } as FrameCtx,
    }),
    [],
  );

  useFrame((state, dtRaw) => {
    const s = st.current;
    const dt = Math.min(dtRaw, 0.05);
    s.t += dt;
    const motion = s.reduceMotion ? 0.3 : 1;

    // ── 어두워짐(약 2초, 부드럽게) ──
    const target = s.dimOn ? 1 : 0;
    const step = dt / DIM_SECONDS;
    s.dim = target > s.dim ? Math.min(target, s.dim + step) : Math.max(target, s.dim - step);
    const e = s.dim * s.dim * (3 - 2 * s.dim);
    world.hemi.intensity = HEMI_INTENSITY * (1 - 0.82 * e);
    world.sun.intensity = SUN_INTENSITY * (1 - 0.94 * e);
    if (e > 0.0005 || s.wrote) {
      const fog = state.scene.fog;
      if (fog instanceof Fog) {
        fog.color.copy(tmp.baseFog).lerp(DIM_FOG, e);
        fog.near = FOG.near + (DIM_FOG_NEAR - FOG.near) * e;
        fog.far = FOG.far + (DIM_FOG_FAR - FOG.far) * e;
      }
      const bg = state.scene.background;
      if (bg instanceof Color) bg.copy(tmp.baseBg).lerp(DIM_FOG, e);
      s.wrote = e > 0.0005;
    }

    // ── 배경 움직임 ──
    const ctx = tmp.ctx;
    ctx.t = s.t;
    ctx.dt = dt;
    ctx.dim = e;
    ctx.motion = motion;
    state.camera.getWorldPosition(ctx.camPos);
    for (const u of world.updaters) u(ctx);

    // ── 열차 칸: 탈것 위치(runtime)를 그대로 따른다 ──
    const lead = cart.lead;
    lead.position.copy(runtime.vehiclePosition);
    lead.quaternion.copy(runtime.vehicleQuaternion);
    // 뒤 칸: 경로 위 위치가 맞으면 선로를 따라, 아니면 앞 칸 바로 뒤에
    samplePath(frames, runtime.pathT, tmp.a);
    const tr = cart.trailer;
    if (tmp.a.distanceTo(runtime.vehiclePosition) < 1.2) {
      const tt = (((runtime.pathT - TRAILER_GAP / frames.length) % 1) + 1) % 1;
      poseOnPath(frames, tt, 0, 0, tmp.b, tr.quaternion);
      tr.position.copy(tmp.b).add(runtime.vehiclePosition).sub(tmp.a);
    } else {
      tr.position.set(0, 0, TRAILER_GAP).applyQuaternion(runtime.vehicleQuaternion).add(runtime.vehiclePosition);
      tr.quaternion.copy(runtime.vehicleQuaternion);
    }

    // ── 민규: 말할 때 나(카메라)를 바라본다. 탈출 장면에서는 손에 든 지도를 본다 ──
    const talking = s.talkKey !== '';
    const since = s.t - s.talkStart;
    let tTorso = 0;
    let tYaw: number;
    let tPitch: number;
    if (talking && s.escape && since > 1.1) {
      tTorso = 0.22;
      tYaw = 0.68;
      tPitch = -0.32;
    } else if (talking) {
      tTorso = 0.3;
      tYaw = 1.02;
      tPitch = -0.05;
    } else {
      tYaw = -0.2 + Math.sin(s.t * 0.33) * 0.35 * motion;
      tPitch = Math.sin(s.t * 0.5) * 0.05 * motion;
    }
    const k = 1 - Math.exp(-dt * 4.5);
    s.torsoYaw += (tTorso - s.torsoYaw) * k;
    s.headYaw += (tYaw - s.headYaw) * k;
    s.headPitch += (tPitch - s.headPitch) * k;
    cart.torso.rotation.y = s.torsoYaw;
    cart.head.rotation.set(s.headPitch, s.headYaw, 0);
    const speaking = talking && since < 2.6;
    const mouthTarget = speaking ? 1 + Math.abs(Math.sin(since * 11)) * (s.reduceMotion ? 0.8 : 1.8) : 1;
    s.mouth += (mouthTarget - s.mouth) * Math.min(1, dt * 18);
    cart.mouth.scale.y = 0.025 * s.mouth;

    cart.sheet.visible = s.escape;
  });

  return (
    <>
      <primitive object={world.root} />
      <primitive object={cart.lead} />
      <primitive object={cart.trailer} />
    </>
  );
}

export const parkLocation: LocationDef = {
  id: 'park',
  path: PARK_TRACK,
  laneHalfWidth: () => 0,
  background: BACKGROUND,
  fog: { ...FOG },
  ambient: { ...AMBIENT },
  vehicle: 'none',
  heartbeat: 0,
  Component: ParkScene,
};
