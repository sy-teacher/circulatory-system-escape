import { standaloneMapSvg } from './mapExportStyle';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('지도를 이미지로 변환하지 못했습니다.'));
    image.src = src;
  });
}

/** 보고서의 지도 SVG를 먼저 PNG로 확정해 중첩 SVG의 스타일 누락을 막는다. */
export async function rasterizeReportMaps(source: HTMLElement, target: HTMLElement): Promise<void> {
  const originals = [...source.querySelectorAll<SVGSVGElement>('.cmap svg')];
  const copies = [...target.querySelectorAll<SVGSVGElement>('.cmap svg')];
  if (originals.length !== copies.length) throw new Error('지도 복사본을 확인할 수 없습니다.');
  for (let i = 0; i < originals.length; i++) {
    const original = originals[i];
    const copy = copies[i];
    const { width, height } = copy.getBoundingClientRect();
    const computed = window.getComputedStyle(original);
    const svg = standaloneMapSvg(new XMLSerializer().serializeToString(original), width, height,
      (name) => computed.getPropertyValue(name));
    const decoded = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(width * 2);
    canvas.height = Math.ceil(height * 2);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('지도 이미지를 그릴 수 없습니다.');
    context.scale(2, 2);
    context.drawImage(decoded, 0, 0, width, height);
    const png = await loadImage(canvas.toDataURL('image/png'));
    png.alt = '순환계 지도';
    png.className = copy.getAttribute('class') ?? '';
    Object.assign(png.style, { width: `${width}px`, height: `${height}px`, display: 'block' });
    copy.replaceWith(png);
  }
}
