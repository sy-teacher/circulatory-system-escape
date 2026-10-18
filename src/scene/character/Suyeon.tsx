// 3D 수연쌤(탐사선 오른쪽 좌석). 캐릭터 시트 기준:
// 2~3등신 큰 머리, 짙은 갈색 단발(턱선, 끝이 안으로 말림) + 일자 앞머리, 복숭아빛 피부와 분홍 볼,
// 노치드 라펠 흰 가운(단추 3개, 왼쪽 가슴 주머니 + 이름 자수, 아래 주머니 2개), 노란 셔츠 깃, 검은 바지·구두.
// 원점 = 좌석에 닿는 엉덩이 중심, 앞쪽 = -Z, 몸의 오른쪽 = +X.

import { RoundedBox } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type JSX, type ReactNode, type RefObject } from 'react';
import { DoubleSide, FrontSide, MeshBasicMaterial, MeshLambertMaterial, type Group, type Mesh } from 'three';
import type { Mood } from '../../data/types';
import { runtime } from '../runtime';
import {
  createHairBobGeometry,
  createHairCrownGeometry,
  createLapelGeometry,
  createShirtVGeometry,
  HEAD_R,
} from './suyeonGeometry';

export type SuyeonPose = 'idle' | 'point' | 'tablet';

export interface SuyeonProps {
  mood: Mood;
  talking: boolean;
  pose: SuyeonPose;
  /** 운전석(학생) 쪽으로 몸과 고개를 돌린다 */
  lookAtCamera: boolean;
  reduceMotion: boolean;
}

const COLORS = {
  skin: '#f2c6a4',
  cheek: '#f5a3a6',
  hair: '#3a2a22',
  hairShine: '#5f4636',
  coat: '#ecebe7',
  coatShade: '#e1dfd8',
  shirt: '#f3dc85',
  pants: '#1e1e1e',
  shoes: '#1e1e1e',
  eye: '#2b1d1a',
  mouth: '#7c2433',
  tongue: '#ff8c9b',
  button: '#aaa69c',
  embroidery: '#2c3557',
  tablet: '#1f2a44',
  tabletScreen: '#2f4572',
  sticker: '#ffcf3f',
};

type Mats = ReturnType<typeof createMaterials>;

function lambert(color: string, emissive = 0.2, doubleSide = false): MeshLambertMaterial {
  return new MeshLambertMaterial({
    color,
    emissive: color,
    emissiveIntensity: emissive,
    side: doubleSide ? DoubleSide : FrontSide,
  });
}

function createMaterials() {
  return {
    skin: lambert(COLORS.skin, 0.34),
    cheek: lambert(COLORS.cheek, 0.3),
    hair: lambert(COLORS.hair, 0.12, true),
    hairShine: lambert(COLORS.hairShine, 0.15),
    coat: lambert(COLORS.coat, 0.28),
    coatShade: lambert(COLORS.coatShade, 0.26),
    shirt: lambert(COLORS.shirt, 0.25),
    pants: lambert(COLORS.pants, 0.08),
    shoes: lambert(COLORS.shoes, 0.08),
    eye: new MeshBasicMaterial({ color: COLORS.eye }),
    white: new MeshBasicMaterial({ color: '#ffffff', toneMapped: false }),
    mouth: new MeshBasicMaterial({ color: COLORS.mouth }),
    tongue: new MeshBasicMaterial({ color: COLORS.tongue }),
    button: lambert(COLORS.button, 0.15),
    embroidery: lambert(COLORS.embroidery, 0.1),
    tablet: lambert(COLORS.tablet, 0.1),
    tabletScreen: lambert(COLORS.tabletScreen, 0.45),
    sticker: lambert(COLORS.sticker, 0.3),
  };
}

// ── 표정 ───────────────────────────────────────────────────

type EyeKind = 'open' | 'closed';
interface Expression {
  /** 몸의 오른쪽 눈(+X) / 왼쪽 눈(-X) */
  right: EyeKind;
  left: EyeKind;
  mouth: 'smile' | 'smallSmile' | 'wide' | 'o' | 'down';
  brows: 'none' | 'raised' | 'worried';
  eyeScale: number;
}

const EXPRESSIONS: Record<Mood, Expression> = {
  // 기본(웃음): 눈을 감고 ^ ^ + 부드러운 미소
  smile: { right: 'closed', left: 'closed', mouth: 'smile', brows: 'none', eyeScale: 1 },
  // 정면(눈뜸): 동그란 눈 + 작은 미소
  open: { right: 'open', left: 'open', mouth: 'smallSmile', brows: 'none', eyeScale: 1 },
  // 활짝 웃음: 감은 눈 + 크게 벌린 웃는 입
  cheer: { right: 'closed', left: 'closed', mouth: 'wide', brows: 'none', eyeScale: 1 },
  // 놀람: 동그란 눈 + 작은 'o' 입 + 올라간 눈썹
  surprised: { right: 'open', left: 'open', mouth: 'o', brows: 'raised', eyeScale: 1.12 },
  // 윙크: 왼쪽 눈 감고 오른쪽 눈 뜸 + 미소
  wink: { right: 'open', left: 'closed', mouth: 'smile', brows: 'none', eyeScale: 1 },
  // 걱정: 눈을 뜨고 눈썹 안쪽이 올라감 + 작게 처진 입
  worried: { right: 'open', left: 'open', mouth: 'down', brows: 'worried', eyeScale: 0.95 },
};

/** 머리 구 표면의 한 점에 붙이는 얼굴 부품(az: 오른쪽 +, el: 위 +) */
function FacePart({ az, el, r = HEAD_R + 0.002, children }: { az: number; el: number; r?: number; children: ReactNode }) {
  const pos: [number, number, number] = [r * Math.sin(az) * Math.cos(el), r * Math.sin(el), -r * Math.cos(az) * Math.cos(el)];
  return (
    <group position={pos} rotation={[el, -az, 0, 'YXZ']}>
      {children}
    </group>
  );
}

function OpenEye({ mats, scale, eyeRef }: { mats: Mats; scale: number; eyeRef: RefObject<Group | null> }) {
  return (
    <group ref={eyeRef}>
      <mesh material={mats.eye} scale={[0.82 * scale, 1.2 * scale, 0.26]}>
        <sphereGeometry args={[0.03, 14, 10]} />
      </mesh>
      <mesh material={mats.white} position={[0.009 * scale, 0.014 * scale, -0.0075]} scale={[1, 1, 0.5]}>
        <sphereGeometry args={[0.0095, 8, 6]} />
      </mesh>
      <mesh material={mats.white} position={[-0.008 * scale, -0.012 * scale, -0.007]} scale={[1, 1, 0.5]}>
        <sphereGeometry args={[0.0045, 6, 4]} />
      </mesh>
    </group>
  );
}

function ClosedEye({ mats }: { mats: Mats }) {
  // 위로 볼록한 호(^)
  return (
    <mesh material={mats.eye} position={[0, -0.012, 0]}>
      <torusGeometry args={[0.025, 0.006, 6, 14, Math.PI]} />
    </mesh>
  );
}

function Mouth({ kind, mats }: { kind: Expression['mouth']; mats: Mats }) {
  switch (kind) {
    case 'smile':
      return (
        <mesh material={mats.mouth} rotation={[0, 0, Math.PI]} position={[0, 0.012, 0]}>
          <torusGeometry args={[0.028, 0.0065, 6, 14, Math.PI]} />
        </mesh>
      );
    case 'smallSmile':
      return (
        <mesh material={mats.mouth} rotation={[0, 0, Math.PI]} position={[0, 0.008, 0]}>
          <torusGeometry args={[0.019, 0.0058, 6, 12, Math.PI]} />
        </mesh>
      );
    case 'wide':
      return (
        <group position={[0, 0.012, -0.002]}>
          <mesh material={mats.mouth} rotation={[0, Math.PI, 0]}>
            <circleGeometry args={[0.042, 18, Math.PI, Math.PI]} />
          </mesh>
          <mesh material={mats.tongue} rotation={[0, Math.PI, 0]} position={[0, -0.02, -0.001]}>
            <circleGeometry args={[0.022, 12, Math.PI, Math.PI]} />
          </mesh>
        </group>
      );
    case 'o':
      return (
        <mesh material={mats.mouth} scale={[1, 1.2, 0.4]}>
          <sphereGeometry args={[0.017, 10, 8]} />
        </mesh>
      );
    case 'down':
      return (
        <mesh material={mats.mouth} position={[0, -0.01, 0]}>
          <torusGeometry args={[0.018, 0.0055, 6, 12, Math.PI]} />
        </mesh>
      );
  }
}

function Brow({ side, kind, mats }: { side: 1 | -1; kind: 'raised' | 'worried'; mats: Mats }) {
  // 안쪽 끝이 올라가는 걱정 눈썹: 몸의 오른쪽 눈썹은 시계 방향(-), 왼쪽은 반대
  const tilt = kind === 'worried' ? -0.38 * side : 0.12 * side;
  return (
    <mesh material={mats.hair} rotation={[0, 0, Math.PI / 2 + tilt]} scale={[1, 1, 0.5]}>
      <capsuleGeometry args={[0.0065, 0.032, 3, 6]} />
    </mesh>
  );
}

// ── 자세 ───────────────────────────────────────────────────

type Joint = [number, number, number];
interface PoseDef {
  /** 오른쪽 어깨·팔꿈치 / 왼쪽 어깨·팔꿈치 회전(라디안, XYZ) */
  rs: Joint;
  re: Joint;
  ls: Joint;
  le: Joint;
}

const ARM_IDLE_R: Joint = [0.42, 0, -0.2];
const ARM_IDLE_L: Joint = [0.42, 0, 0.2];
const ELBOW_IDLE: Joint = [0.95, 0, 0];
const ARM_TABLET_L: Joint = [0.5, 0, 0.12];
const ELBOW_TABLET_L: Joint = [1.15, 0, 0];

const POSES: Record<SuyeonPose, PoseDef> = {
  // 두 손을 무릎 위에
  idle: { rs: ARM_IDLE_R, re: ELBOW_IDLE, ls: ARM_IDLE_L, le: ELBOW_IDLE },
  // 오른손 검지를 세워 가슴 앞에서 위로(운전석에서도 보이게) + 왼손에 태블릿
  point: { rs: [0.9, 0, -0.25], re: [2.0, 0, 0], ls: ARM_TABLET_L, le: ELBOW_TABLET_L },
  // 왼손에 짙은 남색 태블릿
  tablet: { rs: ARM_IDLE_R, re: ELBOW_IDLE, ls: ARM_TABLET_L, le: ELBOW_TABLET_L },
};

const damp = (k: number, dt: number) => 1 - Math.exp(-k * dt);

/** 팔 하나(어깨 → 팔꿈치 → 손). 어깨 그룹이 팔을 아래(-Y)로 늘어뜨린 상태가 기본 */
function Arm({
  side,
  mats,
  shoulderRef,
  elbowRef,
  finger,
}: {
  side: 1 | -1;
  mats: Mats;
  shoulderRef: RefObject<Group | null>;
  elbowRef: RefObject<Group | null>;
  finger?: RefObject<Mesh | null>;
}) {
  return (
    <group ref={shoulderRef} position={[0.168 * side, 0.275, 0]}>
      <mesh material={mats.coat} position={[0, -0.062, 0]}>
        <capsuleGeometry args={[0.045, 0.085, 4, 10]} />
      </mesh>
      <group ref={elbowRef} position={[0, -0.13, 0]}>
        <mesh material={mats.coat} position={[0, -0.055, 0]}>
          <capsuleGeometry args={[0.041, 0.075, 4, 10]} />
        </mesh>
        <mesh material={mats.coatShade} position={[0, -0.106, 0]}>
          <cylinderGeometry args={[0.044, 0.044, 0.016, 12]} />
        </mesh>
        <mesh material={mats.skin} position={[0, -0.14, 0]} scale={[0.9, 1.1, 0.8]}>
          <sphereGeometry args={[0.036, 12, 10]} />
        </mesh>
        {finger && (
          <mesh ref={finger} material={mats.skin} position={[0.006 * side, -0.182, -0.008]}>
            <capsuleGeometry args={[0.011, 0.034, 3, 6]} />
          </mesh>
        )}
      </group>
    </group>
  );
}

export function Suyeon({ mood, talking, pose, lookAtCamera, reduceMotion }: SuyeonProps): JSX.Element {
  const mats = useMemo(createMaterials, []);
  const geo = useMemo(
    () => ({
      crown: createHairCrownGeometry(28),
      bob: createHairBobGeometry(26),
      lapelR: createLapelGeometry(1, 0.004),
      lapelL: createLapelGeometry(-1, 0.004),
      shirtV: createShirtVGeometry(0.0025),
    }),
    [],
  );
  useEffect(
    () => () => {
      Object.values(mats).forEach((m) => m.dispose());
      Object.values(geo).forEach((g) => g.dispose());
    },
    [mats, geo],
  );

  const body = useRef<Group>(null);
  const torso = useRef<Mesh>(null);
  const head = useRef<Group>(null);
  const rShoulder = useRef<Group>(null);
  const rElbow = useRef<Group>(null);
  const lShoulder = useRef<Group>(null);
  const lElbow = useRef<Group>(null);
  const finger = useRef<Mesh>(null);
  const tablet = useRef<Group>(null);
  const eyeR = useRef<Group>(null);
  const eyeL = useRef<Group>(null);
  const mouth = useRef<Group>(null);
  const talkMouth = useRef<Mesh>(null);

  const live = useRef({ talking, pose, lookAtCamera, reduceMotion, mood });
  live.current = { talking, pose, lookAtCamera, reduceMotion, mood };
  const blink = useRef({ next: 2 + Math.random() * 2, end: 0 });
  const tabletBlend = useRef(pose === 'idle' ? 0 : 1);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const t = runtime.time;
    const s = live.current;
    const amp = s.reduceMotion ? 0.3 : 1;
    const target = POSES[s.pose];
    const k = damp(s.reduceMotion ? 10 : 6, dt);

    // 팔 자세
    const setJoint = (g: Group | null, j: Joint) => {
      if (!g) return;
      g.rotation.x += (j[0] - g.rotation.x) * k;
      g.rotation.y += (j[1] - g.rotation.y) * k;
      g.rotation.z += (j[2] - g.rotation.z) * k;
    };
    setJoint(rShoulder.current, target.rs);
    setJoint(lShoulder.current, target.ls);
    setJoint(rElbow.current, target.re);
    setJoint(lElbow.current, target.le);
    if (finger.current) finger.current.visible = s.pose === 'point';

    // 태블릿: 나타났다 사라질 때 크기로 부드럽게
    tabletBlend.current += ((s.pose === 'idle' ? 0 : 1) - tabletBlend.current) * k;
    if (tablet.current) {
      const b = tabletBlend.current;
      tablet.current.visible = b > 0.02;
      tablet.current.scale.setScalar(Math.max(0.001, b));
    }

    // 몸과 고개: 말할 때 운전석 쪽(왼쪽, +회전)으로 돌아본다
    const bodyYaw = s.lookAtCamera ? 0.6 : 0;
    const headYaw = s.lookAtCamera ? 0.95 : 0.06 * Math.sin(t * 0.45) * amp;
    const headPitch = (s.lookAtCamera ? -0.1 : 0) + (s.talking ? 0.025 * Math.sin(t * 9) * amp : 0);
    const headRoll = 0.035 * Math.sin(t * 0.7) * amp;
    const kTurn = damp(s.reduceMotion ? 8 : 4, dt);
    if (body.current) {
      body.current.rotation.y += (bodyYaw - body.current.rotation.y) * kTurn;
      body.current.rotation.x += (-0.06 - body.current.rotation.x) * kTurn;
    }
    const breath = Math.sin((t * Math.PI * 2) / 3.4);
    if (torso.current) torso.current.scale.y = 1 + 0.012 * breath * amp;
    if (head.current) {
      head.current.rotation.y += (headYaw - head.current.rotation.y) * kTurn;
      head.current.rotation.x += (headPitch - head.current.rotation.x) * kTurn;
      head.current.rotation.z += (headRoll - head.current.rotation.z) * kTurn;
      head.current.position.y = 0.345 + 0.004 * breath * amp;
    }

    // 눈 깜박임(눈을 뜬 표정에서 3~5초마다)
    const bl = blink.current;
    if (t >= bl.next) {
      bl.end = t + 0.13;
      bl.next = t + 3 + Math.random() * 2;
    } else if (bl.next - t > 10) {
      bl.next = t + 3; // 장면 시간이 되돌아간 경우
    }
    const eyeY = t < bl.end ? 0.12 : 1;
    if (eyeR.current) eyeR.current.scale.y = eyeY;
    if (eyeL.current) eyeL.current.scale.y = eyeY;

    // 말하는 동안 입 움직임
    const open = 0.5 + 0.5 * Math.sin(t * (s.reduceMotion ? 10 : 15));
    const wide = EXPRESSIONS[s.mood].mouth === 'wide';
    if (mouth.current) {
      if (s.talking && wide) {
        mouth.current.visible = true;
        mouth.current.scale.y = 0.6 + 0.4 * open;
      } else {
        mouth.current.scale.y = 1;
        mouth.current.visible = !(s.talking && open > 0.4);
      }
    }
    if (talkMouth.current) {
      const show = s.talking && !wide && open > 0.4;
      talkMouth.current.visible = show;
      talkMouth.current.scale.y = 0.5 + 0.7 * open;
    }
  });

  const ex = EXPRESSIONS[mood];
  const EYE_AZ = 0.36;
  const EYE_EL = -0.07;

  return (
    <group>
      {/* ── 다리(앉은 자세): 검은 바지, 검은 둥근 구두 ── */}
      {([1, -1] as const).map((side) => (
        <group key={side} position={[0.07 * side, 0, 0]}>
          <mesh material={mats.pants} position={[0, 0.055, -0.085]} rotation={[Math.PI / 2, 0, 0]}>
            <capsuleGeometry args={[0.058, 0.12, 4, 10]} />
          </mesh>
          <mesh material={mats.pants} position={[0, -0.07, -0.19]}>
            <capsuleGeometry args={[0.05, 0.14, 4, 10]} />
          </mesh>
          <mesh material={mats.shoes} position={[0, -0.222, -0.225]} scale={[0.9, 0.6, 1.35]}>
            <sphereGeometry args={[0.058, 12, 8]} />
          </mesh>
          {/* 무릎 위를 덮는 가운 자락 */}
          <RoundedBox args={[0.145, 0.045, 0.15]} radius={0.02} smoothness={2} bevelSegments={2} material={mats.coat} position={[0.005 * side, 0.115, -0.095]} />
        </group>
      ))}

      {/* ── 상체 ── */}
      <group ref={body}>
        <RoundedBox ref={torso} args={[0.3, 0.33, 0.21]} radius={0.06} smoothness={3} bevelSegments={3} material={mats.coat} position={[0, 0.165, 0]} />

        {/* 노란 셔츠(V자)와 목둘레 깃, 노치드 라펠(가슴 윗부분 곡면을 따라 살짝 뒤로 기울임) */}
        <group position={[0, 0.2, -0.104]} rotation={[0.14, 0, 0]}>
          <mesh geometry={geo.shirtV} material={mats.shirt} position={[0, -0.2, -0.0025]} />
          <mesh geometry={geo.lapelR} material={mats.coatShade} position={[0, -0.2, -0.0065]} scale={[0.92, 1, 1]} />
          <mesh geometry={geo.lapelL} material={mats.coatShade} position={[0, -0.2, -0.0065]} scale={[0.92, 1, 1]} />
        </group>
        <mesh material={mats.shirt} position={[0, 0.322, -0.004]}>
          <cylinderGeometry args={[0.05, 0.056, 0.028, 14]} />
        </mesh>

        {/* 단추 3개 */}
        {[0.135, 0.09, 0.045].map((y) => (
          <mesh key={y} material={mats.button} position={[0.004, y, -0.108]} scale={[1, 1, 0.6]}>
            <sphereGeometry args={[0.0095, 8, 6]} />
          </mesh>
        ))}

        {/* 왼쪽 가슴 주머니 + 이름 자수 */}
        <mesh material={mats.coatShade} position={[-0.068, 0.2, -0.107]}>
          <boxGeometry args={[0.062, 0.054, 0.006]} />
        </mesh>
        <mesh material={mats.button} position={[-0.068, 0.226, -0.111]}>
          <boxGeometry args={[0.062, 0.005, 0.003]} />
        </mesh>
        <mesh material={mats.embroidery} position={[-0.068, 0.24, -0.108]}>
          <boxGeometry args={[0.036, 0.008, 0.004]} />
        </mesh>

        {/* 아래 주머니 2개 */}
        {([1, -1] as const).map((side) => (
          <group key={side} position={[0.078 * side, 0.05, -0.107]}>
            <mesh material={mats.coatShade}>
              <boxGeometry args={[0.066, 0.052, 0.006]} />
            </mesh>
            <mesh material={mats.button} position={[0, 0.026, -0.004]}>
              <boxGeometry args={[0.066, 0.005, 0.003]} />
            </mesh>
          </group>
        ))}

        {/* 목 */}
        <mesh material={mats.skin} position={[0, 0.34, 0]}>
          <cylinderGeometry args={[0.04, 0.044, 0.05, 12]} />
        </mesh>

        {/* 팔(긴 흰 소매) */}
        <Arm side={1} mats={mats} shoulderRef={rShoulder} elbowRef={rElbow} finger={finger} />
        <Arm side={-1} mats={mats} shoulderRef={lShoulder} elbowRef={lElbow} />

        {/* 짙은 남색 태블릿(왼손) */}
        <group ref={tablet} position={[-0.05, 0.19, -0.21]} rotation={[-0.55, 0.6, 0, 'YXZ']}>
          <RoundedBox args={[0.15, 0.2, 0.014]} radius={0.006} smoothness={2} bevelSegments={1} material={mats.tablet} />
          <mesh material={mats.tabletScreen} position={[0, 0.004, 0.0075]}>
            <planeGeometry args={[0.128, 0.168]} />
          </mesh>
          <mesh material={mats.sticker} position={[0.035, 0.06, -0.0075]} rotation={[0, Math.PI, 0]}>
            <circleGeometry args={[0.016, 12]} />
          </mesh>
        </group>

        {/* ── 머리 ── */}
        <group ref={head} position={[0, 0.345, 0]}>
          <group position={[0, 0.2 * 1.08, 0]} scale={1.08}>
            <mesh material={mats.skin} scale={[1.04, 1, 1]}>
              <sphereGeometry args={[HEAD_R, 30, 22]} />
            </mesh>
            {/* 단발: 정수리+일자 앞머리 / 옆·뒷머리 */}
            <mesh geometry={geo.crown} material={mats.hair} scale={[1.04, 1, 1]} />
            <mesh geometry={geo.bob} material={mats.hair} scale={[1.04, 1, 1]} />
            {/* 머리카락 윤기(앞쪽 위) */}
            <mesh material={mats.hairShine} position={[0, 0.16, 0]} rotation={[Math.PI / 2, 0, -Math.PI / 2 - 0.7]}>
              <torusGeometry args={[0.213, 0.007, 4, 18, 1.4]} />
            </mesh>

            {/* 볼 */}
            {([1, -1] as const).map((side) => (
              <FacePart key={side} az={0.66 * side} el={-0.26}>
                <mesh material={mats.cheek} scale={[1.25, 0.7, 0.3]}>
                  <sphereGeometry args={[0.03, 10, 8]} />
                </mesh>
              </FacePart>
            ))}

            {/* 눈 */}
            <FacePart az={EYE_AZ} el={EYE_EL}>
              {ex.right === 'open' ? <OpenEye mats={mats} scale={ex.eyeScale} eyeRef={eyeR} /> : <ClosedEye mats={mats} />}
            </FacePart>
            <FacePart az={-EYE_AZ} el={EYE_EL}>
              {ex.left === 'open' ? <OpenEye mats={mats} scale={ex.eyeScale} eyeRef={eyeL} /> : <ClosedEye mats={mats} />}
            </FacePart>

            {/* 눈썹(놀람·걱정일 때만, 앞머리 아래 이마에) */}
            {ex.brows !== 'none' &&
              ([1, -1] as const).map((side) => (
                <FacePart key={side} az={0.36 * side} el={ex.brows === 'raised' ? 0.24 : 0.19}>
                  <Brow side={side} kind={ex.brows === 'raised' ? 'raised' : 'worried'} mats={mats} />
                </FacePart>
              ))}

            {/* 입 */}
            <FacePart az={0} el={-0.42}>
              <group ref={mouth}>
                <Mouth kind={ex.mouth} mats={mats} />
              </group>
              <mesh ref={talkMouth} material={mats.mouth} rotation={[0, Math.PI, 0]} position={[0, 0.008, -0.002]} visible={false}>
                <circleGeometry args={[0.024, 14, Math.PI, Math.PI]} />
              </mesh>
            </FacePart>
          </group>
        </group>
      </group>
    </group>
  );
}
