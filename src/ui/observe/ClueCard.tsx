// 확대 관찰 카드(화면 위쪽 가운데, 좁은 화면에서는 아래쪽). 화면 가운데를 가리지 않는 작은 카드.
// '확인' 또는 Esc(키보드 훅)로 닫는다.

import { useEffect, useRef } from 'react';
import type { Clue } from '../../data/types';
import { stepAt } from '../../state/selectors';
import { useApp } from '../../state/store';
import { Icon } from '../controls/Icon';
import { clueItemId } from './ClueTray';
import './Observe.css';

export function ClueCard() {
  const game = useApp((s) => s.game);
  const focusedClueId = useApp((s) => s.focusedClueId);
  if (!game || !focusedClueId || (game.phase !== 'observe' && game.phase !== 'question')) return null;
  const step = stepAt(game);
  const index = step.clues.findIndex((c) => c.id === focusedClueId);
  if (index < 0) return null;
  return <ClueCardInner key={focusedClueId} clue={step.clues[index]} index={index} />;
}

function ClueCardInner({ clue, index }: { clue: Clue; index: number }) {
  const focusClue = useApp((s) => s.focusClue);
  const okRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const opener = document.activeElement;
    okRef.current?.focus({ preventScroll: true });
    return () => {
      // 카드가 닫히며 포커스를 잃었으면(키보드 사용) 단서 목록의 같은 항목으로 돌려준다.
      const active = document.activeElement;
      if (active && active !== document.body) return;
      const target = document.getElementById(clueItemId(clue.id)) ?? (opener instanceof HTMLElement && opener.isConnected ? opener : null);
      target?.focus();
    };
  }, [clue.id]);

  return (
    <aside className="clue-card panel" role="dialog" aria-modal="false" aria-labelledby="clue-card-title" aria-describedby="clue-card-text">
      <p className="clue-card-kicker">
        <Icon name="search" size={18} />
        관찰 지점 {index + 1}
      </p>
      <h3 id="clue-card-title" className="clue-card-title">
        {clue.title}
      </h3>
      <p id="clue-card-text" className="clue-card-text">
        {clue.text}
      </p>
      <div className="clue-card-actions">
        <span className="clue-card-saved">
          <Icon name="check" size={18} />
          단서 목록에 기록했어요
        </span>
        <button ref={okRef} type="button" className="btn btn-primary" onClick={() => focusClue(null)}>
          확인
        </button>
      </div>
    </aside>
  );
}
