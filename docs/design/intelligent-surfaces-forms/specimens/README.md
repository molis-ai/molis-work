# 四形态实件标本 · B

状态：第 15 批设计准备，可打开操作；沿用 2026-11-03／11-04 已定 B。未接产品 renderer、组合服务、真实 Home 或动作，不代表组件板、产品或用户验收完成。需求沿 [智能呈现 §13–16](../../../../specs/intelligent-surfaces/spec.md) 和 [共用控件合同 §7](../../../../specs/shared-sources-and-surfaces/spec.md)。

## 打开

从仓库根目录：

```sh
python3 -m http.server 4418 --bind 127.0.0.1 --directory docs/design
```

打开 [标本](http://127.0.0.1:4418/intelligent-surfaces-forms/specimens/)。也支持 `?lang=en&theme=dark&long=1&state=stale`。上方控制区明确属于标本：切换十种状态、四处位置、中英文、深浅、长标题；不保留业务状态，不调用网关，不等待后伪造成功回执。

## 真实复用与新增组合

| 形态 / 行为 | 真实来源 | 本目录的组合 |
| --- | --- | --- |
| 名字片 | 组件板 `mw-tag`；SDK `renderStateRing` | 插件色块、名字、12 段环与状态文字；聚焦、悬停、触控打开速览 |
| 行 | 组件板 `mw-item` / `ITEM_ROW_STYLES` | 插件领头；标题单行省略，共享 tooltip 能读全；时间与人、状态、一个主操作及更多。后果独立常显 |
| 卡片 | design-system `renderPreviewCard` | 真实预览卡外加 B 色带与操作区；不覆盖真实卡片的字体 |
| 速览 | `renderPopover`；窄屏 `renderSheet` | 同一对象内容；宽屏锚定、窄屏底部。Sheet 原来是侧面布局，底部定位是本标本的组合样式 |
| 按钮、分段、菜单、图标 | `docs/design/kit/` 中的 `renderButton`、`renderToggleGroup`、菜单与 Lucide sprite | 不重写按钮与状态环；标本控制项用真实 `is-current` |
| 键盘、提示、动效 | kit 的共享 roving focus、floating details、tip、state ring client | 菜单第一层 Esc 不关闭速览；速览关闭归还触发点。减少动效时真实环停止动画 |
| 插件色块 / 色带 | **组件板新增组合**；颜色来自既有 blue / mint / purple palette 的 soft 和主色 | Goals、Inbox、Coding 对应样例；只在插件身份区域着色，状态保持自己的环与文字 |

`build.mjs` 从当前 design-system 的 `overlay.ts` 取 `renderPreviewCard`、`renderSheet`，从 `catalog-patterns.ts` 取真实组件板样式，生成 `parts.generated.js`，不改共用 kit。字体角色值从同一 `resources/fonts/system-sans.json` 读取，填入已有 weight/tracking 变量；不新增 token。目前基线没有字号语义变量，因此组合文字继承页面字号，字号只留在标本外框标题上。

已有依赖时：

```sh
node docs/design/intelligent-surfaces-forms/specimens/build.mjs
```

无依赖的设计工作树可显式借用已安装工具：`SPECIMEN_TOOL_ROOT=/path/to/installed/worktree`。它只借 esbuild 和检查用公共 test-kit，渲染源码仍从当前工作树读取；本轮没有安装或构建产品。

## 状态和操作边界

- 普通、进行中、要决定、要验收、失败、部分完成、旧值、无权查看、已删除、首次读取失败均可选择。同一对象从一份示例值生成四形态和位置样例。
- 旧值保留内容，明确写出 **示例**最后读取时间 `2026-11-08 09:40 UTC−08:00`；原操作位改为原因和可打开的本页读取说明。首次读取失败没有旧标题、旧正文或读取时间。
- 无权与已删除的示例值本身不含标题/正文；四形态和位置不保留对象操作。无权时只显示所属插件及无权状态。
- 外发不可撤回、付费模型、停止不可继续的后果始终显示。主按钮只打开「操作预备标本」，没有执行按钮，没有回执。关闭后对象状态不变。
- 「打开到准确位置」「查看读取状态」进入本页的明确示例落点；返回保留原位置、状态与焦点。这证明定位/返回的设计，不证明真实插件导航或重试。
- UI 中英文可切换；示例对象标题作为用户内容保留原文。示例数据没有使用稳定文字键，也没有提前接第 16 批语言资源。

## 检查证据

2026-11-08，通过公共 test-kit、独立 `~/.local/bin/molis-test-browser`、独立临时 profile、机器 browser 槽运行一个串行检查脚本；结束关闭本次浏览器并删除 profile。只检查本目录静态标本，无全量或产品测试。

```sh
node scripts/machine-slot.mjs run browser --label 'batch15 static specimens' -- \
  node docs/design/intelligent-surfaces-forms/specimens/check.mjs
```

驱动可同样用 `SPECIMEN_TOOL_ROOT` 指向已有依赖的工作树；服务端口不同则设置 `SPECIMEN_URL`。

- IUI-26：1440／1024／390 × zh/en × light/dark 的 12 组合，使用长标题和外发后果；检查实际主题、无横向溢出、状态/后果可见、行单行、12 段环、当前控制项。每组合留截图，390 另截卡片区。
- IUI-10：桌面英文走十种状态，旧值有明确时间、首次失败无旧值、无权/删除不泄露标题且无对象操作。每状态留截图。
- IUI-26：真实键盘方向键菜单、第一层 Esc 关菜单、第二层 Esc 关速览并回焦点；单行长标题共享 tooltip；悬停速览；触屏打开底部 Sheet；减少动效时状态环几何不变。
- IUI-03／08 的设计局部：四位置同值；本页定位及返回；查看操作预备不会产生状态变化。没有验证网关、幂等、跨页面事实更新或持久化。

输出在已忽略 `.impeccable/qa/review/batch15-presentation/`，包含 `report.json`、12 组合、状态、悬停和手机 Sheet 截图。未进行真实读屏软件或原生安装包验证。用户 2026-11-08 在第 15 批会话确认「按这版继续」产品接入；这是本标本的定样确认，最终产品验收仍待真实接线。

## 产品 writer 仍需落实

1. 唯一 `renderPresentationForm` 落在 SDK `/ui`；SDK 不依赖 design-system。当前私有 `renderPreviewCard`／Popover／Sheet 等函数如何迁移及入口装配由产品 writer 串行落实，本设计包不是 SDK 导出。
2. 真正的数据、owner、route、read_at、notice、授权、actions 及更新从 S-1 与插件合同来；示例数据不能移作产品事实或用例成功证据。
3. 组件板用真实新 renderer 装配四形态，补插件色块/带；完善每个内置插件状态清单。这里三插件示例不替代 IUI-24。
4. 产品页面应用完整字体与外观基线、真实精确导航/返回、网关执行与恢复；菜单/Sheet 的组合样式要随同组件迁入唯一 owner。第 16 批切换前不接稳定文字键或页面消费者。
