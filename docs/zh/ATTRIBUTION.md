# 归属与许可

本仓库是基于 [tlsnotary/tlsn-extension](https://github.com/tlsnotary/tlsn-extension)（由 **TLSNotary / PSE 团队**及其贡献者创建）的**衍生作品**。

## 上游项目

- **项目**：TLSNotary Extension（浏览器扩展、插件 SDK、验证服务器）
- **来源**：https://github.com/tlsnotary/tlsn-extension
- **许可**：双许可 **Apache-2.0 OR MIT**（任选其一，见上游 README）
- **版权**：© TLSNotary / PSE 贡献者

TLSNotary 扩展提供了**基于浏览器的 TLS 证明生成基础**——正是这部分让本项目的其余工作成为可能。源码位于本仓库 [`tlsn-extension/`](../../tlsn-extension/) 子模块。

## 本仓库的贡献

在上游基础之上，**C2C（消费者对消费者）法币↔加密货币支付协议层**由 **looikaizhi（雷凯智 / Looi Kai Zhi）** 添加，包括：

| 包/部分 | 说明 |
|---|---|
| [`tlsn-extension/packages/contracts`](../../tlsn-extension/packages/contracts/) | C2C 托管 / 保证金库 / 风险管理智能合约 |
| [`tlsn-extension/packages/web`](../../tlsn-extension/packages/web/) | C2C 交易 dApp |
| [`tlsn-extension/packages/keeper`](../../tlsn-extension/packages/keeper/) | 链上超时结算 keeper |
| `tlsn-extension/packages/verifier`、`packages/demo` 的 C2C 扩展 | 验证服务器的账户核验/签名/Webhook 等 C2C 特定逻辑 |

> 与上游 `docs/ATTRIBUTION.md` 核对一致：合约/web/keeper 三包 + verifier/demo 的 C2C 扩展为本文贡献。

这些贡献 © 2026 looikaizhi，并以与上游**相同的 Apache-2.0 OR MIT 双许可**发布。

## 如何区分谁做了什么

完整的作者划分**保留在 Git 历史**与 GitHub Contributors 图谱中，未做摘要或压缩：

- TLSNotary 团队的提交可追溯至 **2023-07**（项目首次提交）。
- C2C 协议层的提交为 **2026 年**。

请勿压缩或重写历史，以保持此归属完整。

## 致谢

感谢 TLSNotary / PSE 团队（@0xtsukino、@hendrikeeckhaut、@mhchia 等贡献者）的工作，使本文得以专注于 C2C 协议设计。
