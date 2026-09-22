# UI 工艺底线：系统控件、图标色、动效都算本切片

完成等级：**规范生效**。本文件管开发过程，不宣称把现存所有违规一次清掉。

## 背景目标

工作台已经有 `mw-*`、色板、Lucide、动效 token，但切片常停在「能点、测试绿」。用户仍会碰到操作系统下拉、系统色盘、生硬切换、灰色图标配错色。视觉、动效、图标与色彩的搭配是产品活，不是收尾时再补。

## 当前行为与问题证据

- Catalog 对照写成「建议」，前端切片可以不看板就交。
- 选择框关闭态能画成纸面，打开仍可能是系统菜单；[mw-select-custom-menu](../archive/mw-select-custom-menu/spec.md) 已做增强，规范要写成禁令，避免新页面再露出系统列表。
- 仍有系统色盘（PPT 主题色）、系统时间控件（Schedule）、`window.confirm`（设置删除、Functions 草稿）。这些是已知欠账，新代码不得再加。
- 动效和图标色写在 DESIGN.md 里，开发清单却只验功能。

## 范围与非目标

做：把禁令和工艺写进开发规范、DESIGN.md、design-system README、UI Platform；选择框继续走纸面 `mw-menu`。

不做：本文件不一次替换 PPT 色盘、Schedule `type=time`、`window.confirm`；那些另开切片。不改领域契约。不把 Catalog 做成每次改 copy 的门禁。

## 使用场景

1. 新下一个拉选项：打开是 `mw-menu`，不是 macOS 白底菜单。
2. 插件空态：对象 Lucide + 该插件 `--plugin-tint`，不是灰字配随机蓝。
3. 切插件、开菜单、舞台到达：走已有位移/到达曲线，不是闪一下。
4. 点字段：内侧 1px `--ink`，不是系统蓝框。

## 方案与关键决策

UI 切片的完成条件包括工艺，不只功能：

1. **不准把操作系统默认控件当成产品 UI。** 禁止可见的系统下拉、系统颜色选择器、系统日期/时间弹出、系统 `alert` / `confirm` / `prompt`、未换肤的 `range`。选择的打开列表必须是 `mw-menu`；原生 `<select>` 可以隐藏当表单值。文件选择可以隐藏原生 `input[type=file]`，按钮必须是 `mw-btn`。原生 `<dialog>` 只保留 Escape 和焦点圈，外观走 `mw-*`。勾选/单选/开关用已换肤的 `mw-check` / `mw-radio` / `mw-switch`。
2. **图标与色彩成套。** 动作图标只从 Lucide 库取。插件身份用 `--plugin-tint`（轨、目录、空态标记、当前舞台）。状态用 status family，不是再发明一套。靛只给链接、选区、进行中。不要第二套 emoji/Unicode 图标，不要灰图标配随便一个强调色。
3. **动效成套，而且要做。** 只用 `--motion-*` / `--ease-*` 和已有位移：分段滑块、插件轨、目录 yield、`creative-arrive`。状态变了要看得出走过去或到达，不要硬切。hover / press 是色阶，不是浮起。不为动而动。`prefers-reduced-motion` 去掉位移和到达。
4. **焦点**继续内侧 1px `--ink`（[neutral-focus-stroke](../archive/neutral-focus-stroke/spec.md)）。
5. **对照 Catalog。** 改共享控件、状态、微动效先看 `/__ui/catalog`；达标的要补标本。一次性草稿可以先写在业务里，进产品主链前换成 `mw-*`，不得带着系统控件进主链。

编译、类型和测试通过不等于视觉通过。改了用户能看见的界面，要在真实页面看过焦点、hover、打开、到达和空态。

## 输入输出与依赖

输入：既有 token、`mw-*`、Lucide、select 增强脚本。输出：开发合同。依赖 [DESIGN.md](../../DESIGN.md) 与 [CLI 与开发](../../docs/cli-and-development.md#前端与控件板)。

## 文件 / 模块边界

允许：本 spec、`DESIGN.md`、`docs/cli-and-development.md`、`docs/platform/UI-PLATFORM.md`、`packages/design-system/README.md`、`specs/archive/mw-select-custom-menu/spec.md`、`specs/coss-primitive-library/spec.md`。

禁止：借本规范改 Goal 事实、MCP、凭据。

## 验收标准

1. 开发规范写明：系统下拉等 OS 控件禁止；图标色和动效是切片内工作。
2. DESIGN.md 与 design-system README 同一套禁令。
3. 选择框打开后仍是 `mw-menu`（既有增强）。
4. 已知欠账（PPT `type=color`、Schedule `type=time`、`window.confirm`）写在本文件，不假装已经清完。

## 验证命令

无新代码时只审文档。选择框回归：

```
pnpm --filter @molis-ai/molis-work-design-system build
node --import tsx --test --test-concurrency=1 tests/primitives.test.ts tests/visual-foundation.test.ts
```

## 假设与开放问题

PPT 色盘、日程时间、破坏性 `confirm` 另开切片换成 `mw-*` / Alert Dialog。
