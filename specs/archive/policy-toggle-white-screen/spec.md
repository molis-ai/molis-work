# Policy 开关保存后白屏

> 归档（2026-10-01，合入后梳理）：判定为**已被取代**。Runtime/Review Policy 已随事件工作流退役。没有剩余事项。

## 背景与目标

Runtime / Review Policy 的“执行者自我验证”和“用户最终确认”可以正确保存，但成功后的强制刷新会重建整个右侧文档容器；Goal 较多时用户会看到白屏。目标是保留现有写入语义，并让刷新过程无可见空白。

## 当前行为和证据

- `refreshBoard(true)` 获取新页面后执行 `documentPane.innerHTML = nextDocument.innerHTML`。
- Policy API 已成功返回且状态已持久化，因此问题不在 Policy 写入，而在成功后的整容器替换。

## 范围

- Goal 页面刷新时，在离屏文档中准备新 Goal views，再以单次节点替换更新现有 views。
- 保持选择、滚动、展开状态、表单防刷新和 Decision Center 行为不变。
- 为刷新策略增加回归断言，并在真实页面分别保存两个开关。

## 非目标

- 不改变 Policy 字段、继承、权限或 Review obligation 语义。
- 不重构整个实时同步协议。

## 模块边界与调用链

- `src/web/render.ts`：Policy 保存 → `refreshBoard(true)` → 获取新页面 → 原子同步 Goal views。
- `tests/web.test.ts`：校验 Goal 页面不再整体清空文档容器。

## 验收标准

1. 两个 Policy 开关保存后状态正确，右侧页面持续可见。
2. Goal 页刷新不再给 `documentPane.innerHTML` 整体赋值。
3. 选择、滚动和 disclosure 状态继续恢复。
4. `pnpm test -- --runInBand` 与 `pnpm build` 通过。

## 假设与开放问题

- 当前白屏来自大块同步 DOM 重建；若修复后仍可复现，再单独检查设备级渲染或浏览器扩展，不在本次提前扩展。
