type Region = { displayId: number; x: number; y: number; width: number; height: number };
type Point = { displayId: number; x: number; y: number; displayWidth: number; displayHeight: number };

/** Screen edges clip the sample; no tile can extend beyond them. */
export function regionCoversPoint(region: Region, point: Point, margin: number): boolean {
  return region.displayId === point.displayId &&
    region.x <= Math.max(0, point.x - margin) &&
    region.y <= Math.max(0, point.y - margin) &&
    region.x + region.width >= Math.min(point.displayWidth, point.x + margin) &&
    region.y + region.height >= Math.min(point.displayHeight, point.y + margin);
}
