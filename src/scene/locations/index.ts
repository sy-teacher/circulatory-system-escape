// 공간(장면) 등록부. 각 공간 파일은 LocationDef 하나를 내보낸다.
import type { LocationId } from '../../data/types';
import type { LocationDef } from '../types';
import { laLocation, lvLocation, raLocation, rvLocation } from './chambers';
import { aortaLocation } from './Aorta';
import { venaCavaLocation } from './VenaCava';
import { paLocation } from './PulmonaryArtery';
import { pvLocation } from './PulmonaryVein';
import { sysCapLocation } from './SystemicCapillaries';
import { lungCapLocation } from './LungCapillaries';
import { parkLocation } from './Park';

export const LOCATIONS: Record<LocationId, LocationDef> = {
  park: parkLocation,
  lv: lvLocation,
  aorta: aortaLocation,
  sysCap: sysCapLocation,
  venaCava: venaCavaLocation,
  ra: raLocation,
  rv: rvLocation,
  pa: paLocation,
  lungCap: lungCapLocation,
  pv: pvLocation,
  la: laLocation,
};
