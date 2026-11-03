# PG-111：Feed 的合同归 Feed（T-110）

状态：实现已随 [#1440](https://github.com/molis-ai/molis-work/pull/1440) → `9170e7eb5022a238430b5c9079a83643cc9286fb` 合入并被当前 main 采用（2026-10-31 核收；历史实现负责人 Claude（设备 A），原分支 `task/T110-ca`；本次文档作者 Codex）。做法同 [Form、灵光等六份的那一片](pg111-leaf-plugin-contracts.md)；方案在 #1332【方案 T-110】，四个待决点按方案的推荐定（统筹 6486335681：设备 A 的甲档方案自己定）。验收号 RAC-1750～1754。

## 1. 为什么不能整份挪

`packages/contracts/src/modules/` 里 Feed 的三份合同（`feed.ts`、`signals.ts`、`sources.ts`）和 `services/listener-host.ts` 大部分只有 Feed 用，但有三处是平台的：

| 形状 | 谁在用 | 去处 |
| --- | --- | --- |
| `RawEventAdapter`（原在 `services/listener-host`） | 集成插件 `bind()` 交出的 `signal_adapter`（`platform/plugin.ts`），平台的连接器拉取（`platform/plugin-source-pull.ts`、`packages/plugin-runtime/src/source-pull-connector.ts`） | `platform/plugin-source-pull`；`ConnectorSignalDraft` 写成它原来 `Omit<SignalDraft, …>` 剩下的六个字段，不再引用 Feed 的 `SignalDraft` |
| `RssFetchReceipt`（原在 `modules/sources`） | 平台拉取的回执（`SourcePullResult.http_receipt`）与来源词表（`rssCursorAfterSuccess`），RSS 集成 | `platform/plugin-source-pull`，逐字不变 |
| `feedErrors` 里 RSS、YouTube 抛的四个码，宿主 `source-pull-intent.ts` 抛的两个码 | RSS 自定义地址、YouTube 频道的规范化（平台来源词表的实现），平台 `sourcePull.plan` 的校验 | 各用自己的名字：`rss.custom_url_invalid`、`rss.use_youtube_channel`、`rss.use_official_reddit`、`youtube.channel_invalid`，宿主用平台码 `actions.input_invalid`；Feed 自己的同名检查仍抛 `feed.source_query_invalid`、`feed.source_definition_unavailable` |

## 2. 做了什么

- 四个文件 `git mv` 进 `plugins/native/feed/src/contract/`（`feed.ts`、`signals.ts`、`sources.ts`、`listener.ts`），加 `index.ts`；Feed 包加 `./contract` 出口，根入口另外转出 `feedErrors`。平台合同删 `./modules/feed`、`./modules/signals`、`./modules/sources`、`./services/listener-host` 四个子路径和它们的 API 快照，不留转发。
- 四个描述符（`modulesFeedContract` 等）没有使用方，删掉；其余类型与常量逐字不变（`FeedModuleDependencies`、`FeedAttentionRequest` 没有使用方，照搬不删）。
- `sourceErrors`、`listenerErrors` 的声明挪进主人是 `sources`、`listener` 的 `store/sources.ts`、`store/listener.ts`，经 `./store` 出口可见，不进 `./contract`（合同入口不反过来 import 存取实现）。
- `tooling/gates/error-owners.json`：`feed` 一条的唯一路径没了，整条删（Feed 目录默认归 `feed`）；`sources`、`listener` 各删 contracts 里那条路径；加 `rss`、`youtube` 两个主人（两个目录原来没有主人）。
- 顺带：`platform/plugin.ts` 里 `stop` 的注释改成 T-034 之后的实际行为（MISC:19）。

不改：动作 id、版本、权限、输入输出 schema、Manifest、库结构；`tooling/gates/actions/` 没有差异。

## 3. 对调用方的影响

- 删掉的四个子路径，仓库内的使用方全部改完。写集成插件的人原来从 `services/listener-host` 取 `RawEventAdapter`，现在从 `platform/plugin-source-pull` 取，形状不变；SDK 的 `signal_adapter` 与 `plugin-sdk` 的 API 快照不变。
- 六个错误码改名（kind 与 HTTP 400 不变）：`feed.custom_rss_url_invalid` → `rss.custom_url_invalid`，`feed.source_use_youtube_channel` → `rss.use_youtube_channel`，`feed.source_use_official_reddit` → `rss.use_official_reddit`，`feed.youtube_channel_invalid` → `youtube.channel_invalid`；平台 `sourcePull.plan` 的 `feed.source_query_invalid`、`feed.source_definition_unavailable` → `actions.input_invalid`。界面里没有按这些码分支的代码。调用记录的诊断行会存失败的码，旧行照旧是旧码；不改库结构、读取不分支，所以不需要维护。

## 4. 验收

| 编号 | 可观察结果与证明 |
| --- | --- |
| RAC-1750 | Feed 的 `./contract` 只有 `feedErrors`、`isAccountConnectorSyncKind`、`sourceDeletedAt` 三个运行时值，行为不变；根入口给的 `feedErrors` 是同一个；`./store` 的 `sourceErrors`、`listenerErrors` 码与 kind 不变（`tests/plugin-contract-ownership.test.ts`）；`feedErrors` 余下各码的 code 与状态由 `tests/feed-inbox-schedule-error-model.test.ts` 的 `FEED` 表逐个钉住 |
| RAC-1751 | 平台的四个子路径不能再导入（`ERR_PACKAGE_PATH_NOT_EXPORTED`）；`packages/contracts/src` 里不再声明挪走的那些名字（按名单查，不按前缀，`SourcePull*` 照留） |
| RAC-1752 | `platform/plugin-source-pull` 的 `ConnectorSignalDraft`、`RawEventAdapter`、`RssFetchReceipt` 与写出的期望形状逐字段相等（测试里调 TypeScript 做类型检查，不靠运行器）；`bind().signal_adapter` 的类型就是 `RawEventAdapter`；SDK 自己的 `pollingIntegrationBinding` 造的草稿正好是那六个字段 |
| RAC-1753 | RSS 的三种拒绝、YouTube 的一种拒绝以各自的名字、400 出来：直接调真实的规范化函数（`tests/plugin-contract-ownership.test.ts`）、经 Feed 的来源登记（`tests/feed-sources.test.ts`，同时钉住 Feed 自己的 `feed.source_query_invalid`、`feed.source_definition_unavailable`），以及经平台服务（`tests/security-invariants-plugin-source-pull.test.ts`：词表的两种拒绝，`plan` 的短查询与未知目录项是 `actions.input_invalid`） |
| RAC-1754 | 宿主、RSS、YouTube、`plugin-runtime`、`plugin-sdk`、平台合同的源码里不出现 Feed 的合同路径；点名 `@molis-ai/molis-work-plugin-feed` 的只有原来就点名的十个宿主文件 |


采用来源与证据边界（T-371，2026-10-31）：#1440 的准确作者头为 `3734bb9e5b512cece971683123fb8b6ec8c16f88`，合入提交是本次核收基点 `c6353876dec041a3c7bd3d2c62c7ec50154d5ef1` 的祖先。当前 Feed 的 `./contract` 出口及四份合同已采用，平台四个旧子路径已移除；`ConnectorSignalDraft`、`RawEventAdapter`、`RssFetchReceipt` 仍归平台，RSS、YouTube、平台与 Feed 的错误码边界按第 1、3 节保留。

原 RAC-1750～1754 的运行证据来自该作者头的[独立验证 PASSED](https://github.com/molis-ai/molis-work/pull/1440#issuecomment-6489994565)：关键 15 文件 241/241（含五项 RAC），另补 Darwin 材料权限文件 23/23；[二审可合](https://github.com/molis-ai/molis-work/pull/1440#issuecomment-6491941322)未重跑测试。[普通 CI 40819102466](https://github.com/molis-ai/molis-work/actions/runs/40819102466) 与 [Full 40821028605](https://github.com/molis-ai/molis-work/actions/runs/40821028605)成功，实际检出为 `c1cabc1dcaa616de8fbeed89e1f560fb4a133af6`（`18dc2330cf151637919aad35778e3ddfd2b55a1e` + 作者头，tree `c305cbe707fb77812f6df8e7cabcda3cae14729c`），不是当前 main 的运行。原验证保留的 24 条生产路径静态未覆盖、Full 14 个逐例 unknown、onboarding 一次 retry 后通过且首次失败原因 unknown，以及旧调用记录错误码未覆盖，均不因合入或本次核收而清零。

本次只核当前源码采用、公开原证据与文档，不新增运行原合同测试、变异、产品构建、浏览器或 Full，不接触真实 Home；当前 main 的全部 RAC 动态行为未由本次重验。本文状态不代表整个 W5 或产品、用户验收完成，原验收表与调用方影响不变。
