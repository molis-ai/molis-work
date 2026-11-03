# Molis Work 跨插件 AI 交互能力与体验统一：完整开发 Prompt

> 接续先读下面的「交接（2026-10-20）」。它取代 `coordination/2026-10-18/lines/interaction.md`、§20「远端交接（2026-10-13）」和原先写在这里的两条统筹更正。

状态：执行中、交接待接手（2026-10-20）。交互线收尾；工程部分大多已合入 main，没做完的写成 `specs/BACKLOG.md` 的 BL-340～345，浏览器与真实模型验证待补，验收没有完成，不归档。§1–§13 是用户讨论定下的需求（2026-10-05 整理）；§14 起是开发 owner 核对现状后补齐的方案、决定与进度，§16 的决定已与用户对齐（2026-10-09）。本文是这项任务唯一的需求书与进度记录。

## 交接（2026-10-20）

交互线按统筹 2026-10-20 的安排收尾：手头的做完、开 PR，然后停。这一节是接续入口；正文里更早的状态与它不一致时，以这一节和 §20.15 的验收表为准。

**现状。** 工程部分大多已在 main 上，各有带验收编号的用例：六种题型与对象引用、助理和 Coding 的问卷卡与操作卡、单次插件的接续（Form）、重启与并发下的恢复、下一步行里的卡片结果。没做完的是第二批入口、Coding 的输入框芯片、卡片上的撤销、同排推荐要用户判定，以及全部浏览器与真实模型验证。

**验收在哪里看。** 标准原文是 §12；逐条的判定与证据是 §20.15 末的验收表（AC 各行，一直更新到 2026-10-20）；待补的浏览器验证清单在 §15.10 末；决定在 §16，进度记录在 §18。

**已合入**（2026-10-17 起；更早的见 §18）：

| PR | 内容 | 合入提交 |
| --- | --- | --- |
| #638 | T2：对象引用题按名字找对象 | `c2ad593f2` |
| #655 | AC-12：插件作者怎样问人、建议一步、引用对象；§15.8 示例 1 | `4fd585da5` |
| #659 | AC-07、AC-08：两处同时作答只收一份；重启的缺口 | `dd2bac58a` |
| #663 | BL-156 设计（§15.9） | `4f0a4a8b9` |
| #669 | 「请 AI 重新问」（D5） | `f78ae6d5c` |
| #670 | 运行控制的失败按 Agent 的话交给调用方 | `b6d985590` |
| #681 | BL-152：每一轮按自己的项目定能问哪些对象 | `42c968efe` |
| #695 | BL-156：重启前问的题，重启后能答 | `6505378e8` |
| #696 | AC-05：写的和答的只留在自己的会话、项目与选中项 | `8fcff0442` |
| #702 | AC-03：助理的输入框写进问卷 | `b3499cda5` |
| #708 | AC-08：两个页签答同一题；Coding 迟到的回答被退回 | `23946656c` |
| #775 | AC-10 第一片：可以不选的单选题，选了能清掉 | `c0b204fd6` |
| #785 | AC-01 入口盘点定稿，AC-09 回填，AC-12 生成插件的边界写进 Skill | `ddb65438a` |
| #798 | AC-06：跑完的卡的结果进下一步行，助理与 Coding 同排（H4）；BL-245 | `ea0b4428e` |
| #802 | 修 QA-001：英文界面下，发送失败的原因用英文说 | `06e7ff4ac` |
| #810 | 修 QA-002：Form 补问重试撤下旧错误；QA-003：AC-09、AC-11 用例补编号 | `053b16485` |
| #815 | AC-10 第二片：Coding 收下回答后，回执写进卡的说明行，焦点回到输入框 | `c17504473` |
| #824 | 统筹 D24（修 main 回归）与修 QA-024 第一片：能多选的列表里 ⌘/Ctrl 点击归选择，中键照旧在组里开；Pages、灵光的列表标上 `listbox` 和 `aria-multiselectable`；按统筹裁定改写 PTG-06 | `1dd8e78e2` |

**在途：** 无。#824 已由 ⑤ 随集成批 1020-1 合入 main `1dd8e78e2`（见上表）；QA-024 的第二片是 BL-340。

**分支与工作树：**

- 远端分支：`interaction/d24-multiselect-click` 已随 #824 合入自动删掉；本交接的分支 `interaction/handover-1020` 随本 PR 合入自动删掉。
- 已删：上表各 PR 的远端分支（随合并删掉）；本机上已合入 PR 的本地分支，以及 10-18 交接里待删的本地分支与工作树 `line-interaction-ac08`、`line-interaction`。
- 留着：
  - 本会话的工作树 `.claude/worktrees/interaction-line-543ff8`，上面有分支 `interaction/handover-1020`（这次交接）和 `interaction/d24-multiselect-click`。交接 PR 合入后由 ① 清理。
  - 2026-10-12～13 的五个早期工作树：`ai-interaction`、`ai-interaction-c1a`、`ai-interaction-h1`、`ai-interaction-i1`、`ai-interaction-p2`。它们的分支是 `feature/handoff-ai-interaction`、`feature/agent-interaction-contract`、`feature/agent-typed-questions`、`feature/interaction-shared-behaviour`、`feature/design-system-interaction-parts`。
    - 这几个工作树都干净；按 §18、§20 的记录，内容已经合入或被后来的实现取代。
    - 但这些分支没有远端副本，删了就找不回，所以由 ① 决定清不清。

**没做完、没开工的**（每项一行，在 `specs/BACKLOG.md`）：

- BL-340～345：
  - BL-340：QA-024 第二片，纯键盘多选，以及 Pages 目录的复合控件；
  - BL-341：第二批入口（P5）；
  - BL-342：Coding 的输入框芯片；
  - BL-343：卡片结果的撤销；
  - BL-344：同排推荐要用户看实物判定；
  - BL-345：浏览器与真实模型验证。
- 原归本线的 BL-222（Coding 时间线的退出码）、BL-245（生成插件先问再接续）、BL-246（Coding 回执留得够不够读屏读完）改为未分配。
- 真机中文输入法与读屏是 BL-016。
- PG-036（助理按插件名分支，§17 末的归属补记）不再归本线，按 `specs/repository-anti-corruption/privileges.md` 的 PG-036 行跟踪。

**风险与不能碰的：**

- 真实 Home 与真实数据不碰，包括本机日常用的 Home 和端口 4207 上的服务；测试与实走只用一次性 Home，用完删掉。
- 钥匙串里 Home 主密钥的条目不删，所有 Home 共用它。
- 真实模型的密钥只在命令里内联读取（`security find-generic-password`），不进对话、文件和日志。

**接手时的坑：**

- 按用例名过滤，写 `node scripts/run-tests.mjs <文件> --test-name-pattern=…`。直接写编号会被当成文件参数，跑上千个用例。
- CI（Linux headless）上，后台页签不可见，Coding 只在可见的页面里读会话。所以第二个页签要用 `Target.createTarget({url, newWindow: true})` 开。
- Coding 的状态行不放原因：这一轮的状态一变，状态行就清掉。被拒的原因放在卡片的说明行里。
- 页面资源门禁比的是 merge-base 的预算，所以合 main 后要重建、重量，用 `--update --base origin/main` 降下来。
  - 正文里的字节写成相对 merge-base 的差值。
  - Coding 客户端的字节在几个插件包里各算一次，余量很小，加代码前先在同一个资源里省。
- CPU 满载时，`interaction-no-crosstalk` 和 AC-05 的用例会在导航或清理时超时，这是环境问题；负载正常时它们是稳的。

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
| Prompt 指导 | 已有，要补 | `assistant-base` v24 已要求用 `ask-user` 给具体选项、用 `suggest-action` 给卡、不在正文模拟按钮；运行时的收尾核对（`prologue-stop-guard.ts`，D1②）把回复与这一轮的事实核对，拦「说有按钮却没有」。缺：字段题、推荐理由、对象选择、避免重复问 |
| 单次生成插件的接续 | 新增 | Cognia、Pages、Form、Dataset、PPT、灵光、Todo、Workflows 用 `completeText`，一问一答；没有「需要补充信息」的结构化结果与接续约定 |

### 14.3 入口盘点

首轮（2026-10-12）按调用方式与界面分组；2026-10-19 逐个插件核过调用路径、装配与界面，下表是最终版（AC-01）。「共享交互」指同一张问卷卡（`agentQuestionHtml`）、操作卡与下一步，以及插件动作返回 `needs_input` 时宿主补上的问卷卡（`withPluginInteraction`，Native 与 Runtime 插件的路由出口都有）。

| 对象 | 调模型的方式 | 装配 | 现在用的共享交互 | 结论 |
| --- | --- | --- | --- | --- |
| 全局助理 | Agent（`assistant-agent.ts`） | 平台 | 问卷卡、操作卡、下一步 | 首批，已接（AC-21、AC-23） |
| Coding | Agent（`routes.ts` 发起 Run；角色带 `ask-user`、`suggest-action`，`plugins/native/coding/src/roles.ts`） | Plugin Runtime（项目） | 问卷卡（同一个函数）、下一步、操作卡 | 首批，已接（AC-22、AC-25）；Diff、命令审查、报告保留专业呈现 |
| Form | `services.model`（`plugins/native/form/src/drafting.ts`） | Plugin Runtime（项目） | `needs_input` → 问卷卡 | 已接，单次接续的示例（AC-26）；题型只开放单选 |
| 插件创作台 | 设计者与编码者是 Prologue Skill（`horizontal/agent-host/src/adapters/plugin-builder.ts`）；生成插件的 `model.generate` 经 `hostTextGeneration` | 构建期条目（旧路径） | 无：设计者的澄清是 JSON 里的字符串题，只能问一次（`plugins/native/plugin-builder/src/agent-workflow.ts`），页面列成编号列表、在输入框里自由作答；方案卡、启用插件、选部件是自写的按钮 | 第二批接入：澄清改成带类型的题、用同一张问卷卡；方案卡保留。动提示词要 `pnpm studio:replay` 加真实模型冒烟，所以排在浏览器验证恢复之后 |
| PPT | `services.model` 的 `complete`（`plugins/native/ppt/src/actions.ts`） | Plugin Runtime（项目） | 无 | 第二批接入：「AI 生成大纲」缺受众、页数时返回 `needs_input`，照 Form 的做法 |
| Pages | `services.model` 的 `complete`（`plugins/native/pages/src/plugin.ts`；`pages.ai`、`pages.generate`） | Plugin Runtime（项目；W5-01-PAGES，问卷卡出口随动作返回） | 无；选区动作的候选浮层可改、可采用或放弃 | 第二批接入：`pages.generate` 缺要求时返回 `needs_input`。选区动作与 context-toolbar 交叉，不动。Inbox 的 `inbox.pages.generate` 转给它，跟着得到 |
| Cognia | `services.model`（`plugins/native/cognia/src/ai.ts`） | Plugin Runtime（Home） | 无；问一句 → 审阅知识草稿 | 第二批，排在 PPT、Pages 之后：范围不清时返回 `needs_input` |
| 灵光 | `services.model`，已是流式（`plugins/native/lingguang/src/plugin.ts`；首轮写的「等 prologue-adoption」已过时） | Plugin Runtime（项目） | 无；自写的对话框 | 不接入问卷：它本身是自由对话，方向在对话里说；「只带过去」把材料交给助理 |
| Alchemist | 自有 `AlchemistAiPort` → `hostTextGeneration`（`apps/local-host/src/alchemist-prologue.ts`） | 构建期；自有的流（`apps/local-host/src/alchemist-native-plugin-http.ts`），不经问卷卡出口 | 无；想法卡的保留、放弃、决定是自写的按钮 | 不接入：方向选择已经是想法卡，讨论是自由对话。以后要接，先让它的流经过 `withPluginInteraction` |
| Dataset | `services.model`（`plugins/native/dataset/src/actions.ts`） | Plugin Runtime（项目） | 无 | 不接入：模型只按一句话起一个列名，没有要先问的 |
| Workflows | 宿主注入的 `completeText`（`apps/local-host/src/workflows-actions.ts`），只用于 AI 交接环节 | 构建期 | 无 | 不接入：交接要的说明在编辑环节时填齐，运行前已核对就绪 |
| Todo | `services.model`（整理）；整理角色带 `ask-user`（`plugins/native/todo/src/roles.ts`） | Plugin Runtime（Home） | Agent 一侧的 `ask-user` 用助理的问卷卡；批量审阅是自写的 | 已覆盖（Agent 路径） |
| Issues | 助理方法 `issues-capture` 带 `ask-user`、`suggest-action`（`plugins/native/issues/src/skills.ts`） | Plugin Runtime（Home） | 经助理 | 已覆盖（经助理） |
| Jelly | `services.model` 的 JSON 输出（`plan.generate`，`plugins/native/jelly/src/actions.ts`） | Plugin Runtime（Home） | 无；生成的是待采纳的任务，不自动写入 | 不接入问卷：已经是「先看再采纳」，输入是原文或选区 |
| Shelf | `services.model`（`jobs.generate`，`plugins/native/shelf/src/ai.ts`） | Plugin Runtime（Home） | 无 | 不接入：固定配方处理选中的材料，没有要先问的 |
| Schedule | 只读 Agent（`plugins/native/schedule/src/roles.ts`，读文件、搜索） | 构建期 | 无 | 不适用：定时任务在后台跑，没有人在场回答 |
| Inbox、Feed | 场景声明 `model:invoke`（判断场景） | 构建期 | 无 | 不适用：判断不向人提问。`inbox.pages.generate` 跟 Pages |
| Images | 不调文字模型（`services.imageGeneration`） | Plugin Runtime（Home） | 无 | 不适用：本文管文字模型的问与建议；尺寸、比例的选择器另议 |
| 项目讨论 im-ui | 不调模型 | 平台侧栏 | 无 | 只核对一致性，不新增 AI 能力 |
| Goals、Files、Characters、Artifacts、Diff、Git、Text-stats、Sessions（`plugins/native/work`） | 不调模型（`plugins/native/*/src` 里没有模型调用） | — | — | 不适用 |
| 生成插件 | `model.generate`（沙箱 Broker → `hostTextGeneration`） | 创作台安装 | 无：沙箱没有 `ask-user`、`suggest-action`；操作结果包在 `value` 里交给部件，不经问卷卡出口 | 平台缺口（2026-10-18 插件一视同仁）：要先问的信息现在做成提交部件的字段（`skills/molis-plugin-dev/generated-ai.md`）；让生成插件也能 `needs_input`，要部件客户端会画问卷卡，另起一片（BL-245） |

P5 的接入顺序：PPT → Pages → Cognia → 插件创作台（等浏览器验证恢复）。每个一片，各自补用例与证据，回填上表。

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

- **新子路径 `@molis-ai/molis-work-contracts/services/agent-interaction`**：带类型的题与答案（`AgentQuestion`、`AgentQuestionAnswer`）、字段种类（与操作卡共用一套：文本、长文本、数字、单选、多选、日期、日期时间、对象引用、是否）、同排推荐的视图类型（`InteractionNextStep`：来源记录的引用、标签、强调、状态）、单次插件的「需要补充」结果（`InteractionRequest`，随 S1 加入，不在 C1+H1）。`AgentPendingQuestion` 从 `services/agent-host.ts` 搬到这里（那个文件是冻结的巨大单元，只能变小）。
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

插件把结构化输出定成 `{status: "done", …} | {status: "needs_input", questions}`，用同一套题型校验（纯函数，放在 `packages/plugin-sdk`；放 `kernel` 不行：K2 门禁不许它 import services，它也不是外部作者要装的包）；`needs_input` 时插件保存交互状态（问了什么、对应哪个对象和版本），用同一个问询组件呈现，人提交后插件带着答案再调一次。它不是持久等待，也不进 Agent 的工具循环；对象版本变了就作废重问。

### 15.8 三个示例（沿用生产路径）

1. **Agent 补充信息后继续**：全局助理「帮我约一个下周的复盘会」→ `ask-user` 带日期时间、时长（数字）、关联 Goal（对象引用）→ 填写，故意填错一个字段看逐字段报错 → 提交 → 原 Run 继续建日程。
2. **非阻塞建议**：助理回复后 `suggest-action` 给出「改到周五」→ 对话里的卡与输入框旁的同排按钮是同一条记录；在任一处执行，另一处同步。
3. **单次生成的结构化接续**：Form「AI 生成表单」缺受众与题量时返回 `needs_input` → 填写 → 接续生成。

三者写进 `skills/molis-prologue-ai/SKILL.md`、`docs/platform/PROLOGUE-AI.md` 与 `skills/molis-plugin-dev/SKILL.md`（含 `generated-ai.md`），并有对应用例。

### 15.9 BL-156：等人回答的问题活过 Host 重启（已评审，统筹 10-17 定了五点；两边都已实现）

> 状态：已实现。Prologue 半边是 prologue#40（`b541a8e6`，采用线换包），Molis 半边见本节末的「实现」（2026-10-17）。设计 2026-10-17 交互线写，采用线评审（#663 的评审意见，读的是 Prologue `24e69083`，恢复代码与 vendored 的 `d2b3daa3` 相同），统筹同日定了停放标记、写入顺序、同会话的其他轮、错误码与用例五点，下文已按它们改。对应 AC-07 的缺口。Prologue 那边由交互线写（同 BL-152），采用线下一次换包时与 prologue#39 一起换进。

**现状（源码）。**
- 问题本身落盘：`effects.pendings.restore()` 在重启后把打开中的等待读回来。期限按落盘时的墙钟截止时间重算（`pending-state.ts` 的 `deadlineWallMs`），所以重启后过期是真的过期。
- 等待的那一跑不落盘：`ask-user` 在活的工具调用里等 `whenSettled`。
- 正常关机（`composition/core/runtime-lifecycle.ts`）按顺序：`endLiveWaits()` 把有活等待者的打开中等待记成取消，`ask-user` 返回，这一跑以 `cancelled` 结束；然后 `cells.state = "stopped"`；最后对每个活的跑调 `run.cancel()`。AC-07 用例看到的就是这个。
- 进程崩溃时，这一跑停在未结束，问题成了孤儿：
  - 恢复只能 `inspect`，或者 `close`（`sessions.recoverRun`）。`close` 先取消孤儿题，再在一笔 `commitBatch` 里把这一跑记成 `RUN_INTERRUPTED`、把没读到的补充排进会话（`closeInterruptedRun`）。
  - 重开时 `composition/core/attempt-recovery.ts` 把「跑没有终态」的 `running` 计划尝试记成 `needs-reconciliation`，它的节点若是 `running` 也一起改。
  - 没有「回答孤儿题、让工作接着走」的操作。
- 新一轮的准入（`agent-run-admission.ts`）只在会话 `recovering` 时拒绝，有未结束的跑并不拒绝。
- Molis 这边：
  - `horizontal/agent-host/src/adapters/prologue-node-port.ts` 的 `answerPending` 遇到没有活执行者的题，用「原执行者已经停止或离线」拒掉。
  - 卡片据 `questionUnavailable` 显示不可答。

**做法：正常关机把只在等人回答的跑「停放」起来；新的恢复操作回答它，并把答案交给下一轮。** 不恢复那个工具调用，也不重放任何东西。崩溃留下的孤儿不是停放，照今天的规则。

1. **停放（Prologue，关机时）。**
   - **在 `endLiveWaits` 之前判定。** 一跑够格，只当它唯一在飞的是那个 `ask-user` 等待：没有模型流，同一轮里没有别的工具调用，没有已派出的操作，没有审批。依据是这一跑自己的在飞集合，不是等待账。
   - 够格的跑：
     - `endLiveWaits` 跳过它的等待，不 `persistTerminal`，题在盘上仍是 `open`；
     - 用内部的停止信号叫醒等待者（不是结算），执行者据此知道「进程要走了」：不追加工具结果，不写终态事件，不写任何日志。它落盘的前缀停在那次工具调用，和崩溃后一样（关闭时 `progressVersion === 1` 得 `durable-prefix`）；
     - 从 `live` 里拿掉，第三步不再 `cancel` 它；
     - **写一个持久的停放标记**（放在这一跑的记录上）：停在哪道题、哪一代、谁持有。
   - 不够格的跑（还有别的在飞）：照今天的规则结束。
   - **重开时**，`recoverAttempts` 见到停放标记，就不动这一跑的计划尝试和节点；没有标记的（崩溃孤儿）照今天记 `needs-reconciliation`。
2. **新的恢复操作（Prologue）。** 暂名 `sessions.answerInterrupted(session, run, expectedVersion, pendingRef, answer)`，和 `recoverRun` 放在一起。
   - **核对**（和 `recoverRun` 用同一份 `inspect`）：
     - 会话是活的；
     - 这一跑带停放标记、没有活执行者，版本与 `expectedVersion` 一致；
     - 题属于这一跑、还开着、没过期；
     - 答案用 `validateQuestionnaireAnswer` 按落盘的题核过；
     - 这一跑没有结果未知的操作。
   - **写入顺序：先结算题，再提交一笔会话账，不跨两本账合批。** 两本账虽在同一个 `ScopedStorage` 上，但 Node 的 `commitBatch` 不保证崩溃原子；从账外写等待记录还会让等待账的 `pendingVersions` 与内存里的 `held` 过时。所以：
     1. 在等待账里用答案结算这道题。这是卡片读的唯一一笔。
     2. 一笔 `commitBatch`（同 `closeInterruptedRun`）：这一跑的终态（`RUN_INTERRUPTED`，记下题和答案）、会话目录、以题号为幂等键的那条排队输入；同一步里把停放的计划尝试记成 `settled`，与停放时同一代、同一持有者，App 的下一轮照常 `beginAttempt`。
   - **补做（幂等，按题号）。** 两步之间崩溃，会留下「题已结算、跑未结束、什么也没排」。补做从存着的答案把第 2 步做完，同一道题做几次都只有一条输入。它在三处跑：下一次 `answerInterrupted`、`inspect`、重开时的扫描。
   - **补上缺口。** 今天 `inspect` 只列 `state !== "settled"` 的题，`close` 只传这些；一个已回答、还没交出的跑会被 `recoverRun` 关掉，答案就丢了。`inspect` 要报「已回答、未交出」，`close` 与 `answerInterrupted` 都先把它交出（同一个补做）。
   - **不替 App 开下一跑**：和 `recoverRun` 一样，只排队。
3. **同一会话的其他轮（Prologue）。** 会话里有停放的跑时，`startAgentRun` 用一个自己的码拒绝（暂名 `SESSION_RUN_PARKED`）。A2 交回时的自动续做（`auto`）、定时发送、新消息都一样被拒。要带的材料留在排队里，跟着答案那一轮进去。这与活着等的时候一致：那时工作卡在 `ask-user` 里，续做的材料也等它的下一轮。这样历史里「你问了 X」不会排在后来的轮次之后。
4. **模型听到的是什么（Prologue 写这段文字，Molis 不在提示词里补）。**
   - 那条排队输入的正文由 SDK 生成：说明上一轮在等人回答时中断了，原题是什么，人的回答是什么。
   - 回答部分用今天工具结果里渲染问卷答案的同一段代码。下一轮模型看到的答案，和原来那一跑会收到的写法相同。
   - `source` 是人（答案是人写的）。原题是模型自己写的，以数据形式带回。
   - 下一轮用 `history: "session"`，模型能看到中断前的那一轮。它读到的是「你问了 X，回答是 Y」，不是一个接上的工具调用。
5. **迟到、未知与错误码。**
   - 过期：`PENDING_EXPIRED`，题照旧结束，卡片给「请 AI 重新问」（另一片）。
   - 会话被取消或关掉：取消它的孤儿题，与今天相同。
   - 版本过时（这一跑在核对之后变了）：拒绝，要先重新读。
   - 有结果未知的操作：拒绝回答（`EFFECT_RECONCILE_REQUIRED`），题留着，卡上写要先核对。
   - **会话正在恢复**：另给一个码（暂名 `SESSION_RECOVERY_BUSY`），不再和结果未知共用 `EFFECT_RECONCILE_REQUIRED`。`close` 今天对忙的会话也用后者，一并改。
   - **两处同时回答同一道停放的题**（重启后的 AC-08）：
     - 同一会话的恢复一次只进一个（`recovering`），另一份得到 `SESSION_RECOVERY_BUSY`；
     - 先进的那份一结算，题就结束了；后到的再核时得到 `PENDING_ALREADY_SETTLED`。模型只听到一次。
     - 重启后的 AC-08 依赖「一个 Home 只有一个执行进程」：`recovering` 是每个进程自己的。
   - 换包片（采用线，Prologue `b541a8e6`）只把 `SESSION_RUN_PARKED`、`SESSION_RECOVERY_BUSY`、`SESSION_HISTORY_UNAVAILABLE` 加进开跑前被拒的码（`horizontal/agent-host/src/adapters/prologue-run.ts` 的 `REFUSED_BEFORE_RUN`）：三个码都在开跑写下任何东西之前抛出，这次尝试记成已定的拒绝。下面的映射和措辞（中英文）在 BL-156 的 Molis 片，不在换包片。
   - Molis 在错误映射的同一处（`horizontal/agent-host/src/adapters/prologue-control-errors.ts`，错误映射那一片）接这些码：
     - `PENDING_ALREADY_SETTLED`、`PENDING_EXPIRED` 映射成 `agent.pending_not_open`；
     - `SESSION_RECOVERY_BUSY` 映射成可重试的「还在恢复，稍后再试」；
     - `SESSION_RUN_PARKED` 映射成「先回答上面的问题」；
     - 没列出的映射成 `agent.control_failed`。
6. **副作用。** 被关机切断的、带副作用的工具调用照今天的规则处理：结果未知就一直挡着，人核对之前这一跑不能结束，不能回答，也不重放。
   - 这个操作不放松 `inspect` 的任何一条拦截，只在拦截全清时多给一个「回答并结束」的出口，与「取消并结束」（`recoverRun`）并列。
7. **崩溃孤儿。** 没有停放标记的孤儿（崩溃留下的），绑在计划步骤上时照今天记 `needs-reconciliation`。它的卡不可答，`inspect` 把它报成一条拦截：答了也没有哪一轮能接上那个步骤，所以不排一条接不上的答案。人按今天的路核对或关掉。

**Molis 这边。**
1. **谁调它。**
   - `answerPending`（`prologue-node-port.ts`）遇到「没有活执行者」的题时：如果这一跑在会话索引里、带停放标记、SDK 也没有它的终态，就走新操作，不再拒绝。
   - 在调 SDK 之前，照今天的规则核答案：`answerProblems`，以及 `ownedReferences` 回主人读引用（S-26）。
   - 这是题回答的唯一新入口。助理与 Coding 照旧经各自的回答路径到这里，不另开路由。
2. **权限在回答时取。**
   - 身份从这次调用的上下文来，不用原来那一跑的：
     - 助理是 `assistant-service.ts` 的 `answer`（`store.get(actorId, workId)`，工作得是这个人的）；
     - Coding 是会话主人的核对。
   - 回答前先用开下一轮时的同一套核对预检：项目、插件启用、动作网关。这个人已经不能动这项工作了，就拒绝，题和草稿都留着。
3. **开下一轮。**
   - 操作成功后，回答路径用现有的开轮入口开一轮：助理是 `assistant-round-start.ts`，Coding 是 `plugins/native/coding/src/start-round.ts`。两者都已经 `queued: "carry"`，排着的答案和停放期间留下的材料自然带进去。
   - `control` 的 answer 要告诉调用方「答案交给了中断的一跑，需要开下一轮」。这是 `services/agent-interaction` 的合同改动，要跑 `pnpm api:update`。
   - 开轮失败（网关拒绝、模型设置缺）时，答案留在会话排队里，人下一次发话时带进去，不丢也不重复。卡片写「回答已收下，下一轮会带上」。
   - 停放期间，助理与 Coding 的自动续做、定时发送和新消息被 `SESSION_RUN_PARKED` 拒绝；页面写「先回答上面的问题」，输入留作草稿。
4. **卡片什么时候重新可答。**
   - 只在这一跑带停放标记、`inspect` 没有拦截时可答，答案也只走上面这条路。
   - 读取路径是 `readPendingQuestion` 和 `questionUnavailable`。
   - 有拦截时（含崩溃孤儿绑在步骤上）卡片照旧不可答，原因写成要核对的那一条。
   - 助理的 `answer` 现在要求 `phase === "awaiting-input"`，对停放的题改成按上面的条件放行。

**实现（Molis 半边，2026-10-17；与上面写法不同的地方）。**
- 合同：`AgentPendingQuestion` 多 `parked?: true`（停放在重启前的题，回答会结束那一轮），`AgentRecoveryReport.runs[]` 多 `can_answer?: true` 与 `questions`；没有的字段一律读作「没停放」「没回答」。`control` 的合同不变：调用方回答前已经从读到的题看见 `parked`，「答案交给了中断的一跑」只是适配器内部 `answerPending` 的返回（`"delivered" | "queued"`）。
- 授权：停放的题经 SDK 的 `sessions.answerInterrupted`，`assertBeforeAnswer` 就是动作网关的那一份 `effects.assertCurrent`，写入前同步再查一次（S-33）。答案的检查（`answerProblems`、S-26 的 `ownedReferences`）在调 SDK 之前，照旧。
- 下一轮：各用各自主人的开轮入口，不加共享函数。助理在 `apps/local-host/src/assistant/assistant-parked-answer.ts`（宿主的话 `PARKED_ANSWER_TASK`，经助理自己的 `dispatch` 开轮）；Coding 在 `plugins/native/coding/src/start-round.ts` 的 `roundAfterParkedAnswer`，照停放那一轮的 `last-start:<会话>` 开，正文与等待醒来同一份 `continuedBody`（`waits.ts`）；开这一轮的身份是这次回答的调用者（`request.actor_id`，和继续、`goOn` 一样），不读存档里的 `actor_id`（统筹复查）。会话忙（`agent.session_busy`）只看一次恢复（`inspect`）、再试一次，不循环。
- 开不了时（统筹 10-17 定，取代上面的「回答已收下，下一轮会带上」）：卡片写「已回答，下一轮没能开始：<原因>」，答案留在会话排队里（`answer.<题号>`）；再读这项工作时写「已回答，下一轮还没开始；回答留在排队里」。重试走原有入口：助理说「继续」，Coding 点「从断点继续」。Coding 的回执由它的路由写（`message`），页面只显示。
- 停放期间新消息：助理以 `assistant.needs_check` 拒绝，动作写「回答上面的问题」，输入留作草稿；Coding 被宿主的 `agent.session_busy`（会话的恢复原因）拒绝。三个码（`SESSION_RECOVERY_BUSY`、`SESSION_RUN_PARKED`、`SESSION_HISTORY_UNAVAILABLE`）的措辞在 `prologue-control-errors.ts`，中英文进翻译门禁。
- `can_close` 不变：可答的停放轮照样能结束，结束之后的回答被拒（`agent.pending_not_open`）。「结果未知的操作挡住回答」不另写 Molis 用例：`can_answer` 只在 `inspect` 的拦截全清时给，拦截本身由 Prologue 的用例覆盖。

**测试。**
- 上游（Prologue）：
  - 一个进程里两个 Runtime：正常关机，再在同一份存储上重开。旧执行者迟到的续写什么也不写（这一跑记录的版本不变）。崩溃用例看不出这一条，因为那时进程已经没了。
  - 崩溃落在「题已结算、跑未结束」之间：补做在 `answerInterrupted`、`inspect`、重开扫描三处各跑一次，只排一条输入；`close` 会先交出已回答的答案。
  - 有停放的跑时 `startAgentRun` 被 `SESSION_RUN_PARKED` 拒绝，排队的材料随答案那一轮进去。
  - 停放的跑重开后，计划尝试与节点不进 `needs-reconciliation`；回答后尝试是 `settled`，下一轮能 `beginAttempt`。没有标记的崩溃孤儿照旧。
  - 一笔会话账、幂等、各种拒绝（含 `SESSION_RECOVERY_BUSY` 与 `EFFECT_RECONCILE_REQUIRED` 分开）。
- Molis：
  - AC-07：删掉的重启用例放回 `tests/interaction-recovery.test.ts`。关 Host 再开，回答，新的一轮带着答案跑完；模型请求里有原题和答案。
  - 重启后的 AC-08：两处同时交，只收一份，另一份得到 `agent.pending_not_open` 或「还在恢复」。
  - 结果未知的操作挡住回答；过期的题拒绝回答；停放期间新消息被拒、输入留着。

**不包含。**
- 接上被切断的工具调用。
- 恢复审批与命令等待：它们照今天的规则在关机时结束。
- 崩溃孤儿绑在步骤上时的自动解法：照今天由人核对。
- 「请 AI 重新问」：过期和已结束的题用它，另一片。

### 15.10 AC-10：Coding 问卷卡的界面验收（2026-10-19，交互线计划）

范围：Coding 对话里等人回答的问卷卡。卡由平台画（`agentQuestionHtml`，与助理同一份；2026-10-23 起 Coding 经 `services.interaction` 要，PG-062），Coding 的 `renderQuestions` 绑定它。共享部件自己的键盘、组合输入、日历已由 `interaction-client.e2e` 在组件板上验过；这一片验的是它们在 Coding 页面里、在真实的一轮里是否仍然成立，再补上 Coding 这边查出来的缺口。不改合同，不改宿主怎样出题、怎样校验。

**用户动线。**

1. 人在 Coding 发出任务，这一轮调了 `ask-user`。对话末尾出现问卷卡；输入框上方出现「去回答（N 题）」，单选题则直接是它的选项（AC-25）。
2. 人用鼠标、触屏或键盘作答。选项一按下就有按下和选中的反馈。写到一半切走或刷新，草稿还在（D13）。
3. 提交前选错了可以改：多选再点一次就取消，单选点另一项；可选的单选题能把已选的清掉。
4. 按「提交回答」或 ⌘/Ctrl+Enter 后，卡立刻进入提交中：按钮和字段锁住，说明行写「正在提交原问题的回答…」。宿主退回的题，旁边写出界限并拿到焦点。收下以后，卡换成一行回执，焦点回到输入框，这一轮接着跑。
5. 这一轮等人的时候，页面大约每秒重读一次会话。卡不重建，正在写的字、光标和焦点都不变；人往上翻着读历史时，位置不动。

**状态。**

| 状态 | 什么时候 | 界面 |
| --- | --- | --- |
| 空 | 这一轮没有在等的题 | 没有卡；输入框上方那一行收起 |
| 读取中 | 宿主还在向原问题的主人读题（`answerable: false`，原因「正在读取原问题」） | 卡在，字段和按钮锁住，说明行写原因 |
| 可答 | 题开着、这一轮没结束 | 字段可用；推荐项只标「推荐」，不替人预选 |
| 有草稿 | 人写了或选了 | 存进会话（`question_drafts`）。写不进服务时，说明行写「答案暂未写入服务，当前窗口仍保留」 |
| 提交中 | 按下提交 | `data-busy`，全部锁住，说明行写正在提交 |
| 字段错误 | 宿主逐题退回 | 只在被退回的题旁写界限，`aria-invalid`，焦点到那一题；别的题不出声 |
| 被拒（题已关） | `coding.round_ended` 或 `agent.pending_not_open` | 卡留着、关上，说明行写宿主的原话，选过的还在（AC-08） |
| 不可答 | 这一轮已结束，或题过期 | 锁住，说明行写原因，「请 AI 重新问」可按（D37） |
| 已答 | 宿主收下 | 卡换成一行回执，焦点回到输入框；页面再读一次后卡离开 |
| 无权限 | 会话不是这个人的 | 读不到会话，也就没有卡；硬交回答会被宿主拒绝（S-26、S-33 已有） |

**撤销。** 提交之前，每一项都能改回去：多选再点一次，单选换一项，可选的单选题清掉，文字删掉，日期清空，引用的芯片移除。提交之后，答案已经交给模型，不提供撤回。要改口就在输入框里补一句（回执线的「补充这一轮」）；题已关的，用「请 AI 重新问」。

**验收编号。** 用例名带编号。AC-10-1～8 在 `tests/coding-question-card.e2e.test.ts` 里；AC-10-9 改的是共享客户端，用例跟着它放在 `tests/interaction-client.e2e.test.ts`，另有节点用例 `interaction-components`、`coding-question-card`。

- **AC-10-1 三个宽度。** 1440、1024、390 px 下，卡在 Coding 的对话栏里，卡和页面都没有横向滚动，卡里的控件不越出卡。390 px 下，卡里每个能点的控件短边不小于 44 px（`DESIGN.md`「Focus and accessibility」）。截图存进评审目录。
- **AC-10-2 深色。** 深色下，卡的正文、说明、「推荐」标签、错误行与各自背景的对比度不低于 4.5:1；选中的选项：底色对卡面、选中标记对底色不低于 3:1。按浏览器算出的颜色量。WCAG 1.4.11 要 3:1 的是认出控件和它的状态所必需的部分；没选中的选项靠文字认出，它的边框是 `--line`（深色下约 1.3:1，实测深色 1.29:1、浅色 1.22:1），不在这一条里（2026-10-19 写第二片时改正：原写「选项的边框和选中标记」，边框做不到，也不是认出选项所必需的）。
- **AC-10-3 键盘。** 从输入框经「去回答」那一步到卡的第一题；方向键选，Tab 走，⌘/Ctrl+Enter 提交。收下后焦点回到输入框，不落在 `body` 上；从输入框旁的下一步行答题（那一行随后重画）、回答被拒而控件锁住时也一样。
- **AC-10-4 输入法。** 卡上的文字题用真实的组合输入（CDP `Input.imeSetComposition`）写中文：组合中的回车不提交、不跳题，组合结束后才进草稿。真机中文输入法仍归用户验收（BL-016）。
- **AC-10-5 减少动态。** `prefers-reduced-motion: reduce` 下，卡出现、选中、提交时都没有正在运行的动画或过渡。
- **AC-10-6 后台更新。** 等人的时候页面至少重读三次：卡还是同一个节点，写到一半的字、光标位置和焦点都不变；人往上翻时，对话的滚动位置不变。
- **AC-10-7 长内容。** 很长的题干和选项说明在 390 px 下折行，不撑破卡；提交按钮仍在卡内，可以按到。
- **AC-10-8 读屏语义。** 卡有可读的名称（它的标题）；只选一项的题，选项是 radio（`aria-checked`）；可选几项的题，选项是开关按钮（`aria-pressed`）；都读得出选中与否。说明行是 `role=status`，提交后的回执写进这一行，能被读出来。回执只在这一轮继续之前出现：宿主收下回答就把这道题从等待回答里去掉，页面随后马上重读会话，把已不在其中的卡撤掉（之后每次重读相隔约 350 到 1200 ms），所以它在页面上只有一瞬。读屏能否把这一瞬读完整，归用户真机验收（BL-016）；要不要让回执多留一次重读，由那次结果定（BL-246）。
- **AC-10-9 撤销。** 可选的单选题选了以后，能清掉选择（共享客户端，助理那边一样受益），草稿跟着清；必答的单选题不能清空，只能换。

走查：在一次性 Home 里用本机假模型走一遍上面的动线，三个宽度加深色各截一张图。

**分两片（统筹 10-19 派单 §3a）。** 第一片只改共享问卷部件（设计系统的渲染、客户端与样式，宿主的卡传一句文字）：AC-10-9。可选的单选题多一个「清除选择」，只在选了以后出现；按下清空选择、草稿跟着清，焦点回到这一组唯一的停留点。字节在同一处抵掉：两张样式表里选中态的两组相同声明合成一条，客户端脚本收短几处写法，`workbench.css`、`arrival.css` 各少 36 字节，`workbench.js` 少 17 字节。第二片改 Coding 的 `client.ts`：收下后焦点回到输入框、回执能被读出（AC-10-3 末段、AC-10-8），连同 AC-10-1～8 的浏览器用例；#759 合入后写成，由 #815 合入（`c17504473`），见 §18。

**待补浏览器验证**（用户 10-19 暂停本机浏览器验证；暂停解除后、验收之前一次做完）：

| 动线 | 宽度与主题 | 验收编号 |
| --- | --- | --- |
| Coding 发任务 → 问卷卡 → 作答、改选、清掉 → 提交 → 回执、焦点回输入框；等人时页面重读三次 | 1440、1024、390，深色 | AC-10-1～9 |
| Form「AI 生成题目」：第一次补问被拒，同一要求重试拿到合法的卡：旧错误撤下、首题获焦、作答前题数不变；作答被逐字段退回时前一次的错误不留（QA-002） | 1440、390，深色 | AC-26 |
| 助理问卷卡上可选的单选题：选了出现「清除选择」，按下清空、焦点留在这一组 | 1440、390，深色 | AC-10-9 |
| `interaction-client.e2e` 的 AC-10-9（本机没跑，CI 全量跑） | 1000 | AC-10-9 |
| §20.15 末「实走」：助理与 Coding 的问卷卡、操作卡、Option、下一步 | 1440、1024、390，深色 | AC-02、AC-06、AC-25 |
| 英文界面、不配模型，助理开始新工作发一句：失败框整句英文、草稿原样、「Open model settings」打开模型设置（QA-001） | 1440、390 | AC-10 |
| `coding-question-card.e2e` 的 AC-10-1～8（写好，本机没跑，CI 全量跑） | 1440、1024、390，深色 | AC-10-1～8 |
| `generated-ai.md` 的真实模型冒烟：在隔离 Home 的设置页配好模型，跑 `pnpm studio:replay smoke`（`docs/platform/STUDIO-SKILL-REPLAY.md`） | 不涉及 | AC-12 |

### 15.11 AC-06：卡片的结果进下一步行，Coding 同排（H4）（2026-10-19，交互线）

范围：操作卡跑完以后，结果怎样从对话走到输入框上方那一行。位置、顺序和页面怎样按，用情境线的结果位接口（`specs/context-program/spec.md` §21.9，#780）；本片只加「最近跑完的那张卡的结果」这一支，助理和 Coding 用同一个函数（`apps/local-host/src/agent-next-steps.ts` 的 `cardOutcomeSteps`）。不改合同，不改设计系统，不改 `assistant-island.ts`，不改 Coding 的页面脚本（`coding.js` 不变）。

**用户动线。**

1. 助理（或 Coding 的一轮）给出一张操作卡。人按「执行」，卡变成「已完成」，卡里的结果带一个「打开」（主人在动作的结果视图里声明的链接，例如「继续接入」）。
2. 输入框上方那一行，在等你的之后出现一步「打开「结果标题」」。按下它，和按卡里那个「打开」完全一样：页面把卡带到眼前，再按这个控件。没有第二条执行路径。
3. 人接着发下一句话，新的一轮开始：这一步消失。新的一轮做完，结果位换成这一轮的结果。

**状态。**

| 状态 | 什么时候 | 下一步行 |
| --- | --- | --- |
| 空 | 没有跑过的卡，或最近跑完的那张卡的结果没有可打开的 | 不占位，结果位交给这一轮的结果 |
| 进行中 | 最新一轮还没结束（含等人回答、待核对、状态未知） | 不给卡片的结果步 |
| 这一轮失败 | 最新一轮失败了，哪怕其间有卡跑完 | 助理的结果位只给「再试一次」（`context-program` §21.9，#791）；卡的结果照样画在对话里。Coding 的行没有「再试一次」，仍按 AC-06-5 给 |
| 已完成 | 最近跑完的那张卡已完成，结果有「打开」，而且是在最新一轮开始之后跑的 | 一步「打开「…」」，排在等你的之后、这一轮的结果之前；结果位一次只说一件事 |
| 失败、未确认 | 最近跑完的那张卡没有完成或结果未确认 | 不给结果步；这张卡本来就在等你的里（「去处理：…」） |
| 忽略、失效 | 卡被放下或过期 | 不算跑过，不影响哪张是最近跑完的 |
| 另一张卡正在跑 | 最近跑完的那张卡之后，又有一张卡在跑 | 正在跑的不算跑过：仍给上一张跑完的卡的结果 |
| 无权限、已停用 | 结果的链接打不开 | 宿主只给内部链接（`presentActionResult`），页面照常按；打不开时由打开的那一处说明 |

**撤销。** 结果里的撤销现在不在卡上：可撤回的改动列在侧栏（`view.undoable`，不带卡片编号，`assistant-island.ts` 画）。卡片结果要带「撤销」，得先让撤回记录认得是哪张卡，那是合同改动，不在本片。

**验收编号。** 宿主端在 `tests/assistant-interaction-html.test.ts`，页面端在 `tests/assistant-step-row.test.ts`，Coding 在 `tests/coding-next-steps.test.ts`。

- **AC-06-1 按的是卡里那个控件。** 卡片结果的「打开」带 `data-ix-press="open"`；下一步的 id 是 `card:<卡>:open`，字样「打开「结果标题」」，结果没有标题时用卡的标题。
- **AC-06-2 只看最近跑完的那张。** 已完成、失败、未确认的卡里最晚的那张，而且是在最新一轮开始之后跑的；它失败或未确认时不给结果步；结果没有可打开的不给；忽略、失效的卡不算跑过；一轮还没结束不给（停下的一轮算结束）；助理这一轮失败了也不给，结果位留给「再试一次」。
- **AC-06-3 结果位一次一件事。** 卡片的结果在等你的之后、这一轮的结果之前，二者只出一个；不把等你的挤出前三（沿用 SLOT-01）。
- **AC-06-4 页面按的就是它。** 宿主给的那一步按下卡片结果自己的「打开」，不按卡的「执行」，卡被带到眼前（沿用 SLOT-02 的禁用与未发出的修改规则）。
- **AC-06-5 Coding 同排（H4）。** Coding 的下一步行同样给这一步，排在 Coding 自己的「查看变更」之前（「核对并继续」只在这一轮待核对、还没结束时出现，那时不给这一步）；id 是那个「打开」的选择器，Coding 页面按选择器按它；这一轮没有结束不给，失败了照样给（Coding 的行没有「再试一次」）。

**待补浏览器验证**（用户 10-19 暂停）：在一次性 Home 里，助理和 Coding 各跑一张带结果链接的卡，下一步行出现「打开「…」」，按下与按卡里的「打开」相同；1440、390，深色各一张图。

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
| D8 | Agent 能渲染哪些题型由谁声明（2026-10-12，本线自定；**改订**：同日读 SDK 后发现 `askUserQuestionTypes` 与 `inputWaitTtlMs` 是 Runtime 级配置，不是每个 Run 或角色一份） | 每个读 `awaiting_input` 的界面（现在是助理和 Coding 两处）各声明自己画得了的题型（`apps/local-host/src/agent-question-surfaces.ts`），宿主给 Runtime 配**交集**；缺省只有选择题。界面加一种题型，与让它画出这种题型的改动在同一个 PR。取舍：交集意味着只要有一个界面还画不了 `date`，所有 Agent 都问不到 `date`——代价是 A1 与 A2 之间助理和 Coding 要么一起开放一种题型，要么都不开放；好处是不会有一个 Run 问出某界面画不出来的题，把人卡住。若要按界面分开开放，需要 SDK 把题型配置下放到 Run（Prologue 侧改动，本线先不要求） | 助理、Coding 合入各自接入片之前，带类型的题在产品里不会出现 |
| D9 | 助理问题卡的渲染位置（2026-10-12，本线自定） | 宿主用设计系统渲染函数把卡片渲染成 HTML 放进视图（同 Coding 的 `question.html`），助理岛只接行为 | 岛是字符串脚本，不能在浏览器里调设计系统的渲染函数；这样只有一份渲染，岛的字节变小 |
| D10 | 回答的身份与 R4 | 待统筹定（§17.1「跨线待定」） | 影响 C1、A1 与回执线 1e |
| D11 | C1 与 H1 合成一片、S1 移到 A1/A2 之后（2026-10-12，统筹定） | 带类型的题在宿主里一次做完（合同子路径、投影、预检、错误码、等待期限、题型交集），叠在 #408 上；题型校验函数放 `packages/plugin-sdk`；S1 等助理与 Coding 的问卷体验做完再做。取舍：C1a（#447）因不含使用者而关闭；#408 若迟迟不合，这一片 PR 里会带着 #408 的提交一起评审，base 在 #408 合入后改到 main | 用户先得到助理与 Coding 的问卷；S1 需要新增 Form 功能与 SDK 出口，体量最大，放最后 |
| D12 | A1 的字节办法与共享客户端放在哪（2026-10-13，本线建议，**放宽一项待用户定**） | 按 §20.11 的送出字节：先做 (a)+(b)（只带 A1 用到的脚本与样式段、与原语去重、删被替换的旧渲染），CSS 再用 (b′) 删已核实无人引用的旧皮肤规则抵平；`workbench.js` 仍多约 +6.9 K，请用户给一次性、有上限的放宽，由 H2 合入后偿还。`INTERACTION_CLIENT_SCRIPT` 只进 `workbench.js` 一份，A2 用宿主提供的那份，不在 5 个 Coding 系插件包里各嵌一份。取舍：放宽门禁要先问用户；不用内联样式绕过预算（不量内联，但每次重发、不能缓存） | A1 的 PR 描述要附实测；`tests/interaction-components.test.ts` 里「样式不进冻结样式表」一条在 A1 改成断言采用后的状态 |
| D13 | 问卷草稿存在哪（2026-10-14，本线定，技术决定按防腐后果） | 存在工作自己的记录里（`StoredWork.question_drafts`，按 pending 号，最多留 4 份，答完即删），不新开 `assistant_question_drafts` 表 | 新表要把助理库的基线版本从 2 升到 3：`applySqliteBaseline` 对版本不符的库直接拒绝打开，每个已有 Home（含真实 Home）都要先维护才能再开助理库；`AssistantStore` 的方法数已超限、不能再加方法。工作记录本来就随工作走，草稿跟着工作删；代价是每次存草稿工作的 `revision` 加 1（与输入框草稿相同） |
| D14 | 下一步放在哪（2026-10-14，本线定，按体验推荐） | 留在原「接下来」行的位置（最新一轮之下），由宿主的纯函数从工作派生（失败 → 用同样的话再试一次；完成且有结果 → 打开结果，最多两个），画成共享的下一步部件；问题与操作卡的「去回答 / 去处理」仍由顶部条带给出，不在下一步里重复 | 放进底栏输入框旁会改动共用的底栏（项目选择页也用），布局要另做验证；留在线程里保持阅读顺序，字节相同 |
| D15 | 样式怎样只带用到的（2026-10-14，本线定） | `INTERACTION_STYLES` 拆成七段：问卷、日期、数字与日历、对象行、操作卡、下一步、留痕（出处、字段提示、回填与刷新标记、已答摘要、版本、结果、输入框标记）；工作台与项目选择页只带前四段（问卷、日期、操作卡、下一步），设置页不带。脚本用不带日历的 `INTERACTION_CLIENT_SCRIPT_TYPED_DATES`，日期手输、星期照显 | 项目选择页也挂助理岛（`arrival/chooser.ts`），所以 `arrival.css` 也要带，§20.11 说「只进 workbench.css」不对；日历按需等有日期题时再带 |
| D16 | 旧皮肤抵字节删哪些（2026-10-14，本线定，用户已准 (b′)） | 只删 `momentum.ts` 里每个选择器都含 `.momentum-*` 类的 140 条规则（加 `craft-finish` 里一条同类）：逐个类核过，非样式源码里没有任何标记或脚本画出这些类（现在的推进态势画 `goal-canvas-*` 类与 `[data-goal-momentum]` 钩子）；只钉这些死规则文字的断言随之删去，「Goal 编号留在节点上」改到现行的 `.goal-canvas-node small` 上断言 | 一整族删干净比挑够数更好核；其余候选（`personal-*`、`desktop-*` 等）留给防腐 W5-05 |
| D17 | `assistant-base` 升版放在哪一片（2026-10-14，本线定） | 不在 A1：助理声明 `["choice"]`，但 Coding 仍是空，交集为空，模型拿到的仍是纯选择题；提示词这时讲带类型的题与 `reference` 题，就是在讲模型没有的工具。改到让交集非空的那一片（A2）一起升 | 提示词与工具形状同步 |
| D18 | 问卷卡与「读回答」各放哪（2026-10-14，本线定） | 卡由宿主画，放在 `apps/local-host/src/agent-question-card.ts`（助理与 Coding 的问题都在宿主那一层附 HTML，同一个函数）；把卡里的字段读成运行的回答放在插件开发包 `questionAnswer`（宿主的助理 HTTP 用它，Coding 的页面脚本把它按文本嵌入，与嵌入代码高亮同法） | 两边各写一份就是同一个事实的两个主人；读回答要同时在宿主和页面里用，按 AGENTS 的规矩，作者和平台共用、会运行的工具放在插件开发包里。代价：改插件开发包算共享核心，要跑全量 |
| D19 | 共享客户端只在一处（2026-10-14，本线定） | `workbench.js` 的初始化里定义一次，经宿主对象交给助理岛与所有延迟加载的插件客户端（Coding 拿到的是 `host.interaction`）；项目选择页内联一份给它自己的岛 | 不在 5 个 Coding 系插件包里各嵌一份；岛也不再自带一份（A1 时嵌在岛里） |
| D20 | 带类型的选择题开放（2026-10-14，本线定，按 D8） | 助理与 Coding 都声明 `choice`，宿主给 Runtime `askUserQuestionTypes: ["choice"]`；`assistant-base` 升到 25、`coding-base` 升到 10，各加一句怎样写选项说明、推荐与选填；ISSUE-34 改为断言带类型的合同（缺 `label` 的选项被拒并说明，只纠正一次） | 两个界面都画得了带类型的选择题，按 D8 就在同一个改动里开放；其他题型等两边都画得了再开 |
| D21 | 对象候选动作叫什么、挂在谁下面（2026-10-14，本线定，技术决定按防腐后果） | `search.references@1`，挂在现有的 `system.search` 提供方下（原计划名 `interaction.references.search`）；候选 = 调用者的搜索按种类找到的、调用者自己项目里或 Home 范围的对象，每个再经对象主人的读取器（`resolveActionSubject`）以调用者权限读一遍；提交前的复核（`confirmReferences`）用同一次读取。受众只给人与页面（`user`、`plugin`），不给模型 | 新建提供方要多一处 `registerProvider`，门禁冻结这个数；候选本来就是「搜索 + 主人重读」，事实主人是搜索。情境线落点的 `find` 可直接调它。限制：没有搜索来源或没有读取器的种类挑不到 |
| D22 | 复核不过时怎么说（2026-10-14，本线定） | 合同加一个宿主自己的原因 `reference-unavailable`（`AGENT_QUESTION_HOST_REASONS`），与 SDK 的 19 个原因分开列；仍是 `agent.answer_invalid`，标在那一题上，别的题与草稿不动 | 不混进 SDK 的闭集（那份要与 SDK 一字不差） |
| D23 | `assistant-base` 里对象引用题那句放哪一片（2026-10-14，本线定，同 D17） | 放到开放 `reference` 题型的那一片，不在 H3 | H3 之后模型仍拿不到 `reference` 题；提示词先讲就是在讲它没有的工具 |
| D24 | D14 改订：下一步放到输入框同一行（2026-10-14，情境线提议、本线同意） | 助理面板里的下一步从「最新一轮之下」挪到与输入框同一行，窄屏移到输入框上方；布局与动线归情境线（总纲 §21.2、§21.5，W3-A1 实现），本线 H3、H4 的呈现照这个布局，不另排。派生仍是宿主的纯函数（`assistant-view-html.ts`），加两类来源：等你确认的卡、等你回答的题。本线守住的语义：1. 下一步只是记录的另一个入口，做的事与卡上主按钮、题上选项完全一样，走同一个 `runCard` 与回答路径，带同一个版本；2. 只有「一组里就这一道、单选、没有别的必填」的题，点选项才直接交回，其余题只给「去回答（N 题）」；3. `needs-input` 的卡、卡上有没交的改动时，下一步只把人带到卡上，不直接执行；4. 失效、执行中、已完成的卡不进下一步；5. 同一件事只出现一次 | 原 D14 放在线程里是为了不动共用底栏；情境线接手底栏与面板布局后，这个顾虑由它的版面验证承担。回到 §3 第 2 条「与输入框平齐」的原意。H4 的 Coding 下一步用同一套派生规则 |
| D25 | H4 第二部分：Coding 的建议怎样落成卡（2026-10-15，统筹定，选 A） | 建议进运行视图：agent-host 在运行账本里记它，`AgentRunView` 加 `offers`，与 `awaiting_input` 同类，是这一轮自己的不可变事实；Coding 读运行时把它落成自己的卡，存在 Coding 自己的表 `coding_action_cards`，删项目、停用时走 W4-11 的登记表一起清。附三个要求：(1) 落卡幂等，按 offer 的 id 加 revision 去重，读几次都只落一张；(2) 落卡是 Coding 写自己的表，写之前照样过 `beforeEffect()`，被撤权或停用的那次读不落卡；(3) `offers` 是 `contracts/services/agent-host` 的合同改动，跑 `pnpm api:update`，PR 写清对调用方的影响。建议只能指向本轮冻结的 `action_tools`（精确引用）；只有角色 `host_tools` 写了 `suggest-action` 的 `operate` / `workspace-write` 角色才有这件工具 | 宿主不写 Coding 的表，宿主里也不按插件分支（B 做法「宿主调 Coding 的动作记录」两样都违反，还要另立一条只许宿主调的身份规则）；审计留在运行账本里 |
| D26 | 卡的判断逻辑放哪（2026-10-15，统筹定） | 从 `assistant-offers.ts` 抽进 `plugin-sdk`：可改字段、输入校验、过期 / 未知 / 冲突的分类、结果的一句话，加端口 `CardStore`、`CardAuthority`（都定义在 SDK 里）。SDK 这部分只依赖 contracts，不碰存储实现；助理用 `assistant-store` 实现两个端口，Coding 用自己的表实现。公开 API 快照随之刷新；SDK 算共享核心，跑全量 | 作者和平台共用、会运行的工具只留一份，放在 SDK（AGENTS 硬约束）；Coding 是插件，只能依赖 contracts、SDK、design-system |
| D27 | 在 Coding 里点卡算不算人的确认（2026-10-15，统筹定：算，与 H2 同一口径） | 确认绑定卡上显示的那一个 revision，改了可改字段就成了新 revision，要重新点；动作本身还要走的审查（审查队列、高风险策略）照旧走，点卡不能替代；执行仍按这一轮冻结的同一份授予，在 Coding 自己的路由里先认领再 invoke，过期、未知、冲突都不执行 | 与助理不另起一套；卡上已摆着对象、参数与影响 |
| D28 | H4 第二部分的切片顺序（2026-10-15，统筹定） | 2b 先做：判断逻辑抽进 SDK、助理改用，行为不变；不碰 agent-host，不进 agent-host 的串行，#554 合入后开工，不碰 `assistant-island.ts` 与发送路径（1d、W3-A2、W4-10 的地盘）。2a（agent-host 的逐项回合 `suggest-action` 与 `AgentRunView.offers`）排在 agent-host 串行的 1d 之后，与采用线 P3b（只加用例）、P3c（外部检查器：`prologue-node-port`、`prologue-node`、`agent-host-composition`、errors、Coding 的 `roles.ts` 提示词）没有共同文件，可以并行、不分先后（统筹 2026-10-15 定）。2c（Coding 的表、路由、页面、下一步接卡、浏览器用例）在 2a、2b 之后；若要改 Coding 的 `roles.ts`（如给角色加 `suggest-action`），排在 P3c 之后。三条新安全不变量（建议超出本轮 `action_tools` 或由只读角色发出被拒；卡只执行显示的精确引用、revision 不符被拒、同一张卡不能认领两次；撤权或停用后不执行也不写卡的结果）按 `SECURITY-INVARIANTS.md` 的写法登记，各带断言「拒绝」本身的用例，随引入它的那一片 | 2b 不依赖 agent-host，可以与那条串行并行 |
| D29 | 放开题型分两片（2026-10-16，统筹定，选推荐） | T1 放开文字、数字、日期、日期时间；对象引用另作 T2 | 问卷卡由宿主在服务端画，对象引用的候选要在画卡时列出：每次读视图都经 `search.references` 拉候选，Coding 又频繁轮询，要另做缓存或按需加载；D23 定了 `reference` 的那句跟开放它的那一片走；页面上 `search.references` 的调用方在情境线 W3-B |
| D30 | 日期怎样填（2026-10-16，统筹定，选推荐） | 日期手输，旁边显示星期，不带日历弹层；为空或填错时不显示星期，为空时占位提示格式 | 与 D15 一致；带日历要把工作台的客户端从 `INTERACTION_CLIENT_SCRIPT_TYPED_DATES` 换成完整脚本，约多 5 KB |
| D31 | 日期时间按哪个时区（2026-10-16，统筹定，选推荐） | 按本机时区，卡上只显示一处，紧跟在时间框后面（如「中国标准时间（UTC+8）」）；回答写成带偏移的 ISO 时间 | 宿主与浏览器在同一台机器上，两处读本机时区一致；另一种做法要 Prologue 的题目自带时区，要改上游 |
| D32 | 放开题型时提示词升不升版（2026-10-16，统筹定） | 不升：`assistant-base`、`coding-base` 都不改。#602 定了分层，base 只留判断，工具怎么用写在工具自己的描述里；新题型和 `min`/`max`/`integer` 都在 `ask-user` 的 schema 里。改为一条确定性用例：放开后，真正发给 provider 的请求里，`ask-user` 的 schema 列出这五种题型与它们的参数（AC-27-1） | 原方案（D17、D20 的做法）是各加一句怎么用；与 #602 的分层冲突 |
| D33 | 字段名带题型、Coding 怎样交回答（2026-10-16，本线定，技术决定按防腐后果） | 卡上的字段按题型命名（`q`/`t`/`n`/`d`/`w` 加题号），插件开发包的 `questionAnswer` 按名字读出回答；名字只是读法，回答对不对以 Runtime 手里的题目为准（字段改名交上去照样被拒，统筹 10-16 要求的用例）。Coding 的页面不再内嵌 `questionAnswer`，交回卡上字段原样（`values`），由 Coding 路由的 `toInput` 用插件开发包读成回答，再交给动作 `coding.runs.control`；动作的输入多了 `value`，按 `CONTRACT-CHANGES.md` 升到 version 4 | 页面与宿主都不必另拿题目；读法只在插件开发包一份，Coding 页面少带约 1.3 KB；`coding.runs.control` 只给本人（`user`），固定 v3 的引用只有助理调用 Coding 一处，同一个改动里改完 |
| D34 | 输入框的「回答上面的问题」芯片在问卷下怎么办（2026-10-16，统筹提出二选一，本线选 (a)） | 芯片也覆盖「问卷里只有一道文本题」：此时输入框的话作为这道题的回答（`{ question, value }`）交给 Runtime，题的规则（字数等）照样由 Runtime 判；两道题以上、或唯一的一题不是文本题，仍只在卡上回答。哪一题能从输入框回答只由宿主判一次（`assistant-inputs.ts` 的 `freeTextQuestion`）：交回答时用它，画视图时在那一题上标 `from_composer`，页面（`assistant-send.ts`）只读这个标记，不再自己写一份条件；Assistant 交回答时按 Runtime 读到的这一轮判断（会话摘要里的问卷还没读出题目） | 统筹实走发现：模型提问只走问卷，芯片原条件（只有一个等待项、`allows_free_text`、不带 `questions`）在现有合同下出不来；T1 放开文本题后，一道文本题的问卷就是一道自由文本题，人在输入框里打字回答最自然。另一种 (b) 去掉芯片，会让人在输入框里写的话只成补充、不算回答（回执线 D14 的「补充要求不代替回答问题」），多一步 |
| D35 | 数字题的单位（2026-10-16，用户批准上游加 `unit`；统筹 10-17 开这一片） | 题目带 `unit`（Prologue #32，经 #615 换包进 `AgentQuestion`）时，卡上在步进器后面写单位，读屏时随字段读出（`aria-describedby` 先指单位、再指报错行）；报错行的界限带单位（「不能超过 120 分钟」「不能小于 15 分钟」）。单位只是显示，回答仍是纯数字；单位由模型写，不翻译。没有 `unit` 的题照旧只写数字，不从题干里猜 | T1 先只写界限（统筹 10-16）；样式 `.mw-ix-unit` 在 T1 已随日期段进工作台与项目选择页两张表，这一片不加页面资源 |
| D36 | 对象引用题怎样开放（T2；2026-10-17，统筹定四项、本线定做法） | ①候选按需搜：卡上不列候选，只放一个搜索框，人打字时页面才调 `search.references`（带题目的 `ref_kinds`，经工作台与项目选择页同一条路由 `/api/search/references`）；画卡、读视图、Coding 轮询都不搜。②回答里的标题取自对象主人现在的读法：宿主在交给运行之前经主人逐个再读（#618 的 `readReferences`），页面给的标题一律不用，读不到的仍是 `reference-unavailable`。③提示词不升版（同 D32，统筹 10-17 定，D23 那一句不写），由 AC-28-1 的 schema 用例代替。④模型怎样知道有哪些种类：Prologue 加 App 配置 `tool.askUserReferenceKinds`（用户 10-17 弹窗批准；schema 里写成 enum，清单外的种类当场退回），由采用线提上游（prologue#33，`c673238e3`）、并进下一次换包；T2 在换包合入后开 PR。清单由宿主的 `hostReferenceKinds()`（`agent-question-surfaces.ts`）从随宿主发的内置 Manifest 算：插件为搜索列出、又有读取动作的种类，带声明里的中文名（现在 22 种）；Prologue 在建 Runtime 时定下清单，所以按 Manifest 算，不按某个项目当时的目录算。外部插件的种类当时不在清单里；D38 之后每一轮按自己项目的目录算（BL-152）。⑤字节差额由用户 10-17 弹窗批，上限 `workbench.css`、`arrival.css` 各 +1,344、`workbench.js` +4,090、`settings.css` +19（输入组获焦只画一圈的修法），按 3c 的做法进一次性 `APPROVED_CEILINGS`，换掉 3c 用完的条目 | D29 的轮询问题在按需搜下不存在；`search.references` 本来就要求 `query`。模型自己写的种类名（`cognia_material`、`shelf_item` 一类）猜不出来，猜错就没有候选，题等于白问 |
| D37 | 「请 AI 重新问」怎样落实 D5（2026-10-17，统筹批准文件清单与插件 SDK 里的同一份构造，本线定做法） | 只给已经不能回答的问题（过期、宿主重启时结束的）；页面只说是哪一个问题（`reask: { run_id, pending_id }`，类型 `AgentQuestionReask`），一轮的话由宿主写（`QUESTION_REASK.task`），原问题从这项工作／这个会话自己的 Run 读，草稿从宿主保存的那份读，带成一份只写事实的材料（原问题、结束的原因、没交出去也没确认过的草稿；`questionDraftMaterial`，助理与 Coding 同一份文字；运行时本来就把材料当成数据交给模型，不在材料里写指令），怎样用草稿写在以用户口吻说的那句话里（可以当默认值，确认后再交）；重新问被拒时不把宿主的话存成草稿，HTTP 层先拒绝不在已有工作上、或同时作为回答、指向一条输入的；还能回答的、不是这项工作或这个会话的、已经不在的，各有错误码拒绝，不开始任何一轮。**BL-156 之后**：重启不再结束等着回答的那一轮，它停放在题上，题可以直接回答（§15.9「实现」）；关掉它之前重新问得 `assistant.state`「这个问题还能回答，请直接回答」，关掉之后照常重新问、带着人的草稿（`tests/interaction-reask.test.ts` 三步都断言） | 页面不能把自己的话当成「草稿」或「这一轮的任务」交给模型；同一个问题在两处按同一种形式重新问 | 不重放原问题，模型按现在的情况重新问；重新问后原卡仍是不能回答的旧卡 |
| D38 | 外部插件的种类怎样进对象引用题（BL-152；2026-10-17，统筹认可计划并定五点，本线定做法） | 每一轮开跑时，宿主按会话记录里的主人，从这一轮项目的动作目录现算清单（插件为搜索列出、自己读得回的种类），经 Prologue 的 `agent.askUserReferenceKinds` 交给这一轮，换掉 Runtime 那一份（内置插件的）。统筹定：①不合格的条目丢掉、这一轮照样开跑，每个插件每种问题在「插件接入诊断」里记一条，不进模型；安装时就拒等 SDK 的 Manifest 解析成了唯一校验种类的地方再说。②长度与数量上限直接取 SDK 导出的 `QUESTIONNAIRE_LIMITS`，宿主不另写数字；种类的标识写法 SDK 和 contracts 里都没有校验函数，所以写在 agent-host 的 SDK 常量旁边。③顺序固定：按插件标识、再按种类，同一个项目两轮之间工具定义不变（原来「内置在前」，2026-10-25 按插件同等待遇改为每个安装同样的份额，PG-015）。④项目里隐藏的、项目没显示的内置插件、动作不可用的，都不进。⑤端口不在、查不到或为空时退回内置的那一份；子任务沿用这一轮的（Prologue 的做法），Molis 的子角色本来拿不到 `ask-user` | 外部插件列出的种类，助理和 Coding 都能问到；作者能在诊断里看到自己哪一条没进、为什么 | 只看这一轮开跑时的目录：轮中装上或停用的插件，下一轮才算；诊断按全部视图算，「上限」一条与某个项目实际的清单可能差几项 |

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

**归属补记（2026-10-19，统筹派单 D4）**：PG-036（`assistant-service.ts` 里 31 处 `executor.kind === "coding"`，讲助理怎样跨插件把活交给 Coding）改归本线，属防腐阶段 4，等阶段 3 与 W5-10 之后开工，现在只记归属；PG-054（Coding 把运行时写死成 `"prologue"`）仍归采用线（10-20 改派 ②，③ 执行，见 `specs/repository-anti-corruption/privileges.md`）。交互线 2026-10-20 收尾后，PG-036 不再归本线，按 `specs/repository-anti-corruption/privileges.md` 的 PG-036 行跟踪。

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
| C1+H1 带类型的题进宿主（一个 PR，叠在 #408 上；原 C1、H1 合并） | 新子路径 `services/agent-interaction`：带类型的题 `AgentQuestion`（六种题型、`required`、`help`、选项说明与推荐、`default`、上下界、`ref_kinds`/`max_count`）、回答 `AgentAnswerControl`（`answers[].value`）、字段问题 `AgentQuestionProblem`（SDK 的 19 个闭集原因）、`AgentPendingQuestion` 从 `agent-host.ts` 搬来、错误码 `agent.answer_invalid`（带 `problems`）。agent-host：`projectQuestion` 显式投影（不再透传 SDK 选项对象）；`answerPending` 先用 SDK 的 `validateQuestionnaireAnswer` 预检，形状错误与逐题问题都有码；配 `inputWaitTtlMs` 24 小时（D5）与 `askUserQuestionTypes`。宿主装配给 Runtime 的题型是**所有读 `awaiting_input` 的界面都画得了的交集**（D8）：助理、Coding 现在都只声明 `choice`，所以合入后产品行为不变，A1/A2 各自加上自己画得了的题型。回答的 `key` 不在这一片（归回执线 `services/agent-inputs`，那一线就绪时在 `AgentAnswerControl` 上加一个可选字段） | AC-19、AC-20 | #408 的分支（带带类型 `ask-user` 的 vendored SDK） | `pnpm api:update` 刷新快照；`agent-host.ts` 只减不增（本片净减 24 行）；`prologue.ts`、`prologue-node.ts` 不超上限；所有消费者在同一 PR 改完（`docs/system/CONTRACT-CHANGES.md`）；真实 Node Host 用例：带类型的问卷落盘、关闭、新 Runtime 读回并作答，`prologue-*` 用例按 AI Skill 要求跑 | `services/agent-host.ts`、`packages/contracts/package.json` exports、`tooling/gates/api/`、`prologue-node.ts`、`prologue.ts`、`prologue-questions.ts` | #408 合入 main 后 PR 的 base 改到 main；#408 之后 main 新增的错误模型（`error-owners.json`、`defineErrorCodes`）在 rebase 时要把 `agent.answer_invalid` 登记进去；回执线同改 `AgentRunControl`（搬出 steer 分支）：先合者先合，后合者重排 |
| A1 助理接入 | 宿主把问题转成 `InteractionQuestionView`（新协作者 `assistant-questions.ts`，不让 `AssistantService` 变大）并服务端渲染出 HTML 放进视图（同 Coding 的 `question.html` 做法；岛是字符串脚本，不能在浏览器里调设计系统的渲染函数）；岛只接行为（I1 的共享函数）；草稿存助理库新表 `assistant_question_drafts`（主人助理）；删 `renderQuestion` 与对应样式；加载 `INTERACTION_STYLES`，同 PR 删掉被替换的助理问题样式抵字节；`assistant-base` 升版说明带类型的题与 `reference` 题 | AC-21 | C1+H1、I1 | `assistant-island.ts`、`assistant-service.ts` 只减；页面资源不涨（新样式进 workbench.css，旧样式出 craft-finish，三张表各算）；新界面文字有英文（`translations` 门禁） | `assistant-island.ts`、`assistant-service.ts`、`assistant-http.ts`、`craft-finish.ts`、`apps/workbench/src/i18n/en.ts` | 回执线 1e 同改岛的输入框目标芯片与 `dispatch`（G11/D5）：R4 定案后两线按同一语义各做一半，见下 |
| A2 Coding 接入 | `ui.ts` 的问题卡改用 `renderInteractionQuestion`；`client.ts` 用 I1 的共享函数，删 `renderQuestions` 的重复部分；`routes.ts` 的 `questionAnswer` 收 `value`；`question_drafts` 收值；`coding-base` 升版 | AC-22 | C1+H1、I1 | Coding 客户端字节在 5 个包里都不涨；`client.ts`、`routes.ts` 只减 | Coding `client.ts`、`routes.ts`、`ui.ts`、`apps/local-host/src/coding-surface.ts`、`tooling/gates/page-assets.json` | 采用线在 Coding 客户端也有改动（时间线、模型选择）；回执线 1d 改 Coding 回执渲染 |
| H2 操作卡协作者 | 按防腐 W5-10 的形状（协作者只经端口依赖宿主，不 import 兄弟实现，参照 W4-05 拆出的提醒与跟进）从 `AssistantService` 拆出 `assistant-offers.ts`（`recordOffer`、`offerFromPage`、`runCard`、`dismissCard`、`cardView`、失效巡检），存储按「回合与卡片」表组拆；卡片视图转 `InteractionOperationView`、服务端渲染；同排下一步由纯函数从卡片与问题派生，作为视图字段给岛；删 `renderCard`、「接下来」行；**每张卡保留产生它的 session 与 `run_id`，助理与 Coding 共用同一个卡片键空间**（见下「TaskBoard 前提」） | AC-23 | A1 | `AssistantService` 方法数与行数下降；新协作者 ≤25 方法、≤300 行；`table-owners` 不变（仍在 `apps/local-host`） | `assistant-service.ts`、`assistant-store.ts`、`assistant-island.ts`、`services/assistant.ts` | 防腐 W5-10（未开工）的同一块：助理那一半开工前，要等防腐线负责人确认先后（统筹已请用户转告）；本片的 PR 同时在 `specs/repository-anti-corruption` 的 W5-10 行写「由 ai-interaction H2 实现」并带上链接 |
| H3 对象引用 | 只读动作 `interaction.references.search`（按种类与范围，从对象主人读当前有权限的候选）；提交前 Host 逐个再读，通过才交给 SDK | AC-24 | H1 | `pnpm actions:update`；安全不变量里「对象引用由宿主复核」加拒绝用例（`pnpm test:security`） | 动作目录、`tooling/gates/actions/`、`docs/system/SECURITY-INVARIANTS.md` | 情境线的对象落点读取：共用对象主人的读法，不另写一套 |
| H4 Coding 的操作卡 | Coding 的 Run 也能 `suggest-action`，记录走 H2 的协作者；Coding 的专业后续（查看变更、核对并继续）进同排下一步 | AC-25 | H2 | 动作合同快照；Coding 客户端字节不涨 | `prologue-action-gateway.ts`、Coding `routes.ts` | 采用线 #408 把 `suggest-action` 改成 `mutate-external`、加了 `HOST_GOVERNED_TOOLS`：以合入后的形状为准 |
| S1 单次接续 | 题型校验纯函数放 `packages/plugin-sdk`（作者与平台共用、会运行的工具的归处；`kernel` 的 K2 门禁不许 import services，且它不是外部作者要装的包）；与 Prologue 的 `validateQuestionnaireAnswer` 做一致性用例（同一批输入同一批结论，进 `tests/ci-product-subset.txt`）；Form「AI 生成表单」缺信息时返回 `needs_input` → 同一问卷卡（宿主提供客户端挂载）→ 接续生成。Form 现在没有这个功能，是**新功能**，不是接入 | AC-26 | C1+H1、I1，建议在 A1 之后 | 插件只经公开 SDK 与合同；`pnpm api:update` 刷新 SDK 快照；插件客户端字节不涨 | `packages/plugin-sdk`、Form 插件 | 为什么放到 A1、A2 之后：它要新增一个功能与一个公开 SDK 出口，字节与评审体量都比前面几片大，而且不阻塞助理与 Coding 的体验 |
| D1 文档与示例 | `skills/molis-prologue-ai`、`docs/platform/PROLOGUE-AI.md`、`skills/molis-plugin-dev`（含 `generated-ai.md`）、设计系统 README；§15.8 三个示例都有用例 | AC-12 | 随各片 | 文档引用门禁（行内代码路径、动作 id 必须存在） | `skills/`（全量回归期间不改） | — |

**顺序（2026-10-12 统筹定）**：C1+H1 → A1 → A2 → H2/H3/H4 → S1，D1 随各片。理由：用户看得见的第一处改变是助理与 Coding 的问卷，所以先把宿主能给出带类型的题（C1+H1）做完，再接助理和 Coding；S1 要新开一个功能并动公开 SDK，放在后面。原先把 C1 拆成 C1a（#447，纯新增合同）与 C1b（等 #408）的做法取消：C1a 里 `InteractionRequest/Outcome` 属于 S1，而问题、回答、字段问题搬进宿主才有真实使用者，一个 PR 里做完更符合「新子路径要有真实使用者」的规则。

**TaskBoard 前提（Prologue P1 统一合同，2026-10-12 冻结）**：合同在 Prologue `docs/slices/taskboard-collaboration.md`（main `82488fa0`），Molis 侧见采用线 #408 spec §4.6.9。与本线相关的三条：

1. **操作卡不进看板（X2）**：卡与节点的关系靠推导 `card.run → boards.attemptOf(run) → node`，所以 H2 必须给每张卡保留产生它的 session 与 `run_id`；卡不是等待条件，需要人做决定一律走 `ask-user` 的 pending；卡也不授予任何权限（和本线已有的「推荐不授权」一致）。
2. **X6：SDK 里不经看板的 Agent 协作从 P2 起都不存在了**（dispatch 自动建子节点，session-send 的交接必须点名节点）。本线依赖 SDK 协作的切片（H4 的 Coding 操作卡、A2 的 Coding 接入）按这个前提写，不再假设可以绕过看板。
3. **TaskBoard 与外部条件等待归采用线**：本线只显示它们给出的状态，不另存。

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
- 2026-10-12（C1a，已取消）：曾把合同子路径先做成纯新增（#447）；统筹改序后并进 C1+H1（D11），#447 关闭。
- 2026-10-13（交接 PR 合并 I1）：按用户决定，各线只在交接 PR 里提交；I1（#439）已合进交接分支（933c664f，无冲突）。I0 预览改用 `createInteractionClient`，删掉预览自己的 `calendar.ts` 和 `bindings.ts` 里的字段、日历、键盘处理（净减 128 行）；纯逻辑用例 21/21 与局部 typecheck 通过，**浏览器用例（`tests/ai-interaction-slice.e2e.test.ts`）等 browser 锁，尚未重跑**。
- 2026-10-19（修 QA-001：英文界面下没配模型时，助理的失败原因是中文，AC-10，防腐复查）
  - 起点：从 main `8eedf222` 起，合入 main `c0b204fd`（#775）后 merge-base 是 `c0b204fd`。Codex 独立验收报的 QA-001（P2），统筹分诊派给本线。
  - 原因：宿主在 `assistant-error.ts` 把中文原文放进错误体，英文目录里有译文却没人用；页面拼「输入已保留」时还夹了一个中文句号。
  - 改动：宿主自己的原因按这次请求的界面语言说（`L()`，请求的语言由 `web-server.ts` 的 `runWithLocale` 定，宿主已有几处错误这样做）。同一类的几句一起改：没配模型、执行服务被另一个进程占用，以及委托 Coding 时的四句（`assistant-coding.ts`）。`action` 不翻：页面按它的文字认出要给哪个控件（`/模型/` 给模型设置的链接），再自己翻译，所以它仍是中文键，英文目录补齐。页面把句号并进同一条译文（`L("。输入已保留")`，英文 ". Your text is kept"）。
  - 字节：`workbench.js` 小 3 字节，预算已降。
  - 用例：`assistant-business-gateway` 的「AC-10, QA-001」（英文页面上原因是英文、不留中文字和标点、原文保留、`action` 仍指向模型设置；中文页面照旧）。浏览器部分进 §15.10「待补浏览器验证」。
  - 评审顺手改（⑤）：回答重启前停住的问题后下一轮没能开始时，「已回答，下一轮没能开始：」这半句也按界面语言说（`assistant-parked-answer.ts`）：原因已经是界面语言，前半句是中文就成了中英混排。用例 `interaction-parked-answer` 的「AC-10, QA-001」。
  - 通过的检查：M1 边界；M2 健康门禁对照 merge-base（含翻译、DOM 事件）；M6 页面资源（只降不升）。
  - 不变的：合同、动作、DOM 事件、错误码。
- 2026-10-19（AC-10 第二片：Coding 收下回答后，回执写进卡自己的说明行，焦点回到输入框，AC-10-1～8，防腐复查）
  - 起点：叠在 #759 的头 `17e49907` 上写（统筹 10-19：撞 `client.ts`，等它合入）。#759 合入后用 merge 合入 main `06e7ff4a`（没有 rebase），merge-base 是 `06e7ff4a`。#759 是 squash 合入的，`client.ts` 取 main 的版本，再把这一片的改动套上去：#759 最后加的草稿客户端（`draft-client.ts`）也改用这一片共用的 `ports`，收下回答后照旧经它存草稿。
  - 改动（AC-10-8）：宿主收下回答后，卡里除了 `role=status` 说明行，别的都撤掉；这一行留在页面上，写上宿主的回执，读屏把它当成已在页面上的实时区域里的变化读出来。原来是整张卡换成一个新的段落，不在实时区域里，读屏不一定读。
  - 改动（AC-10-3）：随着卡的字段一起落到页面上的焦点，回到输入框，对话不滚动；回答在路上时人自己挪到别处的焦点，留在原处。「去回答」那一步走到一道没有可按控件的题时，落在选中的那一项（没有就是第一项可按的），与设计系统自己的字段一样。
  - 写法：回执的脚本是带类型的函数（`question-answered-client.ts`），用 `toString()` 注入，不新增 `_SCRIPT` 文本常量；客户端的各个工厂共用一个 `ports` 对象；十三处 `catch` 去掉了后面没有别的事的存活检查（评审修改又去掉十处）。
  - 字节：`coding.js` 比合并点少 26 字节，预算降到 373881（373907 → 373881，CI 的 page-assets 实测）。评审修改比 373724 多 157 字节（焦点、标题、不是当前会话时不移焦点），由另外 10 处 `catch` 里重复的存活检查抵掉（后面只调 `status()` 或 `controls()`，它们自己先查；约 260 字节）。
  - 验收说法：AC-10-2 原写「选项的边框和选中标记不低于 3:1」。没选中的选项边框是 `--line`（深色下约 1.3:1），做不到；WCAG 1.4.11 要 3:1 的是认出控件和状态所必需的部分，选项靠文字认出。改成量选中项的底色对卡面、选中标记对底色，用例照这个量。AC-10-8 写明只选一项是 radio、可选几项是 `aria-pressed` 的开关按钮（共享部件本来就这样画）。
  - 评审修改（⑤ 评审 #815，AC-10-3、AC-10-8）：从输入框旁的下一步行答单选题时，焦点留在步骤按钮上，随后重读会话重画这一行，焦点掉到 `body`。现在重画这一行之前先记下焦点是否在行里：在，就还给同一步的按钮（新行里还有它、且没有禁用），没有就还给输入框；整行隐藏也一样。回答被拒（`coding.round_ended`、`agent.pending_not_open`）而控件锁住时，焦点原来在卡里或已落在 `body`，同样回输入框。收下回答后移焦点之前，先看是不是当前会话、页面可见、卡还在页面上（与 `offerApproval` 一样），否则不动。
  - 评审修改（AC-10-8）：收下后卡的标题（`h3`）和装它的 `header` 留着，`aria-labelledby` 指到的名称不落空；`header` 里别的（kicker、徽标）照旧撤掉。回执只在这一轮继续之前出现，写进 AC-10-8；要不要多留一次重读，记 BL-246（真机读屏的结果定）。AC-10-2 的深色比值改成约 1.3:1（实测深色 1.29:1、浅色 1.22:1）。
  - 用例：节点用例 `coding-question-answered-client`（AC-10-3、AC-10-8，六条：新增「卡留着标题」「不是当前会话时不移焦点」两条，「只剩说明行」的断言改成「只剩标题、说明行和装着它们的节点」）；评审修改后只在草稿夹具里对源码跑过，正式用例待跑；`coding-question-card.e2e` 的 AC-25 用例加了「行隐藏后焦点在输入框」；浏览器用例 `coding-question-card.e2e` 的 AC-10-1～8 写好，本机没跑（用户 10-19 暂停浏览器验证），记进 §15.10「待补浏览器验证」。
  - 顺带：§14.3 末行与 AC-12 状态行引用 BL-245（生成插件先问再接续的平台缺口）；AC-12 的真实模型冒烟记进「待补浏览器验证」。
  - 通过的检查：M1 边界；M2 健康门禁对照 merge-base；M6 页面资源。
  - 不变的：合同、动作、DOM 事件、错误码。
- 2026-10-19（AC-06 卡片的结果进下一步行，H4 Coding 同排，防腐复查）· 从 #780 的头 `0aa2a2bb` 起（统筹 10-19：叠在基 PR 上先写逻辑与 node 用例，基 PR 合入后并 main，不变基）· 并入 main `8eedf222`（#780 合入后）· merge-base `8eedf222`。做法见 §15.11：一份 `cardOutcomeSteps`（`agent-next-steps.ts`）给两处用——助理的结果槽（`assistant-outcome.ts`，排在交付说明之后、这一轮的结果之前，只看这一轮开始后跑完的卡、这一轮还在跑时不给），Coding 的下一步行（`coding-surface.ts` 的 `codingNextSteps`，排在 Coding 自己的「查看变更」之前）。这一步只按卡上结果自己的「打开」（`data-ix-press="open"`），不另开链接、不重跑；页面脚本不改（步骤行与 Coding 的处理早已认 `card:<id>:<name>` 与以 `[` 开头的选择器），所以 `coding.js`、`workbench.js` 不用排放行键。撤销不进这一步：`AssistantUndoable` 没有卡的编号，要改合同，记在 §15.11。没有新事件、新错误码、新合同、新动作；两句界面文字都是现成的（「打开「{title}」」「来自操作卡」）。用例：`assistant-interaction-html`（AC-06-1～3）、`assistant-step-row`（AC-06-4）、`coding-next-steps`（AC-06-5）。浏览器验证与截图待补（用户 10-19 暂停）。通过：M1 边界；M2 健康门禁对照 merge-base（没有变大的；含 API 快照、DOM 事件、翻译）；M6 页面资源不变（改动只在宿主的服务端代码，不进 `/assets/` 下的任何包）；M5 动作快照不变（没有新动作、没改 Manifest）。生成插件的问卷缺口随本片记为 BL-245。
- 2026-10-19（AC-01 入口盘点定稿；AC-09 S1 回填；AC-12 生成插件的边界写进 Skill，防腐复查）· 从 main `b016513d` 起 · merge-base `b016513d` · 只改文档与 Skill。§14.3 逐个插件核了调用路径、装配与界面（调查读源码，关键行逐个抽查），定为终版：已接 3、已覆盖 2、第二批接入 4（顺序 PPT → Pages → Cognia → 插件创作台，各开一片）、不接入 6、不适用与只核对一致性的若干，生成插件记为平台缺口（沙箱的操作结果包在 `value` 里交给部件，不经 `withPluginInteraction`；沙箱也没有 `ask-user`）。首轮写的「灵光等 prologue-adoption」已过时，改正。AC-09 的 Form 证据早已在（#532，W4-04），回填为已实现。AC-12：`skills/molis-plugin-dev/generated-ai.md` 的「设计时」加一条——生成插件不能先问再接着做，要人补的信息做成提交部件的字段，输入不够以合同里声明的错误码失败、保留输入，不让模型反问、不返回 `needs_input`；`SKILL.md` 里同一句跟着改。`pnpm studio:replay --base origin/main` 离线回放通过（退出 0，合并基点上记的结果都成立；挂载摘要列出 design、code 两段文字变了，这是预期，固定答卷说不出对模型的影响）。真实模型冒烟要先在隔离 Home 的设置页配模型，用户 10-19 暂停了浏览器验证，记为待补。生成插件问卷缺口的 BL 号交统筹分配（main 上到 BL-221，之后的号在途 PR 占了），本片不新开。防腐复查：只动 `.md`；没有新的兼容或迁移；没改门禁、阈值、合同、动作 schema、页面资源；Skill 里新加的行内代码没有路径或带点的动作 id，§14.3 引的路径逐个核过都在；缺口照 2026-10-18「插件一视同仁」记成平台要补的，不给某个插件开私路。
- 2026-10-19（修 QA-002：Form 补问被拒后重试，旧错误不撤；QA-003：AC-09、AC-11 的用例补编号，防腐复查）
  - 起点：从 main `ddb65438` 起，先后合入 main `380d365e`（#778、#800）与 `06e7ff4a`（#798、#802、#806、#807）后 merge-base 是 `06e7ff4a`。Codex 独立验收报的 QA-002（P2，AC-26）与 QA-003（P3，AC-09、AC-11），统筹分诊派给本线，两条都碰 `form-draft-questions`，合成一片。
  - QA-002 原因：「AI 生成题目」被宿主拒了时，原因写在编辑器的说明行上；同一要求再试、拿到合法的卡时，这一行没人撤，旧错误和新卡同时在。
  - QA-002 改动：卡立起来时撤掉草稿自己写的那句（`draft.ts`）；作答后被逐字段退回时也撤（评审补，同一类：前一次作答因非字段原因失败、写在说明行上的话，不留在字段错误旁）。只撤草稿写的：说明行按来源记一个范围（`"draft"`），过滤写成 `status.ts` 的 `draftNote` 以便单独测，点按钮之前留下的保存、发布提示不受影响。
  - 字节：`form.js` 修复多 78 字节（含作答路上的撤销与抽出的 `draftNote`）；同一个资源里把「导出填写页」「导出结果表」两条命令合成一个写法，少 123 字节；净少 45 字节，预算已降到 30244。
  - 用例：`form-draft-retry`「AC-26, QA-002」，从页面源码打包后在小 DOM 上跑：第一次补问被拒，同一要求重试拿到合法的卡；断言旧错误撤下、卡可答且首题获焦、原要求保留、作答前不加题，作答后才加。另两条：作答被逐字段退回时，前一次作答失败的原因撤下、字段标在卡上、卡仍可答；卡立起来时不撤保存、发布等别处留在说明行上的话（用页面真实的 `showNote` 与 `draftNote`，把过滤改回不过滤即红）。去掉任一处修复，各红在自己那一条。进了 CI 产品子集。浏览器部分记进 §15.10「待补浏览器验证」。
  - QA-003：Codex 指出 AC-09、AC-11 在用例里查不到编号。没有写空用例凑引用，只给已经证明子条件的真实用例改名或加一行注释：AC-09 是 `coding-changeset-http`、`agent-review-standing`、`coding-report-persistence`、`form-draft-questions`；AC-11 是 `agent-question-types`、`assistant-typed-questions.e2e`、`prologue-start-refusal`、`interaction-recovery`，以及证明审批语义的 `prologue-review-feedback`、`prologue-stop-review`（评审补：状态行原来写了审批语义，列出的用例只证明了等待；`agent-review-standing` 不经过包，只算 AC-09）。人工的复合条件写进 AC-09、AC-11 的状态行。两条按 Codex 的判定从「已实现」改回「部分」。
  - 通过的检查：M1 边界；M2 健康门禁对照 merge-base；M6 页面资源（只降不升）。
  - 不变的：合同、动作、DOM 事件、错误码。
- 2026-10-19（AC-10 第一片：可选单选能清掉，AC-10-9，防腐复查）
  - 起点：从 main `520db6d52` 起，merge-base 是 `520db6d52`。计划在 §15.10，按统筹 10-19 派单 §3a 分两片。
  - 改动：共享问卷部件给「选填、单选」的题加「清除选择」。没选时藏起来；按下清空选择、草稿跟着清，焦点回到这一组的停留点。助理与 Coding 同一张卡，一起受益。
  - 字节：在同一处抵掉，不用放行键。`workbench.css`、`arrival.css` 各少 36 字节，`workbench.js` 少 17 字节，预算已降。
  - 用例：`interaction-components` 与 `coding-question-card` 的 AC-10-9 本机通过；`interaction-client.e2e` 的 AC-10-9 写给 CI 跑，本机浏览器验证暂停，记进「待补浏览器验证」。
  - 通过的检查：M1 边界；M2 健康门禁对照 merge-base；M6 页面资源（预算等于实测）；M9 翻译（「清除选择」有英文）。
  - 不变的：合同、动作、DOM 事件、错误码。
  - 第二片（Coding 收下后焦点与回执，AC-10-1～8）等 #759。
- 2026-10-18（AC-08 两个页签同时作答；AC-11 按现状改，防腐复查）· 从 main `b3499cda`（#702 之后）起 · merge-base `b3499cda` · 统筹批准计划：确定的先后、四件事都要断言、本机只跑相关文件；查出缺陷后同意修，要求码按类别给状态、页面按码判断、单独一个提交、重跑全量。用例：助理在 `assistant-typed-questions.e2e`，Coding 在 `interaction-no-crosstalk.e2e`（那里有会问问题的 Coding 一轮）；第二个页签的回答在它自己的页面里挡住，等第一个收下、这一轮跑完才放行。**缺陷**：Coding 的 `coding.control-run` 对已结束的一轮、对不属于这个会话的执行，抛的是不带码的 `Error`，页面收到 400、没有码。修法：`routes-sessions.ts` 里新声明 `defineErrorCodes("coding", { run_not_found: "not_found", round_ended: "conflict" })`，状态码照旧由 plugin-sdk 的 `errors.ts` 按类别给（409、404）。Coding 页面的请求函数带上 `code`，答卷遇到 `coding.round_ended` 或 `agent.pending_not_open` 时，卡片关上、原话写在卡片上，再读会话也不撤这张卡；原来是把话写进提示、卡片却还能再交。最初放在状态行，合 main 后本机查出这一轮结束时状态行会清空、原因被冲掉，改成留在卡上，用例在重读之后断言卡还在（撤掉修复即红）。全量（CI 的 Linux）上第二个页签作为后台页签没能打开会话（只有前台页面读会话、跟着这一轮），改成单独开一个窗口，两边都在前台；这样也查出回答还在路上的卡会被跟随的那次刷新撤掉，一并修了，两处各自撤掉都会红。Coding 的页面没有英文目录，所以这两句和它旁边的话一样只有中文。通过：M1 边界；M2 健康门禁对照 merge-base（`client.ts` 是巨大单元，1638 → 1637：会话状态的文字表原来写了两份，留下一份）；M6 页面资源：`coding.js` 小了 131 字节，预算已降；M4 API 快照、M5 动作快照、M8 DOM 事件、M9 翻译都不变；错误模型的数字不变（新码在 `defineErrorCodes` 里，主人名是 `coding`）。浏览器冒烟名单已满（5 个），这两个用例不加进 `ci-product-subset.txt`。
- 2026-10-17（BL-156 的 Molis 半边：回答停放的题，AC-07，S-33，防腐复查）· 从 main `102671ce`（#681 之后）起 · merge-base `102671ce` · 统筹批准计划并加了授权、零写入、开轮失败、关闭、合同、措辞几条。正常关机停放的一轮（Prologue `b541a8e6`）重启后卡片可答：`readPendingQuestion` 见到没有活执行者、但在会话索引里停放且 `inspect` 给了 `canAnswer` 的题，标 `parked`；`answerPending` 照旧核答案，再经 `sessions.answerInterrupted`（`assertBeforeAnswer` 是网关那一份 `effects.assertCurrent`）。助理与 Coding 各自开下一轮（§15.9「实现」）。通过：M1 边界；M2 健康门禁对照 merge-base（`AssistantService` 1533 行/91 个方法不变：开轮与措辞在新的小文件 `assistant-parked-answer.ts`，`assistant-service.ts` 1877 行不变：多出的一行 import 由把孤立的「Delegation bounds」注释放回 `assistant-delegation.ts` 里它的常量上抵掉；`prologue.ts` 不变大）；M4 API 快照（`agent-interaction` 的 `AgentPendingQuestion` 多 `parked`，`agent-host` 的 `AgentRecoveryReport.runs[]` 多 `can_answer` 与 `questions`）；M5 动作快照不变（`coding.runs.control` 的输出本来不封闭，回执 `message` 与 `next_round` 是多出的字段）；M6 页面资源：`coding.js` 小了 15 字节（回执的话搬到路由，页面只显示），预算已降；M9 翻译（三个码与两句助理的话有英文）；错误模型不变（三个 SDK 码映射到现有的 `agent.session_busy`）。Coding 等待醒来与停放回答的下一轮共用 `waits.ts` 的 `continuedBody`，不另写一份。安全：`SECURITY-INVARIANTS.md` 加 S-33。用例：`tests/security-invariants-parked-answer.test.ts`（五条拒绝，每条比对存储逐个文件不变，进 `pnpm test:security`）、`tests/interaction-parked-answer.test.ts`（六条：回答后下一轮带答案；开轮被拒答案留着、说「继续」带上；忙一次与两次；重启后 AC-08；停放时新消息被拒、草稿留着）、`tests/coding-session-recovery.test.ts`（Coding 的回执、读不到开法、忙时只看一次再试一次），`tests/prologue-start-refusal.test.ts` 的重启用例改成回答停放的题，`tests/interaction-reask.test.ts` 的提早重新问改断言 `assistant.state`，`tests/agent-control-errors.test.ts` 加三个码。把 `parkedOn` 改成总不认停放后，这几份里 11 条中 10 条失败（构建确实换了才算）。改到的文件读到的用例本机跑过；改了 agent-host、contracts、Coding，全量由统筹在 label-chain 跑。
- 2026-10-17（「请 AI 重新问」，D5、D37，防腐复查）· 从 main `4fd585da`（#655 之后）起 · merge-base `4fd585da` · 统筹批准文件清单与插件 SDK 里的同一份构造。过期或宿主重启时结束的问题卡上多一个「请 AI 重新问」：页面只说是哪一个问题，宿主写这一轮的话（`QUESTION_REASK.task`），从这项工作或这个会话自己的 Run 读原问题，从宿主存的那份读草稿，带成一份只写事实的材料（插件 SDK 的 `questionDraftMaterial`，助理与 Coding 同一份文字），怎样用草稿写在以用户口吻说的那句话里；统筹复查后改：材料里不写给模型的指令（运行时已按数据交给模型），重新问被拒时不存草稿，HTTP 层先拒绝形状不对的请求。助理：新的小文件 `assistant-reask.ts`，发送路径里调一次；Coding：`plugins/native/coding/src/reask.ts`，错误码归 Coding（`defineErrorCodes("coding", …)`：还能回答、不是这个会话、已经不在、形状不对各一个码）。通过：M1 边界；M2 健康门禁对照 merge-base（`AssistantService` 1629/98 → 1627/97：删掉只转调一次的 `explain()`；`assistant-island.ts` 2277 → 2275：点按在 `assistant-send.ts`，删掉 `cardShell` 删除后留下的孤立注释；Coding `client.ts` 1637 不变：删掉一条重复的注释，两条放错位置的注释放回各自的函数；合同 `services/assistant.ts` 本来正好 800 行，按统筹定把只含类型的 `AssistantRecovery` 原样搬到 `services/assistant-recovery.ts` 并从原处转出，单独一个提交，API 快照不变，不加子路径）；M4 API 快照（`agent-interaction` 多 `AgentQuestionReask`，`AssistantSendInput` 多可选的 `reask`，插件 SDK 多 `QUESTION_REASK` 与 `questionDraftMaterial`）；M5 动作快照不变（`/send` 不经登记的动作，`coding.start-run` 的输入本来允许多余字段）；M6 页面资源：`coding.js` +184、`workbench.js` +271，用户 2026-10-17 经统筹的弹窗批准一次性放行，单独一个提交，每次合 main 后按新的 merge-base 重定（现在是 `e49f6a55`，增量不变），替换回执 3b-2a 用完的条目；M9 翻译（「请 AI 重新问」有英文）。用例：`tests/interaction-reask.test.ts`（四条：过期后重新问带草稿、宿主重启结束后重新问、助理拒绝还能回答的与别的工作的且不调模型、Coding 的四种拒绝），进 CI 产品子集；`assistant-island-script` 的发送处计数 2 → 3（新的那处同样标 `written_by: "page"`），`assistant-interaction-html` 的视图样例补上合同要求的 `executor`。改到的文件读到的 70 个用例本机通过，`issue-assistant-repair-page.e2e` 在干净的基线工作树上同样失败（时序，与本片无关）；全量由统筹在 label-chain 跑。
- 2026-10-17（运行控制的错误映射，防腐复查）· 从 main `dd2bac58`（#659 之后）起 · merge-base `dd2bac58` · 统筹批准计划。SDK 的码在一处映射：`horizontal/agent-host/src/adapters/prologue-control-errors.ts` 的 `controlFailure`，`control()`（停、取消、暂停、继续、换模型、回答）整段经它出。Molis 的 `ActionError` 原样通过；SDK 的错误按 `isPrologueError` 认出，查一张以 SDK 的 `PrologueErrorCode` 为键的表（SDK 改名或删码就编译不过；SDK 不导出码常量，所以用类型）：`PENDING_ALREADY_SETTLED`、`PENDING_EXPIRED` 映射成 `agent.pending_not_open`，其余与普通异常映射成新的 `agent.control_failed`（`internal`，经 `defineErrorCodes` 声明），原错误放在 `cause`，SDK 的码放在 `details.runtime_code`，只供诊断，调用方按 `code` 与 `kind` 分支。§15.9 的 `SESSION_RECOVERY_BUSY`、`SESSION_RUN_PARKED` 换包后加在同一张表里，映射在 BL-156 的 Molis 片（换包片只改 `REFUSED_BEFORE_RUN`）。AC-08 的断言改成 `agent.pending_not_open`；新用例 `tests/agent-control-errors.test.ts`（只引公开路径）：原样的 `PENDING_*` 不到调用方、没列出的 SDK 码与普通异常是 `agent.control_failed`（停止也经同一处）、Molis 的拒绝原样通过。`prologue.ts` 文件与类都不变大：回答分支的三行 `if` 写成文件里常见的一行 `if … throw`，类型导入里一行空行删掉。错误模型的数字不变（以 SDK 码为键的表不是码的出处）。
- 2026-10-17（AC-08 并发作答的用例；AC-07 的重启缺口，防腐复查）· 从 main `02829775`（#653 之后）起 · merge-base `02829775`。只加用例与文档：`tests/interaction-recovery.test.ts`（AC-08：两份同时交同一题，只收一份），AC-07、AC-08 两行，BACKLOG 新增 BL-156。写 AC-07 的用例时发现：关掉 Node Host 再开，等人回答的一轮读回是 `cancelled`，问题不能再交；草稿还在，卡上有说明，但没有「请 AI 重新问」。统筹 10-17 定：AC-07 的标准不改，行标为部分，缺口进 BL-156；「请 AI 重新问」是 Molis 侧的修，先问统筹；下一步先读 Prologue 源码再谈设计。页面资源、API 与动作快照、DOM 事件、错误码、翻译都不变。
- 2026-10-17（BL-152 外部插件的种类，D38，防腐复查）· 从 main `b6d98559`（#670 之后）起 · merge-base `b6d98559` · 统筹认可计划并定五点。每一轮开跑时宿主按会话主人从项目的动作目录现算种类清单，经 SDK 的 `agent.askUserReferenceKinds` 交给这一轮；筛选在 agent-host（`prologue-reference-kinds.ts`，上限取 SDK 导出的 `QUESTIONNAIRE_LIMITS`），宿主的端口在 `agent-reference-kinds.ts`，规则与内置清单同一处（`agent-question-surfaces.ts` 的 `pluginReferenceKinds`、`projectReferenceKinds`），诊断进「插件接入诊断」（`assistant-contributions.ts`）。通过：M1 边界（`@prologue/sdk` 仍只在 agent-host 里引用）；M2 健康门禁对照 merge-base（新文件都在阈值以下，`prologue-run.ts` 596 行，不是巨大单元；新测试文件只引公开入口）；M4 API 快照不变（contracts 与插件 SDK 没动；agent-host 与 local-host 的导出不在快照里）；M5 动作快照不变；M6 页面资源不变（全在服务端）；M8 页面事件无新增；错误模型：没有新的错误码。安全：`SECURITY-INVARIANTS.md` 加 S-32，S-13 交叉引用到它。内置清单：`hostReferenceKinds()` 也走同一份筛选与顺序；与 main 的算法对同一批内置 Manifest 比过，22 种、显示名都相同，没有哪个种类由两个内置插件同时列出，只变了枚举的顺序（换成按插件标识、再按种类，部署后工具定义变一次，之后稳定）。用例：`tests/security-invariants-reference-kinds.test.ts`（五条拒绝，进 `pnpm test:security`）、`tests/agent-reference-questions.test.ts`（四条：外部种类能问到、两轮顺序不变、端口不在或为空退回内置、子任务问不了人），`tests/assistant-contributions.test.ts`（诊断按插件、按原因各一条）。改了 agent-host，全量由统筹在 label-chain 跑。
- 2026-10-17（D1 文档与示例，AC-12，防腐复查）· 从 main `c276ab9c`（#648 之后）起 · merge-base `c276ab9c`。只动文档与用例，不改源码：`skills/molis-prologue-ai/SKILL.md` 加「交互」一节（含验证命令），`docs/platform/PROLOGUE-AI.md` §6 末尾加「问人、建议一步、引用对象」一小节（这两份归手册线，统筹 10-17 定：只加这一节，不动别的段落），`skills/molis-plugin-dev/SKILL.md` 的索引加一行，设计系统 README 补引用搜索的行为；新用例 `tests/interaction-examples.test.ts`（§15.8 示例 1，进 CI 产品子集）。`skills/molis-plugin-dev/SKILL.md` 不在创作台的 `CHAPTERS` 里，所以不需要 `studio:replay`；改了 `skills/` 后先 `pnpm build` 再跑安装类用例。通过：文档引用门禁（行内路径、动作 id 都存在）；页面资源、API 与动作快照、DOM 事件、错误码、翻译都不变。没改 `generated-ai.md`：它挂在创作台的 Skill 里，改了要 `pnpm studio:replay` 加真实模型冒烟，而生成插件沙箱没有 `ask-user` 与 `suggest-action`，`skills/molis-plugin-dev/SKILL.md` 的索引行已写明这条边界。
- 2026-10-17（T2 对象引用题，防腐复查）· 从 main `7bf9b7a1`（#618、#632 之后）起 · merge-base `7bf9b7a1` · 决策 D36。通过：M1 边界（`boundary:check`；设计系统不引用合同与 SDK，宿主取种类只读内置 Manifest，插件之间不互相引用）；M2 健康门禁对照 merge-base（新的 `*_SCRIPT` 文本常量 0：引用搜索的接线写进工作台与项目选择页原有的两段脚本，不另立常量；`craft-finish.ts` 巨大单元行数不变）；M4 API 快照（`plugin-sdk` 的 `questionAnswer` 返回值多了引用数组，已 `api:update`）；动作快照（`coding.runs.control` 升到 v5，v1～v4 拒绝；`search.references@1` 不变）；DOM 事件 0 新增；翻译（9 句新中文都有英文，「没有找到」沿用 Todo 已有的 No matches，不新增冲突）；错误码 0 新增（`kind-not-allowed`、`too-many`、`reference-unavailable` 都是合同里已有的原因）；页面资源由用户弹窗批的一次性上限（D36 ⑤），实测 `workbench.css` +1,326、`arrival.css` +1,326、`workbench.js` +4,037、`settings.css` +19，`coding.js` 不变；S-26 加两条断言拒绝本身的用例（页面写的标题进不了回答；题目没要的种类搜不到也交不上）；用户 10-16 规则：种类清单来自 Manifest 与上游 enum，不写提示词禁令、不靠正则或特例。留下的：外部插件的种类不在清单里（BL-152）。
- 2026-10-17（T1 后续：数字题的单位，防腐复查）· 从 main `cee899c4`（#615 换包之后）起 · 决策 D35。改动只在宿主的卡（`agent-question-card.ts`：把题目的 `unit` 交给共享控件、界限带单位）与设计系统的数字控件（`interaction.ts`：单位加 id，输入框的 `aria-describedby` 先指单位）；没有新事件、新错误码、新合同、新翻译句子；页面资源不变（单位是宿主画的 HTML，样式 T1 已有），四份资产与 main 相同。单位只经合同 `AgentQuestion.unit` 一处来，不从题干猜（用户 10-16 规则：不打补丁）。
- 2026-10-16（T1 放开文字、数字、日期、日期时间，防腐复查）· 从 main `5ba635c8`（#597、#602 之后）起 · merge-base `5ba635c8` · 决策 D29–D33（三条统筹定、一条统筹定不升提示词、一条本线定）。做法：宿主的问卷卡（`agent-question-card.ts`）按题型画四种字段，日期旁显示星期、日期时间后显示一处本机时区；拒绝时每个字段旁的话写出界限（「不能超过 120」「不能早于 2026-10-19 09:00」），助理经工作视图、Coding 经路由把题目随拒绝带回，由宿主一处措辞；插件开发包的 `questionAnswer` 按字段名读出 `value`（数字转数，日期时间写成本机偏移）；两个界面的题型同时放开（D8）；Coding 页面交回卡上字段原样，路由读成回答，`coding.runs.control` 升到 v4（D33）。输入框的「回答上面的问题」芯片也覆盖只有一道文本题的问卷（D34，统筹实走发现原条件出不来）。样式：数字步进器从 `INTERACTION_NUMBER_STYLES` 拆出日历那段（`INTERACTION_CALENDAR_STYLES`，只在组件板），步进器进工作台与项目选择页两张表，与日期框等高、出错时边框变红，390 px 与触屏下输入框与 ± 至少 44 px；字节用 `immersive-navigation.ts` 里 `.assistant-plan` 的五条死规则抵掉（它的标记 09-28 在 `5c56d681` 删掉，样式没跟着删），两张表各少 29 字节，Coding 包少 842 字节，工作台脚本少 84 字节（芯片的条件改由宿主判、页面只读标记，D34）。留作后续：共享客户端打字时改写的星期只有中文（`interactionFields` 的 `weekdays`），英文界面下打字后会显示中文星期；数字题没有 `unit`（上游 Prologue，已报统筹）。
- 2026-10-16（H4 第二部分 2c 防腐复查）· 从 #571 的头 `819a4e4c` 起（#571 合入后变基到 main）· merge-base `19dc13d4` · 通过：M1 边界、M2 健康门禁对照 merge-base（没有变大的；`client.ts` 1642 → 1641：卡的绑定放进已有的 `actions-client.ts`，它返回 `renderCards`，不新开文本脚本文件；`registerAgentHostCapabilities` 不变；Coding 样式里把等价的简写缩短，抵掉新样式的 56 字节）、M4 API 快照（只有 `services/agent-host`：新的 `agentOfferActions`、`AgentOfferRunRequest`，`AgentRunOffer` 多了必填的 `action_digest`）、M5 动作快照多一行 `agent.offers.run.v1@1`（宿主登记）、M6 页面资源全部变小（预算已降）、M8 没有新事件、M9 缺英文 0、M10 0 混用（新用例只经公开入口与已有夹具）、M14 新不变量 S-29 与断言拒绝本身的用例。人看要点：点卡的执行是新的安全边界（统筹 10-16 定 B）：宿主动作 `agent.offers.run@1` 只给插件、只能执行这一轮自己记下的那条建议点名的确切引用（引用对不上、不在冻结的动作工具里都拒），合同在建议之后变了按建议时记下的 `action_digest`（动作当时 `{operation, action}` 的 sha256）拒，授权已撤、动作已停用或已不在都拒，输入经组合层新加的 `check` 透传过动作自己的检查，`beforeEffect()` 之后才执行；宿主不另记状态，重复执行由 Coding 的卡按修订号认领兜住。Coding 的卡存在插件私有存储 `cards:<session_id>`（整份 `compareAndSet`，不加表、不升库版本），落卡按 `offer_id` 幂等、在 `beforeEffect()` 之后、动作此刻不在授权里就不落（D25 三条）。Coding 的 `failure` 对平台写法的错误码按 kind 给状态（D26），因此 `goals.event_progress.stale_goal` 与 `actions.expired` 400 → 409、`artifacts.plugin_denied` 400 → 403，三处用例改了并注明；不是平台写法的码与普通 Error 仍 400，Coding 自己点名的码（如 `agent.session_busy` 409）不变。页面：卡由宿主画（与助理同一个 `assistantCardHtml`，Coding 里不给「请助理重新准备」），挂在那一轮下面、与问题卡同一列宽；输入框上方的那一步在卡有未发送改动时只把卡带到眼前（FLOW-03，与助理一致）。浏览器用例 `coding-action-cards.e2e` 要带上 #575（本分支临时 cherry-pick；#575 之前延后的工具模型调不到，变基到 main 后这条提交自然去掉）。照用户 10-16 的规则：越界由宿主按记下的引用、摘要与动作此刻的状态核对，不在提示词里加禁令。留作后续：卡的 `readSubject` 返回 null（Coding 的卡还不判对象是否已变）；操作卡「将使用这些内容」里长字段名（如 `idempotency_key`）超出 84px 标签列、压到值上（设计系统共用，助理同样）；plugin-builder `agent-store.ts:9`、`:23`。
- 2026-10-16（H4 第二部分 2a 防腐复查）· 从 main `bd2472ae`（#564 1d 之后）起 · merge-base `bd2472ae` · 通过：M1 边界、M2 健康门禁对照 merge-base（`AgentHost`、`start` 与合同文件 `services/agent-host.ts` 都没变大：只读角色的检查与本轮的动作客户端提成模块函数，`AgentActionOffer` 连同新的 `AgentRunOffer` 搬进 `services/agent-host-offers.ts`，经原来的子路径转出）、M4 API 快照（只有 `services/agent-host` 多了 `AgentRunOffer` 与 `AgentRunView.offers`，有意改动）、M5 动作快照不变、M6 不涉及页面资源、M7 改动文件 lint 0 新诊断（`prologue-run.ts:373` 的 `noFloatingPromises` 是 main 上已有的）、M8 没有新事件、M9 没有新句子、M10 0 混用、M14 新不变量 S-28 与它的拒绝用例。人看要点：逐项能力回合的角色 `host_tools` 带 `suggest-action` 时，这一轮的动作包多一个建议工具（`molis-suggest-<范围>`），只能点名本轮冻结的动作工具；点名别的、动作此刻不在、停用、合同已变、输入被动作自己的检查拒绝、整条记录超过 32 KiB，都拒，什么都不记（S-28）；建议只记录、不执行、不排审查（`codingExecutionRules` 按前缀放行，点卡才是确认，D27）；记录随工具结果进事件流，运行视图从事件回放出 `offers`（重启后读回同一份，不重新生成）；只读角色带 `suggest-action` 开跑前就拒；免审查的 `molis-suggest-` 前缀只有这一轮的建议工具能有（逐个核过工具名的来源，S-28 第三条用例钉住）。合入 main `cbf2341c` 后不变量改号为 S-28（#560 先占了 S-27）。没碰 `agent-host-composition.ts`、`assistant-island.ts`、发送路径；Coding 的角色、表与卡在 2c。照用户 10-16 的规则：越界由 agent-host 按冻结的引用与动作此刻的状态核对（事实核对），不在提示词里加禁令；超过 32 KiB 的拒绝是为了不让模型说「已展示」却没有卡（误导用户的一类）。
- 2026-10-16（H4 2b 之后：卡按错误的 kind 判结果，防腐复查）· 从 main `e502470c` 起 · 起因：2b 把 `settled()` 原样搬进 SDK，它按消息文字（「版本」「已变化」……）和码名片段判「数据已变」，成了 SDK 的公开行为；也属于用户 10-16「不为模型或措辞加正则」的规则。改法：只看码与 kind——四个确切的平台码（outcome_unknown、output_invalid_after_effect、delivery_unknown、host_replaced）是未知，kind 为 conflict 是过期，其余是失败。核对谁在说「数据已变」却没声明 conflict：八个码改成 conflict（`characters.conflict`，Goals 三个 `stale_*`，Sessions `message_target_changed`、`message_attempt_changed`，`attention.revision_conflict`，`shelf.configuration_changed`），动作网关上从 400 变 409（统筹 10-16 定 A；F109 的「保留 400」是保行为的折中，不是用户决定）。Characters 的声明从模块搬进 contracts 一处（照 Attention 的 `attention-errors.ts`）；插件原来抛的是只带码的普通 Error，改为抛声明的码。按码自己映射 409 的三个边缘（Work 消息、Feed 的码翻译、Characters 路由）都不是多余的，留着并写进 PR。新用例 `tests/moved-on-error-kinds.test.ts` 钉住八个码的 kind、网关状态、HTTP 往返和卡的结果。留作后续：Schedule `job_invalid`、Files 与 Git 的 `invalid`（要在各主人新加码），Characters 的 not_found / deleted / disabled。
- 2026-10-15（H4 第二部分 2b 防腐复查）· 从 main `bdcf6920`（#554 之后）起 · merge-base `bdcf6920` · 通过：M1 边界（SDK 只多依赖 contracts 的类型）、M2 健康门禁对照 merge-base、M4 API 快照（只有 `plugin-sdk/index` 多了操作卡的规则、两个端口与卡值读取，有意改动）、M6 页面资源（不变）、M7 改动文件 lint 0 诊断（`plugin-sdk/src/index.ts` 第 130 行的 `as unknown as` 是 main 上已有的、基线已收）、M8 页面事件（没有新事件）、M9 翻译（没有新句子，缺 0）、M10 测试引用（1024 个进程 0 混用）；M5 不适用（没有动作改动）。人看要点：判断规则（现在提供、输入合格、可改的字段、展示的 revision、对象是否已变、时刻是否已过、抛错后是未知 / 过期 / 失败、结果一句话）从 `assistant-offers.ts` 搬进 `packages/plugin-sdk/src/action-cards.ts`，只写一份，端口 `CardStore`（按 revision 比较后更新）与 `CardAuthority`（discover / check / invoke）定义在 SDK、不碰存储；SDK 不能依赖内核与 `assistant.*` 错误码，所以校验与拒绝也是端口（`check`、`refuse(reason)`），助理把 `revoked / invalid / conflict` 映射回自己原来的码；`assistant-offers.ts` 281 → 176 行，退成助理的适配层，消息、顺序、错误码不变，`assistant-*` 用例全过；卡值读取（`cardInputValues`、`instantIn`、`wallClockIn`）随之从 `assistant-card-view.ts` 进 SDK，宿主不再转出它们；`assistant-island.ts` 与发送路径没动（D28）。
- 2026-10-15（H4 第一部分防腐复查）· 并入 main `a675dc8d`（#549 W4-07 之后）· merge-base `a675dc8d` · 通过：M1 边界、M2 健康门禁对照 merge-base（`styles.ts` 829 行，比 832 少；起初在宿主新建的 `coding-next-steps.ts` 让「Runtime 插件的宿主文件」3 → 4，改为 Coding 自己给后续步骤、宿主只在已有文件里合成，回到 3）、M6 页面资源对照 merge-base（Coding 等 5 个插件包各少 133 字节，工作台与设置样式各少 103 字节，预算已降）、M7 改动文件 lint 0 诊断、M8 页面事件（没有新事件）、M9 翻译（4 句新英文，缺 0）、M10 测试引用（1020 个进程 0 混用）、M15 密钥；M4、M5 不适用（没有合同与动作改动）。人看要点：步骤只派生到屏上已有的那条路（问题卡的选项与提交、轮次卡的「核对并继续」「查看变更」按钮），没有第二个执行入口；`agent-next-steps.ts`、`routes.ts`、`assistant-island.ts` 没动；`client.ts` 行数不变（1643）、字节 −28，抵消在同一文件里（会话地址收成一个 `sessionPath`，避开回执 1d 改的行）；轮次以「未变」存根返回时，页面留着的整轮视图带着它自己的 `next_html`，所以每轮都画、页面只显示最新一轮的。
- 2026-10-15（H3 防腐复查）· 合入 main `7fe8ee65`（#534 P3a 之后）· merge-base `7fe8ee65` · 通过：M1 边界、M2 健康门禁对照 merge-base、M4 API 快照（`search` 多了引用候选的类型，`agent-interaction` 多了 `AGENT_QUESTION_HOST_REASONS`）、M5 动作快照（多一行 `search.references@1`）、M6 页面资源、M7 改动文件的 lint、M8 页面事件、M9 翻译、M10 测试引用、M14 `pnpm test:security` 55/55、M15 secrets。已修：合并时 main 把 S-24 给了 Assistant 的 HTML 投影，本线的对象引用改为 S-26（表、用例名、注释一起改）；`tests/security-invariants-object-references.test.ts` 第二条在暂停前没跑过，起跑方式不对（角色没有 `ask-user`），改成与 `agent-sdk-effects` 相同的起法。人看项：第 11 条，`search.references` 的页面调用者在情境线 W3-B（统筹 10-15 排在 H3 之后），本 PR 里它的使用者是宿主的提交复核（同一对 `findReferenceCandidates`/`confirmReferences`）与 MCP、工作流可发现的目录；`reference` 题型按 D23 在之后的切片开放。
- 2026-10-15（S1 防腐复查，#532 合入 main `eebfa9f3`）· merge-base `414f61b4` · 通过：M1、M2、M4、M5、M6、M8、M9、M10、M14、M15；人看项 27 条见 #532 正文。暂缓：第 6 条（插件要模型走 `services.model`，W3-06-E）——Form 仍是构建期插件，`services.model` 只给 Plugin Runtime 运行的插件；Form 照旧经宿主注入的 `completeText` 端口，S1 没加新路径；Form 迁到 Plugin Runtime 时随 W5-11 换成 `services.model`（统筹 10-15 定）。
- 2026-10-15（W4-04 第三片关掉上一条的暂缓第 6 条）：Form 改由 Plugin Runtime 装配，「AI 生成题目」经 `services.model` 调模型（`plugins/native/form/src/plugin.ts`），宿主不再给 Form 注入 `completeText`。先问的问题卡改从 Runtime 的出口出：`dispatchRuntimePluginRoute` 的 `withPluginInteraction`。`tests/form-runtime-routes.test.ts` 的 W4-04-05 走这条路：needs_input → 卡片 html → 回答后接着生成；去掉这个出口上的 `withPluginInteraction`，它就失败。`form-actions.e2e`、`form-draft-questions` 也通过。
- 2026-10-13 晚（防腐复查 2）· 合入 main `1a9416ec` · merge-base `1a9416ec` · 通过：M1 边界、M2 健康门禁对照 merge-base、M4 API 快照（只有本线有意的 `agent-interaction` 新子路径与 `agent-host` 搬走的类型）、M5 动作快照无变化；人工项：新合同子路径同一次合入就有真实使用者（宿主、Coding、助理）和守它的用例；合同包只放类型与常量；新错误码沿 `AgentHostErrorCode`；巨大单元不变大（见 20.0）；没有改门禁。
- 2026-10-13（防腐复查 1）· 合入 main `1ec92c18` · merge-base `1ec92c18` · 通过（机器项）：M2 `check-health-gates --base origin/main` 全绿（157 个巨大单元不变），M8 页面事件已登记；M9/M10 列出的是 main 上已有的翻译冲突与测试引用，不是本线新增。未做：M1 `boundary:check`、M5 动作快照、M6 页面资源（需要构建，等 build 锁）；人看项 3.19（页面资源）见下一条 A1 字节预算，暂缓，等 A1 开工前定办法。本线到目前只改了设计系统、预览脚本、需求书，没有动合同、动作、宿主。
- 2026-10-13（A1 字节预算，实测）：`INTERACTION_CLIENT_SCRIPT` 17,644 字节、`INTERACTION_STYLES` 17,428 字节；助理岛里要被替换的 `renderQuestion`/`renderCard`/「接下来」行约 18 KB，`craft-finish` 里对应的助理样式约 6.6 KB。页面资源门禁只许变小，所以 A1 按现在的划分净增约 10 KB（`molis-work-workbench.css`）；样式若同时进另外两张表则更多。需要在 A1 开工前定办法：（a）把 `INTERACTION_STYLES` 缩到能与被替换的助理样式抵平；（b）同一 PR 里删 `molis-work-workbench.css` 里别处已被取代的样式；（c）请用户对这一项放宽门禁。构建锁放开后用真实构建量 `workbench.css` 与 `workbench.js` 再定。
- 2026-10-12（C1+H1）：在 #408 的分支上写了带类型的题的合同、投影、预检、错误码与题型交集；验证在构建锁放开后做（证据另记）。
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

## 20. 远端交接（2026-10-13，历史记录）

> 已被开头的「交接（2026-10-20）」取代：下面的分支、工作树、授权与下一步都是 2026-10-13～14 的状态，留作历史，不再照做。§20.15 末的验收表（AC 各行）例外，它一直更新到 2026-10-20，是现行的。

> **统筹补充（2026-10-13 晚，先读）：暂停期间 main 上有两次大合并，本节下文写于知道它们之前。**
>
> - **#471**（yijunw0212，10-13 08:24 UTC，78 个文件）把桌面 Computer Use 合进 main，并把 main 的 vendored SDK 换成 `prologue-sdk-0.0.0-rc.1-computer-use.tgz`。它的来源是 Prologue `d4908c11`（分支 `feat/desktop-computer-use`，基于 `c4b9fde3` = `4f7110fe` + 采用修正 + 5 个 Computer Use 提交）；provenance 写着 `pushed: false`，这个提交**不在 Prologue main，也不在 GitHub 远端**。这份包**不含**已进 Prologue main 的 S1–S3、带类型问卷（`a06ae62e`）、P1 合同、P2a–P2f。main 上同时还留着旧的 side-panel-memory 包与补丁（两份 tgz）。#471 还新增了右栏的电脑格（`apps/workbench/src/side-panel-computer.ts`）、`contracts/services/computer.ts`、`services/ui-surfaces.ts`，改了助理服务、`assistant-island.ts`、`prologue-node.ts`、`prologue-stream.ts`、`contracts/services/agent-host.ts`，并把 10-09 版的 `specs/ai-interaction-experience/spec.md` 与参考图带进了 main。
> - **#472**（yijunw0212，10-13 10:54 UTC，93 个文件 +3399/−953）把旧采用树 `feat/prologue-adoption` 的 10 个提交（10-09 的 `77fde104`…`8b1a0522`）合进 main：一轮的推理力度、运行中换模型、逐轮写入记录（约等于 A1）、灵光流式（A3 的一部分）、助理把交出去的工作收回来后接着做（`8b1a0522`「第 14 项」，A0 当时明确不纳入的私有接续）、变化等待（`b3235bb1`/`8c0b60fb`，约等于 A4）。它沿用 #471 的 computer-use 包，没有换包。main 上的 `specs/prologue-adoption/spec.md` 是 10-09 的旧版（标题「Prologue 新能力接入：修复、适配与功能优化」）。
> - 统筹层的说明与后续顺序见远端分支 `coordination/handoff-2026-10-13` 的 `coordination/2026-10-13/README.md` §2a。
> - **以下更正优先于本节下文（统筹审查，2026-10-13）：**
>   1. 状态句与 §20.5-2「#408 进 main 后把 `feature/agent-typed-questions` 合进 #410」：不要整支合。那个分支叠在 #408 的旧点 `de111f91` 上（带的是旧的 `-fields` 包，比 #408 现在落后很多），整支合会带进 #472 已经取代的提交。做法：只取 `c50a5534` 这一个提交的改动，等统一 SDK 包进 main 后，在 main 上按 #471/#472 的新形状重做。
>   2. §20.2 的 head：#410 现在是 `cda21315`。顺序「#408 → #411 → #410 → #409」已过时，见 README §2a-4。
>   3. §20.4-1 把 ANTI-CORRUPTION-REVIEW.md 叫「本机文件」：它在远端分支 `coordination/handoff-2026-10-13` 的 `coordination/2026-10-13/ANTI-CORRUPTION-REVIEW.md`。
>   4. §20.4-3「`prologue-node.ts` 正好 1550/1551」：那是 #408 上的数；main 上这个文件被 #471/#472 改过，重做 C1+H1 时重新量。
>   5. §20.6 说 #408 的包是 `-fields.tgz`（`55b0c85a`）：#408 现在带的是 `-adoption-receipts-handling.tgz`（来源 `f5ef12e6`）；`-fields` 只在 C1+H1 那条旧分支上。
>   6. 把 main 合进 #410 时实际只冲突两个文件：`packages/design-system/README.md`、`specs/ai-interaction-experience/spec.md`（规格以 #410 为准）。
> - 文中 `coordination/2026-10-13/…` 都是远端分支 `coordination/handoff-2026-10-13` 上的文件（原来写的本机路径 `.claude/locks/…` 已统一改成这里）。
>
> **对本线的影响：**
> 1. Molis main 现在的 SDK 包**不含带类型问卷**（`a06ae62e`）。C1+H1 在 Molis main 上要等采用线把统一包（Prologue main + Computer Use 分支合流后重打）换进 main 才能接；它现在叠在 #408 的分支上，那个包有问卷。#471/#472 也改了 C1+H1 会碰的 `prologue-node.ts`、`prologue-stream.ts`、`contracts/services/agent-host.ts`，合进来时要按 main 的新形状重做那部分。
> 2. #471 把 10-09 版的 `specs/ai-interaction-experience/spec.md` 与三张参考图带进了 main，和 #410 的新版冲突：合 main 时**规格以 #410 为准**，参考图逐字节相同的话两边无差别。
> 3. #471/#472 都改了 `assistant-island.ts`（A1 要动的地方）、助理服务和页面资源预算（`page-assets.json`）：A1 的「共享客户端进 workbench.js，删旧渲染抵字节」要按新的 main 重新量字节。


写给另一台机器上的接手者：这一节取代 2026-10-11 的旧交接，只靠远端分支就能接续；本机工作树、本机锁文件与 scratchpad 你看不到，需要的内容已复述在下面。统筹层的事实也在远端分支 `coordination/handoff-2026-10-13`（目录 `coordination/2026-10-13/`），与本线直接相关的部分已写进 §20.6。

### 20.0 当前状态（2026-10-13 晚，统筹接手后，先读）

本节之后的 20.1–20.11 写于 10-13 白天；与本节不一致的以本节为准。

- **合 main 到 `1a9416ec`**：#411 情境浮条、#408 采用线与过渡 SDK 包（`interim-p1-cu`，带带类型的问卷）都已在 main。冲突只有 `packages/design-system/README.md`（两边都留）。
- **C1+H1 已在 main 的新形状上重做**（`69d8f660`），取自 `c50a5534` 这一个提交，没有整支合 `feature/agent-typed-questions`：
  - 新合同子路径 `services/agent-interaction`；
  - agent-host 的显式投影与按 SDK 规则的预检，错误码 `agent.answer_invalid`；
  - 宿主声明各界面画得了的题型。
- **与 C1+H1 原稿不同的两处**：
  1. 回答里的数组改成只读，与 SDK 的 `QuestionnaireAnswer` 一致；原稿不能编译。
  2. 题型清单改成「这个界面画得了的**带类型问卷**题型」，现在两个界面都是空（`82cc8c3e`）。原稿给 `["choice"]`，以为「产品行为不变」。实际上只要给了 `askUserQuestionTypes`，哪怕只有 `choice`，模型拿到的 `ask-user` 就换成带类型的形式（选项带说明、推荐与默认值）；现在的助理与 Coding 都画不出这些，Issue 的澄清页也依赖原来的形式。`issue-clarification-page` 的 ISSUE-34 抓到了这一处。现在宿主只在交集非空时才给这项配置，Runtime 维持原来的纯选择题；A1、A2 在教会界面画带类型形式的同一个改动里把 `choice` 加进各自的清单（D8 改订）。
- **为了不让巨大单元变大**：
  - 题型清单在宿主装配 Prologue 选项的地方（`system-agent-service.ts`）传入，不进 `composeAgentHost`；
  - 助理用 `AgentRunView["awaiting_input"][number]` 取问题类型，不再多一行 import。
- **I0 预览的浏览器用例**：迁到共享客户端之后第一次重跑，31/31。其中一处断言按共享客户端的既定行为改了（`37da9a0e`）：回车跳项落在下一组的已选项或第一个控件上，不落在组本身。
- **工程证据**：
  - 构建、健康门禁（对照 merge-base）、边界检查通过；API 快照只多 `agent-interaction.txt`，`agent-host.txt` 少了搬走的类型；动作快照没有变化。
  - `affected-tests` 选出的 392 个文件、3335 条：3320 通过、11 失败。11 条都已处理：
    - 7 条安装类：本树只增量构建过 local-host，源码与构建指纹对不上；整体重建后通过。
    - 2 条 ISSUE-34：上面的第 2 处，已修，通过。
    - 2 条 I0 预览：上面的断言，已改，通过。
  - `interaction-client.e2e` 14/14。
  - 全量（`node scripts/run-tests.mjs`，合 main `b15ba0b1` 之后的 `609a5fed`，约 111 分钟）：6211 条，6198 通过、4 失败、9 跳过。4 条都不是本线引入的：`settings-requests-through-helper` 一条 main 上同样失败，已由 #487 修好；`touch-targets.e2e` 两条 main 上同样失败；`goal-event-document.e2e` 一条是负载下的时序（单独跑本线与干净 main 都 3/3）。之后再合 main `703bd996`（#478、#486、#487）：没有冲突，重建、健康门禁、页面资源都过，这几次合并改过的 7 个用例文件 64 条，63 通过、0 失败、1 跳过。
- **用户 2026-10-13 定**：A1 与 H2 合成一个改动落地，不放宽页面资源门禁（20.11 的 (a)+(b)+(b′)，加上 H2 删掉 `renderCard` 与「接下来」行）。H2 按 W5-10 的协作者形状做，算 W5-10 的一部分。
- **A2 要带的合同改动**：main 上 #477 把 `coding.runs.control` 升到第 2 版，`answer` 的每一项只收 `question`、`indexes`、`other`（`additionalProperties: false`），对应现在的纯选择题。A2 让 Coding 画带类型的题时要加 `value`，按 `docs/system/CONTRACT-CHANGES.md` 升第 3 版，并在同一个改动里改完调用方。
- **下一步**：#410 全量通过后由统筹合进 main；之后在新的 PR 上做 A1+H2，再 A2、H3、H4、S1。

### 20.1 一句话现状

I0 预览、共享展示部件（#423，已进 main）、共享浏览器行为（I1，已并入本分支）都已完成，I0 预览已改用共享客户端；**产品里还没有任何用户能看到的变化**：带类型的题进宿主（C1+H1）写完但没构建、没验证；助理与 Coding 的接入（A1/A2）、操作卡协作者（H2）、对象引用（H3）、Coding 操作卡（H4）、单次接续（S1）都没开始。

三级证据分开记：

| 级别 | 状态 |
| --- | --- |
| 工程通过 | I0 预览：纯逻辑 21/21、浏览器用例 10/10（2026-10-12，迁到共享客户端**之前**）；设计系统部件与 I1 客户端：单测与 13 个浏览器子用例（I1 自己的树上）。**迁移之后的预览浏览器用例、合并后的树上的 `interaction-client` 浏览器用例都还没重跑**；C1+H1 没构建、没跑任何用例 |
| 真实产品实操（开发者走查） | I0 预览在内置浏览器里走查过（三个宽度、浅深色）；真实 Home、真实 SDK、真实模型：**不适用/未做**（预览不连这些）。迁到共享客户端后没有再走查 |
| 用户验收 | **未开始**：用户还没看过实物；统筹代定的各项只是拍板，不等于验收 |

### 20.2 分支与 PR（只列远端）

仓库 `molis-ai/molis-work`，推送用 SSH 地址 `git@github.com:molis-ai/molis-work.git`。

| 分支 / PR | 状态 | 说明 |
| --- | --- | --- |
| #410 = `feature/handoff-ai-interaction` | 开着，head `47babdd5`，**与 main 有冲突，未解** | 本线唯一的交接分支，也是此后唯一提交的地方（用户 2026-10-13 决定：各线只在交接 PR 里提交，防腐线在改架构，单开 PR 容易冲突）。冲突来自 main 上别的线的新合并（#408 与 #411 当时都还没合；统筹更正：#438 是关闭不是合并） |
| #423 `feature/design-system-interaction-parts` | **已合进 main**（`05c46f67`） | 设计系统的展示部件与组件板「AI 交互」区块 |
| #439 `feature/interaction-shared-behaviour`（`b4015af1`） | 内容**已并进 #410**，PR 已关 | I1 共享浏览器行为；远端旧分支不用再动 |
| #447 `feature/agent-interaction-contract`（`704d95de`） | **作废**，PR 已关 | C1a（只有合同子路径、没有使用者）已并进 C1+H1，不要用 |
| `feature/agent-typed-questions`（`c50a5534`） | 无 PR，统筹已代推，叠在 #408 的分支上 | C1+H1：**未构建、未验证**。#408 进 main 后：先把 main 合进 #410，再把这个分支并进 #410 |

合入 main 的顺序（统筹定）：#408 → #411 → #410 → #409。#408（完整采用，带带类型 `ask-user` 的 vendored SDK）和 #411 在 2026-10-13 还开着。

### 20.3 已完成（带证据等级）

1. **I0 第二轮 R1–R13**（2026-10-12，§19.1）：按产品框架重做布局、信息层级、操作路径、状态反馈。工程通过（21/21、10/10）+ 开发者走查；用户验收未开始。R4（输入框补充）的最终语义见 §20.6。
2. **#423 共享展示部件**（已在 main）：`packages/design-system` 的 `interaction.ts`、`styles/interaction.ts`（`INTERACTION_STYLES`，**不并入 `PRIMITIVE_STYLES`**，原因是页面资源冻结）、`interaction-example.ts`、`catalog-examples.ts`，组件板 `/__ui/catalog` 的「AI 交互」区块；单测 `tests/interaction-components.test.ts`、`tests/interaction-sdk-mapping.test.ts`。工程通过；组件板在隔离宿主上浅深色、三个宽度目视过。
3. **I1 共享浏览器行为**（并入 #410）：`packages/design-system/src/interaction-client.ts`——`createInteractionClient(root, host)` 与脚本表达式 `INTERACTION_CLIENT_SCRIPT`（17,644 字节）；覆盖选项/对象切换、单选组方向键、步进器上下界、日历、回车跳项与 ⌘/Ctrl+回车、输入法组合期间不报变化、`write` 不夺走正在输入的字段、`showErrors` 逐字段；客户端不存值。用例 `tests/interaction-client.e2e.test.ts`（13 个子用例，I1 树上通过；合并后的树上未重跑）。评审里修过：点外面收起、WebKit 的 keyCode 229、焦点落在选中的 radio、选择器注入。工程通过；真实中文输入法、Safari/桌面壳、读屏未验证。
4. **预览迁移**（并入 #410，`b06be31f`）：`scripts/ai-interaction-slice/` 改用 `createInteractionClient`，删掉预览自己的 `calendar.ts`，`bindings.ts` 只剩演示按钮与输入框；服务端额外提供 `/packages/design-system/src/interaction-client.ts`。净减 128 行。局部 typecheck 与纯逻辑 21/21 通过；**浏览器用例未重跑**。
5. **防腐复查 1**（合入 main `1ec92c18` 后）：`check-health-gates --base origin/main` 全绿，页面事件已登记；构建类检查没跑（见 §20.4）。

### 20.4 没完成

1. **#410 要合 main 并解冲突**：`git fetch git@github.com:molis-ai/molis-work.git main`，合并 `FETCH_HEAD`（不 rebase、不 force-push）；枢纽文件两边都留；`tooling/gates/api/**`、`tooling/gates/actions/**`、`baseline.json`、`page-assets.json` 不手工合并，合完重新生成。合完按 `ANTI-CORRUPTION-REVIEW.md`（统筹维护，27 条人看项 + 16 条机器项；本机文件，复述在统筹分支里）复查并把结果写进 §18。
2. **验证欠账**：合并后整体构建，然后重跑 `tests/ai-interaction-slice.e2e.test.ts`、`tests/interaction-client.e2e.test.ts`（需要本机 Chrome 与 browser 锁），再跑 `pnpm boundary:check`、动作快照、页面资源检查。
3. **C1+H1**（分支 `feature/agent-typed-questions`，`c50a5534`）：
   - 内容：新合同子路径 `@molis-ai/molis-work-contracts/services/agent-interaction`（`AgentQuestion` 六种题型、`AgentQuestionAnswer`、`AgentQuestionProblem` 与 19 个闭集原因、`AgentAnswerControl`、`AgentPendingQuestion` 从 `agent-host.ts` 搬来）；`agent-host.ts` 净减 24 行并加错误码 `agent.answer_invalid`；`prologue-questions.ts` 新增 `projectQuestion`（显式投影、不再透传 SDK 选项对象）与 `answerProblems`（调 SDK 的 `validateQuestionnaireAnswer`）；`prologue-node.ts` 的 `answerPending` 先预检、形状错误都有码，配 `inputWaitTtlMs` 24 小时与 `askUserQuestionTypes`；宿主装配（`apps/local-host/src/agent-question-surfaces.ts`）给 Runtime 的题型是助理与 Coding 声明的**交集**，现在两边都只有 `choice`，所以**合入后产品行为不变**；测试 `tests/agent-typed-questions.test.ts`（期望已用 SDK 校验函数单独核对过）。
   - 没做：构建、`pnpm api:update`（agent-host 快照 + 新增 `agent-interaction.txt`）、`pnpm actions:update`、任何用例（含 `tests/agent-pending-questions.test.ts` 的类型修正）、`prologue-node.ts` 行数上限（正好 1550/1551）与 `@prologue/sdk` 的 `askUserQuestionTypes` 能否接受只读数组的类型核对；`agent.answer_invalid` 要登记进 main 上新的错误模型（`tooling/gates/error-owners.json`、`defineErrorCodes`）；真实 Node Host 用例（带类型问卷落盘、关闭、新 Runtime 读回并作答）。
   - 回答的 `key` 不在这一片：归回执线 `services/agent-inputs`（D13）。
4. **A1 里不依赖新 SDK 的部分：没有写代码，只做了测算（2026-10-13 合并 main 后用门禁的口径重新量过，结果与办法见 20.11，替换这里早先的数）**。早先的「被替换的助理 JS 约 18 KB、样式约 6.6 KB、`INTERACTION_CLIENT_SCRIPT` 17,644、`INTERACTION_STYLES` 17,428」是源码字节，不是门禁量的送出字节，作废。现状（`apps/workbench/src/scripts/client/assistant-island.ts`，2,802 行）：`renderQuestion` 591–646 行、`renderCard` 连同 `EFFECTS` 等 682–782 行、「接下来」行 993–1015 行；`craft-finish.ts` 与 `touch-targets.ts` 里有对应的 `.assistant-questionnaire/-choice/-card-*/-next-*` 样式。开工前的办法已有数字，要用户定一项（20.11）。

### 20.5 下一步（按顺序）

1. 合 main 进 #410、解冲突、复查、构建、补验证欠账（§20.4 第 1、2 条）。
2. #408 进 main 后：再合一次 main，把 `feature/agent-typed-questions` 并进 #410，做完 §20.4 第 3 条的验证。
3. **A1 助理接入**（前置 C1+H1、I1）：先定字节办法；宿主新协作者 `assistant-questions.ts` 把问题转成 `InteractionQuestionView` 并服务端渲染 HTML 放进视图（同 Coding 的 `question.html`；岛是字符串脚本，不能在浏览器里调设计系统的渲染函数）；岛只接行为（`INTERACTION_CLIENT_SCRIPT` 进 `workbench.js`）；草稿存助理库新表 `assistant_question_drafts`；删 `renderQuestion` 与对应样式，用删掉的字节抵新增；`assistant-island.ts`、`assistant-service.ts` 只减；新文案给英文；`assistant-base` 升版；在助理声明里加上它画得了的题型；验收 AC-21。
4. **A2 Coding 接入**：`ui.ts` 问题卡改用 `renderInteractionQuestion`，`client.ts` 用共享函数，`routes.ts` 的 `questionAnswer` 收 `value`，`question_drafts` 收值，`coding-base` 升版，在 Coding 声明里加题型；Coding 客户端字节在 5 个包里都不涨；AC-22。
5. **H2/H3/H4**：H2 操作卡协作者（`assistant-offers.ts`，W5-10 形状）、H3 对象引用只读动作 `interaction.references.search`（`pnpm actions:update`，安全不变量加拒绝用例）、H4 Coding 的 `suggest-action`；AC-23–25。
6. **S1 单次接续**：题型校验纯函数放 `packages/plugin-sdk`（不放 kernel），与 Prologue 的 `validateQuestionnaireAnswer` 做一致性用例并加进 `tests/ci-product-subset.txt`；Form「AI 生成表单」缺信息返回 `needs_input` → 同一问卷卡（宿主提供客户端挂载）→ 接续生成。Form 现在没有这个功能，是新功能；AC-26。
   - **S1 状态（2026-10-15，PR #532，分支 `feature/ai-interaction-s1`）**：已实现；构建、门禁与定向用例通过，全量在 CI 上跑。做法：
     - `packages/plugin-sdk` 的 `questionProblems`、`questionSetFlaw`（在 Molis 的形状上复刻 Prologue 的规则）。`tests/question-rules-consistency.test.ts` 用 36 组输入覆盖全部 19 个原因，与 agent-host 的 `answerProblems`（背后是 `validateQuestionnaireAnswer`）逐条同结论，已进 `ci-product-subset`。
     - 合同 `InteractionRequest` / `InteractionRequestResult`（`services/agent-interaction`）：插件动作「先问几个问题」时的结果形状 `{ status: "needs_input", interaction }`。
     - 宿主 `withPluginInteraction`（`apps/local-host/src/plugin-interaction-answer.ts`）挂在插件路由共用的两处出口：Native 的 `dispatchNativePluginJsonHttp` 与 Runtime 的 `dispatchRuntimePluginRoute`。对任何插件，见到这个形状就补上共享问卷卡的 html，底部那句由插件的 `note` 给；见到 `details.problems` 是问卷原因的拒绝，就补上逐字段的 `details.errors`（与助理的卡同一套文字）。它不认插件、不认错误码。
     - Form 新动作 `form.questions.draft@1`（「AI 生成题目」，concurrent，`model:invoke`），旧的 `form.questions.ai@1` 与提示词 `form.draft-question` 已删，不留兼容（防腐复查第 1 条）。
       - 回答按问过的那几道题检查（`form.answer_invalid`，`details.problems`），通过后带着原要求与回答再调一次模型，只追问一次。
       - 问卷里已有的题不发给模型，与旧动作「本地题目不出本机」一致。
       - 问过的题只存在插件进程里（至多 32 组、一天），绑定问卷 id、项目与版本；问卷在回答期间改过就请人重新生成。这不是持久等待。
     - 页面只绑定共享客户端（`host.interaction`）：请求在途时问卷区 inert，卡片出现时第一题取得焦点。`form.js` 37633 → 37472 字节，`client.ts` 930 → 899 行。
     - 作者手册：`skills/molis-plugin-dev/ui.md`「动作先问几个问题再接着做」。
     - 验证：`tests/form-draft-questions.test.ts`、`tests/plugin-interaction-answer.test.ts`（AC-26），以及 `tests/form-actions.e2e.test.ts` 在 1440/390 走「问 → 空答被拒在字段旁 → 回答 → 题目追加」。题型仍只开放 choice（D8 交集），开放其他题型是后面单独一片。
7. **D1 文档**随各片：`skills/molis-prologue-ai`、`docs/platform/PROLOGUE-AI.md`、`skills/molis-plugin-dev`（含 `generated-ai.md`）、设计系统 README；§15.8 三个示例都要有用例。

### 20.6 跨线约定

- **X2：操作卡不进任务图**。卡与节点的关系靠推导 `card.run → boards.attemptOf(run) → node`；H2 必须给每张卡保留产生它的 session 与 `run_id`，助理与 Coding 共用同一个卡片键空间；卡不是等待条件，也不授予权限。
- **X6：P2 之后不再有绕过看板的 Agent 协作**（dispatch 自动建子节点，session-send 的交接必须点名节点）。H4、A2 按此写。TaskBoard 与外部条件等待归采用线，本线只显示不另存。
- **H2 = 防腐 W5-10**（从 `AssistantService` 拆操作卡协作者）：防腐线尚未开工，**开工前要等防腐线负责人确认先后**；本线 PR 要在 `specs/repository-anti-corruption` 的 W5-10 行写「由 ai-interaction H2 实现」并带链接。
- **回执线的三条约定**（在 `feature/handoff-ai-input-receipts` 的 `specs/ai-input-receipts/spec.md`，那一线的 PR 现为 #409；#438 已关）：D13 回答也是输入，身份类型与格式由 `services/agent-inputs` 定义，回答的 `key` 与 steer 的同一规则（SDK 里是可选的，所以回答的也可选），回答的「读到」回执等它的 S4，在那之前本线只在 Molis 侧做幂等；D14 把 D5 修订为问题待回答时输入框上方显示目标芯片、**默认值一直显示在芯片上、一下切换**；D15 `AgentRunControl` 搬迁先后：本线搬出 `answer` 分支，回执线搬出 `steer` 分支，先就绪的先合，后合的在同一个 PR 里改完所有消费者。
- **R4 并进 D5 芯片**（本线推荐，统筹按「体验最好」原则定）：芯片三种目标——「写进问卷：补充要求」（**本线做**，只改问卷草稿，不交回，有自由文本题时才有、并且是默认）、「补充这一轮」（**回执线做**，一条 steer，排在回答之后，带回执）、无问题时芯片不出现。
- **`catalog-examples.ts`**（组件板示例）情境线 W1 也会加区块：各加各的一行，先合者先合。
- **和 Prologue 的关系**：真实 SDK 带类型的 `ask-user` 在 #408 的合成包里（`vendor/prologue-sdk/prologue-sdk-0.0.0-rc.1-adoption-receipts-fields.tgz`，Prologue main `55b0c85a`）；SDK 的 `askUserQuestionTypes` 与 `inputWaitTtlMs` 是 **Runtime 级**配置，不是每个 Run 或角色一份，所以宿主给的是各界面都画得了的题型交集（D8 改订）。

### 20.7 决策记录与理由

已记在 §16（D1–D11）与 §19.1（R1–R13），这里只列接手最需要的几条和统筹代定的事项：

- **D7**：设计系统只收展示参数，不认识 SDK 与回执；消费方写纯函数转换，`reason → 文案` 由消费方做。理由：接入时不改组件。
- **D8（改订）**：每个读 `awaiting_input` 的界面各声明自己画得了的题型，宿主给 Runtime **交集**；界面加一种题型与让它画出来的改动在同一个 PR。理由：SDK 把题型配置放在 Runtime 级，否则会有 Run 问出某界面画不出来的题把人卡住。代价：助理与 Coding 要么一起开放一种题型，要么都不开放。
- **D9**：助理问题卡由宿主用设计系统渲染函数服务端渲染成 HTML，岛只接行为。理由：岛是字符串脚本，不能在浏览器里调渲染函数；只有一份渲染，岛的字节变小。
- **D10**：回答的身份与 R4 交统筹，已由 D13/D14 落定（§20.6）。
- **D11（统筹代定）**：C1 与 H1 合成一片叠在 #408 上；S1 移到 A1/A2 之后；校验函数放 `packages/plugin-sdk`。理由：C1a（#447）只有合同没有使用者，违反「新子路径要有真实使用者」；kernel 的 K2 门禁不许 import services，而且它不是外部作者要装的包；S1 要新开 Form 功能并动公开 SDK 出口，体量最大又不阻塞助理与 Coding 的体验。取舍：#408 迟迟不合时，C1+H1 要带着 #408 的提交一起评审。
- **R1–R13**：见 §19.1 的表（布局放进工作台框架、问卷紧凑、回答后折叠为摘要、R4 回车放进补充要求、日历与开始时间拆分、由记录推出的下一步、下一步位置锁、失效后草稿可写、回车跳项与 ⌘/Ctrl+回车、就近状态反馈、助理面板可最小化、回答后失效保持摘要、失败后重试回到待执行），每条都有收益与取舍。
- **统筹代定的流程事项**：各线只在交接 PR 里提交；跨线依赖经 main，每次合 main 后按防腐清单复查本线 diff 并写进 §18；不单开 PR；合并由统筹做、各会话不自己合并。

### 20.8 工作规则（用户原话与已定规则）

- 用户 2026-10-13：「不用单开PR，每个线都只在之前的交接PR里commit，因为有另外的防腐线在做代码质量和架构升级，所以单开PR的话，如果防腐有改动，容易导致架构问题」。
- 用户：「先推进按照当前main的代码开发功能，如果几条线之前有依赖关系，从main拉取最新代码合并入各自分支之后按照防腐线防腐要求进行复查，确保需求迭代的同时不与防腐要求冲突，几条线的开发顺序由你统筹」。
- 用户 2026-10-12：「优先开发，全量回归测试不用每次都触发，攒一波一起弄，除非必须」——平时只守「整机同时最多一个构建、一个浏览器用例批次」，每次改动跑 `node scripts/affected-tests.mjs` 选出的定向用例，不自己跑全量。
- 拍板规则：技术决策按防腐线的后果判断；功能线按对用户 UI 交互与使用体验最好的推荐走；本线内的决定自己定、写进决策记录并汇报；跨线或改目标/范围找统筹。**仍先问用户**：合并 Molis/Prologue main、发布、真实 Home/安装版、放宽门禁、读真实凭据。拍板不等于用户验收。
- 推送用 SSH 地址，推送前先 `git fetch` main 再跑 `node scripts/check-secrets.mjs`（即 `pnpm secrets:check`）；提交署名为用户 `jing xu`；不重置、不覆盖别人的未提交改动；不碰真实 Home（4207/4173），预览一律用临时/隔离 Home。
- 模型：规划用 Opus 5.5，执行用 Sonnet 5.5。
- 2026-10-13 03:55 用户说「先暂停一下」：全部会话停在安全点、释放锁、不开新任务，等统筹的恢复通知；之后用户只为「写交接」和「把本地进展提交到远端」两件事临时解除暂停。

### 20.9 已知问题

- Molis 的 `tests/runtime-integration.test.ts` 在 Linux CI 上偶发失败，统筹判断与本线无关；#410 / #423 的 `Product subset` 失败曾因此出现，本线没有改它。
- 页面资源字节预算（§20.4 第 4 条）。
- Auto-fix 在持续报告 #410 与 main 的冲突（head `47babdd5`）；暂停期间没有处理，恢复后按 §20.4 第 1 条解决。
- 预览的组合输入与 keyCode 229 用例用的是合成事件，只证明事件处理，不能代替真实中文输入法（含 Safari/桌面壳里的 WebKit）；读屏下未验证。
- 浏览器侧只能用 `INTERACTION_CLIENT_SCRIPT` 字符串，不能从设计系统包根 import `createInteractionClient`（包根会带进只给 node 用的模块）。
- `pnpm` 在有些非交互 shell 里不在 PATH：用 node 目录里的 corepack（`corepack pnpm …`）。
- 旧分支 `feature/interaction-shared-behaviour`、`feature/design-system-interaction-parts` 的内容已经在 #410 或 main 里，不用再推。

### 20.10 怎么复现

```sh
pnpm install --frozen-lockfile --offline
pnpm build                                  # 或 pnpm workspace:build；浏览器用例前需要
node --import tsx scripts/preview-ai-interaction.mts --port 4319   # I0 预览（固定示例、模拟提交）
node scripts/run-tests.mjs tests/ai-interaction-slice.test.ts                     # 预览纯逻辑 21 条
node scripts/run-tests.mjs tests/ai-interaction-slice.e2e.test.ts                 # 预览浏览器 10 条（本机 Chrome、browser 锁）
node scripts/run-tests.mjs tests/interaction-client.e2e.test.ts                   # 共享客户端浏览器 13 个子用例
node scripts/run-tests.mjs tests/interaction-components.test.ts tests/interaction-sdk-mapping.test.ts tests/primitives.test.ts
node node_modules/typescript/bin/tsc --noEmit --target ES2023 --module ESNext --moduleResolution bundler --allowImportingTsExtensions --strict --noUnusedLocals --noUnusedParameters --skipLibCheck --lib ES2023,DOM,DOM.Iterable scripts/ai-interaction-slice/client.ts tests/ai-interaction-slice.test.ts
node scripts/check-health-gates.mjs --base origin/main
# 并入 C1+H1 之后
node scripts/run-tests.mjs tests/agent-typed-questions.test.ts tests/agent-pending-questions.test.ts tests/coding-question-card.test.ts
pnpm api:update && pnpm actions:update      # 然后看 tooling/gates/ 下的 diff
node scripts/gates/page-assets.mjs --base origin/main
```

组件板：隔离宿主上打开 `/__ui/catalog` 的「AI 交互」区块。

### 20.11 A1 字节预算：实测与办法（2026-10-13，合并 main 之后；只量不改）

口径：门禁量的是宿主送出的字节（`tightenServedCss`/`tightenServedJs` 之后的长度），不是源码字节。我用同一批函数在一棵构建好的 main 等价树上复现了冻结预算（`workbench.css` 1,805,325、`workbench.js` 1,172,188），下面全是送出字节，括号里的「估」是没写代码的估计。早先 §18、§20.4 里的约 18 KB / 6.6 KB / 17.4 KB 是源码字节，作废。

| 项 | 送出字节 | 落在哪 |
| --- | ---: | --- |
| 要加：`INTERACTION_CLIENT_SCRIPT` | 12,028（`interactionFields` 4,017、`interactionCalendar` 3,524、`assembleInteractionClient` 4,406） | `workbench.js`；若 Coding 自己嵌一份，5 个 Coding 系插件包（coding、diff、files、git、text-stats，各 462 KB）每个再加 12 KB，所以 A2 要用宿主提供的那一份，不嵌 |
| 要加：`INTERACTION_STYLES` | 16,565（问卷卡、字段、选项、选择、通知、操作区约 9.2 K；日期与数字 1.5 K；对象行 1.2 K；操作卡 2.2 K；下一步 1.9 K；媒体查询与续行 0.6 K） | 只需进 `workbench.css`：助理岛与 Coding 页面只在工作台页（`workbench.js` 只被工作台页载入），`settings.css`、`arrival.css` 不需要 |
| 要加：岛里的接线（挂载服务端渲染的 HTML、读写草稿、提交、字段错误） | 约 1.5 K（估：草拟了一份接线，送出 1.3 K，留余量；原因到文案的对照放在宿主，随错误一起返回，岛里不带 19 条的表） | `workbench.js` |
| 可删（A1）：`renderQuestion`（island 591–646 行） | JS 3,068 | `workbench.js` |
| 可删（A1）：`.assistant-choices/-choice/-choice-row/-answer/-questionnaire` 的样式（`craft-finish.ts`，另有一条在 `touch-targets.ts` 里与 `.assistant-code-head` 合写，只能改不能整条删） | CSS 约 2.0 K，三张表各一份 | `workbench.css`、`settings.css`、`arrival.css` |
| 可删（H2，不是 A1）：`renderCard` 及 `EFFECTS` 等（682–782 行）、「接下来」行（993–1015 行） | JS 6,835 + 1,309 | `workbench.js` |
| 可删（H2）：`.assistant-card-origin/-summary/-meta/-status`、`--action`、`.assistant-next-row/-label/-chip` | CSS 2.9 K，三张表各一份 | 同上 |
| 必须留：卡片外壳 `.assistant-card-head/-kicker/-badge/-title/-hint/-actions`（复核卡、问题卡还在用） | 3.0 K | — |

每个文件的净变化（送出字节，A1 单独合入；门禁对照 merge-base，每个 PR 每个文件都要 ≤ 0，**字节不能攒**：`settings.css` 与 `arrival.css` 的下降抵不了 `workbench.css`）：

| 办法 | `workbench.js` | `workbench.css` | `settings.css` / `arrival.css` |
| --- | ---: | ---: | ---: |
| 原划分：整份脚本与样式进来，只删 A1 自己的旧渲染 | +10.5 K | +14.5 K | −2.0 K / −2.0 K |
| (a)+(b) 只带 A1 用到的：日历拆成按需拼入的第四个函数（−3.5 K，日期题型开放时再带）；样式分成问卷 / 操作卡 / 下一步三段，A1 只带问卷段、先不带日期、数字、对象行（约 9.8 K）；与 `mw-choice`、`mw-badge` 等原语去重（估 −2.5 K，要改标记与用例）；再加上面「可删（A1）」 | +6.9 K | +5.3 K | −2.0 K / −2.0 K |
| 同上，且 H2 同一个 PR（再删 `renderCard` 与「接下来」行） | 约 +0.3 K | 约 +5.9 K | −4.9 K / −4.9 K |
| (b′) 在 (a)+(b) 之上，同一个 PR 再删**已核实无人引用**的旧皮肤规则 | 不适用 | 可到 0 或为负 | 同 |
| (c) 请用户放宽（一次性、写明上限与偿还） | 见下 | 见下 | — |

(b′) 的依据：对 `workbench.css` 做了一遍粗扫（类名只在样式文件里出现、没有任何标记或脚本引用），约 79 KB（4.4%）的规则落在这一类，大头是 `momentum.ts`、`personal-shell.ts` / `personal-workbench-v2.ts` / `-v3.ts`、`calm-desktop.ts`、`quiet-paper.ts`；抽查过 `.momentum-group`、`.momentum-queue-item`、`.personal-nav-item`、`.desktop-utility-heading`、`.navigator-goal-row`，确实只在样式文件里。这是启发式（动态拼出的类名按前缀放过，但可能漏判），**逐族人工核对后才能删**，也属于防腐 W5-05（删旧皮肤）的范围，要与防腐线确认先后；扫描脚本与候选清单在统筹的 scratchpad 里（`audit/dead-css.mjs`，不入库）。

**建议**：(a)+(b) 无论如何都要做（把 A1 带进来的字节压到真正用到的那一段）；CSS 用 (b′) 抵平，不需要放宽；JS 在 (a)+(b) 之后仍多 +6.9 K，我没找到同量级的已核实无人引用的脚本，所以请用户对 `workbench.js` 给一次性 +7 K 的上限放宽（只给这一个文件，写明由 H2 合入后偿还：H2 删 8.1 K、加约 1.5 K，净 −6.6 K，A1+H2 之后回到现在的数以内），PR 里附实测。若不放宽，唯一不放宽的路是把 A1 与 H2 的 JS 并进同一个 PR（≈ +0.3 K，再删岛里问题卡的聚焦选择器等零碎即可到 0），但 H2 是 W5-10 形状的助理拆分、体量大、要等防腐线确认先后，**不建议为了字节把两片捆在一起**。不采用的办法：把样式或脚本改成页面 HTML 里的内联 `<style>`/`<script>`——`scripts/gates/page-assets.mjs` 头部写明它不量内联，这样能「绕过」预算，但每次渲染都重发、不能缓存，违背决定 #17 的本意。

A1 开工时一起要改的断言（改成断言采用后的状态，不是放宽）：`tests/interaction-components.test.ts` 的「styles stay out of the frozen product sheets until adopted」（AC-17）；`tests/coss-control-language.test.ts` 的 `.assistant-choice-row, .assistant-code-head` 44px 一条；`tests/touch-targets.e2e.test.ts` 量到的助理问卷控件；`tests/assistant-island-script.test.ts`。

### 20.13 A1+H2（2026-10-14，分支 `feature/ai-interaction-a1-h2`，[#492](https://github.com/molis-ai/molis-work/pull/492)）

做了什么（一个改动，用户 10-13 定）：

- **H2 操作卡协作者**（W5-10 形状）：`assistant-offers.ts`（`recordOffer`、`offerFromPage`、`runCard`、`dismissCard`、`card`、`html`、失效巡检；只经端口依赖宿主）与 `assistant-card-view.ts`（卡片视图、画成共享操作卡、控件值转成输入要的字符串、按人的时区换算时刻）。`AssistantService` 2,542 → 2,287 行。
- **A1 问题卡**：`assistant-questions.ts` 把等待中的问题画成共享问卷卡（带草稿、选择题的默认值），把卡片送回的值转成 Runtime 的回答，把 SDK 拒绝的逐题原因转成字段旁的一句话；`assistant-view-html.ts` 在回复里给每个问题、每张卡、最新一轮的下一步附上 HTML（同 Coding 的 `question.html`），在助理 HTTP 的写出处统一做，记录本身不变。草稿走新路由 `works/:id/question-draft`；回答路由收 `values`；失效卡的「重新准备」改由宿主写那句话（`cards/:id/redo`，仍记为页面写的）。
- **岛**：删 `renderQuestion`、`renderCard`（连同 `EFFECTS` 等）、「接下来」行、`localMoment`、`cardShell`；问题、卡、下一步都只挂宿主画好的 HTML 并用共享客户端接行为。2,803 → 约 2,650 行。
- **设计系统**：操作卡可带可改的字段（`fields`）；不带日历的客户端脚本；样式分段（D15）。
- **题型**：助理声明 `["choice"]`，交集仍为空，产品里模型的问法不变（D17）。

字节（门禁实测，对照 merge-base `2768dd71`；`page-assets.json` 已按实测调低）：`workbench.js` −73；`workbench.css`、`arrival.css` 各 −10,768（新段约 +11.5 K，删旧助理样式约 −5.6 K，删 momentum 死规则约 −16.3 K）；`settings.css` −22,270。

证据：整体构建、健康门禁 `--base`（助理的巨大单元都变小：`AssistantService` 类 1,830 行 / 112 个方法，岛 2,655 行）、边界、页面资源、动作快照、secrets 通过；相关单测 160/160；助理相关浏览器用例 13 个文件 32/32；在真实助理面板里看过浅色、深色与 390 px 的问卷卡与操作卡，按看到的把执行按钮挪到「将使用这些内容」之下、日期一开始就显示星期。全量（`95ffb6da`，约 110 分钟）6,225 条：6,214 通过、2 失败、9 跳过；2 条是 `touch-targets.e2e` 的触屏窗口，main 上同样失败。合 main `46cb083e`（#409 回执、#480）后重新构建，门禁对照新 merge-base 全过，两线交界的单测 234/234、助理浏览器用例 23/23。

验收：新测试 `tests/assistant-interaction-html.test.ts`（AC-21、AC-23）；改动的断言（预期变化，不是放宽）：`interaction-components` AC-17 改成断言采用后的状态（D15）、`coss-control-language` 的 44 px 一条改到共享部件、`visual-foundation` 去掉钉死规则文字的断言（D16）、`assistant-page-written.e2e` 的失效卡改成库里真有的卡、`agent-typed-questions` 的助理题型。

没做：A2（Coding）、`assistant-base` 升版（D17）、H3/H4、S1；日期题与日历（等有日期题时随那一片带）。

### 20.14 A2（2026-10-14，分支 `feature/ai-interaction-a2`，从 `34d0d1fc` 起）

- **Coding 的问卷卡换成共享的那张**：宿主在 `coding-surface.ts` 附 HTML 时改用 `agentQuestionHtml`（与助理同一个函数，D18）；Coding 插件删掉自己的 `renderPendingQuestionCard` 与卡片样式（只留一条让卡在线程里保持阅读宽度）。
- **Coding 页面脚本接共享客户端**：`host.interaction` 绑定卡片，草稿用 `client.read()` 存进会话（`question_drafts`）、用 `client.write()` 还原，提交用插件开发包的 `questionAnswer` 读成回答；不能回答时禁用字段并在卡底说明原因。
- **共享客户端只在 `workbench.js` 里一份**（D19）。
- **开放带类型的选择题**（D20）。
- 字节（门禁实测，对照 merge-base `34d0d1fc`）：5 个 Coding 系插件包各 −798；`workbench.css`、`settings.css` 各 −752；`workbench.js` −14。
- 并入 main `9abcb963`（含 #488 状态环）：宿主问卷卡的标题环随 `answer`/`unavailable` 走（原来画在助理那份 `assistantQuestionHtml` 与 Coding 自己的卡上，现在画在共享的 `agentQuestionHtml` 上，Coding 页面在这一轮结束时把环切到 `unavailable`）；`assistant-strip-narrow.e2e` 的 RING-07 样例改用 `agentQuestionHtml`。并入后对照 merge-base `9abcb963`：5 个 Coding 系插件包各 −826，`workbench.css`、`settings.css` 各 −752，`workbench.js` −14。
- 全量回归（并入 main 之前的 `1c7051a5`）：6261 条，6250 通过，9 跳过，2 失败——都是 main 上已知的 `touch-targets.e2e` 两条（亮、暗各一）。并入 main 之后重跑了相关单测 107 条与浏览器用例 8 条（`coding-question-card`、`issue-clarification-page`、`assistant-strip-narrow`、`coding-state-rings`、`assistant-page-written`），全部通过。
- 用例：新 `tests/coding-question-card.e2e.test.ts`（AC-22：带类型的合同、推荐与说明、不预选、草稿随会话、回答到达模型、卡换成回执）；`coding-question-card.test.ts` 的规则（不预选、无忽略、无多余输入框、无空选项组、各卡 id 不串、转义）改到共享卡上，「没有问题时什么都不画」随列表渲染函数一起删掉（宿主按每个等待中的问题附一张卡）；`agent-typed-questions`、`issue-clarification-page` 的 ISSUE-34 按 D20 改。

### 20.15 现状核对（2026-10-14，交互线线会话，依据 origin/main `393e8958`）

口径：「已实现」= 代码在 main 上、有守它的用例；「部分」= 只做了一部分或只在一处入口；「未做」= main 上没有。证据只列代码与用例位置；实走截图另记（本节末）。三级证据分开：下表只是工程证据，不是真实产品实操，也不是用户验收。

**内部完整（§1）：未达到。** 「AI 发起交互 → 用户填写或选择 → 原任务继续 → 结果与后续」在助理与 Coding 上只对**选择题**和**助理的操作卡**通了；混合字段、对象引用、Coding 的操作卡与下一步、单次插件的接续、第二批入口、文档与三个示例都还没有。

| 验收 | 判定 | 证据 / 缺口 |
| --- | --- | --- |
| AC-01 范围 | 已实现 | §14.3 定稿（2026-10-19）：每个插件逐个核过调用路径、装配与界面，每行写依据与结论——已接 3（助理、Coding、Form），已覆盖 2（Todo、Issues），第二批接入 4（PPT、Pages、Cognia、插件创作台），不接入 6，不适用的各写了理由，生成插件记为平台缺口。首批不冒充全量：第二批的逐个接入（P5）按 §14.3 末尾的顺序各开一片（BL-341） |
| AC-02 输入体验 | 部分 | Option 在问卷卡里（助理 `agent-question-card.ts`、Coding 同一函数，用例 `assistant-interaction-html`、`coding-question-card.e2e`）。下一步现在是输入框上方的一行（D24 改订 D14；情境线 `context-program` §21.9 的结果位），助理和 Coding 都有（AC-25、§15.11）。§3 第 2 条「与输入框平齐、横向展开」是用户特别强调的，这一行算不算达到，要用户看实物定（BL-344） |
| AC-03 交互语义 | 部分 | 操作卡不点不执行、推荐不等于选中、默认值不提交（`assistant-offers.ts`；`coding-question-card.e2e`「不预选」）。输入框目标芯片（D14 修订后的 R4）：助理一侧本线的「写进问卷」已做——问卷有两道以上题、其中只有一道文本题时，宿主用同一份 `composerQuestion`（`assistant-inputs.ts`）判一次、在那一题上标 `draft_from_composer`（字段 id，与 D34 的 `from_composer` 互斥），芯片默认「写进问卷：<题目>」，回车只把文字接在那一栏后面、经现有的问卷草稿保存，不发给 AI、不交回，卡上的「提交回答」才交回；一下切到回执线的「补充这一轮」、再一下切回（`assistant-receipts-client`、`assistant-interaction-html`、`assistant-typed-questions.e2e`「AC-03, R4」）。Coding 还没有芯片（BL-342） |
| AC-04 补充信息 | 已实现 | 助理与 Coding 的 `ask-user` 带六种题型（T1、T2），宿主逐题校验与字段旁的错误（`answerProblems` → `agent.answer_invalid` → `questionErrors`）；§15.8 示例 1 一张卡问日期时间、数字与对象引用，错一题只报那一题，改对后原 Run 接着做（`interaction-examples`，2026-10-17）；浏览器里的同一条路是 `assistant-typed-questions.e2e` |
| AC-05 对象与材料 | 达成 | H3 与 T2：候选只按题目的种类、以会话主人的权限搜（`search.references@1`），提交前宿主向主人重读，主人此刻的标题进回答，读不到的退回（S-26，`security-invariants-object-references`）；操作卡的目标对象改版后失效（`assistant-offers.ts` 的失效巡检）。不串线（2026-10-18）：`tests/interaction-no-crosstalk.e2e.test.ts` 三条——问题的草稿与回答留在提问的会话里，切换会话不带过去；引用题在一个项目里只搜到、只留下这个项目的对象，切换项目不带走选择与回答，经 Coding 的接口交另一个项目的对象被宿主拒绝（S-26）且 Agent 运行时的文件一个不变；操作卡按生成时的选区执行，卡出来以后或按下按钮的那一刻改选区都不改变它做的事。写用例时查出 Coding 的回答接口不收引用题的对象（动作的 schema 收、处理器拒），已修：Coding 只核形状，限额取插件 SDK 的 `QUESTION_LIMITS`，合不合题交运行时，归属交宿主（`tests/coding-run-control-contract.test.ts` 的 AC-05 两条）。BL-152（D38）：每一轮按自己项目里装着、显示着的插件给种类清单，外部插件的也在内，进模型前由宿主筛（S-32，`security-invariants-reference-kinds`）；外部插件的种类能被问到、两轮顺序不变、退回内置清单（`agent-reference-questions` 的 BL-152 用例）。一个会话的第一次读取到来之前（防腐 §10.28 P1，2026-10-19；「新会话」和切到这一页还没读过的会话都算）：输入框，工作区、目标、写入目录、材料、方法、MCP、能力、角色、委派九个按钮，命令面板里设下一轮的命令（各个方式、`/materials`、`/methods`、`/delegate`、`/model`、`/workspace`、`/compact`）都关着，切换的那一刻就关，不等状态轮询；切换时还开着的九个对话框关掉，选择不存；这时从别处交回的审查意见被拒、意见留着，返工原因同样不进框，上一个会话的字不会写进这个会话（`tests/coding-session-first-read.e2e.test.ts` 的 AC-05 第五到七条）。框归谁只在 `plugins/native/coding/src/browser/draft.ts` 的 `owns` 判断。工作区对话框提交途中切走了会话就不再设置，这一处没有用例。待补浏览器验证（用户 10-19 暂停本机浏览器验证）：首读前「+」菜单的禁用态只有深色、桌面宽度一张截图，浅色和另两个宽度等暂停解除后、验收之前补 |
| AC-06 预览与结果 | 已实现（浏览器验证待补） | 操作卡有对象、参数、影响与回执（`assistant-card-view.ts`），助理和 Coding 画的是同一张卡（AC-25）；跑完的卡在卡上给结果和主人声明的「打开」。最近跑完的那张卡的结果进输入框上方的结果位（§15.11，AC-06-1～5，接情境线 §21.9 的接口）：一步「打开「…」」按的就是卡里那个控件，Coding 同排（H4）。结果里的撤销还在侧栏，没上卡（要合同改动，见 §15.11「撤销」，BL-343）。节点用例 `assistant-interaction-html`、`assistant-step-row`、`coding-next-steps`；浏览器走查待补（用户 10-19 暂停，BL-345） |
| AC-07 失败恢复 | 达成 | 等待期限 24 小时（`prologue-node.ts` 的 `inputWaitTtlMs`）；草稿存在工作记录与 Coding 会话（D13、`question_drafts`）；卡片 CAS、结果未知不重试。Home 重启（BL-156，§15.9）：正常关机把等人回答的一轮停放在题上，重启后卡片可答，回答后下一轮带着答案；开轮失败时答案留在排队里并写明原因，说「继续」或点「从断点继续」再开；授权按回答那一刻（S-33）。过期与已结束的题用「请 AI 重新问」（D37）。崩溃留下的孤儿照旧由人核对或关掉（§15.9 第 7 条）。用例 `tests/interaction-parked-answer.test.ts`、`tests/prologue-start-refusal.test.ts`、`tests/coding-session-recovery.test.ts`、`tests/security-invariants-parked-answer.test.ts` |
| AC-08 并发与输入 | 已实现 | 卡片版本 CAS、问题版本核对；两个入口同时交同一题：只收一份，另一份带码退回，模型只听到一次，跑完后再交也退回（`interaction-recovery`，2026-10-17）。浏览器里两个页签同时作答（2026-10-18）：第二个页签的回答在页面里挡住，等第一个收下、这一轮跑完再放行，先后是定的，不靠计时。助理退回 `assistant.stale`，Coding 退回 `coding.round_ended`；模型只听到收下的那一份，退回的那份不写盘（`assistant-typed-questions.e2e`、`interaction-no-crosstalk.e2e`「AC-08」）。退回时两边都只说宿主知道的事：助理说「这个问题已经结束或被替换」，Coding 说「这一轮已经结束」，不说「已由另一处回答」。宿主此时只知道题已关、或这一轮已结束，不知道是谁答的：可能是另一个页签，也可能是题过期、被重新问。Coding 的页面按码判断：卡片留着、关上，这句话写在卡片上，选过的也还在；再读会话时这张卡也不撤（状态行在这一轮结束时会清空，原因放在那里会被冲掉，所以不放那里）。回答还在路上的卡也不撤：第二个页签跟着这一轮，会先看到题被答掉、这一轮结束，卡若这时撤掉，退回的原因就没有地方显示。这个用例查出 Coding 原来退回的是不带码的 400，已修 |
| AC-09 专业插件 | 部分 | 工程子条件各有用例，用例名带编号：Coding 冻结一轮的 Diff 并按它确认（`coding-changeset-http`）、命令审查（`agent-review-standing`）、正式报告（`coding-report-persistence`）；非 Agent 插件的结构化接续由 Form 走通（S1 #532 与 W4-04 第三片，即 AC-26：`form-draft-questions`、`plugin-interaction-answer`、`form-runtime-routes` 的 W4-04-05，浏览器里是 `form-actions.e2e`；补问被拒后重试是 `form-draft-retry`）。[人工] 复合条件：在一次性 Home 里用真实模型跑一轮 Coding，从 Diff 到命令审批再到报告走一遍（Codex 10-19 没有跑全，专业流程未验证；BL-345）。其他插件的接续是 P5，按 §14.3 的顺序另开（BL-341）。2026-10-19 由「已实现」改回「部分」：Codex 验收判部分通过，用例补上编号（QA-003） |
| AC-10 UI | 部分 | 助理问卷卡与操作卡在 A1 看过浅、深与 390 px；Coding 问卷卡的三个宽度与深色没有记录；真实中文输入法、读屏未验证。2026-10-19 计划见 §15.10：第一片 AC-10-9（可选单选能清掉，共享客户端）已写，用例 `interaction-client.e2e`「AC-10-9」（CI 跑）、`interaction-components`、`coding-question-card` 的 AC-10-9；第二片（AC-10-1～8，Coding 收下后的焦点与回执）由 #815 合入（`c17504473`）：节点用例 `coding-question-answered-client`（AC-10-3、AC-10-8，六条）写好，浏览器用例 `coding-question-card.e2e` 的 AC-10-1～8 写好、本机没跑（用户 10-19 暂停）。英文界面下宿主给的失败原因（QA-001）改成按界面语言说，用例 `assistant-business-gateway`「AC-10, QA-001」。浏览器部分进 §15.10「待补浏览器验证」（BL-345）；真机中文输入法与读屏是 BL-016，回执在页面上留得够不够读屏读完是 BL-246 |
| AC-11 SDK 消费 | 部分 | 工程子条件各有用例，用例名带编号：Molis 的适配，宿主把六种题型经 `askUserQuestionTypes` 交给包（`prologue-node-port.ts`；`agent-question-types`）；现用的包的真实 Runtime 下，模型拿到的 `ask-user` 正是卡片画得出的六种，助理与 Coding 都能答（`assistant-typed-questions.e2e`「AC-11 AC-27-5」）；原有的等待与审批语义：停放的题重启后可答（`prologue-start-refusal`，AC-07），并发作答只收一份（`interaction-recovery`，AC-08）；审批在现用的包和宿主的适配器下：拒绝的理由和被拒的命令名进下一次模型请求、重启后回执不变，停下一轮时撤掉等着的审批、停后才要的也不出现（`prologue-review-feedback`、`prologue-stop-review`）。命令审查的常驻规则（`agent-review-standing`）只测宿主的审批队列、不经过包，算 AC-09，不算 AC-11。现用的包是 `vendor/prologue-sdk/README.md` 里「当前依赖」那一份（具体提交以那份说明为准，不在这里写死）。[人工] 复合条件：换包时对照上游源码与重建的包逐项核一遍（这一轮没有独立复核）；用真实模型在产品里走一遍助理与 Coding 的带类型提问（BL-345）。历史数据按 `docs/system/CONTRACT-CHANGES.md` 还不留读取兼容。2026-10-19 由「已实现」改回「部分」：Codex 验收判部分通过，用例补上编号（QA-003） |
| AC-12 长期接入 | 部分 | D1（2026-10-17）：`skills/molis-prologue-ai/SKILL.md` 的「交互」一节、`docs/platform/PROLOGUE-AI.md` §6「问人、建议一步、引用对象」、`skills/molis-plugin-dev/SKILL.md` 的索引行、设计系统 README 的引用搜索；§15.8 示例 1 有新用例 `interaction-examples`，示例 3 是 `form-draft-questions`；示例 2 的操作卡有 `action-cards`、`agent-host-offers`。`generated-ai.md`（2026-10-19）在「设计时」写明生成插件走不了这几条路，要先问的信息做成提交部件的字段，输入不够就以声明的错误码失败、保留输入；`pnpm studio:replay` 离线回放通过。没有的：示例 2 的同排按钮要用户判定（BL-344）；`generated-ai.md` 的真实模型冒烟待补（要先在隔离 Home 的设置页配模型，用户 10-19 暂停了浏览器验证；BL-345）；生成插件也能先问再接续，是平台缺口（§14.3 末行，BL-245） |
| AC-17 共享部件 | 已实现 | `interaction-components.test.ts`、`interaction-sdk-mapping.test.ts` |
| AC-18 共享客户端 | 已实现 | `interaction-client.e2e.test.ts` |
| AC-19、AC-20 带类型的题进宿主 | 已实现 | C1+H1（#410）；用例 `agent-typed-questions.test.ts`（用例名带 AC-19/AC-20 编号，2026-10-18 补上） |
| AC-21 助理问卷卡 | 已实现 | #492；`assistant-interaction-html.test.ts` |
| AC-22 Coding 问卷卡 | 已实现 | #496；`coding-question-card.e2e.test.ts` |
| AC-23 操作卡协作者 | 已实现（助理） | #492；`assistant-offers.ts`（W5-10 形状） |
| AC-24 对象引用 | 已实现 | H3：`search.references@1` 与提交前复核（S-26，`security-invariants-object-references.test.ts`）；`reference` 题型由 T2 开放（AC-28） |
| AC-25 Coding 操作卡 | 已实现 | H4 分两片（统筹 2026-10-15 定）。**第一部分已做**：Coding 输入框上方的下一步，是最新一轮的问题（与助理同一个 `interactionNextSteps`，形状不变，只加输入）加 Coding 自己的「核对并继续」「查看变更」；每一步都按下屏上那一轮已有的控件，不开新的执行入口（后续步骤由 Coding 自己给：`plugins/native/coding/src/next-steps.ts` 的 `codingFollowUps`；与问题合成一排、由平台画出（2026-10-23 起 Coding 经 `services.interaction` 要，`plugins/native/coding/src/interaction-html.ts`，PG-062；此前宿主在 `coding-surface.ts` 里画）；用例 `coding-next-steps`、`coding-question-card.e2e`）。**操作卡（第二部分）已做**（D25–D28，2b → 2a → 2c）：Coding 的 coordinator、builder 角色带 `suggest-action`，一轮的建议进运行视图（2a）；Coding 读到一轮时把它的建议落成会话的卡（`plugins/native/coding/src/action-cards.ts`，插件私有存储 `cards:<session_id>`，按 `offer_id` 只落一张、落卡在 `beforeEffect()` 之后、建议的动作此刻不在授权里就不落）；卡由平台画（与助理同一个 `assistantCardHtml`，Coding 经 `services.interaction` 要，PG-062），挂在那一轮下面，也是输入框上方的一步；点卡经新的宿主动作 `agent.offers.run@1` 执行：只跑这条建议点名的那个动作（引用、冻结的动作工具、建议时记下的合同摘要 `action_digest` 都要对上），输入过动作自己的检查，调用方只能是这一轮所属的插件（S-29）；卡按修订号认领，第二次点击不再执行，结果按失败的 kind 记（D26）。有未发送改动的卡，输入框上方那一步只把卡带到眼前、不执行（FLOW-03）。一轮结束后，最近跑完的那张卡的结果也进这一排，排在「查看变更」之前，按的是卡上结果自己的「打开」（AC-06-5，§15.11）。用例 `coding-action-cards`、`coding-action-cards.e2e`、`security-invariants-agent-offer-runs`、`coding-next-steps` |
| AC-26 单次接续 | 已实现 | S1（#532）与 W4-04 第三片：`form-draft-questions`、`plugin-interaction-answer`、`form-runtime-routes`（W4-04-05）。补问被拒后同一要求重试、拿到合法的卡：旧的生成错误撤下，首题获焦，作答前题数不变；作答被逐字段退回时，前一次作答失败的原因也撤下（QA-002；Codex 10-19 判不通过，已修，待复验）：`form-draft-retry`；浏览器部分进 §15.10「待补浏览器验证」 |
| AC-27 放开文字、数字、日期、日期时间 | 已实现 | T1（D29–D33）：AC-27-1 题型与 provider 请求里的 schema（`agent-question-types`、`agent-typed-questions`）；AC-27-2 宿主的卡与带界限的报错；AC-27-3 读回答与改名被拒；AC-27-4 Coding 路由与 `coding.runs.control@4`（`coding-run-control-contract`）；AC-27-5 助理与 Coding 的浏览器用例（`assistant-typed-questions.e2e`、`coding-question-card.e2e`；D34 一道文本题从输入框回答，同一文件与 `assistant-interaction-html`） |
| AC-27-6 数字题的单位 | 已实现 | D35：`agent-question-types`（Runtime 带回 `unit`、卡上与报错行带单位）、`interaction-components`（单位随字段读出）、`assistant-typed-questions.e2e` 与 `coding-question-card.e2e`（单位在步进器旁、报错「不能超过 120 分钟」） |
| AC-28 对象引用题 | 已实现 | T2（D36）：AC-28-1 provider 请求里 `ask-user` 的 `refKinds` 是 `hostReferenceKinds()` 的 enum，清单外的种类不开等待、模型听到被退回（`agent-question-types` 的 AC-28-1 用例，在 #632 换来的包上跑）；AC-28-2 卡上不列候选，只在人打字时按题目的种类搜（`agent-reference-questions`、`interaction-components`、`interaction-client.e2e`）；AC-28-3 单选、多选、上限、草稿里的选中、逐题的话（`agent-reference-questions`、`interaction-client.e2e`）；AC-28-4 标题取自主人、页面给的标题进不了回答、种类不在题目里的搜不到也交不上（`security-invariants-object-references`）；AC-28-5 Coding 用 `coding.runs.control@5` 交回选中的对象（`coding-run-control-contract`、`coding-actions`）；AC-28-6 只用键盘做完、读屏读出结果个数、390 px 与深色（`interaction-client.e2e`、截图） |

**题型放开的真实前置**（比 §17.1 写的多两件）：①共享问卷卡 `agentQuestionHtml` 只画选择题与文字，日期、数字、对象引用要先在这里画出来；②Coding 的 `coding.runs.control` 第 2 版只收 `question/indexes/other`，带 `value` 要升第 3 版（§20.0 已记），`plugins/native/coding/src/run-inputs.ts` 的 `questionAnswer` 跟着改；③插件开发包的 `questionAnswer` 要读出 `value`。

**跨线**：同排推荐的位置（输入框旁 vs 线程里）属于助理面板的布局与动线，现在归情境线；本线只出合同（下一步视图 `InteractionNextStep` 与派生函数）与 Coding 侧的呈现。

**实走（隔离 Home）**：待做。main 在 A2 之后要重新整体构建，构建锁被防腐线全量占着；拿到构建时段后在隔离 Home 里走助理与 Coding 的问卷卡、操作卡、Option、下一步，截图 1440/1024/390 与深色，补在这里。

### 20.16 暂停点（2026-10-14，用户让需求线先停、整机让给防腐线）

> 2026-10-15 恢复：S1 已经 #532 合入 main（`eebfa9f3`）。H3 在 #534（P3a）合入后并入 main `7fe8ee65`，构建、快照、用例与门禁见 §18 当天的记录；下面是暂停时的原文。

**两条远端分支，都没构建、没跑任何用例、没开 PR：**

| 分支 | 叠在哪 | 内容 |
| --- | --- | --- |
| `feature/ai-interaction-h3-on-w406` | #498（W4-06）的 `21d3853f`；#498 之后又推到 `02e6720a`，恢复时以合入 main 的为准 | H3 全部代码、§20.15 现状核对、D21–D24 |
| `feature/ai-interaction-s1` | origin/main `393e8958` | S1：插件开发包的题型规则与一致性用例；Form「AI 生成题目」 |

**已写完（未验证）：**

- H3 候选：`search.references@1` 挂在 `system.search` 下（D21）。代码在 `packages/contracts/src/services/search.ts`、`horizontal/search/src/references.ts`（`findReferenceCandidates`、`confirmReferences`）、`apps/local-host/src/search-actions.ts`。
- H3 复核：
  - `prologue-questions.ts` 的 `ownedReferences`（T2 起：经主人再读并换上主人的标题）；`prologue-node-port.ts` 的 `answerPending` 在 SDK 校验之前调用它，读不到的在 SDK 的问题之后报。
  - 没接复核的宿主一律拒绝带引用的回答。
  - 宿主由 `system-agent-service.ts` 接上 `localHost.search.readReferences`，只认本机用户是会话主人的情况。
  - 新原因 `reference-unavailable`（D22），字段旁的话写在 `agent-question-card.ts`，英文在 `renderer-gap-en.ts`。
- 安全不变量 S-26（`docs/system/SECURITY-INVARIANTS.md`）及其用例 `tests/security-invariants-object-references.test.ts`（两条），候选用例 `tests/search-references.test.ts`，夹具 `tests/fixtures/reference-owners.ts`。
- S1：
  - `packages/plugin-sdk/src/question-rules.ts`（`questionProblems`、`questionSetFlaw`）与 `tests/question-rules-consistency.test.ts`。
  - Form 新动作 `form.questions.draft@1`（`plugins/native/form/src/drafting.ts`）。不改 `form.questions.ai@1`，因为创作台回放语料引用它。
  - 页面接线 `draft-client.ts`，宿主附问卷卡在 `form-native-plugin-http.ts`，用例 `tests/form-draft-questions.test.ts`。
  - `agentQuestionHtml` 多了一个可选的卡底说明参数。

**没做或没验证：**

- 两条分支都没构建、没类型检查、没跑一条用例。
- 没跑以下检查：`pnpm actions:update`（H3 多一行 `search.references`，S1 多一行 `form.questions.draft`）、`pnpm api:update`（合同多了类型与 `AGENT_QUESTION_HOST_REASONS`，插件开发包多了导出）、`check-health-gates --base`、`page-assets`（S1 改了 Form 客户端，字节可能变大，要实测）、`pnpm test:security`、`secrets:check`。
- `tests/question-rules-consistency.test.ts` 还没进 `tests/ci-product-subset.txt`。
- S1 没有浏览器用例。Form 页面的问卷卡没在真页面里看过。
- 实走截图（§20.15 末）没做。
  - 隔离 Home 的做法：`pnpm web --home <临时目录> --port <端口>`。
  - 准备脚本：建项目、装插件、把模型指向本机。
  - 脚本化模型：「复盘」→ 带类型的选择问卷 → `todo.items.create` 的操作卡；「登录」→ Coding 的问卷。
  - 这两个脚本只写在本线会话的临时目录里，没入库。恢复时照这段重写即可。
- H4、放开题型：没开工。
  - H4 用情境线的 `apps/local-host/src/agent-next-steps.ts`（`interactionNextSteps`，情境线分支 `context/assistant-flow`）与 `card:` / `question:` 的步骤 id。
  - H4 要先定 Coding 卡片的记录放哪：Coding 的轮次现在没有动作网关；卡片表 `assistant_cards` 按助理工作建。
  - Coding 的 5 个客户端包字节不能涨。
- 跨线已定：D24 与情境线 FLOW-01…05。failed 与 unknown 的卡在下一步里只带到卡上。

**恢复时按这个顺序：**

1. #498 合入 main 后，把 `feature/ai-interaction-h3-on-w406` 变基到 main。只留本线的提交 `7c52d038` 起，W4-06 的提交不带。
2. 构建锁下 `pnpm build`。修类型错。`pnpm actions:update`、`pnpm api:update`，看 `tooling/gates/` 的差异。
3. 跑 H3 的用例：`node scripts/run-tests.mjs tests/search-references.test.ts tests/security-invariants-object-references.test.ts tests/system-search.test.ts tests/agent-typed-questions.test.ts tests/agent-pending-questions.test.ts`，加 `node scripts/affected-tests.mjs` 选出的；再跑 `pnpm test:security`。
4. 门禁：`check-health-gates --base origin/main`、`boundary:check`、`secrets:check`；推送并开 H3 的 PR。
5. 实走截图：1440/1024/390 与深色，助理与 Coding 的问卷卡、操作卡、下一步；补进 §20.15。
6. 再做 S1。同样构建、出快照、跑用例、量页面资源，加浏览器用例。改了插件开发包算共享核心，要跑全量。之后才是 H4、放开题型。

### 20.12 C1+H1（`c50a5534`）重做时与 main 的碰撞（2026-10-13，只读核对，没有合并）

`git show c50a5534`：17 个文件，+284 / −56。在合并后的树上 `git apply --check`：12 个文件干净，5 个只因上下文不同而失败，都是机械的：

| 文件 | 冲突原因 | 做法 |
| --- | --- | --- |
| `apps/local-host/src/assistant/assistant-service.ts` | main 的 `agent-host` 导入列表已没有 `AgentDelegatedWork`、`AgentReviewRequest` | 只把 `AgentPendingQuestion` 挪到 `agent-interaction` 的导入；不加方法（现 `AssistantService` 118 个方法 / 2,543 行，都在基线上） |
| `apps/local-host/src/coding-surface.ts` | main 只导入 `sendLocalWebJson` | 同上，改一行导入 |
| `apps/local-host/src/index.ts` | main 的导出是 `handleAgentReviewHttp, handleUnscopedAgentReviews` | 在新的位置加 `agent-question-surfaces` 导出 |
| `horizontal/agent-host/src/adapters/prologue.ts` | main 去掉了 `promptLayerOf` 导入行；`PrologueAdapterError` 的码联合没变 | 手工放进 `agent.answer_invalid` 与 `problems`；不新增 `Error` 子类（已有 85 个，只许减少） |
| `horizontal/agent-host/src/index.ts` | main 多了 `surfaceRules` 导出 | 在新位置加 `projectQuestion`、`answerProblems` 的导出 |

不是文本冲突、重做时必须当心的几处：

1. **SDK 是前提**：main 的 vendored 包（computer-use 包，核对过 tgz 内容）没有 `validateQuestionnaireAnswer`、`askUserQuestionTypes`，`PendingQuestion` 也没有 `refKinds`、`multiline`、题型字段；`config.tool.inputWaitTtlMs` 有（默认 10 分钟）。所以 `prologue-questions.ts` 与 `prologue-node.ts` 的改动在换包前编不过；换包后先核对这些名字在统一包里没改。
2. **`prologue-node.ts` 没有余量**：现在 1,551 行，门禁基线 1,552（门禁数法比 `wc -l` 多 1），正好顶格；`initializePrologueNodeAdapter` 1,281 行是已有的巨大函数；c50a5534 在这个文件里净 0 行（+1 个选项、−3 行投影、+2 行预检），所以只有保持净 0 才放得过；`config:` 那一行是一整行长字符串，就地改，不要拆开。
3. **`prologue-stream.ts` 没有碰撞**：c50a5534 不碰它；#471/#472 把它改到 744 行（`applyPrologueEvent` 212 行，已有的巨大函数），但 `awaiting-input` 仍只带 `pending_id`、`pending_revision`、`kind`、`why`、`sequence`，带类型的题字段是在 `readPendingQuestion` 里从 Runtime 读的，所以不重叠；统一包若改了 `awaiting-input` 事件的形状（回执线 S4 会给 pending 加 `about`），再核对一次。
4. **合同 `services/agent-host.ts`（基线 1,656 行）**：main 在 `AgentRunControl` 里 `answer` 之前加了 `switch-model`；c50a5534 只替换 `answer` 一员并搬走 `AgentPendingQuestion`，净 −24 行，应用干净。回执线（D15）要把 `steer` 分支搬出同一个联合，先就绪的先合。新子路径 `services/agent-interaction` 要 `pnpm api:update`（新快照 `agent-interaction.txt`，`agent-host` 的快照也变）并同 PR 带上全部消费者（宿主、助理合同、Coding `ui.ts`）。
5. **错误码**：main 上 `AgentHostErrorCode` 仍是字符串联合；`agent.answer_invalid` 形如 `<主人>.<原因>`、`agent` 主人在 `tooling/gates/error-owners.json` 里已有 `horizontal/agent-host/`，按 c50a5534 的做法加进联合即可，不增加「形状不对的码」「没带主人名的码」两个数；若评审要求 `defineErrorCodes`，那时再定。
6. **`AgentRunControl.answer` 的消费者（A2 也用得上）**：助理服务 4 处（`assistant-service.ts` 约 1078、1089、1890、1922 行）、Coding 的 `plugins/native/coding/src/run-inputs.ts` 27–60 行 `questionAnswer`（原来写在 `routes.ts`，#472 带来的 `ceac00a2b` 把它搬进了 `run-inputs.ts`，所以 §17.1 里说 A2 要改的 `routes.ts` 的 `questionAnswer`，现在在 `run-inputs.ts`）与 `plugins/native/coding/src/client.ts` 约 702 行。
7. 测试 `tests/agent-typed-questions.test.ts`（新）、`tests/agent-pending-questions.test.ts`、`tests/coding-question-card.test.ts` 的改动应用干净；真实 Node Host 用例（带类型问卷落盘、关闭、新 Runtime 读回并作答）仍要在统一包上做。
