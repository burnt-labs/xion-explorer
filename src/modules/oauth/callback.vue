<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useWalletStore } from '@/stores';
import { completeOAuthLogin, consumeOAuthReturnTo, fetchOAuthAccount } from '@/services/oauth';

const route = useRoute();
const router = useRouter();
const walletStore = useWalletStore();
const error = ref('');

onMounted(async () => {
  const oauthError = typeof route.query.error === 'string' ? route.query.error : '';
  const code = typeof route.query.code === 'string' ? route.query.code : '';
  const state = typeof route.query.state === 'string' ? route.query.state : '';
  if (oauthError) {
    error.value = typeof route.query.error_description === 'string' ? route.query.error_description : oauthError;
    return;
  }
  if (!code || !state) {
    error.value = 'The OAuth callback is missing its authorization code or state.';
    return;
  }
  try {
    const tokens = await completeOAuthLogin(code, state);
    const account = await fetchOAuthAccount(tokens.accessToken);
    walletStore.setConnectedWallet({
      wallet: 'XION OAuth',
      cosmosAddress: account.id,
      hdPath: walletStore.blockchain.defaultHDPath,
      connectionType: 'oauth',
    });
    const returnTo = consumeOAuthReturnTo();
    await router.replace(
      returnTo === '/verona?connect=true'
        ? `/${walletStore.blockchain.chainName}/account/${walletStore.currentAddress}`
        : returnTo
    );
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'OAuth login failed';
  }
});
</script>

<template>
  <main class="min-h-[60vh] flex items-center justify-center px-4">
    <div class="max-w-md text-center">
      <template v-if="error">
        <h1 class="text-2xl font-semibold mb-3">Unable to connect</h1>
        <p class="text-base-content/70 mb-5">{{ error }}</p>
        <RouterLink to="/" class="btn btn-primary">Return to explorer</RouterLink>
      </template>
      <template v-else>
        <span class="loading loading-spinner loading-lg mb-4"></span>
        <h1 class="text-xl font-semibold">Connecting your XION account…</h1>
      </template>
    </div>
  </main>
</template>
