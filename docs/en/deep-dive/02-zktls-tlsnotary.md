# zkTLS & TLSNotary: the Cryptographic Foundation

> **Purpose**: the protocol's cryptographic foundation — why an off-chain payment can be trustlessly verified on-chain.
> **Audience**: deep-dive track. Followed by [03-threat-model.md](03-threat-model.md), [04-protocol-design.md](04-protocol-design.md).
> Thesis source: ch2.2–2.4. All facts follow the source. Terms in [glossary.md](../reference/glossary.md).

---

## 1. TLS 1.2 handshake & key agreement

TLSNotary is based on **TLS 1.2** (this system does not involve 1.3). TLS has a handshake layer and a record layer. Taking ECDHE as an example (thesis ch2.2.1): client private key $d_c$, server private key $d_s$, agree on shared secret $Z = d_c·d_s·G$ ($G$ the curve base point), then derive:

$$MS = \text{PRF}(PMS, \text{"master secret"}, R_c‖R_s), \quad K_{session} = \text{PRF}(MS, \text{"key expansion"}, R_s‖R_c)$$

The handshake also establishes server identity via certificate-chain verification — the fundamental precondition for record-layer data "provenance authenticity."

---

## 2. The record layer & the third-party verification gap

After the handshake comes the record layer: HTTP request line, response body, cookies, API fields, etc. are all wrapped into TLS Records under symmetric encryption. An external observer sees only timing and domain, not the plaintext.

**The core limitation** (thesis ch2.2.2): TLS 1.2's provenance authenticity **holds only for the two communicating parties**, and cannot be extended to independent third-party verification. Once the client obtains the plaintext, it can copy/forge content, and a third party cannot judge authenticity from a user-submitted screenshot/API response alone.

> In this system's scenario: payment status, amount, and payee account exist only in the HTTPS response from the payment platform, which the on-chain contract cannot directly access or judge. This is precisely the motivation for zkTLS.

---

## 3. The zkTLS idea & route selection

**zkTLS** (a.k.a. Web Proofs / TLS attestation) is a family of techniques that provide provenance proofs for TLS session data **without modifying the target server**, with support for selective disclosure. It must solve three problems at once (thesis ch2.3.1): ① the data truly comes from a real TLS session; ② it is bound to a specific server identity; ③ only the necessary information for the decision is disclosed.

Comparison of the three implementation routes (thesis Table 2-3):

| Route | Core mechanism | Pros | Cons |
|---|---|---|---|
| **MPC-Based** (this work) | MPC + ZKP | High security, no server modification | Higher compute latency/overhead, complex deployment |
| TEE-Based | Trusted Execution Environment | Efficient, single-node | Relies on hardware trust, side-channel risk |
| Proxy-Based | Proxy + ZKP | Low latency, simple deployment | Must trust the proxy, may be blocked by the target |

**This work chooses MPC-Based → specifically TLSNotary**: no server cooperation needed, stronger cryptographic binding between the proof and the actual TLS session, and native support for on-demand disclosure and privacy. Representative work: DECO (foundational), DiStefano, ORIGO, etc.

---

## 4. TLSNotary principles

### 4.1 Roles (thesis ch2.4.1)
- **Prover**: initiates the TLS request and generates the proof (here = the buyer who paid, for CRYPTO; or the merchant, for FIAT).
- **Server**: an ordinary HTTPS server, no modification needed.
- **Notary/Verifier**: participates in MPC-TLS and establishes a verifiable witness of the session.
- **Application Verifier**: later receives the selectively disclosed proof and makes the business decision.

### 4.2 Three-phase flow (thesis ch2.4.2)
1. **MPC-TLS**: Prover and Verifier jointly perform the client-side key computation and establish a standard TLS 1.2 connection with the server; session control is split, so neither side alone can forge a full proof.
2. **Selective disclosure**: the Prover reveals only the fields relevant to the fact being proven (payment status/amount/payee identifier), hiding the rest.
3. **Data verification**: verify the signature, commitment openings, and server-identity binding, then make the business-semantic decision.

### 4.3 Cryptographic basis (thesis ch2.4.3)
- **Key splitting**: the client private key is the sum of the Prover's share $P_{sk}$ + the Verifier's share $V_{sk}$ ($C_{sk}=P_{sk}+V_{sk}$), transparent to the server; the pre-master secret $PMS = x(R)$, $R=P+V$. A2M/OLE constructions convert between additive and multiplicative shares.
- **Record-layer joint computation**: both parties hold key shares for joint encryption/decryption; the Prover introduces a mask so the Verifier cannot directly learn the plaintext; correctness is given malicious-security by DEAP (dual execution + post-hoc consistency check).
- **Commitment packaging**: field $m_i$ + blinder $r_i$ → commitment $C_i = H(m_i ‖ r_i)$ (in generic TLSNotary these are aggregated into a **Merkle root** + session header SH, signed by the Verifier).

### 4.4 Proof generation, verification & selective disclosure
The Prover chooses the direct-opening or the zero-knowledge path; the verifier checks field-commitment & aggregate-root consistency, server-identity binding, and the session-header signature, in order. Design principle: **"prove just enough to support the business conclusion"** — balancing verifiability and minimal privacy disclosure.

---

## 5. This work's three extensions to TLSNotary

The generic TLSNotary mechanisms (key splitting, joint computation, commitment packaging, selective disclosure) are **reused as-is, unmodified**; this work makes three adaptations for the C2C scenario (thesis ch2.4.5, ch4.3):

### 5.1 Simplified role configuration
The standalone Notary role is removed; the business verifier server VS directly acts as the MPC-TLS verifier — collapsing the "Notary signs → business reviews" two-stage trust chain into one.

### 5.2 Semantic extension of the signature digest (the core)
A generic TLSNotary signature covers only the session commitments + metadata, with no cryptographic relation to a business order. **This work additionally includes the order-binding hash `H_bind` and the policy-version hash `H_policy` in the signature digest**, so a single signature endorses both "session content authenticity" and "order parameter consistency," eliminating the room to transplant a proof across orders.

The message used to recover the signer on-chain ([`_recoverVerifierSigner`, TLSNVerifier.sol:272-285](../../../tlsn-extension/packages/contracts/contracts/TLSNVerifier.sol#L272-L285)):

$$m = \text{keccak256}(\text{chainId} ‖ \text{keccak256}(sid) ‖ H_{comm} ‖ H_{bind} ‖ H_{policy})$$

The preimage built off-chain by the VS is **byte-for-byte identical** to the on-chain one ([`sign_commitments`, verifier/src/main.rs:2064-2111](../../../tlsn-extension/packages/verifier/src/main.rs#L2064-L2111)). `H_policy` is taken from the plugin config's `policyVersion` ([plugin-sdk/src/index.ts:880-884](../../../tlsn-extension/packages/plugin-sdk/src/index.ts#L880-L884)).

### 5.3 Standardized selective disclosure
On-demand disclosure is refined into a field-level declarative spec (Handlers); each field chooses `REVEAL` (plaintext) or `PEDERSEN` (committed/hidden), so the policy is declarable, auditable, and extensible.

---

## 6. Engineering instantiation notes (code mapping)

| Generic TLSNotary mechanism | This system's instantiation | Code evidence |
|---|---|---|
| Commitment function $H$ | EVM-native `keccak256`: $c_i = \text{keccak256}(\text{bytes}(f_i) ‖ r_i)$ | commitment `hashAlg=Keccak256` ([verifier.rs:225-226](../../../tlsn-extension/packages/verifier/src/verifier.rs#L225-L226)) |
| Commitment aggregation | Sequential keccak concatenation `H_comm = keccak256(c₁‖…‖cₙ)`, for a single on-chain comparison | [`_verifyCommitmentsHash`, TLSNVerifier.sol:264-270](../../../tlsn-extension/packages/contracts/contracts/TLSNVerifier.sol#L264-L270) |
| Commitment-opening check | Rebuild the commitment from the revealed item's value+blinder and compare | [`_verifyCommitmentOpenings`, TLSNVerifier.sol:246-262](../../../tlsn-extension/packages/contracts/contracts/TLSNVerifier.sol#L246-L262) |
| Proof structure π | `TLSNProof` (sessionId/chainId/commitments/revealedItems/commitmentOpenings/orderBindingHash/policyVersionHash/verifierSignature/serverName) | [C2CTypes.sol:35-69](../../../tlsn-extension/packages/contracts/contracts/C2CTypes.sol#L35-L69) |

> 💡 Generic TLSNotary often aggregates commitments into a Merkle root; this system instantiates it as **sequential keccak256 concatenation** per ch4.3, to fit a single on-chain comparison on the EVM (code `_verifyCommitmentsHash`).

---

> How these cryptographic mechanisms assemble into the protocol: see [04-protocol-design.md](04-protocol-design.md); how the security goals are argued: see [05-security-analysis.md](05-security-analysis.md); the performance cost: see [06-evaluation.md §3](06-evaluation.md).
