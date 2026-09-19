# 列表用创建日期和头像替换 Goal ID

状态：完成。完成等级 **3：功能可用**。不改用户库、不提交。

## 背景目标

列表标题前的 `V1` 是 Goal ID 短码，对人没有用。先用创建日期和创建人头像占这个位置；真人资料以后再接。

## 当前行为与问题证据

- `.tree-ref` 显示 `goalTreeReferenceLabels` 短码（如 `V1`），没有短码的行留空 4.5ch。
- Goal 有 `created_at`；创建人没有独立字段，已接受的 Goal 有 `accepted_by`（示例是 `demo-user`）。

## 范围与非目标

做：

- 舞台列表不再显示 Goal ID 短码。
- 行最右侧固定两列：创建日期（`Sep 17` 这种英文短月+日，不含年）、创建人头像（无照片时用首字母色块）。
- 没有 `accepted_by` 时头像仍占位，日期仍用 `created_at`。
- 行高仍 28px；子 Goal 只缩进标题簇。

不做：不改画布/看板节点、不建人员表、不迁移 SQLite、不改创建流程。

## 使用场景

1. 打开 Goals 列表：每行是标题、状态、进度、前置，最右侧是 `Sep 17` 和头像。看不到 `V1`。
2. 悬停头像能看到创建人 ID；悬停日期能看到完整时间。
3. 列表被工作区挤窄时不展示日期和头像，只留标题和状态。

## 方案

- `tree-ui.ts`：标题簇只留标题；`.tree-created-meta` 放在行尾，里面是日期再头像。
- `goal-canvas.ts`：行网格最后一列是日期+头像。
- 创建人暂用合同首条 `changed_by`，没有再用 `accepted_by`。

## 验收标准

1. 舞台列表 DOM 没有 Goal 短码 `.tree-ref`；有 `.tree-avatar` 和 `time.tree-created`。
2. 日期格式为英文短月+日（如 `Sep 17`）。
3. `tests/goals-tree-ui.test.ts` 与 `tests/immersive-directory.e2e.test.ts` 列表行路径通过。

## 验证命令

```
pnpm --filter @molis-ai/molis-work-plugin-goals --filter @molis-ai/molis-work-app-workbench build
node --import tsx --test --test-concurrency=1 tests/goals-tree-ui.test.ts tests/immersive-directory.e2e.test.ts
```
