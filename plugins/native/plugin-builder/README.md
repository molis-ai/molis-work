# 插件创作工作台

> **现行路线（2026-09-26 起，[agent-built-plugins](../../../specs/plugin-builder/work-items/agent-built-plugins/spec.md)）**：插件后端代码由 Agent 编写，Local Host 做类型检查、打包并在 [plugin-sandbox](../../../packages/plugin-sandbox/README.md) 里试跑（`apps/local-host/src/plugin-builder/build-checks.ts`）后才安装；前端仍由规格板 + Jev 逐个选零件、平台渲染器渲染，插件没有自己的前端代码。下文凡写「固定解释器 v1」「发布设计数据版本」之处是被取代的旧路线，以该 spec 为准（旧路线没有存量用户，不做兼容）。

自然语言设计 → 候选 → UI 装配与功能连接 → 真实试用 → 独立插件。执行仅通过 Host 的 Prologue capabilities；安装通过 PluginPlatform，草稿与数据经 SQLite private storage CAS 持久化。

生成插件的单次 `model.generate` 复用 Host 公共推理绑定和同一 Home Runtime，保留固定模型、安装调用限额、取消及持续授权，不创建额外工作目录或 Builder 运行记录。设计与编码使用 Builder Agent；它们的 Run 由 SDK 有界收集，保留活动、检查和历史记录。旧 model-role 历史记录读取兼容，但不再接受新的该类 Builder 请求。

项目内入口为插件创作工作台；独立创作页面 `/projects/<project>/plugin-builder`；发布后为 `/projects/<project>/plugins/io.molis.work.generated.<id>`。先配置模型并关联工作区。Jev 可读取 Functions 中已有的 TypeSafe 凭据；缺少时明确采用人工候选，不伪造选择。

生成应用安装固定的解释器 v1，发布的是不可变设计数据版本；发布序号 `N` 对应生成插件 Manifest `N.0.0`。每个应用有独立安装身份和数据。修改草稿不改变已发布定义；预览和正式记录隔离。第二次及以后的发布要求作者明确选择“直接兼容上一发布”或“升级时校验已有数据”。发布只登记候选；创作台库显示 Runtime 当前安装版本与最新发布，用户点「升级」后才调用 Plugin Runtime 的预检和切换。兼容声明沿连续的发布链映射为精确来源版本，其余历史版本列为可迁移来源并逐条预检现有记录。创作台不提供自动数据迁移；数据校验或运行时切换失败时旧版本继续使用，候选保留以便重试。安装版本以 Plugin Runtime 持久记录为准；Host 重启后从 Builder 的已发布版本记录恢复精确版本。支持本地数据、CSV 与受控派生计算；不执行模型 HTML/JavaScript、不自动连接外部账号。

- Migration: `goal-reorg-f2`
- Status: `partial`
- Contract: `@molis-ai/molis-work-contracts/platform/plugin`
- Spec: `specs/plugin-builder/work-items/prologue-runtime/spec.md`

验证：`pnpm --filter @molis-ai/molis-work-plugin-builder build`；`node --import tsx --test tests/plugin-builder-*.test.ts`。

内置灵感库从空画布的“体验灵感库示例”主动创建。四条示例记录进入真实预览存储，可编辑、搜索、筛选、导出；发布的独立插件从空数据开始。其装配回放明确标为示例，不启动模型。自定义插件使用同一套可选表现绑定，把文本、封面、标签、来源和链接字段显示为卡片、列表或表格。

不带模型的本地交互预览：`pnpm exec tsx scripts/preview-plugin-builder.mts`，打开输出地址。它使用独立临时 SQLite 项目和真实 Host 路由，不改正式项目。Prologue 真实生成仍在已配置工作区和模型的项目中执行。

视觉依据为 `specs/plugin-builder/ui/design/approved-comp.png`。覆盖两条真实浏览器路径的命令：`pnpm exec tsx --test tests/plugin-builder-browser.e2e.test.ts tests/plugin-builder-visual.e2e.test.ts`。完整结果见执行需求；真实模型调用和最终用户验收尚未完成。

## 看得见的协作构建

构建过程的每个动作都记录为 `BuildDocument.steps`：画布上的 UI Agent / 功能 Agent 指针、选中框、接通提示和左侧协作现场都从这里推导，状态只随真实变更推进。界面零件只来自规格板（`src/spec-board.ts`）：宿主算出合法候选，Jev 在候选中选下一个零件（单一候选或 Jev 未配置时用规格板规则，并如实标注；Jev 越界或失败时交给用户选）。功能 Agent 与装配并行，行为通过校验后逐个接通零件，预览数据接口按接通状态放行；全部接通后宿主做完整性检查才进入可试用。点画布上的零件即可“指着它”提修改，修订只重做受影响的部分。详见 `specs/plugin-builder/work-items/live-collaboration/spec.md`。

带标明替身的完整流程预览：`pnpm exec tsx scripts/preview-plugin-builder.mts --fixture`（`--fixture-jev-miss N` 演示 Jev 第 N 次越界时交给用户决定）。

## 开发要求

- 负责：插件创作台：用自然语言设计、生成、试用并发布独立插件。
- 不负责：模型凭据、运行时所有权、任意代码执行。
- 公开入口：`@molis-ai/molis-work-plugin-builder`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/platform/plugin`。
- 依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-design-system`。方向：只依赖合同、SDK 与声明过的 Module/Service/UI 包；不导入另一个插件的实现（[包边界规则](../../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 执行只经 Host 的 Prologue 能力；Agent 挂载的规范来自 `skills/molis-plugin-dev`（设计与代码两段，各不超过 20000 字）。
  - Agent 写的代码由 Local Host 做类型检查、打包并在 plugin-sandbox 里试跑（`apps/local-host/src/plugin-builder/build-checks.ts`），通过后才发布。
  - 再次编辑产生新草稿，不影响正在使用的版本；新版本新增的权限或联网域名要用户重新确认；回滚只回退代码版本、不回退数据（agent-built-plugins spec）。
  - 费用、时限和频率取自 Action 提供方的 `execution` 声明；目录适配不再按 `model.generate` 名称推断。收费能力不能用于页面自动触发的 query，旧生成物保留必要的输入输出转换。
  - 不执行模型给出的 HTML 或 JavaScript，不自动连接外部账号。
- 改动后必跑：`node scripts/run-tests.mjs tests/plugin-builder-domain.test.ts tests/plugin-builder-runtime.test.ts tests/plugin-builder-workflow.test.ts tests/plugin-builder-publication.test.ts tests/agent-built-plugins-agent.test.ts`
- 界面改动加跑（需要本机 Chrome）：`node scripts/run-tests.mjs tests/plugin-builder-browser.e2e.test.ts`
- 相关手册：[skills/molis-plugin-dev/SKILL.md](../../../skills/molis-plugin-dev/SKILL.md)、[docs/platform/PROLOGUE-AI.md](../../../docs/platform/PROLOGUE-AI.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

客户端资源由 Host 注入的 UI 生命周期管理：隐藏停止进度轮询，再次显示刷新；卸载取消本机请求并释放监听、定时器和观察器。服务端任务保持原有取消与恢复语义。
