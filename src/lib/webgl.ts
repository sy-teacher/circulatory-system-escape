/** WebGL 2 사용 가능 여부(학교 노트북·크롬북·태블릿의 기본 렌더링 경로) */
export function detectWebGL2(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    const ok = !!gl;
    // 확인용 컨텍스트는 바로 해제한다
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return ok;
  } catch {
    return false;
  }
}
