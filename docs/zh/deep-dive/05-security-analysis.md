# 安全分析

> [!NOTE]
> **本篇导读**
> - **定位**：论证系统如何达成五项安全目标 S1–S5，并分析经济安全与关键权衡。
> - **读者**：深度轨。前置 [03-threat-model.md](03-threat-model.md)（威胁与信任假设 T1–T5）、[04-protocol-design.md](04-protocol-design.md)（机制）。
> - **论文来源**：ch4.7、ch4.8。事实以源码为准。

**目录**：[三层映射](#1-三层映射安全目标--信任假设--协议机制) · [S1 不可伪造](#2-s1--支付证明不可伪造性) · [S2 抗重放](#3-s2--证明抗重放性) · [S3 账户隐私](#4-s3--账户隐私保护) · [S4 信任最小化](#5-s4--验证节点信任最小化) · [S5 插件隔离](#6-s5--插件执行安全隔离) · [经济安全](#7-经济安全超出-s1s5) · [关键权衡](#8-关键权衡)

---

## 1. 三层映射：安全目标 ↔ 信任假设 ↔ 协议机制

系统安全不靠单一机制，而是合约层、证明层、验证层协同（论文 ch4.7.1）。每项目标依赖一个**最小信任假设子集**：

| 目标 | 含义 | 依赖假设 | 核心机制 | 代码证据 |
|---|---|---|---|---|
| **S1** | 支付证明不可伪造 | T1∧T2∧T3∧T4 | TLS 真实性 + 选择性披露完整性 + 订单绑定不可分离 | `_recoverVerifierSigner`、`_verifyCommitment*`、`_requireOrderBinding` |
| **S2** | 证明抗重放 | T1 | H_bind 跨订单绑定 + 会话去重 U_sess | `_checkAndMarkSessionId` + `_computeOrderBindingHash` |
| **S3** | 账户隐私 | T2∧T4 | 链上哈希承诺 + 链下 Pedersen/MPC 一致性校验 | `PlatformBinding`(哈希) + 链下 accountCheck |
| **S4** | 验证节点信任最小化 | T1∧T2∧T3 | 资产无关 + 注册强制 + 订单绑定强制 + MPC 约束 | `trustedVerifiers` + 五步流水线 |
| **S5** | 插件执行隔离 | T5 | QuickJS WASM 沙箱能力限制 | `plugin-sdk` 沙箱配置 |

> [!NOTE]
> 信任假设 T1（链共识）/T2（密码学）/T3（VS 诚实执行 MPC-TLS，honest-but-curious）/T4（账户标识语义真实）/T5（用户设备未被 root 入侵）的完整定义见 [03-threat-model.md](03-threat-model.md)。

---

## 2. S1 — 支付证明不可伪造性

**成立条件 T1∧T2∧T3∧T4**（论文 ch4.8.1）。三层递进约束：

1. **TLS 传输真实性（T2）**：MPC-TLS 要求 VS 与支付平台 PP 协作建 TLS 会话，对称密钥双方联合派生，任一方无法单独持完整密钥 → 攻击者无法在不与 PP 建立真实连接下使 VS 对伪造响应产生有效承诺。链下逻辑见 [verifier/src/verifier.rs](../../../tlsn-extension/packages/verifier/src/verifier.rs)。
2. **选择性披露完整性（T2）**：VS 签名覆盖承诺集合 `{cᵢ}`，每个 `cᵢ` 是响应字节区间承诺；篡改承诺使签名失效。链上校验 [`_verifyCommitmentOpenings`/`_verifyCommitmentsHash`, TLSNVerifier.sol:246-270](../../../tlsn-extension/packages/contracts/contracts/TLSNVerifier.sol#L246-L270)。
3. **订单绑定不可分离（T2）**：签名摘要嵌入 `H_bind`（见 [04 §6.2](04-protocol-design.md)）；攻击者无法为参数不一致订单构造合法签名。

链上 [`verifyAndDelegate`](../../../tlsn-extension/packages/contracts/contracts/TLSNVerifier.sol#L196-L223) 依次执行 ECDSA 签名者校验（[`_recoverVerifierSigner`:272-285](../../../tlsn-extension/packages/contracts/contracts/TLSNVerifier.sol#L272-L285)，查 `trustedVerifiers`）、H_bind 一致性、平台业务校验。在 T1∧T2∧T3 下伪造证明通过全部校验的概率可归约至密码学困难问题，对 PPT 攻击者可忽略。

> [!NOTE]
> 密码学不可伪造性仅保证「证明内容 = PP 实际返回的响应」；支付事实的**语义真实性**还依赖 T4。测试佐证：`ESC-ATT-01/05`（错误 H_bind / 篡改签名）、`ESC-TAMPER-01/02` 均按预期 revert。

---

## 3. S2 — 证明抗重放性

**成立条件 T1**（论文 ch4.8.2）。两套**正交**机制：

- **跨订单重放防护**：签名摘要绑定含 `orderId` 的 `H_bind`；O₁ 的证明提交到 O₂ 会因 H_bind 不符被拒。
- **同订单重复提交防护**：链上维护已用会话集合 `U_sess`，`sid` 首次验证后写入（[`_checkAndMarkSessionId`, TLSNVerifier.sol:240-244](../../../tlsn-extension/packages/contracts/contracts/TLSNVerifier.sol#L240-L244)），重复提交因成员检查失败被拒。

此外平台层还有 `usedAlipayOrderIds`/`usedTransferIds` 第三层去重，及 paramsData 的支付时间窗下限（防旧转账复用）。测试佐证：`ESC-ATT-04`（重放 sessionId）、`WISE-ATT-01`/`ALI-ATT-01`（跨订单 txId 重放）、`INT-10`（跨平台 sessionId 复用）均拒绝。

---

## 4. S3 — 账户隐私保护

**成立条件 T2∧T4**（论文 ch4.8.3）。三层：

1. **链上**：合约仅存账户标识的 keccak256 承诺（[`setPlatformBinding`, C2CAdmin.sol:264-278](../../../tlsn-extension/packages/contracts/contracts/C2CAdmin.sol#L264-L278)；`PlatformBinding`/`BuyerPaymentInfo` 结构），明文不上链。
2. **公证证明**：账户标识字段采 Pedersen 承诺处理，原始标识仅存于本地与 VS 的 MPC 环境。
3. **协议执行**：收付款账户一致性校验在 MPC 环境完成（链下 accountCheck，[verifier/src/main.rs:1366-1422](../../../tlsn-extension/packages/verifier/src/main.rs#L1366-L1422)），链上只验承诺一致性。

> [!TIP]
> 账户身份匹配在**链下 VS** 完成（论文 ch4.4.2/S3），链上平台验证器不做账户比对——这是有意设计：当前无法在不泄露隐私下链上验证身份，链上的账户校验入口预留给未来完全去中心化阶段。详见 [04 §7](04-protocol-design.md)。

> [!IMPORTANT]
> **隐私局限（论文 ch6.5）**：当前账户承诺为**无盐** keccak256，掌握候选账户集的攻击者可批量枚举匹配，隐匿强度退化为候选空间规模函数。改进方向：以 `H(accountId ‖ orderId ‖ chainId)` 派生盐绑定每笔订单。另：演示部署中支付宝因证明只揭示**掩码**身份，绑定对掩码值取承诺（[deploy-web.ts:44-61](../../../tlsn-extension/packages/contracts/scripts/deploy-web.ts#L44-L61)）。

---

## 5. S4 — 验证节点信任最小化

**成立条件 T1∧T2∧T3**（论文 ch4.8.4）。四重约束把对 VS 的信任压到最小（仅 T3：诚实执行 MPC-TLS）：

1. **资产无关性**：VS 仅能对会话摘要签名，签名的链上效力仍须过合约多重验证，不能直接动资产。
2. **注册强制**：VS 链上身份须在 `trustedVerifiers` 注册（[TLSNVerifier.sol:236](../../../tlsn-extension/packages/contracts/contracts/TLSNVerifier.sol#L236)），未注册签名一律拒。
3. **订单绑定强制**：所有签名须含正确 `H_bind`，VS 无法为参数不一致订单构造合法绑定。
4. **MPC-TLS 约束**：T2 下 VS 无法独立伪造 PP 的 HTTPS 响应，签名能力仅限背书真实参与计算的会话。

设计理念与 Optimistic Rollup 对序列器的最小信任一致。测试佐证：`ADM-ATT-02`（自有私钥伪造 → `UntrustedVerifier`）、`WISE-ATT-08`/`ALI-ATT-08`（不可信 payment server 拒绝）。

---

## 6. S5 — 插件执行安全隔离

**成立条件 T5**（论文 ch4.8.5）。第三方插件在 QuickJS WebAssembly 沙箱执行（[plugin-sdk/src/index.ts:455-463](../../../tlsn-extension/packages/plugin-sdk/src/index.ts#L455-L463)，`allowFetch:false, allowFs:false`）：

- **能力限制**：沙箱仅暴露 Host 显式声明的受控接口（`prove`/`openWindow`/`done` 等经 env 注入），对宿主内部状态、私钥、其他窗口数据、系统接口的访问在基础设施层禁止，不依赖插件自律。
- **运行时权限校验**：插件须声明所需权限，每次调用比对，超范围调用被拦截。

若用户设备遭 root 入侵（T5 不成立），隔离弱化——属已知局限（论文 ch6.5）。

---

## 7. 经济安全（超出 S1–S5）

论文 ch4.7.3。两类经济攻击：

### 7.1 商家拒付攻击
在 T1∧T2∧T3 下不具技术可行性：
- **CRYPTO**：商家预锁币，买方付款后**自主**调用释放接口，全程不需商家在线/授权（[`payOrderByPlatform`](../../../tlsn-extension/packages/contracts/contracts/C2CEscrow.sol#L609)），商家不合作无影响。
- **FIAT**：商家拒付→无法生成证明→买方超时取回锁定资产 + 没收商家 bond；商家付后拒提交证明→等同放弃币权，超时同样没收 bond。
- **虚假收款账户替换**：账户哈希纳入 `H_bind`，中途换账户→链上校验失败。

### 7.2 流动性耗尽攻击
两层经济约束：
- **第一层**：每次违约直接没收当次 bond（[`onTimeout`, C2CRiskManager.sol:172-193](../../../tlsn-extension/packages/contracts/contracts/C2CRiskManager.sol#L172-L193) + [`BondVault.settle`](../../../tlsn-extension/packages/contracts/contracts/C2CBondVault.sol#L84)），攻击总成本随并发订单线性增长。
- **第二层**：信誉动态调高 `bondBps`、达阈值临时封禁，单次攻击成本递增。

> [!IMPORTANT]
> **参数敏感性局限**（论文 ch4.7.3 + ch6.5）：若 `bondBps` 设置偏低，大资金攻击者仍可承受较小相对损失持续攻击。参数 `setRiskConfig` 可调（[C2CRiskManager.sol:86-102](../../../tlsn-extension/packages/contracts/contracts/C2CRiskManager.sol#L86-L102)），须按资产规模与风险收益比权衡。测试 `BOND-19`：极大 stepBps → 返回 maxBondBps 不 panic。

---

## 8. 关键权衡

| 权衡 | 说明 | 缓解方向 |
|---|---|---|
| 公证节点可用性单点 | VS 单节点离线中断证明流程；但**仅影响可用性，不危及已托管资产**（双域失效解耦） | `m-of-n` 阈值签名（增通信轮次 + 密钥管理复杂度） |
| 链上可观察信息 | 订单金额明文、账户承诺确定性固定，可被统计分析 | 金额范围证明（Bulletproofs）、账户派生盐（不改核心合约即可扩展） |
| 串谋边界 | T3 建模为 honest-but-curious；纯串谋在 T2/T3 至少一成立时失效；侧信道漏洞是残余风险 | TEE 隔离公证计算、MPC 实现形式化验证 |

> [!TIP]
> 半去中心化双域架构（去中心化域 𝒟 + 受约束中心化域 𝒞）的失效模式完全解耦：VS 协议外失效（作弊）在 T2 下也无法产生有效虚假证明（链上验证失败）。详见 [03-threat-model.md](03-threat-model.md)、[01-overview.md](01-overview.md)。实测局限见 [06-evaluation.md §5](06-evaluation.md)。

---

<div align="center">

◀ 上一篇 [04 · 协议设计](04-protocol-design.md) · 🏠 [文档导航](../README.md) · 下一篇 ▶ [06 · 评估](06-evaluation.md)

</div>
