<script lang="ts" setup>
import { useDashboard } from '@/stores/useDashboard';
import { computed } from 'vue';
import { Icon } from '@iconify/vue';

const props = defineProps({
  name: {
    type: String,
    required: true,
  },
});

const dashboardStore = useDashboard();
const conf = computed(() => dashboardStore.chains[props.name] || {});

const addFavor = (e: Event) => {
  e.stopPropagation();
  e.preventDefault();
  dashboardStore.favoriteMap[props.name] =
    !dashboardStore?.favoriteMap?.[props.name];
  window.localStorage.setItem(
    'favoriteMap',
    JSON.stringify(dashboardStore.favoriteMap)
  );
};
</script>
<template>
  <RouterLink :to="`/${name}`"
    class="bg-base-100 hover:bg-gray-100 dark:hover:bg-[#373f59] rounded shadow flex items-center px-3 py-3 cursor-pointer">
    <div>
      <img class="w-12 h-7" src="/src/assets/images/xion-logo.svg" />
    </div>
    <div class="font-semibold ml-4 text-base flex-1 truncate capitalize">
      <span :style="`color: ${conf?.themeColor}`">
        <span class="ml-[8px] translate-y-[4px] rounded-[4px] p-[4px] text-[10px] uppercase bg-base-200">
          {{
            name.match("mainnet") ? "mainnet" :
              name.match("testnet") ? "testnet" :
                name.match("devnet") ? "devnet" :
                  name }}
        </span>
      </span>
    </div>
    <div @click="addFavor" class="pl-4 text-xl" :class="{
      'text-warning': dashboardStore?.favoriteMap?.[props.name],
      'text-gray-300 dark:text-gray-500':
        !dashboardStore?.favoriteMap?.[props.name],
    }">
      <Icon icon="mdi-star" />
    </div>
  </RouterLink>
</template>
