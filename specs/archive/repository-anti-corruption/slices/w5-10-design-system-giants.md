# W5-10 R4a：设计系统的巨大单元（纯搬移）

状态：开发完成，等一轮评审（2026-10-24）；纯搬移，由逐字节比对、`pnpm health:check` 和下列测试守住，全量交统一验证窗口。

验收编号：RAC-370～379。待办号：BL-550、BL-551（BL-552～554 空着）。管 `privileges.md` PG-036 的巨大单元部分；状态列不在本片改。

## 1. 目标

`packages/design-system` 在合并基线上有 6 个巨大单元（`--report`）。本片把其中 4 个拆到阈值以下，另 2 个本来就是登记的样式表例外，不动：

| 单元 | 拆前 | 拆后 |
| --- | --- | --- |
| `styles/craft-finish.ts` 文件 | 2,017 行 | 283 行，样式切在三份各 560～600 行的文件里 |
| `primitives/catalog.ts` 文件 | 944 行 | 约 230 行 |
| `primitives/catalog.ts#renderPrimitiveCatalog` | 648 行 | 约 30 行 |
| `plugin-component-client.ts#createPluginComponentClient` | 753 行 | 约 20 行（最大一层 143 行） |
| `styles/primitives.ts`、`styles/momentum.ts` | 登记为例外（样式表） | 不动 |

## 2. 做法

- **`craft-finish.ts`**：把 `CRAFT_BASE_STYLES` 的 1,720 行 CSS 在小节注释处切成 `craft-finish-bar.ts`（令牌、桌面、标题栏、插件栏、底栏到概况之前）、`craft-finish-assistant.ts`（助手面板）、`craft-finish-pages.ts`（手机底栏、项目菜单、目录、控件、浮层、插件页、减少动效），选择器片段在 `craft-finish-selectors.ts`；`craft-finish.ts` 按顺序相接。不登记例外：脚本 `CRAFT_FINISH_CLIENT_SCRIPT`（235 行）仍在 `craft-finish.ts`，搬走会让「文本程序」「空 catch」计数在新文件从 0 变 1，门禁不放；脚本归 W5-04 打包成 TypeScript（BL-550）。
- **`catalog.ts`**：章节搬到 `catalog-controls.ts`、`catalog-layout.ts`、`catalog-compose.ts`，`section`/`mark`/`specimen` 在 `catalog-parts.ts`；`renderPrimitiveCatalog` 只列章节。页尾 175 行演示脚本改写成 `src/browser/catalog.ts`（TypeScript，`tsconfig.browser.json` 检查），esbuild 打成 `dist/catalog-client.js`，由 `page-clients.ts` 读（同其余页面程序）；行为照原文，只在 `.mw-dir` 找不到时不再做事（原来也是 `?.`）。
- **`plugin-component-client.ts`**：753 行的闭包按层拆成十个函数，分在 `plugin-component-{kit,records,controls,output,part,types}.ts` 与 `plugin-component-client.ts`；每层接收「共享状态 + 前面各层」返回自己新加的函数；闭包里的可变量（`view`、`selection`、`currentPage`、`epoch`、`disposed`、`fresh`）搬到共享状态上，用 `c.view` 读写。表单提交处理从 `createPart` 里抽成 `onSubmit(part, form, submit, schema)`（同一个函数体，只是不再嵌在 142 行的 `createPart` 里）。仍用 `toString` 拼成同一个工厂（`PLUGIN_COMPONENT_CLIENT_FACTORY_SCRIPT` 求值得到的函数不变），所以层函数只能用参数和 DOM，不用模块级 import。

## 3. 不做

- 不改任何样式、HTML、行为、公开导出（`packages/design-system/src/index.ts` 的导出名不变）。
- 不动 `primitives.ts`、`momentum.ts`（例外样式表）、`styles/` 里其他文件。
- 不把渲染器改成打包模块（BL-551，W5-04），不把 `CRAFT_FINISH_CLIENT_SCRIPT` 改成 TypeScript（BL-550）。

## 4. 验收

| 编号 | 内容 | 证据 |
| --- | --- | --- |
| RAC-370 | 规格板拆分后：`PRIMITIVE_CATALOG_IDS` 的每个 `data-primitive` 都在，章节 id 不重复、顺序不变，演示脚本来自构建出的 TypeScript | `tests/design-system-giants.test.ts` |
| RAC-371 | `CRAFT_FINISH_STYLES` 与拆分前逐字节相同（拆分前后各出一份比对，PR 正文记 sha）；三份样式各在规则之间结束（花括号配平），按 bar → assistant → pages 相接 | 逐字节比对；同上测试 |
| RAC-372 | `PLUGIN_COMPONENT_CLIENT_FACTORY_SCRIPT` 求值得到工厂函数，含十个层函数，文本里没有 import | 同上测试 |
| RAC-373 | 生成插件渲染器行为不变：创作台组件、复合页、规格板各条用例通过 | `tests/plugin-composition.e2e.test.ts`、`tests/agent-built-plugins-components.test.ts`、`tests/plugin-builder-diagnostics.e2e.test.ts`、`tests/studio-english.test.ts`、`tests/one-motion.test.ts`、`tests/soft-workbench-refinement.test.ts` |
| RAC-374 | 规格板行为不变：规格板的标本、条件、溢出各条浏览器用例通过 | `tests/board-specimens.e2e.test.ts`、`tests/board-conditions.e2e.test.ts`、`tests/board-overflow.e2e.test.ts` |
| RAC-375 | 设计系统不再有本片拆掉的巨大单元；门禁数字不变或变小（巨大单元 113 → 109，文本程序、空 catch、`as unknown as` 等不增） | `node scripts/check-health-gates.mjs --base origin/main` |
| RAC-376 | 公开 API 与动作合同不变（设计系统没有 API 快照；`index.ts` 导出名与拆分前的 `Object.keys` 相同） | 导出名比对；`pnpm boundary:check` |
| RAC-377 | 页面资源：`plugin-builder.js` 内嵌渲染器，由 116132 涨到 118672 字节（+2540，2.2%）。涨的原因是层间交接的共享状态键名在压缩后保留（约 1.6 KB）加层函数外壳；位置参数交接可收回约 1.2 KB，但层签名难读，不取。作为一次性放行写进 `APPROVED_CEILINGS`，W5-04 改成打包模块后收回（BL-551）。规格板脚本不在页面资源清单里 | `pnpm page-assets:check`（要先 `pnpm build`） |
| RAC-378 | `README` 的文件表与 `HUGE-CLASS-MIGRATION.md` 的三行判定跟着改 | 文档 |
| RAC-379 | 空着 | |
