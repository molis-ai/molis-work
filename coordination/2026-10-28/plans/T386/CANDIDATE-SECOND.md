# T386 独立二审：执行前合同核对

状态：执行前书审完成，无必须修订项；最终 H 的实现与证据二审尚未开始。负责人一审线2，本单承担独立二审；甲档无 FIRST。作者开发线4、独立验证线3。报告不预签 RAC-2823～2825、CI、Full、采用或产品验收。

## 输入与现行边界

读取协调工作区现行 `tasks/T-386.md`、`plans/T386/PLAN.md`、`plans/T386/REVIEW.md` 和 `plans/parallel-2026-11-01/PLAN.md`（均位于 `/Users/yijunwang/code/mw-coord/coordination/2026-10-28/`）。协调 HEAD 为 eb6632491945018b2a94d67ed1312152fc0d0167；任务书是根正在维护的未提交版本，并行窗口是未跟踪新文件，本次按明确派发读取它们，不将其冒称已提交。旧方案/书审中的开发线2、二审线5和唯一 writer 等待是历史安排，由任务书状态及新并行窗口的明确交接替代；无需为继续本单重做方案审。

冻结 M=db29f18d4f602fa8d9efb689a6a766aa9b07625f，tree=41a185430f6e9411b8949530c6b1cdd11eb6270b。本地 origin/main 与 M 一致；主检出 HEAD=08c9933d57e153d1d59bf2811f203056d4358992，因此所有产品判断均读准确 Git 对象，不用主检出文件代替。M 的直接历史含 T384 实际采用 15ad4f397018241c8b31625aff8014b89259f239（#1712）及 T369 #1716；本轮未请求 GH 或 fetch，不重新签 root 已完成的实时锁核查。

允许行为差分只有两原片的六路径，README 一条不变量和 S-30 精确目标行由根串行采用，预算及 APPROVED_CEILINGS 由根按实测逐资源许可。并行准备不等于构建/浏览器并发；公共 machine-slot、每类一槽、隔离环境和本地禁 Full 不变。无公共 test-kit、SDK/API、第三项产品修复或其他安全条款写授权。若最终实际差分改变身份/可见性/DOM/转发合同或有未解释冲突，先交具体 hunk，不整文件覆写。

## 当前静态核查

- T379 H=ea67075d13fde5353651645a4599bdf0ee5c4e1e，父 b6f92222fce89dfba756a580768889292cfe9967，差分恰四路径：navigation、side-panel 及 global-ui/issue-global-navigation 两测试。
- T380 H=b4382ea8f7ef1c21981dc31d1c4ee1432efe8f5b，父 3fd857792a27352030ac8f3544a3b57d418febc1，差分恰 frame-container 与 plugin-tab-groups 两路径。
- 六路径各自原 B 的 blob 与 M 对应 blob 完全相同，两片路径无交集。已读三生产文件的原准确 diff：有限可信 Mod+K/F、child 已处理/组合/重复/终端排除、嵌套 actual source/current/open/visible/non-inert 检查；T380 仅嵌入 workbenchPane+Goals+无 paneItem 时恢复已校验 lastBoard。没有此轮新证据要求改原合同。
- M 上 `plugins/native/goals/src/page/documents.ts:120` 仍声明现行 Goals terminals route；ports.ts 为必填 string；`apps/workbench/src/terminal/pane.ts:46` 仍生成 data-tui-pane、goal-id 和 terminals-route，client.ts:49 读取交给 panels.ts。M 的 global-search 仍按终端目标排除 K/F。故旧书指出的接缝在当前 M 有静态支撑，但不等同最终生产菜单实操通过。
- 观察到作者进行中的 HEAD=f204d1b065470a538b90857a7de1f543de424579，tree=e62a15d0bde983b060346b8b907c0900279b3f4c，M→该快照六文件 +241/-2。它尚非根交付的最终 H，不签该头通过、不干预作者工作树。预期作者/独立报告 `/private/tmp/t386-evidence/REPORT.md`、`/private/tmp/t386-verify/REPORT.md` 本次读取时尚不存在；未据此制造实现失败。

## 验收合同足够明确

书审的两处 oracle 已落实：

1. A 固定顶层 shell 真实搜索入口，原生 K 关闭/F 打开聚焦，同 owner 唯一 dialog；前后核左 CORE 固定 pane/tab/goalId/标题正文，右同 pane 无 paneItem、INTERFACES 可见并可真实点击。该项不称右 Goals 跨窗转发；opaque 主区/嵌套 Issue 来源正负例由最终 H 的完整两测试另证。
2. B 最终生产 UI 自定义命令 input 核实际 document/frame/goalId、终端祖先、可见/非 inert、现行非空 route、activeElement、原生 trusted/handled 回执；搜索保持关闭、值为空、owner terminals 读回及创建/执行非 GET 为零，真实取消。它只签 Goals 宿主菜单排除；opaque child 的 DOM target 测试单列，不扩大到运行中 xterm/PTY/Agent。

最终匹配整体构建后，三原 e2e 完整一次 jobs1/retries0，保留旧断言；按实际结果计数，不预填 10/10。作者、原独立证据和新组合证据分来源；不机械复制 README 188 批、scene5/7 或 T384 全矩阵。48 served 的准确 M/H bytes/hash、必要增长说明和根准确 tuple、文案 hunk、边界/merge-base health/import graph/文档/diff/预算及清理原件均在最终审查范围；有最终有效原件可核抵，不由二审再次启动测试。

## 后续二审与保留项

待根提供最终 H/tree、作者报告和独立验证报告，再核实际 scoped diff、两片保留、README/S-30 未覆盖其他条款、资源许可与实测、匹配构建、三完整文件、A/B 独立 oracle 和清理。届时逐条结 RAC-2823～2825 的已验证与仍由根结算部分。准确 H 的 Verify、适用 SI、该普通 PR 自身 Full 和采用由根处理；并行窗口明确 Full 暂停另结 T389 旧 Linux 问题，本次不触发、不调度、不预签。

旧 Full 失败、首败/retry/skip、网络 UNKNOWN、三条旧 driver 准备失败与运行中真实 PTY 未验继续保留。局部通过不销整条 W6、最终 App、用户验收，也不倒签原 PR merged。

本次操作仅只读 Git/协调文件/已有 patch 与文件存在性，新增本报告。未写源码、索引、refs、协调文件、GH；未运行构建、测试、Full，未启动 Host/浏览器或访问真实 Home/Keychain/凭据。

## 资源与配套文档预审补充（候选 f204d1b，尚未最终签署）

结论：本轮指定的资源必要性、源码省量判断、精确 tuple 和 README/S-30 接入，**无 Blocker/P1 或必须改源码项**。支持根据此串行决定以下两条一次性许可；本报告本身不授予资源许可，最终 H/根许可/独立验证未齐，不能终签。

| 资源 | 准确 M → 候选 H | 增长 |
| --- | --- | --- |
| `/assets/molis-work-plugin-frame.js` | 190838 → 191017 | 179 B |
| `/assets/molis-work-workbench.js` | 1150615 → 1151174 | 559 B |

独立重算读取 `base/candidate/served.raw`、`served-hashes.raw`、`measure-build.json`、`budget-result.json` 和 `served-delta.json`：每边官方 measured 与 hash 探针 measured 逐项相同；两边均 discoveryMisses=[]；键集合均48，无增删。重算逐项 bytes/hash 与 delta 全部相符，其余46项两者均相同，总数 M=7469519、H=7470257，仅总增长738B，没有跨资源抵销。构建原件所报 actual digest 与各自 manifest source_digest 相符，准确 M/H/tree 与派发一致；这是读取作者原件核对，不改署为本线重新构建/测量。

已把外置 `measure-hashes.mjs` 与候选 Git gate 全文比较：只增加 node:crypto createHash，在原 record 回调对同一 response bytes 计算 sha256，并传到 JSON；原路由发现、Host serve、字节/gzip计算、比较规则未改。候选原 budget exit1 精确保留两项未许可增长；M exit0。不把 report 模式 JSON 正常退出误称预算通过。

增长有明确行为对应：plugin-frame 是可信 owner 的两键名单和 child 终端拒绝；workbench 是嵌套搜索的真实 source/current/open/visibility/inert 拒绝以及嵌入 Goals 首页按既有 URL 恢复 lastBoard。均复用现有 port、source resolver、搜索处理器与已有状态，无新名单/状态镜像或框架。删去这些条件不能满足原验收；为省量移到 inline、改 minifier 或删其他功能不合范围。作者“省量”是**源码审阅**，没有独立压缩实验，不应在 PR 写成实测优化获益；本线也不宣称这738B是数学最小值。当前小额增长无需为压缩重新改动已审冻结行为。

M 的 APPROVED_CEILINGS 只有已消费 workbench `[1150291,1150615]`（T384承载的T362 +324B）。根本轮需以 `[1150615,1151174]` 替换它及对应旧说明，并新增 plugin-frame `[190838,191017]`；预算数等于各自实测。旧+324已经在M，不能复活旧tuple或再次加算，也不带兄弟未采用任务的许可。其余门禁算法/阈值/资产集合不变。最终准确hunk与预算通过仍待后续核对。

配套 patch `/private/tmp/t379-evidence/shared-docs-candidate.patch` 已逐项对 M 核：S-30 删除行与 M **全文相同**；新行只在既有名单检查后追加嵌套搜索来源/可见性拒绝，以及 issue-global-navigation 的 RAC2801/2802 证明引用。README 的全部旧上下文在 M 均存在，新增仅一条不变量。可按两处精确 hunk 接入；不整段覆写、不得改 S-30 以外条款，尤其不覆盖 T143/T148 或并行 S-103。本线未应用 patch。

已阅读 CONTROL-NOTE 和两份 failure.json：首轮 A 在右行指针命中处失败，第二轮 B 准备阶段在错误顶层 document 找到 hidden 工作按钮；均不得销去或计通过。有效 `qa2/A.json` 五态左右身份/内容、顶层唯一 dialog、trusted K/F和右行 trusted 指针保留，不重跑 A。`qaB/B.json` 是另一个合成 Home 的 top Goals document，frame=null、明确 goalId/route、终端祖先/可见非 inert/焦点、K/F capture及after trusted且prevented=false、空值/关闭搜索、两次 owner panels=[]、terminalMutations=[]；只支持该单栏生产菜单负例，不签双栏终端或运行中PTY。三完整e2e raw 命令 jobs1/retries0、exit0 与文件4+3+3计数已读；动态完整归因及独立证明仍由验证线3结算。本轮未重新执行它们，也未将根查看成功截图的行为改署本线。

作者报告/FINAL-STATE仍明确六文件冻结、资源失败待许可和最终重新绑定。旧 Full 失败、旧准备失败、网络 UNKNOWN、真实PTY未验继续保持；本补充不消除 CI/适用SI/自身Full/采用等剩余项。仅追加本报告，无源码/GH/构建/测试/Full写操作。
