<script lang="ts" setup>
import { useDashboard, LoadingStatus } from '@/stores';
import type { ChainConfig } from '@/types/chaindata';
import ChainSummary from '@/components/xion/ChainSummary.vue';

import { computed, onMounted, ref } from 'vue';
import { useBlockchain } from '@/stores';

const dashboard = useDashboard();

const chains = computed(() => Object.values(dashboard.chains) as ChainConfig[]);

const featured = computed(() => {
  const names = ['cosmos', 'osmosis', 'akash', 'celestia', 'evmos', 'injective', 'dydx', 'noble'];
  return chains.value
    .filter((x) => names.includes(x.chainName))
    .sort((a, b) => names.indexOf(a.chainName) - names.indexOf(b.chainName));
});

const chainStore = useBlockchain();
</script>
<template>
  <div class="">
    <div
      class="flex md:!flex-row flex-col items-center justify-center mb-6 mt-14 gap-2"
    >
      <div class="w-16 h-16 rounded-full overflow-hidden shrink-0">
        <img class="w-full h-full object-contain" src="/verona.png" alt="Verona" />
      </div>
      <h1 class="text-primary text-3xl md:!text-6xl font-bold">
        {{ $t('pages.title') }}
      </h1>
    </div>
    <div class="text-center text-base">
      <p class="mb-1">
        {{ $t('pages.slogan') }}
      </p>
    </div>
    <div v-if="dashboard.status !== LoadingStatus.Loaded" class="flex justify-center">
      <progress class="progress progress-info w-80 h-1"></progress>
    </div>

    <div v-if="featured.length > 0" class="text-center text-base mt-6 text-primary">
      <h2 class="mb-6">Featured Blockchains 🔥</h2>
    </div>

    <div
      v-if="featured.length > 0"
      class="grid grid-cols-1 gap-4 mt-6 md:!grid-cols-3 lg:!grid-cols-4 2xl:!grid-cols-5"
    >
      <ChainSummary v-for="(chain, index) in featured" :key="index" :name="chain.chainName" />
    </div>

    <div class="text-center text-base mt-6 text-primary">
      <h2 class="mb-6">{{ $t('pages.description') }}</h2>
    </div>

    <div class="grid grid-cols-1 gap-4 mt-6 md:!grid-cols-3 lg:!grid-cols-4 2xl:!grid-cols-5">
      <ChainSummary v-for="(chain, index) in chains" :key="index" :name="chain.chainName" />
    </div>
  </div>
</template>

<style scoped>
.logo path {
  fill: #171d30;
}
</style>
