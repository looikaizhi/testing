# Demo Walkthrough: the Full Exchange Flow

> **Purpose**: walk through one complete exchange in the author's real environment as a reference (most readers cannot reproduce a real Alipay/Wise payment).
> **Audience**: hands-on track.
> **Sources**: contract functions/events (`packages/contracts`) + deployment seed data ([deploy-web.ts](../../../tlsn-extension/packages/contracts/scripts/deploy-web.ts)).

> ⚠️ **Verification status**: the **contract functions and events** in this page are cross-checked against the source; **screenshots/recordings are placeholders** (`docs/assets/screenshots/`, `docs/assets/demo/`, to be captured by the author in the real environment). The full real exchange flow needs a real Alipay/Wise account and cannot be reproduced in an automated environment.

---

## Scenario

Deploy-script seed data ([deploy-web.ts:638-661](../../../tlsn-extension/packages/contracts/scripts/deploy-web.ts#L638-L661)): 1 merchant (Hardhat account[1]), 4 products:

| Product | Type | Fiat | Crypto | Platform | Rate |
|---|---|---|---|---|---|
| CRYPTO #0 | buyer pays fiat, gets crypto | MYR | USDT | Wise | 0.02 MYR/USDT |
| CRYPTO #1 | buyer pays fiat, gets crypto | CNY | USDT | Alipay | 0.01 CNY/USDT |
| FIAT #0 | buyer locks crypto, merchant pays fiat | MYR | USDT | Wise | — |
| FIAT #1 | buyer locks crypto, merchant pays fiat | CNY | USDT | Alipay | — |

Below we walk through the five steps using **CRYPTO #1 (Alipay; buyer pays CNY, gets USDT)**.

---

## ① Admin configuration

Done automatically by the deploy script (in production, done by the admin manually): register crypto/fiat assets, register the merchant, add trusted verifiers & payment servers, register platform verifiers.

| What it does | Contract function | Event |
|---|---|---|
| Register supported crypto/fiat assets | `C2CAdmin.addCryptoInfo`/`addFiatInfo` ([:128](../../../tlsn-extension/packages/contracts/contracts/C2CAdmin.sol#L128)/[:143](../../../tlsn-extension/packages/contracts/contracts/C2CAdmin.sol#L143)) | `SupportCryptoAdded`/`SupportFiatAdded` |
| Trust verifier/payment server | `TLSNVerifier.addTrustedVerifier`/`addTrustedPaymentServer` ([:119](../../../tlsn-extension/packages/contracts/contracts/TLSNVerifier.sol#L119)/[:139](../../../tlsn-extension/packages/contracts/contracts/TLSNVerifier.sol#L139)) | `TrustedVerifierAdded`/`TrustedPaymentServerAdded` |
| Register platform verifier | `TLSNVerifier.setPlatformVerifier` ([:154](../../../tlsn-extension/packages/contracts/contracts/TLSNVerifier.sol#L154)) | `PlatformVerifierSet` |

> Default trusted payment servers: `wise.com`, `mbillexprod.alipay.com` ([deploy-web.ts:406](../../../tlsn-extension/packages/contracts/scripts/deploy-web.ts#L406)).
> Screenshot placeholder: `docs/assets/screenshots/01-admin-console.png`

## ② Merchant onboarding & listing

| What it does | Contract function | Event |
|---|---|---|
| Merchant registration (requires KYB) | `C2CAdmin.registerMerchant` (KYB proof) / `registerMerchantByAdmin` | `MerchantRegistered` |
| Bind payment account (stores only the hash commitment) | `C2CAdmin.setPlatformBinding` ([:264](../../../tlsn-extension/packages/contracts/contracts/C2CAdmin.sol#L264)) | `PlatformBindingSet` |
| List product | `C2CEscrow.listCryptoProduct`/`listFiatProduct` ([:261](../../../tlsn-extension/packages/contracts/contracts/C2CEscrow.sol#L261)/[:287](../../../tlsn-extension/packages/contracts/contracts/C2CEscrow.sol#L287)) | `ProductListed` |
| Publish rate (×1e8 encoded) | `C2CAdmin.publishRate` ([:308](../../../tlsn-extension/packages/contracts/contracts/C2CAdmin.sol#L308)) | `RatePublished` |
| Open for business | `C2CAdmin.openNow` ([:343](../../../tlsn-extension/packages/contracts/contracts/C2CAdmin.sol#L343)) | `ManualOverrideSet` |

> The account binding on-chain is `nameHash`/`idHash` (keccak256 commitments); plaintext + random salt live in the off-chain DB. For Alipay, because the proof reveals only the **masked** identity, the binding commits over the masked value. See [deep-dive/05 §4](../deep-dive/05-security-analysis.md).
> Screenshot placeholder: `docs/assets/screenshots/02-merchant-listing.png`

## ③ Buyer places order & locks on-chain

| What it does | Contract function | Event |
|---|---|---|
| Buyer binds their own payee account | `C2CAdmin.setPlatformBinding` | `PlatformBindingSet` |
| Place order + two-layer lock | `C2CEscrow.placeOrder` ([:446](../../../tlsn-extension/packages/contracts/contracts/C2CEscrow.sol#L446)) | `OrderPlaced` + `OrderStatusChanged` |

Inside `placeOrder` (CRYPTO branch): query `requiredBondBps` → buyer pays bond into BondVault ([:503-528](../../../tlsn-extension/packages/contracts/contracts/C2CEscrow.sol#L503-L528)) → mark `pendingAmount` on the merchant's collateral → compute the 15-field `H_bind` ([:381-413](../../../tlsn-extension/packages/contracts/contracts/C2CEscrow.sol#L381-L413)) → order initial state **PENDING**, deadline = now + 15 minutes.

> Pre-checks: self-trade forbidden `SelfTradeNotAllowed`, buyer must bind a payment account first `BuyerBindingNotSet`, per-order USD cap `ExceedsUsdCap`, business hours `MerchantClosed`.
> Screenshot placeholder: `docs/assets/screenshots/03-place-order.png`

## ④ Real payment + proof generation

| What it does | Component |
|---|---|
| Buyer transfers CNY to the merchant's payee account in Alipay | real payment platform |
| Extension starts notarization: MPC-TLS captures the Alipay order API response | extension + `plugin-sdk`'s `prove()` |
| VS verifies the account off-chain (accountCheck) + signs (incl. H_bind) | [`verifier`](../../../tlsn-extension/packages/verifier/) |

The output = the proof tuple `π = (σ_VS, {cᵢ}, H_bind, sid)`. For the principles, see [deep-dive/02-zktls-tlsnotary.md](../deep-dive/02-zktls-tlsnotary.md).
> Recording placeholder: `docs/assets/demo/04-proof-generation.gif`

## ⑤ On-chain verification & settlement

| What it does | Contract function | Event |
|---|---|---|
| Buyer submits the proof; release crypto after on-chain verification | `C2CEscrow.payOrderByPlatform` ([:609](../../../tlsn-extension/packages/contracts/contracts/C2CEscrow.sol#L609)) | `OrderStatusChanged`(COMPLETED) + `OrderProofLinked` |

Internally: `verifyAndDelegate` (five-step cryptographic verification + delegate the business check to the Alipay verifier) → on success, release USDT to the buyer, refund the buyer's bond (pull, needs `claim()`), notify RiskManager `onCompleted`.

> The FIAT product is symmetric: the merchant pays fiat → `receiveCryptoWithPlatformPayment` ([:670](../../../tlsn-extension/packages/contracts/contracts/C2CEscrow.sol#L670)).
> If the buyer times out without submitting a proof → anyone can `sweepExpired*` to clean up → state EXPIRED, bond goes to the merchant.
> Screenshot placeholder: `docs/assets/screenshots/05-settlement.png`

---

> For the design principles behind each step, see [deep-dive/04-protocol-design.md](../deep-dive/04-protocol-design.md); for contract interfaces, see [reference/contracts.md](../reference/contracts.md); if stuck, see [03-troubleshooting.md](03-troubleshooting.md).
