import { afterEach, describe, expect, it, vi } from 'vitest';
import { localSvgReferences, replaceReportMapsWithImages } from '../report/svgImage';

afterEach(() => vi.unstubAllGlobals());

describe('보고서 지도 PNG 합성', () => {
  it('화살표·무늬 주소가 원래 웹페이지를 참조하지 않는다', () => {
    expect(localSvgReferences('url("http://localhost:5173/#cm-mesh")')).toBe('url(#cm-mesh)');
    expect(localSvgReferences('url(#cm-arrow)')).toBe('url(#cm-arrow)');
    expect(localSvgReferences('none')).toBe('none');
  });

  function setup(contextAvailable = true) {
    const region = { style: { setProperty: vi.fn() } };
    const standalone = {
      style: { setProperty: vi.fn() }, setAttribute: vi.fn(),
      querySelectorAll: () => [region],
    };
    const originalRegion = {};
    const original = {
      closest: () => null, cloneNode: () => standalone,
      querySelectorAll: () => [originalRegion], getAttribute: () => '현재 순환계 지도',
    };
    const copy = {
      getBoundingClientRect: () => ({ width: 800, height: 720 }),
      getAttribute: () => 'cmap-svg', replaceWith: vi.fn(),
    };
    const source = { querySelectorAll: () => [original] } as unknown as HTMLElement;
    const target = { querySelectorAll: () => [copy] } as unknown as HTMLElement;
    vi.stubGlobal('window', {
      getComputedStyle: (element: unknown) => {
        const values: Record<string, string> = element === originalRegion
          ? { fill: 'rgb(255, 240, 241)', stroke: 'rgb(239, 178, 187)', 'stroke-width': '1.5px' }
          : { fill: 'none', 'font-size': '13px' };
        return {
          *[Symbol.iterator]() { yield* Object.keys(values); },
          getPropertyValue: (name: string) => values[name] ?? '',
          display: 'block', margin: '0px', verticalAlign: 'baseline',
        };
      },
    });
    const serializeToString = vi.fn(() => '<svg xmlns="http://www.w3.org/2000/svg"/>');
    vi.stubGlobal('XMLSerializer', class { serializeToString = serializeToString; });
    class FakeImage {
      style = {};
      onload?: () => void;
      onerror?: () => void;
      source = '';
      set src(value: string) {
        this.source = value;
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal('Image', FakeImage);
    const context = { scale: vi.fn(), drawImage: vi.fn() };
    const canvas = {
      width: 0, height: 0,
      getContext: () => contextAvailable ? context : null,
      toDataURL: vi.fn(() => 'data:image/png;base64,cG5n'),
    };
    vi.stubGlobal('document', { createElement: () => canvas });
    return { source, target, standalone, region, copy, context, canvas, serializeToString };
  }

  it('원본 지도의 스타일로 먼저 PNG를 만든 뒤 SVG 자리를 PNG로 대체한다', async () => {
    const { source, target, standalone, region, copy, context, canvas, serializeToString } = setup();
    await replaceReportMapsWithImages(source, target);
    expect(region.style.setProperty).toHaveBeenCalledWith('fill', 'rgb(255, 240, 241)');
    expect(region.style.setProperty).toHaveBeenCalledWith('stroke', 'rgb(239, 178, 187)');
    expect(serializeToString).toHaveBeenCalledWith(standalone);
    expect(canvas.width).toBe(1600);
    expect(canvas.height).toBe(1440);
    expect(context.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 800, 720);
    expect(copy.replaceWith).toHaveBeenCalledWith(expect.objectContaining({
      source: 'data:image/png;base64,cG5n', alt: '현재 순환계 지도',
      style: expect.objectContaining({ width: '800px', height: '720px' }),
    }));
  });

  it('지도 PNG 변환 실패 시 검정 지도나 빈 이미지를 넣고 계속 저장하지 않는다', async () => {
    const { source, target, copy } = setup(false);
    await expect(replaceReportMapsWithImages(source, target)).rejects.toThrow('지도 이미지를 그릴 수 없습니다.');
    expect(copy.replaceWith).not.toHaveBeenCalled();
  });
});
