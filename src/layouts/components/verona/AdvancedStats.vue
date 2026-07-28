<script setup lang="ts">
import { onMounted } from 'vue';
import CardStatisticsVertical from '@/components/CardStatisticsVertical.vue';
import { useDistributionStore } from '@/stores';
import { useIndexModule } from '@/modules/[chain]/indexStore';

const store = useIndexModule();

onMounted(async () => {
  const response = await useDistributionStore().fetchCommunityPool();
  store.communityPool = (response?.pool || [])
    .filter((coin) => coin.denom.length < 10)
    .map((coin) => ({ amount: String(parseInt(coin.amount)), denom: coin.denom }));
});
</script>

<template>
  <div class="mb-4 grid grid-cols-1 gap-4 md:!grid-cols-3 lg:!grid-cols-6">
    <CardStatisticsVertical
      v-for="(item, key) in store.stats"
      :key="key"
      v-bind="item"
    />
  </div>
</template>
