# 项目默认规则与通用设置

## 背景与目标

这是 `ux-project-defaults-settings` 的实现规格。项目默认规则属于项目级约定，不应藏在任意 Goal 的完整记录里；AI Runtime 是可选执行工具，也不应成为整个设置页面的默认语境。

## 范围

- 为每个项目提供稳定的设置入口和“工作规则”页面。
- 项目规则页面显示规则作用范围、当前最终默认值和变更说明，并复用现有 `project_default` Policy 写入；保存后回到本页并持续显示实际生效结果。
- Goal 的工作规则区只读展示项目继承值；没有单独规则时默认收起编辑表单，用户明确选择增加要求后再展开。
- 全局设置导航和项目页使用通用语言；AI 工具接入、会话关联和工作目录关联集中在明确独立的技术区域，不混进普通项目列表。
- 项目创建、导入、改名、目录关联、诊断和 Runtime 连接现有能力保持可达。

## 非目标

- 不把所有项目设置改造成一个大型新系统。
- 不改变 Runtime 接入计划、安装或本地项目目录语义。
- 不允许 Goal 规则削弱项目默认最低门槛。

## 文件边界

- `src/web/server.ts`
- `src/web/render.ts`
- `src/web/i18n.ts`
- `tests/web.test.ts`
- `tests/i18n.test.ts`

## 验收标准

- `ux-settings-scope`：项目默认规则只在对应项目设置编辑；Goal 页面只维护当前 Goal 额外要求。
- `ux-settings-general-language`：普通设置路径不把 coding、CLI、MCP 或 AI Runtime 当作默认场景；技术词只在对应区域出现。
- `ux-settings-progressive-rules`：规则按用户目的分组，默认展示必要选择，高级约束按需展开；保存说明影响范围和结果。
- 从项目、Goal 和全局设置均能找到正确入口并返回原上下文。

## 验证

```bash
pnpm typecheck
node --import tsx --test tests/i18n.test.ts tests/web.test.ts
pnpm test
git diff --check
```

## 假设

- 项目设置页可以在加载对应 board 快照后复用现有 Policy renderer 和 API，不需要新持久化模型。
