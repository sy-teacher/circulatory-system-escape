import { Billboard, Html } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Group, Mesh, Vector3 } from 'three';
import { runtime } from '../runtime';
import { PALETTE } from '../palette';

export interface HotspotProps {
  anchor: string;
  position: [number, number, number];
  /** 현재 단계에서 관찰할 수 있는 지점인지(아니면 표시하지 않음) */
  active: boolean;
  observed: boolean;
  label?: string;
  onSelect: (anchor: string) => void;
  /** 표시 고리 크기 */
  size?: number;
}

/**
 * 관찰 지점 표시. 반짝이는 고리 + 접근 가능한 버튼(키보드 Tab으로도 선택 가능).
 * 월드 위치를 runtime.anchors에 기록해 카메라가 이 지점을 바라볼 수 있게 한다.
 */
export function Hotspot({ anchor, position, active, observed, label, onSelect, size = 0.7 }: HotspotProps) {
  const group = useRef<Group>(null);
  const ring = useRef<Mesh>(null);
  const world = useRef(new Vector3());

  useEffect(() => {
    return () => {
      runtime.anchors.delete(anchor);
    };
  }, [anchor]);

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    g.getWorldPosition(world.current);
    runtime.anchors.set(anchor, world.current);
    if (ring.current) {
      const s = observed ? 1 : 1 + 0.18 * Math.sin(runtime.time * 4);
      ring.current.scale.setScalar(s);
    }
  });

  if (!active) {
    // 위치 등록은 유지(카메라 초점용)하되 표시는 하지 않는다.
    return <group ref={group} position={position} />;
  }

  const click = (e: ThreeEvent<MouseEvent>) => {
    // 드래그로 둘러본 경우에는 선택하지 않는다
    if (e.delta > 6) return;
    e.stopPropagation();
    onSelect(anchor);
  };

  return (
    <group ref={group} position={position}>
      <Billboard>
        <mesh ref={ring} onClick={click}>
          <torusGeometry args={[size, size * 0.12, 8, 28]} />
          <meshBasicMaterial color={observed ? PALETTE.hotspotDone : PALETTE.hotspot} toneMapped={false} />
        </mesh>
        <mesh onClick={click}>
          <circleGeometry args={[size * 0.9, 20]} />
          <meshBasicMaterial color={observed ? PALETTE.hotspotDone : PALETTE.hotspot} transparent opacity={0.18} toneMapped={false} depthWrite={false} />
        </mesh>
      </Billboard>
      <Html center zIndexRange={[20, 0]} style={{ pointerEvents: 'auto' }}>
        <button
          type="button"
          className={`hotspot-btn${observed ? ' is-done' : ''}`}
          aria-label={`관찰 지점: ${label ?? anchor}${observed ? ' (확인함)' : ''}`}
          title={label}
          onClick={(ev) => {
            ev.stopPropagation();
            onSelect(anchor);
          }}
        >
          {observed ? '✓' : '?'}
        </button>
      </Html>
    </group>
  );
}
