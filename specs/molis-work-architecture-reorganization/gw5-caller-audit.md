# GW5 剩余调用与职责审查

2026-09-06。依据当前源码和本次读取的 accepted Contract；本文只记录工程证据，不修改 Goal 生命周期。GW5 整项工程验收已齐，详见 `gw5-validation.md`；canonical 完成以 Molis Work receipt 为准。

## 已切换的链路

- 整项审查补齐 project Policy：root `renderMolisWorkProjectSettings` 只保留共享 settings shell/navigation，默认 binding 预填和完整规则文档通过 Policy `project` surface；专属保存/失败/回执脚本、样式和 19 条文案归 Goals。原 Workbench settings 实现删除，公共资产出口转发同一 owner。该处此前误归笼统 Shell，已实际修正而非留给 Cutover。

- HTTP fragment：root Project/auth/read-view → Workbench `renderWorkbenchGoalsReadRequest` → Goals route parser → Workbench fragment owner dispatch → 原 UI contribution。非法路径不读取 view；失败仍由 root 写原 status/headers。`document-routes.ts` 中的集合/fragment 选择唯一，不在 root 重复。
- HTTP full page：root Project/auth → Workbench `renderWorkbenchGoalsPageRequest` → Goals actual collection lookup → Host Session/Workspace provider → `createWorkbenchGoalsPageRenderer`。页面不存在时不加载 Project operations。
- 全页/refresh：root 只绑定 owner 与公共原语 → Workbench 页面装配 → Goals Tree/document/dialog contribution + 原 Feed/Work owner。Goals 一级按钮也由 Tree `root-entry` surface 生产。旧 root 两个页面函数实现已删除，只导出 factory 结果；没有第二套 fallback 模板。
- Fragment：root 只注入 document/trash/completion/progress/factors/records/events/quickRecord/momentum → Workbench finite adapter。事件页不加链接前缀；其他原有 prefix、null 和参数默认值保留。真实 HTTP 读取前后完整 snapshot 不变。

## 剩余职责及下一步

| 当前位置/入口 | 真正职责 | 后续责任与处理 |
| --- | --- | --- |
| `src/web/server.ts` 的 global/project Planning GET 分支 | 提供有效 methods、Project context 与公开 renderer | **本轮已迁**：Workbench request adapter + Goals method selector 负责 method 定位/404/页面选择，root 留查询、权限与 HTTP 响应；project 新建页仍不查 effective methods |
| root `renderGoalDocument`、`renderGoalFactors`、`renderRelations`、`renderCreateDialog` | 给公开 contribution 注入原 read model、Decision history/Runtime trusted HTML | 当前是有限 composition，不再有对应产品模板；最终清理 root binding 归 Cutover，不能复制业务判定以消除函数名 |
| root `renderCompanionRuntime`、`plainRunState`、`renderProgressOverview`、`renderGoalProgressPanel` | Claim/Run/Evidence/Review 状态与进展组合 | 不在 GW5 accepted scope；EX4 已完成，保留历史。交 Cutover 审查现有 UI contribution 与复合内容的差距，若推翻 EX4 验收前提，走正式纠正，不静默重开 |
| root `renderQuickRecordDialog`、`renderGoalTechnicalDetails`、`renderHistory`、`renderFullRecords`、`renderGoalEventPage` | Evidence/关系快速记录组合、执行检查与事件账本 | Goals 基础/关联内容已是 public contribution；剩余跨 owner 容器/执行记录同样归 Cutover 的旧职责清零，不能被整体搬入 Goals |
| root Proposal/Candidate/Rewire/Goal Tree Decision render 与 Feed supplemental entries | 澄清决定、Human Review、历史决定和 Feed 组合 | 澄清/建树入口由现有「迁移 Draft Dialogue 与 Goal Tree Decision 入口」继续；其余已迁内容的复合 caller 由 Cutover 审查 |
| root `dataJson`、section/deck 原语、project chrome、onboarding/settings、聚合英文目录与 `prefixLocalLinks` | 跨产品序列化、共享 UI/Shell、项目导航/安装设置 | 不吸收到 Goals；最终 owner 应是 Workbench/Design System/Local Host 各自的公开入口，Cutover 负责 caller 清零及剩余 huge file，而不是另建一份根类型 |

已读取 canonical 「完成全量切换、旧代码清零与发布验收」`goal-95f66d79-3e4f-4f38-8676-4354be495bb2` revision 1：明确覆盖旧路径与重复职责清零、最终文档、全量回归和安装发布。其当前 `validity_state=needs_revalidation`，下一动作 `revalidate`；本轮仅审查，没有领取或执行该 Goal，也不把待审问题当成验收通过。

## 本轮证据边界

当前 root renderer 3,827 行 / server 3,353 行，Workbench page renderer 223 行、Planning request adapter 23 行。补齐项目规则后的边界检查 48 packages、448 sources、1,236 imports、71 edges、30 contract subpaths、10 compatibility entries、5 legacy huge files、0 errors（3de35b）。没有新增包或通用总线。

迁移前新建的隔离 baseline：`/var/folders/m2/tx2tqs290l913y61zqz413dr0000gn/T/gw5-page-compare-4eANTr`。中英文 × current/archive/trash/empty × page/refresh 全部输出逐字一致（e98ebe exit 0，没有规范化）。串行 Goals/Web/Desktop 172/0/0（d8b756 exit 0）；保留迁移前 171 中一次焦点时序失败及修正后 document 4/0/0。具体命令、日志、失败和验证缺口见 `gw5-progress.md`。

随后 Planning public/UI/browser/Web **65/0/0，21.4 秒**，日志 `/private/tmp/gw5-planning-request.log`；覆盖两种 scope、方法重名选择、new/edit、404、非法路径不加载 owner 和原浏览器保存/采用确认。最终补齐项目工作规则后，完整串行 Goals/Web/Desktop **175/0/0，86.9 秒**，日志 `/private/tmp/gw5-acceptance-regression.log`。GW5 三项完整验收见 `gw5-validation.md`；这些证据不证明整个架构重组、全产品用户验收或发布安装已完成。
