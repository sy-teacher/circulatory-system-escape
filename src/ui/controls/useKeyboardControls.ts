// 게임 화면 키보드 조작. 상태는 useApp.getState()로 읽어 리렌더링 없이 처리한다.
//  ←/→ · A/D 조향(이동·관찰 중) · Q/E 좌우 둘러보기 · R 시점 초기화 · M 지도 · P 일시정지
//  Esc: 맨 위의 겹친 창부터 닫기(단서 카드 → 지도 → 일시정지)
//  Space/Enter: 포커스가 화면(바탕·3D)에 있을 때만 대화 넘기기(버튼에 포커스가 있으면 버튼이 처리)
//  한글 입력 상태에서도 동작하도록 e.key 대신 e.code(물리 키)를 쓴다.

import { useEffect } from 'react';
import { resetView, runtime } from '../../scene/runtime';
import { useApp, type AppState } from '../../state/store';
import { dialogueControl } from '../dialogue/dialogueControl';

const LOOK_STEP = 0.35;
const LOOK_LIMIT = 2.6;

const TEXT_INPUT_TYPES = new Set(['text', 'search', 'email', 'number', 'password', 'tel', 'url', 'date', 'time']);

/** 글자를 입력하는 요소(단축키를 모두 무시) */
function isTextEntry(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  if (el instanceof HTMLInputElement) return TEXT_INPUT_TYPES.has(el.type);
  return el instanceof HTMLElement && el.isContentEditable;
}

/** 방향키를 스스로 쓰는 입력 요소(라디오·체크박스·슬라이더 등) */
function isFormControl(el: Element | null): boolean {
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
}

/** 포커스가 특정 조작 요소에 있지 않은 상태(바탕 또는 3D 캔버스) */
function isNeutralFocus(el: Element | null): boolean {
  return !el || el === document.body || el === document.documentElement || el.tagName === 'CANVAS';
}

function anyModal(s: AppState): boolean {
  return s.paused || s.mapOpen || s.settingsOpen || s.reportOpen;
}

function steerAllowed(s: AppState): boolean {
  const p = s.game?.phase;
  return (p === 'travel' || p === 'observe') && !anyModal(s);
}

const clampYaw = (v: number) => Math.max(-LOOK_LIMIT, Math.min(LOOK_LIMIT, v));

export function useKeyboardControls(): void {
  useEffect(() => {
    let left = false;
    let right = false;

    const applySteer = () => {
      runtime.steerInput = steerAllowed(useApp.getState()) ? (right ? 1 : 0) - (left ? 1 : 0) : 0;
    };

    // Esc는 캡처 단계에서 먼저 처리해, 다른 창의 Esc 처리와 겹쳐 두 겹이 한꺼번에 닫히지 않게 한다.
    const onEscCapture = (e: KeyboardEvent) => {
      if (e.code !== 'Escape' && e.key !== 'Escape') return;
      const s = useApp.getState();
      if (!s.game || s.settingsOpen || s.reportOpen) return; // 설정·보고서 창은 스스로 닫는다
      let handled = true;
      if (s.focusedClueId) s.focusClue(null);
      else if (s.mapOpen) s.setMapOpen(false);
      else if (s.paused) s.setPaused(false);
      else handled = false;
      if (handled) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      const s = useApp.getState();
      if (!s.game) return;
      const active = document.activeElement;
      if (isTextEntry(active) || e.isComposing) return;
      const code = e.code;

      if (code === 'ArrowLeft' || code === 'KeyA' || code === 'ArrowRight' || code === 'KeyD') {
        if (isFormControl(active) || !steerAllowed(s)) return;
        if (code === 'ArrowLeft' || code === 'KeyA') left = true;
        else right = true;
        applySteer();
        e.preventDefault();
        return;
      }

      if (s.settingsOpen || s.reportOpen) return;

      switch (code) {
        case 'KeyQ':
        case 'KeyE':
          if (anyModal(s)) return;
          runtime.targetYaw = clampYaw(runtime.targetYaw + (code === 'KeyQ' ? LOOK_STEP : -LOOK_STEP));
          e.preventDefault();
          return;
        case 'KeyR':
          if (e.repeat || anyModal(s)) return;
          resetView();
          return;
        case 'KeyM':
          if (e.repeat) return;
          s.setMapOpen(!s.mapOpen);
          return;
        case 'KeyP':
          if (e.repeat) return;
          if (s.mapOpen) s.setMapOpen(false);
          s.setPaused(!s.paused);
          return;
        case 'Space':
        case 'Enter':
        case 'NumpadEnter':
          if (e.repeat || anyModal(s) || !isNeutralFocus(active)) return;
          if (!s.game.dialogue || s.dialogueCollapsed || !dialogueControl.advance) return;
          e.preventDefault();
          dialogueControl.advance();
          return;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const code = e.code;
      if (code === 'ArrowLeft' || code === 'KeyA') left = false;
      else if (code === 'ArrowRight' || code === 'KeyD') right = false;
      else return;
      applySteer();
    };

    const onBlur = () => {
      left = false;
      right = false;
      runtime.steerInput = 0;
    };

    // 일시정지·지도 열기·단계 변경으로 조향할 수 없게 되면 즉시 멈춘다(누르고 있으면 키 반복 입력으로 다시 이어진다).
    const unsub = useApp.subscribe((s) => {
      if (!steerAllowed(s) && runtime.steerInput !== 0 && (left || right)) runtime.steerInput = 0;
    });

    window.addEventListener('keydown', onEscCapture, true);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      unsub();
      window.removeEventListener('keydown', onEscCapture, true);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      runtime.steerInput = 0;
    };
  }, []);
}
