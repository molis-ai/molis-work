# Molis Work Goal Focus 信息动线

## 完成等级

本 Goal 达到 **功能可用的 UI 重组（Level 3）**：真实 Goal Detail 默认先呈现结果、状态、下一步、关键阻塞与完成要求，完整上下文、关系和记录仍可通过稳定入口访问。

## 背景与目标

现有 Goal Detail 具备完整信息，但默认页把“下一步”和三段目标说明等量排列，完成标准与阻塞分散在其他 Tab。用户需要先阅读，再判断现在该做什么。目标是让默认视图成为真正的 Focus：先知道要得到什么、现在处于哪里、接下来做什么、为什么不能继续，以及怎样才算完成。

## 范围

- 默认 Focus 显示目标结果、当前状态、下一步、主要动作、阻塞和完成标准摘要。
- 无阻塞时明确显示清爽状态，避免用户猜测是否漏看。
- 将原因、运转方式、完整完成要求、工作边界、子 Goal 和前置事项组织到 Context。
- 保留 Progress、Relations、Record 入口以及所有现有表单和动作。
- Draft 的缺口与编辑入口仍然可访问，并进入与信息定义更匹配的 Context。

## 非目标

- 不修改 Goal Contract、状态解释、完成规则或主要动作结果。
- 不新增 API、权限、数据字段、状态或 Runtime/TUI 能力。
- 不删除任何现有字段、表单或历史记录。

## 方案

保留现有五个面板键值和客户端 Tab 行为，只修改用户看到的标签与内容编排。Overview 成为 Focus；Completion 成为 Context。Focus 使用连续文档而非卡片堆叠：结果是首要文本，下一步承担唯一主动作，阻塞与完成标准以紧凑清单收口。

## 验收标准

1. 默认视图内能快速找到结果、状态、下一步、阻塞和完成要求。
2. 主动作与现有 `explainWorkState` 和权限保持一致。
3. 目标原因、运转方式、完整范围、依赖、子项、关系、风险、规则和历史仍可访问。
4. Draft、执行中、阻塞、等待子 Goal、待决定和完成状态均有清晰默认呈现。
5. Light、Dark、宽屏和窄屏无明显拥挤、溢出或不可达操作。

## 验证

- `pnpm typecheck`
- `node --import tsx --test tests/visual-foundation.test.ts tests/web.test.ts tests/i18n.test.ts`

## 最终完成审计补充

已满足或已归档的 Goal 必须以权威 `fulfillment_state` 呈现完成要求进度。即使复合父 Goal 通过用户确认或子 Goal 闭环完成、没有逐条直接 Evidence，Focus、Runtime 摘要和进展页也不能继续显示 `0/N` 或未勾选状态；证据数量仍按真实 Evidence 记录展示，不能伪造记录。
- 在真实项目中检查执行中、阻塞和复合 Goal 的 Focus/Context 页面。
