// 관찰 단서 목록(왼쪽, 좁은 화면에서는 위쪽). 관찰·추론 단계에서만 보인다.
// 안 본 단서: '관찰 지점 k · 제목' 버튼 → 카메라가 그 지점을 바라보며 단서를 확인한다.
// 본 단서: ✓ 제목 + 내용 전체.

import { useState } from 'react';
import { canInfer, observedCount } from '../../state/logic';
import { stepAt } from '../../state/selectors';
import { useApp } from '../../state/store';
import { Icon } from '../controls/Icon';
import { COMPACT_QUERY, useMediaQuery } from '../controls/useMediaQuery';
import './Observe.css';

/** 단서 목록 항목의 DOM id(단서 카드를 닫을 때 포커스를 돌려줄 곳) */
export function clueItemId(clueId: string): string {
  return `clue-item-${clueId}`;
}

export function ClueTray() {
  const game = useApp((s) => s.game);
  const focusClue = useApp((s) => s.focusClue);
  const openQuestion = useApp((s) => s.openQuestion);
  const compactScreen = useMediaQuery(COMPACT_QUERY);
  // 사용자가 직접 접거나 편 상태(단계·국면이 바뀌면 기본값으로 돌아간다)
  const [override, setOverride] = useState<{ key: string; open: boolean } | null>(null);

  if (!game || (game.phase !== 'observe' && game.phase !== 'question')) return null;
  const step = stepAt(game);
  const seen = game.observedClues[step.id] ?? [];
  const n = observedCount(game);
  const min = step.minClues;
  const ready = canInfer(game);
  const isReview = step.kind === 'review';

  const key = `${game.runId}|${step.id}|${game.phase}`;
  // 좁은 화면에서 추론 중에는 퀴즈가 아래를 차지하므로 목록을 기본으로 접는다.
  const defaultOpen = !(compactScreen && game.phase === 'question');
  const open = override?.key === key ? override.open : defaultOpen;
  const toggle = () => setOverride({ key, open: !open });

  return (
    <section className={`clue-tray panel${open ? '' : ' is-collapsed'}`} aria-labelledby="clue-tray-title">
      <div className="clue-tray-head">
        <h2 id="clue-tray-title" className="clue-tray-title">
          <Icon name="search" size={20} />
          관찰 단서{' '}
          <strong className={n >= min ? 'is-enough' : undefined}>
            {n}/{min}
          </strong>
          <span className="visually-hidden">{n >= min ? ' (추론할 수 있는 만큼 모았어요)' : ''}</span>
        </h2>
        <button
          type="button"
          className="btn btn-ghost btn-icon clue-tray-toggle"
          aria-expanded={open}
          aria-controls="clue-tray-body"
          aria-label={open ? '관찰 단서 목록 접기' : '관찰 단서 목록 펼치기'}
          onClick={toggle}
        >
          <Icon name={open ? 'up' : 'down'} />
        </button>
      </div>

      {isReview && (
        <p className="badge-bonus">
          <Icon name="star" size={16} filled />
          보너스 복습 · 오답 수에 영향 없음
        </p>
      )}

      <div id="clue-tray-body" className="clue-tray-body" hidden={!open}>
        <p className="clue-total">이곳의 관찰 지점 {step.clues.length}곳</p>
        <ol className="clue-list">
          {step.clues.map((c, i) => {
            const observed = seen.includes(c.id);
            if (!observed) {
              return (
                <li key={c.id} className="clue-item">
                  <button type="button" id={clueItemId(c.id)} className="btn clue-btn" onClick={() => focusClue(c.id)}>
                    <Icon name="eye" size={20} />
                    <span>
                      관찰 지점 {i + 1} · {c.title}
                    </span>
                  </button>
                </li>
              );
            }
            return (
              <li key={c.id} className="clue-item is-observed">
                <button
                  type="button"
                  id={clueItemId(c.id)}
                  className="clue-revisit"
                  onClick={() => focusClue(c.id)}
                  aria-label={`관찰 지점 ${i + 1} 다시 보기: ${c.title} (확인함)`}
                >
                  <span className="clue-check" aria-hidden="true">
                    <Icon name="check" size={18} />
                  </span>
                  <span className="clue-title">{c.title}</span>
                  <span className="clue-revisit-hint" aria-hidden="true">
                    다시 보기
                  </span>
                </button>
                <p className="clue-text">{c.text}</p>
              </li>
            );
          })}
        </ol>
        {game.phase === 'question' && <p className="clue-help">추론하는 중에도 단서를 다시 볼 수 있어요.</p>}
      </div>

      {game.phase === 'observe' && (
        <div className="clue-infer">
          <button
            type="button"
            className="btn btn-primary clue-infer-btn"
            disabled={!ready}
            aria-describedby="clue-infer-help"
            onClick={openQuestion}
          >
            <Icon name="hint" />
            추론하기
          </button>
          <p id="clue-infer-help" className="clue-help">
            {ready ? '단서가 모였어요! 위치와 근거를 골라 볼까요? ' : ''}단서를 {min}개 이상 확인하면 추론할 수 있어요
          </p>
        </div>
      )}
    </section>
  );
}
