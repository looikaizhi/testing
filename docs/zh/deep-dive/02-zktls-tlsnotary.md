# zkTLS 与 TLSNotary：密码学基石

> [!NOTE]
> **本篇导读**
> - **定位**：协议的密码学基石——为什么链下支付能被链上可信验证。
> - **读者**：深度轨。后接 [03-threat-model.md](03-threat-model.md)、[04-protocol-design.md](04-protocol-design.md)。
> - **论文来源**：ch2.2–2.4。事实以源码为准。名词见 [glossary.md](../reference/glossary.md)。

**目录**：[TLS 握手](#1-tls-12-握手与密钥协商) · [记录层局限](#2-记录层与第三方验证局限) · [zkTLS 路线选型](#3-zktls-思想与路线选型) · [TLSNotary 原理](#4-tlsnotary-原理) · [三项扩展](#5-本文在-tlsnotary-上的三项扩展) · [工程实例化](#6-工程实例化要点代码对照)

---

## 1. TLS 1.2 握手与密钥协商

TLSNotary 基于 **TLS 1.2**（本系统不涉及 1.3）。TLS 分握手层与记录层。握手以 ECDHE 为例（论文 ch2.2.1）：客户端私钥 $d_c$、服务器私钥 $d_s$，协商共享秘密 $Z = d_c·d_s·G$（$G$ 为曲线基点），再派生：

$$MS = \text{PRF}(PMS, \text{"master secret"}, R_c‖R_s), \quad K_{session} = \text{PRF}(MS, \text{"key expansion"}, R_s‖R_c)$$

握手同时通过证书链验证确立服务器身份——这是记录层数据「来源真实」的根本前提。

---

## 2. 记录层与第三方验证局限

握手后进入记录层：HTTP 请求行、响应正文、Cookie、接口字段等全部封装为 TLS Record 对称加密。外部观察者只能看到时序与域名，看不到明文。

**核心局限**（论文 ch2.2.2）：TLS 1.2 的来源真实性**只对通信双方成立**，无法延伸为面向第三方的独立验证。客户端拿到明文后即有能力复制/伪造内容，第三方无法仅凭用户提交的截图/接口返回判断真伪。

> [!NOTE]
> 在本系统场景：支付状态、金额、收款账户只存在于支付平台返回的 HTTPS 响应里，链上合约无法直接访问、也无法判断真伪。这正是引入 zkTLS 的动机。

---

## 3. zkTLS 思想与路线选型

**zkTLS**（亦称 Web Proofs / TLS attestation）是一类**无需改造目标服务器**、为 TLS 会话数据提供来源证明并支持选择性披露的技术路线族。需同时解决三问题（论文 ch2.3.1）：① 数据确来自真实 TLS 会话；② 与特定服务器身份绑定；③ 仅披露与判断相关的必要信息。

三类实现路线对比（论文表 2-3）：

| 路线 | 核心机制 | 优点 | 缺点 |
|---|---|---|---|
| **MPC-Based**（本文选型） | MPC + ZKP | 安全性高、无需服务器改造 | 计算延迟/资源开销较高、部署复杂 |
| TEE-Based | 可信执行环境 | 效率高、可单节点 | 依赖硬件信任、侧信道风险 |
| Proxy-Based | 代理 + ZKP | 延迟低、部署简单 | 需信任代理、可能被目标封禁 |

**本文选 MPC-Based → 具体选 TLSNotary**：无需服务器配合、证明与实际 TLS 会话密码学绑定更强、天然支持按需披露与隐私保护。代表工作：DECO（奠基）、DiStefano、ORIGO 等。

---

## 4. TLSNotary 原理

### 4.1 角色（论文 ch2.4.1）
- **证明者 Prover**：发起 TLS 请求并生成证明（本场景=完成支付的买方，CRYPTO；或商家，FIAT）。
- **目标服务器 Server**：普通 HTTPS 服务端，无需改造。
- **公证方/验证方 Notary/Verifier**：参与 MPC-TLS，对会话建立可验证见证。
- **应用侧验证方**：事后接收选择性披露的证明并做业务判断。

### 4.2 三阶段流程（论文 ch2.4.2）
1. **MPC-TLS**：Prover 与 Verifier 共同参与客户端侧密钥计算，与服务器建标准 TLS 1.2 连接；会话控制权分散，单方无法伪造完整证明。
2. **选择性披露**：Prover 仅披露与待证事实相关的字段（支付状态/金额/收款标识），其余隐藏。
3. **数据验证**：验证签名、承诺开启、服务器身份绑定，执行业务语义判定。

### 4.3 密码学基础（论文 ch2.4.3）
- **密钥分持**：客户端私钥由 Prover 份额 $P_{sk}$ + Verifier 份额 $V_{sk}$ 构成（$C_{sk}=P_{sk}+V_{sk}$），服务器无感知；预主密钥 $PMS = x(R)$，$R=P+V$。借 A2M/OLE 在加法/乘法份额间转换。
- **记录层联合计算**：双方分持密钥份额联合加解密，Prover 引入掩码使 Verifier 无法直接获知明文；正确性由 DEAP（双执行+事后一致性核验）提供恶意安全。
- **承诺封装**：字段 $m_i$ + 盲因子 $r_i$ → 承诺 $C_i = H(m_i ‖ r_i)$（论文式，通用 TLSNotary 聚合为 **Merkle 根** + 会话头 SH，由 Verifier 签名）。

### 4.4 证明生成、验证与选择性披露
Prover 选直接 opening 或零知识路径；验证方依次检查字段承诺与聚合根一致性、服务器身份绑定、会话头签名。设计原则：**「证明恰好足够支撑业务结论」**，在可验证性与隐私最小化间取平衡。

---

## 5. 本文在 TLSNotary 上的三项扩展

通用 TLSNotary 机制（密钥分持、联合计算、承诺封装、选择性披露）**直接复用不改造**；本文面向 C2C 场景做三项适配（论文 ch2.4.5、ch4.3）：

### 5.1 角色配置简化
取消独立 Notary 角色，由业务验证服务器 VS 直接担任 MPC-TLS 验证方——把「Notary 签名 → 业务复核」两段信任链压缩为一段。

### 5.2 签名摘要语义扩展（核心）
通用 TLSNotary 签名仅覆盖会话承诺 + 元数据，与业务订单无密码学关系。**本文在签名摘要额外纳入订单绑定哈希 `H_bind` 与策略版本哈希 `H_policy`**，使一次签名同时背书「会话内容真实性」+「订单参数一致性」，消除证明跨订单移植空间。

链上恢复签名者的消息（[`_recoverVerifierSigner`, TLSNVerifier.sol:272-285](../../../tlsn-extension/packages/contracts/contracts/TLSNVerifier.sol#L272-L285)）：

$$m = \text{keccak256}(\text{chainId} ‖ \text{keccak256}(sid) ‖ H_{comm} ‖ H_{bind} ‖ H_{policy})$$

链下 VS 构造的 preimage 与链上**逐字节一致**（[`sign_commitments`, verifier/src/main.rs:2064-2111](../../../tlsn-extension/packages/verifier/src/main.rs#L2064-L2111)）。`H_policy` 取自插件 config 的 `policyVersion`（[plugin-sdk/src/index.ts:880-884](../../../tlsn-extension/packages/plugin-sdk/src/index.ts#L880-L884)）。

### 5.3 选择性披露规范化
把按需披露细化为字段级声明式规范（Handler），每字段选 `REVEAL`（明文）或 `PEDERSEN`（承诺隐藏），策略可声明/审查/扩展。

---

## 6. 工程实例化要点（代码对照）

| 论文通用机制 | 本系统实例化 | 代码证据 |
|---|---|---|
| 承诺函数 $H$ | 链上原生 `keccak256`：$c_i = \text{keccak256}(\text{bytes}(f_i) ‖ r_i)$ | commitment `hashAlg=Keccak256`（[verifier.rs:225-226](../../../tlsn-extension/packages/verifier/src/verifier.rs#L225-L226)） |
| 承诺聚合 | 顺序 keccak 拼接 `H_comm = keccak256(c₁‖…‖cₙ)`，便于链上单次比对 | [`_verifyCommitmentsHash`, TLSNVerifier.sol:264-270](../../../tlsn-extension/packages/contracts/contracts/TLSNVerifier.sol#L264-L270) |
| 承诺开启校验 | 揭示项 value+blinder 重建承诺并比对 | [`_verifyCommitmentOpenings`, TLSNVerifier.sol:246-262](../../../tlsn-extension/packages/contracts/contracts/TLSNVerifier.sol#L246-L262) |
| 证明结构 π | `TLSNProof`（sessionId/chainId/commitments/revealedItems/commitmentOpenings/orderBindingHash/policyVersionHash/verifierSignature/serverName） | [C2CTypes.sol:35-69](../../../tlsn-extension/packages/contracts/contracts/C2CTypes.sol#L35-L69) |

> [!TIP]
> 通用 TLSNotary 常把承诺聚合为 Merkle 根；本系统按 ch4.3 实例化为 **keccak256 顺序拼接**，以适配 EVM 上的单次比对（代码 `_verifyCommitmentsHash`）。

---

> [!TIP]
> 这些密码学机制如何组装成协议，见 [04-protocol-design.md](04-protocol-design.md)；如何论证安全目标，见 [05-security-analysis.md](05-security-analysis.md)；性能代价见 [06-evaluation.md §3](06-evaluation.md)。

---

<div align="center">

◀ 上一篇 [01 · 总览](01-overview.md) · 🏠 [文档导航](../README.md) · 下一篇 ▶ [03 · 威胁模型](03-threat-model.md)

</div>
