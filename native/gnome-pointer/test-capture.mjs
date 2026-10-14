// Run only through scripts/test-gnome-controls.py; all injected input
// belongs to its isolated X server, never the user's current desktop.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
const injector=fileURLToPath(new URL('../../scripts/gnome-controls-input.py',import.meta.url));
assert.equal(process.env.LEKHINI_CONTROLS_TEST_DISPLAY,'isolated');

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
const patch = async state => {
    await evaluate(toolbar, `window.pen.hub.update(${JSON.stringify(state)})`);
    await sleep(150);
};
const move = (x,y) => execFileSync('python3',[injector,'move',String(x),String(y)]);
const press = pressed => execFileSync('python3',[injector,'button',String(pressed)]);
const clickAt = async (x,y) => {move(Math.round(x),Math.round(y));await sleep(100);press(true);await sleep(60);press(false);await sleep(250);};
const clickControl = async (target, selector) => {
 const point = await evaluate(target,`(()=>{const e=document.querySelector(${JSON.stringify(selector)});const r=e.getBoundingClientRect();return {x:window.screenX+r.x+r.width/2,y:window.screenY+r.y+r.height/2};})()`);
 console.log('Click',selector,point);await clickAt(point.x,point.y);
};
await patch({classroomMode:true,orientation:'h',settingsOpen:false,statusPanelOpen:false,drawMode:false,autoUpdate:false,edutictacCursor:{enabled:false},edutictacClicks:{enabled:false},edutictacSpotlight:{enabled:false},edutictacMagnifier:{enabled:false},edutictacTeacherMode:{enabled:false}});
execFileSync('python3',[injector,'escape']);await sleep(700);
// Capture the isolated test desktop only. Verify the actual button, file,
// composited annotations and restoration of native drawing input.
const captureDir = join(process.env.XDG_CACHE_HOME, 'captures');
await patch({saveDir:captureDir,alwaysAskSavePath:false,drawMode:true,activeTool:'pen',settings:{color:'#ff0000'},whiteboard:'off'});
move(400,300);press(true);move(480,340);await sleep(80);press(false);await sleep(150);
await evaluate(toolbar, `window.savedCapture=null;window.captureError=null;window.pen.capture.onSaved(p=>window.savedCapture=p.path);window.pen.capture.onError(p=>window.captureError=p.message)`);
await clickControl(toolbar,'[aria-label="Guardar captura"]');
for (let i=0;i<80;i++) {
 if(await evaluate(toolbar,'!!window.savedCapture || !!window.captureError')) break;
 await sleep(100);
}
assert.equal(await evaluate(toolbar,'window.captureError'),null,'Capture reported an error');
const saved=await evaluate(toolbar,'window.savedCapture');
assert.ok(saved?.startsWith(captureDir),'Screenshot did not save in isolated folder');
const bytes=readFileSync(saved);
assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
assert.equal(bytes.readUInt32BE(16),1920);
assert.equal(bytes.readUInt32BE(20),1080);
const capturedInk=await evaluate(overlay,`(async()=>{const bytes=new Uint8Array(${JSON.stringify([...bytes])});const image=await createImageBitmap(new Blob([bytes],{type:'image/png'}));const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);const p=ctx.getImageData(400,300,90,50).data;return [...p].some((v,i)=>i%4===0 && v>100 && v>p[i+1]*1.2);})()`);
assert.equal(capturedInk,true,'Saved screenshot lost colored annotations');
assert.equal(await evaluate(toolbar,'window.pen.hub.get().then(s=>s.drawMode)'),true,'Capture did not restore drawing');
console.log('Native Capture button: PNG saved, annotated image and drawing restoration PASS');

await patch({whiteboard:'white'});
await sleep(1100);
await evaluate(toolbar,'window.savedCapture=null');
await clickControl(toolbar,'[aria-label="Guardar captura"]');
for(let i=0;i<80 && !await evaluate(toolbar,'window.savedCapture');i++) await sleep(100);
const boardFile=await evaluate(toolbar,'window.savedCapture');
assert.ok(boardFile,'Whiteboard screenshot did not save');
const boardBytes=readFileSync(boardFile);
const boardPixel=await evaluate(overlay,`(async()=>{const image=await createImageBitmap(new Blob([new Uint8Array(${JSON.stringify([...boardBytes])})],{type:'image/png'}));const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);return [...ctx.getImageData(100,100,1,1).data];})()`);
assert.deepEqual(boardPixel,[255,255,255,255],'Whiteboard background was lost');
console.log('Whiteboard screenshot background: PASS');
await patch({alwaysAskSavePath:true,whiteboard:'off'});
await evaluate(toolbar,'window.savedCapture=null');
await clickControl(toolbar,'[aria-label="Guardar captura"]');
await sleep(700);
assert.equal(await evaluate(toolbar,'window.pen.hub.get().then(s=>s.drawMode)'),false,'Native save dialog did not release drawing input');
execFileSync('python3',[injector,'escape']);
await sleep(600);
assert.equal(await evaluate(toolbar,'window.pen.hub.get().then(s=>s.drawMode)'),true,'Cancelling save did not restore drawing');
assert.equal(await evaluate(toolbar,'window.savedCapture'),null,'Cancelled save wrote a file');
console.log('Native save dialog: free mouse input, cancellation and drawing restoration PASS');

await patch({saveDir:null,alwaysAskSavePath:false});
await evaluate(toolbar,'window.savedCapture=null');
await clickControl(toolbar,'[aria-label="Guardar captura"]');
await sleep(700);
execFileSync('python3',[injector,'key','Return']);
for(let i=0;i<80 && !await evaluate(toolbar,'window.savedCapture');i++) await sleep(100);
const localizedFile=await evaluate(toolbar,'window.savedCapture');
assert.ok(localizedFile?.startsWith(join(process.env.LEKHINI_TEST_PICTURES_DIR,'Lekhini')+'/'),'Default save did not use the localized system pictures directory');
assert.equal(readFileSync(localizedFile).subarray(0,8).toString('hex'),'89504e470d0a1a0a');
console.log('Localized default folder with spaces: PNG saved in system pictures directory PASS');
