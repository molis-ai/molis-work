# WI02 交回：统一新建、结构、发现与恢复

完成等级：4 的本项切片。Writer 交回 A–F 实现与修正。主已独立验收 A–E；F 由主复跑探针后关闭。未宣称整个 02 主验收通过。未改主 spec/progress/acceptance。未 commit/push。未动真实用户库。

## 用户现在能做什么

- Web、引导、Feed/Inbox、Runtime 新建都走 `createIntent`，创建后即可记录；要求/父子/依赖与创建同一事务，失败回滚
- 无 Run 也可提交结构提案；用户经 Web/管理批准落地；新 Goal 立刻可记录
- 列表、单 Goal、project_resume 读同一事件摘要；Host 焦点优先于 Session 焦点，不改终端绑定
- 旧库一次迁入事件状态；有效完成批准在承诺未变时可复用，不编造新批准

## 最终行为

### 新建

`GoalEventApplication.createIntent` 是唯一生产新建入口。底层 `createGoal` 只写身份。来源 `source_kind` 写入创建事实，读持久事实不读最近分页。回执不再带旧 definition/decomposition/fulfillment 别名。

### 结构

新写入 discriminated union：

| kind | operation | payload |
| --- | --- | --- |
| goal | create | title 必填；可选 outcome/why/business_logic/priority/goal_id/requirements |
| relation | create | from_goal_id, to_goal_id, type=part_of\|depends_on, reason |
| relation | deactivate | relation_id+reason，或两端+type+reason |

`submit.items` 与 decide `revised_item` 同一合同。历史 record 仍宽类型可读。非法原始类型拒绝，不静默 String/省略布尔。Runtime `goal_tree_decide` 不可写。整组确认必须是受保护入口且点名本提案。

关系基线：相关 Goal 身份/删除归档 + 关系 from/to/type/state；不用 Goal `updated_at`。确认所选集合同一事务检查图与基线，失败无部分写入。

### 发现与恢复

`listGoals` 游标是保存的 `updated_at|goal_id` 排序锚点。焦点按 ID 读取，目录 100 上限不变。`goal_url` 由 MCP 呈现层提供。

### 迁移

扫描全部 Goal。缺 owner 才补。旧 criterion、实际 human policy、completion 风险转入当前要求/Concern。有效完成决定仅在承诺（含直接绑定）未变时复用。迁入完成与新 closure 区分。活动 Claim/Run 不给新协议权限。

## 实际调用链

- HTTP `/api/goals`、onboarding、Feed promotion、MCP intent → `createIntent`
- 树：`goal_tree_propose` → normalizer 有限 union → 已存提案 → Web/管理 `decideGoalTreeProposal` → materializer 只落地 goal/relation
- 列表/状态/resume → 同一 `readState`/`listGoals` 摘要
- 首次打开旧库 → 迁移 36，整事务、重启不重复

## 删除 / 保留

本项删除：新路径 Run/decomposition/role 门槛、新 check/decide 落地旧 contract/policy/risk/candidate/rewire、Runtime 自证 decide、无消费者 MCP tree payload、Web 风险修订写入口。

保留到 03：旧 MCP/CLI/execution 写工具与 discovery、Candidate/Rewire/Contract Proposal 管理入口、相关旧 Web 测试与 UI。历史提案仍可读。

## Writer 验证证据

A–E 主验收日志见各 `correction-*-handoff.md`。F：

- `02-f-build.log` / `02-f-boundary.log` EXIT 0
- `02-f-types.log` EXIT 0（实际 contracts dist 有限 submit/revise）
- `02-f-wire.log` EXIT 0（非法 human 标志与对象 title 拒绝；合法 true/false 保留）
- `02-f-tree.log` EXIT 0（未改的 `02-tree-acceptance.mjs`，含 ID-only deactivate）
- `02-f-tests.log` / `02-final-tests.log` 77 pass / 0 fail / 0 skip
- `02-f-web-d.log` 整组批准后 `in_progress`/`进行中`；退役拆分 kind_retired

主三个严格探针 `02-entry-acceptance.mjs`、`02-tree-acceptance.mjs`、`02-migration-acceptance.mjs` 由主独立复跑。Writer 不宣称它们已主验收。

## 03 范围

- 从 discovery/dispatch/CLI/Web 去掉旧工作流写名字
- 删除或改写仍提交 contract/risk/candidate/rewire 的仓库测试与 UI
- 普通笔记、约定、结构继续走各自有限接口
- 不在 02 预做全仓清扫

04 才做 Skill/完整文档与全仓 UI。
