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
      querySelectorAll: vi.fn(() => [timer]),
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
});
