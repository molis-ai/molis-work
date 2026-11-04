# 原型共用的组件板实件

状态：2026-11-04 起用（用户定：已选定方案、有界面的原型，都按组件板实件重做）。现在用它的有 [onboarding-full-journey](../onboarding-full-journey/README.md)（04）、[runtime-and-recovery](../runtime-and-recovery/README.md)（25/26）和 [role-scope](../role-scope/README.md)（36）。以后新画的原型也从这里取部件。

`docs/design/` 下的原型不再拷贝或自写样式。产品画界面用的样式表和脚本由 `export.mjs` 生成。原型加载的就是这一份，组件板 `/__ui/catalog` 用的也是这一份：同样的 token、`mw-*` 控件、到达框架、工作台底栏和设置页。产品样式一改，重新生成后原型跟着变。

## 怎么用

在仓库根目录运行：

```sh
pnpm build
node docs/design/_catalog/export.mjs
python3 -m http.server 4431 --bind 127.0.0.1 --directory docs/design
```

然后打开 <http://127.0.0.1:4431/onboarding-full-journey/> 或 <http://127.0.0.1:4431/runtime-and-recovery/>。`dist/` 是生成的，不入库。不跑 `export.mjs`，页面就没有样式。

## 这里有什么

| 文件 | 是什么 |
| --- | --- |
| `export.mjs` | 把产品的 `arrival.css`、`workbench.css`、`settings.css`，以及主题引导、图标 sprite、控件与到达动效脚本写进 `dist/` |
| `parts.js` | `window.molisParts(lang)`：用组件板标记画的部件，包括按钮、选项、状态、提示、行、说明弹层、底栏状态、字标、轻提示等。类名与 `data-slot` 和组件板、产品一致，样式来自 `dist/` |
| `prototype.css` | 只有两类内容。`[原型]` 是顶上的原型控制条，不是产品界面。`[组件板新增]` 是用户已选定、组件板上还没有的部件，见下表 |

各原型自己的 `proto.css` 只做 `[编排]`：把这些部件按已选定的版面排好，不定义新的外观，只用 token。

## 组件板新增（交 D 轨补标本）

这些部件是用户选定方案里有、组件板上还没有的。原型先按 token 画出来，组件板补了标本以后，原型改用组件板的标记。

| 部件 | 类名 | 用在 | 用户的话 |
| --- | --- | --- | --- |
| 带名字的步骤条 | `.cand-steps`、窄屏的 `.cand-progress` | 04 底栏 | 步骤条写出每步的名字；窄于 1280 只留当前名字，窄于 900 收起、改在纸顶显示进度 |
| 种类色块 | `.cand-kind` | 04 全程、25/26 的行 | 每类事物固定一种产品色（目的蓝、材料橙、模型紫…），处处一致 |
| 进度圆环 | `.cand-ring` | 04 项目卡、采用 | 「4 / 8 已就绪」；采用时大圆环数「已完成 / 全部」 |
| 成形中的项目卡 | `.cand-draft` | 04 目的、补问 | 像游戏里的任务卡：一格一个回答，正在回答的一格带强调边，空格是虚线槽 |
| 连接线 | `.cand-bridge` | 04 模型 | 材料（或 Coding）连到模型，连上才亮 |
| Dock 上的「暂不可用」点 | `.cand-pin-dot` | 25 某块暂不可用 | 哪一块打不开，就在去那一块的地方标出来；琥珀是要处理的，蓝是要知道的 |
| 来源阶梯 | `.cand-scope` | 36 项目设置 › 角色（方案 C） | 一个设置的值从哪一层来：正在用的一层抬起，被盖住的变淡，空的是虚线槽，停用的划掉 |

## 没有用的

组件板的 `mw-items`、`mw-stat` 只在组件板自己的版式样式里，产品样式表里没有，所以原型不用它们，改用 `mw-dir-row` 行和数字排版。
