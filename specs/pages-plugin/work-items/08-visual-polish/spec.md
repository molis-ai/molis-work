# WI8 Pages 阅读面与代码边界

完成等级：**4 内部完整**（视觉可内部试用）。不宣称可发布。

## 背景目标

WI1–WI7 功能已接通，但阅读面仍是毛坯：顶栏像后台表单，块/卡/目录是灰盒+硬边框，手柄是 `+↑↓○`，动作一直在。要对标 Notion 的纸面：内容先到，chrome 适时出现。顺带收调用链与无用代码。

## 当前行为与问题证据

- 详情栏并排 `mw-select`（文件夹 / Goal）和抽取、Promote、导出、删除。
- Callout `border-left: 3px`；TOC/卡/月历 `var(--rail)` 底 + 实线边。
- 列表搜索挂了侧栏 `tree-search`：默认或聚焦涂 `--nav-hover` 灰蓝底，再叠 2px `--focus` 描边，像系统搜索框，不像纸面上的过滤条。
- 列表行带「文档」chip 和「未分类」列，像 Feed 表。
- 块手柄 Unicode；Slash/格式条重阴影叠边框。
- 格式条/Slash/`pages-pop` 挂在 `document.body`，离开 Pages 仍可能露出来。
- Esc 关掉 Slash 后留下 `/`。
- 空任务卡把「任务 / 待办」写成正文。
- 划词选中走工作台 `::selection` 靛紫洗底，编辑器 `:focus-visible` 再套一圈描边，看起来像蓝色边框。
- 块手柄 `position:fixed` 挂在整个 stage 上，被目录栏压住；行本身几乎没有 hover 洗底和阴影，鼠标划过不像 Notion 在选中这一行。
- 列表顶栏「新建文档」旁边并排文件夹/模板图标，模板项全是同一张 `note`，像后台工具条。

## 范围与非目标

做：列表行、空态、搜索条、顶栏收纳、标题与纸面、块手柄/插入线、Slash/格式条/备注弹层、Callout/TOC/卡/月历/代码/表、动效与图标；overlay 挂回 Pages 舞台；Esc 清掉 `/`；死代码与重复 pop 入口收口。

不做：新块类型、Markdown 块、三栏、拖块配置、接真模型、宣称可发布、提交。

## 使用场景

1. 打开一篇：大标题无框，正文像纸，顶栏只有返回、标题、保存态、星标、更多。
2. 列表页建夹、把一篇拖进夹或用行上「移到文件夹」；点文件夹只展开这一组，不离开列表。
3. 鼠标划过块：整行浅底加一层短阴影，行头出现 + 和手柄；点手柄用铺底选中该行（没有蓝框）并打开块菜单。
4. 划词：浮动格式条，选区是 `--content-select`，编辑器没有焦点蓝框。敲 `/`：带图标的命令列表。Esc：菜单关、`/` 消失。
5. Callout/引用卡/月历没有厚灰盒和粗左边线。
6. 切走 Pages，格式条和 Slash 不留在 Goals 上。

## 方案与关键决策

- 仍用工作台 token（`--paper` / `--ink` / `--shadow-raised` / `icon()` sprite）。不另起落地页美学。
- 顶栏次要动作进 `⋯`；星标留在栏上（收藏是高频）。
- 列表只留标题 + 时间；收藏、移到文件夹、夹上的建/改名/删 hover 才显。
- 文件夹和文档的库操作都在列表页：顶栏建文档/建夹/模板；行上打开文档、收藏、把文档移进夹（菜单或拖到夹上）。点文件夹只展开/收起，不换成另一层目录。编辑页 `⋯` 不再有文件夹下拉。
- 列表搜索用 `mw-input-group` + `mw-input`，去掉 `tree-search`。默认纸面 + `--control-input` 发丝边；聚焦走全局 `--focus-stroke`（内侧 1px `--ink`），不涂 `--nav-hover`，不用靛紫框。
- 浮层只选一层高度：`box-shadow: var(--shadow-raised)`，不再边框+大阴影叠一起。
- Callout 用浅底 + 图标，不用 >1px 色条。
- 编辑器 IIFE 用 `#icon-*` sprite，不把 lucide 打进包。

## 输入输出与依赖

输入：现有文档数据与 WI1–WI7 行为。  
输出：同一套读写，换阅读面。  
依赖：Design System sprite、plugin-stage 壳。

## 文件 / 模块边界

允许：`plugins/native/pages/src/{styles,ui,client,editor-browser,en}.ts`；`specs/pages-plugin/**`；对应测试。  
禁止：改 Goal/Artifact 事实；扩块模型；把内核塞进 factory。

## 验收标准

1. 详情栏默认看不到 Goal 下拉和抽取/Promote/导出/删除；它们在更多菜单里仍可用。更多菜单和详情栏都没有文件夹下拉。
1b. 列表页能建/改名/删文件夹、在夹里新建、把已有文档移进夹或未分类；编辑页不能改所属文件夹。
2. 列表行没有「文档」状态芯片。
3. 列表搜索不是 `tree-search` 填充条；默认纸面发丝边，聚焦没有灰蓝洗底。
4. 块手柄默认是图标 + / grip，不是 `+↑↓○`；悬停行才出现，点 grip 打开菜单而不是行内托盘。手柄画在正文左沟里，不被目录栏挡住。
4b. 划词或点进正文没有蓝色 focus 描边；文字选区是 `--content-select`；块选中是同一套铺底，没有 outline。
4c. 列表顶栏只有「新建」和一颗展开更多（模板 / 建夹）；模板项各自有图标。
5. Callout 没有 3px 左边线。
6. Slash Esc 后当前段不再留下 `/`。
7. 格式条、Slash、pop 是 `[data-pages=workbench]` 的子节点。
8. `tests/pages-plugin.test.ts` 绿。浏览器走空态 → 模板 → 写 → `/` → 手柄 → 卡 → 备注 → 更多菜单。

## 验证命令

```bash
pnpm --filter @molis-ai/molis-work-plugin-pages --filter @molis-ai/molis-work-app-workbench build
node --import tsx --test --test-concurrency=1 tests/pages-plugin.test.ts
```

浏览器：验证服 4179 或当前工作台，桌面宽度走主路径。

## 假设与开放问题

- 手柄仍用上移/下移，不改成拖块（非目标）。拖文档只用于归夹，不排序。
- 无模型时 AI 仍是诚实 stub。
- 窄屏沿用 stage 壳：展开后列表隐藏。
