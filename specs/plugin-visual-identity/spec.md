# 插件图标与颜色补齐

目标：修复当前内置插件的缺色、空白图标，达到工作台内功能可用；保持现有布局、名称、交互和已确定的配色。

证据：`MW_PLUGINS` 缺少 Cognia、Plugin Builder、Images、Jelly、Workspace、Files、Git、Diff、Text Stats，侧栏与标签页因此退回灰色。Diff manifest 使用 `git-compare`，但共享 SVG sprite 未注册该图标。市场卡片及已安装快捷入口未绑定插件颜色。

方案：在共享 palette 中为上述 9 项选择现有明暗主题色；在共享 Lucide 图标表注册 GitCompareArrows 并纳入图标目录；将市场卡片与已安装入口绑定到同一 `--plugin-tint`，其图标沿用该色。已有插件保持原有色相，未声明身份的外部插件仍保留现有默认行为。不改插件功能、存储、安装状态或导航结构。

输入是现有内置插件目录及 manifest，输出是可见且一致的插件图标与配色。修改限于 `packages/design-system/src/{palette,icons}.ts`、`apps/workbench/src/styles/immersive-navigation.ts` 和本需求书；不覆盖工作区现有的其他修改。

验收：所有内置目录插件的图标引用均能解析为非空 SVG，所有目录插件均有主题配色；侧栏、已打开标签页、市场卡片、已安装入口同一插件颜色一致；在桌面与窄屏、明暗主题中实际渲染可见，无新增横向溢出。

验证：定向构建 Design System 和 Workbench；运行 `node --import tsx --test tests/primitives.test.ts tests/characters-appearance.test.ts tests/visual-foundation.test.ts`；复用隔离浏览器 fixture 实测计算样式、SVG 几何和截图。记录实际通过范围，不将浏览器验证称为 macOS 原生 App 验收。

当前无关键待决问题。颜色沿用现有语义色板；不新增依赖或配色框架。

## 验证结果（2026-09-23）

- Design System、Workbench 定向构建通过；上述 3 个测试文件共 54 项通过。
- 真实目录交叉核对通过：26 个内置插件均有有效主题色，全部 manifest 图标已注册。
- 隔离 Chrome 浏览器验证通过：1440×1000、390×844，各覆盖 light/dark；每组检查 26 个内置插件的侧栏 SVG 几何和计算色，以及 26 个市场卡片、12 个已安装入口、9 个修复插件的内容标签页颜色。无横向页面溢出。
- 标签页通过生产 tab state 操作创建展示用内容引用，再由生产恢复/渲染路径呈现；仅验证标签身份，不声称验证这些插件的内容业务。侧栏和市场使用真实页面与鼠标操作。
- 截图位于本地 `.tmp/plugin-visual-identity/market-{light,dark}-{1440,390}.png`，已目视检查桌面浅色及窄屏深色。临时验收脚本为 `.tmp/plugin-visual-identity-check.ts`。
- scoped diff 空白检查及独立只读复核通过。macOS 原生 App 安装包未重建、未作原生 App 实操验收。
