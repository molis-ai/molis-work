# WI9 Pages 对齐 Notion：块操作、链接、光标

完成等级：**3 功能可用 → 4 内部完整**（按轮次推进）。不宣称可发布。

depends_on: `08-visual-polish`

## 背景目标

WI8 把阅读面和 hover/拖拽做到能看了，但作为 Notion 式文档工具还缺基本动作：写不了超链接，块菜单只有上移/下移/备注，卡片/分隔线前后落不了光标。这条 WI 是长程目标「Pages 达到 Notion 的质感、功能和顺畅度」的执行容器，按轮次补齐并逐条留证据。

## 当前行为与问题证据

- `plugins/native/pages/src/schema.ts` 的 marks 只有 strong/em/underline/strike/code/comment，没有 `link`：选中文字没有任何入口能加超链接，粘贴 URL 也只是纯文本。`styles.ts` 里已有 `.ProseMirror a` 规则，但永远匹配不到。
- 块手柄菜单只渲染「上移 / 下移 / 备注」三项，没有转换为、复制、删除；换块型只能删掉重敲。
- 插件列表里没有 `prosemirror-gapcursor` / `prosemirror-dropcursor`：文末是 `task_card`、`calendar`、`toc`、`horizontal_rule` 这类 atom 时，键盘走不到它后面，只能靠鼠标点别处。
- Backspace 在标题或列表项行首走 `baseKeymap`，直接和上一块合并，而不是先脱一层格式。
- 没有选块键：Esc 只被 Slash 菜单用掉，选不中整块。

## 范围与非目标

做（本轮）：

1. `link` mark：格式条按钮 + `Mod-k` + 弹层编辑/移除，点击链接新窗口打开，粘贴 URL 到选区自动加链，`href` 只收可导航协议。
2. 块菜单补齐：转换为（段落/H1–H3/无序/有序/清单/Callout/Toggle/代码，两级菜单）、复制、删除，保留备注/上移/下移。
3. `gapCursor()` + `dropCursor()`：atom 块前后能落光标，原生拖放有插入线。
4. 键盘：`Mod-d` 复制当前块、Esc 选中整块、行首 Backspace 先脱一层（标题→段落，列表/清单/Callout/Toggle→提出）。

做（第三轮）：

5. 文字颜色与背景高亮：两个 mark（`font_color` / `highlight`），格式条「A」按钮开双排色板，取值限定在设计系统 hue 白名单。
6. 嵌套：Tab / Shift-Tab 对待办列表同样生效；三层以内的无序/有序列表用不同 marker 区分层级。
7. 空态占位：整篇空白时不必聚焦也显示「输入 / 插入块，或直接写」。
8. 键盘：`Mod-a` 渐进全选（先当前块，再整篇）。

做（第四轮）：

9. 占位覆盖到所有空块：空标题显示「标题 N」，列表项 / 待办 / Callout / Toggle 里的空段落各给自己的词，表格单元格不给。
10. 块菜单加「颜色」二级面板，对整块上色 / 清色。
11. 动效补齐：块 hover 底色和阴影带过渡、块手柄淡入、全局 `prefers-reduced-motion` 兜底。

做（第五轮）：

12. 代码块：上方常驻语言选择条 + 悬停出现的复制按钮，13 种语法的高亮，语言名走别名折叠与白名单。

做（第六轮）：

13. Callout：图标与颜色解耦，点左侧图标开选择器；颜色接到同一套九色板；四个旧色调（info/warn/success/plain）渲染保持不变。

做（第七轮）：

14. 拖拽改层级：握把对准光标下的那一行（含列表项、Callout / Toggle 里的子块）；落点线跟着横向偏移，右移一档嵌进上一个能装子块的容器，左移提出来。原地放下不改文档。

做（第八轮）：

15. 多块选择：握把点一下选中该行，Shift 再点或选中后 Shift+↑/↓ 把连续的行扩进去。删除、复制、拖拽作用在整组上。选区里如果包含父块，子块跟着走，不单独再处理一次。

做（第九轮）：

16. 上移 / 下移对任意一行生效，不只顶层块：菜单和 `Cmd+Shift+↑/↓` 在同级兄弟之间换一位。已经在最上或最下就不动。多块选区如果是同一级的连续兄弟，整组一起挪，选区跟着落到新位置。

做（第十轮）：

17. 段落里只敲 `---`、`***` 或 `___` 变成分隔线，后面留一个空段落接着写。只敲 ``` 或 ``` 加语言名变成代码块，语言名走现有白名单。列表项里的段落套不进分隔线或代码块时，这几个字符留在原地。代码块末尾按 ↓、开头按 ↑ 能走出块；末尾后面没有块时补一个空段落。

做（第十一轮）：

18. 在空段落里粘贴一段 Markdown：标题、无序/有序/待办列表、分隔线、代码围栏和行内的加粗、斜体、删除线、行内代码、安全链接会变成对应的块和 mark。没有这些结构的普通多行、光标不在空段落、或父块装不下（例如列表项里的标题）时，走原来的粘贴。

做（第十二轮）：

19. 表格：在右下角那个格子按 Tab 会在下面加一行空行，光标进到新行第一格。块菜单对表格多出「加一行」「加一列」「删行」「删列」。从表头加出来的新列仍是表头。删到只剩一行或一列时，整张表换成一个空段落。

做（第十三轮）：

20. 引用：空行敲 `> ` 变成引用块，光标在里面接着写。连续以 `> ` 开头的粘贴行合成同一块引用，行内加粗保留。列表项装不下引用时字符留在原地。块菜单和 `/` 可以转成引用，再转回段落时正文还在。行首 Backspace 脱掉引用或 Callout，正文留下。引用里最后一行是空的时按回车，空行挪到引用外面。折叠块还有内容时，标题那一行的退格不会把标题拆出去。
做（第十四轮）：

21. 空行粘贴 GFM 表格：第一行在有 `| --- |` 分隔行时是表头，分隔行不进格子，后面是正文。格子里的 `**加粗**` 还在。只有一列的 `| 只有一格 |` 不当成表。

做（第十五轮）：

22. 斜杠换块换的是光标下这一行，不是它所在的整张列表或整个 Callout。列表中间一项换成标题时，前后两项各自留成列表。Callout 里只换当前那段。`Cmd+D` 和块菜单「转换为」同样只动这一行，列表项转成标题时文字还在。

做（第十六轮）：

23. 行内快捷输入：打完 `**甲**`、`*乙*`、`~~删~~`、`` `码` `` 变成加粗、斜体、删除线、行内代码，记号本身消失。`**甲**` 不会被斜体规则吃掉。代码块里这些记号保持原文。

不做（至今）：`@` 人和空间、接真模型、发布、提交。

## 使用场景

1. 选中一段字按 `Cmd+K`，填 `molis.ai/docs`，回车 → 变成带下划线的链接；再点它在新标签打开；重新 `Cmd+K` 可改或「移除链接」。
2. 复制一个 URL，选中「文档」两个字粘贴 → 「文档」变成指向该 URL 的链接，而不是被替换成一串地址。
3. 划过一行点手柄 → 菜单里选「转换为 → 清单」，三行无序列表变成三条待办，加粗等行内样式保留。
4. 手柄菜单里「复制」在下面插一份同样的块；「删除」删掉这一块，文档只剩一块时退化成空段落而不是非法文档。
5. 文末是月历卡时按 ↓，光标落到卡后面，敲字就是新段落。
6. 在 `## 标题` 行首按 Backspace → 先变成段落；再按才和上一块合并。列表项行首 Backspace → 提出为段落。
7. 选中一句话点格式条「A」→ 上排选「红」文字变红，下排选「黄」加上黄底；再点一次同一个色块取消。光标不选中时先点颜色再打字，新字就是该颜色。
8. 光标放在待办列表第二条按 Tab → 这条缩进成子任务、勾选状态不丢；Shift-Tab 退回原位。三层无序列表的 marker 依次是 `•` `◦` `▪`，有序列表是 `1.` `a.` `i.`。
9. 新建一篇空文档，不点正文就能看到「输入 / 插入块，或直接写」的灰字提示。
10. 光标在某段中间按 `Cmd+A` → 只选中这一段；再按一次 → 选中整篇。
11. 光标落在空的 `## ` 行 → 提示「标题 2」；落在空的待办项 → 提示「待办事项」；落在 Callout 的空行 → 提示「想强调的话」。表格空单元格不出提示。
12. 手柄菜单选「颜色 → 黄」，整块（含列表所有项）铺上黄底；再进去选「默认」还原。整块是代码块时不受影响。
13. 系统开了「减弱动态效果」时，浮层不再上浮淡入、块 hover 不再过渡、gapcursor 不闪。
14. 敲一个代码块，上方的下拉里选 TypeScript → 关键字、字符串、数字、注释立刻分色；改成 Python 立刻重新上色。悬停时右上出现复制按钮，点一下变绿表示已复制。存成 `sh` 的旧文档打开后下拉显示 Shell 并按 bash 高亮；存成没注册的语言名时退回纯文本，不报错。
15. 点 Callout 左侧的图标 → 弹出「图标」十二宫格和「颜色」九色板；换图标不动颜色，换颜色不把图标钉死（没选过图标时仍跟着颜色走默认）。老文档里的 info / warn / success / plain 四种 Callout 打开后和改版前长得一样。
16. 拖一段文字到 Callout 最后一行的下半，再往右偏大约一个缩进 → 蓝线右移，松手后这段进了 Callout，色调不变。拖到无序列表最后一项的右侧 → 变成它的子项，加粗还在。再把子项往左拖出列表 → 变回普通段落，列表里没了空壳。代码块对齐列表项时不会被硬塞成一项，再往右一档才会进到该项里面。待办项拖到列表开头，勾选状态不丢。
17. 点第一段的握把，再按住 Shift 点第三段（或选中后按 Shift+↓）→ 这几行一起铺上选中底色。按删除，它们一起消失。按 `Cmd+D`，这几行作为一组出现在选区后面，而不是每行后面各插一份。拖其中一行，整组跟着走。选区从 Callout 盖到它里面的段落时，删的是整个 Callout。
18. 光标在第二段按 `Cmd+Shift+↑` → 它和第一段对调；再按 `Cmd+Shift+↓` 两次，它落到文末。已经是第一段时再往上按，文档不变。待办列表里把下面那项上移，勾选状态留在各自的文字上。选中连续两段再下移，两段一起挪到下面那块的后面，选区还圈着这两段。
19. 在空行敲 `---` 再打最后一个 `-` → 这一行变成一条横线，光标落到下面的空段落。敲 ```ts → 变成 TypeScript 代码块，光标在块里面。在列表项里敲 `---`，字符还在，不会把列表拆坏。代码块写到最后一行按 ↓，光标走到下一块；已经是文末时下面多出一个空段落。光标在代码中间按 ↓，还在这一行里。
20. 在空行粘贴一段带标题、列表、`---` 和 ```ts 的 Markdown → 各自变成对应的块；`**乙**` 是加粗，`[文档](https://molis.ai/docs)` 是链接，`javascript:` 链接留成原文。粘贴 `hello` 换行 `world` 这种没有标记的文字，仍按原来的方式拆成段落。光标停在「写到一半」里粘贴标题，标题不会把这句换掉。
21. 在表格右下角按 Tab → 下面多一行空行，光标在新行第一格。表头那一列右边「加一列」，新出来的仍是表头；正文行右边加出来的是普通格子。删掉正文行后只剩表头；再删这一行，表格变成空段落。
22. 在空行粘贴 `| 甲 | 乙 |`、分隔行、`| 1 | **2** |` 再加一句「说明」→ 一张两列表，表头是甲乙，正文第二格是加粗的 2，说明仍是段落。`| 只有一格 |` 还是普通文字。

## 方案与关键决策

- `href` 归一化放 `plugins/native/pages/src/link.ts` 的 `safePagesHref`：只放行 `http:` / `https:` / `mailto:` 和 `#`/`/` 开头的站内地址，裸域名补 `https://`，其余（含 `javascript:`、`data:`）归零。schema 的 `toDOM` 再走一遍，坏 href 降级成 `<span>`，保证导出 HTML 也不带可执行链接。这是外部输入进可点击 DOM 的信任边界，必须在两端都过。
- 块型转换放 `plugins/native/pages/src/convert.ts` 的 `convertedBlocks(id, node)`，纯函数、不碰 DOM，Node 侧可直接测。按「行」语义：列表每项一行、Callout/Toggle 每个子文本块一行，转段落/标题时一行一块，转列表/Callout/Toggle 时合成一块。代码块用 `textContent`（schema 里 `marks: ""`，不能带行内样式）。
- 转换为做成同一个 `pages-block-menu` 的第二层（顶部「返回」），不新开子菜单浮层，避免再写一套定位。
- `gapCursor()` 放在 `keymap(baseKeymap)` 之后（和 `prosemirror-example-setup` 一致），gapcursor 的 CSS 写进 `PAGES_STYLES`，不引第三方 css 文件（内核是 esbuild IIFE，不走 css loader）。`dropCursor` 传 `color: false`，颜色交给 `.pages-native-drop` 用 `--plugin-pages`。
- 行首 Backspace 用 `chainCommands(unwrapAtStart, baseKeymap.Backspace)`：先尝试脱层，脱不动再走原行为，不改 baseKeymap 语义。
- Esc 选块的 keymap 挂在 plugins 末尾，让 Slash / mention 先吃掉 Esc。
- 颜色不存 CSS 值，只存色名，白名单在 `plugins/native/pages/src/tone.ts` 的 `safePagesTone`（9 个 hue，对齐 `MW_HUES`）。样式由 `PAGES_STYLES` 按色名生成 `var(--hue-x)` / `var(--hue-x-soft)`，深浅色主题自动跟随，文档里写任何别的值在 `toDOM` 一侧降级成普通 `span`——和 `href` 同样的双端约束，理由也一样：文档正文是外部输入，不能让它决定 DOM 上的样式。
- Tab 嵌套用 `chainCommands(sinkListItem(list_item), sinkListItem(task_item))`：原来只挂了 `list_item`，待办列表按 Tab 无反应。`unwrapAtStart` 早就两种都处理了，这里只是把缺的一半补齐。
- `Mod-a` 的第一段判断是「选区是否已经盖满当前 textblock」，盖满或空块直接 `selectAll`，避免在空段落上按一次没反应。
- 占位文案由 `plugins/native/pages/src/placeholder.ts` 的 `blockPlaceholder($pos)` 纯函数决定，只看块型和它的直接容器，不碰 DOM，Node 侧可直接测；`chromePlugin` 只负责把它挂成 `Decoration.node`。整篇空白时不看焦点也挂，其余情况只挂在光标所在的空块上——和 Notion 一致，不然每个空行都挂提示会很吵。
- 块级上色复用选区的 `font_color` / `highlight`，不引入块级属性：`setBlockTone` 对整块范围先 `removeMark` 再 `addMark`，代码块因为 schema 里 `marks: ""` 天然收不到，不需要额外判断。
- 代码高亮拆成两个模块，因为它们的加载代价差一个量级：`code-language.ts` 只有白名单和别名表，零依赖，给 `schema.ts` 和 Node 侧用；`code-highlight.ts` 才 import `lowlight` + 13 份 highlight.js 语法，只有编辑器 bundle 会碰它。若把两者合一，宿主进程 `import` 插件包就会连带加载整个 highlight.js。测试通过新增的 `./code-highlight` 导出路径直接取，不用把它拉进主入口。
- `highlightRanges` 返回的是相对代码文本的 UTF-16 偏移，不是 DOM 片段：这样既能直接转成 `Decoration.inline`，也能在 Node 里断言「切出来的子串是不是这个 token」。中文注释在前是最容易串位的场景，已单独断言。
- 高亮只在 `tr.docChanged` 时重算并缓存在插件 state 里，不在每次 `decorations` 调用时重跑 lowlight。
- 语言条做成代码块上方的真实一行（flex column），不是浮在代码上的 overlay：不遮第一行内容，不悬停也能看到当前语言。复制按钮才是悬停出现。
- Callout 用设计系统 sprite 里的图标，不引 emoji：整个 GoalBoard 都在用这套 sprite，掺 emoji 会是视觉语言上的断层。颜色也复用文字色那九个 hue，而不是给 Callout 另造一套语义色名——产品里只该有一套颜色概念。
- 兼容靠一层折叠而不是数据迁移：`safePagesCalloutTone` 把 info/warn/success/plain 映射到 cyan/orange/green/gray，`calloutIconFor` 在没选过图标时回落到该色调历来隐含的那个图标。结果是旧文档和十份模板一个字不用改，渲染完全一致；`icon` 留空表示「跟着颜色走」，只有用户主动选过才写值。
- CSS 从 `.pages-callout--{tone}` 四条手写规则改成按 `[data-pages-callout="{hue}"]` 生成九条，和文字色共用同一份 hue 生成逻辑。
- 拖拽层级不改 schema。能装子块的只有 Callout、Toggle、列表项和待办项；普通段落右边没有下一档，落点线不往右跳。列表本身不是一行，握把落在光标下的那一项上，所以拖的是一项而不是整张列表。提出文档顶层时，列表项拆回它的正文（段落），不留一个只有一项的新列表；拖进 Callout 时仍包成列表，圆点还在。最后一项被拖走或删掉时，空列表一起去掉；Callout 的最后一块被拖走时留下一个空段落，避免 `block+` 变空。
- 落点先算「缝」（垂直方向上，行中线以上算插到这行前），再按指针相对上一行左缘每 24px 一档算缩进，档位超出容器能力就往回退，直到有一档真的改得了文档。原地（同一父级、同一位置或紧挨自己后面）返回 `null`，文档不动。
- 嵌套行的块菜单只有复制和删除。转换为、上色、备注、上下移仍只对顶层块，因为那些命令按顶层下标工作；一项一转换留到后面。
- 多块选择不另造选区类型，记在 hover 插件 state 的 `anchor` / `head`（两个行位置）上，用 `is-block-selected` 画出来。父块和它的子块同时落在选区里时，`spanRoots` 只留父块，子块跟着走。复制是整组插到最后一行后面；删除从后往前摘，这样前面的位置不会被后面的删除带偏。一组的拖拽复用单行的落点计算，只是一次搬走所有根。多块时菜单只留复制、删除和上下移。
- 上移 / 下移不再用顶层下标。`nudgeSpan` 在拖拽行里找同父级、同缩进的邻居，上移插到它前面，下移插到它（含子行）后面。没有邻居就返回 `null`，不把行提出去——提出去已经有往左拖。挪完用节点引用找回新位置，选区贴在同一批行上，所以可以连续按。
- Markdown 快捷输入只认「这一段刚好是标记」：`markdownBlock` 先问父容器 `canReplace`，列表项要求第一个孩子是段落，塞不进分隔线或代码块就返回 `null`，字符留在原地。语言名复用 `safePagesLanguage`，不另造一份别名表。代码块里的方向键只在光标贴着块的头或尾时才走出，中间的 ↓ 仍是块内移动。
- 粘贴只在空段落上接手，而且这段文字里得真有标题、列表、分隔线或代码围栏。普通换行仍走 ProseMirror 原来的按行拆段。父容器 `canReplace` 失败就放弃，避免把列表项拆成非法结构。行内只认 `**`、`*`、`~~`、反引号和安全链接；`javascript:` 链接留成原文。下划线不拿来做斜体，免得 `snake_case` 被拆开。
- 表格不加按钮浮在格子上。右下角按 Tab 才长出一行，和 Notion 一样；菜单里的加行、加列给握把一条显式路径。新行一律是正文格，新列跟着当前格：表头旁边加出来的还是表头。删到只剩一行或一列时整张表换成空段落，避免留下 `table_row+` 不成立的空表。
- `highlight.js` 必须写进 `dependencies`——它虽然是 lowlight 的传递依赖，esbuild 能穿透 pnpm 的软链解析到，但 Node 在 strict node_modules 下解析 `dist/code-highlight.js` 会直接 `ERR_MODULE_NOT_FOUND`。这个差异让 build 绿而测试红，实际踩到过。

## 输入输出与依赖

- 新依赖：`prosemirror-gapcursor`、`prosemirror-dropcursor`（加在 `plugins/native/pages/package.json`）。
- 新导出：`@molis-ai/molis-work-plugin-pages` 追加 `safePagesHref`、`convertedBlocks`、`PAGES_TONES`、`safePagesTone`，以及命令 `setTone` / `toneAt` / `indentListItem` / `outdentListItem` / `selectBlockThenAll`。
- schema 变化：marks 增加 `link`（attr `href`）、`font_color` 与 `highlight`（attr `tone`）。旧文档不含这些 mark，读旧文档不受影响；`parseDOM` 让粘贴进来的 `<a href>` / `span[data-pages-ink]` / `mark[data-pages-wash]` 也能被吃进去。

## 文件/模块边界

允许改：`plugins/native/pages/src/{schema,link,tone,convert,commands,editor-browser,styles,en,index}.ts`、`plugins/native/pages/package.json`、`tests/pages-plugin.test.ts`、本 spec。

不改：workbench 渲染器、design-system、其他插件。

## 验收标准与结果

1. **通过** — `safePagesHref` 放行 https/http/mailto/站内路径与裸域名（裸域名也走 `URL` 归一化，`molis.ai` → `https://molis.ai/`），丢掉 `javascript:`（含大小写混写）、`data:` 和非地址文本；`link` mark 的 `toDOM` 对坏 href 输出 `span`，对好 href 输出带 `rel="noreferrer noopener"` 的 `a`。证据：`tests/pages-plugin.test.ts` 的「链接只收可导航地址，脚本伪协议被丢掉」。
2. **通过** — `convertedBlocks` 把两项无序列表转成两个 H2 并保留 `strong`；转 `task_list` 得到一块两项 `checked:false`；转 `code_block` 得到无 mark 的合并文本；Callout 转段落拿回正文；不支持的 id 返回 `null`。证据：「转换为：按行拆开与合并…」。
3. **通过** — 复制/删除/转换/Esc 选块/行首 Backspace 脱层/加链改链移除，都在 Node 里用真实 `EditorState` 跑命令验证（不是只验返回值，断言落在结果文档的块型、文本、mark 和选区上）。证据：「块命令：复制插在原块之后…」「块命令：转换为落到文档上…」「行首 Backspace 先脱一层…」「Esc 把光标提成整块选中…」「链接命令：加链、改链、移除…」。故障敏感性已实测：把 `unwrapAtStart` 改成直接 `return false`、把 `setLink` 的空区间守卫删掉，对应两个测试稳定失败。
4. **通过（浏览器实操）** — 4179 上实操确认：划词出浮动格式条且含「链接」按钮；点它弹出 `placeholder="https://"` 输入框；填 `molis.ai/docs` 回车后正文变成 `<a class="pages-link" href="https://molis.ai/docs" rel="noreferrer noopener" target="_blank">`；光标回到链接里再开弹层，输入框已回填地址且多出「移除链接」。hover 块时 `+` 与 grip 出现在左沟槽、不压正文。
5. **未验证（环境受限）** — 块菜单两层渲染、gapcursor 用方向键落点、`Mod-d`。Cursor 的内置浏览器是 Electron webview，焦点进不了 ProseMirror（`document.activeElement` 一直是 `immersive-workbench`），键盘与 hover+点击两次尝试都没打进去；`Meta+k` 还被 IDE 的全局搜索吃掉。这三条要在真 Chrome 里手点。菜单里每一项背后的命令已按第 3 条在 Node 里验过。
6. **通过** — 色调只认白名单：`safePagesTone(" RED ")` → `red`，`chartreuse` 和 `var(--ink); background:url(x)` → `""`；`font_color` 的 `toDOM` 对白名单色输出带 `data-pages-ink` 的 span，对脏值输出裸 `span`。`setTone` 在选区上是「同色取消 / 异色替换」，光标态写 `storedMark`，混色选区 `toneAt` 读作空。证据：「文字颜色与背景色…」「色调只认设计系统色板…」。
7. **通过** — `indentListItem` 对 `task_list` 和 `bullet_list` 都能嵌套一层（断言落在嵌套后真实文档结构上：内层列表节点数、各项文本、`task_item.checked` 未丢），`outdentListItem` 退回后文档 JSON 与初始完全一致；段落上按 Tab 返回 false。证据：「Tab 嵌套对待办列表同样生效…」。故障敏感性：把 `indentListItem` 退回成只挂 `list_item`，该测试在 `task_list` 一轮稳定失败（这正是修复前的真实行为）。
8. **通过** — `selectBlockThenAll` 第一次把选区收成当前段落文本、第二次铺满整篇，空块直接整篇。证据：「Mod-A 先圈住当前块…」。
9. **通过（服务端链路）** — 通过 4179 的真实 HTTP 接口新建文档并写入含 9 色文字 + 9 色高亮 + 组合 mark 的正文，再 GET 读回，22 个色标记原样往返，说明 `parsePagesBody` / schema / 存储都接受新 mark。同法灌了一篇三层无序 / 三层有序 / 嵌套待办的文档。证据：`.tmp/pages-tone-seed.sh`、`.tmp/pages-nest-seed.sh`，读回结果见验证记录。
10. **通过** — `blockPlaceholder` 对顶层空段落 / 空 H1 / 空 H3 / 列表项 / 待办项 / Callout / Toggle 各给对应文案，有内容的块和表格单元格返回空。证据：「占位按块型和它的容器给词…」。
11. **通过** — `setBlockTone` 给整块（含列表两项）铺上同一个 highlight，选「默认」后文档 JSON 与初始完全一致；作用在代码块上文档原样不动；越界索引返回 false。证据：「块菜单上色铺满整块…」。
12. **通过（静态）** — `prefers-reduced-motion` 段落关掉 `[data-pages]` 子树的全部 animation / transition 与 gapcursor 闪烁；块 hover 的 background / box-shadow 走 `--motion-fast`；手柄显示时走 `pages-fade`。证据：4179 上 `molis-work-workbench.css` 含 `prefers-reduced-motion`、`pages-fade`、`:is(p, h1, h2, h3).is-empty`。实际观感仍需手点。
13. **通过** — `safePagesLanguage` 把 `TypeScript` / ` ts ` / `tsx` 折到 `typescript`、`html` 折到 `xml`、`sh` 折到 `bash`，没注册的 `brainfuck` 和 `<script>` 退回纯文本；菜单里列出的每个语言都能解析；脏语言名不会写进 `data-language`。证据：「代码语言只认注册过的语法…」。
14. **通过** — `highlightRanges` 切出的每个区间都落在原文范围内，`code.slice(from, to)` 与 token 文本一致（`const` → keyword、`42` → number）；中文注释在前时关键字区间不串位；未注册语法、纯文本、空串都返回空数组。证据：「代码高亮给出的区间能对回原文，中文也不串位」。
15. **通过（服务端链路）** — 通过 4179 灌了《代码块语言与高亮验证》，含 TypeScript / Python / `sh` 别名 / SQL / JSON / 未注册语言 / 纯文本七个块，读回时 `language` 原样保留（归一化发生在渲染边界，不改存储）。证据：`.tmp/pages-code-seed.sh` 输出 `['typescript','python','sh','sql','json','brainfuck','']`。
16. **通过** — 四个旧色调各自折到正确的 hue 且默认图标不变，`toDOM` 输出的 `data-pages-callout` / `data-pages-icon` 与改版前等价；九色可直接用，不认的色回落 cyan、不认的图标回落色调默认；`setCalloutStyle` 只改颜色时不钉死图标、只改图标时不动颜色、传空图标是恢复自动、正文不受影响；作用在非 Callout 或越界位置返回 false。证据：「Callout 的图标和颜色各自独立，四个旧色调渲染不变」。
17. **通过（服务端链路）** — 灌了《Callout 图标与色调验证》，含四个旧色调、四个新组合和一条脏数据（`chartreuse` + `skull`），读回时属性原样保留，归一化发生在渲染边界。证据：`.tmp/pages-callout-seed.sh` 输出。4179 的 CSS 已不含 `pages-callout--warn`，改为 `[data-pages-callout="purple"]` 这类规则。
18. **通过** — 右移：段落进入 Callout 且色调保留；段落右移进列表变成上一项的子列表，`strong` 还在；标题对齐列表项变成新的一项。左移：列表项提出来变成段落，原列表只剩另一项；Callout 里唯一的段落提出来后，Callout 留下空段落。代码块对齐列表项时落点被拒绝（文档不变），再深一档才进到该项内部。待办项拖到列表开头，`checked` 不变。删掉仅有的一项后列表消失、文档退化成空段落；复制则在后面加一项。原地放下 `previewDrop` / `moveRow` 都是空操作。证据：「拖拽右移嵌进上一个容器，左移再提出来」。故障敏感性：把 `nestInto` 改成直接 `return null` 后，子列表那条断言失败。
19. **通过** — `tests/pages-plugin.test.ts` 32/32；`plugins/native/pages` typecheck 与 build 通过。4179 已换新资源：CSS 含 `pages-drop-line::before` 与 `is-block-selected`，编辑器包含 `previewSpan`。样例文档《拖拽嵌套验证》。
20. **通过** — 选中 b、c 拖到文首得到 `b c a`，原地放下是空操作；甲、乙一起嵌进 Callout，顺序和色调保留；复制 a、b 得到 `a b a b c`，不是交错副本；删掉 a、b 只剩 c，全选删除退化成空段落。选区从 Callout 盖到内部段落时 `spanRoots` 只剩 Callout，删除后外面的段落还在。两项列表一起左移，拆成两个段落，不留空列表。证据：「多块选择一起移动、复制和删除…」。`spanRoots` 的断言直接要求只剩 `callout`，滤掉子块的判断被拿掉时这条会失败。
22. **通过** — `nudgeSpan` 把 b 上移成 `b a c`、下移成 `a c b`，a 再上移和 c 再下移都是 `null`；a+b 一起下移成 `c a b`，返回的 anchor/head 仍指向 a 和 b。待办「未」上移后勾选状态留在原来的文字上，第一项再上移是 `null`。证据：「上移下移在同级兄弟之间换位…」。编辑器 bundle 含 `nudgeSpan` 和 `Mod-Shift-ArrowUp`。
23. **通过** — `---` / `***` / `___` 变成横线加空段落，光标在空段落里；```ts 变成 `language: typescript` 的代码块，```nope 退回纯文本；普通「hello」不变；列表项里的 `---` 被拒绝。代码块末尾 ↓ 在文末补出空段落，后面已有段落时只把光标移过去，光标在中间时命令返回 false。前面有段落时 ↑ 走进那段，文档块数不变。证据：「敲 --- 或代码围栏会变成对应的块…」。
24. **通过** — 空段落粘贴含标题、两种列表、待办（未勾与已勾）、横线、```ts 和链接的 Markdown，得到 7 个对应块；`**乙**` 带 `strong`，安全链接是 `https://molis.ai/docs`，`javascript:` 留在正文里。`hello\nworld`、非空段落、列表项里的标题都返回 null。证据：「空行粘贴 Markdown 会变成块…」。
25. **通过** — 右下角 `atLastTableCell` 为真，左边那格为假。加行后三行，新行两格都是空的 `table_cell`，光标在新段落里。从表头「乙」加列，表头行第三格仍是 `table_header`，正文行是 `table_cell`。删掉正文行只剩「甲乙」；再删，表格换成空段落。从表头删列后每行只剩一格，正文是「甲1」。握把选中整张表再删行，去掉的是最后一行。段落上加行返回 null。证据：「表格能加行加列…」。
26. **通过** — `> ` 变成 `blockquote`，光标在里面的空段落；列表项里的 `> ` 被拒绝。粘贴两行 `> ` 合成一块，第二行 `**乙**` 带 `strong`，后面的普通行仍是段落。转成引用再转回段落，正文还在。空引用的占位是「引用」。`toDOM` 是 `blockquote.pages-quote`。证据：「敲 > 空格变成引用…」。
27. **通过** — 引用里行首 Backspace 把「甲」脱成段落；空引用按回车变成空段落；引用末尾的空行回车后挪到引用下面，引用里还留着「甲」。Callout「注意」同样能脱掉。折叠块还有内文时，标题行 Backspace 返回 false；只剩空标题时回车把它变成段落。证据：「空行回车和行首退格能离开引用…」。
28. **通过** — 粘贴 `| 甲 | 乙 |`、分隔行、`| 1 | **2** |` 和「说明」得到表加段落：两行，表头是 `table_header` 且文本「甲乙」，正文第二格是加粗的「2」，分隔行没有变成格子。`| 只有一格 |` 返回 null。证据：「空行粘贴 GFM 表格…」。`tests/pages-plugin.test.ts` 38/38。4179 读到的编辑器与 `dist/pages-editor.js` 字节一致。
21. **未验证（等手点）** — 选中底色、Shift+↓、`Cmd+Shift+↑/↓`、敲 `---` / 粘贴 Markdown 的手感、落点线，以及此前各轮的浮层。和第 5 条同因：Cursor 内置浏览器焦点进不了 ProseMirror。

已知代价：编辑器 bundle 从 580KB 涨到 782KB（未压缩），来自 highlight.js core 加 13 份语法。build 目前不带 `--minify`，若这个体积成为问题，压缩是第一顺位而不是砍语言。

顺带修掉的既有问题（原先被 tsconfig 的 `exclude` 藏着）：

- `plugins/native/pages/tsconfig.json` 把 `src/editor-browser.ts` 排除在 tsc 之外，这个文件（约 1700 行、编辑器全部行为）从来没被类型检查过，改坏了也照样 build 成功。新增 `tsconfig.editor.json`（`noEmit`）并接进 `build` / `typecheck`，首次跑出 34 个错误，已全部修掉。
- mention 插件的 `apply` 里 `slashKey.getState(tr)` 传的是 `Transaction` 而不是 `EditorState`，取不到 slash 状态，所以 Slash 菜单开着时 mention 从来没被抑制。改成 `apply(tr, value, _old, next)` 用 `next`。
- 手柄、块菜单项、格式条原先只听 `pointerdown` / `mousedown`，键盘激活按钮（Enter/Space 只发 `click`）没有任何反应。改成 `mousedown` 只 `preventDefault` 保住选区、动作走 `click`，拖拽结束用 `suppressClick` 吃掉尾随的那次 click。

## 验证命令

```
pnpm --filter './plugins/native/pages' run build
node --import tsx --test --test-concurrency=1 tests/pages-plugin.test.ts
```

浏览器：`node --import tsx .tmp/pages-verify-server.mts` 起 4179，硬刷新后实操使用场景 1–10。第三轮的样例文档已灌好：《颜色与高亮验证》《嵌套与列表层级验证》。改了 `styles.ts` 必须连 `apps/workbench` 一起重建再重启服务，否则 CSS 不会更新（样式是经 workbench 打进 `molis-work-workbench.css` 的）。

## 假设与开放问题

- 点链接直接新窗口打开（对齐 Notion），代价是编辑器里不方便把光标点进链接中间；要改链接文字得先用方向键或选中后 `Cmd+K`。若实操觉得别扭，改成 hover 预览条。
- 转换为暂不含表/分隔线/目录/卡片（它们没有可搬运的行内内容），菜单里也不列。
- 仓库整体测试套里还有大量失败（titlebar / kanban / PTY / install 等），实测原因是沙箱里起不了 Chrome（`Chrome exited before debugger start`）和 node-pty，与本 WI 无关。
