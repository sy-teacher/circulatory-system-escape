// 설정 창(모달). 모든 값은 setSettings로 저장한다(이 기기의 브라우저에만).
// 이 파일의 useDialogA11y는 지도·보고서·확인 창 등 다른 모달에서도 함께 쓴다.

import { useEffect, useId, useRef, type ChangeEvent, type RefObject } from 'react';
import { useApp } from '../../state/store';
import { Icon } from '../controls/Icon';
import './SettingsPanel.css';

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

/** 열린 모달 순서(맨 위 창만 Esc·Tab을 처리한다) */
const dialogStack: symbol[] = [];

/**
 * 모달 접근성: 열릴 때 포커스 이동, Tab 순환(포커스 가두기), Esc로 닫기, 닫힌 뒤 연 버튼으로 포커스 되돌리기.
 * Esc는 게임 키보드 훅(캡처 단계)이 먼저 처리하지 않은 경우에만 닫는다(두 겹이 한꺼번에 닫히지 않게).
 */
export function useDialogA11y(
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
  initialFocus?: RefObject<HTMLElement | null>,
): void {
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    const token = Symbol('dialog');
    dialogStack.push(token);
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    (initialFocus?.current ?? ref.current)?.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (dialogStack[dialogStack.length - 1] !== token) return;
      if (e.key === 'Escape' || e.code === 'Escape') {
        if (e.defaultPrevented || e.isComposing) return;
        e.preventDefault();
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const root = ref.current;
      if (!root) return;
      const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.getClientRects().length > 0);
      if (items.length === 0) {
        e.preventDefault();
        root.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!active || !root.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && (active === first || active === root)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      const i = dialogStack.indexOf(token);
      if (i >= 0) dialogStack.splice(i, 1);
      const active = document.activeElement;
      if (opener && opener.isConnected && (!active || active === document.body)) opener.focus({ preventScroll: true });
    };
    // 모달이 열려 있는 동안 한 번만 설정한다(ref 객체는 바뀌지 않는다).
  }, []);
}

export function SettingsPanel() {
  const open = useApp((s) => s.settingsOpen);
  if (!open) return null;
  return <SettingsDialog />;
}

interface ToggleRowProps {
  label: string;
  desc?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}

function ToggleRow({ label, desc, checked, onChange }: ToggleRowProps) {
  const id = useId();
  return (
    <div className="settings-row">
      <div className="settings-row-text">
        <label htmlFor={id} className="settings-label">
          {label}
        </label>
        {desc && (
          <p id={`${id}-desc`} className="settings-desc">
            {desc}
          </p>
        )}
      </div>
      <span className="settings-switch">
        <input
          id={id}
          type="checkbox"
          role="switch"
          checked={checked}
          aria-describedby={desc ? `${id}-desc` : undefined}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.checked)}
        />
        <span className="settings-switch-track" aria-hidden="true">
          <span className="settings-switch-thumb" />
        </span>
        <span className="settings-switch-text" aria-hidden="true">
          {checked ? '켜짐' : '꺼짐'}
        </span>
      </span>
    </div>
  );
}

function SettingsDialog() {
  const settings = useApp((s) => s.settings);
  const setSettings = useApp((s) => s.setSettings);
  const setOpen = useApp((s) => s.setSettingsOpen);
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const volId = useId();
  const close = () => setOpen(false);
  useDialogA11y(ref, close, closeRef);

  const pct = Math.round(settings.volume * 100);

  return (
    <div
      className="modal-backdrop settings-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div ref={ref} className="settings panel" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <header className="settings-head">
          <h2 id={titleId} className="settings-title">
            <Icon name="settings" />
            설정
          </h2>
          <button ref={closeRef} type="button" className="btn btn-ghost btn-icon" aria-label="설정 닫기" onClick={close}>
            <Icon name="close" />
          </button>
        </header>

        <section className="settings-group" aria-labelledby={`${titleId}-sound`}>
          <h3 id={`${titleId}-sound`} className="settings-group-title">
            소리
          </h3>
          <div className="settings-row settings-volume">
            <div className="settings-row-text">
              <label htmlFor={volId} className="settings-label">
                소리 크기
              </label>
              <output htmlFor={volId} className="settings-output">
                {pct}%{settings.muted ? ' (음소거 중)' : ''}
              </output>
            </div>
            <input
              id={volId}
              className="settings-range"
              type="range"
              min={0}
              max={100}
              step={5}
              value={pct}
              aria-valuetext={`${pct}퍼센트${settings.muted ? ', 음소거 중' : ''}`}
              onChange={(e) => setSettings({ volume: Number(e.target.value) / 100 })}
            />
          </div>
          <ToggleRow label="음소거" desc="효과음과 심장박동 소리를 모두 끕니다." checked={settings.muted} onChange={(v) => setSettings({ muted: v })} />
        </section>

        <section className="settings-group" aria-labelledby={`${titleId}-view`}>
          <h3 id={`${titleId}-view`} className="settings-group-title">
            화면
          </h3>
          <ToggleRow
            label="이동 효과 줄이기"
            desc="탐사선과 화면의 움직임을 크게 줄이고, 흔들림·깜박임 효과를 없애요. 어지러울 때 켜 보세요."
            checked={settings.reduceMotion}
            onChange={(v) => setSettings({ reduceMotion: v })}
          />
          <ToggleRow
            label="저사양 모드"
            desc="혈구 같은 입자 수를 줄이고 화면 해상도를 낮춰, 느린 기기(크롬북 등)에서도 부드럽게 움직이게 해요."
            checked={settings.lowSpec}
            onChange={(v) => setSettings({ lowSpec: v })}
          />
          <ToggleRow label="큰 글자" desc="대화·문제·보고서의 글자를 크게 보여 줘요." checked={settings.largeText} onChange={(v) => setSettings({ largeText: v })} />
        </section>

        <p className="settings-foot">설정은 이 기기의 브라우저에만 저장돼요.</p>
        <div className="settings-actions">
          <button type="button" className="btn btn-primary" onClick={close}>
            확인
          </button>
        </div>
      </div>
    </div>
  );
}
