// 게임에서 일어난 일을 효과음·연출에 알리는 작은 이벤트 버스.

export type GameEvent =
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
  | 'dialogue';

type Listener = (e: GameEvent) => void;
const listeners = new Set<Listener>();

export function onGameEvent(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emitGameEvent(e: GameEvent): void {
  for (const fn of listeners) {
    try {
      fn(e);
    } catch {
      /* 효과음 오류가 게임을 멈추지 않게 한다 */
    }
  }
}
