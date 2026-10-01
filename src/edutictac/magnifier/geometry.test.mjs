import { test } from 'node:test';
import assert from 'node:assert/strict';
import { regionCoversPoint } from './geometry.ts';

test('clipped corners keep the same capture instead of restarting on every event', () => {
  for (const [x, y, tileX, tileY] of [[0,0,0,0], [1919,0,1600,0], [0,1079,0,760], [1919,1079,1600,760]]) {
    const point = {displayId: 5, x, y, displayWidth: 1920, displayHeight: 1080};
    assert.equal(regionCoversPoint({displayId:5, x:tileX,y:tileY,width:320,height:320}, point, 90), true);
  }
});
test('leaving a region or changing display requires a new capture', () => {
  const region = {displayId:5,x:0,y:0,width:320,height:320};
  const point = {displayId:5,x:160,y:160,displayWidth:1920,displayHeight:1080};
  assert.equal(regionCoversPoint(region,point,90),true);
  assert.equal(regionCoversPoint(region,{...point,x:300},90),false);
  assert.equal(regionCoversPoint(region,{...point,displayId:2},90),false);
});
