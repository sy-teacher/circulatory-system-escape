// 수연쌤 3D 모형용 형태(머리카락·옷깃). 캐릭터 시트 기준: 짙은 갈색 단발, 일자 앞머리, 노치드 라펠 흰 가운.

import { ExtrudeGeometry, LatheGeometry, Shape, Vector2 } from 'three';

/** 머리(구) 반지름. 얼굴 부품 위치 계산에도 쓴다. */
export const HEAD_R = 0.2;

/**
 * 정수리~앞머리 덮개(한 바퀴 전체). 아래 끝(y≈0.06)이 수평이라
 * 앞에서 보면 이마를 가로지르는 일자(뭉툭한) 앞머리가 된다.
 */
export function createHairCrownGeometry(segments: number): LatheGeometry {
  const pts = [
    new Vector2(0.19, 0.058),
    new Vector2(0.222, 0.062),
    new Vector2(0.231, 0.094),
    new Vector2(0.225, 0.13),
    new Vector2(0.204, 0.176),
    new Vector2(0.165, 0.212),
    new Vector2(0.108, 0.236),
    new Vector2(0.001, 0.247),
  ];
  return new LatheGeometry(pts, segments);
}

/**
 * 옆·뒷머리(단발). 얼굴 앞쪽은 열려 있고, 턱 높이에서 끝이 안쪽으로 살짝 말린다.
 * LatheGeometry의 phi=0은 +Z(뒤통수), phi=π는 -Z(얼굴 쪽)이다.
 */
export function createHairBobGeometry(segments: number, faceOpening = 2.3): LatheGeometry {
  const pts = [
    new Vector2(0.183, -0.178),
    new Vector2(0.204, -0.194),
    new Vector2(0.228, -0.183),
    new Vector2(0.244, -0.146),
    new Vector2(0.249, -0.085),
    new Vector2(0.247, -0.015),
    new Vector2(0.239, 0.048),
    new Vector2(0.224, 0.112),
  ];
  return new LatheGeometry(pts, segments, Math.PI + faceOpening / 2, Math.PI * 2 - faceOpening);
}

/**
 * 노치드 라펠(가운 옷깃) 한 쪽. side: +1 = 몸의 오른쪽(+X), -1 = 몸의 왼쪽(-X).
 * 가슴 앞면(XY 평면)에 그린 모양을 얇게 돌출한다(-Z 쪽으로 붙여 쓴다).
 */
export function createLapelGeometry(side: 1 | -1, depth = 0.01): ExtrudeGeometry {
  const s = side;
  const pts: [number, number][] = [
    [0.004, 0.165],
    [0.086, 0.246],
    [0.095, 0.264],
    [0.072, 0.268],
    [0.078, 0.29],
    [0.044, 0.296],
    [0.022, 0.262],
  ];
  const shape = new Shape();
  pts.forEach(([x, y], i) => (i === 0 ? shape.moveTo(x * s, y) : shape.lineTo(x * s, y)));
  shape.closePath();
  return new ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 });
}

/** 가운 사이로 보이는 노란 셔츠(V자) */
export function createShirtVGeometry(depth = 0.006): ExtrudeGeometry {
  const shape = new Shape();
  shape.moveTo(0, 0.15);
  shape.lineTo(-0.046, 0.294);
  shape.lineTo(0.046, 0.294);
  shape.closePath();
  return new ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 });
}
