# 组件原语、共享机制与空间布局

**第一铁律**：先查组件板 `/__ui/catalog` 与 `@molis-ai/molis-work-plugin-sdk/ui`，目录里有的控件一律直接复用 `mw-*`；目录里真缺的先补进 `packages/design-system` 和组件板，**绝不在插件内发明 `.as-*`、`.wf-*`、`.shelf-*` 第二套基础控件**。

---

## 1. 对齐六律、容器层次、三层标签栏与图示优先

### 对齐六律（Six Laws of Alignment — 整洁感的第一公理）
1. **共享网格轴**：同页所有区块共享唯一左边缘与版心宽度（`--measure-reading: 700px` / `--measure-form: 760px` / `--measure-stage: 960px` / `--measure-wide: 1152px`），左轨固定 `--master-w: 240px`（设置页固定 `228px`），严禁切页或跨区左右跳轴。
2. **首行光学轴**：每行左侧图标与状态环锁定 `22px` 首行光学中心（多行折行时不垂直居中飘离标题）。
3. **单一起笔文本轴（`--text-start: 44px`）**：带图标列表与内嵌分组行（`.mw-inset-row`、`.mw-object-row__body`）的分隔线与展开抽屉统一从 `44px` 文本起点对齐，**绝不横切左侧图标**。
4. **数值列齐（`tabular-nums`）**：时间、计数、比例、耗时与状态列一律 `font-variant-numeric: tabular-nums` 并固定右对齐列宽，杜绝数字跳动与歪斜。
5. **同心圆角（`R_outer − padding = R_inner`）**：外层槽容器 `.mw-section-well`（`14px`）+ `4px` 内边距 → 内层纸卡（`10px`）；分段控件外槽（`10px`）+ `3px` 内边距 → 滑块（`7px`），严禁圆角倒挂。
6. **无刷新连续位移**：列表切换、增删与展开坚持持久化 DOM + FLIP（`molisListTransition` / `molisReflow` 容器高度呼吸；自然高度 `0fr → 1fr` 仅限白名单 `<details class="mw-collapsible">::details-content`，内嵌行抽屉 `.mw-inset-row__drawer` 使用纯合成层 `craft-rise` 展开），拒绝整块销毁重建闪白。

### 容器与边界三层体系（区分区域与 Item）
- **连续白纸（主工作面）**：`--paper`，普通内容靠留白与字重分隔，不画卡套卡。
- **凹槽区块（`.mw-section-well`）**：`--surface-soft` + `1px solid var(--line)` + `14px` 圆角 + `4px` 内垫，用来收拢相关控制条、工具组或状态摘要，内嵌纸卡自然取 `10px` 同心圆角。
- **内嵌分组列表（`.mw-inset-group` + `.mw-inset-row`）**：外围一张 `--paper` 卡片（`12px` 圆角 + `1px solid var(--line)` + 深色 `--edge-highlight` 顶光），内部行间 `44px` 齐线分隔，单行支持原位展开详情抽屉（`.mw-inset-row__drawer`）。
- **壳层与插件 iframe 同享**：`.mw-section-well`、`.mw-inset-group`、`.mw-inset-row*`、`.mw-tabs__list--underline`、`.mw-badge--chip`、`.mw-glyph-status`、`.mw-signal-dot` 与 `.mw-signal` 均已纳入 `PRIMITIVE_PLUGIN_STYLES`（随 `<80 KB` `molis-work-plugin-base.css` 下发），壳层页面与所有 framed 插件直接复用，不需自写样式。

### 三层标签栏体系（不混用）
- **T1 页面级工作标签**：顶栏方案 C「纸上的页签耳」（`.tab-item`，当前页签与纸面相连 + `2px --accent` 顶冠）。
- **T2 视图 / 筛选切换**：`.mw-toggle-group`（带弹性滑块的紧凑分段控件，用于 2–5 项互斥视图切换）。
- **T3 区域内平级页签**：`.mw-tabs__list--underline`（底部 `2px` 雾蓝滑条 + `1px` 底线，用于详情页内多子面板切换，避免与按钮混淆）。

### 列表项换行规则与「图示+色彩优先、零状态赘字」
- **何时换行**：标题单行截断（超长在聚焦/悬停通过平台提示显全）；说明文字仅在帮助用户做决定时占第二行（最多 2 行）；常规信息按三槽排布——**左槽（图标/状态环）→ 中槽（标题 + 必要的一行摘要/标签）→ 右槽（等宽元数据 + 悬停/聚焦操作）**。
- **图示 + 色彩先于状态文字**：优先用清晰语义矢量图标（`.mw-glyph-status`、`.mw-signal-dot`、`.mw-signal`、`renderStateRing`）+ 色彩 + 克制动效表达「正常 / 进行中 / 待你处理 / 异常」，**不把「状态：运行中」「说明：当前已连接成功」这类废话铺满每一行**；解释性说明收进按需披露（内嵌详情抽屉、`<details class="mw-collapsible">` 或右上「帮助」）。

---

## 2. 核心 `mw-*` 控件材质与规范

| 控件 | 类名 / 渲染器 | 质感与行为要求 | 禁用反例 |
| --- | --- | --- | --- |
| **主按钮** | `.mw-btn.mw-btn--primary` | 唯一墨青/深墨实底 + 顶部微高光 + 按下 `scale(.97)` 后回到原位（不冲过头）；一屏平面最多 1 个 | 同屏出现 2 个以上主按钮；用 `--accent` 画实心主按钮 |
| **次按钮** | `.mw-btn.mw-btn--secondary` | `--paper` 纸底 + `1px solid var(--line-strong)` 细边 + `--lift-1` 贴面微影（绝非无边灰块） | `background: ink 4%; border: 0` 廉价灰块 |
| **幽灵 / 危险按钮** | `.mw-btn--ghost` / `.mw-btn--danger` | 危险动作配具体动词（如「删除项目」「收回授权」），确认弹窗右置危险红 | 用主按钮颜色做不可逆删除；泛词「确定」 |
| **输入框 / 文本域** | `.mw-input` / `.mw-textarea` | 纸面底 + `1px` 清晰边框 + 极浅内影，聚焦呈雾蓝边 + `3px` 柔光晕；多行自动增高加 `data-fit` | 无边框淡灰块；在设置页私改成 `36px` 破坏同排等高 |
| **下拉选择** | `.mw-select`（配合 `SELECT_MENU_CLIENT_SCRIPT`） | 统一弹层菜单、键盘上下与 `Escape`、触控 `44px` | 裸露可见的 OS 原生 `<select>` 或 `<datalist>` |
| **日期 / 时间** | 平台统一日期时间渐进增强器（基于 `.mw-calendar` + `.mw-popover`） | 浅/深色一致、键盘可达、格式走 `format` | 原生 `<input type="date|time|datetime-local|month">` |
| **勾选 / 开关 / 分段** | `.mw-check` / `.mw-switch` / `.mw-toggle-group` | 勾选自绘对勾动画、开关按住微拉伸、分段滑块弹簧滑动；标准高 `32px`（紧凑 `28px`） | 私造 `input.settings-switch` 或误写 `.mw-checkbox` |
| **状态标签** | `.mw-badge` / `.mw-status` / `.mw-ring` | 圆角固定 `var(--r-tag, 6px)` 柔和浅洗芯片；动态进行中才旋转状态环，静态状态不空转 | `border-radius: 999px` 球场胶囊；已完成/空闲态套旋转环 |
| **对话框与确认** | `.mw-dialog` / `host.confirm({ title, confirmLabel, tone })` | 永远「左取消、右主动作」，`⌘+Enter` 提交，`Escape` 关闭并归还焦点 | `window.confirm` / `alert` / `prompt`；破坏性操作放左边 |
| **空态与报错态** | `.mw-empty` / `.mw-empty--error` | 居中图标 + 标题（≤10 字无句号）+ 一句白话说明 + 下一步按钮；报错态保留用户输入与重试 | 裸字「暂无数据」「加载失败」或白屏吞错 |
| **按需帮助与事实块** | `.mw-facts` / `.mw-help-card` / `.mw-help-tip` / `.mw-help-side` | `.mw-facts` / `.mw-help-tip` / `.mw-help-next` 用 `--surface-soft` 柔底；窄屏卡片底距读 `calc(var(--helm-h, 74px) + 8px)` | 用 `--surface`（与纸面同白）或旧 `--dock-h`（52px）被底栏遮住 |

---

## 3. 九大共享客户端机制（直接调用，绝不重造）

1. **`window.molisCopy(btn, text, { done, failed })`**：剪贴板真正写入后才切「已复制」，自动锁宽防横跳（文案走 `t()`，绝不硬编码中文）。
2. **`window.molisFollow(container)`**：对话与长日志的唯一滚动主人——到底跟随，用户首个 `wheel`/`touchmove`/向上滚/选字当即交权 `detached`；新内容调 `pin()`、回底调 `toLatest()`、切会话保存/恢复 `{ scrollTop, followState }`，卸载 `dispose()`。
3. **`window.molisStreamText(container, html, { reveal, grow, pace })`**：自适应帧率平滑流式输出 + 连续波浪 `.mw-fresh` 不掐断在途动画 + 内联 Markdown 闭合零重闪；代码块原地生长配合 `@molis-ai/molis-work-plugin-sdk/highlight` 的 `growCodeTokens`。
4. **`window.molisShowMore(list, { key, label, keep })`**：长列表默认收前 5 项，多 1 项直接展开，`keep` 保住失败/需注意项，重画保持展开态。
5. **`<details class="mw-collapsible">`**：自然高度展开与可中断收起；用户手动点开的 `<details>` 标 `data-user-toggled`，AI 完成时不自动合上（守 `VUX-13`）。
6. **`window.molisMediaZoom`**：所有图片缩略图/附件预览统一点击灯箱放大。
7. **`window.molisDropZone`**：文件/图片拖放区统一高亮与拖入反馈，隐藏原生 `<input type="file">`。
8. **`data-overflow-fade` & `data-fit` & `.mw-num`**：横向可滚条仅在有更多的一侧淡出；多行输入框自动长高；跳动数字用 `data-num-ghost` 防抖动。
9. **`window.molisReflow`**：列表项增删与即时分拣平滑补位。

> 不可信外部文字（网页、订阅、模型回答）一律经 `@molis-ai/molis-work-plugin-sdk/rich-text` 的 `renderRichText` / `richPlainText` 清洗渲染，显示或送模型前先过 `redactSecrets`。

---

## 4. 空间布局：`@container plugin-stage` 三档断点 + 四档标准版心

### 窗格级容器查询（插件内严禁视口布局 `@media`）
所有舞台与插件页响应 `.tab-pane-body` / `.tab-workspace-exclusive` 提供的 `plugin-stage` 容器宽（仅外壳顶底栏与 `(pointer: coarse)` / `(hover: none)` / `(prefers-reduced-motion)` 可用 `@media`）：
- **舒展档（`≥ 960px`）**：主从双栏完全展开，或正文 + 右侧依据/属性轨并列。
- **紧凑双栏档（`680px ～ 959px`）**：收折第三栏与右侧附属轨（下沉或转抽屉），主从左栏收窄至 `220px`，列表隐藏次要元数据列。
- **单栏推入档（`< 680px`）**：双栏舞台切「列表占满 → 详情占满 + 左上返回」；二分屏 `600px` 窄窗格零横向滚动溢出、正文有效列宽 ≥ `280px`。

### 两档主从左栏与四档标准居中版心
- **主从左栏**：标准 `--master-w: 240px`（紧凑 `220px`）、富摘要 `--master-w-wide: 280px`（封顶 `300px`，禁用百分比）；左栏统一 `--surface-soft` + `1px solid var(--line)`，右栏独占 `--paper`，**不画纸中套卡或卡套卡**。
- **四档居中版心（同页所有区块共享同一中心轴，不跳轴）**：
  - `--measure-reading: 680px ~ 720px`（长阅读、对话、笔记、Feed/Inbox 正文）
  - `--measure-form: 760px ~ 880px`（全部设置页 `760px`、表单编辑、Goals 文档 `880px`、首页与 Work Brief）
  - `--measure-stage: 960px`（对象目录、插件市场双列等高卡片）
  - `--measure-wide: 1152px`（Dataset 宽表、PPT 工作区、Goals 画布/看板、Workflows 链）
- **详情顶栏 `.plugin-stage-detail-bar`**：锁死 `48px` 单行（返回 + 标题 + 最多 1 主 1 次 + `···` 更多菜单），**严禁设 `overflow-x: auto` 裁切弹层菜单**。
- **代码对照 `.mw-diff`**：左右分栏模式（`.mw-diff-split`）故意保持同行对齐几何，不在 `@container` 下纵向折成单列，以守住代码行号与增删逐行对齐契约（`VUX-33`）。
