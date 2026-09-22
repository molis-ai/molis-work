# 焦点环：贴边实线，不要外扩蓝框

> 内侧、不外扩、不光晕仍有效。颜色和厚度已被 [neutral-focus-stroke](../neutral-focus-stroke/spec.md) 替换为 1px `--ink`。不要再把 `--focus` 当描边。

## 背景与目标

Functions 编辑器里点进「函数 key」一类 `mw-input` 时，焦点是一圈外扩的亮蓝描边：上沿被裁掉，整体像浏览器默认框。工作台大量容器 `overflow: hidden`，任何画在控件外面的环都会被切。同一套外扩 2px / 3.5px 光晕还散落在按钮、目录、画布、弹窗字段上。

完成等级 3：真实工作台与 Catalog 里键盘焦点可见、不被裁切；定向测试通过。不宣称原生安装包。

## 当前行为与问题

- `body.immersive-workbench :focus-visible { outline: 2px solid var(--blue); outline-offset: 2px }` 特异度（0,2,1）压过 `.mw-input:focus-visible` 的 `outline: 0`，字段上叠了一圈外扩蓝框。
- 字段自己还有 `0 0 0 1px` + `0 0 0 3.5px` 零偏移光晕。光晕同样外溢，在裁切容器里残缺，看起来廉价。
- 按钮、链接、画布节点、设置页、Feed 弹窗、Shelf 等各自再写一遍 `outline-offset: 2px` 或 `3px`。

## 范围与非目标

范围：工作台、设置、项目选择、Catalog、以及插件表面里的键盘焦点与字段焦点。画布「当前节点」的选中态去掉外扩光晕，只留强调色描边。

非目标：不改信息架构、密度、控件尺寸；不改 `data-plain-field` 书写面（仍用底线）；不重做引导页自己的焦点语言；不改领域行为。

## 使用场景

Tab 进 Functions 的函数 key、Feed 配置弹窗的 URL/类型、设置里的输入、目录行、主按钮、画布节点。窄屏或贴边编辑器里焦点环完整可见。

## 方案与关键决策

统一成**贴在控件内侧的 2px `--focus` 实线**：

```
outline: 2px solid var(--focus);
outline-offset: -2px;
box-shadow: none;
```

字段额外把 `border-color` 设为 `--focus`。2px 厚度满足 WCAG 2.2 Focus Appearance；全不透明 `--focus` 在纸面上对比度 ≥ 3:1。

取舍：

- 不要外扩、不要半透明光晕。那是浏览器默认框和「零偏移色晕」两套廉价信号。
- 行内链接（阅读正文、`.mw-btn--link`）保留 2px 外扩，避免描边盖住字形。
- `data-plain-field` 继续用 2px 底线，不要框。
- 危险态用 `--red` 同一套内侧实线，不用 `--red-soft` 光晕。
- 滑块拇指仍用 2px 实心环画在拇指上（伪元素不便用 outline）。

## 输入输出与依赖

输入：既有 DOM 与 `--focus` token。输出：共享焦点配方。依赖 [interaction-texture-upgrade](../../interaction-texture-upgrade/spec.md) 的色板与层级，本 spec 替换其中「1px + 3.5px halo」决定。

## 文件 / 模块边界

- `packages/design-system/src/styles/primitives.ts`：`mw-*` 焦点。
- `packages/design-system/src/styles/interaction-texture.ts`：字段与画布选中。
- `packages/design-system/src/styles/micro-interactions.ts`：末层兜底，保证工作台全局是内侧环。
- 工作台 / 设置 / 插件里仍写 `outline-offset: 2px|3px` 的焦点规则改成内侧。
- `DESIGN.md`、本 spec；[coss-primitive-library](../../coss-primitive-library/spec.md) 里那句 halo 底线一并改。

不改 MCP、凭据、插件协议、用户数据。

## 验收

1. 聚焦的 `mw-input` / `mw-textarea` / `mw-select` 没有外扩描边，环贴在控件边缘内侧，上沿不被裁。
2. 同一套内侧环出现在按钮、目录行、画布键盘焦点、Feed 弹窗字段、设置字段。
3. `data-plain-field` 仍是底线，不是框。
4. 焦点指示对比度 ≥ 3:1（浅/深色纸面）。
5. 定向测试通过。

## 验证

```
pnpm --filter @molis-ai/molis-work-design-system build
node --import tsx --test --test-concurrency=1 tests/primitives.test.ts tests/coss-control-language.test.ts tests/visual-foundation.test.ts tests/workbench-ui-platform.test.ts
```

浏览器：Functions 编辑器点进函数 key；Catalog 控件标本；Feed 配置弹窗 Tab 进字段。

## 假设与开放问题

- 引导页保持独立焦点色，不并入本次。
- Capsule 桌面小窗一并改成内侧环，避免两套语言。
