# FD3 官方 Integration Plugin 参考实现验证

Goal：`goal-reorg-fd3`  
Contract revision：1  
验证日期：2026-09-02  
完成等级：功能可用（官方 Integration Plugin 的安装与接收样板真实可用；持久化 Plugin Host、独立进程/沙箱、升级 UI 与开发者 CLI 由后续 Goal 完成）

## fd3-boundary

FD3 现在有三个清楚的 owner：

| Owner | 现在负责 | 明确不负责 |
| --- | --- | --- |
| `packages/plugin-runtime` | 签名绑定安装身份、Manifest digest、grant ceiling、start/crash/recover/uninstall、Lifecycle Receipt、可注入 Repository/Executor | Provider protocol、Module Store、Feed/Attention 业务判断 |
| `packages/plugin-sdk` | Manifest 校验、Plugin definition、Provider port → Connector Driver + Signal Adapter 的公共 helper | Runtime 状态、Host 内部实现、另一个 Plugin implementation |
| `plugins/official-integrations/*` | 官方 Manifest、Provider identity/permissions、Integration contribution；GitHub/Gmail 的真实 Provider protocol | Source/Signal/Feed/Attention 事实、Listener lease/cursor Store、跨 Plugin 调用 |

跨包调用都走 package root 或显式公开 subpath。Plugin package 不 deep import 旧根代码、不访问 Module Store，也不依赖另一个 Plugin。根产品只在 composition/compatibility 边界注入 Secret/OAuth 或旧 Provider port。

`pnpm boundary:check` 当前扫描 48 个 package、84 个 package 源文件、76 个 import 和 52 条 workspace 依赖边，结果 `errors=[]`。FD3 新增门禁还会拒绝：

- `FeedConnectorService` 再次内嵌 `ConnectorDriver` / `RawEventAdapter`、GitHub/Gmail factory 或 `legacy-adapter`；
- Listener Host 出现 GitHub/Gmail/YouTube 等 Provider identity；
- 官方 Plugin 缺少安装 Manifest、签名身份、版本或 package 发布文件；
- GitHub/Gmail 旧兼容入口重新包含 Provider API protocol。

## fd3-legacy-exit

原调用链中的 Provider 职责已经按本切片退出：

- `FeedConnectorService` 只向 `OfficialIntegrationRegistry` 请求一个公开 Integration contribution，再把 Driver 注册给 Connector Host、把 Adapter 交给 Listener Host；它不再创建 Provider-specific Driver、Signal Adapter 或 Plugin identity。
- Listener Host 仍然只认识 Connection、Raw Event、Adapter Contract、cursor、lease、retry 与 quarantine，不认识 GitHub/Gmail payload。
- GitHub Provider 已从 `src/feed/connectors/github.ts` 移到 `plugins/official-integrations/github/src/provider.ts`；旧文件只注入本机 credential resolver 与 fixture policy。
- Gmail 的 1,131 行旧 Provider 文件已移出旧目录，并按职责拆为 `provider.ts`（960 行）、`history-cursor.ts`、`scope.ts` 和 `errors.ts`；旧 `gmail.ts` 只剩 Secret/OAuth port 接线，cursor/scope 旧文件只 re-export 公开 Plugin subpath。
- Signal Adapter 的 Plugin ID、Version、Raw Event 归一与 provenance 由 Plugin SDK/Manifest 统一产生；Feed 只在 Signal 接受后维护自己的 projection。
- RSS、Web Query、YouTube 已有同一安装 Manifest 与 definition factory；现有采集实现仍作为注入 Provider port 兼容，所以这些 package 如实标为 `partial`，没有假装完成 Server/沙箱或最终 App cutover。

## fd3-result

参考主链已经是：

```text
official manifest + provider
→ Plugin Runtime install
→ explicit grant within Manifest ceiling
→ start Integration contribution
→ Connector Host
→ durable Raw Event / Listener Host
→ official Signal Adapter
→ Signals Module Receipt
→ crash / recover
→ uninstall contribution, retain historical Signal
```

`tests/plugin-runtime-integration.test.ts` 用现有 GitHub Provider 身份证明：

- 缺少 required grant 时不能启动，Manifest 未声明的权限不能授予；
- grant 后可启动并经真实 Connector/Listener/Signals API 产生兼容 Signal；
- 同一 Provider item 的内容变化递增同一 Signal revision；
- crash 会撤销 contribution，recover 后可继续同步；
- uninstall 撤销代码 contribution，但历史 Signal 仍可查询；
- 发布者签名变化得到不同安装身份，不继承旧身份；
- 同一 `plugin_id + version + signature` 的 Manifest 内容变化被拒绝，要求 Plugin 自己递增 version。

## 验证记录

| 验证 | 结果 | 说明 |
| --- | --- | --- |
| `pnpm workspace:verify` | 通过 | 9 个边界规则、真实仓库扫描、48 package typecheck/build 全部通过 |
| `pnpm typecheck` | 通过 | 已迁 package 与根产品类型检查通过 |
| `pnpm build` | 通过 | Plugin/Module/Host、根产品和浏览器 PTY bundle 构建通过 |
| FD3 + Feed 定向回归 | 通过 | 28 项：Runtime lifecycle、配置重启、GitHub/Gmail Provider、Connector、Listener、Signal、Feed、Source、Web API 全部通过 |
| `tests/install.test.ts` + `tests/e2e.test.ts` + `tests/uninstall.test.ts` | 通过 | 21 项；包含 workspace 传递依赖、自包含安装、升级、卸载和用户数据保留 |
| 全量 `tests/*.test.ts` | 未全绿（已有基线问题） | FD3 及其上下游回归全部通过；唯一失败仍是未改动的 `tests/desktop-tui.test.ts:974`，测试要求旧的手写 `encodeURIComponent` 源码字符串，但 `src/web/pty-client.ts` 已使用 `URLSearchParams.set` |
| `git diff --check` | 通过 | 无 whitespace 错误 |

## 验收结论

| Criterion | 结果 | 结论 |
| --- | --- | --- |
| `fd3-boundary` | 通过 | Runtime、SDK、Integration Plugin、Host 和 Module 各有唯一 owner，公开入口和自动门禁无违规 |
| `fd3-legacy-exit` | 通过 | GitHub/Gmail identity、Provider protocol 和 Signal 转换已离开 Feed/Listener/shared adapter；旧入口只剩有明确退出条件的 App credential seam |
| `fd3-result` | 通过 | 现有 Provider 的 install → grant → start → Signal → crash/recover → uninstall 主链有真实自动测试 |

## 后续边界

- `goal-reorg-fd4`：迁移 Feed Native Plugin UI、Web route/render 和剩余 caller。
- `goal-reorg-dv3`：补齐面向开发者的 SDK testing surface、Plugin CLI、打包与签名工作流。
- `goal-reorg-ap2`：把当前根内 composition/credential seam 收口到唯一 Local Host，并为持久 Runtime Host/隔离执行提供产品接线。

这些是已拆分的后续 Goal，不是 FD3 参考实现的伪完成项。
