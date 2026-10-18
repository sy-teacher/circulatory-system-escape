// 대동맥: 판막(막 3장) 바로 뒤에서 아주 굵게 시작해 위로 활처럼 휘었다가 내려간다.
// 두껍고 탄력 있는 벽이 박동마다 크게 늘어나고(물결처럼 퍼짐), 혈액이 박동에 맞춰 세차게 흐른다.
// 내려가는 동안 여러 갈래로 갈라지며 점점 가늘어진다(모세혈관과 바로 이어지지 않음).

import { useMemo } from 'react';
import type { LocationDef, LocationProps } from '../types';
import { PALETTE } from '../palette';
import { BloodCells } from '../shared/BloodCells';
import { BigRbc } from './vessels/BigRbc';
import { laneFor } from './vessels/common';
import { SemilunarValve } from './vessels/SemilunarValve';
import { Spots, type SpotDef } from './vessels/Spots';
import { VesselWall } from './vessels/VesselWall';
import { WallOpening } from './vessels/WallOpening';
import {
  AORTA,
  AORTA_ALL_HOLES,
  AORTA_ARCH_BRANCHES,
  AORTA_BIG_RBC,
  AORTA_BRANCH_ANCHOR,
  AORTA_LOWER_BRANCHES,
  AORTA_STOP_BRANCH,
  aortaRadius,
} from './vessels/aortaLayout';

const AMP = 0.35;
const WAVES = 4;
const VALVE_BACK = 2.0;
const RIM = '#ff9eaa';
const CELL_RANGE: [number, number] = [0, 1];

const SPOTS: SpotDef[] = [
  { anchor: 'ao-rbc', position: AORTA_BIG_RBC, size: 0.55 },
  { anchor: 'ao-branch', position: AORTA_BRANCH_ANCHOR },
];

const BRANCHES = [...AORTA_ARCH_BRANCHES, AORTA_STOP_BRANCH, ...AORTA_LOWER_BRANCHES];

function AortaScene(props: LocationProps) {
  const { lowSpec, reduceMotion } = props;
  const valve = useMemo(() => {
    const T = AORTA.frames.tangents[0].clone();
    return {
      center: AORTA.frames.points[0].clone().addScaledVector(T, -VALVE_BACK),
      T,
      N: AORTA.frames.normals[0].clone(),
    };
  }, []);

  return (
    <group>
      <VesselWall
        layout={AORTA}
        colorA={PALETTE.arteryWall}
        colorB={PALETTE.arteryWallDeep}
        rings={46}
        bumpiness={0.03}
        seed={2}
        holes={AORTA_ALL_HOLES}
        amp={AMP}
        waves={WAVES}
        segments={[200, 36]}
        lowSegments={[130, 32]}
        emissive={PALETTE.arteryWall}
        emissiveIntensity={0.14}
        rootLength={4.2}
        lowSpec={lowSpec}
        reduceMotion={reduceMotion}
      />
      <SemilunarValve center={valve.center} downstream={valve.T} up={valve.N} radius={6.55} lowSpec={lowSpec} reduceMotion={reduceMotion} />
      {BRANCHES.map((b, i) => (
        <WallOpening
          key={i}
          layout={AORTA}
          hole={b.hole}
          forward={b.forward}
          length={b.length}
          rimThickness={0.6}
          rimColor={RIM}
          colorA={PALETTE.arteryWall}
          colorB={PALETTE.arteryWallDeep}
          flow="out"
          cellCount={i < 3 ? 6 : 5}
          cellSpeed={5}
          o2="rich"
          amp={AMP}
          waves={WAVES}
          lowSpec={lowSpec}
          reduceMotion={reduceMotion}
          seed={i + 1}
        />
      ))}
      <BloodCells
        curve={AORTA.axis}
        radius={aortaRadius}
        count={lowSpec ? 60 : 130}
        speed={8}
        o2="rich"
        pulsatile
        clearRadius={2.4}
        tRange={CELL_RANGE}
        seed={11}
      />
      <BigRbc position={AORTA_BIG_RBC} lowSpec={lowSpec} reduceMotion={reduceMotion} />
      <Spots spots={SPOTS} props={props} />
    </group>
  );
}

export const aortaLocation: LocationDef = {
  id: 'aorta',
  path: AORTA.path,
  laneHalfWidth: laneFor(aortaRadius),
  background: '#f6a5a8',
  fog: { color: '#f6a5a8', near: 10, far: 72 },
  ambient: { sky: '#fff4f0', ground: '#e0707e', intensity: 1.0 },
  vehicle: 'probe',
  heartbeat: 0.7,
  Component: AortaScene,
};
