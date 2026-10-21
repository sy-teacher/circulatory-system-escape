import { toBlob } from 'html-to-image';

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
