# 威胁模型与信任假设

> **本篇定位**：讲清"为什么这样设计"——攻击者能力、STRIDE 威胁分类、信任假设 T1–T5、半去中心化的定义与合理性。
> **读者**：深度轨。后接 [04-protocol-design.md](04-protocol-design.md)（机制）、[05-security-analysis.md](05-security-analysis.md)（S1–S5 论证）。
> 论文来源：ch3.1、ch3.5、ch3.6。事实以源码为准。

---

## 1. 攻击者能力假设

所有攻击者建模为**多项式时间有界概率算法（PPT）**：无法在多项式时间内破解 TLS 底层密码学困难假设（ECDLP、AES-GCM、HMAC 安全性）。基线为 Dolev-Yao 模型在本场景的角色细化（论文 ch3.5.1）：

| 攻击者 | 目标 | 能力边界（不能做什么） |
|---|---|---|
| **网络层 𝒜_net** | 监听/篡改/重放/MITM | 不能破 TLS、不能伪造 CA 证书、不能拿本地私钥 |
| **恶意买方 𝒜_buyer** | 未付款却触发资产释放 | 不能拿 VS 签名私钥、不能破 QuickJS 沙箱、不能单独伪造 PP 的 TLS 响应 |
| **恶意商家 𝒜_merchant** | 收款后拒放币 / 注册假收款账户 | 不能阻止买方生成有效证明（只要支付真发生）、不能改已部署合约 |
| **受攻击验证服务器 𝒜_verifier** | 为未发生支付伪造签名 | 受三重约束：注册表授权、H_bind 绑定、MPC-TLS 无法独立伪造 PP 响应 |
| **合约漏洞利用者 𝒜_contract** | 重入/溢出/越权/异常状态 | — |

---

## 2. STRIDE 威胁分类

| STRIDE 类别 | 系统典型场景 | 安全属性 | 主要对手 |
|---|---|---|---|
| 仿冒 Spoofing | 部署伪造验证服务器 | 认证性 | 𝒜_verifier |
| 篡改 Tampering | 篡改会话承诺/金额字段 | 完整性 | 𝒜_buyer, 𝒜_net |
| 抵赖 Repudiation | 商家否认已收款 | 不可否认性 | 𝒜_merchant |
| 信息泄露 Disclosure | 链上暴露真实支付账户 | 机密性 | 𝒜_net |
| 拒绝服务 DoS | 耗尽验证服务器资源 | 可用性 | 𝒜_net |
| 权限提升 EoP | 未授权合约绕白名单调资产释放 | 授权控制 | 𝒜_contract |

**六类代表性威胁 → 防御机制 → 安全目标**（论文表 3-4）：

| 攻击场景 | 所需假设 | 安全目标 | 核心防御 | 代码证据 |
|---|---|---|---|---|
| 虚假支付欺诈 | T1–T4 | S1 | MPC-TLS 承诺 + H_bind + 平台语义校验 | `verifyAndDelegate`、`_computeOrderBindingHash` |
| 证明重放 | T1 | S2 | H_bind 跨订单绑定 + U_sess 去重 | `_checkAndMarkSessionId`([TLSNVerifier.sol:240-244](../../../tlsn-extension/packages/contracts/contracts/TLSNVerifier.sol#L240-L244)) |
| 账户隐私泄露 | T2,T4 | S3 | 链上哈希承诺 + 选择性披露 | `PlatformBinding`(哈希)、链下 accountCheck |
| 插件供应链攻击 | T5 | S5 | WASM 沙箱能力限制 + 版本签名 | `plugin-sdk` QuickJS 沙箱 |
| 商家拒付 | T1–T3 | —（经济） | 无需商家确认的自主释放 + 超时结算 + H_bind 账户绑定 | `payOrderByPlatform`、`sweepExpired*` |
| 流动性耗尽 | T1 | —（经济） | 保证金没收 + 信誉动态调节 | `onTimeout`、`BondVault.settle` |

> 重放多层防护在代码中体现为：会话去重 `usedSessionIds` + 平台层 `usedAlipayOrderIds`/`usedTransferIds` + 订单绑定 `orderBindingHash` + 支付时间窗下限。详见 [05-security-analysis.md §3](05-security-analysis.md)。

---

## 3. 信任假设层次 T1–T5

五条相互独立的假设（论文 ch3.6.1），分别覆盖区块链层、密码学层、验证协议层、外部依赖层、用户环境层：

| 假设 | 内容 | 失效影响 | 代码锚点 |
|---|---|---|---|
| **T1 区块链层** | 上链不可篡改、合约确定性执行、BFT 共识 | 突破则所有链上保证同时失效（基础假设） | 全部合约 |
| **T2 TLS 密码学强度** | TLS 1.2/1.3 困难假设对 PPT 成立 | 失效则 MPC-TLS 真实性保证瓦解 | `verifier`（MPC-TLS） |
| **T3 验证服务器诚实但受约束** | VS 遵守 MPC-TLS 规范，**不与买方合谋伪造 PP 响应**；其拒绝服务等行为只影响可用性 | 主动作弊在 T2 下也无法产生有效虚假证明 | `trustedVerifiers`([TLSNVerifier.sol:41](../../../tlsn-extension/packages/contracts/contracts/TLSNVerifier.sol#L41)) |
| **T4 支付平台 API 稳定性** | PP 关键 API/格式在插件版本期内稳定、证书由受信 CA 签发 | 失效则证明密码学有效但语义可能不真 | `trustedPaymentServers`、`platforms/*.sol` |
| **T5 用户设备安全** | 本地设备未被 root 入侵 | 失效则沙箱隔离弱化（链上资产仍由私钥+链安全保障） | QuickJS 沙箱 |

**T2 与 T3 的组合安全边界**（论文 ch3.6.1 重点）：若 VS 与买方主动串谋，双方共持完整 TLS 会话密钥，密码学上等价于具备伪造受信 CA 证书的能力——这正是 T2 排除的更强困难前提。**故 T2、T3 互补：只要其一成立，纯串谋路径即在密码学意义下失效，S1 仍可保**。残余风险来自 MPC 实现层侧信道（时序/内存访问），属工程层考量（见 [06-evaluation.md §5](06-evaluation.md) 局限 5）。

> 三类信任名单在代码中即 `trustedVerifiers`/`trustedKYBServers`/`trustedPaymentServers`（[TLSNVerifier.sol:41-44](../../../tlsn-extension/packages/contracts/contracts/TLSNVerifier.sol#L41-L44)），由 admin 维护，对应 T3（验证器）与 T4（支付/KYB 服务器）的链上落地。

---

## 4. 「半去中心化」的定义与合理性

**定义**（论文 def 3.3）：系统划分为去中心化域 𝒟 与受约束中心化域 𝒞，满足：
1. 𝒟 中所有安全属性由区块链共识 + 合约确定性执行保证，不依赖任何链下可信第三方；
2. 𝒞 中链下参与方的可信行为边界受密码学严格约束，任何可证明偏离均可被 𝒟 检测并拒绝。

| 域 | 涵盖功能 | 代码落地 |
|---|---|---|
| **去中心化域 𝒟** | 资产托管、订单状态、证明验证、平台治理 | [`contracts`](../../../tlsn-extension/packages/contracts/) |
| **受约束中心化域 𝒞** | MPC-TLS 协同计算、选择性披露背书、账户一致性链下比对 | [`verifier`](../../../tlsn-extension/packages/verifier/) |

**为何选半去中心化而非全去中心化**（论文 ch3.1.4）：
1. **全链上 TLS 验证当前不可行**：在 EVM 跑 ECDHE/AES-GCM/MAC 验证的 Gas 远超区块上限，无成熟 EVM-native TLS 验证。
2. **zkTLS 部署成熟度局限**：SNARK/STARK zkTLS 在消费级设备生成覆盖完整 TLS 握手的证明常需数十分钟，不满足交互式 C2C 的时延要求。**架构预留未来集成 zkTLS 的扩展接口**，性能达标即可平滑迁移到全去中心化。
3. **信任最小化**：把对 VS 的信任压到「只需相信 VS 不与买方合谋伪造 PP 的 TLS 响应」这一最弱假设，与 Optimistic Rollup 对序列器的最小信任设计一脉相承。

> 💡 这正呼应了 [04 §7](04-protocol-design.md) 与 [05 §4](05-security-analysis.md) 中**链上账户校验留空（为未来去中心化预留接口）**的设计意图：当前用链下 accountCheck 务实折中，待 zkTLS 成熟后可迁移上链。

---

## 5. 信任模型权衡（三类架构对比）

论文表 3-5：

| 维度 | 纯中心化 | **本系统（半去中心化）** | 纯去中心化 |
|---|---|---|---|
| 资产托管信任 | 平台运营方 | **智能合约（无需信任）** | 智能合约 |
| 支付证明信任 | 平台运营方 | **验证服务器（受密码学约束）** | 零知识证明电路 |
| 当前可部署性 | 高 | **高** | 低（证明时延过长） |
| 账户隐私 | 依赖平台策略 | **哈希隔离 + 选择性披露** | ZK 天然隐私 |
| FATF 合规支持 | 容易 | **结构化字段 + Webhook** | 困难（链上数据有限） |
| 单点故障风险 | 高 | **低（VS 不持资产）** | 极低 |

本系统在「纯去中心化 zkTLS 时延尚不实用」的约束下，于可部署性与安全性间取得合理权衡，隐私与合规优于纯中心化。

---

> 订单状态集合 `Q = {PENDING, WAITING, COMPLETED, EXPIRED}`（[C2CTypes.sol:13-18](../../../tlsn-extension/packages/contracts/contracts/C2CTypes.sol#L13-L18)）✓ 与论文 ch3:222 一致。机制如何兑现这些安全目标，见 [04-protocol-design.md](04-protocol-design.md) 与 [05-security-analysis.md](05-security-analysis.md)。
