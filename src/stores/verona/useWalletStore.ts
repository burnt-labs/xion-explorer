import { defineStore } from 'pinia';
import { useBlockchain } from './useBlockchain';
import { useStorageStore } from '../useStorageStore';
import { fromBech32, toBech32 } from '@cosmjs/encoding';
import type { Delegation, Coin, UnbondingResponses, DelegatorRewards, WalletConnected } from '@/types';
import { useStakingStore } from '../useStakingStore';
import router from '@/router';
import { decryptWallet } from '@/utils/crypto';
import { disconnectAbstraxion } from '@/services/abstraxion';

type VeronaWalletConnected = WalletConnected & {
  connectionType?: 'oauth' | 'wallet';
};

function persistConnectedWallet(key: string, value: VeronaWalletConnected, storage: Storage) {
  const plaintext = JSON.stringify(value);
  storage.setItem(key, plaintext);
  localStorage.setItem(key, plaintext);
}

export const useWalletStore = defineStore('walletStore', {
  state: () => {
    return {
      balances: [] as Coin[],
      delegations: [] as Delegation[],
      unbonding: [] as UnbondingResponses[],
      rewards: { total: [], rewards: [] } as DelegatorRewards,
      wallet: {} as VeronaWalletConnected,
    };
  },
  getters: {
    blockchain() {
      return useBlockchain();
    },
    connectedWallet() {
      // @ts-ignore
      if (this.wallet.cosmosAddress) return this.wallet;
      const chainStore = useBlockchain();
      const key = chainStore.defaultHDPath;
      const storageStore = useStorageStore();
      const storage = storageStore.currentStorage;
      const raw = storage.getItem(key) || localStorage.getItem(key);
      if (!raw) return {};
      try {
        const parsed = JSON.parse(raw);
        if (parsed?.cosmosAddress || parsed?.hdPath) {
          persistConnectedWallet(key, parsed, storage);
          return parsed;
        }
      } catch {
        // not plaintext JSON, try decrypting
      }
      const decrypted = decryptWallet(raw);
      try {
        const parsed = JSON.parse(decrypted);
        persistConnectedWallet(key, parsed, storage);
        return parsed;
      } catch {
        return {};
      }
    },
    balanceOfStakingToken(): Coin {
      const stakingStore = useStakingStore();
      return (
        this.balances.find((x) => x.denom === stakingStore.params.bond_denom) || {
          amount: '0',
          denom: stakingStore.params.bond_denom,
        }
      );
    },
    stakingAmount() {
      const stakingStore = useStakingStore();
      let amt = 0;
      let denom = stakingStore.params.bond_denom;
      this.delegations.forEach((i) => {
        amt += Number(i.balance.amount);
        denom = i.balance.denom;
      });
      return { amount: String(amt), denom };
    },
    rewardAmount() {
      const stakingStore = useStakingStore();
      // @ts-ignore
      const reward = this.rewards.total?.find((x: Coin) => x.denom === stakingStore.params.bond_denom);
      return reward || { amount: '0', denom: stakingStore.params.bond_denom };
    },
    unbondingAmount() {
      let amt = 0;
      this.unbonding.forEach((i) => {
        i.entries.forEach((e) => {
          amt += Number(e.balance);
        });
      });

      const stakingStore = useStakingStore();
      return { amount: String(amt), denom: stakingStore.params.bond_denom };
    },
    currentAddress() {
      if (!this.connectedWallet?.cosmosAddress) return '';
      const { prefix, data } = fromBech32(this.connectedWallet.cosmosAddress);
      const chainStore = useBlockchain();
      return toBech32(chainStore.current?.bech32Prefix || prefix, data);
    },
    shortAddress() {
      const address: string = this.currentAddress;
      if (address.length > 4) {
        return `${address.substring(address.length - 4)}`;
      }
      return '';
    },
  },
  actions: {
    async loadMyAsset() {
      const address = this.currentAddress;
      this.balances = [];
      this.delegations = [];
      this.unbonding = [];
      this.rewards = { total: [], rewards: [] };
      if (!address) return;

      const [balances, delegations, unbonding, rewards] = await Promise.all([
        this.blockchain.rpc.getBankBalances(address),
        this.blockchain.rpc.getStakingDelegations(address),
        this.blockchain.rpc.getStakingDelegatorUnbonding(address),
        this.blockchain.rpc.getDistributionDelegatorRewards(address),
      ]);
      if (this.currentAddress !== address) return;
      this.balances = balances.balances;
      this.delegations = delegations.delegation_responses.filter(
        (delegation) => delegation.balance.amount !== '0'
      );
      this.unbonding = unbonding.unbonding_responses;
      this.rewards = rewards;
    },
    myBalance() {
      return this.blockchain.rpc.getBankBalances(this.currentAddress);
    },
    myDelegations() {
      return this.blockchain.rpc.getStakingDelegations(this.currentAddress);
    },
    myUnbonding() {
      return this.blockchain.rpc.getStakingDelegatorUnbonding(this.currentAddress);
    },
    disconnect() {
      const chainStore = useBlockchain();
      const key = chainStore.defaultHDPath;
      const connectionType = this.connectedWallet?.connectionType;
      useStorageStore().currentStorage.removeItem(key);
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
      if (connectionType === 'oauth') void disconnectAbstraxion();
      this.$reset();
    },
    setConnectedWallet(value: VeronaWalletConnected) {
      if (!value) return;
      const chainStore = useBlockchain();
      const key = chainStore.defaultHDPath;
      const storageStore = useStorageStore();
      const storage = storageStore.currentStorage;
      if (value.connectionType === 'oauth') {
        sessionStorage.setItem(key, JSON.stringify(value));
        localStorage.removeItem(key);
      } else {
        persistConnectedWallet(key, value, storage);
      }
      if (!storageStore.isSession) {
        sessionStorage.removeItem(key);
      }
      this.wallet = value;
      this.loadMyAsset();
    },
    suggestChain() {
      if (window.location.pathname === '/SIDE-Testnet') {
        router.push({ path: '/wallet/unisat' });
      } else {
        router.push({ path: '/wallet/keplr' });
      }
    },
  },
});
