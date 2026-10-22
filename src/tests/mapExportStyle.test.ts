import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Resvg } from '@resvg/resvg-js';
import { describe, expect, it } from 'vitest';
import baseCss from '../styles/base.css?raw';
import { standaloneMapSvg } from '../report/mapExportStyle';
import { CirculationMap, type MapRecord } from '../ui/map/CirculationMap';

const variables = Object.fromEntries([...baseCss.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2]]));
const readVariable = (name: string) => variables[name] ?? '';

function mapMarkup(complete: boolean): string {
  const record: MapRecord = {
    discovered: ['lv', 'aorta', 'sysCap'], firstResponses: {},
    latest: { 'q-s1': { solved: true, attempts: 1 }, 'q-s2': { solved: true, attempts: 2 } },
  };
  const html = renderToStaticMarkup(createElement(CirculationMap, {
    record, mode: complete ? 'complete' : 'play', currentNode: null,
    currentLabel: null, showCirculation: complete,
  }));
  return html.match(/<svg class="cmap-svg"[\s\S]*?<\/svg>/)![0];
}

function render(svg: string) {
  return new Resvg(svg, { background: '#fffaf1', font: { defaultFontFamily: 'Malgun Gothic' } }).render();
}

function pixel(image: ReturnType<typeof render>, x: number, y: number): number[] {
  return [...image.pixels.subarray((y * image.width + x) * 4, (y * image.width + x) * 4 + 3)];
}

describe('지도 저장 실제 PNG 렌더링', () => {
  it('CSS가 빠진 지도는 실제로 검정색이 되는 오류를 재현한다', () => {
    const svg = mapMarkup(false).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="540" ');
    expect(pixel(render(svg), 300, 40)).toEqual([0, 0, 0]);
  });

  it.each([false, true])('스타일을 포함한 지도(완료=%s)는 PNG에서도 배경과 혈관 색을 유지한다', (complete) => {
    const svg = standaloneMapSvg(mapMarkup(complete), 600, 540, readVariable);
    expect(svg).not.toContain('var(');
    const image = render(svg);
    expect(pixel(image, 202, 330)).toEqual([255, 240, 241]);
    expect(pixel(image, 40, 475)).toEqual([255, 246, 234]);
    if (!complete) expect(pixel(image, 300, 40)).toEqual([253, 241, 243]);
    let rich = 0;
    const pixels = image.pixels;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i] === 232 && pixels[i + 1] === 57 && pixels[i + 2] === 74) rich++;
    }
    expect(rich).toBeGreaterThan(100);
    expect([...image.asPng().subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  });

  it('스타일이 없으면 검정색 지도를 저장하지 않고 실패를 알린다', () => {
    expect(() => standaloneMapSvg(mapMarkup(false), 600, 540, () => '')).toThrow('지도 색상 설정');
  });
});
