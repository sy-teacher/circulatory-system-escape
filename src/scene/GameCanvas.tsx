// 3D 장면 진입점: 캔버스, 조명·배경, 공간 전환(페이드), 탐사선·수연쌤, 카메라.
// 프레임마다 React 상태를 바꾸지 않는다(프레임 값은 runtime 사용).

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Component, useCallback, useEffect, useMemo, useRef, useState, type JSX, type ReactNode } from 'react';
import { Object3D, Vector3, type DirectionalLight, type HemisphereLight, type PointLight, type SpotLight } from 'three';
import { setHeartbeatLevel } from '../audio/sfx';
import { ROUTE } from '../data/route';
import type { LocationId, Mood } from '../data/types';
import { sceneLocation } from '../state/selectors';
import { useApp } from '../state/store';
import type { GameState } from '../state/types';
import { CameraRig } from './CameraRig';
import { FadeOverlay } from './FadeOverlay';
import { isDashboardAnchor } from './instruments';
import { LOCATIONS } from './locations';
import { BEAT_EPOCH, beatAt, resetView, runtime } from './runtime';
import type { LocationDef, LocationProps } from './types';
import { SceneDirector, VehicleController } from './VehicleController';
import type { SuyeonPose, SuyeonProps } from './character/Suyeon';
import { Vehicle } from './vehicle/Vehicle';

/** 3D를 그릴 수 없을 때 간소화 학습 모드로 전환 */
function fallbackToSimplified(): void {
  const s = useApp.getState();
  s.setWebgl(false);
  s.setSimplified(true);
}

class CanvasBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(): void {
    this.props.onError();
  }

  render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

function stepAt(i: number) {
  return ROUTE[Math.min(Math.max(i, 0), ROUTE.length - 1)];
}

/** 처음 보여 줄 공간(이어하기 순간 이동이면 도착 공간) */
function initialLocation(game: GameState): LocationId {
  if (game.travel) return stepAt(game.travel.to).locationId;
  return sceneLocation(game);
}

// ── 프레임 공통 처리 ───────────────────────────────────────

/** 장면 시간과 심장 박동 값 */
function SceneClock(): null {
  useFrame((_, dt) => {
    runtime.time += Math.min(dt, 0.05);
    // 박동은 효과음과 같은 기준 시각(BEAT_EPOCH)을 써서 일시정지 후에도 소리와 맞춘다
    const b = beatAt((performance.now() - BEAT_EPOCH) / 1000);
    runtime.beatPhase = b.phase;
    runtime.contraction = b.ventricle;
    runtime.atrialContraction = b.atrium;
  }, -4);
  return null;
}

function FadeDriver({ director }: { director: SceneDirector }): null {
  useFrame((_, dt) => director.update(Math.min(dt, 0.05)), -3);
  return null;
}

/** WebGL 컨텍스트를 잃고 3초 안에 복구되지 않으면 간소화 모드로 */
function ContextLossGuard(): null {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const el = gl.domElement;
    let timer = 0;
    const lost = (e: Event) => {
      e.preventDefault();
      window.clearTimeout(timer);
      timer = window.setTimeout(fallbackToSimplified, 3000);
    };
    const restored = () => window.clearTimeout(timer);
    el.addEventListener('webglcontextlost', lost);
    el.addEventListener('webglcontextrestored', restored);
    return () => {
      window.clearTimeout(timer);
      el.removeEventListener('webglcontextlost', lost);
      el.removeEventListener('webglcontextrestored', restored);
    };
  }, [gl]);
  return null;
}

const _v = new Vector3();

/**
 * 공간 기본 조명(반구광 + 부드러운 방향광) + 탐사선을 따라가는 전조등·실내등.
 * 조명 개수가 바뀌면 셰이더를 다시 만들어야 하므로 조명은 늘 두고 세기만 바꾼다.
 * 공간 컴포넌트가 자기 반구광을 직접 넣은 경우(예: 놀이공원의 어두워지는 연출)에는 기본 조명을 끈다.
 */
function SceneLights({ def, probe }: { def: LocationDef; probe: boolean }): JSX.Element {
  const scene = useThree((s) => s.scene);
  const hemi = useRef<HemisphereLight>(null);
  const sun = useRef<DirectionalLight>(null);
  const spot = useRef<SpotLight>(null);
  const cabin = useRef<PointLight>(null);
  const target = useMemo(() => new Object3D(), []);
  const live = useRef({ def, probe });
  live.current = { def, probe };
  const own = useRef({ id: '' as string, timer: 0, found: false });

  useFrame((_, rawDt) => {
    const { def: d, probe: pr } = live.current;
    const o = own.current;
    o.timer -= rawDt;
    if (o.id !== d.id || o.timer <= 0) {
      o.id = d.id;
      o.timer = 1;
      let found = false;
      scene.traverse((obj) => {
        if (!found && obj !== hemi.current && (obj as HemisphereLight).isHemisphereLight) found = true;
      });
      o.found = found;
    }
    if (hemi.current) hemi.current.intensity = o.found ? 0 : d.ambient.intensity;
    if (sun.current) sun.current.intensity = o.found ? 0 : 0.55;

    const p = runtime.vehiclePosition;
    const q = runtime.vehicleQuaternion;
    if (spot.current) {
      spot.current.intensity = pr ? 9 : 0;
      spot.current.position.copy(_v.set(0, 0.9, -1.15).applyQuaternion(q).add(p));
      target.position.copy(_v.set(0, 0.5, -9).applyQuaternion(q).add(p));
      target.updateMatrixWorld();
    }
    if (cabin.current) {
      cabin.current.intensity = pr ? 1.6 : 0;
      cabin.current.position.copy(_v.set(0, 1.9, 0.1).applyQuaternion(q).add(p));
    }
  }, -1);

  return (
    <>
      <hemisphereLight ref={hemi} color={def.ambient.sky} groundColor={def.ambient.ground} intensity={0} />
      <directionalLight ref={sun} position={[4, 10, 6]} intensity={0} color="#fff4ea" />
      <spotLight ref={spot} target={target} color="#fff1d6" intensity={0} distance={26} angle={0.7} penumbra={0.6} decay={1.1} />
      <primitive object={target} />
      <pointLight ref={cabin} color="#ffffff" intensity={0} distance={3.5} decay={1.5} />
    </>
  );
}

// ── 장면 본체 ──────────────────────────────────────────────

function SceneGate(): JSX.Element | null {
  const game = useApp((s) => s.game);
  if (!game) return null;
  return <SceneRoot key={game.sessionId} game={game} />;
}

function SceneRoot({ game }: { game: GameState }): JSX.Element {
  const lowSpec = useApp((s) => s.settings.lowSpec);
  const reduceMotion = useApp((s) => s.settings.reduceMotion);
  const focusedClueId = useApp((s) => s.focusedClueId);

  const [director] = useState(() => new SceneDirector(initialLocation(game)));
  const [displayed, setDisplayed] = useState<LocationId>(director.displayed);

  useEffect(() => {
    director.setListener(setDisplayed);
    return () => director.setListener(null);
  }, [director]);
  useEffect(() => {
    director.commit(displayed);
  }, [director, displayed]);
  useEffect(() => {
    try {
      setHeartbeatLevel(LOCATIONS[displayed].heartbeat);
    } catch {
      /* 효과음 오류가 장면을 멈추지 않게 한다 */
    }
  }, [displayed]);
  useEffect(() => {
    resetView();
    runtime.yaw = 0;
    runtime.pitch = 0;
    runtime.fov = 62;
    return () => {
      runtime.fade = 0;
    };
  }, []);

  // 다음 구역으로 출발할 때 시점을 정면으로 되돌린다(도착하면 앞을 보고 있도록)
  useEffect(() => {
    if (game.phase === 'travel') resetView();
  }, [game.phase, game.stepIndex]);

  // 이동 중이 아닐 때 보여 줄 공간(이동 중에는 VehicleController가 전환을 정한다)
  const traveling = game.phase === 'travel';
  const wanted = sceneLocation(game);
  const fadeSeconds = reduceMotion ? 0.25 : 0.5;
  useEffect(() => {
    if (!traveling) director.request(wanted, { seconds: fadeSeconds });
  }, [director, wanted, traveling, fadeSeconds]);

  // ── 공간 속성 ──
  const step = stepAt(game.stepIndex);
  const tr = game.travel;
  const shownStep =
    tr && tr.from !== null && displayed !== step.locationId && stepAt(tr.from).locationId === displayed ? stepAt(tr.from) : step;
  const canObserve = (game.phase === 'observe' || game.phase === 'question') && !tr && displayed === step.locationId;
  const observedIds = game.observedClues[step.id];

  const anchors = useMemo(() => {
    const seen = observedIds ?? [];
    const all = step.clues.map((c) => c.anchor);
    return {
      active: canObserve ? all.filter((a) => !isDashboardAnchor(a)) : [],
      dashboard: canObserve ? all.filter((a) => isDashboardAnchor(a)) : [],
      observed: step.clues.filter((c) => seen.includes(c.id)).map((c) => c.anchor),
      labels: Object.fromEntries(step.clues.map((c) => [c.anchor, c.title])) as Record<string, string>,
    };
  }, [step, canObserve, observedIds]);

  const onAnchorClick = useCallback((anchor: string) => {
    const app = useApp.getState();
    const g = app.game;
    if (!g) return;
    const clue = stepAt(g.stepIndex).clues.find((c) => c.anchor === anchor);
    if (clue) app.focusClue(clue.id);
  }, []);

  const focusAnchor = focusedClueId ? step.clues.find((c) => c.id === focusedClueId)?.anchor ?? null : null;

  // ── 수연쌤 표정·자세 ──
  const dlg = game.dialogue;
  const line = dlg ? dlg.lines[dlg.index] ?? null : null;
  const suyeonLine = line && line.speaker === 'suyeon' ? line : null;
  const fb = game.phase === 'feedback' ? game.feedback : null;

  let mood: Mood = 'smile';
  if (suyeonLine) mood = suyeonLine.mood ?? 'smile';
  else if (fb) mood = fb.triggeredReturn ? 'worried' : fb.isCorrect ? 'cheer' : 'open';

  const speechKey = suyeonLine && dlg ? `d|${dlg.kind}|${dlg.index}|${suyeonLine.text}` : fb ? `f|${fb.questionId}|${fb.attemptIndex}` : null;
  const speechMs = suyeonLine ? Math.max(700, suyeonLine.text.length * 45) : 1800;
  const [talking, setTalking] = useState(false);
  useEffect(() => {
    if (!speechKey) {
      setTalking(false);
      return undefined;
    }
    setTalking(true);
    const id = window.setTimeout(() => setTalking(false), speechMs);
    return () => window.clearTimeout(id);
  }, [speechKey, speechMs]);

  // 힌트를 펼치면 4초 동안 손가락을 들어 보인다
  const hints = game.hintsRevealed[step.questionId] ?? 0;
  const [hintPoint, setHintPoint] = useState(false);
  const prevHints = useRef({ q: step.questionId, n: hints });
  useEffect(() => {
    const prev = prevHints.current;
    prevHints.current = { q: step.questionId, n: hints };
    if (prev.q === step.questionId && hints > prev.n) {
      setHintPoint(true);
      const id = window.setTimeout(() => setHintPoint(false), 4000);
      return () => window.clearTimeout(id);
    }
    setHintPoint(false);
    return undefined;
  }, [hints, step.questionId]);

  const pose: SuyeonPose =
    (hintPoint && game.phase === 'question') || game.phase === 'feedback' || dlg?.kind === 'arrival'
      ? 'point'
      : game.phase === 'question'
        ? 'tablet'
        : 'idle';
  const lookAtCamera = !!suyeonLine || !!fb;

  const suyeon = useMemo<SuyeonProps>(
    () => ({ mood, talking, pose, lookAtCamera, reduceMotion }),
    [mood, talking, pose, lookAtCamera, reduceMotion],
  );

  const def = LOCATIONS[displayed];
  const probe = def.vehicle === 'probe';
  const LocationComponent = def.Component;
  const locationProps: LocationProps = {
    activeAnchors: anchors.active,
    observedAnchors: anchors.observed,
    onAnchorClick,
    anchorLabels: anchors.labels,
    stepId: shownStep.id,
    flagPlanted: game.flagPlanted,
    lowSpec,
    reduceMotion,
  };

  return (
    <>
      <SceneClock />
      <FadeDriver director={director} />
      <color key={`bg-${displayed}`} attach="background" args={[def.background]} />
      <fog key={`fog-${displayed}`} attach="fog" args={[def.fog.color, def.fog.near, def.fog.far]} />
      <SceneLights def={def} probe={probe} />
      <VehicleController director={director} travel={tr} phase={game.phase} stepIndex={game.stepIndex} reduceMotion={reduceMotion} />
      <CameraRig reduceMotion={reduceMotion} focusAnchor={focusAnchor} />
      <LocationComponent key={displayed} {...locationProps} />
      {probe && (
        <Vehicle
          location={displayed}
          activeDashboardAnchors={anchors.dashboard}
          observedAnchors={anchors.observed}
          anchorLabels={anchors.labels}
          onAnchorClick={onAnchorClick}
          lowSpec={lowSpec}
          reduceMotion={reduceMotion}
          suyeon={suyeon}
        />
      )}
    </>
  );
}

// ── 캔버스 ────────────────────────────────────────────────

export function GameCanvas(): JSX.Element {
  const lowSpec = useApp((s) => s.settings.lowSpec);
  const paused = useApp((s) => s.paused);
  const hidden = useApp((s) => s.hidden);

  return (
    <div className="game-canvas" style={{ position: 'absolute', inset: 0, overflow: 'hidden', isolation: 'isolate' }}>
      <CanvasBoundary onError={fallbackToSimplified}>
        <Canvas
          key={lowSpec ? 'low' : 'std'}
          gl={{ antialias: !lowSpec, powerPreference: 'high-performance' }}
          dpr={lowSpec ? 1 : [1, 1.75]}
          camera={{ fov: 62, near: 0.05, far: 500, position: [0, 1, 0] }}
          frameloop={paused || hidden ? 'never' : 'always'}
          style={{ touchAction: 'none' }}
        >
          <ContextLossGuard />
          <SceneGate />
        </Canvas>
      </CanvasBoundary>
      <FadeOverlay />
    </div>
  );
}
