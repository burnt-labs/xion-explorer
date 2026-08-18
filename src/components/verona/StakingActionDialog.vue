<script setup lang="ts">
import { ref } from 'vue';
import { useFormatter, useTxDialog } from '@/stores';

type StakingAction = 'delegate' | 'redelegate' | 'unbond';

const props = defineProps<{ onConfirmed?: () => void }>();
const dialog = useTxDialog();
const format = useFormatter();
const visible = ref(false);
const validatorAddress = ref('');
const action = ref<StakingAction>('delegate');

function open(address = '', defaultAction: StakingAction = 'delegate') {
  validatorAddress.value = address;
  action.value = defaultAction;
  visible.value = true;
}

function continueToTransaction() {
  visible.value = false;
  dialog.open(action.value, { validator_address: validatorAddress.value }, props.onConfirmed);
}

defineExpose({ open });
</script>

<template>
  <slot :open="open" />
  <input v-model="visible" type="checkbox" class="modal-toggle" />
  <div class="modal" role="dialog" aria-labelledby="staking-action-title">
    <div class="modal-box max-w-md">
      <div class="flex items-center justify-between">
        <h2 id="staking-action-title" class="text-xl font-semibold">{{ $t('account.manage_staking') }}</h2>
        <button type="button" class="btn btn-circle btn-ghost btn-sm" aria-label="Close" @click="visible = false">✕</button>
      </div>
      <p v-if="validatorAddress" class="mt-2 truncate text-sm text-base-content/60" :title="validatorAddress">
        {{ format.validatorFromBech32(validatorAddress) || validatorAddress }}
      </p>
      <div class="mt-5 grid gap-2">
        <label v-for="choice in (['delegate', 'redelegate', 'unbond'] as const)" :key="choice" class="flex cursor-pointer items-center gap-3 rounded-lg border border-base-300 p-3 hover:bg-active">
          <input v-model="action" type="radio" class="radio radio-sm" name="staking-action" :value="choice" />
          <span>{{ choice === 'delegate' ? $t('account.btn_delegate') : choice === 'redelegate' ? $t('account.btn_redelegate') : $t('account.btn_unbond') }}</span>
        </label>
      </div>
      <div class="modal-action">
        <button type="button" class="btn" @click="visible = false">Cancel</button>
        <label :for="action" class="btn btn-primary" @click="continueToTransaction">Continue</label>
      </div>
    </div>
    <button type="button" class="modal-backdrop" aria-label="Close" @click="visible = false"></button>
  </div>
</template>
