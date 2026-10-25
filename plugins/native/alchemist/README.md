# 炼金术士

从独立 Alchemist 迁入业务能力、采用 Molis Work 原生界面：方向探索、候选比较与想法详情、市场空间与实现成本双 Lens、证据和决策、市场脉搏、上下文 Copilot、选区注释、Research Playbook、Founder Taste 与本地导出。

包名：`@molis-ai/molis-work-plugin-alchemist`。

- Status: `partial`（仓库包成熟度；本次功能验收见 spec）
- Contract: `@molis-ai/molis-work-contracts/platform/plugin`
- Migration: `goal-reorg-f2`

在 Molis Work「设置 → 模型」启用供应商、模型并保存凭据，然后从底栏的插件切换（或 Dock）打开炼金术士。在方向详情比较候选，保留后继续研究和决策；集合筛选切换已保留想法、市场脉搏和决策记录。所有生成和研究判断经宿主 Prologue；插件设置可选固定模型或使用默认模型，并设置每个 Lens 的调用上限。未配置模型时保留输入并提示设置，不自动生成演示卡。

模型目录复用 Host 元数据查询，发现时不解密凭据；实际生成通过共享 `hostTextGeneration` 绑定同一 Home Runtime。宿主管理模型配置失效、取消、时限和授权复查；Host 使用 SDK 公共 JSON 解码并返回可区分的语法结果，插件继续拥有研究提示词、Zod 领域验证和显式预算内的一次格式纠正。

公开研究通过宿主 Search Evidence Layer 收集实际 URL 和摘要；市场脉搏保留 Toolify、Watcha、GitHub 来源，界面在市场脉搏列表里写明采集会联网访问这三个站点；GitHub 来源只带用户在「来源设置」里选定的那个「设置 › 服务连接」GitHub 账号的令牌，没选就匿名访问（限额较低），不读环境变量；令牌不交给插件：宿主经 `pulseGithub.fetch` 在请求发往 `api.github.com` 时加上请求头（`SafePublicHttpClient` 的 `fetch` 选项，插件自己不建这个头，`source-adapters.test.ts` 扫源码保证），`pulseGithub.read/select` 只列账号与选择（动作 `alchemist.pulse.github`、`alchemist.pulse.github.configure`：只有 user 受众，声明在 Home 作用域（`scope: "home"`），权限是自己的 `alchemist:connections:read/write`，和 Images 的 `connections.*` 一样；绑定记在连接登记表 `home/alchemist/pulse-github`，是整个 Home 共用的一条，在任一项目里选的账号所有项目都用，来源设置对话框也写明「所有项目共用」；这两个动作由 `createAlchemistActionHandlers` 的 `pulseGithub` 端口直接服务，不需要项目、不打开任何项目的工作室）；界面上的说明与 `docs/platform/NETWORK.md` 第 7 类写的是同一条规则。单次 Lens 的本地计划不消费 AI 调用，执行阶段的搜索、交叉判断和综合计入确认的调用预算。一次搜索计为一个业务调用，包含一次搜索供应商请求和最多三个页面的提取；不是底层 HTTP 请求数。预算不足会产生部分报告，不能作为完整双 Lens 决策依据。供应商费用不可观测，不把调用数换算为金额。

数据按项目存于 `{home}/alchemist/projects/<encoded projectId>/studio.sqlite`。重启后保留任务与安全检查点，由用户明确点击继续；外部请求已发出但无法确认结果时，先说明可能重复收费，再从最近可恢复阶段执行，仍受原预算约束。停止会中断当前请求并阻止后续阶段。已完成的报告可重新研究，过程中保留上一份报告；新任务失败或取消不会显示成研究完成。

执行中的任务持续续租，其他进程不会因原始租期结束而接管仍在执行的任务。取消或租约丢失后，原执行者停止等待；业务结果和检查点写入在原任务库中校验执行归属。任务状态与事件同事务保存，失败不会留下只有状态、没有对应事件的半次更新。系统动作服务迁移仍在进行，进度见 `specs/action-architecture/migration.md`。

Studio 业务由 `alchemistActions` 声明，输入输出验证与目录 JSON Schema 来自同一 Zod 合同。`createAlchemistActionHandlers` 为 Host 提供处理器，`LocalRuntime.actions` 执行原有业务；HTTP 仅负责参数映射、状态码和下载，没有事件流路由（2026-10-20 删除，页面和 Skill 都不用）。任务事件只经 `alchemist.runs.events` 动作按游标读取，使用原任务库的一致快照，重复查询或中途放弃都不会取消任务。生产 Host 注册同一动作清单，HTTP 经同一 Kernel 执行；旧演示数据的只读能力与「历史演示记录」入口已删除（2026-10-02，artifact-positioning P8）；按 Home/项目共享运行时，最后一个 Host 释放才停止。可信调用者身份保留到对象、任务和 Prologue 会话；重启后的任务保留历史作者，但需当前调用者明确继续并获得本轮权限才能执行。标准 MCP 测试使用真实 Host 和显式 fixture 权限，不能当作生产客户端授权管理完成。旧演示 writer 和生成器已移除，仅保留历史读取及导出。

`src/studio` 是迁入后的唯一实现来源，不依赖原仓库路径。UI 使用宿主 plugin-stage、设计 token、列表与详情、对象侧面板及原生对话框；不再发布独立 React 页面或插件 iframe。业务 API 和已有数据原样保留，模型接入仍使用 Prologue。凭据只由宿主管理，不进入业务数据库或导出。此插件不自动创建 Goal 或修改其他插件。

构建：`pnpm --filter @molis-ai/molis-work-plugin-alchemist build`；业务测试：`pnpm --filter @molis-ai/molis-work-plugin-alchemist test`。宿主、恢复和浏览器回归见根目录 `tests/alchemist-*.test.ts`。范围与验收记录见 `specs/archive/alchemist-plugin/spec.md`。

AI 固定指令统一定义于 `src/prompts.ts`，`ALCHEMIST_INSTRUCTIONS` 由 Host 自己的列表登记（`apps/local-host/src/agent-definitions/builtin-instructions.ts`；Alchemist 由 Host 承载、没有运行时定义，迁到 Plugin Runtime 之前留在这里，PG-051）；领域与 Host 端口使用 `InstructedPrompt`，研究维度和任务材料单独传递。Host 在授权复查后使用当前 Home 的用户覆盖；格式纠正仍需显式预算、最多一次，SDK 负责 JSON 解码，插件核对领域语义。回归包含 `tests/prompt-registration.test.ts` 和 `tests/alchemist-structured-output.test.ts`。

## 开发要求

公开 `ALCHEMIST_STUDIO_BASELINE` 与已有搜索库基线供离线快照核当前结构/版本；不另写库版本或从宿主查询工作室业务表。实际双分区读回见 `tests/home-snapshot-content.test.ts`。

- 负责：按项目隔离的 Alchemist 工作室：方向探索、有证据的研究与创始人决策。
- 不负责：宿主模型凭据、其他插件的实现。
- 公开入口：`@molis-ai/molis-work-plugin-alchemist`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/platform/plugin`。
- 依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-storage`、`@molis-ai/molis-work-plugin-sdk`；第三方依赖见 `package.json`。方向：只依赖合同、SDK 与声明过的 Module/Service/UI 包；不导入另一个插件的实现（[包边界规则](../../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 未配置模型时保留输入并提示，不生成演示卡。方向卡与研究卡上因缺模型而停下的炼化或研究只说一次「还没有可用模型」并带「打开模型设置」（模型之后配好了就不再说），不显示状态、等待标签或内部错误码。
  - 哪些动作要模型由插件自己声明：凡声明了 `alchemist:generate` 权限（`ALCHEMIST_GENERATE_PERMISSION`）的动作，`createAlchemistActionHandlers` 都为它绑上可用性判断，「用户本人的页面一律可用」这条规则也在这里；宿主（`AlchemistHostService`）不留动作清单，只经 `modelAvailability` 端口回答「这个 Home 有没有炼金术士能跑的模型」，答案来自 Prologue 端口 `listModels` 提供的同一份列表（`alchemistModelChoices`），所以「能不能跑」只有一个答案。炼金术士的端口不认开发用环境变量里的密钥，因此只在那一种开发模式下，这个答案可能与其他插件宿主侧的 `hostCompleteText` 不同；真实 Home 里两者一致。新增一个调模型的动作，只要声明这个权限就受同一判断；`tests/model-unavailable-declarations.test.ts` 按声明遍历，不抄动作清单。
  - 这四个动作（`alchemist.reuse.assess`、`conversation.send`、`explorations.start`、`research.start`，版本仍是 1）除 `alchemist:generate` 外还声明平台的 `model:invoke`（`ALCHEMIST_MODEL_PERMISSION`），它们是计费、并发的动作，只有它们声明；Manifest 里 `model:invoke` 是可选权限，关掉只让这四个动作不可用。`alchemist:generate` 保留：授权、可用性判断和后台继续时保留的权限都按它写（版本保持 1 的依据见 `specs/repository-anti-corruption/spec.md` 的 ALC-RES 一节）。
  - 没有模型时，`alchemist.reuse.assess`、`alchemist.conversation.send`、`alchemist.explorations.start`、`alchemist.research.start` 在目录里对助理、MCP、工作流和插件标成不可用，原因是缺模型：工作流和插件调用得到 `actions.connection_required`，助理搜能力时不列出，MCP 的 `tools/list` 不列出这四个工具、按名调用得到 `actions.mcp_unavailable`，配好模型后它们回来；用户自己的页面不受影响，这是用户 2026-10-09 定下的做法：发送讨论先保存消息，启动炼化与启动研究记一条停下的运行，卡片再指向模型设置。`alchemist.pulse.start` 用规则综合、不调模型，不声明。`tests/model-unavailable-declarations.test.ts` 钉着现在的划分。
  - 研究阶段的端口类型在 `src/studio/server/runtime/research-runtime-port.ts`；会写 `fixture://research/…` 假证据的 `FixtureResearchRuntimeAdapter` 只在 `tests/fixtures/`，生产代码不导入它。
  - 预算不足产生部分报告，不能当作完整的双 Lens 依据；费用不可观测时不把调用数换算成金额。
  - 执行中的任务持续续租；任务状态与事件同事务保存。
  - 可信调用者身份保留到对象、任务与 Prologue 会话；对话发送与复用适用性判断声明 `scheduling: "concurrent"`，等模型不占项目串行队列。
  - 包内还有 vitest 用例：`pnpm --filter @molis-ai/molis-work-plugin-alchemist test`。
  - 项目被删除时，先撤销工作室的前台与 worker 提交权限，等待真实执行退出，再关闭工作室与搜索库，最后删除 `alchemist/projects/<项目>` 目录。清理失败保留资源与关闭状态，下次删除或 Host 关闭重试；期间不再接纳动作，也不开第二份工作室。`tests/security-invariants-alchemist-lifecycle.test.ts` 覆盖 W5-01-ALC-LIFE 的迟到结果和失败重试。
- 运行前构建：`pnpm --filter @molis-ai/molis-work-plugin-alchemist run build`；若改过源码或共享依赖，先在仓库根目录运行 `pnpm build`。
  - 打开的工作室每 250 毫秒取一次任务。宿主（`apps/local-host/src/alchemist-service-host.ts`）关掉 10 分钟没人用、手上也没事的工作室（W4-09）：没有进行中的操作、没有正在取的任务、没有排队或运行中的任务（运行时的 `idle()`）；下一次操作再打开。等模型的前台操作和后台任务都让它保持打开。
- 改动后必跑：`node scripts/run-tests.mjs tests/alchemist-actions.test.ts tests/alchemist-host.test.ts tests/security-invariants-alchemist-lifecycle.test.ts tests/alchemist-studio-idle.test.ts tests/alchemist-runtime.test.ts tests/alchemist-mcp.test.ts tests/project-deletion-studios.test.ts tests/alchemist-pulse-github.test.ts tests/model-unavailable-declarations.test.ts tests/network-notices.test.ts`
- 界面改动加跑（需要本机 Chrome）：`node scripts/run-tests.mjs tests/model-ready-surfaces.e2e.test.ts`（页面在没有模型时显示「没有模型」，模型设置页宣布第一个模型（`molis-work:model-ready`）后它要重读；这个文件每个页面一条用例）。
- 相关手册：[specs/archive/alchemist-plugin/spec.md](../../../specs/archive/alchemist-plugin/spec.md)、[skills/molis-prologue-ai/SKILL.md](../../../skills/molis-prologue-ai/SKILL.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

LocalWorker 经 Plugin SDK 共用执行生命周期：本地关闭、取消和失租都禁止迟到的业务提交、检查点和终态写入，并停止续租。关闭后的未决外部调用保留原检查点，恢复仍由 Alchemist 判断，不自动重复模型请求。

前台调用逐次传递原 `signal/beforeEffect/assert_authority_current`，模型或来源等待结束后在实际写点复查，并在最后一次等待后同步检查。取消或撤权不产生新的失败回复、研究计划或模型设置；已合法保存的本人消息保留，正常模型失败仍有解释。已接受的后台任务保留本次真实调用的持续授权，正常 HTTP 响应结束后仍可执行；撤权、停用或 Host 关闭仍阻止后续派出与业务写入。页面通过共享 UI 生命周期管理事件、读取与轮询，隐藏停读、卸载取消，系统搜索可按对象 ID 跨集合与过滤打开。

固定研究成果的生产 Host 端口尚未接线。报告根据当前成果入口的 availability 禁用「保存固定版本」并解释原因，研究方法复用仍可使用；fixture 端口不代表生产支持，完整固定成果发布与预览仍未完成。

本轮控制与客户端回归：`node scripts/run-tests.mjs tests/alchemist-actions.test.ts tests/security-invariants-alchemist-lifecycle.test.ts tests/alchemist-client-boundaries.e2e.test.ts`。浏览器用例使用真实 Studio HTTP/SQLite 与受控模型响应；正式 Host 的等待后提交另由生命周期用例覆盖，不代替真实模型质量与整合实操。

重启只读取原任务，不重新领取租约或执行 queued/running。`runs.continuation` 只读展示继续条件，`runs.continue` 在真实调用者确认后只受理指定任务：探索固定本次模型与 Taste，Lens 沿原计划并从完整 `call_started` 历史累计预约数。上次调用停在结果未知处（Lens 的 `call_dispatched`、探索的 `generating`）时，两类任务的继续条件都给出 `unknownCall`：结果可能已经收费，继续会再调一次、可能重复收费；Lens 的这一次仍占原预算。探索的确认串包含这一状态，看过之后状态变了就要重新查看再确认。拒绝都是 `alchemistStateErrors` 声明的码（如 `alchemist.job_lease_active`、`alchemist.resume_context_changed`），找不到任务对外是 `alchemist.run_not_found`；安全 checkpoint 可零模型落库，耗尽不扩额。worker 的领取、续租、checkpoint、成功和失败写入都保留本轮类别权限与原授权；旧 actorId 不授予继续权。WorkReuse Host 真实外部接线尚未完成，fixture 接收方的 guard 证明不等于生产闭环。改恢复路径加跑 `tests/alchemist-resumption.test.ts`、`tests/security-invariants-alchemist-resumption.test.ts`、`tests/alchemist-resumption.e2e.test.ts` 及包内 acceptance、budget-history、recovery、lease、work-reuse 用例。
