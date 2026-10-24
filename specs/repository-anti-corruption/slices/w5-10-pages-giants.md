# W5-10 R4d：Pages 编辑器余下的巨大单元（纯搬移）

状态：开发完成，等一轮评审（2026-10-24）；纯搬移加两处等价的去重（为了不涨页面资源），由构建、`pnpm health:check`、页面资源门禁和下列测试守住，全量交统一验证窗口。

验收编号：RAC-379（本片只剩这一个编号，下面分 a～d 写）。待办号：未使用（BL-552～554 空着）。接 `anticorr/w5-10-design-system-giants`（R4a）之后的另一个分支，两边不碰同一个文件。

## 1. 目标

合并基线上 Pages 的两个巨大单元：

| 单元 | 拆前 | 拆后 |
| --- | --- | --- |
| `src/editor-browser.ts#mount` | 451 行 | 87 行 |
| `src/editor-browser.ts` 文件 | 719 行 | 271 行 |
| `src/store.ts#PagesStore` | 346 行 / 28 方法 | 288 行，方法数低于阈值 |

## 2. 做法

- **`mount`**：按职责拆成四个内部模块，入口只装配并创建视图。
  - `editor-popup.ts` 的 `createEditorPopup(options)`：弹层节点、`state`（冻结范围的 `token`、`request` 序号、是否停靠）、`showPop`/`hidePop`/`anchorPop`/`placePop`/`reclaimPop`。原来的 `let hidePop` 会被 `showPop` 换成新函数，这里改成一个稳定的 `hidePop`，内部转调当前那一个，调用次序与参数（含按钮点击时被当成 `fromPanel` 传进来的事件）不变。
  - `editor-popup-forms.ts`：`createBlockForms`（块备注、文字/背景颜色、提示块图标与颜色）、`createTextForms`（链接、评论），连同它们用的 `applyComment`、`fillCalloutStyle`。
  - `editor-ai.ts`：`createEditorAi` 的 `runAiCommand`（写作请求）与候选面板，连同 `replaceSelectionText`、`docPlainText`。
  - `editor-view-props.ts`：节点视图表 `pagesNodeViews`，输入、三击、点击、鼠标按下、复制、剪切、拖过的处理函数；`blur` 要用预览与弹层，仍留在入口里拼进去。
- **`PagesStore`**：生成一组（`beginGeneration`、`completeGeneration`、`failGeneration`、`saveGeneration`、`generation(s)`、`releaseGenerationAttempt`、尝试键）搬进抽象基类 `PagesGenerationStore`（`store-generations.ts`），`PagesStore extends PagesGenerationStore`；构造参数、公开方法、导出名不变。
- **去重（为了不涨页面资源）**：编辑器脚本是整包原样发给浏览器的（只去空白），新增的函数外壳与解构会让字节数涨约 1 KB。所以顺带做了几处行为等价的合并：15 处 `mousedown` 取消默认收成 `keepFocus`、3 处停止冒泡收成 `keepOut`（`editor-view-ui.ts`）；节点视图里带翻译的五个包装和三个卡片包装各收成一个小函数；提示块样式的图标与颜色按钮收成一个 `choice`；弹层回到舞台的两处相同代码收成一个函数。

## 3. 不做

- 不改公开导出（27 个）、`PagesEditorHandle`、DOM 类名、文字、存储、动作、样式。
- 不动 `client.ts`（归 W5-04）、`styles.ts`、其他包。
- 不登记例外，不改门禁脚本、`limits.json`、CI。

## 4. 验收

| 编号 | 内容 | 证据 |
| --- | --- | --- |
| RAC-379a | `mount` 与 `PagesStore` 不再是巨大单元，没有新增巨大单元；文本程序、空 catch、`as unknown as` 等数字不增（巨大单元 113 → 111） | `node scripts/check-health-gates.mjs --base origin/main` |
| RAC-379b | 页面资源不涨：`/assets/molis-work-pages-editor.js` 710,427 → 710,405 字节，预算同步降低，没有用 `APPROVED_CEILINGS` | `pnpm page-assets:check`（要先 `pnpm build`） |
| RAC-379c | 弹层、写作、工具、预览、键盘各条浏览器动线不变 | `tests/pages-tools.e2e.test.ts`、`tests/pages-previews.e2e.test.ts`、`tests/pages-keyboard.e2e.test.ts`、`tests/content-editing-regressions.e2e.test.ts` |
| RAC-379d | 存储行为不变：生成租约、取消与撤权后不写业务记录、发布与生成各条非浏览器用例，结果与基线工作树逐条相同（基线上本来就失败的 6 条——`pages-project-deleted` 3 条、`action-before-effect` 里等模型的 3 条——这里同样失败，不是本片引入） | `tests/pages-generation-lease.test.ts`、`tests/pages-plugin.test.ts`、`tests/pages-actions.test.ts`、`tests/pages-project-deleted.test.ts`、`tests/action-before-effect.test.ts` |
