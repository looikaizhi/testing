# 协议与系统设计 ⭐

> **本篇定位**：协议与系统设计主篇，含两大创新。读懂这一篇就读懂了论文工作。
> **读者**：深度轨。前置 [01-overview.md](01-overview.md)、[02-zktls-tlsnotary.md](02-zktls-tlsnotary.md)；配套 [reference/contracts.md](../reference/contracts.md)、[reference/code-map.md](../reference/code-map.md)。
> 论文来源：ch4.1–4.6。事实以源码为准。

---

## 1. 分层架构与组件

四层垂直分离（论文 ch4.1.1），跨层依赖固化为标准接口：

| 层 | 职责 | 代码包 |
|---|---|---|
| 链上合约层 | 资产托管、订单状态机、证明核验、风控、保证金 | [`contracts`](../../../tlsn-extension/packages/contracts/) |
| 链下证明层 | 浏览器扩展（证明器）+ 验证服务器（VS） | [`extension`](../../../tlsn-extension/packages/extension/) + [`verifier`](../../../tlsn-extension/packages/verifier/) + [`plugin-sdk`](../../../tlsn-extension/packages/plugin-sdk/) |
| 支付平台对接层 | 第三方支付 HTTPS 接口（支付宝/Wise），无需改造 | — |
| 前端交互层 | 买方/商家 Web 界面，不持私钥 | [`web`](../../../tlsn-extension/packages/web/) |

链上与链下的**唯一耦合点** = 证明提交接口 + 事件订阅通道。详细包职责见 [code-map.md](../reference/code-map.md)。

---

## 2. CRYPTO / FIAT 双协议镜像

两类产品在三维度构成完全镜像（论文 ch4.1.2），共享同一套合约逻辑与平台验证器接口，差异仅在订单初态、证明方角色、保证金来源的参数化：

| 维度 | CRYPTO 产品（商家卖币） | FIAT 产品（商家收币） |
|---|---|---|
| 资产流向 | 商家锁币 → 买方付法币 → 释放币给买方 | 买方锁币 → 商家付法币 → 释放币给商家 |
| 付款举证方 | **买方**（付法币 + 生成证明） | **商家**（付法币 + 生成证明） |
| 保证金来源 | 买方下单时存入 bond | 商家 bond 从 collateral 划出 |
| 订单初态 | `PENDING` | `WAITING` |
| 结算函数 | [`payOrderByPlatform`](../../../tlsn-extension/packages/contracts/contracts/C2CEscrow.sol#L609) | [`receiveCryptoWithPlatformPayment`](../../../tlsn-extension/packages/contracts/contracts/C2CEscrow.sol#L670) |

代码中 `placeOrder` 的两分支即此镜像：CRYPTO 买方缴 bond（[C2CEscrow.sol:503-528](../../../tlsn-extension/packages/contracts/contracts/C2CEscrow.sol#L503-L528)），FIAT 商家 bond 从 collateral 划（[:537-565](../../../tlsn-extension/packages/contracts/contracts/C2CEscrow.sol#L537-L565)）。

---

## 3. 链上合约层（五合约）

五个核心合约 + 各平台验证器，托管合约为唯一写入入口（论文 ch4.2.1）：

```
用户 ──→ C2CEscrow（唯一写入入口）──→ TLSNVerifier ──注册表──→ platforms/*Verifier
              │                          
              ├──→ C2CRiskManager（信誉/保证金率）
              ├──→ C2CBondVault（保证金托管/结算）
              └──(只读)──→ C2CAdmin（资产/商家/汇率/白名单）
```

合约接口、事件、权限速查见 [contracts.md](../reference/contracts.md)。「单写入入口 + 只读配置中心 + 注册表分发」结构在模块化的同时满足 EVM 24.5 KB 合约大小限制。

---

## 4. 订单状态机

有限状态自动机（论文 ch4.2.5、式 eq:ch4-order-fsm）：

```
            placeOrder(CRYPTO)              payOrderByPlatform(证明通过)
   ●─────────────────────────→ PENDING ─────────────────────────────→ COMPLETED ●
                                  │
                                  │ 超时(>deadline) sweepExpired*(任何人)
                                  ↓
                               EXPIRED ●

            placeOrder(FIAT)               receiveCryptoWithPlatformPayment(证明通过)
   ●─────────────────────────→ WAITING ─────────────────────────────→ COMPLETED ●
                                  │ 超时
                                  ↓
                               EXPIRED ●
```

- `Q = {PENDING, WAITING, COMPLETED, EXPIRED}`，终态 `F = {COMPLETED, EXPIRED}`（[C2CTypes.sol:13-18](../../../tlsn-extension/packages/contracts/contracts/C2CTypes.sol#L13-L18)）。
- `cancelOrder` **禁用**（[:601-603](../../../tlsn-extension/packages/contracts/contracts/C2CEscrow.sol#L601-L603) revert `OrderCancellationDisabled`）。
- 四条结构不变式：I₁ 资金守恒、I₂ 单活跃订单、I₃ 终态不可逆、I₄ 保证金绑定（论文 ch4.2.5）。
- **超时清理 permissionless**：任何人可调 `sweepExpired*`（[:889-908](../../../tlsn-extension/packages/contracts/contracts/C2CEscrow.sol#L889-L908)），链下 [keeper](../../../tlsn-extension/packages/keeper/) 仅为便利角色，不掌握特权。

> 状态名以买方视角命名：`PENDING`=买方待举证，`WAITING`=买方等商家举证。

---

## 5. 链下证明层

论文 ch4.3。三项工程化决策：

1. **VS 直接担任 MPC-TLS 验证方**：取消 TLSNotary 原协议的独立 Notary 角色，由业务验证服务器 VS 直接参与 TLS 密钥分割并签名，把「Notary 签名→业务复核」两段信任链压缩为一段。
2. **QuickJS 沙箱隔离**：插件运行于 WASM 沙箱，屏蔽宿主网络/文件系统，能力经 Host 注入（[plugin-sdk/src/index.ts:455-463](../../../tlsn-extension/packages/plugin-sdk/src/index.ts#L455-L463)）。详见 [05-security-analysis.md](05-security-analysis.md) S5。
3. **Service Worker + Offscreen Document 解耦**：证明计算在离屏文档，避免阻塞请求管理事件循环。

证明元组 `π = (σ_VS, {cᵢ}, H_bind, sid)`（论文式 eq:ch4-proof-tuple）。生成流程：HTTP 响应截取 → 选择性承诺计算 → VS 签名（含订单绑定扩展）。原理详见 [02-zktls-tlsnotary.md](02-zktls-tlsnotary.md)。

---

## 6. 创新①：选择性披露规范与订单绑定摘要

### 6.1 选择性披露（Handler）

字段级控制（[plugin-sdk](../../../tlsn-extension/packages/plugin-sdk/)）：每个 Handler 声明 方向(`SENT`/`RECV`) + 报文部分 + 动作(`REVEAL`/`PEDERSEN`) + 可选粒度参数。
- `REVEAL`：输出明文片段 + 盲化因子，链上可验证承诺开启。
- `PEDERSEN`：仅输出承诺哈希，明文与盲化因子不离开本地。

承诺实例化为链上原生 `keccak256`：`cᵢ = keccak256(bytes(fᵢ) ‖ rᵢ)`；聚合 `H_comm = keccak256(c₁ ‖ … ‖ cₙ)`（论文式 eq:ch4-commit-item/agg）。本系统披露率 20%–35%（金额/时间明文，账户哈希承诺）。

### 6.2 订单绑定哈希 H_bind（核心创新）

每笔订单创建时计算，把链下证明与特定链上订单 + 收付款账户**密码学绑定**。

**共 15 个字段** keccak256（[`_computeOrderBindingHash`, C2CEscrow.sol:381-413](../../../tlsn-extension/packages/contracts/contracts/C2CEscrow.sol#L381-L413)）：

```
H_bind = keccak256(
  escrow, chainId, merchant, buyer, productId, orderId, assetType,
  amount, rate, rateVersion, deadline,
  merchantNameHash, merchantIdHash, payeeNameHash, payeeIdHash )
```

`H_bind` 在链下作为 sessionData 传入，被 VS 签名摘要覆盖；链上以相同参数重建并比对（[`_requireOrderBinding`:423-425](../../../tlsn-extension/packages/contracts/contracts/C2CEscrow.sol#L423-L425)）。**任何参数篡改 → 重建的 H_bind 不符 → 签名恢复地址不在白名单 → 拒绝**。这从根本上消除「把合法证明移植到另一订单」的重放空间，无需额外时序约束。

> 💡 15 个字段里，4 个账户哈希（商家与买方收付款方各 name+id）直接平铺进绑定，把收付款账户身份一并锁定；`rateVersion` 把成交汇率版本也纳入绑定——用新汇率版本对旧订单生成的证明会因 H_bind 不符被拒（汇率快照测试 `RATE-07` 验证）。

另有 `orderKey`（保证金隔离键）= 6 字段（[`_orderKey`:431-440](../../../tlsn-extension/packages/contracts/contracts/C2CEscrow.sol#L431-L440)）：`keccak256(escrow, chainId, merchant, productId, assetType, orderId)`。

---

## 7. 平台验证器

论文 ch4.4。统一接口 `IPlatformVerifier`，五步密码学校验由 `TLSNVerifier` 完成后，委托平台验证器做业务规则匹配。接口、支付宝/Wise 规则、接入新平台步骤详见 [verifier-plugin.md](../reference/verifier-plugin.md)。

**账户身份核验在链下 VS 完成**（论文 ch4.4.2）：VS 在签名前从响应报文提取收款方账户标识，与商家链上预注册的账户哈希**链下比对**；通过后才签名。TLSNProof 结构体不含账户明文，VS 签名的存在性即证明账户核验已过。Wise 的 contacts 证明在双证明流程中同样须通过密码学核验且 serverName 受信，其账户内容由 VS 链下核验。

> 💡 **设计意图**：链上平台验证器不做账户比对，账户匹配设计在链下——当前无法在不泄露隐私的前提下于链上验证身份（对整个协议直接套 zk 会显著增加时延与手续费，对各方不利），故采用「链下 accountCheck + 验证器签名」的务实方案；链上的账户校验入口预留给未来完全去中心化阶段（zkTLS 性能达标后可平滑迁移上链）。

**paramsData = 4 字段**：`(fiatAmountX1000, targetCurrency, orderDeadline, orderCreationTime)`，支付时间须落在 `[创建, 截止]` 窗口内，防止旧/过期转账被复用（[IPlatformVerifier.sol:10-18](../../../tlsn-extension/packages/contracts/contracts/interfaces/IPlatformVerifier.sol#L10-L18)）。

---

## 8. 风险管理

论文 ch4.5。双边保证金 + 动态比率 + 信誉递进。详细参数见 [contracts.md §2.3](../reference/contracts.md)。

- **保证金额**：`bond = amt × bondBps / 10000`（论文式 eq:ch4-bond-calc；代码 `Math.mulDiv`, [C2CEscrow.sol:505,539](../../../tlsn-extension/packages/contracts/contracts/C2CEscrow.sol#L505)）。下单时快照 bps，存续期不变。
- **分级比率**：`bondBps(ℓ) = clamp(base + ℓ×step, min, max)`。默认 base=1000(10%)、step=300(3%/级)、min=500(5%)、max=10000(100%)；ℓ=10 → 40%（未触 100% 上限；上限为可调极端值，监管收紧时可调高 base/step）。
- **信誉递进**：超时→等级+1 与连续超时计数+1（连续超时按 1/2/3 递进，[onTimeout:172-193](../../../tlsn-extension/packages/contracts/contracts/C2CRiskManager.sol#L172-L193)）；成功→连续超时归零、连续完成达 3 次降 1 级；累计超时达 15 次→临时冻结 30 天；信誉随时间衰减（90 天/级）。
- **保证金库订单级隔离 + 幂等结算**（[C2CBondVault.sol](../../../tlsn-extension/packages/contracts/contracts/C2CBondVault.sol)）：成功退证明方、超时归对手方。
- **pull 模式结算**：保证金先 `_credit` 进 claimable，用户自行 `claim()` 取回；`initClaimable` 写哨兵值预热存储槽以省 gas（见 [contracts.md §2.4](../reference/contracts.md)）。

双边保证金构成「对称违约激励」：任一方违约（超时）→ 没收其 bond 归对手方。经济安全分析见 [05-security-analysis.md](05-security-analysis.md)。

---

## 9. 合规字段与 Webhook

论文 ch4.6。双通道归档：

- **链上事件**：证明通过/超时/结算等节点触发事件，永久记录买卖双方地址、账户标识哈希（不暴露明文）、金额/汇率、时间戳、平台侧交易标识，满足 FATF R.11 五年留存。
- **链下 Webhook**：VS 验证通过后异步推送 `SlimWebhookPayload`（仅 Travel Rule 字段 + 揭露范围偏移，**不含明文/原始转录**），按 server name 差异化路由（支持 `*` 通配），fire-and-forget（推送失败不阻塞主链路）。实现与配置见 [verifier-plugin.md §5](../reference/verifier-plugin.md)。

---

> 安全目标如何由这些机制保障，见 [05-security-analysis.md](05-security-analysis.md)；实测性能见 [06-evaluation.md](06-evaluation.md)；密码学原理见 [02-zktls-tlsnotary.md](02-zktls-tlsnotary.md)。
