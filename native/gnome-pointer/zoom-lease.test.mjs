import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ZoomLease} from './extension/zoom-lease.mjs';

test('repeated changes restore the original zoom and disabled state', () => {
    const settings = {enabled: false, zoom: 3.5};
    const lease = new ZoomLease(settings);
    lease.update(':1.1', true, 2);
    lease.update(':1.1', true, 4);
    assert.deepEqual(settings, {enabled: true, zoom: 4});
    lease.release(':1.1');
    assert.deepEqual(settings, {enabled: false, zoom: 3.5});
});

test('existing accessibility zoom remains active after Lekhini stops', () => {
    const settings = {enabled: true, zoom: 1.75};
    const lease = new ZoomLease(settings);
    lease.update(':1.1', true, 3);
    lease.update(':1.1', false, 3);
    assert.deepEqual(settings, {enabled: true, zoom: 1.75});
});

test('another client cannot change or release an active lease', () => {
    const settings = {enabled: false, zoom: 1};
    const lease = new ZoomLease(settings);
    lease.update(':1.1', true, 2);
    assert.throws(() => lease.update(':1.2', true, 4));
    assert.throws(() => lease.update(':1.2', false, 2));
    lease.release(':1.2');
    assert.deepEqual(settings, {enabled: true, zoom: 2});
    lease.release(':1.1');
    assert.deepEqual(settings, {enabled: false, zoom: 1});
});

test('invalid zoom does not acquire a lease or change preferences', () => {
    const settings = {enabled: false, zoom: 1};
    const lease = new ZoomLease(settings);
    for (const zoom of [NaN, Infinity, -1, 0, 100])
        assert.throws(() => lease.update(':1.1', true, zoom));
    assert.equal(lease.owner, null);
    assert.deepEqual(settings, {enabled: false, zoom: 1});
});

test('a separate user adjustment during the lease is preserved', () => {
    const settings = {enabled: false, zoom: 1};
    const lease = new ZoomLease(settings);
    lease.update(':1.1', true, 2);
    settings.zoom = 3.5;
    settings.enabled = false;
    lease.release(':1.1');
    assert.deepEqual(settings, {enabled: false, zoom: 3.5});
});
