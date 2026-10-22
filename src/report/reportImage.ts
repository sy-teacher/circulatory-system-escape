import { toBlob } from 'html-to-image';
import { localSvgReferences, replaceReportMapsWithImages } from './svgImage';

const SVG_STYLE_PROPERTIES = [
  'color', 'fill', 'fill-opacity', 'fill-rule',
  'stroke', 'stroke-opacity', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
  'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset',
  'opacity', 'paint-order', 'vector-effect', 'visibility', 'display',
  'font-family', 'font-size', 'font-weight', 'font-style',
  'letter-spacing', 'word-spacing', 'text-anchor', 'dominant-baseline',
  'alignment-baseline', 'baseline-shift', 'white-space',
  'marker-start', 'marker-mid', 'marker-end', 'clip-path', 'clip-rule',
  'mask', 'filter', 'stop-color', 'stop-opacity', 'shape-rendering', 'text-rendering',
] as const;

/** html-to-image는 SVG 자식의 CSS를 복사하지 않으므로 저장용 복사본에 고정한다. */
function inlineSvgStyles(root: HTMLElement): void {
  for (const svg of root.querySelectorAll<SVGSVGElement>('svg')) {
    for (const element of [svg, ...svg.querySelectorAll<SVGElement>('*')]) {
      const computed = window.getComputedStyle(element);
      for (const property of SVG_STYLE_PROPERTIES) {
        const value = computed.getPropertyValue(property);
        if (!value) continue;
        // 계산된 marker/pattern 주소가 원래 페이지를 가리키지 않게 SVG 내부 참조로 보존한다.
        const localValue = localSvgReferences(value);
        element.style.setProperty(property, localValue);
      }
    }
  }
}

/** 긴 보고서도 캔버스의 최대 길이·메모리 범위 안에 들어오도록 한다. */
export function reportImageRatio(width: number, height: number): number {
  return Math.min(2, 16000 / Math.max(width, height), Math.sqrt(16000000 / (width * height)));
}

/** 화면 밖에 보고서 전체를 펼쳐 지도·표·오답 설명까지 PNG로 만든다. */
export async function renderReportImage(sheet: HTMLElement): Promise<Blob> {
  await document.fonts.ready;
  const host = document.createElement('div');
  host.className = sheet.closest('.report-root')?.className ?? 'report-root';
  host.setAttribute('aria-hidden', 'true');
  host.inert = true;
  Object.assign(host.style, {
    position: 'fixed', inset: 'auto', left: '-10000px', top: '0',
    width: '900px', height: 'auto', overflow: 'visible', padding: '0',
    zIndex: '-1', background: '#fff', pointerEvents: 'none',
  });
  const clone = sheet.cloneNode(true) as HTMLElement;
  Object.assign(clone.style, {
    width: '900px', maxWidth: 'none', height: 'auto', margin: '0',
    boxSizing: 'border-box', boxShadow: 'none', borderRadius: '0',
  });
  clone.querySelectorAll('.no-print').forEach((node) => node.remove());
  host.appendChild(clone);
  document.body.appendChild(host);
  try {
    // 문서에 연결된 상태에서 CSS 변수·상속까지 계산한 값을 가져와야 한다.
    inlineSvgStyles(clone);
    // 지도는 원본 화면의 스타일을 담은 PNG로 먼저 확정한 다음 보고서에 합성한다.
    await replaceReportMapsWithImages(sheet, clone);
    const width = clone.scrollWidth;
    const height = clone.scrollHeight;
    if (!width || !height) throw new Error('보고서 크기를 확인할 수 없습니다.');
    const blob = await toBlob(clone, {
      width, height, pixelRatio: reportImageRatio(width, height),
      backgroundColor: '#fff', skipFonts: true,
    });
    if (!blob || !blob.size) throw new Error('이미지를 만들지 못했습니다.');
    return blob;
  } finally {
    host.remove();
  }
}
