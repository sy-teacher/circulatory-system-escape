// 폐동맥 쪽 공간: 판막(막 3장) 바로 뒤에서 시작하는 굵은 혈관. 두껍고 탄력 있는 벽이 박동마다 늘어난다.
// 산소가 적은 혈액(어두운 붉은색)이 박동에 맞춰 흐르고, 곧 두 갈래(양쪽 허파 방향)로 나뉘어 한 갈래를 따라간다.
// R5에서는 탐사선 앞에 혈관 단면 비교 홀로그램(A·B·C)이 뜬다.

import { useMemo } from 'react';
import { Quaternion, Vector3 } from 'three';
import type { LocationDef, LocationProps } from '../types';
import { PALETTE } from '../palette';
import { BloodCells } from '../shared/BloodCells';
import { poseOnPath } from '../shared/pathFrames';
import { clamp01, laneFor } from './vessels/common';
import { SemilunarValve } from './vessels/SemilunarValve';
import { Spots, type SpotDef } from './vessels/Spots';
import { VesselHologram } from './vessels/VesselHologram';
import { VesselWall } from './vessels/VesselWall';
import { WallCutaway } from './vessels/WallCutaway';
import { WallOpening } from './vessels/WallOpening';
import {
  PA,
  PA_ALL_HOLES,
  PA_FORK_ANCHOR,
  PA_FORK_FORWARD,
  PA_FORK_HOLE,
  PA_FORK_LENGTH,
  PA_HOLO,
  PA_HOLO_AHEAD,
  PA_HOLO_SPOT,
  PA_ROOT_LENGTH,
  PA_STOP_R5,
  PA_VALVE_ANCHOR,
  PA_WALL_ANCHOR,
  PA_WALL_WINDOW,
  paRadius,
  paValveFrame,
} from './vessels/paLayout';

const AMP = 0.25;
const WAVES = 2;
const CELL_RANGE: [number, number] = [0, 1];

const SPOTS: SpotDef[] = [
  { anchor: 'pa-valveback', position: PA_VALVE_ANCHOR },
  { anchor: 'pa-fork', position: PA_FORK_ANCHOR },
  { anchor: 'pa-wall', position: PA_WALL_ANCHOR, size: 0.6 },
  { anchor: 'pa-holo', position: PA_HOLO_SPOT, size: 0.5 },
];

function PulmonaryArteryScene(props: LocationProps) {
  const { lowSpec, reduceMotion, stepId } = props;
  const valve = useMemo(() => paValveFrame(), []);
  const holoQuat = useMemo(() => {
    const q = new Quaternion();
    // 탐사선 자세를 그대로 쓰면 홀로그램 앞면(+z)이 탐사선 쪽을 향한다
    poseOnPath(PA.pathFrames, clamp01(PA_STOP_R5 + PA_HOLO_AHEAD / PA.length), 0, 0, new Vector3(), q);
    return q;
  }, []);

  return (
    <group>
      <VesselWall
        layout={PA}
        colorA="#ee6a7c"
        colorB="#c24a5e"
        rings={22}
        bumpiness={0.03}
        seed={6}
        holes={PA_ALL_HOLES}
        amp={AMP}
        waves={WAVES}
        segments={[110, 32]}
        lowSegments={[72, 24]}
        emissive={PALETTE.arteryWall}
        emissiveIntensity={0.12}
        rootLength={PA_ROOT_LENGTH}
        lowSpec={lowSpec}
        reduceMotion={reduceMotion}
      />
      <SemilunarValve center={valve.center} downstream={valve.T} up={valve.N} radius={4.6} lowSpec={lowSpec} reduceMotion={reduceMotion} />
      <WallOpening
        layout={PA}
        hole={PA_FORK_HOLE}
        forward={PA_FORK_FORWARD}
        length={PA_FORK_LENGTH}
        rimThickness={0.45}
        rimColor="#f590a0"
        colorA="#ee6a7c"
        colorB="#c24a5e"
        flow="out"
        cellCount={10}
        cellSpeed={4.5}
        o2="poor"
        amp={AMP}
        waves={WAVES}
        lowSpec={lowSpec}
        reduceMotion={reduceMotion}
        seed={31}
      />
      <WallCutaway layout={PA} hole={PA_WALL_WINDOW} depth={1.0} amp={AMP} waves={WAVES} lowSpec={lowSpec} reduceMotion={reduceMotion} />
      <BloodCells
        curve={PA.axis}
        radius={paRadius}
        count={lowSpec ? 45 : 90}
        speed={6}
        o2="poor"
        pulsatile
        clearRadius={2.0}
        tRange={CELL_RANGE}
        seed={17}
      />
      <VesselHologram position={PA_HOLO} quaternion={holoQuat} visible={stepId === 'R5'} lowSpec={lowSpec} reduceMotion={reduceMotion} />
      <Spots spots={SPOTS} props={props} />
    </group>
  );
}

export const paLocation: LocationDef = {
  id: 'pa',
  path: PA.path,
  laneHalfWidth: laneFor(paRadius),
  background: '#c0606f',
  fog: { color: '#c0606f', near: 6, far: 50 },
  ambient: { sky: '#ffe0e4', ground: '#9a3a4e', intensity: 0.9 },
  vehicle: 'probe',
  heartbeat: 0.7,
  Component: PulmonaryArteryScene,
};
