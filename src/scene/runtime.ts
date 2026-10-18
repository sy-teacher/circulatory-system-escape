// 3D 장면에서 매 프레임 바뀌는 값. React 상태로 두지 않고(리렌더링 방지) 이 모듈의 변수로 공유한다.

import { Quaternion, Vector3 } from 'three';

/** 심장 박동 주기(초). 장면의 수축·판막·효과음이 같은 박자를 쓴다. 64 bpm */
export const BEAT_PERIOD = 60 / 64;

/** 박동 기준 시각(performance.now 기준, ms). 효과음도 이 시각에 맞춘다. */
export const BEAT_EPOCH = typeof performance !== 'undefined' ? performance.now() : 0;

export const runtime = {
  /** 둘러보기 각도(라디안). yaw: 좌우(+는 왼쪽), pitch: 위아래(+는 위) */
  yaw: 0,
  pitch: 0,
  targetYaw: 0,
  targetPitch: 0,
  /** 카메라 화각(확대 관찰 시 좁아짐) */
  fov: 62,
  targetFov: 62,

  /** 조향 입력(-1 왼쪽 ~ 1 오른쪽). 키보드·화면 버튼이 쓴다. */
  steerInput: 0,
  /** 현재 좌우 위치(-1~1, 혈관 반지름 대비 허용 범위 안에서) */
  lateral: 0,

  /** 탐사선의 월드 위치·회전(VehicleController가 매 프레임 갱신) */
  vehiclePosition: new Vector3(),
  vehicleQuaternion: new Quaternion(),
  /** 탐사선이 경로 위 어디에 있는지(0~1) */
  pathT: 0,
  /** 현재 공간의 자유 반지름(조향 한계 계산용) */
  freeRadius: 4,

  /** 관찰 지점(anchor) 이름 → 월드 위치. Hotspot이 매 프레임 갱신한다. */
  anchors: new Map<string, Vector3>(),

  /** 이동 진행률(0~1). HUD 진행 막대가 requestAnimationFrame으로 읽는다. */
  travelProgress: 0,
  /** '이동 건너뛰기' 요청 */
  skipRequested: false,

  /** 박동 위상(0~1)과 수축 정도(0~1). 0.0~0.35 구간이 심실 수축기. */
  beatPhase: 0,
  contraction: 0,
  /** 심방 수축(심실 수축 직전) 0~1 */
  atrialContraction: 0,

  /** 장면 전환용 검은 화면 불투명도(0~1). FadeOverlay가 읽는다. */
  fade: 0,

  /** 장면 시간(일시정지 중에는 흐르지 않음) */
  time: 0,
};

/** 시점 초기화 */
export function resetView(): void {
  runtime.targetYaw = 0;
  runtime.targetPitch = 0;
  runtime.targetFov = 62;
}

/** 주어진 시각(초, 장면 시간)의 박동 값 계산 */
export function beatAt(timeSec: number): { phase: number; ventricle: number; atrium: number } {
  const phase = (((timeSec / BEAT_PERIOD) % 1) + 1) % 1;
  // 심실 수축: 0~0.35 구간에서 부드럽게 올라갔다 내려감
  const ventricle = phase < 0.35 ? Math.sin((phase / 0.35) * Math.PI) : 0;
  // 심방 수축: 다음 심실 수축 직전(0.82~1.0)
  const atrium = phase > 0.82 ? Math.sin(((phase - 0.82) / 0.18) * Math.PI) : 0;
  return { phase, ventricle, atrium };
}
