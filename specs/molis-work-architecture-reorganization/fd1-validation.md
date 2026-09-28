# FD1 Source → Signal 接收链迁移验证

Goal：`goal-reorg-fd1`  
Contract revision：1  
验证日期：2026-09-02  
完成等级：功能可用（首条真实接收链已迁移；Feed、Provider Plugin 与 Web 入口分别由 FD2–FD4 继续迁移）

## fd1-boundary

FD1 已把四类责任放到唯一 owner，并通过公开 Contract 连接：

| Owner | 现在负责 | 明确不负责 |
| --- | --- | --- |
| `modules/sources` | Source 身份、配置、启停、计划意图、连接引用与 Source Event | cursor、lease、重试、Signal、Feed、Secret |
| `modules/signals` | 正式 Signal、Source 范围内去重、revision、adapter/provenance 与 Signal Event | Provider 连接、监听技术状态、Feed/Attention 决定 |
| `horizontal/connector-host` | Driver 注册、Connection、健康检查、限时调用与标准 Receipt | Provider OAuth/协议规则与业务事实 |
| `horizontal/listener-host` | Raw Event、cursor、lease、delivery、retry、quarantine 与技术 Run | Source 配置、正式 Signal 规则、Feed/Attention 事实 |

四个实现 package 只依赖 `packages/contracts` 的公开 subpath，没有 deep import、跨 Module implementation/Store import 或 Provider-specific import。现有 GitHub/Gmail 代码以注入 Driver/Adapter 的方式经过 Host，具体 Provider 实现仍留在旧路径等待 `goal-reorg-fd3` 迁入官方 Integration Plugin。

真实边界扫描覆盖 48 个目标 package、79 个源码文件和 43 个 import，结果 `errors=[]`。新增 package 没有借 Huge File 兼容名单绕过边界。

## fd1-legacy-exit

旧 `src/feed/store.ts` 已不再创建或直接读写 Source、Signal、Listener checkpoint/delivery 与 Source Run 表：

- `feed_sources` schema、Source 状态转换和 retire 规则由 `modules/sources` 维护；旧 Source 方法只做类型兼容和公开 API 转发。
- `signals`、`signal_revisions`、`signal_events` 由 `modules/signals` 独立维护。
- `listener_instances`、`listener_deliveries` 与原 `feed_source_runs` 由 `horizontal/listener-host` 维护。
- 旧 `feed_sources.cursor_json` 只在首次迁移时读入；活跃 cursor 只写 `listener_instances`。测试证明监听推进后旧列仍保持 `{}`。
- Relay 导入不再直接更新 `feed_sources` 或读取 `feed_source_runs`；Source 与 Run 均经过兼容 facade 转到新 owner。
- `src/feed/store.ts` 仍保留 Feed、Attention 和旧入口兼容，所以本轮如实标记为 `partial-compatibility`，不提前吸收 FD2–FD4 的职责。

`src/v1/store.ts` 仍有一次历史 migration 的 `table_info(feed_sources)` 存在性检查；它只决定是否运行旧 migration，不读取或修改 Source 业务状态，后续由统一 migration tooling Goal 清理。

## fd1-result

当前 GitHub/Gmail 接收路径已经是：

```text
Provider-specific Port
→ Connector Host Driver
→ durable Raw Event
→ Listener Host
→ Integration Adapter
→ Signals Module Receipt
→ 当前 Feed compatibility projection
```

可验证行为：

- 同一 `project + source + provider identity` 只生成一个正式 Signal；内容不变返回去重 Receipt，内容变化递增同一 Signal 的 revision。
- Raw Event 在转换前持久化；Adapter 失败时 cursor 不前进，同一个 `operation_id` 在进程重启后恢复未完成 delivery。
- terminal Run 重放不会再次请求 Provider；同一 Source 的并发监听由 lease 拒绝。
- 连续转换失败达到上限后，delivery 和 checkpoint 进入 quarantine，阻止继续拉取 Provider，也不会越过坏事件推进 cursor。
- Signal 接受后才执行现有 Feed projection；projection 失败可以利用同一 Signal identity 安全重放。
- 新 workspace 生产依赖加入后，本地自包含安装器会收集并平铺声明过的依赖，不复制 pnpm 的内部链接；安装、升级和卸载 E2E 均通过。

## 验证记录

| 验证 | 结果 | 说明 |
| --- | --- | --- |
| `CI=true pnpm run workspace:verify` | 通过 | 9 个边界规则测试、真实仓库扫描、48 package typecheck/build 全部通过 |
| `CI=true pnpm run typecheck` | 通过 | FD1 packages 与旧根产品类型检查通过 |
| `CI=true pnpm run build` | 通过 | FD1 packages、旧根产品和浏览器 PTY bundle 构建通过 |
| FD1 Feed/Source/Connector 定向回归 | 通过 | 45 项：接收、去重、revision、cursor、lease、retry、quarantine、Source 生命周期、安全、Feed 兼容均通过 |
| `tests/install.test.ts` | 通过 | 16 项；包含 workspace transitive dependency 平铺与外部链接拒绝 |
| `tests/e2e.test.ts` + `tests/uninstall.test.ts` | 通过 | 5 项安装、升级、卸载端到端场景通过 |
| `CI=true pnpm run test` | 未全绿（已有基线问题） | 480 项中 479 通过；唯一失败是未改动的 `tests/desktop-tui.test.ts:974` 仍要求旧的手写 `encodeURIComponent` 源码字符串，而 `src/web/pty-client.ts` 已使用 `URLSearchParams.set`。FD1 相关失败已清零 |
| `git diff --check` | 通过 | 无 whitespace 错误 |

## 验收结论

| Criterion | 结果 | 结论 |
| --- | --- | --- |
| `fd1-boundary` | 通过 | 四个 owner、公开 Contract 与依赖方向已落实，自动门禁无违规 |
| `fd1-legacy-exit` | 通过 | Source/Signal/Listener 状态和规则已离开旧 Feed Store；剩余入口是有明确删除 Goal 的兼容层 |
| `fd1-result` | 通过 | Raw Event → Signal 主链、幂等、失败恢复、cursor、lease、quarantine、旧行为兼容与自包含安装均有真实测试 |

## 后续边界

- `goal-reorg-fd2`：让 Feed / Attention 正式消费 Signal，不再由兼容 projection 承担长期主链。
- `goal-reorg-fd3`：把 GitHub、Gmail、RSS、Web Query、YouTube 的 Provider Driver/Adapter 搬入官方 Integration Plugin。
- `goal-reorg-fd4`：迁移 Web、timer 和剩余 UI caller，删除旧 Feed facade 的相应入口。

这些是已拆分的后续 Goal，不是 FD1 未完成项。
