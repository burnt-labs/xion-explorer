<script lang="ts" setup>
import { useDashboard, LoadingStatus } from '@/stores';
import type { ChainConfig } from '@/types/chaindata';
import ChainSummary from '@/components/xion/ChainSummary.vue';

import { computed } from 'vue';

const dashboard = useDashboard();

// Mainnet first, then testnets - the order people actually want them in.
const chains = computed(() =>
  (Object.values(dashboard.chains) as ChainConfig[])
    .slice()
    .sort((a, b) => (a.networkType === b.networkType ? 0 : a.networkType === 'mainnet' ? -1 : 1))
);
</script>
<template>
  <div class="mx-auto w-full max-w-5xl">
    <!-- Sea band with the site's texture, mirroring how verona.dev
         uses /assets/investors/bg.png: cover, centred, fixed, over bg-sea. -->
    <section class="verona-hero relative mb-10 overflow-hidden rounded-[18px] px-6 py-16">
      <div
        class="flex md:!flex-row flex-col items-center justify-center gap-2"
      >
        <div class="w-16 h-16 rounded-full overflow-hidden shrink-0">
          <img class="w-full h-full object-contain" src="/verona.png" alt="Verona" />
        </div>
        <h1 class="text-3xl md:!text-6xl font-bold" style="color: var(--hero-ink, hsl(var(--nc)))">
          {{ $t('pages.title') }}
        </h1>
      </div>
      <div class="text-center text-base mt-3" style="color: var(--hero-ink, hsl(var(--nc))); opacity: 0.82">
        <p class="mb-1">
          {{ $t('pages.slogan') }}
        </p>
      </div>
    </section>
    <div v-if="dashboard.status !== LoadingStatus.Loaded" class="flex justify-center">
      <progress class="progress progress-info w-80 h-1"></progress>
    </div>

    <!-- The page has exactly one job, so the rule says so plainly. -->
    <div class="section-label">
      <span>Choose a network</span>
      <span class="rule" aria-hidden="true"></span>
    </div>

    <div class="network-stack">
      <ChainSummary v-for="chain in chains" :key="chain.chainName" :name="chain.chainName" />
    </div>
  </div>
</template>

<style scoped>
.section-label {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-block-end: 1rem;
}

.section-label > span:first-child {
  font-family: theme('fontFamily.hedvig-sans');
  font-size: 10px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: hsl(var(--bc) / 0.55);
  white-space: nowrap;
}

.section-label .rule {
  flex: 1;
  block-size: 1px;
  background: hsl(var(--b3));
}

.network-stack {
  display: grid;
  gap: 0.75rem;
  margin-block-end: 3rem;
}

.verona-hero {
  /* Brand imagery is a themeable slot: --hero-bg / --hero-image / --hero-scrim are
     set once in style.css. With none set this is a plain neutral band, so the
     component carries no brand of its own. */
  background-color: var(--hero-bg, hsl(var(--n)));
  background-image: linear-gradient(var(--hero-scrim, transparent), var(--hero-scrim, transparent)),
    var(--hero-image, none);
  background-size: cover, cover;
  background-position: center, center;
  background-repeat: no-repeat, no-repeat;
}

@media (min-width: 1024px) {
  /* the site pins this band; only do it where there's room for the parallax */
  .verona-hero {
    background-attachment: fixed;
  }
}
</style>
