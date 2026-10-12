# Molis Work 跨插件 AI 交互能力与体验统一：完整开发 Prompt

> 远端接续请先读文末「远端交接」；历史路径、授权及未提交状态以该节为准。

状态：执行中（2026-10-12；I0 预览已按实物重做并经开发者走查，待用户看实物；共享部件已进设计系统与组件板，I0 预览改用它们；产品采用、Molis 合同、宿主与真实 SDK 接入未开始）。§1–§13 是用户讨论定下的需求（2026-10-05 整理）；§14 起是开发 owner 核对现状后补齐的方案、决定与进度，§16 的决定已与用户对齐（2026-10-09）。本文是这项任务唯一的需求书与进度记录。2026-10-11 起唯一可编辑副本在 `feature/ai-interaction-i0` 的本路径；原分支 `feat/ai-interaction-experience@8d0d7dd84` 保留为来源，不并行编辑。

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

**答案**：选择题照旧 `{question, indexes, other?}`；其他题 `{question, value}`（文本与日期是字符串，数字是数，引用是 `[{kind, id, label}]`），选填题可给 `value: null`。仍是「每题恰好答一次」。SDK 逐题校验类型、必填、范围、格式、引用的种类与个数。实际公开函数 `validateQuestionnaireAnswer(questions, answers)` 返回全部字段问题（`question`、可选 `id`、机器原因与消息），App 据此标到字段上；最终 `pendings.answer` 用同一校验，失败零变化，错误码沿用 `PENDING_KIND_MISMATCH`（消息为第一条问题）。

**对象引用的信任**：对象的目录与权限归 App。SDK 只校验引用的形状、种类在 `refKinds` 里、个数在界内；「这个对象存在、这个人有权限」由 App 在调用 `pendings.answer` 之前校验（Host 最终强制，和副作用链同一个原则）。

**能力感知（App 配置）**：`config.tool.askUserQuestionTypes`，默认 `["choice"]`（现在的行为）。只有列出的题型出现在给模型的 `ask-user` schema 里；模型用了没列出的题型，工具当场失败并说明能用哪几种（`TOOL_ARGUMENTS_INVALID`），不静默丢字段。

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

**展示参数与外部合同的对应（2026-10-12 定稿，实现见 §19.2）**：设计系统不引用 SDK、Molis 合同或回执合同；消费方写一个纯函数，把自己的记录转成 `Interaction*View`。对应关系固定如下，接入时不改组件：

| 来源（消费方的记录） | 展示参数 |
| --- | --- |
| SDK `PendingQuestion`：`id`、`prompt`、`type`、`required`、`help` | `InteractionField`：`id`、`label`、`control.kind`、`optional`（`required: false`）、`hint` |
| 选择题：`options[].description`、`recommended`、`multiple`、`allowOther`；`default` | `choice` 控件：选项说明与「推荐」标记、多选、`other` 自由填写栏；`default` 只让 `selected` 预选，答案仍取人提交的 |
| 文本、数字、日期、日期时间题：`multiline`、`maxLength`、`min`、`max`、`integer` | `text`、`number`（含 `min`、`max`、`integer` 钩子）、`date`、`datetime` 控件；日期与时间的上下界由消费方校验并出错 |
| 对象引用题：`refKinds`、`maxCount` | `reference` 控件：候选只是消费方按种类过滤、有权限读到的真实对象；模型不给候选 |
| `QuestionnaireProblem`（闭集 `reason`，如 `required`、`too-large`、`bad-date`、`kind-not-allowed`） | 对应字段的 `error` 文字；消费方做 `reason → 本地化文案` 的表，不解析 `message`；其他字段不动，错的草稿原样留着 |
| 输入回执线：`request_id`、`key`、pending 的 `about`、调用编号 | 卡片的 `about`（「针对你说的…」，用人的话）与折叠的 `evidence`（「依据」，一组 `[名, 值]` 行，等宽字体，可复制查对）；设计系统只显示，不解释 |
| 对象版本失效 | 卡片的 `target`（对象名 + 版本标记，版本变了 `changed` 琥珀色）与问卷/操作卡的横幅或状态行；失效后旧参数不可执行，按钮改成「按新版本重新准备」，由消费方给文字 |
| 过期、被替换、取消、失败、结果未知 | `badge` 的 `tone`（waiting/progress/done/failed/quiet）、`banner`、`status`、`recovery` 操作；这些词都由消费方给 |

这个转换现在还没有写进产品：它是接入阶段的一个纯函数加一份 `reason` 文案表，`tests/interaction-sdk-mapping.test.ts` 用同一形状的样例证明它能把一组带类型的题和三种字段错误直接转成卡片，且种类之外的候选不会进卡片。

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
| D7 | 问卷卡展示参数与 SDK、回执的对应（2026-10-12，本线自定） | 设计系统只收展示参数；消费方写纯函数转换，`reason → 文案` 由消费方做；回执与对象版本只给展示位（`about`、折叠的「依据」、版本标记），只显示不解释（§15.5 表） | 接入时不改组件 |
| D8 | Agent 能渲染哪些题型由谁声明（2026-10-12，本线自定） | Agent 定义声明 `question_types`，宿主照着给 Run 配 `askUserQuestionTypes`；不在宿主写插件名单（`AGENTS.md` 硬约束），缺省只有选择题 | 只有界面支持带类型题的 Agent（助理、Coding）才会被模型问到这些题 |
| D9 | 助理问题卡的渲染位置（2026-10-12，本线自定） | 宿主用设计系统渲染函数把卡片渲染成 HTML 放进视图（同 Coding 的 `question.html`），助理岛只接行为 | 岛是字符串脚本，不能在浏览器里调设计系统的渲染函数；这样只有一份渲染，岛的字节变小 |
| D10 | 回答的身份与 R4 | 待统筹定（§17.1「跨线待定」） | 影响 C1、A1 与回执线 1e |

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

**P2 的落点（2026-10-12 核对，实施前再看一次）**：

- 组件板 `/__ui/catalog` 只加载 `/assets/molis-work-settings.css`。新增区块用 `catalog.ts` 的 `section()`，左栏索引会自动生成。
- 往 `PRIMITIVE_STYLES` 加 1 字节，冻结预算里大约多 6 字节：三张样式表各计两次。往 `CRAFT_FINISH_STYLES` 加 1 字节约多 3 字节。所以交互组件的样式做成单独导出的样式串，照 `PLUGIN_COMPONENT_STYLES` 的先例：组件板上内联，不计入预算；等产品页面真正采用时才进冻结的样式表，而且要在同一个 PR 里删掉被替换的助理与 Coding 旧样式抵掉字节。
- 浏览器端共享行为（草稿合并、焦点、组合输入、键盘、日历）写成不依赖运行时 import 的函数。插件端用 `fn.toString()` 拼进客户端工厂，先例是 `plugin-component-client.ts`。注意 Coding 客户端的字节在 5 个插件包里各算一次。
- 被替换的旧渲染：
  - 助理：`assistant-island.ts` 的 `renderQuestion`、`renderCard`、`renderRound` 的「接下来」。
  - Coding：`ui.ts` 的 `renderPendingQuestionCard`，以及 `client.ts` 的 `renderQuestions`。
- 管组件板的用例：`tests/primitives.test.ts`（`PRIMITIVE_CATALOG_IDS` 每个都要有样张）、`tests/touch-targets.e2e.test.ts`（组件板上可见的 `mw-menu__item` 都要量）、`tests/workbench-ui-platform.test.ts`。

### 17.1 #423 之后的切片与 PR 序列（2026-10-12 规划）

依据：三份只读核对（合同与 agent-host、输入回执线、助理与 Coding 现状），结论记在下面「现状要点」；切片按「合同先、宿主次、界面后」，每片一个 PR、可单独合。每片的验收编号从 AC-18 起。

**现状要点**（实施前再核一次行号）：

- SDK：#408 带的合成包（Prologue main `55b0c85a`，`vendor/prologue-sdk/prologue-sdk-0.0.0-rc.1-adoption-receipts-fields.tgz`）已含带类型的 `ask-user`（`PendingQuestion` 全部新字段、`validateQuestionnaireAnswer`、19 个机器原因、`askUserQuestionTypes`、`inputWaitTtlMs`）与输入回执 S1（steer 的 `key`/`source`/`about`、`projectInputReceipts`）。
- Molis 合同没跟上：`AgentPendingQuestion`（`services/agent-host.ts`）只有冻结的纯文字选项，`AgentRunControl.answer` 没有 `value`，回答错误只有 `agent.pending_unknown`/`agent.pending_not_open`；#408 也没改这两处。
- agent-host：`prologue-node.ts` 的 `readPendingQuestion` 把 SDK 选项对象原样透传（未过滤）；`answerPending` 的形状错误是无码的 `Error`，SDK 抛出的错误也没映射；`askUserQuestionTypes`、`inputWaitTtlMs` 都没配（等待期限仍是 SDK 默认 10 分钟，D5 未落实）。
- 助理：回答走 `POST /api/assistant/works/:id/answer`，单题自由文本时普通发送会被自动当作回答（`assistant-service.ts` 的 `freeTextQuestion`，回执线 G11 要去掉）。操作卡记录在 `assistant_cards`（助理库，CAS 改版本），`runCard` 已有幂等、失效、未知不重试；Coding 没有 `suggest-action`（网关只在 business 工作区）。
- Coding：回答走 `coding.control-run`，`routes.ts` 的 `questionAnswer` 只收 `indexes`，带 `value` 的答案会被拒；草稿在 sessionStorage 与 `question_drafts`。客户端字节在 5 个插件包里各算一次。
- 巨大单元（只许变小）：`services/agent-host.ts`、`assistant-island.ts`、`assistant-service.ts`（`AssistantService` 119 个方法）、Coding `client.ts`、`routes.ts`、`prologue-node.ts`。
- 输入回执线：`services/agent-inputs`（新子路径）拥有输入的身份（`key`、来源、`about`）与生命周期；它把回答、点选、表单提交、卡片按下都算作输入（它的 §3.1、§13.2），但 SDK 与 Molis 现在只给 steer 和排队输入身份，回答没有。它已定 D5：问题待回答时，输入框上方显示目标芯片，由用户点选「回答某个问题」或「补充这一轮」，不再按规则自动判断。

**事实主人（单一）**：

| 事实 | 主人 | 本线做什么 |
| --- | --- | --- |
| 题目、冻结、答案校验、等待、过期、恢复 | Prologue effect-policy | 只投影，不另存一份题 |
| 题目在 Molis 的视图形状（带类型的题、字段错误） | 本线新子路径 `services/agent-interaction` | 定义并从 `agent-host.ts` 搬出 |
| 输入身份（`key` 的格式与幂等、来源、`about`） | 输入回执线 `services/agent-inputs` | 回答控制引用它的 `key` 类型，不另起编号 |
| 未提交的填写草稿 | 问题所在界面的主人（助理库、Coding 会话） | 按 `(run, pending_id, revision)` 存；刷新只合并没被人改过的字段 |
| 对象候选与权限 | 对象主人；Host 在提交前逐个再读 | 只读动作提供候选，提交时复核 |
| 操作卡记录 | 从 `AssistantService` 拆出的操作卡协作者（W5-10 的形状，D6） | 一条记录，多处呈现 |
| 同排下一步 | 不存，从记录派生 | 宿主纯函数派生，界面只渲染 |

**切片**：

| 片 | 范围 | 验收 | 前置 | 门禁与检查 | 枢纽文件 | 与其他线 |
| --- | --- | --- | --- | --- | --- | --- |
| I1 共享行为 | 设计系统加不依赖运行时 import 的浏览器函数：草稿只回写没被人改过的字段、组合输入期间不提交、回车跳项与 ⌘/Ctrl+回车、日历弹层与方向键、步进器、选项与对象切换、提交时按 `data-ix-*` 收集值；组件板样张变成可操作；I0 预览改用它，删掉自己的 `bindings.ts`/`calendar.ts` 里对应部分 | AC-18 | #423 | 页面资源不变（只在组件板内联）；新函数各 ≤150 行 | `catalog-examples.ts`（情境线 W1 也会加区块：各加各的一行） | 情境线 W1-2 浮层定位上移到设计系统，先合者先合 |
| C1 交互合同 | 新子路径 `services/agent-interaction`：带类型的题（六种题型、`required`、`help`、选项说明与推荐、`default`、上下界、`refKinds`/`maxCount`）、`AgentPendingQuestion` 从 `agent-host.ts` 搬来、回答控制 `AgentAnswerControl`（`answers[].value`，可选 `key: AgentInputKey`）、错误 `agent.answer_invalid`（带 `problems: {question, id?, reason}[]`，`reason` 是 SDK 的闭集）、Agent 定义可声明 `question_types`（界面能渲染哪些题型，缺省只有选择题） | AC-19 | #408 合入 main；输入回执线的 `services/agent-inputs` 至少把 `AgentInputKey` 合入（或两线约定由先合的一方定义） | `pnpm api:update` 刷新快照；`agent-host.ts` 只减不增；所有消费者在同一 PR 改完（`docs/system/CONTRACT-CHANGES.md`） | `services/agent-host.ts`、`packages/contracts/package.json` exports、`tooling/gates/api/` | 回执线同时要从 `AgentRunControl` 搬出 steer 分支：两线都改这个联合类型，先合者先合，后合者重排 |
| H1 宿主接带类型的题 | agent-host 按 Agent 定义声明的 `question_types` 给 Run 配 `askUserQuestionTypes`（不在宿主写名单）；配 `inputWaitTtlMs` 24 小时（D5）；投影带类型的题并修掉选项原样透传；回答前用 `validateQuestionnaireAnswer` 预检，SDK 问题与 `PENDING_KIND_MISMATCH` 映射成 `agent.answer_invalid`；形状错误都有码 | AC-20 | C1 | 真实 Node Host 用例：带类型的问卷落盘、关闭、新 Runtime 读回并作答；`prologue-*` 用例按 AI Skill 要求跑 | `prologue-node.ts`、`prologue.ts`、`prologue-questions.ts` | 采用线若还在改这些文件，按枢纽规则排 |
| A1 助理接入 | 宿主把问题转成 `InteractionQuestionView`（新协作者 `assistant-questions.ts`，不让 `AssistantService` 变大）并服务端渲染出 HTML 放进视图（同 Coding 的 `question.html` 做法；岛是字符串脚本，不能在浏览器里调设计系统的渲染函数）；岛只接行为（I1 的共享函数）；草稿存助理库新表 `assistant_question_drafts`（主人助理）；删 `renderQuestion` 与对应样式；加载 `INTERACTION_STYLES`，同 PR 删掉被替换的助理问题样式抵字节；`assistant-base` 升版说明带类型的题与 `reference` 题 | AC-21 | H1、I1 | `assistant-island.ts`、`assistant-service.ts` 只减；页面资源不涨（新样式进 workbench.css，旧样式出 craft-finish，三张表各算）；新界面文字有英文（`translations` 门禁） | `assistant-island.ts`、`assistant-service.ts`、`assistant-http.ts`、`craft-finish.ts`、`apps/workbench/src/i18n/en.ts` | 回执线 1e 同改岛的输入框目标芯片与 `dispatch`（G11/D5）：R4 定案后两线按同一语义各做一半，见下 |
| A2 Coding 接入 | `ui.ts` 的问题卡改用 `renderInteractionQuestion`；`client.ts` 用 I1 的共享函数，删 `renderQuestions` 的重复部分；`routes.ts` 的 `questionAnswer` 收 `value`；`question_drafts` 收值；`coding-base` 升版 | AC-22 | H1、I1 | Coding 客户端字节在 5 个包里都不涨；`client.ts`、`routes.ts` 只减 | Coding `client.ts`、`routes.ts`、`ui.ts`、`apps/local-host/src/coding-surface.ts`、`tooling/gates/page-assets.json` | 采用线在 Coding 客户端也有改动（时间线、模型选择）；回执线 1d 改 Coding 回执渲染 |
| H2 操作卡协作者 | 从 `AssistantService` 拆出 `assistant-offers.ts`（`recordOffer`、`offerFromPage`、`runCard`、`dismissCard`、`cardView`、失效巡检），存储按「回合与卡片」表组拆；卡片视图转 `InteractionOperationView`、服务端渲染；同排下一步由纯函数从卡片与问题派生，作为视图字段给岛；删 `renderCard`、「接下来」行 | AC-23 | A1 | `AssistantService` 方法数与行数下降；新协作者 ≤25 方法、≤300 行；`table-owners` 不变（仍在 `apps/local-host`） | `assistant-service.ts`、`assistant-store.ts`、`assistant-island.ts`、`services/assistant.ts` | 防腐 W5-10（未开工）的同一块：先告诉防腐线，本片按它的形状做，算它的一部分 |
| H3 对象引用 | 只读动作 `interaction.references.search`（按种类与范围，从对象主人读当前有权限的候选）；提交前 Host 逐个再读，通过才交给 SDK | AC-24 | H1 | `pnpm actions:update`；安全不变量里「对象引用由宿主复核」加拒绝用例（`pnpm test:security`） | 动作目录、`tooling/gates/actions/`、`docs/system/SECURITY-INVARIANTS.md` | 情境线的对象落点读取：共用对象主人的读法，不另写一套 |
| H4 Coding 的操作卡 | Coding 的 Run 也能 `suggest-action`，记录走 H2 的协作者；Coding 的专业后续（查看变更、核对并继续）进同排下一步 | AC-25 | H2 | 动作合同快照；Coding 客户端字节不涨 | `prologue-action-gateway.ts`、Coding `routes.ts` | 采用线 #408 把 `suggest-action` 改成 `mutate-external`、加了 `HOST_GOVERNED_TOOLS`：以合入后的形状为准 |
| S1 单次接续 | 题型校验纯函数放 `packages/kernel`；Form「AI 生成表单」缺信息时返回 `needs_input` → 同一问卷卡 → 接续生成 | AC-26 | C1、I1 | 插件只经公开 SDK 与合同；插件客户端字节不涨 | Form 插件 | — |
| D1 文档与示例 | `skills/molis-prologue-ai`、`docs/platform/PROLOGUE-AI.md`、`skills/molis-plugin-dev`（含 `generated-ai.md`）、设计系统 README；§15.8 三个示例都有用例 | AC-12 | 随各片 | 文档引用门禁（行内代码路径、动作 id 必须存在） | `skills/`（全量回归期间不改） | — |

之后是 P5（§14.3 第二批入口逐个接入）与 P7（验收与归档）。

**跨线待定（交统筹定）**：

1. **回答的身份**：回答、点选、表单提交、卡片按下在回执线算「输入」，但现在没有身份。推荐：回答控制带可选 `key`，类型与格式由 `services/agent-inputs` 定义（本线引用，不另起编号）；回答的「已送达 / 已读到」等回执要等 SDK 给 pending 加 `about` 与已回答事件（回执线 S4，现在推后），在那之前回答只有 Molis 侧的幂等，不显示读到。
2. **R4 的最终语义**：见下一段的推荐。
3. **C1 与回执线合同的先后**：两线都要改 `AgentRunControl`（本线搬出回答分支，回执线搬出 steer 分支）。推荐由先就绪的一方先合，后合的一方在同一 PR 里改完消费者。

**R4 推荐（问题待回答时，输入框里回车做什么）**：

回执线已定 D5：输入框上方显示目标芯片，由用户点选，不再按规则自动判断。I0 预览的 R4 是「回车把这句写进问卷的补充要求，不交回」，与 D5 的出发点一致（不把普通发送当成回答），差在目标是预设的、而且回执线没有「写进问卷草稿」这个目标。

推荐方案：把 R4 并进 D5 的目标芯片，芯片有三种目标：

- 「写进问卷：补充要求」：只改问卷草稿，不交回、不发给 AI，回车后文字落到问卷的补充栏，问卷自己的「提交回答」才交回。只有问卷里有自由文本题时才出现。
- 「补充这一轮」：一条 steer，排在回答之后（回执线的「排在…你回答问题…之后」）。
- 没有问题等回答时，芯片不出现，回车照常发送。

问题刚出现时芯片默认选第一种（有自由文本题时）或第二种（没有时），默认值写在芯片上看得见，一下就能切换。这不是看不见的自动判断，所以与 D5 的本意（不让人误以为发送就是回答）一致；收益是人在问卷旁边补一句时不用先点一次芯片。

取舍：如果坚持 D5 的「每次都由用户点选」，就去掉默认，问题出现后第一次发送前多一次点击。两种都不会把发送当成回答。需要统筹按「界面交互和日常使用体验最好」的原则定；定案后 A1 与回执线 1e 按同一语义各做自己那一半（本线做问卷草稿目标，回执线做 steer 目标与回执）。

## 18. 进度

- 2026-10-09：建工作树与分支；核对 Molis（助理、Coding、插件入口、设计与门禁约束）与 Prologue（`ask-user`、等待账本、MCP 征求）现状，结果见 §14；方案见 §15；待决见 §16。
- 2026-10-11：I0 独立组合预览写成并交接（§19、§20）。
- 2026-10-12（I1）：共享浏览器行为模块写成并在真浏览器验证（§19.2）；#423 的审查修改完成。
- 2026-10-12（规划）：#423 之后的切片与 PR 序列、事实主人、跨线待定与 R4 推荐写进 §17.1；D7–D10 记入 §16。
- 2026-10-12（P2 第一刀）：共享部件进设计系统与组件板，I0 预览改用它们（§19.2）。
- 2026-10-12：分支 `feature/handoff-ai-interaction` 合入 origin/main `02ceba8c`；I0 预览在内置浏览器里逐条走查，按实物重做布局、信息层级、操作路径与状态反馈（§19.1）。三级证据：工程通过见 §19.1「证据」；真实产品实操——不适用（预览不连 Home，只有开发者原型走查）；用户本人验收——未开始。


## 19. I0 独立组合切片（2026-10-11）

本轮基准：`origin/main=d72fdc4c7`（开工 fetch 已核对），工作树 `/Users/yijunwang/code/molis-ai-interaction-i0`，分支 `feature/ai-interaction-i0`。从 `8d0d7dd84` 完整恢复本文、参考图与入口文档；原 §1–18 的目标、AC-01–12 和 D1–D6 保留。原主检出未跟踪目录已不存在，不在那里写文件。

本轮目标为可供下一独占浏览器时段验证的高保真预览代码；全线仍以「内部完整」为目标。现在不启动服务、不构建、不跑浏览器或真实模型；纯逻辑测试和局部无输出静态检查不等于完整工程验证、原型实操或用户验收。

### 范围、方案与边界

唯一预览入口 `scripts/preview-ai-interaction.mts`，组合与状态在 `scripts/ai-interaction-slice/`。现有 contextual/functions 预览使用真实服务且范围不同，不能当作本线入口。本片复用设计系统公开入口的 primitive、token 与样式，以同一组件呈现助理和 Coding 的专业布局，不改产品组件库或任何产品 src。未来 P2 在最新防腐基准提取至共享组件和规格板；不直接将演示接生产。设计系统只依赖 contracts/platform，领域 services 合同由消费方转换为纯展示参数。

允许修改仅为上述脚本、`tests/ai-interaction-slice.test.ts`、`tests/ai-interaction-slice.e2e.test.ts`、本需求目录及 specs/README 本线索引。没有 SDK/Host/合同/入口/配置/门禁/预算授权。无输出静态检查只针对本片；离线依赖安装如需要必须 `--ignore-scripts`。

同一混合问卷含 choice（单/多选）、text、number、date、datetime、reference。候选为固定示例资料；所有提交与执行明确模拟，不造生产 Run、回执或 TaskBoard。问卷只收回答，操作卡另有参数预览和显式执行；预填、保存草稿、出现推荐不授权。结果未知只允许核对，不自动重放。

自然补充和字段使用同一份待提交 values：补充文字原样存在 notes（对应文本题）。I0 不用模型推断或暗改结构化字段；识别到明确“时长改为 N 分钟”时显示待确认冲突，用户明确采用后更新同一 minutes，保留原补充原文；不支持的自然语言仅作补充，不能宣称已改参数。字段新编辑会撤销旧解析提案，提交前未解决冲突须明确处理。后台演示更新只合并未编辑字段；来源对象版本变化使旧交互失效。关闭、切换保留会话内草稿；刷新跨页面持久化留待真实主人接入，不另建输入账。

同排推荐只对应对话下一步；聚焦、悬停、组合输入期间保持位置，失效项立即禁止执行、离开交互后再收回。问卷的过期/被替换/失败与操作卡的未知/失败/对象失效均有明确操作入口。取消中途请求后迟到模拟结果不能改变状态。

SDK 已有 `feat/ask-user-fields@a06ae62e`：实际配置为 `config.tool.askUserQuestionTypes`，公开 `validateQuestionnaireAnswer` 返回字段问题，最终 answer 拒绝用 `PENDING_KIND_MISMATCH`。本片不调用 SDK，本地验证仅用于演示；生产接入须经采用线同一来源包、输入线 request_id/key、对象主人授权复核与 W5-10 共用协作者。TaskBoard 与外部条件等待完全归采用线。

### I0 验收与局部证据

下列是新增切片标准，不改原 AC 的含义；依同一 spec 编号规则从 AC-13 继续。

- **AC-13**（I0，原 AC-02/03/04 局部）：混合填写→字段错误保留并定位→修正→模拟接收；答案与执行分开，默认值不触发提交。自然补充冲突经明确处理才更新同一参数。
- **AC-14**（I0，原 AC-07/08 局部）：重复提交仅一个模拟操作；过期、替换、对象改版拒绝旧提交；后台更新、关闭与布局切换保留草稿；失败允许重试，未知仅核对，取消后的迟到结果无效。
- **AC-15**（I0，原 AC-02/10 局部）：推荐在焦点/悬停/组合输入期间不换位，失效不可执行；准备浅深色与 1440/1024/390、键盘、减少动态的浏览器用例。真实 IME、读屏与视觉判断未实操前始终标未验证。
- **AC-16**（I0，原 AC-01/11/12 局部）：两布局共用展示与状态逻辑；固定候选与模拟结果明确标识；不触及产品入口、生产数据、SDK 或其他线。

验证计划：纯逻辑用 `node scripts/run-tests.mjs tests/ai-interaction-slice.test.ts`，调用预览实际状态逻辑；浏览器用例只准备，运行命令 `node scripts/run-tests.mjs tests/ai-interaction-slice.e2e.test.ts` 留待统筹排期。预览启动与依赖要求在本节交付记录补充。截图仅入 `.impeccable/qa/review/ai-interaction-i0/`。本片不跑 build、完整 typecheck、资源更新或全量门禁；原 AC-01–12 整体验收仍未完成。


### I0 交付记录与冻结交接（2026-10-11）

代码已写完并冻结在本树的未提交差异中；共 20 个新增文件（含原需求书及参考资料）和 specs/README 的一行索引。没有提交、推送或修改任何产品源码、package 配置、SDK、合同、Host、预算或门禁。统筹可据此恢复 A0 writer；本会话不继续等资源或轮询。

实现分工：model/validation/state/execution/recommendation 提供两种布局共用的演示数据与状态逻辑；render/styles 复用设计系统公开源码入口（同一个 index.ts）的 primitive/token，组合问卷、参数预览、执行确认、结果与同排推荐；controller/paint/dom/client 只绑定当前页面，后台更新不重建表单；server 与启动脚本仅提供固定 HTML 和允许列表中的浏览器模块。没有存储、生产输入编号、Run/TaskBoard、后台等待任务或外部调用。浏览器模块在将来启动时由 Node 的 stripTypeScriptTypes 在内存去类型，不输出 bundle，不构建产品。

已执行：

- 离线依赖安装 `pnpm install --frozen-lockfile --offline --ignore-scripts` 成功（没有生命周期脚本、没有改锁文件）。
- `node scripts/run-tests.mjs tests/ai-interaction-slice.test.ts`：13/13 通过；使用实际预览状态函数，覆盖数据类型、字段错误、自然语言冲突、默认/草稿不授权、重复点击、取消/失效后的迟到结果、未知只核对、明确失败重试、继续调整及推荐占位。
- `node node_modules/typescript/bin/tsc --noEmit --target ES2023 --module ESNext --moduleResolution bundler --allowImportingTsExtensions --strict --noUnusedLocals --noUnusedParameters --skipLibCheck --lib ES2023,DOM scripts/ai-interaction-slice/client.ts tests/ai-interaction-slice.test.ts`：通过，仅客户端和纯逻辑测试及其依赖的局部检查，不是全仓 typecheck。
- Biome 对本片 15 个 TS/MTS 文件定向 lint：通过，无修复或规则改动。
- 全部 15 个文件内存语法检查、9 个浏览器模块使用实际 stripTypeScriptTypes 的内存语法检查、renderPreview 的内存渲染均通过；没有启动服务器、端口或浏览器。Node 去类型 API 会给实验性提示，需在实际启动时确认运行环境。
- 原 AC-01–12 的文字、D1–D6 和三张参考图与来源逐项比对保留；新增文件路径均在允许范围，唯一已有文件变更是 specs/README 本线索引。

证据边界：AC-13/14 的演示逻辑部分通过，DOM 主路径仍待浏览器；AC-15 的推荐锁与组合输入结束后草稿保留逻辑通过，真实中文输入法、读屏、焦点/滚动、视觉、响应式与动效未验证；AC-16 静态分工与范围核对通过，两种实际布局尚未目视。准备好的 E2E 中 composition 事件是合成事件，不能作为真实 IME 验收。AC-01–12 整体仍未完成。

下一安全时段（A0 构建验包优先，须统筹安排）可从本工作树执行：

```sh
node --import tsx scripts/preview-ai-interaction.mts --port 4319
```

浏览器打开 `http://127.0.0.1:4319`。入口只绑定 127.0.0.1；端口占用时报错，不接管其他进程。Ctrl-C 关闭；不需要 Home、凭据或产品构建。新独立树没有已构建的 test-kit/browser，因此自动化 E2E 的额外前提是统筹允许在安全构建时段完成 `pnpm --filter @molis-ai/molis-work-test-kit run build`；本轮未执行。人工/工具浏览器体验上述预览不依赖这一步。之后可执行：

```sh
node scripts/run-tests.mjs tests/ai-interaction-slice.e2e.test.ts
```

该用例自己启停随机本机端口的同一预览、独立 Chrome 配置目录，不读真实 Home；准备了填写/修正/回答/预览/执行/结果、切换与草稿、后台更新、过期、失败/未知/重试、键盘、浅深色 × 1440/1024/390 × 两布局。截图只写被忽略的 `.impeccable/qa/review/ai-interaction-i0/`。未运行任何浏览器用例、build、完整 typecheck、全量回归、健康/资源门禁或真实模型，故不宣称原型实操完成或内部完整。

### 19.1 第二轮：按实物重做（2026-10-12）

基准：合入 origin/main `02ceba8c`（唯一冲突是 `specs/README.md` 索引，两行都留）。main 这段时间对本片有影响的只有设计系统：`craft-finish` 的底栏与触控尺寸、`touch-targets`、新增的 `plugin-components`（生成插件的组件目录，与本线无关）；`contracts/platform` 的变动（动作片段、插件 Agent 搬出）本片不消费。走查发现的两个缺陷都在 I0 自己身上：7 个图标名不在图标库里（`message-circle`、`file-text`、`layers` 等，渲染成空白），以及缺少工作台给 `svg` 的描边基础样式（`target` 画成实心黑圆）。设计系统公开入口本身没有让预览坏掉的变化。

预览仍是独立页面（`scripts/preview-ai-interaction.mts`，固定示例、提交与执行全是模拟、不连 Home），只改了 `scripts/ai-interaction-slice/` 与两份测试。

#### 改了什么，收益与取舍

| # | 改动 | 收益 | 取舍 |
| --- | --- | --- | --- |
| R1 | 放进工作台框架：桌面、一张工作纸、底栏；助理面板按产品 `.assistant-panel` 的几何从输入框上方升起（≥1240 带 272px 的工作详情栏），Coding 是「会话目录 · 对话 · 结果与审查」三栏 | 问卷、操作卡在真实的宽度和高度里看：助理面板对话列约 600px、高 620px，Coding 对话列约 780px，手机是底栏之上的整宽面板。能直接判断「放不放得下、挡不挡工作」 | 框架里的 Goal 页、Dock、会话目录、Diff 是示意，`inert` 且写明「示意，不可操作」；不等于产品外壳的实现 |
| R2 | 问卷紧凑：卡片按自身宽度（容器查询）在 ≥520px 时标签在左；只写一次「全部必填」，不在每题挂「必填」；推荐理由写在选项组下方 | 7 项字段在 600px 的列里不再是一长条；同一份标记在三种宽度都成立 | 选填题出现时要在题上标「选填」（I0 没有选填题） |
| R3 | 回答交回后卡片折叠成「已交回 · 7 项回答」摘要，操作卡出现在下一条消息里 | 视线落到下一步的决定上；回答和执行在视觉上也分开 | 要看完整回答得看摘要；修改走「调整回答」重新打开 |
| R4 | 输入框补充改成「回车放进补充要求」：问题可填时输入框前有「补充到问卷」标记，回车把这句接到「补充要求」末尾，输入框清空；里面写了时长就出冲突确认 | I0 原来让输入框和「补充要求」实时镜像同一段文字，两处显示同一份草稿，容易误以为是两份；现在一份草稿、一个落点，发送前的文字仍是输入框自己的草稿 | 有问题等回答时，输入框里回车不再发给助理一条新消息；要另说别的事，先收起或回答问题（真实接入时与输入回执线的「输入」合同一起定） |
| R5 | 日期用设计系统的日历（`renderCalendar`，方向键、Esc、点外面收起，焦点回到按钮）；开始时间拆成日期 + 24 小时制时间，时区随问题给定、只显示不输入；时长可直接输入，也可 ±5 分钟步进 | 不再要求人手写 `2026-10-16T10:00-07:00`；交给 SDK 的值仍是带偏移的 ISO，由界面拼好 | I0 不支持改时区；日历只渲染了 10、11 两个月 |
| R6 | 输入框旁的下一步不再是固定的「查看下一步」，而由记录推出具体操作：预览参数 → 执行（模拟）→ 执行中… → 打开结果 / 继续调整；结果未知只给「核对结果」；失效给「请助理重新问」或「按新版本重新准备」；Coding 完成后给专业后续「查看变更」。问题卡就在眼前时不占位，收起时给「继续填写」。同排最多一主一次，手机移到输入框上方，面板相应让出高度 | 按钮说清楚按了会怎样；底栏、对话卡是同一条记录的两个入口（§15.8 示例 2），在哪按都一样，计数只加一次 | 预览之后，输入框旁可以直接「执行（模拟）」——参数已经展开在卡片里；没有预览就没有执行入口 |
| R7 | 下一步的位置规则细化：在输入框里打字、组合输入、焦点在这一排时，位置与文字都不动，失效的立即禁用，离开后再换；指针悬停只在按钮还能按时才锁（全是「执行中…」不必锁）；本人按下一步引起的变化立即显示 | I0 原规则在本人点了「预览参数」后，因为指针还停在按钮上，按钮会变灰、要移开才出现「执行」 | 外部变化（对象改版、过期）在指针停留期间仍只禁用不换位 |
| R8 | 过期、被替换、选了不回答之后，字段仍可当草稿继续写，只是不能交回；横幅说明并给「请助理重新问」 | 不会在人写到一半时把字段整个禁用掉 | 这段时间的修改要等重新问时才交得出去 |
| R9 | 问卷里的单行输入框回车跳到下一项，⌘/Ctrl+回车交回（DESIGN.md 对话框的同一约定）；中文输入法组合中的回车不算 | 不会因为在时间框里按回车就把整份问卷交出去 | 习惯回车提交的人要用快捷键或按钮 |
| R10 | 状态反馈就近：问卷底部写交回状态与错误数，操作卡写执行状态；面板底部的一行状态只确认刚发生的事，6 秒后收起（读屏仍播报）；后台更新改到的未改字段标「已按最新材料更新」并有一次铜色底的落地；新内容到达时只在本来就在底部或焦点无处可去时跟随，否则出「回到最新」 | I0 的提示固定在对话最上方，填到下面时看不见；长期状态由卡片承载，不重复 | — |
| R11 | 助理面板可最小化，输入框里出现这项工作的芯片和状态点，聚焦输入框即恢复；Coding 的「结果与审查」栏 ≥1281px 并排、以下从右侧滑出 | 草稿在收起、切换布局、最小化之后都在 | — |
| R12 | 回答交回后问题才失效（过期、替换、对象改版）时，卡片保持回答摘要并加横幅，点「按新版本重新准备」才展开表单；完成后收起参数预览，结果进入视野 | 外部变化不再把整张问卷展开、把正在看的内容顶走 | 重新准备多一次点击 |
| R13 | 执行失败后点「检查参数并重试」重新展开参数，卡片回到「待你执行」，输入框旁随之变成「执行（模拟）」 | 第一次 e2e 发现原推导让下一步停在「检查参数并重试」，点了只是再展开一次 | 重新核对后的执行仍要单独按一次，不会自动重放 |

没有改的：§19 的状态规则（回答与执行分开、默认不授权、重复点击只一次、取消与失效后迟到结果无效、未知只核对）原样保留；只加了「输入框草稿」「开始时间两半」「下一步推导与锁」三块纯逻辑。未覆盖的：单选问询变成输入框上方的选项胶囊（§15.6 第二种来源）、超过两个下一步时的「更多」、对象引用的搜索与权限、跨页刷新后的草稿恢复——留给共享组件与真实接入阶段。

#### 证据

工程通过（本机，2026-10-12）：

- `pnpm install --frozen-lockfile --offline` 成功；`pnpm --filter @molis-ai/molis-work-test-kit run build`（持 build 锁）通过。
- `node scripts/run-tests.mjs tests/ai-interaction-slice.test.ts`：21/21 通过（原 13 条不改断言，新增 8 条：输入框补充、开始时间、失效后草稿、后台更新标记、下一步推导、位置锁、本人按下的变化、失败后重新核对参数）。
- 局部严格 `tsc --noEmit`（client、render、server、两份测试及其依赖；设计系统源码因 contracts 未构建报的错不在本片）与 Biome 定向 lint：通过；本片最长函数 122 行，没有新增巨大单元。
- `node scripts/run-tests.mjs tests/ai-interaction-slice.e2e.test.ts`（持 browser 锁，本机 Chrome，减少动态）：10/10 通过。覆盖问卷修正→交回→预览→执行→结果；输入框补充、回车跳项、⌘/Ctrl+回车交回、日历键盘选日；收起、切换布局、最小化、后台更新（焦点与对话滚动位置不变）、过期后继续写草稿再重新问；组合输入期间失效的下一步不换位并禁用、结束后换成新操作，交回后对象改版保持回答摘要；回答失败重试、执行未知只核对、执行失败重新核对后再执行（下一步与卡片计数一致）；Coding 共用交互并给「查看变更」；键盘选项不提交；两种布局 × 浅深色 × 1440/1024/390 无横向滚动、可见按钮不出窗、手机触控 ≥44px、动效为 0s、Coding 审查栏只在 >1280 时并排。截图在被忽略的 `.impeccable/qa/review/ai-interaction-i0/`（矩阵 12 张，状态 11 张）。
  - 第一次运行有两处失败，都已查清：一是用例自身——重新加载时等待表达式在新文档没有根元素的瞬间读到 null，改成可选链，断言不变；二是产品缺陷——执行失败后点「检查参数并重试」重新展开参数，但卡片仍停在失败态，输入框旁继续给「检查参数并重试」而不是「执行」，已改为重新核对参数即回到「待你执行」，并加了单测。看截图后另改三处：交回后对象改版不再把问卷整张展开、完成后收起参数预览让结果进入视野、Coding 审查栏随断点收放。
- `node scripts/check-health-gates.mjs --base origin/main`：通过（对照 merge-base `02ceba8c`）。`pnpm secrets:check`：通过。

原型走查（开发者在内置浏览器，1440×900、1024×768、375×812，浅深色）：混合问卷的填写、逐字段错误与定位、输入框补充与时长冲突、修正后交回；参数预览与显式执行、结果、同排下一步；结果未知只核对、执行失败重试、过期、替换、对象改版、取消；后台更新保留焦点与滚动位置；收起、最小化、切换布局后草稿仍在；日历键盘；手机下一步移到输入框上方、无横向滚动。这是开发者对独立预览的操作，不是真实产品实操，也不是用户验收；真实中文输入法与读屏未验证。

真实产品实操：不适用（预览不连 Home、SDK 或模型）。用户本人验收：未开始。

#### AC-13 到 AC-16

- **AC-13**：工程通过（单测、浏览器用例）与开发者走查通过；真实调用链未接（AC-04 本体未开始）。
- **AC-14**：工程通过与开发者走查通过（重复点击、取消后迟到结果、过期/替换/对象改版拒绝旧提交、失效后草稿可写、后台更新只改未动字段、失败重试、未知只核对）。跨页刷新与重启恢复不在 I0 范围。
- **AC-15**：工程通过（位置锁、失效禁用、键盘、三档宽度、浅深色、手机触控尺寸、减少动态）与开发者走查通过；组合输入只用合成事件验证；真实中文输入法、读屏与用户的视觉判断未验证。
- **AC-16**：两种布局共用同一份标记与状态逻辑，示意与模拟处处标明；没有触及产品入口、生产数据、SDK 或其他线。

### 19.2 P2 第一刀：共享部件进设计系统与组件板（2026-10-12）

**落点**：`packages/design-system/src/interaction.ts`（类型与渲染函数）、`src/styles/interaction.ts`（`INTERACTION_STYLES`）、`src/interaction-example.ts`（组件板样张）、`src/catalog-examples.ts`（组件板的示例区块在 `catalog.ts` 之外组合；`catalog.ts` 是已登记的巨大单元，这次原地改两行，行数不变）。从包根导出。

**接口的取舍**：

- 只收展示参数：`InteractionQuestionView`、`InteractionField`（`choice`/`text`/`number`/`date`/`datetime`/`reference` 六种控件，对应 §15.2 的题型）、`InteractionOperationView`、`InteractionNextStep`、`InteractionOption`、`InteractionReference`、`InteractionAction`。不引用 `services/*` 合同，也不认识 Run、回执或授权；调用方把自己的记录转换过来（§15.5、§19 的约定）。
- 读人的文字都由调用方给；只有几个控件名（「打开日历」「选填」「推荐」）有可覆盖的默认值。
- 行为钩子统一是 `data-ix-*`（字段 `data-ix-field`，值 `data-ix-value`/`data-ix-part`，选项 `data-ix-option`，对象 `data-ix-reference`，按钮 `data-ix-action`，下一步 `data-ix-step`），客户端不依赖类名。
- 每个字段都留一个错误位（没有错误时隐藏），控件的 `aria-describedby` 指向说明和错误，修正时不改结构。
- 交回后的问卷显示回答摘要，表单留在页面里隐藏，「调整回答」能带着草稿重新打开。
- 下一步最多一主一次，多给的不渲染（其余操作属于卡片本身）。
- 日期一律用设计系统的日历，不出现系统日期控件。
- 样式单独导出，不并入 `PRIMITIVE_STYLES`（§17 P2 的字节约束）；组件板内联它，产品页面采用时再加载。

**第一个活的使用方**：I0 预览改为直接用这些部件渲染问卷、操作卡、下一步与输入框标记，预览自己的卡片样式删掉，只留对话外壳；paint、事件绑定、日历与 e2e 都改到 `data-ix-*` 钩子上，断言内容不变。

**同日补充（外部约束）**：统筹转来两条要在接口里算进去：SDK（Prologue `a13bf067`）已有带类型的 `ask-user`（`config.tool.askUserQuestionTypes`、`validateQuestionnaireAnswer`、`PENDING_KIND_MISMATCH`），问卷卡要能从这组真实题型与字段错误直接转换；回执线的 `request_id`/`key`、pending 的 `about` 与对象版本失效要有展示位。已补：`choice` 控件的 `other`（`allowOther`）、`number` 的 `min`/`max`/`integer`、卡片的 `about`、折叠的 `evidence`、问卷卡的 `target`（对象与版本）；对应关系表在 §15.5。决定记录：展示位只显示、不解释，键与 id 以等宽行给出便于查对；`reason → 文案` 由消费方做，设计系统不收机器原因。

**未做**：
- 共享的浏览器端行为模块（草稿合并、焦点、组合输入、日历、键盘），现在仍在预览自己的 `bindings.ts`、`calendar.ts` 里，下一刀抽成不依赖运行时 import 的函数，供助理岛与 Coding 客户端拼接。
- 助理与 Coding 的产品采用与旧渲染删除（P3/P4，等真实接入一起做）。
- 单选问询的输入框上方选项胶囊。

**AC-17 的证据（2026-10-12）**：`tests/interaction-components.test.ts`、`tests/interaction-sdk-mapping.test.ts` 与 primitives、arrival-components、workbench-ui-platform、I0 单测共 66/66；I0 e2e 改用这些部件后 10/10（持 browser 锁）；组件板区块在隔离宿主上目视通过（浅色、桌面宽度）。深色与窄屏的组件板样张尚未逐张看。

**#423 的审查修改（2026-10-12）**：id 与 scope 只在写进属性的那一处转义一次（带引号或 `&` 的 id 不再破坏属性、label 的 `for` 与控件 id 一致）；单选组是 `radiogroup`/`radio`（`aria-checked`），多选保持切换按钮（`aria-pressed`）；`aria-describedby` 只指向存在的说明；日历对话框名称由调用方给；去掉未渲染的 `other.selected`；组件板每个样张有自己的 id。受影响的 6 个浏览器用例（agent-studio、functions-draft-retention、plugin-builder-diagnostics、plugin-composition、select-menu-interaction、ui-client-lifecycle）14/14 通过。

**I1 共享浏览器行为（分支 `feature/interaction-shared-behaviour`，2026-10-12）**：设计系统新增 `interaction-client.ts`：`createInteractionClient(root, host)` 读写字段（按 `data-ix-*` 钩子）、选项与对象切换、单选箭头键与单一 Tab 停靠、步进器上下界、日历弹层、回车跳项与 ⌘/Ctrl+回车提交、组合输入期间不报变化、逐字段错误；不存值，写入不夺走正在输入的字段。三个不依赖 import 的函数（109/108/137 行），`INTERACTION_CLIENT_SCRIPT` 是它们拼成的脚本表达式。组件板第一张问卷样张可操作。证据：`tests/interaction-client.e2e.test.ts` 在真浏览器里 9 个子用例通过（组合输入用合成事件，不能代替真实输入法）；相关单测 30/30。预览（#410）改用这个模块，等 I1 合入后做。

**AC-17**（P2）：设计系统提供问卷、选项组、操作卡、下一步与输入框标记的共享部件，只收展示参数、调用方文字全部转义、六种题型都有不依赖系统控件的输入方式、每个字段有稳定的错误位；组件板有区块并进入目录；样式只用令牌、不进共享页面样式表；I0 预览用这些部件跑通全部路径。

## 20. 远端交接（2026-10-11，当前接续入口）

用户已授权提交、推送供别人接续。本分支 `feature/handoff-ai-interaction` 保存 I0 切片及完整原需求，基点为 `d72fdc4c7`；§19 的“未提交/未推送”与本机绝对路径是当时记录。本文是接续的唯一需求书。本次未改预览逻辑或测试断言。

- 已有证据：13 项实际状态逻辑测试、局部严格 TypeScript、定向 lint 与内存渲染通过。浏览器、真实 IME、读屏、视觉、响应式、实际焦点/滚动以及真实 SDK/模型接入未验证；原 AC-01–12 未完整通过。
- 下一步先对照最新 main 的 DESIGN 与公开入口，再启动 §19 的 `node --import tsx scripts/preview-ai-interaction.mts --port 4319` 做实操；浏览器自动化前需独占时段构建 test-kit。预览用固定示例与模拟提交，不能据此宣称生产输入回执或动作执行已接通。
- SDK 字段问卷来源为 [提交 f423aabb](https://github.com/molis-ai/prologue/commit/f423aabb272d77b5a180cefd22855a2df62d1c94)（分支 `feature/handoff-ask-user-fields`，原实现 a06ae62e）。该能力尚未进入 A0 候选；生产接入前由采用线与 S1 整合进同一份 SDK，不能直接换另一份包。
- 关联入口：[完整采用](https://github.com/molis-ai/molis-work/tree/feature/handoff-prologue-adoption/specs/prologue-adoption)、[输入回执](https://github.com/molis-ai/molis-work/tree/feature/handoff-ai-input-receipts/specs/ai-input-receipts)。D7 限制真实接入，独立视觉验证可先继续。设计系统仅接 contracts/platform 的展示参数，仍由消费方转换领域状态。

在浏览器验证前保持“代码切片已交接、实物未验”的结论；验证后再按原完整 spec 推进共享组件、规格板和真实场景。所有截图用忽略目录，既有门禁与页面预算不放宽。本次未合并、发布或改动真实 Home。
