/** 계산된 SVG의 페이지 주소를 자체 defs를 가리키는 내부 주소로 바꾼다. */
export function localSvgReferences(value: string): string {
  return value.replace(/url\((["']?)[^"')]*#([^"')]+)\1\)/g, 'url(#$2)');
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('지도 이미지를 만들지 못했습니다.'));
    image.src = src;
  });
}

/** 화면의 SVG를 독립된 PNG로 바꿔 보고서의 중첩 SVG 렌더링 오류를 피한다. */
export async function replaceReportMapsWithImages(source: HTMLElement, target: HTMLElement): Promise<void> {
  const originals = [...source.querySelectorAll<SVGSVGElement>('.cmap svg')]
    .filter((svg) => !svg.closest('.no-print'));
  const copies = [...target.querySelectorAll<SVGSVGElement>('.cmap svg')];
  if (originals.length !== copies.length) throw new Error('지도 복사본을 확인할 수 없습니다.');

  for (let i = 0; i < originals.length; i++) {
    const original = originals[i];
    const copy = copies[i];
    const standalone = original.cloneNode(true) as SVGSVGElement;
    const sourceNodes = [original, ...original.querySelectorAll<SVGElement>('*')];
    const imageNodes = [standalone, ...standalone.querySelectorAll<SVGElement>('*')];
    // 원본 화면에서 계산한다. 숨겨진 복사본의 CSS나 외부 스타일시트에 의존하지 않는다.
    sourceNodes.forEach((element, index) => {
      const computed = window.getComputedStyle(element);
      for (const property of computed) {
        // SVG transform 속성은 그대로 두고, 화면 좌표에 의존하는 CSS 배치는 복사하지 않는다.
        if (property === 'transform' || property === 'transform-origin') continue;
        const value = localSvgReferences(computed.getPropertyValue(property));
        imageNodes[index].style.setProperty(property, value);
      }
    });
    const { width, height } = copy.getBoundingClientRect();
    if (width <= 0 || height <= 0) throw new Error('지도 크기를 확인할 수 없습니다.');
    standalone.setAttribute('width', String(width));
    standalone.setAttribute('height', String(height));
    standalone.style.width = `${width}px`;
    standalone.style.height = `${height}px`;
    const svgData = new XMLSerializer().serializeToString(standalone);
    const svgImage = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgData)}`);
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(width * 2);
    canvas.height = Math.ceil(height * 2);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('지도 이미지를 그릴 수 없습니다.');
    context.scale(2, 2);
    context.drawImage(svgImage, 0, 0, width, height);
    const png = await loadImage(canvas.toDataURL('image/png'));
    png.alt = original.getAttribute('aria-label') ?? '순환계 지도';
    png.className = copy.getAttribute('class') ?? '';
    const layout = window.getComputedStyle(copy);
    Object.assign(png.style, {
      width: `${width}px`, height: `${height}px`, display: layout.display,
      margin: layout.margin, verticalAlign: layout.verticalAlign,
    });
    copy.replaceWith(png);
  }
}
