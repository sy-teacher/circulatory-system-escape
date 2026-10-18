// 대정맥 쪽 공간: 얇고 부드러운 벽의 가는 정맥에서 시작해, 옆에서 다른 혈관들이 계속 합쳐지며 점점 굵어진다.
// 산소가 적은 혈액(어두운 붉은색)이 박동에 크게 출렁이지 않고 느리고 고르게 흐른다.
// 이 혈관 안에는 판막이 없다. 끝은 박동하는 심장의 한 방 입구로 열린다(이름표 없음).

import { useMemo } from 'react';
import type { LocationDef, LocationProps } from '../types';
import { PALETTE } from '../palette';
import { BloodCells } from '../shared/BloodCells';
import { ChamberGlimpse } from './vessels/ChamberGlimpse';
import { laneFor, type V3 } from './vessels/common';
import { FlowMarkers } from './vessels/FlowMarkers';
import { Spots, type SpotDef } from './vessels/Spots';
import { VesselWall } from './vessels/VesselWall';
import { WallOpening } from './vessels/WallOpening';
import { WoundPlug } from './vessels/WoundPlug';
import {
  VC_AHEAD_ANCHOR,
  VC_ALL_HOLES,
  VC_FLOW_ANCHOR,
  VC_FLOW_LABEL,
  VC_FLOW_LINES,
  VC_FLOW_RANGE,
  VC_MERGE_ANCHOR,
  VC_TRIBUTARIES,
  VC_WOUND,
  VC_WOUND_ANCHOR,
  VENA_CAVA,
  vcRadius,
} from './vessels/venaCavaLayout';

/** 정맥 벽은 거의 출렁이지 않는다 */
const AMP = 0.02;
const WAVES = 1;
const CELL_RANGE: [number, number] = [0, 1];

const SPOTS: SpotDef[] = [
  { anchor: 'vc-wound', position: VC_WOUND_ANCHOR, size: 0.6 },
  { anchor: 'vc-merge', position: VC_MERGE_ANCHOR },
  { anchor: 'vc-flow', position: VC_FLOW_ANCHOR },
  { anchor: 'vc-ahead', position: VC_AHEAD_ANCHOR },
];

function VenaCavaScene(props: LocationProps) {
  const { lowSpec, reduceMotion, stepId } = props;
  const chamber = useMemo(() => {
    const n = VENA_CAVA.frames.count - 1;
    const end = VENA_CAVA.frames.points[n];
    const T = VENA_CAVA.frames.tangents[n];
    const d = 9;
    const c = end.clone().addScaledVector(T, d);
    const R = vcRadius(1);
    return { center: [c.x, c.y, c.z] as V3, radius: Math.sqrt(d * d + R * R) * 1.06 };
  }, []);

  return (
    <group>
      <VesselWall
        layout={VENA_CAVA}
        colorA={PALETTE.veinWall}
        colorB={PALETTE.veinWallDeep}
        streaks={5}
        bumpiness={0.05}
        seed={4}
        holes={VC_ALL_HOLES}
        amp={AMP}
        waves={WAVES}
        segments={[150, 26]}
        lowSegments={[100, 20]}
        emissive={PALETTE.veinWall}
        emissiveIntensity={0.12}
        rootLength={6}
        lowSpec={lowSpec}
        reduceMotion={reduceMotion}
      />
      {VC_TRIBUTARIES.map((b, i) => (
        <WallOpening
          key={i}
          layout={VENA_CAVA}
          hole={b.hole}
          forward={b.forward}
          length={b.length}
          rimThickness={0.16}
          rimColor="#e98a9c"
          colorA={PALETTE.veinWall}
          colorB={PALETTE.veinWallDeep}
          flow="in"
          cellCount={6}
          cellSpeed={2}
          o2="poor"
          amp={AMP}
          waves={WAVES}
          lowSpec={lowSpec}
          reduceMotion={reduceMotion}
          seed={i + 21}
        />
      ))}
      <BloodCells
        curve={VENA_CAVA.axis}
        radius={vcRadius}
        count={lowSpec ? 50 : 100}
        speed={2.2}
        o2="poor"
        clearRadius={1.7}
        tRange={CELL_RANGE}
        seed={13}
      />
      <WoundPlug layout={VENA_CAVA} t={VC_WOUND.t} angle={VC_WOUND.angle} playing={stepId === 'R4'} lowSpec={lowSpec} reduceMotion={reduceMotion} />
      {stepId === 'S3' && (
        <FlowMarkers
          layout={VENA_CAVA}
          range={VC_FLOW_RANGE}
          lines={VC_FLOW_LINES}
          speed={1.3}
          labelAt={VC_FLOW_LABEL}
          lowSpec={lowSpec}
          reduceMotion={reduceMotion}
        />
      )}
      <ChamberGlimpse center={chamber.center} radius={chamber.radius} lowSpec={lowSpec} reduceMotion={reduceMotion} seed={7} />
      <Spots spots={SPOTS} props={props} />
    </group>
  );
}

export const venaCavaLocation: LocationDef = {
  id: 'venaCava',
  path: VENA_CAVA.path,
  laneHalfWidth: laneFor(vcRadius),
  background: '#b65466',
  fog: { color: '#b65466', near: 6, far: 64 },
  ambient: { sky: '#ffdfe3', ground: '#8e3448', intensity: 0.9 },
  vehicle: 'probe',
  heartbeat: 0.6,
  Component: VenaCavaScene,
};
