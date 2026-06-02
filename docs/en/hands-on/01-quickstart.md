# Quickstart: Run the Minimal Local Loop

> **Purpose**: bring up a local chain + contracts + verifier server + extension + dApp on your machine, with zero real payment accounts.
> **Audience**: hands-on track.
> **Command sources**: [`tlsn-extension/README.md`](../../../tlsn-extension/README.md), [`packages/contracts/scripts/deploy-web.ts`](../../../tlsn-extension/packages/contracts/scripts/deploy-web.ts), the various `package.json`s.

> ⚠️ **Verification status of this page (stated honestly)**:
> - ✅ **Actually run & verified**: the `hardhat test` contract suite (WSL, 2026-06-02) — **336 passing / 0 failing**. Toolchain: Node v24.10.0 (via nvm) in WSL, cargo 1.95 (nightly).
> - ⏳ **Commands sourced from verified scripts**: the full deploy + verifier + extension + web end-to-end startup was not run step-by-step in this pass (it needs a Rust build + loading the extension in a browser); the commands are taken from the scripts and the official README above, with ports/artifacts cross-checked against the source. On first run, follow the actual output.

---

## 0. Prerequisites

| Dependency | Version | Notes |
|---|---|---|
| Node.js | ≥ 18 (tested v24) | monorepo / contracts / frontend |
| Rust (cargo) | stable (tested 1.95) | verifier server, install from [rustup.rs](https://rustup.rs/) |
| Chrome/Chromium | latest | to load the browser extension |

> The verifier server runs most smoothly under WSL/Linux (the author's environment is WSL2 Ubuntu).

---

## 1. Clone & install

```bash
cd tlsn-extension
npm install          # install all monorepo deps and set up workspace links
```

## 2. Confirm the environment (run the contract tests)

Run the contract tests first to confirm the toolchain is ready — this is the only step on this page that has been run and verified end-to-end:

```bash
cd packages/contracts
npx hardhat test     # expect: 336 passing / 0 failing (all 12 suites)
```

> If `hardhat` is not found: it is hoisted to the root `node_modules/.bin`; run `npx hardhat test` from `packages/contracts`, or add the root `.bin` to PATH.

## 3. Start the local chain + deploy contracts

**Terminal 1** — start the local chain (chainId `31337`):

```bash
cd packages/contracts
npm run node         # = hardhat node --network hardhatMainnet
```

**Terminal 2** — deploy + seed data:

```bash
cd packages/contracts
npm run deploy:web   # = hardhat run scripts/deploy-web.ts --network localhost
```

The deploy script ([deploy-web.ts](../../../tlsn-extension/packages/contracts/scripts/deploy-web.ts)) deploys 7 contracts in order + wires them + registers the trust lists + seeds 1 merchant + 4 products (Wise×MYR, Alipay×CNY, each CRYPTO/FIAT), and writes:
- [`packages/contracts/deployments/web-31337.json`](../../../tlsn-extension/packages/contracts/deployments/web-31337.json) (addresses + `deploymentBlock`, read by keeper/frontend)
- `packages/web/.env.local` (`NEXT_PUBLIC_*` contract addresses, chainId=31337)

> For deployment order and wiring, see [reference/contracts.md §4](../reference/contracts.md).

## 4. Start the verifier server

**Terminal 3**:

```bash
cd packages/verifier
cargo run            # listens on 0.0.0.0:7047 by default (first build compiles Rust, takes a while)
```

Health check:

```bash
curl http://localhost:7047/health    # expect: ok
```

Endpoints ([main.rs:223-232](../../../tlsn-extension/packages/verifier/src/main.rs#L223-L232)): `GET /health`, `WS /session`, `WS /verifier?sessionId=`, `WS /proxy?token=`, `GET /proof*`.

> The verifier server needs a signing key (env var `VERIFIER_PRIVATE_KEY`), whose signer address must match the one registered at deploy time via `addTrustedVerifier` (demo default is Hardhat account[9]). See [reference/verifier-plugin.md](../reference/verifier-plugin.md).

## 5. Start the browser extension

**Terminal 4**:

```bash
cd tlsn-extension
npm run dev          # auto-builds deps + webpack-dev-server (port 3000), output to packages/extension/build/
```

Load in Chrome: `chrome://extensions/` → enable "Developer mode" → "Load unpacked" → select `packages/extension/build/`.

> ⚠️ The extension version must match the notary/verifier version (see [03-troubleshooting.md](03-troubleshooting.md)).

## 6. Start the C2C dApp

**Terminal 5**:

```bash
cd tlsn-extension/packages/web
npm run dev          # = node scripts/start-dev.js, Next.js default port 3001
```

Open `http://localhost:3001`, connect a wallet (import a Hardhat test account private key, network pointing at local 31337).

## 7. Run the "place order → prove → settle" minimal loop (no real accounts)

A path you can verify without a real Alipay/Wise account:

1. **Contract layer**: `npx hardhat test` (step 2) already covers the full "place → submit proof → settle/timeout" state machine (see `ESC-FLOW`/`INT` cases); proof data is constructed programmatically by [`test/helpers/buildTLSNProof.ts`](../../../tlsn-extension/packages/contracts/test/helpers/buildTLSNProof.ts) — **this is the fastest way to verify protocol correctness with zero real accounts**.
2. **Plugin layer**: the extension DevConsole ships with example plugins, or use the example plugins + sample transcripts in [`packages/demo`](../../../tlsn-extension/packages/demo/)/[`packages/tutorial`](../../../tlsn-extension/packages/tutorial/) to run the proof-generation pipeline (against the local verifier).
3. **Full real exchange flow** (needs a real Alipay/Wise account): see [02-demo-walkthrough.md](02-demo-walkthrough.md).

**Success criteria**:
- Contract tests 336 passing / 0 failing ✅
- `curl localhost:7047/health` returns `ok`
- The dApp at 3001 connects a wallet and shows the 4 seed products
- The extension loads in `chrome://extensions/` and the DevConsole opens

---

> Can't get it running? See [03-troubleshooting.md](03-troubleshooting.md). For the full real exchange flow, see [02-demo-walkthrough.md](02-demo-walkthrough.md). To understand what each step does, see [deep-dive/01-overview.md](../deep-dive/01-overview.md).
