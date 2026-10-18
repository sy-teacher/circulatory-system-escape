import type { NodeId } from './types';

// 심장 방의 연결 구조. 3D 장면(판막 배치)과 자동 검증이 같은 데이터를 쓴다.
// 정상적인 경로에서는 왼쪽 방과 오른쪽 방이 직접 연결되지 않는다.

export type ValveType = 'tricuspid' | 'mitral' | 'pulmonary' | 'aortic';

export interface ChamberSpec {
  id: 'ra' | 'rv' | 'la' | 'lv';
  side: 'right' | 'left';
  role: 'atrium' | 'ventricle';
  inlet: { from: NodeId; valve: ValveType | null };
  outlet: { to: NodeId; valve: ValveType };
  /** 상대적인 벽 두께(좌심실 = 100). 비교 장치에 쓰인다. */
  wallIndex: number;
  /** 수축 정도(0~1). 화면 연출에 쓰인다. */
  contraction: number;
  /** 입구 혈관 개수(우심방: 대정맥 2, 좌심방: 폐정맥 4) */
  inletCount: number;
  o2: 'rich' | 'poor';
}

export const VALVE_LEAFLETS: Record<ValveType, number> = {
  tricuspid: 3, // 우심방 → 우심실 (얇은 막 3장)
  mitral: 2, // 좌심방 → 좌심실 (얇은 막 2장)
  pulmonary: 3, // 우심실 → 폐동맥 (반달 모양 3장)
  aortic: 3, // 좌심실 → 대동맥 (반달 모양 3장)
};

export const CHAMBERS: Record<ChamberSpec['id'], ChamberSpec> = {
  ra: {
    id: 'ra',
    side: 'right',
    role: 'atrium',
    inlet: { from: 'venaCava', valve: null },
    outlet: { to: 'rv', valve: 'tricuspid' },
    wallIndex: 18,
    contraction: 0.05,
    inletCount: 2,
    o2: 'poor',
  },
  rv: {
    id: 'rv',
    side: 'right',
    role: 'ventricle',
    inlet: { from: 'ra', valve: 'tricuspid' },
    outlet: { to: 'pa', valve: 'pulmonary' },
    wallIndex: 35,
    contraction: 0.12,
    inletCount: 1,
    o2: 'poor',
  },
  la: {
    id: 'la',
    side: 'left',
    role: 'atrium',
    inlet: { from: 'pv', valve: null },
    outlet: { to: 'lv', valve: 'mitral' },
    wallIndex: 22,
    contraction: 0.05,
    inletCount: 4,
    o2: 'rich',
  },
  lv: {
    id: 'lv',
    side: 'left',
    role: 'ventricle',
    inlet: { from: 'la', valve: 'mitral' },
    outlet: { to: 'aorta', valve: 'aortic' },
    wallIndex: 100,
    contraction: 0.2,
    inletCount: 1,
    o2: 'rich',
  },
};

/**
 * 벽 두께 비교 장치에 표시할 막대. 현재 방 외의 방은 이름 없이 A·B·C로 표시한다
 * (정답 이름을 노출하지 않기 위해).
 */
export function wallComparison(current: ChamberSpec['id']): { label: string; value: number; current: boolean }[] {
  const others = (Object.keys(CHAMBERS) as ChamberSpec['id'][]).filter((id) => id !== current);
  return [
    { label: '현재 방', value: CHAMBERS[current].wallIndex, current: true },
    ...others.map((id, i) => ({ label: `다른 방 ${'ABC'[i]}`, value: CHAMBERS[id].wallIndex, current: false })),
  ];
}
