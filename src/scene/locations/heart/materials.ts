// 심장 방 재질. 조명이 약해도 밝고 친근하게 보이도록 자기 색의 일부를 스스로 빛나게 한다.
// contract: 정점 속성 aW(0~1)만큼 uCenter 쪽으로 당기는 수축(벽 전체가 박동에 맞춰 오므라든다)

import {
  Color,
  DoubleSide,
  FrontSide,
  MeshLambertMaterial,
  MeshStandardMaterial,
  Vector3,
  type Material,
} from 'three';

export interface HeartMaterialUniforms {
  uK: { value: number };
  uCenter: { value: Vector3 };
  uSelfLit: { value: number };
}

export interface HeartMaterialOptions {
  lowSpec: boolean;
  /** 정점색 사용(아니면 color) */
  vertexColors?: boolean;
  color?: string;
  /** 스스로 빛나는 정도(0~1) */
  selfLit?: number;
  contract?: boolean;
  doubleSide?: boolean;
  transparent?: boolean;
  opacity?: number;
  roughness?: number;
}

export function createHeartMaterial(o: HeartMaterialOptions): { material: MeshStandardMaterial | MeshLambertMaterial; uniforms: HeartMaterialUniforms } {
  const uniforms: HeartMaterialUniforms = {
    uK: { value: 0 },
    uCenter: { value: new Vector3() },
    uSelfLit: { value: o.selfLit ?? 0.25 },
  };
  const common = {
    vertexColors: !!o.vertexColors,
    color: new Color(o.color ?? '#ffffff'),
    flatShading: true,
    side: o.doubleSide ? DoubleSide : FrontSide,
    transparent: !!o.transparent,
    opacity: o.opacity ?? 1,
    depthWrite: !o.transparent,
  };
  const material: MeshStandardMaterial | MeshLambertMaterial = o.lowSpec
    ? new MeshLambertMaterial(common)
    : new MeshStandardMaterial({ ...common, roughness: o.roughness ?? 0.78, metalness: 0 });
  const contract = !!o.contract;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSelfLit = uniforms.uSelfLit;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uSelfLit;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * uSelfLit;');
    if (contract) {
      shader.uniforms.uK = uniforms.uK;
      shader.uniforms.uCenter = uniforms.uCenter;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aW;\nuniform float uK;\nuniform vec3 uCenter;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = uCenter + (transformed - uCenter) * (1.0 - uK * aW);');
    }
  };
  material.customProgramCacheKey = () => `heart-${contract ? 'c' : 'n'}-${o.lowSpec ? 'l' : 's'}`;
  return { material, uniforms };
}

/** 여러 재질 한꺼번에 정리 */
export function disposeAll(list: (Material | { dispose: () => void })[]): void {
  for (const m of list) m.dispose();
}
