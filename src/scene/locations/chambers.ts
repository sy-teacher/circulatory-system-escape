// 심장의 네 방 공간 정의. 장면은 HeartChamber, 경로·벽 설계는 heart/design에 있다.
// 혈장 안개는 따뜻한 붉은 분홍색이며, 산소가 적은 혈액이 있는 오른쪽 방은 조금 더 어두운 붉은색이다(파란색 아님).
import type { LocationDef } from '../types';
import { CHAMBER_CURVES, chamberLane } from './heart/design';
import { LaChamber, LvChamber, RaChamber, RvChamber } from './HeartChamber';

const POOR = {
  background: '#b85d6e',
  fog: { color: '#b85d6e', near: 9, far: 48 },
  ambient: { sky: '#ffd9d4', ground: '#9a3a4e', intensity: 1.55 },
};

const RICH = {
  background: '#e08088',
  fog: { color: '#e08088', near: 10, far: 52 },
  ambient: { sky: '#ffe9e2', ground: '#b24c5c', intensity: 1.7 },
};

export const raLocation: LocationDef = {
  id: 'ra',
  path: CHAMBER_CURVES.ra,
  laneHalfWidth: chamberLane,
  ...POOR,
  vehicle: 'probe',
  heartbeat: 1.0,
  Component: RaChamber,
};

export const rvLocation: LocationDef = {
  id: 'rv',
  path: CHAMBER_CURVES.rv,
  laneHalfWidth: chamberLane,
  ...POOR,
  vehicle: 'probe',
  heartbeat: 1.0,
  Component: RvChamber,
};

export const laLocation: LocationDef = {
  id: 'la',
  path: CHAMBER_CURVES.la,
  laneHalfWidth: chamberLane,
  ...RICH,
  vehicle: 'probe',
  heartbeat: 1.0,
  Component: LaChamber,
};

export const lvLocation: LocationDef = {
  id: 'lv',
  path: CHAMBER_CURVES.lv,
  laneHalfWidth: chamberLane,
  ...RICH,
  vehicle: 'probe',
  heartbeat: 1.0,
  Component: LvChamber,
};
