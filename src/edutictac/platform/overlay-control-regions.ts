import type { Rectangle } from 'electron';

/** Keep drawing input outside visible controls, in overlay-local coordinates. */
export function drawingRegions(bounds: Rectangle, controls: Rectangle[]): Rectangle[] {
  let regions: Rectangle[] = [{ x: 0, y: 0, width: bounds.width, height: bounds.height }];
  for (const control of controls) {
    const cut = {
      x: Math.floor(control.x - bounds.x), y: Math.floor(control.y - bounds.y),
      right: Math.ceil(control.x + control.width - bounds.x),
      bottom: Math.ceil(control.y + control.height - bounds.y),
    };
    regions = regions.flatMap((region) => {
      const right = region.x + region.width, bottom = region.y + region.height;
      const x = Math.max(region.x, cut.x), y = Math.max(region.y, cut.y);
      const endX = Math.min(right, cut.right), endY = Math.min(bottom, cut.bottom);
      if (endX <= x || endY <= y) return [region];
      return [
        { x: region.x, y: region.y, width: region.width, height: y - region.y },
        { x: region.x, y: endY, width: region.width, height: bottom - endY },
        { x: region.x, y, width: x - region.x, height: endY - y },
        { x: endX, y, width: right - endX, height: endY - y },
      ].filter((r) => r.width > 0 && r.height > 0);
    });
  }
  return regions;
}
