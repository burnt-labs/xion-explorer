<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useBaseStore, useFormatter } from '@/stores';

defineProps<{ chain: string }>();

const router = useRouter();
const base = useBaseStore();
const format = useFormatter();
const hash = ref('');
const error = ref('');
const hashPattern = /^[A-Fa-f\d]{64}$/;

function search() {
  const value = hash.value.trim();
  if (!value) {
    error.value = '';
    return;
  }
  if (!hashPattern.test(value)) {
    error.value = 'Enter a valid 64-character transaction hash.';
    return;
  }
  error.value = '';
  router.push(`/${router.currentRoute.value.params.chain}/tx/${value.toUpperCase()}`);
}
</script>

<template>
  <div>
    <form class="mb-4" role="search" @submit.prevent="search">
      <div class="join flex w-full">
      <input
        v-model="hash"
        type="text"
        class="input join-item input-sm h-10 min-w-0 flex-1 border border-base-300 bg-base-100 px-4 focus:border-primary"
        placeholder="Enter transaction hash"
        aria-label="Transaction hash"
        @input="error = ''"
      />
      <button type="submit" class="btn btn-primary join-item !h-10 !min-h-10 py-0">Search</button>
      </div>
      <p v-if="error" class="mt-2 text-sm text-error">{{ error }}</p>
    </form>

    <div class="overflow-x-auto bg-base-100">
      <table class="table table-compact w-full">
        <thead>
          <tr>
            <th>{{ $t('account.height') }}</th>
            <th>{{ $t('account.hash') }}</th>
            <th>{{ $t('account.messages') }}</th>
            <th>{{ $t('block.fees') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in base.txsInRecents" :key="item.hash" class="hover">
            <td class="text-sm text-primary"><RouterLink :to="`/${chain}/block/${item.height}`">{{ item.height }}</RouterLink></td>
            <td class="truncate text-primary" width="50%"><RouterLink :to="`/${chain}/tx/${item.hash}`">{{ item.hash }}</RouterLink></td>
            <td>{{ format.messages(item.tx.body.messages) }}</td>
            <td>{{ format.formatTokens(item.tx.authInfo.fee?.amount) }}</td>
          </tr>
        </tbody>
      </table>
      <div class="p-4 text-sm text-info">{{ $t('block.only_tx') }}</div>
    </div>
  </div>
</template>

<route>
{
  path: '/:chain/tx',
  meta: { i18n: 'tx', order: 5 }
}
</route>
