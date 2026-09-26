# 炼金术士

从独立 Alchemist 迁入业务能力、采用 Molis Work 原生界面：方向探索、候选比较与想法详情、市场空间与实现成本双 Lens、证据和决策、市场脉搏、上下文 Copilot、选区注释、Research Playbook、Founder Taste 与本地导出。

包名：`@molis-ai/molis-work-plugin-alchemist`。

- Status: `partial`（仓库包成熟度；本次功能验收见 spec）
- Contract: `@molis-ai/molis-work-contracts/platform/plugin`
- Migration: `goal-reorg-f2`

在 Molis Work「设置 → 模型」启用供应商、模型并保存凭据，然后从项目侧栏打开炼金术士。在方向详情比较候选，保留后继续研究和决策；集合筛选切换已保留想法、市场脉搏和决策记录。所有生成和研究判断经宿主 Prologue；插件设置可选固定模型或使用默认模型，并设置每个 Lens 的调用上限。未配置模型时保留输入并提示设置，不自动生成演示卡。

公开研究通过宿主 Search Evidence Layer 收集实际 URL 和摘要；市场脉搏保留 Toolify、Watcha、GitHub 来源。单次 Lens 的本地计划不消费 AI 调用，执行阶段的搜索、交叉判断和综合计入确认的调用预算。一次搜索计为一个业务调用，包含一次搜索供应商请求和最多三个页面的提取；不是底层 HTTP 请求数。预算不足会产生部分报告，不能作为完整双 Lens 决策依据。供应商费用不可观测，不把调用数换算为金额。

数据按项目存于 `{home}/alchemist/projects/<encoded projectId>/studio.sqlite`。安全检查点可恢复；外部请求已发出但无法确认结果时，任务标记中断，由用户重新研究，避免后台重复消费。停止会中断当前请求并阻止后续阶段。已完成的报告可重新研究，过程中保留上一份报告；新任务失败或取消不会显示成研究完成。旧演示库 `{home}/alchemist/alchemist.db` 原样保留，可从设置中的历史入口只读导出。

执行中的任务持续续租，其他进程不会因原始租期结束而接管仍在执行的任务。取消或租约丢失后，原执行者停止等待；业务结果和检查点写入在原任务库中校验执行归属。任务状态与事件同事务保存，失败不会留下只有状态、没有对应事件的半次更新。系统动作服务迁移仍在进行，进度见 `specs/action-architecture/migration.md`。

Studio 的 41 项业务已声明为 `alchemistActions`，输入输出验证与目录 JSON Schema 来自同一 Zod 合同。`createAlchemistActionHandlers` 为 Host 提供处理器，`LocalRuntime.actions` 执行原有业务；HTTP 仅负责参数映射、状态码、SSE 和下载。事件读取使用原任务库的一致快照，取消观察不会取消任务。生产 Host 注册这 41 项与 3 项旧演示只读能力，HTTP 经同一 Kernel 执行；按 Home/项目共享运行时，最后一个 Host 释放才停止。可信调用者身份保留到对象、任务和 Prologue 会话，重启后后台任务继续使用原发起身份。标准 MCP 测试使用真实 Host 和显式 fixture 权限，不能当作生产客户端授权管理完成。旧演示 writer 和生成器已移除，仅保留历史读取及导出。

`src/studio` 是迁入后的唯一实现来源，不依赖原仓库路径。UI 使用宿主 plugin-stage、设计 token、列表与详情、对象侧面板及原生对话框；不再发布独立 React 页面或插件 iframe。业务 API 和已有数据原样保留，模型接入仍使用 Prologue。凭据只由宿主管理，不进入业务数据库或导出。此插件不自动创建 Goal 或修改其他插件。

构建：`pnpm --filter @molis-ai/molis-work-plugin-alchemist build`；业务测试：`pnpm --filter @molis-ai/molis-work-plugin-alchemist test`。宿主、恢复和浏览器回归见根目录 `tests/alchemist-*.test.ts`。范围与验收记录见 `specs/alchemist-plugin/spec.md`。
