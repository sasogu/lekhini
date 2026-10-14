import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validShortcutLabel, LinuxShortcutObserver} from './linux-observer.ts';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';

test('normal control combinations and special keys are allowed', () => {
  for (const label of ['Ctrl+C', 'Ctrl+V', 'Ctrl+Shift+V', 'Alt+Tab', 'Super+L', 'Ctrl+Alt+Shift+F12', 'Esc', 'Enter', 'Left', 'F5'])
    assert.equal(validShortcutLabel(label), true, label);
});

function fixture() {
  const child = new EventEmitter();
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = () => { child.emit('exit', 126); return true; };
  const messages = [];
  let unavailable = 0;
  const observer = new LinuxShortcutObserver(label => messages.push(label), () => unavailable++, {
    installed: () => true, launch: () => child,
  });
  return {child, messages, observer, lost: () => unavailable};
}

test('authorization must finish before observation and paused input is discarded', async () => {
  const {child, messages, observer} = fixture();
  const authorized = observer.authorize();
  assert.equal(observer.hasPermission(), false);
  observer.resume();
  child.stdout.write('KEY\tCtrl+C\n');
  assert.deepEqual(messages, []);
  child.stdout.write('READY 1\n');
  assert.equal(await authorized, true);
  observer.resume();
  child.stdout.write('KEY\tCtrl+C\nKEY\tA\nKEY\tShift+A\n');
  assert.deepEqual(messages, ['Ctrl+C']);
  observer.pause();
  child.stdout.write('KEY\tCtrl+V\n');
  assert.deepEqual(messages, ['Ctrl+C']);
  assert.equal(child.stdin.read().toString(), 'RESUME\nPAUSE\n');
  assert.equal(observer.hasPermission(), true); // reusable authorization, no open keyboard devices
  observer.stop();
  assert.equal(observer.hasPermission(), false);
  assert.ok(child.stdin.writableEnded);
});

test('cancelled authorization resolves false; process loss disables the feature', async () => {
  const cancelled = fixture();
  const pending = cancelled.observer.authorize();
  cancelled.child.emit('exit', 126);
  assert.equal(await pending, false);
  assert.deepEqual(cancelled.messages, []);
  const running = fixture();
  const ready = running.observer.authorize();
  running.child.stdout.write('READY 1\n');
  await ready;
  running.observer.resume();
  running.child.emit('exit', 1);
  assert.equal(running.lost(), 1);
  assert.equal(running.observer.hasPermission(), false);
});
test('plain typing, shifted letters and authentication output are discarded', () => {
  for (const label of ['A', '1', 'Shift+A', 'Space', 'AltGr+Q', 'example-password', 'Ctrl+example-password', 'KEY\tCtrl+C\n', 'Ctrl+C\nV', 'Ctrl+' + 'A'.repeat(100)])
    assert.equal(validShortcutLabel(label), false, label);
});
