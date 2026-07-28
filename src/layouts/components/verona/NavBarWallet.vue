<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router';
import { useBaseStore, useBlockchain, useWalletStore } from '@/stores';
import { Icon } from '@iconify/vue';
import { ref, computed, onMounted } from 'vue';
import { connectAbstraxion, initializeAbstraxion } from '@/services/abstraxion';

const route = useRoute();
const router = useRouter();
const walletStore = useWalletStore();
const chainStore = useBlockchain();
const baseStore = useBaseStore();
const oauthError = ref('');
const oauthBusy = ref(false);
const connectModal = ref(false);
const navigateAfterConnect = ref(route.query.connect === 'true');
function openWalletConnector() {
  navigateAfterConnect.value = true;
  connectModal.value = false;
}
function openConnectedAccount() {
  if (!walletStore.currentAddress) return;
  navigateAfterConnect.value = false;
  router.replace(`/${chainStore.chainName}/account/${walletStore.currentAddress}`);
}
function disconnectAndReconnect() {
  walletStore.disconnect();
  if (/\/account(?:\/|$)/.test(route.path)) {
    window.location.assign(`/${chainStore.chainName}?connect=true`);
    return;
  }
  oauthError.value = '';
  oauthBusy.value = false;
  connectModal.value = true;
}
async function connectWithOAuth() {
  oauthError.value = '';
  oauthBusy.value = true;
  navigateAfterConnect.value = true;
  try {
    await connectAbstraxion();
  } catch (cause) {
    oauthError.value = cause instanceof Error ? cause.message : 'OAuth login failed';
    oauthBusy.value = false;
  }
}
// walletStore.$subscribe((m, s) => {
//   console.log(m, s);
// });
function walletStateChange(res: any) {
  walletStore.setConnectedWallet(res.detail?.value);
  connectModal.value = false;
  openConnectedAccount();
}

onMounted(() => {
  void initializeAbstraxion((address) => {
    walletStore.setConnectedWallet({
      wallet: 'XION Abstract Account',
      cosmosAddress: address,
      hdPath: chainStore.defaultHDPath,
      connectionType: 'oauth',
    });
    connectModal.value = false;
    if (navigateAfterConnect.value) openConnectedAccount();
  }).catch((cause) => {
    oauthError.value = cause instanceof Error ? cause.message : 'XION account initialization failed';
  });
  if (route.query.connect !== 'true') return;
  if (walletStore.currentAddress) {
    router.replace(`/${chainStore.chainName}/account/${walletStore.currentAddress}`);
  } else {
    connectModal.value = true;
  }
});
let showCopyToast = ref(0);
async function copyAdress(address: string) {
  try {
    await navigator.clipboard.writeText(address);
    showCopyToast.value = 1;
    setTimeout(() => {
      showCopyToast.value = 0;
    }, 1000);
  } catch (err) {
    showCopyToast.value = 2;
    setTimeout(() => {
      showCopyToast.value = 0;
    }, 1000);
  }
}
const tipMsg = computed(() => {
  return showCopyToast.value === 2
    ? { class: 'error', msg: 'Copy Error!' }
    : { class: 'success', msg: 'Copy Success!' };
});

const params = computed(() => {
  if (chainStore.chainName == 'side') {
    return JSON.stringify({
      wallet: ['okex', 'unisat'],
    });
  }
  return '';
});
</script>

<template>
  <label
    v-if="!walletStore.currentAddress"
    for="VeronaConnectWallet"
    class="btn btn-sm btn-primary m-1 lowercase truncate !inline-flex text-xs md:!text-sm"
  >
    <Icon icon="mdi:wallet" />
    <span class="ml-1 hidden md:block">Wallet</span>
  </label>
  <div v-else class="dropdown dropdown-hover dropdown-end">
    <label
      tabindex="0"
      class="btn btn-sm btn-primary m-1 lowercase truncate !inline-flex text-xs md:!text-sm"
    >
      <Icon icon="mdi:wallet" />
      <span class="ml-1 hidden md:block"> {{ walletStore.shortAddress || 'Wallet' }}</span>
    </label>
    <div
      tabindex="0"
      class="dropdown-content menu shadow p-2 bg-base-100 rounded w-52 md:!w-64 overflow-auto"
    >
      <div class="px-2 mb-1 text-base-content/70 font-semibold">
        {{ walletStore.connectedWallet?.wallet }}
      </div>
      <div>
        <a
          v-if="walletStore.currentAddress"
          class="block py-2 px-2 hover:bg-active rounded cursor-pointer"
          style="overflow-wrap: anywhere"
          @click="copyAdress(walletStore.currentAddress)"
        >
          {{ walletStore.currentAddress }}
        </a>
        <div v-if="walletStore.currentAddress" class="divider mt-1 mb-1"></div>
        <a
          v-if="walletStore.currentAddress"
          class="block py-2 px-2 hover:bg-active rounded cursor-pointer"
          @click="disconnectAndReconnect"
          >Disconnect</a
        >
      </div>
    </div>
    <div class="toast" v-show="showCopyToast === 1">
      <div class="alert alert-success">
        <div class="text-xs md:!text-sm">
          <span>{{ tipMsg.msg }}</span>
        </div>
      </div>
    </div>
    <div class="toast" v-show="showCopyToast === 2">
      <div class="alert alert-error">
        <div class="text-xs md:!text-sm">
          <span>{{ tipMsg.msg }}</span>
        </div>
      </div>
    </div>
  </div>
  <Teleport to="body">
    <input id="VeronaConnectWallet" v-model="connectModal" type="checkbox" class="modal-toggle" />
    <div class="modal" role="dialog" aria-labelledby="verona-connect-title">
      <div class="modal-box max-w-sm">
        <h2 id="verona-connect-title" class="text-2xl font-semibold">Connect</h2>
        <p class="mt-2 text-sm text-base-content/70">Choose how you want to connect to Verona.</p>
        <div class="mt-6 grid gap-3">
          <button
            class="btn btn-primary"
            :disabled="oauthBusy"
            @click="connectWithOAuth"
          >
            <span v-if="oauthBusy" class="loading loading-spinner loading-xs"></span>
            <Icon v-else icon="mdi:login" />
            <span>Connect with Verona</span>
          </button>
          <label for="PingConnectWallet" class="btn btn-outline" @click="openWalletConnector">
            <Icon icon="mdi:wallet-outline" />
            <span>Connect with Wallet</span>
          </label>
        </div>
        <p v-if="oauthError" class="mt-3 text-sm text-error">{{ oauthError }}</p>
        <div class="modal-action">
          <label for="VeronaConnectWallet" class="btn btn-ghost">Cancel</label>
        </div>
      </div>
      <label class="modal-backdrop" for="VeronaConnectWallet" aria-label="Close connection dialog">Close</label>
    </div>
    <ping-connect-wallet
      :chain-id="baseStore.currentChainId || 'cosmoshub-4'"
      :hd-path="chainStore.defaultHDPath"
      :addr-prefix="chainStore.current?.bech32Prefix || 'cosmos'"
      @connect="walletStateChange"
      @keplr-config="walletStore.suggestChain()"
      :params="params"
    />
  </Teleport>
</template>

<style>
.ping-connect-btn,
.ping-connect-dropdown {
  display: none !important;
}
</style>
