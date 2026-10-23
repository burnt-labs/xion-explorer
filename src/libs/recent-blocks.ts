// Keeps the home page's Recent block grid a contiguous window of the chain.
//
// A poll only learns the latest height, and blocks arrive faster than the
// poll interval, so the grid fills the window (latest - limit, latest] by
// fetching whichever heights are missing from it. Measuring against the window
// rather than against the last block shown matters in two cases:
// - after a long background period (polling stops while the tab is hidden),
//   only the last `limit` heights are fetched, not every block since;
// - a height that failed to load is still missing on the next poll, so it is
//   retried instead of staying a permanent hole.

/** Anything with a block header height, as returned by blocks/{height}. */
export interface HeightedBlock {
  block: { header: { height: string } };
}

export function blockHeight(block: HeightedBlock): number {
  return Number(block.block.header.height);
}

/**
 * Heights in the window (latestHeight - limit, latestHeight) that `recents`
 * does not hold, ascending. The latest block itself is excluded: the poll
 * already has it.
 */
export function missingHeights(
  recents: HeightedBlock[],
  latestHeight: number,
  limit: number
): number[] {
  const have = new Set(recents.map(blockHeight));
  const missing: number[] = [];
  for (let h = Math.max(1, latestHeight - limit + 1); h < latestHeight; h++) {
    if (!have.has(h)) missing.push(h);
  }
  return missing;
}

/**
 * Merges newly fetched blocks into `recents`: one block per height (incoming
 * wins), ascending, trimmed to the newest `limit`.
 */
export function mergeRecentBlocks<T extends HeightedBlock>(
  recents: T[],
  incoming: T[],
  limit: number
): T[] {
  const byHeight = new Map<number, T>();
  for (const block of [...recents, ...incoming])
    byHeight.set(blockHeight(block), block);
  return [...byHeight.values()]
    .sort((a, b) => blockHeight(a) - blockHeight(b))
    .slice(-limit);
}

/**
 * Settles with `fallback` if `promise` has not settled within `ms`. The
 * underlying request is not cancelled; this only stops one stalled request from
 * holding a backfill (and with it every later backfill) open.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  fallback: T
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Maps `items` through `fn` with at most `concurrency` calls in flight, keeping order. */
export async function mapWithConcurrency<I, O>(
  items: I[],
  concurrency: number,
  fn: (item: I) => Promise<O>
): Promise<O[]> {
  const results = new Array<O>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(Math.max(1, concurrency), items.length) },
      worker
    )
  );
  return results;
}
