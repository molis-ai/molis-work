# 插件切换器：一张网格管「装没装」和「常驻 Dock」

状态：已实现，等用户验收（2026-10-02；同日用户看过第一版后追加两条：①插件市场与插件创作工作台移到切换器最上面、做成两个独立按钮；②移除用红色垃圾桶代替 ×）。用户 2026-10-01 提出：切换器里「常驻在 Dock」的长列表与上面的插件网格合成一份，每个插件末尾加按钮；没装的置灰，装了的有颜色；后面要能去除；按钮照 DropAgent 目录行那样，悬停才出现，动效舒服；添加和移除要无感刷新。按钮样式用设计系统的 `mw-btn`（浅灰次按钮、深色主按钮）。

## 背景与目标

底栏左边的切换器（`[data-plugin-picker-popover]`）原来有两份清单：上面按用途分组的插件网格（这个项目装了的），下面一长串「常驻在 Dock」的勾选行（同一批插件再列一遍）。要装插件得去插件市场，装完整页刷新。

目标：

1. **一张网格**。项目能有的每个插件只出现一次，按原来的分组；装了的是正常深色、点开就是那个插件，没装的置灰、点不动。
2. **每个插件两个图标按钮**：📌 常驻 Dock（灰 = 没常驻，深色 = 已常驻）；＋ / × 添加或移除（同一个按钮，加号在装了之后转 45° 变成叉）。
3. **悬停才出现，行自己让位**：静止时一行只有名字和一句说明，常驻的在行尾有个小钉子；鼠标移上去（或键盘聚焦到这一行）时钉子让给按钮，说明被挤短，按钮淡入。照 DropAgent 目录行（`specs/archive/list-row-hover-yield`）。
4. **添加与移除就地生效**，不整页刷新：条目原地变色、按钮图标换样、Dock 里的钉子进出、新插件的舞台页就地接上。
5. **插件市场与插件创作工作台是切换器最上面的两个按钮**：与搜索同一行（放不下时换到搜索下一行），在「项目首页」那一行之上；不是列表里的行，因为它们是「去做一件事」而不是「去一个地方」。
6. **移除的图标是红色垃圾桶**：没装时是 ＋，装了换成红色垃圾桶（同一个按钮、同一个位置，原地换样）；确认时垃圾桶填成红色。

## 当前行为与问题证据

- `renderWorkbenchBar` 的 `dockSettings` 里有 `[data-dock-choices]`，客户端 `paintPins` 把每个插件再画一行勾选（`navigation-presentation.ts`）。
- 市场的「添加 / 移除」成功后 `saveUiState(); location.reload()`（`plugin-workbench.ts`）。
- 项目页对插件的依赖在渲染时定下：条目、`view.plugin_stages` 里的舞台页、Feed 的目录栏、Coding 的设置行。

## 范围与非目标

做：

1. `renderPluginRail`：每个插件一个条目（装了 / 没装同一种结构，客户端改属性即可换状态），条目末尾的两个按钮；没装的插件来自市场目录（`pluginMarketCards()`）减去这个项目已有的；删掉「常驻在 Dock」列表。
2. 悬停出现与让位的样式与动效（只用 `--dur-*` / `--ease-*`，只动 `opacity` 与 `transform`，让位是即时的）；减少动态效果下全部为 0s。
3. 客户端 `plugin-membership.ts`：发请求（市场用的同一个）→ 重新读一次项目页 → 条目、舞台页、Dock 就地对齐；对不上就按旧办法保存状态后重载一次。
4. 移除要确认一次：第一次点，条目的第二行换成「再点一次移除；同时移除：…」，叉变红，3 秒不点自己收回；添加时的伴随插件写在按钮提示里，装完提示一次。
5. 键盘：切换器仍是一个 Tab 停靠点；→ 进入这一行的按钮，← 回到条目，↑ ↓ 在同类按钮间走。
6. 市场的添加 / 移除，在当前项目上走同一个就地流程。

不做：

- 不改领域规则：加上伴随插件、移除时连带依赖它的插件，仍由 Projects 服务决定。
- 不改个人插件「移除」的语义（用户 2026-10-01 定为停用，BL-088，第二步统一装配时实现）；这里的文案只说「从本项目移除」，不承诺更多。
- Feed、Coding 的添加 / 移除仍整页刷新一次（见下）。
- 工作室里装的运行时插件（`installed`）只有常驻按钮：从项目里拿掉是创作台的事。

## 方案与关键决策

- **没装的怎么显示**：市场目录里这个项目还没有的插件，按各自的分组出现在网格里，整行置灰（`--faint`），点不动。「有颜色」：设计规范里插件不带身份色（`Plugins carry no identity colour`），所以「有颜色」做成正常深色，没装的是灰；装上时只有色调在 250ms 里醒过来。
- **一种结构**：装了与没装的条目是同一个按钮，没装的带 `aria-disabled`、没有 `data-plugin-id`；这样客户端改属性就换了状态，CSS 的过渡才连得上。`data-plugin-id` 仍只属于装了的，Dock、键盘、助理都只认它。
- **按钮**：`mw-btn mw-btn--sm mw-btn--icon-only`。📌：没常驻 = 次按钮、图钉斜 32°；常驻 = 主按钮、图钉立正（弹簧 250ms）；没装时不可用。＋：没装 = 主按钮、图标是加号；装了 = 次按钮、图标是**红色垃圾桶**（`--red`；悬停时底色带一点红）。按钮里同时有加号与垃圾桶两个图形（`.plugin-toggle-add` / `.plugin-toggle-remove`），条目的状态类决定显示哪个，换样是 250ms 的缩放加渐变（只动 `opacity` 与 `transform`），所以状态变化仍只是改属性。确认移除时垃圾桶按钮填成实心红（`--danger-action`）、图形变白。Shelf 与灵光永远在底栏右边，它们的图钉是「已固定」且不可点。Goals 是项目的核心，不能移除。
- **头部**：`.plugin-picker-head` 里是搜索和 `.plugin-picker-extend`（`data-global-menu`，客户端按它找市场与创作工作台、标当前页）。两个按钮是 `mw-btn mw-btn--secondary mw-btn--sm`（按钮高 34px，与搜索同高），图标 + 名字，市场按钮里带更新数；当前页（`aria-current`）是淡底加描边。窗口里头部 `position: sticky`，长列表在它下面滚动，滚到的条目用 `scroll-padding-top` 避开它；手机上搜索占一行、两个按钮平分下一行，每个 44px，头部随列表滚走。点它们和点条目一样，打开页面并收起切换器。没有创作工作台插件的项目只有市场一个按钮。
- **让位**：`.plugin-rail-tile:is(:hover, :focus-within, .is-confirming)` 时条目 `padding-right` 即刻让出 72px（不动画，不重排），按钮 `opacity 0→1`（130ms）并从右侧 8px 滑入（250ms），第二个晚 32ms。没有指针的设备按钮常在。
- **就地更新**：只读、不整页替换。条目逐个按服务端当下渲染的属性对齐（客户端自己的状态——常驻、询问中、忙——不动）；`[data-surface-pool]` 里多出的舞台页插入、少了的撤掉（撤之前让显示它的窗格先退回）；对话框里选项的 `data-*-mode` 对齐。结束后用 `molis-work:plugins-changed` 通知 Dock 重画（保持已有的钉子，新的弹入，走的缩出）。
- **什么时候退回整页刷新**：加或减的插件在 `RELOAD_ON_MEMBERSHIP_IDS`（Feed 的目录栏、Coding 的设置行在页面加载时一次接上，目前是这两个）；目录栏或设置行的条目与服务端不一致；对齐后的结果与服务端不一致；读页面失败。刷新前先 `saveUiState()`。
- **乐观**：点下去条目立刻换样；服务端拒绝则换回并提示。同一时刻只处理一个变更。

## 输入输出与依赖

输入：`POST/DELETE /api/settings/projects/:id/plugins`（已有）、项目页 HTML（`GET /projects/:id/`）。输出：条目、舞台页、Dock、`molis-work:plugins-changed`。依赖：`BUILTIN_PLUGIN_REGISTRY.companions`（伴随与被依赖，写在条目的 `data-along` / `data-dependents` 里）。

## 文件 / 模块边界

允许：`apps/workbench/src/{immersive-shell,plugin-catalog}.ts`、`scripts/client/{plugin-membership,navigation-presentation,immersive-navigation,plugin-workbench,initialization}.ts`、`packages/design-system/src/styles/craft-finish.ts`、`i18n/gap-en.ts`、相关测试、`DESIGN.md`。
禁止：Projects 服务规则、插件运行时、凭据。

## 验收标准

1. 切换器里没有 `[data-dock-choices]`，也没有「常驻在 Dock」小标题，底部没有第二份清单；市场与创作工作台是最上面的两个按钮（与搜索同一行或其下一行，在「项目首页」之上），不在 `.plugin-rail-items` 里。
2. 项目没有的插件（市场目录里的）以灰色条目出现在各自分组；它们没有 `data-plugin-id`，点不动，不会出现在 Dock。
3. 静止时条目的按钮不可见（`opacity 0`、不可点），常驻的行尾有小钉子；悬停或聚焦后按钮可见可点、钉子隐去。
4. 点 📌：Dock 立刻出现 / 去掉该插件，刷新后还在；`aria-pressed` 与按钮配色一致；没装的不可点；Shelf / 灵光 的钉子不可点。
5. 点 ＋（没装的）：条目变色、变成可打开、加号换成红色垃圾桶，页面**不刷新**（页内变量还在）；点开那个插件正常加载。
6. 点垃圾桶：第一次只出现确认（垃圾桶填成红色），行不变；3 秒不点、点别处、按 Esc 都收回；第二次移除：条目变灰、Dock 里的钉子走掉、正显示它的窗格退回，页面**不刷新**；连带移除的插件一起变灰并在确认里写明。
7. 添加带伴随插件时，装完提示「同时添加了：…」。
8. 加或减 Feed / Coding 仍整页刷新一次，刷新前保存页面状态。
9. 市场里对当前项目的添加 / 移除走同一个就地流程，市场卡片状态随之更新。
10. 键盘：Tab 进切换器是一个停靠点；→ 进入这一行的按钮，← 回条目，↑ ↓ 在同类按钮之间走；Esc 先收回确认，再关切换器。
11. `prefers-reduced-motion`：过渡为 0s，状态仍切换。
12. 浅色 / 深色，1440 / 1024 / 390：静止与悬停都没有重叠、裁切、出界（版面审计）。
13. 头部：1440 宽时两个按钮在搜索右边、同一行；390 宽时在搜索下一行、平分、高 ≥ 44px；点市场打开市场并收起切换器。

## 验证命令

```
pnpm build
node scripts/run-tests.mjs tests/plugin-picker-pins.test.ts tests/plugin-picker-pins.e2e.test.ts tests/desktop-tui.test.ts tests/characters-appearance.test.ts tests/i18n.test.ts tests/client-script-undeclared.test.ts
node scripts/run-tests.mjs tests/immersive-directory.e2e.test.ts tests/immersive-workbench.e2e.test.ts tests/plugin-market-upgrade.e2e.test.ts tests/workbench-tab-workspace.e2e.test.ts
pnpm boundary:check
```

## 假设与开放问题

- Feed、Coding 的页面部分在加载时一次接上；把它们改成可以随时接上、撤下之后，从 `RELOAD_ON_MEMBERSHIP_IDS` 里删掉对应的 id 即可，别处不用改。
- 个人插件移除后的真正停用（动作拒绝、搜索与助理不可用）见 BL-088，不在这里。
