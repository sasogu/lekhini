import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ButtonTransitions} from './buttons.mjs';

test('left, middle and right presses carry their position; holds and releases do not repeat', () => {
    const tracker = new ButtonTransitions();
    assert.deepEqual(tracker.update(0, 10, 20), []);
    for (const [mask, button] of [[1, 'left'], [2, 'middle'], [4, 'right']]) {
        assert.deepEqual(tracker.update(mask, 3000, 940), [{type: 'click', button, x: 3000, y: 940}]);
        assert.deepEqual(tracker.update(mask, 3001, 941), []);
        assert.deepEqual(tracker.update(0, 3001, 941), []);
    }
});

test('starting or resuming with a held button does not invent a click', () => {
    const tracker = new ButtonTransitions();
    assert.deepEqual(tracker.update(1, 0, 0), []);
    tracker.reset();
    assert.deepEqual(tracker.update(4, 0, 0), []);
    assert.deepEqual(tracker.update(0, 0, 0), []);
    assert.equal(tracker.update(4, 0, 0)[0].button, 'right');
});

test('simultaneous buttons are distinct and a second press survives an existing drag', () => {
    const tracker = new ButtonTransitions();
    tracker.update(0, 0, 0);
    assert.deepEqual(tracker.update(1 | 2, 0, 0).map(c => c.button), ['left', 'middle']);
    assert.deepEqual(tracker.update(1 | 2 | 4, 0, 0).map(c => c.button), ['right']);
});

test('unknown wire bits never produce mouse clicks', () => {
    const tracker = new ButtonTransitions();
    tracker.update(0, 0, 0);
    assert.deepEqual(tracker.update(8 | 16 | (1 << 20), 0, 0), []);
});
