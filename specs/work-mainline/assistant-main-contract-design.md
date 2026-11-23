# 合同设计稿：每件事项自己的助理主对话（第 37 批 37-2）

状态：设计稿待审（2026-11-23）。来源：[路线书第 37 批](../post-anticorruption-roadmap/reference/batches/37.md#review-2026-11-18)、[主线需求 §4.3 / §9 第 5 条 / MLN-16](spec.md)、[路线书决定 53](../post-anticorruption-roadmap/reference/decisions.md#decision-53)。

## 1. 要解决的问题

现有助理工作合同（`packages/contracts/src/services/assistant.ts`）里，`AssistantWork.main?: true` 按 `(actor_id, scope, character)` 唯一定位一条常驻主对话：每个项目（与每个角色）只有一条项目级主对话。按 2026-11-17 决定 53 与 MLN-16，**每件事项要有自己的一条助理主对话**，切走再切回对话和草稿各自保留；不选事项时仍是项目的项目级主对话；在事项里点掉输入框下「在：事项名 ×」小片时，该句话发往整个项目主对话；切换事项绝不改变已在跑的后台任务或工作的归属。

## 2. 合同改动（阶段一原位加可选字段，零破坏）

只改 `packages/contracts/src/services/assistant.ts` 与对应公开 API 快照 `tooling/gates/api/contracts/services-assistant.txt`（不升动作版本、不改 `assistant.db` 表结构，`assistant_works.body` 存 JSON）：

1. **`AssistantWork` 新增可选字段 `work_item_id?: string`**：
   - 仅当 `scope.kind === "project"` 时可存在；表示这项工作归属于该项目主线里的固定事项 ID。
   - 不选事项或点掉「在：事项名 ×」发往整个项目时，该字段省略（`undefined`）。
   - 一旦创建永不改变（切换事项或点掉小片绝不修改已有 `work_id` 的 `work_item_id`）。
2. **`AssistantSendInput` 新增可选字段 `work_item_id?: string`**：
   - `main: true` 且无 `work_id` 时，由宿主用 `(actor_id, scope, character, work_item_id ?? null)` 查找或创建对应主对话（`mainWorkOf`）。
   - 发送带 `work_item_id` 但 `scope.kind !== "project"` 时直接拒（`assistant.invalid`）。
   - 发送带 `work_item_id` 创建或续发主对话前，宿主以调用方本人身份通过 `system.mainline`（`mainline.subject.read@1` / `mainline.read@1`）核验该 `work_item_id` 确实存在于当前项目本人的主线上；伪造、越权或别的项目的 `work_item_id` 一律拒绝（`assistant.not_found` / `assistant.invalid`），绝不信任浏览器传入字符串。
   - 在已打开的 `main` 对话里切换 `character` 时，`mainSendInput` 保留 `held.work_item_id`，定位到同一事项下新角色的主对话。
3. **HTTP 查询与上下文装配（`apps/local-host/src/assistant/`）**：
   - `GET /api/assistant/works` 支持可选过滤或由前端从 `work.work_item_id` 区分项目主对话与各事项主对话（一次返回项目全部工作，不按事项重复发请求，守 N42～N56）。
   - 事项主对话发起一轮时，宿主按本人权限现读该事项标题与「这件事的东西」（`mainline.items.contents@1`）作为标记上下文附给模型；主线或某对象不可读时降级为不附带，不阻断对话、不泄密。
   - 事项在主线上完成或移出后，该事项已有的助理工作与历史记录保留可读，不会随移出被静默删除。

## 3. 安全边界与拒绝测试

- 伪造不存在的 `work_item_id` 或传入另一个项目的 `work_item_id` 发送 `main: true` → 拒绝（不建工作、不调模型）。
- 在 `scope.kind === "personal"` 上带 `work_item_id` 发送 → 拒绝。
- 对已在运行的事项 A 工作，切换到事项 B 后，原工作 `work_item_id` 与在途任务归属不变；在事项 B 发消息（带 B 的 `work_item_id`）创建/路由到 B 的主对话，不串台。
- 点掉「在：事项名 ×」省略 `work_item_id` 发送 → 路由到 `work_item_id === undefined` 的项目主对话。

## 4. 消费者与合审

- 消费者：`apps/local-host/src/assistant/`（`assistant-line-actions.ts`、`assistant-service.ts`、`assistant-work-reads.ts`、`assistant-round-materials.ts`、`assistant-http.ts`）与 `apps/workbench/src/scripts/client/assistant-*.ts`（同 PR 一次改完，符合合同阶段一规则）。
- 合审：不触碰 `44B` 正在改的 `platform/plugin` 与 `modules/*` 快照；本批 PR 最终头上请 C 轨公共合同台合审 `services-assistant.txt` 与本设计稿。
