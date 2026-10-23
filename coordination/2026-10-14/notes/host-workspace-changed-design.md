# `host.workspace.changed@1` 一页设计（② 10-22，待 ① 批）

> 状态：设计稿，待 ① 裁 D1–D5；批之前不动工。基线 origin/main `f6f0b1fd3`（X-6 `host.review.settled@1` 已在 main，#1013 → `e1d56849d`）。

## 0. 来源与边界

- **形状**：① 10-22 定的形状（见下表）。
- **起因**：③ 的 G2b（#1023 在途）要一条广播的「工作区变了」宿主事件。
- **N-14 出口**：这也是 `apps/local-host/src/coding-surface.ts:127` 记的「N-14」出口。那个 N-14 是 Coding 代码注释里的编号，与防腐附录里讲 SDK 补丁的 N-14 不是同一件事。Files 有了平台的工作区通知以后，`readsFilesOutputs` 那段「先让 Files 刷新」的钩子就能删。
- **机制**：完全沿用 X-6 现有的那一套，`packages/plugin-runtime/src/host-events.ts` 的 `PluginHostEvents`。

① 定的形状：

| 项 | 定法 |
| --- | --- |
| 何时发 | 写工作区的审查结算时（成功或不明）；别的写工作区来源以后再加 |
| 发给谁 | 本项目里正在运行、当前 Manifest 订阅了它、持有工作区读权限的每个安装（广播） |
| 载荷 | 只有 `{ workspace_id, cause }`；不带 `operation_id`、结果、发起者（S-54 的保密不破） |
| 投递 | 照 X-6：即时、至多一次、不落库、在动作之外跑、调用处理器前再核一次收件条件 |

## 1. 合同（contracts，进批）

- **类型表**：`HOST_EVENT_TYPES` 每条加投递方式，由合同固定，调用方选不了。
  - 现有一条：`{ event_type_id: "host.review.settled", type_version: 1, delivery: "addressed" }`。
  - 新加一条：`{ event_type_id: "host.workspace.changed", type_version: 1, delivery: "broadcast", permission: "workspace:read" }`。
- **载荷**：`HostWorkspaceChangedPayload = { workspace_id: string; cause: "plugin-operation" }`。
  - 只有这两个键，`cause` 现在只有这一个值。
  - 处理器不该按 `cause` 分支，收到就当「这个工作区可能变了，重读」。
  - 以后加值按 `docs/system/CONTRACT-CHANGES.md` 走。
- **Manifest 检查**（D4）：订阅一条带 `permission` 的广播宿主事件，`permissions` 里却没声明那项权限的，读 Manifest 时拒绝（`plugin.declaration_invalid`）。这条检查加在 SDK 的 `inspectEventDeclarations`。
- 公开 API 快照会动：contracts 的 `platform/plugin-events`、`platform/plugin`；SDK 不动导出。

## 2. 运行时（plugin-runtime，进批）

- **`broadcast(input)`**：`PluginHostEvents` 新加的方法，只收 `delivery: "broadcast"` 的类型。反过来，`notify` 只收 `addressed` 的类型。用错的抛 `plugin.event_type_invalid`，所以 `host.review.settled` 不可能被广播出去。
- **逐个排队**：`broadcast` 遍历 `lifecycle.enabledPluginIds()`，给每个安装各建一份投递，走现有的 `#enqueue`。
  - 每份有自己的 `event_id`；`correlation_id` 为 null（review_id 会泄露是哪次审查）。
  - 每个安装一条链，顺序不乱：发起者若两种都订了，先收到 `review.settled`，再收到 `workspace.changed`。
- **`#current` 加一项**：投递带着 `permission` 时，要求这项权限此刻仍然在手，即 Manifest 声明了它，而且安装的 grants 里有它（与 `apps/local-host/src/plugin-callers.ts` 的 `heldPermissions` 同一口径）。
  - 发出时核一次，调用处理器那一刻再核一次；中间撤了授权的就丢弃。
  - 为此 `PluginHostLifecycle.installation()` 的返回加上 `grants`（只读）。
- 其余全照旧：
  - 不为它启动插件、不落库、不重投；
  - 停止、崩溃、重装就丢弃（撤回计数）；
  - 处理器拿到的是订阅者自己的上下文；
  - 失败只报 `observeFailures`。

## 3. 宿主（local-host）

- **哪些结算发**：`apps/local-host/src/review-settlement-events.ts` 的同一个观察者，对本项目、`operation.kind` 属于 `PLUGIN_REVIEW_KINDS`（带 `workspace_id`）、结果为成功或不明的结算，另外发一条 `broadcast`。
- **不要求发起的激活还在**：和 `review.settled` 不同，这里不要求 `origin.holds()`，因为发起的激活停了，写入照样发生了。
- **不发的**：失败的结算不发。从账本恢复出来的结算，队列本来就不通知。
- **接线不动**：仍由 `reviewSettlementForwarder` 发出，所以 `apps/local-host/src/project-plugins.ts` 一行不改。这样可以避开 #1023 在那里的改动。

## 4. 安全不变量与拒绝测试

**D3**：扩 S-54，不取新号。理由：
- 同一个类、同一套投递核对；
- S-54 已写「定向的只投给……」，留了广播的位置。

S-54 补一段：
- 广播的宿主事件只投给本项目里运行中、订阅了它、持有类型表登记的那项权限的安装；
- 投递方式由类型表固定；
- `host.workspace.changed@1` 的载荷只有 `workspace_id` 与 `cause`；
- 撤权的安装在排队与执行之间被丢弃。

测试加在 `tests/security-invariants-host-events.test.ts`，接着现有编号：

| 编号 | 断言（拒绝本身） |
| --- | --- |
| X6-08 | 声明了 `workspace:read` 却没被授予的安装收不到；排队后、执行前撤掉授权的也收不到 |
| X6-09 | 没订阅的安装收不到；别的项目的安装收不到 |
| X6-10 | 载荷的键正好是 `workspace_id`、`cause`，没有 review_id、operation_id、结果、插件 id，`correlation_id` 为 null |
| X6-11 | 投递方式由类型固定：`broadcast("host.review.settled")` 和 `notify("host.workspace.changed")` 都抛 `plugin.event_type_invalid` |
| X6-12 | 失败的结算不广播；结果不明的广播；发起者已停止，别的订阅者照样收到 |
| X6-13 | Manifest 订阅 `host.workspace.changed@1` 却没声明 `workspace:read`，读 Manifest 时拒绝 |

重装、停止、崩溃都丢弃，这一点沿用 X6-05 的写法，各补一个广播的场景。

## 5. 要 ① 裁的

| # | 问题 | 推荐 | 理由 |
| --- | --- | --- | --- |
| D1 | 「持有工作区读权限」的口径 | 声明并且授予（`heldPermissions` 同一口径），发出时和执行时各核一次 | 与动作网关一致；授权中途撤掉也拦得住 |
| D2 | v1 由什么触发 | 只由插件发起的四种工作区审查（git-index/operation/worktree/integration）结算触发，成功或不明都发，不管发起者还在不在；Agent 的改动、`checkpoint-rewind`、Molis 之外的改动不在 v1 | 照 ① 的形状。Agent 的文字编辑只有 `workspace_path`、没有 `workspace_id`，要另做映射；命令改了什么说不准；有的写入根本不经审查（推断，没核）。**后果**：光有 v1，还不够删 `readsFilesOutputs`。Agent 的改动和外部改动照样会让 Files 的快照过期，N-14 出口要第二个来源。建议另开一条 BL（Agent 批准的写入也发，`cause` 加 `agent-change`），到时候再定 |
| D3 | S 行 | 扩 S-54 | 见第 4 节 |
| D4 | Manifest 订阅时就查权限声明 | 查 | 作者早知道；投递时照样核授予 |
| D5 | 短时间多次结算要不要合并 | v1 不合并 | 与 X-6 一致，简单；量大了再加 |

## 6. 改动范围与冲突

- **改动的文件**：
  - contracts：`platform/plugin-events.ts` 及快照；
  - SDK：`wiring-declarations.ts`；
  - plugin-runtime：`host-events.ts`、`lifecycle.ts`，以及实现 `installation()` 的适配器；
  - local-host：`review-settlement-events.ts`；
  - 安全：`docs/system/SECURITY-INVARIANTS.md` 的 S-54；
  - 文档：`docs/platform/PLUGIN-PLATFORM.md`、`docs/system/EXTENSION-POINTS.md`（X-6 行）、`docs/system/GLOSSARY.md`、`skills/molis-plugin-dev/elements.md`、`skills/molis-plugin-dev/host.md`；
  - 测试。
- **规模**：一个 PR，约 300 行。共享核心，进批。
- **冲突**：
  - #1023（G2b）改 `SECURITY-INVARIANTS.md` 的 S-18 那句、`project-plugins.ts` 等。本片不碰 `project-plugins.ts`；S-54 与 S-18 是不同的行，最多相邻。
  - 开工前再用 `gh pr list` 核一遍在途 PR。
- **谁先用**：Git（G2b 之后，刷新状态）和 Files（刷新快照）先订阅，各归 ③ 的插件 PR。本片只做平台，不改任何插件。
