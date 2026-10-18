import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  FrontSide,
  MeshLambertMaterial,
  MeshStandardMaterial,
  type Curve,
  type Side,
  type Vector3,
} from 'three';
import { computePathFrames } from './pathFrames';

export interface VesselOptions {
  curve: Curve<Vector3>;
  /** 경로 t(0~1)에서의 안쪽 반지름 */
  radius: (t: number) => number;
  tubularSegments?: number;
  radialSegments?: number;
  /** 벽의 울퉁불퉁함(반지름 대비 비율, 0~0.2) */
  bumpiness?: number;
  colorA: string;
  colorB: string;
  /** 둘레 방향 줄무늬 수(근육·탄력 섬유 느낌). 0이면 없음 */
  rings?: number;
  /** 길이 방향 줄무늬 수 */
  streaks?: number;
  seed?: number;
}

function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** 부드러운 값 잡음(0~1) */
function noise2(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const h = (a: number, b: number) => hash(a * 57 + b * 131 + seed * 17);
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = h(xi, yi);
  const b = h(xi + 1, yi);
  const c = h(xi, yi + 1);
  const d = h(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/**
 * 경로를 따라 만든 혈관 벽. 안쪽에서 보이도록(법선이 안쪽을 향함) 만든다.
 * 추가 속성 aT: 각 정점의 경로 위치(0~1). 맥동 셰이더가 사용한다.
 * 둘레 방향 이음매는 같은 위치에 정점을 겹쳐 두어(심) 부드럽게 닫는다.
 */
export function buildVesselGeometry(o: VesselOptions): BufferGeometry {
  const tub = o.tubularSegments ?? 120;
  const rad = o.radialSegments ?? 18;
  const bump = o.bumpiness ?? 0.06;
  const seed = o.seed ?? 1;
  const frames = computePathFrames(o.curve, tub + 1);
  const ca = new Color(o.colorA);
  const cb = new Color(o.colorB);
  const tmp = new Color();

  const vCount = (tub + 1) * (rad + 1);
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const col = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
  const at = new Float32Array(vCount);

  let k = 0;
  for (let i = 0; i <= tub; i++) {
    const t = i / tub;
    const p = frames.points[i];
    const N = frames.normals[i];
    const B = frames.binormals[i];
    const r0 = o.radius(t);
    for (let j = 0; j <= rad; j++) {
      const jj = j % rad;
      const th = (jj / rad) * Math.PI * 2;
      const c = Math.cos(th);
      const s = Math.sin(th);
      const dx = N.x * c + B.x * s;
      const dy = N.y * c + B.y * s;
      const dz = N.z * c + B.z * s;
      const n = noise2(jj * 0.9, t * 40, seed);
      const r = r0 * (1 + bump * (n - 0.5) * 2);
      pos[k * 3] = p.x + dx * r;
      pos[k * 3 + 1] = p.y + dy * r;
      pos[k * 3 + 2] = p.z + dz * r;
      nor[k * 3] = -dx;
      nor[k * 3 + 1] = -dy;
      nor[k * 3 + 2] = -dz;
      let mix = n * 0.55;
      if (o.rings) mix += 0.35 * (0.5 + 0.5 * Math.sin(t * o.rings * Math.PI * 2));
      if (o.streaks) mix += 0.2 * (0.5 + 0.5 * Math.sin((jj / rad) * o.streaks * Math.PI * 2));
      tmp.copy(ca).lerp(cb, Math.min(1, mix));
      col[k * 3] = tmp.r;
      col[k * 3 + 1] = tmp.g;
      col[k * 3 + 2] = tmp.b;
      uv[k * 2] = j / rad;
      uv[k * 2 + 1] = t;
      at[k] = t;
      k++;
    }
  }

  const idx: number[] = [];
  for (let i = 0; i < tub; i++) {
    for (let j = 0; j < rad; j++) {
      const a = i * (rad + 1) + j;
      const b = (i + 1) * (rad + 1) + j;
      const c = (i + 1) * (rad + 1) + j + 1;
      const d = i * (rad + 1) + j + 1;
      // 안쪽에서 앞면이 보이는 감김 순서
      idx.push(a, b, d, b, c, d);
    }
  }

  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('normal', new BufferAttribute(nor, 3));
  g.setAttribute('color', new BufferAttribute(col, 3));
  g.setAttribute('uv', new BufferAttribute(uv, 2));
  g.setAttribute('aT', new BufferAttribute(at, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

export interface PulseUniforms {
  uTime: { value: number };
  /** 바깥쪽으로 부풀어 오르는 정도(월드 단위) */
  uAmp: { value: number };
  /** 경로를 따라 퍼지는 맥동 파장 수 */
  uWaves: { value: number };
}

/**
 * 맥동(박동에 맞춰 벽이 늘었다 줄었다 하는) 재질. 정점의 aT 속성을 사용한다.
 * 매 프레임 uniforms.uTime.value = runtime.time 으로 갱신한다(usePulse 훅 참고).
 */
export function createPulseMaterial(opts: {
  lowSpec?: boolean;
  transparent?: boolean;
  opacity?: number;
  doubleSide?: boolean;
  emissive?: string;
  emissiveIntensity?: number;
  roughness?: number;
}): { material: MeshStandardMaterial | MeshLambertMaterial; uniforms: PulseUniforms } {
  const uniforms: PulseUniforms = { uTime: { value: 0 }, uAmp: { value: 0 }, uWaves: { value: 3 } };
  const side: Side = opts.doubleSide ? DoubleSide : FrontSide;
  const common = {
    vertexColors: true,
    flatShading: true,
    side,
    transparent: !!opts.transparent,
    opacity: opts.opacity ?? 1,
    depthWrite: !opts.transparent,
    emissive: new Color(opts.emissive ?? '#000000'),
    emissiveIntensity: opts.emissiveIntensity ?? 0,
  };
  const material = opts.lowSpec
    ? new MeshLambertMaterial(common)
    : new MeshStandardMaterial({ ...common, roughness: opts.roughness ?? 0.75, metalness: 0 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uAmp = uniforms.uAmp;
    shader.uniforms.uWaves = uniforms.uWaves;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float aT;\nuniform float uTime;\nuniform float uAmp;\nuniform float uWaves;',
      )
      .replace(
        '#include <begin_vertex>',
        [
          '#include <begin_vertex>',
          // 박동 주기(64 bpm)에 맞춰 경로를 따라 퍼지는 맥동
          'float pulseW = 0.5 + 0.5 * sin(uTime * 6.2831853 / 0.9375 - aT * uWaves * 6.2831853);',
          'transformed -= objectNormal * uAmp * pulseW * pulseW;',
        ].join('\n'),
      );
  };
  material.customProgramCacheKey = () => `pulse-${opts.lowSpec ? 'l' : 's'}`;
  return { material, uniforms };
}
