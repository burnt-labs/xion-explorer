<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useBaseStore } from '@/stores';
import BlockPage from '../../block/[height].vue';

const props = defineProps<{ chain: string; height: string }>();
const router = useRouter();
const base = useBaseStore();
const targetHeight = ref(props.height);
const isFutureBlock = computed(() => {
  const latestHeight = Number(base.latest?.block?.header.height || 0);
  return latestHeight > 0 && Number(props.height) > latestHeight;
});

watch(() => props.height, (height) => (targetHeight.value = height));

function updateCountdown() {
  const height = Number(targetHeight.value);
  if (!Number.isSafeInteger(height) || height < 1) return;
  router.push(`/${props.chain}/block/${height}`);
}
</script>

<template>
  <div>
    <div class="tabs tabs-boxed bg-transparent mb-4">
      <RouterLink class="tab text-base-content/60" :class="{ 'tab-active': !isFutureBlock }" :to="`/${chain}/block`">
        {{ $t('block.recent') }}
      </RouterLink>
      <span v-if="isFutureBlock" class="tab tab-active text-base-content/60">{{ $t('block.future') }}</span>
      <RouterLink
        v-else
        class="tab text-base-content/60"
        :to="`/${chain}/block/${Number(base.latest?.block?.header.height || 0) + 10000}`"
      >
        {{ $t('block.future') }}
      </RouterLink>
    </div>
    <form
      v-if="isFutureBlock"
      class="future-block-selector mx-auto mb-4 flex flex-col gap-2 sm:flex-row"
      @submit.prevent="updateCountdown"
    >
      <input
        v-model="targetHeight"
        type="number"
        min="1"
        step="1"
        class="input input-sm h-10 flex-1 border border-base-300 bg-base-100 px-4 focus:border-primary"
        placeholder="Block height"
        aria-label="Future block height"
      />
      <button type="submit" class="btn btn-sm h-10 btn-primary">Update countdown</button>
    </form>
    <div class="verona-future-block">
      <BlockPage :chain="chain" :height="height" />
    </div>
  </div>
</template>

<style scoped>
.future-block-selector {
  width: min(30%, 36rem);
  min-width: 22rem;
}

@media (max-width: 640px) {
  .future-block-selector {
    width: 100%;
    min-width: 0;
  }
}

.verona-future-block :deep(.text-center table tbody tr:first-child) {
  display: none;
}
</style>

<route>
{
  path: '/:chain/block/:height',
  meta: { i18n: 'blocks', order: 5 }
}
</route>
