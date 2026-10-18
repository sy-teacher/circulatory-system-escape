import { useEffect, useRef, type JSX } from 'react';
import { runtime } from './runtime';

/**
 * 장면 전환용 어두운 화면. 3D 캔버스 위에 겹치는 DOM 요소이며,
 * runtime.fade를 requestAnimationFrame으로 읽어 투명도만 바꾼다(React 상태를 갱신하지 않음).
 */
export function FadeOverlay(): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    let last = -1;
    const tick = () => {
      const el = ref.current;
      const v = Math.round(Math.min(Math.max(runtime.fade, 0), 1) * 1000) / 1000;
      if (el && v !== last) {
        el.style.opacity = String(v);
        el.style.visibility = v <= 0.001 ? 'hidden' : 'visible';
        last = v;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        background: '#12091d',
        opacity: 1,
        pointerEvents: 'none',
        zIndex: 30,
      }}
    />
  );
}
