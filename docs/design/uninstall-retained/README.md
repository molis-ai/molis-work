# 卸载后留下的项目（第 27 批 · BL-915）

状态：用户 2026-11-11 选定 A（就地结果），已实现；方案、理由、否掉的 B 与 C 记在 [BL-915 的 spec](../../../specs/visual-ui-experience/work-items/batch27-sandbox-recovery/spec.md)「设置页呈现」。

## 要解决什么

不保留数据地卸载一个从签名包装进来的插件时，平台会把能证明属于这次安装的东西删掉；证明不了的（比如留存的包没了，库认不出是它的）、别处还在用的（别的项目里装着同一个插件）、或者有资料读不全没法判断的，按约定**留下并说出来**（BL-915 spec 第 4 条「C 差异提案」）。卸载动作现在会回 `retained: [{ kind, reason, label? }]`，什么都没留下时不带这个字段。今天的设置页只弹一句「已卸载」再刷新，留下了什么、为什么，人不知道。

清理没做完（比如存它文件的文件夹被链接到了这个空间之外）时，这一行留着，只能用第一次的选择「重试卸载」（B27-UN-04），这一态也在样里。

## 怎么看

```bash
pnpm build
node docs/design/uninstall-retained/export.mjs
python3 -m http.server 4427 --bind 127.0.0.1 --directory docs/design
```

打开 <http://127.0.0.1:4427/uninstall-retained/>。顶上的原型条（不是产品界面）切换方案、情形（留下两项／读不全留一项／什么都没留下／清理没做完）、中英文与深浅色；窄屏用浏览器把宽度拉到 1440、1024、390 看。点「卸载并删除数据」→ 确认，即走一遍。

画在真实的「插件」设置页上：设置页外壳与样式来自 [`../kit/`](../kit/README.md)，插件页自己的行、折叠和操作行的样式由 `export.mjs` 从产品的 `PLUGIN_TRUST_SETTINGS_STYLES` 导出到 `dist/`（不入库）。部件都是组件板已有的：`mw-btn`（含加载圈）、`mw-alert`（带操作）、警示对话框 `mw-dialog--alert`（与插件页的 `ask` 同一个）、`mw-dialog`、带操作的 `mw-toast`、`settings-form-error`。**没有组件板新增**；`proto.css` 只排版。

## 三个方案

各方案共用的：每类留下的东西一行，先说是什么（「它的个人库」「连接账号的绑定」…），下面一句人话说为什么；不出现路径、id、引用名和凭据；什么都没留下时就是今天的「已卸载」轻提示。

| 方案 | 怎样给结果 | 好处 | 代价 |
| --- | --- | --- | --- |
| **A 就地结果（推荐）** | 刚才那一行原地换成一条提示（`mw-alert`，有需要核对的留下项时用警示色，只是别处在用时用信息色）：标题「已卸载 X · 有 N 项留下了」，下面逐项列出，末尾「其余数据已经删除」，按钮「知道了」收起。焦点移到这条提示上，读屏会读出来。清理没做完时，同一位置是一条错误提示，就地「重试卸载」 | 不打断，不会自己消失；结果出在人刚刚看着的地方；正常、留下、出错三种结果位置一致 | 页面上多一块，要点「知道了」或离开页面才收起 |
| B 轻提示 + 查看 | 行立刻消失；轻提示「已卸载 X · 有 N 项留下了」带「查看」，停 8 秒；点「查看」开对话框列明细。出错沿用今天的页顶错误、行内「重试卸载」 | 最轻，页面不多东西 | 轻提示过了就找不回明细；要看明细多一步；出错时信息分在页顶与行内两处 |
| C 确认框转结果 | 确认框不关，按钮转圈「正在卸载…」，完成后同一个框里给结果与「完成」；出错在框里说并给「重试卸载」 | 从确认到结果一条线，完成感最强 | 模态，要多点一次才回到页面；什么都没留下时也要特别处理（直接关框给轻提示），两种结果的去向不一样 |

推荐 A：留下的东西是人要知道、可能还要处理的事，不该随轻提示消失（排除 B）；也不值得用模态拦住人（C），而且 A 把正常、留下、出错放在同一个位置，人不用找。

## 文案

| 类别 `kind` | 中文 | English |
| --- | --- | --- |
| `home_library` | 它的个人库 | Its library |
| `owner_files` | 它存的文件 | Files it saved |
| `network_credential` | 它用的联网凭据 | Network credentials it used |
| `installation_binding` | 连接账号的绑定 | Account connections |
| `task_grant` | 交给它的任务授权 | Task permissions given to it |
| `declared_rule` | 它带来的判断规则 | Judgment rules it brought |

| 原因 `reason` | 中文 | English |
| --- | --- | --- |
| `ownership_unverified` | 核实不了是不是它的，为稳妥没有删 | Couldn't confirm it was this plugin's, so it was left in place |
| `other_holder` | 别处（另一个项目或个人空间）的同一个插件还在用 | The same plugin elsewhere (another project or your personal space) still uses it |
| `inventory_unavailable` | 有的资料读不了，没法确认还有没有在用，先留着 | Some data couldn't be read to check whether it's still in use, so it was kept |
