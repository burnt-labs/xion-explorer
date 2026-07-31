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
  if (
    workflows.some(
      (workflow) =>
        !workflow.includes('@511b72fad7c0bd937e2820b8e4165b075a875cf9 # v1.2.8')
    )
  ) {
    errors.push('shared workflows must be pinned to v1.2.8');
  }

  return errors;
}
