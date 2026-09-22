# Desktop 选中态与浮层裁剪修复

## 背景与目标

当前 Desktop Goal Tree 的“列表 / 关系图”切换器把选中项渲染成带明显白底和投影的悬浮块，与左侧目录的平面、低噪声视觉语言不一致。Desktop 设置页复用了项目切换菜单，但外层设置导航仍继承旧版 `overflow-y: auto`；这会同时建立横向裁剪边界，使菜单无法覆盖右侧工作区。

本次达到完成等级 4（内部完整）：修复两个真实界面问题，并检查当前共享样式中其他绝对定位浮层是否存在同类裁剪风险。

## 当前行为与问题证据

- Goal Tree 视图切换器的 active 状态使用 `background: var(--paper)` 和较重外投影，视觉上像脱离控件组的浮动卡片。
- 设置页 `.settings-navigation` 在 Desktop 布局中已经把滚动职责交给 `.settings-nav-body`，但自身仍继承 `overflow-y: auto`。CSS 会把另一轴的 `visible` 计算成 `auto`，因此项目菜单在导航栏右边界被裁剪；提高菜单 `z-index` 无法越过该裁剪边界。
- 项目菜单在 Goal 工作区的父级已明确 `overflow: visible`，树筛选器与终端菜单则本来就设计为各自在有界面板内展开，不需要跨面板。

## 范围

- 调整 Desktop Goal Tree 列表 / 关系图切换器的 active 样式，保留现有尺寸、图标、交互和语义。
- 让 Desktop 设置导航本身不再裁剪浮层，由 `.settings-nav-body` 单独负责导航内容滚动。
- 覆盖全局设置、项目设置和工作规划等所有复用 `settings-navigation` / `renderProjectSwitcher` 的 Desktop 页面。
- 增加静态回归断言，防止选中态投影和设置导航裁剪重新出现。

## 非目标

- 不修改项目切换行为、路由、数据、键盘语义或菜单内容。
- 不重做 Goal Tree 工具栏和设置页信息架构。
- 不改变普通 Web 与 760px 以下 Companion 的现有布局。
- 不把终端菜单、树筛选器等有意限制在所属面板内的浮层改成全局浮层。

## 方案与边界

- 在 Desktop 专属样式中把视图切换 active 状态改为无投影的轻量 tonal fill；使用现有 Ink / Paper token 混合，保持深浅主题一致。
- 在 Desktop 设置页专属 `.settings-navigation` 规则中显式设置 `overflow: visible`。导航列表继续由现有 `.settings-nav-body { overflow-y: auto; }` 滚动。
- 只修改 `src/web/visual-foundation.ts` 与相关测试；不触碰当前仓库其他未提交功能。

## 验收标准

- [x] Goal Tree 当前视图仍清晰可辨，但不再出现突兀的白色悬浮块和外投影。
- [x] Desktop 全局设置、项目设置、工作规划页面的项目菜单可越过左侧导航边界完整显示。
- [x] 设置导航较长时仍可在 `.settings-nav-body` 内滚动。
- [x] 普通 Web / Companion 的导航溢出规则不被 Desktop 修复覆盖。
- [x] 树筛选、主题菜单、Goal 更多菜单和终端菜单的既有边界与层级不受影响。

## 验证

- `pnpm typecheck`
- `node --import tsx --test tests/web.test.ts`
- `node /Users/yijunwang/.agents/skills/impeccable/scripts/detect.mjs --json src/web/visual-foundation.ts`
- 在真实 Desktop 页面检查 Goal Tree 选中态、全局设置项目菜单、项目设置项目菜单，并补查普通宽度与窄屏边界。

## 假设与开放问题

- 假设用户指出的“选中态”是截图中的 Goal Tree 列表 / 关系图切换器，而不是树节点本身；截图位置和当前 CSS 完全对应。
- 当前没有需要用户决定的开放问题。

## 验证结果

- `pnpm typecheck`：通过。
- `node --import tsx --test tests/web.test.ts`：39/39 通过；沙箱内因禁止监听 `127.0.0.1` 失败，获准在沙箱外重跑后通过。
- 真实页面：浅色、深色选中态的 `box-shadow` 为 `none`，旧 `::after` 底线不显示。
- 真实页面：全局设置与项目设置中，菜单右边界从 `x=398` 跨过导航右边界 `x=310`；边界外命中元素仍属于菜单。
- Companion：700px 实际 viewport 下无横向溢出，Desktop 项目菜单区域按既有断点隐藏。
- 控制台：无 warning / error。
- Impeccable detector：完成一次扫描；只报告该大型既有样式文件中的历史设计系统与动画告警，本次变更行没有新增命中。
