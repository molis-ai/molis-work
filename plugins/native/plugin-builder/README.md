# 插件创作工作台

用自然语言描述想要的插件，由 Agent 设计方案、编写后端代码与测试，Local Host 做类型检查、打包并在 [plugin-sandbox](../../../packages/plugin-sandbox/README.md) 里试跑（`apps/local-host/src/plugin-builder/build-checks.ts`）后才安装；前端由平台渲染器按规格板零件渲染，插件没有自己的前端代码。路线见 [agent-built-plugins](../../../specs/archive/plugin-builder/work-items/agent-built-plugins/spec.md)。

创作台只画在工作台的主区里（`?openPlugin=plugin-builder`），没有自己的整页，也不嵌框架（[artifact-positioning](../../../specs/artifact-positioning/spec.md) S4）。客户端是插件包的 `AGENT_STUDIO_WORKBENCH_CLIENT_FACTORY_SCRIPT`，接口在 `/api/plugin-builder/studio/*`（`apps/local-host/src/plugin-builder/agent-surface.ts`）。生成的插件安装后在工作台打开，身份为 `io.molis.work.generated.<id>`，每个插件有独立安装身份和数据。先配置模型并关联工作区。

旧的「设计数据 + 固定解释器 v1」创作台（独立页面 `/projects/<project>/plugin-builder`、`builder.builds.*` 动作、灵感库示例）已随 S1b 删除，不留兼容；旧路线的设计与验收留在 [specs/archive/plugin-builder](../../../specs/archive/plugin-builder/)。

- Migration: `goal-reorg-f2`
- Status: `partial`
- Contract: `@molis-ai/molis-work-contracts/platform/plugin`

不带真模型的本地预览：`pnpm exec tsx scripts/preview-agent-studio.mts --fixture`，打开输出地址。它用独立临时项目、真实构建门槛与沙箱，只把模型换成标明替身的设计者与编码 Agent；预览和浏览器用例经 `scripts/agent-studio-harness.mts` 按工作台的方式挂载创作台。

## 开发要求

- 负责：插件创作台：用自然语言设计、生成、试用并发布独立插件。
- 不负责：模型凭据、运行时所有权、任意代码执行。
- 公开入口：`@molis-ai/molis-work-plugin-builder`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/platform/plugin`。
- 依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-design-system`。方向：只依赖合同、SDK 与声明过的 Module/Service/UI 包；不导入另一个插件的实现（[包边界规则](../../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 执行只经 Host 的 Prologue 能力；Agent 挂载的规范来自 `skills/molis-plugin-dev`（设计、体验、界面、复查与代码按阶段挂载，各不超过 20000 字）。
  - Agent 写的代码由 Local Host 做类型检查、打包并在 plugin-sandbox 里试跑（`apps/local-host/src/plugin-builder/build-checks.ts`），通过后才发布。
  - 再次编辑产生新草稿，不影响正在使用的版本；新版本新增的权限或联网域名要用户重新确认；回滚只回退代码版本、不回退数据（agent-built-plugins spec）。
  - 费用、时限和频率取自 Action 提供方的 `execution` 声明；目录适配不再按 `model.generate` 名称推断。收费能力不能用于页面自动触发的 query。生成插件只走统一目录：目录之前的工作室能力清单（`goals.*`、`reminders.*`、`schedules.*` 的旧形状）和直接写在代码里的模型要求都已删除（2026-10，防腐第二步）。
  - 不执行模型给出的 HTML 或 JavaScript，不自动连接外部账号。
- 改动后必跑：`node scripts/run-tests.mjs tests/plugin-builder-domain.test.ts tests/agent-built-plugins-agent.test.ts tests/agent-built-plugins-authoring.test.ts tests/agent-built-plugins-capabilities.test.ts tests/agent-built-plugins-catalog.test.ts tests/agent-built-plugins-checks.test.ts tests/agent-built-plugins-components.test.ts tests/agent-built-plugins-dependencies.test.ts tests/agent-built-plugins-network.test.ts tests/agent-built-plugins-reminders.test.ts tests/agent-built-plugins-workbench.test.ts tests/agent-built-plugins-workflow.test.ts tests/generated-plugin-prompt-binding.test.ts tests/generated-plugin-prompts.test.ts tests/installed-plugin-execution.test.ts tests/installed-plugin-host.test.ts tests/installed-plugin-policy.test.ts`
- 界面改动加跑（需要本机 Chrome）：`node scripts/run-tests.mjs tests/agent-studio.e2e.test.ts tests/plugin-builder-stage.e2e.test.ts tests/plugin-builder-diagnostics.e2e.test.ts`
- 相关手册：[skills/molis-plugin-dev/SKILL.md](../../../skills/molis-plugin-dev/SKILL.md)、[docs/platform/PROLOGUE-AI.md](../../../docs/platform/PROLOGUE-AI.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

客户端资源由 Host 注入的 UI 生命周期管理：隐藏停止进度轮询，再次显示刷新；卸载取消本机请求并释放监听、定时器和观察器。服务端任务保持原有取消与恢复语义。

## 整页设计与复查

支持该能力的宿主在首次生成时，先让体验阶段重组所选方案的部件草图、规划使用路径并给出代表性内容，再由主线细化绑定与验收。完整设计校验并冻结后调用 UI 阶段，输出版本化的 `presentation` 与合法展示属性；Jev 获得整页结构、相邻部件和设计偏好，失败时沿用合法偏好。创作台的「只调整界面」复用已通过的后端与合同；可撤回并独立发布布局变化。旧插件保持原布局。

组件交互说明随呈现词表进入 UI 和评审：弹层入口用输入部件的 title、提交用 submitLabel；行内动作自动选中当前记录，成功反馈是临时消息。有全文路径的组合目录使用两行摘要，正文保留原文。主线验收使用符合任务的内容长度；短样本和静态截图不能证明全文、动效或未展示状态的质量。

G7 与截图复查使用独立验收存储，不读取或清空人的试用内容。宽窄屏结构检查发现溢出与操作遮挡；当前模型声明图片输入能力时，经 Prologue 查看画布截图，最多一轮修订、一次确认。无图片能力如实显示「功能已验证；视觉未复查」。结构故障仍阻止完成。实际截图与真实模型记录须和手写样例分开判断。

实施与验收：[整页设计与视觉复查](../../../specs/archive/plugin-builder/work-items/visual-composition/spec.md)。

设计、UI 生成和截图复查共同读取 [体验与审美标准](../../../skills/molis-plugin-dev/generated-experience.md)，其中用户动线进入 journey/purpose，空间与信息取舍进入 UI summary。标准参考 Impeccable 的 Operate/Read、动效和评审原则，按 Molis 的组件目录改写，随插件规范一起发行。动效由宿主实现，不开放模型脚本；静态截图不用于断言动画、焦点或未展示状态。复查同时获得实际渲染节点、字段映射与合法候选，建议必须有具体截图证据并保持冻结合同。

界面生成与复查都收到用户原始需求；旧旅程里的位置描述不冻结布局。复查挂载独立章节，不混入生成 JSON 的要求；集中修订收到同批截图，并自行核对模型建议是否有证据、是否能用当前组件表达。无图片能力时仍保持原有结构检查与文字修订路径。

体验阶段使用 `experience/1.2.0`，复用设计 Runtime，通常增加一次模型调用，不在恢复已冻结构建或纯视觉修订时重跑。体验草图不得改操作和已选平台能力，主线负责最终引用一致性；代表性场景进入 detail 和后续 UI/评审，但不是正式存储的预置记录。初始体验上下文随历史和发布保留，后续用户修改要求优先。

截图评审返回范围、截图、目标、证据、影响与改法；可定位且属性受支持的 presentation 意见才触发自动修订，design/host/unverified 意见保留显示。未知截图、部件或属性也保留为未自动修改；这只能防止部分错误返工，不证明模型判断正确。旧 visualResult 字符串结果继续可读。

体验草图的 uses 可引用一个或多个既有操作，由 detail 再落实为运行时部件及绑定。G7 失败诊断读取渲染器已接受的结果/错误，保留当时选择和筛选，不再发空输入查询；填写了不存在的枚举选项时交回设计修改验收或显示映射，复用业务实现。
