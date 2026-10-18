// 관찰 지점 묶음: 공용 Hotspot을 LocationProps에 맞춰 배치한다.

import type { LocationProps } from '../../types';
import { Hotspot } from '../../shared/Hotspot';
import type { V3 } from './common';

export interface SpotDef {
  anchor: string;
  position: V3;
  size?: number;
}

export function Spots({ spots, props }: { spots: SpotDef[]; props: LocationProps }) {
  return (
    <>
      {spots.map((s) => (
        <Hotspot
          key={s.anchor}
          anchor={s.anchor}
          position={s.position}
          size={s.size}
          active={props.activeAnchors.includes(s.anchor)}
          observed={props.observedAnchors.includes(s.anchor)}
          label={props.anchorLabels[s.anchor]}
          onSelect={props.onAnchorClick}
        />
      ))}
    </>
  );
}
