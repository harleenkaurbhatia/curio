// YouTube Data API v3 quota. Main bucket: 10,000 units/day. Since 2026, search.list
// draws from a separate "Search Queries" bucket: 100 calls/day, 1 unit each.
export const COSTS = { search: 1, channels: 1, playlistItems: 1, videos: 1 } as const;
export type QuotaOp = keyof typeof COSTS;
const SEARCH_LIMIT = 100, SEARCH_RESERVE = 10;

export class QuotaExceeded extends Error {
  constructor(op: QuotaOp) {
    super(`YouTube quota budget exhausted (wanted ${op})`);
  }
}

// Tracks today's spend and refuses to touch the safety reserves.
export class QuotaBudget {
  #used: number;
  #searches: number;
  constructor(used = 0, searches = 0, private limit = 10000, private reserve = 1000) {
    this.#used = used;
    this.#searches = searches;
  }
  get used() { return this.#used; }
  get searches() { return this.#searches; }
  get remaining() { return this.limit - this.reserve - this.#used; }
  canSpend(op: QuotaOp, calls = 1) {
    return op === 'search'
      ? this.#searches + calls <= SEARCH_LIMIT - SEARCH_RESERVE
      : COSTS[op] * calls <= this.remaining;
  }
  spend(op: QuotaOp, calls = 1) {
    if (!this.canSpend(op, calls)) throw new QuotaExceeded(op);
    if (op === 'search') this.#searches += calls;
    else this.#used += COSTS[op] * calls;
  }
}

export class CallLimitReached extends Error {
  constructor() { super('Per-run request limit reached; continuing next run'); }
}

// Cloudflare's free plan caps outbound requests per invocation, so each run does a bounded slice of work.
export class CallLimit {
  constructor(private max: number) {}
  get left() { return this.max; }
  take() {
    if (this.max <= 0) throw new CallLimitReached();
    this.max--;
  }
}
