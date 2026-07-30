<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useGovStore } from '@/stores';
import ProposalListItem from '@/components/ProposalListItem.vue';
import PaginationBar from '@/components/PaginationBar.vue';
import { PageRequest } from '@/types';

defineProps<{ chain: string }>();

const tab = ref('2');
const store = useGovStore();
const pageRequest = ref(new PageRequest());
const router = useRouter();
const currentPage = ref(1);

onMounted(() => {
  store.fetchProposals('2').then((response) => {
    if (response?.proposals?.length === 0) {
      tab.value = '3';
      store.fetchProposals('3');
    }
    store.fetchProposals('3');
    store.fetchProposals('4');
  });
});

function changeTab(value: '2' | '3' | '4') {
  tab.value = value;
  currentPage.value = 1;
  pageRequest.value.setPage(1);
}

function page(value: number) {
  currentPage.value = value;
  pageRequest.value.setPage(value);
  store.fetchProposals(tab.value, pageRequest.value);
}

function openProposalFromRow(event: MouseEvent) {
  const target = event.target as HTMLElement;
  if (target.closest('a, button, label, input, select, textarea')) return;

  let row: HTMLElement | null = target;
  while (row && !row.querySelector<HTMLAnchorElement>('a[href*="/gov/"]')) {
    if (row.classList.contains('proposal-list')) return;
    row = row.parentElement;
  }
  const link = row?.querySelector<HTMLAnchorElement>('a[href*="/gov/"]');
  if (link) router.push(link.getAttribute('href') || link.pathname);
}
</script>

<template>
  <div class="verona-governance">
    <div class="tabs tabs-boxed bg-transparent mb-4 text-center">
      <button class="tab text-base-content/60" :class="{ 'tab-active': tab === '2' }" @click="changeTab('2')">
        {{ $t('gov.voting') }}
      </button>
      <button class="tab text-base-content/60" :class="{ 'tab-active': tab === '3' }" @click="changeTab('3')">
        {{ $t('gov.passed') }}
      </button>
      <button class="tab text-base-content/60" :class="{ 'tab-active': tab === '4' }" @click="changeTab('4')">
        {{ $t('gov.rejected') }}
      </button>
    </div>

    <div class="overflow-hidden rounded-lg bg-base-100 shadow">
      <div class="governance-header hidden lg:!grid">
        <div>Proposal</div>
        <div>Title</div>
        <div>Voting</div>
        <div>Status</div>
        <div>Actions</div>
      </div>
      <div class="proposal-list cursor-pointer" @click="openProposalFromRow">
        <ProposalListItem :proposals="store.proposals[tab]" />
      </div>
    </div>

    <PaginationBar
      :page="currentPage"
      :total="store.proposals[tab]?.pagination?.total"
      :limit="pageRequest.limit"
      :callback="page"
    />
  </div>
</template>

<style scoped>
.governance-header {
  grid-template-columns: 5rem minmax(0, 1fr) 15rem 9rem 10rem;
  gap: 0;
  padding: 0.75rem;
  background: #f1ece3;
  color: hsl(var(--bc) / 0.65);
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
}

.governance-header > div {
  padding-inline: 0.25rem;
}

.verona-governance :deep(.bg-white) {
  border-radius: 0;
  background: hsl(var(--b1));
}

html[data-theme='dark'] .governance-header {
  background: #101a14;
}
</style>

<route>
{
  path: '/:chain/gov',
  meta: { i18n: 'governance', order: 2 }
}
</route>
