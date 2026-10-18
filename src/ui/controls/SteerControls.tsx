// 화면 조향 버튼(◀ ▶). 누르고 있는 동안 runtime.steerInput = -1(왼쪽) / 1(오른쪽).
// 이동·관찰 중에만 보인다. 키보드로는 ←/→(A/D)를 쓰고, 버튼에 포커스가 있으면 Space/Enter를 누르는 동안 조향한다.

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { runtime } from '../../scene/runtime';
import { useApp } from '../../state/store';
import { Icon } from './Icon';
import './Controls.css';

export function SteerControls() {
  const phase = useApp((s) => s.game?.phase);
  const simplified = useApp((s) => s.simplified);
  if (simplified || (phase !== 'travel' && phase !== 'observe')) return null;
  return (
    <>
      <SteerButton dir={-1} />
      <SteerButton dir={1} />
    </>
  );
}

function SteerButton({ dir }: { dir: -1 | 1 }) {
  const [held, setHeld] = useState(false);
  const heldRef = useRef(false);

  const start = () => {
    heldRef.current = true;
    runtime.steerInput = dir;
    setHeld(true);
  };
  const stop = () => {
    if (!heldRef.current) return;
    heldRef.current = false;
    if (runtime.steerInput === dir) runtime.steerInput = 0;
    setHeld(false);
  };

  // 사라질 때 누르고 있던 조향을 풀어 준다
  useEffect(
    () => () => {
      if (heldRef.current && runtime.steerInput === dir) runtime.steerInput = 0;
      heldRef.current = false;
    },
    [dir],
  );

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    start();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (!e.repeat) start();
    }
  };
  const onKeyUp = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      stop();
    }
  };

  const left = dir < 0;
  return (
    <button
      type="button"
      className={`steer-btn ${left ? 'steer-left' : 'steer-right'}${held ? ' is-held' : ''}`}
      aria-label={left ? '왼쪽으로 조향 (← 또는 A)' : '오른쪽으로 조향 (→ 또는 D)'}
      aria-pressed={held}
      onPointerDown={onPointerDown}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
      onBlur={stop}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      <Icon name={left ? 'left' : 'right'} size={30} />
      <span className="steer-label" aria-hidden="true">
        {left ? '왼쪽' : '오른쪽'}
      </span>
    </button>
  );
}
