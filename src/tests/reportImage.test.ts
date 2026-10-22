import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('html-to-image', () => ({ toBlob: vi.fn() }));
import { toBlob } from 'html-to-image';
import { renderReportImage, reportImageRatio } from '../report/reportImage';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe('학습 결과 PNG 저장', () => {
  it('짧은 결과는 선명하게, 긴 결과는 캔버스 길이와 픽셀 예산 안에서 저장한다', () => {
    expect(reportImageRatio(900, 1000)).toBe(2);
    for (const height of [5000, 12000, 30000]) {
      const ratio = reportImageRatio(900, height);
      expect(height * ratio).toBeLessThanOrEqual(16000);
      expect(900 * height * ratio * ratio).toBeLessThanOrEqual(16000001);
    }
  });

  function reportDom() {
    const timer = { remove: vi.fn() };
    const clone = {
      style: {}, scrollWidth: 900, scrollHeight: 7000,
      querySelectorAll: vi.fn((selector: string): unknown[] => selector === '.no-print' ? [timer] : []),
    };
    const host = {
      style: {}, className: '', inert: false,
      setAttribute: vi.fn(), appendChild: vi.fn(), remove: vi.fn(),
    };
    vi.stubGlobal('document', {
      fonts: { ready: Promise.resolve() },
      createElement: vi.fn(() => host),
      body: { appendChild: vi.fn() },
    });
    const sheet = {
      closest: () => ({ className: 'report-root is-large-text' }),
      cloneNode: () => clone,
      querySelectorAll: () => [],
    } as unknown as HTMLElement;
    return { sheet, host, clone, timer };
  }

  it('현재 스크롤 위치 대신 보고서 전체 높이를 내보내고 원본은 보존한다', async () => {
    const { sheet, host, clone, timer } = reportDom();
    const png = new Blob(['png'], { type: 'image/png' });
    vi.mocked(toBlob).mockResolvedValue(png);
    expect(await renderReportImage(sheet)).toBe(png);
    expect(toBlob).toHaveBeenCalledWith(clone, expect.objectContaining({
      width: 900, height: 7000, backgroundColor: '#fff',
    }));
    expect(host.className).toBe('report-root is-large-text');
    expect(timer.remove).toHaveBeenCalledOnce();
    expect(host.remove).toHaveBeenCalledOnce();
  });

  it.each(['error', 'empty'] as const)('이미지 생성 실패(%s) 시 임시 보고서를 남기지 않는다', async (mode) => {
    const { sheet, host } = reportDom();
    if (mode === 'error') vi.mocked(toBlob).mockRejectedValue(new Error('canvas failed'));
    else vi.mocked(toBlob).mockResolvedValue(null);
    await expect(renderReportImage(sheet)).rejects.toThrow();
    expect(host.remove).toHaveBeenCalledOnce();
  });

  it('지도 SVG의 영역 색·빈 연결선·글자·화살표와 무늬를 이미지 복사본에 보존한다', async () => {
    const { sheet, clone } = reportDom();
    const svgElement = (values: Record<string, string>) => ({
      values, style: { setProperty: vi.fn() },
    });
    const region = svgElement({ fill: 'rgb(255, 240, 241)', stroke: 'rgb(239, 178, 187)', 'stroke-width': '1.5px' });
    const edge = svgElement({
      fill: 'none', stroke: 'rgb(90, 42, 154)', 'stroke-dasharray': '9px, 4px',
      'marker-end': 'url("http://localhost:5173/#cm-arrow-poor")',
    });
    const text = svgElement({ fill: 'rgb(43, 35, 51)', 'font-size': '13px', 'font-weight': '800', 'text-anchor': 'middle' });
    const pattern = svgElement({ fill: 'url("http://localhost:5173/#cm-mesh")' });
    const svg = { ...svgElement({ fill: 'rgb(0, 0, 0)' }), querySelectorAll: () => [region, edge, text, pattern] };
    clone.querySelectorAll.mockImplementation((selector) => selector === 'svg' ? [svg] : []);
    vi.stubGlobal('window', {
      getComputedStyle: (element: { values: Record<string, string> }) => ({
        getPropertyValue: (name: string) => element.values[name] ?? '',
      }),
    });
    vi.mocked(toBlob).mockImplementation(async () => {
      // SVG 자식이 CSS 없이 그대로 복사되어도 이미 색과 선 스타일이 들어 있어야 한다.
      expect(region.style.setProperty).toHaveBeenCalledWith('fill', 'rgb(255, 240, 241)');
      expect(region.style.setProperty).toHaveBeenCalledWith('stroke', 'rgb(239, 178, 187)');
      expect(edge.style.setProperty).toHaveBeenCalledWith('fill', 'none');
      expect(edge.style.setProperty).toHaveBeenCalledWith('stroke-dasharray', '9px, 4px');
      expect(edge.style.setProperty).toHaveBeenCalledWith('marker-end', 'url(#cm-arrow-poor)');
      expect(text.style.setProperty).toHaveBeenCalledWith('font-size', '13px');
      expect(text.style.setProperty).toHaveBeenCalledWith('font-weight', '800');
      expect(pattern.style.setProperty).toHaveBeenCalledWith('fill', 'url(#cm-mesh)');
      return new Blob(['png'], { type: 'image/png' });
    });
    await renderReportImage(sheet);
    expect(toBlob).toHaveBeenCalledOnce();
  });
});
