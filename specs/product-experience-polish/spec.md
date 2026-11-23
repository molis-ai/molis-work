# 全产品界面、空间布局与行为反馈深度打磨（含开发指引收口）

状态：需求已整理，待实施（2026-11-18；需求维护：Antigravity，实现：第 91／91B 批主会话）。与[对话与执行流式体验](../conversation-execution-ui/spec.md)合并为统一体验专项，排期为路线书[第 91 批（第一段 91A）](../post-anticorruption-roadmap/reference/batches/91.md)与[第 91B 批（第二段 91B）](../post-anticorruption-roadmap/reference/batches/91b.md)（[路线书决定 55](../post-anticorruption-roadmap/reference/decisions.md#decision-55)）。

- **档位与分类**（[开发流程 §1.1、§1.2](../post-anticorruption-roadmap/reference/development-workflow.md#1-分档分类与决策)）：大需求；体验与效果（视觉工艺、文案状态、空间布局、行为反馈、轻动效）、横向能力（Design System 原语与控件板、Plugin Frame 客户端脚本、统一日期/等待/Toast/自动保存/确认桥、生成插件渲染器、开发指引与创作台 Skill）、产品线（全产品入口与 23 个内置插件、4 个官方订阅源集成、IM、侧栏、Artifacts、Sessions）。
- **决策标记**：已定方向（用户 2026-11-18 确认[决定 55](../post-anticorruption-roadmap/reference/decisions.md#decision-55)）——采用 `91（91A） + 91B` 双段推进，剔除 `44-7` 待删的桌面胶囊，同步更新后续开发指引与创作台 Skill，并在 `91B-4` 收紧自动化门禁。仍要决策：① `91-0c` 新增 `.mw-stage-list-detail` 与 `.mw-selection-bar` 组件板标本按开发流程第 5 节先在 `/__ui/catalog` 出样过 D 轨合审；② `91B-4` 改动门禁脚本与阈值前按 `AGENTS.md` 门禁流程复核清单；③ `UXP-14` 本人实物走查。其余直接做。
- **相邻的线**：承接 [36A](../post-anticorruption-roadmap/reference/batches/36a.md)（底栏第十三版壳层、首页「项目的第一页」、Coding 前后半、设置页二段、动效曲线收口）与 [conversation-execution-ui](../conversation-execution-ui/spec.md)（`91-1`～`91-4` 流式内核）；与 [44-7](../post-anticorruption-roadmap/reference/batches/44.md#batch-44-item-7)（删除桌面胶囊）和 [56-1／56-2](../post-anticorruption-roadmap/reference/batches/56.md)（通知恢复页与切换后新入口复核）严格不重叠；`91-5` 落定的开发指引与创作台规范直接服务后续 `38～89` 批及所有新插件／生成插件。
- **预警触发条件**（开发流程 §6）：① 页面单资源体积一次增长超 `10 KB` 或新增页面资源（红线，先问用户）；② `skills/molis-plugin-dev/` 或 `horizontal/plugin-studio/src/agent-prompts.ts` 变动必须跑通 `pnpm studio:replay` 与隔离 Home `smoke`；③ 任一门禁规则放宽或新增豁免。

---

## 1. 目标与边界分工

基于 `origin/main`（`f5efe316a2`，已含 `#2110` P0 急救、`#2120` 词包治理、`#2127` 设置页 P5 第一段、`#2132` 决定 53、`#2134` 助理代码重绘与 `#2135` 第 91 批立项）的全仓 38 个产品表面深度走查，Molis Work 已具备扎实的 Soft Workbench 设计底座，但存在三类跨表面系统性体验债：
1. **组件与语义孤岛**：生成插件渲染器、多处内置插件与边缘外壳尚未统一消费 `mw-*` 原语，存在加载失败白屏吞错、拿译文做分支判断、一屏多阳色、不可逆删除误用正向墨蓝、按钮左右反序、色彩语义倒置、琥珀色被稀释、21 处原生日期/时间与 11 处阻塞 `window.confirm / alert` 裸露、手敲字符图标与私绘 SVG 等问题。
2. **空间与响应式布局断层**：分屏窗格 `.tab-pane-body` 未声明容器查询，16 个页面与插件仍绑窗口 `@media` 导致桌面二分屏或开右侧栏时 `540～680px` 窄窗格双栏挤压；主从列宽与底色分裂并存在「纸中套卡 / 卡套卡」；全仓散落 12 种野生版心宽度甚至同页左右跳轴；首屏多层顶栏堆叠「头重脚轻」。
3. **用户行为反馈闭环缺口**：`MICRO_INTERACTION_CLIENT_SCRIPT` 在全平台插件 iframe、侧栏、Home 插件页与 IM 漏挂（导致全量内置插件分段滑块与 `⌘+Enter` 弹窗提交失效）；侧栏/IM 不在 `${PAGES}` 作用域导致按压弹簧与勾选绘制脱落；缺少统一异步按钮等待助手 `window.molisBusy` 造成 21 插件未走 `data-loading`、整页 `inert` 冻屏或零延迟瞬闪；`molisCraft` 五大轻动效全仓仅 4 处真实调用；8 套 Toast 与 7 套自动保存各自为政；`copy-feedback.ts` 默认文案硬编码中文。

### 与既有／在途批次的精确边界（零重复、防撞车）

| 既有／在途批次 | 归其负责（本需求不重做） | 归本需求负责（`91A` + `91B`） |
| --- | --- | --- |
| **[36A](../post-anticorruption-roadmap/reference/batches/36a.md)**（决定 52／53） | 顶部方案 C、第十三版底栏 `helm.html` 与对话／信息栏、Coding 前后半主体、设置页 P5 二段（10 页主体）、首页「项目的第一页」（含 Work Brief 甲方案双栏）、`36A-7` 五处散落曲线收口 | 底座 `@container`、四档版心令牌、`molisBusy`、统一 Toast/自动保存/日期增强器、Coding 剩余微瑕（硬编码中文、`mw-button` 拼写、归档改 Undo、越界琥珀/胶囊）与全部未覆盖的 23 插件、4 个官方订阅源集成及外壳伴随表面 |
| **[44-7](../post-anticorruption-roadmap/reference/batches/44.md#batch-44-item-7)**（决定 42） | 删除桌面菜单栏胶囊（`apps/desktop/src/capsule-shell.ts`） | **显式剔除桌面胶囊打磨**，不投入重复工时 |
| **[56-1／56-2](../post-anticorruption-roadmap/reference/batches/56.md)** | Attention 唤醒/角标/系统通知、插件通知恢复页（`PF-A09`）与 16 切换后新入口的 `audit-ui-copy` 复核 | 其余 23 插件、4 个官方订阅源集成、生成插件渲染器与外壳已有入口的文案/双语硬编码清零、按钮词性修补与插件市场 0 条待核对常态隐藏 |
| **[conversation-execution-ui](../conversation-execution-ui/spec.md)**（`91-1`～`91-4`） | 个人助理与 Coding 的单连接 SSE、流式吐字平滑引擎、恒定 `20px` 状态环、200 轮零跳变回滚、Agent Host／Prologue 热路径 | 共用 `91-1` 共享核心与 D 轨评审窗口一次落定全站体验底座，在 `91-5` 统一沉淀开发指引，在 `91B` 收口全产品表面与三层门禁 |

---

## 2. 平台体验底座规格（并入 `91-1`）

### 2.1 行为反馈底座（0ms 按下 → 250ms 静默 → 原位等待 → 回执／回滚）

1. **补载微交互与轻动效运行时脚本、下沉触觉原语**：
   - 在 `apps/workbench/src/plugin-frame.ts`、`apps/workbench/src/side-view-document.ts`、`apps/workbench/src/home-plugin-page.ts` 与 `packages/im-ui/src/client.ts` 全量补齐 `MICRO_INTERACTION_CLIENT_SCRIPT`（恢复全部现役内置插件的 Rubber Segment 分段滑块与 `<dialog>` `⌘+Enter` 快捷提交），并为侧栏、Home 插件页与 IM 补齐缺失的 `CRAFT_FINISH_CLIENT_SCRIPT`、`REFLOW_CLIENT_SCRIPT`、`COPY_FEEDBACK_CLIENT_SCRIPT` 与 `STATE_RING_CLIENT_SCRIPT`。
   - 将按钮 `scale(.97)` 弹簧按压、复选框 `scale(.86)` + `craft-tick`、单选框 `craft-pop`、开关拉宽弹性与输入框雾蓝焦点光晕从 `${PAGES}` 窄选择器下沉至共享原语层（`packages/design-system/src/styles/buttons.ts`、`primitives.ts`），同时为 `side-view-document.ts` 等补齐语义页面类，使全产品所有 `mw-*` 控件触感一致。
2. **统一异步按钮繁忙助手 `window.molisBusy(button, work, options?)`**：
   - 自动加防连点锁、设置 `data-loading` 与 `aria-busy`、自动插拔 `.mw-spinner`（严格遵守 `DESIGN.md` `250ms` `mw-loading-in / mw-loading-out` 延迟，有图标时原位等宽替换不抖动），在弹窗内支持拦截 `Esc` 关闭并在 `finally` 绝对释放；彻底淘汰手写 `button.disabled = true` 灰死僵住、整页 `workspace.inert = true` 无声冻屏及 `Diff` 等绕开 `250ms` 的双图标瞬闪。
3. **统一宿主 Toast 契约（收拢 8 套分裂实现）**：
   - 扩展 `host.showToast(message, options?)` 至唯一宿主 `.mw-toast` 队列（继承 `placement.ts` 控件避让逻辑，底距统一 `calc(var(--helm-h) + 14px)`），淘汰 `settings-plugins`、`account-menu`、`issues`、`workflows`、`work-brief` 与灵光 `.lingguang-note` 等各自独立实现；
   - 三档规范时长与无障碍：纯确认 `2800ms`（`role="status"`）、含撤销或后续动作 `6500ms`（悬停或聚焦暂停倒计时）、错误态 `role="alert"` + 单次 `mw-toast-nudge` 轻颤且不因单行 `nowrap` 截断；每次触发必清前序计时器。
4. **统一五态自动保存模型与复制／回滚原语**：
   - 在 `packages/plugin-sdk` 提供统一自动保存状态渲染：`idle`（静默隐退，常态不刷绿也不占位）→ `dirty`（中性灰「未保存」）→ `saving`（超 `250ms` 显微环「保存中…」）→ `saved`（轻闪 `640ms` 后 `2s` 淡回静默）→ `failed`（红色常驻 + 保留草稿 + 就地 `mw-btn--link`「重试」）。
   - 修复 `packages/design-system/src/browser/copy-feedback.ts` 硬编码中文默认值 `"已复制" / "复制失败"`，改为经 `globalThis.t` 读取双语键；提供 `optimisticToggle` 乐观开关失败回滚助手（失败自动弹回原值 + 解除禁用 + 区块内就地 `role="alert"`）。
5. **共享控件与生成插件渲染器收口**：
   - **生成插件共享渲染器（`packages/design-system/src/plugin-components.ts` 与 `plugin-component-*.ts`）**：解耦页面 `opener` 与模态窗 `submit` 的阳色绑定（确保每页平面最多 1 个 `mw-btn--primary`、每个独立弹窗内正向提交恒为 `primary`）；清除 `.pc-count::before` 硬编码中文 `"共 X 条"`；废除 `TONES[index % 4]` 轮转琥珀染色；拆 `.pc-directory>.pc-record` 卡套卡与行级雾蓝底；删除 `:hover translateY(-1px)` 与 `"✓ "` 字符；未知插件回退图标由 `sparkles` 改为 `puzzle`；首载骨架守 `250ms` 延迟。
   - **统一日期／时间渐进增强器**：在 `packages/design-system` 基于 `.mw-calendar` + `.mw-popover` 封装统一 `date / time / datetime-local / month` 增强组件，清零全仓 21 处 OS 原生日期/时间拾取器。
   - **宿主确认弹窗桥 `host.confirm` 与共享件**：扩展 `apps/workbench/src/browser/plugin-frame/dialogs.ts` 支持 `{ title?, confirmLabel, tone?: "primary" | "danger" }`，不可逆删除默认危险红 `mw-btn--danger` 与具体动词（禁用泛词「确定」），按钮严格「左取消、右主动作」；修复市场卡片 `craft-finish-pages.ts` `.mw-card:has(> .mw-btn ~ .mw-btn ~ .mw-btn)` 漏筛 `:not([hidden])` 导致的单按钮折行事故；修复 `/__ui/catalog` 裸键 `"common.control.retry"`、`context-toolbar.ts` 字符图标、`file-picker.ts` 硬编码中文与 `diff-view.ts` 琥珀普通提示及 `@container (max-width: 680px)` 单列降级；清零 `agent-review-surface.ts` 8 处硬编码色并取消审批二次确认套娃。

---

### 2.2 空间与布局架构规格（并入 `91-1` 底座，全表面在 `91B` 落地）

1. **窗格级 `@container` 容器查询三档断点（彻底取代插件内视口 `@media`）**：
   - 在 `apps/workbench/src/styles/tab-workspace.ts` 的 `.tab-pane-body`、`.tab-workspace-exclusive` 及插件宿主根容器统一声明 `container: plugin-stage / inline-size`；视口 `@media` 仅保留给外壳顶/底栏与 `(pointer: coarse)` 触控精度。
   - 全平台统一三档 `@container plugin-stage` 响应契约：
     - **舒展档（`≥ 960px`）**：主从双栏完全展开，或正文 + 右页边／属性轨并列；
     - **紧凑双栏档（`680px ～ 959px`）**：自动收折第三栏与右侧附属信息轨（Risk `300px`、Alchemist `340px`、PPT 右备注 `280px`、首页/简报 `216px` 依据栏下沉或转抽屉），主从左栏收窄至 `220px`，列表行隐去次要元数据列；
     - **单栏推入档（`< 680px`）**：所有双栏舞台（`.plugin-stage-shell`、`goal-board`、`Sessions`、`Jelly`、`PPT`、`Diff` 并排）自动切换为「列表占满 → 点开详情占满 + 左上返回钮」（`Plugin Builder` 在 `<760px` 切顶部「对话设计 / 实时预览」分段页签）。
2. **主从舞台两档目录宽度与去「纸中套卡／卡套卡」**：
   - 冻结 `--stage-list-w: 240px`（紧凑 `220px`）与富摘要目录 `--stage-list-wide-w: 280px`（封顶 `300px`，禁用百分比拉肥）；所有主从左栏统一 `--surface-soft` + `1px solid var(--line)`，右栏独占 `--paper`。
   - 拆除 `Feed` `.mw-detail` 阴影圆角二层白卡壳与多处 3～4 层套盒（生成插件目录行、Todo、Risk、设置子页、逐项审阅栏），以留白与单根分割线建层。
3. **四档标准居中版心契约（淘汰 12 种野生宽度）**：
   - `--measure-reading: 680px ~ 720px`（Pages 正文、灵光编辑与对话同轴居中、Feed/Inbox 正文、Jelly 笔记、Coding 对话）；
   - `--measure-form: 760px ~ 880px`（设置全集 `760px`、Form 编辑器、Goals 文档 `880px` 齐头居中去 `32px` 阶梯缩进、首页与 Work Brief `640+24+216=880px`）；
   - `--measure-stage: 960px`（全部对象目录含 Pages/灵光、插件市场等高双列卡片）；
   - `--measure-wide: 1152px`（Dataset 头部与表格同宽对齐、PPT `.ppt-workspace` 居中、Goals 画布/看板、Workflows 链）。
   - **同轴铁律**：同一纵向滚动流内所有区块共享同一中心轴与起止线；`.plugin-stage-detail-bar` 严禁设 `overflow-x: auto`，单行 `48px` 封顶（返回 + 标题 + 最多 1 主 1 次 + `···` 更多菜单）。

---

### 2.3 平台统一「列表—详情」标准容器与顶部标签页联动架构（`91-0c` 底座 + `91-4`／`91B` 全量收口，[决定 64](../post-anticorruption-roadmap/reference/decisions.md#decision-64)）

全仓 `30` 个插件包（`23` 个现役内置插件，原 `text-stats` 已随 `#2243` 退役；+ `5` 个官方集成，含 `catalog` 与 `4` 个官方订阅源集成；+ `2` 个内容包）与 `9` 个平台视图核查表明，带条目列表插件当前存在五套分裂形态与四处现役缺陷：① `23` 个内置插件中有 `17` 个仍声明 `workbench.directory`（其中 **`14` 个为纯空桩**返回 `""`，`feed` 与 `goals` 亦各有 1 处返回 `""` 的空 `directory` 声明——合 `16` 处空 `directory` 声明；`git` 输出 `hidden` 面板触发死空全局左栏且主 iframe 又自绘 `.companion-directory`；`feed` 的 `source-directory`／`sources` 别名是唯一残余插件全局左栏消费者；`goals` 另留 5 处未挂主树的目录面，平台 `artifacts` 亦留 1 处多余声明）；② 全局左栏 `#goal-tree-pane` 全窗唯一、不支持多窗格分屏、桌面端被锁死不可折叠，且点击目录行直接调 `host.openItem` 开新标签，与主区原地打开语义相悖；③ `DIRECT_WORK_SURFACE_IDS` 与 `OWN_DIRECTORY_SURFACES` 按内置目录派生却几乎失效（被 `events-secondary.ts` 先行截获），同时外壳在 `plugin-stage.ts`、`tab-workspace.ts`、`immersive-navigation.ts`、`placement.ts` 等处仍残留插件 ID 硬编码分支；④ `36A-3` 在 `plugin-stage.ts:253-257` 无层叠隐藏 `.plugin-stage-list` 误伤了 `Feed` 的左栏，而 `Goals`（列表视图）、`Coding`（含独立 `item` 标签）、`Git`、`Sessions` 仍在宽屏或独立标签内常驻左侧列表；⑤ `11` 个列表插件/视图未设 `accepts_objects: true`、`Coding`/`Workflows`/`Risk` 漏报 `recordRow`（`Pages`/`灵光` 仅声明 `searchRow` 走 `recordRow ?? searchRow` 回退）、`Work Brief` 误标 `accepts_objects: true`、`Pages`/`灵光` 等 APG 键盘多选（`BL-340`）与 iframe 404 回传（`BL-record-gone-from-framed-plugins`）未闭环。

1. **列表统一位置与彻底清零外壳插件名分支（单舞台制）**：
   - 全部插件的条目列表统一位于**各自窗格（`workbench.main` 或 `workbench.side`）内的平台标准舞台容器 `.mw-stage-list-detail`（属性 `[data-stage-list-detail]`，显式避让设置页与技能包面板既有的 `.mw-list-detail` / `[data-list-detail]`，防止与 `catalog-skill-packs.ts` / `capability-pack.ts` 的 `280–360px` 网格样式冲突）**，经 `@molis-ai/molis-work-plugin-sdk/ui` 的 `renderListDetailStage` + `attachListDetailStage` 提供，基础样式纳入 `< 80 KB` `molis-work-plugin-base.css`。
   - **退役插件侧 `workbench.directory` 与静态分流表**：全局左侧导航轨（原 `#goal-tree-pane` 改为中性 `[data-shell-cover-nav]`）**仅服务全窗独占覆盖层（`settings` / `project-settings` P5 `228px` 左轨）**；清除 `14` 处纯空桩、`feed`/`goals` 空 `directory`、`git` 死左栏声明、`feed` `sources` 别名（信息源管理收回 Feed 舞台内标准视图）及平台 `artifacts` 多余声明；**整体删除 `DIRECT_WORK_SURFACE_IDS` 与 `OWN_DIRECTORY_SURFACES`**，内置、创作台生成与第三方签名插件走 100% 同一条装配路径。
   - **清零外壳残余点名**：`plugin-stage.ts` 7 处 `[data-*-delete]` 改通用 `[data-stage-action="danger"]`、移除 `FRAME_STAGE_SHELL` 插件排除清单；`tab-workspace.ts:249` 移除 `[data-schedule-stage-workspace]` 改读 `[data-stage-list-detail][data-expanded="true"]`；`immersive-navigation.ts:44,105` 清除 `sources` 与 `[data-inbox-row]`；`placement.ts:493-500`、`immersive-shell.ts:288-289` 与 `immersive-navigation.ts` 清除 `open.surface === "goals"` 与 `data-immersive-goal-tools` 死 DOM/样式（**推进收口 `BL-shell-goals-leftovers` 中外壳导航相关项：④ `#goal-tree-pane`、⑤ `data-immersive-goal-tools` 及样式、① `placement.ts:493-500`；该 Backlog 的其余 4 处 Goal 挂载/助理/Goals 内分支项留原条续跟，不提前删除该 Backlog**）。
2. **Manifest 声明式容器形态（`ui.views[].stage_layout`，可选新字段走公共合同流程）**：
   - `kind: "list-detail" | "canvas" | "utility"`；`detail_mode?: "focus" | "split"`（默认 `"focus"`）；`list_width?: "standard" | "wide"`（`240px` / `280px`）；`collapsible?: boolean`（默认 `true`）；`multiselect?: boolean`（默认 `false`，为 `true` 时容器必带 `aria-multiselectable="true"`）。
   - **`detail_mode: "focus"`（聚焦整页，默认，承接 `36A-3` 一件事一页与 `todo-detail` 定稿）**：覆盖 `Pages`、`灵光`、`Todo`、`Forms`、`Dataset`、`PPT`、`Cognia`、`Alchemist`、`Images`、`Issues`、`Risk`、`Workflows`、`Schedule`、`Goals`（图谱/看板/列表三视图统一打开语义，结清 `BL-plugin-open-record-own-lists`）、`Jelly`（笔记与完整详情；轻量日程快改保留轻弹层）与 `Artifacts`。在插件母页点开条目默认收起列表、详情占满窗格；在窗格舒展档（`≥ 960px`）的母页顶栏提供轻量「展开列表」切换键（`PanelLeft` / `⌘\`），按会话记忆临时展开 `240/280px` 可拖拽左轨，窄于 `960px` 自动收折。
   - **`detail_mode: "split"`（高频分拣 / 连续流双栏）**：覆盖 `Feed`（`wide`）、`Inbox`（`standard`）、`Coding`（`standard`）、`Git`（`standard`）、`Sessions`（`wide`）及拖宽 `≥ 680px` 时的 `Shelf` 侧栏。在插件母页舒展档并排 `--surface-soft` 可拖拽（`220–340px`、双击重置）+ 一键可折叠（`⌘\` / 顶栏折叠钮，解除桌面端不可折叠限制）列表轨与 `--paper` 详情区；修复 `Feed` `36A-3` CSS 挖空左栏回归。
   - **纯工具／画布豁免不强套**：`Work Brief`（单活文档，移出误标的 `accepts_objects: true`）、`Plugin Builder`（对话+预览画布，`@container (max-width: 760px)` 分段切换）、`Diff`、官方集成（`5` 个，含 `catalog` 与 `4` 个官方订阅源集成）与内容包（`2` 个）。
3. **分屏自适应与窄屏逐层推进返回（全 `@container plugin-stage` 驱动）**：
   - **舒展档（`≥ 960px`）**：`focus` 列表 `960px` 居中 / 详情独占并支持可选展开左轨；`split` 左轨 `240/280px` + 详情并排且可一键折叠。
   - **紧凑 / 二分屏档（`680px ～ 959px`）**：`split` 标准轨收窄至 `220px` 并隐去行次要元数据列、`wide` 富摘要轨（`Feed`/`Sessions`）自动转单栏推入保阅读列宽 `≥ 480px`；所有第三栏附属轨（Coding 工具抽屉、Todo/Risk/Alchemist/PPT 附属栏）自动收折为按需抽屉。
   - **单栏推入档（`< 680px`，含二分屏开右栏、`600px` 窄窗格与 `390px` 手机）**：`focus` 与 `split` 无条件进入同一套逐层推进状态机：`L0 集合列表` → `L1 对象详情`（`molisCraft.turn` 方向语义）→ `L2 附属抽屉`。进入 `L1` 时记住 `{ scrollTop, anchorRecordId, filterState }`；顶栏 `‹ 返回`、`Escape`（无弹窗且非编辑态）、工作台后退 `[data-nav-back]` 与点击顶部已激活插件组头标签（`resetPluginPage`）**四路归一**，退回 `L0` 时原样恢复滚动位并将键盘焦点归还至原行；触控热区 `≥ 44px`、详情顶栏 `48px` 单行零 `overflow-x` 裁切。
4. **顶部标签页／标签组联动、三类点击与多选统一规则（对齐并补全 [插件标签组](../plugin-tab-groups/spec.md)）**：
   - **独立条目标签纯净铁律**：无论 `focus` 还是 `split`，一旦以顶部 **`kind: "item"` 独立条目标签** 打开（`data-tab-kind="item"`），**默认隐藏主列表轨、呈现纯净单页详情**（不显示「返回列表」，绝不在分屏里复制两份 240px 列表；组头标签即列表母页，`split` 插件可按需提供默认关闭的临时速切抽屉图标）。
   - **普通点击**：在插件母页（`kind: "plugin"` 组头标签）点击记录行 → **原地打开详情**（不建新标签，组头记住当前记录并压入窗格历史）；在外部入口（首页、搜索 `⌘K`、助理事件卡、引用卡）或已在另一个 `item` 标签内点击 → 在目标插件自动组内打开/激活 `kind: "item"` 标签（无组头先补组头；跨窗格已开则聚焦去重；保留 `opens_items: true` 通用的侧栏速览声明，如 `Risk` 点「展开」再进主区 `item` 标签）。
   - **组合键／中键组内新开标签**：非多选列表的 **`⌘/Ctrl`+点击** 与 **全部列表的鼠标中键（`auxclick`）** 均调用 `openBehind` 在同插件组内后台新开（或去重复用）`kind: "item"` 标签，当前页与列表位置不变；`Alt`+点击或右键「在右侧分屏打开」走 `openBeside`（`< 760px` 降级为当前栏新开）。每行右键 / `···` 菜单提供「在新标签页打开」「在右侧分屏打开」兜底（照顾无中键触控板用户）。补齐分屏窗格内关闭插件组的 6 秒撤销与 `⌘⇧T`。
   - **多选列表与 APG 键盘交互（结清 `BL-340`）**：凡支持多选的列表（`Pages`、`灵光`、`Todo`、`Cognia`、`Jelly` 日历列表、`Shelf` 及设置 › 项目知识库）统一声明 `aria-multiselectable="true"`，**`⌘/Ctrl`+点击归列表多选不开标签，鼠标中键仍后台新开标签**（守 `PTG-06` / D24 与 `W2-18-PAGES-SOURCES-01`）；升级 `packages/design-system/src/browser/roving-focus.ts` 支持单 `Tab` 停留位、`↑/↓/Home/End`、`Enter` 原地打开、`Space` 切选、`Shift+↑/↓` 与 `Shift+点击` 区间连选、`⌘/Ctrl+A` 全选、`Esc` 清选，选中 > 0 浮现统一 `.mw-selection-bar` 批量操作栏；`Pages` 带文件夹分组迁标准 APG `treegrid` 并补齐批量条。
   - **全量对象标签合同补齐**：为其余 `11` 个列表插件/视图（`Todo`、`Issues`、`Cognia`、`Forms`、`Dataset`、`PPT`、`Schedule`、`Alchemist`、`Images`、`Jelly`、`Sessions`）统一补齐 `accepts_objects: true` 与 `recordRow`；为 `Coding`（归 `91-4`）、`Workflows`、`Risk`（归 `91B-2`）补齐缺失的 `recordRow`（已声明 `searchRow` 的 `Pages`/`灵光` 继续走 `recordRow ?? searchRow` 回退或顺手显式声明 `recordRow`）；在 `plugin-frame` 帧桥补通 `record-gone` 404 回传（结清 `BL-record-gone-from-framed-plugins`）。

---

### 2.4 平台共享样式表剥离具体插件类名与防回流守卫（[BL-b44-shared-styles-plugin-names](../backlog/BL-b44-shared-styles-plugin-names.md)，[决定 65](../post-anticorruption-roadmap/reference/decisions.md#decision-65)）

对 `apps/workbench/src/styles/`（`9` 个模块：`base`、`capabilities`、`coding-companions`、`detail-reading`、`immersive-directory`、`immersive-navigation`、`linear-density`、`placement`、`plugin-stage`）与 `packages/design-system/src/styles/`（`13` 个模块：`arrival-components`、`craft-finish`、`craft-finish-pages`、`craft-finish-selectors`、`desktop-titlebar`、`directory-ledger`、`disclosure`、`foundation`、`interaction-texture`、`micro-interactions`、`navigation-ownership`、`primitives-plugin`、`workspace-panes`）逐行核查，共清点出 **`22` 个平台共享样式模块、`250+` 行**仍包含具体插件类名或数据属性。其中显式区分两项非插件通用样式：① `.form-disclosure`（见 `disclosure.ts`、`primitives-plugin.ts`、`coss-controls.ts`、`surface-language.ts`）以及 `.form-actions` / `.form-error` 属设置折叠、终端与通用表单控件共用，**不属于 `plugins/native/form/`，严禁迁入 `form/src/styles.ts`**（仅 `.form-tabs` 与 `.form-export-panel` 归 `form` 插件）；② `diff-view.ts` 的 `[data-diff-measure]`/`[data-diff-sized]` 属平台共用 `mw-diff` 控件，建议顺手更名 `[data-mw-diff-*]` 消除歧义。

按「插件目录绝对单归属、共享样式文件有序 rebase 协调、首屏字节实测净降、门禁绝对防回流」原则，拆为四段精确切片正式编入第 91／91B 批：

| 切片归属 | 涉及平台共享样式模块（精确文件） | 剥离与迁移动作 | 目标插件按需样式表 / 平台中性原语 |
| --- | --- | --- | --- |
| **片 1：`91-0c`（底座先行，不等 `37-2`）** | `apps/workbench/src/styles/{base,immersive-directory,immersive-navigation,plugin-stage,coding-companions}.ts`；`packages/design-system/src/styles/{craft-finish,craft-finish-pages,craft-finish-selectors,foundation,interaction-texture,micro-interactions,workspace-panes}.ts` | ① **共用写法更名 `mw-*`**：`.goal-collection-{fold,caret,mark,empty}` → `.mw-collection-{fold,caret,mark,empty}`；跨模块共用状态 `.goal-status` / `--goal-status-tone` 收敛至 `.mw-status` / `[data-mw-status]`；`[data-feed-search]` → `[data-mw-inline-search]`；`craft-finish.ts` 轻动效钩子（`[data-feed-entry-id]`/`[data-inbox-entry-id]`/`[data-select-goal]`/`[data-goal-node-workspace]`/`[data-workspace-goal-status]`/`[data-frame-goal-*]`/`.goal-status--completed`/`.goal-tui-pane`）泛化为 `[data-mw-record-row]` / `[data-mw-record-id]` / `[data-mw-completed="true"]` / `[data-mw-craft-quiet]`；② **外壳特例清零**：`plugin-stage.ts` 7 处 `[data-*-delete]` → `[data-stage-action="danger"]`、移除 `[data-feed-stage-shell]` 与 `[data-work-surface="jelly"]` 排除、`[data-lingguang-save-status]` → `[data-autosave-status]`、`.form-tabs` → `.mw-tabs`；`immersive-navigation.ts` 清理 `.immersive-goal-tools` 与退役后的外壳 `.desktop-goal-directory`；③ **Git 样板迁出**：`coding-companions.ts` 的 `.git-browser`/`.git-reader-head` 迁回 `plugins/native/git/src/styles.ts` | 平台中性 `mw-*` 原语 + `plugins/native/git/src/styles.ts`（按需） |
| **片 2：`91-4`（Coding 切片）** | `apps/workbench/src/styles/plugin-stage.ts`；`packages/design-system/src/styles/{craft-finish-pages,disclosure,primitives-plugin}.ts` | 剥离 `.coding-start-mark`、`.coding-checkpoints`、`.coding-material`，标准披露改用 `.mw-disclosure`/`.mw-collapsible`，Coding 专属规则迁回按需样式表 | `plugins/native/coding/src/styles.ts`（按需） |
| **片 3：`91B-1`～`91B-3`（按插件目录单归属分工；对 4 个共享样式模块按合入顺序 rebase 协调）** | • **`91B-1`**：`apps/workbench/src/styles/capabilities.ts`；`packages/design-system/src/styles/{arrival-components,desktop-titlebar}.ts`<br>• **`91B-2`**：`apps/workbench/src/styles/{base,detail-reading,immersive-directory,immersive-navigation,linear-density,placement,plugin-stage}.ts`；`packages/design-system/src/styles/{craft-finish-pages,craft-finish-selectors,directory-ledger,foundation,interaction-texture,micro-interactions,navigation-ownership,workspace-panes}.ts`<br>• **`91B-3`**：`apps/workbench/src/styles/plugin-stage.ts`；`packages/design-system/src/styles/{craft-finish-pages,disclosure,primitives-plugin}.ts` 及各创作/知识插件 HTML 类名同步 | • **`91B-1`**：`capabilities.ts` 的遗留 `.functions-{system-editor,stage-chrome,settings-document}` 改平台中性 `.capabilities-*`；`arrival-components.ts` 进度轨 `.mw-goal-track*`（9 行）改中性 `.mw-progress-track*`；`desktop-titlebar.ts:145` `.personal-new-goal` 改通用动作类；<br>• **`91B-2`**：Goals 剩余专属（`.goal-{tree,canvas-node,canvas-empty,frame-canvas,board-switch,trash-dialog,tui-pane}`、`.desktop-goal-directory`、`directory-ledger.ts` 48 行、`.navigator-goal*` `foundation.ts` 12 行、`placement.ts` `.placement-goal-*` 9 行、`linear-density.ts` `.frame-goal-actions`、`craft-finish-pages.ts` `.is-editing-goal`、`[data-goal-id]`）迁回 `plugins/native/goals/src/shell-styles.ts`（或 Goals 按需 `goals.css`）；Inbox 专属（`detail-reading.ts` 21 行 `.inbox-{attention-context,reference-body,reference-detail,reference-footer}`、`linear-density.ts` `.inbox-reference-detail`、`.inbox-compose-dialog`）迁回 `inbox` 按需样式表；<br>• **`91B-3`**（独占 `plugins/native/shelf/` 全部改造）：Shelf 专属 `.shelf-{stage,stage-chrome,drop,find,search,side-menu}` 迁回 `plugins/native/shelf/src/styles.ts`；Form 插件专属 `.form-export-panel` 迁回 `plugins/native/form/src/styles.ts`（`.form-disclosure` 保持通用表单披露类或随平台并入 `.mw-disclosure`，不搬进 `form` 插件）；同步核验 `Pages`/`灵光`/`Dataset`/`PPT`/`Alchemist`/`Jelly`/`Shelf`/`Git` 在共享表零残留 | `plugins/native/{goals,inbox,shelf,form,pages,lingguang,dataset,ppt,alchemist,jelly}/src/styles.ts`（按需加载） |
| **片 4：`91B-4`（首屏减负量测与永久防回流门禁）** | `scripts/gates/plugin-styles.mjs`、`tests/plugin-styles.test.ts`、`tooling/gates/page-asset-budgets.json`（只收紧不放宽） | ① 实测并记录剥离后 `molis-work-workbench.css`、`molis-work-settings.css`、`molis-work-arrival.css`、`molis-work-plugin-base.css`（`< 80 KB`）及 `first-screen` 共享 CSS 字节净降幅，按只收紧原则同步下调预算上限；② 升级 `tests/plugin-styles.test.ts:394`（原仅拦 Feed）并将**全量平台共享样式模块零插件名检查**接入 `scripts/gates/plugin-styles.mjs`（`pnpm plugin-styles:check`），对 `apps/workbench/src/styles/` 与 `packages/design-system/src/styles/` 全部 `.ts` 模块永久拦截具体插件类名（`.goal-*`/`.desktop-goal-*`/`.immersive-goal-*`/`.placement-goal-*`/`.navigator-goal*`/`.frame-goal-*`/`.personal-new-goal`/`.is-editing-goal`/`.mw-goal-*`/`.inbox-*`/`.shelf-*`/`.coding-*`/`.git-*`/`.functions-*`/`.form-tabs`/`.form-export-panel` 等，不误伤非插件通用 HTML 表单类 `.form-actions`/`.form-error`/`.form-disclosure`）与插件数据属性（`[data-<plugin>-*]`、`[data-work-surface="<plugin>"]`）；③ 全量通过后按 `specs/BACKLOG.md` 规则删除 `specs/backlog/BL-b44-shared-styles-plugin-names.md` 并在 `docs/backlog-removed.md` 留痕 | `pnpm plugin-styles:check` + `tests/plugin-styles.test.ts` 绝对零门禁 |

> **并行切片文件协调说明**：`91-4` 与 `91B-1`～`91B-3` 各自的插件目录与业务页面 100% 正交（`plugins/native/shelf/` 全部归 `91B-3`，零跨片目录冲突），仅在 `plugin-stage.ts`、`craft-finish-pages.ts`、`disclosure.ts`、`primitives-plugin.ts` 4 个共享样式模块中存在分属不同插件的独立选择器删除；拆分并行 PR 时按先合先删、后合基于 `origin/main` rebase 协调，全部合入后由 `91B-4` 统一核验归零并启用绝对零门禁。

---

## 3. 全产品表面收口清单（归属 `91B-1`～`91B-3`）

### 3.1 `91B-1`：入口、引导、账号、市场、侧栏四视图、IM、Artifacts 与 Sessions

- **到达／选择／升级与首次引导**：移除 `arrival.ts` 私读 `data-resolved-theme="dark"` 与 `999px` 雾蓝完成签；`upgrade-opening.ts` 补 `appearanceHead` 与本地化 `<title>`；`context-onboarding.ts` 改调 `molisWorkPreferences?.setTheme`、连接报错改红色、补 `250ms` 加载静默并把 `1600ms linear` `.animate()` 换 `molisCraft.turn`；无项目/错跑列表守单主按钮，窄屏触控钮提至 `44px`。
- **账号、登录与租户席位**：修复 `account-subscription-form.ts` 动态套餐名误入 `t.text()` 渲染 `"这句话暂时显示不了"` 的严重 Bug 并隐藏 `seatTypeId`；清零 8 处 `window.confirm`、7 处错挂 `mw-input` 的 `<select>` 与 2 处原生 `datetime-local`；废除 `account-menu.ts` 9 处硬编码 `#hex` 与被底栏压住的 `bottom: 28px` 浮条（切宿主 Toast）；翻转全部表单底栏为「左取消、右主动作」。
- **插件市场与详情**：市场扩至 `960px` 等高双列、恢复按钮标准边框、0 条待核对通知常态隐藏、`settings-plugins.ts` 用人话标题替机器码并切宿主 Toast 与危险红卸载钮、安装完成接 `molisCraft.land`。
- **右侧面板四视图与终端**：电脑面板删除 `--accent`（`#4c8dff`）实心主按钮与 10 处硬编码色；资料面板修英文提交钮 `"Imported"` → `"Import"`、拆 6 种全琥珀文件状态、把浏览器/电脑审批条设为真正的 `--amber-soft` 并接 `molisCraft.ask`；翻转 4 处按钮反序、修侧栏拖入高亮错绑隐藏弹窗 Bug、二进制文件补系统打开、图片挂 `molisMediaZoom`、字符 `×` 换图标、分割条补 `4px` 阈值与 `Escape`。
- **IM 讨论**：消费 `91-1` 已注入 `packages/im-ui/src/client.ts` 的共享脚本，补齐 `PRESENTATION_FORM_STYLES`、`mw-dialog / mw-menu / mw-status` 样式并收窄 `svg { width: 20px }` 根治对象引用卡破相；未读话题补 `sr-only` 与 `600` 字重；发送钮独占唯一 `--action`；嵌入侧栏去重复大标题与混排 `Thread`，草稿恢复回填对象标题。
- **Artifacts 与 Sessions**：修复两处首屏加载失败白屏吞错（补 `.mw-empty--error` + 重试）；Artifacts 清理多余 `workbench.directory` 声明并迁入 `91-0c` 标准 `.mw-stage-list-detail`（`focus`）、隐藏常态绿色「可用」、归档分组改中性灰、人话替换反向域名 ID 与 `Schema`、补 `molisCopy` 与 `molisMediaZoom`；Sessions 迁入 `91-0c` 标准 `.mw-stage-list-detail`（`split` · `wide` `280px`，独立 `item` 标签纯净单页并接入 `ITEM_TABS` 与 `recordRow`）、数据源改按需弹层释放 `240px` 首屏高度、4 处错挂 `mw-input` 的 `<select>` 修正为 `mw-select`、3 处裸剪贴板切 `molisCopy`、悬停改 `130ms` 并彻底用 `@container` 替换 `@media <= 760px`。
- **全局搜索 `⌘K` 与标签拖拽**：搜索命中高亮 `#f5c542` 改 `--accent` 浅洗、范围切 `mw-toggle-group`；`tab-drag-slot.ts` `.animate([{ width }])` 改 FLIP `transform` + `--dur-move / --ease-quint`。
- **桌面失焦礼仪、滚动粘性接缝、暗淡行与单槽引导队列（[决定 63](../post-anticorruption-roadmap/reference/decisions.md#decision-63) ②）**：Tauri `WindowEvent::Focused` + Web `focus/blur` 驱动 `html[data-window-active="false"]` 两级令牌降饱和（柔化 `--accent`/顶栏当前页签 2px 顶冠/常规主按钮，浮层局部 `inherit` 让位，**刻意保留 `--amber`「轮到你」审批提醒辨识度**）；`.plugin-stage-detail-bar` 与侧栏粘性头接纯 CSS `@property` + `animation-name` / `animation-timeline: scroll()` 长写法 1px 滚动驱动接缝线（不写简写 `linear` 守时长曲线门禁，不支持引擎安全退化为 `0`）；在 `packages/design-system/` 下沉 `[data-dimmed]` 暗淡行令牌重定向（行文本退隐、行内 `:is(button, a, input, select, [role="button"])` 恢复主色可读，进入 `<80 KB` 插件基础 CSS 供 `91B-2`/`91B-3` 消费）；首次引导与非紧急提示收敛至单槽 NUX 队列（`priority` + `showAfterOthersDismiss` + 对话页仅底部视口出现，防止同时弹出多个提示或打断翻看历史）。

### 3.2 `91B-2`：工作主干 9 插件 + 4 个官方订阅源集成

- **统一列表—详情容器与对象标签合同迁移（`91-0c` 下游收口）**：`Inbox` 迁入 `.mw-stage-list-detail`（`split` · `standard` `240px`，清死 `workbench.directory` 分支，补搜索/筛选/方向键分拣）；`Todo`（守 `todo-detail` 定稿 + 补 `accepts_objects: true` 与 `aria-multiselectable="true"` 键盘多选）、`Issues`（弃自定义切换改标准容器 + 补 `accepts_objects: true`）、`Risk`（补 `recordRow` + `@container` + 修 `manifest.name` 本地化，保留通用 `opens_items: true` 侧栏速览）、`Workflows`（补 `recordRow` + 清旧 CSS）、`Schedule`（补 `accepts_objects: true`）与 `Goals`（图谱/看板/列表三视图统一进纯净详情、撤宽屏常驻 280px 左树结清 `BL-plugin-open-record-own-lists`）全部迁标准 `focus`；`Feed` 复用 `91-0c` 已落稳的 `split`（`wide`）标准容器；`Work Brief` 移除误标 `accepts_objects: true`；清理工作主干插件残留的 `workbench.directory` 空桩。
- **跨插件暗淡行收口（[决定 63](../post-anticorruption-roadmap/reference/decisions.md#decision-63) ②）**：Goals、Inbox、Feed、Todo、Schedule、Risk 与 Workflows 的已处理/已归档/已停用行统一迁至 `91B-1` 下沉的 `[data-dimmed]` 令牌重定向，替代整行 `opacity: .5` 以保证行内恢复/撤销/详情按钮可读。
- **Goals**：清除 2 处拿中文 `"请求决定"` 做分支判断的逻辑；修复解除关系 `t.text()` 乱码；静态 `open` 投影去旋转 `"running"`；提案「退回修正」补 `.mw-btn`、收敛一屏多阳色；画布/看板取消单击 `220ms` 延迟；可逆「回收站恢复」取消强制填理由弹窗改即时+Undo；列表主从切 `@container goal-board`、文档收至 `880px` 齐头去 `32px` 阶梯缩进并压缩顶部套盒、补 15 处 `mw-select`。
- **Inbox**：将 `.inbox-reference-footer` 从正文上方下移为独立页脚，正文锁定 `680px` 居中；修复投影与列表状态冲突及忽略钮染墨蓝 Bug；「标记已处理 / 忽略」改即时生效 + `6.5s` Undo Toast + `molisReflow` + 自动推进下一条未处理项。
- **Feed + 4 个官方集成（`rss / gmail / github / youtube`）**：为 `rss` 与 `youtube` 补完整中英 `locales`，4 集成 `manifest.json` 补 `icon`；关闭行严格仅展示来源与标题（去掉常驻摘要与「没有附加摘要」），点开后同步更新 `<svg class="mw-ring">`；拆 `.mw-detail` 二层阴影白卡收至 `680px` 阅读版心；搜索补防抖、忽略改 Undo Toast + `molisReflow`、去左栏重复 `<h1>`、清退 11 处裸 `<select>`、修英文断句 `"Every day at"` 与开发自证语。
- **Todo**：接管 7 处原生日期框；去「重要 / 今天截止」的越界琥珀、删除 999px 胶囊与日期重复副标题；删除确认切危险红；勾选完成补 `optimisticToggle` 失败回滚、`molisReflow` 与 `molisCraft.celebrate`；拆收集箱卡套卡并切 `@container`。
- **Schedule**：待机「已启用」退隐中性、修英文按钮 `"Resumed"` → `"Resume"`、首屏补唯一阳色入口、接管原生 `time`、日历翻月接 `molisCraft.turn`、缺模型接 `host.returns.go`、去 `capability_id / object_ref` 技术黑话。
- **Issues**：缩略图删除角标去 `--action` 实底与字符 `×`；移除整理失败越界琥珀；Toast 切宿主队列（解决 `nowrap` 截断）；删图接 `molisReflow`、新建/完成接 `land / celebrate`；缺模型接 `host.returns.go`。
- **Risk**：静态 `mitigating / scheduled` 去旋转 `"running"`、删重复 `"项目风险"` 大标题、去 0 关联蓝横幅与双 `primary`、去 999px 描边签、接管原生 `datetime-local`、恢复标准舞台边距去套盒并切 `@container`、审查到达接 `molisCraft.ask`、裸字加载包 `.mw-loading`。
- **Work Brief**：修复 `14px`、`120ms / ease-out` 非标令牌、裸字加载包 `.mw-loading`、Toast 切宿主队列、翻转 2 处按钮反序、补弹层 `Escape` 焦点归还（双栏版式沿 `36A-6` 基线，切 `@container` 响应式）。
- **Workflows**：删除 `.mw-skeleton { animation: none }` 恢复 `250ms` 延迟、清除私造 `cubic-bezier` 与 5 处 `999px` 描边签及纯色圆点、修 `"workflows.page.title"` 裸键与 `"Started"` 按钮词性、清退 9 处越界琥珀、切统一五态自动保存与宿主 Toast、跑通接 `molisCraft.celebrate`。

### 3.3 `91B-3`：创作数据 5 + 收集知识 5 + 研发工具与创作台

- **统一列表—详情容器与对象标签合同迁移（`91-0c` 下游收口）**：`灵光`、`Cognia`、`Form`、`Dataset`、`PPT`、`Alchemist`、`Images` 与 `Jelly`（笔记与完整详情统一容器 + `accepts_objects: true`，日历列表补 `aria-multiselectable="true"` 与 APG 键盘多选，轻量日程保留轻弹层）全部迁入 `.mw-stage-list-detail`（`focus`）并补齐 `accepts_objects: true` 与 `recordRow`；`Shelf` 侧栏同步在本切片独占收口（接入 `.mw-stage-list-detail` 窄/宽自适应容器：`< 680px` 单栏推入、`≥ 680px` 宽侧栏支持可选折叠列表轨，补齐标准 `aria-multiselectable="true"` APG 键盘多选，配合 `91B-2` Goals 一并结清 `BL-plugin-open-record-own-lists`，并将共享样式表 `.shelf-*` 迁回 `plugins/native/shelf/src/styles.ts`）；`Pages` 与 `Git` 沿用 `91-0c` 已落稳的样板实现（`Pages` `focus` + APG `treegrid` + 批量条、`Git` `split` 去双目录）；清除本切片全部残留 `workbench.directory` 空桩与旧 pre-`36A-3` 死 CSS（`cognia`/`pages`），彻底结清 `BL-340`。
- **Pages**：收藏五角星去琥珀、报错改 `--red`、修英文 `"Imported / Replaced"`、补卡片 `<select>` 与接管 2 处原生日期、放开目录至 `960px`、编辑区 `--pages-gutter` 改 `clamp(24px, 6cqi, 64px)`、去色块 `:hover scale(1.12)` 与拖拽私造曲线、删除确认切危险红。
- **Form**：取消整页 `inert` 冻屏改走 `molisBusy`、消除双阳色与视图页签乱涂状态色、接管原生 `date`、离线填写页清旧靛蓝 `#5e6ad2`、全屏试填加 `Esc` 脏草稿二次保护、切统一五态自动保存与 `@container`、发布接 `celebrate`。
- **Dataset & PPT**：立即修复 `.dataset-note / .ppt-note` 错误/警告涂完成绿倒置事故；取消整页 `inert` 改 `molisBusy`、切统一五态自动保存（去 Dataset 常态绿标、补失败一键重试）；Dataset 去顶栏 `overflow-x: auto` 裁切菜单并消除四级宽度锯齿、日期走 `format.date` 与接管原生 `date`，粘性表头接纯 CSS `@property` + `animation-name` / `animation-timeline: scroll()` 滚动驱动接缝线，归档/禁用行迁至 `[data-dimmed]` 保行内操作控件可读（[决定 63](../post-anticorruption-roadmap/reference/decisions.md#decision-63) ②）；PPT `.ppt-workspace` 补 `margin-inline: auto` 居中、三栏切 `@container`、色块提至 `32/44px` 补内勾、放映图标改 `play`、清放映窗硬编码色。
- **Images**：删重复 `<h2>把想法变成图片</h2>`、替换 2 处 `<datalist>`、加载历史失败不与「还没有图片」矛盾、统一按钮高度、删除确认切危险红、补 `molisMediaZoom` 与 `molisCraft.land`。
- **Shelf**：删私读 `data-resolved-theme="dark"` 与 7 处 `!important` 抹焦点环；修空子文件永久卡死读取态并补多文件拖入逐项进度行与重试；删除 21 处私绘 SVG（修重绘丢文件夹图标）与字符按钮，`<span role="button">` 换真 `<button>` 提热区；翻转 2 处按钮反序并收敛 3 个同屏主按钮；`220ms` `.animate()` 换 `molisReflow`；接 `molisCopy` / `molisMediaZoom` / `return-trip`；并随本切片迁入 `.mw-stage-list-detail` 宽侧栏自适应与 `.shelf-*` 按需样式表。
- **灵光（Lingguang）**：拆 `.lingguang-note` 类名碰撞（表单内说明改为 `.lingguang-hint` 不再遮挡取消钮）；修复头脑风暴用户署名错显为 `"记下 / Save"`；目录放开 `960px`、`.lingguang-chat` 补 `margin: 0 auto` 与编辑器同轴居中并接 `molisFollow`；详情顶栏 10 按钮收敛至 `48px` 单行；首屏空态默认 `hidden`、原生 `<progress>` 换 `.mw-meter`、翻转 2 处按钮反序、丢弃切危险红、切统一五态自动保存。
- **Jelly**：确认窗 `<pre>JSON.stringify</pre>` 改自然语言摘要；清 9 处内联 `#hex` 映射至 `--mark-*` 并清退分类/优先级琥珀；撤独立 `48px` `.jelly-header`、定宽左栏 `240px`、`--surface-soft`、修 `.jelly-format-bar` `top: -28px` 为 `top: 0`、切 `@container`；接管原生 `time` 与 `<progress>`、删除切危险红、迁出 `calendar.ts` 硬编码中文、撤自造模型台与 `target="_blank"`、补勾选回滚与保存失败重试。
- **Cognia**：隐藏裸 `<input type="file" webkitdirectory>` 改设计系统按钮+拖放区；加载失败原位渲染 `.mw-empty--error` + 重试（不再永卡读取）；左栏 5 层压 1 层（常态隐模型条、领域管理入弹窗）并清 5 处 `!important`；4 处删除切危险红；`goForModel` 透传意图。
- **Alchemist**：修正 `.mw-checkbox` → `.mw-check`；脉搏卡片与回执关闭钮收敛单阳色；为 `awaiting-decision / awaiting-continuation` 补琥珀色与 `molisCraft.ask`；失败切 `.mw-empty--error`；可逆归档改 Undo Toast；右轨切 `@container`、研究流接 `molisFollow`、缺模型接 `host.returns.go`、修移动输入字号与 `44px` 热区。
- **Git / Diff**（原 `text-stats` 已随 `#2243` 退役）：Git 合并冲突未清零时禁顶部提交消双阳色、修正 `failed` 红/`pending` 琥珀、删侧栏重复 `head · upstream`；Diff 修错误 `"Sources"` 提示、补 3 组输入源切换器与统一/并排切换及 `molisCopy`、在 `plugin-sdk` 统一绑定 `[data-diff-unfold]` 展开、刷新改 `molisBusy`。
- **Plugin Builder**：废除深色白底失明的 `.as-dialog` 与炭黑 `.as-primary`，全面切回 `mw-*` 原语；按阶段收敛唯一主按钮并翻转全部 `ask()` 按钮序；彻底清除 `Jev`、`门禁 G1–G6`、`合同`、裸 `op.id` 与 HTTP `Bearer` 黑话；`.as-board` 改右侧流内底栏（零遮挡），`@container (max-width: 760px)` 切顶部「对话设计 / 实时预览」单视口分段切换；去 `translateY(-3px)`、6 套私有 `@keyframes`、8 处字符图标与 4 处 `!important`；答卷/就绪接 `ask / celebrate`。

---

## 4. 后续开发指引与插件创作台规范更新（`91-5`，在 `91B` 之前落定）

为确保后续 `38～89` 批与第三方／生成插件作者从第一天起遵循同一套视觉、空间与行为反馈底线，在 `91-1` 底座合并进 `batch/91` 后，由 `91-5` 一次性同步更新以下开发指引与创作台规范（**改 Skill 与 `agent-prompts.ts` 必跑 `pnpm studio:replay` 及隔离 Home `smoke`**）：

| 文档／规范文件 | 本批必须新增或修订的具体条目 |
| --- | --- |
| `DESIGN.md` | 补齐「窗格级 `@container plugin-stage` 三档断点（`≥960 / 680–959 / <680px`）」「四档标准居中版心（`680–720 / 760–880 / 960 / 1152px`）与两档主从左栏（`240 / 280px`）」「单行 `48px` 详情栏与禁止 `overflow-x: auto` 裁切」「行为反馈闭环（`molisBusy`、`host.showToast` 三档时长、五态自动保存、`molisCraft` 五原语触发时机与克制规则、乐观开关回滚）」与 `molisStreamText` v2 流式规范 |
| `docs/design/taste.md` | 补齐「一屏一阳色」「常态退隐（不刷绿签/蓝签）」「悬停给色调、按压才下沉」「可逆高频操作即时+Undo 优于阻塞确认框」审美准绳 |
| `packages/design-system/README.md` | 登记新增与升级原语（`window.molisBusy`、统一日期/时间渐进增强器、五态自动保存、`optimisticToggle`、`molisStreamText` v2、恒定 `20px` 状态环、`molisFollow` 微阻尼）及组件板 `/__ui/catalog` 标本索引 |
| `docs/system/DEVELOPMENT-REQUIREMENTS.md` | 在各 UI／插件层通用要求里写死：插件内禁止视口布局 `@media`、禁止原生 `date/time/confirm/alert/datalist/progress`、异步按钮必用 `molisBusy`、列表增删必用 `molisReflow`、复制必用 `molisCopy`、禁止拿译文字符串做逻辑判断 |
| `skills/molis-plugin-dev/SKILL.md`、`elements.md` | 增设「空间布局与容器查询」「行为反馈闭环」必读检查段，更新「禁止」清单（禁自造 Toast、禁整页 `inert` 冻屏、禁 `sparkles` 当插件身份标、禁私读 `data-resolved-theme`） |
| `skills/molis-plugin-dev/text-and-appearance.md` | 补充动作按钮祈使动词 vs 完成态过去分词对照（防 `"Imported / Completed / Started / Resumed"` 误绑）、删除确认必用具体危险动词禁泛词「确定」、禁止 CSS `content` 硬编码中文 |
| `skills/molis-plugin-dev/ui.md`、`ui.en.md` | 双语同步：主从舞台 `@container` 与四档版心用法、详情栏按钮上限、`host.showToast` / `host.confirm({ tone: "danger" })` / `window.molisBusy` / `molisCraft` 标准接入示例与「左取消、右主动作」铁律 |
| `skills/molis-plugin-dev/generated-design.md`／`.en.md`、`generated-experience.md`／`.en.md`、`generated-ui.md`／`.en.md`、`horizontal/plugin-studio/src/agent-prompts.ts` | 将四档版心、单阳色、常态退隐、无卡套卡、`250ms` 等待与行为反馈标准同步至插件创作台提示词与审美复查段，通过 `pnpm studio:replay` 与隔离 Home `smoke` 回归 |

---

## 5. 三层防回归自动化门禁收紧（`91B-4`）

按 `AGENTS.md` 门禁修改流程经用户确认后，在 `91B-4` 永久焊死三层守卫：
1. **静态精细度、布局与共享样式零插件名防回流门禁（`tests/soft-workbench-refinement.test.ts` + `scripts/gates/plugin-styles.mjs` + `tests/plugin-styles.test.ts`）**：将全量现役内置插件样式表（含全部 `plugins/native/*/src/*styles*.ts`、注册 `stylesheet` 与 `horizontal/plugin-studio/src/agent-studio.ts`、`form/src/fillpage.ts`、`inbox/src/ui.ts`、`pages/src/comment-side-view.ts` 等内联样式源）与 `packages/im-ui/src/styles.ts` 纳入扫描范围；新增插件内禁止视口布局 `@media (max-width/min-width)`（仅允许 `(pointer: coarse)` / `(hover: none)` / `(prefers-reduced-motion)`）守卫；新增列表—详情合同守卫（禁止外壳新增插件 ID 分流名单、禁止插件向 `workbench.directory` 返回非空面板、校验所有 `stage_layout.kind === "list-detail"` 且 `accepts_objects: true` 的插件均声明 `recordRow ?? searchRow`（对齐 `PTG-06`），并对本批新补齐的 `Coding`/`Workflows`/`Risk` 与 11 个插件直接声明 `recordRow`）；**按 `BL-b44-shared-styles-plugin-names`（[决定 65](../post-anticorruption-roadmap/reference/decisions.md#decision-65)）将 `tests/plugin-styles.test.ts:394` 扩展并接入 `scripts/gates/plugin-styles.mjs`（`pnpm plugin-styles:check`），对 `apps/workbench/src/styles/` 与 `packages/design-system/src/styles/` 全部 `.ts` 模块永久拦截具体插件类名与插件数据属性（显式不误伤非插件通用 HTML 表单类 `.form-actions`/`.form-error`/`.form-disclosure`），并实测下调首屏共享 CSS 预算**。
2. **视觉秩序与分屏几何门禁（`tests/visual-order.e2e.test.ts` + `tests/fixtures/order-audit.ts`）**：补齐漏检的 11 个高频表面（`risk / work-brief / shelf / sessions / materials / plugin-market / capabilities / im-ui` 及右侧面板视图）与 `MODE_PAGES` 深色/紧凑/390px 覆盖；将 `[role="button"]` 纳入热区与控件检查；新增 **`600px` 分屏窄窗格几何与逐层推进断言**（无横向裁切溢出、正文有效列宽 `≥ 280px`、无非法双滚动容器、`item` 标签零重复左栏）。
3. **行为反馈与回滚门禁（`tests/busy-feedback.e2e.test.ts` + `tests/save-failure.e2e.test.ts`）**：将漏测的 11 个现役表面（`risk / work-brief / cognia / alchemist / dataset / images / schedule / artifacts / sessions / diff / plugin-builder`，`text-stats` 已随 `#2243` 退役）补入 `250ms` 瞬闪采样；将断网保存失败回滚断言从 Shelf 扩展至 Todo、Jelly 与设置实时开关。

---

## 6. 验收标准

1. **UXP-01** `plugin-frame`、`side-view-document`、`home-plugin-page` 与 `im-ui` 均完整挂载 `MICRO_INTERACTION_CLIENT_SCRIPT` 及所需 `CRAFT_FINISH / REFLOW / COPY_FEEDBACK / STATE_RING` 脚本；全部 23 个现役内置插件内 `.mw-toggle-group` 具备弹簧滑块过渡、创建 `<dialog>` 响应 `⌘+Enter / Ctrl+Enter` 提交，且侧栏、IM 与所有 `mw-*` 控件具备统一的 `scale(.97)` 按压与 `craft-tick / craft-pop` 触感。
2. **UXP-02** 全局提供 `window.molisBusy(button, work)` 与统一宿主 `host.showToast(msg, opts)`（支持 `2.8s / 6.5s+悬停暂停 / role="alert"` 错误驻留与 `--helm-h` 智能避让），8 套分裂 Toast 全部收口；全仓 21 处原生 `date / time / datetime-local / month` 全部由统一渐进增强器接管，11 处 `window.confirm / alert`、`<datalist>`、可见原生 `file` 与 `<progress>` 全部清零。
3. **UXP-03** `packages/design-system/src/browser/copy-feedback.ts` 无硬编码中文默认值，全站绕过 `molisCopy` 的 5 处裸 `navigator.clipboard.writeText` 清零；全站 7 大编辑器落地统一五态自动保存模型（空闲静默不刷绿、超 `250ms` 保存中、成功 `2s` 淡隐、失败红字保留草稿并带就地重试）；`host.confirm` 支持 `tone: "danger"` 与具体动词，全站表单／确认弹窗严格「左取消、右主动作」。
4. **UXP-04** 生成插件共享渲染器实现每页平面最多 1 个 `mw-btn--primary` 且弹窗提交恒为 `primary`；清除 `.pc-count::before` 硬编码中文、`% 4` 轮转琥珀、目录行卡套卡、`:hover translateY(-1px)`、`"✓ "` 字符与 `sparkles` 回退身份标；市场卡片 `:not([hidden])` 按钮折行修复且 `960px` 双列等高。
5. **UXP-05** `.tab-pane-body` 与 `.tab-workspace-exclusive` 声明 `container: plugin-stage / inline-size`，全仓插件与舞台响应统一按 `≥960 / 680–959 / <680px` 三档 `@container` 切换；在 `1440px` 桌面二分屏（每窗格 `~680px`）与开右侧面板（`~540–600px`）下，所有主从双栏、三栏（PPT）与并排对比（Diff）自动折叠无挤压、无横向裁切溢出。
6. **UXP-06** 全产品收敛为四档居中标准版心（`680–720 / 760–880 / 960 / 1152px`）与两档 `--surface-soft` 主从左栏（`240 / 280px`），消除灵光同页左右跳轴、PPT 贴左、Dataset 四级锯齿、Goals `32px` 阶梯缩进、Feed `.mw-detail` 纸中套卡与全站多处 3～4 层套盒；`.plugin-stage-detail-bar` 锁死 `48px` 单行无 `overflow-x` 菜单裁切；Inbox 处置页脚下置于正文之后；Sessions/Cognia/Jelly 压缩多层顶栏并修 Jelly `top: -28px` 截断；Plugin Builder `.as-board` 不遮挡画布且窄窗单视口分段切换。
7. **UXP-07** 全仓清除四起色彩语义倒置（Dataset/PPT 错误涂绿、电脑面板 `--accent` 实心主按钮、灵光 `.lingguang-note` 悬浮遮挡与 Plugin Builder 深色白底弹窗），收回全部越界 `--amber`（仅用于「轮到你」）、清零常态无意义绿/蓝签与静止态误转 `"running"` 环，清零硬编码 `#hex` 孤岛与私读 `data-resolved-theme="dark"`，全仓手敲 Unicode 图标与 Shelf 21 处私绘 SVG 迁回 Lucide 图标库；落地 `html[data-window-active="false"]` 桌面失焦两级令牌降饱和（保留 `--amber` 审批辨识度），并将全站已归档/已处理/已停用行迁至 `[data-dimmed]` 令牌重定向以保持行内操作控件可读。
8. **UXP-08** 修复全仓所有 P0 级文案与功能断层：租户订阅表单与 Goals 解除关系不再输出 `"这句话暂时显示不了"`；清除 Goals／浏览器／电脑面板的中文译文分支判断；修复 `"Imported / Completed / Started / Resumed"` 动词时态错误与灵光发言人 `"记下"`；`rss / youtube` 补双语 `locales`；清零 Plugin Builder 的 `Jev / G1–G6 / 合同`、Jelly 裸 JSON 及全仓裸 UTC 时间切片；Artifacts/Sessions/Shelf/Cognia/Alchemist/Images 加载失败均可原地恢复重试、零白屏吞错或永卡加载态。
9. **UXP-09** 高频可逆操作（Inbox 标记已处理/忽略、Feed 忽略、Coding/Alchemist 归档、Goals 回收站恢复）取消多余阻塞确认，改为即时执行 + `6.5s` Undo Toast + `molisReflow`（Inbox 同步顺推下一条）；Goals 取消单击 `220ms` 延迟；Diff 与 Git 均支持 `[data-diff-unfold]` 展开；补齐缺模型/缺连接的 `host.returns.go` 往返与浮层 `Escape` 焦点归还；非紧急提示与首次引导走单槽 NUX 队列（同屏最多 1 条、对话页仅在底部视口出现）。
10. **UXP-10** `molisCraft` 五大轻动效（`land / carry / turn / ask / celebrate`）、`molisReflow` 与 `molisFollow` 按第 2.1、3 节清单在目标插件与外壳节点完成克制接线，全仓清除 6 处空转 `.is-arriving` 与全部违禁 `:hover` 上浮及私有非令牌 `.animate()`；粘性详情顶栏与 Dataset 粘性表头支持纯 CSS 滚动驱动接缝线渐进增强；所有轻动效尊重 `prefers-reduced-motion` 与 `data-craft-still`，首屏绝不误触发庆祝。
11. **UXP-11** 第 4 节所列全部开发指引与插件创作台 Skill（`DESIGN.md`、`docs/design/taste.md`、`packages/design-system/README.md`、`docs/system/DEVELOPMENT-REQUIREMENTS.md`、`skills/molis-plugin-dev/*.md` 中英文与 `horizontal/plugin-studio/src/agent-prompts.ts`）完成同步更新，`pnpm health:check` 文档引用门禁零报错，且 `pnpm studio:replay` 与隔离 Home `pnpm studio:replay smoke` 全部通过。
12. **UXP-12** 经用户确认门禁改动后，`tests/soft-workbench-refinement.test.ts` 覆盖全量现役内置插件 CSS 与 `IM_STYLES` 并拦住插件视口布局 `@media`；`tests/visual-order.e2e.test.ts` 与 `tests/fixtures/order-audit.ts` 覆盖全部新增 11 表面、`MODE_PAGES` 及 `600px` 分屏窄窗格零溢出断言。
13. **UXP-13** `tests/busy-feedback.e2e.test.ts` 扩覆盖全部 11 个新增现役表面通过 `250ms` 零瞬闪采样；`tests/save-failure.e2e.test.ts` 扩覆盖 Todo、Jelly 与设置实时开关断网回滚；页面单资源守住预算红线，`pnpm build`、`pnpm boundary:check`、`pnpm health:check` 与共享核心全量回归通过。
14. **UXP-14** `[人工]` 在一次性隔离 Home 中按浅/深色、中/英文、桌面全宽/二分屏/开侧栏/`390px` 窄屏逐板块走查入口、市场、侧栏、IM、创作与工作插件及生成插件，确认按钮触感、等待态、轻动效、Toast/Undo、分屏布局、统一列表—详情容器与标签组联动整体一致克制。
15. **UXP-15** 平台退役插件侧 `workbench.directory` 挂载与 `DIRECT_WORK_SURFACE_IDS` / `OWN_DIRECTORY_SURFACES` 外壳派生分流表，清除 `14` 处插件纯空桩、`feed`/`goals` 空 `directory`、`git` 死空左栏、`feed` `sources` 别名、平台 `artifacts` 多余声明与 `7` 处外壳插件名分支（`plugin-stage.ts`、`tab-workspace.ts`、`immersive-navigation.ts`、`placement.ts`、`immersive-shell.ts`）；全局左侧导航仅服务独占设置覆盖层（`[data-shell-cover-nav]`），全部带列表插件（内置、生成、第三方）统一使用窗格内标准舞台容器 `.mw-stage-list-detail`（`[data-stage-list-detail]`，不与设置页既有 `.mw-list-detail` 冲突）与 Manifest `stage_layout` 声明（零外壳插件 ID 分支），`Feed` 恢复正常左栏且无 `36A-3` CSS 挖空回归。
16. **UXP-16** `.mw-stage-list-detail` 在所有窗格按 `@container plugin-stage` 三档断点自适应：舒展档（`≥ 960px`）下 `focus` 模式默认详情独占且可选一键展开/收起左轨、`split` 模式并排可拖拽（`220–340px`）且支持桌面一键折叠（`⌘\`）；紧凑/二分屏档（`680–959px`）下标准轨缩 `220px`、富摘要轨自动推入单栏、第三栏附属轨收抽屉；单栏推入档（`< 680px`）与 `focus` 展开态实现 `L0 → L1` 四路返回归一（`‹ 返回` / `Esc` / 顶栏后退 / 点已激活组头标签），退回时原样恢复 `scrollTop`、筛选词与焦点行。
17. **UXP-17** 全量列表插件/视图统一补齐 `accepts_objects: true` 与 `recordRow`（补齐 `Todo`/`Issues`/`Cognia`/`Forms`/`Dataset`/`PPT`/`Schedule`/`Alchemist`/`Images`/`Jelly`/`Sessions`、修补 `Coding`/`Workflows`/`Risk`、移除 `Work Brief` 误标；守门禁核验 `recordRow ?? searchRow` 对齐 `PTG-06`）；独立 `kind: "item"` 条目标签一律纯净单页默认隐藏主列表轨；母页普通点击原地打开不建新标签、外部入口与 `item` 标签内点击在插件自动组内打开/聚焦去重；非多选列表 `⌘/Ctrl`+点击与全部列表鼠标中键调用 `openBehind` 后台组内新开标签；沙箱 iframe 404 回传 `record-gone` 标灰失效标签（结清 `BL-record-gone-from-framed-plugins`），分屏内关插件组支持 6 秒撤销与 `⌘⇧T`。
18. **UXP-18** 全部多选列表（`Pages`、`灵光`、`Todo`、`Cognia`、`Jelly` 日历列表、`Shelf`、项目知识库）统一声明 `aria-multiselectable="true"`：`⌘/Ctrl`+点击归列表多选不开标签、鼠标中键仍后台开标签；全站多选列表满足 APG 单 `Tab` 停留位、`↑/↓`、`Space`、`Shift+↑/↓`、`Shift+点击`、`⌘/Ctrl+A`、`Esc` 与统一 `.mw-selection-bar`（`Pages` 文件夹分组迁标准 APG `treegrid`），结清 `BL-340` 与 `BL-plugin-open-record-own-lists`，并推进收口 `BL-shell-goals-leftovers` 中外壳导航相关项（④ `#goal-tree-pane`、⑤ `data-immersive-goal-tools` 及样式、① `placement.ts:493-500`；其余项留原 Backlog 续跟）。
19. **UXP-19**（`BL-b44-shared-styles-plugin-names`，[决定 65](../post-anticorruption-roadmap/reference/decisions.md#decision-65)）`apps/workbench/src/styles/`（`9` 模块）与 `packages/design-system/src/styles/`（`13` 模块）共 `22` 个共享样式模块（`250+` 行）完成插件专属类名与数据属性清零：共用写法统一更名 `mw-*`／平台中性属性（`.mw-collection-*`、`.mw-status`、`[data-mw-inline-search]`、`[data-mw-record-row]`、`[data-stage-action="danger"]`、`.capabilities-*`、`.mw-progress-track*` 等；非插件通用表单类 `.form-actions`/`.form-error`/`.form-disclosure` 保持通用或并入 `.mw-disclosure`，不搬进 `form` 插件），Goals／Inbox／Shelf／Coding／Git／Form 等纯插件规则迁回各自插件按需样式表；首屏共享 CSS（`molis-work-workbench.css`、`molis-work-settings.css`、`molis-work-arrival.css`、`molis-work-plugin-base.css` `< 80 KB` 等）实测字节净下降并按只收紧原则更新预算；`scripts/gates/plugin-styles.mjs`（`pnpm plugin-styles:check`）与 `tests/plugin-styles.test.ts` 永久焊死「平台共享样式模块零具体插件类名与数据属性」防回流门禁，完成后删除 `specs/backlog/BL-b44-shared-styles-plugin-names.md` 并在 `docs/backlog-removed.md` 登记。

---

## 7. 决策记录

- **2026-11-18（合并进第 91 批、双段拆分、开发指引与三层门禁，用户定，[路线书决定 55](../post-anticorruption-roadmap/reference/decisions.md#decision-55)）**：
  1. 将全产品界面打磨、空间与布局架构优化、用户行为反馈全链路优化及后续开发指引更新，与[对话与执行流式体验](../conversation-execution-ui/spec.md)合并为统一体验专项，在路线书中排为紧邻双段：**[第 91 批（91A）](../post-anticorruption-roadmap/reference/batches/91.md)**（1 个 PR，先落底座/流式/全部后续开发指引）→ **[第 91B 批](../post-anticorruption-roadmap/reference/batches/91b.md)**（全产品表面收口 + 三层门禁焊死，按正交模块可拆并行 PR 或 1 个 PR）；两段均以 `35-2 / 36A / 37-2` 为前置，**不等 `38～89`**。
  2. 显式剔除已定随 [44-7](../post-anticorruption-roadmap/reference/batches/44.md#batch-44-item-7) 删除的桌面菜单栏胶囊，避免与 [36A](../post-anticorruption-roadmap/reference/batches/36a.md) 和 [56-1／56-2](../post-anticorruption-roadmap/reference/batches/56.md) 撞车。
  3. 确认将全部后续开发指引更新（`91-5`）与三层防回归门禁收紧（`91B-4`）纳入正式交付与验收标准（`UXP-11`～`UXP-13`）。
- **2026-11-20（前置 5 项真 P0 至 101 批与 `91B-4` 确定性门禁校准，[路线书决定 57](../post-anticorruption-roadmap/reference/decisions.md#decision-57) ④、[决定 58](../post-anticorruption-roadmap/reference/decisions.md#decision-58)）**：
  1. 原属 `91B` 的 5 个真 P0 功能故障（租户订阅 `"这句话暂时显示不了"`、Dataset/PPT 报错涂绿、Shelf/Cognia 永卡、Plugin Builder 深色白底弹窗、Artifacts/Sessions 首屏吞错）及 4 个文档壳微交互补挂由 **[第 101 批](../post-anticorruption-roadmap/reference/batches/101.md)** 提前抢修止血，`91B` 不再重复修补，仅补齐余下表面收口。
  2. `91B-4` 门禁收紧改为确定性底线守卫：`tests/soft-workbench-refinement.test.ts` 按规范化后的 CSS 规则比对（不写空格敏感整段正则），`tests/visual-order.e2e.test.ts` 复用单 Chrome 实例、按就绪标记/`document.fonts.ready`/两帧布局一次读取，不加超过 `500ms` 固定等待，也不拉长既有 20 分钟时限。
- **2026-11-22（对照 `open-claude-ui` 补齐 4 项壳层/列表/引导精修，用户定，[路线书决定 63](../post-anticorruption-roadmap/reference/decisions.md#decision-63) ②）**：在 `91B-1`～`91B-3` 补入桌面端 `[data-window-active="false"]` 两级令牌降饱和（保留 `--amber` 审批辨识度）、`[data-dimmed]` 暗淡行令牌重定向（行内交互控件保持主色可读）、`.plugin-stage-detail-bar` 与 Dataset 粘性表头纯 CSS 滚动驱动接缝线渐进增强，以及首次引导/非紧急提示单槽 NUX 队列（含对话页底部视口闸门）。
- **2026-11-22（统一「列表—详情」标准容器与顶部标签页联动架构，用户定，[路线书决定 64](../post-anticorruption-roadmap/reference/decisions.md#decision-64)）**：在第 91 批新增第三个零阻塞前置底座段 **`91-0c`**（不等 `37-2`），统一落地 `.mw-stage-list-detail`（`[data-stage-list-detail]`，显式避让设置页 `.mw-list-detail`）标准容器与 Manifest `stage_layout`（`focus`/`split` 双档）、退役插件侧 `workbench.directory` 与 `DIRECT_WORK_SURFACE_IDS`/`OWN_DIRECTORY_SURFACES`、清零外壳插件名分支（推进收口 `BL-shell-goals-leftovers` 中外壳导航项）、确立独立 `kind: "item"` 条目标签纯净单页铁律与三类点击/APG 键盘多选统一规则，再由 `91-4`（Coding 含 `recordRow`）与 `91B-1`～`91B-3`（Shelf 归 `91B-3` 独占）一次迁入全量表面、由 `91B-4` 焊死防回归门禁（验收新增 `UXP-15`～`UXP-18`）。
- **2026-11-22（`BL-b44-shared-styles-plugin-names` 正式编入第 91／91B 批，用户定，[路线书决定 65](../post-anticorruption-roadmap/reference/decisions.md#decision-65)）**：将 `apps/workbench/src/styles/`（`9` 模块）与 `packages/design-system/src/styles/`（`13` 模块）共 `22` 个共享样式模块（`250+` 行）具体插件类名与数据属性按四段切片正式编入第 91／91B 批（`91-0c` 公共 `mw-*` 更名与属性泛化 + Git 迁出 → `91-4` Coding 迁出 + `91B-1`～`91B-3` 按归属迁回 Goals/Inbox/Shelf/Form 等插件按需样式表，显式保留非插件通用表单类 `.form-disclosure` → `91B-4` 首屏共享 CSS 字节压降与 `scripts/gates/plugin-styles.mjs` + `tests/plugin-styles.test.ts` 全量零插件名绝对防回流门禁），验收新增 **UXP-19**。
