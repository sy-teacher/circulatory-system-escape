// 온몸의 모세혈관(sysCap). 단계 S2(t=0.45), R6(t=0.7).
// 작은 동맥이 갈라지며 가늘어져 모세혈관이 된다. 아주 얇은 반투명 벽 너머로 몸의 세포(근육 세포처럼 길쭉함)가 빽빽하다.
// 적혈구는 한 줄로, 모양을 살짝 바꾸며 지나가고 혈관 밖으로 나가지 않는다.
// 학습용 시각화: 산소·영양소는 혈액 → 세포, 이산화탄소·노폐물은 세포 → 혈액. (탐사선·혈관 크기는 학습용으로 조정)
// ※ 이 공간에는 정답 장소 이름을 쓰지 않는다. 공기 주머니도 없다.

import { useMemo } from 'react';
import { BloodCells } from '../shared/BloodCells';
import { Hotspot } from '../shared/Hotspot';
import { ARROW_COLOR, FlowArrow, LearningSign, Molecules, type LegendItem } from '../shared/Molecules';
import type { LocationDef, LocationProps } from '../types';
import { ThinVessels } from './capillary/common';
import { StaticTubes } from './capillary/StaticTubes';
import {
  POOR_RANGE,
  R6_ARROWS,
  R6_CELL,
  R6_ROUTES,
  R6_SIGN,
  RICH_RANGE,
  S2_ARROWS,
  S2_ROUTES,
  S2_SIGN,
  SYS,
  SYS_ANCHORS,
  SYS_NETWORK,
  SYS_TUBES,
  buildTissue,
  sysRadius,
} from './capillary/sysLayout';
import { TissueCells } from './capillary/TissueCells';
import { WorkingCell } from './capillary/WorkingCell';

const R6_LEGEND: LegendItem[] = [
  { kind: 'o2', label: 'O₂ 산소' },
  { kind: 'nutrient', label: '영양소' },
  { kind: 'co2', label: 'CO₂ 이산화탄소' },
  { kind: 'water', label: '물' },
];

const ANCHOR_IDS = Object.keys(SYS_ANCHORS);

function SystemicCapillaries(props: LocationProps) {
  const { lowSpec, reduceMotion } = props;
  const tissue = useMemo(() => buildTissue(lowSpec), [lowSpec]);
  const k = lowSpec ? 0.6 : 1;

  return (
    <group>
      {/* 아주 얇은 반투명 벽(+ 갈라지고 모이는 가지 혈관) */}
      <ThinVessels tubes={SYS_TUBES} lowSpec={lowSpec} reduceMotion={reduceMotion} opacity={0.35} />

      {/* 바깥의 몸 세포와 다른 모세혈관 그물 */}
      <TissueCells layout={tissue} lowSpec={lowSpec} />
      <StaticTubes lines={SYS_NETWORK} lowSpec={lowSpec} />

      {/* 한 줄로 지나가는 적혈구: 앞쪽은 산소가 풍부, 교환 뒤에는 산소가 적은(어두운 붉은색) 적혈구 */}
      <BloodCells
        curve={SYS.axis}
        radius={sysRadius}
        count={Math.round(15 * k)}
        speed={1.6}
        o2="rich"
        size={0.85}
        tRange={RICH_RANGE}
        singleFile
        seed={21}
      />
      <BloodCells
        curve={SYS.axis}
        radius={sysRadius}
        count={Math.round(15 * k)}
        speed={1.6}
        o2="poor"
        size={0.85}
        tRange={POOR_RANGE}
        singleFile
        seed={22}
      />

      {/* S2: 물질 교환(학습용 시각화) */}
      <Molecules kind="o2" routes={S2_ROUTES.o2} count={12} speed={0.45} lowSpec={lowSpec} reduceMotion={reduceMotion} wobble={0.06} seed={1} />
      <Molecules kind="nutrient" routes={S2_ROUTES.nutrient} count={6} speed={0.4} lowSpec={lowSpec} reduceMotion={reduceMotion} wobble={0.06} seed={2} />
      <Molecules kind="co2" routes={S2_ROUTES.co2} count={8} speed={0.45} lowSpec={lowSpec} reduceMotion={reduceMotion} wobble={0.06} seed={3} />
      <Molecules kind="waste" routes={S2_ROUTES.waste} count={6} speed={0.4} lowSpec={lowSpec} reduceMotion={reduceMotion} wobble={0.06} seed={4} />
      {S2_ARROWS.map((a, i) => (
        <FlowArrow key={i} from={a.from} to={a.to} color={ARROW_COLOR[a.kind]} />
      ))}
      <LearningSign position={S2_SIGN.pos} quaternion={S2_SIGN.quat} width={S2_SIGN.width} />

      {/* R6: 혈관 옆 세포 하나를 크게 */}
      <WorkingCell center={R6_CELL.center} radius={R6_CELL.radius} quaternion={R6_CELL.quat} lowSpec={lowSpec} reduceMotion={reduceMotion} />
      <Molecules kind="o2" routes={R6_ROUTES.o2} count={8} speed={0.5} lowSpec={lowSpec} reduceMotion={reduceMotion} wobble={0.08} seed={5} />
      <Molecules kind="nutrient" routes={R6_ROUTES.nutrient} count={5} speed={0.45} lowSpec={lowSpec} reduceMotion={reduceMotion} wobble={0.08} seed={6} />
      <Molecules kind="co2" routes={R6_ROUTES.co2} count={7} speed={0.5} lowSpec={lowSpec} reduceMotion={reduceMotion} wobble={0.08} seed={7} />
      <Molecules kind="water" routes={R6_ROUTES.water} count={6} speed={0.45} lowSpec={lowSpec} reduceMotion={reduceMotion} wobble={0.08} seed={8} />
      {R6_ARROWS.map((a, i) => (
        <FlowArrow key={`r6-${i}`} from={a.from} to={a.to} color={ARROW_COLOR[a.kind]} />
      ))}
      <LearningSign position={R6_SIGN.pos} quaternion={R6_SIGN.quat} width={R6_SIGN.width} legend={R6_LEGEND} />

      {/* 관찰 지점 */}
      {ANCHOR_IDS.map((a) => (
        <Hotspot
          key={a}
          anchor={a}
          position={SYS_ANCHORS[a]}
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

export const sysCapLocation: LocationDef = {
  id: 'sysCap',
  path: SYS.path,
  // 모세혈관 안에서는 조향하지 않는다(탐사선이 혈관 폭에 꼭 맞음)
  laneHalfWidth: () => 0,
  background: '#ffd9c9',
  fog: { color: '#ffd6c6', near: 6, far: 44 },
  ambient: { sky: '#fff4ea', ground: '#f2a48e', intensity: 1.05 },
  vehicle: 'probe',
  heartbeat: 0.15,
  Component: SystemicCapillaries,
};
