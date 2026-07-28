import { defineStore } from 'pinia';
import { get } from '@/libs/http';
import type { LoadingStatus } from '@/stores';

export interface PriceMeta {
  usd?: string;
  usd_24h_change?: string;
  cny?: string;
  cny_24h_change?: string;
  eur?: string;
  eur_24h_change?: string;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const LocalStoreKey = 'currency';
const CachePrefix = 'verona-coingecko:';
const pending = new Map<string, Promise<unknown>>();

export const coingeckoUrl = import.meta.env.VITE_COINGECKO_URL || 'https://api.coingecko.com';

type CacheEntry<T> = { expiresAt: number; value: T };

function cachedGet<T>(key: string, url: string): Promise<T> {
  const raw = localStorage.getItem(CachePrefix + key);
  if (raw) {
    try {
      const entry = JSON.parse(raw) as CacheEntry<T>;
      if (entry.expiresAt > Date.now()) return Promise.resolve(entry.value);
    } catch {
      localStorage.removeItem(CachePrefix + key);
    }
  }

  const inFlight = pending.get(key) as Promise<T> | undefined;
  if (inFlight) return inFlight;

  const request = get(url)
    .then((value: T) => {
      localStorage.setItem(CachePrefix + key, JSON.stringify({ expiresAt: Date.now() + CACHE_TTL_MS, value }));
      return value;
    })
    .finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}

export const useCoingecko = defineStore('coingecko', {
  state: () => ({
    currency: localStorage.getItem(LocalStoreKey),
    loadStatus: {} as Record<string, LoadingStatus | undefined>,
    prices: {} as Record<string, PriceMeta>,
    marketChart: {},
  }),
  actions: {
    getMarketChart(days = 30, coinId = 'cosmos'): Promise<any> {
      const key = `market-chart:${coinId}:${days}`;
      return cachedGet<any>(key, `${coingeckoUrl}/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=${days}`);
    },
    fetchCoinPrice(ids: string[]) {
      const currencies = ['usd', this.currency].filter(Boolean).join(',');
      const key = `prices:${ids.join(',')}:${currencies}`;
      cachedGet<Record<string, PriceMeta>>(
        key,
        `${coingeckoUrl}/api/v3/simple/price?include_24hr_change=true&vs_currencies=${currencies}&ids=${ids.join(',')}`
      ).then((data) => {
        this.prices = { ...this.prices, ...data };
      });
    },
    getCoinInfo(coinId: string): Promise<any> {
      return cachedGet<any>(`coin:${coinId}`, `${coingeckoUrl}/api/v3/coins/${coinId}`);
    },
    setSecondaryCurrency(currency: string) {
      if (currency !== 'usd') {
        localStorage.setItem(LocalStoreKey, currency);
        this.currency = currency;
      }
    },
  },
});
