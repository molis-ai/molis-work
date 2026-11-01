# T379 + T380 小普通承载 PR 可行性（只读候选）

状态：2026-10-31 PDT，只读准备；T384资源窗实际采用后才由根定scope、writer及许可。未建实现分支、未构建/测试、未写GH或资源门禁。唯一行为需求仍为协调tasks/T-379.md（RAC2800～2803）与T-380.md（RAC2804～2806）；不承接T065/T121或整条W6。

**可以安全准备双片合成，当前未见必须维持单片的语义冲突。** 精确候选：T379 H=`ea67075d13fde5353651645a4599bdf0ee5c4e1e`，B=`b6f92222fce89dfba756a580768889292cfe9967`；T380 H=`b4382ea8f7ef1c21981dc31d1c4ee1432efe8f5b`，B=`3fd857792a27352030ac8f3544a3b57d418febc1`。根若选双片，以T384实际采用后的新M为输入，不使用作者旧资源数字直接落账。

## 实际改动和共享点

- T379只改 `apps/workbench/src/browser/plugin-frame/navigation.ts`：可信owner有搜索dialog时追加精确Mod+K/F，child保留handled/composing/repeat拒绝并在relay前排除真实终端目标；`apps/workbench/src/side-panel.ts`：只有搜索消息新增同源/current/open/visible/非inert/真实source检查，非搜索工具键仍原分支。另改两个完整e2e。T380只改 `apps/workbench/src/scripts/client/frame-container.ts` 的restore：已嵌入、workbenchPane、panePlugin=goals、无paneItem的页面将curTab恢复为已校验lastBoard；正常单栏、item页和非Goals不命中。另改plugin-tab-groups完整e2e。**两片生产/测试文件集合交集为0，不是二者都修改frame-container。**
- 真正共享的是frame装配/可见性、终端目标和workbench资源：T380恢复页面选择→sync/applyUiState决定Goals页面是否可见；T379仍依赖真实可见frame/MessagePort来源，不能因右页可见就放宽消息检查。T384带入T148终端pane和T116页面端口，故组合须保留`[data-tui-pane]`/`.xterm`目标排除和新terminalsRoute，不以旧DOM夹具代表最终真实终端菜单。没有新增协议字段、身份、权限、业务状态或layout存储。
- 复用 `/private/tmp/resource-batch-feasibility/raw`：原两两merge-tree为exit0/tree `4eb10c80a5d58c20c3348410813618c67af0d47e`。本轮在临时对象库以已知main328d5b6先合T379、再合T380亦exit0，tree=`7cbf1ce9ac12d6f7830fc7721eb9a7900e7dcbce`，6文件+241/−2。T384原四片预测树对这六路径无diff；但其port/golden修复与未来采用main未被这次预测覆盖，故最终新M仍须重算。没有生成作者工作树或分支。

## 允许范围与资源窗口

根选定唯一writer后，从T384已采用M正常合两准确H。行为写路径仅上述三生产文件及 `tests/global-ui-interaction.e2e.test.ts`、`tests/issue-global-navigation.e2e.test.ts`、`tests/plugin-tab-groups.e2e.test.ts`；没有证据需新增抽象或额外源码。T379已审的配套文案来自 `/private/tmp/t379-evidence/shared-docs-candidate.patch`：`apps/workbench/README.md`的一条不变量、`docs/system/SECURITY-INVARIANTS.md`仅S-30目标行，由根按当前文档串行采用。资源预算 `tooling/gates/page-assets.json` 与 `scripts/gates/page-assets.mjs` 的精确ceiling同样由根scope/许可；writer不改算法、阈值或其他任务许可。新main若有实际冲突，只交具体hunk给根裁，不整文件取旧版本。

旧实测仅作预算依据：T379 plugin-frame.js **190838→191017（+179B）**、workbench.js **1150072→1150432（+360B）**；T380 workbench.js **1150291→1150490（+199B）**。双片workbench新增约559B、plugin-frame约179B是**估计，不是最终tuple/许可**。T384 +324B若已落main，已是新M基数，不能再加一次或复活旧放行。

最终正常整体build与workspace构建后，唯一一次读取当前Host实际served的48项bytes/hash并逐项比M，确认键集合无新增、其余资源是否真相同；压缩可能使delta非线性，不相加旧数字。增长不能靠别的资源下降抵销。根按现有小额必要增长流程核真实理由、每资源准确base→实测end，在APPROVED_CEILINGS给一次性精确tuple并更新实测预算，清已消费项；不留slack，不改门禁算法。预期两资源都远小于10KB且无新asset，**仍需根明确许可，本文不授予许可**；若实测出现新资源或任一增长>10KB，按原规则交用户决定。窗口必须在T384资源结算后，不能抢当前writer。

## 能沿用与最小组合新增证据

T379 [独立REPORT](/private/tmp/t379-independent/REPORT.md)：干净H两完整文件7/7，最终产物Todo/嵌套Issue原生K/F、真实生产终端菜单输入不抢键；作者README28文件188项仍归作者，原三条driver失败及运行中xterm/PTY未验边界保留。[二审](/private/tmp/t379-second/REPORT.md)无代码/测试必修，但当时资源失败与README/S30未采用，不倒签全绿。

T380 [独立REPORT](/private/tmp/t380-verify/REPORT.md)：干净H完整plugin-tab-groups首轮3/3，正确右frame真实双击、左右内容隔离、reload/关闭后操作；作者18unit/17browser与旧网络UNKNOWN各保原来源。[二审](/private/tmp/t380-second/REPORT.md)无必修，+199B旧gate失败仍留账。候选未变blob和测试可沿这些准确范围，不能称其已在T384后组合执行。

新增只做实际组合：匹配整体build后，在隔离Home/专用浏览器、公共browser槽/jobs1/retries0完整执行上述**三份e2e**（原7+3项按新文件实际结果记，不先预签10/10）。它们分别守主区/嵌套搜索安全来源、右Goals页恢复、旧ISSUE35与分屏回归。再在最终组合产物窄核一次：右Goals页面可见时打开/关闭搜索不令左CORE与右列表串页；真实生产终端菜单输入原生K/F不被搜索消费，保持空输入且无terminal创建请求，不启动PTY/Agent来补绿。此为跨两修复及T384终端markup的最小接缝，不重跑原README188或整条scene7/scene5，不建立新矩阵。若相同输入已有最终组合的有效实操原件可核抵，不重复。

整体build后核boundary、merge-base health、test-import graph、served/page-assets及推前fresh-fetch后的secrets；新增README/S30引用检查随health。无公开API/动作/Manifest变化，不为凑流程刷新快照。T384已通过的生产测试只在新diff触及时补，原T384 Full不能背签这两个新修复。

## 普通PR、一次Full与实际采用

执行书已将独立书审的两项oracle落实在 [T-386.md](/private/tmp/w6-pair-carrier/T-386.md)：组合搜索固定从顶层shell既有入口操作，钉住该owner内唯一dialog和左右pane固定内容身份；生产Goals终端菜单负例与opaque child排除各按自身路径签证，不推称右Goals跨窗搜索或运行中PTY已验。

根接受scope/资源许可并完成最终增量审验后才推一个普通 `feature/*` 承载PR；同一最终H的Verify、验证/二审及S-30所需SI满足入场，根给该PR一次full-suite标签（普通最多6runner），不建integration镜像、不混排当前T384 Full。回读真实checkout parents/tree、首败/retry/skip，§8在同H结算。普通CI或预测无冲突不替Full；新失败按具体归属回原片修、重新合成，保留UNKNOWN。

实际采用后根回读main，对六原文件逐片核blob/patch-id及文案/资源hunk（资源与配套文档会使总patch-id不同，逐项解释），分别记录T379/T380由承载采用，保留原owner和作者/独立/二审来源；若后来已有原PR，只在实际采用核实后按根流程关闭，不能预签原PR自身merged。只结各自RAC覆盖的修复，不将W6实操首败历史、RAC11、运行中PTY或最终App/用户验收全部销账。

根最终决定是否合批；新M若出现具体未解释的可见性/shortcut来源或Frame restore语义冲突，则按该差异保持单片，不因同名文件或小额资源估计决定冲突。当前候选足以准备小双片，不需要纳入T065/T121增加收益。
