# 演示走查：完整换汇全流程

> **本篇定位**：跟作者真实环境走完一笔完整换汇，作参照（多数同学无法复现真实支付宝/Wise）。
> **读者**：动手轨。
> **来源**：合约函数/事件（`packages/contracts`）+ 部署种子数据（[deploy-web.ts](../../../tlsn-extension/packages/contracts/scripts/deploy-web.ts)）。

> ⚠️ **验证状态**：本篇步骤的**合约函数与事件**均与源码核对一致；**截图/录屏为占位**（`docs/assets/screenshots/`、`docs/assets/demo/` 待作者用真实环境补录）。真实换汇全流程需真实支付宝/Wise 账号，无法在自动环境复现。

---

## 场景设定

部署脚本种子数据（[deploy-web.ts:638-661](../../../tlsn-extension/packages/contracts/scripts/deploy-web.ts#L638-L661)）：1 个商家（Hardhat account[1]）、4 个产品：

| 产品 | 类型 | 法币 | 加密 | 平台 | 汇率 |
|---|---|---|---|---|---|
| CRYPTO #0 | 买方付法币得币 | MYR | USDT | Wise | 0.02 MYR/USDT |
| CRYPTO #1 | 买方付法币得币 | CNY | USDT | Alipay | 0.01 CNY/USDT |
| FIAT #0 | 买方锁币商家付法币 | MYR | USDT | Wise | — |
| FIAT #1 | 买方锁币商家付法币 | CNY | USDT | Alipay | — |

下面以 **CRYPTO #1（支付宝，买方付 CNY 得 USDT）** 为例走完五步。

---

## ① 管理员配置

部署脚本已自动完成（生产环境由 admin 手动）：注册加密/法币资产、注册商家、添加受信任验证器与支付服务器、注册平台验证器。

| 在干什么 | 合约函数 | 事件 |
|---|---|---|
| 注册支持的加密/法币资产 | `C2CAdmin.addCryptoInfo`/`addFiatInfo`（[:128](../../../tlsn-extension/packages/contracts/contracts/C2CAdmin.sol#L128)/[:143](../../../tlsn-extension/packages/contracts/contracts/C2CAdmin.sol#L143)） | `SupportCryptoAdded`/`SupportFiatAdded` |
| 信任验证器/支付服务器 | `TLSNVerifier.addTrustedVerifier`/`addTrustedPaymentServer`（[:119](../../../tlsn-extension/packages/contracts/contracts/TLSNVerifier.sol#L119)/[:139](../../../tlsn-extension/packages/contracts/contracts/TLSNVerifier.sol#L139)） | `TrustedVerifierAdded`/`TrustedPaymentServerAdded` |
| 注册平台验证器 | `TLSNVerifier.setPlatformVerifier`（[:154](../../../tlsn-extension/packages/contracts/contracts/TLSNVerifier.sol#L154)） | `PlatformVerifierSet` |

> 默认信任支付服务器：`wise.com`、`mbillexprod.alipay.com`（[deploy-web.ts:406](../../../tlsn-extension/packages/contracts/scripts/deploy-web.ts#L406)）。
> 截图占位：`docs/assets/screenshots/01-admin-console.png`

## ② 商家入驻挂单

| 在干什么 | 合约函数 | 事件 |
|---|---|---|
| 商家注册（需 KYB） | `C2CAdmin.registerMerchant`（KYB 证明）/`registerMerchantByAdmin` | `MerchantRegistered` |
| 绑定支付账户（仅存哈希承诺） | `C2CAdmin.setPlatformBinding`（[:264](../../../tlsn-extension/packages/contracts/contracts/C2CAdmin.sol#L264)） | `PlatformBindingSet` |
| 上架产品 | `C2CEscrow.listCryptoProduct`/`listFiatProduct`（[:261](../../../tlsn-extension/packages/contracts/contracts/C2CEscrow.sol#L261)/[:287](../../../tlsn-extension/packages/contracts/contracts/C2CEscrow.sol#L287)） | `ProductListed` |
| 发布汇率（×1e8 编码） | `C2CAdmin.publishRate`（[:308](../../../tlsn-extension/packages/contracts/contracts/C2CAdmin.sol#L308)） | `RatePublished` |
| 开启营业 | `C2CAdmin.openNow`（[:343](../../../tlsn-extension/packages/contracts/contracts/C2CAdmin.sol#L343)） | `ManualOverrideSet` |

> 账户绑定上链的是 `nameHash`/`idHash`（keccak256 承诺），明文 + 随机 salt 存链下 DB；支付宝因证明只揭示**掩码**身份，绑定对掩码值取承诺。详见 [deep-dive/05 §4](../deep-dive/05-security-analysis.md)。
> 截图占位：`docs/assets/screenshots/02-merchant-listing.png`

## ③ 买方下单链上锁仓

| 在干什么 | 合约函数 | 事件 |
|---|---|---|
| 买方绑定自己的收款账户 | `C2CAdmin.setPlatformBinding` | `PlatformBindingSet` |
| 下单 + 双层锁定 | `C2CEscrow.placeOrder`（[:446](../../../tlsn-extension/packages/contracts/contracts/C2CEscrow.sol#L446)） | `OrderPlaced` + `OrderStatusChanged` |

`placeOrder` 内部（CRYPTO 分支）：查 `requiredBondBps` → 买方缴 bond 转入 BondVault（[:503-528](../../../tlsn-extension/packages/contracts/contracts/C2CEscrow.sol#L503-L528)）→ 商家 collateral 标记 `pendingAmount` → 计算 15 字段 `H_bind`（[:381-413](../../../tlsn-extension/packages/contracts/contracts/C2CEscrow.sol#L381-L413)）→ 订单初态 **PENDING**，deadline = now + 15 分钟。

> 前置校验：自成交禁止 `SelfTradeNotAllowed`、买方须先绑定支付账户 `BuyerBindingNotSet`、USD 单笔上限 `ExceedsUsdCap`、营业时段 `MerchantClosed`。
> 截图占位：`docs/assets/screenshots/03-place-order.png`

## ④ 真实支付 + 生成证明

| 在干什么 | 组件 |
|---|---|
| 买方在支付宝向商家收款账户转 CNY | 真实支付平台 |
| 扩展发起公证：MPC-TLS 抓取支付宝订单 API 响应 | 扩展 + `plugin-sdk` 的 `prove()` |
| VS 链下核验账户（accountCheck）+ 签名（含 H_bind） | [`verifier`](../../../tlsn-extension/packages/verifier/) |

产物 = 证明元组 `π = (σ_VS, {cᵢ}, H_bind, sid)`。原理见 [deep-dive/02-zktls-tlsnotary.md](../deep-dive/02-zktls-tlsnotary.md)。
> 录屏占位：`docs/assets/demo/04-proof-generation.gif`

## ⑤ 链上验证与结算

| 在干什么 | 合约函数 | 事件 |
|---|---|---|
| 买方提交证明、链上核验后放币 | `C2CEscrow.payOrderByPlatform`（[:609](../../../tlsn-extension/packages/contracts/contracts/C2CEscrow.sol#L609)） | `OrderStatusChanged`(COMPLETED) + `OrderProofLinked` |

内部：`verifyAndDelegate`（五步密码学校验 + 委托支付宝验证器业务校验）→ 通过则放 USDT 给买方、退买方 bond（pull，需 `claim()`）、通知 RiskManager `onCompleted`。

> FIAT 产品对称：商家付法币 → `receiveCryptoWithPlatformPayment`（[:670](../../../tlsn-extension/packages/contracts/contracts/C2CEscrow.sol#L670)）。
> 若买方超时未提交证明 → 任何人可 `sweepExpired*` 清理 → 状态 EXPIRED、bond 归商家。
> 截图占位：`docs/assets/screenshots/05-settlement.png`

---

> 各步对应的设计原理见 [deep-dive/04-protocol-design.md](../deep-dive/04-protocol-design.md)；合约接口见 [reference/contracts.md](../reference/contracts.md)；卡住了看 [03-troubleshooting.md](03-troubleshooting.md)。
