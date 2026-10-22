import mapCss from '../ui/map/CirculationMap.css?raw';

/** 외부 CSS·CSS 변수 없이도 그릴 수 있는 독립 SVG를 만든다. */
export function standaloneMapSvg(
  markup: string,
  width: number,
  height: number,
  readVariable: (name: string) => string,
): string {
  if (!(width > 0 && height > 0)) throw new Error('지도 크기를 확인할 수 없습니다.');
  const css = mapCss.replace(/var\((--[\w-]+)(?:,\s*([^)]*))?\)/g, (_match, name: string, fallback?: string) => {
    const value = readVariable(name).trim() || fallback?.trim();
    if (!value) throw new Error(`지도 색상 설정을 확인할 수 없습니다: ${name}`);
    return value;
  });
  const style = `${css}\nsvg { width: ${width}px !important; height: ${height}px !important; }`
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;');
  if (!/^<svg\b/.test(markup)) throw new Error('지도 SVG를 확인할 수 없습니다.');
  return markup.replace(/^<svg\b([^>]*)>/, (_match, attributes: string) => {
    const rest = attributes.replace(/\s(?:xmlns|width|height)=(['"])[\s\S]*?\1/g, '');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"${rest}><style type="text/css">${style}</style>`;
  });
}
