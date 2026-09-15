# WI02 修正 D 交回

Writer 完成「Web 创建与树决定成功重试」。未宣称 WI02 或主验收通过。A–C 已主验收；E/F 仍待主调度。

## 实际重放路径

HTTP 一次性键在成功后默认 409。仅下列已实现业务幂等的入口允许进入原结果重放（`(?:^|/)` 同时覆盖 `/api/...` 与 `/projects/:id/api/...`）：

- 既有 ` /api/goals/:id/event-* ` 命令
- `POST /api/goals`（`createIntent`）
- `POST /api/goal-tree-proposals/:id/decision`（`executeGoalTreeDecision`）

Origin / Token / 合法键校验、在途 `request.in_flight` 409、其它管理写入成功后再用同键 409，均未放宽。`risk_repairs` 仍走原分支，本次未改。

创建 HTTP 回执增加已有 `createIntent.replayed`；同键同 body 成功重试 201，返回原 Goal / cursor / `replayed: true`。

## 稳定可信来源与业务键

新树普通决定不再 `randomUUID()`：

- 业务键：`body.idempotency_key`，否则 `context.idempotencyHeader`（HTTP 层已校验的键）
- `message_ref`：`web-decision:${idempotencyKey}`
- 权威保持 `web-user` / `user` / `web`，`conversation_ref=web:${boardId}`，`whole_confirmation_prompted` 仍由 `confirm_all_pending` 设置
- `proposal_id` 仍是路径中的那份具体提案

Governance `request_hash` 含 authority。稳定 `message_ref` 后，换 HTTP 键但复用同一业务键、以及 Host/Web 重启后同业务键，都能命中已持久化决定。未改存储协议，未建第二套幂等表。

`prepareDecision` 只保留用户提交的 `decisions` 与 trim 后的 `reason`。删除按当前 pending/conflict 与旧 decomposition 重写理由的逻辑，避免重放时 pending 已消失导致 hash 变化。`confirm_all_pending` 仍先命中 Governance 已存结果，再进入 callback。`prepareRiskRepair` 未动。

## 原子与重启验证

主探针未改。从仓库 stdin 运行：

```
pnpm_config_verify_deps_before_run=warn pnpm build
  → /private/tmp/molis-work-flow-cleanup/02-d-build.log  EXIT 0

pnpm_config_verify_deps_before_run=warn pnpm boundary:check
  → /private/tmp/molis-work-flow-cleanup/02-d-boundary.log  EXIT 0  errors: []

node --import tsx --input-type=module < /private/tmp/molis-work-flow-cleanup/02-d-web-retry-acceptance.mjs
  → /private/tmp/molis-work-flow-cleanup/02-d-web-retry-after.log  EXIT 0
    PASS project Web creation: same key, new HTTP nonce, changed-input rejection, Origin and token protection; no duplicate persisted facts
    PASS real Web whole/partial/rejection replay returns the original decision after pending items changed; different input is rejected without graph or decision writes
    PASS actual Web server restart: body keys and header-only operation keys replay the same persisted create/decision results
    PASS real overlapping requests retain in-flight 409 protection; complete keys remain blocked outside explicitly idempotent endpoints

node --import tsx --input-type=module < /private/tmp/molis-work-flow-cleanup/02-entry-acceptance.mjs
  → /private/tmp/molis-work-flow-cleanup/02-d-entry.log  EXIT 0
    含 Web 带要求/父子/依赖新建及重试、关联失败后同键改输入再试、跨 SQLite 重开

env -u FORCE_COLOR NODE_NO_WARNINGS=1 node --import tsx --test --test-concurrency=1 \
  tests/goal-event-create-flow.test.ts tests/mcp-goal-events.test.ts \
  tests/feed-goal-promotion.test.ts tests/goal-tree-event-flow.test.ts \
  tests/goal-event-http.test.ts
  → /private/tmp/molis-work-flow-cleanup/02-d-tests.log  19 pass / 1 fail / 0 skip
```

D 相关通过：同键创建 201 + `replayed`、新 HTTP 键复用 body 键、失败创建无已提交结果可改输入再试、同键不同输入 400 且无第二 Goal；树整组/部分批准与拒绝成功重试返回原 `applied_item_ids`，graph 各一次；完成键在非幂等探测路径仍 409。

唯一失败：`tests/goal-tree-event-flow.test.ts` `whole_confirmation_ambiguous`。该测试 `hostEventDecisionAuthority` 未把整组确认绑到具体提案，是 F 的旧测试输入，未放宽生产确认规则。

未跑 `02-tree-acceptance.mjs`（E 未修，整探针仍可能失败）。未跑全仓。未 commit/push。

## UI 依赖修正（本轮）

取消后台动态改写后，决定页在有冲突项时仍把理由标可选并发送空 `reason`，真实点击退回会 400。未恢复 `prepareDecision`。只改表单：

- `proposal-ui.ts`：复用已计算的 `problemItems` / `issuesByItem` / `item.conflict`，把界面已展示的问题预填进 `textarea`（`escapeHtml`）。文案改为已预填可改写；去掉“提交后自动附上 / 可选”。
- `proposal-client.ts`：`confirm` 与 `reject` 统一 `requireDecisionText`；清空只在原表单提示，不发空请求。`repair-risks` 仍先返回，未扩展旧 Risk。

传入后端仍是用户提交的原字符串。重试不再按变化后的 pending 重算理由。

```
pnpm_config_verify_deps_before_run=warn pnpm build
  → /private/tmp/molis-work-flow-cleanup/02-d-ui-build.log  EXIT 0

pnpm_config_verify_deps_before_run=warn pnpm boundary:check
  → /private/tmp/molis-work-flow-cleanup/02-d-ui-boundary.log  EXIT 0  errors: []

env -u FORCE_COLOR NODE_NO_WARNINGS=1 node --import tsx --test --test-concurrency=1 \
  tests/goal-event-http.test.ts tests/goal-event-create-flow.test.ts \
  tests/goal-tree-event-flow.test.ts
  → /private/tmp/molis-work-flow-cleanup/02-d-ui-tests.log  14 pass / 1 fail / 0 skip
    新增「HTTP goal-tree reject prefills displayed relation conflict and keeps the submitted reason」通过：
    新协议 relation/deactivate 提案，提案外解除同一关系后 check 冲突；
    决定页预填已展示问题；空 reason 400 且无决定写入；用户改写原文落地；换 HTTP 键重放仍是同一原文。
```

未改 `web-http.ts` / `http/decisions.ts` / `prepareDecision`。未改主探针。未打开真实用户库。

`apps/workbench/src/i18n/en.ts` 仍有旧“自动附上”键；本轮允许文件不含它。中文路径用新 L 原文。英文 locale 在补映射前会显示中文键。

## 表单操作键（本轮）

`molisWorkControlHeaders()` 每次仍生成新随机 HTTP 键，未改全局。新建与普通树决定原先直接调用它，浏览器丢失 201 后再点会变成另一次操作。

只改这两处有效提交，沿用 `form.dataset.idempotencyKey`：

- `dialogs-client.ts` 新建：首次提交生成并写入表单；header 与 `body.idempotency_key` 用同一键；`!ok` / 网络失败 / `json` 失败保留键；201 后删除再 `navigate`，避免成功键留给下一次新建。
- `proposal-client.ts` 普通 confirm/reject：同样生命周期；`refreshBoardWithDecisionReceipt` 成功后再删键。`repair-risks` 与 contract/candidate/rewire 未改。

同键换内容仍由已有后台拒绝。未加第二套缓存/hash。取消/重开仍是原对话框：不重置表单；失败重试复用键。未改 HTTP/授权。未扩旧 Web 测试，未改主探针。

```
pnpm_config_verify_deps_before_run=warn pnpm build
  → /private/tmp/molis-work-flow-cleanup/02-d-keys-build.log  EXIT 0

pnpm_config_verify_deps_before_run=warn pnpm boundary:check
  → /private/tmp/molis-work-flow-cleanup/02-d-keys-boundary.log  EXIT 0  errors: []
```

## 未完 E/F

- E：列表分页 anchor 与 Host/Session 焦点截断。`web.test.ts` 整组批准页仍断言 `可继续`，当前渲染为 `进行中`，与 D 表单无关。
- F：树提交有限 discriminated union、旧 MCP tree payload 清理，以及 `goal-tree-event-flow` 整组确认测试输入。Footballnia / 历史 Risk 修复测试仍在提交期被新协议拒绝，03 清理旧 UI。

## 交给主

- 用 `02-d-ui-retry-acceptance.mjs` 独立验收丢失响应后的同表单重试（脚本等待由主调试，不要为此改生产）。
- `02-d-ui-acceptance.mjs` 统一验收预填 / 清空 / 改写 / 重试。
- 不要把整个 WI02 标完成。
- 主 `02-d-web-retry-acceptance.mjs` 已可整段通过，与 E 无关。
- 继续调度 E/F。F 收口时修订 `whole_confirmation_ambiguous` 测试输入，不要改生产确认逻辑。
