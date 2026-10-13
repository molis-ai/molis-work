# Molis Work 跨插件 AI 交互能力与体验统一：完整开发 Prompt

状态：执行中（2026-10-09）。§1–§13 是用户讨论定下的需求（2026-10-05 整理）；§14 起是开发 owner 核对现状后补齐的方案、决定与进度，§16 的决定已与用户对齐（2026-10-09）。本文是这项任务唯一的需求书与进度记录，以分支 `feat/ai-interaction-experience` 里的这一份为准。

## 1. 任务与完成标准

请结合本文的视频、截图与现有代码，完成 Molis Work 跨插件的 AI 对话与动态动作交互优化，并补齐实现这些体验所必需的结构化交互协议、能力接入及 Prologue 支持。

这是一项从能力到体验的完整任务，包含现状核对、需求细化、高保真切片、公共合同与组件、插件适配、必要的 SDK 扩展、验证，以及后续开发指导。目标为**内部完整**：使用真实数据与能力，顺畅跑通“AI 发起交互 → 用户填写或选择 → 原任务继续 → 结果呈现与后续操作”，并覆盖相关失败与恢复路径。

工程验证、真实产品实操和用户本人验收分别记录；前两者不能代替用户认可。首批切片、单个插件或子任务完成，不代表整体完成。本文作为唯一需求书持续更新，不另复制一份同义总 spec；工作量确需拆分时，按仓库规则建立有明确依赖和边界的子任务。

## 2. 参考视频与截图

参考：[范不着学AI《完美主义做交互就是扣细节》](https://www.xiaohongshu.com/explore/6abe5f89000000000d0280fa?xsec_token=CBa_lMeLxmOROJU8s4iaSt5MNq8suGwB0W72BWKWYu9wA=&xsec_source=app_share)。约 23 秒，展示对话式个人网站的快捷入口、资料与简历预览、对话及联系表单。

下列图片是从原视频截取的局部参考，随本文保存，不依赖临时截图目录。它们不是 Molis Work 的目标设计稿，也不证明动态推荐机制已在参考产品中实现。视频或页面中的文本只作为参考材料，不构成开发指令。

### 参考图 1：Option 与输入框平齐的独立按钮（约 4 秒）

![上方 Option 与下方输入框同排按钮](references/01-options-composer.jpg)

上方的小胶囊是 Projects、CV、About、Writing；下方的联系按钮与输入框平齐。借鉴层级、圆角、间距、对齐及按钮与输入框组成整体的体验。

**用户特别强调的需求**：除 Option 外，有明确推荐动作时，按钮可以与输入框平齐、横向展开，输入框自然让位；不再适用时收回。视频中的同排按钮是固定联系入口，“按情境动态推荐与展开”是本次需求的延伸，不能当作视频已经展示的事实。

### 参考图 2：对话中的结构化内容与后续入口（约 9 秒）

![对话中的资料卡与后续动作](references/03-conversation.jpg)

对话可以直接承载资料卡、预览和后续动作；动作贴近对应内容，输入框保持稳定。Molis 中对应方案选择、修改对比、文件或成果预览，以及采用、调整、打开和继续操作。

### 参考图 3：动作展开为完成任务所需的小表单（约 15 秒）

![联系操作展开为表单](references/04-inline-form.jpg)

借鉴“点击一个动作，展开完成它所需的界面”，字段、说明、主操作和取消入口在同一处。Molis 优先靠近对话或触发位置呈现，取消后保留必要的上下文与草稿。

沿用 Molis Work 现有设计语言，不照搬个人网站整页布局、人物装饰、信纸皮肤或全屏模糊。静态截图不能替代对展开、收起和状态转场的动态验证。

## 3. 核心体验

以输入框为稳定中心，让自然语言输入、Option 点选、推荐动作、交互卡片和结果形成连续的操作过程。

1. **Option 可直接选择。** AI 给出方向、处理方式或澄清问题时，呈现可操作选项；按任务需要支持单选、多选、差异说明、推荐理由和自由补充。明确区分“选择参数”“回答 AI”“执行动作”，点击含义和提交时机清楚。
2. **推荐按钮与输入框平齐展开。** 有明确下一步时，在输入框旁横向出现，输入框平滑让出空间；无推荐或已失效时收回。同排只突出少量主要动作，其余在 Option 区或更多菜单。具体数量、尺寸和时长由切片验证，不先写死一组任意常量。
3. **回复呈现合适的交互内容。** 支持信息填写、方案选择、对象选择、修改对比、文件预览、执行确认和结果操作，不把一切塞进纯文本或独立弹窗。
4. **点击与输入连续使用。** 选 Option 后可补充“只处理第二段”等要求；卡片和自然语言共同修改同一份待提交输入，定义冲突与覆盖规则，不维护相互矛盾的两套参数。
5. **对象与选区可见。** 用户能看出当前操作针对哪个对象、材料或片段。点击、等待和返回期间不因焦点变化而错误应用到其他对象；原对象变化时明确失效或重新准备。
6. **状态变化连续。** 打磨出现、展开、选中、按压、等待、成功、失败重试和收起；避免抢焦点、布局跳动、读历史时强制滚动，以及输入、悬停或键盘操作时按钮突然换位。
7. **输入与草稿保留。** 取消、关闭卡片或切换界面时保留应保留的填写内容；运行状态刷新不能覆盖用户正在编辑的字段。保存草稿不等于提交答案。
8. **一致的可访问性与响应式。** 支持键盘、中文输入法、浅深色、窄屏和减少动态效果偏好。窄屏空间不足时允许同排动作转到输入框上方；保证输入空间和触达。

必须区分两类交互：“需要回答才能继续”进入等待；“可选的下一步推荐”不阻塞任务。推荐出现不触发执行，预填值不等于用户选择，填写信息不自动等于批准后续修改。

## 4. 覆盖范围与边界

先盘点所有实际入口，在本文补齐适用交互、现有实现、共享情况、适配差距与验证路径。不能只改全局助理后宣称其他插件自动获得相同体验。

| 对象 | 覆盖的交互 |
| --- | --- |
| 全局 AI 助理 | 对话、输入框、Option、动态动作条、问询、确认、结果和工作状态 |
| Coding（核心覆盖对象） | 编码对话、澄清问答、补充要求、执行反馈、审查、变更与报告操作；保留代码、Diff、命令、工具调用、变更集等专业表达 |
| 插件创作台 | 自然语言创作与迭代、方案选择、生成状态、对话与预览衔接 |
| 灵光、Alchemist | 讨论、头脑风暴、方向选择、结果与后续处理 |
| Cognia、Pages 等知识与写作插件 | 检索问答、整理、改写、候选预览、采用与继续调整 |
| Images、PPT、Form、Dataset 等创作与结构化内容插件 | 按实际能力统一参数选择、AI 生成交互、预览和结果操作；不据此新增无关业务 |
| 其他插件 | 凡存在 AI 输入、问答选项、动作确认、生成预览或结果操作，均检查并适配相关部分 |
| 项目讨论 im-ui | 统一适用的输入、消息、引用、草稿和状态反馈；不因本任务凭空新增 AI 业务能力 |

统一可复用组件、语义与交互规则，保留各插件的业务、数据 owner 和专业布局。不将所有插件改成聊天页面，不把普通表单全部纳入重做。

本次不默认将全局助理迁入主工作区，不扩展为全站重设计。面板内部可围绕本任务优化信息层级，但不能擅自移除已有工作详情、专业操作或核心入口。推送、开 PR、发布和替换用户实际安装版仍遵循仓库及用户授权规则。

## 5. 必须补齐的交互能力

| 能力 | 预期行为 |
| --- | --- |
| 补充信息卡 | AI 说明缺什么及为何需要；混合使用实际场景需要的文本、数字、单选、多选、日期／时间及对象或材料引用；支持必填、预填、说明和字段级错误 |
| 方案与决策卡 | 说明候选差异及推荐依据；用户选择或补充自己的答案；纯粹的选择不隐含副作用授权 |
| 对象与材料选择 | 从真实、当前有权限的候选中选取文档、Goal、文件或成果，提交稳定引用；不让用户手输内部 ID，不让模型伪造候选 |
| 预览与确认 | 清楚展示将作用于哪个对象、关键参数及必要的内容差异，按既有权限与执行机制完成操作 |
| 结果与后续操作 | 呈现真实成果、执行状态和可用后续动作；打开、采用、调整、继续等依据当前能力与对象状态决定 |
| 生命周期与恢复 | 处理请求、填写、校验、提交、取消、过期、替换、失败和恢复；重复点击不重复执行，失效回答不进入其他任务 |
| 能力感知 | 模型只使用当前宿主支持的交互类型；不支持时明确降级或拒绝，不能静默丢失字段、约束或改变含义 |

从真实场景推导最小完整合同，不先造任意 UI 生成平台、通用工作流引擎或没有消费者的扩展体系。已注册动作的字段优先从同一能力定义派生，避免模型、插件和 UI 各维护一份不同的 schema。

## 6. 当前实现线索（实施前重新核对）

以下为需求讨论阶段对源码与 Molis 当前依赖包的只读核对，不是新增能力已经实现或运行验收的结论：

- Prologue 有 `ask-user` 系统工具与 Pending 等待实体，支持自由文本、选择问卷、确认等形态；问卷可单选、多选、填“其他”。当前问卷尚不是能自由混合文本、数字、日期、对象引用的通用字段表单。
- Molis 的 `AgentPendingQuestion` 已传递结构化问询，全局助理与 Coding 各自有渲染和回答逻辑。
- Molis 宿主提供 `suggest-action`，能够准备真实能力的操作卡；`AssistantCard` 已支持部分可编辑字段、选项、日期和执行状态。
- 助理 Prompt 已引导模型：需要选择或补值时调用 `ask-user`，建议具体操作时调用 `suggest-action`，不要在正文中模拟按钮。
- 操作确认来自执行策略与真实待审批记录；确认文案不是授权事实来源。
- 对象和材料目前主要经应用的材料、文件、引用选择入口及页面上下文进入，并未统一成所有 Agent 都可发起的通用对象选择交互。
- 各插件接入深度不同；部分普通插件仍通过 `completeText` 或受校验的结构化结果完成单次调用，不能假定所有聊天框都拥有 Agent 的等待与恢复机制。
- Molis 当前声明依赖 `vendor/prologue-sdk/prologue-sdk-0.0.0-rc.1-side-panel-memory.tgz`；Prologue 主检出的能力与此包不能视为完全相同，开发时必须重新核对实际版本。

对每项需求记录“已有可复用 / 接入不完整 / 确需新增”，沿用现有事实 owner。前期未确认的能力不得以猜测写成已支持。

## 7. 技术实现原则：Prompt、Tool、合同、界面

**Prompt 管使用策略，Tool 与结构化合同管交互表达，Runtime／Host 管真实状态与执行，UI 管可信呈现。**

- Prompt：何时询问、给选项、建议动作或继续工作；避免重复询问；指导正确使用工具。它不能代替参数校验、权限或等待状态。
- Tool／schema：声明问题、字段、选项、目标对象与回答结构，由代码校验。
- Prologue／Host：绑定来源、执行与交互版本，处理等待、提交、取消、过期和恢复；履行适用的权限及对象版本检查。
- UI：将结构化记录渲染为可信组件，不从模型正文的“选项 A、选项 B”或“按钮已准备好”中猜测可执行交互，不执行模型生成的 HTML／脚本。

### 7.1 必答交互

需要用户回答才能继续的 Agent 任务，通过系统工具发起，沿用并扩展 `ask-user`／Pending。请求保存后驱动界面，提交经服务端校验后作为工具结果返回原执行。

```text
Prompt 指导 → AI 调用交互工具 → Prologue 校验并建立等待
→ Molis 渲染卡片 → 用户填写／选择 → 校验并结算原等待
→ 答案作为工具结果回到原任务 → 继续处理
```

沿用工具名还是新增通用工具，由 owner 根据合同决定；不为每种视觉卡片都新增工具。区分填表草稿、提交答案、已接收答案和业务已完成。等待用户期间不占用不必要的项目执行队列。

### 7.2 非阻塞建议与真实执行

复用或扩展 `suggest-action` 和统一动作目录。工具创建真实建议并返回引用，AI 可以继续说明，不把所有建议转成必答等待。用户已授权的操作遵循现有授权语义，不为这次 UI 优化添加一轮无必要确认。

同一动作在底栏、对话卡、插件菜单中的状态一致，不另建多份可独立执行的任务。交互草稿修改后的校验、预览和最终执行应对应同一组明确参数。批准不等于执行成功，结果未知不能伪装成功或通过重试偷偷重复副作用。

### 7.3 对象与材料

AI 表达需要的对象类型、范围和数量；Molis 从有权限的真实来源提供候选，用户选择后交回稳定引用。过滤与校验由可信服务执行；选区、对象版本和所属任务在交互期间保持明确。Prologue 承载通用交互语义，不拥有 Molis 的对象目录、权限或选择器 UI。

### 7.4 单次生成插件

允许用受 schema 校验的结构化输出，例如“已完成”或“需要补充信息”，由插件／业务 owner 保存必要交互状态，在用户提交后接续调用。普通 JSON 返回不自动等于持久等待、恢复或 Agent 工具循环；不为视觉统一强制所有插件升级成 Agent。

### 7.5 支持范围和错误

模型仅使用当前宿主可支持的交互类型；描述与 schema 可用于指导模型，强约束由代码执行。合同读写都只认现行取值（`AGENTS.md` 硬约束；读取兼容从第一个装到开发机之外的版本起算，见 `docs/system/CONTRACT-CHANGES.md`）：新增字段一律可选，旧记录本来就是新合同的子集，不写兼容分支。校验失败要保留可修正输入；模型格式错误的处理遵循既有预算与重试规则，不能为了卡片呈现无限重调模型。

## 8. 分层、跨仓和数据所有权

| 层次 | 责任 |
| --- | --- |
| Prologue | 通用、无 UI 的输入请求／回答合同；Session／Run 与等待归属；校验、取消、过期、重复回答、持久化及恢复。扩展现有机制，不另造执行或审批系统 |
| Molis Agent Host／Local Host／Contracts | 完整传递 SDK 能力，接入对象与能力目录，校验业务输入、权限及版本，把答案交回原执行，输出一致的界面合同 |
| 共享交互组件 | Option、表单、预览、确认、结果、同排动作及焦点、草稿、错误、响应式和动效 |
| 业务插件 | 拥有领域字段、候选来源、专业预览、业务校验与结果，通过公开合同接入 |

Prompt 与相关固定指令按现有目录登记，可被用户查看和覆盖；用户修改 Prompt 不改变工具权限、字段约束或批准语义。

模型调用仍只经 `horizontal/agent-host`，同一 Home 只有一个执行进程。插件不直接依赖 SDK 或互相 import 实现。动作从统一目录发现、准备和执行，可信身份来自调用上下文，密钥只传引用。遵循 `scheduling: concurrent`、`beforeEffect()`、取消与版本检查等既有合同。

SDK 源码支持、分发包支持、适配器接入、插件真实可用须分别验证。确需修改 Prologue 时，先在本文明确公共合同、源码基线、实际消费者、依赖顺序、兼容与回滚；必要的 SDK 仓库任务按其规则记录并引用本文，不复制一套产品需求。按现有依赖来源规范打包、更新 Molis 声明与锁文件，再验证真实消费路径。发布与替换正式安装版不包含在默认实施授权中。

## 9. 后续开发规范也是必交付内容

开发 owner 负责同时完成实现、适用入口迁移和长期开发指导。先查已有规范与 Skill，优先补齐权威文档；确需专题规范时确定唯一位置，其他文档引用，不建立重复的合同来源。

| 主题 | 指导必须讲清楚 |
| --- | --- |
| 接入方式选择 | 普通文本、结构化生成、必答问询、非阻塞建议、执行确认的适用场景 |
| 交互合同 | 支持字段、Option、对象引用、预览及结果类型；必填、预填、校验和边界 |
| 职责与路径 | Prologue、Host、共享 UI、插件分别负责什么；公开入口与禁止旁路 |
| 状态与恢复 | 请求、填写、提交、取消、失效、失败、刷新和重启；草稿、正式答案与执行记录的写主人 |
| 能力与权限 | 字段复用动作 schema，绑定对象与选区，区分回答、选择、批准与执行 |
| Prompt 编写 | 正确调用工具、解释推荐、避免重复问询、Prompt 注册和覆盖规则 |
| UI 使用与扩展 | 接入 Option、表单、同排动作、结果卡；保留专业表达而不复制整套交互实现 |
| 兼容与演进 | 历史读取、新写入、未知类型，以及 SDK／Host／插件升级次序 |
| 测试与验收 | 必跑检查、失败与恢复验证、真实模型和浏览器路径、证据适用范围 |

按实际改动同步：

- `skills/molis-prologue-ai/SKILL.md` 与 `docs/platform/PROLOGUE-AI.md`。
- `skills/molis-plugin-dev/SKILL.md`，以及适用的 `generated-ai.md` 等生成插件开发指导，使创作台产出的新插件也能按同一规范接入。
- 受影响包 README 的“开发要求”、公共合同文档与必要的架构说明。
- 设计系统文档和 `/__ui/catalog`，覆盖交互组件关键状态与专业扩展方式。
- Prologue 对应模块合同、公开 API 文档与 SDK 使用示例。
- SDK 有变化时更新 `vendor/prologue-sdk/README.md` 等真实依赖来源说明。

至少提供沿用生产路径的三类可运行示例：**Agent 请求补充信息后继续、非阻塞动作建议、单次生成插件的结构化接续**。展示调用、呈现、提交及相关错误处理，不能仅有静态卡片或测试专用成功分支。

规范验收标准：后续开发者依据文档与示例即可接入已有交互类型，不必修改宿主的插件名单、不复制另一个等待／执行状态机。新增通用交互类型也有明确落点、兼容规则和验证方式。通过实际接入或代表性迁移验证，而非仅声明文档已写。

## 10. 代码与资料入口

本机仓库：Molis Work `/Users/yijunwang/code/goalboard`；Prologue `/Users/yijunwang/code/prologue`。隔离工作树中的仓库路径以实际检出为准。先读两仓适用 `AGENTS.md` 和受影响包 README。以下 Molis 链接使用仓库内相对路径，便于工作树和代码审阅。

### 规范

- [产品](../../PRODUCT.md)、[设计](../../DESIGN.md)、[事实 owner 与成熟度](../../docs/SSOT-MATRIX.md)。
- [架构](../../docs/system/ARCHITECTURE.md)、[包边界](../../docs/system/PACKAGE-BOUNDARIES.md)。
- [动作架构](../action-architecture/spec.md)、[插件平台](../plugin-platform-v2/spec.md)、[Coding 规格](../coding-plugin/spec.md)。
- [界面规范](../craft-finish/spec.md)、[工艺底线](../ui-craft-floor/spec.md)。
- [AI 开发 Skill](../../skills/molis-prologue-ai/SKILL.md)、[AI 接入手册](../../docs/platform/PROLOGUE-AI.md)、[插件开发 Skill](../../skills/molis-plugin-dev/SKILL.md)。
- [SDK 来源](../../vendor/prologue-sdk/README.md)。
- [原动态交互 spec](../archive/contextual-interaction/spec.md)只作历史约束线索，以当前实现和本文新需求为准。

### Molis 关键实现

- [助理布局](../../apps/workbench/src/assistant-dock.ts)、[助理交互](../../apps/workbench/src/scripts/client/assistant-island.ts)、[动态动作条](../../apps/workbench/src/scripts/client/context-actions.ts)。
- [助理合同](../../packages/contracts/src/services/assistant.ts)、[Agent 合同](../../packages/contracts/src/services/agent-host.ts)、[情境合同](../../packages/contracts/src/services/contextual.ts)。
- [助理 Prompt](../../apps/local-host/src/assistant/assistant-agent.ts)、[助理服务](../../apps/local-host/src/assistant/assistant-service.ts)、[能力工具网关](../../horizontal/agent-host/src/adapters/prologue-action-gateway.ts)。
- [Agent Host 适配器](../../horizontal/agent-host/src/adapters)、[Host 情境服务](../../apps/local-host/src/contextual)。
- [设计系统](../../packages/design-system/src)、[项目讨论 UI](../../packages/im-ui/src)。
- [Coding](../../plugins/native/coding/src)、[插件创作台](../../plugins/native/plugin-builder/src)、[灵光](../../plugins/native/lingguang/src)、[Alchemist](../../plugins/native/alchemist/src)、[Cognia](../../plugins/native/cognia/src)、[Pages](../../plugins/native/pages/src)。其余按插件清单继续核对。

### Prologue 仓库内入口

- `packages/sdk/src/tool/core/system.ts`：系统工具描述与参数。
- `packages/sdk/src/effect-policy/core/pending-state.ts`：交互等待与回答合同。
- `packages/sdk/src/composition/core/system-tools-agent.ts`：当前主检出中的 Agent 问询实现；不同包版本可能有不同组织方式。
- `packages/sdk/src/mcp/core/elicit.ts`：外部 MCP 请求人类输入的适配，只有涉及该链路时才扩展。
- `packages/sdk/test/questionnaire.test.ts` 及相关等待、审批、恢复测试。
- 模块 README、`docs/product/requirements.md` 与 `docs/product/architecture.md` 的相关部分。

## 11. 实施顺序

1. 检查分支、工作树、未提交改动、其他会话工作和实际运行服务；保护已有成果，必要时隔离工作树。不要在承载真实 Home 的主检出里直接做大规模代码修改。
2. 核对实际 SDK 包、入口与数据／状态 owner，补齐本文的范围矩阵、能力缺口、合同与验证命令。足以确定设计后停止无关扩搜。
3. 以全局助理和 Coding 制作首批高保真可交互切片，包含真实或逼真内容、普通输入、Option、混合字段、同排推荐、预览、成功／失败和恢复；模拟部分明确标注，尽早提供可操作结果。
4. 按真实依赖推进必要的 Prologue 合同与实现 → Molis 适配与共享交互 → 插件接入。切片与合同可迭代，但不要让视觉模拟成为实际状态的第二来源。
5. 继续覆盖全部适用入口，保留专业行为。同步公共文档、Skill、组件规格板和可运行示例。
6. 对照验收，记录通过、失败、未运行与原因；实际 diff 检查无无关重构、依赖和旁路，完成后按 `specs/README.md` 归档。

常规可逆选择由 owner 判断，已有开发授权不因阶段切换而重复索取。需要改变整体产品布局、核心契约或授权范围的决定，先说明具体差异和影响；仅暂停依赖该决定的部分，不停下其余独立工作。无需为了本任务建立额外编排平台或进度系统。

## 12. 验收与验证

以下是范围内的业务约束，不以固定测试数量或源码字符串检查代替。

- **AC-01 范围**：各插件入口盘点完整，适用、不适用及实际接入状态有依据；首批切片不冒充全量完成。
- **AC-02 输入体验**：Option、同排推荐与自然语言共同可用，布局连续，不抢焦点、不覆盖正在输入的内容。
- **AC-03 交互语义**：选参数、答问题、采纳方案、批准及执行清楚分开；推荐不自动执行，不产生多余审批。
- **AC-04 补充信息**：AI 从真实调用链发起混合字段请求；错误逐字段反馈，修正提交后回到原任务继续。
- **AC-05 对象与材料**：候选真实且授权正确，提交稳定引用；切换对象、选区、会话、项目及对象版本变化均不串线。
- **AC-06 预览与结果**：预览对应真实待执行参数；执行状态和结果依据真实回执，多入口状态一致，结果可打开或继续处理。
- **AC-07 失败恢复**：取消保留适用草稿；过期／被替换问题不能误提交；重复点击不重复副作用；刷新／重启能解释并恢复既有状态。结果未知按既有规则核对，不自动重放。
- **AC-08 并发与输入**：状态更新不覆盖字段草稿；两个入口回答同一问题或执行同一卡片时只按既有一致性规则生效；通过真实交错验证，不只顺序调用。
- **AC-09 专业插件**：Coding 的 Diff／命令审查／报告及其他插件原有主链路保持可用，非 Agent 插件的结构化接续真实工作。
- **AC-10 UI**：桌面与窄屏、浅深色、键盘、中文输入法、减少动态效果可用，长内容与后台更新不破坏阅读位置。
- **AC-11 SDK 消费**：如修改 Prologue，验证源码、实际包、Molis 适配器和产品实操整条链路；历史数据与原等待／审批语义兼容。
- **AC-12 长期接入**：文档、Skill、公开合同、规格板和三个代表性示例与实现一致；新增已有类型的插件接入不需宿主名单或复制状态机。

遵守当前仓库和包 README 必跑要求。Molis 按需执行 `pnpm build`、`pnpm boundary:check`、`pnpm health:check`、适用类型检查及 `node scripts/run-tests.mjs <相关测试文件…>`；改源码、脚本或 package 后，全量前先整体构建，全量期间不改源码／脚本／package／skills，不并发构建。SDK 侧按其当前开发规则执行对应检查、打包与真实 Host 验证。

定向回归从现有 `assistant-*`、`contextual-*`、Coding、插件和 IM 用例按影响面选择；修改 Agent Host 时遵守 AI Skill 对 `agent-*`／`prologue-*` 的要求。验证输入、返回、持久化、外部副作用与后续行为，覆盖相关撤权、取消和版本失效；基线问题按仓库要求对比，不为全绿放宽断言。

使用配置允许的真实模型与浏览器跑通代表路径；没有模型／环境时明确缺口，不把替身证据宣称真实模型可用。截图证明视觉，真实操作证明路径，持久化与回执证明状态，三者按目标组合。

## 13. 最终交付

交付可体验的实际功能、适用插件覆盖结果、公共合同与必要的 SDK 消费更新、长期开发指导及可运行示例。本文补充关键决策、验收证据和真实剩余项，不能仅以“组件做好”“工具返回成功”“SDK 已支持”或“文档写完”宣称完成。

分别报告：工程通过、真实产品实操通过、用户本人验收状态。部署、发布及安装包等级未验证时不宣称可发布。

## 14. 现状核对（开发 owner，2026-10-09）

### 14.1 现场

- **Molis**：依据 origin/main `11878059`。主检出的本地 main `d81b12cb` 落后 394 个提交，还带着别的会话未提交的改动（goal-closure-identity），不作依据、不在里面改。开发在工作树 `.claude/worktrees/ai-interaction`，分支 `feat/ai-interaction-experience`（从 origin/main 开）。
- **Prologue**：主线 `4f7110fe`。Molis 现用包来自 `9fc3b173`（主线祖先）；两者之间 `ask-user`、等待账本（Pending）的行为没有差别。在途包来源是 `feat/molis-adoption`（`c4b9fde3`，主线加 1 个提交，工作树 `~/code/prologue-molis-adoption`），`feat/desktop-computer-use` 叠在它上面。
- **相关的在途工作**（都还没合入 main）：

| 工作 | 状态 | 与本文的交点 |
| --- | --- | --- |
| `feat/prologue-adoption`（Molis）+ `feat/molis-adoption`（Prologue） | 执行中，未推送 | 换成 Prologue 主线包；改 `prologue-node.ts`、`prologue-stream.ts`、`AgentRunView`；占用 `vendor/prologue-sdk/` 唯一的在途包名额 |
| `specs/ai-input-receipts`（另一会话） | 方案定（D1–D9），Molis 代码等 prologue-adoption 合入 | 它拥有「输入」生命周期与合同（它的 §6.2，新子路径 `services/agent-inputs`）；点选、表单提交、回答在它那里都是输入。它的 §13.2 把 Option、推荐动作、交互卡片、混合字段、对象选择分给本文 |
| `feature/context-toolbar`（PR #180，只有文档） | 设计已定（2026-10-02），未开工 | 用户已定「底部动作条整个取消、不留兜底」，动作搬到对象旁的情境浮条；助理输入框上方只留「手上 + 落点」情境条。和本文 §3 第 2 条直接相交，见 §16 D1 |
| `feat/computer-use` | 执行中 | 叠在 prologue-adoption 上；改助理的工作区与 agent-host 装配 |
| 防腐整理 W4-05 / W5-10 | 未开工 | W5-10 要把助理的「操作卡与撤销」拆成协作者；本文的操作卡记录按那个形状拆（§15.4） |
| PR #340 goal-closure-identity | 待合 | 不交叉 |

- **门禁对本文的约束**：`assistant-island.ts`（2812 行）、`services/agent-host.ts`（1734 行）、`craft-finish.ts`、`assistant-service.ts` 都是冻结的巨大单元，只许变小；`/assets/` 字节只许变小（新界面要在同一个 PR 里删掉被替换的渲染）；合同改动刷新 `tooling/gates/api/` 快照并写影响；新中文文案要有英文。

### 14.2 能力现状

「已有」= 可以直接复用；「不完整」= 有但缺一块；「新增」= 确实没有。

| 需求（§3、§5） | 判定 | 依据 |
| --- | --- | --- |
| 必答问询的等待、冻结、过期、取消、重启恢复 | 已有 | Prologue `effect-policy/core/pending-state.ts`、`pending.ts`（`open / answer / cancel / read / whenSettled / restore`）；Molis `answerPending`（`prologue-node.ts`）三层拒绝过期与重复回答 |
| 问询的题型 | 不完整 | `ask-user` 只有自由文本与问卷；问卷每题只有冻结的纯文字选项、单选或多选、可选「其他」（`tool/core/system.ts` 的 `ask-user`）。没有数字、日期、对象引用、必填、预填、选项说明与推荐理由；选项写成 `{label, description}` 时说明被丢掉（`system-tools-agent.ts` 的 `parseAskUserQuestions`） |
| 按字段报错 | 新增 | SDK 校验失败是整笔错误；助理把卡片执行失败显示成全局横幅（`assistant-service.ts` 的 `runCard`、`assistant-island.ts` 的 `showProblem`） |
| 宿主能力感知 | 新增 | SDK 没有「这个 App 能渲染哪些题型」的配置；`ask-user` 的 schema 对所有 App 一样 |
| 等待期限 | 不完整 | SDK 默认 `inputWaitTtlMs` 10 分钟，Molis 没配：人填表离开 10 分钟，题就过期 |
| 非阻塞建议（操作卡） | 已有，只在助理 | `suggest-action` → `assistant_cards`（助理库）→ `AssistantCard`；字段只有文本、下拉、日期、日期时间；CAS 防重复执行；对象改动后 `stale` |
| 操作卡跨入口 | 不完整 | 卡只在助理对话里渲染；Coding 的 Run 没有 `suggest-action` 的落点；卡片记录由 `AssistantService` 独占 |
| 同排推荐 | 新增 | 现有情境动作条浮在输入框上方，助理面板打开时隐藏，和 AI 的卡、问题没有关联（`craft-finish.ts` 的 `[data-assistant-context-actions]`） |
| AI 发起的对象选择 | 新增 | 模型不能请人挑对象；对象只经「+」菜单、「@」搜索、页面上下文进入（`assistant-island.ts`、`readReferences`） |
| 预览与确认 | 不完整 | 只有副作用审批（`AssistantPendingReview`，不能改参数）与卡片上的影响标记；没有按待执行参数的预览 |
| 结果与后续操作 | 不完整 | 卡片结果只有一行文字；一轮之后的「接下来」只能打开结果或重试 |
| 草稿 | 不完整 | 助理：问询卡任何字段变化都整卡重绘、清掉正在填的；卡片字段在状态或版本变化时丢失；打开助理、起始语、带入、重试会覆盖输入框。Coding：问询卡有本地与服务端草稿（`plugins/native/coding/src/client.ts` 的 `renderQuestions`） |
| 两份问询卡实现 | 重复 | 助理 `assistant-island.ts` 的 `renderQuestion` 与 Coding `ui.ts` + `client.ts` 各一份，行为不同（Coding 有逐题检查与草稿，助理没有） |
| Prompt 指导 | 已有，要补 | `assistant-base` v24 已要求用 `ask-user` 给具体选项、用 `suggest-action` 给卡、不在正文模拟按钮；运行时护栏 `announce-guard.ts` 拦「说有按钮却没有」。缺：字段题、推荐理由、对象选择、避免重复问 |
| 单次生成插件的接续 | 新增 | Cognia、Pages、Form、Dataset、PPT、灵光、Todo、Workflows 用 `completeText`，一问一答；没有「需要补充信息」的结构化结果与接续约定 |

### 14.3 入口盘点（首轮）

首轮按调用方式与界面分组；逐个插件的证据在实施时补进本表，结论以本表最终版为准（AC-01）。

| 对象 | 调模型的方式 | 本文适用部分 | 首轮判断 |
| --- | --- | --- | --- |
| 全局助理 | Agent（`assistant-agent.ts`） | 全部 | 首批切片 |
| Coding | Agent（`routes.ts` 发起 Run） | 问询、补充、同排推荐、结果后续、专业卡片的外壳 | 首批切片；Diff、命令审查、报告、计划确认保留现有专业呈现 |
| 插件创作台 | Agent（宿主 `apps/local-host/src/plugin-builder/`） | 方案选择、问询、生成状态、预览衔接 | 第二批；动它的提示词要跑 `pnpm studio:replay` |
| 灵光 | `completeText`（prologue-adoption 正在改成流式） | 讨论中的方向选择、结果后续 | 第二批，等 prologue-adoption |
| Alchemist | 自有讨论流（`client-flows.ts`） | 方向选择、结果后续 | 第二批，先核对调用路径 |
| Cognia、Pages | `completeText` | 候选预览、采用、继续调整；单次接续 | 第二批；Pages 选区动作与 context-toolbar 交叉，只做对话与结果部分 |
| Form、Dataset、PPT | `completeText`（经 `beforeDispatch`） | 生成前补充信息（单次接续）、预览、结果 | 第二批；Form 作单次接续的示例 |
| Images | 自有图片服务调用 | 参数选择、预览、结果操作 | 第二批，先核对是否经模型 |
| Todo、Workflows | `completeText`；Todo 角色里用 `ask-user` | 整理候选的选择、结果 | 第二批 |
| 项目讨论 im-ui | 不调模型 | 输入、引用、草稿、状态反馈的统一部分 | 只核对一致性，不新增 AI 能力 |
| 其余（Goals、Inbox、Feed、Files、Shelf、Schedule、Characters…） | 无直接模型调用，或只经助理 | 无 | 实施中逐个确认后标 N/A |

## 15. 技术方案

### 15.1 一套记录，多处呈现

三条路，各有唯一的写主人；界面只渲染记录，不从模型正文猜交互。

```text
必答：模型调 ask-user（带类型的题）→ Prologue 建等待并冻住题目
      → agent-host 投影成 AgentPendingQuestion → 宿主 / 插件给出视图
      → 共享问询组件填写（草稿归 Molis）→ 提交 → 宿主校验对象引用
      → Prologue 按冻住的题校验并结算 → 答案作为工具结果回到原 Run

建议：模型调 suggest-action → 宿主的操作卡记录（唯一写主人）
      → 对话里的卡 / 同排按钮 / 插件菜单都读这一条记录
      → 执行经统一动作服务 invoke → 回执写回同一条记录

单次：插件调 completeText（结构化）→ { 完成 | 需要补充：题目 }
      → 插件保存交互状态 → 同一个问询组件 → 插件带着答案接续调用
```

### 15.2 Prologue：`ask-user` 的带类型题目

**落点**：`effect-policy`（等待的题型、答案校验）、`tool`（`ask-user` 的参数）、`composition`（解析、配置）。不新建模块、不新建等待种类、不新增工具：带类型的题仍是 `questionnaire` 这一个等待形态里的题（`pending.md`「一组题仍是同一个等待实体」）。开工前在 Prologue 写短合同 `docs/slices/ask-user-fields.md`，并更新 `kernel/effect-policy/pending.md`、`modules/tool/system.md` 与执行队列。

**题目**（全部新增字段可选；不写 `type` 的题就是现在的选择题，旧调用不变）：

| 字段 | 含义 |
| --- | --- |
| `id` | 题的稳定名字，模型拿它对答案（如 `deadline`）；同一组内唯一 |
| `type` | `choice`（默认）、`text`、`number`、`date`、`datetime`、`reference` |
| `required` | 默认 `true`；`false` 的题可以答「空」 |
| `help` | 这一题的说明 |
| `options[].description`、`options[].recommended` | 选项差异与推荐；推荐理由写在 `description` |
| `default` | 预填值，只是起点；**答案只取人提交的**，结果里不出现「默认被采用」 |
| `text`：`multiline`、`maxLength` | 有上界（硬上限 2000） |
| `number`：`min`、`max`、`integer` | |
| `date` / `datetime`：`min`、`max` | ISO 8601；`datetime` 带时区偏移 |
| `reference`：`refKinds`、`multiple`、`maxCount` | 只声明要哪类对象；候选由 App 提供，模型不给候选、不给预填 |

**答案**：选择题照旧 `{question, indexes, other?}`；其他题 `{question, value}`（文本与日期是字符串，数字是数，引用是 `[{kind, id, label}]`），选填题可给 `value: null`。仍是「每题恰好答一次」。SDK 逐题校验类型、必填、范围、格式、引用的种类与个数；失败时零变化，错误带 `question`（编号与 `id`）和机器原因，App 据此标到字段上。

**对象引用的信任**：对象的目录与权限归 App。SDK 只校验引用的形状、种类在 `refKinds` 里、个数在界内；「这个对象存在、这个人有权限」由 App 在调用 `pendings.answer` 之前校验（Host 最终强制，和副作用链同一个原则）。

**能力感知（App 配置）**：`config.tool.askUser.questionTypes`，默认 `["choice"]`（现在的行为）。只有列出的题型出现在给模型的 `ask-user` schema 里；模型用了没列出的题型，工具当场失败并说明能用哪几种（`TOOL_ARGUMENTS_INVALID`），不静默丢字段。

**按 Prologue §3.7 分四层**：硬边界——冻结题目、答案只取人提交的、引用不由模型给候选、上界；可替换——无；App 配置——题型清单、等待期限（已有的 `inputWaitTtlMs`）；终端用户——怎么填、选哪个对象，归 App 界面。

**不做**：MCP 征求（`mcp/core/elicit.ts`）这次不扩；不加「拒绝回答」这种新答案——人选「不回答」时 App 调已有的 `pendings.cancel`，工具结果是「问题被取消」，模型据此继续。

**验证**：`questionnaire.test.ts` 与等待恢复用例扩展；一条经公开入口的真实 Node Host 用例（真实落盘与重启后作答）；`pnpm pack` 后干净安装的消费者用例。

**打包**：按 `docs/system/PARALLEL-DEVELOPMENT.md` §11，两条线要不同的 SDK 改动时合成一个包。本文的 Prologue 分支 `feat/ask-user-fields` 从 `feat/molis-adoption` 开，打出的包替换 prologue-adoption 的在途包（不另占一份）；或者等 prologue-adoption 进 Prologue 主线后从主线开（§16 D2）。

### 15.3 Molis 合同

- **新子路径 `@molis-ai/molis-work-contracts/services/agent-interaction`**：带类型的题与答案（`AgentQuestion`、`AgentQuestionAnswer`）、字段种类（与操作卡共用一套：文本、长文本、数字、单选、多选、日期、日期时间、对象引用、是否）、同排推荐的视图类型（`InteractionNextStep`：来源记录的引用、标签、强调、状态）、单次插件的「需要补充」结果（`InteractionRequest`）。`AgentPendingQuestion` 从 `services/agent-host.ts` 搬到这里（那个文件是冻结的巨大单元，只能变小）。
- **答案提交**：`AgentRunControl {kind:"answer"}` 的 `answers[]` 加 `value`；错误码 `agent.answer_invalid` 带 `question` 与原因。
- **操作卡字段**：`AssistantCardField` 的种类从 `date|datetime` 扩到同一套字段种类；字段仍从动作的 input schema 派生（`actionFieldInput`、`actionFieldOptions` 扩展），不另写一份 schema。
- **和 ai-input-receipts 的关系**：回答、点选、表单提交在那份合同里是输入（它的 §3）；本文的合同只描述交互本身。提交时带的 `request_id` 用它定义的同一个键，不另起编号。

### 15.4 宿主

- **agent-host**：投影带类型的题；回答经同一个 `answerPending`；SDK 的逐题错误映射成 `agent.answer_invalid`；配置 `inputWaitTtlMs`（§16 D5）与 `questionTypes`。
- **对象候选**：注册一个只读动作（`interaction.references.search`），按种类、范围从现有搜索与对象主人读出当前有权限的候选；提交时宿主经对象主人逐个再读一遍（与 `readReferences` 同一做法），通过后才交给 SDK。
- **草稿**：未提交的填写归 Molis，按 `(run, pending_id, revision)` 存在问题的主人那里（助理存它的库；Coding 沿用现有草稿）。状态刷新只合并「没被人改过」的字段，不覆盖正在填的。
- **操作卡记录**：从 `AssistantService` 拆出操作卡协作者（W5-10 的形状），按 Run 的主人（助理工作、Coding 会话…）记录；Coding 的 Run 接上 `suggest-action` 后用同一个协作者。对话里的卡、同排按钮、插件菜单读同一条记录、走同一个 `runCard`。
- **Prompt**：助理 `assistant-base` 升版，Coding 的系统提示同步：什么时候用带类型的题、怎样写推荐理由、不重复问已答过的、需要对象时用 `reference` 题而不是让人输入名字或 ID。用户改提示词不改变工具的题型、约束与授权。

### 15.5 共享界面

放在 `packages/design-system`（插件与工作台都能用；新文件各在 800 行以内；规格板 `/__ui/catalog` 加样张）：

| 组件 | 用途 | 关键状态 |
| --- | --- | --- |
| 问询卡 | 必答问题与补充信息：混合字段、必填标记、逐字段错误、推荐与理由、「其他」、提交与「不回答」 | 待答、提交中、已交回原任务、已过期、已被替换、不可回答、校验失败 |
| Option 组 | 单选、多选、说明、推荐标记；只是选参数，提交时机由所在卡片决定 | 未选、选中、禁用 |
| 同排推荐 | 输入框旁的 1–2 个主要动作，其余进「更多」；输入框让出空间；窄屏移到输入框上方 | 出现、按下、执行中、完成、失败重试、收回 |
| 操作卡 | 现有 `AssistantCard` 的解剖迁过来：对象、关键参数、可改字段、预览、影响标记、结果与后续 | ready、needs-input、running、done、failed、unknown、stale、dismissed |
| 结果条 | 真实成果与后续动作（打开、采用、调整、继续） | |

浏览器端的共同行为（草稿合并、焦点、中文输入法、键盘、减少动态）写成一份共享的客户端模块，工作台与插件客户端各自装载；具体装载方式实施时按现有插件客户端的做法核对。替换掉的助理与 Coding 旧渲染在同一个 PR 里删掉，保证 `/assets/` 字节不涨。

### 15.6 同排推荐的来源与边界

同排按钮只是视图，来源是三种已有记录之一：本轮的操作卡（主按钮）、本轮的单选问询（选项）、插件按 Run 状态派生的专业后续（如 Coding 的「查看变更」「核对并继续」）。它不执行任何东西，点了就是对那条记录做它本来的操作；记录失效时按钮收回。和页面选区的情境动作的分界见 §16 D1。

### 15.7 单次生成插件的结构化接续

插件把结构化输出定成 `{status: "done", …} | {status: "needs_input", questions}`，用同一套题型校验（纯函数，放在 `packages/kernel`）；`needs_input` 时插件保存交互状态（问了什么、对应哪个对象和版本），用同一个问询组件呈现，人提交后插件带着答案再调一次。它不是持久等待，也不进 Agent 的工具循环；对象版本变了就作废重问。

### 15.8 三个示例（沿用生产路径）

1. **Agent 补充信息后继续**：全局助理「帮我约一个下周的复盘会」→ `ask-user` 带日期时间、时长（数字）、关联 Goal（对象引用）→ 填写，故意填错一个字段看逐字段报错 → 提交 → 原 Run 继续建日程。
2. **非阻塞建议**：助理回复后 `suggest-action` 给出「改到周五」→ 对话里的卡与输入框旁的同排按钮是同一条记录；在任一处执行，另一处同步。
3. **单次生成的结构化接续**：Form「AI 生成表单」缺受众与题量时返回 `needs_input` → 填写 → 接续生成。

三者写进 `skills/molis-prologue-ai/SKILL.md`、`docs/platform/PROLOGUE-AI.md` 与 `skills/molis-plugin-dev/SKILL.md`（含 `generated-ai.md`），并有对应用例。

## 16. 决策记录

2026-10-09 用户对 D1–D4 选了「推荐」一列；D5、D6 未另提意见，按推荐执行，随时可改。

| # | 事项 | 结论（推荐） | 影响 |
| --- | --- | --- | --- |
| D1 | 同排推荐与 context-toolbar「底部动作条整个取消」的关系 | 两者不冲突：同排按钮只放**对话的下一步**（§15.6 的三种来源），在助理与 Coding 的输入框旁；页面选区的动作按 context-toolbar 走浮条，不回到输入框旁。本文不改、不依赖现有底部动作条 | 若改成「输入框旁也放页面动作」，要改 10-02 的决定 |
| D2 | SDK 改动的依赖顺序 | Prologue 分支从 `feat/molis-adoption` 开，合成一个在途包；Molis 不依赖 SDK 的部分（合同、共享组件、宿主操作卡、切片界面）现在从 origin/main 做；接新包的那一刀等 prologue-adoption 合入 Molis main 后再合（与 ai-input-receipts D7 一致） | 端到端的带类型题要等 prologue-adoption 合入后才进 main；在那之前在集成分支上验证 |
| D3 | Prologue 合同形状 | 扩展现有问卷的题型（§15.2），一个工具、一个等待种类，App 声明能渲染的题型 | 另一种是新增 `form` 等待种类和新工具，多一套校验与恢复路径 |
| D4 | Prologue 本机提交 | 允许在 `feat/ask-user-fields` 上本机提交（不推送、不合并） | Prologue `AGENTS.md` §8 要求明确授权 |
| D5 | 问询等待期限 | 24 小时（人离开再回来仍能交）；过期后显示「已过期」并保留草稿，可请 AI 重新问 | 现在是 10 分钟 |
| D6 | 操作卡记录的主人 | 从助理服务拆出协作者，按 Run 主人记录，Coding 共用（W5-10 的形状） | 与防腐 W5-10 同一块；先通知做防腐的会话 |

## 17. 分期与 PR 序列

| 段 | 内容 | 依赖 |
| --- | --- | --- |
| P0 | 本文方案与对齐；`specs/README.md` 登记 | — |
| P1 | Prologue：短合同 → 实现 → 测试 → 打包（`feat/ask-user-fields`） | D2、D3、D4 |
| P2 | Molis 合同子路径与字段派生；共享组件与规格板样张 | D3 |
| P3 | 首批切片：全局助理与 Coding，用真实 Run 与现有问卷路径；带类型题在集成分支上接新包 | P1、P2 |
| P4 | 宿主操作卡协作者、Coding 接 `suggest-action`、同排推荐 | D1、D6 |
| P5 | 第二批入口（§14.3）逐个接入并补证据 | P2–P4 |
| P6 | Skill、手册、包 README、规格板、三个示例 | 随各段同步 |
| P7 | 验收：工程（构建、门禁、相关用例、全量一次）、真实模型与浏览器实操、截图；归档 | 全部 |

每段按 `docs/system/PARALLEL-DEVELOPMENT.md` 拆 PR：合同与扩展点先合，实现后合；门禁改动不混进功能 PR。

## 18. 进度

- 2026-10-09：建工作树与分支；核对 Molis（助理、Coding、插件入口、设计与门禁约束）与 Prologue（`ask-user`、等待账本、MCP 征求）现状，结果见 §14；方案见 §15；待决见 §16。
