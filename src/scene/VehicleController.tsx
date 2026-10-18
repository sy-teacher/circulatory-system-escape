// 탐사선 이동 제어: 공간 경로(LocationDef.path)를 따라 탐사선 자세를 계산해 runtime에 기록한다.
// React 상태는 이동이 끝날 때 arrive()를 한 번 부르는 것 외에는 바꾸지 않는다.

import { useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Quaternion, Vector3 } from 'three';
import { GAME_CONFIG } from '../data/config';
import { ROUTE } from '../data/route';
import type { LocationId } from '../data/types';
import { useApp } from '../state/store';
import type { Phase, TravelState } from '../state/types';
import { LOCATIONS } from './locations';
import { runtime } from './runtime';
import { computePathFrames, poseOnPath, type PathFrames } from './shared/pathFrames';

// ── 경로 좌표계 캐시(경로는 모듈 상수이므로 한 번만 계산) ─────────────────

const framesCache = new Map<LocationId, PathFrames>();

export function framesFor(loc: LocationId): PathFrames {
  let f = framesCache.get(loc);
  if (!f) {
    f = computePathFrames(LOCATIONS[loc].path, 256);
    framesCache.set(loc, f);
  }
  return f;
}

// ── 장면 전환(페이드) 감독 ─────────────────────────────────────

type FadeStage = 'idle' | 'out' | 'hold' | 'in';

export interface SwitchOptions {
  /** 같은 공간이어도 어두워졌다 밝아지게 한다(순간 이동) */
  force?: boolean;
  /** 어두워지는/밝아지는 데 걸리는 시간(초, 각각) */
  seconds?: number;
}

/**
 * 화면에 보이는 공간을 바꾸는 감독. 페이드 아웃 → 공간 교체 → (React 반영 대기) → 페이드 인.
 * 요청마다 번호(token)를 돌려주고, 교체·표시가 끝난 번호를 switchedToken/shownToken으로 알린다.
 */
export class SceneDirector {
  /** 지금 화면(3D)에 보이는 공간 */
  displayed: LocationId;
  /** 공간을 교체한 마지막 요청 번호 */
  switchedToken = 0;
  /** 페이드 인까지 끝난 마지막 요청 번호 */
  shownToken = 0;

  private stage: FadeStage = 'hold';
  private pending: LocationId | null = null;
  private pendingToken = 0;
  private token = 0;
  private seconds = 0.5;
  private committed: LocationId | null = null;
  private holdFrames = 0;
  private listener: ((loc: LocationId) => void) | null = null;

  constructor(initial: LocationId) {
    this.displayed = initial;
    // 처음에는 어두운 화면에서 밝아지며 시작한다
    runtime.fade = 1;
  }

  setListener(fn: ((loc: LocationId) => void) | null): void {
    this.listener = fn;
  }

  /** React가 이 공간을 실제로 그렸음을 알린다 */
  commit(loc: LocationId): void {
    this.committed = loc;
  }

  get busy(): boolean {
    return this.stage !== 'idle';
  }

  /** 전환이 끝났을 때 보이게 될 공간 */
  get target(): LocationId {
    return this.pending ?? this.displayed;
  }

  request(loc: LocationId, opts: SwitchOptions = {}): number {
    const id = ++this.token;
    if (opts.seconds !== undefined) this.seconds = Math.max(0.05, opts.seconds);
    if (!opts.force && loc === this.displayed) {
      // 이미 보이는 공간: 진행 중이던 다른 공간으로의 전환은 취소하고 다시 밝힌다
      this.pending = null;
      if (this.stage === 'out') this.stage = 'in';
      this.switchedToken = id;
      this.pendingToken = id;
      if (this.stage === 'idle') this.shownToken = id;
      return id;
    }
    this.pending = loc;
    this.pendingToken = id;
    if (this.stage !== 'out') this.stage = 'out';
    return id;
  }

  /** 매 프레임 호출(dt: 초) */
  update(dt: number): void {
    switch (this.stage) {
      case 'out': {
        runtime.fade = Math.min(1, runtime.fade + dt / this.seconds);
        if (runtime.fade >= 1) {
          if (this.pending) {
            this.displayed = this.pending;
            this.pending = null;
            this.listener?.(this.displayed);
          }
          this.switchedToken = this.pendingToken;
          this.stage = 'hold';
          this.holdFrames = 0;
        }
        break;
      }
      case 'hold': {
        runtime.fade = 1;
        this.holdFrames++;
        // 새 공간이 그려진 뒤 2프레임(셰이더 준비) 기다린다. 반영이 늦어져도 1.5초 뒤에는 밝힌다.
        const ready = this.committed === this.displayed && this.holdFrames >= 3;
        if (ready || this.holdFrames > 90) this.stage = 'in';
        break;
      }
      case 'in': {
        runtime.fade = Math.max(0, runtime.fade - dt / this.seconds);
        if (runtime.fade <= 0) {
          this.stage = 'idle';
          this.shownToken = this.pendingToken;
        }
        break;
      }
      case 'idle':
        break;
    }
  }
}

// ── 탐사선 이동 ─────────────────────────────────────────────

interface Plan {
  travel: TravelState;
  kind: 'teleport' | 'same' | 'cross';
  stage: 'segA' | 'switch' | 'segB' | 'wait' | 'done';
  fromLoc: LocationId;
  toLoc: LocationId;
  sFrom: number;
  sTo: number;
  durA: number;
  durB: number;
  /** 현재 구간 경과 시간 */
  u: number;
  token: number;
  skip: boolean;
  elapsed: number;
  total: number;
  fade: number;
}

const easeInOut = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * x);
const easeIn = (x: number) => 1 - Math.cos((Math.PI * x) / 2);
const easeOut = (x: number) => Math.sin((Math.PI * x) / 2);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const damp = (k: number, dt: number) => 1 - Math.exp(-k * dt);

function stepAtIndex(i: number) {
  return ROUTE[Math.min(Math.max(i, 0), ROUTE.length - 1)];
}

function makePlan(travel: TravelState, director: SceneDirector, reduceMotion: boolean): Plan {
  const fade = reduceMotion ? 0.25 : 0.5;
  const base = travel.fast ? GAME_CONFIG.rememberedTravelSeconds : GAME_CONFIG.travelSeconds;
  const D = base * (reduceMotion ? 0.6 : 1);
  const to = stepAtIndex(travel.to);
  const plan: Plan = {
    travel,
    kind: 'teleport',
    stage: 'wait',
    fromLoc: to.locationId,
    toLoc: to.locationId,
    sFrom: to.stop,
    sTo: to.stop,
    durA: 0,
    durB: 0,
    u: 0,
    token: 0,
    skip: false,
    elapsed: 0,
    total: fade * 2 + 0.1,
    fade,
  };

  if (travel.mode === 'teleport' || travel.from === null) {
    plan.token = director.request(to.locationId, { force: true, seconds: fade });
    return plan;
  }

  const from = stepAtIndex(travel.from);
  plan.fromLoc = from.locationId;
  plan.sFrom = from.stop;

  if (from.locationId === to.locationId && director.target === to.locationId) {
    plan.kind = 'same';
    plan.stage = 'segB';
    plan.durB = Math.max(0.6, D);
    plan.total = plan.durB;
    return plan;
  }

  plan.kind = 'cross';
  const skipA = director.target !== from.locationId;
  const lenA = skipA ? 0 : framesFor(from.locationId).length * (1 - from.stop);
  const lenB = framesFor(to.locationId).length * to.stop;
  const motion = Math.max(1, D - 2 * fade);
  const wA = lenA + lenB > 0.001 ? lenA / (lenA + lenB) : 0.5;
  plan.durA = skipA ? 0 : Math.max(0.35, motion * wA);
  plan.durB = Math.max(0.35, motion - plan.durA);
  plan.total = plan.durA + plan.durB + 2 * fade;
  if (skipA) {
    plan.stage = 'switch';
    plan.token = director.request(to.locationId, { seconds: fade });
  } else {
    plan.stage = 'segA';
  }
  return plan;
}

export interface DriveInput {
  travel: TravelState | null;
  phase: Phase;
  stepIndex: number;
  reduceMotion: boolean;
}

export interface VehicleControllerProps extends DriveInput {
  director: SceneDirector;
}

const _pos = new Vector3();
const _quat = new Quaternion();
const _roll = new Quaternion();
const _axisZ = new Vector3(0, 0, 1);

/**
 * 탐사선 주행(프레임 단위 계산). React와 무관한 클래스라 자동 검증에서도 그대로 돌릴 수 있다.
 * runtime.pathT, vehiclePosition, vehicleQuaternion, freeRadius, travelProgress, lateral을 쓴다.
 */
export class VehicleDriver {
  private plan: Plan | null = null;
  /** arrive()를 이미 부른 이동(같은 이동에 두 번 부르지 않는다) */
  private arrivedFor: TravelState | null = null;
  private t: number;
  private lastLoc: LocationId | null = null;
  private steer = 0;
  private push = 0;

  constructor(initialT: number) {
    this.t = initialT;
  }

  /** 현재 이동 단계(검증용) */
  get stage(): Plan['stage'] | null {
    return this.plan?.stage ?? null;
  }

  update(rawDt: number, input: DriveInput, director: SceneDirector, onArrive: () => void): void {
    const dt = Math.min(Math.max(rawDt, 0), 0.05);
    const { travel: tr, phase: ph, stepIndex: si, reduceMotion: rm } = input;

    // 1) 이동 계획 갱신
    if (!tr) {
      this.plan = null;
    } else if (this.plan?.travel !== tr && this.arrivedFor !== tr) {
      this.plan = makePlan(tr, director, rm);
    }
    const p = this.plan;

    const finish = (pl: Plan) => {
      pl.stage = 'done';
      runtime.travelProgress = 1;
      if (this.arrivedFor !== pl.travel) {
        this.arrivedFor = pl.travel;
        onArrive();
      }
    };

    // 2) '이동 건너뛰기'
    if (runtime.skipRequested) {
      runtime.skipRequested = false;
      if (p && p.stage !== 'done') {
        p.skip = true;
        if (p.stage === 'segA') {
          p.stage = 'switch';
          p.token = director.request(p.toLoc, { seconds: 0.15 });
        } else if (p.stage === 'segB') {
          this.t = p.sTo;
          finish(p);
        }
      }
    }

    // 3) 이동 진행
    let t = this.t;
    const loc = director.displayed;
    const locChanged = loc !== this.lastLoc;
    if (locChanged) {
      this.lastLoc = loc;
      runtime.lateral = 0;
      this.push = 0;
    }

    if (p && p.stage !== 'done') {
      p.elapsed += dt;
      runtime.travelProgress = clamp01(p.elapsed / Math.max(0.001, p.total));
      switch (p.stage) {
        case 'wait': {
          // 순간 이동: 어두워진 뒤 목표 지점에 놓고, 밝아지면 도착
          if (director.switchedToken >= p.token && director.displayed === p.toLoc) {
            t = p.sTo;
            if (p.skip || director.shownToken >= p.token) {
              this.t = t;
              finish(p);
            }
          }
          break;
        }
        case 'segA': {
          p.u += dt;
          const x = clamp01(p.u / Math.max(0.001, p.durA));
          t = p.sFrom + (1 - p.sFrom) * easeIn(x);
          if (x >= 1) {
            t = 1;
            p.stage = 'switch';
            p.token = director.request(p.toLoc, { seconds: p.fade });
          }
          break;
        }
        case 'switch': {
          if (director.switchedToken >= p.token && director.displayed === p.toLoc) {
            if (p.skip) {
              t = p.sTo;
              this.t = t;
              finish(p);
            } else {
              t = 0;
              p.stage = 'segB';
              p.u = 0;
            }
          }
          break;
        }
        case 'segB': {
          p.u += dt;
          const x = clamp01(p.u / Math.max(0.001, p.durB));
          if (p.kind === 'same') t = p.sFrom + (p.sTo - p.sFrom) * easeInOut(x);
          else t = p.sTo * easeOut(x);
          if (x >= 1) {
            t = p.sTo;
            this.t = t;
            finish(p);
          }
          break;
        }
      }
    } else {
      // 4) 정차 중: 현재 단계의 정차 지점
      if (!p) runtime.travelProgress = 0;
      const step = stepAtIndex(si);
      if (loc === 'park') {
        // 놀이공원(도입): 천천히 한 바퀴씩 돈다 / 탈출 장면: 출발점에 멈춤
        t = ph === 'intro' ? (locChanged ? 0 : (t + 0.025 * dt) % 1) : 0;
      } else {
        const target = loc === step.locationId ? step.stop : 0.5;
        if (locChanged || p) t = target;
        else t += (target - t) * damp(3, dt);
      }
    }
    t = clamp01(t);
    this.t = t;

    // 5) 조향(이동·관찰 중에만)
    const steerAllowed = ph === 'travel' || ph === 'observe';
    const steerIn = steerAllowed ? Math.max(-1, Math.min(1, runtime.steerInput)) : 0;
    this.steer += (steerIn - this.steer) * damp(6, dt);
    if (steerAllowed) {
      runtime.lateral = Math.max(-1, Math.min(1, runtime.lateral + this.steer * 1.1 * dt));
    } else if (loc === 'park') {
      runtime.lateral += (0 - runtime.lateral) * damp(2, dt);
    }

    // 6) 자세 계산
    const def = LOCATIONS[loc];
    const frames = framesFor(loc);
    const lane = Math.max(0, def.laneHalfWidth(t));
    runtime.freeRadius = lane;

    // 심실: 수축할 때 출구 쪽으로 살짝 밀린다(카메라 흔들림 없이 부드럽게)
    const stopped = !p || p.stage === 'done';
    const amp = stopped ? (loc === 'lv' ? 0.25 : loc === 'rv' ? 0.12 : 0) * (rm ? 0.3 : 1) : 0;
    this.push += (runtime.contraction * amp - this.push) * damp(9, dt);
    const tPose = clamp01(t + this.push / Math.max(1, frames.length));

    // 떠 있는 탐사선의 느린 출렁임(0.5Hz, ±0.03). 레일 위 열차(놀이공원)와 움직임 줄이기에서는 없음
    const bob = rm || def.vehicle !== 'probe' ? 0 : 0.03 * Math.sin(Math.PI * runtime.time);
    poseOnPath(frames, tPose, runtime.lateral * lane, bob, _pos, _quat);

    // 조향 방향으로 아주 살짝 기울기(움직임 줄이기에서는 없음)
    if (!rm) {
      _roll.setFromAxisAngle(_axisZ, -this.steer * 0.05);
      _quat.multiply(_roll);
    }

    runtime.pathT = t;
    runtime.vehiclePosition.copy(_pos);
    runtime.vehicleQuaternion.copy(_quat);
  }
}

/**
 * 탐사선을 경로 위에서 움직인다. 화면에는 아무것도 그리지 않는다.
 * 이동이 끝나면 useApp.getState().arrive()를 이동마다 정확히 한 번 부른다.
 */
export function VehicleController({ director, travel, phase, stepIndex, reduceMotion }: VehicleControllerProps): null {
  const input = useRef<DriveInput>({ travel, phase, stepIndex, reduceMotion });
  input.current = { travel, phase, stepIndex, reduceMotion };
  const driver = useRef<VehicleDriver | null>(null);
  if (!driver.current) driver.current = new VehicleDriver(stepAtIndex(stepIndex).stop);

  useEffect(() => {
    runtime.lateral = 0;
    runtime.travelProgress = 0;
    runtime.skipRequested = false;
  }, []);

  useFrame((_, dt) => {
    driver.current?.update(dt, input.current, director, () => useApp.getState().arrive());
  }, -2);

  return null;
}
