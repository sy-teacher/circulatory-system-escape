// 카메라: 탐사선 운전석(왼쪽 좌석)의 눈 위치 + 둘러보기 회전.
// 화면 흔들림은 절대 넣지 않는다. 키보드 입력은 UI 쪽에서 runtime 값을 직접 바꾼다.

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Euler, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { runtime } from './runtime';

/** 운전석 눈 위치(탐사선 기준: 앞 -Z, 위 +Y, 오른쪽 +X) */
export const DRIVER_EYE = new Vector3(-0.38, 0.95, 0.15);

export const YAW_LIMIT = 2.6;
export const PITCH_MIN = -0.7;
export const PITCH_MAX = 0.85;
const DEFAULT_FOV = 62;
const FOCUS_FOV = 36;

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const damp = (k: number, dt: number) => 1 - Math.exp(-k * dt);

export interface CameraRigProps {
  reduceMotion: boolean;
  /** 확대 관찰 중인 관찰 지점 이름(없으면 null) */
  focusAnchor: string | null;
}

const _seat = new Vector3();
const _dir = new Vector3();
const _inv = new Quaternion();
const _head = new Quaternion();
const _euler = new Euler(0, 0, 0, 'YXZ');

export function CameraRig({ reduceMotion, focusAnchor }: CameraRigProps): null {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);

  const focusRef = useRef({ anchor: focusAnchor, reduceMotion });
  focusRef.current = { anchor: focusAnchor, reduceMotion };
  const lastFocus = useRef<string | null>(null);
  const focusPending = useRef(0); // 초점 지점을 찾는 남은 시간(초)

  // 화면 드래그로 둘러보기(포인터 이벤트 + 포인터 캡처)
  useEffect(() => {
    const el = gl.domElement;
    el.style.touchAction = 'none';
    let active: number | null = null;
    let lx = 0;
    let ly = 0;
    let touch = false;

    const down = (e: PointerEvent) => {
      if (active !== null) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      active = e.pointerId;
      lx = e.clientX;
      ly = e.clientY;
      touch = e.pointerType !== 'mouse';
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* 캡처를 못 해도 둘러보기는 된다 */
      }
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== active) return;
      const dx = e.clientX - lx;
      const dy = e.clientY - ly;
      lx = e.clientX;
      ly = e.clientY;
      const s = touch ? 0.0068 : 0.005;
      // 화면을 잡아 끄는 방식: 오른쪽으로 끌면 왼쪽을, 아래로 끌면 위쪽을 보게 된다
      runtime.targetYaw = clamp(runtime.targetYaw + dx * s, -YAW_LIMIT, YAW_LIMIT);
      runtime.targetPitch = clamp(runtime.targetPitch + dy * s, PITCH_MIN, PITCH_MAX);
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== active) return;
      active = null;
      try {
        if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      } catch {
        /* 무시 */
      }
    };

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('lostpointercapture', up);
    };
  }, [gl]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const { anchor, reduceMotion: rm } = focusRef.current;

    // 확대 관찰 시작/종료
    if (anchor !== lastFocus.current) {
      lastFocus.current = anchor;
      if (anchor) focusPending.current = 2;
      else {
        focusPending.current = 0;
        runtime.targetFov = DEFAULT_FOV;
      }
    }

    // 운전석 위치(월드)
    _seat.copy(DRIVER_EYE).applyQuaternion(runtime.vehicleQuaternion).add(runtime.vehiclePosition);

    if (anchor && focusPending.current > 0) {
      focusPending.current -= dt;
      const p = runtime.anchors.get(anchor);
      if (p) {
        // 관찰 지점 방향을 탐사선 기준으로 바꿔 둘러보기 각도로 만든다
        _inv.copy(runtime.vehicleQuaternion).invert();
        _dir.copy(p).sub(_seat).applyQuaternion(_inv);
        if (_dir.lengthSq() > 1e-6) {
          _dir.normalize();
          runtime.targetYaw = clamp(Math.atan2(-_dir.x, -_dir.z), -YAW_LIMIT, YAW_LIMIT);
          runtime.targetPitch = clamp(Math.asin(clamp(_dir.y, -1, 1)), PITCH_MIN, PITCH_MAX);
          runtime.targetFov = FOCUS_FOV;
        }
        focusPending.current = 0;
      }
    }

    // 목표 각도 제한(키보드 입력도 여기서 제한된다)
    runtime.targetYaw = clamp(runtime.targetYaw, -YAW_LIMIT, YAW_LIMIT);
    runtime.targetPitch = clamp(runtime.targetPitch, PITCH_MIN, PITCH_MAX);

    const kLook = rm ? 18 : 9;
    const kFov = rm ? 16 : 7;
    runtime.yaw += (runtime.targetYaw - runtime.yaw) * damp(kLook, dt);
    runtime.pitch += (runtime.targetPitch - runtime.pitch) * damp(kLook, dt);
    runtime.fov += (runtime.targetFov - runtime.fov) * damp(kFov, dt);
    if (Math.abs(runtime.fov - runtime.targetFov) < 0.01) runtime.fov = runtime.targetFov;

    // 카메라 자세 = 탐사선 자세 ∘ 좌석 위치 ∘ 머리 회전
    camera.position.copy(_seat);
    _head.setFromEuler(_euler.set(runtime.pitch, runtime.yaw, 0, 'YXZ'));
    camera.quaternion.copy(runtime.vehicleQuaternion).multiply(_head);

    if (camera instanceof PerspectiveCamera) {
      // 세로로 긴 화면(휴대폰 세로)에서는 좌우 시야가 좁아지므로 세로 화각을 넓혀 좌우 시야를 지킨다
      const f = fovForAspect(runtime.fov, camera.aspect);
      if (Math.abs(camera.fov - f) > 0.01) {
        camera.fov = f;
        camera.updateProjectionMatrix();
      }
    }
  }, -1);

  return null;
}

/** 기준 화면비(1.2)보다 좁은 화면에서 같은 좌우 시야가 나오도록 세로 화각을 넓힌다(최대 92°) */
function fovForAspect(fov: number, aspect: number): number {
  const REF = 1.2;
  if (!(aspect > 0) || aspect >= REF) return fov;
  const half = (fov * Math.PI) / 360;
  const hHalf = Math.atan(Math.tan(half) * REF);
  const v = (Math.atan(Math.tan(hHalf) / aspect) * 360) / Math.PI;
  return Math.min(92, v);
}
