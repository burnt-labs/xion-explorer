// Exercises the wallet (Keplr) signing path used by TxDialog.vue against a
// fake CometBFT JSON-RPC endpoint. Only the network transport is fake: the
// account decoding, fee simulation, signing and result parsing all run in the
// real CosmJS clients that src/libs/wallet-signing.ts creates.
//
// xion v32 (Cosmos SDK 0.55, CometBFT 0.40) changes two things a client sees:
// - new accounts get account numbers >= 2^63 (e.g. 2^63 + 123456789);
// - the node reports `node_info.version` "0.39.0".
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { Secp256k1Wallet } from '@cosmjs/amino';
import { fromBase64, fromHex, toBase64 } from '@cosmjs/encoding';
import { decodeTxRaw, DirectSecp256k1Wallet } from '@cosmjs/proto-signing';
import { GasPrice } from '@cosmjs/stargate';
import {
  QueryAccountRequest,
  QueryAccountResponse,
} from 'cosmjs-types/cosmos/auth/v1beta1/query';
import { BaseAccount } from 'cosmjs-types/cosmos/auth/v1beta1/auth';
import { SimulateResponse } from 'cosmjs-types/cosmos/tx/v1beta1/service';
import { TxRaw } from 'cosmjs-types/cosmos/tx/v1beta1/tx';
import { MsgExecuteContract } from 'cosmjs-types/cosmwasm/wasm/v1/tx';

import { isComet1Client, isComet38Client } from '@cosmjs/tendermint-rpc';

import {
  connectCosmWasmSigningClient,
  connectFailoverComet,
  connectStargateSigningClient,
  estimateFee,
  FailoverRpcClient,
  GAS_MARGIN,
  GAS_MULTIPLIER,
  isRetryableRpcError,
  walletSigner,
} from '../src/libs/wallet-signing.ts';

const CHAIN_ID = 'xion-testnet-2';
const V31_COMET = '0.38.26';
const V32_COMET = '0.39.0';
const SMALL_ACCOUNT_NUMBER = 12n;
const BIG_ACCOUNT_NUMBER = 2n ** 63n + 123456789n; // 9223372036978232597
const SEQUENCE = 7;
const RECIPIENT = 'xion1ry4kq2jhfa4dhuxn8uqd2dzmt5wpjtqjpnmzhy';
const CONTRACT =
  'xion14hj2tavq8fpesdwxxcu44rty3hh90vhujrvcmstl4zr3txmfvw9s9hgvmz';
const gasPrice = GasPrice.fromString('0.001uxion');
const privateKey = fromHex(
  '1111111111111111111111111111111111111111111111111111111111111111'
);

// Mirrors a real xion-testnet-2 /status response; only the version varies.
function status(version) {
  return {
    node_info: {
      protocol_version: { p2p: '8', block: '11', app: '0' },
      id: 'a386af218bd4e5d0a5f2dcfbcc1051eff63d059f',
      listen_addr: '65.109.30.26:55656',
      network: CHAIN_ID,
      version,
      channels: '40202122233038606100',
      moniker: 'fake',
      other: { tx_index: 'on', rpc_address: 'tcp://0.0.0.0:26657' },
    },
    sync_info: {
      latest_block_hash:
        '6C6D28B63D84E0059AF0DBAA1E48F24C82EC7D637F285B113F8FBAA13994D9AE',
      latest_app_hash:
        '5DD9C50306716CFB05BBB66D16935D01FAF08E6B5D9C9602FB287FEAADD5F40C',
      latest_block_height: '100',
      latest_block_time: '2026-10-21T15:45:05.278953036Z',
      earliest_block_hash:
        'E9A6C84C80E45DE29C9AED4EA444B4AA39EEAF340A25EEA51E523ECFF877F4A8',
      earliest_app_hash:
        'FDF32F9687792E35E7708A4430330D60F070D8EE8E8A388B2DF62CDF65C8E763',
      earliest_block_height: '1',
      earliest_block_time: '2026-07-05T16:40:41.137258096Z',
      catching_up: false,
    },
    validator_info: {
      address: '928C7878A63764A5835FD690E61C43B7413CCEDA',
      pub_key: {
        type: 'tendermint/PubKeyEd25519',
        value: 'CLUiLxsG79o9PbSA3bIWR0ZpvFErJj+XCLVuR+21tvs=',
      },
      voting_power: '0',
    },
  };
}

function abciOk(value) {
  return {
    response: {
      code: 0,
      log: '',
      info: '',
      index: '0',
      key: null,
      value: toBase64(value),
      proofOps: null,
      height: '100',
      codespace: '',
    },
  };
}

// A fake CometBFT RPC node that knows exactly one account.
// `fail(method)` lets a case make the node misbehave for a method: return an
// HTTP status (e.g. 502) to answer with it, or 'hang' to never answer.
async function startNode({ version, address, accountNumber, fail = () => {} }) {
  const broadcasts = [];
  const requests = [];
  const handle = ({ method, params }) => {
    switch (method) {
      case 'status':
        return status(version);
      case 'abci_query':
        if (params.path === '/cosmos.auth.v1beta1.Query/Account') {
          const request = QueryAccountRequest.decode(fromHex(params.data));
          assert.equal(request.address, address);
          const account = BaseAccount.fromPartial({
            address,
            accountNumber,
            sequence: BigInt(SEQUENCE),
          });
          return abciOk(
            QueryAccountResponse.encode({
              account: {
                typeUrl: '/cosmos.auth.v1beta1.BaseAccount',
                value: BaseAccount.encode(account).finish(),
              },
            }).finish()
          );
        }
        assert.equal(params.path, '/cosmos.tx.v1beta1.Service/Simulate');
        return abciOk(
          SimulateResponse.encode(
            SimulateResponse.fromPartial({
              gasInfo: { gasWanted: 0n, gasUsed: 100000n },
              result: { data: new Uint8Array(), log: '', events: [] },
            })
          ).finish()
        );
      case 'broadcast_tx_sync': {
        broadcasts.push(fromBase64(params.tx));
        return { code: 0, data: '', log: '', codespace: '', hash: txHash() };
      }
      default: {
        // `tx_search` for the hash returned above. CometBFT >= 0.37 returns
        // event attributes as plain strings; reading them with the
        // Tendermint 0.34 adaptor (base64) fails with
        // "Invalid string. Length must be a multiple of 4".
        assert.equal(method, 'tx_search');
        const tx = toBase64(broadcasts.at(-1));
        return {
          txs: [
            {
              hash: txHash(),
              height: '101',
              index: 0,
              tx_result: {
                code: 0,
                data: '',
                log: '',
                info: '',
                gas_wanted: '140000',
                gas_used: '100000',
                events: [
                  {
                    type: 'message',
                    attributes: [{ key: 'action', value: 'send', index: true }],
                  },
                ],
                codespace: '',
              },
              tx,
            },
          ],
          total_count: '1',
        };
      }
    }
  };
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      const request = JSON.parse(body);
      requests.push(request.method);
      const failure = fail(request.method);
      if (failure === 'hang') return;
      if (failure) {
        res.statusCode = failure;
        res.end('<html>Bad Gateway</html>');
        return;
      }
      let reply;
      try {
        reply = { jsonrpc: '2.0', id: request.id, result: handle(request) };
      } catch (error) {
        // Unexpected request: log the details locally and answer with a
        // generic JSON-RPC error so the client call fails.
        console.error(error);
        reply = {
          jsonrpc: '2.0',
          id: request.id,
          error: { code: -32603, message: 'Internal error', data: '' },
        };
      }
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(reply));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    broadcasts,
    requests,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  };
}

function txHash() {
  return 'AB'.repeat(32);
}

// Keplr hands out a direct signer for software keys and an amino-only signer
// for Ledger keys (`getOfflineSignerAuto`); cover both.
async function wallets() {
  return {
    direct: await DirectSecp256k1Wallet.fromKey(privateKey, 'xion'),
    amino: await Secp256k1Wallet.fromKey(privateKey, 'xion'),
  };
}

// Recomputes the signature the wallet must produce for the expected
// account number and compares it with the one in the broadcast tx.
async function assertSignedFor(raw, wallet, address, accountNumber) {
  const tx = decodeTxRaw(raw);
  const [signerInfo] = tx.authInfo.signerInfos;
  assert.equal(signerInfo.sequence, BigInt(SEQUENCE));
  let expected;
  if (signerInfo.modeInfo.single.mode === 1) {
    // SIGN_MODE_DIRECT
    const { bodyBytes, authInfoBytes } = TxRaw.decode(raw);
    const { signature } = await wallet.signDirect(address, {
      bodyBytes,
      authInfoBytes,
      chainId: CHAIN_ID,
      accountNumber,
    });
    expected = signature.signature;
  } else {
    // SIGN_MODE_LEGACY_AMINO_JSON
    const fee = tx.authInfo.fee;
    const { signature } = await wallet.signAmino(address, {
      chain_id: CHAIN_ID,
      account_number: accountNumber.toString(),
      sequence: String(SEQUENCE),
      fee: {
        amount: fee.amount.map(({ denom, amount }) => ({ denom, amount })),
        gas: fee.gasLimit.toString(),
      },
      msgs: [
        {
          type: 'cosmos-sdk/MsgSend',
          value: {
            from_address: address,
            to_address: RECIPIENT,
            amount: [{ denom: 'uxion', amount: '1000' }],
          },
        },
      ],
      memo: tx.body.memo,
    });
    expected = signature.signature;
  }
  assert.equal(toBase64(tx.signatures[0]), expected);
}

async function sendThroughWallet({ version, accountNumber, kind }) {
  const signer = (await wallets())[kind];
  const [{ address }] = await signer.getAccounts();
  const node = await startNode({ version, address, accountNumber });
  try {
    const client = await connectStargateSigningClient(
      [node.url],
      signer,
      gasPrice
    );
    const account = await client.getAccount(address);
    assert.equal(BigInt(account.accountNumber), accountNumber);
    const response = await client.sendTokens(
      address,
      RECIPIENT,
      [{ denom: 'uxion', amount: '1000' }],
      'auto',
      'explorer test'
    );
    assert.equal(response.code, 0);
    assert.equal(response.transactionHash, txHash());
    assert.equal(node.broadcasts.length, 1);
    await assertSignedFor(node.broadcasts[0], signer, address, accountNumber);
  } finally {
    await node.close();
  }
}

const TIMEOUT = { timeout: 20_000 };

test(
  'v31 node (CometBFT 0.38), small account number, direct signer',
  TIMEOUT,
  () =>
    sendThroughWallet({
      version: V31_COMET,
      accountNumber: SMALL_ACCOUNT_NUMBER,
      kind: 'direct',
    })
);

test(
  'v32 node (reports 0.39.0), small account number, direct signer',
  TIMEOUT,
  () =>
    sendThroughWallet({
      version: V32_COMET,
      accountNumber: SMALL_ACCOUNT_NUMBER,
      kind: 'direct',
    })
);

test('v32 node, account number 2^63 + 123456789, direct signer', TIMEOUT, () =>
  sendThroughWallet({
    version: V32_COMET,
    accountNumber: BIG_ACCOUNT_NUMBER,
    kind: 'direct',
  })
);

test(
  'v32 node, account number 2^63 + 123456789, amino (Ledger) signer',
  TIMEOUT,
  () =>
    sendThroughWallet({
      version: V32_COMET,
      accountNumber: BIG_ACCOUNT_NUMBER,
      kind: 'amino',
    })
);

for (const [label, version, accountNumber] of [
  ['v31 node, small account number', V31_COMET, SMALL_ACCOUNT_NUMBER],
  ['v32 node, account number 2^63 + 123456789', V32_COMET, BIG_ACCOUNT_NUMBER],
]) {
  test(`CosmWasm execute: ${label}`, TIMEOUT, async () => {
    const { direct: signer } = await wallets();
    const [{ address }] = await signer.getAccounts();
    const node = await startNode({ version, address, accountNumber });
    try {
      const client = await connectCosmWasmSigningClient(
        [node.url],
        signer,
        gasPrice
      );
      const msg = { increment: {} };
      const response = await client.signAndBroadcast(
        address,
        [
          {
            typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
            value: MsgExecuteContract.fromPartial({
              sender: address,
              contract: CONTRACT,
              msg: new TextEncoder().encode(JSON.stringify(msg)),
              funds: [],
            }),
          },
        ],
        'auto',
        ''
      );
      assert.equal(response.code, 0);
      const tx = decodeTxRaw(node.broadcasts[0]);
      assert.equal(
        tx.body.messages[0].typeUrl,
        '/cosmwasm.wasm.v1.MsgExecuteContract'
      );
      await assertSignedFor(node.broadcasts[0], signer, address, accountNumber);
    } finally {
      await node.close();
    }
  });
}

test('walletSigner enables the chain and returns the auto signer', async () => {
  const { direct } = await wallets();
  const enabled = [];
  const provider = {
    enable: async (chainId) => void enabled.push(chainId),
    getOfflineSignerAuto: async () => direct,
  };
  assert.equal(await walletSigner(provider, CHAIN_ID), direct);
  assert.deepEqual(enabled, [CHAIN_ID]);
  await assert.rejects(walletSigner(undefined, CHAIN_ID), {
    message: 'A Keplr-compatible wallet is required',
  });
  await assert.rejects(walletSigner(provider, undefined), {
    message: 'Chain ID is unavailable',
  });
});

// --- RPC failover -----------------------------------------------------------
//
// The testnet chain config lists our RPC first and third-party RPCs after it.
// When one of them fails (xion v32 upgrade: a third-party node answered 502
// through Cloudflare or timed out), the dialog must carry on with the next.

// A URL nothing listens on: connections are refused.
async function deadUrl() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return `http://127.0.0.1:${port}`;
}

async function sendVia(urls, signer, address) {
  const client = await connectStargateSigningClient(urls, signer, gasPrice);
  const account = await client.getAccount(address);
  assert.equal(BigInt(account.accountNumber), BIG_ACCOUNT_NUMBER);
  return client.sendTokens(
    address,
    RECIPIENT,
    [{ denom: 'uxion', amount: '1000' }],
    'auto',
    ''
  );
}

test(
  'first RPC answers 502 to abci_query: the send goes through the second',
  TIMEOUT,
  async () => {
    const { direct: signer } = await wallets();
    const [{ address }] = await signer.getAccounts();
    const node = (fail) =>
      startNode({
        version: V32_COMET,
        address,
        accountNumber: BIG_ACCOUNT_NUMBER,
        fail,
      });
    const bad = await node((method) =>
      method === 'abci_query' ? 502 : undefined
    );
    const good = await node();
    try {
      const response = await sendVia([bad.url, good.url], signer, address);
      assert.equal(response.code, 0);
      assert.equal(bad.broadcasts.length, 0);
      assert.equal(good.broadcasts.length, 1);
      await assertSignedFor(
        good.broadcasts[0],
        signer,
        address,
        BIG_ACCOUNT_NUMBER
      );
      // status came from the first node; after its 502 every later request
      // (account x3, simulate, chain id, broadcast, tx_search) stayed on the
      // second.
      assert.deepEqual(bad.requests, ['status', 'abci_query']);
      assert.deepEqual(good.requests, [
        'abci_query',
        'abci_query',
        'abci_query',
        'abci_query',
        'status',
        'broadcast_tx_sync',
        'tx_search',
      ]);
    } finally {
      await bad.close();
      await good.close();
    }
  }
);

test(
  'first RPC refuses connections: the send goes through the second',
  TIMEOUT,
  async () => {
    const { direct: signer } = await wallets();
    const [{ address }] = await signer.getAccounts();
    const good = await startNode({
      version: V32_COMET,
      address,
      accountNumber: BIG_ACCOUNT_NUMBER,
    });
    try {
      const response = await sendVia(
        [await deadUrl(), good.url],
        signer,
        address
      );
      assert.equal(response.code, 0);
      assert.equal(good.broadcasts.length, 1);
    } finally {
      await good.close();
    }
  }
);

test(
  'first RPC times out: the request moves on to the second',
  TIMEOUT,
  async () => {
    const hanging = await startNode({ version: V32_COMET, fail: () => 'hang' });
    const good = await startNode({ version: V32_COMET });
    try {
      const client = new FailoverRpcClient([hanging.url, good.url], 200);
      const response = await client.execute({
        jsonrpc: '2.0',
        id: 1,
        method: 'status',
        params: {},
      });
      assert.equal(response.result.node_info.version, V32_COMET);
      assert.equal(client.url, good.url);
      client.disconnect();
    } finally {
      await hanging.close();
      await good.close();
    }
  }
);

test(
  'a JSON-RPC error from a node that answered is not retried elsewhere',
  TIMEOUT,
  async () => {
    const first = await startNode({ version: V32_COMET });
    const second = await startNode({ version: V32_COMET });
    try {
      const client = new FailoverRpcClient([first.url, second.url]);
      await assert.rejects(
        client.execute({
          jsonrpc: '2.0',
          id: 1,
          method: 'genesis',
          params: {},
        }),
        /Internal error/
      );
      assert.deepEqual(first.requests, ['genesis']);
      assert.deepEqual(second.requests, []);
    } finally {
      await first.close();
      await second.close();
    }
  }
);

test(
  'every RPC failing: the last error is reported after one retry',
  TIMEOUT,
  async () => {
    const a = await startNode({ version: V32_COMET, fail: () => 503 });
    const b = await startNode({ version: V32_COMET, fail: () => 502 });
    try {
      await assert.rejects(
        connectStargateSigningClient(
          [a.url, b.url],
          (await wallets()).direct,
          gasPrice
        ),
        {
          message: 'Bad status on response: 503',
        }
      );
      // a, b, then a again.
      assert.deepEqual(a.requests, ['status', 'status']);
      assert.deepEqual(b.requests, ['status']);
    } finally {
      await a.close();
      await b.close();
    }
  }
);

test('a single RPC gets one retry', TIMEOUT, async () => {
  let calls = 0;
  const flaky = await startNode({
    version: V32_COMET,
    fail: () => (calls++ === 0 ? 502 : undefined),
  });
  try {
    const client = new FailoverRpcClient([flaky.url]);
    const response = await client.execute({
      jsonrpc: '2.0',
      id: 1,
      method: 'status',
      params: {},
    });
    assert.equal(response.result.node_info.version, V32_COMET);
    assert.deepEqual(flaky.requests, ['status', 'status']);
  } finally {
    await flaky.close();
  }
});

test('no RPC configured', () => {
  assert.throws(() => new FailoverRpcClient([]), {
    message: 'RPC endpoint is unavailable',
  });
});

test('which errors move on to the next RPC', () => {
  const status = (code) =>
    new Error(`Bad status on response: ${code}`, {
      cause: { status: code, body: '' },
    });
  assert.equal(isRetryableRpcError(status(502)), true);
  assert.equal(isRetryableRpcError(status(500)), true);
  assert.equal(isRetryableRpcError(status(429)), true);
  assert.equal(isRetryableRpcError(status(404)), false);
  assert.equal(isRetryableRpcError(new TypeError('fetch failed')), true);
  assert.equal(
    isRetryableRpcError(new SyntaxError('Unexpected token <')),
    true
  );
  assert.equal(
    isRetryableRpcError(new DOMException('timed out', 'TimeoutError')),
    true
  );
  assert.equal(
    isRetryableRpcError(new DOMException('aborted', 'AbortError')),
    true
  );
  assert.equal(
    isRetryableRpcError(
      new Error('{"code":-32603,"message":"Internal error"}')
    ),
    false
  );
  assert.equal(isRetryableRpcError(new Error('no cause')), false);
  assert.equal(isRetryableRpcError('not an error'), false);
});

test('adaptor follows the reported CometBFT version', TIMEOUT, async () => {
  for (const [version, check] of [
    [V31_COMET, isComet38Client],
    ['1.0.0', isComet1Client],
  ]) {
    const node = await startNode({ version });
    try {
      assert.equal(
        check(await connectFailoverComet([node.url])),
        true,
        version
      );
    } finally {
      await node.close();
    }
  }
});

// --- Fees ---------------------------------------------------------------------

test('estimateFee: simulated gas x1.4 plus a fixed margin, at the gas price', async () => {
  const seen = [];
  const client = {
    simulate: async (...args) => {
      seen.push(args);
      return 51053; // a MsgSend on xion v32 testnet; delivery used 74,718
    },
  };
  const msgs = [{ typeUrl: '/cosmos.bank.v1beta1.MsgSend', value: {} }];
  const fee = await estimateFee(client, 'xion1sender', msgs, 'memo', gasPrice);
  const gas = Math.ceil(51053 * GAS_MULTIPLIER) + GAS_MARGIN;
  assert.equal(fee.gas, String(gas));
  assert.ok(gas > 74718, 'covers what delivery used');
  assert.deepEqual(fee.amount, [
    { denom: 'uxion', amount: String(Math.ceil(gas * 0.001)) },
  ]);
  assert.deepEqual(seen, [['xion1sender', msgs, 'memo']]);
});
