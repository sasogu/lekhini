// Run only through scripts/test-gnome-controls.py; all injected input
// belongs to its isolated X server, never the user's current desktop.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
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
await patch({orientation:'h',settingsOpen:false,drawMode:false,autoUpdate:false,edutictacCursor:{enabled:false},edutictacClicks:{enabled:false},edutictacSpotlight:{enabled:false},edutictacMagnifier:{enabled:false},edutictacTeacherMode:{enabled:false}});
execFileSync('python3',[injector,'escape']);await sleep(600);

await evaluate(toolbar,"window.nativeClicks=0; document.addEventListener('click',()=>window.nativeClicks++,true)");
await evaluate(overlay,"window.nativeDowns=0; document.addEventListener('pointerdown',()=>window.nativeDowns++,true)");
await clickControl(toolbar,'.eye-btn');

assert.equal(await evaluate(toolbar,'window.nativeClicks'),1,'Toolbar did not receive native click');
assert.equal(await evaluate(toolbar,'window.pen.hub.get().then(s=>s.drawMode)'),true,'Drawing toggle did not activate');
await clickAt(600,500);
assert.equal(await evaluate(overlay,'window.nativeDowns'),1,'Overlay did not receive native drawing input');
await clickControl(toolbar,'.eye-btn');
assert.equal(await evaluate(toolbar,'window.pen.hub.get().then(s=>s.drawMode)'),false,'Toolbar blocked while drawing');
await clickControl(toolbar,'[aria-label="Settings"]');
assert.equal(await evaluate(toolbar,'window.pen.hub.get().then(s=>s.settingsOpen)'),true,'Settings did not open');
await patch({orientation:'v',settingsOpen:false,drawMode:true,activeTool:'pen'});
await clickControl(toolbar,'.color-dot');
assert.equal(await evaluate(toolbar,'window.pen.hub.get().then(s=>s.flyout)'), 'color');
let flyout;
for (let i=0;i<30;i++) {
 const list=await (await fetch('http://127.0.0.1:19327/json/list')).json();
 flyout=list.find(t=>t.url.includes('/flyout/'));
 if (flyout && await evaluate(flyout,"!!document.querySelector('.swatch')")) break;
 await sleep(100);
}
assert.ok(flyout,'Color flyout did not load');
await sleep(300);
const color=await evaluate(flyout,"document.querySelectorAll('.swatch')[2].getAttribute('title').toLowerCase()");
await clickControl(flyout,'.swatch:nth-child(3)');
assert.equal(await evaluate(toolbar,'window.pen.hub.get().then(s=>s.settings.color.toLowerCase())'),color,'Flyout blocked by annotation overlay');
await clickControl(toolbar,'.eye-btn');
assert.equal(await evaluate(toolbar,'window.pen.hub.get().then(s=>s.drawMode)'),false,'Vertical pause button blocked');
console.log('Native GNOME/X11 input: drawing, pause, settings, vertical layout and color flyout PASS');

await patch({drawMode:true,activeTool:'pen',flyout:null,settingsOpen:false});
const hasInk = () => evaluate(overlay,`[...document.querySelectorAll('canvas')].some(c=>{const p=c.getContext('2d').getImageData(760,560,320,180).data;return p.some((v,i)=>i%4===3 && v>0)})`);
move(400,300);await sleep(100);press(true);
for (let i=1;i<=5;i++) {move(400+i*20,300+i*8);await sleep(60);}
press(false);await sleep(250);
assert.equal(await hasInk(),true,'Native stroke did not render');
await clickControl(toolbar,'[aria-label="Clear all annotations"]');
assert.equal(await hasInk(),false,'Clear all left visible ink');
console.log('Native stroke and Clear all: PASS');
await patch({activeTool:'text',drawMode:true});
await clickAt(400,300);
await sleep(250);
assert.equal(await evaluate(overlay,"!!document.querySelector('.text-prompt')"),true,'Text editor did not open');
for (const key of ['h','o','l','a']) {execFileSync('python3',[injector,'key',key]);await sleep(30);}
assert.equal(await evaluate(overlay,"document.querySelector('.text-prompt').value"),'hola','Text field did not receive native keyboard input');
console.log('Native text input: PASS');
execFileSync('python3',[injector,'key','Return']);await sleep(200);
assert.equal(await evaluate(overlay,"!!document.querySelector('.text-prompt')"),false,'Enter did not commit text');
assert.equal(await hasInk(),true,'Committed text did not render');
await clickControl(toolbar,'[aria-label="Clear all annotations"]');
assert.equal(await hasInk(),false,'Clear all left committed text');
await clickAt(400,300);execFileSync('python3',[injector,'key','Escape']);await sleep(200);
assert.equal(await evaluate(overlay,"!!document.querySelector('.text-prompt')"),false,'Escape did not cancel text');
console.log('Text commit, Clear all text and cancellation: PASS');
await patch({activeTool:'pen',drawMode:true});
move(400,300);press(true);move(450,320);await sleep(150);
assert.equal(await hasInk(),true,'In-progress stroke did not render');
await evaluate(toolbar,'window.pen.relay.clear()');await sleep(150);
assert.equal(await hasInk(),false,'Clear all left an in-progress stroke');
press(false);await sleep(150);
assert.equal(await hasInk(),false,'Cleared stroke came back on mouse release');
console.log('Clear all during an unfinished stroke: PASS');


await patch({classroomMode:true,orientation:'v',drawMode:false,activeTool:'pen'});
await sleep(500);
assert.equal(await evaluate(toolbar,"!!document.querySelector('.classroom-controls')"),true);
assert.equal(await evaluate(toolbar,"[...document.querySelectorAll('.classroom-btn')].every(b=>b.getBoundingClientRect().width>=56 && b.getBoundingClientRect().height>=56)"),true,'Touch targets too small');
await clickControl(toolbar,'[data-tool="pen"]');
assert.equal(await evaluate(toolbar,'window.pen.hub.get().then(s=>s.drawMode)'),true);
move(400,300);press(true);move(450,320);await sleep(100);press(false);await sleep(100);
assert.equal(await hasInk(),true);
await clickControl(toolbar,'[data-action="clear"]');
assert.equal(await hasInk(),true,'First tap erased without confirmation');
await clickControl(toolbar,'[data-action="clear"]');
assert.equal(await hasInk(),false,'Confirmed classroom clear failed');
await clickControl(toolbar,'[aria-label="Color y grosor"]');
await sleep(300);
assert.equal(await evaluate(flyout,"[...document.querySelectorAll('.swatch')].every(b=>b.getBoundingClientRect().width>=44 && b.getBoundingClientRect().height>=44)"),true,'Palette touch targets too small');
await clickControl(flyout,'.swatch:nth-child(3)');
await clickControl(toolbar,'[data-action="desktop"]');
assert.equal(await evaluate(toolbar,'window.pen.hub.get().then(s=>s.drawMode)'),false);
await clickControl(toolbar,'[data-action="board"]');
assert.equal(await evaluate(toolbar,'window.pen.hub.get().then(s=>s.whiteboard)'), 'white');
await clickControl(toolbar,'[data-action="desktop"]');
assert.equal(await evaluate(toolbar,'window.pen.hub.get().then(s=>s.whiteboard)'), 'off','Desktop button left whiteboard covering the desktop');
await clickControl(toolbar,'[data-action="board"]');

await clickControl(toolbar,'[data-action="board"]');
assert.equal(await evaluate(toolbar,'window.pen.hub.get().then(s=>s.whiteboard)'), 'black');
await clickControl(toolbar,'[data-action="board"]');
assert.equal(await evaluate(toolbar,'window.pen.hub.get().then(s=>s.whiteboard)'), 'off');
await patch({orientation:'h'});
assert.equal(await evaluate(toolbar,"[...document.querySelectorAll('.classroom-btn')].every(b=>{const r=b.getBoundingClientRect();const s=document.querySelector('.scroll-area').getBoundingClientRect();return r.y>=0&&r.bottom<=innerHeight&&r.x>=s.x&&r.right<=s.right})"),true,'Horizontal classroom buttons clipped');
// Save only the isolated toolbar, never any real desktop content.
const ws=new WebSocket(toolbar.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
const shot=new Promise(r=>ws.onmessage=e=>r(JSON.parse(e.data)));
ws.send(JSON.stringify({id:2,method:'Page.captureScreenshot',params:{format:'png'}}));
const screenshot=await shot;ws.close();
const {writeFileSync}=await import('node:fs');writeFileSync('/tmp/lekhini-aula-toolbar.png',Buffer.from(screenshot.result.data,'base64'));
await clickControl(toolbar,'[aria-label="Volver a la barra normal"]');
assert.equal(await evaluate(toolbar,'window.pen.hub.get().then(s=>s.classroomMode)'),false);
assert.equal(await evaluate(toolbar,"!!document.querySelector('.eye-btn')"),true);
await patch({classroomMode:true});
const {readFileSync}=await import('node:fs');
const {join}=await import('node:path');
assert.equal(JSON.parse(readFileSync(join(process.env.XDG_CONFIG_HOME,'Lekhini','config.json'),'utf8')).classroomMode,true,'Classroom preference not persisted');
console.log('Classroom mode: native tools, safe clear, desktop, board, touch palette, both layouts and exit PASS');
