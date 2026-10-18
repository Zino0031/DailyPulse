import {
  claimRequest,
  type IntentQuery,
  type IntentResult,
  type IntentRow,
  type IntentStore,
} from '../intent';

/** Successive `maybeSingle` results; the last entry repeats once exhausted. */
interface FakeConfig {
  reads?: (IntentRow | null)[];
  insertError?: { code?: string } | null;
  readError?: { message: string } | null;
  /** Rows the stale-takeover delete is considered to have removed. */
  takeRows?: unknown[];
}

const fresh = (): string => new Date(Date.now() - 1000).toISOString();
/** Older than INTENT_STALE_MS (90s), still within today's UTC budget. */
const stale = (): string => new Date(Date.now() - 120_000).toISOString();

class FakeQuery implements IntentQuery {
  private mode: 'select' | 'insert' | 'delete' = 'select';
  private sawSelect = false;

  constructor(
    private readonly config: FakeConfig,
    private readonly reads: { index: number },
    private readonly refunds: string[],
  ) {}

  select(): this {
    if (this.mode === 'delete') this.sawSelect = true;
    return this;
  }

  insert(): this {
    this.mode = 'insert';
    return this;
  }

  delete(): this {
    this.mode = 'delete';
    return this;
  }

  eq(): this {
    return this;
  }

  lt(): this {
    return this;
  }

  maybeSingle(): PromiseLike<IntentResult> {
    if (this.config.readError) {
      return Promise.resolve({ data: null, error: this.config.readError });
    }
    const list = this.config.reads ?? [null];
    const row = list[Math.min(this.reads.index, list.length - 1)] ?? null;
    this.reads.index += 1;
    return Promise.resolve({ data: row, error: null });
  }

  then<TResult1 = IntentResult, TResult2 = never>(
    onfulfilled?: ((value: IntentResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.resolve()).then(onfulfilled, onrejected);
  }

  private resolve(): IntentResult {
    if (this.mode === 'insert') {
      return { data: null, error: this.config.insertError ?? null };
    }
    if (this.mode === 'delete' && this.sawSelect) {
      return { data: this.config.takeRows ?? [], error: null };
    }
    // The retention sweep, and anything else that just awaits the builder.
    return { data: null, error: null };
  }
}

function makeStore(config: FakeConfig = {}) {
  const reads = { index: 0 };
  const refunds: string[] = [];
  const store: IntentStore = {
    from: () => new FakeQuery(config, reads, refunds),
    rpc: (name) => {
      refunds.push(name);
      return Promise.resolve({ data: null, error: null });
    },
  };
  return { store, refunds };
}

const deps = { sleep: async () => {} };
const row = (over: Partial<IntentRow>): IntentRow => ({
  response: null,
  spent: false,
  created_at: fresh(),
  ...over,
});

describe('claimRequest', () => {
  it('replays a recorded result without claiming or spending', async () => {
    const recorded = { outfits: [{ outfitId: 'o1' }], usage: { used: 1, limit: 1 } };
    const { store } = makeStore({ reads: [row({ response: recorded, spent: true })] });

    const claim = await claimRequest(store, 'u1', 'req-1', deps);

    expect(claim).toEqual({ recorded, claimed: false, unavailable: false });
  });

  it('reserves an absent intent and reports that it owns the generation', async () => {
    const { store } = makeStore({ reads: [null] });

    const claim = await claimRequest(store, 'u1', 'req-1', deps);

    expect(claim).toEqual({ recorded: null, claimed: true, unavailable: false });
  });

  it('treats a lost insert race as a replay when the winner already recorded', async () => {
    const recorded = { outfits: [{ outfitId: 'o1' }] };
    const { store } = makeStore({
      reads: [null, row({ response: recorded })],
      insertError: { code: '23505' },
    });

    const claim = await claimRequest(store, 'u1', 'req-1', deps);

    expect(claim).toEqual({ recorded, claimed: false, unavailable: false });
  });

  it('skips dedup when the intent table is unavailable', async () => {
    const { store } = makeStore({ readError: { message: 'relation does not exist' } });

    const claim = await claimRequest(store, 'u1', 'req-1', deps);

    expect(claim).toEqual({ recorded: null, claimed: false, unavailable: true });
  });

  it('refunds a dead owner exactly once and takes the intent over', async () => {
    const { store, refunds } = makeStore({
      reads: [row({ spent: true, created_at: stale() }), null],
      takeRows: [{ request_id: 'req-1' }],
    });

    const claim = await claimRequest(store, 'u1', 'req-1', deps);

    expect(refunds).toEqual(['refund_generation']);
    expect(claim).toEqual({ recorded: null, claimed: true, unavailable: false });
  });

  it('does not refund when another duplicate won the takeover race', async () => {
    const { store, refunds } = makeStore({
      reads: [row({ spent: true, created_at: stale() }), null],
      takeRows: [], // the row was already taken over by someone else
    });

    const claim = await claimRequest(store, 'u1', 'req-1', deps);

    expect(refunds).toEqual([]);
    expect(claim.claimed).toBe(true);
  });

  it('reports a still-cooking owner so the client can retry the same id', async () => {
    const { store } = makeStore({ reads: [row({ created_at: fresh() })] });

    const claim = await claimRequest(store, 'u1', 'req-1', deps);

    expect(claim).toEqual({ recorded: null, claimed: false, unavailable: false });
  });
});
