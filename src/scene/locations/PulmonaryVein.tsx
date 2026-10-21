// 폐정맥 쪽 공간: 허파에서 오는 가는 혈관 여러 개가 모여 중간 굵기의 혈관이 된다.
// 벽은 매끈하고 폐동맥보다 얇으며, 산소가 풍부한 혈액(선명한 붉은색)이 고르게 흐른다.
// 끝은 심장의 한 방으로 열린다(이름표 없음). R3: 백혈구가 세균을 감싸 삼키는 장면.

import { useMemo } from 'react';
import type { LocationDef, LocationProps } from '../types';
import { PALETTE } from '../palette';
import { BloodCells } from '../shared/BloodCells';
import { ChamberGlimpse } from './vessels/ChamberGlimpse';
import { laneFor, type V3 } from './vessels/common';
import { Spots, type SpotDef } from './vessels/Spots';
import { VesselWall } from './vessels/VesselWall';
import { WallOpening } from './vessels/WallOpening';
import { WbcChase } from './vessels/WbcChase';
import {
  PV,
  PV_AHEAD_ANCHOR,
  PV_ALL_HOLES,
  PV_MERGE_ANCHOR,
  PV_TRIBUTARIES,
  PV_WBC_CENTER,
  PV_WBC_SPOT,
  pvRadius,
  pvWbcQuaternion,
} from './vessels/pvLayout';

const AMP = 0.05;
const WAVES = 2;
const CELL_RANGE: [number, number] = [0, 1];
const WALL_A = '#e07488';
const WALL_B = '#c95a72';

const SPOTS: SpotDef[] = [
  { anchor: 'pv-merge', position: PV_MERGE_ANCHOR },
  { anchor: 'pv-ahead', position: PV_AHEAD_ANCHOR },
  { anchor: 'pv-wbc', position: PV_WBC_SPOT, size: 0.55 },
];

function PulmonaryVeinScene(props: LocationProps) {
  const { lowSpec, reduceMotion, stepId } = props;
  const chamber = useMemo(() => {
    const n = PV.frames.count - 1;
    const end = PV.frames.points[n];
    const T = PV.frames.tangents[n];
    const d = 7;
    const c = end.clone().addScaledVector(T, d);
    const R = pvRadius(1);
    return { center: [c.x, c.y, c.z] as V3, radius: Math.sqrt(d * d + R * R) * 1.06 };
  }, []);
  const wbcQuat = useMemo(() => pvWbcQuaternion(), []);

  return (
    <group>
      <VesselWall
        layout={PV}
        colorA={WALL_A}
        colorB={WALL_B}
        bumpiness={0.015}
        seed={8}
        holes={PV_ALL_HOLES}
        amp={AMP}
        waves={WAVES}
        segments={[130, 26]}
        lowSegments={[90, 20]}
        emissive={PALETTE.arteryWall}
        emissiveIntensity={0.14}
        rootLength={5}
        lowSpec={lowSpec}
        reduceMotion={reduceMotion}
      />
      {PV_TRIBUTARIES.map((b, i) => (
        <WallOpening
          key={i}
          layout={PV}
          hole={b.hole}
          forward={b.forward}
          length={b.length}
          rimThickness={0.22}
          rimColor="#f095a3"
          colorA={WALL_A}
          colorB={WALL_B}
          flow="in"
          cellCount={5}
          cellSpeed={3}
          o2="rich"
          amp={AMP}
          waves={WAVES}
          lowSpec={lowSpec}
          reduceMotion={reduceMotion}
          seed={i + 41}
        />
      ))}
      <BloodCells
        curve={PV.axis}
        radius={pvRadius}
        count={lowSpec ? 50 : 100}
        speed={3.6}
        o2="rich"
        clearRadius={1.6}
        tRange={CELL_RANGE}
        seed={19}
      />
      <WbcChase
        center={PV_WBC_CENTER}
        quaternion={wbcQuat}
        visible={stepId === 'R3' || stepId === 'S8'}
        lowSpec={lowSpec}
        reduceMotion={reduceMotion}
      />
      <ChamberGlimpse center={chamber.center} radius={chamber.radius} lowSpec={lowSpec} reduceMotion={reduceMotion} seed={9} />
      <Spots spots={SPOTS} props={props} />
    </group>
  );
}

export const pvLocation: LocationDef = {
  id: 'pv',
  path: PV.path,
  laneHalfWidth: laneFor(pvRadius),
  background: '#ee8c90',
  fog: { color: '#ee8c90', near: 8, far: 62 },
  ambient: { sky: '#fff2ee', ground: '#cf5e6e', intensity: 1.0 },
  vehicle: 'probe',
  heartbeat: 0.5,
  Component: PulmonaryVeinScene,
};
