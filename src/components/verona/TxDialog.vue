<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { coin, GasPrice, SigningStargateClient } from '@cosmjs/stargate';
import { SigningCosmWasmClient } from '@cosmjs/cosmwasm-stargate';
import { fromBech32, toUtf8 } from '@cosmjs/encoding';
import { useBlockchain } from '@/stores';
import { useWalletStore } from '@/stores/verona/useWalletStore';
import { getAbstraxionSigningClient } from '@/services/abstraxion';
import type { Validator } from '@/types';

type KeplrProvider = {
  enable(chainId: string): Promise<void>;
  getOfflineSignerAuto(chainId: string): Promise<unknown>;
};

const props = defineProps<{
  type: string;
  sender: string;
  endpoint: string;
  params: string;
  hdPath?: string;
  registryName?: string;
  visible: boolean;
}>();
const emit = defineEmits<{
  close: [];
  view: [event: { detail: { eventType: string; hash: string } }];
  confirmed: [result: unknown];
  failed: [message: string];
}>();
const chain = useBlockchain();
const wallet = useWalletStore();
const recipient = ref('');
const amount = ref<string | number>('');
const denom = ref('');
const amountDenom = ref('');
const validator = ref('');
const destinationValidator = ref('');
const activeValidatorsOnly = ref(true);
const validators = ref<Validator[]>([]);
const sourceValidatorInfo = ref<Validator | null>(null);
const voteOption = ref(1);
const contract = ref('');
const message = ref('{}');
const memo = ref('');
const advanced = ref(false);
const feeAmount = ref('2000');
const gas = ref('400000');
const broadcastMode = ref('sync');
const busy = ref(false);
const balances = ref<{ amount: string; denom: string }[]>([]);
const stakingDenom = ref('');
const delegatedBalance = ref<{ amount: string; denom: string } | null>(null);
const error = ref('');
const result = ref('');

const params = computed<Record<string, any>>(() => {
  try { return JSON.parse(props.params || '{}'); } catch { return {}; }
});
const assets = computed(() => chain.current?.assets || []);
const selectedAsset = computed(() => assets.value.find((asset) => asset.base === denom.value) || assets.value[0]);
const amountUnits = computed(() => [...(selectedAsset.value?.denom_units || [])].sort((a, b) => Number(b.exponent) - Number(a.exponent)));
const selectedUnit = computed(() => amountUnits.value.find((unit) => unit.denom === amountDenom.value) || amountUnits.value[0]);
const title = computed(() => props.type.replace(/^wasm_/, '').replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase()));
const isBulkWithdraw = computed(() => props.type === 'withdraw' && !params.value.validator_address);
const isAmountAction = computed(() => ['send', 'delegate', 'redelegate', 'unbond', 'deposit'].includes(props.type));
const isWasmExecute = computed(() => props.type === 'wasm_execute_contract');
const isStakingAmountAction = computed(() => ['delegate', 'redelegate', 'unbond'].includes(props.type));
const available = computed(() => {
  if (props.type === 'redelegate' || props.type === 'unbond') return delegatedBalance.value?.amount || '0';
  return balances.value.find((balance) => balance.denom === denom.value)?.amount || '0';
});
const validatorOptions = computed(() => validators.value.slice().sort(
  (a, b) => Number(b.delegator_shares) - Number(a.delegator_shares)
));
const recipientIsValid = computed(() => {
  const value = recipient.value.trim();
  if (!value) return false;
  try {
    const decoded = fromBech32(value);
    return decoded.prefix === chain.current?.bech32Prefix && decoded.data.length > 0;
  } catch {
    return false;
  }
});
const recipientError = computed(() => recipient.value.trim() && !recipientIsValid.value
  ? `Enter a valid ${chain.current?.bech32Prefix || 'account'} address.`
  : '');
const submitDisabled = computed(() => {
  if (busy.value) return true;
  const numericAmount = Number(String(amount.value).replaceAll(',', ''));
  if (props.type === 'send') {
    return !recipientIsValid.value || !Number.isFinite(numericAmount) || numericAmount <= 0;
  }
  if (props.type === 'unbond') {
    return !validator.value || !delegatedBalance.value || !Number.isFinite(numericAmount) || numericAmount <= 0;
  }
  if (props.type === 'redelegate') {
    return !validator.value || !destinationValidator.value || !delegatedBalance.value || !Number.isFinite(numericAmount) || numericAmount <= 0;
  }
  if (isBulkWithdraw.value) return wallet.rewards.rewards.length === 0;
  return false;
});

function validatorLabel(entry: Validator) {
  const commission = Number(entry.commission?.commission_rates?.rate || 0) * 100;
  const inactive = entry.status === 'BOND_STATUS_BONDED' ? '' : ' — Inactive';
  return `${entry.description?.moniker || entry.operator_address} (${commission.toLocaleString('en-US', { maximumFractionDigits: 2 })}%)${inactive}`;
}

async function loadValidators() {
  if (!['delegate', 'redelegate'].includes(props.type)) return;
  const statuses = activeValidatorsOnly.value
    ? ['BOND_STATUS_BONDED']
    : ['BOND_STATUS_BONDED', 'BOND_STATUS_UNBONDING', 'BOND_STATUS_UNBONDED'];
  const responses = await Promise.all(statuses.map(async (status) => {
    const query = new URLSearchParams({ status, 'pagination.limit': '500' });
    const response = await fetch(`${props.endpoint}/cosmos/staking/v1beta1/validators?${query}`);
    if (!response.ok) throw new Error(`Unable to load validators (${response.status})`);
    return response.json() as Promise<{ validators?: Validator[] }>;
  }));
  validators.value = responses.flatMap((response) => response.validators || []);
}

async function loadBalances() {
  if (!props.endpoint || !props.sender) {
    balances.value = [];
    return;
  }
  const response = await fetch(`${props.endpoint}/cosmos/bank/v1beta1/balances/${props.sender}`);
  if (!response.ok) throw new Error(`Unable to load balances (${response.status})`);
  const body = await response.json() as { balances?: { amount: string; denom: string }[] };
  balances.value = body.balances || [];
}

async function loadStakingContext() {
  if (!isStakingAmountAction.value) return;
  const paramsResponse = await fetch(`${props.endpoint}/cosmos/staking/v1beta1/params`);
  if (!paramsResponse.ok) throw new Error(`Unable to load staking parameters (${paramsResponse.status})`);
  const staking = await paramsResponse.json() as { params?: { bond_denom?: string } };
  const bondDenom = staking.params?.bond_denom;
  if (!bondDenom) throw new Error('Staking bond denomination is unavailable');
  stakingDenom.value = bondDenom;
  denom.value = bondDenom;

  if (props.type !== 'redelegate' && props.type !== 'unbond') return;
  const sourceValidator = params.value.validator_address;
  if (!sourceValidator) throw new Error('Source validator is required');
  const validatorResponse = await fetch(`${props.endpoint}/cosmos/staking/v1beta1/validators/${sourceValidator}`);
  if (!validatorResponse.ok) throw new Error(`Unable to load source validator (${validatorResponse.status})`);
  const validatorBody = await validatorResponse.json() as { validator?: Validator };
  if (!validatorBody.validator) throw new Error('Source validator is unavailable');
  sourceValidatorInfo.value = validatorBody.validator;
  const delegationResponse = await fetch(`${props.endpoint}/cosmos/staking/v1beta1/delegations/${props.sender}`);
  if (!delegationResponse.ok) throw new Error(`Unable to load bonded amount (${delegationResponse.status})`);
  const delegation = await delegationResponse.json() as {
    delegation_responses?: Array<{
      delegation?: { validator_address?: string };
      balance?: { amount: string; denom: string };
    }>;
  };
  const balance = delegation.delegation_responses?.find(
    (entry) => entry.delegation?.validator_address === sourceValidator
  )?.balance;
  if (!balance || balance.denom !== bondDenom) throw new Error('Bonded staking balance is unavailable');
  delegatedBalance.value = balance;
}

function assetExponent(asset = selectedAsset.value) {
  return Math.max(...(asset?.denom_units || []).map((unit) => Number(unit.exponent)), 0);
}
function displayAmount(raw: string, power = Number(selectedUnit.value?.exponent ?? assetExponent())) {
  const value = Number(raw) / 10 ** power;
  return Number.isFinite(value) ? value.toLocaleString('en-US', { maximumFractionDigits: power }) : '0';
}
function inputAmount(raw: string, power = Number(selectedUnit.value?.exponent ?? assetExponent())) {
  const value = Number(raw) / 10 ** power;
  return Number.isFinite(value) ? value.toLocaleString('en-US', { maximumFractionDigits: power, useGrouping: false }) : '0';
}
function displayAssetAmount(raw: string, asset: typeof selectedAsset.value) {
  return displayAmount(raw, assetExponent(asset));
}
function unitName(denomValue: string) {
  return selectedAsset.value?.denom_aliases?.[denomValue] || denomValue;
}
function baseAmount() {
  const numeric = Number(String(amount.value).replaceAll(',', ''));
  if (!Number.isFinite(numeric) || numeric <= 0) throw new Error('Enter a valid amount');
  return String(Math.round(numeric * 10 ** Number(selectedUnit.value?.exponent || 0)));
}
function fillAvailable() { amount.value = inputAmount(available.value); }

watch(denom, () => {
  amountDenom.value = amountUnits.value[0]?.denom || denom.value;
  amount.value = '';
});

watch(activeValidatorsOnly, () => {
  if (props.visible) void loadValidators().catch((cause) => {
    error.value = cause instanceof Error ? cause.message : String(cause);
  });
});

watch(() => [props.visible, props.params] as const, ([visible]) => {
  if (!visible) return;
  const initial = params.value;
  recipient.value = initial.recipient || '';
  validator.value = initial.validator_address || '';
  destinationValidator.value = initial.validator_dst_address || '';
  activeValidatorsOnly.value = true;
  contract.value = initial.contract || '';
  message.value = JSON.stringify(initial.execution || {}, null, 2);
  denom.value = assets.value[0]?.base || '';
  amountDenom.value = amountUnits.value[0]?.denom || denom.value;
  amount.value = '';
  error.value = '';
  result.value = '';
  delegatedBalance.value = null;
  sourceValidatorInfo.value = null;
  void Promise.all([loadBalances(), loadStakingContext(), loadValidators()]).catch((cause) => {
    error.value = cause instanceof Error ? cause.message : String(cause);
  });
});

async function signer() {
  const provider = (window as any).keplr as KeplrProvider | undefined;
  if (!provider) throw new Error('A Keplr-compatible wallet is required');
  const chainId = chain.current?.chainId;
  if (!chainId) throw new Error('Chain ID is unavailable');
  await provider.enable(chainId);
  return provider.getOfflineSignerAuto(chainId) as any;
}

async function submit() {
  busy.value = true;
  error.value = '';
  result.value = '';
  try {
    const rpc = chain.current?.endpoints?.rpc?.[0]?.address;
    if (!rpc) throw new Error('RPC endpoint is unavailable');
    const sender = props.sender || wallet.currentAddress;
    if (!sender) throw new Error('Connect a wallet first');
    const isAbstractAccount = wallet.connectedWallet?.connectionType === 'oauth';
    const abstractClient = isAbstractAccount ? await getAbstraxionSigningClient() : undefined;
    const offlineSigner = isAbstractAccount ? undefined : await signer();
    const gasPrice = GasPrice.fromString(`0.001${assets.value[0]?.base || 'uxion'}`);
    const fee = advanced.value
      ? { amount: [coin(feeAmount.value, assets.value[0]?.base || 'uxion')], gas: gas.value }
      : 'auto';
    let response;
    if (isWasmExecute.value) {
      const client = abstractClient || await SigningCosmWasmClient.connectWithSigner(rpc, offlineSigner!, { gasPrice: gasPrice as any });
      response = await client.signAndBroadcast(sender, [{
        typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
        value: { sender, contract: contract.value, msg: toUtf8(message.value), funds: [] },
      }], fee, memo.value);
    } else {
      const client = abstractClient || await SigningStargateClient.connectWithSigner(rpc, offlineSigner!, { gasPrice });
      const funds = () => coin(baseAmount(), denom.value);
      if (props.type === 'send') response = await client.sendTokens(sender, recipient.value, [funds()], fee, memo.value);
      else if (props.type === 'delegate') response = await client.signAndBroadcast(sender, [{ typeUrl: '/cosmos.staking.v1beta1.MsgDelegate', value: { delegatorAddress: sender, validatorAddress: validator.value, amount: funds() } }], fee, memo.value);
      else if (props.type === 'unbond') response = await client.signAndBroadcast(sender, [{ typeUrl: '/cosmos.staking.v1beta1.MsgUndelegate', value: { delegatorAddress: sender, validatorAddress: validator.value, amount: funds() } }], 'auto', memo.value);
      else if (props.type === 'redelegate') response = await client.signAndBroadcast(sender, [{ typeUrl: '/cosmos.staking.v1beta1.MsgBeginRedelegate', value: { delegatorAddress: sender, validatorSrcAddress: validator.value, validatorDstAddress: destinationValidator.value, amount: funds() } }], 'auto', memo.value);
      else if (props.type === 'withdraw') {
        const validators = validator.value ? [validator.value] : wallet.rewards.rewards.map((reward) => reward.validator_address);
        response = await client.signAndBroadcast(sender, validators.map((address) => ({ typeUrl: '/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward', value: { delegatorAddress: sender, validatorAddress: address } })), 'auto', memo.value);
      } else if (props.type === 'withdraw_commission') response = await client.signAndBroadcast(sender, [{ typeUrl: '/cosmos.distribution.v1beta1.MsgWithdrawValidatorCommission', value: { validatorAddress: validator.value } }], 'auto', memo.value);
      else if (props.type === 'vote') response = await client.signAndBroadcast(sender, [{ typeUrl: '/cosmos.gov.v1beta1.MsgVote', value: { proposalId: BigInt(params.value.proposal_id), voter: sender, option: voteOption.value } }], 'auto', memo.value);
      else if (props.type === 'deposit') response = await client.signAndBroadcast(sender, [{ typeUrl: '/cosmos.gov.v1beta1.MsgDeposit', value: { proposalId: BigInt(params.value.proposal_id), depositor: sender, amount: [funds()] } }], 'auto', memo.value);
      else throw new Error(`${title.value} is not implemented in the native transaction dialog`);
    }
    if (!response) return;
    if ('code' in response && response.code !== 0) throw new Error(response.rawLog || `Transaction failed with code ${response.code}`);
    result.value = 'transactionHash' in response ? response.transactionHash : '';
    await wallet.loadMyAsset();
    emit('confirmed', response);
    emit('close');
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    emit('failed', message);
    emit('close');
  } finally { busy.value = false; }
}
</script>

<template>
  <div v-if="visible" class="modal modal-open" role="dialog" aria-modal="true" :aria-label="title">
    <div class="modal-box max-w-lg">
      <div class="flex items-center justify-between">
        <h2 class="text-xl font-semibold">{{ title }}</h2>
        <button class="btn btn-circle btn-ghost btn-sm" aria-label="Close" @click="emit('close')">✕</button>
      </div>
      <div class="mt-5">
        <div class="form-control"><label class="label"><span class="label-text">Sender</span></label><input :value="sender" class="input border !border-gray-300 dark:!border-gray-600" /></div>
        <div v-if="isAmountAction && !isStakingAmountAction" class="form-control"><label class="label"><span class="label-text">Balances</span></label><select v-model="denom" class="select select-bordered"><option value="">Select a token</option><option v-for="asset in assets" :key="asset.base" :value="asset.base">{{ asset.symbol }} {{ displayAssetAmount(balances.find((b) => b.denom === asset.base)?.amount || '0', asset) }}</option></select></div>
        <div v-if="type === 'send'" class="form-control"><label class="label"><span class="label-text">Recipient</span></label><input v-model.trim="recipient" class="input border border-gray-300 dark:border-gray-600" :class="{ '!border-error': recipientError }" aria-describedby="send-recipient-error" /><p v-if="recipientError" id="send-recipient-error" class="mt-1 text-sm text-error">{{ recipientError }}</p></div>
        <div v-if="type === 'delegate'" class="form-control"><label class="label"><span class="label-text">Validator</span><span class="flex items-center gap-2"><input v-model="activeValidatorsOnly" type="checkbox" class="checkbox checkbox-sm checkbox-primary" /><span class="label-text">Active Only</span></span></label><select v-model="validator" class="select select-bordered"><option value="">Select a validator</option><option v-for="entry in validatorOptions" :key="entry.operator_address" :value="entry.operator_address">{{ validatorLabel(entry) }}</option></select></div>
        <div v-if="(type === 'withdraw' && !isBulkWithdraw) || type === 'withdraw_commission'" class="form-control"><label class="label"><span class="label-text">Validator</span></label><input v-model.trim="validator" class="input border border-gray-300 dark:border-gray-600" /></div>
        <div v-if="type === 'redelegate'" class="form-control"><label class="label"><span class="label-text">Source Validator</span></label><input :value="sourceValidatorInfo ? validatorLabel(sourceValidatorInfo) : validator" class="input border border-gray-300" readonly /></div>
        <div v-if="type === 'redelegate'" class="form-control"><label class="label"><span class="label-text">Destination Validator</span><span class="flex items-center gap-2"><input v-model="activeValidatorsOnly" type="checkbox" class="checkbox checkbox-sm checkbox-primary" /><span class="label-text">Active Only</span></span></label><select v-model="destinationValidator" class="select select-bordered"><option value="">Select a validator</option><option v-for="entry in validatorOptions" :key="entry.operator_address" :value="entry.operator_address" :disabled="entry.operator_address === validator">{{ validatorLabel(entry) }}</option></select></div>
        <div v-if="isAmountAction" class="form-control"><label class="label"><span class="label-text">Amount</span><button type="button" class="btn btn-primary btn-xs h-auto min-h-0 px-2 py-1 normal-case" @click="fillAvailable">{{ displayAmount(available) }} {{ unitName(amountDenom) }}</button></label><label class="input-group"><input v-model="amount" type="number" :placeholder="`Available: ${displayAmount(available)}`" class="input border border-gray-300 dark:border-gray-600 w-full" /><select v-model="amountDenom" class="select select-bordered"><option v-for="unit in amountUnits" :key="unit.denom" :value="unit.denom">{{ unitName(unit.denom) }}</option></select></label></div>
        <div v-if="type === 'vote'" class="form-control"><label class="label"><span class="label-text">Vote</span></label><select v-model="voteOption" class="select border border-gray-300 dark:border-gray-600"><option :value="1">Yes</option><option :value="2">Abstain</option><option :value="3">No</option><option :value="4">No with veto</option></select></div>
        <template v-if="isWasmExecute"><div class="form-control"><label class="label"><span class="label-text">Contract</span></label><input v-model.trim="contract" class="input border border-gray-300 dark:border-gray-600" /></div><div class="form-control"><label class="label"><span class="label-text">Message</span></label><textarea v-model="message" class="textarea border border-gray-300 dark:border-gray-600 font-mono" rows="8" /></div></template>
        <div :class="advanced ? '' : 'hidden'">
          <div class="form-control"><label class="label"><span class="label-text">Fees</span></label><label class="input-group"><input v-model="feeAmount" class="input border border-gray-300 flex-1" /><select class="select input border border-gray-300 w-[200px]"><option>{{ assets[0]?.base }}</option></select></label></div>
          <div class="form-control"><label class="label"><span class="label-text">Gas</span></label><input v-model="gas" type="number" class="input border border-gray-300" /></div>
          <div class="form-control"><label class="label"><span class="label-text">Memo</span></label><input v-model="memo" class="input border border-gray-300" placeholder="Memo" /></div>
          <div class="form-control"><label class="label"><span class="label-text">Broadcast Mode</span></label><select v-model="broadcastMode" class="select input border border-gray-300 w-[200px]"><option value="sync">Sync</option><option value="async">Async</option><option value="block">Block</option></select></div>
        </div>
      </div>
      <div class="modal-action flex justify-between items-center"><div class="flex items-center cursor-pointer"><input :id="`${type}-advance`" v-model="advanced" type="checkbox" class="checkbox checkbox-sm checkbox-primary mr-2" /><label :for="`${type}-advance`" class="cursor-pointer">Advanced</label></div><button class="btn btn-primary" :disabled="submitDisabled" @click="submit"><span v-if="busy" class="loading loading-spinner"></span>{{ busy ? 'Sending…' : 'Send' }}</button></div>
    </div>
    <button class="modal-backdrop" aria-label="Close" @click="emit('close')"></button>
  </div>
</template>
