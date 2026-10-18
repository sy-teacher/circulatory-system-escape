// 브라우저 저장소(src/state/persistence.ts) 자동 검증. 메모리 저장소로 localStorage를 대신한다.

import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../data/config';
import * as L from '../state/logic';
import {
  Persistence,
  defaultSettings,
  isValidRecord,
  loadSettings,
  saveSettings,
  type KeyValueStorage,
  type Settings,
} from '../state/persistence';
import type { LearningRecord } from '../state/types';

class MemoryStorage implements KeyValueStorage {
  map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

/** 저장 공간이 가득 찬 저장소(쓰기만 실패) */
class FullStorage extends MemoryStorage {
  override setItem(): void {
    throw new Error('QuotaExceededError');
  }
}

/** 모든 동작이 실패하는 저장소(개인 정보 보호 모드 등) */
class BrokenStorage implements KeyValueStorage {
  getItem(): string | null {
    throw new Error('SecurityError');
  }
  setItem(): void {
    throw new Error('SecurityError');
  }
  removeItem(): void {
    throw new Error('SecurityError');
  }
}

const KEY = GAME_CONFIG.storageKey;
const SETTINGS_KEY = `${GAME_CONFIG.storageKey}/settings`;

/** 실제 규칙으로 만든 진행 중 기록 */
function sampleRecord(sessionId = 'persist', steps = 2): LearningRecord {
  let g = L.newGame(sessionId, 100);
  for (let guard = 0; g.dialogue && guard < 50; guard++) g = L.advanceDialogue(g, undefined, 200);
  for (let i = 0; i < steps; i++) {
    const step = L.currentStep(g);
    for (const c of step.clues) g = L.observeClue(g, c.id, 300);
    g = L.openQuestion(g, 301);
    const wrong = { questionId: step.questionId, answerId: 'x', reasonId: 'y' };
    expect(L.submitAnswer(g, wrong, 302)).toBe(g);
    g = L.revealHint(g, step.questionId, 303);
    g = L.submitAnswer(g, { questionId: step.questionId, ...correctIds(step.questionId) }, 304);
    g = L.continueAfterFeedback(g, undefined, 305);
    for (let guard = 0; g.dialogue && guard < 50; guard++) g = L.advanceDialogue(g, undefined, 306);
    if (g.phase === 'travel') g = L.arrive(g, 307);
    for (let guard = 0; g.dialogue && guard < 50; guard++) g = L.advanceDialogue(g, undefined, 308);
  }
  return L.toRecord(g);
}

function correctIds(questionId: string) {
  // 첫 단계는 좌심실 문항, 두 번째는 적혈구 문항
  const table: Record<string, { answerId: string; reasonId: string }> = {
    'q-s1': { answerId: 's1-a-lv-aorta', reasonId: 's1-r-force' },
    'q-r1': { answerId: 'r1-a-rbc', reasonId: 'r1-r-o2' },
  };
  return table[questionId];
}

describe('학습 기록 저장·불러오기', () => {
  it('저장한 기록을 그대로 다시 불러온다(새 인스턴스에서도)', () => {
    const storage = new MemoryStorage();
    const p = new Persistence(storage);
    expect(p.available).toBe(true);
    expect(p.loadCurrent()).toBeNull();
    const rec = sampleRecord();
    expect(rec.responses.length).toBeGreaterThan(0);
    expect(p.save(rec)).toBe(true);
    expect(p.loadCurrent()).toEqual(rec);
    expect(new Persistence(storage).loadCurrent()).toEqual(rec);
    expect([...storage.map.keys()]).toEqual([KEY]);
    // 불러온 기록으로 이어하기가 가능하다
    const resumed = L.resumeGame(new Persistence(storage).loadCurrent()!);
    expect(resumed.phase).toBe('travel');
    expect(resumed.responses).toEqual(rec.responses);
  });

  it('다른 키를 쓰면 기록이 분리된다', () => {
    const storage = new MemoryStorage();
    const a = new Persistence(storage, 'a');
    const b = new Persistence(storage, 'b');
    a.save(sampleRecord('A'));
    expect(b.loadCurrent()).toBeNull();
    expect(a.loadCurrent()?.sessionId).toBe('A');
  });

  it('손상된 JSON·이상한 모양의 기록은 예외 없이 null로 처리한다', () => {
    const good = sampleRecord();
    const bad: unknown[] = [
      '{not json',
      'null',
      '5',
      '"text"',
      '[]',
      JSON.stringify({ current: { ...good, version: 2 } }),
      JSON.stringify({ current: { ...good, sessionId: 7 } }),
      JSON.stringify({ current: { ...good, responses: null } }),
      JSON.stringify({ current: { ...good, firstResponses: null } }),
      JSON.stringify({ current: { ...good, latest: null } }),
      JSON.stringify({ current: { ...good, observedClues: undefined } }),
      JSON.stringify({ current: { ...good, hintsRevealed: 'x' } }),
      JSON.stringify({ current: { ...good, activityAttempts: {} } }),
      JSON.stringify({ current: { ...good, discovered: 'lv' } }),
    ];
    for (const raw of bad) {
      const storage = new MemoryStorage();
      storage.setItem(KEY, raw as string);
      const p = new Persistence(storage);
      expect(() => p.loadCurrent()).not.toThrow();
      expect(p.loadCurrent(), String(raw).slice(0, 60)).toBeNull();
      expect(p.loadArchive()).toEqual([]);
      // 손상된 기록 위에 새로 저장할 수 있다
      expect(p.save(good)).toBe(true);
      expect(p.loadCurrent()).toEqual(good);
    }
  });

  it('isValidRecord는 정상 기록을 받아들이고 필수 필드가 빠진 기록을 거부한다', () => {
    const good = sampleRecord();
    expect(isValidRecord(good)).toBe(true);
    expect(isValidRecord(JSON.parse(JSON.stringify(good)))).toBe(true);
    expect(isValidRecord(L.createRecord('fresh', 0))).toBe(true);
    expect(isValidRecord(null)).toBe(false);
    expect(isValidRecord([])).toBe(false);
    for (const k of Object.keys(good) as (keyof LearningRecord)[]) {
      if (k === 'escapedAt') continue;
      const copy: Record<string, unknown> = { ...good };
      delete copy[k];
      expect(isValidRecord(copy), `${k} 누락`).toBe(false);
    }
  });

  it('쓰기에 실패하는 저장소에서도 save는 false를 돌려줄 뿐 예외를 내지 않는다', () => {
    const full = new FullStorage();
    const p = new Persistence(full);
    expect(p.available).toBe(true);
    expect(() => p.save(sampleRecord())).not.toThrow();
    expect(p.save(sampleRecord())).toBe(false);
    // 기존 기록이 있으면 보관(archive) 쓰기도 실패를 알린다
    full.map.set(KEY, JSON.stringify({ current: sampleRecord(), archive: [] }));
    expect(p.archiveCurrent(1)).toBe(false);
    expect(p.loadCurrent()).not.toBeNull();
    expect(p.clearAll()).toBe(true);

    const broken = new Persistence(new BrokenStorage());
    expect(broken.save(sampleRecord())).toBe(false);
    expect(broken.loadCurrent()).toBeNull();
    expect(broken.loadArchive()).toEqual([]);
    expect(broken.archiveCurrent(1)).toBe(true); // 보관할 기록이 없음
    expect(broken.clearAll()).toBe(false);
  });

  it('저장소를 쓸 수 없으면(null) available false이고 모든 호출이 안전하다', () => {
    const p = new Persistence(null);
    expect(p.available).toBe(false);
    expect(p.loadCurrent()).toBeNull();
    expect(p.loadArchive()).toEqual([]);
    expect(p.save(sampleRecord())).toBe(false);
    expect(() => p.archiveCurrent(1)).not.toThrow();
    expect(p.clearAll()).toBe(false);
    // 브라우저가 아닌 환경(테스트)의 기본 저장소도 '사용 불가'로 처리된다
    expect(new Persistence().available).toBe(false);
  });
});

describe('지난 기록 보관과 삭제', () => {
  it('새 탐험을 시작할 때 현재 기록을 최신순으로 보관하고, 보관 수 제한을 지킨다', () => {
    const storage = new MemoryStorage();
    const p = new Persistence(storage);
    expect(p.archiveCurrent(0)).toBe(true); // 현재 기록이 없으면 아무것도 하지 않음
    expect(p.loadArchive()).toEqual([]);

    const total = GAME_CONFIG.archiveLimit + 2;
    for (let i = 0; i < total; i++) {
      expect(p.save(sampleRecord(`run-${i}`, 1))).toBe(true);
      expect(p.archiveCurrent(1000 + i)).toBe(true);
      expect(p.loadCurrent()).toBeNull();
    }
    const archive = p.loadArchive();
    expect(archive).toHaveLength(GAME_CONFIG.archiveLimit);
    expect(archive.map((a) => a.record.sessionId)).toEqual(
      Array.from({ length: GAME_CONFIG.archiveLimit }, (_, k) => `run-${total - 1 - k}`),
    );
    expect(archive[0].archivedAt).toBe(1000 + total - 1);

    // 저장해도 보관 기록은 유지된다
    p.save(sampleRecord('now', 1));
    expect(p.loadArchive()).toHaveLength(GAME_CONFIG.archiveLimit);
    expect(p.loadCurrent()?.sessionId).toBe('now');
  });

  it('보관 목록의 손상된 항목은 걸러 낸다', () => {
    const storage = new MemoryStorage();
    const good = sampleRecord('ok', 1);
    storage.setItem(KEY, JSON.stringify({ current: null, archive: [null, { archivedAt: 1 }, { archivedAt: 2, record: { version: 1 } }, { archivedAt: 3, record: good }] }));
    const archive = new Persistence(storage).loadArchive();
    expect(archive).toEqual([{ archivedAt: 3, record: good }]);
  });

  it('clearAll은 현재 기록과 보관 기록을 모두 지운다(설정은 따로 유지)', () => {
    const storage = new MemoryStorage();
    const p = new Persistence(storage);
    p.save(sampleRecord('a', 1));
    p.archiveCurrent(1);
    p.save(sampleRecord('b', 1));
    saveSettings({ ...defaultSettings(), muted: true }, storage);
    expect(p.clearAll()).toBe(true);
    expect(p.loadCurrent()).toBeNull();
    expect(p.loadArchive()).toEqual([]);
    expect(storage.map.has(KEY)).toBe(false);
    expect(loadSettings(storage).muted).toBe(true);
  });
});

describe('설정 저장', () => {
  it('저장소가 없으면 기본값', () => {
    const d = defaultSettings();
    expect(d).toEqual({ volume: 0.6, muted: false, reduceMotion: false, lowSpec: false, largeText: false });
    expect(loadSettings(null)).toEqual(d);
    expect(() => saveSettings(d, null)).not.toThrow();
    expect(loadSettings(new MemoryStorage())).toEqual(d);
  });

  it('저장한 설정을 다시 불러오고, 기록 키와 분리되어 있다', () => {
    const storage = new MemoryStorage();
    const s: Settings = { volume: 0.25, muted: true, reduceMotion: true, lowSpec: true, largeText: true };
    saveSettings(s, storage);
    expect([...storage.map.keys()]).toEqual([SETTINGS_KEY]);
    expect(loadSettings(storage)).toEqual(s);
    expect(new Persistence(storage).loadCurrent()).toBeNull();
  });

  it('잘못된 값은 항목별로 기본값으로, 음량은 0~1로 맞춘다', () => {
    const storage = new MemoryStorage();
    const d = defaultSettings();
    storage.setItem(SETTINGS_KEY, JSON.stringify({ volume: 'loud', muted: 'yes', reduceMotion: 1, lowSpec: null, largeText: true }));
    expect(loadSettings(storage)).toEqual({ ...d, largeText: true });
    storage.setItem(SETTINGS_KEY, JSON.stringify({ volume: 7 }));
    expect(loadSettings(storage).volume).toBe(1);
    storage.setItem(SETTINGS_KEY, JSON.stringify({ volume: -3 }));
    expect(loadSettings(storage).volume).toBe(0);
    for (const raw of ['{oops', 'null', '42', '[]']) {
      storage.setItem(SETTINGS_KEY, raw);
      expect(() => loadSettings(storage)).not.toThrow();
      expect(loadSettings(storage)).toEqual(d);
    }
  });

  it('저장소 오류가 나도 예외 없이 기본값을 쓰고 저장 실패를 무시한다', () => {
    expect(() => saveSettings(defaultSettings(), new FullStorage())).not.toThrow();
    expect(() => saveSettings(defaultSettings(), new BrokenStorage())).not.toThrow();
    expect(loadSettings(new BrokenStorage())).toEqual(defaultSettings());
  });
});
