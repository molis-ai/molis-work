# R-25：设置页 Esc 关不掉对话框——只读定位（② 10-23）

结论：#1087 引起；#1085 不在这条链上。#1087 没有新加 Esc 处理器，新挂的插件客户端也没有。它让外壳里一个 2026-09-02 就存在的空值判断开始起作用。

## 链路

1. `apps/workbench/src/scripts/client/initialization.ts:184`（外壳 window 的 keydown，2026-09-02 起未改）：
   `if (event.key === "Escape" && !feedFilterPanel?.hidden) { event.preventDefault(); setFeedFilterOpen(false); … }`
   页面上没有 Feed 筛选面板时，`feedFilterPanel` 是 null，`!null?.hidden` 得 `!undefined`，即 true。于是每个冒泡到 window 的 Esc 都被 preventDefault，原生 `<dialog>` 的 Esc 关闭被取消。
2. `feedFilterPanel` 由 `bootstrap.ts:41` 的 `q("[data-feed-filter-panel]")` 取得。这个面板只在 Feed 的 workbench 舞台里（`plugins/native/feed/src/ui.ts` 的 `renderFeedWorkbench` → `renderFeedStageToolbar`，带 `hidden`）。
3. main 上：`goals-page-renderer.ts` 的舞台池无条件画 `renderFeedNativePluginSurface(view, "workbench", …)`。Feed 不启用也有一个隐藏的筛选面板，所以这条分支不会走到。
4. #1087 上：这一行删了，Feed 舞台改由 `renderDeclaredStages` 画，只在 `enabled` 含 `feed` 时画。
5. 两个红用例的项目都没有启用 Feed：
   - `project-settings-navigation.e2e:83` 用 `openGoalBrowser(t, "empty")` 加 `POST /api/settings/projects`；
   - `write-checkers-settings.e2e:92` 用 `"user"` 模式，`createProject` 后不加项目插件。
   空项目显示的只有个人插件：issues cognia plugin-builder images jelly shelf lingguang todo pages form dataset ppt alchemist workflows，没有 feed、inbox、schedule。

## 已排除

- 退到 navigator 以后新画的舞台：cognia、plugin-builder、images、jelly、todo。它们和 pages、form 等一样都有客户端，`defer` 把它们变成 frame，内容是 `<script type="application/json" data-plugin-document>`，不是活 DOM。`deferred-plugin-client.ts` 只在 surface 不在 `[hidden]`、`[data-surface-pool]` 里时才挂载（iframe + srcdoc）。设置页上它们都在隐藏的池里，客户端没有挂载，父页那侧的监听（context.ts、navigation.ts、file-picker.ts）也没有登记。
- 外壳其余 Esc 处理器：`tab-workspace.ts:1660` 的 `openLayer` 看到 `dialog[open]` 就让路；`navigation-presentation.ts:313-314` 在 dialog 内直接返回；`immersive-navigation.ts:263` 也以 `dialog[open]` 让路；其他几个只挂在自己的元素上。

## 可以区分的预测（给 Codex）

- batch-8 上，空项目里打开任意外壳页面的模态对话框，按 Esc 都关不掉；`seeded` 项目（含 feed）里能关掉。
- 在页面里执行 `document.querySelector('[data-feed-filter-panel]')`：#1087 空项目上是 null，main 上不是 null。
- 只合 #1087 就复现；只合 #1085 不复现。

## 修法（建议）

一行：把 `initialization.ts:184` 改成 `feedFilterPanel && !feedFilterPanel.hidden`（或 `feedFilterPanel?.hidden === false`）。`events-primary.ts:276` 是同样的写法：点击时会调 `setFeedFilterOpen(false)`，但它遇到 null 就提前返回，没有害处，可以顺手一起改。两个红用例本身就是回归测试。

#1087 在批次里，不能推送，所以建议从 main 开一个小 PR 修这个早就存在的判断，先合进 main，批次 8 再带上它重跑；#1087 本身不用动。
