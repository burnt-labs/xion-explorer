import { defineStore } from 'pinia';
import { useBlockchain } from '@/stores';
import { decodeTxRaw, type DecodedTxRaw } from '@cosmjs/proto-signing';
import dayjs from 'dayjs';
import type { Block } from '@/types';
import { hashTx } from '@/libs';
import { fromBase64 } from '@cosmjs/encoding';
import { blockHeight, mapWithConcurrency, mergeRecentBlocks, missingHeights, withTimeout } from '@/libs/recent-blocks';

// `"false"` is a truthy string, so compare explicitly.
const FETCH_ALL_BLOCKS = import.meta.env.VITE_FETCH_ALL_BLOCKS === 'true';
const RECENT_BLOCKS_LIMIT = Number(import.meta.env.VITE_RECENT_BLOCK_LIMIT) || 50;
// Parallel block requests while backfilling the window.
const BACKFILL_CONCURRENCY = 6;
// Give up on one block request after this long; the height is retried next poll.
const BACKFILL_FETCH_TIMEOUT_MS = 10_000;
// Set while a backfill is in flight; polls that overlap it only add latest.
let backfilling = false;
type Theme = 'light' | 'dark';
const DEFAULT_THEME: Theme = import.meta.env.VITE_DEFAULT_THEME === 'dark' ? 'dark' : 'light';

function initialTheme(): Theme {
  const storedTheme = window.localStorage.getItem('theme');
  return storedTheme === 'light' || storedTheme === 'dark' ? storedTheme : DEFAULT_THEME;
}

export const useBaseStore = defineStore('baseStore', {
  state: () => {
    return {
      earliest: {} as Block,
      latest: {} as Block,
      recents: [] as Block[],
      theme: initialTheme(),
      connected: false,
    };
  },
  getters: {
    blocktime(): number {
      if (this.earliest && this.latest) {
        if (this.latest.block?.header?.height !== this.earliest.block?.header?.height) {
          const diff = dayjs(this.latest.block?.header?.time).diff(this.earliest.block?.header?.time);
          const blocks = Number(this.latest.block.header.height) - Number(this.earliest.block.header.height);
          return Math.round(diff / blocks);
        }
      }
      return 1000; // better to start low and increase
    },
    blockchain() {
      return useBlockchain();
    },
    hasRpc(): boolean {
      return this.blockchain?.rpc as unknown as boolean;
    },
    currentChainId(): string {
      return this.latest.block?.header.chain_id || '';
    },
    txsInRecents() {
      const txs = [] as {
        height: string;
        hash: string;
        tx: DecodedTxRaw;
      }[];
      this.recents.forEach((b) =>
        b.block?.data?.txs.forEach((tx: string) => {
          if (tx) {
            const raw = fromBase64(tx);
            try {
              txs.push({
                height: b.block.header.height,
                hash: hashTx(raw),
                tx: decodeTxRaw(raw),
              });
            } catch (e) {
              console.error(e);
            }
          }
        })
      );
      return txs.sort((a, b) => {
        return Number(b.height) - Number(a.height);
      });
    },
  },
  actions: {
    async initial() {
      while (!this.hasRpc) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      this.fetchLatest();
    },
    async clearRecentBlocks() {
      this.recents = [];
    },
    async fetchLatest() {
      if (!this.hasRpc) return this.latest;
      try {
        const latest = await this.blockchain.rpc?.getBaseBlockLatest();
        // A malformed 200 - an error body, a rate-limit page, a truncated
        // response - would otherwise be stored as `latest`. The chain_id
        // comparison below would then see undefined against the previous chain,
        // wipe earliest/recents and reset the average block time to the 1000ms
        // placeholder. Treat it as a failed poll instead.
        //
        // chain_id is checked as well as height: it is specifically the missing
        // chain_id that trips that reset, so a partial payload carrying a height
        // but no chain_id would otherwise still cause the state loss this guards.
        const header = latest?.block?.header;
        if (!header?.height || !header?.chain_id) {
          throw new Error('malformed blocks/latest payload');
        }
        this.latest = latest;
        this.connected = true;
        this.blockchain.notePollResult?.(true);
      } catch (error) {
        console.error('Error fetching latest block:', error);
        this.connected = false;
        await this.blockchain.notePollResult?.(false);
      }
      if (!this.earliest || this.earliest?.block?.header?.chain_id != this.latest?.block?.header?.chain_id) {
        //reset earliest and recents
        this.earliest = this.latest;
        this.recents = [];
      }
      // With backfill on, every poll checks the window for holes (including
      // heights that failed to load last time), even when latest is unchanged.
      const latestKnown = this.recents.some((x) => x?.block_id?.hash === this.latest?.block_id?.hash);
      if (FETCH_ALL_BLOCKS || !latestKnown) {
        const newBlocks = await this.fetchNewBlocks();
        this.recents = mergeRecentBlocks(this.recents, newBlocks, RECENT_BLOCKS_LIMIT);
      }
      return this.latest;
    },
    /**
     * Returns the blocks to merge into recents: the latest block, plus, when
     * backfill is on, every height of the display window that recents lacks.
     * Only the window is fetched, so a long background period costs at most
     * RECENT_BLOCKS_LIMIT requests, and only one backfill runs at a time so
     * overlapping polls do not fetch the same heights.
     */
    async fetchNewBlocks() {
      if (!this.latest?.block?.header?.height) return [];
      const latest = this.latest;
      if (!FETCH_ALL_BLOCKS || backfilling) return [latest];
      backfilling = true;
      try {
        const heights = missingHeights(this.recents, blockHeight(latest), RECENT_BLOCKS_LIMIT);
        // The REST client has no request timeout, so bound each fetch: a
        // stalled request would otherwise keep `backfilling` set, and later
        // polls (even after endpoint failover) would stop filling holes.
        const fetched = await mapWithConcurrency(heights, BACKFILL_CONCURRENCY, (h) =>
          withTimeout(this.fetchBlock(h), BACKFILL_FETCH_TIMEOUT_MS, {} as Block)
        );
        // A failed or timed-out fetch has no header; leaving it out keeps the
        // height missing, so the next poll retries it.
        return [...fetched.filter((b) => b?.block?.header?.height), latest];
      } finally {
        backfilling = false;
      }
    },
    async fetchValidatorByHeight(height?: number, offset = 0) {
      return this.blockchain.rpc.getBaseValidatorsetAt(String(height), offset);
    },
    async fetchLatestValidators(offset = 0) {
      return this.blockchain.rpc.getBaseValidatorsetLatest(offset);
    },
    async fetchBlock(height?: number | string) {
      try {
        const block = await this.blockchain.rpc.getBaseBlockAt(String(height));
        this.connected = true;
        return block;
      } catch (error) {
        console.error('Error fetching latest block:', error);
        this.connected = false;
      }
      return {} as Block;
    },
    async fetchAbciInfo() {
      return this.blockchain.rpc.getBaseNodeInfo();
    },
    // async fetchNodeInfo() {
    //     return this.blockchain.rpc.no()
    // }
  },
});
