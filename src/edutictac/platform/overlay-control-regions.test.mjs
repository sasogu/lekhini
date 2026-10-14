import test from 'node:test';
import assert from 'node:assert/strict';
import {drawingRegions} from './overlay-control-regions.ts';

const covers = (r, x, y) => x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height;
for (const [name, bounds, controls] of [
  ['toolbar in the middle', {x: 0, y: 0, width: 100, height: 80}, [{x: 35, y: 20, width: 20, height: 40}]],
  ['toolbar and overlapping flyout', {x: 0, y: 0, width: 100, height: 80}, [{x: 35, y: 20, width: 20, height: 40}, {x: 45, y: 10, width: 40, height: 30}]],
  ['monitor left of primary', {x: -100, y: 20, width: 100, height: 80}, [{x: -70, y: 35, width: 20, height: 40}]],
  ['control crossing monitor edge', {x: 0, y: 0, width: 100, height: 80}, [{x: -10, y: 60, width: 40, height: 30}]],
  ['control on another monitor', {x: 0, y: 0, width: 100, height: 80}, [{x: 110, y: 20, width: 20, height: 40}]],
]) {
  test(name + ': control pixels never capture input; other pixels still draw', () => {
    const regions = drawingRegions(bounds, controls);
    for (let y = 0; y < bounds.height; y++) for (let x = 0; x < bounds.width; x++) {
      const blocked = controls.some((c) => covers(c, x + bounds.x, y + bounds.y));
      assert.equal(regions.some((r) => covers(r, x, y)), !blocked, `${x},${y}`);
    }
    for (const r of regions) assert.ok(r.width > 0 && r.height > 0 && r.x >= 0 && r.y >= 0);
  });
}
test('fully covered overlay must become click-through, not reset to a full input shape', () => {
  assert.deepEqual(drawingRegions({x: 0, y: 0, width: 80, height: 60}, [{x: -10, y: -10, width: 100, height: 80}]), []);
});
test('fractional control edges reserve the whole pixel', () => {
  const regions = drawingRegions({x: 0, y: 0, width: 100, height: 80}, [{x: 20.5, y: 10.5, width: 20, height: 20}]);
  assert.equal(regions.some((r) => covers(r, 20, 10)), false);
  assert.equal(regions.some((r) => covers(r, 40, 30)), false);
  assert.equal(regions.some((r) => covers(r, 41, 31)), true);
});
