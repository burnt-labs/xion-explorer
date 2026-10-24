import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  deploymentConfigurationErrors,
  parseJsonc,
} from '../scripts/deployment-policy.mjs';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('deployment configuration follows the Burnt shared-workflow contract', async () => {
  const [
    deploymentSource,
    qualitySource,
    packageSource,
    wranglerSource,
    ...workflows
  ] = await Promise.all([
    read('.github/deployment-policy.jsonc'),
    read('.github/quality-policy.jsonc'),
    read('package.json'),
    read('wrangler.jsonc'),
    read('.github/workflows/pull-request.yml'),
    read('.github/workflows/push-main.yml'),
    read('.github/workflows/release.yml'),
  ]);

  assert.deepEqual(
    deploymentConfigurationErrors({
      deploymentPolicy: parseJsonc(deploymentSource),
      qualityPolicy: parseJsonc(qualitySource),
      packageJson: JSON.parse(packageSource),
      wrangler: parseJsonc(wranglerSource),
      workflows,
    }),
    []
  );
});

test('build settings have one source: the GitHub Environments', async () => {
  // A committed .env.<mode> file would sit under the Environment values
  // (Vite lets the process environment win) and silently take over whenever
  // a variable is missing, so the two would drift.
  for (const file of ['.env.mainnet', '.env.testnet'])
    await assert.rejects(access(new URL(file, root)), { code: 'ENOENT' });
});

test('deployment configuration reports every contract violation', () => {
  const invalid = {
    deploymentPolicy: {
      topology: 'standard',
      promotionMode: 'manual',
      targets: {
        candidate: { wranglerEnv: 'staging' },
        release: { wranglerEnv: 'production' },
      },
    },
    qualityPolicy: { coverageThresholds: { lines: 99 } },
    packageJson: { scripts: {} },
    wrangler: {
      env: {
        mainnet: { assets: { directory: './dist' } },
        testnet: { assets: { directory: './dist' } },
      },
    },
    workflows: ['unpinned'],
  };

  assert.equal(deploymentConfigurationErrors(invalid).length, 11);
});

test('deployment configuration rejects an old or mixed shared-workflow pin', () => {
  const uses = (sha, version) =>
    `uses: burnt-labs/github-workflows/.github/workflows/cloudflare-pr.yml@${sha} # ${version}`;
  const valid = {
    deploymentPolicy: {
      topology: 'chain',
      promotionMode: 'automatic',
      buildVariables: [
        'VITE_FETCH_ALL_BLOCKS',
        'VITE_REFRESH_INTERVAL',
        'VITE_RECENT_BLOCK_LIMIT',
      ],
      targets: {
        candidate: { wranglerEnv: 'testnet' },
        release: { wranglerEnv: 'mainnet' },
      },
    },
    qualityPolicy: { coverageThresholds: { lines: 100 } },
    packageJson: {
      scripts: Object.fromEntries(
        [
          'lint',
          'format:check',
          'type-check',
          'test',
          'test:coverage',
          'build:deploy',
        ].map((name) => [name, 'x'])
      ),
    },
    wrangler: {
      env: {
        mainnet: { assets: { directory: './dist/mainnet' } },
        testnet: { assets: { directory: './dist/testnet' } },
      },
    },
  };
  const a = 'a'.repeat(40);
  const b = 'b'.repeat(40);

  assert.deepEqual(
    deploymentConfigurationErrors({
      ...valid,
      workflows: [uses(a, 'v1.8.0'), uses(a, 'v1.8.0'), uses(a, 'v2.0.1')],
    }),
    []
  );
  assert.deepEqual(
    deploymentConfigurationErrors({
      ...valid,
      workflows: [uses(a, 'v1.7.1'), uses(a, 'v1.7.1'), uses(a, 'v1.7.1')],
    }),
    ['shared workflows must be SHA-pinned at v1.8.0 or later']
  );
  assert.deepEqual(
    deploymentConfigurationErrors({
      ...valid,
      workflows: [uses(a, 'v1.8.0'), uses(b, 'v1.8.0'), uses(a, 'v1.8.0')],
    }),
    ['every entry point must pin the same shared-workflow revision']
  );
});
