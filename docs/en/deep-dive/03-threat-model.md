# Threat Model & Trust Assumptions

> [!NOTE]
> **Reading guide**
> - **Purpose**: explains "why it is designed this way" — adversary capabilities, STRIDE threat classification, trust assumptions T1–T5, and the definition & rationale of semi-decentralization.
> - **Audience**: deep-dive track. Followed by [04-protocol-design.md](04-protocol-design.md) (mechanisms), [05-security-analysis.md](05-security-analysis.md) (S1–S5 argument).
> - **Thesis source**: ch3.1, ch3.5, ch3.6. All facts follow the source.

**Contents**: [Adversary capabilities](#1-adversary-capability-assumptions) · [STRIDE](#2-stride-threat-classification) · [Trust assumptions T1–T5](#3-trust-assumption-hierarchy-t1t5) · [Semi-decentralization](#4-definition--rationale-of-semi-decentralization) · [Trust-model trade-offs](#5-trust-model-trade-offs-three-architectures-compared)

---

## 1. Adversary capability assumptions

All adversaries are modeled as **Probabilistic Polynomial-Time (PPT)** algorithms: they cannot break the cryptographic hardness assumptions underlying TLS (ECDLP, AES-GCM, HMAC security) in polynomial time. The baseline is the Dolev-Yao model specialized to this scenario (thesis ch3.5.1):

| Adversary | Goal | Capability boundary (what it cannot do) |
|---|---|---|
| **Network 𝒜_net** | Eavesdrop/tamper/replay/MITM | Cannot break TLS, cannot forge a CA certificate, cannot obtain local private keys |
| **Malicious buyer 𝒜_buyer** | Trigger asset release without paying | Cannot obtain the VS signing key, cannot break the QuickJS sandbox, cannot single-handedly forge the PP's TLS response |
| **Malicious merchant 𝒜_merchant** | Refuse to release crypto after receiving payment / register a fake payee account | Cannot prevent the buyer from generating a valid proof (as long as payment really occurred), cannot modify a deployed contract |
| **Compromised verifier server 𝒜_verifier** | Forge a signature for a payment that never happened | Bound by three constraints: registry authorization, H_bind binding, MPC-TLS cannot single-handedly forge the PP response |
| **Contract exploiter 𝒜_contract** | Reentrancy/overflow/access-control bypass/abnormal state | — |

---

## 2. STRIDE threat classification

| STRIDE category | Typical scenario | Security property | Main adversary |
|---|---|---|---|
| Spoofing | Deploy a fake verifier server | Authenticity | 𝒜_verifier |
| Tampering | Tamper with session commitments / amount fields | Integrity | 𝒜_buyer, 𝒜_net |
| Repudiation | Merchant denies having received payment | Non-repudiation | 𝒜_merchant |
| Information Disclosure | Chain exposes real payment accounts | Confidentiality | 𝒜_net |
| Denial of Service | Exhaust verifier server resources | Availability | 𝒜_net |
| Elevation of Privilege | Unauthorized contract bypasses the allowlist to call asset release | Authorization | 𝒜_contract |

**Six representative threats → defense mechanism → security goal** (thesis Table 3-4):

| Attack scenario | Required assumptions | Security goal | Core defense | Code evidence |
|---|---|---|---|---|
| Fake-payment fraud | T1–T4 | S1 | MPC-TLS commitments + H_bind + platform semantic checks | `verifyAndDelegate`, `_computeOrderBindingHash` |
| Proof replay | T1 | S2 | H_bind cross-order binding + U_sess dedup | `_checkAndMarkSessionId` ([TLSNVerifier.sol:240-244](../../../tlsn-extension/packages/contracts/contracts/TLSNVerifier.sol#L240-L244)) |
| Account-privacy leakage | T2,T4 | S3 | On-chain hash commitment + selective disclosure | `PlatformBinding` (hash), off-chain accountCheck |
| Plugin supply-chain attack | T5 | S5 | WASM sandbox capability limits + version signing | `plugin-sdk` QuickJS sandbox |
| Merchant non-payment | T1–T3 | — (economic) | Self-service release without merchant confirmation + timeout settlement + H_bind account binding | `payOrderByPlatform`, `sweepExpired*` |
| Liquidity exhaustion | T1 | — (economic) | Bond forfeiture + dynamic reputation adjustment | `onTimeout`, `BondVault.settle` |

> [!NOTE]
> Multi-layer replay protection in code: session dedup `usedSessionIds` + platform-level `usedAlipayOrderIds`/`usedTransferIds` + order binding `orderBindingHash` + payment-time lower bound. See [05-security-analysis.md §3](05-security-analysis.md).

---

## 3. Trust assumption hierarchy T1–T5

Five mutually independent assumptions (thesis ch3.6.1), covering the blockchain, cryptography, verification-protocol, external-dependency, and user-environment layers:

| Assumption | Content | Failure impact | Code anchor |
|---|---|---|---|
| **T1 Blockchain layer** | Immutability of on-chain txs, deterministic contract execution, BFT consensus | If broken, all on-chain guarantees fail at once (base assumption) | all contracts |
| **T2 TLS cryptographic strength** | TLS 1.2/1.3 hardness assumptions hold against PPT | If broken, the MPC-TLS authenticity guarantee collapses | `verifier` (MPC-TLS) |
| **T3 Verifier honest-but-constrained** | VS follows the MPC-TLS spec and **does not collude with the buyer to forge the PP response**; its DoS-type behavior only affects availability | Active cheating still cannot produce a valid fake proof under T2 | `trustedVerifiers` ([TLSNVerifier.sol:41](../../../tlsn-extension/packages/contracts/contracts/TLSNVerifier.sol#L41)) |
| **T4 Payment-platform API stability** | PP key APIs/formats stable within the plugin version's life, certificates issued by trusted CAs | If broken, the proof is cryptographically valid but its semantics may be untrue | `trustedPaymentServers`, `platforms/*.sol` |
| **T5 User device security** | The local device is not root-compromised | If broken, sandbox isolation is weakened (on-chain assets still protected by keys + chain security) | QuickJS sandbox |

**The combined security boundary of T2 and T3** (thesis ch3.6.1 highlight): if the VS actively colludes with the buyer, the two jointly hold the full TLS session key, which is cryptographically equivalent to being able to forge a trusted-CA-issued certificate — exactly the stronger hardness premise that T2 rules out. **So T2 and T3 are complementary: as long as either holds, the pure-collusion path fails cryptographically and S1 still holds.** The residual risk comes from MPC-implementation side channels (timing / memory-access), an engineering-layer concern (see [06-evaluation.md §5](06-evaluation.md) limitation 5).

> [!NOTE]
> The three trust lists in code are `trustedVerifiers`/`trustedKYBServers`/`trustedPaymentServers` ([TLSNVerifier.sol:41-44](../../../tlsn-extension/packages/contracts/contracts/TLSNVerifier.sol#L41-L44)), maintained by the admin, realizing T3 (verifier) and T4 (payment/KYB servers) on-chain.

---

## 4. Definition & rationale of "semi-decentralization"

**Definition** (thesis def 3.3): the system is split into a decentralized domain 𝒟 and a constrained centralized domain 𝒞, satisfying:
1. All security properties in 𝒟 are guaranteed by chain consensus + deterministic contract execution, relying on no off-chain trusted third party;
2. The off-chain participants' trusted-behavior boundary in 𝒞 is strictly bounded by cryptography, and any provable deviation can be detected and rejected by 𝒟.

| Domain | Functions covered | Code realization |
|---|---|---|
| **Decentralized domain 𝒟** | Asset escrow, order state, proof verification, platform governance | [`contracts`](../../../tlsn-extension/packages/contracts/) |
| **Constrained centralized domain 𝒞** | MPC-TLS co-computation, selective-disclosure endorsement, off-chain account-consistency check | [`verifier`](../../../tlsn-extension/packages/verifier/) |

**Why semi-decentralized rather than fully decentralized** (thesis ch3.1.4):
1. **Full on-chain TLS verification is currently infeasible**: running ECDHE/AES-GCM/MAC verification in the EVM would cost gas far beyond the block limit, and there is no mature EVM-native TLS verification.
2. **zkTLS deployment maturity limits**: SNARK/STARK zkTLS on consumer devices often takes tens of minutes to generate a proof covering the full TLS handshake, failing the latency requirement of interactive C2C. **The architecture reserves an interface to integrate zkTLS in the future**, allowing a smooth migration to full decentralization once performance is adequate.
3. **Trust minimization**: it compresses trust in the VS down to "only trust that the VS does not collude with the buyer to forge the PP's TLS response," the weakest assumption — in the same spirit as Optimistic Rollup's minimal trust in the sequencer.

> [!TIP]
> This echoes the design intent in [04 §7](04-protocol-design.md) and [05 §4](05-security-analysis.md) of **leaving the on-chain account check empty (an entry reserved for future decentralization)**: today an off-chain accountCheck is the pragmatic compromise, to be migrated on-chain once zkTLS matures.

---

## 5. Trust-model trade-offs (three architectures compared)

Thesis Table 3-5:

| Dimension | Pure centralized | **This system (semi-decentralized)** | Pure decentralized |
|---|---|---|---|
| Asset-custody trust | Platform operator | **Smart contract (trustless)** | Smart contract |
| Payment-proof trust | Platform operator | **Verifier server (crypto-constrained)** | Zero-knowledge circuit |
| Current deployability | High | **High** | Low (proof latency too high) |
| Account privacy | Depends on platform policy | **Hash isolation + selective disclosure** | Native ZK privacy |
| FATF compliance support | Easy | **Structured fields + Webhook** | Hard (limited on-chain data) |
| Single-point-of-failure risk | High | **Low (VS holds no assets)** | Very low |

Under the constraint that pure-decentralized zkTLS latency is not yet practical, this system strikes a reasonable balance between deployability and security, with privacy and compliance superior to the pure-centralized option.

---

> [!TIP]
> Order state set `Q = {PENDING, WAITING, COMPLETED, EXPIRED}` ([C2CTypes.sol:13-18](../../../tlsn-extension/packages/contracts/contracts/C2CTypes.sol#L13-L18)). How the mechanisms deliver these security goals: see [04-protocol-design.md](04-protocol-design.md) and [05-security-analysis.md](05-security-analysis.md).

---

<div align="center">

◀ Prev [02 · zkTLS & TLSNotary](02-zktls-tlsnotary.md) · 🏠 [Docs home](../README.md) · Next ▶ [04 · Protocol design](04-protocol-design.md)

</div>
