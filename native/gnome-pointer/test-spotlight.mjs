// Run only through test-headless.py --app; all windows and mouse movement
// belong to the isolated compositor, never the user's current desktop.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const evaluate = async (target, expression) => {
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    const response = new Promise(resolve => { ws.onmessage = event => resolve(JSON.parse(event.data)); });
    ws.send(JSON.stringify({id: 1, method: 'Runtime.evaluate', params: {expression, awaitPromise: true, returnByValue: true}}));
    const result = await response;
    ws.close();
    assert.ok(!result.result.exceptionDetails, JSON.stringify(result.result.exceptionDetails));
    return result.result.result.value;
};
let targets;
for (let i = 0; i < 60; i++) {
    try {
        targets = await (await fetch('http://127.0.0.1:19327/json/list')).json();
        if (targets.some(t => t.url.includes('/toolbar/')) && targets.some(t => t.url.includes('/overlay/'))) break;
    } catch { /* Wait for our isolated Electron instance. */ }
    await sleep(100);
}
const toolbar = targets?.find(t => t.url.includes('/toolbar/'));
const overlay = targets?.find(t => t.url.includes('/overlay/'));
assert.ok(toolbar && overlay, 'Isolated Electron did not load its windows');
await sleep(200);
assert.equal(await evaluate(toolbar, 'window.pen.cursor.supported()'), true);
assert.equal(await evaluate(toolbar, 'window.pen.magnifier.supported()'), true);
const patch = async state => {
    await evaluate(toolbar, `window.pen.hub.update(${JSON.stringify(state)})`);
    await sleep(150);
};
const move = (x, y) => execFileSync('gdbus', ['call', '--session', '--dest', 'org.gnome.Shell',
    '--object-path', '/es/edutictac/Lekhini/Pointer', '--method', 'es.edutictac.Lekhini.Pointer.TestMove', String(x), String(y)]);
const nativeView = () => execFileSync('gdbus', ['call', '--session', '--dest', 'org.gnome.Shell',
    '--object-path', '/es/edutictac/Lekhini/Pointer', '--method', 'es.edutictac.Lekhini.Pointer.TestMagnifierView'], {encoding: 'utf8'}).trim();
const spot = () => evaluate(overlay, `(()=>{const e=document.querySelector('.edutictac-spotlight ellipse');return e?{x:+e.getAttribute('cx'),y:+e.getAttribute('cy'),rx:+e.getAttribute('rx'),ry:+e.getAttribute('ry')}:null})()`);

await patch({edutictacCursor: {enabled: true, size: 44, shape: 'ring'}});
assert.equal(await evaluate(toolbar, 'window.pen.cursor.native()'), true);
move(500, 600);
await sleep(100);
assert.equal(await evaluate(overlay, "!!document.querySelector('.edutictac-cursor')"), false);
assert.equal(execFileSync('gdbus', ['call', '--session', '--dest', 'org.gnome.Shell',
    '--object-path', '/es/edutictac/Lekhini/Pointer', '--method', 'es.edutictac.Lekhini.Pointer.TestCursorView'], {encoding: 'utf8'}).trim(), '(true, 478.0, 578.0, 44.0, true)');
execFileSync('gdbus', ['call', '--session', '--dest', 'org.gnome.Shell',
    '--object-path', '/es/edutictac/Lekhini/Pointer', '--method', 'es.edutictac.Lekhini.Pointer.TestCursorDrop']);
await sleep(200);
assert.equal(await evaluate(toolbar, 'window.pen.cursor.native()'), false);
assert.equal(await evaluate(overlay, "!!document.querySelector('.edutictac-cursor')"), true);
await patch({edutictacCursor: {enabled: false}});
assert.equal(await evaluate(toolbar, 'window.pen.cursor.native()'), false);
console.log('Electron delegates to GNOME without a duplicate circle and falls back on native loss: PASS');

await patch({autoUpdate: false, edutictacCursor: {enabled: false}, edutictacClicks: {enabled: false}, edutictacSpotlight: {enabled: true, shape: 'ellipse', width: 400, height: 200, locked: false}});
move(300, 400);
await sleep(200);
assert.deepEqual(await spot(), {x: 300, y: 400, rx: 200, ry: 100});
await patch({edutictacSpotlight: {locked: true}});
move(900, 500);
await sleep(200);
assert.deepEqual(await spot(), {x: 300, y: 400, rx: 200, ry: 100});
await patch({edutictacSpotlight: {locked: false}});
assert.deepEqual(await spot(), {x: 900, y: 500, rx: 200, ry: 100});
await patch({edutictacSpotlight: {enabled: false}});
assert.equal(await spot(), null);
console.log('Spotlight follows native GNOME movement; lock, unlock and disable: PASS');

await patch({edutictacTeacherMode: {enabled: true, cursor: false, clicks: false, keystrokes: false, annotations: false, spotlight: true, magnifier: true}});
assert.ok(await spot());
assert.equal(nativeView(), '(true, 2.0)');
await patch({edutictacTeacherMode: {enabled: false}});
assert.equal(await spot(), null);
assert.ok(nativeView().startsWith('(false,'));
console.log('Teacher Mode enables Spotlight and native zoom and releases both: PASS');
