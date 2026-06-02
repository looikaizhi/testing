# Source Map: Thesis ↔ Code

> **Purpose**: helps you "understand the thesis work directly through the source." It is the **skeleton** of the whole doc set — every other page references the package responsibilities and the "thesis concept ↔ source location" map here.
> **Audience**: shared by both the hands-on and deep-dive tracks. Start with the [overview](#1-monorepo-overview) to build a mental map, then use the [mapping table](#3-thesis-concept--source-location-map) to navigate.
> All facts follow the actual source; code references are written as `file:line` and are clickable.

---

## 1. Monorepo overview

The code lives in [`tlsn-extension/`](../../../tlsn-extension/), an npm-workspaces multi-package repo. The thesis system has **two trust domains** and **four layers**; the table below maps the thesis layers to code packages:

```
┌─────────────────────────────────────────────────────────────────┐
│  Decentralized domain (on-chain, deterministic execution)        │
│    packages/contracts  ── escrow, order FSM, proof verification, │
│                           risk control, bond vault               │
├─────────────────────────────────────────────────────────────────┤
│  Constrained centralized domain (off-chain, bound by crypto)     │
│    packages/verifier   ── MPC-TLS verify + accountCheck +        │
│                           signing + Webhook                      │
├─────────────────────────────────────────────────────────────────┤
│  Proof-generation layer (user side)                              │
│    packages/extension  ── browser extension (MPC-TLS proof gen)  │
│    packages/plugin-sdk ── QuickJS-sandboxed plugin runtime + HTTP│
│    packages/tlsn-wasm  ── WASM bindings for TLSNotary proofs      │
├─────────────────────────────────────────────────────────────────┤
│  Application & ops layer                                         │
│    packages/web        ── trading dApp (Next.js frontend)        │
│    packages/keeper     ── expired-order cleanup daemon (off-chain,│
│                           no privilege)                          │
│    packages/demo       ── Docker demo + example plugins          │
│    packages/tutorial   ── plugin-development tutorial            │
│    packages/common     ── shared utilities (logging)             │
└─────────────────────────────────────────────────────────────────┘
```

> The definitions of "decentralized domain / constrained centralized domain" are in [glossary.md](glossary.md) and [deep-dive/01-overview.md](../deep-dive/01-overview.md); why it is split this way is in [deep-dive/03-threat-model.md](../deep-dive/03-threat-model.md).

---

## 2. Per-package responsibilities (per the actual `packages/`)

| Package | Language | Responsibility | Thesis section | Detail |
|---|---|---|---|---|
| [`contracts`](../../../tlsn-extension/packages/contracts/) | Solidity 0.8.28 | On-chain core: asset escrow, order FSM, TLSN proof verification, platform verifiers, risk control, bond vault | ch4.2 | [contracts.md](contracts.md) |
| [`verifier`](../../../tlsn-extension/packages/verifier/) | Rust (Axum) | Verifier server: runs the verifier side of MPC-TLS, accountCheck, signs commitments & order-binding hash, Webhook | ch4.3, ch4.4, ch5.5 | [verifier-plugin.md](verifier-plugin.md) |
| [`extension`](../../../tlsn-extension/packages/extension/) | TypeScript (MV3) | Browser extension: intercepts requests, generates MPC-TLS proofs via WASM in an Offscreen document, runs plugin UI | ch4.3, ch5 | [verifier-plugin.md](verifier-plugin.md) |
| [`plugin-sdk`](../../../tlsn-extension/packages/plugin-sdk/) | TypeScript | Plugin runtime: QuickJS WASM sandbox, unified `prove()`, HTTP transcript parsing & selective disclosure | ch4.3, ch4.8.5 | [verifier-plugin.md](verifier-plugin.md) |
| [`tlsn-wasm`](../../../tlsn-extension/packages/tlsn-wasm/) / `tlsn-wasm-pkg` | Rust→WASM | WASM bindings for TLSNotary proof generation (called by the extension) | ch2.3, ch4.3 | — |
| [`web`](../../../tlsn-extension/packages/web/) | TypeScript (Next.js) | Trading dApp: place orders, bind payment accounts, merchant listing, admin config, proof submission | ch5.4 | [code-map §4](#4-key-files-reading-guide) |
| [`keeper`](../../../tlsn-extension/packages/keeper/) | TypeScript (viem) | Off-chain daemon: watches order events, calls `sweepExpiredBatch` on expiry (**no privilege; anyone can do it instead**) | ch4.2.5 | [§4](#4-key-files-reading-guide) |
| [`demo`](../../../tlsn-extension/packages/demo/) | TypeScript | Docker demo environment + example payment plugins | ch5 | [hands-on/02](../hands-on/02-demo-walkthrough.md) |
| [`tutorial`](../../../tlsn-extension/packages/tutorial/) | TypeScript | Plugin-development tutorial | ch5 | — |
| [`common`](../../../tlsn-extension/packages/common/) | TypeScript | Shared logging utilities | — | — |

> 📁 `web/src/components/` is organized into subdirectories: `admin/ binding/ dashboard/ merchant/ orders/ p2p/ proof/ shared/ trade/ ui/ layout/` (the frontend business flows are arranged this way).

### Contract layer file list (`packages/contracts/contracts/`)

| File | Responsibility |
|---|---|
| [`C2CEscrow.sol`](../../../tlsn-extension/packages/contracts/contracts/C2CEscrow.sol) | Main contract: listing, order escrow, settlement after platform-payment verification, order FSM, expiry cleanup, order-binding-hash computation |
| [`TLSNVerifier.sol`](../../../tlsn-extension/packages/contracts/contracts/TLSNVerifier.sol) | TLSN proof cryptographic verification + verifier signature recovery + platform-verifier registry & unified delegation entry |
| [`C2CRiskManager.sol`](../../../tlsn-extension/packages/contracts/contracts/C2CRiskManager.sol) | Dynamic bond rate, reputation/risk level, timeout slashing, freeze & decay |
| [`C2CBondVault.sol`](../../../tlsn-extension/packages/contracts/contracts/C2CBondVault.sol) | Bond vault: per-order isolated custody, pull-mode (`claim()`) withdrawal after settlement |
| [`C2CAdmin.sol`](../../../tlsn-extension/packages/contracts/contracts/C2CAdmin.sol) | Admin: crypto/fiat asset registration, merchant registration, per-order cap, permissions |
| [`C2CTypes.sol`](../../../tlsn-extension/packages/contracts/contracts/C2CTypes.sol) | Shared types: `OrderStatus`, `TLSNProof`, binding/payment-info structs, all custom errors |
| [`platforms/AlipayPlatformVerifier.sol`](../../../tlsn-extension/packages/contracts/contracts/platforms/AlipayPlatformVerifier.sol) | Alipay platform verifier (single proof) |
| [`platforms/WisePlatformVerifier.sol`](../../../tlsn-extension/packages/contracts/contracts/platforms/WisePlatformVerifier.sol) | Wise platform verifier (contacts + transfer, two proofs) |
| [`interfaces/IPlatformVerifier.sol`](../../../tlsn-extension/packages/contracts/contracts/interfaces/IPlatformVerifier.sol) | Unified platform-verifier interface (core of the extensibility mechanism) |
| [`lib/TLSNParserLib.sol`](../../../tlsn-extension/packages/contracts/contracts/lib/TLSNParserLib.sol) | On-chain JSON field / amount / datetime parsing library |
| [`lib/UintQueue.sol`](../../../tlsn-extension/packages/contracts/contracts/lib/UintQueue.sol) | Pending-order queue (FIFO, for bounded cleanup) |

---

## 3. Thesis concept ↔ source location map

> The core of this page: thesis concept → exact code implementation location.

### 3.1 The two innovations

| Thesis concept | Source location | Status |
|---|---|---|
| **Innovation ①: order-binding hash H_bind (15-field keccak256)** | [`C2CEscrow.sol:381-413`](../../../tlsn-extension/packages/contracts/contracts/C2CEscrow.sol#L381-L413) `_computeOrderBindingHash` | ✓ |
| On-chain enforcement of H_bind | [`C2CEscrow.sol:423-425`](../../../tlsn-extension/packages/contracts/contracts/C2CEscrow.sol#L423-L425) `_requireOrderBinding` | ✓ |
| **Innovation ②: semi-decentralized dual-domain architecture** | Decentralized domain = `contracts`; constrained centralized domain = `verifier` trust lists (`trustedVerifiers`/`trustedPaymentServers`/`trustedKYBServers`) | ✓ |

### 3.2 Off-chain proof & verification (zkTLS / TLSNotary)

| Thesis concept | Source location | Status |
|---|---|---|
| MPC-TLS proof generation (user side) | `extension` (Background/Offscreen/SessionManager) + [`tlsn-wasm`](../../../tlsn-extension/packages/tlsn-wasm/) WASM bindings | ✓ |
| Unified `prove()` API (request→transcript→selective disclosure→proof) | [`plugin-sdk/src/index.ts:668`](../../../tlsn-extension/packages/plugin-sdk/src/index.ts#L668) (injects `prove`); HTTP parsing [`plugin-sdk/src/parser.ts`](../../../tlsn-extension/packages/plugin-sdk/src/parser.ts) | ✓ |
| Verifier-side MPC-TLS protocol | [`verifier/src/verifier.rs:61-206`](../../../tlsn-extension/packages/verifier/src/verifier.rs#L61-L206) | ✓ |
| Commitment hash algorithm = Keccak256 (matches on-chain) | [`verifier/src/verifier.rs:225-226`](../../../tlsn-extension/packages/verifier/src/verifier.rs#L225-L226) | ✓ |
| Selective disclosure / commitment-opening check (rebuild commitment from value+blinder) | [`TLSNVerifier.sol:246-262`](../../../tlsn-extension/packages/contracts/contracts/TLSNVerifier.sol#L246-L262) `_verifyCommitmentOpenings` | ✓ |
| Commitment-set hash check | [`TLSNVerifier.sol:264-270`](../../../tlsn-extension/packages/contracts/contracts/TLSNVerifier.sol#L264-L270) `_verifyCommitmentsHash` | ✓ |
| `TLSNProof` data structure | [`C2CTypes.sol:35-69`](../../../tlsn-extension/packages/contracts/contracts/C2CTypes.sol#L35-L69) | ✓ |

### 3.3 Verifier signature (anchor of the constrained centralized domain)

| Thesis concept | Source location | Status |
|---|---|---|
| Verifier signature digest (on-chain recovery) = `chainId ‖ keccak(sessionId) ‖ commitmentsHash ‖ orderBindingHash ‖ policyVersionHash` | [`TLSNVerifier.sol:272-285`](../../../tlsn-extension/packages/contracts/contracts/TLSNVerifier.sol#L272-L285) `_recoverVerifierSigner` | ✓ |
| Same digest built off-chain (byte-for-byte identical) | [`verifier/src/main.rs:2064-2111`](../../../tlsn-extension/packages/verifier/src/main.rs#L2064-L2111) `sign_commitments` | ✓ |
| Signer must be in the trust list | [`TLSNVerifier.sol:236`](../../../tlsn-extension/packages/contracts/contracts/TLSNVerifier.sol#L236) `trustedVerifiers` | ✓ |
| **Account-identity verification done off-chain** (keccak256 slice comparison) | [`verifier/src/main.rs:1366-1422`](../../../tlsn-extension/packages/verifier/src/main.rs#L1366-L1422) `accountCheck` | ✓ |
| policyVersion taken from plugin config | [`plugin-sdk/src/index.ts:880-884`](../../../tlsn-extension/packages/plugin-sdk/src/index.ts#L880-L884) | ✓ |

### 3.4 Platform verifiers (extensibility)

| Thesis concept | Source location | Status |
|---|---|---|
| Unified delegation entry `verifyAndDelegate` | [`TLSNVerifier.sol:196-223`](../../../tlsn-extension/packages/contracts/contracts/TLSNVerifier.sol#L196-L223) | ✓ |
| Unified platform-verifier interface | [`interfaces/IPlatformVerifier.sol`](../../../tlsn-extension/packages/contracts/contracts/interfaces/IPlatformVerifier.sol) | ✓ |
| paramsData = 4 fields (incl. `orderCreationTime`, payment window `[created, deadline]`) | [`IPlatformVerifier.sol:10-18`](../../../tlsn-extension/packages/contracts/contracts/interfaces/IPlatformVerifier.sol#L10-L18); built in [`C2CEscrow.sol:633-637`](../../../tlsn-extension/packages/contracts/contracts/C2CEscrow.sol#L633-L637) | ✓ |
| Alipay checks (status/bizType/amount/orderId dedup/time window) | [`AlipayPlatformVerifier.sol`](../../../tlsn-extension/packages/contracts/contracts/platforms/AlipayPlatformVerifier.sol) | ✓ |
| Wise checks (state/amount/currency/transferId dedup/time window; contacts proof structurally required, account content verified off-chain by VS) | [`WisePlatformVerifier.sol`](../../../tlsn-extension/packages/contracts/contracts/platforms/WisePlatformVerifier.sol) (`_verifyContacts:121-123`) | ✓ |
| On-chain JSON parsing library | [`lib/TLSNParserLib.sol`](../../../tlsn-extension/packages/contracts/contracts/lib/TLSNParserLib.sol) | ✓ |

### 3.5 Orders, escrow & state machine

| Thesis concept | Source location | Status |
|---|---|---|
| Order state set Q `{PENDING, WAITING, COMPLETED, EXPIRED}` | [`C2CTypes.sol:13-18`](../../../tlsn-extension/packages/contracts/contracts/C2CTypes.sol#L13-L18) | ✓ |
| Place order & escrow (CRYPTO initial PENDING / FIAT initial WAITING) | [`C2CEscrow.sol:446-589`](../../../tlsn-extension/packages/contracts/contracts/C2CEscrow.sol#L446-L589) `placeOrder` | ✓ |
| Merchant listing | [`C2CEscrow.sol:261-311`](../../../tlsn-extension/packages/contracts/contracts/C2CEscrow.sol#L261-L311) `listCryptoProduct`/`listFiatProduct` | ✓ |
| Buyer-pays (CRYPTO) verify & settle | [`C2CEscrow.sol:609-664`](../../../tlsn-extension/packages/contracts/contracts/C2CEscrow.sol#L609-L664) `payOrderByPlatform` | ✓ |
| Merchant-pays (FIAT) verify & settle | [`C2CEscrow.sol:670-737`](../../../tlsn-extension/packages/contracts/contracts/C2CEscrow.sol#L670-L737) `receiveCryptoWithPlatformPayment` | ✓ |
| `cancelOrder` disabled (reverts) | [`C2CEscrow.sol:601-603`](../../../tlsn-extension/packages/contracts/contracts/C2CEscrow.sol#L601-L603) | ✓ |
| Expiry cleanup (permissionless, anyone can call) | [`C2CEscrow.sol:889-908`](../../../tlsn-extension/packages/contracts/contracts/C2CEscrow.sol#L889-L908) `sweepExpired`/`sweepExpiredBatch` | ✓ |
| Fiat amount scaling (×1000) / rate precision 1e8 | [`C2CEscrow.sol:250-259`](../../../tlsn-extension/packages/contracts/contracts/C2CEscrow.sol#L250-L259) `_computeFiatAmountX1000`, [`:106`](../../../tlsn-extension/packages/contracts/contracts/C2CEscrow.sol#L106) `RATE_PRECISION_EXP` | ✓ |

### 3.6 Risk control, reputation & bonds

| Thesis concept | Source location | Status |
|---|---|---|
| Dynamic bond rate bps (rises with risk level) | [`C2CRiskManager.sol:31-40`](../../../tlsn-extension/packages/contracts/contracts/C2CRiskManager.sol#L31-L40) (params), [`:129-143`](../../../tlsn-extension/packages/contracts/contracts/C2CRiskManager.sol#L129-L143) `requiredBondBps` | ✓ |
| Bond amount = amount × bps / 1e4 | [`C2CEscrow.sol:505,539`](../../../tlsn-extension/packages/contracts/contracts/C2CEscrow.sol#L505) `Math.mulDiv` | ✓ |
| Reputation escalation / success reward / timeout slashing / freeze | [`C2CRiskManager.sol:160-193`](../../../tlsn-extension/packages/contracts/contracts/C2CRiskManager.sol#L160-L193) `onCompleted`/`onTimeout` | ✓ |
| Reputation decay over time | [`C2CRiskManager.sol:197-211`](../../../tlsn-extension/packages/contracts/contracts/C2CRiskManager.sol#L197-L211) `_effectiveRiskLevel`/`_applyDecay` | ✓ |
| Bond key orderKey (6-field isolation) | [`C2CEscrow.sol:431-440`](../../../tlsn-extension/packages/contracts/contracts/C2CEscrow.sol#L431-L440) `_orderKey` | ✓ |
| Bond-vault isolated custody + settlement | [`C2CBondVault.sol:67-111`](../../../tlsn-extension/packages/contracts/contracts/C2CBondVault.sol#L67-L111) `createOrderBond`/`settle` | ✓ |
| Bond pull withdrawal (claimable + sentinel gas optimization) | [`C2CBondVault.sol:120-144`](../../../tlsn-extension/packages/contracts/contracts/C2CBondVault.sol#L120-L144) `initClaimable`/`claim`/`_credit` | ✓ |

### 3.7 Replay protection (multi-layer)

| Thesis concept | Source location | Status |
|---|---|---|
| Session dedup (sessionId) | [`TLSNVerifier.sol:240-244`](../../../tlsn-extension/packages/contracts/contracts/TLSNVerifier.sol#L240-L244) `_checkAndMarkSessionId` | ✓ |
| Platform-tx dedup (orderId / transferId) | `AlipayPlatformVerifier.usedAlipayOrderIds`, `WisePlatformVerifier.usedTransferIds` | ✓ |
| Order binding inseparability (H_bind) | [`C2CEscrow.sol:381-425`](../../../tlsn-extension/packages/contracts/contracts/C2CEscrow.sol#L381-L425) | ✓ |
| Payment-time lower bound (prevents reuse of old transfers) | `orderCreationTime` check (see §3.4) | ✓ |

### 3.8 Off-chain ops (verifier server / keeper)

| Thesis concept | Source location | Status |
|---|---|---|
| Verifier server entry & session flow | [`verifier/src/main.rs`](../../../tlsn-extension/packages/verifier/src/main.rs), [`verifier/src/ws.rs`](../../../tlsn-extension/packages/verifier/src/ws.rs) | ✓ |
| Webhook (per-server config) | [`verifier/src/main.rs`](../../../tlsn-extension/packages/verifier/src/main.rs) | see verifier-plugin |
| Expiry-settlement keeper (no-privilege daemon) | [`keeper/src/index.ts`](../../../tlsn-extension/packages/keeper/src/index.ts), [`sweeper.ts`](../../../tlsn-extension/packages/keeper/src/sweeper.ts), [`eventListener.ts`](../../../tlsn-extension/packages/keeper/src/eventListener.ts), [`replay.ts`](../../../tlsn-extension/packages/keeper/src/replay.ts) | ✓ |

---

## 4. Key files reading guide

To understand the protocol fastest, read the source in this order:

1. **[`C2CTypes.sol`](../../../tlsn-extension/packages/contracts/contracts/C2CTypes.sol)** — start with types & errors: `OrderStatus`, `TLSNProof`, binding/payment-info structs. Grasp the data model at a glance.
2. **[`C2CEscrow.sol`](../../../tlsn-extension/packages/contracts/contracts/C2CEscrow.sol)** — the protocol backbone. Focus: `placeOrder` (dual-protocol branches & two-sided bonds, :446-589), `_computeOrderBindingHash` (Innovation ①, :381-413), `payOrderByPlatform`/`receiveCryptoWithPlatformPayment` (settle after verification).
3. **[`TLSNVerifier.sol`](../../../tlsn-extension/packages/contracts/contracts/TLSNVerifier.sol)** — how a proof becomes trusted on-chain: `verifyAndDelegate` (:196-223) → `_verifyTLSNProof` (:229-238) → commitment checks & signature recovery (:246-285).
4. **[`platforms/*.sol`](../../../tlsn-extension/packages/contracts/contracts/platforms/)** — platform business rules. Wise `_verifyContacts` is an empty function; account verification is done off-chain by the VS.
5. **[`verifier/src/main.rs`](../../../tlsn-extension/packages/verifier/src/main.rs)** — the off-chain mirror: `accountCheck` (:1366-1422) and `sign_commitments` (:2064-2111). Read it alongside `TLSNVerifier._recoverVerifierSigner` to see how off-chain and on-chain interlock.
6. **[`plugin-sdk/src/index.ts`](../../../tlsn-extension/packages/plugin-sdk/src/index.ts)** — how plugins run in the QuickJS sandbox and how `prove()` is injected (:455-463 sandbox config, :668 prove).
7. **[`keeper/src/index.ts`](../../../tlsn-extension/packages/keeper/src/index.ts)** — off-chain daemon lifecycle; see `sweeper.ts` for replace-by-fee retry & gas cap.

**Deployment artifacts**: local chain chainId=31337, deploy scripts in [`packages/contracts/scripts/`](../../../tlsn-extension/packages/contracts/scripts/) (`deploy-web.ts`/`deploy-local.ts` etc.); addresses written to [`deployments/web-31337.json`](../../../tlsn-extension/packages/contracts/deployments/web-31337.json), `demo-31337.json`. **Deployment order follows the script** (see [contracts.md](contracts.md)).

---

## 5. Reading routes

| Your goal | Recommended route |
|---|---|
| Run the local minimal loop | [hands-on/01-quickstart.md](../hands-on/01-quickstart.md) → this page §4 |
| Understand the design & innovations | [deep-dive/01-overview.md](../deep-dive/01-overview.md) → [04-protocol-design.md](../deep-dive/04-protocol-design.md) → this page §3 |
| Check the security argument | [deep-dive/03-threat-model.md](../deep-dive/03-threat-model.md) → [05-security-analysis.md](../deep-dive/05-security-analysis.md) → this page §3.3/§3.7 |
| Modify contracts / add a payment platform | [contracts.md](contracts.md) + [verifier-plugin.md](verifier-plugin.md) |
| Re-check the experimental data | [deep-dive/06-evaluation.md](../deep-dive/06-evaluation.md) |

> Stuck on a term? See [glossary.md](glossary.md).
