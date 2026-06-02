# 快速上手：本地跑通最小闭环

> [!NOTE]
> **本篇导读**
> - **定位**：在本机跑起本地链 + 合约 + 验证服务器 + 扩展 + dApp，零真实支付账号。
> - **读者**：动手轨。
> - **命令来源**：[`tlsn-extension/README.md`](../../../tlsn-extension/README.md)、[`packages/contracts/scripts/deploy-web.ts`](../../../tlsn-extension/packages/contracts/scripts/deploy-web.ts)、各 `package.json`。

> [!WARNING]
> **本篇验证状态（如实标注）**
> - ✅ **已实跑核验**：`hardhat test` 合约测试（WSL，2026-06-02）—— **336 passing / 0 failing**。工具链：WSL 内 Node v24.10.0（nvm）、cargo 1.95（nightly）。
> - ⏳ **命令源自已核验脚本**：完整 deploy + verifier + extension + web 端到端启动未在本轮逐条实跑（需 Rust 编译 + 浏览器加载扩展），命令取自上述脚本与官方 README，端口/产物已与源码核对一致。首次运行请以实际输出为准。

---

## 0. 前置环境

| 依赖 | 版本 | 说明 |
|---|---|---|
| Node.js | ≥ 18（实测 v24） | monorepo / 合约 / 前端 |
| Rust (cargo) | stable（实测 1.95） | 验证服务器，装自 [rustup.rs](https://rustup.rs/) |
| Chrome/Chromium | 最新 | 加载浏览器扩展 |

> 本项目验证服务器在 WSL/Linux 下运行最顺（作者环境为 WSL2 Ubuntu）。

---

## 1. 克隆与安装

```bash
cd tlsn-extension
npm install          # 安装 monorepo 全部依赖并建立 workspace 链接
```

## 2. 确认环境（实跑合约测试）

先跑合约测试，确认工具链就绪——这是本篇唯一已逐条实跑核验的步骤：

```bash
cd packages/contracts
npx hardhat test     # 期望：336 passing / 0 failing（全 12 套件）
```

> 若 `hardhat` 未找到：它被提升到根 `node_modules/.bin`；从 `packages/contracts` 目录运行 `npx hardhat test`，或把根 `.bin` 加入 PATH。

## 3. 启动本地链 + 部署合约

**终端 1** —— 启动本地链（chainId `31337`）：

```bash
cd packages/contracts
npm run node         # = hardhat node --network hardhatMainnet
```

**终端 2** —— 部署 + 种子数据：

```bash
cd packages/contracts
npm run deploy:web   # = hardhat run scripts/deploy-web.ts --network localhost
```

部署脚本（[deploy-web.ts](../../../tlsn-extension/packages/contracts/scripts/deploy-web.ts)）会按顺序部署 7 个合约 + 接线 + 注册信任名单 + 种子 1 商家 + 4 产品（Wise×MYR、Alipay×CNY 各 CRYPTO/FIAT），并写出：
- [`packages/contracts/deployments/web-31337.json`](../../../tlsn-extension/packages/contracts/deployments/web-31337.json)（地址 + `deploymentBlock`，keeper/前端读取）
- `packages/web/.env.local`（`NEXT_PUBLIC_*` 合约地址，chainId=31337）

> 部署顺序与接线详见 [reference/contracts.md §4](../reference/contracts.md)。

## 4. 启动验证服务器

**终端 3**：

```bash
cd packages/verifier
cargo run            # 默认监听 0.0.0.0:7047（首次会编译 Rust，稍久）
```

健康检查：

```bash
curl http://localhost:7047/health    # 期望返回：ok
```

端点（[main.rs:223-232](../../../tlsn-extension/packages/verifier/src/main.rs#L223-L232)）：`GET /health`、`WS /session`、`WS /verifier?sessionId=`、`WS /proxy?token=`、`GET /proof*`。

> 验证服务器需配置签名私钥（环境变量 `VERIFIER_PRIVATE_KEY`），其签名地址须与部署时 `addTrustedVerifier` 注册的地址一致（演示默认 Hardhat account[9]）。详见 [reference/verifier-plugin.md](../reference/verifier-plugin.md)。

## 5. 启动浏览器扩展

**终端 4**：

```bash
cd tlsn-extension
npm run dev          # 自动构建依赖 + webpack-dev-server（端口 3000），产物写入 packages/extension/build/
```

在 Chrome 加载：`chrome://extensions/` → 开启「开发者模式」→「加载已解压的扩展程序」→ 选 `packages/extension/build/`。

> [!WARNING]
> 扩展版本须与 notary/验证器版本一致（见 [03-troubleshooting.md](03-troubleshooting.md)）。

## 6. 启动 C2C dApp

**终端 5**：

```bash
cd tlsn-extension/packages/web
npm run dev          # = node scripts/start-dev.js，Next.js 默认端口 3001
```

浏览器打开 `http://localhost:3001`，连接钱包（导入 Hardhat 测试账户私钥，网络指向本地 31337）。

## 7. 跑「下单 → 证明 → 结算」最小闭环（无需真实账号）

无需真实支付宝/Wise 账号即可验证的路径：

1. **合约层**：`npx hardhat test`（步骤 2）已覆盖完整「下单→提交证明→结算/超时」状态机（见 `ESC-FLOW`/`INT` 用例），证明数据由 [`test/helpers/buildTLSNProof.ts`](../../../tlsn-extension/packages/contracts/test/helpers/buildTLSNProof.ts) 程序化构造——**这是零真实账号验证协议正确性的最快路径**。
2. **插件层**：扩展 DevConsole 自带示例插件，或用 [`packages/demo`](../../../tlsn-extension/packages/demo/)/[`packages/tutorial`](../../../tlsn-extension/packages/tutorial/) 的示例插件 + 样本 transcript 跑通证明生成流水线（连本地 verifier）。
3. **真实换汇全流程**（需真实支付宝/Wise 账号）：见 [02-demo-walkthrough.md](02-demo-walkthrough.md)。

**成功判据**：
- 合约测试 336 passing / 0 failing ✅
- `curl localhost:7047/health` 返回 `ok`
- dApp 在 3001 可连钱包、看到 4 个种子产品
- 扩展在 `chrome://extensions/` 正常加载、DevConsole 可打开

---

> [!TIP]
> 跑不通？查 [03-troubleshooting.md](03-troubleshooting.md)。想看真实换汇全流程，看 [02-demo-walkthrough.md](02-demo-walkthrough.md)。想理解每步在干什么，看 [deep-dive/01-overview.md](../deep-dive/01-overview.md)。

---

<div align="center">

🏠 [文档导航](../README.md) · 下一篇 ▶ [02 · 演示走查](02-demo-walkthrough.md)

</div>
