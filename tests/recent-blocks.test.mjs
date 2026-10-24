// The Recent block grid's window maintenance. The shapes are the ones the REST
// endpoint returns from cosmos/base/tendermint/v1beta1/blocks/{height}.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  blockHeight,
  mapWithConcurrency,
  mergeRecentBlocks,
  missingHeights,
  withTimeout,
} from '../src/libs/recent-blocks.ts';

const block = (height, tag = '') => ({
  block: { header: { height: String(height) } },
  tag,
});
const heights = (blocks) => blocks.map(blockHeight);
const range = (from, to) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

test('blockHeight reads the header height as a number', () => {
  assert.equal(blockHeight(block(24620477)), 24620477);
});

test('missingHeights returns only the holes inside the window, excluding latest', () => {
  // The grid as it was seen: holes between polled blocks.
  const recents = [325, 326, 330, 331, 333, 376].map(block);
  assert.deepEqual(
    missingHeights(recents, 380, 10),
    [371, 372, 373, 374, 375, 377, 378, 379]
  );
});

test('missingHeights after a gap larger than the window asks for exactly the last limit heights', () => {
  // Tab hidden for ~2h: last shown 24618393, latest now 24620477.
  const recents = range(24618294, 24618393).map(block);
  const missing = missingHeights(recents, 24620477, 100);
  assert.equal(missing.length, 99);
  assert.deepEqual([missing[0], missing.at(-1)], [24620378, 24620476]);
});

test('missingHeights is empty when the window is already contiguous', () => {
  assert.deepEqual(missingHeights(range(91, 99).map(block), 100, 10), []);
});

test('missingHeights does not go below height 1 on a young chain', () => {
  assert.deepEqual(missingHeights([], 3, 50), [1, 2]);
});

test('a height whose fetch failed is requested again on the next poll', () => {
  // Poll 1 fetched 96..99 but 97 failed (fetchBlock returns no header and
  // the store drops it), so 97 never reached recents.
  const afterPoll1 = mergeRecentBlocks([], [96, 98, 99, 100].map(block), 10);
  assert.deepEqual(missingHeights(afterPoll1, 101, 10).includes(97), true);
});

test('mergeRecentBlocks dedupes by height, sorts ascending and trims to the limit', () => {
  const merged = mergeRecentBlocks(
    [block(5, 'old'), block(3), block(4)],
    [block(7), block(5, 'new'), block(6)],
    4
  );
  assert.deepEqual(heights(merged), [4, 5, 6, 7]);
  assert.equal(merged.find((b) => blockHeight(b) === 5).tag, 'new');
});

test('mergeRecentBlocks drops a stale run once the window has moved past it', () => {
  const stale = range(24618294, 24618393).map(block);
  const fresh = range(24620378, 24620477).map(block);
  const merged = mergeRecentBlocks(stale, fresh, 100);
  assert.deepEqual(heights(merged), range(24620378, 24620477));
});

test('mapWithConcurrency keeps order and never exceeds the cap', async () => {
  let inFlight = 0;
  let peak = 0;
  const out = await mapWithConcurrency(range(1, 20), 4, async (n) => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    await new Promise((resolve) => setTimeout(resolve, (n * 7) % 5));
    inFlight--;
    return n * 2;
  });
  assert.deepEqual(
    out,
    range(1, 20).map((n) => n * 2)
  );
  assert.equal(peak, 4);
});

test('mapWithConcurrency handles no items and a non-positive cap', async () => {
  assert.deepEqual(await mapWithConcurrency([], 4, async (n) => n), []);
  assert.deepEqual(
    await mapWithConcurrency([1, 2], 0, async (n) => n + 1),
    [2, 3]
  );
});

test('withTimeout returns the result when the promise settles in time', async () => {
  assert.equal(
    await withTimeout(Promise.resolve('block'), 1000, 'fallback'),
    'block'
  );
});

test('withTimeout settles with the fallback when a request stalls', async () => {
  // A request that never settles must not hold the backfill open.
  const stalled = new Promise(() => {});
  assert.equal(await withTimeout(stalled, 20, 'fallback'), 'fallback');
});

test('mergeRecentBlocks drops a stale run even when part of the backfill failed', () => {
  // Resume at 1000 after showing 1..100; requests for 901..910 failed.
  const stale = range(1, 100).map(block);
  const partial = range(911, 1000).map(block);
  const merged = mergeRecentBlocks(stale, partial, 100);
  assert.deepEqual(heights(merged), range(911, 1000));
  // The failed heights stay missing, so the next poll asks for them again.
  assert.deepEqual(missingHeights(merged, 1000, 100), range(901, 910));
});
