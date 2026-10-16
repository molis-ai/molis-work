# 九项需求实施交接 Prompt

请接手 Molis Work 的以下九份需求，统筹推进实现，直到达到各自 spec 约定的完成标准。子代理交互涉及 Prologue 与 Molis Work 两仓；AI 能力开发手册面向内部开发者和 Agent。

需求来源：

- 仓库：https://github.com/molis-ai/molis-work
- 分支：feature/subagent-interaction-spec-20261015
- 版本：以本分支最新提交为准
- 远端入口：https://github.com/molis-ai/molis-work/tree/feature/subagent-interaction-spec-20261015/specs
- 交接文件：docs/prompts/requirements-handoff-2026-10-15.md

九份独立需求书（路径相对于 Molis Work 仓库根目录）：

1. specs/unified-input-voice/spec.md
   统一输入体验与本地语音输入
2. specs/proactive-assistant/spec.md
   主动式助理与场景 Skill
3. specs/work-brief/spec.md
   工作简报插件
4. specs/coding-harness-optimization/spec.md
   Coding 与平台性能
5. specs/visual-ui-experience/spec.md
   视觉细节与 UI 性能
6. specs/font-and-skin-system/spec.md
   字体、皮肤与语言系统
7. specs/assistant-service-connections/spec.md
   助理统一服务接入
8. specs/subagent-interaction/spec.md
   子代理查看、直接对话与父子任务动线（Prologue 与 Molis Work）
9. specs/ai-development-handbook/spec.md
   Molis Work AI 能力开发手册（内部开发要求与参考实现）

先拉取需求分支，完整阅读这些需求书及适用的 AGENTS.md，核对最新主线、已有实现和在途任务，避免重复开发。实现工作按仓库规则基于最新 main 建立工作树，并带入尚未合入的需求文档；如果需求已经合入 main，不重复带入。不要依赖原作者的本机路径。

以各自 spec 为唯一需求来源，保留已确认要求，合理设计功能、不删减范围或把第一批切片当作整项完成。配套技术方案、历史基线和测量材料只提供对应范围的参考与证据，不代表新功能已经通过验收。

请根据实际依赖安排实施顺序和分工，协调交叉部分使用同一套能力与合同。已有负责人继续保留；遵守仓库的并行、共享文件、构建及浏览器测试约定。

工作简报已确认纳入：它拥有综合结果的正文、版本、来源和修订；主动判断、分析、执行与跟进仍由个人助理和场景 Skill 驱动。其余行为按九份 spec 执行，不另行扩展方案。

子代理交互的唯一需求书在本仓第八项。Prologue 仓库为 https://github.com/molis-ai/prologue，实施前核对其最新 main 和适用 AGENTS.md。Prologue 补公共用户输入、观察、子任务接续及协作语义的真实缺口；Molis Work 经共同 Agent Host 合同提供个人助理与 Coding 的一致组件、直接对话和父子动线。复用在途统一协作与输入回执能力，不把父代理转述当作用户直聊，不另造执行引擎或任务账。UI 要流畅、导航合理，切换保留草稿与阅读位置，后台更新不打断输入、不抢焦点。

内部 AI 能力手册以第九项为准，在现有 docs/platform/PROLOGUE-AI.md 和开发 Skill 入口补齐原则、基础实现和实用示例。落实 context over control：给 AI 充分且相关的目标、事实、工具和反馈，避免为了单个交付样例堆硬编码流程和限制；权限、数据一致性、取消与恢复仍由工程边界保证。正式手册正文、参考实现核对和评测方法是交付物，不以需求书代替；不顺手全面改写已有功能。

这是实施授权，不止交付计划。需要关键决定时只暂停依赖该决定的部分，其余工作继续。产品功能需要保证交互视觉UI动效等质量，参考存量设计语言以及视觉细节与UI性能优化需求进行打磨

验证结果和剩余缺口回写对应 spec，区分工程通过、真实场景实操通过与本人验收。本次需求文档的提交推送授权不自动扩展到后续功能分支；功能推送、开 PR、发布仍按仓库规则另行取得授权。
