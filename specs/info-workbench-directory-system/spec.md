# 统一四类目录与列表系统

## 背景与目标

Molis Work 的 Goals、Inbox、Feed、来源与连接已经具备真实数据或入口，但列表并未形成同一套可复用的阅读与交互语法。当前 Goal Tree 中标题、内部 ID、状态、子目标进度和依赖摘要互相争夺弹性宽度；选中行的视觉边界与普通行不同；存在依赖的条目额外增加高度，导致标题列、状态列和行节奏明显漂移。Feed 与来源列表又各自使用独立卡片样式，无法成为同一个 Calm Desktop 工作台。

本 Work Item 先把 Goal 列表修成稳定的基准，再让 Inbox、Feed 和现有来源管理复用同一套目录行骨架、状态表达和响应式规则。完成等级为项目总目标中的一个 **Level 4 内部完整切片**：共享目录系统可在真实页面顺畅试用，但 Feed 动作、Connector 同步和 Runtime/TUI 闭环仍由后续 Goal 交付。

## 当前行为与问题证据

- `renderGoalTree` 把标题、Goal ID 和子目标进度都放在 `.tree-copy`，而状态是相邻弹性项；不同标题长度与有无进度会改变列线和行高。
- `renderTreeDependencies` 在主行后独立渲染 `<details>`，有依赖的行多出 22px，列表节奏断裂；截图中的阻塞 Goal 因此呈现为两层错位信息。
- Desktop CSS 存在多轮 `.tree-node`、`.tree-copy`、`.tree-progress` 覆盖；基础样式、Calm Desktop 样式与 Desktop 专用样式的 grid/flex 模型不同，实际浏览器中同一列表出现 38px、43px 和带额外 22px 摘要的多种节奏。
- Feed Item 使用图标卡片结构，Source 使用独立卡片结构；它们的选中面、圆角、信息层级和状态位置均与 Goal 不一致。
- 真实页面量测显示 Goal 状态右沿相对稳定，但标题/内部 ID、进度与依赖摘要没有共享列线；这与“一眼扫描目标、状态和阻塞关系”的用途相冲突。

## 保留、替换、忽略

### 保留

- Goal Tree 的父子层级、展开收起、搜索、筛选、选择、依赖详情和真实 Goal 状态。
- Inbox 与 Feed 是同一个 Item 工作台的两种 preset；进入模块替换左侧根目录并可返回上一级。
- Item 的 type、source、title、summary、time、disposition 和 Source 的同步状态等真实信息。
- Calm Desktop 的单目录、轻色面、克制钴蓝、语义色与 Lucide 图标。

### 替换

- 把 Goal 行从互相竞争的 flex/grid 覆盖，替换为一套稳定的目录行结构：展开位、主内容、状态三列；主内容内部只有标题线与紧凑次级信息线。
- 把子目标进度和依赖健康统一放入次级信息带；依赖明细仍可展开，但展开前不再制造一条漂移的“第二行卡片”。
- 把选中态改为与普通行同尺寸的轻色面，不使用更重的卡片边界或尺寸跳变。
- 把 Feed Item 与 Source 行的布局、间距、选中/悬停/聚焦和状态语法迁移到同一共享目录行基线。

### 忽略 / 非目标

- 本 Work Item 不新增或改变 Feed 的保存资料、Promote、Start、忽略、归档等业务语义。
- 不实现 Connector OAuth、来源同步、Relay 迁移、正文加密或 Provider 写回。
- 不改变 Goal Runtime/TUI 的上下文填充与发送边界。
- 不删除 Relay 仓库或数据；不引入新的 Dashboard、表格或永久第二导航列。

## 交互与视觉规则

1. 四类列表共用 `directory-row` 语法：leading 只承载层级/类型图标；content 负责标题与次级事实；state 固定在末列。
2. Goal 标题、内部 ID、子目标进度、依赖健康和状态分为明确层级。内部 ID 只作为安静的辅助事实，不能挤压标题或形成视觉中心。
3. Goal 的依赖摘要嵌入次级信息带；展开详情在行下方出现，且详情左沿与主内容列对齐。
4. 选中、悬停、键盘聚焦不改变行高、padding 或列宽。选中使用纸面色；钴蓝仅用于焦点、链接和进度。
5. Item 行保留 type/source/title/summary/time/disposition，但视觉优先级为 title → source/type/state → summary/time。Source 行保留名称、类型、状态、数量、最后同步与动作。
6. 列表不使用逐行分割线或同尺寸卡片堆叠；通过 6–8px 圆角的交互色面和 6–10px 组间距表达层级。
7. 目录标题与右侧详情标题遵循 Calm Desktop 21–28px 上限；主操作近黑，选中和焦点克制使用钴蓝。
8. 1440×900、1180×760 和 720×820 下无横向溢出；窄屏保留可理解的 Item → Detail 切换与返回路径。

## 模块边界

- `src/web/render.ts`
  - 调整 Goal Tree、Feed Item、Source 行的语义 DOM；保留现有 data attribute、API 和事件委托契约。
  - 共享类名只描述目录行结构，不引入新的业务状态源。
- `src/web/visual-foundation.ts`
  - 建立最终、单一的 Desktop/Companion 目录行规则，并收敛会冲突的旧覆盖。
  - 统一选中、悬停、焦点、密度与响应式表现。
- `tests/web.test.ts`
  - 更新易碎的旧 DOM 断言，补充共享行骨架、Goal 次级信息与 Feed/Source 复用验证。
- `DESIGN.md`、`.impeccable/surfaces/src-web-render-ts.md`
  - 仅在实现确认形成持久规则后补记，不重复维护运行状态。

## 验收标准

### info-workbench-directory-system-ac-1

Goals、Inbox、Feed、来源列表使用一致的 replace/back/select/detail 模型与共享目录行视觉语法；Goal 的现有选择、展开、搜索、筛选和依赖明细行为不回退。

### info-workbench-directory-system-ac-2

Goal 列表中标题、次级信息与状态列稳定对齐；有无子目标进度、依赖或选中态不会改变列线或造成选中行尺寸跳变。Feed/Source 行使用相同的悬停、选中、聚焦、圆角和信息层级，符合 Calm Desktop 的颜色与线条约束。

### info-workbench-directory-system-ac-3

搜索、筛选、排序、空状态、键盘焦点和窄屏组合可用；1440×900、1180×760、720×820 的 Light/Dark 关键页面无横向溢出，并有浏览器截图与 DOM/尺寸量测证据。

## 验证

- `pnpm typecheck`
- `node --import tsx --test tests/web.test.ts`
- `pnpm build`
- 浏览器验证 Goals、Inbox、Feed、来源管理的选择、返回、筛选、展开与空结果。
- 浏览器在 1440×900、1180×760、720×820 下检查 Light/Dark、横向溢出、行列对齐与键盘焦点。

## 假设与开放边界

- “其他列表对齐 Goal”指对齐修正后的 Goal 目录语法，而不是复制当前 Goal Tree 的错位与重边界。
- 来源与连接本轮复用已有真实 Source 管理数据；是否从 dialog 升级为永久独立目录由后续“完成来源与连接管理工作台”Goal 决定。
- 共享 CSS/DOM 类是内部实现约定，不改变服务端 API 和持久化 schema。

## 验收记录（2026-08-30）

- `info-workbench-directory-system-ac-1`：通过。720×820 下根目录可进入 Goals、Inbox、Feed、来源与连接；Inbox/Feed 进入后先停在 Item 列表，导航显示“目录 / Item / 详情 / 运行”，选择 Item 后才进入详情。证据截图：`.impeccable/review/mobile-inbox.png`、`.impeccable/review/mobile-feed.png`、`.impeccable/review/mobile-sources.png`。
- `info-workbench-directory-system-ac-2`：通过。1440×900 下 Goal 静止行高均为 40px，六条子 Goal 的尾部状态右缘一致；浅色 `--faint: #66666f` 在 `--rail: #f1f1f3` 上对比度为 5.04:1；独立 finish review 在修复移动入口、处置语义和浅色对比度后给出 `PASS / ship`。证据截图：`.impeccable/review/desktop.png`、`.impeccable/review/desktop-light.png`。
- `info-workbench-directory-system-ac-3`：通过。720×820、约 1180×760、1440×900 的检查均无横向溢出；搜索无结果、清空恢复、方向键、Home/End、可见焦点和来源 dialog 已在真实浏览器验证。`pnpm typecheck`、`pnpm build` 通过；`node --import tsx --test tests/feed.test.ts tests/feed-sources.test.ts tests/feed-security.test.ts tests/web.test.ts tests/desktop-tui.test.ts` 为 76/76 通过。
- 非阻塞 later：Item listbox 仍可采用 roving tabindex，减少长列表的 Tab 停靠点；现有方向键、Home/End 与焦点环已经可用。
