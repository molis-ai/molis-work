# FD4 Feed Native Plugin 迁移验收

Goal：`goal-reorg-fd4`  
Contract revision：1  
核对日期：2026-09-02

这份记录证明 Feed、Inbox 和 Source 的现有页面与 HTTP 入口已经迁到 Feed Native Plugin，并保留迁移前行为。它不宣称整个 Molis Work 已完成架构重组；Local Host 与 Goals Command 的最终解耦仍由 AP2/GW4 继续完成。

## fd4-boundary

### 公开边界与唯一 owner

| 职责 | 当前 owner / 公开入口 | 旧层只保留什么 |
| --- | --- | --- |
| UI Contribution、Surface、Slot Contract | `packages/contracts/src/platform/ui.ts` | 无 |
| Contribution 注册、冲突检查与渲染 | `packages/ui-host/src/index.ts` | 无 |
| Feed/Inbox/Source UI 与 Route Table | `plugins/native/feed/src/ui.ts`、`plugins/native/feed/src/routes.ts` | 无第二套 renderer/route matching |
| 官方 Native Plugin 组合 | `apps/workbench/src/index.ts` | 无 |
| 旧 View 到公开 Feed UI model | `src/web/feed-native-plugin-ui.ts` | Host 数据映射、i18n/icon/rich-text primitives、Goals owner 的 Slot 内容 |
| Node HTTP transport binding | `src/web/feed-native-plugin-http.ts` | request/response、Secret/OAuth 和暂存的 Feed→Goal capability 接线 |
| Web Shell caller | `src/web/render.ts`、`src/web/server.ts` | 只调用上述公开入口，不再拥有 Feed renderer 或 route 分支 |

调用链已经固定为：

```text
render.ts → feed-native-plugin-ui.ts → apps/workbench → Feed Contribution → UI Host
server.ts → feed-native-plugin-http.ts → FeedPluginRouteTable → Host binding → Module-backed facade
```

`scripts/check-package-boundaries.mjs` 的 `checkMigratedFeedUiOwnership` 会拒绝：

- `render.ts` 重新出现 Feed/Source renderer；
- `server.ts` 重新出现 `/api/feed`、`/api/inbox` route 分支或 promotion helper；
- caller 绕过 Workbench、Feed Plugin Route Table 或 UI Host；
- package deep import、跨 owner implementation/Store import 和 App 直连数据库。

验证结果：

- `pnpm workspace:check`：48 个目标 package、48 个唯一包名、30 个 Contract subpath，0 error。
- `pnpm boundary:test`：9/9 通过。
- `pnpm boundary:check`：86 个 package source、87 个 import、54 条 workspace dependency edge，0 error。
- `pnpm build:migrated-packages`：14 个已有真实实现的目标 package 全部构建通过。

## fd4-legacy-exit

迁移前基线与当前结果：

| Huge file | 迁移前 | 当前 | 本 Goal 删除的职责 |
| --- | ---: | ---: | --- |
| `src/web/render.ts` | 15,031 行 | 14,028 行 | Feed/Inbox 列表与详情、Source 目录/详情、来源设置 Overlay、Feed demo renderer |
| `src/web/server.ts` | 4,925 行 | 4,326 行 | Feed/Inbox route matching、来源/Connector/Relay 分支、Feed promotion helper |

仍留在旧 Web 目录的两个 adapter 都有明确退出条件：

- `feed-native-plugin-ui.ts` 在 AP3/各 Query read model 接通后，不再从全局 `MolisWorkWebView` 组装 Feed model；
- `feed-native-plugin-http.ts` 在 AP2/GW4 接通 Local Host capability 与 Goals Command 后，删除 Secret/OAuth 与 Feed→Goal 的兼容接线。

这两个 adapter 不是新的事实 owner，也不复制 Feed/Attention 状态机。Feed/Attention 写入继续走 FD2 的 public Module API；Gmail scope 直接消费官方 Gmail Integration Plugin 的公开 `scope` subpath，没有在 UI Plugin 复制 Provider 规则。

文档已经同步：`docs/system/MIGRATION.md`、`docs/system/HUGE-CLASS-MIGRATION.md`、`docs/platform/UI-PLATFORM.md`、`docs/SSOT-MATRIX.md`、中英文开发文档，以及 Feed Plugin、UI Host、Workbench 的 package README。

## fd4-result

### 保持不变的用户行为

- Feed / Inbox 的列表、搜索、筛选、排序、已读状态、详情按需加载和空态保持原路径与 DOM contract。
- Feed Item 的加入 Inbox、保存资料、升格 Goal、开始处理、忽略、归档和恢复保持原 API 与 revision/幂等行为。
- Inbox 的完成、忽略、重新打开和回到原消息保持原引用语义；Attention 仍不复制 Feed/Goal/Source 内容。
- Source 的新增、编辑、暂停、恢复、立即拉取、调度、断开、删除与历史处理保持原 API。
- GitHub token/device flow、Gmail token/OAuth、Gmail 只读范围说明和 Relay 导入保持可用。
- Goal 决定和最近处理结果继续作为 Goals owner 内容，经 Feed detail Slot 嵌入；每个 Goal 的深链、表单聚焦和移动端恢复仍可用。
- 正式 Item 正文仍只从单 Item 详情接口按需读取，不泄露到目录或 workbench 初始 HTML。
- demo Feed/Source 的同步、配置、调度和处置只改变当前页面，不会调用真实 Source API、写数据库或启动后台任务。
- 空正文、错误、重试和来源故障恢复继续给出明确提示。

### Route 覆盖

Feed Plugin Route Table 拥有 19 条既有入口：Feed snapshot/workbench，Source create/update/delete/schedule/action，GitHub/Gmail token 与 OAuth/device flow，Relay import，Item detail/action，以及 Inbox Attention status。

### 验证证据

- `CI=true pnpm test`：完整 build + 全仓 488/488 测试通过，0 fail、0 skip。
- `tests/feed-sources.test.ts`：10/10 通过，覆盖来源生命周期、调度、RSS 条件请求/错误恢复、Gmail scope、加密凭据和 Web API。
- `tests/feed-module-repositories.test.ts`、`tests/feed-receive-chain.test.ts`、`tests/plugin-runtime-integration.test.ts`、`tests/feed-native-plugin.test.ts`：10/10 通过，覆盖事实重启恢复、Signal 接收、Plugin 生命周期、UI Host、route matching 和 demo 安全边界。
- Feed/Inbox Runtime 关键动作：3/3 通过；Decision Center 与 Desktop 兼容定向回归：4/4 通过。
- 完整测试首次暴露的正文按需加载、空正文提示、Goal 决定详情、英文文案和旧测试匹配问题均已修复，并由最终 488/488 全绿结果覆盖。

### 结论

FD4 的三个验收条件均满足：所有 caller 经过公开边界；旧 Huge Class 已退出 Feed UI 与 route owner 职责；迁移前的前后端主链、异常/恢复、demo 和跨模块嵌入行为都有自动化证据。后续 AP2/GW4 只继续缩薄 Host adapter，不把 Feed Module 或 Feed Plugin 扩成 Goals/Secret/transport 的 owner。
