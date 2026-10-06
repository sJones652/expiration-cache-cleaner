import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ExpirationCacheCleaner } from '../src/index.js';

function makeFakeClock() {
  let t = 0;
  return {
    now: () => t,
    advance(ms) { t += ms; },
    set(ms) { t = ms; },
  };
}

test('set and get a value that has not expired', () => {
  const clock = makeFakeClock();
  const cache = new ExpirationCacheCleaner(clock.now);
  cache.set('a', 1, 1000);
  assert.deepEqual(cache.get('a'), { value: 1, insertedAt: 0, ttl: 1000 });
});

test('get returns undefined for missing key', () => {
  const clock = makeFakeClock();
  const cache = new ExpirationCacheCleaner(clock.now);
  assert.equal(cache.get('nope'), undefined);
});

test('get does not expire entries lazily', () => {
  const clock = makeFakeClock();
  const cache = new ExpirationCacheCleaner(clock.now);
  cache.set('a', 1, 10);
  clock.advance(100);
  // Still present even though expired; sweep is responsible for removal.
  assert.equal(cache.size(), 1);
  assert.deepEqual(cache.get('a'), { value: 1, insertedAt: 0, ttl: 10 });
});

test('sweep removes entries past their ttl', () => {
  const clock = makeFakeClock();
  const cache = new ExpirationCacheCleaner(clock.now);
  cache.set('a', 1, 100);
  cache.set('b', 2, 200);
  clock.advance(150);
  const removed = cache.sweep();
  assert.equal(removed, 1);
  assert.equal(cache.get('a'), undefined);
  assert.deepEqual(cache.get('b'), { value: 2, insertedAt: 0, ttl: 200 });
});

test('sweep at exact expiry boundary removes entry', () => {
  const clock = makeFakeClock();
  const cache = new ExpirationCacheCleaner(clock.now);
  cache.set('a', 1, 100);
  clock.advance(100);
  // insertedAt(0) + ttl(100) = 100, now = 100, 100 <= 100 so removed.
  const removed = cache.sweep();
  assert.equal(removed, 1);
  assert.equal(cache.get('a'), undefined);
});

test('sweep with ttl 0 removes immediately', () => {
  const clock = makeFakeClock();
  const cache = new ExpirationCacheCleaner(clock.now);
  cache.set('ephemeral', 'x', 0);
  assert.equal(cache.sweep(), 1);
  assert.equal(cache.get('ephemeral'), undefined);
});

test('default ttl of Infinity means entries never expire', () => {
  const clock = makeFakeClock();
  const cache = new ExpirationCacheCleaner(clock.now);
  cache.set('forever', 42);
  clock.advance(10_000_000);
  assert.equal(cache.sweep(), 0);
  assert.equal(cache.get('forever').value, 42);
});

test('ttl is captured at insertion; changing default later does not affect existing entry', () => {
  const clock = makeFakeClock();
  const cache = new ExpirationCacheCleaner(clock.now, 500);
  cache.set('a', 'v');
  // Mutate the default — the entry should keep its original 500ms ttl.
  cache._defaultTtl = 10;
  clock.advance(100);
  assert.equal(cache.sweep(), 0);
});

test('overwriting a key replaces insertedAt and ttl', () => {
  const clock = makeFakeClock();
  const cache = new ExpirationCacheCleaner(clock.now);
  cache.set('a', 1, 100);
  clock.advance(50);
  cache.set('a', 2, 1000);
  // New entry's insertedAt is 50, ttl 1000 -> expires at 1050.
  clock.advance(60);
  assert.equal(cache.sweep(), 0);
  assert.equal(cache.get('a').value, 2);
});

test('delete removes a specific key and returns true', () => {
  const clock = makeFakeClock();
  const cache = new ExpirationCacheCleaner(clock.now);
  cache.set('a', 1, 100);
  assert.equal(cache.delete('a'), true);
  assert.equal(cache.delete('a'), false);
  assert.equal(cache.get('a'), undefined);
});

test('set with non-empty string key is rejected', () => {
  const clock = makeFakeClock();
  const cache = new ExpirationCacheCleaner(clock.now);
  assert.throws(() => cache.set('', 1, 100), /key must be a non-empty string/);
});

test('set with negative ttl is rejected', () => {
  const clock = makeFakeClock();
  const cache = new ExpirationCacheCleaner(clock.now);
  assert.throws(() => cache.set('a', 1, -1), /ttl must be a non-negative/);
});

test('constructor validates clock and defaultTtl', () => {
  assert.throws(() => new ExpirationCacheCleaner(null), /clock must be a function/);
  assert.throws(() => new ExpirationCacheCleaner(() => 0, -1), /defaultTtl must be/);
});
