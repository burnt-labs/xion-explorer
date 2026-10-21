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

import {
  connectCosmWasmSigningClient,
  connectStargateSigningClient,
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
async function startNode({ version, address, accountNumber }) {
  const broadcasts = [];
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
      let reply;
      try {
        reply = { jsonrpc: '2.0', id: request.id, result: handle(request) };
      } catch (error) {
        reply = {
          jsonrpc: '2.0',
          id: request.id,
          error: { code: -32603, message: String(error), data: '' },
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
    close: () => new Promise((resolve) => server.close(resolve)),
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
      node.url,
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
        node.url,
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
