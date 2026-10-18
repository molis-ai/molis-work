# PGT writer 交接

状态：实现已冻结，等待主 Session 正式整体构建及最终验证。基于 PGK `507f454bb`、accepted spec `e3a7b5e5e`（唯一 spec 顶部 W5-10-PGT-01～03）。没有 commit、push 或 PR。

## 实际范围

仅 P 的四个文件：`plugins/native/pages/src/editor-browser.ts`、新 `src/editor-tools.ts`、`plugins/native/pages/README.md`、新 `tests/pages-tools.e2e.test.ts`。旧 `pages-plugin.test.ts` 无需改定位断言。共享 spec/HUGE/门禁快照未动。

新模块接管 14 项定义、heading/list 命令工厂、groups/pressed/opens、screen。入口原位置创建 definitions，原六行 runTool 不动，tools/screen 的闭包直接放在原 handle。工具栏继续调用 keyboard 的唯一 commandToggle；没有新 owner/cache/getView/listener。外部候选已修缩进，原 groups 解释注释随函数移到新模块，除此之外是已批准的 `pages-tools-inline-planned` 候选。

结构：入口 856→804 行、mount 568→537；新模块 66 行、最大函数 editorToolDefinitions 18 行；新测试 181 行、最大函数 46 行（含末尾空行 split 计数）。公开 27 出口不改，55 个相对模块无环。入口仍是巨大单元，本片不代表整个 W5-10 完成。

完整 scoped diff（含两份未跟踪新文件）位于 `pages-tools-scoped.diff`。

## 已验证

1. **基线先行**：生产源码未改时，`node scripts/run-tests.mjs --jobs 2 tests/pages-tools.e2e.test.ts` 通过 3/3，0 fail/skip，15.44s，正式 PGK JS/CSS 706839 B。机器 browser slot 曾排在 w5-dataset-4 后，现已释放。日志 `/tmp/molis-pages-tools-baseline.log`。
2. **新 Chrome 断言**：
   - 14 项完整公开输出、三个分组/可选字段、译文调用顺序且创建时编辑器 DOM 尚不存在；全/部分/空选区 pressed、heading/list pressed；反复 tools/screen 不多写 doc、通知或翻译。
   - strong/heading/list 的实际文档与邻居、选区、focus、通知及真实键盘 Undo；未知 id 不写 doc、不多通知、不抢其他按钮焦点；tone 与 link 真实点击提交到原正文，comment 原外部回调和标记 id 对应。
   - setDoc 后新 heading/marks/邻居、screen 四字段对真实 DOM Range（2px 容差），实际窗口滚动更新 onScreen 与矩形，destroy/remount 后新工具不改旧文档。
3. Pages 两配置 typecheck 通过：`pnpm --filter @molis-ai/molis-work-plugin-pages run typecheck`，日志 `/tmp/molis-pages-tools-types.log`。
4. scoped lint 通过：两个改动 src 与新测试，日志 `/tmp/molis-pages-tools-biome.log`。
5. `pages-plugin.test.ts` 127/127、0 fail/skip，一次通过，日志 `/tmp/molis-pages-tools-source-tests.log`。此时 dist 仍 PGK，最终整体构建后由主 Session 复核。
6. `git diff --check` 通过。实际 diff 检查没有范围外改动。
7. 结构对照：D 中 `node check-pages-tools.cjs --applied` 与 `node check-pages-tools-variants.cjs`，合并日志 `pages-tools-applied-ast.log`。前者核对原定义/类型/顺序、group 分支和字段、screen、helpers、mount 其余部分及其他函数/公开声明；后者把 listCommand 的固定三种 id、执行时 state/dispatch 回调逐项展开为原三条表达式，检查 helper 正文和出口相同，handle 两闭包原本只有声明/返回引用，内联不改其他调用时机。P 两源码与修好缩进的最终候选逐字节相同。

## 资源证据及剩余验证

未自行运行正式 build、未排下一次 build slot、未对新生产实现复跑 Chrome。上轮外部同参数预演：原源码 raw 与 PGK 正式 dist 逐字节相同，served 706839 B；最终候选 706825 B（-14）。仅缩进和非保留注释移动不改变 AST，但仍须主 Session 正式构建/门禁确认最终值。原始可行性结果见 `pages-tools-preview.md` 与 `pages-tools-variant-bytes.json`。

主 Session 后续：整体 `pnpm build`；README 必跑及实际受影响非浏览器用例；`pages-tools.e2e`、`pages-keyboard.e2e`、`context-toolbar-panes.e2e`、`contextual-interaction.e2e`，结合既有 Pages 主链路回归。后两项复用真实工作台接线、docked panel、1440/390 窄屏及异步冻结范围，不复制新矩阵。然后完整 merge-base health/API/boundary/资源门禁、下降快查、最终 scoped diff 和独立 review。writer 不再修改上述源码、测试和 README，除非主 Session 指派修复。
