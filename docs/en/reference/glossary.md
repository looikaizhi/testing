# Glossary

> **Purpose**: a low-barrier term lookup. Each entry is 1–2 sentences + a pointer to the relevant deep-dive page. Definitions are consistent with the other pages and the code.
> **Audience**: everyone.

---

## Cryptography & zkTLS

**zkTLS** (Web Proofs / TLS attestation)
A family of techniques that provide provenance proofs for TLS session data **without modifying the target server**, with support for selective disclosure. Three routes: MPC-Based, TEE-Based, Proxy-Based. This work chooses MPC-Based. → [02-zktls-tlsnotary.md §3](../deep-dive/02-zktls-tlsnotary.md)

**MPC-TLS (Multi-Party-Computation TLS)**
Splits the client-side key generation and use across the prover and the verifier server, so neither side alone holds the full session key — letting the verifier cryptographically "witness" a real TLS session without server cooperation. → [02 §4.3](../deep-dive/02-zktls-tlsnotary.md)

**TLSNotary**
The specific MPC-Based zkTLS scheme used here. Three phases: MPC-TLS → selective disclosure → data verification. Based on TLS 1.2. → [02 §4](../deep-dive/02-zktls-tlsnotary.md)

**Commitment**
A hash of a piece of data + a random blinder, yielding an irreversible value that can be opened and verified later. This system instantiates it as `cᵢ = keccak256(bytes(fᵢ) ‖ rᵢ)`. The off-chain verifier supports the Keccak256 algorithm. → [02 §6](../deep-dive/02-zktls-tlsnotary.md)

**Blinder**
A random value mixed into a commitment so it hides the plaintext and cannot be guessed by enumeration; submitted with the plaintext to rebuild the commitment under `REVEAL`, never leaves the device under `PEDERSEN`.

**Selective Disclosure**
Reveal only the minimal fields relevant to the business decision (e.g. amount/time), hiding the rest behind commitments. Configured per field via Handlers (`REVEAL`/`PEDERSEN`). This system's disclosure ratio is 20%–35%. → [verifier-plugin.md §4](verifier-plugin.md)

**Commitment-set hash (H_comm)**
All commitment hashes concatenated in order then keccak256'd: `H_comm = keccak256(c₁‖…‖cₙ)`, for a single on-chain comparison ensuring the commitment set cannot be altered. (Generic TLSNotary uses a Merkle root; this system uses sequential concatenation.) → [02 §6](../deep-dive/02-zktls-tlsnotary.md)

---

## Core protocol mechanisms

**Order-binding hash (H_bind) | Innovation ①**
The digest that cryptographically binds an off-chain proof to a specific on-chain order + payer/payee accounts. In code it is **15 flat fields** keccak256 (including rateVersion), embedded into the verifier signature digest; any parameter tampering makes on-chain signature recovery fail. Blocks cross-order reuse and parameter tampering. → [04 §6.2](../deep-dive/04-protocol-design.md)

**Verifier signature digest**
The message signed by the verifier server with its secp256k1 key: `keccak256(chainId ‖ keccak256(sid) ‖ H_comm ‖ H_bind ‖ H_policy)`, then wrapped in the Ethereum message format. On-chain, the signer is recovered and checked against the trust list. → [02 §5.2](../deep-dive/02-zktls-tlsnotary.md)

**Policy-version hash (H_policy)**
The hash that locks "which disclosure-policy version produced the proof" into the signature, taken from the plugin config's `policyVersion`. Used for compliance policy-version governance.

**Session dedup**
On-chain maintains a used-session-id set `U_sess`; each `sessionId` is written after first verification, and re-submission is rejected — preventing repeated asset release for the same order. → [05 §3](../deep-dive/05-security-analysis.md)

**Bond Vault (BondVault)**
The contract that holds bonds per-order in isolation. Settlement is **pull-mode**: refunded to the prover on success, transferred to the counterparty on timeout; the amount is credited to `claimable` first and the user calls `claim()` to withdraw. → [contracts.md §2.4](contracts.md)

**Order key (orderKey)**
The 6-field hash key for bond isolation `keccak256(escrow, chainId, merchant, productId, assetType, orderId)`, ensuring bonds across orders are never mixed.

**Dynamic bond rate (bondBps)**
The bond rate (basis points) that rises with the user's risk level: `clamp(base + ℓ×step, min, max)`, default 10%→40% (ℓ=0→10). → [04 §8](../deep-dive/04-protocol-design.md)

**Platform Verifier**
A standalone contract implementing the unified `IPlatformVerifier` interface and encapsulating a single payment platform's business rules (Alipay/Wise). Dispatched via the `TLSNVerifier` registry; adding a platform needs no change to the core contracts. → [verifier-plugin.md](verifier-plugin.md)

---

## Architecture & trust

**Semi-Decentralized architecture**
Splits the system into a decentralized domain 𝒟 and a constrained centralized domain 𝒞: 𝒟's security is guaranteed entirely by chain consensus + contracts; 𝒞's off-chain participants' trusted behavior is strictly bounded by cryptography, and any deviation can be detected and rejected by 𝒟. → [03 §4](../deep-dive/03-threat-model.md)

**Decentralized domain 𝒟**
The on-chain part: asset escrow, order state, proof verification, platform governance. Relies on T1 (blockchain security).

**Constrained centralized domain 𝒞**
The off-chain part: MPC-TLS co-computation, selective-disclosure endorsement, off-chain account-consistency check. Relies on T3 (verifier server honest execution).

**Verifier Server (VS)**
The off-chain node that acts as the MPC-TLS verifier, signs the session commitments + order binding, performs off-chain account verification, and pushes compliance Webhooks. It **holds no assets**; its failure only affects availability. → [04 §5](../deep-dive/04-protocol-design.md)

**Trust assumptions T1–T5**
T1 blockchain security / T2 TLS cryptographic strength / T3 VS honest-but-curious / T4 payment-platform API stability + trusted certificates / T5 user device not root-compromised. → [03 §3](../deep-dive/03-threat-model.md)

**Security goals S1–S5**
S1 payment-proof unforgeability / S2 replay resistance / S3 account privacy / S4 verifier-node trust minimization / S5 plugin execution isolation. → [05](../deep-dive/05-security-analysis.md)

**accountCheck**
The verifier server compares, off-chain, the payee account identifier in the response against the merchant's on-chain pre-registered account hash via keccak256 slice comparison; it signs only after this passes. The chain does not compare accounts (account privacy + an entry reserved for future decentralization). → [04 §7](../deep-dive/04-protocol-design.md)

**KYB (Know Your Business)**
Merchant business verification at onboarding. A merchant self-registers via a KYB notarization proof (serverName must be in `trustedKYBServers`), or is registered by the admin as a fallback. → [contracts.md §2.5](contracts.md)

---

## Business & operations

**CRYPTO / FIAT products**
CRYPTO = merchant sells crypto (buyer pays fiat, buyer proves); FIAT = merchant buys crypto (merchant pays fiat, merchant proves). The two are mirror images. → [04 §2](../deep-dive/04-protocol-design.md)

**Order state machine**
`Q = {PENDING, WAITING, COMPLETED, EXPIRED}`. CRYPTO initial PENDING, FIAT initial WAITING; `cancelOrder` disabled; expiry cleanup is triggered by anyone. → [contracts.md §3](contracts.md)

**Keeper (daemon)**
The off-chain process that watches order events and calls `sweepExpiredBatch` to clean up expired orders on expiry. **No privilege** — cleanup is permissionless; the keeper is merely a convenience. → [code-map.md §3.8](code-map.md)

**Sweep (public cleanup)**
`sweepExpired`/`sweepExpiredBatch`: callable by any EOA, moves expired orders to `EXPIRED` and settles bonds per the timeout rule.

**Webhook (compliance reporting)**
A slim message the VS pushes asynchronously to an external compliance system after verification (Travel Rule fields only, no plaintext), routed by server name, fire-and-forget. → [verifier-plugin.md §5](verifier-plugin.md)

**QuickJS sandbox**
The WebAssembly isolation environment where plugins run, with network/filesystem disabled and capabilities injected by the Host — the basis of plugin execution isolation (S5). → [05 §6](../deep-dive/05-security-analysis.md)

**Rate precision / fiat amount ×1000**
Rates are encoded `×1e8` (`RATE_PRECISION_EXP=8`); fiat amounts are passed at thousandth precision (`fiatAmountX1000`) to avoid floating-point error. → [contracts.md](contracts.md)

---

> For the source location of each concept, see [code-map.md](code-map.md).
