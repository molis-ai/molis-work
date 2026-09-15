# Inbox 人工确认闭环修复

## 背景与目标

Decision Center 当前会把更新时间更晚的“处理结果”排在仍待用户确认的 Inbox Entry 前面。用户从 Goal 的 `#decision-goal-<goal_id>` 链接进入后，页面也不会把深链恢复到对应的待决定项，因此详情区只显示历史结果，没有可操作按钮。

同时，Web 的人工确认接口只提交 `Review`。对于 `decision_method = human_decision` 的完成标准，Molis Work 还要求一条关联同一 Review 的 `human_verdict` Evidence；当前用户即使找到表单并选择“通过”，Goal 仍会停在 `waiting_for_human`。

本次目标是让用户从 Goal 或 Decision Center 进入后立即看到待自己处理的事项，并通过一次明确提交同时完成用户 Review 和该人工标准要求的 Evidence，使 Goal 能继续进入完成判定。

完成等级：功能可用，并安装到当前本机 Molis Work 服务供内部真实使用。

## 当前行为与问题证据

- 用户截图显示详情区为“结果确认 / 已通过”的历史结果卡片，没有任何表单或按钮。
- `feedDirectoryEntries` 将待决定项和历史结果混合后仅按更新时间倒序；Runtime 复核事件比待决定项更新，因而抢占默认详情。
- 客户端恢复 session 状态时不解析 `#decision-goal-<goal_id>`，历史选中项会覆盖深链意图。
- `/api/goals/:goal/review-obligations/:obligation/review` 只调用 `submitReview`；核心状态机明确要求 human-decision 标准还要有 `human_verdict` Evidence。
- 本机 4173 服务仍运行旧构建，会把 Runtime 复核错误显示成用户确认；仓库当前源码已经纠正主体文案，但尚未安装到该服务。

## 范围

### 包含

- Inbox 默认将仍需处理的 Decision Entry 排在已处理结果之前；同类内保持用户选择的时间、来源或标题排序。
- `#decision-goal-<goal_id>` 深链强制选中对应 Decision Entry，并覆盖旧 session 选择。
- 人工 Review 为 `pass` 时，接口在同一数据库事务内为 obligation scope 中的 `human_decision` 标准创建关联 Review 的 `human_verdict` Evidence。
- 人工验收文案明确说明一次“通过”会记录用户 Review 与对应人工结论；不再把人工标准自身误报为“缺少外部通过依据”。
- 保持 Runtime 复核和用户确认的主体文案严格区分。
- 桌面与窄屏均能看到并提交操作；错误信息保留在表单内。
- 增加回归测试，并将构建安装到当前 4173 服务。

### 不包含

- 不改变核心 Coordinator 的 Review / Evidence 双记录模型。
- 不允许 Runtime 代替用户提交 human approval 或 `human_verdict`。
- 不重做整个 Decision Center、Feed 或来源管理视觉系统。
- 不自动把 `needs_changes`、`fail`、`inconclusive` 伪装成通过 Evidence。
- 不改变非 `human_decision` 标准的 Evidence 要求。

## 方案与关键决策

### 1. 待处理优先，而不是只看更新时间

目录项增加显式 attention rank：待用户决定的 Decision Entry 最高，普通 Inbox 待处理项其次，已保存/已处理结果最后。服务端首屏和客户端“最新在前”使用同一排序语义，避免 hydration 后顺序跳回。

### 2. 深链表达用户当前意图

Decision 页面解析 `#decision-goal-<goal_id>` 为目录项 id `decision:<goal_id>`。只要该项仍存在且可见，就在恢复筛选状态后选中它；无效或已处理的深链安全回退到当前首项。

### 3. 一次用户提交完成两条审计记录

接口先验证 goal、obligation 和 criterion scope，再在 `store.immediate` 事务内：

1. 以 `actor_kind = user` 提交 Review。
2. 当 verdict 为 `pass` 且 scope 内存在 `decision_method = human_decision` 的标准时，创建一条 `kind = human_verdict`、`result = passed`、`review_id` 指向刚创建 Review、`locator = review://<review_id>` 的 Evidence。

两条记录共享稳定的请求幂等键派生值。任何一步失败，整次提交回滚，避免只有 Review 没有 Evidence 的半成品状态。

### 4. 文案如实解释完成效果

- 人工标准不要求用户先提供另一条“证明自己判断”的通过 Evidence。
- 当非人工标准都已通过时，文案说明选择“通过”会记录本次人工结论，再由 Molis Work 复核其余门槛。
- 仍有非人工标准、其他 Review 或阻塞风险时，明确说明 Goal 不会立刻完成。

## 模块边界与调用链

- `src/web/render.ts`
  - 生产：目录优先级、深链恢复、人工确认解释文案和表单。
  - 消费：`MolisWorkWebView` 中的 Goal、criterion、Evidence、Review obligation 与事件。
- `src/web/server.ts`
  - 生产：用户 Review 及其关联的 `human_verdict` Evidence。
  - 消费：Review POST 请求、当前 board snapshot、Coordinator 写接口。
- `tests/web.test.ts`
  - 覆盖：首屏选中、Runtime/用户主体、深链脚本、事务性提交与最终 work state。

## 验收标准

- [x] Decision Center 存在待决定项和更新更晚的历史结果时，首屏仍选中待决定项，并显示人工确认入口与“提交结果确认”按钮。
- [x] `#decision-goal-<goal_id>` 会选中对应待决定项，不被旧 session 选择覆盖。
- [x] “最新在前”不会把已处理结果排到待决定项之前；Feed 时间排序保持原语义。
- [x] 用户为 human-decision obligation 提交 `pass` 后，同时产生 user Review 和关联的 passing `human_verdict` Evidence。
- [x] Evidence 只覆盖 obligation scope 内的 `human_decision` 标准，且 `review_id`、locator、digest 可审计。
- [x] 写入任一步失败时不留下半条记录；重复幂等请求不重复创建有效记录。
- [x] 人工确认文案不再要求先补一条外部通过依据；Runtime 复核不再显示为用户确认。
- [x] 桌面和 720px 左右窄屏都能找到表单、验证必填项并提交。
- [x] 受影响测试、类型检查、构建通过；修复安装到本机 4173 服务后真实页面验证通过。

## 验证命令与步骤

- `pnpm typecheck`
- `node --import tsx --test --test-name-pattern='human decision|Human Review|Decision Center' tests/web.test.ts`
- `node --import tsx --test --test-name-pattern='human_decision criteria' tests/v1.test.ts`
- `pnpm build`
- 浏览器桌面与 720px 窄屏检查 `/projects/<project>/decisions#decision-goal-<goal>`。
- 真实提交一次当前 Goal 的用户“通过”，确认 Goal 不再停在 `waiting_for_human`。

最后一步保留给用户本人执行。Runtime 已在隔离测试库验证提交闭环，但不会代替用户对真实 Goal 作产品判断。

## 假设与开放问题

- 当前 Review obligation 的 criterion scope 是服务器生成 Evidence 的唯一授权边界；接口不会采信客户端自报 criterion ids。
- `needs_changes`、`fail`、`inconclusive` 继续只记录 Review，不创建 passing Evidence，状态机按现有规则处理。
- 若用户人工通过后仍有其他门槛，Goal 进入相应状态而不是强制完成。
