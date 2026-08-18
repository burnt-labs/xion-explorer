<script setup lang="ts">
import { computed } from 'vue';
import { useTxDialog, useWalletStore } from '@/stores';
import { operatorAddressToAccount } from '@/libs';
import StakingActionDialog from '@/components/verona/StakingActionDialog.vue';
import ValidatorPage from '../../staking/[validator].vue';

const props = defineProps<{ validator: string; chain: string }>();

const dialog = useTxDialog();
const walletStore = useWalletStore();
const isValidatorOperator = computed(
  () =>
    Boolean(walletStore.currentAddress) &&
    walletStore.currentAddress === operatorAddressToAccount(props.validator)
);
</script>

<template>
  <ValidatorPage :validator="validator" :chain="chain">
    <template #delegate-action="{ validator: currentValidator }">
      <StakingActionDialog v-slot="{ open }">
        <button
          type="button"
          class="btn btn-primary btn-sm w-full"
          @click="open(currentValidator.operator_address, 'delegate')"
        >
          {{ $t('account.btn_delegate') }}
        </button>
      </StakingActionDialog>
    </template>

    <template #commission-action="{ validator: currentValidator }">
      <div v-if="isValidatorOperator">
        <label
          for="withdraw_commission"
          class="btn btn-primary w-full"
          @click="
            dialog.open('withdraw_commission', {
              validator_address: currentValidator.operator_address,
            })
          "
          >{{ $t('account.btn_withdraw') }}</label
        >
      </div>
    </template>
  </ValidatorPage>
</template>

<route>
{
  path: '/:chain/staking/:validator'
}
</route>
