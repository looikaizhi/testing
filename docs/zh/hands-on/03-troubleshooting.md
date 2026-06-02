# 排错速查

> [!NOTE]
> **本篇导读**
> - **定位**：降低劝退——常见报错、调试技巧、FAQ。
> - **读者**：动手轨。
> - **自定义错误源**：[`C2CTypes.sol:108-194`](../../../tlsn-extension/packages/contracts/contracts/C2CTypes.sol#L108-L194)。

**目录**：[环境与启动](#1-环境与启动) · [revert 错误对照](#2-合约-revert-自定义错误对照) · [证明生成](#3-证明生成阶段) · [Gas 与链上](#4-gas-与链上) · [FAQ](#5-faq)

---

## 1. 环境与启动

| 现象 | 原因 / 解决 |
|---|---|
| `'hardhat' is not recognized` / `command not found` | hardhat 提升到根 `node_modules/.bin`。从 `packages/contracts` 跑 `npx hardhat test`，或把根 `.bin` 加入 PATH。 |
| `curl localhost:7047/health` 无响应 | 验证服务器没起或还在编译。`cd packages/verifier && cargo run`，首次编译较久；确认监听 `0.0.0.0:7047`（[main.rs:250](../../../tlsn-extension/packages/verifier/src/main.rs#L250)）。 |
| 部署后前端连不上 / 地址不对 | `deploy:web` 会重写 `packages/web/.env.local` 与 `deployments/web-31337.json`；重新部署后**重启 Next dev server**（端口 3001）让其读取新地址。 |
| keeper 不清理过期单 | 重新部署会删 `keeper/data/state.json`；keeper 进程须**重启**才会从新 escrow 的 deploymentBlock 重新扫描（[deploy-web.ts:750-770](../../../tlsn-extension/packages/contracts/scripts/deploy-web.ts#L750-L770)）。 |
| `better-sqlite3` 加载失败 | web 的 DB 依赖原生模块；在对应平台 `npm install` 重建。部署脚本需要它写种子数据。 |

---

## 2. 合约 revert 自定义错误对照

下单/证明阶段最常见的自定义错误（钱包会显示错误名或 selector）：

| 错误 | 含义 / 排查 |
|---|---|
| `BuyerBindingNotSet` / `MerchantBindingNotSet` | 买方/商家未先 `setPlatformBinding` 绑定支付账户 |
| `SelfTradeNotAllowed` | 买方 = 商家，禁止自成交 |
| `ExceedsUsdCap` | 下单金额超 `maxOrderAmount`（默认 1000×1e18，admin 可调） |
| `MerchantClosed` | 当前不在商家营业时段；用 `openNow` 或设营业时间 |
| `RateNotPublished` / `RateExpired` | 商家未发布汇率或汇率已过期 |
| `InsufficientAvailable` | 商家 collateral 可用额度不足（`collateral - pending < amount`） |
| `AlreadyHasActiveOrder` | 同一买家对同产品已有活跃订单（I₂ 单活跃订单不变式） |
| `OutOfDeadline` | 超过 15 分钟订单截止时间才提交证明 |
| `OrderBindingHashMismatch` | 证明的 `orderBindingHash` 与链上重建值不符（订单参数/账户/rateVersion 任一不一致） |
| `SessionAlreadyUsed` | 该 `sessionId` 已用过（重放防护） |
| `WrongChainId` | 证明的 chainId ≠ 当前链 |
| `UntrustedVerifier` | 签名恢复地址不在 `trustedVerifiers`（验证器签名私钥与注册地址不匹配） |
| `NotTrustedPaymentServer` | 证明的 `serverName` 不在受信支付服务器名单 |
| `CommitmentsHashMismatch` / `CommitmentOpeningMismatch` | 承诺被篡改或揭示项与承诺不一致 |
| `PaymentAmountMismatch` / `CurrencyMismatch` | 平台验证器：金额/币种与订单不符 |
| `AlipayTransferTooOld` / `WiseTransferTooOld` | 支付时间早于订单创建时间（旧转账复用防护） |
| `TransferDateExpired` / `AlipayTransferDateExpired` | 支付时间晚于订单截止时间 |
| `DuplicateAlipayOrderId` / `DuplicateTransferId` | 平台层交易 ID 已用过（重放防护） |
| `OrderCancellationDisabled` | `cancelOrder` 已禁用（V4 设计，无主动撤单） |
| `UserBlacklisted` / `UserTemporarilyFrozen` | 风控黑名单 / 临时冻结期内 |
| `ContractPaused` | 合约被 admin 暂停 |

> [!TIP]
> 完整列表见 [C2CTypes.sol:108-194](../../../tlsn-extension/packages/contracts/contracts/C2CTypes.sol#L108-L194)。

---

## 3. 证明生成阶段

| 现象 | 原因 / 解决 |
|---|---|
| 扩展与 notary 版本不匹配 | 扩展版本**必须**与连接的 notary/验证器版本一致（[README 警告](../../../tlsn-extension/README.md)），否则 MPC-TLS 握手失败。 |
| WASM 执行被 CSP 拦截 | 扩展 manifest 需 `content_security_policy: wasm-unsafe-eval`（已配置）；自建页面集成时注意放行 WASM。 |
| 大响应体证明很慢/卡住 | 浏览器 WASM 在响应体 >5–10 KB 后非线性变慢（见 [06-evaluation §3](../deep-dive/06-evaluation.md)）；本系统 API 响应 2–5 KB 属正常区间。 |
| 弱网（高延迟+低带宽）握手超时 | TLSNotary 存在最低网络质量门槛：3G（300ms/2Mbps）下握手必超时（[06-evaluation §4.4](../deep-dive/06-evaluation.md)）。 |
| MPC-TLS 连接需经 WebSocket 代理 | 见下方 Websockify。 |

### Websockify（TLS 经 WebSocket 代理）

```bash
git clone https://github.com/novnc/websockify && cd websockify && ./docker/build.sh
# 例：代理 api.x.com:443
docker run -it --rm -p 55688:80 novnc/websockify 80 api.x.com:443
```

`prove()` 的 `proxyUrl` 指向代理（如 `wss://notary.pse.dev/proxy?token=<host>` 或本地 websockify），把 HTTPS 经 WebSocket 转发给浏览器侧 TLS 操作。

---

## 4. Gas 与链上

| 现象 | 原因 / 解决 |
|---|---|
| `placeOrder` Gas 估算失败 | 多因前置校验会 revert（绑定未设、超额、营业时段等，见 §2）；先排除 revert 再估 Gas。演示部署已为账户预授权 escrow + BondVault。 |
| 领取保证金没到账 | 结算是 **pull 模式**：成功/超时后 bond 记入 `claimable`，需自行调 `C2CBondVault.claim(token)`（[:126](../../../tlsn-extension/packages/contracts/contracts/C2CBondVault.sol#L126)）。 |
| 过期订单状态没变 | 清理非自动：需任何人调 `sweepExpired*` 或由 keeper 触发；或下个 `placeOrder` 会顺带 `_cleanupExpired`。 |

---

## 5. FAQ

- **Q：必须有真实支付宝/Wise 账号吗？** A：跑通协议正确性不需要——`npx hardhat test` 用程序化构造的证明覆盖全流程。完整真实换汇才需要（见 [02-demo-walkthrough.md](02-demo-walkthrough.md)）。
- **Q：验证服务器能跑在 Windows 吗？** A：可以，但作者环境为 WSL2 Ubuntu，建议在 WSL/Linux 下跑 `cargo run`。
- **Q：chainId 是多少？** A：本地 `31337`（Hardhat）。

---

> [!TIP]
> 仍卡住？对照 [01-quickstart.md](01-quickstart.md) 的成功判据逐项排查；理解机制看 [deep-dive/](../deep-dive/01-overview.md)。

---

<div align="center">

◀ 上一篇 [02 · 演示走查](02-demo-walkthrough.md) · 🏠 [文档导航](../README.md) · 🧠 [深度轨](../deep-dive/01-overview.md)

</div>
