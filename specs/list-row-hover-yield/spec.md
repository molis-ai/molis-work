# 列表行 hover 让位

## 背景与目标

DropAgent 左侧文件目录的高级感不是高亮跟着鼠标滑，而是**行自己在让位**：hover / 选中时右侧动作出现，长文件名被挤短，180ms 缓出。GoalBoard 的 Shelf 已经有同样的复制/隐藏/删除，但右侧 72px 一直留着，文件名静止时就被挤短，动作是 `display: none` 硬切。其他插件列表的 hover 只有 90ms 底色，长标题是硬省略号。

目标等级 **3：功能可用**。不改领域写入。

## 当前行为与问题证据

DropAgent `WorkbenchFileRow`：`showsActions = hovering || selected` 时 `padding.trailing` 从 0 到 68，标题 `truncationMode(.middle)`，状态/时间退出，动作 overlay 进来，整段 `easeOut 180ms`。

Shelf `.shelf-row`：`padding-right: 72px` 常驻；`.shelf-ops { display: none }`，hover 才 `display: flex`。长文件名不 hover 也被挤。

## 范围与非目标

做：

1. Shelf 材料 / 结果 / 剪贴板行复刻让位：静止文件名尽量展开；hover 或选中时右侧让出动作槽，长文件名被挤短，动作与时间/状态交叉淡入淡出。
2. 其他插件目录/舞台列表行：hover 底色 180ms 缓出；长标题只在标题槽里省略号，不要给整行或标题做右缘 mask，以免切掉没溢出的字和行尾状态。
3. Directory 原语可选 `yield`：行尾动作 overlay，不预留死 padding；`fileName` 时茎/扩展名拆开。默认 trailing 仍常驻（Feed 配置）。
4. `/__ui/catalog` Directory 标本可 hover 验证短名几乎不动、长文件名被挤、选中保持让位。Catalog 分段开关走同一套 180ms rubber thumb。
5. `prefers-reduced-motion` 下取消位移时长，状态仍切换。

不做：不给 Goals / Sessions / Feed / Inbox / Artifacts 新增行尾动作；不改选中语义、点击合同、拖放；不做跟着鼠标走的共享药丸。

## 使用场景

1. Shelf 短文件名：hover 底色与动作出现，文件名宽度几乎不变。
2. Shelf 长文件名：静止能看到更多字；hover 时文件名从右缘被挤短，扩展名尽量留下。
3. 选中行保持让位（动作一直在），移开鼠标不收回。
4. Goals / Feed 等长标题在窄目录里贴到状态标时，标题槽省略，状态完整可见。
5. 减少动态效果：动作仍出现，文件名仍让位，但没有 180ms 过渡。

## 方案与关键决策

- 让位的是行内布局，不是一块跟鼠标走的底片。
- 文件名挤压用宽度变化 + 标题槽省略号（Web 无法平滑做 Swift 的中段省略号）；有扩展名时茎用省略、扩展名不挤掉。含 `://` 的标题不当成文件名拆。不在标题或整行上做右缘 mask。
- 行尾动作用 opacity，不用 `display` 切换。
- 时间/失败标/「当前」在让位时收掉占位，避免和动作叠两层挤。

## 输入输出与依赖

输入：现有 Shelf 行 DOM、`mw-dir-row` / 舞台列表标题、Catalog Directory。  
输出：Shelf 样式与名称标记、目录行 hover/标题溢出/`yield` 样式、Catalog 标本、DESIGN.md 一句。

## 文件 / 模块边界

允许：`plugins/native/shelf/src/{styles,ui,client}.ts`、`packages/design-system/src/{primitives,styles}`、相关单测、`DESIGN.md`。  
禁止：MCP、凭据、插件协议、用户库。

## 验收标准

1. Shelf 行静止 `padding-right` 不是 72px；`:hover` / `.is-on` 且非子项时才让到约 72px。
2. `.shelf-ops` 默认可见结构为 flex + opacity 0；hover/选中 opacity 1。不再靠 `display: none`。
3. 带扩展名的文件名拆成 `__stem` + `__ext`；URL 标题不拆。
4. 目录/舞台列表行 hover 过渡 180ms；`mw-dir-row__copy strong` 被挤时用省略号，没有右缘 mask。行尾状态完整可见。
5. `prefers-reduced-motion` 下上述过渡为 none。
6. Catalog Directory 有 `is-yield` 标本：短名 + 长 `.pdf`；`yield` 行静止不留 72px 动作槽。
7. Catalog 的 `mw-toggle-group` 使用与产品分段相同的 travelling thumb。

## 验证命令

```
npx pnpm --filter @molis-ai/molis-work-plugin-shelf --filter @molis-ai/molis-work-design-system --filter @molis-ai/molis-work-app-workbench build
node --import tsx --test --test-concurrency=1 tests/shelf-plugin.test.ts tests/primitives.test.ts tests/visual-foundation.test.ts
```

浏览器：打开 Shelf，用一条短名、一条很长的 `something-very-long-name.pdf` hover；再扫 Goals / Sessions 目录长标题。隔离预览打开 `/__ui/catalog` Directory「行让位」标本，hover 短名与长文件名。

## 假设与开放问题

假设其他插件暂不增加 hover 才出现的行尾动作。若以后 Feed 配置也要同样让位，沿用同一套 opacity + 宽度，不要再留死 padding。
