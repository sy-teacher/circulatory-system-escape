import { describe, expect, it } from 'vitest';
import { ROUTE } from '../data/route';
import { getQuestion } from '../data/questions';
import * as L from '../state/logic';
import type { GameState } from '../state/types';
import { buildReport } from '../report/buildReport';

/** 대화가 끝날 때까지 넘기기 */
function drainDialogue(g: GameState): GameState {
  let guard = 0;
  while (g.dialogue && guard++ < 50) g = L.advanceDialogue(g, undefined, 1);
  return g;
}

function solveCurrent(g: GameState, now: number): GameState {
  const step = ROUTE[g.stepIndex];
  const q = getQuestion(step.questionId);
  for (const c of step.clues) g = L.observeClue(g, c.id, now);
  g = L.openQuestion(g, now);
  expect(g.phase).toBe('question');
  g = L.submitAnswer(g, { questionId: q.id, answerId: q.correctAnswer, reasonId: q.correctReason }, now);
  expect(g.feedback?.isCorrect).toBe(true);
  return L.continueAfterFeedback(g, undefined, now);
}

describe('전체 흐름 스모크', () => {
  it('시작부터 탈출까지 진행된다', () => {
    let g = L.newGame('test', 0);
    g = drainDialogue(g);
    expect(g.phase).toBe('observe');
    expect(g.stepIndex).toBe(0);
    for (let i = 0; i < ROUTE.length; i++) {
      g = solveCurrent(g, 10 + i);
      g = drainDialogue(g);
      if (g.phase === 'travel') {
        g = L.arrive(g, 100 + i);
        g = drainDialogue(g);
      }
    }
    expect(g.phase).toBe('activity');
    g = L.submitActivity(g, ['rv', 'pa', 'lungCap', 'pv', 'la'], ['lv', 'aorta', 'sysCap', 'venaCava', 'ra'], 500);
    expect(g.activitySolved).toBe(true);
    g = L.finishActivity(g, 501);
    g = drainDialogue(g);
    expect(g.phase).toBe('escape');
    expect(g.escaped).toBe(true);
    const r = buildReport(L.toRecord(g), 600);
    expect(r.title).toBe('탈출 성공');
    expect(r.core.solved).toBe(10);
    expect(r.core['first-correct']).toBe(10);
  });
});
