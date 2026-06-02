# 验证器与插件：可扩展性参考

> **本篇定位**：协议的可扩展性——平台验证器如何抽象、支付宝/Wise 怎么实现、**如何接入第 3 个支付平台**、插件 SDK API、Webhook 配置。
> **读者**：想扩展协议的进阶动手同学。前置阅读 [code-map.md](code-map.md)、[contracts.md](contracts.md)。
> 事实以源码为准。

---

## 1. 平台验证器接口抽象

所有支付平台验证器实现统一接口 [`IPlatformVerifier`](../../../tlsn-extension/packages/contracts/contracts/interfaces/IPlatformVerifier.sol)：

```solidity
function verifyBuyerPayment(bytes proofsData, bytes paramsData) external returns (bytes32 txId);
function verifyMerchantSent(bytes proofsData, bytes paramsData) external returns (bytes32 txId);
```

- `proofsData` = `abi.encode(TLSNProof[])`，证明条数由平台决定（支付宝 1 条、Wise 2 条）。
- `paramsData` = `abi.encode(uint256 fiatAmountX1000, string targetCurrency, uint256 orderDeadline, uint256 orderCreationTime)` —— **4 字段**（[IPlatformVerifier.sol:10-18](../../../tlsn-extension/packages/contracts/contracts/interfaces/IPlatformVerifier.sol#L10-L18)）。其中 `orderCreationTime` 使支付时间须落在 `[创建, 截止]` 区间，防止旧/过期转账被复用。
- `TLSNVerifier` 在调用平台验证器**之前**已完成所有密码学核验（chainId、会话去重、承诺校验、验证器签名）；平台验证器只做**业务规则匹配**。

**统一委托入口** [`TLSNVerifier.verifyAndDelegate`](../../../tlsn-extension/packages/contracts/contracts/TLSNVerifier.sol#L196-L223)：

```
verifyAndDelegate(platformId, isMerchantSent, proofs, paramsData)
  ├─ 对每个 proof：_verifyTLSNProof + 校验 serverName ∈ trustedPaymentServers
  ├─ verifier = platformVerifiers[platformId]   // 注册表查找
  └─ isMerchantSent ? verifyMerchantSent : verifyBuyerPayment   // 委托
```

> `isMerchantSent=false` → 买方付款（CRYPTO 产品）；`true` → 商家付款（FIAT 产品）。

---

## 2. 支付宝 / Wise 实现要点

### 2.1 支付宝（单证明）

源码：[`platforms/AlipayPlatformVerifier.sol`](../../../tlsn-extension/packages/contracts/contracts/platforms/AlipayPlatformVerifier.sol)

`proofs[0]` = 支付宝订单 API 证明。链上校验（[:81-148](../../../tlsn-extension/packages/contracts/contracts/platforms/AlipayPlatformVerifier.sol#L81-L148)）：

| 字段 | 规则 |
|---|---|
| `status` | 必须 `"SUCCESS"`，否则 `AlipayPaymentNotCompleted` |
| `bizType` | 必须 `"TRANSFER"`，否则 `InvalidAlipayBizType` |
| `payAmount`（×1000） | 必须等于 `fiatAmountX1000`，否则金额不符 |
| `orderId` | `keccak256(orderId)` 作 `txId`，写入 `usedAlipayOrderIds` 去重 |
| `gmtSuccess` | 经 `TLSNParserLib.parseDatetimeToUnix` 解析，须落在 `[orderCreationTime, orderDeadline]` |

> 💡 链上业务校验只要求 5 个金额/状态/时间字段（[:184-186](../../../tlsn-extension/packages/contracts/contracts/platforms/AlipayPlatformVerifier.sol#L184-L186)）；收款人身份匹配由**验证服务器 accountCheck** 在链下完成（见 §2 末尾说明）。

### 2.2 Wise（双证明）

源码：[`platforms/WisePlatformVerifier.sol`](../../../tlsn-extension/packages/contracts/contracts/platforms/WisePlatformVerifier.sol)

`proofs[0]` = contacts 证明，`proofs[1]` = transfer 证明。transfer 链上校验（[:128-153](../../../tlsn-extension/packages/contracts/contracts/platforms/WisePlatformVerifier.sol#L128-L153)）：

| 字段 | 规则 |
|---|---|
| `state` | 必须 `"OUTGOING_PAYMENT_SENT"`，否则 `PaymentNotCompleted` |
| `targetAmount`（×1000） | 必须等于 `fiatAmountX1000` |
| `targetCurrency` | 必须等于 `targetCurrency` |
| `id` | 作 `transferId` 写入 `usedTransferIds` 去重 |
| `date`（毫秒） | `/1000` 后须落在 `[orderCreationTime, orderDeadline]` |

> 💡 `_verifyContacts`（[:121-123](../../../tlsn-extension/packages/contracts/contracts/platforms/WisePlatformVerifier.sol#L121-L123)）为空函数——contacts 证明在结构上必需（须通过密码学核验且 serverName 受信），其收款人身份内容由验证服务器 accountCheck 在链下核验。
>
> **为什么账户校验放在链下**：当前无法在不泄露隐私的前提下于链上验证身份——对整个协议直接套 zk 会显著增加时延与手续费，对各方都不利。因此采用「链下 accountCheck + 验证器对 `orderBindingHash`（含账户哈希）签名」的方案：验证器的签名保证了签名前已核对正确账户。链上的账户校验入口预留给未来完全去中心化阶段（zkTLS 性能达标后可平滑迁移上链）。详见 [03-threat-model.md](../deep-dive/03-threat-model.md)、[05-security-analysis.md](../deep-dive/05-security-analysis.md)。

---

## 3. 接入第 3 个支付平台

得益于注册表 + 统一接口，**无需改动任何已部署合约**。四步：

**① 合约侧**：写一个实现 [`IPlatformVerifier`](../../../tlsn-extension/packages/contracts/contracts/interfaces/IPlatformVerifier.sol) 的新合约（参照 `AlipayPlatformVerifier`），自带 `usedXxxIds` 去重 map，部署后调用 admin 函数：

```solidity
tlsnVerifier.setPlatformVerifier(keccak256("yourplatform"), newVerifierAddress);
tlsnVerifier.addTrustedPaymentServer("api.yourplatform.com");  // 受信支付服务器
```

**② 验证服务器侧**：在 `accountCheck` 的揭示范围里加入新平台的收款人身份字段（链下核身份），并按需配置 Webhook（见 §5）。

**③ 前端 adapter**：在 [`web/src/platforms/`](../../../tlsn-extension/packages/web/src/platforms/) 新增一个 `PaymentPlatform` 对象并注册进 [`registry.ts`](../../../tlsn-extension/packages/web/src/platforms/registry.ts#L6) 的 `allPlatforms`。`PaymentPlatform` 形状（[`types.ts:21-35`](../../../tlsn-extension/packages/web/src/platforms/types.ts#L21-L35)）：

```ts
interface PaymentPlatform {
  id: Hex;                       // keccak256(toBytes(key))，须与链上 platformId 一致
  key: string;                   // 平台键
  label: string;
  pluginUrl: string;             // 取证插件地址
  proofShape: 'single' | 'dual'; // 单/双证明（支付宝 single，Wise dual）
  buildInjections(ctx, extra?): PlatformInjections;  // 注入订单绑定标记
  parsePluginResult(json): PluginResult;             // 解析插件返回
}
```

> 📁 前端 adapter 在 `web/src/platforms/`：`registry.ts`/`types.ts`/`wise.ts`/`alipay.ts`。

**④ 插件**：提供取证插件（在浏览器扩展中跑，生成对应平台的 TLS 证明），见 §4 与 [`packages/tutorial`](../../../tlsn-extension/packages/tutorial/)。

> 接入新平台的概念见论文 ch4.4.4；具体函数签名与前端位置以本节为准。

---

## 4. 插件 SDK API

源码：[`packages/plugin-sdk`](../../../tlsn-extension/packages/plugin-sdk/)。插件在 **QuickJS WebAssembly 沙箱**中运行（[`index.ts:455-463`](../../../tlsn-extension/packages/plugin-sdk/src/index.ts#L455-L463)，`allowFetch:false, allowFs:false`，网络与文件系统默认禁用）——这是插件执行隔离的基础（见 [05-security-analysis.md](../deep-dive/05-security-analysis.md)）。

**统一 `prove()`**（[`index.ts:668`](../../../tlsn-extension/packages/plugin-sdk/src/index.ts#L668) 注入）：

```js
const proof = await prove(
  { url, method, headers },                       // 请求
  { verifierUrl, proxyUrl, maxRecvData, maxSentData,
    handlers: [ /* 选择性披露 handler */ ] }
);
```

一次 `prove()` 完成：建立 prover→verifier 连接 → 经 TLS 发请求 → 捕获转录 → 用 `Parser` 解析字节范围 → 应用 handler 选择性披露 → 生成密码学证明。

**Handler（选择性披露）**：
- `type`：`'SENT'`（请求）/ `'RECV'`（响应）
- `part`：`'START_LINE'`/`'METHOD'`/`'HEADERS'`/`'BODY'`/`'STATUS_CODE'` 等
- `action`：`'REVEAL'`（明文）/ `'PEDERSEN'`（承诺）
- `params`：粒度控制（`type:'json'`、`path`、`hideKey`、`hideValue`）

**类 React Hooks**：`useState`/`setState`、`useEffect`、`useRequests`、`useHeaders`；UI 原语 `div()`/`button()`；能力 `openWindow()`、`done()`。详见 [`index.ts`](../../../tlsn-extension/packages/plugin-sdk/src/index.ts) 与 `CLAUDE.md` Plugin SDK 段。

**`policyVersion`**：插件 `config` 可声明 `policyVersion`（[`index.ts:880-884`](../../../tlsn-extension/packages/plugin-sdk/src/index.ts#L880-L884)），它会被 hash 进验证器签名摘要（`policyVersionHash`），把「用哪版披露策略生成的证明」锁进签名（见 [02-zktls-tlsnotary.md](../deep-dive/02-zktls-tlsnotary.md)）。

---

## 5. Webhook 配置

验证完成后，验证服务器可向外部后端推送一条**精简 Webhook**（fire-and-forget），用于实时合规决策。

- **配置**：`config.yaml` 按 server name 配置，支持 `"*"` 通配回退（[`main.rs:575-579`](../../../tlsn-extension/packages/verifier/src/main.rs#L575-L579)）。
- **负载**：`SlimWebhookPayload`——**仅含 Travel Rule 合规字段，不含原始转录**（[`main.rs:653-657`](../../../tlsn-extension/packages/verifier/src/main.rs#L653-L657)）。
- **安全**：可选 HMAC-SHA256 经 `X-TLSN-Signature` 头签名（[`main.rs:542`](../../../tlsn-extension/packages/verifier/src/main.rs#L542)）。
- **时机**：在验证器签名**之后**触发（[`main.rs:1582,1649-1652`](../../../tlsn-extension/packages/verifier/src/main.rs#L1649-L1652)）。

`config.yaml` 示例：

```yaml
webhooks:
  "wise.com":
    url: "https://your-backend.example.com/webhook/wise"
    secret: "your-hmac-secret"        # 可选，HMAC-SHA256
  "*":
    url: "https://your-backend.example.com/webhook/default"
```

> 📍 实现位置：Webhook 投递逻辑位于 [`verifier/src/main.rs`](../../../tlsn-extension/packages/verifier/src/main.rs)（`webhook.rs` 为占位模块）。
