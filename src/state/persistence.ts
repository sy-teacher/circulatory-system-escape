// 브라우저 저장소(localStorage) 사용. 저장소를 쓸 수 없어도 게임은 계속 진행된다.
// 개인 정보는 서버로 전송하지 않는다(이 파일 외에 네트워크 전송 코드가 없다).

import { GAME_CONFIG } from '../data/config';
import type { LearningRecord } from './types';

export interface ArchivedRecord {
  archivedAt: number;
  record: LearningRecord;
}

interface StoredShape {
  current: LearningRecord | null;
  archive: ArchivedRecord[];
}

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultStorage(): KeyValueStorage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const probe = '__circulation_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

export function isValidRecord(r: unknown): r is LearningRecord {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return false;
  const x = r as Partial<LearningRecord>;
  // null·배열을 객체로 잘못 받아들이지 않는다(이어하기 중 오류 방지)
  const isObj = (v: unknown) => !!v && typeof v === 'object' && !Array.isArray(v);
  const isNum = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  return (
    x.version === 1 &&
    typeof x.sessionId === 'string' &&
    isNum(x.startedAt) &&
    isNum(x.updatedAt) &&
    isNum(x.runId) &&
    isNum(x.restartCount) &&
    isNum(x.runWrong) &&
    typeof x.pendingReturn === 'boolean' &&
    isNum(x.stepIndex) &&
    typeof x.phase === 'string' &&
    typeof x.introDone === 'boolean' &&
    Array.isArray(x.responses) &&
    isObj(x.firstResponses) &&
    isObj(x.latest) &&
    isObj(x.hintsRevealed) &&
    Array.isArray(x.hintLog) &&
    isObj(x.observedClues) &&
    Array.isArray(x.discovered) &&
    typeof x.flagPlanted === 'boolean' &&
    Array.isArray(x.activityAttempts) &&
    typeof x.activitySolved === 'boolean' &&
    isObj(x.recheck) &&
    Array.isArray(x.returnLog) &&
    typeof x.escaped === 'boolean'
  );
}

export class Persistence {
  private storage: KeyValueStorage | null;
  private key: string;

  constructor(storage: KeyValueStorage | null = defaultStorage(), key: string = GAME_CONFIG.storageKey) {
    this.storage = storage;
    this.key = key;
  }

  get available(): boolean {
    return this.storage !== null;
  }

  private read(): StoredShape {
    const empty: StoredShape = { current: null, archive: [] };
    if (!this.storage) return empty;
    try {
      const raw = this.storage.getItem(this.key);
      if (!raw) return empty;
      const parsed = JSON.parse(raw) as Partial<StoredShape>;
      return {
        current: isValidRecord(parsed.current) ? parsed.current : null,
        archive: Array.isArray(parsed.archive) ? parsed.archive.filter((a) => a && isValidRecord(a.record)) : [],
      };
    } catch {
      return empty;
    }
  }

  private write(data: StoredShape): boolean {
    if (!this.storage) return false;
    try {
      this.storage.setItem(this.key, JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  }

  loadCurrent(): LearningRecord | null {
    return this.read().current;
  }

  loadArchive(): ArchivedRecord[] {
    return this.read().archive;
  }

  save(record: LearningRecord): boolean {
    const data = this.read();
    return this.write({ ...data, current: record });
  }

  /** 새 탐험을 시작할 때 현재 기록을 '지난 기록'으로 보관한다(삭제하지 않음). */
  archiveCurrent(now: number): boolean {
    const data = this.read();
    if (!data.current) return true;
    const archive = [{ archivedAt: now, record: data.current }, ...data.archive].slice(0, GAME_CONFIG.archiveLimit);
    return this.write({ current: null, archive });
  }

  /** 명시적 '기록 삭제' 동작에서만 호출한다. */
  clearAll(): boolean {
    if (!this.storage) return false;
    try {
      this.storage.removeItem(this.key);
      return true;
    } catch {
      return false;
    }
  }
}

export interface Settings {
  volume: number;
  muted: boolean;
  reduceMotion: boolean;
  lowSpec: boolean;
  largeText: boolean;
}

const SETTINGS_KEY = GAME_CONFIG.storageKey + '/settings';

export function defaultSettings(): Settings {
  let reduce = false;
  try {
    reduce = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  } catch {
    reduce = false;
  }
  return { volume: 0.6, muted: false, reduceMotion: reduce, lowSpec: false, largeText: false };
}

export function loadSettings(storage: KeyValueStorage | null = defaultStorage()): Settings {
  const d = defaultSettings();
  if (!storage) return d;
  try {
    const raw = storage.getItem(SETTINGS_KEY);
    if (!raw) return d;
    const s = JSON.parse(raw) as Partial<Settings>;
    return {
      volume: typeof s.volume === 'number' ? Math.min(1, Math.max(0, s.volume)) : d.volume,
      muted: typeof s.muted === 'boolean' ? s.muted : d.muted,
      reduceMotion: typeof s.reduceMotion === 'boolean' ? s.reduceMotion : d.reduceMotion,
      lowSpec: typeof s.lowSpec === 'boolean' ? s.lowSpec : d.lowSpec,
      largeText: typeof s.largeText === 'boolean' ? s.largeText : d.largeText,
    };
  } catch {
    return d;
  }
}

export function saveSettings(s: Settings, storage: KeyValueStorage | null = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* 저장 실패해도 게임은 계속 */
  }
}
