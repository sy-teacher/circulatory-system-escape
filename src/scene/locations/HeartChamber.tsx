// 심장의 네 방(우심방·우심실·좌심방·좌심실) 장면. 하나의 컴포넌트가 방 id에 따라 설계(heart/design)를 골라 그린다.
// 방마다 모양·벽 두께·입구 수·판막 종류·움직임이 다르다. 화면 글자에는 정답 방 이름을 쓰지 않는다.
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { Vector3 } from 'three';
import { runtime } from '../runtime';
import { BloodCells } from '../shared/BloodCells';
import { Hotspot } from '../shared/Hotspot';
import type { LocationProps } from '../types';
import { chamberK, chamberScene, T_IN, T_OUT, type ChamberId } from './heart/design';
import { ExplorationFlag } from './heart/ExplorationFlag';
import { createHeartMaterial } from './heart/materials';
import { ContractGroup, MuscleBars, PapillaryMuscles } from './heart/Muscles';
import { Openings } from './heart/Openings';
import { RoomCells } from './heart/RoomCells';
import { buildRoomGeometry } from './heart/roomModel';
import { Chordae, Valve, type ValveState } from './heart/Valve';
import { WallComparison } from './heart/WallComparison';

const IN_RANGE: [number, number] = [0, T_IN + 0.006];
const OUT_RANGE: [number, number] = [T_OUT - 0.006, 1];
const TUBE = () => 3.2;

type Tuple = [number, number, number];
const tuple = (v: Vector3): Tuple => [v.x, v.y, v.z];

export function HeartChamber({ id, ...props }: LocationProps & { id: ChamberId }) {
  const { lowSpec, reduceMotion, activeAnchors, observedAnchors, anchorLabels, onAnchorClick, flagPlanted } = props;
  const sc = useMemo(() => chamberScene(id, lowSpec), [id, lowSpec]);
  const m = sc.model;

  // 방 벽(박동에 맞춰 수축하는 셰이더)
  const wallGeometry = useMemo(() => buildRoomGeometry(m, sc.wallRes.rings, sc.wallRes.radial), [m, sc]);
  const wall = useMemo(() => {
    const w = createHeartMaterial({ lowSpec, vertexColors: true, selfLit: 0.28, contract: true });
    w.uniforms.uCenter.value.copy(m.center);
    return w;
  }, [lowSpec, m]);
  useEffect(() => () => wallGeometry.dispose(), [wallGeometry]);
  useEffect(() => () => wall.material.dispose(), [wall]);

  // 판막 상태(0 열림 ~ 1 닫힘). 반달판막은 이완기에 닫혀 있으므로 닫힌 상태로 시작한다.
  const inletState = useMemo<ValveState>(() => ({ closed: 0 }), [sc]);
  const outletState = useMemo<ValveState>(() => ({ closed: sc.outletValve.kind === 'semilunar' ? 1 : 0 }), [sc]);

  const lightPos = useMemo(() => tuple(m.pointAt(m.sStop, 0, 2.6, new Vector3())), [m]);

  useFrame(() => {
    wall.uniforms.uK.value = chamberK(id, runtime.contraction, runtime.atrialContraction, reduceMotion);
  });

  const forceInlet = () => runtime.pathT < sc.inletForceT;
  const forceOutlet = () => runtime.pathT > sc.outletForceT;
  // 심실에서 나가는 혈액은 박동에 맞춰 세차게 흐른다
  const pulsatileOut = sc.role === 'ventricle';

  const spot = (a: string, pos: Vector3) => (
    <Hotspot
      key={a}
      anchor={a}
      position={tuple(pos)}
      active={activeAnchors.includes(a)}
      observed={observedAnchors.includes(a)}
      label={anchorLabels[a]}
      onSelect={onAnchorClick}
    />
  );
  const staticAnchors = Object.entries(sc.anchors).filter(([a]) => !sc.movingAnchors.includes(a));
  const movingAnchors = Object.entries(sc.anchors).filter(([a]) => sc.movingAnchors.includes(a));

  return (
    <group>
      <pointLight position={lightPos} color={sc.light} intensity={0.9} decay={0} />

      <mesh geometry={wallGeometry} material={wall.material} frustumCulled={false} />
      <Openings sc={sc} lowSpec={lowSpec} />

      {sc.inletValve && <Valve spec={sc.inletValve} state={inletState} forceOpen={forceInlet} lowSpec={lowSpec} reduceMotion={reduceMotion} />}
      <Valve spec={sc.outletValve} state={outletState} forceOpen={forceOutlet} lowSpec={lowSpec} reduceMotion={reduceMotion} />

      <MuscleBars bars={sc.fixedBars} color={sc.fixedBarColor} lowSpec={lowSpec} />
      <ContractGroup chamber={id} center={m.center} reduceMotion={reduceMotion}>
        <MuscleBars bars={sc.bars} color={sc.barColor} lowSpec={lowSpec} />
        {sc.papillary.length > 0 && <PapillaryMuscles list={sc.papillary} color={sc.muscleColor} lowSpec={lowSpec} />}
        {sc.flag && flagPlanted && (
          <ExplorationFlag
            base={sc.flag.base}
            dir={sc.flag.dir}
            viewer={sc.flag.viewer}
            lowSpec={lowSpec}
            reduceMotion={reduceMotion}
            anchor="lv-flag"
            active={activeAnchors.includes('lv-flag')}
            observed={observedAnchors.includes('lv-flag')}
            label={anchorLabels['lv-flag']}
            onSelect={onAnchorClick}
          />
        )}
        {movingAnchors.map(([a, p]) => spot(a, p))}
      </ContractGroup>

      {sc.inletValve && sc.chordae.length > 0 && (
        <Chordae
          chamber={id}
          spec={sc.inletValve}
          state={inletState}
          papillary={sc.papillary}
          links={sc.chordae}
          center={m.center}
          lowSpec={lowSpec}
          reduceMotion={reduceMotion}
        />
      )}

      <RoomCells sc={sc} lowSpec={lowSpec} reduceMotion={reduceMotion} />
      <BloodCells curve={m.shape.curve} radius={TUBE} count={sc.stubCells.inlet} speed={3.0} o2={sc.o2} tRange={IN_RANGE} clearRadius={1.9} seed={11} />
      <BloodCells
        curve={m.shape.curve}
        radius={TUBE}
        count={sc.stubCells.outlet}
        speed={3.2}
        o2={sc.o2}
        tRange={OUT_RANGE}
        clearRadius={1.9}
        pulsatile={pulsatileOut}
        seed={13}
      />

      <WallComparison chamber={id} position={sc.device} lowSpec={lowSpec} reduceMotion={reduceMotion} />
      {staticAnchors.map(([a, p]) => spot(a, p))}
    </group>
  );
}

export function RaChamber(props: LocationProps) {
  return <HeartChamber id="ra" {...props} />;
}

export function RvChamber(props: LocationProps) {
  return <HeartChamber id="rv" {...props} />;
}

export function LaChamber(props: LocationProps) {
  return <HeartChamber id="la" {...props} />;
}

export function LvChamber(props: LocationProps) {
  return <HeartChamber id="lv" {...props} />;
}
