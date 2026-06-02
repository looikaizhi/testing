# Security Analysis

> [!NOTE]
> **Reading guide**
> - **Purpose**: argue how the system achieves the five security goals S1–S5, and analyze economic security and the key trade-offs.
> - **Audience**: deep-dive track. Prerequisites: [03-threat-model.md](03-threat-model.md) (threats & trust assumptions T1–T5), [04-protocol-design.md](04-protocol-design.md) (mechanisms).
> - **Thesis source**: ch4.7, ch4.8. All facts follow the source.

**Contents**: [Three-layer mapping](#1-three-layer-mapping-security-goals--trust-assumptions--protocol-mechanisms) · [S1 unforgeability](#2-s1--payment-proof-unforgeability) · [S2 replay resistance](#3-s2--replay-resistance) · [S3 account privacy](#4-s3--account-privacy-protection) · [S4 trust minimization](#5-s4--verifier-node-trust-minimization) · [S5 plugin isolation](#6-s5--plugin-execution-isolation) · [Economic security](#7-economic-security-beyond-s1s5) · [Key trade-offs](#8-key-trade-offs)

---

## 1. Three-layer mapping: security goals ↔ trust assumptions ↔ protocol mechanisms

Security relies not on a single mechanism but on the contract, proof, and verification layers working together (thesis ch4.7.1). Each goal depends on a **minimal subset of trust assumptions**:

| Goal | Meaning | Depends on | Core mechanism | Code evidence |
|---|---|---|---|---|
| **S1** | Payment-proof unforgeability | T1∧T2∧T3∧T4 | TLS authenticity + selective-disclosure integrity + order-binding inseparability | `_recoverVerifierSigner`, `_verifyCommitment*`, `_requireOrderBinding` |
| **S2** | Replay resistance | T1 | H_bind cross-order binding + session dedup U_sess | `_checkAndMarkSessionId` + `_computeOrderBindingHash` |
| **S3** | Account privacy | T2∧T4 | On-chain hash commitment + off-chain Pedersen/MPC consistency check | `PlatformBinding` (hash) + off-chain accountCheck |
| **S4** | Verifier-node trust minimization | T1∧T2∧T3 | Asset-irrelevance + registration enforcement + order-binding enforcement + MPC constraint | `trustedVerifiers` + five-step pipeline |
| **S5** | Plugin execution isolation | T5 | QuickJS WASM sandbox capability limits | `plugin-sdk` sandbox config |

> [!NOTE]
> The definitions of T1 (chain consensus) / T2 (cryptography) / T3 (VS honest-but-curious in MPC-TLS) / T4 (account-identifier semantic truth) / T5 (user device not root-compromised) are in [03-threat-model.md](03-threat-model.md).

---

## 2. S1 — payment-proof unforgeability

**Holds under T1∧T2∧T3∧T4** (thesis ch4.8.1). Three progressive constraint layers:

1. **TLS transmission authenticity (T2)**: MPC-TLS requires the VS and the payment platform PP to jointly establish a TLS session; the symmetric key is jointly derived and neither side alone holds the full key → an attacker cannot make the VS produce a valid commitment over a forged response without a real connection to PP. Off-chain logic in [verifier/src/verifier.rs](../../../tlsn-extension/packages/verifier/src/verifier.rs).
2. **Selective-disclosure integrity (T2)**: the VS signature covers the commitment set `{cᵢ}`, each `cᵢ` a commitment over a response byte range; tampering with a commitment invalidates the signature. On-chain checks [`_verifyCommitmentOpenings`/`_verifyCommitmentsHash`, TLSNVerifier.sol:246-270](../../../tlsn-extension/packages/contracts/contracts/TLSNVerifier.sol#L246-L270).
3. **Order-binding inseparability (T2)**: the signature digest embeds `H_bind` (see [04 §6.2](04-protocol-design.md)); an attacker cannot construct a valid signature for an order with inconsistent parameters.

On-chain, [`verifyAndDelegate`](../../../tlsn-extension/packages/contracts/contracts/TLSNVerifier.sol#L196-L223) performs, in order: ECDSA signer verification ([`_recoverVerifierSigner`:272-285](../../../tlsn-extension/packages/contracts/contracts/TLSNVerifier.sol#L272-L285), checking `trustedVerifiers`), H_bind consistency, and platform business checks. Under T1∧T2∧T3 the probability that a forged proof passes all checks reduces to solving a cryptographic hardness problem, negligible for a PPT attacker.

> [!NOTE]
> Cryptographic unforgeability only guarantees "the proof content = what PP actually returned"; the **semantic truth** of the payment fact further relies on T4. Test evidence: `ESC-ATT-01/05` (wrong H_bind / tampered signature), `ESC-TAMPER-01/02` all revert as expected.

---

## 3. S2 — replay resistance

**Holds under T1** (thesis ch4.8.2). Two **orthogonal** mechanisms:

- **Cross-order replay protection**: the signature digest binds `H_bind`, which includes `orderId`; a proof for O₁ submitted to O₂ is rejected on H_bind mismatch.
- **Same-order resubmission protection**: the chain maintains a used-session set `U_sess`; `sid` is written after first verification ([`_checkAndMarkSessionId`, TLSNVerifier.sol:240-244](../../../tlsn-extension/packages/contracts/contracts/TLSNVerifier.sol#L240-L244)), and resubmission fails the membership check.

In addition there is a third dedup layer at the platform level (`usedAlipayOrderIds`/`usedTransferIds`) and the paramsData payment-time lower bound (prevents reuse of old transfers). Test evidence: `ESC-ATT-04` (replay sessionId), `WISE-ATT-01`/`ALI-ATT-01` (cross-order txId replay), `INT-10` (cross-platform sessionId reuse) all rejected.

---

## 4. S3 — account privacy protection

**Holds under T2∧T4** (thesis ch4.8.3). Three layers:

1. **On-chain**: the contract stores only the keccak256 commitment of the account identifier ([`setPlatformBinding`, C2CAdmin.sol:264-278](../../../tlsn-extension/packages/contracts/contracts/C2CAdmin.sol#L264-L278); `PlatformBinding`/`BuyerPaymentInfo` structs); no plaintext on-chain.
2. **Notarization proof**: the account-identifier field is Pedersen-committed; the raw identifier lives only locally and in the VS's MPC environment.
3. **Protocol execution**: the payer/payee account-consistency check is done in the MPC environment (off-chain accountCheck, [verifier/src/main.rs:1366-1422](../../../tlsn-extension/packages/verifier/src/main.rs#L1366-L1422)); the chain only verifies commitment consistency.

> [!TIP]
> Account-identity matching is done by the **off-chain VS** (thesis ch4.4.2/S3); the on-chain platform verifier does not compare accounts — this is intentional: there is currently no way to verify identity on-chain without leaking privacy, and the on-chain account-check entry is reserved for a future fully-decentralized phase. See [04 §7](04-protocol-design.md).

> [!IMPORTANT]
> **Privacy limitation (thesis ch6.5)**: account commitments are currently **unsalted** keccak256, so an attacker holding a candidate account set can enumerate matches in batch, degrading the hiding strength to a function of the candidate-space size. Improvement direction: a per-order derived salt `H(accountId ‖ orderId ‖ chainId)`. Also: in the demo deployment, because the Alipay proof reveals only the **masked** identity, the binding commits over the masked value ([deploy-web.ts:44-61](../../../tlsn-extension/packages/contracts/scripts/deploy-web.ts#L44-L61)).

---

## 5. S4 — verifier-node trust minimization

**Holds under T1∧T2∧T3** (thesis ch4.8.4). Four constraints squeeze trust in the VS to the minimum (only T3: honest MPC-TLS execution):

1. **Asset irrelevance**: the VS can only sign session digests; the on-chain effect of a signature still goes through the contract's multiple checks, and cannot directly move assets.
2. **Registration enforcement**: the VS's on-chain identity must be registered in `trustedVerifiers` ([TLSNVerifier.sol:236](../../../tlsn-extension/packages/contracts/contracts/TLSNVerifier.sol#L236)); unregistered signatures are always rejected.
3. **Order-binding enforcement**: every signature must contain the correct `H_bind`; the VS cannot construct a valid binding for an order with inconsistent parameters.
4. **MPC-TLS constraint**: under T2 the VS cannot single-handedly forge the PP's HTTPS response; its signing power is limited to endorsing sessions it actually participated in computing.

The design philosophy aligns with Optimistic Rollup's minimal trust in the sequencer. Test evidence: `ADM-ATT-02` (own-key forgery → `UntrustedVerifier`), `WISE-ATT-08`/`ALI-ATT-08` (untrusted payment server rejected).

---

## 6. S5 — plugin execution isolation

**Holds under T5** (thesis ch4.8.5). Third-party plugins run in a QuickJS WebAssembly sandbox ([plugin-sdk/src/index.ts:455-463](../../../tlsn-extension/packages/plugin-sdk/src/index.ts#L455-L463), `allowFetch:false, allowFs:false`):

- **Capability limits**: the sandbox exposes only the controlled interfaces the Host explicitly declares (`prove`/`openWindow`/`done` etc. injected via env); access to host internal state, private keys, other windows' data, and system interfaces is forbidden at the infrastructure level, not relying on plugin self-discipline.
- **Runtime permission check**: a plugin must declare the permissions it needs, checked on each call; out-of-scope calls are blocked.

If the user device is root-compromised (T5 fails), isolation weakens — a known limitation (thesis ch6.5).

---

## 7. Economic security (beyond S1–S5)

Thesis ch4.7.3. Two economic attacks:

### 7.1 Merchant non-payment
Not technically feasible under T1∧T2∧T3:
- **CRYPTO**: the merchant pre-locks crypto; after the buyer pays, the buyer **self-services** the release call, requiring no merchant presence/authorization ([`payOrderByPlatform`](../../../tlsn-extension/packages/contracts/contracts/C2CEscrow.sol#L609)), so merchant non-cooperation has no effect.
- **FIAT**: merchant refuses to pay → cannot generate a proof → buyer reclaims the locked asset on timeout + forfeits the merchant bond; merchant pays then refuses to submit a proof → effectively forfeits its crypto claim, and the bond is forfeited on timeout all the same.
- **Fake payee-account substitution**: the account hash is in `H_bind`; switching accounts mid-way → on-chain check fails.

### 7.2 Liquidity exhaustion
Two layers of economic constraint:
- **Layer 1**: each default directly forfeits that round's bond ([`onTimeout`, C2CRiskManager.sol:172-193](../../../tlsn-extension/packages/contracts/contracts/C2CRiskManager.sol#L172-L193) + [`BondVault.settle`](../../../tlsn-extension/packages/contracts/contracts/C2CBondVault.sol#L84)); the total attack cost grows linearly with concurrent orders.
- **Layer 2**: reputation dynamically raises `bondBps` and triggers a temporary freeze at a threshold, making each attack progressively costlier.

> [!IMPORTANT]
> **Parameter-sensitivity limitation** (thesis ch4.7.3 + ch6.5): if `bondBps` is set too low, a large-capital attacker can still sustain attacks at a small relative loss. The parameters are adjustable via `setRiskConfig` ([C2CRiskManager.sol:86-102](../../../tlsn-extension/packages/contracts/contracts/C2CRiskManager.sol#L86-L102)) and should be weighed against asset scale and the risk/reward ratio. Test `BOND-19`: an extreme stepBps → returns maxBondBps without panicking.

---

## 8. Key trade-offs

| Trade-off | Description | Mitigation direction |
|---|---|---|
| Notary availability single point | A single-node VS going offline interrupts proof generation; but **only affects availability, not already-escrowed assets** (dual-domain failure decoupling) | `m-of-n` threshold signing (more communication rounds + key-management complexity) |
| On-chain observable information | Order amount in plaintext, account commitment deterministic-fixed, susceptible to statistical analysis | Amount range proofs (Bulletproofs), account derived salt (extensible without changing core contracts) |
| Collusion boundary | T3 modeled as honest-but-curious; pure collusion fails if either T2/T3 holds; side-channel vulnerabilities are residual risk | TEE-isolated notarization, formal verification of the MPC implementation |

> [!TIP]
> The semi-decentralized dual-domain architecture (decentralized domain 𝒟 + constrained centralized domain 𝒞) has fully decoupled failure modes: a VS protocol-external failure (cheating) cannot produce a valid fake proof under T2 (on-chain verification fails). See [03-threat-model.md](03-threat-model.md), [01-overview.md](01-overview.md). For measured limitations, see [06-evaluation.md §5](06-evaluation.md).

---

<div align="center">

◀ Prev [04 · Protocol design](04-protocol-design.md) · 🏠 [Docs home](../README.md) · Next ▶ [06 · Evaluation](06-evaluation.md)

</div>
