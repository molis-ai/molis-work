# WI3：Pages 块与插入

depends_on：01-library-and-kernel。可与 02 并行，但本对话在 02 之后串行，共享 `editor-browser.ts` / `styles.ts` / 十份模板。  
完成等级：**3 功能可用**（能插入块、能排序、能从 `/` 起笔）。整期 4 不在本 WI。

## 背景目标

WI1 只有段落、标题、列表。这一刀把文档从「能写字」收成 Notion 式块：Callout、清单、代码、表、Toggle、分隔线、目录；插入走 `/`、`+`、手柄上下排序、插入线。模板补上这些块。

## 当前行为与问题证据

内核 schema 只有 `paragraph` / `heading` / `bullet_list` / `ordered_list` / `list_item`。没有 slash 菜单、块手柄、插入线。十份模板只用标题和列表。

## 范围

1. Schema 新节点（均 `group: "block"`，除表内部单元格）：
   - `callout`：attrs `tone`（info/warn/success/plain），内容为块。
   - `task_list` + `task_item`：attrs `checked`。
   - `code_block`：attrs `language`（可空），纯文本。
   - `table` / `table_row` / `table_cell` / `table_header`：最小可编辑表，不接 Dataset。
   - `toggle`：attrs 无；第一子节点是 title（paragraph），其余折叠内容。
   - `horizontal_rule`：叶子块。
   - `toc`：只读目录，按当前文档 H1–H3 生成；不手写条目。
2. 插入：
   - 空段落输入 `/` 打开块菜单；选一项插入并关掉菜单。
   - 块左侧 `+` 在该块前插入空段并打开同一菜单。
   - 块左侧手柄：上移/下移相邻块（不跨进表单元格内部当整表移动时移动整张表）。
   - 块之间悬停出现插入线，点击插入空段。
3. 升级十份模板：在 WI2 结构上加入 Callout 和至少一处清单或表（哪份用哪块见实现，不另开模板市场）。
4. 旧文档没有这些节点仍能打开（未知节点丢掉或变成段落，不崩内核）。
5. 内核仍是 IIFE；菜单/手柄 DOM 在 `editor-browser.ts`，样式在 `PAGES_STYLES`。

## 非目标

Markdown 块、顶栏插入、缩放、行引擎、三栏、连线、拖块配置、多栏、嵌 Goal/Form/Dataset/PPT。备注/评论（WI4）。`@` 与卡（WI5）。

## 使用场景

打开一篇 → 空行敲 `/` → 选 Callout → 写下提示。手柄把 Callout 移到标题下。`+` 在列表前插入分隔线。目录块随标题更新。刷新后块还在。

## 方案与关键决策

- vanilla ProseMirror，不用 TipTap。表用 `prosemirror-tables` 若仓库已有或体积可接受；否则最小自定义 table schema + Tab 移格。
- `/` 菜单是编辑器 overlay，不是 `window.prompt`，也不进 factory string。
- `toc` 不存用户条目，`toJSON` 仍是空 toc 节点；渲染时读文档 headings。
- `save()` 仍只 POST，不重挂。
- 未知节点：`nodeFromUnknown` 已 catch 整篇失败时回空文档；本 WI 给 schema 加上新节点，旧文档缺节点仍是合法 JSON。

## 输入输出与依赖

允许修改：本目录 spec；`plugins/native/pages` 的 `editor-browser.ts` / `styles.ts` / `en.ts` / `templates.ts` / `document.ts`（若校验放宽）；`tests/pages-plugin.test.ts`。不改 Goals/Artifacts。不改 Host 路由除非模板 HTTP 无需新接口。

## 验收标准

1. `/` 能插入上述每类块；刷新后 body JSON 仍含对应 `type`。
2. `+`、手柄上下、插入线能改块顺序；保存后顺序还在。
3. 清单勾选会进 `checked` 并自动保存。
4. 目录随 H1–H3 变化。
5. 十份模板新建后含至少一种 WI3 块。
6. `save()` 仍不含 `fillEditor` / `setDoc`。
7. 内核仍是 IIFE，不是 ESM。

## 验证命令

```bash
pnpm --filter @molis-ai/molis-work-plugin-pages --filter @molis-ai/molis-work-app-workbench build
node --import tsx --test --test-concurrency=1 tests/pages-plugin.test.ts
```

## handoff

产物：块 schema + 插入交互 + 升级模板。下一切片接备注评论（WI4）或 `@`/卡（WI5），不要重做库壳。
