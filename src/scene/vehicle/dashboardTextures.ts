// 탐사선 계기판 화면(CanvasTexture). 글꼴은 시스템 한글 글꼴만 쓴다(네트워크 없음).
// 계기판 글자에는 정답 장소 이름을 쓰지 않는다(INSTRUMENTS 데이터의 일반 표현만 표시).

import { CanvasTexture, SRGBColorSpace } from 'three';
import type { InstrumentState } from '../instruments';
import { PALETTE } from '../palette';

export const DASH_FONT = "'Apple SD Gothic Neo','Noto Sans KR','Malgun Gothic',sans-serif";

const TEXT = '#fff8f2';
const MUTED = '#cfc3dd';
const BG = '#1b1630';
const EDGE = '#4fd6c4';
const ACCENT = '#ffcf3f';

/** 계기판 화면 하나(논리 크기 w×h, 실제 픽셀은 scale배) */
export class DashScreen {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D | null;
  readonly texture: CanvasTexture;
  readonly w: number;
  readonly h: number;
  private readonly scale: number;

  constructor(w: number, h: number, scale: number) {
    this.w = w;
    this.h = h;
    this.scale = scale;
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.round(w * scale);
    this.canvas.height = Math.round(h * scale);
    this.ctx = this.canvas.getContext('2d');
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.anisotropy = 4;
  }

  /** 그리기 시작(배율 적용, 화면 지우기) */
  begin(): CanvasRenderingContext2D | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    return ctx;
  }

  commit(): void {
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.texture.dispose();
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

function panel(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  roundRect(ctx, 3, 3, w - 6, h - 6, 18);
  ctx.fillStyle = BG;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = EDGE;
  ctx.stroke();
}

function font(size: number, bold = true): string {
  return `${bold ? '700' : '500'} ${size}px ${DASH_FONT}`;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mixHex(a: string, b: string, k: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  const t = Math.min(1, Math.max(0, k));
  const c = x.map((v, i) => Math.round(v + (y[i] - v) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

/** 글자가 maxW 안에 들어가도록 글자 크기를 줄이고, 필요하면 두 줄로 나눈다 */
function fitLines(ctx: CanvasRenderingContext2D, text: string, maxW: number, size: number, minSize: number): { lines: string[]; size: number } {
  for (let s = size; s >= minSize; s -= 2) {
    ctx.font = font(s);
    if (ctx.measureText(text).width <= maxW) return { lines: [text], size: s };
  }
  // 두 줄: 공백 기준으로 가장 고르게 나눈다
  const words = text.split(' ');
  if (words.length > 1) {
    let best: string[] = [text];
    let bestW = Infinity;
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(' ');
      const b = words.slice(i).join(' ');
      ctx.font = font(size - 2);
      const w = Math.max(ctx.measureText(a).width, ctx.measureText(b).width);
      if (w < bestW) {
        bestW = w;
        best = [a, b];
      }
    }
    for (let s = size - 2; s >= minSize; s -= 2) {
      ctx.font = font(s);
      if (best.every((l) => ctx.measureText(l).width <= maxW)) return { lines: best, size: s };
    }
    return { lines: best, size: minSize };
  }
  return { lines: [text], size: minSize };
}

// ── 산소 측정기 ─────────────────────────────────────────────

export const O2_SIZE = { w: 256, h: 200 };

/**
 * 산소 측정기: 막대 + 글자. value는 0.15~1(0을 표시하지 않음). waiting이면 '측정 대기'.
 * 막대 색은 산소가 적을수록 어두운 붉은색, 풍부할수록 선명한 붉은색(파란색을 쓰지 않음).
 */
export function drawO2(screen: DashScreen, value: number, label: string, waiting: boolean): void {
  const ctx = screen.begin();
  if (!ctx) return;
  const { w, h } = screen;
  panel(ctx, w, h);

  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = TEXT;
  ctx.font = font(24);
  ctx.fillText('산소 측정기', 18, 38);

  const bx = 18;
  const by = 56;
  const bw = w - 36;
  const bh = 34;
  roundRect(ctx, bx, by, bw, bh, 10);
  ctx.fillStyle = '#3a3150';
  ctx.fill();

  const v = Math.min(1, Math.max(0.15, value));
  if (waiting) {
    ctx.save();
    roundRect(ctx, bx, by, bw, bh, 10);
    ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 6;
    for (let x = bx - bh; x < bx + bw; x += 18) {
      ctx.beginPath();
      ctx.moveTo(x, by + bh);
      ctx.lineTo(x + bh, by);
      ctx.stroke();
    }
    ctx.restore();
  } else {
    const k = (v - 0.35) / 0.6;
    const grad = ctx.createLinearGradient(bx, 0, bx + bw * v, 0);
    grad.addColorStop(0, PALETTE.rbcPoor);
    grad.addColorStop(1, mixHex(PALETTE.rbcPoor, PALETTE.rbcRich, k));
    roundRect(ctx, bx, by, Math.max(bh * 0.6, bw * v), bh, 10);
    ctx.fillStyle = grad;
    ctx.fill();
    // 반짝이는 윗면
    roundRect(ctx, bx + 4, by + 4, Math.max(8, bw * v - 8), 8, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fill();
  }
  roundRect(ctx, bx, by, bw, bh, 10);
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.stroke();

  ctx.font = font(15, false);
  ctx.fillStyle = MUTED;
  ctx.fillText('적음', bx, by + bh + 20);
  ctx.textAlign = 'right';
  ctx.fillText('풍부', bx + bw, by + bh + 20);

  // 상태 글자
  ctx.textAlign = 'left';
  const dotColor = waiting ? '#a99bb8' : mixHex(PALETTE.rbcPoor, PALETTE.rbcRich, (v - 0.35) / 0.6);
  ctx.beginPath();
  ctx.arc(bx + 11, 146, 9, 0, Math.PI * 2);
  ctx.fillStyle = dotColor;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.stroke();
  const fit = fitLines(ctx, label, bw - 30, 28, 18);
  ctx.font = font(fit.size);
  ctx.fillStyle = TEXT;
  ctx.fillText(fit.lines.join(' '), bx + 28, 156);

  ctx.font = font(15, false);
  ctx.fillStyle = MUTED;
  ctx.fillText('산소량(상대값)', bx, h - 18);
  screen.commit();
}

// ── 인체 내비게이터 ──────────────────────────────────────────

export const NAV_SIZE = { w: 384, h: 208 };

type NavPlace = NonNullable<InstrumentState['nav']>['from'];

/** 실루엣 위 지점(앞에서 본 몸: 심장은 몸의 왼쪽 = 화면의 오른쪽) */
const NAV_POINTS: Record<NavPlace, [number, number]> = {
  심장: [104, 112],
  '심장 안': [104, 112],
  허파: [83, 96],
  온몸: [96, 178],
};

function drawHeartIcon(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string): void {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.9);
  ctx.bezierCurveTo(x - s * 1.4, y - s * 0.1, x - s * 0.7, y - s * 1.1, x, y - s * 0.35);
  ctx.bezierCurveTo(x + s * 0.7, y - s * 1.1, x + s * 1.4, y - s * 0.1, x, y + s * 0.9);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function arrow(ctx: CanvasRenderingContext2D, a: [number, number], b: [number, number]): void {
  const [x0, y0] = a;
  const [x1, y1] = b;
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  // 몸 중심선과 겹치지 않도록 바깥쪽으로 휘게 그린다
  const bend = Math.min(26, len * 0.35);
  const cx = mx + (-dy / len) * bend;
  const cy = my + (dx / len) * bend;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo(cx, cy, x1, y1);
  ctx.stroke();
  const ang = Math.atan2(y1 - cy, x1 - cx);
  const hs = 14;
  ctx.beginPath();
  ctx.moveTo(x1 + Math.cos(ang) * 2, y1 + Math.sin(ang) * 2);
  ctx.lineTo(x1 - Math.cos(ang - 0.5) * hs, y1 - Math.sin(ang - 0.5) * hs);
  ctx.lineTo(x1 - Math.cos(ang + 0.5) * hs, y1 - Math.sin(ang + 0.5) * hs);
  ctx.closePath();
  ctx.fillStyle = ACCENT;
  ctx.fill();
  // 출발점 표시
  ctx.beginPath();
  ctx.arc(x0, y0, 5, 0, Math.PI * 2);
  ctx.fill();
}

export function drawNav(screen: DashScreen, nav: InstrumentState['nav']): void {
  const ctx = screen.begin();
  if (!ctx) return;
  const { w, h } = screen;
  panel(ctx, w, h);

  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = TEXT;
  ctx.font = font(22);
  ctx.fillText('인체 내비게이터', 18, 34);

  // 사람 실루엣(단순화한 그림)
  ctx.fillStyle = 'rgba(255, 240, 228, 0.16)';
  ctx.strokeStyle = 'rgba(255, 240, 228, 0.7)';
  ctx.lineWidth = 2;
  const body = () => {
    ctx.beginPath();
    ctx.arc(96, 62, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    roundRect(ctx, 70, 80, 52, 66, 16);
    ctx.fill();
    ctx.stroke();
    roundRect(ctx, 52, 84, 14, 56, 7);
    ctx.fill();
    ctx.stroke();
    roundRect(ctx, 126, 84, 14, 56, 7);
    ctx.fill();
    ctx.stroke();
    roundRect(ctx, 74, 142, 20, 54, 8);
    ctx.fill();
    ctx.stroke();
    roundRect(ctx, 98, 142, 20, 54, 8);
    ctx.fill();
    ctx.stroke();
  };
  body();

  // 허파(두 개)와 심장 표시
  ctx.fillStyle = 'rgba(255, 179, 193, 0.75)';
  ctx.beginPath();
  ctx.ellipse(84, 102, 9, 15, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(108, 102, 9, 15, 0, 0, Math.PI * 2);
  ctx.fill();
  drawHeartIcon(ctx, 104, 113, 8, PALETTE.rbcRich);

  // 이름표
  ctx.font = font(14, false);
  ctx.fillStyle = MUTED;
  ctx.textAlign = 'left';
  ctx.fillText('허파', 148, 98);
  ctx.fillText('심장', 148, 120);
  ctx.fillText('온몸', 148, 182);
  ctx.strokeStyle = 'rgba(207,195,221,0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(116, 94);
  ctx.lineTo(144, 94);
  ctx.moveTo(112, 116);
  ctx.lineTo(144, 116);
  ctx.moveTo(120, 178);
  ctx.lineTo(144, 178);
  ctx.stroke();

  const tx = 196;
  const tw = w - tx - 18;
  if (!nav) {
    // 아주 가는 혈관 속에서는 위치 신호가 약하다(장소를 직접 알려 주지 않음)
    ctx.font = font(30);
    ctx.fillStyle = MUTED;
    ctx.fillText('신호 약함', tx, 108);
    ctx.font = font(20);
    ctx.fillText('아주 가는 혈관 속', tx, 146, tw);
    screen.commit();
    return;
  }

  const a = NAV_POINTS[nav.from];
  const b = NAV_POINTS[nav.to];
  if (nav.from === '심장 안' || nav.to === '심장 안') {
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(104, 112, 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (a[0] !== b[0] || a[1] !== b[1]) arrow(ctx, a, b);

  ctx.font = font(15, false);
  ctx.fillStyle = MUTED;
  ctx.fillText('이동 방향', tx, 74);
  const fit = fitLines(ctx, nav.label, tw, 28, 16);
  ctx.font = font(fit.size);
  ctx.fillStyle = TEXT;
  fit.lines.forEach((line, i) => ctx.fillText(line, tx, 112 + i * (fit.size + 8)));

  ctx.font = font(13, false);
  ctx.fillStyle = MUTED;
  ctx.fillText('그림은 단순화한 표시', tx, h - 18);
  screen.commit();
}

// ── 수축 압력계(눈금판; 바늘은 3D 막대로 따로 그린다) ─────────────────

export const PRESSURE_SIZE = { w: 200, h: 200 };
/** 바늘 회전 중심(논리 좌표) */
export const PRESSURE_PIVOT = { x: 100, y: 104 };
export const PRESSURE_NEEDLE = 64;

export function drawPressureDial(screen: DashScreen): void {
  const ctx = screen.begin();
  if (!ctx) return;
  const { w, h } = screen;
  panel(ctx, w, h);
  const { x: cx, y: cy } = PRESSURE_PIVOT;
  const r = 70;
  const deg = Math.PI / 180;
  const segs: [number, number, string][] = [
    [150, 230, EDGE],
    [230, 310, ACCENT],
    [310, 390, '#ff7a8a'],
  ];
  ctx.lineCap = 'butt';
  for (const [a0, a1, c] of segs) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, a0 * deg, a1 * deg, false);
    ctx.strokeStyle = c;
    ctx.lineWidth = 12;
    ctx.stroke();
  }
  ctx.strokeStyle = TEXT;
  ctx.lineWidth = 3;
  for (let a = 150; a <= 390; a += 30) {
    const c = Math.cos(a * deg);
    const s = Math.sin(a * deg);
    ctx.beginPath();
    ctx.moveTo(cx + c * (r - 16), cy + s * (r - 16));
    ctx.lineTo(cx + c * (r - 7), cy + s * (r - 7));
    ctx.stroke();
  }
  ctx.textBaseline = 'alphabetic';
  ctx.font = font(14, false);
  ctx.fillStyle = MUTED;
  ctx.textAlign = 'left';
  ctx.fillText('낮음', 22, 168);
  ctx.textAlign = 'right';
  ctx.fillText('높음', w - 22, 168);
  ctx.textAlign = 'center';
  ctx.font = font(19);
  ctx.fillStyle = TEXT;
  ctx.fillText('수축 압력계', cx, h - 16);
  screen.commit();
}
