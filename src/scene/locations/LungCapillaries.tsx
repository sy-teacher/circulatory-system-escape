// 허파의 모세혈관(lungCap). 단계 S7(t=0.42), R2(t=0.72).
// 반투명한 허파꽈리 무리가 숨쉬듯 부풀었다 줄어든다. 우리가 탄 모세혈관은 주머니 하나의 바깥 표면을 감싸며 돌고,
// 다른 가는 혈관들이 주머니를 그물처럼 감싼다. 공기(주머니 안)와 혈액(혈관 안)은 얇은 두 겹의 벽으로 나뉜다.
// 학습용 시각화: 산소는 주머니 → 혈액, 이산화탄소는 혈액 → 주머니. 적혈구는 산소가 적은 → 산소가 풍부한 색으로 바뀐다.
// ※ 적혈구와 탐사선은 주머니 안으로 들어가지 않는다. 주머니에 정답 이름을 붙이지 않는다('공기'만 표시).

import { useMemo } from 'react';
import { BloodCells } from '../shared/BloodCells';
import { Hotspot } from '../shared/Hotspot';
import { ARROW_COLOR, CanvasLabel, FlowArrow, LearningSign, Molecules, type LegendItem } from '../shared/Molecules';
import type { LocationDef, LocationProps } from '../types';
import { Alveoli } from './capillary/Alveoli';
import { ThinVessels } from './capillary/common';
import {
  AIR_LABELS,
  LUNG,
  LUNG_ANCHORS,
  LUNG_TUBES,
  POOR_RANGE,
  R2_VIEWER,
  RICH_RANGE,
  S7_ARROWS,
  S7_ROUTES,
  S7_SIGN,
  SACS,
  airRoutes,
  lungRadius,
} from './capillary/lungLayout';
import { PlasmaViewer } from './capillary/PlasmaViewer';

const LUNG_LEGEND: LegendItem[] = [
  { kind: 'o2', label: 'O₂ 산소' },
  { kind: 'co2', label: 'CO₂ 이산화탄소' },
];

const ANCHOR_IDS = Object.keys(LUNG_ANCHORS);

function LungCapillaries(props: LocationProps) {
  const { lowSpec, reduceMotion } = props;
  const air = useMemo(() => airRoutes(lowSpec), [lowSpec]);
  const k = lowSpec ? 0.6 : 1;

  return (
    <group>
      {/* 허파꽈리 무리와 그물처럼 감싼 가는 혈관 */}
      <Alveoli sacs={SACS} lowSpec={lowSpec} reduceMotion={reduceMotion} />
      {/* 우리가 지나는 아주 얇은 혈관 벽(+ 갈라지고 모이는 가지) */}
      <ThinVessels tubes={LUNG_TUBES} lowSpec={lowSpec} reduceMotion={reduceMotion} opacity={0.48} />

      {/* 공기 공간: 주머니 안에 떠 있는 산소 */}
      <Molecules kind="o2" routes={air} count={Math.round(air.length * 1.3)} speed={0.22} lowSpec={lowSpec} reduceMotion={reduceMotion} wobble={0.3} seed={41} />
      {AIR_LABELS.map((p, i) => (
        <CanvasLabel key={i} text="공기" position={p} height={0.55} />
      ))}

      {/* 혈액 공간: 한 줄로 지나가는 적혈구. 교환 전에는 산소가 적은(어두운 붉은색), 교환 뒤에는 산소가 풍부한 적혈구 */}
      <BloodCells
        curve={LUNG.axis}
        radius={lungRadius}
        count={Math.round(13 * k)}
        speed={1.7}
        o2="poor"
        size={0.85}
        tRange={POOR_RANGE}
        singleFile
        seed={31}
      />
      <BloodCells
        curve={LUNG.axis}
        radius={lungRadius}
        count={Math.round(13 * k)}
        speed={1.7}
        o2="rich"
        size={0.85}
        tRange={RICH_RANGE}
        singleFile
        seed={32}
      />

      {/* S7: 기체 교환(학습용 시각화) */}
      <Molecules kind="o2" routes={S7_ROUTES.o2} count={12} speed={0.5} lowSpec={lowSpec} reduceMotion={reduceMotion} wobble={0.08} seed={42} />
      <Molecules kind="co2" routes={S7_ROUTES.co2} count={8} speed={0.5} lowSpec={lowSpec} reduceMotion={reduceMotion} wobble={0.08} seed={43} />
      {S7_ARROWS.map((a, i) => (
        <FlowArrow key={i} from={a.from} to={a.to} color={ARROW_COLOR[a.kind]} radius={0.05} />
      ))}
      <LearningSign position={S7_SIGN.pos} quaternion={S7_SIGN.quat} width={S7_SIGN.width} legend={LUNG_LEGEND} />

      {/* R2: 확대 관찰 창 + 분리 캡슐 */}
      <PlasmaViewer
        magnifier={R2_VIEWER.magnifier}
        magnifierQuat={R2_VIEWER.magnifierQuat}
        radius={R2_VIEWER.magnifierRadius}
        capsule={R2_VIEWER.capsule}
        capsuleQuat={R2_VIEWER.capsuleQuat}
        focus={R2_VIEWER.focus}
        lowSpec={lowSpec}
        reduceMotion={reduceMotion}
      />

      {/* 관찰 지점 */}
      {ANCHOR_IDS.map((a) => (
        <Hotspot
          key={a}
          anchor={a}
          position={LUNG_ANCHORS[a]}
          active={props.activeAnchors.includes(a)}
          observed={props.observedAnchors.includes(a)}
          label={props.anchorLabels[a]}
          onSelect={props.onAnchorClick}
          size={0.5}
        />
      ))}
    </group>
  );
}

export const lungCapLocation: LocationDef = {
  id: 'lungCap',
  path: LUNG.path,
  // 모세혈관 안에서는 조향하지 않는다
  laneHalfWidth: () => 0,
  background: '#fff1ec',
  fog: { color: '#ffede7', near: 8, far: 56 },
  ambient: { sky: '#ffffff', ground: '#f7d3d3', intensity: 1.1 },
  vehicle: 'probe',
  heartbeat: 0.2,
  Component: LungCapillaries,
};
