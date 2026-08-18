<script setup lang="ts">
import { computed } from 'vue';
import { useBlockchain, useBaseStore } from '@/stores';
import type { Endpoint } from '@/types/chaindata';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
const chainStore = useBlockchain();
const baseStore = useBaseStore();
chainStore.initial();
const router = useRouter();
const route = useRoute();
const { t } = useI18n();

const pageTitle = computed(() => {
  const matched = [...route.matched].reverse();
  const titleKey = matched.find((record) => record.meta.titleKey)?.meta.titleKey;
  if (titleKey) return t(String(titleKey));

  const section = matched.find((record) => record.meta.i18n)?.meta.i18n;
  if (!section) return t('pages.title');
  return t(`module.${String(section)}`);
});

function changeEndpoint(item: Endpoint) {
  chainStore.setRestEndpoint(item);
  if (chainStore.current) router.push(`/${chainStore.current.chainName}`);
}
</script>

<template>
  <div class="dropdown">
    <label tabindex="0" class="flex items-center">
      <div class="p-1 relative mr-3 cursor-pointer">
        <img v-lazy="chainStore.logo" class="w-9 h-9 rounded-full dark:hidden" />
        <img src="/verona-gold.png" class="hidden w-9 h-9 rounded-full dark:block" alt="" />
        <div
          class="w-2 h-2 rounded-full absolute right-0 bottom-0 shadow"
          :class="{
            'bg-success': baseStore.connected,
            'bg-error': !baseStore.connected,
          }"
        ></div>
      </div>
      <div class="flex-1 w-0">
        <div
          :key="pageTitle"
          class="whitespace-nowrap text-base font-semibold text-base-content/70 hidden md:!block"
        >
          {{ pageTitle }}
          <span class="text-error">{{ baseStore.connected ? '' : 'disconnected' }}</span>
        </div>
        <div class="text-xs text-base-content/70 whitespace-nowrap hidden md:!block">
          {{ chainStore.connErr || chainStore.endpoint.address }}
        </div>
      </div>
    </label>
    <div tabindex="0" class="dropdown-content -left-6 w-80 menu shadow bg-base-200 rounded-box overflow-auto">
      <!-- rest -->
      <div class="px-4 py-2 text-sm text-base-content/60" v-if="chainStore.current?.endpoints?.rest">Rest Endpoint</div>
      <div
        v-for="(item, index) in chainStore.current?.endpoints?.rest"
        class="px-4 py-2 w-full hover:bg-active cursor-pointer"
        :key="index"
        @click="changeEndpoint(item)"
      >
        <div class="flex flex-col">
          <div class="flex items-center justify-between w-full">
            <div class="text-base-content/70 capitalize">
              {{ item.provider }}
            </div>
            <span
              v-if="item.address === chainStore.endpoint?.address"
              class="bg-yes inline-block h-2 w-2 rounded-full"
            />
          </div>
          <div class="text-base-content/60 text-xs whitespace-nowrap">
            {{ item.address }}
          </div>
        </div>
      </div>

      <!-- rest -->
      <div class="px-4 py-2 text-sm text-base-content/60">Information</div>
      <div class="w-full">
        <div class="py-2 px-4">
          Chain Id:
          {{
            baseStore.latest.block?.header.chain_id && baseStore.connected
              ? baseStore.latest.block.header.chain_id
              : 'N/A'
          }}
        </div>
        <div class="py-2 px-4">
          Height:
          {{
            baseStore.latest.block?.header.height && baseStore.connected ? baseStore.latest.block.header.height : '0'
          }}
        </div>
      </div>
      <!-- bottom-->
      <div class="px-4 py-2">&nbsp;</div>
    </div>
  </div>
</template>
