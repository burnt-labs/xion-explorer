<script setup lang="ts">
import BlocksPage from '../../block/index.vue';

defineProps<{ chain: string }>();
</script>

<template>
  <div class="verona-title-case-tabs">
    <BlocksPage :chain="chain" />
  </div>
</template>

<style scoped>
.verona-title-case-tabs :deep(.tabs .tab) {
  text-transform: capitalize !important;
}

.verona-title-case-tabs :deep(.grid > a:hover) {
  background: hsl(var(--b2));
  text-decoration: none !important;
}

.verona-title-case-tabs :deep(.grid > a:hover *) {
  text-decoration: none !important;
}

.verona-title-case-tabs :deep(.grid > a h3) {
  color: #b56135;
}
</style>

<route>
{
  path: '/:chain/block',
  meta: { i18n: 'blocks', order: 5 }
}
</route>
