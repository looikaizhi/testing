# Troubleshooting Quick Reference

> **Purpose**: reduce friction — common errors, debugging tips, FAQ.
> **Audience**: hands-on track.
> Custom-error source: [`C2CTypes.sol:108-194`](../../../tlsn-extension/packages/contracts/contracts/C2CTypes.sol#L108-L194).

---

## 1. Environment & startup

| Symptom | Cause / fix |
|---|---|
| `'hardhat' is not recognized` / `command not found` | hardhat is hoisted to the root `node_modules/.bin`. Run `npx hardhat test` from `packages/contracts`, or add the root `.bin` to PATH. |
| `curl localhost:7047/health` no response | The verifier server is not up or still compiling. `cd packages/verifier && cargo run`; the first build takes a while; confirm it listens on `0.0.0.0:7047` ([main.rs:250](../../../tlsn-extension/packages/verifier/src/main.rs#L250)). |
| Frontend can't connect / wrong addresses after deploy | `deploy:web` rewrites `packages/web/.env.local` and `deployments/web-31337.json`; after redeploying, **restart the Next dev server** (port 3001) so it reads the new addresses. |
| keeper doesn't clean up expired orders | A redeploy deletes `keeper/data/state.json`; the keeper process must be **restarted** to re-scan from the new escrow's deploymentBlock ([deploy-web.ts:750-770](../../../tlsn-extension/packages/contracts/scripts/deploy-web.ts#L750-L770)). |
| `better-sqlite3` fails to load | The web DB depends on a native module; rebuild with `npm install` on the target platform. The deploy script needs it to write seed data. |

---

## 2. Contract revert custom-error reference

The most common custom errors during order placement / proof submission (the wallet shows the error name or selector):

| Error | Meaning / diagnosis |
|---|---|
| `BuyerBindingNotSet` / `MerchantBindingNotSet` | Buyer/merchant did not `setPlatformBinding` to bind a payment account first |
| `SelfTradeNotAllowed` | Buyer = merchant; self-trade is forbidden |
| `ExceedsUsdCap` | Order amount exceeds `maxOrderAmount` (default 1000×1e18, admin-adjustable) |
| `MerchantClosed` | Not currently within the merchant's business hours; use `openNow` or set business hours |
| `RateNotPublished` / `RateExpired` | Merchant has not published a rate, or the rate expired |
| `InsufficientAvailable` | Insufficient merchant collateral available (`collateral - pending < amount`) |
| `AlreadyHasActiveOrder` | The same buyer already has an active order for this product (invariant I₂ single active order) |
| `OutOfDeadline` | Proof submitted after the 15-minute order deadline |
| `OrderBindingHashMismatch` | The proof's `orderBindingHash` differs from the on-chain rebuilt value (any of order params / accounts / rateVersion mismatch) |
| `SessionAlreadyUsed` | This `sessionId` was already used (replay protection) |
| `WrongChainId` | The proof's chainId ≠ the current chain |
| `UntrustedVerifier` | The recovered signer is not in `trustedVerifiers` (verifier signing key doesn't match the registered address) |
| `NotTrustedPaymentServer` | The proof's `serverName` is not in the trusted payment-server list |
| `CommitmentsHashMismatch` / `CommitmentOpeningMismatch` | A commitment was tampered with, or a revealed item is inconsistent with its commitment |
| `PaymentAmountMismatch` / `CurrencyMismatch` | Platform verifier: amount/currency does not match the order |
| `AlipayTransferTooOld` / `WiseTransferTooOld` | Payment time earlier than the order creation time (old-transfer reuse protection) |
| `TransferDateExpired` / `AlipayTransferDateExpired` | Payment time later than the order deadline |
| `DuplicateAlipayOrderId` / `DuplicateTransferId` | The platform-level transaction ID was already used (replay protection) |
| `OrderCancellationDisabled` | `cancelOrder` is disabled (V4 design, no active cancellation) |
| `UserBlacklisted` / `UserTemporarilyFrozen` | Risk-control blacklist / within the temporary freeze period |
| `ContractPaused` | The contract is paused by the admin |

For the full list, see [C2CTypes.sol:108-194](../../../tlsn-extension/packages/contracts/contracts/C2CTypes.sol#L108-L194).

---

## 3. Proof-generation phase

| Symptom | Cause / fix |
|---|---|
| Extension/notary version mismatch | The extension version **must** match the notary/verifier version it connects to ([README warning](../../../tlsn-extension/README.md)), otherwise the MPC-TLS handshake fails. |
| WASM execution blocked by CSP | The extension manifest needs `content_security_policy: wasm-unsafe-eval` (already configured); when integrating into your own page, remember to allow WASM. |
| Large-response proof is slow/stuck | Browser WASM slows non-linearly when the response body exceeds 5–10 KB (see [06-evaluation §3](../deep-dive/06-evaluation.md)); this system's API responses are 2–5 KB, in the normal range. |
| Weak network (high latency + low bandwidth) handshake timeout | TLSNotary has a minimum network-quality threshold: under 3G (300ms/2Mbps) the handshake always times out ([06-evaluation §4.4](../deep-dive/06-evaluation.md)). |
| MPC-TLS connection needs a WebSocket proxy | See Websockify below. |

### Websockify (TLS over WebSocket proxy)

```bash
git clone https://github.com/novnc/websockify && cd websockify && ./docker/build.sh
# e.g. proxy api.x.com:443
docker run -it --rm -p 55688:80 novnc/websockify 80 api.x.com:443
```

`prove()`'s `proxyUrl` points to the proxy (e.g. `wss://notary.pse.dev/proxy?token=<host>` or a local websockify), forwarding HTTPS over WebSocket for the browser-side TLS operations.

---

## 4. Gas & on-chain

| Symptom | Cause / fix |
|---|---|
| `placeOrder` gas estimation fails | Usually because a pre-check would revert (binding not set, over cap, business hours, etc., see §2); rule out the revert first, then estimate gas. The demo deploy pre-approves escrow + BondVault for accounts. |
| Claimed bond not received | Settlement is **pull-mode**: after success/timeout the bond is credited to `claimable`; you must call `C2CBondVault.claim(token)` ([:126](../../../tlsn-extension/packages/contracts/contracts/C2CBondVault.sol#L126)). |
| Expired order state unchanged | Cleanup is not automatic: anyone must call `sweepExpired*`, or the keeper triggers it; or the next `placeOrder` runs `_cleanupExpired` along the way. |

---

## 5. FAQ

- **Q: Do I need a real Alipay/Wise account?** A: Not to verify protocol correctness — `npx hardhat test` covers the whole flow with programmatically constructed proofs. Only the full real exchange needs one (see [02-demo-walkthrough.md](02-demo-walkthrough.md)).
- **Q: Can the verifier server run on Windows?** A: Yes, but the author's environment is WSL2 Ubuntu; running `cargo run` under WSL/Linux is recommended.
- **Q: What's the chainId?** A: Local `31337` (Hardhat).

---

> Still stuck? Go through the success criteria in [01-quickstart.md](01-quickstart.md) one by one; to understand the mechanisms, see [deep-dive/](../deep-dive/01-overview.md).
