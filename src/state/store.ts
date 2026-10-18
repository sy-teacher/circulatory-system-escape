// Zustand 스토어: 순수 규칙(logic.ts)을 감싸고, 바뀔 때마다 브라우저 저장소에 기록한다.
// 3D 프레임마다 이 스토어를 갱신하지 않는다(프레임 단위 값은 scene/runtime.ts 사용).

import { create } from 'zustand';
import { GAME_CONFIG } from '../data/config';
import type { NodeId } from '../data/types';
import * as L from './logic';
import { emitGameEvent } from './events';
import { Persistence, loadSettings, saveSettings, type ArchivedRecord, type Settings } from './persistence';
import type { GameState, LearningRecord } from './types';
import { getConcept } from '../data/concepts';

const rules: L.RuleOptions = { maxWrongPerRun: GAME_CONFIG.maxWrongPerRun };
const persistence = new Persistence();

function makeSessionId(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  } catch {
    /* 무시 */
  }
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export type Screen = 'title' | 'game';

export interface AppState {
  screen: Screen;
  game: GameState | null;
  savedRecord: LearningRecord | null;
  archive: ArchivedRecord[];
  storageOk: boolean;
  settings: Settings;
  /** WebGL 2를 쓸 수 없을 때의 간소화 학습 모드 */
  simplified: boolean;
  webgl2: boolean | null;

  paused: boolean;
  mapOpen: boolean;
  reportOpen: boolean;
  /** 결과 보고서를 지난 기록으로 볼 때 */
  reportRecord: LearningRecord | null;
  settingsOpen: boolean;
  dialogueCollapsed: boolean;
  quizCollapsed: boolean;
  /** 확대 관찰 중인 단서(카메라가 이 지점을 바라본다) */
  focusedClueId: string | null;
  /** 탭이 보이지 않을 때 */
  hidden: boolean;

  startNew(): void;
  resume(): void;
  goTitle(): void;
  clearRecords(): void;
  setWebgl(ok: boolean): void;
  setSimplified(v: boolean): void;

  advanceDialogue(): void;
  skipDialogue(): void;
  arrive(): void;
  passRemembered(): void;
  observeClue(clueId: string): void;
  focusClue(clueId: string | null): void;
  openQuestion(): void;
  backToObserve(): void;
  revealHint(questionId: string): void;
  submitAnswer(sub: L.Submission): void;
  continueAfterFeedback(): void;
  submitActivity(pulmonary: NodeId[], systemic: NodeId[]): void;
  finishActivity(): void;
  answerRecheck(conceptId: string, answer: boolean): void;
  nextRecheck(): void;

  setSettings(patch: Partial<Settings>): void;
  setPaused(v: boolean): void;
  setMapOpen(v: boolean): void;
  openReport(record?: LearningRecord | null): void;
  closeReport(): void;
  setSettingsOpen(v: boolean): void;
  setDialogueCollapsed(v: boolean): void;
  setQuizCollapsed(v: boolean): void;
  setHidden(v: boolean): void;
}

function persist(game: GameState | null) {
  if (!game) return;
  persistence.save(L.toRecord(game));
}

export const useApp = create<AppState>((set, get) => {
  /** 게임 상태 갱신 + 저장 + 이벤트 */
  const apply = (fn: (g: GameState) => GameState, events?: (prev: GameState, next: GameState) => void) => {
    const prev = get().game;
    if (!prev) return;
    const next = fn(prev);
    if (next === prev) return;
    set({ game: next, savedRecord: L.toRecord(next) });
    persist(next);
    events?.(prev, next);
  };

  const initialSaved = persistence.loadCurrent();

  return {
    screen: 'title',
    game: null,
    savedRecord: initialSaved,
    archive: persistence.loadArchive(),
    storageOk: persistence.available,
    settings: loadSettings(),
    simplified: false,
    webgl2: null,

    paused: false,
    mapOpen: false,
    reportOpen: false,
    reportRecord: null,
    settingsOpen: false,
    dialogueCollapsed: false,
    quizCollapsed: false,
    focusedClueId: null,
    hidden: false,

    startNew() {
      const now = Date.now();
      const prev = get().savedRecord;
      let archive = get().archive;
      if (prev) {
        // 저장소에 보관하고, 저장소를 쓸 수 없으면 이번 세션 동안 메모리에 보관한다(기록을 버리지 않음)
        const stored = persistence.available && persistence.archiveCurrent(now);
        archive = stored
          ? persistence.loadArchive()
          : [{ archivedAt: now, record: prev }, ...archive].slice(0, GAME_CONFIG.archiveLimit);
      }
      const game = L.newGame(makeSessionId(), now);
      persist(game);
      set({
        screen: 'game',
        game,
        savedRecord: L.toRecord(game),
        archive,
        paused: false,
        mapOpen: false,
        reportOpen: false,
        dialogueCollapsed: false,
        quizCollapsed: false,
        focusedClueId: null,
      });
      emitGameEvent('click');
    },

    resume() {
      const saved = get().savedRecord;
      if (!saved) return;
      const game = L.resumeGame(saved, rules);
      set({ screen: 'game', game, paused: false, mapOpen: false, reportOpen: false, focusedClueId: null });
      emitGameEvent('click');
    },

    goTitle() {
      const g = get().game;
      if (g) persist(g);
      set({ screen: 'title', game: null, paused: false, mapOpen: false, reportOpen: false, settingsOpen: false, focusedClueId: null, savedRecord: persistence.loadCurrent() ?? (g ? L.toRecord(g) : null) });
    },

    clearRecords() {
      persistence.clearAll();
      set({ savedRecord: null, archive: [], game: null, screen: 'title', reportOpen: false, reportRecord: null });
    },

    setWebgl(ok) {
      set({ webgl2: ok, simplified: !ok ? get().simplified : false });
    },
    setSimplified(v) {
      set({ simplified: v });
    },

    advanceDialogue() {
      apply((g) => L.advanceDialogue(g, rules, Date.now()), (p, n) => {
        if (n.phase === 'travel' && p.phase !== 'travel') emitGameEvent('depart');
        else if (n.phase === 'escape' && p.phase !== 'escape') emitGameEvent('escape');
        else emitGameEvent('dialogue');
      });
    },
    skipDialogue() {
      apply((g) => L.skipDialogue(g, rules, Date.now()), (p, n) => {
        if (n.phase === 'travel' && p.phase !== 'travel') emitGameEvent('depart');
      });
    },
    arrive() {
      apply((g) => L.arrive(g, Date.now()), () => emitGameEvent('arrive'));
      set({ focusedClueId: null });
    },
    passRemembered() {
      apply((g) => L.passRemembered(g, Date.now()), () => emitGameEvent('depart'));
    },
    observeClue(clueId) {
      apply((g) => L.observeClue(g, clueId, Date.now()), () => emitGameEvent('clue'));
    },
    focusClue(clueId) {
      set({ focusedClueId: clueId });
      if (clueId) get().observeClue(clueId);
    },
    openQuestion() {
      apply((g) => L.openQuestion(g, Date.now()), () => emitGameEvent('click'));
      set({ quizCollapsed: false, focusedClueId: null });
    },
    backToObserve() {
      apply((g) => L.backToObserve(g, Date.now()), () => emitGameEvent('click'));
    },
    revealHint(questionId) {
      apply((g) => L.revealHint(g, questionId, Date.now()), () => emitGameEvent('hint'));
    },
    submitAnswer(sub) {
      apply((g) => L.submitAnswer(g, sub, Date.now(), rules), (p, n) => {
        const fb = n.feedback;
        if (!fb) return;
        if (fb.isCorrect) {
          emitGameEvent('correct');
          if (n.discovered.length > p.discovered.length) setTimeout(() => emitGameEvent('mapUpdate'), 600);
        } else emitGameEvent(fb.kind === 'review' ? 'reviewWrong' : 'wrong');
      });
      set({ focusedClueId: null, quizCollapsed: false });
    },
    continueAfterFeedback() {
      apply((g) => L.continueAfterFeedback(g, rules, Date.now()), (_p, n) => {
        if (n.phase === 'returning') emitGameEvent('return');
        else if (n.phase === 'travel') emitGameEvent('depart');
        else emitGameEvent('click');
      });
    },
    submitActivity(pulmonary, systemic) {
      apply((g) => L.submitActivity(g, pulmonary, systemic, Date.now()), (_p, n) => {
        emitGameEvent(n.activitySolved ? 'correct' : 'reviewWrong');
      });
    },
    finishActivity() {
      apply((g) => L.finishActivity(g, Date.now()), () => emitGameEvent('click'));
    },
    answerRecheck(conceptId, answer) {
      const c = getConcept(conceptId);
      apply((g) => L.answerRecheck(g, conceptId, answer, c.recheck.answer, Date.now()), (_p, n) => {
        emitGameEvent(n.recheck[conceptId]?.correct ? 'correct' : 'reviewWrong');
      });
    },
    nextRecheck() {
      apply((g) => L.nextRecheck(g, Date.now()), (_p, n) => {
        if (n.phase === 'escape') emitGameEvent('escape');
        else emitGameEvent('click');
      });
    },

    setSettings(patch) {
      const settings = { ...get().settings, ...patch };
      saveSettings(settings);
      set({ settings });
    },
    setPaused(v) {
      set({ paused: v });
    },
    setMapOpen(v) {
      set({ mapOpen: v });
    },
    openReport(record) {
      set({ reportOpen: true, reportRecord: record ?? null });
    },
    closeReport() {
      set({ reportOpen: false, reportRecord: null });
    },
    setSettingsOpen(v) {
      set({ settingsOpen: v });
    },
    setDialogueCollapsed(v) {
      set({ dialogueCollapsed: v });
    },
    setQuizCollapsed(v) {
      set({ quizCollapsed: v });
    },
    setHidden(v) {
      set({ hidden: v });
    },
  };
});

/** 3D 렌더링을 멈춰야 하는지(일시정지, 탭 숨김) */
export function isFrozen(s: Pick<AppState, 'paused' | 'hidden'>): boolean {
  return s.paused || s.hidden;
}

// 개발 서버에서만: 자동 검증(E2E) 스크립트가 상태를 읽을 수 있게 노출한다(프로덕션 빌드에는 포함되지 않음).
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as { __app?: typeof useApp }).__app = useApp;
}
