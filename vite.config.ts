import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import vueJsx from '@vitejs/plugin-vue-jsx';
import Layouts from 'vite-plugin-vue-layouts';
import DefineOptions from 'unplugin-vue-define-options/vite';
import AutoImport from 'unplugin-auto-import/vite';
import Pages from 'vite-plugin-pages';

import VueI18nPlugin from '@intlify/unplugin-vue-i18n/vite';

const environments = {
  mainnet: {
    network: 'mainnet',
    canonicalUrl: 'https://explorer.burnt.com',
    otherNetworkLabel: 'Verona Testnet',
    otherNetworkUrl: 'https://explorer.testnet.burnt.com',
  },
  testnet: {
    network: 'testnet',
    canonicalUrl: 'https://explorer.testnet.burnt.com',
    otherNetworkLabel: 'Verona Mainnet',
    otherNetworkUrl: 'https://explorer.burnt.com',
  },
} as const;

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  // Local `vite` development defaults to testnet. An explicit mode always wins,
  // while production builds remain mainnet unless built with `--mode testnet`.
  const isTestnet = mode === 'testnet' || (command === 'serve' && mode === 'development');
  const environment = isTestnet ? environments.testnet : environments.mainnet;
  const chainConfig = isTestnet ? './chains/testnet/verona.json' : './chains/mainnet/verona.json';

  return {
    define: {
      'process.env': {},
      __VERONA_ENVIRONMENT__: JSON.stringify(environment),
      // The production proxy intentionally permits production origins only.
      // Local Vite must call CoinGecko directly so the dashboard market panel
      // remains usable during development.
      ...(command === 'serve'
        ? { 'import.meta.env.VITE_COINGECKO_URL': JSON.stringify('https://api.coingecko.com') }
        : {}),
    },
  plugins: [
    vue({
      template: {
        compilerOptions: {
          isCustomElement: (tag) => ['ping-connect-wallet', 'ping-token-convert'].includes(tag),
        },
      },
    }),
    vueJsx(),
    Pages({
      // ./src/pages/verona must come LAST: vite-plugin-pages lets later dirs win a
      // route collision, and both it and ./src/pages define an index.vue for "/".
      dirs: ['./src/modules', './src/pages', './src/pages/verona'],
      exclude: ['**/*.ts'], // only load .vue as modules
    }),
    Layouts({
      layoutsDirs: ['/src/layouts/verona/', './src/layouts/'],
    }),
    AutoImport({
      imports: ['vue', 'vue-router', '@vueuse/core', '@vueuse/math', 'vue-i18n', 'pinia'],
      vueTemplate: true,
    }),
    VueI18nPlugin({
      runtimeOnly: true,
      compositionOnly: true,
      include: [fileURLToPath(new URL('./src/plugins/i18n/locales', import.meta.url)) + '/**'],
    }),
    DefineOptions(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@verona-chain-config': fileURLToPath(new URL(chainConfig, import.meta.url)),
    },
  },
    optimizeDeps: {
      entries: ['./src/**/*.vue'],
    },
  };
});
