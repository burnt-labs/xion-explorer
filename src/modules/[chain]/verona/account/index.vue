<script setup lang="ts">
import { useWalletStore } from '@/stores';
import Account from './[address].vue';

defineProps<{ chain: string }>();
const walletStore = useWalletStore();
</script>

<template>
  <Account
    v-if="walletStore.currentAddress"
    :chain="chain"
    :address="walletStore.currentAddress"
  />
  <div v-else aria-label="Account"></div>
</template>

<route>
{
  path: '/:chain',
  meta: { titleKey: 'account.acc' }
}
</route>
