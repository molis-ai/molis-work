# Molis Work Goal Graph UI

## 完成等级

本轮达到 **功能可用（Level 3）的只读关系视图**：用户在现有 Goal Navigator 中切换「列表 / Graph」，用同一份 Goal 与 Relation 事实查看复杂关系并聚焦当前 Goal。它不新增关系类型，也不改变任何领域状态。

## 背景与目标

列表适合日常扫读，但交叉依赖、深层父子结构和多条影响路径会被折叠成分散的摘要。Graph 需要补足整体关系感，同时保持 Molis Work 的核心路径：选择 Goal、理解当前事实、继续推进。

目标：

- 列表与 Graph 是同一 Navigator 的两种读法，可随时切换。
- Graph 明确展示现有 `part_of` 与 `depends_on` 的存储方向、节点状态和当前选中 Goal。
- 用户可以只看当前 Goal 的相关网络，并从任一节点切换 Focus。
- 搜索和状态筛选继续作用于同一批 Goal，不产生任何写入。

## 范围

### 包含

- Navigator 顶部的 List / Graph 视图切换。
- 基于现有 Goal 和 active Relation 的节点与有向连线。
- 当前 Goal 聚焦、相关网络聚焦、关系类型开关、缩放适配和节点选择。
- 宽屏工作台、标准宽度和窄屏 Goal 视图中的可读呈现。
- Light / Dark / System 视觉适配。

### 不包含

- 新增或修改 Goal / Relation API、数据模型、状态机、权限和 Runtime/TUI 契约。
- 拖拽改关系、自动编排、自动布局写回或 Agent Orchestration。
- 用 Graph 替代日常列表；列表仍是默认视图。

## 实现边界

- `src/web/goal-graph.ts`：从 `WebGoalView` 与 active `GoalRelationRecord` 计算稳定、无写入的展示布局。
- `src/web/render.ts`：渲染切换、Graph 节点与边，并把节点选择接入现有 `selectGoal`。
- `src/web/visual-foundation.ts`：Quiet Intent Workspace 下的 Graph 画布、状态和响应式样式。
- `src/web/i18n.ts`：Graph UI 中英文文案。
- `tests/goal-graph.test.ts`、`tests/web.test.ts`、`tests/visual-foundation.test.ts`：布局事实、可访问交互、样式与无写入边界。

## 关键行为

1. 默认仍显示 List；切到 Graph 只更新会话内 UI 状态。
2. Graph 节点来源与 List 完全一致，连线只来自当前快照中 active 的 `part_of` / `depends_on`。
3. 箭头按 Molis Work 存储方向呈现，并用关系标签和图例说明，不反向猜测业务语义。
4. 选择 Graph 节点复用现有 Goal Focus 加载路径；不调用关系写入接口。
5. 「只看相关」仅隐藏与当前 Goal 不连通的节点；类型开关仅隐藏对应边和因此孤立的展示。
6. 复杂网络保持可滚动、可聚焦；窄屏只占用「目标」视图，不抢占 Focus 与 Runtime。

## 验收标准

- 用户能在 List / Graph 之间切换，刷新后保持本会话选择。
- Graph 对当前项目显示真实节点、状态、父子和依赖方向；同一 Goal 的标题与状态和 List 一致。
- 点击节点会切换同一页面的 Focus，当前节点高亮并重新聚焦关系网络。
- 「只看相关」及父子 / 依赖显示开关清晰可用。
- Graph 操作不会触发任何 Goal 或 Relation 写入请求。
- `pnpm typecheck`、Graph 定向测试和完整 `pnpm test` 通过；宽屏、标准宽度、窄屏、Light/Dark 均完成浏览器检查。

## 验证

```bash
pnpm typecheck
node --import tsx --test tests/goal-graph.test.ts tests/visual-foundation.test.ts tests/i18n.test.ts
pnpm test
```

