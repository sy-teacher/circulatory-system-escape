// 지붕 없는 탐사선(길이 2.6 · 너비 1.7 · 높이 1.3, 원점 = 바닥 중심, 앞 = -Z).
// 운전석(왼쪽)에서 기본 시점으로 앞코·펜더·안테나와 계기판이 보이도록 배치했다.
// 색: 크림색 차체 + 노란색 + 청록색 장식. 파란 액체 표현은 쓰지 않는다.

import { RoundedBox } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type JSX } from 'react';
import {
  DoubleSide,
  ExtrudeGeometry,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  Quaternion,
  Shape,
  Vector3,
  type Group,
  type Material,
} from 'three';
import type { LocationId } from '../../data/types';
import { DASHBOARD_ANCHORS, INSTRUMENTS } from '../instruments';
import { runtime } from '../runtime';
import { Hotspot } from '../shared/Hotspot';
import { Suyeon, type SuyeonProps } from '../character/Suyeon';
import {
  DashScreen,
  drawNav,
  drawO2,
  drawPressureDial,
  NAV_SIZE,
  O2_SIZE,
  PRESSURE_NEEDLE,
  PRESSURE_PIVOT,
  PRESSURE_SIZE,
} from './dashboardTextures';

export interface VehicleProps {
  location: LocationId;
  /** 관찰 중에는 차체를 낮추고 작게 표시한다. */
  observing: boolean;
  /** 외부 단서 확대 중에는 차체가 관찰 대상을 가리지 않게 숨긴다. */
  clearView: boolean;
  /** 지금 관찰할 수 있는 계기판 관찰 지점(현재 단계 단서 중 DASHBOARD_ANCHORS에 있는 것) */
  activeDashboardAnchors: string[];
  observedAnchors: string[];
  anchorLabels: Record<string, string>;
  onAnchorClick: (anchor: string) => void;
  lowSpec: boolean;
  reduceMotion: boolean;
  suyeon: SuyeonProps;
}

/** 탐사선 크기(다른 공간이 혈관 굵기를 정할 때 기준) */
export const VEHICLE_SIZE = { length: 2.6, width: 1.7, height: 1.3 } as const;

const COLORS = {
  cream: '#fbf4e4',
  yellow: '#ffd23f',
  teal: '#2ec4b6',
  tealDark: '#1f8f86',
  seat: '#35b9aa',
  floor: '#d6ece7',
  bezel: '#2b2547',
  rubber: '#3b3355',
  glass: '#e9fffb',
  heart: '#ff5f7a',
  skin: '#f2c6a4',
  sleeve: '#1f2a4d',
  cuff: '#f4f4f0',
  lamp: '#fff4c8',
  tail: '#ff8a7a',
  needle: '#ffffff',
};

/** 수축 압력계 바늘 배율(공간별) */
function pressureFactor(loc: LocationId): number {
  // 동맥은 높고 출렁이며, 모세혈관·정맥은 낮고 거의 고르다(학습용 상대값)
  switch (loc) {
    case 'lv':
      return 1;
    case 'aorta':
      return 0.85;
    case 'rv':
      return 0.4;
    case 'pa':
      return 0.3;
    case 'la':
    case 'ra':
      return 0.15;
    case 'sysCap':
    case 'lungCap':
      return 0.05;
    case 'venaCava':
    case 'pv':
      return 0.02;
    default:
      return 0;
  }
}

const smooth01 = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** 산소 측정기 값(0.15~1, 0이 되지 않음) */
function o2Value(loc: LocationId, pathT: number): number {
  const ins = INSTRUMENTS[loc];
  if (ins.o2Trend === 'down') return 0.95 - 0.6 * smooth01(0.3, 0.8, pathT);
  if (ins.o2Trend === 'up') return 0.35 + 0.6 * smooth01(0.3, 0.8, pathT);
  return Math.max(0.15, ins.o2);
}

function createHeartGeometry(): ExtrudeGeometry {
  const s = new Shape();
  s.moveTo(0, -0.45);
  s.bezierCurveTo(-0.15, -0.3, -0.62, -0.05, -0.5, 0.25);
  s.bezierCurveTo(-0.42, 0.52, -0.1, 0.56, 0, 0.3);
  s.bezierCurveTo(0.1, 0.56, 0.42, 0.52, 0.5, 0.25);
  s.bezierCurveTo(0.62, -0.05, 0.15, -0.3, 0, -0.45);
  const g = new ExtrudeGeometry(s, { depth: 0.22, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.06, bevelSegments: 2, curveSegments: 8 });
  g.center();
  return g;
}

/** 계기판은 앞유리·보닛보다 운전자 쪽에 둔다. */
const PANEL_POS: [number, number, number] = [-0.34, 0.72, -0.4];
/** 작게 낮춘 차체에서도 계기판 전체가 보이도록 패널 높이를 보정한다. */
const OBSERVE_PANEL_POS: [number, number, number] = [-0.34, 0.99, -0.46];
const PANEL_TILT = -0.43;
const SCREEN = {
  o2: { x: -0.232, w: 0.17, h: 0.17 * (O2_SIZE.h / O2_SIZE.w) },
  nav: { x: 0, w: 0.25, h: 0.25 * (NAV_SIZE.h / NAV_SIZE.w) },
  pressure: { x: 0.226, w: 0.136, h: 0.136 * (PRESSURE_SIZE.h / PRESSURE_SIZE.w) },
};
/** 계기판 관찰 표시 위치(계기 오른쪽 위 모서리 — 계기 글자를 가리지 않게) */
const HOTSPOT_POS: Record<'o2' | 'nav' | 'pressure', [number, number, number]> = {
  o2: [SCREEN.o2.x + SCREEN.o2.w * 0.42, SCREEN.o2.h * 0.4, 0.04],
  nav: [SCREEN.nav.x + SCREEN.nav.w * 0.44, SCREEN.nav.h * 0.4, 0.04],
  pressure: [SCREEN.pressure.x + SCREEN.pressure.w * 0.4, SCREEN.pressure.h * 0.4, 0.04],
};

/** 손잡이에서 학생 팔꿈치 쪽으로 이어지는 소매 */
function sleevePose(side: 1 | -1): { position: [number, number, number]; quaternion: Quaternion; length: number } {
  const a = new Vector3(0.2 * side, 0.05, 0.08);
  const b = new Vector3(0.27 * side, -0.17, 0.42);
  const v = b.clone().sub(a);
  const length = v.length();
  const q = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), v.normalize());
  const m = a.clone().add(b).multiplyScalar(0.5);
  return { position: [m.x, m.y, m.z], quaternion: q, length };
}

export function Vehicle({
  location,
  observing,
  clearView,
  activeDashboardAnchors,
  observedAnchors,
  anchorLabels,
  onAnchorClick,
  lowSpec,
  reduceMotion,
  suyeon,
}: VehicleProps): JSX.Element {
  const seg = lowSpec ? 1 : 3;

  const mats = useMemo(() => {
    const solid = (color: string, emissive = 0.12): Material =>
      lowSpec
        ? new MeshLambertMaterial({ color, emissive: color, emissiveIntensity: emissive })
        : new MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.05, emissive: color, emissiveIntensity: emissive });
    return {
      cream: solid(COLORS.cream, 0.16),
      yellow: solid(COLORS.yellow, 0.18),
      teal: solid(COLORS.teal, 0.14),
      tealDark: solid(COLORS.tealDark, 0.1),
      seat: solid(COLORS.seat, 0.12),
      floor: solid(COLORS.floor, 0.1),
      bezel: solid(COLORS.bezel, 0.1),
      rubber: solid(COLORS.rubber, 0.08),
      skin: new MeshLambertMaterial({ color: COLORS.skin, emissive: COLORS.skin, emissiveIntensity: 0.22 }),
      sleeve: new MeshLambertMaterial({ color: COLORS.sleeve, emissive: COLORS.sleeve, emissiveIntensity: 0.15 }),
      cuff: new MeshLambertMaterial({ color: COLORS.cuff, emissive: COLORS.cuff, emissiveIntensity: 0.15 }),
      glass: new MeshLambertMaterial({ color: COLORS.glass, transparent: true, opacity: 0.14, depthWrite: false, side: DoubleSide }),
      heart: new MeshLambertMaterial({ color: COLORS.heart, emissive: COLORS.heart, emissiveIntensity: 0.45 }),
      lamp: new MeshBasicMaterial({ color: COLORS.lamp, toneMapped: false }),
      tail: new MeshBasicMaterial({ color: COLORS.tail, toneMapped: false }),
      needle: new MeshBasicMaterial({ color: COLORS.needle, toneMapped: false, fog: false }),
    };
  }, [lowSpec]);

  // 계기판 화면(CanvasTexture)
  const screens = useMemo(() => {
    const scale = lowSpec ? 1 : 2;
    const o2 = new DashScreen(O2_SIZE.w, O2_SIZE.h, scale);
    const nav = new DashScreen(NAV_SIZE.w, NAV_SIZE.h, scale);
    const pressure = new DashScreen(PRESSURE_SIZE.w, PRESSURE_SIZE.h, scale);
    drawPressureDial(pressure);
    const mat = (s: DashScreen) => new MeshBasicMaterial({ map: s.texture, toneMapped: false, fog: false });
    return { o2, nav, pressure, o2Mat: mat(o2), navMat: mat(nav), pressureMat: mat(pressure) };
  }, [lowSpec]);

  const heartGeo = useMemo(createHeartGeometry, []);
  const sleeves = useMemo(() => [sleevePose(1), sleevePose(-1)] as const, []);

  useEffect(
    () => () => {
      Object.values(mats).forEach((m) => m.dispose());
    },
    [mats],
  );
  useEffect(
    () => () => {
      screens.o2.dispose();
      screens.nav.dispose();
      screens.pressure.dispose();
      screens.o2Mat.dispose();
      screens.navMat.dispose();
      screens.pressureMat.dispose();
    },
    [screens],
  );
  useEffect(() => () => heartGeo.dispose(), [heartGeo]);

  // 내비게이터는 공간이 바뀔 때만 다시 그린다
  useEffect(() => {
    drawNav(screens.nav, INSTRUMENTS[location].nav);
  }, [screens, location]);

  const o2State = useRef({ value: -1, label: '', loc: '' as string, acc: 1 });
  useEffect(() => {
    o2State.current.value = -1; // 공간이 바뀌면 바로 다시 그린다
    o2State.current.acc = 1;
  }, [location, screens]);

  const root = useRef<Group>(null);
  const yoke = useRef<Group>(null);
  const needle = useRef<Group>(null);
  const antenna = useRef<Group>(null);
  const live = useRef({ location, reduceMotion });
  live.current = { location, reduceMotion };
  const steer = useRef(0);
  const gauge = useRef(0);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const { location: loc, reduceMotion: rm } = live.current;
    const g = root.current;
    if (g) {
      g.position.copy(runtime.vehiclePosition);
      g.quaternion.copy(runtime.vehicleQuaternion);
    }

    // 조종간: 조향 입력만큼 기울어짐
    steer.current += (Math.max(-1, Math.min(1, runtime.steerInput)) - steer.current) * (1 - Math.exp(-8 * dt));
    if (yoke.current) yoke.current.rotation.z = -steer.current * 0.35;

    // 수축 압력계 바늘
    // 심방에서는 심방의 수축 시점에 맞춘다
      const drive = loc === 'ra' || loc === 'la' ? runtime.atrialContraction : runtime.contraction;
      const target = drive * pressureFactor(loc);
    gauge.current += (target - gauge.current) * (1 - Math.exp(-14 * dt));
    if (needle.current) needle.current.rotation.z = 2.1 - 4.2 * gauge.current;

    // 안테나: 살짝 흔들림(움직임 줄이기에서는 멈춤)
    if (antenna.current) {
      antenna.current.rotation.z = rm ? 0 : 0.035 * Math.sin(runtime.time * 2.1) + steer.current * 0.08;
      antenna.current.rotation.x = rm ? 0 : 0.025 * Math.sin(runtime.time * 1.7 + 1);
    }

    // 산소 측정기: 초당 최대 4번, 값이 바뀔 때만 다시 그린다
    const st = o2State.current;
    st.acc += dt;
    if (st.acc >= 0.25) {
      st.acc = 0;
      const ins = INSTRUMENTS[loc];
      const waiting = ins.o2Label === '측정 대기';
      const v = waiting ? 0.15 : o2Value(loc, runtime.pathT);
      if (Math.abs(v - st.value) > 0.004 || st.label !== ins.o2Label || st.loc !== loc) {
        st.value = v;
        st.label = ins.o2Label;
        st.loc = loc;
        drawO2(screens.o2, v, ins.o2Label, waiting);
      }
    }
  }, -1);

  const shownHotspots = (clearView ? [] : activeDashboardAnchors).filter((a) => a in DASHBOARD_ANCHORS);
  const lowDetail = lowSpec;

  return (
    <group ref={root}>
      <group visible={!clearView} scale={observing ? 0.72 : 1} position={[0, observing ? -0.12 : 0, 0]}>
      {/* ── 차체 ── */}
      {/* 바닥과 청록 띠 */}
      <RoundedBox args={[1.62, 0.22, 2.4]} radius={0.1} smoothness={seg} bevelSegments={seg} material={mats.cream} position={[0, 0.13, 0.04]} />
      <RoundedBox args={[1.7, 0.08, 2.5]} radius={0.04} smoothness={seg} bevelSegments={seg} material={mats.teal} position={[0, 0.12, 0.03]} />
      <mesh material={mats.floor} position={[0, 0.245, 0.12]}>
        <boxGeometry args={[1.4, 0.012, 1.2]} />
      </mesh>

      {/* 옆벽 + 노란 손잡이 레일 + 청록 줄무늬 */}
      {([1, -1] as const).map((side) => (
        <group key={side}>
          <RoundedBox args={[0.14, 0.5, 2.3]} radius={0.06} smoothness={seg} bevelSegments={seg} material={mats.cream} position={[0.78 * side, 0.47, 0.03]} />
          <RoundedBox args={[0.18, 0.07, 2.32]} radius={0.03} smoothness={seg} bevelSegments={seg} material={mats.yellow} position={[0.78 * side, 0.735, 0.03]} />
          {!lowDetail && (
            <mesh material={mats.teal} position={[0.852 * side, 0.45, 0.05]}>
              <boxGeometry args={[0.014, 0.07, 1.9]} />
            </mesh>
          )}
        </group>
      ))}

      {/* 앞코(보닛) + 노란 줄 + 청록 범퍼 */}
      <RoundedBox args={[1.5, 0.4, 0.92]} radius={0.16} smoothness={seg} bevelSegments={seg} material={mats.cream} position={[0, 0.44, -0.8]} />
      {!lowDetail && (
        <RoundedBox args={[0.5, 0.03, 0.78]} radius={0.012} smoothness={1} bevelSegments={1} material={mats.yellow} position={[0, 0.645, -0.8]} />
      )}
      <RoundedBox args={[1.42, 0.12, 0.12]} radius={0.05} smoothness={seg} bevelSegments={seg} material={mats.teal} position={[0, 0.3, -1.24]} />

      {/* 노란 펜더 + 빛나는 전조등 */}
      {([1, -1] as const).map((side) => (
        <group key={side} position={[0.62 * side, 0, 0]}>
          <RoundedBox args={[0.36, 0.26, 0.62]} radius={0.11} smoothness={seg} bevelSegments={seg} material={mats.yellow} position={[0, 0.66, -0.95]} />
          <mesh material={mats.lamp} position={[0, 0.64, -1.255]}>
            <sphereGeometry args={[0.07, 14, 10]} />
          </mesh>
          <mesh material={mats.teal} position={[0, 0.64, -1.258]}>
            <torusGeometry args={[0.078, 0.016, 6, 18]} />
          </mesh>
        </group>
      ))}

      {/* 뒤쪽 갑판 + 꼬리 지느러미 + 추진기 */}
      <RoundedBox args={[1.56, 0.5, 0.5]} radius={0.14} smoothness={seg} bevelSegments={seg} material={mats.cream} position={[0, 0.47, 1.03]} />
      <RoundedBox args={[0.06, 0.2, 0.32]} radius={0.025} smoothness={seg} bevelSegments={seg} material={mats.yellow} position={[0, 0.8, 1.06]} />
      {([1, -1] as const).map((side) => (
        <group key={side} position={[0.42 * side, 0, 0]}>
          <mesh material={mats.tealDark} position={[0, 0.38, 1.27]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.09, 0.1, 0.07, 14]} />
          </mesh>
          <mesh material={mats.lamp} position={[0, 0.38, 1.306]}>
            <circleGeometry args={[0.065, 14]} />
          </mesh>
          {!lowDetail && (
            <mesh material={mats.tail} position={[0.18 * side, 0.6, 1.283]}>
              <boxGeometry args={[0.12, 0.05, 0.01]} />
            </mesh>
          )}
        </group>
      ))}

      {/* ── 좌석 두 개(왼쪽: 운전석 / 오른쪽: 수연쌤) ── */}
      {(
        [
          [-0.38, 0.32, 0.6],
          [0.38, 0.16, 0.38],
        ] as const
      ).map(([x, zc, zb]) => (
        <group key={x}>
          <RoundedBox args={[0.5, 0.14, 0.44]} radius={0.06} smoothness={seg} bevelSegments={seg} material={mats.seat} position={[x, 0.43, zc]} />
          <RoundedBox args={[0.5, 0.56, 0.12]} radius={0.06} smoothness={seg} bevelSegments={seg} material={mats.seat} position={[x, 0.78, zb]} rotation={[0.12, 0, 0]} />
        </group>
      ))}
      <RoundedBox args={[0.18, 0.2, 0.6]} radius={0.05} smoothness={seg} bevelSegments={seg} material={mats.floor} position={[0, 0.34, 0.12]} />

      {/* ── 계기판 ── */}
      <RoundedBox args={[0.8, 0.34, 0.36]} radius={0.08} smoothness={seg} bevelSegments={seg} material={mats.cream} position={[-0.38, 0.49, -0.55]} />
      <RoundedBox args={[0.7, 0.34, 0.36]} radius={0.08} smoothness={seg} bevelSegments={seg} material={mats.cream} position={[0.42, 0.49, -0.57]} />
      <group position={observing ? OBSERVE_PANEL_POS : PANEL_POS} rotation={[PANEL_TILT, 0, 0]}>
        <RoundedBox args={[0.74, 0.18, 0.04]} radius={0.02} smoothness={seg} bevelSegments={seg} material={mats.bezel} position={[0, 0, -0.012]} />
        <mesh material={screens.o2Mat} position={[SCREEN.o2.x, 0, 0.012]}>
          <planeGeometry args={[SCREEN.o2.w, SCREEN.o2.h]} />
        </mesh>
        <mesh material={screens.navMat} position={[SCREEN.nav.x, 0, 0.012]}>
          <planeGeometry args={[SCREEN.nav.w, SCREEN.nav.h]} />
        </mesh>
        <group position={[SCREEN.pressure.x, 0, 0.012]}>
          <mesh material={screens.pressureMat}>
            <planeGeometry args={[SCREEN.pressure.w, SCREEN.pressure.h]} />
          </mesh>
          <group ref={needle} position={[0, (0.5 - PRESSURE_PIVOT.y / PRESSURE_SIZE.h) * SCREEN.pressure.h, 0.003]} rotation={[0, 0, 2.1]}>
            <mesh material={mats.needle} position={[0, ((PRESSURE_NEEDLE / PRESSURE_SIZE.w) * SCREEN.pressure.w) / 2 - 0.006, 0]}>
              <boxGeometry args={[0.0045, (PRESSURE_NEEDLE / PRESSURE_SIZE.w) * SCREEN.pressure.w, 0.002]} />
            </mesh>
            <mesh material={mats.yellow} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.002]}>
              <cylinderGeometry args={[0.007, 0.007, 0.004, 10]} />
            </mesh>
          </group>
        </group>

        {/* 계기판 관찰 지점 */}
        {shownHotspots.map((anchor) => (
          <Hotspot
            key={anchor}
            anchor={anchor}
            position={HOTSPOT_POS[DASHBOARD_ANCHORS[anchor]]}
            active
            observed={observedAnchors.includes(anchor)}
            label={anchorLabels[anchor]}
            onSelect={onAnchorClick}
            size={0.03}
          />
        ))}
      </group>

      {/* 낮은 앞유리 */}
      <group position={[0, 0.64, -0.95]} rotation={[0.5, 0, 0]}>
        <mesh material={mats.glass}>
          <planeGeometry args={[1.36, 0.18]} />
        </mesh>
        <mesh material={mats.teal} position={[0, 0.09, 0]} rotation={[0, 0, Math.PI / 2]}>
          <capsuleGeometry args={[0.01, 1.34, 3, 8]} />
        </mesh>
        {!lowDetail &&
          ([1, -1] as const).map((side) => (
            <mesh key={side} material={mats.teal} position={[0.68 * side, 0, 0]}>
              <capsuleGeometry args={[0.012, 0.18, 3, 8]} />
            </mesh>
          ))}
      </group>

      {/* 안테나 + 하트 표지 */}
      <group ref={antenna} position={[0.22, 0.64, -0.85]}>
        <mesh material={mats.teal} position={[0, 0.25, 0]}>
          <cylinderGeometry args={[0.011, 0.016, 0.5, 8]} />
        </mesh>
        <mesh geometry={heartGeo} material={mats.heart} position={[0, 0.55, 0]} scale={0.13} />
      </group>

      {/* ── 학생 손(교복 소매)과 조종간 ── */}
      <group ref={yoke} position={[-0.38, 0.6, -0.22]}>
        <mesh material={mats.tealDark} position={[0, -0.04, -0.085]} rotation={[1.13, 0, 0]}>
          <cylinderGeometry args={[0.02, 0.024, 0.2, 10]} />
        </mesh>
        <mesh material={mats.teal} position={[0, 0.05, 0]} rotation={[0, 0, Math.PI / 2]}>
          <capsuleGeometry args={[0.016, 0.32, 3, 8]} />
        </mesh>
        <mesh material={mats.yellow} position={[0, 0.05, 0]}>
          <sphereGeometry args={[0.034, 12, 10]} />
        </mesh>
        {([1, -1] as const).map((side, i) => {
          const sl = sleeves[i];
          return (
            <group key={side}>
              <mesh material={mats.rubber} position={[0.2 * side, 0.05, 0]} rotation={[0, 0, Math.PI / 2]}>
                <capsuleGeometry args={[0.024, 0.07, 3, 8]} />
              </mesh>
              <RoundedBox args={[0.085, 0.07, 0.1]} radius={0.025} smoothness={seg} bevelSegments={seg} material={mats.skin} position={[0.2 * side, 0.062, 0.006]} />
              {!lowDetail && (
                <RoundedBox args={[0.03, 0.028, 0.055]} radius={0.012} smoothness={1} bevelSegments={1} material={mats.skin} position={[0.2 * side - 0.045 * side, 0.09, -0.012]} />
              )}
              <RoundedBox args={[0.092, 0.08, 0.03]} radius={0.012} smoothness={1} bevelSegments={1} material={mats.cuff} position={[0.205 * side, 0.055, 0.07]} />
              <RoundedBox
                args={[0.1, 0.1, sl.length]}
                radius={0.035}
                smoothness={seg}
                bevelSegments={seg}
                material={mats.sleeve}
                position={sl.position}
                quaternion={sl.quaternion}
              />
            </group>
          );
        })}
      </group>

      {/* ── 수연쌤(오른쪽 좌석) ── */}
      <group position={[0.38, 0.5, 0.1]}>
        <Suyeon {...suyeon} />
      </group>
      </group>
    </group>
  );
}
