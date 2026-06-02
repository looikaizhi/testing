# 论文信息

本文档是下述硕士学位论文的配套开源实现。

## 基本信息

| 项 | 内容 |
|---|---|
| 中文标题 | 基于 zkTLS 的半去中心化的 C2C 兑换协议设计与实现 |
| 英文标题 | Design and Implementation of a Semi-Decentralized C2C Exchange Protocol Based on zkTLS |
| 作者 | 雷凯智（LOOI KAI ZHI），学号 3820241067 |
| 指导教师 | 车海莺 副教授（Prof. HaiYing Che） |
| 答辩委员会主席 | 周天飞 教授 |
| 学院 | 北京理工大学 计算机学院（School of Computer Science and Technology） |
| 学位 | 工学硕士（Master of Engineering） |
| 一级学科 | 计算机科学与技术（Computer Science and Technology） |
| 提交日期 | 2026 年 6 月 |
| 中图分类号 / UDC | TP393.0 / 004 |

**关键词**：zkTLS；半去中心化协议；C2C 资产兑换；链下支付证明；智能合约托管

**Keywords**：zkTLS; semi-decentralized protocol; C2C asset exchange; off-chain payment proof; smart contract escrow

> 来源：论文模板 `main.tex:31-134`、`chapters/abstract.tex`。

---

## 摘要

随着稳定币与数字资产的发展，法币与加密货币的 C2C 兑换需求持续增长，但现有方案普遍依赖"平台撮合 + 资产托管 + 人工仲裁"，链下支付事实无法被链上合约直接验证，导致交易安全仍建立在中心化平台信任之上。围绕"如何在无中介条件下将链下支付转化为链上可验证证明"这一核心问题，本文提出并实现了基于 TLSNotary 的 zkTLS 半去中心化 C2C 兑换协议。

技术路线上，本文采用"协议分析—系统设计—原型验证"方法，构建链上合约层、链下证明层、支付平台对接层与前端交互层四层架构，并将系统划分为去中心化域与受约束中心化域：资产托管与订单状态迁移在链上由合约确定性执行；法币支付事实在链下通过 MPC-TLS 生成证明，由验证服务器签名后上链校验。

两项关键贡献：① 通过订单绑定摘要将链下 TLS 证明与链上订单进行密码学绑定，实现支付事实可验证上链，并有效阻断跨订单复用与参数篡改；② 提出"链上去中心化执行 + 链下受约束公证计算"的半去中心化双域架构，在当前全去中心化 zkTLS 时延仍较高的条件下，实现信任最小化与系统可部署性的平衡。

原型结果：单笔完整换汇在 Arbitrum One 上链上成本约 \$0.13；端到端时延理想环境下支付宝 5.94 s、Wise 9.74 s，宽带环境下 17.44 s、24.02 s。

> 完整中英文摘要见 `chapters/abstract.tex`。代码实现对论文中的机制做了更精确的落地，细节以本文档与源码为准。

---

## 章节 ↔ 文档对照

见 [docs/zh/README.md 的映射表](README.md#论文章节--文档映射)。

---

## 引用（BibTeX）

```bibtex
@mastersthesis{looi2026c2czktls,
  title  = {基于 zkTLS 的半去中心化的 C2C 兑换协议设计与实现},
  author = {雷凯智 (LOOI KAI ZHI)},
  school = {北京理工大学 计算机学院},
  year   = {2026},
  month  = {6},
  type   = {硕士学位论文},
  note   = {指导教师: 车海莺副教授}
}
```

> 注：论文 PDF（`main.pdf`）与 LaTeX 源位于论文模板目录（仓库外），未随本开源仓库分发。
