// 비주얼 노벨 방식 대화 상자(화면 아래).
// 클릭·Enter·Space: 글자가 다 나오기 전에는 먼저 완성하고, 그다음에 줄을 넘긴다.
// '접기'로 작은 탭으로 줄일 수 있어 관찰 대상을 오래 가리지 않는다.

import { useCallback, useEffect, useRef, useState } from 'react';
import { SPEAKER_NAMES } from '../../data/dialogue';
import type { DialogueLine } from '../../data/types';
import { useApp } from '../../state/store';
import type { DialogueKind } from '../../state/types';
import { Icon } from '../controls/Icon';
import { Portrait } from './Portrait';
import { dialogueControl } from './dialogueControl';
import './Dialogue.css';

/** 초당 글자 수 */
const CHARS_PER_SEC = 28;
/** 새 줄이 나온 직후 연속 입력(더블 클릭)으로 한 줄을 건너뛰지 않도록 하는 최소 간격(ms) */
const ADVANCE_GUARD_MS = 220;
/** '대화 건너뛰기'를 보여 주는 긴 대화 */
const SKIPPABLE: DialogueKind[] = ['introPark', 'introWake', 'escape'];

/** 글자가 하나씩 나타나는 효과. 리렌더링 없이 DOM 글자만 바꾼다. */
function useTypewriter(text: string, lineKey: string, instant: boolean) {
  const ref = useRef<HTMLSpanElement>(null);
  const rafRef = useRef(0);
  const doneRef = useRef(false);
  const [doneKey, setDoneKey] = useState<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    cancelAnimationFrame(rafRef.current);
    doneRef.current = false;
    if (!el) return;
    const chars = Array.from(text);
    if (instant || chars.length === 0) {
      el.textContent = text;
      doneRef.current = true;
      setDoneKey(lineKey);
      return;
    }
    el.textContent = '';
    const start = performance.now();
    let shown = 0;
    const tick = (t: number) => {
      const n = Math.min(chars.length, Math.floor(((t - start) / 1000) * CHARS_PER_SEC));
      if (n !== shown) {
        shown = n;
        el.textContent = chars.slice(0, n).join('');
      }
      if (n >= chars.length) {
        doneRef.current = true;
        setDoneKey(lineKey);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [text, lineKey, instant]);

  /** 타이핑 중이면 완성하고 true를 돌려준다 */
  const complete = useCallback((): boolean => {
    if (doneRef.current) return false;
    cancelAnimationFrame(rafRef.current);
    if (ref.current) ref.current.textContent = text;
    doneRef.current = true;
    setDoneKey(lineKey);
    return true;
  }, [text, lineKey]);

  return { ref, done: doneKey === lineKey, complete };
}

export function DialogueBox() {
  const dialogue = useApp((s) => s.game?.dialogue ?? null);
  const phase = useApp((s) => s.game?.phase);
  const stepIndex = useApp((s) => s.game?.stepIndex ?? 0);
  const collapsed = useApp((s) => s.dialogueCollapsed);
  const setCollapsed = useApp((s) => s.setDialogueCollapsed);

  // 추론·피드백 중에는 대화 상자를 숨긴다(퀴즈와 절대 겹치지 않게).
  if (!dialogue || phase === 'question' || phase === 'feedback') return null;
  const line = dialogue.lines[dialogue.index];
  if (!line) return null;

  if (collapsed) {
    return (
      <button type="button" className="btn dlg-reopen" onClick={() => setCollapsed(false)}>
        <Icon name="chat" />
        대화 다시 열기
      </button>
    );
  }

  const lineKey = `${stepIndex}|${dialogue.kind}|${dialogue.index}|${line.text}`;
  return (
    <DialogueCard
      line={line}
      lineKey={lineKey}
      index={dialogue.index}
      total={dialogue.lines.length}
      kind={dialogue.kind}
      remembered={phase === 'remembered'}
    />
  );
}

interface CardProps {
  line: DialogueLine;
  lineKey: string;
  index: number;
  total: number;
  kind: DialogueKind;
  remembered: boolean;
}

function DialogueCard({ line, lineKey, index, total, kind, remembered }: CardProps) {
  const reduceMotion = useApp((s) => s.settings.reduceMotion);
  const advanceDialogue = useApp((s) => s.advanceDialogue);
  const skipDialogue = useApp((s) => s.skipDialogue);
  const passRemembered = useApp((s) => s.passRemembered);
  const setCollapsed = useApp((s) => s.setDialogueCollapsed);

  const typer = useTypewriter(line.text, lineKey, reduceMotion);
  const completeTyping = typer.complete;
  const shownAt = useRef(0);
  useEffect(() => {
    shownAt.current = performance.now();
  }, [lineKey]);

  const handleAdvance = useCallback(() => {
    if (completeTyping()) return;
    if (performance.now() - shownAt.current < ADVANCE_GUARD_MS) return;
    advanceDialogue();
  }, [completeTyping, advanceDialogue]);

  // 키보드 훅(Space/Enter)이 같은 규칙으로 넘기도록 등록
  useEffect(() => {
    dialogueControl.advance = handleAdvance;
    return () => {
      if (dialogueControl.advance === handleAdvance) dialogueControl.advance = null;
    };
  }, [handleAdvance]);

  const name = SPEAKER_NAMES[line.speaker];
  const isNarration = line.speaker === 'narration';
  const isLast = index >= total - 1;
  const showSkip = SKIPPABLE.includes(kind) && !isLast;

  return (
    <section
      className={`dlg panel${isNarration ? ' is-narration' : ''}`}
      aria-label="대화"
      onClick={handleAdvance}
    >
      <Portrait speaker={line.speaker} mood={line.mood} decorative className="dlg-portrait" />
      <div className="dlg-body">
        <div className="dlg-head">
          {name ? <span className={`dlg-name dlg-name--${line.speaker}`}>{name}</span> : <span className="dlg-name dlg-name--narration">이야기</span>}
          <span className="dlg-count" aria-label={`${total}줄 중 ${index + 1}번째`}>
            {index + 1}/{total}
          </span>
          <div className="dlg-tools" onClick={(e) => e.stopPropagation()}>
            {showSkip && (
              <button type="button" className="btn btn-ghost btn-small dlg-tool" onClick={skipDialogue}>
                <Icon name="skip" size={18} />
                <span className="dlg-tool-label">대화 건너뛰기</span>
              </button>
            )}
            <button
              type="button"
              className="btn btn-ghost btn-small dlg-tool"
              onClick={() => setCollapsed(true)}
              aria-label="대화 상자 접기"
            >
              <Icon name="down" size={18} />
              <span className="dlg-tool-label">접기</span>
            </button>
          </div>
        </div>

        <p className="dlg-text" aria-hidden="true">
          {/* 전체 문장으로 높이를 미리 잡아 두어 타이핑 중 상자 크기가 흔들리지 않게 한다 */}
          <span className="dlg-ghost">{line.text}</span>
          <span className="dlg-typed" ref={typer.ref} />
        </p>
        <p className="visually-hidden" aria-live="polite">
          {name ? `${name}: ` : ''}
          {line.text}
        </p>

        <div className="dlg-actions" onClick={(e) => e.stopPropagation()}>
          {remembered && (
            <button type="button" className="btn btn-secondary" onClick={passRemembered}>
              통과하기 ▶
            </button>
          )}
          <button type="button" className="btn btn-primary dlg-next" onClick={handleAdvance}>
            {typer.done ? (isLast ? '계속 ▶' : '다음 ▶') : '다음 ▶'}
            <span className="visually-hidden">{typer.done ? '' : ' (문장 모두 보기)'}</span>
          </button>
        </div>
      </div>
    </section>
  );
}
