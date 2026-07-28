<script lang="ts" setup>
import UptimeView from '@/components/UptimeView.vue';

defineProps<{ chain: string }>();
</script>

<template>
  <UptimeView :chain="chain" />
</template>

<route>
  {
    meta: {
      i18n: 'uptime',
      order: 8
    }
  }
</route>
