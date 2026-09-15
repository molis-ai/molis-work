# 工作台导航控件归属与网页版项目切换修复

## 背景与目标

当前 Goal 工作台存在三类界面归属问题：

1. 工作区右上角的“目录、Focus、Runtime”三个按钮混合了不同层级的控制，目录按钮实际切换到 Goal Tree，并没有收起整个目录栏。
2. Focus 与 Runtime 属于当前 Goal 的工作模式，却放在全局工作台栏，离当前 Goal 上下文过远。
3. 窄屏网页版隐藏左侧目录后没有提供项目切换入口，导致用户无法从顶部切换项目或进入项目设置。

本次目标是让控件位置与其控制对象一致，并补回窄屏网页版的项目上下文入口，同时保持现有移动端内容导航和 Native Desktop Companion 行为不变。

关联 Molis Work Goal：`draft-f1c6b937-d1b4-45c3-bc29-891e964261bc`。

## 完成等级

目标为 **Level 4：内部完整**。

要求真实状态、主路径、模式切换、响应式行为和关键恢复路径均可供内部顺畅试用；不包含 macOS 安装包制作与安装验证。

## 当前行为与证据

- `src/web/render.ts` 的 `desktopWorkbenchHeader` 同时渲染目录、Focus、Runtime 三个按钮。
- 目录按钮使用 `data-directory-open="root"`，调用 `setDesktopDirectory()`，只改变目录内部页面，而不是控制目录栏显隐。
- `setWorkspaceMode()` 已负责 Focus/Runtime 主内容切换，因此模式控件可以迁入 Goal Hero，复用现有状态流。
- `src/web/visual-foundation.ts` 在 `max-width: 760px` 时隐藏 `.navigator-project`，但没有网页版替代入口。
- Runtime 激活后 Goal 文档整体隐藏，若只把模式切换放进 Hero，会缺少返回 Focus 的恢复入口。

## 范围

### 1. 目录栏收起/展开

- 在左侧目录栏最顶部的项目导航区域加入目录栏收起按钮。
- 收起整个目录栏后保留一条窄轨道和恢复按钮，主内容区扩展，不发生页面跳转。
- 新增独立的 `directoryCollapsed` UI 状态并持久化。
- 目录栏显隐不得改变目录内部当前页（项目根、Goals、Feed），也不得改变 Goal Tree 节点展开状态。

### 2. Goal 模式切换

- 从工作台右上角移除原目录、Focus、Runtime 三个按钮。
- 在当前 Goal Detail Hero 的标题操作区加入 Focus/Runtime 模式切换。
- 继续复用 `setWorkspaceMode()`，不改变 Runtime 协议、会话生命周期或终端数据契约。
- Runtime 视图提供明确的“返回 Focus”恢复入口。
- 窄屏继续使用现有“目录/目标/聚焦/运行”内容导航，不重复显示 Hero 模式切换。

### 3. 窄屏网页版项目上下文

- 仅在 Web 壳的窄屏布局顶部显示当前项目切换和项目设置入口。
- 项目菜单必须完整浮在内容上方，不被工作区或设置内容裁切。
- Native Desktop Companion 不渲染该 Web 专用顶部栏，维持现有窄窗结构。
- 多个项目菜单实例共用一致的关闭行为，不能只关闭页面中的第一个菜单。

### 4. 项目设置入口视觉对齐

- 项目设置入口使用与全局设置一致、视觉重心对称的设置图标。
- 图标按钮必须显式重置普通设置导航链接的内边距、列布局和间距，不能因为进入设置页而把图标挤向右侧。
- 保留现有 28px 控件外框、标题栏节奏、当前态、悬停态、键盘焦点与链接语义，不改项目设置路由。

## 非目标

- 不重新设计移动端四段内容导航。
- 不改变 Goal Tree 节点展开/收起语义。
- 不改变 Runtime/TUI 的通信协议、任务会话或服务端数据。
- 不处理与本任务无关的工作区视觉重构。
- 不制作、安装或发布 macOS 应用包。

## 模块与状态流

### `src/web/render.ts`

- 生产目录栏顶部收起按钮、Goal Hero 模式控件、Runtime 返回入口和 Web 窄屏项目栏。
- 消费 `directoryCollapsed` UI 状态，应用到 `.workspace`，并在交互后持久化。
- 保留 `directory` 与 `workspaceMode` 既有状态，三者彼此独立。
- 统一管理页面中所有 `data-project-menu` 实例的外部点击关闭行为。

### `src/web/visual-foundation.ts`

- 定义目录栏收起后的桌面网格、窄轨和控件可见性。
- 定义 Hero 模式控件及 Runtime 返回入口。
- 定义仅 Web 窄屏显示的项目栏、菜单层级和三行页面网格。
- 不影响 `data-native-desktop="true"` 的 Companion 页面。

### `tests/web.test.ts`

- 静态验证控件归属、独立状态、恢复路径和响应式边界。
- 验证 Web 与 Native Desktop 输出差异。

## 验收标准

1. 宽屏 Web 与 Desktop Shell 中，目录收起按钮位于目录栏最顶部；点击后整栏收为窄轨，再次点击恢复。收起前后目录内部页与 Goal Tree 节点状态不变。
2. Focus/Runtime 切换位于当前 Goal Hero；切换后主内容正确变化，Runtime 中可返回 Focus；旧工作台右上角不再出现这三个按钮。
3. 窄屏网页版顶部持续显示当前项目切换与项目设置，项目菜单不被遮挡；Native Desktop Companion 窄窗不增加该栏，原移动端内容导航不变。
4. 类型检查、Web 定向测试、布局机械扫描、关键宽屏/窄屏交互与视觉检查通过；不存在新增明显裁切、溢出或不可恢复状态。
5. Goal 工作台、全局设置和项目设置标题栏中的项目设置入口均使用齿轮图标；图标在 28px 控件内水平、垂直居中，进入设置页后不会继承普通导航项的双列布局与内边距。

## 验证方式

```bash
pnpm typecheck
node --import tsx --test tests/web.test.ts
git diff --check
node /Users/yijunwang/.agents/skills/impeccable/scripts/detect.mjs --json --scope layout src/web/render.ts src/web/visual-foundation.ts
```

浏览器手动验证：

- 宽屏：目录收起/恢复；目录内部选择保持；Hero Focus/Runtime 往返；项目菜单层级。
- 窄屏 Web：顶部项目切换、设置入口、菜单浮层、四段内容导航。
- Native Desktop 模式：窄窗无 Web 项目栏，既有 Companion 结构保持。

## 假设与开放问题

- 目录收起后保留窄轨作为可发现的恢复入口，比完全隐藏并依赖悬浮手势更稳妥。
- Runtime 视图隐藏 Goal Hero，因此需要视图内独立返回 Focus 的按钮；它只触发现有工作模式切换，不引入新模式。
- 当前无阻塞性开放问题。
