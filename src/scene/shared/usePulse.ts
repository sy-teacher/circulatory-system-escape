import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { BEAT_PERIOD, runtime } from '../runtime';
import { createPulseMaterial } from './vesselGeometry';

/**
 * 맥동 재질을 만들고 매 프레임 시간을 갱신한다.
 * amp: 최대 부풀기(월드 단위). reduceMotion이면 30%로 줄인다.
 */
export function usePulseMaterial(opts: Parameters<typeof createPulseMaterial>[0] & { amp: number; waves?: number; reduceMotion?: boolean }) {
  const { material, uniforms } = useMemo(
    () => createPulseMaterial(opts),
    // 재질 종류가 바뀔 때만 다시 만든다
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [opts.lowSpec, opts.transparent, opts.opacity, opts.doubleSide, opts.emissive, opts.emissiveIntensity],
  );
  useEffect(() => () => material.dispose(), [material]);
  useFrame(() => {
    // 장면 공통 박동 위상을 써서 판막·효과음과 같은 박자로 맥동한다
    uniforms.uTime.value = runtime.beatPhase * BEAT_PERIOD;
    uniforms.uAmp.value = opts.amp * (opts.reduceMotion ? 0.3 : 1);
    uniforms.uWaves.value = opts.waves ?? 2;
  });
  return material;
}
