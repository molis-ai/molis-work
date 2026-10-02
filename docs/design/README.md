# 设计参考与历史原型

生产 UI 的规范只有一份：仓库根目录的 [DESIGN.md](../../DESIGN.md)（Soft Workbench），控件与组合以组件板 `/__ui/catalog` 为准。本目录里的内容都是**参考**，不是规范；和 DESIGN.md 冲突时以 DESIGN.md 为准，不要把这里的截图当产品图。

| 目录 | 是什么 | 现在的地位 |
| --- | --- | --- |
| [project-arrival-flow/](project-arrival-flow/README.md) | 打开 Molis Work：项目选择页、Welcome 与新建项目引导的高保真设计、可交互原型、状态与深色/窄屏图、三段动效录屏 | 当前的**参考原型**（2026-10-01 用户认可），生产实现见 [specs/project-arrival-flow](../../specs/project-arrival-flow/spec.md)。原型里的项目、材料、整理结果都是示例数据 |
| [soft-workbench/](soft-workbench/README.md) | 用户认可的 Soft Workbench 高保真原型（首页、目标、信息流、新手引导） | 当前视觉语言的**参考原型**；已按 [specs/archive/soft-workbench-rollout](../../specs/archive/soft-workbench-rollout/spec.md) 落到生产。原型里的数据、AI 回复和 localStorage 都是演示 |
| [taste.md](taste.md) | 历次纠偏抽出的验收口径 | 仍在用；视觉条目已按 Soft Workbench 更新 |
| [molis-work-onboarding/](molis-work-onboarding/proposal.md) | 「从已有工作开始」的引导与项目创建方案 | 流程与数据边界仍有效；视觉由 Soft Workbench 引导窗口取代 |
| [ui-renewal-2026-09-21/](ui-renewal-2026-09-21/README.md) | 设计讨论、研究与共识 | 历史参考 |
| [immersive-workbench/](immersive-workbench/README.md) | 画布中心工作台原型（Linear 方向） | 历史原型，视觉已被取代 |
| [workbench-frame-container/](workbench-frame-container/README.md) | 工作台 Frame 容器切片 | 历史原型，视觉已被取代 |
| [directory-plugin-list/](directory-plugin-list/index.html) | 插件目录列表原型 | 历史原型，视觉已被取代 |
| [goal-workbench-clarity/](goal-workbench-clarity/proposal.md) | Goal 画布展开方案 | 历史方案，已由 Goal 画布工作区需求书取代 |
