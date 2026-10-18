// 일시정지 메뉴(모달). 포커스가 메뉴 안에서만 돈다. Esc는 키보드 훅이 처리(계속하기).
// 지도·설정·보고서가 위에 열리면 잠시 숨겼다가, 닫히면 다시 보인다(여전히 일시정지 상태).

import { useEffect, useRef, type KeyboardEvent } from 'react';
import { useApp } from '../../state/store';
import { ControlHintList } from '../hud/HelpPopover';
import { Icon } from './Icon';
import './Controls.css';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

export function PauseMenu() {
  const paused = useApp((s) => s.paused);
  const covered = useApp((s) => s.mapOpen || s.settingsOpen || s.reportOpen);
  if (!paused || covered) return null;
  return <PauseDialog />;
}

function PauseDialog() {
  const setPaused = useApp((s) => s.setPaused);
  const setSettingsOpen = useApp((s) => s.setSettingsOpen);
  const setMapOpen = useApp((s) => s.setMapOpen);
  const openReport = useApp((s) => s.openReport);
  const goTitle = useApp((s) => s.goTitle);
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const opener = document.activeElement;
    firstRef.current?.focus();
    return () => {
      const active = document.activeElement;
      if ((!active || active === document.body) && opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

  // Tab 순환(포커스 가두기)
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !dialogRef.current) return;
    const items = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="modal-backdrop pause-backdrop">
      <div ref={dialogRef} className="pause panel" role="dialog" aria-modal="true" aria-labelledby="pause-title" onKeyDown={onKeyDown}>
        <h2 id="pause-title" className="pause-title">
          <Icon name="pause" />
          일시정지
        </h2>
        <p className="pause-text">탐험이 잠시 멈췄어요. 진행 상황과 학습 기록은 자동으로 저장돼요.</p>
        <div className="pause-actions">
          <button ref={firstRef} type="button" className="btn btn-primary" onClick={() => setPaused(false)}>
            <Icon name="play" filled />
            계속하기
          </button>
          <button type="button" className="btn" onClick={() => setSettingsOpen(true)}>
            <Icon name="settings" />
            설정
          </button>
          <button type="button" className="btn" onClick={() => setMapOpen(true)}>
            <Icon name="map" />
            지도
          </button>
          <button type="button" className="btn" onClick={() => openReport()}>
            <Icon name="report" />
            지금까지 결과 보기
          </button>
          <button type="button" className="btn btn-ghost" onClick={goTitle}>
            <Icon name="home" />
            처음 화면으로
          </button>
        </div>
        <details className="pause-help">
          <summary>조작 방법 보기</summary>
          <ControlHintList />
        </details>
        <p className="pause-hint">
          <kbd className="kbd">Esc</kbd> 또는 <kbd className="kbd">P</kbd>를 누르면 계속해요.
        </p>
      </div>
    </div>
  );
}
