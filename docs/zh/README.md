<div align="center">

# C2C zkTLS 协议文档 · 中文导航

**基于 zkTLS 的半去中心化 C2C 法币 ↔ 加密货币兑换协议**

[🚀 快速上手](hands-on/01-quickstart.md) · [🧠 深度轨](deep-dive/01-overview.md) · [📚 源码地图](reference/code-map.md) · [🌐 English](../en/README.md)

</div>

---

> [!NOTE]
> 一篇硕士论文的配套开源文档。文档所有事实以**实际代码与源数据**为准；代码引用均写 `文件:行号`，可点击核对。

## ⏱ 30 秒看懂

**痛点**：法币 ↔ 加密货币的 C2C 兑换，链下支付（支付宝/Wise 转账）事实**无法被链上合约直接验证**，只能依赖中心化平台托管 + 人工仲裁。

**解法**：链下用 **MPC-TLS（TLSNotary）** 把支付事实变成密码学证明，验证服务器签名后**在链上合约里被直接核验**，资产托管与订单状态在链上确定性执行。两大创新：① **订单绑定哈希** 把链下证明与链上订单密码学绑定（防跨单复用/篡改）；② **半去中心化双域架构**（链上去中心化执行 + 链下受约束公证）。

---

## 🎯 填补的空白：三属性兼得

本方案是主流路线中，**唯一在支持法币兑换前提下同时实现三属性**的方案（论文 ch2 对比）：

| 属性 | 中心化交易所 | P2P OTC | 链上 DEX+预言机 | **本文方案** |
|---|:---:|:---:|:---:|:---:|
| 支持法币兑换 | ✓ | ✓ | ✗ | **✓** |
| 资产托管去信任 | ✗ | ✗ | ✓ | **✓** |
| 支付证明密码学可验证 | ✗ | ✗ | N/A | **✓** |
| 账户标识链上隐私 | ✗ | ✗ | N/A | **✓** |

> [!NOTE]
> 代价：对验证服务器的弱信任 + 当前单节点的有限抗单点故障——半去中心化的工程权衡。

---

## 🧭 选择你的路径

### 🚀 动手轨（想跑起来）
1. [快速上手](hands-on/01-quickstart.md) — 本地跑通最小闭环（零真实账号）
2. [演示走查](hands-on/02-demo-walkthrough.md) — 真实环境完整换汇五步
3. [排错速查](hands-on/03-troubleshooting.md) — 报错对照 + FAQ

### 🧠 深度轨（想读懂协议）
1. [总览](deep-dive/01-overview.md) — 协议全景与阅读地图 ⭐入口
2. [zkTLS 与 TLSNotary](deep-dive/02-zktls-tlsnotary.md) — 密码学基石
3. [威胁模型](deep-dive/03-threat-model.md) — 为什么这样设计（T1–T5）
4. [协议设计](deep-dive/04-protocol-design.md) — 系统设计与两大创新 ⭐
5. [安全分析](deep-dive/05-security-analysis.md) — 安全目标 S1–S5 论证
6. [评估](deep-dive/06-evaluation.md) — 实测 Gas / 时延数据

### 📚 共享参考区
- [源码地图](reference/code-map.md) — 论文概念 ↔ 源码位置 ⭐桥梁
- [合约速查](reference/contracts.md) — 接口/事件/权限/部署
- [验证器与插件](reference/verifier-plugin.md) — 可扩展性、接入新平台
- [术语表](reference/glossary.md) — 名词速查
- [论文信息](thesis.md) · [归属与许可](ATTRIBUTION.md)

---

## 📊 关键数字

- 单笔完整换汇链上成本 ≈ **\$0.13**（Arbitrum One 均值档）
- 端到端时延：支付宝 5.94 s / Wise 9.74 s（理想）；17.44 s / 24.02 s（宽带）
- 合约测试 **实跑 336 passing / 0 失败**（2026-06-02）

> [!IMPORTANT]
> 数字复算过程见 [deep-dive/06-evaluation.md](deep-dive/06-evaluation.md)。

---

<details>
<summary>📑 <b>论文章节 ↔ 文档映射</b>（点击展开）</summary>

| 文档 | 主要论文来源 |
|---|---|
| [deep-dive/01-overview](deep-dive/01-overview.md) | abstract、ch1.3、ch4.1 |
| [deep-dive/02-zktls-tlsnotary](deep-dive/02-zktls-tlsnotary.md) | ch2.2–2.4 |
| [deep-dive/03-threat-model](deep-dive/03-threat-model.md) | ch3.1、ch3.5、ch3.6 |
| [deep-dive/04-protocol-design](deep-dive/04-protocol-design.md) | ch4.1–4.6 |
| [deep-dive/05-security-analysis](deep-dive/05-security-analysis.md) | ch4.7、ch4.8 |
| [deep-dive/06-evaluation](deep-dive/06-evaluation.md) | ch6 + `data_analysis/` |
| [reference/contracts](reference/contracts.md) | ch4.2、`packages/contracts` |
| [reference/verifier-plugin](reference/verifier-plugin.md) | ch4.3、ch4.4、`verifier`+`plugin-sdk` |
| [reference/code-map](reference/code-map.md) | ch4、ch5、全 monorepo |
| [hands-on/*](hands-on/01-quickstart.md) | ch5、README、demo/keeper |

</details>
