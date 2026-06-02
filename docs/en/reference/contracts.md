# Contracts Quick Reference

> **Purpose**: a cheat-sheet for anyone reading or modifying the contracts — dependencies, key functions/events/permissions per contract, the order state machine, deployment order.
> **Audience**: developers. Read [code-map.md](code-map.md) first for the big picture, then use this page to look up interfaces.
> Contract source is in [`tlsn-extension/packages/contracts/contracts/`](../../../tlsn-extension/packages/contracts/contracts/), Solidity **0.8.28**, EVM cancun. All facts follow the source.

---

## 1. Contract dependencies

After deployment, contracts are wired via constructor args and setters (arrows = reference/call direction):

```
                     ┌──────────────┐
                     │ TLSNVerifier │  proof verification + platform-verifier registry
                     └──────┬───────┘
            ┌───────────────┼────────────────────┐
            │ (verify)       │ (register)          │ (verify)
   ┌────────┴───────┐  ┌────┴───────────────┐  ┌─┴──────────────┐
   │   C2CAdmin     │  │ platforms/*Verifier│  │   C2CEscrow    │
   │ assets/merchant│  │ Alipay / Wise      │  │  main order    │
   │ /bindings      │  │                    │  │  contract      │
   └────────┬───────┘  └────────────────────┘  └─┬───────┬──────┘
            │ (read config)                       │       │ (call)
            └─────────────────────────────────────┘       │
                            ┌────────────────────┬─────────┘
                   ┌────────┴───────┐   ┌────────┴────────┐
                   │ C2CRiskManager │   │  C2CBondVault   │
                   │ bond rate/rep  │   │ bond custody/   │
                   │                │   │ settlement      │
                   └────────────────┘   └─────────────────┘
```

- `C2CEscrow` is the protocol backbone, holding references to `C2CAdmin`/`TLSNVerifier`/`C2CRiskManager`/`C2CBondVault` ([C2CEscrow.sol:36-39](../../../tlsn-extension/packages/contracts/contracts/C2CEscrow.sol#L36-L39)).
- `TLSNVerifier` holds platform verifiers via the `platformVerifiers` registry; adding a platform **requires no change to any deployed contract**.
- `C2CRiskManager` and `C2CBondVault` only accept calls from `escrow` (`onlyEscrow`) and support two-step escrow migration.

---

## 2. Key interfaces per contract

### 2.1 `C2CEscrow` (main order contract)

Source: [C2CEscrow.sol](../../../tlsn-extension/packages/contracts/contracts/C2CEscrow.sol)

**External functions**

| Function | Line | Permission | Description |
|---|---|---|---|
| `listCryptoProduct` / `listFiatProduct` | [:261](../../../tlsn-extension/packages/contracts/contracts/C2CEscrow.sol#L261) / [:287](../../../tlsn-extension/packages/contracts/contracts/C2CEscrow.sol#L287) | `onlyMerchant` | Merchant lists a CRYPTO/FIAT product (with collateral, platform ID) |
| `placeOrder` | [:446](../../../tlsn-extension/packages/contracts/contracts/C2CEscrow.sol#L446) | any buyer | Place order & escrow + compute and lock two-sided bond; CRYPTO initial `PENDING`, FIAT initial `WAITING` |
| `payOrderByPlatform` | [:609](../../../tlsn-extension/packages/contracts/contracts/C2CEscrow.sol#L609) | `onlyAuthorized` flow | CRYPTO buyer-payment proof verification → release crypto, refund buyer bond |
| `receiveCryptoWithPlatformPayment` | [:670](../../../tlsn-extension/packages/contracts/contracts/C2CEscrow.sol#L670) | flow | FIAT merchant-payment proof verification → release crypto, refund merchant bond |
| `sweepExpired` / `sweepExpiredBatch` | [:889](../../../tlsn-extension/packages/contracts/contracts/C2CEscrow.sol#L889) / [:904](../../../tlsn-extension/packages/contracts/contracts/C2CEscrow.sol#L904) | **anyone** (permissionless) | Clean up expired orders → `EXPIRED`, bond goes to counterparty |
| `cleanupProductExpired` | [:591](../../../tlsn-extension/packages/contracts/contracts/C2CEscrow.sol#L591) | any | Bounded per-product cleanup |
| `cancelOrder` | [:601](../../../tlsn-extension/packages/contracts/contracts/C2CEscrow.sol#L601) | — | **Disabled**, reverts with `OrderCancellationDisabled` |

> 💡 `sweepExpired*` are in the "Public Sweep (anyone-callable)" section with only `whenNotPaused nonReentrant` and **no permission modifier** — anyone can trigger expiry cleanup. The off-chain [keeper](../../../tlsn-extension/packages/keeper/) is merely a convenience and holds no privilege. This is part of the decentralization argument (see [03-threat-model.md](../deep-dive/03-threat-model.md)).

**Key internal logic**

| Function | Line | Description |
|---|---|---|
| `_computeOrderBindingHash` | [:381-413](../../../tlsn-extension/packages/contracts/contracts/C2CEscrow.sol#L381-L413) | **Innovation ①**: 15-field keccak256 → H_bind |
| `_requireOrderBinding` | [:423-425](../../../tlsn-extension/packages/contracts/contracts/C2CEscrow.sol#L423-L425) | Forces each proof to bind to this order |
| `_orderKey` | [:431-440](../../../tlsn-extension/packages/contracts/contracts/C2CEscrow.sol#L431-L440) | 6-field bond isolation key |
| `_computeFiatAmountX1000` | [:250-259](../../../tlsn-extension/packages/contracts/contracts/C2CEscrow.sol#L250-L259) | Fiat amount ×1000; rate precision `RATE_PRECISION_EXP=8` |

> 💡 The `paramsData` built during verification has 4 fields (incl. `orderCreationTime = deadline - ORDER_TIMEOUT`, [:633-637](../../../tlsn-extension/packages/contracts/contracts/C2CEscrow.sol#L633-L637)); the payment time must fall within the `[creationTime, deadline]` window, preventing reuse of old/expired transfers.

**Events**: `ProductListed`([:114](../../../tlsn-extension/packages/contracts/contracts/C2CEscrow.sol#L114)), `ProductStatusChanged`, `ProductCollateralChanged`, `OrderPlaced`([:138](../../../tlsn-extension/packages/contracts/contracts/C2CEscrow.sol#L138)), `BuyerPaymentInfoSet`, `OrderStatusChanged`([:156](../../../tlsn-extension/packages/contracts/contracts/C2CEscrow.sol#L156)), `BuyerEscrowDeposited`, `OrderProofLinked`, `Paused`/`Unpaused`, `ExpiredSwept`([:183](../../../tlsn-extension/packages/contracts/contracts/C2CEscrow.sol#L183)).

**Key constants** ([:102-106](../../../tlsn-extension/packages/contracts/contracts/C2CEscrow.sol#L102-L106)): `MAX_PENDING_ORDERS=200`, `MAX_SWEEP_BATCH=20`, `ORDER_TIMEOUT=15 minutes`, `RATE_PRECISION_EXP=8`.

**Modifiers**: `onlyMerchant`([:195](../../../tlsn-extension/packages/contracts/contracts/C2CEscrow.sol#L195)), `whenNotPaused`([:200](../../../tlsn-extension/packages/contracts/contracts/C2CEscrow.sol#L200)), `nonReentrant` (OZ).

### 2.2 `TLSNVerifier` (proof verification + platform registry)

Source: [TLSNVerifier.sol](../../../tlsn-extension/packages/contracts/contracts/TLSNVerifier.sol)

| Function | Line | Permission | Description |
|---|---|---|---|
| `verifyProof` | [:164](../../../tlsn-extension/packages/contracts/contracts/TLSNVerifier.sol#L164) | `onlyAuthorized` | Cryptographic proof verification only |
| `verifyKYB` | [:168](../../../tlsn-extension/packages/contracts/contracts/TLSNVerifier.sol#L168) | `onlyAuthorized` | Verification + match KYB "verified" |
| `verifyAndDelegate` | [:196-223](../../../tlsn-extension/packages/contracts/contracts/TLSNVerifier.sol#L196-L223) | `onlyAuthorized` | **Unified delegation entry**: verify each proof → look up registry → delegate to platform verifier |
| `setPlatformVerifier` | [:154](../../../tlsn-extension/packages/contracts/contracts/TLSNVerifier.sol#L154) | `onlyAdmin` | Register/update a platform verifier (core of extensibility) |
| `addTrustedVerifier` / `add/removeTrusted{KYB,Payment}Server` | [:119-147](../../../tlsn-extension/packages/contracts/contracts/TLSNVerifier.sol#L119-L147) | `onlyAdmin` | Maintain trust lists |
| `setAuthorizedCaller` | [:114](../../../tlsn-extension/packages/contracts/contracts/TLSNVerifier.sol#L114) | `onlyAdmin` | Authorize Admin/Escrow callers |
| `proposeAdmin` / `acceptAdmin` | [:101](../../../tlsn-extension/packages/contracts/contracts/TLSNVerifier.sol#L101) / [:107](../../../tlsn-extension/packages/contracts/contracts/TLSNVerifier.sol#L107) | two-step | Admin transfer |

**Verification internals**: `_verifyTLSNProof`([:229](../../../tlsn-extension/packages/contracts/contracts/TLSNVerifier.sol#L229)) → `_checkAndMarkSessionId` (session dedup) + `_verifyCommitmentOpenings`/`_verifyCommitmentsHash` (commitment checks) + `_recoverVerifierSigner` ([:272-285](../../../tlsn-extension/packages/contracts/contracts/TLSNVerifier.sol#L272-L285), recover signer and check `trustedVerifiers`).

**Registry / trust lists**: `trustedVerifiers`, `trustedKYBServers`, `trustedPaymentServers`, `platformVerifiers`, `usedSessionIds` ([:41-50](../../../tlsn-extension/packages/contracts/contracts/TLSNVerifier.sol#L41-L50)); built-in platform IDs `PLATFORM_WISE`/`PLATFORM_ALIPAY`.

### 2.3 `C2CRiskManager` (dynamic bond + reputation)

Source: [C2CRiskManager.sol](../../../tlsn-extension/packages/contracts/contracts/C2CRiskManager.sol)

**Default parameters** ([:31-40](../../../tlsn-extension/packages/contracts/contracts/C2CRiskManager.sol#L31-L40), adjustable by admin via `setRiskConfig`):

| Parameter | Default | Meaning |
|---|---|---|
| `minBondBps` | 500 | Bond rate floor 5% (after loyalty discount) |
| `baseBondBps` | 1000 | Base bond rate 10% |
| `maxBondBps` | 10000 | Cap 100% |
| `stepBps` | 300 | +3% per risk level |
| `maxRiskLevel` | 10 | Risk level cap |
| `resetThreshold` | 3 | Consecutive completions to reset the consecutive-timeout counter |
| `freezeThreshold` | 15 | Cumulative timeouts that trigger a freeze |
| `freezeDays` | 30 | Freeze days |
| `rewardCompletedThreshold` | 10 | Completions at which, with zero risk, the rate drops to the floor |
| `decayIntervalDays` | 90 | Risk-level decay interval |

> 💡 At L=10, `raw = 1000 + 10×300 = 4000 bps = 40%` (does not hit the 100% cap; the cap is an adjustable extreme value).
> Note: the demo deploy script [`deploy-web.ts`](../../../tlsn-extension/packages/contracts/scripts/deploy-web.ts#L393-L403) overrides `freeze=3, decay=1` etc. with demo values — those are deploy-time config, not contract defaults.

| Function | Line | Permission | Description |
|---|---|---|---|
| `requiredBondBps(user)` | [:129](../../../tlsn-extension/packages/contracts/contracts/C2CRiskManager.sol#L129) | view | Returns the current bond rate (reverts if blacklisted/frozen) |
| `onCompleted` / `onTimeout` | [:160](../../../tlsn-extension/packages/contracts/contracts/C2CRiskManager.sol#L160) / [:172](../../../tlsn-extension/packages/contracts/contracts/C2CRiskManager.sol#L172) | `onlyEscrow` | Downgrade on success / escalate on timeout (consecutive timeouts add +1/+2/+3), freeze at threshold |
| `setRiskConfig` | [:86](../../../tlsn-extension/packages/contracts/contracts/C2CRiskManager.sol#L86) | `onlyAdmin` | Adjust parameters |
| `setBlacklist` / `manualUnfreeze` | [:116](../../../tlsn-extension/packages/contracts/contracts/C2CRiskManager.sol#L116) / [:121](../../../tlsn-extension/packages/contracts/contracts/C2CRiskManager.sol#L121) | `onlyAdmin` | Blacklist / manual unfreeze |
| `initReputation` | [:110](../../../tlsn-extension/packages/contracts/contracts/C2CRiskManager.sol#L110) | any | Warm up the storage slot to save gas (writes `initialized`) |

### 2.4 `C2CBondVault` (bond vault)

Source: [C2CBondVault.sol](../../../tlsn-extension/packages/contracts/contracts/C2CBondVault.sol)

| Function | Line | Permission | Description |
|---|---|---|---|
| `createOrderBond` | [:67](../../../tlsn-extension/packages/contracts/contracts/C2CBondVault.sol#L67) | `onlyEscrow` | Record a bond isolated by orderKey |
| `settle(orderKey, stype)` | [:84](../../../tlsn-extension/packages/contracts/contracts/C2CBondVault.sol#L84) | `onlyEscrow` | Settle: `PROOF_SUCCESS` → refund prover, else → counterparty |
| `settle(orderKey, stype, proverExtra, counterpartExtra)` | [:96](../../../tlsn-extension/packages/contracts/contracts/C2CBondVault.sol#L96) | `onlyEscrow` | Settlement overload with extra allocation |
| `claim(token)` | [:126](../../../tlsn-extension/packages/contracts/contracts/C2CBondVault.sol#L126) | any | **Pull-withdraw** a settled bond |
| `claimableBalance` / `initClaimable` | [:135](../../../tlsn-extension/packages/contracts/contracts/C2CBondVault.sol#L135) / [:120](../../../tlsn-extension/packages/contracts/contracts/C2CBondVault.sol#L120) | view / any | Query claimable / warm up the sentinel slot to save gas |

> 💡 Settlement is **pull-mode** — the bond is `_credit`ed to `_claimable` first, and the user must call `claim()` to withdraw; `initClaimable` writes sentinel value 1 to keep the storage slot warm (cold write 20000 gas → warm write 2900 gas).

### 2.5 `C2CAdmin` (config hub)

Source: [C2CAdmin.sol](../../../tlsn-extension/packages/contracts/contracts/C2CAdmin.sol)

| Function | Line | Permission | Description |
|---|---|---|---|
| `addCryptoInfo` / `addFiatInfo` | [:128](../../../tlsn-extension/packages/contracts/contracts/C2CAdmin.sol#L128) / [:143](../../../tlsn-extension/packages/contracts/contracts/C2CAdmin.sol#L143) | `onlyAdmin` | Register supported crypto/fiat assets |
| `activateAsset` / `deactivateAsset` | [:156](../../../tlsn-extension/packages/contracts/contracts/C2CAdmin.sol#L156) / [:169](../../../tlsn-extension/packages/contracts/contracts/C2CAdmin.sol#L169) | `onlyAdmin` | Enable/disable assets |
| `registerMerchant` / `registerMerchantByAdmin` | [:221](../../../tlsn-extension/packages/contracts/contracts/C2CAdmin.sol#L221) / [:234](../../../tlsn-extension/packages/contracts/contracts/C2CAdmin.sol#L234) | KYB proof / `onlyAdmin` | Merchant onboarding (requires KYB) |
| `setPlatformBinding` | [:264](../../../tlsn-extension/packages/contracts/contracts/C2CAdmin.sol#L264) | any wallet | Bind a payment account: **stores only keccak256(name)/(id) commitments**, plaintext+salt held in the server DB |
| `publishRate` | [:308](../../../tlsn-extension/packages/contracts/contracts/C2CAdmin.sol#L308) | merchant | Publish rate (×1e8 encoded, versioned) |
| `setBusinessHours` / `openNow` / `closeNow` / `clearManualOverride` | [:325](../../../tlsn-extension/packages/contracts/contracts/C2CAdmin.sol#L325)+ | merchant | Business hours and manual toggles |
| `setMaxOrderAmount` | [:394](../../../tlsn-extension/packages/contracts/contracts/C2CAdmin.sol#L394) | `onlyAdmin` | Per-order cap, default `1000 × 1e18` (18-decimal normalized, equals 1000 whole tokens) |

> Account privacy: `setPlatformBinding` writes the `nameHash`/`idHash` commitments on-chain ([:264-278](../../../tlsn-extension/packages/contracts/contracts/C2CAdmin.sol#L264-L278)); plaintext and random salt live only in the off-chain database. For Alipay, because the proof reveals the **masked** payee identity, the binding commits over the **masked value** (see [`deploy-web.ts:44-61`](../../../tlsn-extension/packages/contracts/scripts/deploy-web.ts#L44-L61)). See [05-security-analysis.md](../deep-dive/05-security-analysis.md).

---

## 3. Order state machine

State set `Q = {PENDING, WAITING, COMPLETED, EXPIRED}` ([C2CTypes.sol:13-18](../../../tlsn-extension/packages/contracts/contracts/C2CTypes.sol#L13-L18)). No `CANCELLED`/`DISPUTED`; `cancelOrder` is disabled.

| From | Trigger | To | Function |
|---|---|---|---|
| — | Buyer places order (CRYPTO, buyer pays) | `PENDING` | `placeOrder` (:516) |
| — | Buyer places order (FIAT, merchant pays) | `WAITING` | `placeOrder` (:573) |
| `PENDING` | Buyer payment proof verified | `COMPLETED` | `payOrderByPlatform` |
| `WAITING` | Merchant payment proof verified | `COMPLETED` | `receiveCryptoWithPlatformPayment` |
| `PENDING`/`WAITING` | Past `deadline` (15 minutes) | `EXPIRED` | `sweepExpired*` / `cleanupProductExpired` (anyone can call) |

> Full transitions and bond ownership are in [04-protocol-design.md](../deep-dive/04-protocol-design.md).

---

## 4. Deployment order & addresses

**Deployment order follows the script** ([`scripts/deploy-web.ts`](../../../tlsn-extension/packages/contracts/scripts/deploy-web.ts), **not** `CONTRACT_STRUCTURE Appendix A`). Local chain chainId=`31337`.

1. `MockERC20` test tokens (USDT/USDC, driven by `assets.json`)
2. `TLSNVerifier` (no constructor args; deployer is admin)
3. `C2CAdmin(tlsnVerifier)`
4. `C2CEscrow(c2cAdmin, tlsnVerifier)`
5. `C2CBondVault(c2cAdmin)`
6. `C2CRiskManager(c2cAdmin)`
7. `WisePlatformVerifier(tlsnVerifier)`, `AlipayPlatformVerifier(tlsnVerifier)`
8. **Cross-contract wiring**: `tlsnVerifier.setAuthorizedCaller(admin/escrow)`, `c2cAdmin.setAuthorizedCaller(escrow)`, `bondVault.setEscrow(escrow)`, `riskManager.setEscrow(escrow)`, `escrow.setManagers(riskManager, bondVault)`
9. `addTrustedVerifier(signerAddress)`
10. `addTrustedKYBServer` / `addTrustedPaymentServer` (defaults `wise.com`, `mbillexprod.alipay.com`)
11. `setPlatformVerifier(PLATFORM_WISE / PLATFORM_ALIPAY)`

Addresses are written to [`deployments/web-31337.json`](../../../tlsn-extension/packages/contracts/deployments/web-31337.json) (the keeper and frontend read addresses and `deploymentBlock` from here) and `packages/web/.env.local`.

> For a live deployment run, see [hands-on/01-quickstart.md](../hands-on/01-quickstart.md). To add a new payment platform, see [verifier-plugin.md](verifier-plugin.md).
