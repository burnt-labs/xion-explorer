# GitHub Workflows Migration

1. Replace bespoke Cloudflare deployment workflows with thin, SHA-pinned callers of `burnt-labs/github-workflows`.
2. Add the required quality and chain deployment policies while preserving automatic testnet/mainnet promotion.
3. Build isolated mainnet and testnet asset directories and bind each Wrangler environment to the correct output.
4. Add focused deployment-configuration validation with 100% coverage.
5. Run every policy command and inspect the final diff without modifying unrelated working-tree changes.
