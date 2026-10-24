export function parseJsonc(source) {
  return JSON.parse(
    source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
      .replace(/,\s*([}\]])/g, '$1')
  );
}

export function deploymentConfigurationErrors({
  deploymentPolicy,
  qualityPolicy,
  packageJson,
  wrangler,
  workflows,
}) {
  const errors = [];
  const requiredScripts = [
    'lint',
    'format:check',
    'type-check',
    'test',
    'test:coverage',
    'build:deploy',
  ];

  if (deploymentPolicy.topology !== 'chain')
    errors.push('deployment topology must be chain');
  if (deploymentPolicy.promotionMode !== 'automatic')
    errors.push('promotion mode must preserve merge-to-live behavior');
  if (deploymentPolicy.targets.candidate.wranglerEnv !== 'testnet')
    errors.push('candidate must target testnet');
  if (deploymentPolicy.targets.release.wranglerEnv !== 'mainnet')
    errors.push('release must target mainnet');
  if (qualityPolicy.coverageThresholds.lines !== 100)
    errors.push('line coverage threshold must be 100');
  if (requiredScripts.some((script) => !packageJson.scripts[script]))
    errors.push('all quality and deployment scripts are required');
  if (wrangler.env.mainnet.assets.directory !== './dist/mainnet')
    errors.push('mainnet must deploy the mainnet bundle');
  if (wrangler.env.testnet.assets.directory !== './dist/testnet')
    errors.push('testnet must deploy the testnet bundle');
  if (workflows.length !== 3)
    errors.push('exactly three deployment entry points are required');
  // buildVariables (GitHub Environment vars exported to the build) first
  // shipped in github-workflows v1.8.0.
  const pins = workflows.map(
    (workflow) =>
      workflow.match(
        /burnt-labs\/github-workflows\/\.github\/workflows\/[a-z-]+\.yml@([0-9a-f]{40}) # v(\d+)\.(\d+)\.\d+/
      ) ?? [null, null, '0', '0']
  );
  if (
    pins.some(
      ([, , major, minor]) => Number(major) * 1000 + Number(minor) < 1008
    )
  )
    errors.push('shared workflows must be SHA-pinned at v1.8.0 or later');
  if (new Set(pins.map(([, sha]) => sha)).size !== 1)
    errors.push('every entry point must pin the same shared-workflow revision');

  // Vite inlines VITE_* at build time; the values live on the mainnet and
  // testnet GitHub Environments and reach the build only through this list.
  const buildVariables = deploymentPolicy.buildVariables ?? [];
  if (
    [
      'VITE_FETCH_ALL_BLOCKS',
      'VITE_REFRESH_INTERVAL',
      'VITE_RECENT_BLOCK_LIMIT',
    ].some((name) => !buildVariables.includes(name))
  )
    errors.push('block polling settings must be declared as buildVariables');

  return errors;
}
