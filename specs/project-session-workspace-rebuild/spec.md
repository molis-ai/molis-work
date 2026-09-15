# 项目内 Sessions 与工作目录重做

日期：2026-08-30
完成等级：2 · 可交互原型

## 背景与问题证据

上一版已经被用户否决并删除。它虽然把 Sessions 与工作目录放进项目路由，但仍然渲染成一套独立页面，重新发明了项目栏、列表、详情头、搜索区和容器系统，因而丢失了真实 Goal 工作台的项目栏、目录替换、工作标签、Goal 列表节奏和 Goal Detail 层级。根目录链接还曾暴露浏览器下划线，返回箭头也曾使用错误方向。

真实 Goal 工作台的浏览器基准是：约 310px 的单目录；项目范围固定在目录顶部；根目录、Goal Tree、Feed 与来源在同一列中替换；右侧保留工作标签；Goal Detail 使用状态与事实、标题与动作、工作面导航、主内容和上下文栏。Sessions 与工作目录必须加入这套现有工作台，而不是在旁边仿造一套相似页面。

## 保留、替换、忽略

### 保留

- 项目根目录内 `Goals`、`Sessions`、`工作目录`平级。
- Session 能查看执行内容、Molis Work 兜底记录、不可读取与读取失败状态。
- Session 能在原 Runtime 加载；Handoff 总是选择目标 Runtime，并创建新的目标 Session。
- 工作目录能查看路径状态、已知 Sessions、项目关系和启动入口；启动与关系变更由用户确认。
- Runtime 不支持原生 Session 查询时，继续通过能力适配层使用 Molis Work 可证明的记录，不伪造原生内容。

### 替换

- 删除独立 Session / 工作目录页面和 `sw-*` 视觉系统。
- 两个目录直接成为现有 Molis Work 工作台的 `data-directory-panel`；两个详情直接成为现有右侧工作面的 `data-work-surface`。
- 列表直接复用 Goal Tree 的目录标题、搜索、工具、连续行、状态和底部计数语法。
- 详情直接复用 Goal Detail 的状态与事实、标题与动作、主栏和上下文栏语法。

### 忽略

- 被否决版本的截图、尺寸、容器和视觉结论全部不再作为参考。
- 不保留顶部 Project / Sessions switch、独立大 Hero、管理后台卡片墙或另一套响应式导航。

## 用户场景

1. 用户在项目根目录点击 Sessions，左侧原地替换为 Session 列表，右侧打开所选 Session，项目栏和已有 Goal 工作标签仍在。
2. 用户扫描标题、Runtime、状态、当前 Goal 与更新时间，搜索或筛选后选择一条记录。
3. 原生可读 Session 显示执行内容；fallback 只显示 Molis Work 事实；不可读取或失败状态说明原因和恢复动作。
4. 用户从当前 Session 加载原 Runtime，或选择目标 Runtime 创建包含当前 Goal 信息的新 Session Handoff。
5. 用户返回项目根目录，进入工作目录；检查路径、关联 Sessions 和启动条件，并在明确确认后预演修复或启动。
6. 窄屏先显示当前目录，选择记录后进入右侧详情；使用现有“目录 / 当前列表 / 详情 / 运行”导航返回，不再创建另一套返回系统。

## 方案与调用链

### `src/web/project-session-workspaces.ts`

- 只生产两个目录、两个详情工作面、代表数据、局部交互脚本和必要的增量样式。
- 不生产 HTML 文档、项目栏、工作台壳层或独立移动端导航。
- 数据按当前 `project_id` 隔离；非演示项目没有记录时显示真实空态。

### `src/web/render.ts`

- 在项目根目录以 button 加入 Sessions 与工作目录，和 Goals 使用同一交互语义。
- 把新目录插入现有 `.tree-pane`，把新详情插入现有 `.document-pane`。
- 扩展通用目录与工作面切换逻辑，使 `sessions`、`workspaces` 与 `goals`、`feed`、`sources` 走同一状态保存和移动端调用链。
- 工作台 CSS 与脚本资产组合新模块的局部 CSS / JS，不增加独立页面资产。

### `src/web/server.ts`

- 删除旧原型 renderer 和独立 CSS / JS 资产。
- 全局 `/sessions` 与 `/workspaces` 继续返回项目目录。
- 项目兼容路径返回当前项目工作台对应目录，而不是独立页面。

### `tests/web.test.ts`

- 验证项目根目录的平级按钮、同 DOM 目录与工作面、旧 `sw-*` 系统消失、全局和项目兼容路由、CSS / JS 结构和原型边界。

## 视觉与交互合同

- 设计模式：Operate。
- `DESIGN_VARIANCE: 3`，`MOTION_INTENSITY: 2`，`VISUAL_DENSITY: 8`。
- 继承现有 Molis Work CSS variables、系统字体、图标族、圆角、焦点、Light / Dark 和 compact density。
- 根入口为 button，不出现 link 下划线。
- 返回动作直接复用 `.desktop-directory-heading [data-directory-back]`，使用真正的左箭头图标，不依赖响应式旋转样式。
- Session / 工作目录列表使用连续 ledger 行；选中、hover、focus 不改变行尺寸。
- Session 详情不显示 Contract 三卡。标题区后立刻进入执行内容，让 Transcript 占主栏；当前 Goal、Goal 历史、工作目录和身份边界进入上下文栏。
- 工作目录详情使用一个主路径与 Session 工作面和一个上下文栏；不使用 Dashboard 卡片墙。
- 只在语义状态上使用颜色；没有装饰性渐变、光晕、图标大方块或大面积空 Hero。
- 窄屏触控目标至少 44px，无横向溢出；详情次序为标题与动作、执行内容、Goal 关系与身份。

## 状态与边界

- Session：原生可读、Molis Work fallback、不可读取、读取失败、无当前 Goal、归档。
- 工作目录：正常、缺失、冲突、无记录。
- 搜索无结果时隐藏旧详情的可执行动作。
- Handoff 没有当前 Goal 时禁用并说明原因。
- 修复路径、启动 Session、关系变化与归档只做页面内原型，并明确不会写 Runtime、数据库或文件系统。
- 不修改 Runtime adapter、SQLite schema、PTY 所有权、Session 领域模型或 Feed 数据模块。

## 验收标准

### 信息架构

- 项目根目录中 Goals、Sessions 与工作目录连续平级，没有 switch。
- Sessions 与工作目录使用现有单目录和右侧工作台；项目栏、工作标签、账户与设置位置不变。
- 不存在独立 `sw-page`、`sw-project-chrome`、`sw-shell` 或 `sw-commandbar` 页面系统。

### 列表与详情

- 两个目录的标题、返回、搜索、行、状态和计数与 Goal Tree 同层级。
- Session 详情的执行内容是最大区域，Goal 历史持续可见；Workspace 详情为连续工作面。
- 入口无下划线，返回箭头朝左，键盘焦点可见。

### 功能

- 搜索、筛选、键盘上下选择、执行内容搜索、Runtime 加载成功 / 失败、Handoff、路径修复和启动确认可操作。
- fallback 与 unavailable 不呈现伪造 Transcript。
- 不同项目的代表记录隔离；空项目显示空态。

### 适配与验证

- Light、Dark、桌面与 760px 以下窄屏均保持同一视觉层级。
- 页面没有横向溢出；触控动作至少 44px；减少动态效果设置生效。
- `pnpm typecheck`、`pnpm build`、定向 Web 测试与 `git diff --check` 通过。
