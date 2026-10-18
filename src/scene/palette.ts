// 장면 공통 색상. 산소가 적은 혈액도 붉은색(어두운 붉은색)으로 표현하며 파란색을 쓰지 않는다.

export const PALETTE = {
  /** 산소가 풍부한 혈액의 적혈구 */
  rbcRich: '#e5323f',
  /** 산소가 적은 혈액의 적혈구(어두운 붉은색 — 파란색 아님) */
  rbcPoor: '#a3203a',
  /** 혈관 속 혈장 안개 */
  plasmaRich: '#f08a8a',
  plasmaPoor: '#c8687a',
  /** 혈관 벽 */
  arteryWall: '#f26d7d',
  arteryWallDeep: '#c94a5c',
  veinWall: '#d9667e',
  veinWallDeep: '#a84761',
  capillaryWall: '#ffb3bd',
  /** 심장 근육 */
  muscle: '#d8455a',
  muscleDeep: '#9e2a40',
  muscleLight: '#ff8a96',
  /** 판막 */
  valve: '#ffe3e6',
  valveEdge: '#ffc2cb',
  chordae: '#fff1f2',
  /** 학습용 입자(실제 모양·색 아님) */
  oxygen: '#ffffff',
  oxygenGlow: '#7ee0ff',
  co2: '#5b5f6b',
  co2Accent: '#9aa0ad',
  nutrient: '#7bd36b',
  waste: '#a77b4f',
  /** 백혈구·혈소판·세균 */
  wbc: '#f7f4ee',
  wbcNucleus: '#b49ad8',
  platelet: '#f6c96b',
  bacteria: '#6fbf73',
  /** 조직 세포 */
  tissue: '#f7b267',
  tissueNucleus: '#c0703a',
  /** 폐포(공기 주머니) */
  alveolus: '#fff4e8',
  /** 관찰 지점 표시 */
  hotspot: '#ffe066',
  hotspotDone: '#7cf0b4',
  /** 홀로그램 */
  holo: '#7df9ff',
} as const;
