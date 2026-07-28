export interface TransactionConfig {
  tokenMetadataSource: 'local' | 'registry';
}

const CONFIG_URL = `/config/transactions.${__VERONA_ENVIRONMENT__.network}.jsonc`;

export async function loadTransactionConfig(): Promise<TransactionConfig> {
  const response = await fetch(CONFIG_URL, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Transaction configuration failed to load (${response.status})`);

  const config = (await response.json()) as TransactionConfig;
  if (config.tokenMetadataSource !== 'local' && config.tokenMetadataSource !== 'registry') {
    throw new Error(`Invalid transaction token metadata source: ${String(config.tokenMetadataSource)}`);
  }
  return config;
}
