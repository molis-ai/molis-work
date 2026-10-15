# 六项需求实施交接 Prompt

请接手 Molis Work 的以下六份需求，统筹推进实现，直到达到各自 spec 约定的完成标准。

需求来源：
- 仓库：https://github.com/molis-ai/molis-work
- 分支：feature/requirements-handoff-20261015
- 远端入口：https://github.com/molis-ai/molis-work/tree/feature/requirements-handoff-20261015/specs
- 本交接文件：docs/prompts/requirements-handoff-2026-10-15.md

六份独立需求书（路径相对于仓库根目录）：
1. specs/unified-input-voice/spec.md — 统一输入体验与本地语音输入
2. specs/proactive-assistant/spec.md — 主动式助理与场景 Skill
3. specs/work-brief/spec.md — 工作简报插件
4. specs/coding-harness-optimization/spec.md — Coding 与平台性能
5. specs/visual-ui-experience/spec.md — 视觉细节与 UI 性能
6. specs/font-and-skin-system/spec.md — 字体、皮肤与语言系统

先拉取需求分支，完整阅读这些需求书及适用的 AGENTS.md，核对最新主线、已有实现和在途任务，避免重复开发。实现工作按仓库规则基于最新 main 建立工作树，并带入尚未合入的需求文档；如果需求已经合入 main，不重复带入。不要依赖原作者的本机路径。

以各自 spec 为唯一需求来源，保留已确认要求，不自行增加功能、删减范围或把第一批切片当作整项完成。配套技术方案、历史基线和测量材料只提供对应范围的参考与证据，不代表新功能已经通过验收。

请根据实际依赖安排实施顺序和分工，协调交叉部分使用同一套能力与合同。已有负责人继续保留；输入回执与用户纠正仍由 Claude 的现有任务承接，先核对其进展，相关补充见 specs/ai-input-receipts/spec.md 第 20 节。遵守仓库的并行、共享文件、构建及浏览器测试约定。

工作简报已确认纳入：它拥有综合结果的正文、版本、来源和修订；主动判断、分析、执行与跟进仍由个人助理和场景 Skill 驱动。其余行为按六份 spec 执行，不另行扩展方案。

范围之外：
- Work＋Tool 伴随形态不纳入本轮。
- Todo 与 Onboarding 不重新开发。Onboarding 围绕创建新项目；待办需要调整归属时，保存后再移动，不增加当场分配多个已有项目的要求。

这是实施授权，不止交付计划。涉及重大 UI 或新交互时，先给出可操作的高保真切片，再继续完整实现。需要关键决定时只暂停依赖该决定的部分，其余工作继续。

验证结果和剩余缺口回写对应 spec，区分工程通过、真实场景实操通过与本人验收。本次需求文档的提交推送授权不自动扩展到后续功能分支；功能推送、开 PR、发布仍按仓库规则另行取得授权。
