// 간소화 학습 모드의 '무대': 3D 캔버스 대신 현재 장소를 2D 그림 카드와 글로 보여 준다.
// 정답 노출 규칙: 장소 이름은 locationLabel(해결 전에는 '?')만 쓰고, 그림에도 이름을 쓰지 않는다.
// 단서 확인은 단서 목록(ClueTray)의 버튼으로 한다. 이동(travel)은 약 0.7초 뒤 자동으로 도착 처리한다.

import { useEffect, useRef } from 'react';
import { CHAMBERS } from '../../data/heart';
import { MAP_NODES } from '../../data/map';
import type { LocationId, NodeId } from '../../data/types';
import { PALETTE } from '../../scene/palette';
import { runtime } from '../../scene/runtime';
import { locationLabel, sceneLocation, stepAt } from '../../state/selectors';
import { useApp } from '../../state/store';
import type { GameState, TravelState } from '../../state/types';
import './Fallback.css';

const ARRIVE_MS = 700;

type Visual = 'park' | 'chamber' | 'vessel' | 'capillary' | 'travel';
type O2 = 'rich' | 'poor' | 'toPoor' | 'toRich';

/** 각 장소의 혈액 산소 상태(그림의 적혈구 색). 산소가 적어도 붉은색(어두운 붉은색)이다. */
const O2_OF: Record<NodeId, O2> = {
  lv: 'rich',
  aorta: 'rich',
  sysCap: 'toPoor',
  venaCava: 'poor',
  ra: 'poor',
  rv: 'poor',
  pa: 'poor',
  lungCap: 'toRich',
  pv: 'rich',
  la: 'rich',
};

/** 이동이 끝나면 한 번만 arrive()를 부른다('이동 건너뛰기'를 누르면 바로). */
function useAutoArrive(game: GameState | null, frozen: boolean) {
  const doneFor = useRef<TravelState | null>(null);
  const phase = game?.phase;
  const travel = game?.travel ?? null;

  useEffect(() => {
    if (phase !== 'travel' || !travel || frozen) return;
    if (doneFor.current === travel) return;
    runtime.travelProgress = 0;
    const start = performance.now();
    let raf = 0;
    let timer = 0;
    const finish = () => {
      if (doneFor.current === travel) return;
      doneFor.current = travel;
      runtime.travelProgress = 1;
      runtime.skipRequested = false;
      useApp.getState().arrive();
    };
    const tick = () => {
      const p = Math.min(1, (performance.now() - start) / ARRIVE_MS);
      runtime.travelProgress = p;
      if (runtime.skipRequested || p >= 1) {
        finish();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    // requestAnimationFrame이 멈춰 있어도(느린 기기 등) 도착하도록 예비 타이머
    timer = window.setTimeout(finish, ARRIVE_MS + 400);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [phase, travel, frozen]);

  useEffect(
    () => () => {
      runtime.travelProgress = 0;
      runtime.skipRequested = false;
    },
    [],
  );
}

function visualOf(loc: LocationId, traveling: boolean): Visual {
  if (traveling) return 'travel';
  if (loc === 'park') return 'park';
  const kind = MAP_NODES[loc].kind;
  return kind === 'chamber' ? 'chamber' : kind === 'capillary' ? 'capillary' : 'vessel';
}

const DESCRIPTION: Record<Visual, string> = {
  park: '놀이공원이에요. 회전 열차가 어두운 터널 쪽으로 들어가려 해요.',
  chamber: '근육으로 된 벽에 둘러싸인 방 안이에요. 박동에 맞춰 벽이 움직이고, 혈액이 드나드는 입구와 출구가 보여요.',
  vessel: '굵은 혈관 속이에요. 혈액이 한쪽 방향으로 흘러가요.',
  capillary: '아주 가는 혈관 속이에요. 적혈구가 한 줄로, 모양을 살짝 바꾸며 지나가요. 혈구는 혈관 밖으로 나가지 않아요.',
  travel: '혈관을 따라 다음 구역으로 이동하는 중이에요.',
};

export function SimplifiedStage() {
  const game = useApp((s) => s.game);
  const frozen = useApp((s) => s.paused || s.hidden);
  useAutoArrive(game, frozen);
  if (!game) return null;

  const traveling = game.phase === 'travel';
  const loc = sceneLocation(game);
  const visual = visualOf(loc, traveling);
  const step = stepAt(game);
  const showClues = !traveling && (game.phase === 'observe' || game.phase === 'question' || game.phase === 'feedback' || game.phase === 'arrival');
  const seen = game.observedClues[step.id] ?? [];
  const label = traveling
    ? '이동 중…'
    : game.phase === 'intro' && loc !== 'park'
      ? '? (아직 모르는 곳)'
      : locationLabel(game);

  return (
    <div className={`simple-stage is-${visual}`}>
      <div className="simple-card">
        <div className="simple-head">
          <span className="chip simple-chip">간소화 학습 모드</span>
          <span className="simple-sub">3D 화면 대신 그림과 글로 보여 줘요</span>
        </div>
        <p className="simple-where">
          <span aria-hidden="true">📍</span> 현재 위치: <strong>{label}</strong>
        </p>
        <div className="simple-art">
          <Illustration visual={visual} loc={loc} />
        </div>
        <p className="simple-desc">{DESCRIPTION[visual]}</p>
        {showClues && step.clues.length > 0 && (
          <div className="simple-clues">
            <p className="simple-clues-title">이곳에서 살펴볼 수 있는 것</p>
            <ul>
              {step.clues.map((c) => (
                <li key={c.id} className={seen.includes(c.id) ? 'is-seen' : undefined}>
                  <span aria-hidden="true">{seen.includes(c.id) ? '✓' : '🔍'}</span> {c.title}
                  {seen.includes(c.id) && <span className="visually-hidden"> (확인함)</span>}
                </li>
              ))}
            </ul>
            <p className="simple-clues-help">단서 목록의 관찰 지점 버튼을 눌러 자세히 살펴보세요.</p>
          </div>
        )}
        <p className="simple-note">그림의 크기·모양·입자는 학습을 위해 단순하게 바꾼 것이에요. 혈액은 산소가 적어도 붉은색이에요.</p>
      </div>
    </div>
  );
}

// ── 그림 ─────────────────────────────────────────────────────────

function rbcColor(o2: O2, t: number): string {
  if (o2 === 'rich') return PALETTE.rbcRich;
  if (o2 === 'poor') return PALETTE.rbcPoor;
  const toPoor = o2 === 'toPoor';
  const k = toPoor ? t : 1 - t;
  return k < 0.5 ? PALETTE.rbcRich : PALETTE.rbcPoor;
}

function Rbc({ x, y, r = 11, color, squash = 1 }: { x: number; y: number; r?: number; color: string; squash?: number }) {
  // 가운데가 오목한 원반(옆에서 본 모양)
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse rx={r} ry={r * 0.62 * squash} fill={color} />
      <ellipse rx={r * 0.45} ry={r * 0.22 * squash} fill="#000" opacity={0.14} />
    </g>
  );
}

function Illustration({ visual, loc }: { visual: Visual; loc: LocationId }) {
  const o2: O2 = loc === 'park' ? 'rich' : O2_OF[loc];
  return (
    <svg className="simple-svg" viewBox="0 0 320 190" role="img" aria-label="현재 장소를 단순하게 그린 학습용 그림" focusable="false">
      {visual === 'park' && <ParkArt />}
      {visual === 'travel' && <TravelArt />}
      {visual === 'vessel' && loc !== 'park' && <VesselArt o2={o2} artery={loc === 'aorta' || loc === 'pa'} />}
      {visual === 'capillary' && <CapillaryArt o2={o2} lung={loc === 'lungCap'} />}
      {visual === 'chamber' && (loc === 'ra' || loc === 'rv' || loc === 'la' || loc === 'lv') && <ChamberArt id={loc} o2={o2} />}
      <text x={312} y={184} textAnchor="end" className="simple-svg-tag">
        학습용 그림
      </text>
    </svg>
  );
}

function ParkArt() {
  const spokes = Array.from({ length: 8 }, (_, i) => (i * Math.PI) / 4);
  return (
    <g>
      <rect width={320} height={190} fill="#bfe8ff" />
      <circle cx={268} cy={34} r={16} fill="#ffe27a" />
      <rect y={140} width={320} height={50} fill="#9bd77a" />
      <g className="simple-wheel" style={{ transformOrigin: '96px 82px' }}>
        <circle cx={96} cy={82} r={52} fill="none" stroke="#ff7a8a" strokeWidth={5} />
        {spokes.map((a, i) => (
          <g key={i}>
            <line x1={96} y1={82} x2={96 + Math.cos(a) * 52} y2={82 + Math.sin(a) * 52} stroke="#ff9faa" strokeWidth={2} />
            <rect x={96 + Math.cos(a) * 52 - 7} y={82 + Math.sin(a) * 52 - 5} width={14} height={11} rx={3} fill={['#ffcf3f', '#4fd6c4', '#8a7cf0'][i % 3]} />
          </g>
        ))}
      </g>
      <path d="M96 82 L70 150 M96 82 L122 150" stroke="#c45a6a" strokeWidth={5} />
      <path d="M170 150 Q215 104 262 150 Z" fill="#5a2d6e" />
      <path d="M182 150 Q215 116 250 150 Z" fill="#2a1235" />
      <rect x={150} y={146} width={170} height={6} fill="#7a5a3a" />
      <rect x={160} y={130} width={30} height={16} rx={5} fill="#ff7a8a" />
      <rect x={192} y={130} width={30} height={16} rx={5} fill="#ffcf3f" />
    </g>
  );
}

function TravelArt() {
  const rings = [0, 1, 2, 3, 4];
  return (
    <g>
      <rect width={320} height={190} fill={PALETTE.muscleDeep} />
      {rings.map((i) => (
        <ellipse
          key={i}
          cx={160}
          cy={95}
          rx={150 - i * 28}
          ry={88 - i * 16}
          fill={i % 2 ? PALETTE.arteryWall : PALETTE.arteryWallDeep}
          opacity={0.9 - i * 0.08}
        />
      ))}
      <ellipse cx={160} cy={95} rx={18} ry={11} fill={PALETTE.plasmaRich} />
      <g className="simple-flow">
        <Rbc x={92} y={70} color={PALETTE.rbcRich} />
        <Rbc x={228} y={118} color={PALETTE.rbcRich} r={13} />
        <Rbc x={200} y={62} color={PALETTE.rbcPoor} r={8} />
        <Rbc x={118} y={128} color={PALETTE.rbcPoor} r={10} />
      </g>
      <g stroke="#fff" strokeWidth={2} strokeLinecap="round" opacity={0.5}>
        <line x1={40} y1={40} x2={70} y2={58} />
        <line x1={280} y1={40} x2={250} y2={58} />
        <line x1={40} y1={150} x2={70} y2={132} />
        <line x1={280} y1={150} x2={250} y2={132} />
      </g>
    </g>
  );
}

function VesselArt({ o2, artery }: { o2: O2; artery: boolean }) {
  const wall = artery ? 22 : 12; // 동맥 벽은 두껍고 탄력 있게, 정맥 벽은 얇게
  const top = 30;
  const bottom = 160;
  const cells = [30, 82, 134, 186, 238, 290];
  return (
    <g>
      <rect width={320} height={190} fill="#fde6e3" />
      <rect x={0} y={top - wall} width={320} height={wall} fill={artery ? PALETTE.arteryWall : PALETTE.veinWall} />
      <rect x={0} y={bottom} width={320} height={wall} fill={artery ? PALETTE.arteryWall : PALETTE.veinWall} />
      <rect x={0} y={top} width={320} height={bottom - top} fill={o2 === 'poor' ? PALETTE.plasmaPoor : PALETTE.plasmaRich} opacity={0.55} />
      <g className="simple-flow">
        {cells.map((x, i) => (
          <Rbc key={x} x={x} y={i % 2 ? 72 : 118} r={14} color={rbcColor(o2, 0)} />
        ))}
      </g>
      <g fill="#fff" opacity={0.85}>
        <path d="M128 95 h50 v-8 l18 14 l-18 14 v-8 h-50 z" />
      </g>
    </g>
  );
}

function CapillaryArt({ o2, lung }: { o2: O2; lung: boolean }) {
  const cells = [36, 84, 132, 180, 228, 276];
  return (
    <g>
      <rect width={320} height={190} fill={lung ? '#fff4ec' : '#ffe9d2'} />
      {/* 혈관 바깥: 몸의 세포 또는 공기가 든 둥근 주머니(혈관과 따로 떨어져 있음) */}
      {lung ? (
        <g>
          {[40, 120, 200, 280].map((x) => (
            <g key={x}>
              <circle cx={x} cy={38} r={30} fill={PALETTE.alveolus} stroke="#f0c9b5" strokeWidth={3} />
              <circle cx={x} cy={152} r={30} fill={PALETTE.alveolus} stroke="#f0c9b5" strokeWidth={3} />
            </g>
          ))}
        </g>
      ) : (
        <g>
          {[30, 100, 170, 240, 300].map((x, i) => (
            <g key={x}>
              <rect x={x - 26} y={10} width={52} height={50} rx={12} fill={PALETTE.tissue} />
              <circle cx={x} cy={34} r={8} fill={PALETTE.tissueNucleus} />
              <rect x={x - 26 + (i % 2) * 8} y={130} width={52} height={50} rx={12} fill={PALETTE.tissue} />
              <circle cx={x + (i % 2) * 8} cy={156} r={8} fill={PALETTE.tissueNucleus} />
            </g>
          ))}
        </g>
      )}
      {/* 아주 얇은 벽의 가는 혈관 */}
      <rect x={0} y={74} width={320} height={42} rx={20} fill={o2 === 'toPoor' ? PALETTE.plasmaRich : PALETTE.plasmaPoor} opacity={0.6} />
      <rect x={0} y={72} width={320} height={46} rx={22} fill="none" stroke={PALETTE.capillaryWall} strokeWidth={3} />
      <g className="simple-flow">
        {cells.map((x) => (
          <Rbc key={x} x={x} y={95} r={15} squash={1.2} color={rbcColor(o2, x / 320)} />
        ))}
      </g>
      {/* 학습용 입자: 산소(흰 점)의 이동 방향(폐: 주머니 → 혈액, 온몸: 혈액 → 세포) */}
      <g fill="#ffffff" stroke="#7ee0ff" strokeWidth={1.2}>
        {[60, 160, 260].map((x) => (
          <circle key={x} cx={x} cy={lung ? 62 : 128} r={4} />
        ))}
      </g>
      <g stroke="#2b2333" strokeWidth={1.6} fill="none" opacity={0.6}>
        {[60, 160, 260].map((x) => (
          <path key={x} d={lung ? `M${x + 10} 54 l0 12 m-4 -4 l4 4 l4 -4` : `M${x + 10} 120 l0 12 m-4 -4 l4 4 l4 -4`} />
        ))}
      </g>
    </g>
  );
}

function ChamberArt({ id, o2 }: { id: 'ra' | 'rv' | 'la' | 'lv'; o2: O2 }) {
  const spec = CHAMBERS[id];
  const t = 6 + spec.wallIndex * 0.22; // 벽 두께(비교 장치와 같은 비율)
  const atrium = spec.role === 'atrium';
  return (
    <g>
      <rect width={320} height={190} fill="#fbe1e4" />
      <g className="simple-beat" style={{ transformOrigin: '160px 95px' }}>
        <rect x={30} y={18} width={260} height={154} rx={60} fill={PALETTE.muscle} />
        <rect x={30 + t} y={18 + t} width={260 - t * 2} height={154 - t * 2} rx={Math.max(20, 60 - t)} fill={o2 === 'poor' ? PALETTE.plasmaPoor : PALETTE.plasmaRich} />
        {[0, 1, 2, 3, 4].map((i) => (
          <Rbc key={i} x={96 + i * 32} y={i % 2 ? 84 : 110} r={12} color={rbcColor(o2, 0)} />
        ))}
      </g>
      {atrium ? (
        <g>
          {/* 들어오는 혈관 입구(판막 없음)와 아래쪽 방으로 가는 판막 */}
          {Array.from({ length: Math.min(spec.inletCount, 4) }, (_, i) => (
            <ellipse key={i} cx={90 + i * 46} cy={18 + t / 2} rx={14} ry={8} fill={PALETTE.muscleDeep} />
          ))}
          <Valve x={160} y={172 - t / 2} down />
        </g>
      ) : (
        <g>
          <Valve x={100} y={18 + t / 2} />
          <Valve x={220} y={18 + t / 2} />
        </g>
      )}
    </g>
  );
}

function Valve({ x, y, down = false }: { x: number; y: number; down?: boolean }) {
  const d = down ? 1 : -1;
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse rx={26} ry={9} fill={PALETTE.muscleDeep} />
      <path d={`M-22 0 Q-11 ${8 * d} 0 0 Q11 ${8 * d} 22 0`} fill={PALETTE.valve} stroke={PALETTE.valveEdge} strokeWidth={2} />
    </g>
  );
}
