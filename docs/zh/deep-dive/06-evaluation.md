# 评估：实测数据

> **本篇定位**：用实测数据说服人——合约正确性、链上 Gas 经济性、TLSNotary 性能、端到端时延。
> **读者**：深度轨 / 评审。
> **数据来源**：合约测试 [`contracts/TEST_RESULT.md`](../../../tlsn-extension/packages/contracts/TEST_RESULT.md)；实验数据 [`data_analysis/`](../../../data_analysis/)（`*.csv` 源、`*.svg` 图）。
> **复算原则**：本篇所有数值均回源数据（CSV / 测试输出 / 合约常量）现场复算。

---

## 1. 合约功能正确性

`npx hardhat test`（Hardhat 3.1 + Node test runner），Solidity 0.8.28、EVM cancun。每个用例在独立 EVM 快照中执行，用例间隔离。

**结果：本机实跑（WSL `hardhat test`）336 passing / 0 failing，全部通过**（node:test 计数，含 7 个 helper 模块文件，业务用例约 329）。下表为逐套件分解（取自 [TEST_RESULT.md](../../../tlsn-extension/packages/contracts/TEST_RESULT.md) 归档）。

| 套件 | 用例 | 套件 | 用例 |
|---|---:|---|---:|
| C2CAdmin | 60 | TLSN 验证器 | 30 |
| C2CEscrow (V4) | 62 | 汇率快照 | 9 |
| WisePlatform 验证器 | 34 | 单笔限额 | 6 |
| AlipayPlatform 验证器 | 37 | 营业时间 | 14 |
| 集成测试 (V4) | 17 | Bond 双边公平 (V4) | 22 |
| 过期订单清理 | 11 | Sweep 公开清理 (V4) | 22 |
| | | **合计** | **324** |

用例按 `FLOW`（正向）/`ERR`（错误路径）/`ATT`（攻击向量）/`TAMPER`（时序篡改）四类组织，覆盖状态机转换、资产守恒、五步密码学校验流水线（订单绑定哈希替换、会话重放、签名伪造、链 ID 替换、金额篡改均按预期 revert）。

> 💡 测试套件持续增长（合约逻辑迭代会新增用例），实跑数字以本机 `hardhat test` 输出为准。其中 TLSN 验证器套件含「5-item 签名格式通过、旧版 4-item 被 `UntrustedVerifier` 拒绝」用例，印证当前签名摘要为 5 字段（含 `orderBindingHash`、`policyVersionHash`）。

---

## 2. 链上 Gas 与经济性

### 2.1 计算方法

$$\text{总手续费(USD)} = \text{Gas Used} \times \text{Gas Price(gwei)} \times 10^{-9} \times \text{ETH价格(USD)}$$

- **Gas Used**：Hardhat 本地仿真实测，每操作重复 5 次取均值（仅执行 Gas，不含 L1 数据费）。
- **Gas Price**：依 Arbitrum One 真实历史（Dencun 后约 791 天）拟合，μ=0.062 gwei、σ=0.047、中位 ≈0.040 gwei。三档估算：地板 0.01 / 均值 0.062 / 拥挤 0.11 gwei。
- **ETH 价格**：$3,000。

### 2.2 各操作 Gas 基准（实测）

来自 [TEST_RESULT.md](../../../tlsn-extension/packages/contracts/TEST_RESULT.md) 与 ch6 表 6-2（两者一致）：

| 操作 | Gas |
|---|---:|
| ERC-20 `approve`（首次冷写） | 46,000 |
| 下单 CRYPTO | 198,500 |
| 下单 FIAT | 215,300 |
| 提交证明·支付宝 CRYPTO | 437,706 |
| 提交证明·Wise CRYPTO（双证明） | 488,213 |
| 超时保证金领取 | 147,600 |
| 商家注册（一次性） | 74,966 |
| 设置平台账户哈希 | 101,698 |
| 上架 CRYPTO 产品 | 128,400 |

> 证明提交是单步最贵操作：调用链最长（Escrow→TLSNVerifier→平台验证器→BondVault→RiskManager），每跨合约边界 + 每条去重映射冷 `SSTORE`。Wise 双证明较支付宝单证明高约 12%。

### 2.3 完整换汇成本（\$0.13 复算）

**场景 A：买方完成一笔支付宝 CRYPTO 换汇**（首次，取冷写上界）：

| 步骤 | Gas |
|---|---:|
| `approve` | 46,000 |
| 下单 CRYPTO | 198,500 |
| 提交证明·支付宝 CRYPTO | 437,706 |
| **合计** | **682,206** |

回源复算三档成本（682,206 × Gas Price × 1e-9 × \$3000）：

| 档位 | Gas Price | 成本 |
|---|---|---:|
| 地板 | 0.01 gwei | ≈ \$0.02 |
| **均值** | **0.062 gwei** | **≈ \$0.13** |
| 拥挤 | 0.11 gwei | ≈ \$0.23 |

✅ **复算确认**：均值档 682,206 × 0.062 × 3000 × 1e-9 = **\$0.127 ≈ \$0.13**（Arbitrum One 单笔完整换汇）。Wise CRYPTO（场景 B，732,713 gas）均值档约 \$0.14，高约 \$0.01。

典型换汇金额 100–10,000 USDT，均值档手续费占比 0.001%–0.13%，远低于主流中心化交易所提币定额（约 1–3 USDT）。

> 注：以上为执行 Gas，不含 L1 数据费。Dencun（EIP-4844）后 Arbitrum L1 数据费典型 \$0.001–\$0.02，占比可忽略。

---

## 3. TLSNotary 协议性能

测试框架：官方可复现网络框架（tlsnotary.org, 2026-01）+ `tc netem` 受控网络。原生（Rust）vs 浏览器（WASM）两模式；浏览器密码学吞吐约为原生的 40%–60%（无法用 AVX2/NEON + V8 JIT 开销 + GC 中断）。本系统生产路径为浏览器模式。源数据：[`data_analysis/tlsn-experiments/`](../../../data_analysis/tlsn-experiments/)。

四维参数敏感性（每配置 10 次取均值）：

![TLSNotary 参数敏感性综合](../../assets/charts/combined.svg)

| 维度 | 关键结论 | 图 |
|---|---|---|
| **带宽**（5–1000 Mbps） | <20 Mbps 时数据传输主导（两模式≈55s）；高带宽后浏览器卡在 WASM 计算下界（1000 Mbps 约 6.1s），原生可降至 2.5s | [bandwidth.svg](../../assets/charts/bandwidth.svg) |
| **网络延迟**（10–200 ms） | MPC-TLS 在线阶段 40–50 轮顺序交互，总耗时随延迟近线性；>150 ms 时两模式趋同 | [latency.svg](../../assets/charts/latency.svg) |
| **响应体**（1–50 KB） | 原生近线性；浏览器在 5–10 KB 后非线性抬升（50 KB 时 23.5s，达原生 2.33 倍）。本系统 API 响应 2–5 KB，处拐点以下平稳区 | [response_size.svg](../../assets/charts/response_size.svg) |
| **披露比例**（10%–100%） | 影响最小（全区间增幅约 10%–11%）。本系统披露率 20%–35%，处完全平坦区 | [proof_reveal.svg](../../assets/charts/proof_reveal.svg) |

> 关键洞察：**带宽是首要瓶颈**，披露比例影响最小——这意味着选择性披露（隐私保护）几乎不增加时延成本。

---

## 4. 端到端业务时延

### 4.1 方法

单台物理机（i7-11800H），验证服务器在 WSL2 Linux、扩展在 Windows 侧；`tc netem` 在 WSL 出口注入时延/带宽。支付平台 API 经 Windows 宿主直连公网（不受管制）。每环境跑 20 次，**丢弃首次热启动，取后续 19 次**（故 N=19），报中位数与 P95。四阶段拆解：连接 `t_conn`、请求 `t_req`、证明生成 `t_proof`、验证 `t_verify`（1s 轮询粒度）。

**Wise 取两证明较大值**：Wise 需对两个端点（联系人核验 + 转账详情）各发起独立证明，经 `Promise.all` 并发、共享同一计算资源近乎同时完成，故总耗时取 max（非求和）。

源数据：[`data_analysis/wise_alipay/`](../../../data_analysis/wise_alipay/)（`*_ideal/broadband/crossregion/4g.csv`）。

### 4.2 结果（中位数，N=19）

![端到端阶段拆解](../../assets/charts/wise_alipay_phase_breakdown.svg)

| 服务 | 理想 | 宽带(50ms/100M) | 跨区域(150ms/50M) | 4G(80ms/20M) |
|---|---:|---:|---:|---:|
| 支付宝 | **5.94 s** | **17.44 s** | 24.98 s | 37.38 s |
| Wise Proof① | 9.74 s | 21.02 s | 30.23 s | 83.78 s |
| Wise Proof② | 9.69 s | **24.02 s** | 56.87 s | 84.78 s |
| **Wise（取较大）** | **9.74 s** | **24.02 s** | 56.87 s | 84.78 s |

✅ **复算确认**（[`data_analysis/wise_alipay/*.csv`](../../../data_analysis/wise_alipay/) totalProtocolMs 中位数）：支付宝理想 5.94 s、宽带 17.46 s；Wise 理想 max(9.76, 9.70)=9.76、宽带 max(20.98, 24.02)=24.02——与论文 5.94 / 17.44 / 9.74 / 24.02 一致（亚 0.04 s 微差源于论文 N=19 剔除冷启动行，本文复算取全部有效行）。abstract 数字均可由 CSV 源复现。

### 4.3 两个关键发现

**① 反直觉：4G 总耗时 > 跨区域**（支付宝 37.38 s vs 24.98 s）。
连接阶段 `t_conn`（占总耗时 67%–68%）**带宽主导**：MPC 离线阶段传大规模 OT 矩阵，跨区域 50 Mbps 的带宽优势压过其 150 ms 延迟劣势，故跨区域 `t_conn`（19.90 s）反低于 4G（32.40 s）。请求阶段 `t_req` 才由延迟主导。**结论：部署时带宽权重高于往返时延。**

![连接阶段对网络的响应](../../assets/charts/wise_alipay_connection.svg)

**② Wise `t_conn` ≈ 支付宝 2 倍**（理想环境实测比值 2.06×）。
并发双 Prover 共享单一 Comlink Worker + 单 Rayon WASM 线程池，各得 ½ CPU 份额。同轮内 Proof①/② 的 `t_conn` 差值持续 <10 ms，印证完全对称竞争。这是架构决策（并发共享算力）所致，非业务复杂度差异。

### 4.4 网络适用性边界

**E4（3G，300 ms / 2 Mbps）全部测试轮次 MPC 握手超时失败**。两类瓶颈同时爆发：延迟主导（OT Extension 多轮顺序交互 ×300 ms）+ 带宽主导（OT 初始化大矩阵传输 ÷2 Mbps）。其余环境只触及单一瓶颈故能完成。→ TLSNotary 存在**最低网络质量门槛**：高延迟-低带宽组合下难以完成握手。

---

## 5. 局限性（论文 ch6.5）

| # | 局限 | 说明 | 代码关联 |
|---|---|---|---|
| 1 | 公证节点可用性单点 | 验证服务器单节点，故障中断证明流程；可用性单点与链上资产安全解耦；$m\text{-of-}n$ 阈值签名可分散 | `trustedVerifiers` 单签名地址 |
| 2 | 账户标识枚举攻击面 | 当前账户承诺为**无盐** keccak256，已知候选集可枚举匹配 | `setPlatformBinding`（[C2CAdmin.sol:264](../../../tlsn-extension/packages/contracts/contracts/C2CAdmin.sol#L264)） |
| 3 | 交易金额隐私缺失 | 订单金额明文上链，可被统计分析；需 Pedersen+范围证明 | `Order.amount` 明文 |
| 4 | 平台 API 变更适配成本 | API 变更需双层适配（插件 + 链上验证器），后者经治理流程，响应滞后 | `platforms/*.sol` |
| 5 | 公证节点与买方串谋边界 | T3 建模为「诚实但好奇」；纯串谋在 T2/T3 至少一成立时失效；侧信道漏洞 + bondBps 参数敏感性是残余风险 | 见 [05-security-analysis.md](05-security-analysis.md) |

> 局限 2「无盐哈希」与 [05-security-analysis.md](05-security-analysis.md) 的账户隐私分析相呼应；建议方案：以 `H(accountId ‖ orderId ‖ chainId)` 派生盐绑定每笔订单。

---

> 设计如何支撑这些结果，见 [04-protocol-design.md](04-protocol-design.md)；安全目标论证见 [05-security-analysis.md](05-security-analysis.md)。所有图片源自 [`data_analysis/*.svg`](../../../data_analysis/)，与 `*.csv` 源数据一致。
