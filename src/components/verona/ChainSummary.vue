<script lang="ts" setup>
import { useDashboard } from '@/stores';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { Icon } from '@iconify/vue';
import { get } from '@/libs/http';

const props = defineProps({
  name: {
    type: String,
    required: true,
  },
});

const dashboardStore = useDashboard();
const conf = computed(() => dashboardStore.chains[props.name] || {});
const endpoint = computed(() => conf.value?.endpoints?.rest?.[0]?.address);

// The network label is a tinted chip rather than coloured text: a chain's accent
// is chosen for contrast against its own brand, not against the app surface, so
// as text it can land well under 4.5:1. Tinting the background keeps the accent
// legible whatever the chain config sets. Falls back to a theme surface.
function accentTint(hex?: string, alpha = 0.16) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex?.trim() || '');
  if (!m) return 'hsl(var(--b2))';
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// Each network reports its own head. This is the page's whole point: you can see a
// network is alive before you enter it, straight from that chain's endpoint.
type Status = 'loading' | 'live' | 'unreachable';
const status = ref<Status>('loading');
const height = ref<number | null>(null);
const chainId = ref('');
const ticked = ref(false);
let timer: ReturnType<typeof setInterval> | null = null;

const POLL_MS = Math.max(5000, Number(import.meta.env.VITE_REFRESH_INTERVAL) || 6000);

async function readHead() {
  if (!endpoint.value) return;
  try {
    const res: any = await get(`${endpoint.value}/cosmos/base/tendermint/v1beta1/blocks/latest`);
    const header = res?.block?.header;
    if (!header?.height) throw new Error('malformed payload');
    const next = Number(header.height);
    if (height.value !== null && next !== height.value) {
      ticked.value = true;
      setTimeout(() => (ticked.value = false), 600);
    }
    height.value = next;
    chainId.value = header.chain_id || '';
    status.value = 'live';
  } catch {
    status.value = 'unreachable';
  }
}

onMounted(() => {
  readHead();
  timer = setInterval(readHead, POLL_MS);
});
onUnmounted(() => {
  if (timer) clearInterval(timer);
});
watch(endpoint, readHead);

// Thin spaces group the digits without the ledger feel of commas.
const grouped = computed(() =>
  height.value === null ? '' : height.value.toLocaleString('en-US').replace(/,/g, ' ')
);

const addFavor = (e: Event) => {
  e.stopPropagation();
  e.preventDefault();
  dashboardStore.favoriteMap[props.name] = !dashboardStore?.favoriteMap?.[props.name];
  window.localStorage.setItem('favoriteMap', JSON.stringify(dashboardStore.favoriteMap));
};
</script>

<template>
  <RouterLink :to="`/${name}`" class="network-row group" :style="`--net-accent: ${conf?.themeColor}`">
    <div class="min-w-0">
      <div class="flex items-center gap-2">
        <span class="dot" :class="status" aria-hidden="true"></span>
        <span class="eyebrow" :style="`background-color: ${accentTint(conf?.themeColor)}`">
          {{ conf.networkType || 'mainnet' }}
        </span>
      </div>
      <div class="chain-id">{{ chainId || conf.prettyName || name }}</div>
    </div>

    <div class="head">
      <div class="height" :class="{ tick: ticked }">
        <template v-if="status === 'live'">{{ grouped }}</template>
        <template v-else-if="status === 'loading'">&mdash;</template>
        <template v-else>&mdash;</template>
      </div>
      <div class="height-label">
        {{ status === 'unreachable' ? 'unreachable' : 'latest block' }}
      </div>
    </div>

    <button
      type="button"
      class="fav"
      :class="{ on: dashboardStore?.favoriteMap?.[props.name] }"
      :aria-label="`Open ${name} by default`"
      :aria-pressed="!!dashboardStore?.favoriteMap?.[props.name]"
      @click="addFavor"
    >
      <Icon icon="mdi-star" />
    </button>
  </RouterLink>
</template>

<style scoped>
.network-row {
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: center;
  gap: 1.5rem;
  padding: 1.5rem 1.5rem 1.5rem 1.75rem;
  background: hsl(var(--b1));
  border: 1px solid hsl(var(--b3));
  border-radius: 18px;
  transition: border-color 0.2s ease, transform 0.2s ease;
}

.network-row:hover {
  border-color: var(--net-accent, hsl(var(--p)));
}

.network-row:focus-visible {
  outline: 2px solid var(--net-accent, hsl(var(--p)));
  outline-offset: 3px;
}

.dot {
  inline-size: 7px;
  block-size: 7px;
  border-radius: 50%;
  background: var(--net-accent, hsl(var(--p)));
  flex: none;
}

.dot.loading {
  background: hsl(var(--bc) / 0.35);
}

.dot.unreachable {
  background: hsl(var(--er));
}

.eyebrow {
  font-family: theme('fontFamily.hedvig-sans');
  font-size: 10px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  padding: 4px 8px;
  border-radius: 6px;
  color: hsl(var(--bc));
}

.chain-id {
  margin-block-start: 0.6rem;
  font-family: theme('fontFamily.hedvig-sans');
  font-size: 13px;
  color: hsl(var(--bc) / 0.65);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.head {
  text-align: end;
}

/* The chain's output set as editorial figures, not telemetry. */
.height {
  font-family: theme('fontFamily.garamond');
  font-size: clamp(28px, 1rem + 2vw, 44px);
  line-height: 1;
  color: hsl(var(--bc));
  font-variant-numeric: tabular-nums;
}

.height.tick {
  animation: tick 0.6s ease-out;
}

@keyframes tick {
  0% {
    opacity: 0.45;
  }
  100% {
    opacity: 1;
  }
}

.height-label {
  margin-block-start: 0.45rem;
  font-family: theme('fontFamily.hedvig-sans');
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: hsl(var(--bc) / 0.55);
}

.fav {
  font-size: 1.15rem;
  line-height: 0;
  color: hsl(var(--bc) / 0.25);
  transition: color 0.15s ease;
}

.fav:hover,
.fav.on {
  color: hsl(var(--wa));
}

.fav:focus-visible {
  outline: 2px solid var(--net-accent, hsl(var(--p)));
  outline-offset: 3px;
  border-radius: 4px;
}

@media (prefers-reduced-motion: reduce) {
  .network-row,
  .height.tick {
    transition: none;
    animation: none;
  }
}

@media (max-width: 640px) {
  .network-row {
    gap: 1rem;
    padding: 1.25rem;
  }
}
</style>
