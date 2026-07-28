import {
  AccountStateGuards,
  createAbstraxionRuntime,
  type AbstraxionRuntime,
  type SigningClient,
} from '@burnt-labs/abstraxion-js';
import { loadOAuthConfig } from './oauth';

let runtimePromise: Promise<AbstraxionRuntime> | undefined;

export function getAbstraxionRuntime() {
  if (!runtimePromise) {
    runtimePromise = loadOAuthConfig().then((config) => createAbstraxionRuntime({
      chainId: __VERONA_ENVIRONMENT__.network === 'testnet' ? 'xion-testnet-2' : 'xion-mainnet-1',
      treasury: config.treasury,
      authentication: {
        type: 'auto',
        authAppUrl: __VERONA_ENVIRONMENT__.network === 'testnet'
          ? 'https://auth.testnet.burnt.com'
          : 'https://settings.burnt.com',
        callbackUrl: window.location.href,
      },
    }));
  }
  return runtimePromise;
}

export async function initializeAbstraxion(onAccount: (address: string) => void) {
  const runtime = await getAbstraxionRuntime();
  const sync = () => {
    const state = runtime.getState();
    if (AccountStateGuards.isConnected(state)) onAccount(state.account.granterAddress);
  };
  runtime.subscribe(sync);
  await runtime.initialize();
  sync();
  return runtime;
}

export async function connectAbstraxion() {
  const runtime = await getAbstraxionRuntime();
  await runtime.initialize();
  await runtime.login();
}

export async function disconnectAbstraxion() {
  const runtime = await getAbstraxionRuntime();
  await runtime.logout();
}

export async function getAbstraxionSigningClient(): Promise<SigningClient> {
  const runtime = await getAbstraxionRuntime();
  const client = await runtime.createDirectSigningClient();
  if (!client) throw new Error('XION signing client is unavailable');
  return client;
}
