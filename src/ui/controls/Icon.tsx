// 인라인 SVG 아이콘(외부 글꼴·이미지 없이). 글자와 함께 쓰거나 aria-label이 있는 버튼 안에서 쓴다.

export type IconName =
  | 'map'
  | 'report'
  | 'recenter'
  | 'volume'
  | 'mute'
  | 'settings'
  | 'pause'
  | 'play'
  | 'help'
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'check'
  | 'close'
  | 'hint'
  | 'search'
  | 'chat'
  | 'skip'
  | 'home'
  | 'flag'
  | 'book'
  | 'pin'
  | 'retry'
  | 'eye'
  | 'star'
  | 'ruler'
  | 'sparkle';

const PATHS: Record<IconName, string> = {
  map: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2ZM9 4v14M15 6v14',
  report: 'M7 4h10a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2ZM9 3h6v3H9zM9 11h6M9 15h4',
  recenter: 'M12 2v4M12 18v4M2 12h4M18 12h4M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z',
  volume: 'M4 9h4l5-4v14l-5-4H4ZM16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11',
  mute: 'M4 9h4l5-4v14l-5-4H4ZM16 9.5l5 5M21 9.5l-5 5',
  settings: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM9 15a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z',
  pause: 'M8 5h2.5v14H8zM13.5 5H16v14h-2.5z',
  play: 'M7 5v14l12-7Z',
  help: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1.9-1.1 1.7v.6M12 17h.01',
  left: 'M15 5l-7 7 7 7',
  right: 'M9 5l7 7-7 7',
  up: 'M5 15l7-7 7 7',
  down: 'M5 9l7 7 7-7',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  close: 'M6 6l12 12M18 6 6 18',
  hint: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3Z',
  search: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM15.5 15.5 20 20',
  chat: 'M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-4 3.5V16H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1ZM8 9.5h8M8 12.5h5',
  skip: 'M5 6l7 6-7 6ZM12 6l7 6-7 6ZM20 6v12',
  home: 'M4 11 12 4l8 7M6 9.5V20h12V9.5M10 20v-5h4v5',
  flag: 'M6 21V4M6 4h11l-2.5 4L17 12H6',
  book: 'M4 5.5C6.5 4.5 9.5 4.5 12 6c2.5-1.5 5.5-1.5 8-.5V19c-2.5-1-5.5-1-8 .5-2.5-1.5-5.5-1.5-8-.5ZM12 6v13.5',
  pin: 'M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11ZM12 7.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z',
  retry: 'M4 12a8 8 0 1 0 2.4-5.7M4 4v5h5',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12ZM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
  star: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9Z',
  ruler: 'M3 16 16 3l5 5L8 21ZM7 12l2 2M10 9l2 2M13 6l2 2',
  sparkle: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18',
};

export interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  /** 채움(별·재생 등) */
  filled?: boolean;
}

/** 장식용 아이콘(항상 aria-hidden). 의미는 옆의 글자나 버튼의 aria-label로 전달한다. */
export function Icon({ name, size = 22, className, filled = false }: IconProps) {
  return (
    <svg
      className={['ui-icon', className].filter(Boolean).join(' ')}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

const HEART = 'M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20Z';

/** 남은 기회 하트(채움 = 남음, 빈 하트 = 사용함). 모양으로 구분되어 색만으로 상태를 전달하지 않는다. */
export function HeartIcon({ full, size = 22 }: { full: boolean; size?: number }) {
  return (
    <svg
      className={`ui-heart${full ? ' is-full' : ' is-empty'}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d={HEART}
        fill={full ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={2}
        strokeLinejoin="round"
      />
    </svg>
  );
}
