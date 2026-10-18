// YouTube Data API v3 unit costs per call.
export const COSTS = { search: 100, channels: 1, playlistItems: 1, videos: 1 } as const;
export type QuotaOp = keyof typeof COSTS;

export class QuotaExceeded extends Error {
  constructor(op: QuotaOp) {
    super(`YouTube quota budget exhausted (wanted ${op})`);
  }
}

// Tracks today's spend and refuses to touch the safety reserve.
export class QuotaBudget {
  #used: number;
  constructor(used = 0, private limit = 10000, private reserve = 1000) {
    this.#used = used;
  }
  get used() { return this.#used; }
  get remaining() { return this.limit - this.reserve - this.#used; }
  canSpend(op: QuotaOp, calls = 1) { return COSTS[op] * calls <= this.remaining; }
  spend(op: QuotaOp, calls = 1) {
    if (!this.canSpend(op, calls)) throw new QuotaExceeded(op);
    this.#used += COSTS[op] * calls;
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
