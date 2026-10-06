# Expiration Cache Cleaner

A key-value cache where each entry has a time-to-live, and a `sweep()` method removes everything whose lifetime has elapsed. Time is supplied by an injected clock function so the expiration logic is fully deterministic and testable without sleeping.

```js
import { ExpirationCacheCleaner } from 'expiration-cache-cleaner';

const cache = new ExpirationCacheCleaner(() => Date.now(), 60_000);
cache.set('token', 'abc123');          // uses default 60s ttl
cache.set('code', 'xyz', 5_000);      // explicit 5s ttl
cache.get('token');                    // { value: 'abc123', insertedAt: ..., ttl: 60000 }
const removed = cache.sweep();         // number of expired entries removed
```

## Why this exists

The problem is simple: entries accumulate in an in-process cache long after they are useful, and the cleanup logic must be testable. Lazy expiration on read hides the moment of removal and makes it impossible to assert on cleanup behaviour, so this library keeps expiration as an explicit `sweep()` call. That is the trade-off — callers must invoke `sweep()` themselves. Nothing expires on its own.

The clock is a constructor argument rather than a dependency on `Date.now()` directly, which lets tests advance time under their own control. This is the only reason the library can be tested deterministically without faking the global clock.

## Edge cases worth knowing

- `ttl: 0` is treated as "already expired": the next `sweep()` removes it. If you want "never expires", omit the ttl and the default `Infinity` applies.
- `get()` does not remove expired entries. Only `sweep()` does. This is deliberate, so that the number of removals `sweep()` reports is meaningful and not quietly reduced by prior reads.
- A per-entry `ttl` is captured at `set()` time. If you later change the instance's `defaultTtl`, existing entries keep their original lifetime.
- `sweep()` removes an entry when `insertedAt + ttl <= now`. An entry whose ttl ends exactly at the current time is removed; "just before" the boundary, it survives.

## Exports

- `ExpirationCacheCleaner` — the only class. Constructor: `new ExpirationCacheCleaner(clock, defaultTtl = Infinity)`. Methods: `set(key, value, ttl?)`, `get(key)`, `delete(key)`, `sweep()`, `size()`.
