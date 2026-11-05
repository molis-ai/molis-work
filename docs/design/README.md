# 设计参考与历史原型

生产 UI 的规范只有一份：仓库根目录的 [DESIGN.md](../../DESIGN.md)（Soft Workbench），控件与组合以组件板 `/__ui/catalog` 为准。本目录里的内容都是**参考**，不是规范；和 DESIGN.md 冲突时以 DESIGN.md 为准，不要把这里的截图当产品图。

| 目录 | 是什么 | 现在的地位 |
| --- | --- | --- |
| [workbench-shared-paths/](workbench-shared-paths/README.md) | 项目资料、输入与输出、Coding 跟随与临时查看、右侧窄窗格的可点定样（三个方案，正常与异常状态） | 方案已定（2026-11-03：按来源分组，加「最近用过」），产品未实现；里面是示例数据 |
| [work-mainline-switch/](work-mainline-switch/README.md) | 主线顶部事项切换：切换器、列表菜单、这件事的东西、放进事项、整理主线的可点定样（三个方案，正常与异常状态） | 方案已定（2026-11-03：最近切过加折叠分组），产品未实现；里面是示例数据 |
| [intelligent-surfaces-forms/](intelligent-surfaces-forms/README.md) | 智能呈现第一片的四种形态（名字片、行、卡片、速览）：九种状态、四个位置（插件内、对话、项目讨论、等你）的可点定样（三个方案） | 方案已定（2026-11-03：插件领头），产品未实现；里面是示例数据 |
| [assistant-background-tasks/](assistant-background-tasks/README.md) | 个人助理的连续对话与后台任务：§12.8 的交错路径（连续交办、插问、补充、要你定、完成、回到对话）与排队、失败、停止、断线恢复的可点切片（三个方案） | 方案已定（2026-11-03：对话顶上的任务条），产品未实现；按剧本模拟 |
| [plugin-studio-main-path/](plugin-studio-main-path/README.md) | 插件创作台主路径：从准备、想法、方案、构建、试用、安装到关掉后使用和从已装版本再改的可点切片，含组合已有能力和手动／助理接续、六种失败与恢复（三个方案） | 方案已定（2026-11-03：对话加阶段），产品未实现；按剧本模拟 |
| [assistant-proactive-paths/](assistant-proactive-paths/README.md) | 个人助理的三条路径：安静准备与必要提醒（§4.2）、主动做法的观察试用与启用（§6.1）、多项交付的逐项核验与部分退回复核（§7.3.1），各含正常与异常情况的可点切片（每条三个方案） | 方案已定（2026-11-03：任务条里看准备、规则页里试用与回看、要求与成果对照），产品未实现；按剧本模拟 |
| [basic-home/](basic-home/README.md) | 基础首页（第 15 批）：不装 Work Brief 也能用的项目首页，插件卡与「等你」「接着做」的排法，空项目、读不到、停用、后台刷新、Work Brief 接管与失败回退、写文稿时不被打断（三个方案；四种形态照用 03 的插件领头） | 方案已定（2026-11-04：先等你和接着做，再插件卡片表），产品未实现；按示例数据模拟 |
| [assistant-cards/](assistant-cards/README.md) | 助理卡片与工作简报：卡片解剖、三种字的来源、19 种块、19 个卡型、三种尺寸、状态、四张简报页与窄屏的规格板 | 设计稿（2026-10-26；四项已拍板，视觉待用户验收），说明见 [specs/work-brief/design.md](../../specs/work-brief/design.md)；里面是示例数据 |
| [runtime-and-recovery/](runtime-and-recovery/README.md) | 第 25、26 批合并定样：后台运行状态、某块暂不可用、更新与回退、安装自检、升级失败与恢复，每题两个方案加正常与异常状态 | 用户已定（2026-11-04，五题都选 A）；里面是示例数据 |
| [pages-assistant-surfaces/](pages-assistant-surfaces/README.md) | Pages 侧栏与助理主区高保真交互切片 | 参考原型；生产实施见 [spec](../../specs/archive/pages-assistant-surfaces/spec.md) |
| [project-arrival-flow/](project-arrival-flow/README.md) | 打开 Molis Work：项目选择页、Welcome 与新建项目引导的高保真设计、可交互原型、状态与深色/窄屏图、三段动效录屏 | 当前的**参考原型**（2026-10-01 用户认可），生产实现见 [specs/archive/project-arrival-flow](../../specs/archive/project-arrival-flow/spec.md)。原型里的项目、材料、整理结果都是示例数据 |
| [soft-workbench/](soft-workbench/README.md) | 用户认可的 Soft Workbench 高保真原型（首页、目标、信息流、新手引导） | 当前视觉语言的**参考原型**；已按 [specs/archive/soft-workbench-rollout](../../specs/archive/soft-workbench-rollout/spec.md) 落到生产。原型里的数据、AI 回复和 localStorage 都是演示 |
| [taste.md](taste.md) | 历次纠偏抽出的验收口径 | 仍在用；视觉条目已按 Soft Workbench 更新 |
| [onboarding-full-journey/](onboarding-full-journey/README.md) | Onboarding 全程的可点定样：首次使用、新项目、已有项目加做法、从 Coding 的缺项进入再回去；全部画在打开软件时那套沉浸式全屏框架里（开场大字、一问一景、底栏步骤条与 ↵），含失败、改范围、部分采用失败与重启接续 | 用户已批准（2026-11-04）；产品未实现；首页与成员编辑是占位，里面是示例数据 |
| [work-records/](work-records/README.md) | 工作记录的可点定样：记了什么、保留与清理、占用、覆盖与缺口四块定下的方案，用组件板实件画（样式是组件板现行样式的生成快照），含首次接入、暂停、期限过短、清理失败、磁盘满、断线与截断等状态 | 用户已定（2026-11-04，四块都选推荐方案，同日按组件板实件重做并确认）；产品未实现；里面是示例数据 |
| [coding-execution-states/](coding-execution-states/README.md) | 第 12 批 Coding 执行的可点定样：目录（执行目录、临时查看、冻结、输出不见了）、规则和模式（只读提示与切换、规则来源）、恢复（失败、结果未知、取消、超时、被系统结束、重启后、等待前一步，沿用 04 的恢复框架）、计划卡与任务板按位置编号；每块 A／B／C 三个方案，中英文、浅深色 | 用户已选定（2026-11-04：目录 C，其余 A，记在 [Coding 需求书 §11](../../specs/coding-harness-optimization/spec.md#11-决策记录)）；产品未实现；里面是示例数据 |
| [service-connections/](service-connections/README.md) | 服务与模型连接的可点定样：直接连接、高级配置、连好回到原处三块，各三个方案，含取消登录、登录失效、换账号、服务限流、密钥被拒 | 用户已选定（2026-11-04，三块都选 A）；产品未实现；里面是示例数据 |
| [sessions-sources/](sessions-sources/README.md) | 第 22 批外部会话定样：发现会话、归属建议、查看历史三块，各两到三个方案，含读取中、来源没读成、没有会话、模型不可用、改选后来了新建议、读到一半断了、这一版读不了、已停止读取；按组件板实件做 | 用户已定（2026-11-04：B 按时间排加来源条、B 待归类集中处理、A 原文对话，记在 [Sessions 需求 §8](../../specs/sessions-rebuild/spec.md#8-决策记录)）；产品未实现；里面是示例数据 |
| [appearance-selection/](appearance-selection/README.md) | 第 14 批外观选择与应用规则的可点定样：设置 › 界面与语言里的皮肤、字体、等宽、语言与恢复，三个方案（点了就换／在这个窗口试／旁边样张），含字体加载慢与失败、方案没通过检查、另一个窗口刚改过、系统语言还没有；中英文、浅深色 | 用户已选定（2026-11-04：方案 C，记在[字体皮肤语言需求 §12](../../specs/font-and-skin-system/spec.md#12-决策记录)）；产品未实现；Folio 配色与圆润字体是代替品，里面是示例数据 |
| [kit/](kit/README.md) | 组件板实件，各原型共用一份：从构建结果生成的 `kit.css`／`kit.js`（色板、`mw-*` 控件、状态环、差异视图、过程折叠、图标表与真实渲染函数）和生成脚本 | 现行；`pnpm build` 后 `node docs/design/kit/build.mjs` 重新生成，不手改；组件板变了由 D 轨重生成 |
| [molis-work-onboarding/](molis-work-onboarding/proposal.md) | 「从已有工作开始」的引导与项目创建方案 | 流程与数据边界仍有效；视觉由 Soft Workbench 引导窗口取代 |
| [ui-renewal-2026-09-21/](ui-renewal-2026-09-21/README.md) | 设计讨论、研究与共识 | 历史参考 |
| [immersive-workbench/](immersive-workbench/README.md) | 画布中心工作台原型（Linear 方向） | 历史原型，视觉已被取代 |
| [workbench-frame-container/](workbench-frame-container/README.md) | 工作台 Frame 容器切片 | 历史原型，视觉已被取代 |
| [directory-plugin-list/](directory-plugin-list/index.html) | 插件目录列表原型 | 历史原型，视觉已被取代 |
| [goal-workbench-clarity/](goal-workbench-clarity/proposal.md) | Goal 画布展开方案 | 历史方案，已由 Goal 画布工作区需求书取代 |
