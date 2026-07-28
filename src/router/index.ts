import { useBlockchain } from '@/stores';
import { createRouter, createWebHistory } from 'vue-router';
// @ts-ignore
import { setupLayouts } from 'virtual:generated-layouts';
// @ts-ignore
import routes from '~pages';

const filteredRoutes = routes.filter((route: any) => {
  // Verona replaces these upstream pages while retaining their public URLs.
  return (
    route.name !== 'chain' &&
    route.name !== 'chain-account' &&
    route.name !== 'chain-account-address' &&
    route.name !== 'chain-verona' &&
    route.name !== 'chain-gov' &&
    route.name !== 'chain-block' &&
    route.name !== 'chain-block-height' &&
    route.name !== 'chain-supply' &&
    route.name !== 'chain-tx' &&
    route.name !== 'chain-cosmwasm' &&
    route.name !== 'chain-staking' &&
    route.name !== 'chain-staking-validator' &&
    route.name !== 'wallet-suggest'
  );
});

const modRoutes = filteredRoutes.map((route: any) => {
  if (route.name === 'chain-verona-account-address') {
    route.path = '/:chain/account/:address';
  }
  if (route.name === 'chain-verona-account') {
    route.path = '/:chain';
  }
  // if (route.name === 'chain-xion-supply') {
  //   route.path = '/:chain/supply'
  // }
  return route;
});

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    // The Verona account surface owns the former dashboard route. It remains
    // empty until a wallet connects.
    { path: '/', redirect: { path: '/verona', query: { connect: 'true' } } },
    ...setupLayouts(modRoutes),
  ],
});

//update current blockchain
router.beforeEach((to) => {
  const { chain } = to.params;
  if (chain) {
    const blockchain = useBlockchain();
    if (chain !== blockchain.chainName) {
      blockchain.setCurrent(chain.toString());
    }
  }
});

// Docs: https://router.vuejs.org/guide/advanced/navigation-guards.html#global-before-guards

export default router;
