# 把工作过程记成工作记录

采集层：把手动操作、动作调用、各种 AI、工作流、定时与后台执行逐条记成工作记录，带证据快照与覆盖登记，并分清真实、首次读取、补读、导入、试用、回放、演示和系统检查。它只记下发生了什么，不决定业务，也不改任何主人的数据。

包名：`@molis-ai/molis-work-service-observation`。工作区内部包，由 Host 装配使用。

## 一次典型调用

一次动作调用结束时，kernel 的结算把这次调用告诉出口（`CallReports.observed`）。Host 把它交给 `ObservationLayer.observed`，这里按规则选出一行 `action.call` 记录放进内存队列：处理器开始前被拒的只留谁、什么动作、错误码；处理器开始后的失败一律不留内容；成功的留下输入与结果（本人页面的读取只留结果的摘要）。队列每 250 毫秒或攒够 200 条写一批：这一批里才做脱敏、带密钥的摘要、压缩和加密，同一份内容只存一次，同时更新覆盖登记。写不进去的那一批按覆盖行记一段「丢失」，被记录的调用照常完成。

平台服务在一件事开始时用 `sink(service).bind(origin)` 拿一个记录器，之后随时 `record(fact)`；外壳和插件经系统动作 `observation.report@1` 上报自己前缀下的事实。今天接上的服务：Agent 每一轮（agent-host 的运行投影）、定时唤醒、授权变化（目录授权、MCP 授权；同意自带历史，不另存）、连接器拉取（按游标分首次读取与补读）、助理面板对一项工作的每次写，工作流程每次交接（插件以自己身份上报），外壳的界面阶段（显示的对象、每分钟停留、呈现的候选与顺序、查找定位）；Onboarding 采用整段在「用户导入」的来源范围里。声明 `draft: true` 的动作（本人没发出的草稿）只记存过，不留输入与结果。完整清单与缺口见 `coverage-plan.ts`，由 `tests/observation-coverage-plan.test.ts` 对照代码核对。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。

| 文件 | 用途 |
| --- | --- |
| [src/service.ts](src/service.ts) | `ObservationLayer`：出口、服务的 sink、全部 `observation.*@1` 公开动作、到期清理与删项目／清插件数据入口 |
| [src/records.ts](src/records.ts) | 从可信上下文拼一条记录：主人、入口、来源类别、字段上限 |
| [src/exit.ts](src/exit.ts) | 动作调用记什么（设计 §7 的出口表） |
| [src/report.ts](src/report.ts) | `observation.report@1`：上报方、前缀、单次与每天限额、暂停短路 |
| [src/read-actions.ts](src/read-actions.ts) | `observation.records.query@1`、`evidence.get@1`、`coverage.get@1`：查询、增量游标、证据解封、对象可解析性核对 |
| [src/management-actions.ts](src/management-actions.ts) | `observation.settings.get/set@1`、`space.get@1`、`cleanup.preview/apply@1`：暂停／恢复、用途开关、保留期限与手动清理 |
| [src/holds.ts](src/holds.ts) | `observation.holds.put/release/list@1`：评测样本留存登记、释放、列表与有效留存记录计算 |
| [src/access.ts](src/access.ts) | 本人校验、用途开关即时拦截（`use_disabled`）与 S-74 跨项目读取边界 |
| [src/classification.ts](src/classification.ts) | 五类记录（`user`、`ai`、`content`、`flow`、`present`）与覆盖分组纯函数 |
| [src/cleanup.ts](src/cleanup.ts) | 手动与到期自动清理：预览、单事务删除、回收无引用快照、记录 `expired` 缺口 |
| [src/space.ts](src/space.ts) | 按记录种类＋证据快照＋项目的实际占用与容量提醒线状态 |
| [src/management-state.ts](src/management-state.ts) | `writer_state` 中的暂停、用途开关、保留期限、容量提醒线与记录状态计算 |
| [src/writer.ts](src/writer.ts) | 队列、写批、读取合并、覆盖登记、缺口、每天额度、暂停门与意外退出 |
| [src/evidence.ts](src/evidence.ts) | 证据快照：脱敏、HMAC 摘要、gzip、加密、回收 |
| [src/keys.ts](src/keys.ts) | Home 密钥库里的证据密钥与摘要密钥 |
| [src/lifecycle.ts](src/lifecycle.ts) | 删项目、清除插件数据 |
| [src/queries.ts](src/queries.ts) | 库底层读取辅助函数 |
| [src/coverage-plan.ts](src/coverage-plan.ts) | 这一版接上了哪些入口与事实（`OBSERVATION_COVERAGE_PLAN`） |
| [src/source-scope.ts](src/source-scope.ts) | 来源范围 `withObservationSource` |
| [src/schema.ts](src/schema.ts) | 库 `<Home>/observation/observation.db` 的建表 |

设计与取舍见 [specs/observation-collection/contract-design.md](../../specs/observation-collection/contract-design.md)。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24.15+ 与仓库配置的 pnpm。

```bash
pnpm --filter @molis-ai/molis-work-service-observation build
```

```bash
node scripts/run-tests.mjs tests/observation-layer.test.ts
```

## 开发要求

- 负责：工作记录、证据快照、覆盖登记与缺口、上报动作 `observation.report@1`、历史查询与证据读取动作（`records.query@1`、`evidence.get@1`、`coverage.get@1`）、记录管理与清理动作（`settings.get/set@1`、`space.get@1`、`cleanup.preview/apply@1`）、评测样本留存动作（`holds.put/release/list@1`）、用途开关、暂停／恢复、自动与手动清理（留存豁免）、空间占用与容量提醒、来源范围、删项目与清除插件数据时的清理。
- 不负责：任何业务事实（各主人自己的）；评测样本期望、判分与对比运行（归 `horizontal/evaluation`）。
- 公开入口：`@molis-ai/molis-work-service-observation`（`src/index.ts`）；合同 `@molis-ai/molis-work-contracts/services/observation`。
- 依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-plugin-sdk`（只用 `defineAction`、`redactSecrets`）、`@molis-ai/molis-work-storage`（建库与本机正文保护）。依赖方向只向下：不 import `apps/`、任何插件包或另一个横向服务的实现；宿主只装配本包。
- 不变量：
  - 记录从不抛进、不等待、不拖慢它记的那件事：入队只追加，读库、加密、写盘都在写批里；写失败记成缺口（OCL-15）。
  - 主人、身份、项目、入口只从可信上下文来；写入方只能写自己前缀下的事实，外壳只经 Host 签发入口凭据的路由（安全不变量 `S-observation-records`）。
  - 读取动作严格遵守跨项目边界（S-74）与用途开关（OCL-11）：非本人受众只能读当前项目上下文、不得跨项目或用 `lookback`；任一用途关闭后查询与凭已缓存 `record_id` 读证据立即拒 `observation.use_disabled`。
  - 管理与清理动作仅对本人（`user`）开放；清理只删工作记录与无引用快照并记 `expired` 缺口，绝不删业务原内容；容量提醒线到达后只提醒不自动删记录、不阻断写入（OCL-12）。
  - 处理器开始前被拒的只留最小一行；处理器开始后任何失败都不存输入与结果（S-12、S-18）。
  - 证据先脱敏再存，摘要带密钥，正文加密；密钥只在 Home 的密钥库。
  - 缺失原因各管一件事：`expired` 与 `purged` 只由本包写。
  - 覆盖计划里说「完整」的每种事实都有代码在写，Host 接上的每个服务 sink 都在计划里（`tests/observation-coverage-plan.test.ts`）。
- 改动后必跑：`node scripts/run-tests.mjs tests/observation-layer.test.ts tests/observation-management.test.ts tests/observation-evaluation-holds.test.ts tests/observation-coverage-plan.test.ts tests/security-invariants-observation-records.test.ts`；改了外壳上报或工作流程的交接加跑 `tests/observation-shell-stages.test.ts tests/observation-workflow-steps.test.ts`
- 相关手册：[docs/horizontal/observation.md](../../docs/horizontal/observation.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

宿主给自动采集的摘要/密封注入 Storage 的 Keychain cached 模式：不会因本地列表或关闭应用主动请求解锁。未获得原钥匙时沿既有 `not_obtained`/`unavailable` 记录元数据，未知内容不参与读取合并；以后合法解锁只恢复新记录采集，不补写旧正文。明确 evidence.get 的解封沿原凭据访问，HMAC和密文保护不变。回归见 QEA-88/89（`tests/secret-store-keychain-retry.test.ts`、`tests/observation-layer.test.ts`）。
