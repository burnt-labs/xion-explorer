<script lang="ts" setup>
import { Icon } from '@iconify/vue';
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';

// Components
import NavbarThemeSwitcher from '@/layouts/components/NavbarThemeSwitcher.vue';
import NavbarSearch from '@/layouts/components/NavbarSearch.vue';
import ChainProfile from './ChainProfile.vue';

import { useDashboard, useBaseStore, useBlockchain, useWalletStore } from '@/stores';
// Imported so Vite fingerprints it; a literal "/src/assets/..." src 404s in a build.
import veronaLogo from '@/assets/images/verona-logo-full.svg';

import NavBarI18n from '@/layouts/components/NavBarI18n.vue';
import NavBarWallet from './NavBarWallet.vue';
import type {
  NavGroup,
  NavLink,
  NavSectionTitle,
  VerticalNavItems,
} from '@/layouts/types';
import dayjs from 'dayjs';

type VeronaNavLink = NavLink & {
  action?: 'account';
};

const dashboard = useDashboard();
dashboard.initial();
const blockchain = useBlockchain();
const walletStore = useWalletStore();
const router = useRouter();
blockchain.randomSetupEndpoint();
const baseStore = useBaseStore();

const current = ref(''); // the current chain
const temp = ref('');
blockchain.$subscribe((m, s) => {
  if (current.value === s.chainName && temp.value != s.endpoint.address) {
    temp.value = s.endpoint.address;
    blockchain.initial();
  }
  if (current.value != s.chainName) {
    current.value = s.chainName;
    blockchain.randomSetupEndpoint();
  }
});

// The chain accent (Sky/Gold) is too light for text on Linen, so the network
// reads as a tinted chip: accent-tinted background, ink text on light, accent
// text on dark - mirroring app.burnt.com's ACTIVE badge.
function accentTint(hex?: string, alpha = 0.16) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex?.trim() || '');
  if (!m) return 'hsl(var(--b2))';
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

const sidebarShow = ref(false);
const sidebarOpen = ref(true);
const otherNetwork = __VERONA_ENVIRONMENT__;
const showAdvancedStats = computed(() => {
  const route = router.currentRoute.value;
  return route.matched.some((record) =>
    String(record.meta.i18n || '') === 'parameters'
  );
});

const changeOpen = (index: Number) => {
  if (index === 0) {
    sidebarOpen.value = !sidebarOpen.value;
  }
};
const showDiscord = true; //window.location.host.search('ping.pub') > -1;

function isNavGroup(nav: VerticalNavItems | any): nav is NavGroup {
  return (<NavGroup>nav).children !== undefined;
}
function isNavLink(nav: VerticalNavItems | any): nav is VeronaNavLink {
  return (<VeronaNavLink>nav).to !== undefined || (<VeronaNavLink>nav).href !== undefined || (<VeronaNavLink>nav).action !== undefined;
}
function isNavTitle(nav: VerticalNavItems | any): nav is NavSectionTitle {
  return (<NavSectionTitle>nav).heading !== undefined;
}
function selected(route: any, nav: VeronaNavLink) {
  const b =
    route.path === nav.to?.path ||
    (nav.to?.path && route.path.startsWith(nav.to.path) &&
      nav.title.indexOf('dashboard') === -1);
  return b;
}
function groupSelected(route: any, nav: NavGroup) {
  return nav.children.some((child) => isNavLink(child) && selected(route, child));
}
const blocktime = computed(() => {
  return dayjs(baseStore.latest?.block?.header?.time);
});

const behind = computed(() => {
  const current = dayjs().subtract(10, 'minute');
  return blocktime.value.isBefore(current);
});

function openAccount() {
  if (walletStore.currentAddress) {
    router.push({ path: `/${blockchain.chainName}/account/${walletStore.currentAddress}` });
  }
}

const transactionDialogIds = new Set([
  'delegate',
  'deposit',
  'redelegate',
  'send',
  'transfer',
  'unbond',
  'vote',
  'withdraw',
  'withdraw_commission',
  'wasm_clear_admin',
  'wasm_execute_contract',
  'wasm_instantiate_contract',
  'wasm_migrate_contract',
  'wasm_store_code',
  'wasm_update_admin',
]);

function redirectDisconnectedTransaction(event: MouseEvent) {
  if (walletStore.currentAddress) return;
  const trigger = (event.target as HTMLElement | null)?.closest<HTMLLabelElement>('label[for]');
  if (!trigger || !transactionDialogIds.has(trigger.htmlFor)) return;
  event.preventDefault();
  event.stopPropagation();
  document.querySelector<HTMLLabelElement>('label[for="VeronaConnectWallet"]')?.click();
}

dayjs();
</script>

<template>
  <div class="bg-base-200 dark:bg-base-300">
    <!-- sidebar -->
    <div
      class="verona-sidebar w-64 fixed z-50 left-0 top-0 bottom-0 flex flex-col bg-base-100 border-r border-gray-100 dark:border-gray-700"
      :class="{ flex: sidebarShow, 'hidden xl:!flex': !sidebarShow }"
    >
      <div class="flex justify-between mt-1 pl-4 py-4 mb-1">
        <RouterLink to="/" class="flex flex-col items-start gap-[3px]">
          <img class="h-6 w-auto max-w-[150px] object-contain invert dark:invert-0" :src="veronaLogo" alt="Verona" />
          <!-- network reads as an eyebrow under the wordmark rather than crowding it -->
          <span
            class="font-hedvig-sans text-[10px] uppercase tracking-[0.18em] leading-none rounded px-[6px] py-[3px] text-base-content dark:text-[color:var(--net-accent)]"
            :style="`--net-accent: ${blockchain.current?.themeColor}; background-color: ${accentTint(blockchain.current?.themeColor)}`"
          >
            {{ blockchain.current?.networkType || 'mainnet' }}
          </span>
        </RouterLink>
        <div
          class="pr-4 cursor-pointer xl:!hidden"
          @click="sidebarShow = false"
        >
          <Icon icon="mdi-close" class="text-2xl" />
        </div>
      </div>
      <div class="flex-1 overflow-auto">
        <div
          v-for="(item, index) of blockchain.computedChainMenu"
          :key="index"
          class="px-2"
        >
        <div
          v-if="isNavGroup(item)"
          :tabindex="index"
          class="collapse"
          :class="{
            'collapse-arrow': index > 0 && item?.children?.length > 0,
            'collapse-open': index === 0 && sidebarOpen,
            'collapse-close': index === 0 && !sidebarOpen,
          }"
        >
          <div class="collapse-content">
            <div
              v-for="(el, key) of item?.children"
              class="menu bg-base-100 w-full !p-0"
            >
              <component
                v-if="isNavLink(el)"
                :is="el.action ? 'label' : 'RouterLink'"
                :for="el.action === 'account' && !walletStore.currentAddress ? 'VeronaConnectWallet' : undefined"
                :to="el.action ? undefined : el.to"
                @click="
                  sidebarShow = false;
                  if (el.action === 'account') openAccount();
                "
                class="hover:bg-active rounded cursor-pointer px-3 py-2 flex items-center"
                :class="{
                  '!bg-primary': selected($route, el),
                }"
              >
                <img
                  v-if="el?.icon?.image"
                  :src="el?.icon?.image"
                  class="w-6 h-6 rounded-full mr-3 ml-4"
                  :class="{
                    'border border-gray-300 bg-white': selected($route, el),
                  }"
                />
                <div
                  class="text-base capitalize text-base-content"
                  :class="{
                    '!text-primary-content': selected($route, el),
                  }"
                >
                  {{ el.i18n === false || item?.title === 'Favorite' ? el?.title : $t(el?.title) }}
                </div>
              </component>
              <details v-else-if="isNavGroup(el)" class="group" :open="groupSelected($route, el)">
                <summary class="flex list-none cursor-pointer items-center justify-between px-3 py-2 text-base capitalize text-base-content">
                  {{ $t(el.title) }}
                  <Icon icon="mdi-chevron-down" class="transition-transform group-open:rotate-180" />
                </summary>
                <div>
                  <RouterLink
                    v-for="advancedItem in el.children"
                    :key="advancedItem.title"
                    @click="sidebarShow = false"
                    class="hover:bg-active rounded cursor-pointer px-3 py-2 flex items-center"
                    :class="{ '!bg-primary': isNavLink(advancedItem) && selected($route, advancedItem) }"
                    :to="isNavLink(advancedItem) ? advancedItem.to : undefined"
                  >
                    <div class="ml-3 text-base capitalize text-base-content" :class="{ '!text-white': isNavLink(advancedItem) && selected($route, advancedItem) }">
                      {{ $t(advancedItem.title) }}
                    </div>
                  </RouterLink>
                </div>
              </details>
            </div>
          </div>
        </div>

        <component
          :is="item?.href ? 'a' : 'RouterLink'"
          v-if="isNavLink(item)"
          :to="item?.to"
          :href="item?.href"
          @click="sidebarShow = false"
          class="cursor-pointer rounded-lg px-4 flex items-center py-2 hover:bg-active"
        >
          <Icon
            v-if="item?.icon?.icon"
            :icon="item?.icon?.icon"
            class="text-xl mr-2"
            :class="{
              'text-warning': item?.title === 'Favorite',
              'text-blue-500': item?.title !== 'Favorite',
            }"
          />
          <img
            v-if="item?.icon?.image"
            :src="item?.icon?.image"
            class="w-6 h-6 rounded-full mr-3 border border-blue-100"
          />
          <div
            class="text-base capitalize flex-1 text-base-content whitespace-nowrap"
          >
            {{ item?.title }}
          </div>
          <div
            v-if="item?.badgeContent"
            class="badge badge-sm text-white border-none"
            :class="item?.badgeClass"
          >
            {{ item?.badgeContent }}
          </div>
        </component>
        <div
          v-if="isNavTitle(item)"
          class="px-4 text-sm text-base-content opacity-60 pb-2 uppercase"
        >
          {{ item?.heading }}
        </div>
        </div>
      </div>
      <div class="mt-auto shrink-0 border-t border-gray-100 p-2 dark:border-gray-700">
        <a
          :href="otherNetwork.otherNetworkUrl"
          class="cursor-pointer rounded-lg px-4 flex items-center py-2 hover:bg-active"
          @click="sidebarShow = false"
        >
          <Icon icon="mdi-swap-horizontal" class="text-xl mr-2 text-blue-500" />
          <div class="text-base capitalize flex-1 text-base-content whitespace-nowrap">
            {{ otherNetwork.otherNetworkLabel }}
          </div>
        </a>
      </div>
    </div>
    <div class="xl:!ml-64 px-3 pt-4">
      <!-- header -->
      <div
        class="flex items-center py-3 bg-base-100 mb-4 rounded px-4 sticky top-0 z-10"
      >
        <div
          class="text-2xl pr-3 cursor-pointer xl:!hidden"
          @click="sidebarShow = true"
        >
          <Icon icon="mdi-menu" />
        </div>

        <ChainProfile />

        <div class="flex-1 w-0"></div>

        <!-- <NavSearchBar />-->
        <NavBarI18n class="hidden md:!inline-block" />
        <NavbarThemeSwitcher class="!inline-block" />
        <NavbarSearch class="!inline-block" />
        <NavBarWallet />
      </div>

      <!-- 👉 Pages -->
      <div style="min-height: calc(100vh - 180px)" @click.capture="redirectDisconnectedTransaction">
        <div v-if="behind" class="alert alert-error mb-4">
          <div class="flex gap-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              class="stroke-current flex-shrink-0 w-6 h-6"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              ></path>
            </svg>
            <span
              >{{ $t('pages.out_of_sync') }} {{ blocktime.format() }} ({{
                blocktime.fromNow()
              }})</span
            >
          </div>
        </div>
        <RouterView v-slot="{ Component }">
          <Transition mode="out-in">
            <div class="verona-page" :class="{ 'verona-advanced-page': showAdvancedStats }">
              <Component :is="Component" />
            </div>
          </Transition>
        </RouterView>
      </div>
    </div>
  </div>
</template>

<style scoped>
.verona-advanced-page :deep(.tabs) {
  margin-bottom: 1rem;
  background: transparent;
}

.verona-advanced-page :deep(.tabs .tab) {
  min-height: 2.5rem;
  height: 2.5rem;
  padding-inline: 1rem;
  text-transform: capitalize !important;
}

.verona-advanced-page :deep(.tabs .tab-active) {
  border-radius: 0.75rem;
}

.verona-advanced-page :deep(.input),
.verona-advanced-page :deep(.select) {
  min-height: 2.5rem;
  height: 2.5rem;
}

.verona-page :deep(table) {
  width: 100%;
  border-radius: 0.5rem;
  overflow: hidden;
  background: hsl(var(--b1));
}

.verona-page :deep(table thead th),
.verona-page :deep(table thead td) {
  background-color: #f1ece3;
}

html.dark .verona-page :deep(table thead th),
html.dark .verona-page :deep(table thead td),
html[data-theme='dark'] .verona-page :deep(table thead th),
html[data-theme='dark'] .verona-page :deep(table thead td) {
  background-color: #101a14;
}

.verona-page :deep(table th),
.verona-page :deep(table thead td) {
  color: hsl(var(--bc) / 0.65);
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
}

.verona-page :deep(table :where(th, td)) {
  padding: 0.75rem;
}

.verona-page :deep(table tbody td) {
  background-color: hsl(var(--b1));
}

.verona-page :deep(table tbody tr:hover td) {
  background-color: var(--bg-active);
}

.verona-page :deep(.overflow-x-auto:has(> table)),
.verona-page :deep(.overflow-auto:has(> table)),
.verona-page :deep(.overflow-hidden:has(> table)) {
  border-radius: 0.5rem;
  background: hsl(var(--b1));
  overflow: hidden;
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.1);
}
</style>
