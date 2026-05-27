const TAU = Math.PI * 2;

export interface SectorGeometry {
  /** Sector index within the page (0-based, clockwise from 12 o'clock). */
  index: number;
  /** Path used to draw the donut wedge. */
  path: string;
  /** Centre point of the sector at mid-radius — where icon / label go. */
  centerX: number;
  centerY: number;
  /** Mid-angle in radians, for transforming child elements. */
  midAngle: number;
}

/** Build a donut-wedge path for sector `i` of `total` sectors. */
export function sectorPath(
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  total: number,
  index: number,
  gap: number = 0,
): string {
  const sweep = TAU / total;
  const halfGap = gap / 2;
  const a0 = -Math.PI / 2 + index * sweep - sweep / 2 + halfGap;
  const a1 = -Math.PI / 2 + index * sweep + sweep / 2 - halfGap;

  const largeArc = a1 - a0 > Math.PI ? 1 : 0;

  const x0o = cx + outerR * Math.cos(a0);
  const y0o = cy + outerR * Math.sin(a0);
  const x1o = cx + outerR * Math.cos(a1);
  const y1o = cy + outerR * Math.sin(a1);
  const x0i = cx + innerR * Math.cos(a0);
  const y0i = cy + innerR * Math.sin(a0);
  const x1i = cx + innerR * Math.cos(a1);
  const y1i = cy + innerR * Math.sin(a1);

  return [
    `M ${x0o} ${y0o}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${x1o} ${y1o}`,
    `L ${x1i} ${y1i}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${x0i} ${y0i}`,
    'Z',
  ].join(' ');
}

/** Compute geometry for every sector on a page. */
export function buildSectors(
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  total: number,
  gap: number = 0,
): SectorGeometry[] {
  const sweep = TAU / total;
  const midR = (innerR + outerR) / 2;
  const sectors: SectorGeometry[] = [];
  for (let i = 0; i < total; i++) {
    const mid = -Math.PI / 2 + i * sweep;
    sectors.push({
      index: i,
      path: sectorPath(cx, cy, innerR, outerR, total, i, gap),
      centerX: cx + midR * Math.cos(mid),
      centerY: cy + midR * Math.sin(mid),
      midAngle: mid,
    });
  }
  return sectors;
}

/**
 * Hit-test a pointer (relative to centre) and return the sector index, or
 * `null` if the pointer is in the dead-zone or beyond the outer ring.
 */
export function hitTestSector(
  dx: number,
  dy: number,
  innerR: number,
  outerR: number,
  total: number,
  outerTolerance: number = 24,
): number | null {
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < innerR) return null;
  if (dist > outerR + outerTolerance) return null;

  const sweep = TAU / total;
  let theta = Math.atan2(dy, dx) + Math.PI / 2;
  theta = ((theta % TAU) + TAU) % TAU;
  return Math.floor((theta + sweep / 2) / sweep) % total;
}

/** Clamp the menu centre so the bounding circle stays in the viewport. */
export function clampOrigin(
  x: number,
  y: number,
  radius: number,
  viewportW: number,
  viewportH: number,
  margin: number = 8,
): { x: number; y: number } {
  return {
    x: Math.min(Math.max(x, radius + margin), viewportW - radius - margin),
    y: Math.min(Math.max(y, radius + margin), viewportH - radius - margin),
  };
}
