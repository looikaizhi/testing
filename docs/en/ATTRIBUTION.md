# Attribution & License

This repository is a **derivative work** built on top of [tlsnotary/tlsn-extension](https://github.com/tlsnotary/tlsn-extension), created by the **TLSNotary / PSE team** and its contributors.

## Upstream project

- **Project**: TLSNotary Extension (browser extension, plugin SDK, verifier server)
- **Source**: https://github.com/tlsnotary/tlsn-extension
- **License**: dual-licensed **Apache-2.0 OR MIT** (at your option, per the upstream README)
- **Copyright**: © the TLSNotary / PSE contributors

The TLSNotary extension provides the browser-based TLS proof-generation foundation — the part that makes everything else in this project possible. Its source lives in the [`tlsn-extension/`](../../tlsn-extension/) submodule of this repository.

## Contributions in this repository

On top of the upstream foundation, the **C2C (consumer-to-consumer) fiat ↔ crypto payment protocol layer** was added by **looikaizhi (Looi Kai Zhi)**, including:

| Package / part | Description |
|---|---|
| [`tlsn-extension/packages/contracts`](../../tlsn-extension/packages/contracts/) | C2C escrow / bond-vault / risk-manager smart contracts |
| [`tlsn-extension/packages/web`](../../tlsn-extension/packages/web/) | the C2C trading dApp |
| [`tlsn-extension/packages/keeper`](../../tlsn-extension/packages/keeper/) | the on-chain timeout-settlement keeper |
| C2C extensions to `tlsn-extension/packages/verifier`, `packages/demo` | C2C-specific logic in the verifier server (accountCheck/signing/Webhook, etc.) |

> Cross-checked against the upstream `docs/ATTRIBUTION.md`: the contracts/web/keeper packages + the C2C extensions to verifier/demo are this work's contribution.

These contributions are © 2026 looikaizhi, released under the same **Apache-2.0 OR MIT** dual license as the upstream project.

## How to see who did what

The complete authorship breakdown is **preserved in the Git history** and the GitHub Contributors graph, neither summarized nor squashed:

- The TLSNotary team's commits date back to **2023-07** (the project's first commit).
- The C2C protocol-layer commits are from **2026**.

Please do not squash or rewrite history, so that this attribution stays intact.

## Acknowledgements

Thanks to the TLSNotary / PSE team (@0xtsukino, @hendrikeeckhaut, @mhchia, and the other contributors), whose work made it possible to focus on the C2C protocol design.
