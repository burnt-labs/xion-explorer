<script lang="ts" setup>
import { computed, ref } from '@vue/reactivity';
import { useBlockchain, useFormatter } from '@/stores';
import { PageRequest, type Coin, type DenomMetadata } from '@/types';
import { onMounted, watch } from 'vue';
import type { Asset } from '@/types/chaindata';
import PaginationBar from '@/components/PaginationBar.vue';
import Loading from '@/components/Loading.vue';

defineProps(['chain']);

const format = useFormatter();
const chainStore = useBlockchain();
const defaultLogo = '/unknown.png';
const list = ref([] as { denom: string; amount: string; base: string; info: string; logo: string }[]);
const filter = ref('');
const filteredList = computed(() => {
  const query = filter.value.trim().toLowerCase();
  if (!query) return list.value;
  return list.value.filter((item) =>
    [item.denom, item.info, item.base].some((value) => value.toLowerCase().includes(query))
  );
});
const visibleList = computed(() => {
  const start = (currentPage.value - 1) * pageRequest.value.limit;
  return filteredList.value.slice(start, start + pageRequest.value.limit);
});
const loading = ref(true);
const pageRequest = ref(new PageRequest());
pageRequest.value.reverse = true;
const currentPage = ref(1);
const copiedValue = ref('');

interface SupplyAsset extends Asset {
  logo: string | undefined;
}

onMounted(loadSupply);
watch(filter, () => (currentPage.value = 1));

function findGlobalAssetConfig(denom: string) {
  return chainStore.current?.assets?.find((asset) => asset.base === denom);
}

function useDefaultLogo(event: Event) {
  const image = event.target as HTMLImageElement;
  if (!image.src.endsWith(defaultLogo)) image.src = defaultLogo;
}

function truncatePath(value: string) {
  if (value.startsWith('ibc/')) return `${value.slice(0, 9)}...`;
  const firstSlash = value.indexOf('/');
  const lastSlash = value.lastIndexOf('/');
  if (firstSlash === -1 || firstSlash === lastSlash) return value;
  return `${value.slice(0, firstSlash + 1)}...${value.slice(lastSlash)}`;
}

async function copyValue(value: string) {
  await navigator.clipboard.writeText(value);
  copiedValue.value = value;
  window.setTimeout(() => {
    if (copiedValue.value === value) copiedValue.value = '';
  }, 1200);
}

async function mergeDenomMetadata(denom: string, denomsMetadatas: DenomMetadata[]): Promise<SupplyAsset> {
  const denomMetadata = denomsMetadatas.find((metadata) => metadata.base.endsWith(denom));
  let asset = findGlobalAssetConfig(denom) as SupplyAsset;
  if (asset && denomMetadata) {
    asset = { ...denomMetadata, ...asset };
    asset.display = denomMetadata.display;
    asset.logo = asset.logo_URIs?.svg || asset.logo_URIs?.png || undefined;
  } else if (denomMetadata) {
    return denomMetadata as SupplyAsset;
  }
  return asset;
}

async function loadSupply() {
  loading.value = true;
  try {
    const denomsMetaResponse = await chainStore.rpc.getBankDenomMetadata();
    const coins: Coin[] = [];
    let key: string | undefined;
    do {
      const request = new PageRequest();
      request.limit = 200;
      request.count_total = false;
      request.reverse = true;
      request.key = key;
      const response = await chainStore.rpc.getBankSupply(request);
      coins.push(...response.supply);
      key = response.pagination?.next_key || undefined;
    } while (key);
    list.value = await Promise.all(
      coins.map(async (coin: Coin) => {
          const asset = await mergeDenomMetadata(coin.denom, denomsMetaResponse.metadatas);
          const denom = asset?.symbol || coin.denom;
          return {
            denom: denom.split('/').at(-1)?.toUpperCase() || denom,
            amount: format.tokenAmountNumber({ amount: coin.amount, denom }).toString(),
            base: asset?.base || coin.denom,
            info: asset?.display || coin.denom,
            logo: asset?.logo_URIs?.svg || asset?.logo_URIs?.png || defaultLogo,
          };
      })
    );
  } finally {
    loading.value = false;
  }
}

function pageload(page: number) {
  currentPage.value = page;
}
</script>

<template>
  <div>
    <input
      v-model="filter"
      type="search"
      class="input input-sm mb-4 h-10 w-full border border-base-300 bg-base-100 px-4 focus:border-primary"
      placeholder="Search all tokens"
      aria-label="Search all tokens"
    />
    <div class="overflow-hidden bg-base-100">
    <table class="table table-compact">
      <thead class="bg-base-200">
        <tr><td>Logo</td><td>Token</td><td>Amount</td><td>Info</td><td>Base</td></tr>
      </thead>
      <tbody v-if="!loading">
        <tr v-for="item in visibleList" :key="item.base" class="hover">
          <td><img :src="item.logo" class="w-7 h-7" @error="useDefaultLogo" /></td>
          <td>{{ item.denom }}</td>
          <td>{{ item.amount }}</td>
          <td>
            <button
              type="button"
              class="tooltip supply-tooltip cursor-copy text-left"
              :data-tip="copiedValue === item.info ? 'Copied' : item.info"
              :title="item.info"
              @click="copyValue(item.info)"
            >
              {{ truncatePath(item.info) }}
            </button>
          </td>
          <td>
            <button
              type="button"
              class="tooltip supply-tooltip cursor-copy text-left"
              :data-tip="copiedValue === item.base ? 'Copied' : item.base"
              :title="item.base"
              @click="copyValue(item.base)"
            >
              {{ truncatePath(item.base) }}
            </button>
          </td>
        </tr>
      </tbody>
    </table>
    <Loading v-if="loading" :bordered="false" />
    <PaginationBar
      v-else
      :page="currentPage"
      :limit="pageRequest.limit"
      :total="String(filteredList.length)"
      :callback="pageload"
    />
    </div>
  </div>
</template>

<style scoped>
.supply-tooltip {
  --tooltip-color: #f1ece3;
  --tooltip-text-color: hsl(var(--bc));
}

.supply-tooltip::before {
  width: max-content;
  max-width: min(32rem, calc(100vw - 2rem));
  height: auto;
  white-space: normal;
  overflow-wrap: anywhere;
  text-align: left;
}

html.dark .supply-tooltip,
html[data-theme='dark'] .supply-tooltip {
  --tooltip-color: #101a14;
  --tooltip-text-color: hsl(var(--bc));
}
</style>

<route>
{
  path: '/:chain/supply',
  meta: { i18n: 'supply', order: 17 }
}
</route>
