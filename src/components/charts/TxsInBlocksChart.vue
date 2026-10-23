<script lang="ts" setup>
import ApexCharts from 'vue3-apexcharts';
import { computed, ref } from '@vue/reactivity';
import { useBaseStore } from '@/stores';

const baseStore = useBaseStore();

const options = computed(() => {
  return {
    chart: {
      type: 'bar',
      height: 150,
    },
    plotOptions: {
      bar: {
        // borderRadius: 4,
        horizontal: false,
      },
    },
    dataLabels: {
      enabled: false,
    },
    colors: ['#5A67D8'],
    xaxis: {
      labels: {
        show: false,
        rotate: -45,
      },
      show: false,
      // One label per bar, then the same fixed padding as before.
      categories: baseStore.recents
        .map((x) => x.block.header.height)
        .concat(Array(Math.max(0, 50)).fill('')),
    },
  };
});
const series = computed(() => {
  return [
    {
      name: 'Txs',
      data: baseStore.recents?.map((x) => x.block.data.txs.length) || [],
    },
  ];
});
</script>

<template>
  <ApexCharts type="bar" height="150" :options="options" :series="series" />
</template>
