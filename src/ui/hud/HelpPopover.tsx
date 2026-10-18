// '?' 조작 방법 안내(작은 말풍선). 일시정지 메뉴에서도 같은 목록을 쓴다.

import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from '../controls/Icon';

export const CONTROL_HINTS: { keys: string[]; text: string }[] = [
  { keys: ['드래그'], text: '주변 둘러보기' },
  { keys: ['관찰 지점 누르기'], text: '단서 확대해서 보기' },
  { keys: ['←', '→'], text: '조향(A·D도 가능)' },
  { keys: ['Q', 'E'], text: '왼쪽·오른쪽 둘러보기' },
  { keys: ['R'], text: '시점 초기화' },
  { keys: ['M'], text: '지도 열기·닫기' },
  { keys: ['P'], text: '일시정지' },
  { keys: ['Space', 'Enter'], text: '대화 넘기기' },
  { keys: ['Esc'], text: '열린 창 닫기' },
];

export function ControlHintList() {
  return (
    <ul className="help-list">
      {CONTROL_HINTS.map((h) => (
        <li key={h.text}>
          <span className="help-keys">
            {h.keys.map((k) => (
              <kbd key={k} className="kbd">
                {k}
              </kbd>
            ))}
          </span>
          <span>{h.text}</span>
        </li>
      ))}
    </ul>
  );
}

export function HelpPopover({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();

  // 바깥을 누르면 닫는다
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  return (
    <div
      className={['help-wrap', className].filter(Boolean).join(' ')}
      ref={wrap}
      onKeyDown={(e) => {
        if (open && e.key === 'Escape') {
          e.stopPropagation();
          setOpen(false);
          button.current?.focus();
        }
      }}
    >
      <button
        ref={button}
        type="button"
        className="btn hud-btn"
        aria-label="조작 방법"
        title="조작 방법"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="help" />
      </button>
      {open && (
        <div id={id} className="help-pop panel" role="region" aria-label="조작 방법">
          <p className="help-title">조작 방법</p>
          <ControlHintList />
        </div>
      )}
    </div>
  );
}
