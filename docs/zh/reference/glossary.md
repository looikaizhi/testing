# 术语表

> [!NOTE]
> **本篇导读**
> - **定位**：降门槛名词速查。每条 1–2 句 + 指向对应深度篇。定义与各篇及代码口径统一。
> - **读者**：所有人。

**分类**：[密码学与 zkTLS](#密码学与-zktls) · [协议核心机制](#协议核心机制) · [架构与信任](#架构与信任) · [业务与运维](#业务与运维)

---

## 密码学与 zkTLS

**zkTLS**（Web Proofs / TLS attestation）
一类**无需改造目标服务器**、为 TLS 会话数据提供来源证明并支持选择性披露的技术路线族。三条路线：MPC-Based、TEE-Based、Proxy-Based。本文选 MPC-Based。→ [02-zktls-tlsnotary.md §3](../deep-dive/02-zktls-tlsnotary.md)

**MPC-TLS（多方计算 TLS）**
把 TLS 客户端侧的密钥生成与使用过程分散到证明者与验证服务器两方，任一方都无法单独持有完整会话密钥，从而让验证方能密码学地"见证"真实 TLS 会话，而无需服务器配合。→ [02 §4.3](../deep-dive/02-zktls-tlsnotary.md)

**TLSNotary**
本文采用的具体 MPC-Based zkTLS 方案。三阶段：MPC-TLS → 选择性披露 → 数据验证。基于 TLS 1.2。→ [02 §4](../deep-dive/02-zktls-tlsnotary.md)

**承诺（Commitment）**
对一段数据 + 随机盲化因子取哈希，得到不可逆、可后续打开验证的承诺值。本系统实例化为 `cᵢ = keccak256(bytes(fᵢ) ‖ rᵢ)`。链下验证器支持 Keccak256 算法。→ [02 §6](../deep-dive/02-zktls-tlsnotary.md)

**盲化因子（Blinder）**
承诺中混入的随机值，使承诺隐藏原文且不可被枚举猜出；`REVEAL` 时与明文一起提交以重建承诺，`PEDERSEN` 时不离开本地。

**选择性披露（Selective Disclosure）**
只揭示与业务判断相关的最小字段（如金额/时间），其余字段以承诺隐藏。通过 Handler 字段级配置（`REVEAL`/`PEDERSEN`）。本系统披露率 20%–35%。→ [verifier-plugin.md §4](verifier-plugin.md)

**承诺聚合哈希（H_comm）**
所有承诺哈希按序拼接再取 keccak256：`H_comm = keccak256(c₁‖…‖cₙ)`，供链上单次比对、确保承诺集合不可增删。（通用 TLSNotary 用 Merkle 根，本系统改用顺序拼接。）→ [02 §6](../deep-dive/02-zktls-tlsnotary.md)

---

## 协议核心机制

**订单绑定哈希（H_bind）｜创新①**
把链下证明与链上特定订单 + 收付款账户密码学绑定的摘要。代码为 **15 个扁平字段** keccak256（含 rateVersion），嵌入验证器签名摘要；任何参数篡改都会使链上签名恢复失败。阻断跨订单复用与参数篡改。→ [04 §6.2](../deep-dive/04-protocol-design.md)

**验证器签名摘要**
验证服务器以 secp256k1 私钥签名的消息：`keccak256(chainId ‖ keccak256(sid) ‖ H_comm ‖ H_bind ‖ H_policy)`，再以以太坊消息格式封装。链上恢复签名者并查信任名单。→ [02 §5.2](../deep-dive/02-zktls-tlsnotary.md)

**策略版本哈希（H_policy）**
把"用哪一版披露策略生成的证明"锁进签名的哈希，取自插件 config 的 `policyVersion`。用于合规策略版本治理。

**会话去重（Session Dedup）**
链上维护已用会话标识集合 `U_sess`，每个 `sessionId` 首次验证后写入，重复提交被拒——防同订单重复触发资产释放。→ [05 §3](../deep-dive/05-security-analysis.md)

**保证金库（BondVault）**
按订单隔离托管保证金的合约。结算为 **pull 模式**：成功退证明方、超时归对手方，金额先记入 `claimable`，用户自行 `claim()` 领取。→ [contracts.md §2.4](contracts.md)

**订单键（orderKey）**
保证金隔离用的 6 字段哈希键 `keccak256(escrow, chainId, merchant, productId, assetType, orderId)`，确保各订单保证金不混用。

**动态保证金率（bondBps）**
随用户风险等级递增的保证金比率（基点）：`clamp(base + ℓ×step, min, max)`，默认 10%→40%（ℓ=0→10）。→ [04 §8](../deep-dive/04-protocol-design.md)

**平台验证器（Platform Verifier）**
实现统一 `IPlatformVerifier` 接口、封装单个支付平台业务规则的独立合约（支付宝/Wise）。经 `TLSNVerifier` 注册表分发，新增平台无需改核心合约。→ [verifier-plugin.md](verifier-plugin.md)

---

## 架构与信任

**半去中心化架构（Semi-Decentralized）**
把系统分为去中心化域 𝒟 与受约束中心化域 𝒞：𝒟 安全性全由链共识 + 合约保证；𝒞 中链下参与方的可信行为受密码学严格约束、任何偏离可被 𝒟 检测拒绝。→ [03 §4](../deep-dive/03-threat-model.md)

**去中心化域 𝒟**
链上部分：资产托管、订单状态、证明核验、平台治理。依赖 T1（区块链安全）。

**受约束中心化域 𝒞**
链下部分：MPC-TLS 协同计算、选择性披露背书、账户一致性链下比对。依赖 T3（验证服务器诚实执行）。

**验证服务器（VS / Verifier Server）**
担任 MPC-TLS 验证方、对会话承诺 + 订单绑定签名、做账户链下核验、推合规 Webhook 的链下节点。**不持有任何资产**，失效只影响可用性。→ [04 §5](../deep-dive/04-protocol-design.md)

**信任假设 T1–T5**
T1 区块链安全 / T2 TLS 密码学强度 / T3 VS 诚实但受约束（honest-but-curious） / T4 支付平台 API 稳定 + 证书可信 / T5 用户设备未被 root 入侵。→ [03 §3](../deep-dive/03-threat-model.md)

**安全目标 S1–S5**
S1 支付证明不可伪造 / S2 抗重放 / S3 账户隐私 / S4 验证节点信任最小化 / S5 插件执行隔离。→ [05](../deep-dive/05-security-analysis.md)

**账户核验（accountCheck）**
验证服务器在链下对响应报文中的收款方账户标识与商家链上预注册的账户哈希做 keccak256 切片比对；通过后才签名。链上不做账户比对（账户隐私 + 为未来去中心化预留接口）。→ [04 §7](../deep-dive/04-protocol-design.md)

**KYB（Know Your Business）**
商家入驻时的企业认证。通过 KYB 公证证明（serverName 须在 `trustedKYBServers`）自助注册，或由 admin 应急注册。→ [contracts.md §2.5](contracts.md)

---

## 业务与运维

**CRYPTO / FIAT 产品**
CRYPTO=商家卖币（买方付法币、买方举证）；FIAT=商家收币（商家付法币、商家举证）。二者镜像。→ [04 §2](../deep-dive/04-protocol-design.md)

**订单状态机**
`Q = {PENDING, WAITING, COMPLETED, EXPIRED}`。CRYPTO 初态 PENDING、FIAT 初态 WAITING；`cancelOrder` 禁用；超时由任何人触发清理。→ [contracts.md §3](contracts.md)

**Keeper（守护进程）**
监听订单事件、到期时调 `sweepExpiredBatch` 清理过期订单的链下进程。**无特权**——清理 permissionless，keeper 仅为便利角色。→ [code-map.md §3.8](code-map.md)

**Sweep（公开清理）**
`sweepExpired`/`sweepExpiredBatch`：任何 EOA 可调用，把超时订单转 `EXPIRED` 并按超时规则结算保证金。

**Webhook（合规上报）**
VS 验证通过后向外部合规系统异步推送的精简报文（仅 Travel Rule 字段、不含明文），按 server name 路由、fire-and-forget。→ [verifier-plugin.md §5](verifier-plugin.md)

**QuickJS 沙箱**
插件运行的 WebAssembly 隔离环境，禁网络/文件系统，能力经 Host 注入——插件执行隔离（S5）的基础。→ [05 §6](../deep-dive/05-security-analysis.md)

**汇率精度 / 法币金额 ×1000**
汇率以 `×1e8`（`RATE_PRECISION_EXP=8`）编码；法币金额以千分之一精度（`fiatAmountX1000`）传递，规避浮点误差。→ [contracts.md](contracts.md)

---

> [!TIP]
> 概念对应的源码位置见 [code-map.md](code-map.md)。

---

<div align="center">

🏠 [文档导航](../README.md) · 🗺 [源码地图](code-map.md) · 🧠 [深度轨](../deep-dive/01-overview.md)

</div>
