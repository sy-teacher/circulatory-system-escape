// 대화 초상화(SVG). 외부 이미지 없이 직접 그린다.
// 수연쌤(캐릭터 시트 기준): 둥글고 큰 얼굴, 턱선까지 오는 짙은 갈색 단발과 일자 앞머리,
// 복숭아빛 피부와 분홍 볼, 하얀 실험 가운 깃과 노란 셔츠 깃.

import type { Mood, Speaker } from '../../data/types';

const C = {
  hair: '#3a2a22',
  hairHi: '#5b4434',
  skin: '#f2c6a4',
  skinShade: '#e2ab86',
  cheek: '#f39aa3',
  eye: '#2b1d17',
  mouth: '#9a4148',
  mouthIn: '#8b3a3f',
  tongue: '#f08a8f',
  coat: '#fdfdfb',
  coatLine: '#cfc9bf',
  shirt: '#f3dc85',
  shirtLine: '#d2b44f',
} as const;

export const MOOD_LABELS: Record<Mood, string> = {
  smile: '웃는 얼굴',
  open: '이야기하는 얼굴',
  cheer: '활짝 웃는 얼굴',
  surprised: '놀란 얼굴',
  wink: '윙크하는 얼굴',
  worried: '걱정하는 얼굴',
};

// ── 얼굴 부품 ─────────────────────────────────────────────

function OpenEye({ cx, cy = 61, rx = 4.3, ry = 5.4 }: { cx: number; cy?: number; rx?: number; ry?: number }) {
  return (
    <g>
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={C.eye} />
      <circle cx={cx - 1.4} cy={cy - 2} r={1.7} fill="#fff" />
      <circle cx={cx + 1.5} cy={cy + 2.3} r={0.85} fill="#fff" opacity={0.85} />
    </g>
  );
}

/** '^' 모양으로 감은 눈 */
function CaretEye({ cx }: { cx: number }) {
  return <path d={`M${cx - 5} 63 L${cx} 58.5 L${cx + 5} 63`} fill="none" stroke={C.eye} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />;
}

/** 둥근 호 모양으로 감은 눈 */
function ArcEye({ cx }: { cx: number }) {
  return <path d={`M${cx - 5.2} 62.5 Q${cx} 55.5 ${cx + 5.2} 62.5`} fill="none" stroke={C.eye} strokeWidth={2.8} strokeLinecap="round" />;
}

function Brows({ kind }: { kind: 'normal' | 'raised' | 'worried' }) {
  const common = { fill: 'none', stroke: C.hair, strokeWidth: 2.2, strokeLinecap: 'round' as const };
  if (kind === 'raised') {
    return (
      <g {...common}>
        <path d="M41 48.5 Q47 45 53 48.5" />
        <path d="M67 48.5 Q73 45 79 48.5" />
      </g>
    );
  }
  if (kind === 'worried') {
    // 가운데(미간 쪽)가 올라간 눈썹
    return (
      <g {...common}>
        <path d="M41 51.5 Q47 50.5 53 47.5" />
        <path d="M67 47.5 Q73 50.5 79 51.5" />
      </g>
    );
  }
  return (
    <g {...common}>
      <path d="M41 51 Q47 48.6 53 51" />
      <path d="M67 51 Q73 48.6 79 51" />
    </g>
  );
}

function SuyeonFeatures({ mood }: { mood: Mood }) {
  const line = { fill: 'none', stroke: C.mouth, strokeWidth: 2.3, strokeLinecap: 'round' as const };
  switch (mood) {
    case 'smile':
      return (
        <g>
          <Brows kind="normal" />
          <CaretEye cx={47} />
          <CaretEye cx={73} />
          <path d="M54 73 Q60 78.5 66 73" {...line} />
        </g>
      );
    case 'open':
      return (
        <g>
          <Brows kind="normal" />
          <OpenEye cx={47} />
          <OpenEye cx={73} />
          <path d="M55.5 73.5 Q60 77.5 64.5 73.5" {...line} />
        </g>
      );
    case 'cheer':
      return (
        <g>
          <Brows kind="normal" />
          <ArcEye cx={47} />
          <ArcEye cx={73} />
          <path d="M51 71.5 Q60 73 69 71.5 Q67.5 83 60 83 Q52.5 83 51 71.5 Z" fill={C.mouthIn} />
          <path d="M54.5 79 Q60 76 65.5 79 Q63.5 82.2 60 82.2 Q56.5 82.2 54.5 79 Z" fill={C.tongue} />
        </g>
      );
    case 'surprised':
      return (
        <g>
          <Brows kind="raised" />
          <OpenEye cx={47} rx={4.8} ry={5.4} />
          <OpenEye cx={73} rx={4.8} ry={5.4} />
          <ellipse cx={60} cy={76} rx={3.2} ry={3.9} fill={C.mouthIn} />
        </g>
      );
    case 'wink':
      return (
        <g>
          <Brows kind="normal" />
          <OpenEye cx={47} />
          <ArcEye cx={73} />
          <path d="M53.5 72.5 Q60 79.5 66.5 72.5" {...line} />
        </g>
      );
    case 'worried':
      return (
        <g>
          <Brows kind="worried" />
          <OpenEye cx={47} cy={61.5} rx={4} ry={5} />
          <OpenEye cx={73} cy={61.5} rx={4} ry={5} />
          <path d="M55 77 Q60 73 65 77" {...line} />
        </g>
      );
  }
}

/** 수연쌤 */
export function SuyeonArt({ mood = 'smile' }: { mood?: Mood }) {
  return (
    <>
      {/* 뒷머리: 턱선까지 오는 단발 */}
      <path d="M23 86 C19 72 18 54 21 42 C26 23 41 12 60 12 C79 12 94 23 99 42 C102 54 101 72 97 86 Q95.5 91.5 90 91.5 H30 Q24.5 91.5 23 86 Z" fill={C.hair} />
      {/* 목 */}
      <rect x={52} y={78} width={16} height={24} rx={4} fill={C.skinShade} />
      {/* 실험 가운 */}
      <path d="M8 121 C11 106 26 99 44 97 H76 C94 99 109 106 112 121 Z" fill={C.coat} stroke={C.coatLine} strokeWidth={1.5} />
      {/* 노란 셔츠와 깃 */}
      <path d="M46 97 L60 119 L74 97 Z" fill={C.shirt} />
      <path d="M52 94 L60 104 L46 107.5 L44.5 99 Z" fill={C.shirt} stroke={C.shirtLine} strokeWidth={1.2} strokeLinejoin="round" />
      <path d="M68 94 L60 104 L74 107.5 L75.5 99 Z" fill={C.shirt} stroke={C.shirtLine} strokeWidth={1.2} strokeLinejoin="round" />
      {/* 가운 깃(라펠) */}
      <path d="M44 97.5 L58 120 H45 L36 104 Z" fill={C.coat} stroke={C.coatLine} strokeWidth={1.4} strokeLinejoin="round" />
      <path d="M76 97.5 L62 120 H75 L84 104 Z" fill={C.coat} stroke={C.coatLine} strokeWidth={1.4} strokeLinejoin="round" />
      {/* 가슴 주머니의 펜 */}
      <rect x={88} y={106} width={2.4} height={9} rx={1} fill="#4fa3d9" />
      <path d="M84 112 H96" stroke={C.coatLine} strokeWidth={1.3} strokeLinecap="round" />
      {/* 얼굴 */}
      <ellipse cx={60} cy={57} rx={34} ry={31} fill={C.skin} />
      {/* 볼 */}
      <ellipse cx={40.5} cy={70} rx={5.5} ry={3.3} fill={C.cheek} opacity={0.75} />
      <ellipse cx={79.5} cy={70} rx={5.5} ry={3.3} fill={C.cheek} opacity={0.75} />
      {/* 옆머리(턱선에서 일자로 끝남) */}
      <path d="M27 45 C23.5 60 24 76 27 89.5 Q28 91.5 31 91.5 H36 C33 80 32 63 34 47 Z" fill={C.hair} />
      <path d="M93 45 C96.5 60 96 76 93 89.5 Q92 91.5 89 91.5 H84 C87 80 88 63 86 47 Z" fill={C.hair} />
      {/* 일자 앞머리(뭉툭하게 자른 아랫선) */}
      <path d="M26 53 C25 29 41 18 60 18 C79 18 95 29 94 53 H90.5 L89.5 44 H30.5 L29.5 53 Z" fill={C.hair} />
      <path d="M40 26.5 Q60 18.5 80 26.5" fill="none" stroke={C.hairHi} strokeWidth={3} strokeLinecap="round" opacity={0.9} />
      {/* 코 */}
      <path d="M59 67.4 Q60.3 68.8 61.4 67.6" fill="none" stroke={C.skinShade} strokeWidth={1.6} strokeLinecap="round" />
      <SuyeonFeatures mood={mood} />
    </>
  );
}

/** 나(학생): 교복 차림 */
function StudentArt() {
  const hair = '#26232c';
  return (
    <>
      <path d="M23 64 C20 32 38 15 60 15 C82 15 100 32 97 64 Z" fill={hair} />
      <rect x={52} y={78} width={16} height={24} rx={4} fill="#e6b896" />
      {/* 남색 교복 상의 */}
      <path d="M8 121 C11 106 26 99 44 97 H76 C94 99 109 106 112 121 Z" fill="#2f3d6e" />
      <path d="M46 97 L60 120 L74 97 Z" fill="#ffffff" />
      <path d="M52 94 L60 103 L47 106 L46 99 Z" fill="#ffffff" stroke="#c9ced8" strokeWidth={1.2} strokeLinejoin="round" />
      <path d="M68 94 L60 103 L73 106 L74 99 Z" fill="#ffffff" stroke="#c9ced8" strokeWidth={1.2} strokeLinejoin="round" />
      {/* 넥타이 */}
      <path d="M57.3 102 H62.7 L64 107 L61.4 120 H58.6 L56 107 Z" fill="#d6455a" />
      <path d="M44 97.5 L57 120 H45 L36 104 Z" fill="#26325c" />
      <path d="M76 97.5 L63 120 H75 L84 104 Z" fill="#26325c" />
      <rect x={82} y={108} width={10} height={6} rx={1.5} fill="#ffcf3f" />
      {/* 얼굴 */}
      <ellipse cx={60} cy={58} rx={32} ry={29} fill="#f5d0b5" />
      <ellipse cx={41} cy={71} rx={5} ry={3} fill="#f3a3a3" opacity={0.6} />
      <ellipse cx={79} cy={71} rx={5} ry={3} fill="#f3a3a3" opacity={0.6} />
      {/* 옆으로 넘긴 짧은 앞머리 */}
      <path d="M27 54 C27 30 43 21 61 21 C78 21 93 30 93 52 C86 45 77 41 68 42 C62 37 52 38 46 45 C39 45 32 48 27 54 Z" fill={hair} />
      <g>
        <ellipse cx={47} cy={62} rx={3.8} ry={4.6} fill={C.eye} />
        <circle cx={45.8} cy={60.3} r={1.4} fill="#fff" />
        <ellipse cx={73} cy={62} rx={3.8} ry={4.6} fill={C.eye} />
        <circle cx={71.8} cy={60.3} r={1.4} fill="#fff" />
      </g>
      <path d="M42 53.5 Q47 51.5 52 53.5M68 53.5 Q73 51.5 78 53.5" fill="none" stroke={hair} strokeWidth={2} strokeLinecap="round" />
      <path d="M55 75 Q60 78.5 65 75" fill="none" stroke={C.mouth} strokeWidth={2.2} strokeLinecap="round" />
    </>
  );
}

/** 친구 민규: 짧은 머리의 남학생, 청록 후드티 */
function FriendArt() {
  const hair = '#6b4426';
  return (
    <>
      {/* 짧은 머리와 드러난 귀 */}
      <path d="M25 57 C21 35 31 22 43 18 L49 10 L60 16 L74 12 L77 20 C92 24 98 38 94 57 Z" fill={hair} />
      <ellipse cx={29} cy={61} rx={5} ry={8} fill="#f6cfae" />
      <ellipse cx={91} cy={61} rx={5} ry={8} fill="#f6cfae" />
      <rect x={52} y={78} width={16} height={24} rx={4} fill="#e8b48f" />
      {/* 청록 후드티 */}
      <path d="M8 121 C11 106 26 99 44 97 H76 C94 99 109 106 112 121 Z" fill="#3fbfae" />
      <path d="M36 101 Q60 90 84 101 Q60 110 36 101 Z" fill="#2f9e90" />
      <path d="M53 104 V116M67 104 V116" stroke="#ffffff" strokeWidth={2} strokeLinecap="round" />
      <circle cx={53} cy={117} r={1.8} fill="#ffffff" />
      <circle cx={67} cy={117} r={1.8} fill="#ffffff" />
      {/* 얼굴 */}
      <ellipse cx={60} cy={58} rx={32} ry={29} fill="#f6cfae" />
      <ellipse cx={41} cy={70} rx={5.5} ry={3.3} fill="#f59aa0" opacity={0.75} />
      <ellipse cx={79} cy={70} rx={5.5} ry={3.3} fill="#f59aa0" opacity={0.75} />
      {/* 짧고 자연스럽게 넘긴 앞머리 */}
      <path d="M28 51 C26 31 43 20 60 20 C79 20 94 32 92 51 L84 42 L76 46 L68 37 L55 45 L48 39 L36 48 L32 44 Z" fill={hair} />
      <g>
        <ellipse cx={47} cy={61} rx={4.3} ry={5.3} fill={C.eye} />
        <circle cx={45.6} cy={59} r={1.7} fill="#fff" />
        <ellipse cx={73} cy={61} rx={4.3} ry={5.3} fill={C.eye} />
        <circle cx={71.6} cy={59} r={1.7} fill="#fff" />
      </g>
      <path d="M41.5 51.5 Q47 48.5 52.5 51M67.5 51 Q73 48.5 78.5 51.5" fill="none" stroke={hair} strokeWidth={2.2} strokeLinecap="round" />
      <path d="M51.5 72 Q60 73 68.5 72 Q66.5 82 60 82 Q53.5 82 51.5 72 Z" fill={C.mouthIn} />
      <path d="M55 78.5 Q60 75.8 65 78.5 Q63 81.3 60 81.3 Q57 81.3 55 78.5 Z" fill={C.tongue} />
    </>
  );
}

/** 해설: 책 아이콘 */
function NarrationArt() {
  return (
    <g fill="none" stroke="#5a3d8a" strokeWidth={4} strokeLinejoin="round" strokeLinecap="round">
      <path d="M22 34 C34 28 48 28 60 36 C72 28 86 28 98 34 V88 C86 82 72 82 60 90 C48 82 34 82 22 88 Z" fill="#ffffff" />
      <path d="M60 36 V90" />
      <path d="M32 46 C39 44 46 44 52 47M32 58 C39 56 46 56 52 59M68 47 C74 44 81 44 88 46M68 59 C74 56 81 56 88 58" strokeWidth={3} stroke="#a58fd0" />
    </g>
  );
}

export interface PortraitProps {
  speaker: Speaker;
  mood?: Mood;
  /** 한 변 크기(px). 생략하면 CSS가 정한다. */
  size?: number;
  /** 이름이 옆에 이미 쓰여 있으면 true(화면 읽기 프로그램이 중복해서 읽지 않음) */
  decorative?: boolean;
  className?: string;
}

const SPEAKER_LABEL: Record<Speaker, string> = {
  suyeon: '수연쌤',
  student: '나',
  friend: '친구 민규',
  narration: '해설',
};

export function Portrait({ speaker, mood, size, decorative = false, className }: PortraitProps) {
  const m: Mood = mood ?? 'smile';
  const label = speaker === 'suyeon' ? `${SPEAKER_LABEL.suyeon} (${MOOD_LABELS[m]})` : SPEAKER_LABEL[speaker];
  return (
    <span
      className={['portrait', `portrait--${speaker}`, className].filter(Boolean).join(' ')}
      style={size ? { width: size, height: size } : undefined}
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': label })}
    >
      <svg viewBox="0 0 120 120" width="100%" height="100%" focusable="false" aria-hidden="true">
        {speaker === 'suyeon' && <SuyeonArt mood={m} />}
        {speaker === 'student' && <StudentArt />}
        {speaker === 'friend' && <FriendArt />}
        {speaker === 'narration' && <NarrationArt />}
      </svg>
    </span>
  );
}
