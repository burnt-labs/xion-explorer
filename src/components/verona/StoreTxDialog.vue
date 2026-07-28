<script setup lang="ts">
import { ref } from 'vue';
import { useBlockchain, useTxDialog } from '@/stores';
import TxDialog from './TxDialog.vue';

const store = useTxDialog();
const chain = useBlockchain();
const banner = ref<{ type: 'success' | 'error'; message: string; hash?: string } | null>(null);

function confirmed(result: any) {
  store.confirmed(result);
  const hash = result?.transactionHash || '';
  banner.value = { type: 'success', message: hash ? `Transaction ${hash}` : 'Transaction submitted', hash };
}

function failed(message: string) {
  banner.value = { type: 'error', message };
}
</script>

<template>
  <div v-if="banner" class="fixed inset-x-0 top-4 z-[1000] flex justify-center px-4 pointer-events-none">
    <div
      class="alert w-auto max-w-[min(48rem,calc(100vw-2rem))] pointer-events-auto"
      :class="banner.type === 'success' ? 'alert-success' : 'alert-error'"
    >
      <button
        type="button"
        class="min-w-0 flex-1 truncate text-left"
        :class="{ 'cursor-pointer': banner.hash }"
        :title="banner.message"
        @click="banner.hash && store.view({ detail: { eventType: 'tx', hash: banner.hash } })"
      >{{ banner.message }}</button>
      <button type="button" class="btn btn-circle btn-ghost btn-xs shrink-0" aria-label="Dismiss transaction notification" @click.stop="banner = null">✕</button>
    </div>
  </div>
  <TxDialog
    :type="store.type"
    :sender="store.sender"
    :endpoint="store.endpoint"
    :params="store.params"
    :hd-path="store.hdPaths"
    :registry-name="chain.current?.prettyName || chain.chainName"
    :visible="store.visible"
    @close="store.close()"
    @view="store.view"
    @confirmed="confirmed"
    @failed="failed"
  />
</template>
