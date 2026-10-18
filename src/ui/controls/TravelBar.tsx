// 이동 중 안내: 짧은 설명 + 진행 막대(runtime.travelProgress를 requestAnimationFrame으로 읽음) + '이동 건너뛰기'.
// 진행률은 스토어에 쓰지 않고 DOM만 직접 바꾼다(프레임마다 리렌더링하지 않기 위해).

import { useEffect, useRef, useState } from 'react';
import { ROUTE } from '../../data/route';
import { runtime } from '../../scene/runtime';
import { useApp } from '../../state/store';
import { Icon } from './Icon';
import './Controls.css';

export function TravelBar() {
  const phase = useApp((s) => s.game?.phase);
  const travel = useApp((s) => s.game?.travel ?? null);
  const stepIndex = useApp((s) => s.game?.stepIndex ?? 0);
  if (phase !== 'travel' || !travel) return null;
  const step = ROUTE[Math.min(Math.max(stepIndex, 0), ROUTE.length - 1)];
  const key = `${travel.from ?? 'x'}|${travel.to}|${travel.mode}`;
  // 이미 해결한 구역을 경로로 빠르게 지날 때만 '기억한 구역' 표시(이어하기·귀환 화면 전환은 제외)
  return <TravelBarInner key={key} caption={step.travelCaption} fast={travel.fast && travel.mode === 'path'} />;
}

function TravelBarInner({ caption, fast }: { caption: string; fast: boolean }) {
  const barRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const [skipping, setSkipping] = useState(false);

  useEffect(() => {
    let raf = 0;
    let lastPct = -1;
    const tick = () => {
      const p = Math.max(0, Math.min(1, runtime.travelProgress));
      if (fillRef.current) fillRef.current.style.transform = `scaleX(${p})`;
      const pct = Math.round(p * 100);
      if (pct !== lastPct && barRef.current) {
        lastPct = pct;
        barRef.current.setAttribute('aria-valuenow', String(pct));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const skip = () => {
    runtime.skipRequested = true;
    setSkipping(true);
  };

  return (
    <div className="travel panel" role="group" aria-label="이동 중">
      <p className="travel-caption" aria-live="polite">
        {fast && <span className="chip travel-fast">기억한 구역 · 빠르게</span>}
        {caption}
      </p>
      <div className="travel-row">
        <div
          ref={barRef}
          className="travel-bar"
          role="progressbar"
          aria-label="이동 진행률"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={0}
        >
          <div ref={fillRef} className="travel-fill" />
        </div>
        <button type="button" className="btn btn-secondary travel-skip" onClick={skip} disabled={skipping}>
          <Icon name="skip" />
          {skipping ? '건너뛰는 중…' : '이동 건너뛰기'}
        </button>
      </div>
    </div>
  );
}
