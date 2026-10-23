import { SigningCosmWasmClient } from '@cosmjs/cosmwasm';
import type { EncodeObject, OfflineSigner } from '@cosmjs/proto-signing';
import {
  calculateFee,
  GasPrice,
  SigningStargateClient,
  type StdFee,
} from '@cosmjs/stargate';
import {
  Comet1Client,
  Comet38Client,
  HttpClient,
  Tendermint37Client,
  type CometClient,
  type RpcClient,
} from '@cosmjs/tendermint-rpc';

// Signing clients for browser wallets (Keplr and compatible extensions).
//
// Keep these on CosmJS >= 0.39:
// - The Comet adaptor is picked from the node's reported version. CometBFT
//   0.40 (xion v32) reports "0.39.0", which CosmJS <= 0.37 maps to the
//   Tendermint 0.34 adaptor; transactions then commit but the client throws
//   "Invalid string. Length must be a multiple of 4" when it reads the result.
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

// Per-request timeout for one RPC endpoint.
export const RPC_TIMEOUT_MS = 15_000;

// True when the endpoint gave no usable answer: HTTP 5xx or 429 (e.g. a
// Cloudflare 502 while a node restarts), a timeout, a network or CORS failure,
// or a body that is not JSON. A JSON-RPC error from a node that did answer is
// that node's verdict and is not retried elsewhere.
export function isRetryableRpcError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error instanceof TypeError || error instanceof SyntaxError) return true;
  if (error.name === 'TimeoutError' || error.name === 'AbortError') return true;
  const status = (error.cause as { status?: unknown } | undefined)?.status;
  return typeof status === 'number' && (status >= 500 || status === 429);
}

type RpcRequest = Parameters<RpcClient['execute']>[0];
type RpcResponse = Awaited<ReturnType<RpcClient['execute']>>;

// A CometBFT JSON-RPC client over several HTTP endpoints, in order of
// preference. A request that fails with a retryable error moves on to the
// next endpoint, and the endpoint that answered stays in use for later
// requests, so one signing flow (account, simulate, broadcast, tx polling)
// reads from one node while that node is healthy. A request tries every
// endpoint once and then the one it started on again, so a chain with a
// single endpoint still gets one retry.
//
// Re-sending `broadcast_tx_sync` after a failure is safe on chain: a node that
// already has the tx rejects the copy (mempool cache or account sequence).
export class FailoverRpcClient implements RpcClient {
  readonly urls: readonly string[];
  private readonly clients: HttpClient[];
  private current = 0;

  constructor(urls: readonly string[], timeoutMs = RPC_TIMEOUT_MS) {
    if (urls.length === 0) throw new Error('RPC endpoint is unavailable');
    this.urls = urls;
    this.clients = urls.map((url) => new HttpClient(url, timeoutMs));
  }

  get url(): string {
    return this.urls[this.current];
  }

  async execute(request: RpcRequest): Promise<RpcResponse> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.clients.length; attempt++) {
      const index = (this.current + attempt) % this.clients.length;
      try {
        const response = await this.clients[index].execute(request);
        this.current = index;
        return response;
      } catch (error) {
        if (!isRetryableRpcError(error)) throw error;
        lastError = error;
      }
    }
    throw lastError;
  }

  disconnect(): void {
    // HTTP clients hold no connection.
  }
}

// The same adaptor choice as CosmJS 0.39 `connectComet`, over the failover
// client: 0.38 -> Comet38, 1.x -> Comet1, anything else (0.37, and the
// "0.39.0" that CometBFT 0.40 reports) -> Tendermint37.
export async function connectFailoverComet(
  rpcs: readonly string[]
): Promise<CometClient> {
  const rpcClient = new FailoverRpcClient(rpcs);
  const tm37 = Tendermint37Client.create(rpcClient);
  const { version } = (await tm37.status()).nodeInfo;
  if (version.startsWith('0.38.')) return Comet38Client.create(rpcClient);
  if (version.startsWith('1.')) return Comet1Client.create(rpcClient);
  return tm37;
}

export async function connectStargateSigningClient(
  rpcs: readonly string[],
  signer: OfflineSigner,
  gasPrice: GasPrice
): Promise<SigningStargateClient> {
  return SigningStargateClient.createWithSigner(
    await connectFailoverComet(rpcs),
    signer,
    { gasPrice }
  );
}

export async function connectCosmWasmSigningClient(
  rpcs: readonly string[],
  signer: OfflineSigner,
  gasPrice: GasPrice
): Promise<SigningCosmWasmClient> {
  return SigningCosmWasmClient.createWithSigner(
    await connectFailoverComet(rpcs),
    signer,
    { gasPrice }
  );
}

// Simulation leaves out part of what delivery charges. CosmJS simulates with
// an empty fee, so fee deduction (about 18k gas on xion) is not counted, and
// delivery adds a few thousand more. On xion v32 testnet a MsgSend simulated at
// about 51k used 73-75k (x1.42-1.46), so CosmJS's `auto` (x1.4) ran out of
// gas. A fixed margin on top of the multiplier covers that gap for small txs.
export const GAS_MULTIPLIER = 1.4;
export const GAS_MARGIN = 30_000;

export async function estimateFee(
  client: Pick<SigningStargateClient, 'simulate'>,
  sender: string,
  messages: readonly EncodeObject[],
  memo: string,
  gasPrice: GasPrice
): Promise<StdFee> {
  const simulated = await client.simulate(sender, messages, memo);
  return calculateFee(
    Math.ceil(simulated * GAS_MULTIPLIER) + GAS_MARGIN,
    gasPrice
  );
}
