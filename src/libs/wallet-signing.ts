import { SigningCosmWasmClient } from '@cosmjs/cosmwasm';
import type { OfflineSigner } from '@cosmjs/proto-signing';
import { GasPrice, SigningStargateClient } from '@cosmjs/stargate';

// Signing clients for browser wallets (Keplr and compatible extensions).
//
// Keep these on CosmJS >= 0.39:
// - `connectWithSigner` picks the Comet adaptor from the node's reported
//   version. CometBFT 0.40 (xion v32) reports "0.39.0", which CosmJS <= 0.37
//   maps to the Tendermint 0.34 adaptor; transactions then commit but the
//   client throws "Invalid string. Length must be a multiple of 4" when it
//   reads the result.
// - Cosmos SDK 0.55 gives new accounts numbers >= 2^63. CosmJS 0.39 returns
//   `accountNumber` as a bigint and signs it as such; older releases throw in
//   getAccount/sign.

export interface WalletProvider {
  enable(chainId: string): Promise<void>;
  getOfflineSignerAuto(chainId: string): Promise<OfflineSigner>;
}

export async function walletSigner(
  provider: WalletProvider | undefined,
  chainId: string | undefined
): Promise<OfflineSigner> {
  if (!provider) throw new Error('A Keplr-compatible wallet is required');
  if (!chainId) throw new Error('Chain ID is unavailable');
  await provider.enable(chainId);
  return provider.getOfflineSignerAuto(chainId);
}

export function connectStargateSigningClient(
  rpc: string,
  signer: OfflineSigner,
  gasPrice: GasPrice
): Promise<SigningStargateClient> {
  return SigningStargateClient.connectWithSigner(rpc, signer, { gasPrice });
}

export function connectCosmWasmSigningClient(
  rpc: string,
  signer: OfflineSigner,
  gasPrice: GasPrice
): Promise<SigningCosmWasmClient> {
  return SigningCosmWasmClient.connectWithSigner(rpc, signer, { gasPrice });
}
