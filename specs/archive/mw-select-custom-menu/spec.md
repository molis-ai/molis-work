# 选择框打开后用工作台菜单

完成等级：**3 功能可用**。不宣称可发布。

## 背景目标

`mw-select` 和大量未加 class 的 `<select>` 关闭态可以画成纸面控件，**打开后仍是操作系统菜单**（macOS 圆角白底、系统勾选）。Dataset 列类型、表单题型、Inbox/首页判断、Goal 事件表、设置页模型格式都是这样。规范里 Select 是字段，打开的选项列表应是 `mw-menu`，不是系统控件。全局禁令（含色盘、系统确认框、动效与图标色）见 [ui-craft-floor](../../ui-craft-floor/spec.md)。

## 当前行为与问题证据

- `appearance: none` 只作用于关闭态；浏览器不允许给原生 select 的打开列表换肤。
- 新建 Session 的 Goal/Runtime 已用隐藏 select + 纸面 listbox（`specs/archive/session-add-custom-select/spec.md`），但明确不覆盖其它页面。
- 用户在 Dataset 表头点「文字 / 数字 / 日期」仍看到系统下拉。

## 范围与非目标

做：

- 工作台、设置、Catalog、引导、项目页、Desktop 胶囊里，可见的单选 `<select>` 打开后是 `mw-menu` 纸面列表。
- 原生 `<select>` 仍留在表单里：隐藏、读写 `.value`、`change` / `input`、提交字段名不变。已隐藏的（Session 新建、插件市场项目）不重复包装。
- 动态插入的 select（Dataset 加列、表单加题）同样被接上。
- 列表用 Popover 顶层，不被表格 `overflow: auto` 裁切。

不做：

- 不改提交语义、MCP、判断绑定协议。
- 不处理 `multiple` / `size>1`。
- 不把 Combobox 搜索框做成这个选择器。

## 使用场景

1. Dataset 表头点列类型：打开工作台菜单，勾在当前类型上；选「数字」后 select 值为 `number`，格子仍按数字存。
2. 设置页模型 API 格式、Inbox 下一步判断、Goal 事件表单的下拉：同样是纸面菜单。
3. 程序给隐藏 select 赋值并派 `change`：触发器文案同步。

## 方案与关键决策

在 visual foundation 客户端对文档做增强，不逐页改 HTML。跳过 `hidden` / `aria-hidden` / 已在 picker 内的 select。触发器复用 `mw-select` 关闭态皮肤；选项复用 `mw-menu__item`。

## 文件 / 模块边界

允许：`specs/archive/mw-select-custom-menu/`、`packages/design-system`（原语 CSS + 客户端脚本）、Dataset/Form/Pages 里针对 `.mw-select` 的宽度选择器、对应测试、胶囊页接入同一脚本。

禁止：改领域写入；为每个插件手写一份菜单。

## 验收标准

1. Dataset 列类型、表单题型打开后不是系统菜单，而是 `mw-menu`。
2. 增强后的 select 仍在 DOM 且 `hidden`；`.value` 与 `change` 行为不变。触发器文案在插入 picker 之后同步。
3. Catalog `/__ui/catalog` 的 Select 标本同样打开纸面菜单。
4. 定向测试覆盖脚本/样式合同；浏览器核 Dataset 表头下拉。

## 验证命令

```
pnpm --filter @molis-ai/molis-work-design-system build
node --import tsx --test --test-concurrency=1 tests/primitives.test.ts tests/coss-control-language.test.ts tests/visual-foundation.test.ts
```

## 假设与开放问题

Session 新建已有自己的 picker，因其 select 已 hidden，全局增强会跳过。
