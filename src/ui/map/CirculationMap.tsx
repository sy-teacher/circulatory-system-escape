// 순환계 지도(정면 교과서식 모식도): 위 = 허파, 가운데 = 심장(4개의 방), 아래 = 온몸.
// 정답 노출 규칙
//  - play: 밝혀낸 지점(record.discovered)과 해결한 연결선(visibleEdges)만 그린다.
//          아직 모르는 지점은 그 위치에 아무것도 그리지 않는다(빈 칸도 정답 힌트가 되므로).
//  - complete: 모두 그린다(마지막 활동·탈출·보고서).
//  - 학생의 오답은 상태 배지로만 보이며, 지도의 연결선이 되지 않는다(지도에는 올바른 과학만).
// 색만으로 구분하지 않는다: 산소 상태는 기호색 + 글자 + 아이콘(+ 선 모양), 학습 상태는 색 + 아이콘 + 글자.

import { useId, type KeyboardEvent } from 'react';
import {
  EXCHANGE_ZONES,
  MAP_COLOR_NOTE,
  MAP_EDGES,
  MAP_NODES,
  MAP_SIDE_NOTE,
  MAP_VIEWBOX,
  O2_LABEL,
} from '../../data/map';
import { STEP_MAP } from '../../data/route';
import type { Circulation, MapEdge, MapNode, NodeId, O2Level } from '../../data/types';
import { nodeStatuses, visibleEdges } from '../../state/selectors';
import { STATUS_META, type LearningRecord, type QuestionStatus } from '../../state/types';
import './CirculationMap.css';

export type MapMode = 'play' | 'complete';

export interface MapSelection {
  pulmonary: NodeId[];
  systemic: NodeId[];
  active: Circulation;
  onToggle(n: NodeId): void;
}

export type MapRecord = Pick<LearningRecord, 'discovered' | 'latest' | 'firstResponses'>;

export interface CirculationMapProps {
  record: MapRecord;
  /** '📍 현재 위치'를 표시할 지점(mapCurrentNode). null이면 위치를 숨긴다. */
  currentNode: NodeId | null;
  /** currentNode가 null일 때 지도 위에 보여 줄 위치 글자. 생략하면 '? (추론 중)', null이면 상자를 숨긴다. */
  currentLabel?: string | null;
  mode?: MapMode;
  selection?: MapSelection;
  showCirculation?: boolean;
  compact?: boolean;
  /** 지점별 학습 상태 배지(선택 모드에서는 자동으로 숨김) */
  showStatus?: boolean;
  /** 지도 아래 범례: full(기본) · mini(산소 표시 + 기호색 안내만) · none */
  legend?: 'full' | 'mini' | 'none';
  className?: string;
  /** 화면 읽기 프로그램용 지도 제목 */
  label?: string;
}

// ── 배치(MAP_VIEWBOX 600×540 좌표계) ─────────────────────────────

type Pt = readonly [number, number];
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const NODE_ORDER: NodeId[] = ['lungCap', 'pa', 'pv', 'ra', 'la', 'rv', 'lv', 'venaCava', 'aorta', 'sysCap'];
const VENTRICLE_TOP = 286;

/** 지점 카드의 사각형(심실은 벽이 두꺼운 방이라 조금 더 크게) */
function nodeBox(n: MapNode): Box {
  if (n.kind === 'chamber') {
    if (n.id === 'rv' || n.id === 'lv') return { x: n.x - 44, y: VENTRICLE_TOP, w: 88, h: 94 };
    return { x: n.x - 44, y: n.y - 32, w: 88, h: 64 };
  }
  if (n.kind === 'capillary') return { x: n.x - 88, y: n.y - 31, w: 176, h: 62 };
  return { x: n.x - 52, y: n.y - 31, w: 104, h: 62 };
}

interface Route {
  pts: Pt[];
  /** 산소 표시 글자의 가운데 */
  label: Pt;
  /** 짧은 연결선(심방 → 심실)에서 글자와 화살표를 잇는 점선 */
  leader?: [Pt, Pt];
}

// 직각으로 꺾인 연결선. 몸의 오른쪽(화면 왼쪽)에서는 대정맥 선과 폐동맥 선이 한 번 겹쳐 지나간다(다리 모양으로 표시).
const ROUTES: Record<string, Route> = {
  'lv>aorta': { pts: [[392, 318], [480, 318], [480, 365]], label: [480, 341] },
  'aorta>sysCap': { pts: [[480, 427], [480, 486], [388, 486]], label: [480, 456] },
  'sysCap>venaCava': { pts: [[212, 486], [104, 486], [104, 427]], label: [104, 456] },
  'venaCava>ra': { pts: [[104, 365], [104, 250], [208, 250]], label: [104, 318] },
  'ra>rv': { pts: [[252, 268], [252, 286]], label: [164, 277], leader: [[204, 277], [246, 277]] },
  'rv>pa': { pts: [[208, 350], [44, 350], [44, 150], [116, 150]], label: [44, 250] },
  'pa>lungCap': { pts: [[168, 119], [168, 62], [212, 62]], label: [168, 92] },
  'lungCap>pv': { pts: [[388, 62], [432, 62], [432, 119]], label: [432, 92] },
  'pv>la': { pts: [[432, 181], [432, 220], [392, 220]], label: [480, 200] },
  'la>lv': { pts: [[348, 268], [348, 286]], label: [436, 277], leader: [[396, 277], [354, 277]] },
};

const MARKER_POS: Record<NodeId, { x: number; y: number; anchor: 'start' | 'middle' | 'end' }> = {
  lungCap: { x: 300, y: 103, anchor: 'middle' },
  pa: { x: 168, y: 191, anchor: 'middle' },
  pv: { x: 488, y: 150, anchor: 'start' },
  ra: { x: 204, y: 222, anchor: 'end' },
  la: { x: 396, y: 240, anchor: 'start' },
  rv: { x: 204, y: 296, anchor: 'end' },
  lv: { x: 396, y: 300, anchor: 'start' },
  venaCava: { x: 176, y: 400, anchor: 'start' },
  aorta: { x: 424, y: 400, anchor: 'end' },
  sysCap: { x: 300, y: 529, anchor: 'middle' },
};

const ARROW_GAP = 6;
const TAG_FONT = 9.5;
const TAG_LINE = 11.5;
const PILL_FONT = 9.5;

// ── 글자 폭 어림(SVG에서는 미리 잴 수 없어 대략 계산) ─────────────

export function estimateTextWidth(s: string, size: number): number {
  let w = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    if (ch === ' ') w += 0.3;
    else if (c >= 0xac00 && c <= 0xd7a3) w += 0.96;
    else if (c >= 0x2000) w += 1.0;
    else if (/[A-Z0-9]/.test(ch)) w += 0.64;
    else w += 0.5;
  }
  return w * size;
}

/** 낱말 단위로 줄을 나눈다 */
function wrapWords(text: string, maxW: number, size: number): string[] {
  const words = text.split(' ').filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (cur && estimateTextWidth(next, size) > maxW) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

// ── 작은 SVG 부품 ────────────────────────────────────────────────

interface TagSpec {
  key: string;
  lines: string[];
  cls: string;
}

function tagSize(t: TagSpec): { w: number; h: number } {
  const w = Math.max(...t.lines.map((l) => estimateTextWidth(l, TAG_FONT))) + 10;
  return { w, h: t.lines.length * TAG_LINE + 6 };
}

function Pill({ x, y, text, anchor = 'middle', cls, font = PILL_FONT }: { x: number; y: number; text: string; anchor?: 'start' | 'middle' | 'end'; cls: string; font?: number }) {
  const w = estimateTextWidth(text, font) + 10;
  const h = font + 7;
  const left = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x;
  return (
    <g className={cls}>
      <rect x={left} y={y - h / 2} width={w} height={h} rx={h / 2} />
      <text x={left + w / 2} y={y + font * 0.36} textAnchor="middle" fontSize={font}>
        {text}
      </text>
    </g>
  );
}

function pathD(pts: Pt[], shortenEnd: number): string {
  const p = pts.map(([x, y]) => [x, y] as [number, number]);
  if (shortenEnd > 0 && p.length >= 2) {
    const a = p[p.length - 2];
    const b = p[p.length - 1];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const k = Math.min(shortenEnd, len - 1) / len;
    p[p.length - 1] = [b[0] - dx * k, b[1] - dy * k];
  }
  return p.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
}

const CIRC_NAME: Record<Circulation, string> = { pulmonary: '허파순환', systemic: '온몸순환' };

function o2Text(o2: O2Level): string {
  return `${O2_LABEL[o2].text} ${O2_LABEL[o2].icon}`;
}

// ── 지도 ─────────────────────────────────────────────────────────

export function CirculationMap({
  record,
  currentNode,
  currentLabel,
  mode = 'play',
  selection,
  showCirculation = false,
  compact = false,
  showStatus = true,
  legend,
  className,
  label,
}: CirculationMapProps) {
  const rawId = useId();
  const uid = 'cm' + rawId.replace(/[^a-zA-Z0-9_-]/g, '');
  const complete = mode === 'complete';
  const selecting = !!selection;
  const statusOn = showStatus && !selecting;
  const legendMode = legend ?? (compact ? 'mini' : 'full');

  const drawn = new Set<NodeId>(complete ? NODE_ORDER : NODE_ORDER.filter((n) => record.discovered.includes(n)));
  const edges: MapEdge[] = (complete ? MAP_EDGES : visibleEdges(record)).filter((e) => drawn.has(e.from) && drawn.has(e.to));
  const hiddenCount = NODE_ORDER.length - drawn.size;
  const s10Solved = !!record.latest[STEP_MAP.S10.questionId]?.solved;

  /** 지점별 학습 상태 배지 */
  const statusTags = (id: NodeId): TagSpec[] => {
    if (!statusOn) return [];
    let list = nodeStatuses(record, id);
    // 좌심실의 '귀환' 배지는 마지막 단계를 해결하기 전에는 그리지 않는다(마지막 방의 이름이 드러나지 않게).
    if (id === 'lv' && !complete && !s10Solved) list = list.filter((s) => s.stepId !== 'S10');
    return list.map(({ stepId, status }) => {
      const m = STATUS_META[status];
      const prefix = id === 'lv' ? (stepId === 'S1' ? '출발 ' : '귀환 ') : '';
      return {
        key: stepId,
        lines: wrapWords(`${prefix}${m.icon} ${m.label}`, 78, TAG_FONT),
        cls: `cmap-tag status-${status}`,
      };
    });
  };

  const selectionTags = (id: NodeId): TagSpec[] => {
    if (!selection) return [];
    const out: TagSpec[] = [];
    if (selection.pulmonary.includes(id)) out.push({ key: 'p', lines: ['✔ 허파순환'], cls: 'cmap-tag cmap-sel-tag is-pulmonary' });
    if (selection.systemic.includes(id)) out.push({ key: 's', lines: ['✔ 온몸순환'], cls: 'cmap-tag cmap-sel-tag is-systemic' });
    if (out.length === 0) out.push({ key: 'n', lines: ['눌러서 고르기'], cls: 'cmap-tag cmap-sel-tag is-none' });
    return out;
  };

  const onNodeKey = (e: KeyboardEvent<SVGGElement>, id: NodeId) => {
    if (!selection) return;
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      e.stopPropagation();
      selection.onToggle(id);
    }
  };

  // 화면 읽기 프로그램용 요약
  const nodeNames = NODE_ORDER.filter((n) => drawn.has(n)).map((n) => MAP_NODES[n].name);
  const edgeTexts = edges.map((e) => `${MAP_NODES[e.from].name} → ${MAP_NODES[e.to].name}(${O2_LABEL[e.o2].text})`);
  const desc = [
    complete ? '완성된 순환계 지도입니다.' : `지금까지 밝혀낸 지점: ${nodeNames.length ? nodeNames.join(', ') : '아직 없음'}.`,
    edgeTexts.length ? `혈액이 흐르는 경로: ${edgeTexts.join(', ')}.` : '아직 밝혀낸 경로가 없습니다.',
    !complete && hiddenCount > 0 ? `아직 탐험하지 않은 구역 ${hiddenCount}곳.` : '',
    currentNode && drawn.has(currentNode) ? `현재 위치: ${MAP_NODES[currentNode].name}.` : '',
  ]
    .filter(Boolean)
    .join(' ');

  const showUnknownBox = !complete && !currentNode && currentLabel !== null;
  const vbW = MAP_VIEWBOX.width;
  const vbH = MAP_VIEWBOX.height;
  const mapTitle = label ?? (complete ? '완성된 순환계 지도' : '순환계 탐험 지도');

  return (
    <figure className={['cmap', compact ? 'is-compact' : '', selecting ? 'is-selecting' : '', className ?? ''].filter(Boolean).join(' ')}>
      {(showUnknownBox || (!complete && hiddenCount > 0)) && (
        <div className="cmap-strip">
          {showUnknownBox && (
            <span className="cmap-where">
              <span aria-hidden="true">📍</span> 현재 위치: {currentLabel ?? '? (추론 중)'}
            </span>
          )}
          {!complete && hiddenCount > 0 && (
            <span className="cmap-unknown">
              아직 탐험하지 않은 구역: <strong aria-hidden="true">? × {hiddenCount}</strong>
              <span className="visually-hidden">{hiddenCount}곳</span>
            </span>
          )}
        </div>
      )}

      <svg
        className="cmap-svg"
        viewBox={`0 0 ${vbW} ${vbH}`}
        role={selecting ? 'group' : 'img'}
        aria-labelledby={`${uid}-title`}
        aria-describedby={`${uid}-desc`}
        focusable={selecting ? undefined : 'false'}
      >
        <title id={`${uid}-title`}>{mapTitle}</title>
        <desc id={`${uid}-desc`}>{desc}</desc>
        <defs>
          {(['rich', 'poor'] as const).map((o2) => (
            <marker
              key={o2}
              id={`${uid}-arrow-${o2}`}
              viewBox="0 0 10 10"
              refX={10 - ARROW_GAP / 1.1}
              refY={5}
              markerUnits="userSpaceOnUse"
              markerWidth={11}
              markerHeight={11}
              orient="auto"
            >
              <path d="M0,0 L10,5 L0,10 Z" className={`cmap-arrow is-${o2}`} />
            </marker>
          ))}
          <pattern id={`${uid}-mesh`} width={12} height={12} patternUnits="userSpaceOnUse">
            <path d="M0,6 Q3,2 6,6 T12,6 M6,0 Q2,3 6,6 T6,12" className="cmap-mesh" />
          </pattern>
          <pattern id={`${uid}-hatch`} width={8} height={8} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width={8} height={8} className="cmap-hatch-bg" />
            <line x1={0} y1={0} x2={0} y2={8} className="cmap-hatch" />
          </pattern>
          <pattern id={`${uid}-dots`} width={8} height={8} patternUnits="userSpaceOnUse">
            <rect width={8} height={8} className="cmap-dots-bg" />
            <circle cx={4} cy={4} r={1.6} className="cmap-dots" />
          </pattern>
        </defs>

        {/* 영역(옅은 배경) */}
        <g className="cmap-regions" aria-hidden="true">
          <rect x={196} y={4} width={208} height={112} rx={36} className="cmap-region is-lung" />
          <text x={208} y={23} className="cmap-region-label">
            허파
          </text>
          <rect x={198} y={196} width={204} height={192} rx={30} className="cmap-region is-heart" />
          <rect x={30} y={430} width={540} height={108} rx={30} className="cmap-region is-body" />
          <text x={44} y={528} className="cmap-region-label">
            온몸
          </text>
          <Pill x={252} y={189} text="몸의 오른쪽" cls="cmap-side" font={9} />
          <Pill x={300} y={189} text="심장" cls="cmap-side is-heart" font={10.5} />
          <Pill x={348} y={189} text="몸의 왼쪽" cls="cmap-side" font={9} />
          <line x1={300} y1={206} x2={300} y2={384} className="cmap-septum" />
        </g>

        {/* 순환 범위 */}
        {showCirculation && (
          <g className="cmap-circ" aria-hidden="true">
            {NODE_ORDER.filter((n) => drawn.has(n)).map((n) => {
              const node = MAP_NODES[n];
              const b = nodeBox(node);
              const o = node.kind === 'chamber' ? 3 : 4;
              return (
                <rect
                  key={n}
                  x={b.x - o}
                  y={b.y - o}
                  width={b.w + o * 2}
                  height={b.h + o * 2}
                  rx={14}
                  className={`cmap-circ-outline is-${node.circulation}`}
                />
              );
            })}
            <g className="cmap-circ-label is-pulmonary">
              <line x1={14} y1={36} x2={34} y2={36} className="cmap-circ-outline is-pulmonary" />
              <text x={38} y={40}>
                허파순환
              </text>
            </g>
            <g className="cmap-circ-label is-systemic">
              <line x1={500} y1={524} x2={520} y2={524} className="cmap-circ-outline is-systemic" />
              <text x={524} y={528}>
                온몸순환
              </text>
            </g>
          </g>
        )}

        {/* 연결선: 바탕색 테두리를 먼저 그려 나중 선이 앞선 선 위를 '다리'처럼 지나간다 */}
        <g className="cmap-edges" aria-hidden="true">
          {edges.map((e) => {
            const r = ROUTES[`${e.from}>${e.to}`];
            if (!r) return null;
            return (
              <g key={`${e.from}-${e.to}`}>
                <path d={pathD(r.pts, ARROW_GAP)} className="cmap-edge-casing" />
                <path
                  d={pathD(r.pts, ARROW_GAP)}
                  className={`cmap-edge is-${e.o2}`}
                  markerEnd={`url(#${uid}-arrow-${e.o2})`}
                />
              </g>
            );
          })}
          {edges.map((e) => {
            const r = ROUTES[`${e.from}>${e.to}`];
            if (!r) return null;
            return (
              <g key={`l-${e.from}-${e.to}`}>
                {r.leader && (
                  <line x1={r.leader[0][0]} y1={r.leader[0][1]} x2={r.leader[1][0]} y2={r.leader[1][1]} className={`cmap-leader is-${e.o2}`} />
                )}
                <Pill x={r.label[0]} y={r.label[1]} text={o2Text(e.o2)} cls={`cmap-o2 is-${e.o2}`} />
              </g>
            );
          })}
        </g>

        {/* 산소량이 바뀌는 구간 */}
        <g className="cmap-exchange" aria-hidden="true">
          {EXCHANGE_ZONES.filter((z) => drawn.has(z.node)).map((z) => {
            const b = nodeBox(MAP_NODES[z.node]);
            const text = `${z.label} ${z.change === 'up' ? '▲O₂' : '▼O₂'}`;
            return (
              <Pill
                key={z.node}
                x={b.x + b.w / 2}
                y={b.y - 10}
                text={text}
                cls={`cmap-zone is-${z.change}`}
                font={10}
              />
            );
          })}
        </g>

        {/* 지점 */}
        <g className="cmap-nodes">
          {NODE_ORDER.filter((n) => drawn.has(n)).map((id) => {
            const node = MAP_NODES[id];
            const b = nodeBox(node);
            const tags = selecting ? selectionTags(id) : statusTags(id);
            const sizes = tags.map(tagSize);
            const contentH = 16 + sizes.reduce((a, s, i) => a + s.h + (i === 0 ? 4 : 3), 0);
            const top = b.y + (b.h - contentH) / 2;
            const cx = b.x + b.w / 2;
            const isCurrent = currentNode === id;
            const inP = !!selection?.pulmonary.includes(id);
            const inS = !!selection?.systemic.includes(id);
            const pressed = selection ? (selection.active === 'pulmonary' ? inP : inS) : undefined;
            let ty = top + 16 + 4;
            const interactive = selection
              ? {
                  role: 'button',
                  tabIndex: 0,
                  'aria-pressed': pressed,
                  'aria-label': `${node.name}: ${CIRC_NAME[selection.active]}${pressed ? '에 넣었어요' : '에 넣지 않았어요'}${
                    inP && selection.active !== 'pulmonary' ? ' (허파순환에 들어 있음)' : ''
                  }${inS && selection.active !== 'systemic' ? ' (온몸순환에 들어 있음)' : ''}`,
                  onClick: () => selection.onToggle(id),
                  onKeyDown: (e: KeyboardEvent<SVGGElement>) => onNodeKey(e, id),
                }
              : { 'aria-hidden': true as const };
            return (
              <g
                key={id}
                className={[
                  'cmap-node',
                  `is-${node.kind}`,
                  isCurrent ? 'is-current' : '',
                  pressed ? 'is-pressed' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                {...interactive}
              >
                <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={node.kind === 'chamber' ? 16 : 22} className="cmap-card" />
                {node.kind === 'capillary' && (
                  <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={22} fill={`url(#${uid}-mesh)`} className="cmap-card-pattern" />
                )}
                {inP && <rect x={b.x + 3} y={b.y + 3} width={b.w - 6} height={b.h - 6} rx={13} fill={`url(#${uid}-hatch)`} className="cmap-sel-fill" />}
                {inS && (
                  <rect
                    x={b.x + 3}
                    y={b.y + 3}
                    width={b.w - 6}
                    height={b.h - 6}
                    rx={13}
                    fill={`url(#${uid}-dots)`}
                    className="cmap-sel-fill"
                    opacity={inP ? 0.6 : 1}
                  />
                )}
                <text x={cx} y={top + 12.5} textAnchor="middle" className="cmap-name">
                  {node.name}
                </text>
                {tags.map((t, i) => {
                  const s = sizes[i];
                  const y0 = ty;
                  ty += s.h + 3;
                  return (
                    <g key={t.key} className={t.cls}>
                      <rect x={cx - s.w / 2} y={y0} width={s.w} height={s.h} rx={6} />
                      {t.lines.map((line, li) => (
                        <text key={li} x={cx} y={y0 + 3 + 8.6 + li * TAG_LINE} textAnchor="middle" fontSize={TAG_FONT}>
                          {line}
                        </text>
                      ))}
                    </g>
                  );
                })}
              </g>
            );
          })}
        </g>

        {/* 현재 위치 */}
        {currentNode && drawn.has(currentNode) && (
          <g className="cmap-current" aria-hidden="true">
            <Pill
              x={MARKER_POS[currentNode].x}
              y={MARKER_POS[currentNode].y}
              anchor={MARKER_POS[currentNode].anchor}
              text="📍 현재 위치"
              cls="cmap-here"
              font={10}
            />
          </g>
        )}
      </svg>

      {legendMode !== 'none' && (
        <MapLegend mini={legendMode === 'mini'} showCirculation={showCirculation} selecting={selecting} />
      )}
    </figure>
  );
}

// ── 범례 ─────────────────────────────────────────────────────────

export interface MapLegendProps {
  mini?: boolean;
  showCirculation?: boolean;
  selecting?: boolean;
  /** 지도(figure) 안에서는 figcaption, 따로 둘 때는 div */
  as?: 'figcaption' | 'div';
  className?: string;
}

export function MapLegend({ mini = false, showCirculation = false, selecting = false, as = 'figcaption', className }: MapLegendProps) {
  const Tag = as;
  return (
    <Tag className={['cmap-legend', mini ? 'is-mini' : '', className ?? ''].filter(Boolean).join(' ')}>
      <ul className="cmap-legend-list">
        {(['rich', 'poor'] as const).map((o2) => (
          <li key={o2}>
            <svg className="cmap-legend-line" viewBox="0 0 44 12" aria-hidden="true" focusable="false">
              <line x1={2} y1={6} x2={34} y2={6} className={`cmap-edge is-${o2}`} />
              <path d="M34,1 L43,6 L34,11 Z" className={`cmap-arrow is-${o2}`} />
            </svg>
            <span>
              <strong>{o2Text(o2)}</strong> {o2 === 'rich' ? '산소가 풍부한 혈액' : '산소가 적은 혈액'}
            </span>
          </li>
        ))}
        {!mini && (
          <li>
            <span className="cmap-legend-icon" aria-hidden="true">
              ➜
            </span>
            <span>화살표: 혈액이 흐르는 방향(심장에서 나가는 혈관 = 동맥, 심장으로 들어오는 혈관 = 정맥)</span>
          </li>
        )}
        {showCirculation && (
          <>
            <li>
              <svg className="cmap-legend-line" viewBox="0 0 44 12" aria-hidden="true" focusable="false">
                <line x1={2} y1={6} x2={42} y2={6} className="cmap-circ-outline is-pulmonary" />
              </svg>
              <span>
                <strong>허파순환</strong> 우심실 → 폐동맥 → 허파의 모세혈관 → 폐정맥 → 좌심방
              </span>
            </li>
            <li>
              <svg className="cmap-legend-line" viewBox="0 0 44 12" aria-hidden="true" focusable="false">
                <line x1={2} y1={6} x2={42} y2={6} className="cmap-circ-outline is-systemic" />
              </svg>
              <span>
                <strong>온몸순환</strong> 좌심실 → 대동맥 → 온몸의 모세혈관 → 대정맥 → 우심방
              </span>
            </li>
          </>
        )}
        {selecting && (
          <li>
            <span className="cmap-legend-swatch is-pulmonary" aria-hidden="true" />
            <span>빗금 + ✔ 허파순환</span>
            <span className="cmap-legend-swatch is-systemic" aria-hidden="true" />
            <span>점무늬 + ✔ 온몸순환</span>
          </li>
        )}
      </ul>
      <p className="cmap-note">{MAP_COLOR_NOTE}</p>
      {!mini && <p className="cmap-note">{MAP_SIDE_NOTE}</p>}
      {!mini && <p className="cmap-note">지도의 크기와 위치는 이해를 돕기 위해 단순하게 그렸어요.</p>}
    </Tag>
  );
}

/** 학습 상태 5가지(아이콘 + 글자 + 색) */
export function StatusLegend({ className }: { className?: string }) {
  const order: QuestionStatus[] = ['first-correct', 'hint-correct', 'wrong-then-solved', 'needs-review', 'unchecked'];
  return (
    <ul className={['status-legend', className].filter(Boolean).join(' ')} aria-label="학습 상태 표시">
      {order.map((s) => (
        <li key={s}>
          <StatusBadge status={s} />
        </li>
      ))}
    </ul>
  );
}

export function StatusBadge({ status, prefix }: { status: QuestionStatus; prefix?: string }) {
  const m = STATUS_META[status];
  return (
    <span className={`status-badge status-${status}`}>
      {prefix && <span className="status-badge-prefix">{prefix}</span>}
      <span aria-hidden="true">{m.icon}</span>
      {m.label}
    </span>
  );
}
