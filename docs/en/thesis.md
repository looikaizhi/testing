# Thesis Information

This documentation is the companion open-source implementation of the master's thesis below.

## Basic information

| Item | Content |
|---|---|
| Title (EN) | Design and Implementation of a Semi-Decentralized C2C Exchange Protocol Based on zkTLS |
| Title (ZH) | 基于 zkTLS 的半去中心化的 C2C 兑换协议设计与实现 |
| Author | LOOI KAI ZHI (雷凯智), student ID 3820241067 |
| Supervisor | Associate Prof. HaiYing Che (车海莺 副教授) |
| Defense committee chair | Prof. Tianfei Zhou (周天飞 教授) |
| School | School of Computer Science and Technology, Beijing Institute of Technology (北京理工大学 计算机学院) |
| Degree | Master of Engineering |
| Discipline | Computer Science and Technology |
| Submission date | June 2026 |
| Classification / UDC | TP393.0 / 004 |

**Keywords**: zkTLS; semi-decentralized protocol; C2C asset exchange; off-chain payment proof; smart contract escrow

> [!NOTE]
> Source: thesis template `main.tex:31-134`, `chapters/abstract.tex`.

---

## Abstract

With the growth of stablecoins and digital assets, demand for C2C exchange between fiat and crypto continues to rise. Existing solutions, however, generally rely on "platform matching + asset custody + manual arbitration": because off-chain payment facts cannot be directly verified by on-chain contracts, transaction security still rests on trust in a centralized platform. Around the core question of "how to convert off-chain payments into on-chain-verifiable proofs without an intermediary," this thesis proposes and implements a TLSNotary-based zkTLS semi-decentralized C2C exchange protocol.

Methodologically, the work follows a "protocol analysis — system design — prototype validation" path, building four layers (on-chain contract layer, off-chain proof layer, payment-platform integration layer, frontend interaction layer) and separating the system into a decentralized domain and a constrained centralized domain: asset custody and order-state transitions execute deterministically on-chain, while off-chain fiat payment facts are proven via MPC-TLS, signed by the verifier server, and verified on-chain.

Two key contributions: ① an order-binding digest cryptographically binds the off-chain TLS proof to the on-chain order, making the payment fact verifiably consumable on-chain and effectively blocking cross-order reuse and parameter tampering; ② a semi-decentralized dual-domain architecture of "decentralized on-chain execution + constrained off-chain notarization" that, under the current high latency of fully-decentralized zkTLS, balances trust minimization and deployability.

Prototype results: the on-chain cost of one complete exchange on Arbitrum One is about \$0.13; end-to-end latency is 5.94 s (Alipay) / 9.74 s (Wise) in the ideal environment, and 17.44 s / 24.02 s in the broadband environment.

> [!TIP]
> For the full Chinese and English abstract, see `chapters/abstract.tex`. The code implementation realizes the thesis mechanisms more precisely; for details, follow this documentation and the source.

---

## Chapter ↔ document mapping

See the [mapping table in the English README](README.md#thesis-chapter--document-map).

---

## Citation (BibTeX)

```bibtex
@mastersthesis{looi2026c2czktls,
  title  = {Design and Implementation of a Semi-Decentralized C2C Exchange Protocol Based on zkTLS},
  author = {Looi Kai Zhi (雷凯智)},
  school = {School of Computer Science and Technology, Beijing Institute of Technology},
  year   = {2026},
  month  = {6},
  type   = {Master's Thesis},
  note   = {Supervisor: Associate Prof. HaiYing Che}
}
```

> [!NOTE]
> The thesis PDF (`main.pdf`) and LaTeX source live in the thesis-template directory (outside this repo) and are not distributed with this open-source repository.

---

<div align="center">

🏠 [Docs home](README.md) · 🧠 [Deep-dive overview](deep-dive/01-overview.md) · 🙏 [Attribution & license](ATTRIBUTION.md)

</div>
