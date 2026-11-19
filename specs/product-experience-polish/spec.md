# 全产品界面、空间布局与行为反馈深度打磨（含开发指引收口）

状态：需求已整理，待实施（2026-11-18；需求维护：Antigravity，实现：第 91／91B 批主会话）。与[对话与执行流式体验](../conversation-execution-ui/spec.md)合并为统一体验专项，排期为路线书[第 91 批（第一段 91A）](../post-anticorruption-roadmap/reference/batches/91.md)与[第 91B 批（第二段 91B）](../post-anticorruption-roadmap/reference/batches/91b.md)（[路线书决定 55](../post-anticorruption-roadmap/reference/decisions.md#decision-55)）。

- **档位与分类**（[开发流程 §1.1、§1.2](../post-anticorruption-roadmap/reference/development-workflow.md#1-分档分类与决策)）：大需求；体验与效果（视觉工艺、文案状态、空间布局、行为反馈、轻动效）、横向能力（Design System 原语与控件板、Plugin Frame 客户端脚本、统一日期/等待/Toast/自动保存/确认桥、生成插件渲染器、开发指引与创作台 Skill）、产品线（全产品入口与 23 个内置插件、4 个官方集成、IM、侧栏、Artifacts、Sessions）。
- **决策标记**：已定方向（用户 2026-11-18 确认[决定 55](../post-anticorruption-roadmap/reference/decisions.md#decision-55)）——采用 `91（91A） + 91B` 双段推进，剔除 `44-7` 待删的桌面胶囊，同步更新后续开发指引与创作台 Skill，并在 `91B-4` 收紧三层自动化门禁。仍要决策：① `91-1` 新增统一日期/时间渐进增强器、宿主 Toast、五态自动保存与 `molisBusy` 若引入组件板外新控件形态，按开发流程第 5 节先在 `/__ui/catalog` 出样过 D 轨合审；② `91B-4` 改动门禁脚本与阈值前按 `AGENTS.md` 门禁流程复核清单；③ `UXP-14` 本人实物走查。其余直接做。
- **相邻的线**：承接 [36A](../post-anticorruption-roadmap/reference/batches/36a.md)（底栏第十三版壳层、首页「项目的第一页」、Coding 前后半、设置页二段、动效曲线收口）与 [conversation-execution-ui](../conversation-execution-ui/spec.md)（`91-1`～`91-4` 流式内核）；与 [44-7](../post-anticorruption-roadmap/reference/batches/44.md#batch-44-item-7)（删除桌面胶囊）和 [56-1／56-2](../post-anticorruption-roadmap/reference/batches/56.md)（通知恢复页与切换后新入口复核）严格不重叠；`91-5` 落定的开发指引与创作台规范直接服务后续 `38～89` 批及所有新插件／生成插件。
- **预警触发条件**（开发流程 §6）：① 页面单资源体积一次增长超 `10 KB` 或新增页面资源（红线，先问用户）；② `skills/molis-plugin-dev/` 或 `plugins/native/plugin-builder/src/agent-prompts.ts` 变动必须跑通 `pnpm studio:replay` 与隔离 Home `smoke`；③ 任一门禁规则放宽或新增豁免。

---

## 1. 目标与边界分工

基于 `origin/main`（`f5efe316a2`，已含 `#2110` P0 急救、`#2120` 词包治理、`#2127` 设置页 P5 第一段、`#2132` 决定 53、`#2134` 助理代码重绘与 `#2135` 第 91 批立项）的全仓 38 个产品表面深度走查，Molis Work 已具备扎实的 Soft Workbench 设计底座，但存在三类跨表面系统性体验债：
1. **组件与语义孤岛**：生成插件渲染器、多处内置插件与边缘外壳尚未统一消费 `mw-*` 原语，存在加载失败白屏吞错、拿译文做分支判断、一屏多阳色、不可逆删除误用正向墨蓝、按钮左右反序、色彩语义倒置、琥珀色被稀释、21 处原生日期/时间与 11 处阻塞 `window.confirm / alert` 裸露、手敲字符图标与私绘 SVG 等问题。
2. **空间与响应式布局断层**：分屏窗格 `.tab-pane-body` 未声明容器查询，16 个页面与插件仍绑窗口 `@media` 导致桌面二分屏或开右侧栏时 `540～680px` 窄窗格双栏挤压；主从列宽与底色分裂并存在「纸中套卡 / 卡套卡」；全仓散落 12 种野生版心宽度甚至同页左右跳轴；首屏多层顶栏堆叠「头重脚轻」。
3. **用户行为反馈闭环缺口**：`MICRO_INTERACTION_CLIENT_SCRIPT` 在全平台插件 iframe、侧栏、Home 插件页与 IM 漏挂（导致 24 插件分段滑块与 `⌘+Enter` 弹窗提交失效）；侧栏/IM 不在 `${PAGES}` 作用域导致按压弹簧与勾选绘制脱落；缺少统一异步按钮等待助手 `window.molisBusy` 造成 21 插件未走 `data-loading`、整页 `inert` 冻屏或零延迟瞬闪；`molisCraft` 五大轻动效全仓仅 4 处真实调用；8 套 Toast 与 7 套自动保存各自为政；`copy-feedback.ts` 默认文案硬编码中文。

### 与既有／在途批次的精确边界（零重复、防撞车）

| 既有／在途批次 | 归其负责（本需求不重做） | 归本需求负责（`91A` + `91B`） |
| --- | --- | --- |
| **[36A](../post-anticorruption-roadmap/reference/batches/36a.md)**（决定 52／53） | 顶部方案 C、第十三版底栏 `helm.html` 与对话／信息栏、Coding 前后半主体、设置页 P5 二段（10 页主体）、首页「项目的第一页」（含 Work Brief 甲方案双栏）、`36A-7` 五处散落曲线收口 | 底座 `@container`、四档版心令牌、`molisBusy`、统一 Toast/自动保存/日期增强器、Coding 剩余微瑕（硬编码中文、`mw-button` 拼写、归档改 Undo、越界琥珀/胶囊）与全部未覆盖的 23 插件、4 集成及外壳伴随表面 |
| **[44-7](../post-anticorruption-roadmap/reference/batches/44.md#batch-44-item-7)**（决定 42） | 删除桌面菜单栏胶囊（`apps/desktop/src/capsule-shell.ts`） | **显式剔除桌面胶囊打磨**，不投入重复工时 |
| **[56-1／56-2](../post-anticorruption-roadmap/reference/batches/56.md)** | Attention 唤醒/角标/系统通知、插件通知恢复页（`PF-A09`）与 16 切换后新入口的 `audit-ui-copy` 复核 | 其余 23 插件、4 官方集成、生成插件渲染器与外壳已有入口的文案/双语硬编码清零、按钮词性修补与插件市场 0 条待核对常态隐藏 |
| **[conversation-execution-ui](../conversation-execution-ui/spec.md)**（`91-1`～`91-4`） | 个人助理与 Coding 的单连接 SSE、流式吐字平滑引擎、恒定 `20px` 状态环、200 轮零跳变回滚、Agent Host／Prologue 热路径 | 共用 `91-1` 共享核心与 D 轨评审窗口一次落定全站体验底座，在 `91-5` 统一沉淀开发指引，在 `91B` 收口全产品表面与三层门禁 |

---

## 2. 平台体验底座规格（并入 `91-1`）

### 2.1 行为反馈底座（0ms 按下 → 250ms 静默 → 原位等待 → 回执／回滚）

1. **补载微交互与轻动效运行时脚本、下沉触觉原语**：
   - 在 `apps/workbench/src/plugin-frame.ts`、`apps/workbench/src/side-view-document.ts`、`apps/workbench/src/home-plugin-page.ts` 与 `packages/im-ui/src/client.ts` 全量补齐 `MICRO_INTERACTION_CLIENT_SCRIPT`（恢复全部 24 插件的 Rubber Segment 分段滑块与 `<dialog>` `⌘+Enter` 快捷提交），并为侧栏、Home 插件页与 IM 补齐缺失的 `CRAFT_FINISH_CLIENT_SCRIPT`、`REFLOW_CLIENT_SCRIPT`、`COPY_FEEDBACK_CLIENT_SCRIPT` 与 `STATE_RING_CLIENT_SCRIPT`。
   - 将按钮 `scale(.97)` 弹簧按压、复选框 `scale(.86)` + `craft-tick`、单选框 `craft-pop`、开关拉宽弹性与输入框雾蓝焦点光晕从 `${PAGES}` 窄选择器下沉至共享原语层（`packages/design-system/src/styles/buttons.ts`、`primitives.ts`），同时为 `side-view-document.ts` 等补齐语义页面类，使全产品所有 `mw-*` 控件触感一致。
2. **统一异步按钮繁忙助手 `window.molisBusy(button, work, options?)`**：
   - 自动加防连点锁、设置 `data-loading` 与 `aria-busy`、自动插拔 `.mw-spinner`（严格遵守 `DESIGN.md` `250ms` `mw-loading-in / mw-loading-out` 延迟，有图标时原位等宽替换不抖动），在弹窗内支持拦截 `Esc` 关闭并在 `finally` 绝对释放；彻底淘汰手写 `button.disabled = true` 灰死僵住、整页 `workspace.inert = true` 无声冻屏及 `Diff / Text Stats` 绕开 `250ms` 的双图标瞬闪。
3. **统一宿主 Toast 契约（收拢 8 套分裂实现）**：
   - 扩展 `host.showToast(message, options?)` 至唯一宿主 `.mw-toast` 队列（继承 `placement.ts` 控件避让逻辑，底距统一 `calc(var(--helm-h) + 14px)`），淘汰 `settings-plugins`、`account-menu`、`issues`、`workflows`、`work-brief` 与灵光 `.lingguang-note` 等各自独立实现；
   - 三档规范时长与无障碍：纯确认 `2800ms`（`role="status"`）、含撤销或后续动作 `6500ms`（悬停或聚焦暂停倒计时）、错误态 `role="alert"` + 单次 `mw-toast-nudge` 轻颤且不因单行 `nowrap` 截断；每次触发必清前序计时器。
4. **统一五态自动保存模型与复制／回滚原语**：
   - 在 `packages/plugin-sdk` 提供统一自动保存状态渲染：`idle`（静默隐退，常态不刷绿也不占位）→ `dirty`（中性灰「未保存」）→ `saving`（超 `250ms` 显微环「保存中…」）→ `saved`（轻闪 `640ms` 后 `2s` 淡回静默）→ `failed`（红色常驻 + 保留草稿 + 就地 `mw-btn--link`「重试」）。
   - 修复 `packages/design-system/src/browser/copy-feedback.ts` 硬编码中文默认值 `"已复制" / "复制失败"`，改为经 `globalThis.t` 读取双语键；提供 `optimisticToggle` 乐观开关失败回滚助手（失败自动弹回原值 + 解除禁用 + 区块内就地 `role="alert"`）。
5. **共享控件与生成插件渲染器收口**：
   - **生成插件共享渲染器（`packages/design-system/src/plugin-component-*.ts`）**：解耦页面 `opener` 与模态窗 `submit` 的阳色绑定（确保每页平面最多 1 个 `mw-btn--primary`、每个独立弹窗内正向提交恒为 `primary`）；清除 `.pc-count::before` 硬编码中文 `"共 X 条"`；废除 `TONES[index % 4]` 轮转琥珀染色；拆 `.pc-directory>.pc-record` 卡套卡与行级雾蓝底；删除 `:hover translateY(-1px)` 与 `"✓ "` 字符；未知插件回退图标由 `sparkles` 改为 `puzzle`；首载骨架守 `250ms` 延迟。
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
   - 拆除 `Feed` `.feed-detail` 阴影圆角二层白卡壳与多处 3～4 层套盒（生成插件目录行、Todo、Risk、设置子页、逐项审阅栏），以留白与单根分割线建层。
3. **四档标准居中版心契约（淘汰 12 种野生宽度）**：
   - `--measure-reading: 680px ~ 720px`（Pages 正文、灵光编辑与对话同轴居中、Feed/Inbox 正文、Jelly 笔记、Coding 对话）；
   - `--measure-form: 760px ~ 880px`（设置全集 `760px`、Form 编辑器、Goals 文档 `880px` 齐头居中去 `32px` 阶梯缩进、首页与 Work Brief `640+24+216=880px`）；
   - `--measure-stage: 960px`（全部对象目录含 Pages/灵光、插件市场等高双列卡片）；
   - `--measure-wide: 1152px`（Dataset 头部与表格同宽对齐、PPT `.ppt-workspace` 居中、Goals 画布/看板、Workflows 链）。
   - **同轴铁律**：同一纵向滚动流内所有区块共享同一中心轴与起止线；`.plugin-stage-detail-bar` 严禁设 `overflow-x: auto`，单行 `48px` 封顶（返回 + 标题 + 最多 1 主 1 次 + `···` 更多菜单）。

---

## 3. 全产品表面收口清单（归属 `91B-1`～`91B-3`）

### 3.1 `91B-1`：入口、引导、账号、市场、侧栏四视图、IM、Artifacts 与 Sessions

- **到达／选择／升级与首次引导**：移除 `arrival.ts` 私读 `data-resolved-theme="dark"` 与 `999px` 雾蓝完成签；`upgrade-opening.ts` 补 `appearanceHead` 与本地化 `<title>`；`context-onboarding.ts` 改调 `molisWorkPreferences?.setTheme`、连接报错改红色、补 `250ms` 加载静默并把 `1600ms linear` `.animate()` 换 `molisCraft.turn`；无项目/错跑列表守单主按钮，窄屏触控钮提至 `44px`。
- **账号、登录与租户席位**：修复 `account-subscription-form.ts` 动态套餐名误入 `t.text()` 渲染 `"这句话暂时显示不了"` 的严重 Bug 并隐藏 `seatTypeId`；清零 8 处 `window.confirm`、7 处错挂 `mw-input` 的 `<select>` 与 2 处原生 `datetime-local`；废除 `account-menu.ts` 9 处硬编码 `#hex` 与被底栏压住的 `bottom: 28px` 浮条（切宿主 Toast）；翻转全部表单底栏为「左取消、右主动作」。
- **插件市场与详情**：市场扩至 `960px` 等高双列、恢复按钮标准边框、0 条待核对通知常态隐藏、`settings-plugins.ts` 用人话标题替机器码并切宿主 Toast 与危险红卸载钮、安装完成接 `molisCraft.land`。
- **右侧面板四视图与终端**：电脑面板删除 `--accent`（`#4c8dff`）实心主按钮与 10 处硬编码色；资料面板修英文提交钮 `"Imported"` → `"Import"`、拆 6 种全琥珀文件状态、把浏览器/电脑审批条设为真正的 `--amber-soft` 并接 `molisCraft.ask`；翻转 4 处按钮反序、修侧栏拖入高亮错绑隐藏弹窗 Bug、二进制文件补系统打开、图片挂 `molisMediaZoom`、字符 `×` 换图标、分割条补 `4px` 阈值与 `Escape`。
- **IM 讨论**：注入 `PRESENTATION_FORM_STYLES`、`mw-dialog / mw-menu / mw-status`、`STATE_RING / MICRO_INTERACTION / CRAFT_FINISH` 脚本并收窄 `svg { width: 20px }` 根治对象引用卡破相；未读话题补 `sr-only` 与 `600` 字重；发送钮独占唯一 `--action`；嵌入侧栏去重复大标题与混排 `Thread`，草稿恢复回填对象标题。
- **Artifacts 与 Sessions**：修复两处首屏加载失败白屏吞错（补 `.mw-empty--error` + 重试）；Artifacts 隐藏常态绿色「可用」、归档分组改中性灰、人话替换反向域名 ID 与 `Schema`、补 `molisCopy` 与 `molisMediaZoom`；Sessions 左栏切 `280px` `--surface-soft`、数据源改按需弹层释放 `240px` 首屏高度、4 处错挂 `mw-input` 的 `<select>` 修正为 `mw-select`、3 处裸剪贴板切 `molisCopy`、悬停改 `130ms` 并切 `@container`。
- **全局搜索 `⌘K` 与标签拖拽**：搜索命中高亮 `#f5c542` 改 `--accent` 浅洗、范围切 `mw-toggle-group`；`tab-drag-slot.ts` `.animate([{ width }])` 改 FLIP `transform` + `--dur-move / --ease-quint`。

### 3.2 `91B-2`：工作主干 9 插件 + 4 个官方订阅源集成

- **Goals**：清除 2 处拿中文 `"请求决定"` 做分支判断的逻辑；修复解除关系 `t.text()` 乱码；静态 `open` 投影去旋转 `"running"`；提案「退回修正」补 `.mw-btn`、收敛一屏多阳色；画布/看板取消单击 `220ms` 延迟；可逆「回收站恢复」取消强制填理由弹窗改即时+Undo；列表主从切 `@container goal-board`、文档收至 `880px` 齐头去 `32px` 阶梯缩进并压缩顶部套盒、补 15 处 `mw-select`。
- **Inbox**：将 `.inbox-reference-footer` 从正文上方下移为独立页脚，正文锁定 `680px` 居中；修复投影与列表状态冲突及忽略钮染墨蓝 Bug；「标记已处理 / 忽略」改即时生效 + `6.5s` Undo Toast + `molisReflow` + 自动推进下一条未处理项。
- **Feed + 4 个官方集成（`rss / gmail / github / youtube`）**：为 `rss` 与 `youtube` 补完整中英 `locales`，4 集成 `manifest.json` 补 `icon`；关闭行严格仅展示来源与标题（去掉常驻摘要与「没有附加摘要」），点开后同步更新 `<svg class="mw-ring">`；拆 `.feed-detail` 二层阴影白卡收至 `680px` 阅读版心；搜索补防抖、忽略改 Undo Toast + `molisReflow`、去左栏重复 `<h1>`、清退 11 处裸 `<select>`、修英文断句 `"Every day at"` 与开发自证语。
- **Todo**：接管 7 处原生日期框；去「重要 / 今天截止」的越界琥珀、删除 999px 胶囊与日期重复副标题；删除确认切危险红；勾选完成补 `optimisticToggle` 失败回滚、`molisReflow` 与 `molisCraft.celebrate`；拆收集箱卡套卡并切 `@container`。
- **Schedule**：待机「已启用」退隐中性、修英文按钮 `"Resumed"` → `"Resume"`、首屏补唯一阳色入口、接管原生 `time`、日历翻月接 `molisCraft.turn`、缺模型接 `host.returns.go`、去 `capability_id / object_ref` 技术黑话。
- **Issues**：缩略图删除角标去 `--action` 实底与字符 `×`；移除整理失败越界琥珀；Toast 切宿主队列（解决 `nowrap` 截断）；删图接 `molisReflow`、新建/完成接 `land / celebrate`；缺模型接 `host.returns.go`。
- **Risk**：静态 `mitigating / scheduled` 去旋转 `"running"`、删重复 `"项目风险"` 大标题、去 0 关联蓝横幅与双 `primary`、去 999px 描边签、接管原生 `datetime-local`、恢复标准舞台边距去套盒并切 `@container`、审查到达接 `molisCraft.ask`、裸字加载包 `.mw-loading`。
- **Work Brief**：修复 `14px`、`120ms / ease-out` 非标令牌、裸字加载包 `.mw-loading`、Toast 切宿主队列、翻转 2 处按钮反序、补弹层 `Escape` 焦点归还（双栏版式沿 `36A-6` 基线，切 `@container` 响应式）。
- **Workflows**：删除 `.mw-skeleton { animation: none }` 恢复 `250ms` 延迟、清除私造 `cubic-bezier` 与 5 处 `999px` 描边签及纯色圆点、修 `"workflows.page.title"` 裸键与 `"Started"` 按钮词性、清退 9 处越界琥珀、切统一五态自动保存与宿主 Toast、跑通接 `molisCraft.celebrate`。

### 3.3 `91B-3`：创作数据 5 + 收集知识 5 + 研发工具与创作台

- **Pages**：收藏五角星去琥珀、报错改 `--red`、修英文 `"Imported / Replaced"`、补卡片 `<select>` 与接管 2 处原生日期、放开目录至 `960px`、编辑区 `--pages-gutter` 改 `clamp(24px, 6cqi, 64px)`、去色块 `:hover scale(1.12)` 与拖拽私造曲线、删除确认切危险红。
- **Form**：取消整页 `inert` 冻屏改走 `molisBusy`、消除双阳色与视图页签乱涂状态色、接管原生 `date`、离线填写页清旧靛蓝 `#5e6ad2`、全屏试填加 `Esc` 脏草稿二次保护、切统一五态自动保存与 `@container`、发布接 `celebrate`。
- **Dataset & PPT**：立即修复 `.dataset-note / .ppt-note` 错误/警告涂完成绿倒置事故；取消整页 `inert` 改 `molisBusy`、切统一五态自动保存（去 Dataset 常态绿标、补失败一键重试）；Dataset 去顶栏 `overflow-x: auto` 裁切菜单并消除四级宽度锯齿、日期走 `format.date` 与接管原生 `date`；PPT `.ppt-workspace` 补 `margin-inline: auto` 居中、三栏切 `@container`、色块提至 `32/44px` 补内勾、放映图标改 `play`、清放映窗硬编码色。
- **Images**：删重复 `<h2>把想法变成图片</h2>`、替换 2 处 `<datalist>`、加载历史失败不与「还没有图片」矛盾、统一按钮高度、删除确认切危险红、补 `molisMediaZoom` 与 `molisCraft.land`。
- **Shelf**：删私读 `data-resolved-theme="dark"` 与 7 处 `!important` 抹焦点环；修空子文件永久卡死读取态并补多文件拖入逐项进度行与重试；删除 21 处私绘 SVG（修重绘丢文件夹图标）与字符按钮，`<span role="button">` 换真 `<button>` 提热区；翻转 2 处按钮反序并收敛 3 个同屏主按钮；`220ms` `.animate()` 换 `molisReflow`；接 `molisCopy` / `molisMediaZoom` / `return-trip`。
- **灵光（Lingguang）**：拆 `.lingguang-note` 类名碰撞（表单内说明改为 `.lingguang-hint` 不再遮挡取消钮）；修复头脑风暴用户署名错显为 `"记下 / Save"`；目录放开 `960px`、`.lingguang-chat` 补 `margin: 0 auto` 与编辑器同轴居中并接 `molisFollow`；详情顶栏 10 按钮收敛至 `48px` 单行；首屏空态默认 `hidden`、原生 `<progress>` 换 `.mw-meter`、翻转 2 处按钮反序、丢弃切危险红、切统一五态自动保存。
- **Jelly**：确认窗 `<pre>JSON.stringify</pre>` 改自然语言摘要；清 9 处内联 `#hex` 映射至 `--mark-*` 并清退分类/优先级琥珀；撤独立 `48px` `.jelly-header`、定宽左栏 `240px`、`--surface-soft`、修 `.jelly-format-bar` `top: -28px` 为 `top: 0`、切 `@container`；接管原生 `time` 与 `<progress>`、删除切危险红、迁出 `calendar.ts` 硬编码中文、撤自造模型台与 `target="_blank"`、补勾选回滚与保存失败重试。
- **Cognia**：隐藏裸 `<input type="file" webkitdirectory>` 改设计系统按钮+拖放区；加载失败原位渲染 `.mw-empty--error` + 重试（不再永卡读取）；左栏 5 层压 1 层（常态隐模型条、领域管理入弹窗）并清 5 处 `!important`；4 处删除切危险红；`goForModel` 透传意图。
- **Alchemist**：修正 `.mw-checkbox` → `.mw-check`；脉搏卡片与回执关闭钮收敛单阳色；为 `awaiting-decision / awaiting-continuation` 补琥珀色与 `molisCraft.ask`；失败切 `.mw-empty--error`；可逆归档改 Undo Toast；右轨切 `@container`、研究流接 `molisFollow`、缺模型接 `host.returns.go`、修移动输入字号与 `44px` 热区。
- **Git / Diff / Text Stats**：Git 合并冲突未清零时禁顶部提交消双阳色、修正 `failed` 红/`pending` 琥珀、删侧栏重复 `head · upstream`；Diff 修错误 `"Sources"` 提示、补 3 组输入源切换器与统一/并排切换及 `molisCopy`、在 `plugin-sdk` 统一绑定 `[data-diff-unfold]` 展开、刷新改 `molisBusy`；Text Stats 修 `"word counts"` 误报与中文标题、增设就地自适应 `mw-textarea` 实时统计框、刷新改 `molisBusy`、纳入样式门禁。
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
| `skills/molis-plugin-dev/generated-design.md`／`.en.md`、`generated-experience.md`／`.en.md`、`generated-ui.md`／`.en.md`、`plugins/native/plugin-builder/src/agent-prompts.ts` | 将四档版心、单阳色、常态退隐、无卡套卡、`250ms` 等待与行为反馈标准同步至插件创作台提示词与审美复查段，通过 `pnpm studio:replay` 与隔离 Home `smoke` 回归 |

---

## 5. 三层防回归自动化门禁收紧（`91B-4`）

按 `AGENTS.md` 门禁修改流程经用户确认后，在 `91B-4` 永久焊死三层守卫：
1. **静态精细度与布局门禁（`tests/soft-workbench-refinement.test.ts`）**：将全量内置插件样式表（`plugins/native/*/src/styles.ts`）与 `packages/im-ui/src/styles.ts` 纳入扫描范围；新增插件内禁止视口布局 `@media (max-width/min-width)`（仅允许 `(pointer: coarse)` / `(hover: none)` / `(prefers-reduced-motion)`）守卫。
2. **视觉秩序与分屏几何门禁（`tests/visual-order.e2e.test.ts` + `tests/fixtures/order-audit.ts`）**：补齐漏检的 11 个高频表面（`risk / work-brief / shelf / sessions / materials / plugin-market / capabilities / im-ui` 及右侧面板视图）与 `MODE_PAGES` 深色/紧凑/390px 覆盖；将 `[role="button"]` 纳入热区与控件检查；新增 **`600px` 分屏窄窗格几何断言**（无横向裁切溢出、正文有效列宽 `≥ 280px`、无非法双滚动容器）。
3. **行为反馈与回滚门禁（`tests/busy-feedback.e2e.test.ts` + `tests/save-failure.e2e.test.ts`）**：将漏测的 12 个表面（`risk / work-brief / cognia / alchemist / dataset / images / schedule / artifacts / sessions / text-stats / diff / plugin-builder`）补入 `250ms` 瞬闪采样；将断网保存失败回滚断言从 Shelf 扩展至 Todo、Jelly 与设置实时开关。

---

## 6. 验收标准

1. **UXP-01** `plugin-frame`、`side-view-document`、`home-plugin-page` 与 `im-ui` 均完整挂载 `MICRO_INTERACTION_CLIENT_SCRIPT` 及所需 `CRAFT_FINISH / REFLOW / COPY_FEEDBACK / STATE_RING` 脚本；全部 24 个内置插件内 `.mw-toggle-group` 具备弹簧滑块过渡、创建 `<dialog>` 响应 `⌘+Enter / Ctrl+Enter` 提交，且侧栏、IM 与所有 `mw-*` 控件具备统一的 `scale(.97)` 按压与 `craft-tick / craft-pop` 触感。
2. **UXP-02** 全局提供 `window.molisBusy(button, work)` 与统一宿主 `host.showToast(msg, opts)`（支持 `2.8s / 6.5s+悬停暂停 / role="alert"` 错误驻留与 `--helm-h` 智能避让），8 套分裂 Toast 全部收口；全仓 21 处原生 `date / time / datetime-local / month` 全部由统一渐进增强器接管，11 处 `window.confirm / alert`、`<datalist>`、可见原生 `file` 与 `<progress>` 全部清零。
3. **UXP-03** `packages/design-system/src/browser/copy-feedback.ts` 无硬编码中文默认值，全站绕过 `molisCopy` 的 5 处裸 `navigator.clipboard.writeText` 清零；全站 7 大编辑器落地统一五态自动保存模型（空闲静默不刷绿、超 `250ms` 保存中、成功 `2s` 淡隐、失败红字保留草稿并带就地重试）；`host.confirm` 支持 `tone: "danger"` 与具体动词，全站表单／确认弹窗严格「左取消、右主动作」。
4. **UXP-04** 生成插件共享渲染器实现每页平面最多 1 个 `mw-btn--primary` 且弹窗提交恒为 `primary`；清除 `.pc-count::before` 硬编码中文、`% 4` 轮转琥珀、目录行卡套卡、`:hover translateY(-1px)`、`"✓ "` 字符与 `sparkles` 回退身份标；市场卡片 `:not([hidden])` 按钮折行修复且 `960px` 双列等高。
5. **UXP-05** `.tab-pane-body` 与 `.tab-workspace-exclusive` 声明 `container: plugin-stage / inline-size`，全仓插件与舞台响应统一按 `≥960 / 680–959 / <680px` 三档 `@container` 切换；在 `1440px` 桌面二分屏（每窗格 `~680px`）与开右侧面板（`~540–600px`）下，所有主从双栏、三栏（PPT）与并排对比（Diff）自动折叠无挤压、无横向裁切溢出。
6. **UXP-06** 全产品收敛为四档居中标准版心（`680–720 / 760–880 / 960 / 1152px`）与两档 `--surface-soft` 主从左栏（`240 / 280px`），消除灵光同页左右跳轴、PPT 贴左、Dataset 四级锯齿、Goals `32px` 阶梯缩进、Feed `.feed-detail` 纸中套卡与全站多处 3～4 层套盒；`.plugin-stage-detail-bar` 锁死 `48px` 单行无 `overflow-x` 菜单裁切；Inbox 处置页脚下置于正文之后；Sessions/Cognia/Jelly 压缩多层顶栏并修 Jelly `top: -28px` 截断；Plugin Builder `.as-board` 不遮挡画布且窄窗单视口分段切换。
7. **UXP-07** 全仓清除四起色彩语义倒置（Dataset/PPT 错误涂绿、电脑面板 `--accent` 实心主按钮、灵光 `.lingguang-note` 悬浮遮挡与 Plugin Builder 深色白底弹窗），收回全部越界 `--amber`（仅用于「轮到你」）、清零常态无意义绿/蓝签与静止态误转 `"running"` 环，清零硬编码 `#hex` 孤岛与私读 `data-resolved-theme="dark"`，全仓手敲 Unicode 图标与 Shelf 21 处私绘 SVG 迁回 Lucide 图标库。
8. **UXP-08** 修复全仓所有 P0 级文案与功能断层：租户订阅表单与 Goals 解除关系不再输出 `"这句话暂时显示不了"`；清除 Goals／浏览器／电脑面板的中文译文分支判断；修复 `"Imported / Completed / Started / Resumed"` 动词时态错误与灵光发言人 `"记下"`；`rss / youtube` 补双语 `locales`；清零 Plugin Builder 的 `Jev / G1–G6 / 合同`、Jelly 裸 JSON 及全仓裸 UTC 时间切片；Artifacts/Sessions/Shelf/Cognia/Alchemist/Images 加载失败均可原地恢复重试、零白屏吞错或永卡加载态。
9. **UXP-09** 高频可逆操作（Inbox 标记已处理/忽略、Feed 忽略、Coding/Alchemist 归档、Goals 回收站恢复）取消多余阻塞确认，改为即时执行 + `6.5s` Undo Toast + `molisReflow`（Inbox 同步顺推下一条）；Goals 取消单击 `220ms` 延迟；Diff 与 Git 均支持 `[data-diff-unfold]` 展开；Text Stats 具备就地实时输入框；补齐缺模型/缺连接的 `host.returns.go` 往返与浮层 `Escape` 焦点归还。
10. **UXP-10** `molisCraft` 五大轻动效（`land / carry / turn / ask / celebrate`）、`molisReflow` 与 `molisFollow` 按第 2.1、3 节清单在目标插件与外壳节点完成克制接线，全仓清除 6 处空转 `.is-arriving` 与全部违禁 `:hover` 上浮及私有非令牌 `.animate()`；所有轻动效尊重 `prefers-reduced-motion` 与 `data-craft-still`，首屏绝不误触发庆祝。
11. **UXP-11** 第 4 节所列全部开发指引与插件创作台 Skill（`DESIGN.md`、`docs/design/taste.md`、`packages/design-system/README.md`、`docs/system/DEVELOPMENT-REQUIREMENTS.md`、`skills/molis-plugin-dev/*.md` 中英文与 `plugins/native/plugin-builder/src/agent-prompts.ts`）完成同步更新，`pnpm health:check` 文档引用门禁零报错，且 `pnpm studio:replay` 与隔离 Home `pnpm studio:replay smoke` 全部通过。
12. **UXP-12** 经用户确认门禁改动后，`tests/soft-workbench-refinement.test.ts` 覆盖全量内置插件 CSS 与 `IM_STYLES` 并拦住插件视口布局 `@media`；`tests/visual-order.e2e.test.ts` 与 `tests/fixtures/order-audit.ts` 覆盖全部新增 11 表面、`MODE_PAGES` 及 `600px` 分屏窄窗格零溢出断言。
13. **UXP-13** `tests/busy-feedback.e2e.test.ts` 扩覆盖全部 12 个新增表面通过 `250ms` 零瞬闪采样；`tests/save-failure.e2e.test.ts` 扩覆盖 Todo、Jelly 与设置实时开关断网回滚；页面单资源守住预算红线，`pnpm build`、`pnpm boundary:check`、`pnpm health:check` 与共享核心全量回归通过。
14. **UXP-14** `[人工]` 在一次性隔离 Home 中按浅/深色、中/英文、桌面全宽/二分屏/开侧栏/`390px` 窄屏逐板块走查入口、市场、侧栏、IM、创作与工作插件及生成插件，确认按钮触感、等待态、轻动效、Toast/Undo、分屏布局与视觉层次整体统一克制。

---

## 7. 决策记录

- **2026-11-18（合并进第 91 批、双段拆分、开发指引与三层门禁，用户定，[路线书决定 55](../post-anticorruption-roadmap/reference/decisions.md#decision-55)）**：
  1. 将全产品界面打磨、空间与布局架构优化、用户行为反馈全链路优化及后续开发指引更新，与[对话与执行流式体验](../conversation-execution-ui/spec.md)合并为统一体验专项，在路线书中排为紧邻双段：**[第 91 批（91A）](../post-anticorruption-roadmap/reference/batches/91.md)**（1 个 PR，先落底座/流式/全部后续开发指引）→ **[第 91B 批](../post-anticorruption-roadmap/reference/batches/91b.md)**（全产品表面收口 + 三层门禁焊死，按正交模块可拆并行 PR 或 1 个 PR）；两段均以 `35-2 / 36A / 37-2` 为前置，**不等 `38～89`**。
  2. 显式剔除已定随 [44-7](../post-anticorruption-roadmap/reference/batches/44.md#batch-44-item-7) 删除的桌面菜单栏胶囊，避免与 [36A](../post-anticorruption-roadmap/reference/batches/36a.md) 和 [56-1／56-2](../post-anticorruption-roadmap/reference/batches/56.md) 撞车。
  3. 确认将全部后续开发指引更新（`91-5`）与三层防回归门禁收紧（`91B-4`）纳入正式交付与验收标准（`UXP-11`～`UXP-13`）。
