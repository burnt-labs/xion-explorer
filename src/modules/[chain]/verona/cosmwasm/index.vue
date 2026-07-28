<script lang="ts" setup>
import CosmWasmPage from '../../cosmwasm/index.vue';

defineProps<{ chain: string }>();
</script>

<template>
  <div class="verona-cosmwasm-page">
    <CosmWasmPage :chain="chain" upload-button-by-search />
  </div>
</template>

<style scoped>
.verona-cosmwasm-page :deep(> div > h2:first-child) {
  display: none;
}

.verona-cosmwasm-page :deep(select.select-primary) {
  border-width: 1px;
  border-color: hsl(var(--p));
}

.verona-cosmwasm-page :deep(> div > .grid) {
  padding-bottom: 0.75rem;
}

.verona-cosmwasm-page :deep(> div > .grid select),
.verona-cosmwasm-page :deep(> div > .grid input),
.verona-cosmwasm-page :deep(> div > .grid .btn) {
  height: 3rem;
  min-height: 3rem;
}

.verona-cosmwasm-page :deep(.join > select.select-primary) {
  background-color: hsl(var(--p));
  color: hsl(var(--pc));
  font-weight: 600;
  border-radius: 0.5rem 0 0 0.5rem;
  border-right-width: 0;
}
</style>

<route>
{
  name: 'chain-verona-cosmwasm',
  path: '/:chain/cosmwasm',
  meta: { i18n: 'cosmwasm', titleKey: 'cosmwasm.title', order: 9 }
}
</route>
