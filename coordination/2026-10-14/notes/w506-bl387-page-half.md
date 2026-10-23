# W5-06：BL-387 页面那一半（③，等 #1098）

状态：等 ② 的 #1098（`feat/w5-06-manifest-placement`，W5-06 第 2b 片）合入。合入前不开工。

## ② 10-23 给的读法
- `@molis-ai/molis-work-app-workbench` 新导出：
  - `creatableKinds(enabled)` → `{ id, station, title }`（类型 `PluginCreatableKind`）
  - `homeStarts(enabled)` → `{ id, title, hint, glyph }`（类型 `PluginHomeStart`）
  - `id` 是项目插件 id（如 `pages`），不是 `plugin_id`；起点的图标字段叫 `glyph`，不叫 `icon`（② 10-23 更正）。两个类型都在 `apps/workbench/src/plugin-catalog.ts`。
- 两个函数都只列本项目显示的插件，按插件切换列表的顺序排。
- 新建的默认标题 =「未命名」+ title（Pages 是「未命名文档」）。

## 合入后要删
- `apps/workbench/src/goal-inputs-html.ts:22` 的 `CREATE`
- `apps/workbench/src/scripts/client/placement.ts:532` 的 `names`
- `apps/workbench/src/scripts/client/project-home.ts:217-221` 的 `starts`

## 注意
- 新建入口的顺序会变：原来手写的是 Pages、PPT、Form、Dataset，改后按声明顺序是 Pages、Form、Dataset、PPT。钉了旧顺序的断言要按预期变化改，不许删。
- 起点的标题、提示、图标和手写表逐字一致（goals 用 target，pages 用 file，lingguang 用 idea），由 `tests/view-placement-declarations.test.ts` 的 RAC-78 钉住。
- 做完删 BL-387 的行，提交说明里写编号。
- BL-388（`objectTabPlugins()` 只读构建期内置目录）不在这一片，等 2b 的运行时目录。

## 起点
- 从 main 开新分支，等 W5-06 第一片（`migrate/w5-06-shell-plugin-rows`，本地提交 b4597815d + 0c0c0039d）合入之后再做，两片都碰 placement.ts 和 BACKLOG。
