# 焦点描边：内侧墨线，不要靛紫/蓝色框

完成等级：**3 功能可用**（工作台、设置、Catalog、插件表面键盘焦点可见且不再是粗靛紫/蓝框）。不宣称可发布。

本 spec 替换 [focus-ring-redesign](../focus-ring-redesign/spec.md) 里「2px `--focus` 实线」的颜色与厚度。内侧、不外扩、不光晕这一条保留。

## 背景目标

Pages 列表搜索、字段、按钮 Tab 过去时，会出现一圈粗靛紫（`--focus` / `#5e6ad2`）描边。这是浏览器默认蓝框的产品化版本，和锌灰纸面、幽灵按钮不是一套语言。焦点必须可见，但不能靠彩色粗框喊话。

## 当前行为与问题证据

- `--focus` 别名 Linear 靛 `#5e6ad2`。`--focus-stroke` 是 `2px solid var(--focus)`。
- `mw-*`、工作台全局 `:focus-visible`、目录、画布、弹窗字段、Capsule、引导页各自再画一遍 2px 靛/蓝环。
- 字段聚焦还把 `border-color` 改成 `--focus`，框更蓝。
- 选区、链接仍可用靛；问题是**描边**，不是把强调色从产品里删掉。

## 范围与非目标

做：工作台、设置、项目选择、Catalog、Capsule、引导页、插件表面里的键盘焦点环与字段聚焦描边；把配方写进 DESIGN.md、design-system README、CLI 开发规范；Catalog 过一遍控件焦点。

不做：改链接色、`::selection` 洗色、插件身份色、状态色、危险态 `--red` 描边；不改信息架构和控件尺寸。

## 使用场景

Tab 进 Catalog 的 Button / Input / Select、Pages 搜索、Functions 函数 key、Feed 配置字段、目录行、画布节点。浅色和深色都只看见贴边墨线，没有靛紫框。

## 方案与关键决策

统一成**贴在控件内侧的 1px `--ink` 线**：

```
--focus-stroke: 1px solid var(--ink);
--focus-stroke-inset: -1px;
--control-ring: var(--ink);
```

```
outline: var(--focus-stroke);
outline-offset: var(--focus-stroke-inset);
box-shadow: none;
```

- 字段聚焦时发丝边改 `--ink`，不再改成 `--focus`。
- 书写面 `data-plain-field` 用 1px 墨色底线，不要靛紫框。
- 行内链接仍外扩 1px 墨线，避免盖住字形。
- 危险态继续 `--red`，厚度改成 1px 内侧，不另起语言。
- `--focus` / `--blue` 仍是链接、选区、进行中的强调色，**禁止**再当焦点描边。
- 新 CSS 禁止 `outline: 2px solid var(--focus)`、`outline: 2px solid var(--blue)`、`0 0 0 2px var(--focus)`。

## 输入输出与依赖

输入：既有 DOM。输出：共享 `--focus-stroke` 配方。依赖现有 token 与 Catalog。

## 文件 / 模块边界

允许：`packages/design-system`、`apps/workbench` 焦点 CSS、`apps/desktop` Capsule 焦点、`plugins/native/{work,goals}` 焦点规则、`DESIGN.md`、`docs/cli-and-development.md`、`packages/design-system/README.md`、相关 spec 与测试。

禁止：改 Goal/Artifact 事实、MCP、凭据。

## 验收标准

1. Catalog 和工作台里，按钮、输入、选择、目录行的 `:focus-visible` 是内侧 1px `--ink`，不是 2px `--focus` / `--blue`。
2. 字段聚焦不把边框涂成靛紫。
3. `data-plain-field` 仍是底线。
4. 浅/深色焦点线对比度 ≥ 3:1。
5. 工作台/设置/Catalog 样式里不再出现 `outline: 2px solid var(--focus|blue)`。
6. 定向测试绿。浏览器打开 `/__ui/catalog` Tab 过按钮和字段。

## 验证命令

```bash
pnpm --filter @molis-ai/molis-work-design-system --filter @molis-ai/molis-work-app-workbench build
node --import tsx --test --test-concurrency=1 tests/primitives.test.ts tests/coss-control-language.test.ts tests/visual-foundation.test.ts
```

浏览器：`http://127.0.0.1:4195/__ui/catalog`（或当前工作台端口）浅色 Tab 按钮与 Input。

## 假设与开放问题

- 画布「当前节点」的 1px 选中边从 `--focus` 改成 `--ink`，选中仍靠填充/边，不用彩色粗环。
- 引导页进度点和选中填充可继续用 accent；只有焦点描边改墨线。
