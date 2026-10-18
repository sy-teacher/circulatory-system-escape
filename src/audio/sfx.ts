// Web Audio API로 합성한 효과음과 심장박동. 소리 파일을 쓰지 않는다.
// unlockAudio()(사용자 동작 안에서 호출) 전에는 모든 함수가 아무것도 하지 않는다.

import { onGameEvent } from '../state/events';
import { BEAT_EPOCH, BEAT_PERIOD } from '../scene/runtime';

export type SfxName =
  | 'click'
  | 'clue'
  | 'hint'
  | 'correct'
  | 'wrong'
  | 'reviewWrong'
  | 'mapUpdate'
  | 'return'
  | 'depart'
  | 'arrive'
  | 'escape'
  | 'dialogue'
  | 'whoosh';

type Ctor = typeof AudioContext;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfxBus: GainNode | null = null;
let beatBus: GainNode | null = null;
let noise: AudioBuffer | null = null;

let volume = 0.8;
let muted = false;
/** 원하는 일시정지 상태(실제 상태는 ctx.state) */
let wantSuspended = false;
let applying = false;

/** 심장박동 */
let beatLevel = 0;
let beatTimer: ReturnType<typeof setInterval> | null = null;
let nextBeat = -1;
const BEAT_MAX_GAIN = 0.55;
const LOOKAHEAD = 0.25; // 초
const TICK_MS = 80;

/** 동시에 울리는 소리 수 제한(CPU 보호) */
let voices = 0;
const MAX_VOICES = 28;
const lastPlayed = new Map<string, number>();
const MIN_GAP: Partial<Record<SfxName, number>> = { dialogue: 0.12, click: 0.04 };

const PERIOD_MS = BEAT_PERIOD * 1000;

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
}

function masterTarget(): number {
  if (muted) return 0;
  const v = clamp01(volume);
  // 귀에 자연스럽게 들리도록 약간 휘어진 곡선
  return v * v * 0.9 + v * 0.1;
}

function getCtor(): Ctor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

function makeNoise(c: AudioContext): AudioBuffer {
  const len = Math.floor(c.sampleRate * 1.5);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  // 약간 부드러운(분홍 소음에 가까운) 잡음
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    last = last * 0.86 + w * 0.14;
    d[i] = last * 3.2;
  }
  return buf;
}

/** 원하는 상태(실행/일시정지)를 실제 AudioContext에 반영. 동시에 여러 요청이 겹치지 않게 한다. */
function applyContextState(): void {
  const c = ctx;
  if (!c || applying || c.state === 'closed') return;
  const requested = wantSuspended;
  if ((requested && c.state === 'suspended') || (!requested && c.state === 'running')) return;
  applying = true;
  const p = requested ? c.suspend() : c.resume();
  p.catch(() => {
    /* 무시: 다음 사용자 동작에서 다시 시도 */
  }).finally(() => {
    applying = false;
    if (requested !== wantSuspended) applyContextState();
    updateBeatTimer();
  });
}

function isRunning(): boolean {
  return !!ctx && ctx.state === 'running' && !wantSuspended;
}

// ─────────────────────────────────────────────────────────────
//  공개 함수
// ─────────────────────────────────────────────────────────────

/** AudioContext를 만들거나 다시 켠다. 반드시 사용자 동작(버튼 클릭 등) 안에서 호출한다. */
export function unlockAudio(): void {
  const Ctor = getCtor();
  if (!Ctor) return;
  try {
    if (!ctx) {
      const c = new Ctor({ latencyHint: 'interactive' });
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 12;
      comp.ratio.value = 4;
      comp.attack.value = 0.004;
      comp.release.value = 0.25;
      comp.connect(c.destination);

      const m = c.createGain();
      m.gain.value = masterTarget();
      m.connect(comp);

      const s = c.createGain();
      s.gain.value = 1;
      s.connect(m);

      // 심장박동은 낮은 소리만 남겨 부드럽게
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 380;
      lp.Q.value = 0.4;
      lp.connect(m);
      const b = c.createGain();
      b.gain.value = 0;
      b.connect(lp);

      ctx = c;
      master = m;
      sfxBus = s;
      beatBus = b;
      noise = makeNoise(c);

      // iOS 사파리 잠금 해제용 무음 1샘플
      const silent = c.createBufferSource();
      silent.buffer = c.createBuffer(1, 1, c.sampleRate);
      silent.connect(c.destination);
      silent.onended = () => silent.disconnect();
      silent.start(0);
    }
    // 사용자 동작 안에서 일단 켠다(브라우저 자동 재생 정책). 원하는 상태가 '일시정지'면 곧바로 다시 멈춘다.
    const c = ctx;
    if (c.state !== 'running' && c.state !== 'closed') {
      applying = true;
      c.resume()
        .catch(() => {
          /* 무시 */
        })
        .finally(() => {
          applying = false;
          applyContextState();
          updateBeatTimer();
        });
    } else {
      applyContextState();
    }
    if (master) master.gain.setTargetAtTime(masterTarget(), c.currentTime, 0.05);
    if (beatBus) beatBus.gain.setTargetAtTime(beatLevel * BEAT_MAX_GAIN, c.currentTime, 0.3);
    updateBeatTimer();
  } catch {
    ctx = null;
    master = sfxBus = beatBus = null;
  }
}

/** 전체 음량(0~1)과 음소거. 갑자기 바뀌지 않도록 부드럽게 바꾼다. */
export function setAudioVolume(nextVolume: number, nextMuted: boolean): void {
  volume = clamp01(nextVolume);
  muted = nextMuted;
  if (!ctx || !master) return;
  master.gain.cancelScheduledValues(ctx.currentTime);
  master.gain.setTargetAtTime(masterTarget(), ctx.currentTime, 0.06);
}

/** 일시정지·탭 숨김·시작 화면에서 소리를 멈춘다. */
export function setAudioSuspended(suspended: boolean): void {
  wantSuspended = suspended;
  if (!ctx) return;
  if (suspended) nextBeat = -1;
  applyContextState();
  updateBeatTimer();
}

/** 심장박동 크기(0 = 무음 ~ 1). 화면의 박동(BEAT_EPOCH 기준)과 같은 박자로 '쿵-쿵' 울린다. */
export function setHeartbeatLevel(level: number): void {
  const next = clamp01(level);
  if (Math.abs(next - beatLevel) < 0.001) return;
  beatLevel = next;
  if (!ctx || !beatBus) return;
  beatBus.gain.cancelScheduledValues(ctx.currentTime);
  beatBus.gain.setTargetAtTime(beatLevel * BEAT_MAX_GAIN, ctx.currentTime, 0.35);
  updateBeatTimer();
}

/** 효과음 재생. 알 수 없는 이름이나 잠금 해제 전에는 아무것도 하지 않는다. */
export function playSfx(name: string): void {
  if (!isRunning() || !ctx || !sfxBus) return;
  const n = name as SfxName;
  const recipe = RECIPES[n];
  if (!recipe) return;
  const now = ctx.currentTime;
  const gap = MIN_GAP[n] ?? 0.03;
  const last = lastPlayed.get(n);
  if (last !== undefined && now - last < gap) return;
  if (voices >= MAX_VOICES) return;
  lastPlayed.set(n, now);
  try {
    recipe(ctx, sfxBus, now + 0.01);
  } catch {
    /* 효과음 오류가 게임을 멈추지 않게 한다 */
  }
}

/** 게임 이벤트 → 효과음 연결. 해제 함수를 돌려준다. */
export function connectAudioToGameEvents(): () => void {
  const off = onGameEvent((e) => playSfx(e));
  return () => {
    off();
  };
}

/** 디버깅용 상태 */
export function getAudioState(): { unlocked: boolean; suspended: boolean } {
  return {
    unlocked: !!ctx,
    suspended: ctx ? ctx.state !== 'running' || wantSuspended : true,
  };
}

// ─────────────────────────────────────────────────────────────
//  심장박동 스케줄러(미리 보기 방식: 오디오 시계로 정확한 시각에 예약)
// ─────────────────────────────────────────────────────────────

function updateBeatTimer(): void {
  const need = !!ctx && beatLevel > 0.001;
  if (need && !beatTimer) {
    nextBeat = -1;
    beatTimer = setInterval(beatTick, TICK_MS);
    beatTick();
  } else if (!need && beatTimer) {
    clearInterval(beatTimer);
    beatTimer = null;
    nextBeat = -1;
  }
}

/** performance.now() 기준 시각(ms) → 오디오 시계(초). 출력 지연까지 고려한다. */
function perfToCtxTime(c: AudioContext, perfMs: number): number {
  const nowPerf = performance.now();
  let base = c.currentTime;
  let basePerf = nowPerf;
  try {
    const ts = c.getOutputTimestamp?.();
    if (ts && ts.contextTime !== undefined && ts.performanceTime !== undefined && ts.performanceTime > 0) {
      base = ts.contextTime;
      basePerf = ts.performanceTime;
    } else {
      // 지금 예약한 소리는 (출력 지연)만큼 늦게 들리므로 그만큼 앞당긴다
      base = c.currentTime - (c.outputLatency || c.baseLatency || 0);
    }
  } catch {
    /* 무시 */
  }
  return base + (perfMs - basePerf) / 1000;
}

function beatTick(): void {
  const c = ctx;
  const bus = beatBus;
  if (!c || !bus || c.state !== 'running' || wantSuspended || typeof performance === 'undefined') {
    nextBeat = -1;
    return;
  }
  const nowPerf = performance.now();
  if (nextBeat < 0) nextBeat = Math.ceil((nowPerf - BEAT_EPOCH) / PERIOD_MS);
  const horizon = c.currentTime + LOOKAHEAD;
  let guard = 0;
  while (guard++ < 4) {
    const at = perfToCtxTime(c, BEAT_EPOCH + nextBeat * PERIOD_MS);
    if (at > horizon) break;
    if (at > c.currentTime + 0.005) {
      // '쿵'(심실 수축 시작, 박동 위상 0) — '쿵'(수축이 끝날 무렵, 위상 0.35)
      thump(c, bus, at, 1, 58, 40);
      thump(c, bus, at + BEAT_PERIOD * 0.35, 0.72, 72, 52);
    }
    nextBeat++;
  }
}

/** 부드러운 '쿵' 한 번 */
function thump(c: AudioContext, dest: AudioNode, t: number, amp: number, f0: number, f1: number): void {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.9 * amp, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
  g.connect(dest);

  const o1 = c.createOscillator();
  o1.type = 'sine';
  o1.frequency.setValueAtTime(f0, t);
  o1.frequency.exponentialRampToValueAtTime(f1, t + 0.16);
  o1.connect(g);

  // 노트북 스피커에서도 들리도록 조금 높은 배음(작게)
  const g2 = c.createGain();
  g2.gain.value = 0.32;
  g2.connect(g);
  const o2 = c.createOscillator();
  o2.type = 'triangle';
  o2.frequency.setValueAtTime(f0 * 2, t);
  o2.frequency.exponentialRampToValueAtTime(f1 * 2, t + 0.12);
  o2.connect(g2);

  voices += 2;
  const end = t + 0.24;
  let left = 2;
  const done = () => {
    voices = Math.max(0, voices - 1);
    if (--left > 0) return;
    o1.disconnect();
    o2.disconnect();
    g2.disconnect();
    g.disconnect();
  };
  o1.onended = done;
  o2.onended = done;
  o1.start(t);
  o2.start(t);
  o1.stop(end);
  o2.stop(end);
}

// ─────────────────────────────────────────────────────────────
//  효과음 재료
// ─────────────────────────────────────────────────────────────

interface ToneOpts {
  type?: OscillatorType;
  gain?: number;
  attack?: number;
  /** 끝 주파수(글리산도) */
  to?: number;
  detune?: number;
  /** 저역 통과 필터 주파수 */
  lowpass?: number;
}

function tone(c: AudioContext, dest: AudioNode, freq: number, t: number, dur: number, o: ToneOpts = {}): void {
  const osc = c.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
  if (o.detune) osc.detune.value = o.detune;

  const g = c.createGain();
  const peak = o.gain ?? 0.15;
  const atk = o.attack ?? 0.01;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + atk);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

  let filter: BiquadFilterNode | null = null;
  if (o.lowpass) {
    filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = o.lowpass;
    osc.connect(filter);
    filter.connect(g);
  } else {
    osc.connect(g);
  }
  g.connect(dest);

  voices++;
  osc.onended = () => {
    voices = Math.max(0, voices - 1);
    osc.disconnect();
    filter?.disconnect();
    g.disconnect();
  };
  osc.start(t);
  osc.stop(t + dur + 0.03);
}

/** 걸러 낸 잡음(바람 소리). from → to로 필터 주파수가 움직인다. */
function swoosh(c: AudioContext, dest: AudioNode, t: number, dur: number, from: number, to: number, peak: number): void {
  if (!noise) return;
  const src = c.createBufferSource();
  src.buffer = noise;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 0.9;
  bp.frequency.setValueAtTime(from, t);
  bp.frequency.exponentialRampToValueAtTime(to, t + dur * 0.6);
  bp.frequency.exponentialRampToValueAtTime(Math.max(120, to * 0.55), t + dur);

  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + dur * 0.4);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

  src.connect(bp);
  bp.connect(g);
  g.connect(dest);
  voices++;
  src.onended = () => {
    voices = Math.max(0, voices - 1);
    src.disconnect();
    bp.disconnect();
    g.disconnect();
  };
  const offset = Math.random() * Math.max(0, noise.duration - dur - 0.05);
  src.start(t, offset, dur + 0.02);
}

type Recipe = (c: AudioContext, out: AudioNode, t: number) => void;

const RECIPES: Record<SfxName, Recipe> = {
  // 짧고 부드러운 '톡'
  click: (c, out, t) => {
    tone(c, out, 1100, t, 0.05, { type: 'sine', gain: 0.09, attack: 0.003, to: 820 });
  },
  // 반짝: 두 음이 위로
  clue: (c, out, t) => {
    tone(c, out, 988, t, 0.22, { type: 'triangle', gain: 0.1, attack: 0.005 });
    tone(c, out, 1480, t + 0.07, 0.3, { type: 'sine', gain: 0.09, attack: 0.005 });
    tone(c, out, 1976, t + 0.12, 0.22, { type: 'sine', gain: 0.035, attack: 0.005 });
  },
  // 작은 종소리(완전5도)
  hint: (c, out, t) => {
    tone(c, out, 660, t, 0.55, { type: 'sine', gain: 0.1, attack: 0.008 });
    tone(c, out, 990, t + 0.01, 0.45, { type: 'sine', gain: 0.05, attack: 0.008 });
  },
  // 명랑한 아르페지오(도-미-솔-도)
  correct: (c, out, t) => {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => tone(c, out, f, t + i * 0.085, 0.32, { type: 'triangle', gain: 0.12, attack: 0.006 }));
    tone(c, out, 1318.5, t + 0.34, 0.4, { type: 'sine', gain: 0.05, attack: 0.01 });
  },
  // 부드럽게 내려가는 두 음(벌칙 느낌의 버저음 아님)
  wrong: (c, out, t) => {
    tone(c, out, 392, t, 0.28, { type: 'sine', gain: 0.09, attack: 0.03, lowpass: 1400 });
    tone(c, out, 329.63, t + 0.18, 0.38, { type: 'sine', gain: 0.08, attack: 0.03, lowpass: 1400 });
  },
  // 복습 문제 오답: 더 작고 짧게
  reviewWrong: (c, out, t) => {
    tone(c, out, 440, t, 0.22, { type: 'sine', gain: 0.06, attack: 0.02 });
    tone(c, out, 392, t + 0.13, 0.3, { type: 'sine', gain: 0.055, attack: 0.02 });
  },
  // 지도 갱신: 종이 스치는 소리 + 올라가는 반짝임
  mapUpdate: (c, out, t) => {
    swoosh(c, out, t, 0.28, 2200, 4200, 0.05);
    tone(c, out, 784, t + 0.08, 0.25, { type: 'triangle', gain: 0.08, attack: 0.005 });
    tone(c, out, 987.77, t + 0.16, 0.25, { type: 'triangle', gain: 0.08, attack: 0.005 });
    tone(c, out, 1174.66, t + 0.24, 0.4, { type: 'sine', gain: 0.08, attack: 0.005 });
  },
  // 출발점으로 돌아감: 부드럽게 미끄러져 내려간 뒤 따뜻한 음
  return: (c, out, t) => {
    tone(c, out, 880, t, 0.7, { type: 'sine', gain: 0.07, attack: 0.05, to: 330 });
    swoosh(c, out, t, 0.8, 1600, 400, 0.05);
    tone(c, out, 523.25, t + 0.72, 0.6, { type: 'triangle', gain: 0.08, attack: 0.02 });
    tone(c, out, 659.25, t + 0.72, 0.6, { type: 'sine', gain: 0.05, attack: 0.02 });
  },
  // 출발: 부드러운 바람 소리
  depart: (c, out, t) => {
    swoosh(c, out, t, 1.3, 260, 1300, 0.12);
    tone(c, out, 196, t, 0.9, { type: 'sine', gain: 0.04, attack: 0.25, to: 262 });
  },
  // 도착: 딩-동
  arrive: (c, out, t) => {
    tone(c, out, 1046.5, t, 0.6, { type: 'sine', gain: 0.09, attack: 0.006 });
    tone(c, out, 783.99, t + 0.22, 0.75, { type: 'sine', gain: 0.09, attack: 0.006 });
  },
  // 탈출: 축하 팡파르
  escape: (c, out, t) => {
    const run = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    run.forEach((f, i) => tone(c, out, f, t + i * 0.09, 0.3, { type: 'triangle', gain: 0.1, attack: 0.006 }));
    const chord = [523.25, 659.25, 783.99, 1046.5];
    chord.forEach((f) => tone(c, out, f, t + 0.55, 1.1, { type: 'triangle', gain: 0.065, attack: 0.02 }));
    swoosh(c, out, t + 0.5, 0.6, 3000, 6000, 0.03);
  },
  // 대화 넘김: 아주 작은 '틱'
  dialogue: (c, out, t) => {
    tone(c, out, 1700, t, 0.03, { type: 'sine', gain: 0.03, attack: 0.002 });
  },
  // 짧은 바람 소리
  whoosh: (c, out, t) => {
    swoosh(c, out, t, 0.55, 400, 2000, 0.08);
  },
};
