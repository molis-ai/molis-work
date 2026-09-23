# 炼金术士

从独立 Alchemist 迁入业务能力、采用 Molis Work 原生界面：方向探索、候选比较与想法详情、市场空间与实现成本双 Lens、证据和决策、市场脉搏、上下文 Copilot、选区注释、Research Playbook、Founder Taste 与本地导出。

包名：`@molis-ai/molis-work-plugin-alchemist`。

- Status: `partial`（仓库包成熟度；本次功能验收见 spec）
- Contract: `@molis-ai/molis-work-contracts/platform/plugin`
- Migration: `goal-reorg-f2`

在 Molis Work「设置 → 模型」启用供应商、模型并保存凭据，然后从项目侧栏打开炼金术士。在方向详情比较候选，保留后继续研究和决策；集合筛选切换已保留想法、市场脉搏和决策记录。所有生成和研究判断经宿主 Prologue；插件设置可选固定模型或使用默认模型，并设置每个 Lens 的调用上限。未配置模型时保留输入并提示设置，不自动生成演示卡。

公开研究通过宿主 Search Evidence Layer 收集实际 URL 和摘要；市场脉搏保留 Toolify、Watcha、GitHub 来源。单次 Lens 的本地计划不消费 AI 调用，执行阶段的搜索、交叉判断和综合计入确认的调用预算。一次搜索计为一个业务调用，包含一次搜索供应商请求和最多三个页面的提取；不是底层 HTTP 请求数。预算不足会产生部分报告，不能作为完整双 Lens 决策依据。供应商费用不可观测，不把调用数换算为金额。

数据按项目存于 `{home}/alchemist/projects/<encoded projectId>/studio.sqlite`。安全检查点可恢复；外部请求已发出但无法确认结果时，任务标记中断，由用户重新研究，避免后台重复消费。停止会中断当前请求并阻止后续阶段。已完成的报告可重新研究，过程中保留上一份报告；新任务失败或取消不会显示成研究完成。旧演示库 `{home}/alchemist/alchemist.db` 原样保留，可从设置中的历史入口只读导出。

`src/studio` 是迁入后的唯一实现来源，不依赖原仓库路径。UI 使用宿主 plugin-stage、设计 token、列表与详情、对象侧面板及原生对话框；不再发布独立 React 页面或插件 iframe。业务 API 和已有数据原样保留，模型接入仍使用 Prologue。凭据只由宿主管理，不进入业务数据库或导出。此插件不自动创建 Goal 或修改其他插件。

构建：`pnpm --filter @molis-ai/molis-work-plugin-alchemist build`；业务测试：`pnpm --filter @molis-ai/molis-work-plugin-alchemist test`。宿主、恢复和浏览器回归见根目录 `tests/alchemist-*.test.ts`。范围与验收记录见 `specs/alchemist-plugin/spec.md`。
