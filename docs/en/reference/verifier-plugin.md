# Verifier & Plugins: Extensibility Reference

> **Purpose**: the protocol's extensibility — how platform verifiers are abstracted, how Alipay/Wise are implemented, **how to add a 3rd payment platform**, the plugin SDK API, Webhook config.
> **Audience**: advanced hands-on readers who want to extend the protocol. Prerequisites: [code-map.md](code-map.md), [contracts.md](contracts.md).
> All facts follow the source.

---

## 1. Platform-verifier interface abstraction

Every payment-platform verifier implements the unified interface [`IPlatformVerifier`](../../../tlsn-extension/packages/contracts/contracts/interfaces/IPlatformVerifier.sol):

```solidity
function verifyBuyerPayment(bytes proofsData, bytes paramsData) external returns (bytes32 txId);
function verifyMerchantSent(bytes proofsData, bytes paramsData) external returns (bytes32 txId);
```

- `proofsData` = `abi.encode(TLSNProof[])`; the number of proofs is platform-specific (Alipay 1, Wise 2).
- `paramsData` = `abi.encode(uint256 fiatAmountX1000, string targetCurrency, uint256 orderDeadline, uint256 orderCreationTime)` — **4 fields** ([IPlatformVerifier.sol:10-18](../../../tlsn-extension/packages/contracts/contracts/interfaces/IPlatformVerifier.sol#L10-L18)). `orderCreationTime` makes the payment time fall within `[created, deadline]`, preventing reuse of old/expired transfers.
- `TLSNVerifier` completes all cryptographic verification (chainId, session dedup, commitment checks, verifier signature) **before** calling the platform verifier; platform verifiers only do **business-rule matching**.

**Unified delegation entry** [`TLSNVerifier.verifyAndDelegate`](../../../tlsn-extension/packages/contracts/contracts/TLSNVerifier.sol#L196-L223):

```
verifyAndDelegate(platformId, isMerchantSent, proofs, paramsData)
  ├─ for each proof: _verifyTLSNProof + check serverName ∈ trustedPaymentServers
  ├─ verifier = platformVerifiers[platformId]   // registry lookup
  └─ isMerchantSent ? verifyMerchantSent : verifyBuyerPayment   // delegate
```

> `isMerchantSent=false` → buyer pays (CRYPTO product); `true` → merchant pays (FIAT product).

---

## 2. Alipay / Wise implementation notes

### 2.1 Alipay (single proof)

Source: [`platforms/AlipayPlatformVerifier.sol`](../../../tlsn-extension/packages/contracts/contracts/platforms/AlipayPlatformVerifier.sol)

`proofs[0]` = Alipay order API proof. On-chain checks ([:81-148](../../../tlsn-extension/packages/contracts/contracts/platforms/AlipayPlatformVerifier.sol#L81-L148)):

| Field | Rule |
|---|---|
| `status` | Must be `"SUCCESS"`, else `AlipayPaymentNotCompleted` |
| `bizType` | Must be `"TRANSFER"`, else `InvalidAlipayBizType` |
| `payAmount` (×1000) | Must equal `fiatAmountX1000`, else amount mismatch |
| `orderId` | `keccak256(orderId)` as `txId`, written to `usedAlipayOrderIds` for dedup |
| `gmtSuccess` | Parsed by `TLSNParserLib.parseDatetimeToUnix`, must fall within `[orderCreationTime, orderDeadline]` |

> 💡 On-chain business checks require only the 5 amount/status/time fields ([:184-186](../../../tlsn-extension/packages/contracts/contracts/platforms/AlipayPlatformVerifier.sol#L184-L186)); payee-identity matching is done off-chain by the **verifier server `accountCheck`** (see the note at the end of §2).

### 2.2 Wise (two proofs)

Source: [`platforms/WisePlatformVerifier.sol`](../../../tlsn-extension/packages/contracts/contracts/platforms/WisePlatformVerifier.sol)

`proofs[0]` = contacts proof, `proofs[1]` = transfer proof. Transfer on-chain checks ([:128-153](../../../tlsn-extension/packages/contracts/contracts/platforms/WisePlatformVerifier.sol#L128-L153)):

| Field | Rule |
|---|---|
| `state` | Must be `"OUTGOING_PAYMENT_SENT"`, else `PaymentNotCompleted` |
| `targetAmount` (×1000) | Must equal `fiatAmountX1000` |
| `targetCurrency` | Must equal `targetCurrency` |
| `id` | As `transferId`, written to `usedTransferIds` for dedup |
| `date` (ms) | After `/1000`, must fall within `[orderCreationTime, orderDeadline]` |

> 💡 `_verifyContacts` ([:121-123](../../../tlsn-extension/packages/contracts/contracts/platforms/WisePlatformVerifier.sol#L121-L123)) is an empty function — the contacts proof is structurally required (it still must pass cryptographic verification and a trusted serverName), and its payee-identity content is verified off-chain by the verifier server's accountCheck.
>
> **Why account verification is off-chain**: there is currently no way to verify identity on-chain without leaking privacy — running zk over the whole protocol would significantly increase latency and fees, bad for every party. So the design uses "off-chain accountCheck + the verifier signature over `orderBindingHash` (which includes the account hashes)": the verifier's signature guarantees the correct accounts were checked before signing. The on-chain account-check entry point is reserved for a future fully-decentralized phase (it can migrate on-chain once zkTLS performance is sufficient). See [03-threat-model.md](../deep-dive/03-threat-model.md), [05-security-analysis.md](../deep-dive/05-security-analysis.md).

---

## 3. Adding a 3rd payment platform

Thanks to the registry + unified interface, **no deployed contract needs changing**. Four steps:

**① Contract side**: write a new contract implementing [`IPlatformVerifier`](../../../tlsn-extension/packages/contracts/contracts/interfaces/IPlatformVerifier.sol) (modeled on `AlipayPlatformVerifier`), with its own `usedXxxIds` dedup map; after deployment, call the admin functions:

```solidity
tlsnVerifier.setPlatformVerifier(keccak256("yourplatform"), newVerifierAddress);
tlsnVerifier.addTrustedPaymentServer("api.yourplatform.com");  // trusted payment server
```

**② Verifier server side**: add the new platform's payee-identity field to the `accountCheck` reveal range (off-chain identity check), and configure a Webhook as needed (see §5).

**③ Frontend adapter**: add a `PaymentPlatform` object under [`web/src/platforms/`](../../../tlsn-extension/packages/web/src/platforms/) and register it into the `allPlatforms` array in [`registry.ts`](../../../tlsn-extension/packages/web/src/platforms/registry.ts#L6). The `PaymentPlatform` shape ([`types.ts:21-35`](../../../tlsn-extension/packages/web/src/platforms/types.ts#L21-L35)):

```ts
interface PaymentPlatform {
  id: Hex;                       // keccak256(toBytes(key)), must match the on-chain platformId
  key: string;                   // platform key
  label: string;
  pluginUrl: string;             // notarization plugin URL
  proofShape: 'single' | 'dual'; // single/dual proof (Alipay single, Wise dual)
  buildInjections(ctx, extra?): PlatformInjections;  // inject order-binding markers
  parsePluginResult(json): PluginResult;             // parse plugin output
}
```

> 📁 The frontend adapter is in `web/src/platforms/`: `registry.ts`/`types.ts`/`wise.ts`/`alipay.ts`.

**④ Plugin**: provide a notarization plugin (runs in the browser extension, generates the platform's TLS proof); see §4 and [`packages/tutorial`](../../../tlsn-extension/packages/tutorial/).

> The concept of adding a new platform is in thesis ch4.4.4; for exact function signatures and frontend locations, follow this section.

---

## 4. Plugin SDK API

Source: [`packages/plugin-sdk`](../../../tlsn-extension/packages/plugin-sdk/). Plugins run in a **QuickJS WebAssembly sandbox** ([`index.ts:455-463`](../../../tlsn-extension/packages/plugin-sdk/src/index.ts#L455-L463), `allowFetch:false, allowFs:false`, network and filesystem disabled by default) — the basis of plugin execution isolation (see [05-security-analysis.md](../deep-dive/05-security-analysis.md)).

**Unified `prove()`** (injected at [`index.ts:668`](../../../tlsn-extension/packages/plugin-sdk/src/index.ts#L668)):

```js
const proof = await prove(
  { url, method, headers },                       // request
  { verifierUrl, proxyUrl, maxRecvData, maxSentData,
    handlers: [ /* selective-disclosure handlers */ ] }
);
```

A single `prove()` completes: establish prover→verifier connection → send request over TLS → capture transcript → parse byte ranges with `Parser` → apply handlers for selective disclosure → generate the cryptographic proof.

**Handlers (selective disclosure)**:
- `type`: `'SENT'` (request) / `'RECV'` (response)
- `part`: `'START_LINE'`/`'METHOD'`/`'HEADERS'`/`'BODY'`/`'STATUS_CODE'` etc.
- `action`: `'REVEAL'` (plaintext) / `'PEDERSEN'` (commitment)
- `params`: granular control (`type:'json'`, `path`, `hideKey`, `hideValue`)

**React-like hooks**: `useState`/`setState`, `useEffect`, `useRequests`, `useHeaders`; UI primitives `div()`/`button()`; capabilities `openWindow()`, `done()`. See [`index.ts`](../../../tlsn-extension/packages/plugin-sdk/src/index.ts) and the `CLAUDE.md` Plugin SDK section.

**`policyVersion`**: a plugin `config` may declare `policyVersion` ([`index.ts:880-884`](../../../tlsn-extension/packages/plugin-sdk/src/index.ts#L880-L884)); it is hashed into the verifier signature digest (`policyVersionHash`), locking "which disclosure-policy version produced this proof" into the signature (see [02-zktls-tlsnotary.md](../deep-dive/02-zktls-tlsnotary.md)).

---

## 5. Webhook configuration

After verification, the verifier server can push a **slim Webhook** (fire-and-forget) to an external backend for real-time compliance decisions.

- **Config**: configured per server name in `config.yaml`, with `"*"` wildcard fallback ([`main.rs:575-579`](../../../tlsn-extension/packages/verifier/src/main.rs#L575-L579)).
- **Payload**: `SlimWebhookPayload` — **only Travel Rule compliance fields, no raw transcripts** ([`main.rs:653-657`](../../../tlsn-extension/packages/verifier/src/main.rs#L653-L657)).
- **Security**: optional HMAC-SHA256 signature via the `X-TLSN-Signature` header ([`main.rs:542`](../../../tlsn-extension/packages/verifier/src/main.rs#L542)).
- **Timing**: fired **after** the verifier signature ([`main.rs:1582,1649-1652`](../../../tlsn-extension/packages/verifier/src/main.rs#L1649-L1652)).

`config.yaml` example:

```yaml
webhooks:
  "wise.com":
    url: "https://your-backend.example.com/webhook/wise"
    secret: "your-hmac-secret"        # optional, HMAC-SHA256
  "*":
    url: "https://your-backend.example.com/webhook/default"
```

> 📍 Implementation location: the Webhook delivery logic is in [`verifier/src/main.rs`](../../../tlsn-extension/packages/verifier/src/main.rs) (`webhook.rs` is a placeholder module).
