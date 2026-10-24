import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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

  assert.equal(deploymentConfigurationErrors(invalid).length, 10);
});
