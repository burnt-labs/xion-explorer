import { defineStore } from 'pinia';
import type { ChainConfig, Endpoint } from '@/types/chaindata';
import type { NavGroup, NavLink, VerticalNavItems } from '@/layouts/types';
import { useRouter } from 'vue-router';
import { CosmosRestClient } from '@/libs/client';
import {
  useBankStore,
  useBaseStore,
  useDashboard,
  useDistributionStore,
  useGovStore,
  useMintStore,
  useStakingStore,
  useWalletStore,
} from '@/stores';
import { useBlockModule } from '@/modules/[chain]/block/block';

type VeronaNavLink = NavLink & {
  action?: 'account';
  module?: string;
};
// Consecutive failed block polls before switching to the next configured REST endpoint.
const FAILOVER_AFTER_FAILURES = 3;

export const useBlockchain = defineStore('blockchain', {
  state: () => {
    return {
      status: {} as Record<string, string>,
      rest: '',
      chainName: '',
      endpoint: {} as Endpoint,
      connErr: '',
      pollFailures: 0,
    };
  },
  getters: {
    current(): ChainConfig | undefined {
      const chain = this.dashboard.chains[this.chainName];
      // update chain config with dynamic updated sdk version
      const sdkversion = localStorage.getItem(`sdk_version_${this.chainName}`);
      if (sdkversion && chain?.versions) {
        chain.versions.cosmosSdk = sdkversion;
      }
      return chain;
    },
    logo(): string {
      return this.current?.logo || '';
    },
    defaultHDPath(): string {
      const cointype = this.current?.coinType || '118';
      return `m/44'/${cointype}/0'/0/0`;
    },
    dashboard() {
      return useDashboard();
    },
    isConsumerChain() {
      // @ts-ignore
      return this.current && this.current.providerChain;
    },
    computedChainMenu() {
      let currNavItem: VerticalNavItems = [];
      const advancedModules = new Set(['staking', 'governance', 'blocks', 'tx', 'supply', 'ibc', 'cosmwasm', 'parameters']);
      const router = useRouter();
      const routes = router?.getRoutes() || [];
      if (this.current && routes) {
        // The theme primary stays readable on both backgrounds; use the Verona
        // network accent only in the network label.
        document.body.style.removeProperty('--p');
        document.body.style.removeProperty('--bc');
        const modules = routes
          .filter((x) => x.meta.i18n) // defined menu name
          .filter((x) => !this.current?.features || this.current.features.includes(String(x.meta.i18n))) // filter none-custom module
          .sort((a, b) => a.path.length - b.path.length)
          .map((x) => ({
            title: `module.${x.meta.i18n}`,
            to: { path: x.path.replace(':chain', this.chainName) },
            icon: { icon: 'mdi-chevron-right', size: '22' },
            i18n: true,
            order: Number(this.current?.features?.indexOf(String(x.meta.i18n)) ?? 100),
            module: String(x.meta.i18n),
          }))
          .filter((item, index, items) => items.findIndex((candidate) => candidate.module === item.module) === index)
          .sort((a, b) => a.order - b.order);
        const advanced = modules.filter((item) => advancedModules.has(item.module)) as VeronaNavLink[];
        // The account pages intentionally have no route i18n metadata: the
        // generic account index is an explorer listing, while the sidebar
        // entry is a wallet action. Add that action directly so it is present
        // whenever the active Verona config enables the account feature.
        const account = this.current.features?.includes('account')
          ? ({ title: 'Account', action: 'account', i18n: false } as VeronaNavLink)
          : undefined;
        const primary = modules.filter((item) => !advancedModules.has(item.module) && item.module !== 'account') as VeronaNavLink[];
        const primaryWithoutDashboard = primary.filter((item) => item.module !== 'dashboard');

        currNavItem = [
          {
            title: this.current?.prettyName || this.chainName || '',
            icon: { image: this.current.logo, size: '22' },
            i18n: false,
            badgeContent: this.isConsumerChain ? 'Consumer' : undefined,
            badgeClass: 'bg-error',
            children: [
              ...(account ? [account] : []),
              ...primaryWithoutDashboard,
              ...(advanced.length
                ? [{ title: 'module.advanced', icon: { icon: 'mdi-tune-variant', size: '22' }, children: advanced } as NavGroup]
                : []),
            ],
          },
        ];
      }
      return currNavItem;
    },
  },
  actions: {
    async initial() {
      // this.current?.themeColor {
      //     const { global } = useTheme();
      //     global.current
      // }
      useWalletStore().$reset();
      if (!this.isConsumerChain) {
        await useStakingStore().init();
      }
      useBankStore().initial();
      useBaseStore().initial();
      useGovStore().initial();
      useMintStore().initial();
      useBlockModule().initial();
      useDistributionStore().initial();
    },

    randomEndpoint(chainName: string): Endpoint | undefined {
      const all = this.current?.endpoints?.rest;
      const stored = localStorage.getItem(`endpoint-${chainName}`);
      if (stored) {
        const endpoint = JSON.parse(stored) as Endpoint;
        // Only reuse the stored endpoint while it is still listed in the chain config.
        // Endpoints get retired (the provider drops the chain, the host stops resolving),
        // and a stale pin here would keep polling a dead host forever.
        if (!all || all.some((x) => x.address === endpoint.address)) {
          return endpoint;
        }
        localStorage.removeItem(`endpoint-${chainName}`);
      }
      // Default to the primary (first) endpoint instead of a random one
      return all?.[0];
    },

    async randomSetupEndpoint() {
      const endpoint = this.randomEndpoint(this.chainName);
      if (endpoint) await this.setRestEndpoint(endpoint);
    },

    async setRestEndpoint(endpoint: Endpoint) {
      this.connErr = '';
      this.endpoint = endpoint;
      this.rpc = CosmosRestClient.newStrategy(endpoint.address, this.current);
      localStorage.setItem(`endpoint-${this.chainName}`, JSON.stringify(endpoint));
    },

    /**
     * Record the outcome of a block poll, failing over once the current endpoint
     * has missed FAILOVER_AFTER_FAILURES in a row.
     */
    async notePollResult(ok: boolean) {
      if (ok) {
        this.pollFailures = 0;
        return;
      }
      this.pollFailures += 1;
      if (this.pollFailures >= FAILOVER_AFTER_FAILURES) {
        this.pollFailures = 0;
        await this.failoverEndpoint();
      }
    },

    /**
     * Move to the next REST endpoint after the current one has failed repeatedly.
     * Without this a provider outage stalls the explorer indefinitely, since every
     * poll keeps retrying the same unreachable host. Wraps around so an all-down
     * situation keeps cycling rather than parking on one dead endpoint.
     * Returns false when there is nothing to fail over to.
     */
    async failoverEndpoint(): Promise<boolean> {
      const all = this.current?.endpoints?.rest;
      if (!all || all.length < 2) return false;
      const currentIndex = all.findIndex((x) => x.address === this.endpoint?.address);
      const next = all[(currentIndex + 1) % all.length];
      if (!next || next.address === this.endpoint?.address) return false;
      await this.setRestEndpoint(next);
      return true;
    },
    async setCurrent(name: string) {
      // Ensure chains are loaded due to asynchronous calls.
      if (this.dashboard.length === 0) {
        await this.dashboard.initial();
      }

      // Find the case-sensitive name for the chainName, else simply use the parameter-value.
      const caseSensitiveName =
        Object.keys(this.dashboard.chains).find((x) => x.toLowerCase() === name.toLowerCase()) || name;

      // Update chainName if needed
      if (caseSensitiveName !== this.chainName) {
        this.chainName = caseSensitiveName;
      }
    },
    supportModule(mod: string) {
      return !this.current?.features || this.current.features.includes(mod);
    },
  },
});
