import { LatheGeometry, Vector2, type BufferGeometry } from 'three';

/**
 * 적혈구: 가운데가 오목한 원반(양면 오목). 반지름 radius, y축이 원반의 두께 방향.
 * 실제 비율(가장자리 두께 ≈ 지름의 0.3, 가운데 ≈ 0.12)을 단순화했다.
 */
export function createRbcGeometry(radius = 0.5, segments = 18): BufferGeometry {
  const steps = 10;
  const half = (x: number) => radius * Math.sqrt(Math.max(0, 1 - x * x)) * (0.12 + 0.75 * x * x - 0.25 * x * x * x * x);
  const pts: Vector2[] = [];
  // 위쪽 면: 가운데 → 가장자리
  for (let i = 0; i <= steps; i++) {
    const x = i / steps;
    pts.push(new Vector2(Math.max(0.0001, x * radius), half(x)));
  }
  // 아래쪽 면: 가장자리 → 가운데
  for (let i = steps - 1; i >= 0; i--) {
    const x = i / steps;
    pts.push(new Vector2(Math.max(0.0001, x * radius), -half(x)));
  }
  // LatheGeometry는 점들이 아래→위 순서일 때 바깥쪽을 향하므로 뒤집는다
  pts.reverse();
  const g = new LatheGeometry(pts, segments);
  g.computeVertexNormals();
  return g;
}
