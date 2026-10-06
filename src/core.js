/**
 * ExpirationCacheCleaner stores key-value pairs where each entry has a lifetime
 * in milliseconds. An injected clock function supplies the current time, which
 * keeps the sweep logic deterministic and lets tests avoid wall-clock time.
 *
 * Design decisions:
 *  - ttl is captured per entry at insertion time. Mutating a default ttl later
 *    does not retroactively change entries already stored; this avoids subtle
 *    bugs where sweeping touches an entry whose lifetime silently changed.
 *  - sweep() is a separate operation. We do not expire lazily on read, because
 *    the brief asks specifically for a sweep function. Lazier expiration would
 *    shadow the sweep semantics and make the contract ambiguous.
 *  - Setting ttl to 0 means "immediately expired"; entries with ttl <= 0 are
 *    always removed by the next sweep. This is simpler than special-casing 0
 *    as "never expires", which would require a second code path.
 */
export class ExpirationCacheCleaner {
  /**
   * @param {() => number} clock  Returns the current time in milliseconds. In
   *                              tests, pass a fake clock so sweep behaviour
   *                              does not depend on wall-clock time.
   * @param {number} [defaultTtl] Default lifetime in ms for entries inserted
   *                              without an explicit ttl. Defaults to Infinity
   *                              so the common case ("no expiration") works.
   */
  constructor(clock, defaultTtl = Infinity) {
    if (typeof clock !== 'function') {
      throw new TypeError('clock must be a function returning a number');
    }
    if ((defaultTtl !== Infinity && !Number.isFinite(defaultTtl)) || defaultTtl < 0) {
      throw new TypeError('defaultTtl must be a non-negative finite number or Infinity');
    }
    this._clock = clock;
    this._defaultTtl = defaultTtl;
    /** @type {Map<string, {value: unknown, insertedAt: number, ttl: number}>} */
    this._store = new Map();
  }

  /**
   * Store a value under key. ttl is captured now; later changes to the instance
   * default do not affect this entry.
   * @param {string} key
   * @param {*} value
   * @param {number} [ttl] Lifetime in ms from insertion time. Defaults to the
   *                       instance default. Must be >= 0 or Infinity.
   * @returns {void}
   */
  set(key, value, ttl = this._defaultTtl) {
    if (typeof key !== 'string' || key.length === 0) {
      throw new TypeError('key must be a non-empty string');
    }
    if ((ttl !== Infinity && !Number.isFinite(ttl)) || ttl < 0) {
      throw new TypeError('ttl must be a non-negative finite number or Infinity');
    }
    this._store.set(key, { value, insertedAt: this._clock(), ttl });
  }

  /**
   * Read a value. Does not expire; sweep is the single source of expiration.
   * @param {string} key
   * @returns {{value: *, insertedAt: number, ttl: number} | undefined}
   *          The full entry is returned rather than just the value, so callers
   *          can inspect whether the entry is logically expired without
   *          triggering a sweep.
   */
  get(key) {
    return this._store.get(key);
  }

  /**
   * Remove a single key explicitly.
   * @param {string} key
   * @returns {boolean} true if the key existed and was deleted.
   */
  delete(key) {
    return this._store.delete(key);
  }

  /**
   * Remove every entry whose insertedAt + ttl is at or before the current
   * clock time. Uses >= so entries that expired exactly now are removed —
   * an entry with ttl 0 is always swept because insertedAt + 0 <= now.
   * @returns {number} The count of entries removed.
   */
  sweep() {
    const now = this._clock();
    let removed = 0;
    for (const [key, entry] of this._store) {
      if (entry.insertedAt + entry.ttl <= now) {
        this._store.delete(key);
        removed++;
      }
    }
    return removed;
  }

  /** @returns {number} Number of entries currently held. */
  size() {
    return this._store.size;
  }
}
