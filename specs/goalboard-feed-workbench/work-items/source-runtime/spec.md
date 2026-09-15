# 来源管理与定时拉取运行底座

Molis Work Goal：`goal-infoflow-source-runtime`

完成等级：4（本 Work Item 的来源运行底座达到内部完整；GitHub、Gmail、RSS 各自的真实 Provider 能力仍由后续 Goal 验收）

## 背景与目标

高保真已经证明“来源列表 → 来源详情 → 配置 / 拉取计划 / 来源消息 / 运行状态”的路径，但当前来源详情仍混入页面内模拟动作，计划没有后台执行器，来源缺少统一编辑、删除和历史处理能力。

本 Work Item 把来源工作台切到真实本地数据与真实操作，并提供 GitHub、Gmail、RSS 共用的调度、恢复、幂等、诊断和凭据生命周期底座。后续 Provider 只负责按统一适配契约拉取，不各自发明调度和状态管理。

## 当前问题证据

- `src/web/render.ts` 的来源详情仍使用 `data-prototype-*` 保存配置、计划和模拟拉取。
- `FeedSourceSchedule` 已存在，但没有持续运行的调度器，也没有错过执行后的补拉策略。
- Web API 仅支持来源注册、暂停、恢复和同步，不支持编辑配置、保存计划、断开或带历史决策的删除。
- `feed_source_runs` 能记录运行和启动恢复，但工作台的运行详情仍展示固定示例文本。

## 范围

### 包含

- 来源名称、说明与 Provider 配置的安全编辑边界。
- 手动或间隔计划；最短 5 分钟；持久化 `next_pull_at`。
- 单设备调度器：到期执行、应用重启/电脑休眠后的单次补拉、幂等键、失败退避和并发保护。
- SyncRun 的真实状态、数量、错误、重试建议和最近运行展示。
- 暂停、恢复、账号断开，以及删除来源时明确选择“保留历史”或“删除本地历史”。
- 来源列表—详情工作台的真实数据、空错慢反馈、桌面与 760px 以下逐层路径。
- 断开或删除后不再调用 Provider；秘密值不进入来源、Feed、日志或 Web 响应。

### 不包含

- GitHub、Gmail、RSS Provider 的新增联网能力或外部凭据代填。
- Feed 和 Inbox 完整工作台的剩余闭环。
- 多设备、服务端队列、分布式锁或外部发布运维。

## 方案与关键决定

### 1. 来源运行所有权

- `FeedStore` 继续唯一拥有 Source、SyncRun、Schedule 与 Inbox 引用的持久化。
- `FeedSourceService` 负责来源生命周期和公开来源执行。
- 新的调度模块只选择到期来源并调用已有公开来源或 Connector 服务；不复制 Provider 逻辑。
- Web 只调用来源 API，不在浏览器内模拟调度或权威状态。

### 2. 调度与恢复

- `manual` 不进入调度队列。
- `interval` 保存 `enabled`、`interval_minutes`、`next_pull_at`；配置时从当前时间计算下一次。
- 调度幂等键由 `source_id + planned next_pull_at` 生成。同一计划槽在重启或重入时复用同一 SyncRun。
- 到期执行结束后把 `next_pull_at` 推进到当前时间之后；电脑休眠跨过多个槽时只补拉一次，不突发补齐每个历史槽。
- 进程中断留下的 running Run 在启动时转为 interrupted；同一计划槽可恢复，最后可信游标只在可消费结果提交时推进。
- 同一来源同一时刻最多一个运行；调度 tick 重叠时跳过已在执行的来源。

### 3. 错误与 Inbox

- 运行详情只展示安全错误码、是否可重试、下一步和时间，不展示 Provider 响应正文或凭据。
- 授权、配置等需要人工介入的非重试错误建立一个幂等的 `source_fault` InboxEntry 引用；网络或临时 Provider 错误保留在 Run 并按下一计划重试。

### 4. 来源生命周期

- 暂停保留凭据、游标、消息与运行历史，但停止手动和定时拉取。
- 断开账号删除本地凭据、清空敏感游标并停止拉取；公开来源可暂停或删除，不伪装成账号断开。
- 删除必须携带 `retain_history` 或 `delete_local_history`。为保留引用解释性，来源行用本地生命周期 tombstone 隐藏于默认目录；保留历史时 FeedItem/历史仍可追溯，删除本地历史时一并删除来源 FeedItem、材料、对应 Inbox 引用与运行记录。

### 5. 工作台

- 默认目录只展示真实、未删除来源；没有 RSS 时显示真实空状态，不用生产页面的高保真假记录补齐。
- 详情页五个分区继续沿用已确认结构，但配置、计划、拉取、暂停、断开和删除全部调用真实 API。
- 来源消息来自真实 FeedItem；运行状态来自真实 SyncRun。
- 窄屏保持“目录 → 来源列表 → 来源详情”逐层推进，操作反馈保持在当前详情并可返回。

## 输入、输出与依赖

输入：`Source / SyncRun / FeedItem / InboxEntry` 契约、迁移 28、现有 Connector 与公开来源服务、高保真来源路径。

输出：可供真实 Provider 使用的来源管理、秘密引用、调度、恢复和 SyncRun 运行底座，以及真实来源目录—详情工作台。

主要模块：

- `src/feed/store.ts`：来源生命周期、到期查询、历史处理。
- `src/feed/sources/service.ts`：配置、计划与生命周期服务。
- `src/feed/sources/scheduler.ts`：调度选择、补拉、幂等和诊断。
- `src/web/server.ts`：来源 API 与进程级调度生命周期。
- `src/web/render.ts` / `src/web/visual-foundation.ts`：真实来源工作台与响应式状态。
- `tests/feed-sources.test.ts` / `tests/web.test.ts`：契约、API、恢复和 UI 回归。

## 验收标准

- [x] Provider 通过统一调度调用进入标准化 SyncRun；运行详情显示真实结果、安全错误和可行动下一步。
- [x] 凭据只由 SecretStore 引用；断开后零 Provider 调用；删除按明确历史决策保持引用一致。
- [x] 手动与定时拉取幂等；重叠 tick 不重复；重启/休眠后只补拉一次；失败不推进最后可信游标。
- [x] 桌面与窄屏都能创建、查看、编辑、配置计划、暂停、恢复、断开和删除适用的来源。
- [x] 来源详情的配置、来源消息和运行状态均来自真实数据库，不再以模拟成功代替。
- [x] 类型检查、受影响测试、构建和浏览器桌面/窄屏检查通过；已知非本 Work Item 的失败单独记录并由所属 Goal 承接。

## 验证命令

```bash
CI=true pnpm typecheck
node --import tsx --test tests/feed-sources.test.ts tests/feed-connectors.test.ts tests/feed-security.test.ts tests/web.test.ts tests/desktop-tui.test.ts
CI=true pnpm build
git diff --check
```

手动/浏览器验证：来源列表、真实详情五分区、计划保存、手动拉取的 pending/success/error、暂停/恢复、断开/删除确认、无来源空状态，以及 1440px 与 390px 无横向溢出。

## 假设与开放问题

- V1 是单设备本地服务，因此 SQLite + 进程内定时器足够；不引入外部队列。
- Provider 的真实外部 smoke test 由各 Provider Goal 完成，本 Work Item 使用已有适配器与可控 test double 验证运行底座。
- Connector capability 的未连接占位来源可以保留为真实可配置入口；用户删除的是已配置 Source 实例，Capability 本身不会从产品中消失。

## 验证结果（2026-08-30）

- `CI=true pnpm typecheck`：通过。
- `CI=true pnpm build`：通过。
- 受影响模块测试：108/108 通过；全量回归：335/336 通过。
- 全量唯一失败是 `tests/i18n.test.ts` 的既有“静态中文文案缺英文翻译”检查；它同时覆盖高保真阶段遗留文案，不影响本 Work Item 的来源运行契约、调度、凭据和工作台行为，由后续内部集成 Goal 统一补齐。
- 浏览器实测：真实来源列表与五分区详情、保存配置与计划、手动拉取、暂停/恢复、断开与两种删除策略均接入真实 API；桌面与窄屏无横向溢出，控制台无错误。
- 视觉证据：`.impeccable/review/source-runtime-desktop.png`、`.impeccable/review/source-runtime-narrow.png`。
