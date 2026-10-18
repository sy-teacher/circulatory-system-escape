import { useSyncExternalStore } from 'react';

/** 좁은 화면(세로 휴대폰) 또는 낮은 가로 화면: 패널을 기본으로 접어 3D 화면을 넓게 쓴다. */
export const COMPACT_QUERY = '(max-width: 760px) and (orientation: portrait), (max-height: 520px) and (orientation: landscape)';

/** CSS 미디어 쿼리 결과를 구독한다(화면 회전·창 크기 변경에 반응). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false),
    () => false,
  );
}
