# T391 独立验证｜验证线5

**结论：冻结候选的文档验收通过，RAC-2837～2839均满足；无当前必须修复项，建议full=false。** 这是实际文档产物与scoped diff的独立核验，不是CI、发布、采用或用户产品体验验收。

## 输入与实际范围

- accepted WO：`/Users/yijunwang/code/mw-coord/coordination/2026-10-28/tasks/T-391.md`；accepted补充及书审：`plans/T391/REVIEW.md`，根给协调提交`9ec049190b`。沿既定书审结论执行，没有重做架构书审。
- 准确M：`15ad4f397018241c8b31625aff8014b89259f239`。
- 准确H：`8c1970313438137b19f114fe9b7ae4f3392f6687`，parent就是M；tree `8762ccd9b471c21cd0c34fde3e02616620003f5f`。
- 独立从Git对象读到文档blob `20fb4c927add35f683a11c3b8eae6824cf40797d`，与作者FINAL-STATE里的实际验证blob相同；不是拿作者文字摘要代替产物。
- 作者工作树`/private/tmp/t391-dev`只读核状态干净；完整M→H diff仅`docs/system/EXTENSION-POINTS.md`，+10/−10。322行不变，实际改行37、61、77、240、244、252、253、277、279、282，恰在授权范围。未覆盖其它owner段落、README、源码、测试、SSOT表或门禁。

## 验收

| 编号 | 结论 | 独立证据与人工判断 |
| --- | --- | --- |
| RAC-2837 | 通过 | M的15个旧外加词项在H为0；逐行读10行diff和完整段落，表格多格替换完整。现在/目标均为SSOT文档一行且不计源码配置处数；61、77、252不再要求新插件手加assembly名单。 |
| RAC-2838 | 通过 | 完整读§1、§2、§3.1及F1/F5；页首20、SSOT表71、门禁生成说明85与改写一致，原文保持。77为“历史目标推演”、253为“按当时模型”，没有把旧workspace登记模型写成新实测成本。历史11/12/13/约21/1/4/6等成本、59未逐项重测限制、73历史解释、五项推演及253原X1括号保留；第3.12节与T148终端配方整段逐字未变。生成登记事实沿accepted书审；本次diff没有改相应代码或合同。 |
| RAC-2839 | 通过 | 独立完整diff唯一此文档；未改行全部保持。变动表行37的6个pipe、240/244各7个pipe前后相同，分别保持5/6列；人工核读单元格内容与完整上下文。全部Markdown链接未变，4个唯一相对目标按文档目录解析后均存在于H；相关关键路径亦存在。独立M→H的git diff --check退出0、无输出。 |

人工链接核对：`../../skills/molis-plugin-dev/host.md`→`skills/molis-plugin-dev/host.md`；`../releases/POLICY.md`→`docs/releases/POLICY.md`；`RUNTIME-MIGRATION.md`与`THIRD-PARTY-PLUGINS.md`均在`docs/system/`。没有新增或改变链接/路径token。另按H核SSOT、assembly gate、workspace登记/生成脚本、终端配方、风险spec、automation文档、actions合同等8个与相关段落有关的实际路径，均存在。未把不存在的历史文件名或占位路径当作本次新引入错误，也未声称逐一重查全文729个历史代码词项。

## 已用验证与边界

独立原件：[实际diff](candidate.patch)、[文档对象/范围/链接与保留项校核](verification.raw)、[提交级diff-check退出及原输出](diff-check.raw)。命令只读Git对象、worktree状态、范围及文件存在性；辅助文档比较是本次人工审阅的计数/定位工具，没有新增仓库测试。

已读作者`FINAL-STATE.json`、`checks.json`、`scope-check.json`、`doc-links.raw`、`inline-code-check.raw`、`affected.raw`、`final-diff-check.raw`和`CONTROL-NOTE.md`。作者现有brokenLinks为0问题，readMarkdown比较729个代码span文本/行号相同；这两项是已核绑定的作者证据，未冒称本线重跑。EXTENSION-POINTS不在skills/AGENTS/CALL-CHAINS的行内引用门禁范围，不能把其规则通过解释为本文件所有历史代码名均有效。

作者affected实际为`tests=[]、full=[]`，通用建议列出的完整health/boundary没有覆盖本单明确的最小文案合同；本线不机械重跑。独立diff只含这10行文档事实/措辞修正，无行为、合同、资源或门禁变化，支持full=false。按明确范围未运行build、浏览器、新tests、产品回归或完整health/boundary；这些不是本单验收缺口。

作者首次跨行code正则误读fenced block的辅助比较失败原件保留，随后换仓库readMarkdown，未修改产物或放宽门禁；不将准备工具误判计作产品失败或隐藏。本线未发生验证失败；此前等待时文件尚未生成是等待状态。

本线仅写`/private/tmp/t391-verify/`证据，未写GH、推送、改源/refs/协调账或清理工作树。作者与原件保留。最终候选文档验收无未完成项；CI、二审及发布/采用由根另结。

