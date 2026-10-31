# T-370 · W6-04 新序列方法稿 v1 — Codex 开发线 3

状态：方法及修订2数据已通过原验证、二审两线定向复核，根已采纳冻结 B/M 中间点。本文不签 W6-04 最终终点、W6-05、风险关闭或全线验收。执行记录及持久包依赖/重跑入口见 `REPORT.md`，本次打包未改变计量规则或脚本字节。

## 1. 输入、来源、执行边界

持久包说明：本文中历史结果目录的相对位置均以原件根 `/private/tmp/w6-04-measurement/` 为基准，不表示包内附带大 JSON。包内文件与原件、协调目标位置的区别及加载/重跑命令见本包 REPORT；本次未改变下述测量规则。

两端固定，不在运行时重新解析移动的 main：

- 开工 B：`fccb2a3003de86af556f0030923f9e76ddf369c7`。
- 当前中间点 M：`b9a9755786f3d29774bf706f1f68c3ce4bf8bfb8`，本单开工**第一次**读取本地 `origin/main` 所得；没有 fetch 或 GitHub 查询。随后跟踪引用前进，生成 `INPUTS.json` 时误取到后继 `f640b5b0f1113c8eb96c51f43fab4a637f434b17`。预审修订统一以首次观察的 b9a975 为 M，之后一律使用完整 SHA，不再解析移动引用；不宣称开工时已核服务器最新 main。
- 任务书：`/Users/yijunwang/code/mw-coord/coordination/2026-10-28/tasks/T-370.md`（派单标明协调 cf2a623d6）。任务书替代重复 spec；不改其归属行或共享 spec。
- 仓库 Git 对象库：`/Users/yijunwang/code/goalboard`；读取 `git ls-tree -r -z`、`git cat-file --batch`、`git show`、`git log --first-parent`、`git diff-tree`。只取上述 SHA 及抽样提交的父树／结果树，不读取生产工作区源码或 dist，不建 worktree。
- TypeScript **5.9.3**。现有安装入口：`/Users/yijunwang/code/goalboard/node_modules/.pnpm/typescript@5.9.3/node_modules/typescript/lib/typescript.js`；运行时核 version，不自动安装／升级。Node 使用现有 Node，完整测量运行时将其准确版本写进结果；不靠 Node 版本推断产品行为。
- 唯一输出根 `/private/tmp/w6-04-measurement/`（`/tmp/w6-04-measurement/` 为同一 macOS 目录）。没有构建、测试、真实 Home、模型、GH、外部服务或 Git 写入；不运行 gate CLI，不更新例外、阈值、baseline 或 allowlist。单进程串行读取两端，不并发跑量；若实际 CPU 持续挤占机器，交统筹安排共享槽，不自行放开并发。

Owning sources 按 M 的 Git 对象留只读副本于 `sources/`：原任务书 `docs/prompts/repository-anti-corruption.md` §3/§4.5；主 spec §2/§3/§12.5；`docs/system/HUGE-CLASS-MIGRATION.md`；`docs/system/PACKAGE-BOUNDARIES.md`；当前 `scripts/check-health-gates.mjs`、`scripts/gates/{structure,contracts-purity,host-entry-exports}.mjs`、`scripts/test-imports/{snapshot,parse,graph}.mjs`、`packages/test-kit/src/boundaries.ts`、`scripts/workspace-packages.mjs` 和巨大单元登记表。

§3 是历史逐项复核，不是当前全线验收；§12.5 说明旧脚本一次性未入库。旧表保留，绝不把它的 B 列同新 M 数字拼起来。这里的算法、样本和指标分解均形成 **W6-04-v2 新序列**，B/M 都重算。旧 13 路径只有描述，现有文字不能唯一确定全部 13 个精确路径；下文显式冻结新清单，不声称找回原件。

## 2. 共同文件与包规则

源码主口径沿用当前 giant 扫描范围：Git 树中普通 blob，前缀 `apps/ horizontal/ modules/ packages/ plugins/ server/ tooling/`，后缀 `.ts/.mts`；排除 `.d.ts`、路径分量 `test/tests/fixtures/dist/node_modules`、`*.test.ts/*.test.mts`。不扫描工作区未跟踪文件、symlink、submodule、vendor；JS/TSX/Rust/Swift、scripts/examples 不进入这个“TS 源码体量”分母，单列排除清单与文件数，不包装成全语言代码体量。生成但已跟踪的 TS 仍计入，不因巨大而排除。文件行数为 UTF-8 解码后 `text.split('\n').length`，末尾换行计空段；CRLF 不额外多一行，空文件为 1。AST parse diagnostic 逐项输出，不能悄悄跳过后称全量准确。

包 owner 不从测试名推断，也不以当前登记表倒投历史：每个被读树的 `pnpm-workspace.yaml` 简单 packages glob 与真实 `package.json` 取交集，支持固定的 `*`/`**` 与 `!` 排除；先按 glob 原顺序应用，再按最长包目录归属。无法解析的 glob／重复包名记录错误，不按不存在处理。使用该树 manifest 的 name、path，根 package 不算 workspace 包。保留已删除历史包，换名／换路径不强行合并成逻辑同一包。

非 workspace 路径单列 `root`（根文件）、`tests`、`docs`、`specs`、`scripts`、`skills`、`vendor`、`other`，不能塞进包数。包内 test 仍有 package owner，但源码扫描依上面的排除规则。Owner 映射逐树来自 Git，不执行历史 JS 登记文件。**新序列的层类别在两端固定使用 M 的规范矩阵**：`apps/*→app`（包括 `apps/server`），独立 `server/→module`，`packages/*→foundation`，`horizontal/*→horizontal`，`modules/*→module`，`plugins/native/*→native-plugin`，`plugins/official-integrations/*→integration-plugin`，`tooling/*→tooling`；其他 workspace 包→unclassified 并列明。contracts 与 plugin-sdk 在 foundation 下另带专用标签。每端历史登记类别另存作解释列：B 的独立 `server` 登记为 foundation，M 为 module；这是分类沿革，不能把因此改变的层标签当作代码迁层或依赖改善。包的存在、名称、路径及 PR 父／结果树 owner 仍按各自 Git 对象取。

## 3. 第一组：体量与巨大单元

逐文件记录 path、blob、文件行数；AST 使用 TS 5.9.3 `createSourceFile(..., Latest, true)`。类／函数起点 `getStart(source)`（不含前导注释），终点 `getEnd()`，行数=endLine-startLine+1，包含节点内部注释、空行、内嵌模板。模板内代码只占外部节点与文件行数，不二次解析为函数。

- 文件：严格 `>800`；补充 `>1000`，主分母为全部入选源码文件。
- 类：声明与表达式都计，含匿名类。分别报 `>300 行`、`>25 方法`，另报这两项并集的独立类数。方法按 MethodDeclaration/GetAccessor/SetAccessor **成员声明数**计（沿用当前 gate：get/set 各一项，重载签名各一项，static/private/computed 均含）；构造器、函数属性不算“方法成员”，但各自另列数量。保留是否有 body，避免误读成可执行方法数。
- 函数主口径：有 body 的 FunctionDeclaration、FunctionExpression、ArrowFunction、MethodDeclaration，严格 `>150`；补充 `>300`。这是当前 giant gate 的四种节点。无 body 的重载／接口签名不计可执行函数。
- 构造器/get/set：有 body 者用相同 span 单独报告 `>150`，不悄悄并入原四种函数合计。函数属性的箭头依箭头计一次；嵌套函数／回调分别计，外层 span 仍含内层，故行数不可相加当独立代码量。
- 标识用 `(path, SyntaxKind, startOffset, endOffset)`，展示词法 owner、名字、起止行；同名不取 max 合并、不去重漏单元。匿名节点按词法上下文与 offset 展示。
- 总览分别给文件／类行数／类方法／函数四列。可以给“阈值命中次数”和“独立类并集”，不把四列之和说成互不重叠的缺陷数。登记合理单责是用户允许的保留机制，体量上升如实保留。

登记取各端自身 `tooling/gates/giant-exceptions.json`：未有文件标“该端无机器登记机制”，不把后来的 M 登记套回 B。使用 M gate 的 key 命名规则建立辅助匹配，与我们的 offset 身份分开；按 key 唯一且 kind/reason/size 符合现行判定区分“登记且匹配／登记但 size 失配／未登记／键歧义／孤儿登记”。所有巨大单元仍进入总量。方法、匿名身份与 gate 命名差异保留映射，不新造例外，不据门禁准入判断代码质量。

## 4. 第二组：边界穿透（分列，不凑一个总数）

复用 M 的纯 AST `parseImports(file,text,{deep:true,detail:true})`：import、export-from、import-equals、字面量 import()/require()；同一语法节点一次，import/export 中多个名字不多计引用处数。纯类型按语法 typeOnly 字段分列，混合 type/value 声明算一个“可能运行时”引用并保留逐元素标记；不是实际执行证明。不解析注释或模板中的伪 import。非字面量、createRequire、生成源／eval 未解析项单列位置和数量。

**测试内部引用**：分母 `tests/` 下全部跟踪 `.ts/.mts/.mjs`（含 helper/fixture，不含声明）；归一相对路径后指向任一该端真实 workspace 包的 `src/` 或 `dist/` 就计，server 直接 `server/src` 也覆盖。按引用处、涉及测试文件数、目标 owner 分组，src/dist、typeOnly/可能运行时分列；包名深路径指向未公开内部入口另列，不混进历史“相对内部路径”列。仅有路径但目标文件已失踪仍计内部意图并标 unresolved，不能丢弃来降低数。不存在的包路径列 unowned-internal，不伪称可解析引用。

**运行时混载补充**：复用 M `graph.mjs` 的静态可达 src/dist-twin 模型及独立进程 root 规则，使用两端自身 manifest/tsconfig；纯类型跳过，package 内懒 import 不跟进，测试字面量动态引用跟进。输出 entry→package→两种 mode 的见证链与 unresolved。该数只是静态候选，不替代上面的引用处数；不运行任何测试。没有构建产物时从 Git 源码模拟 dist，缺 twin、exports 条件、进程派生、computed import 为具体盲区，绝不称实际运行时混载已证明为零。

**Host 公开入口**：固定 `apps/local-host/src/index.ts`，缺失标 N/A。分别报源码物理行、顶层 export 声明数、`export *`、`export type *`、namespace-star、显式 value/type 名称个数。补充用只读 Git 虚拟 CompilerHost / TypeChecker `getExportsOfModule` 计算可解析唯一公开 symbol 名；value flag 与 type-only 分列，沿每条公开 export 路径递归保留外层/逐项 export type 与链式类型限制，配合固定 TS 的 type-only alias 判定；仅存在运行时可见路径才计 value，循环或未解路径记 unknown。运行时值按 function/class/variable/enum/namespace/other/unknown 分列。没有 lib、第三方依赖或不能解析的 export 按声明列 unresolved，唯一名只能称“已解析下界”；不把 star 声明数当扩展开的导出名数。不得通过 import() 执行 Host。

**contracts 运行时逻辑**：固定 `packages/contracts/src/` 下按共同源码规则的文件；独立 AST 记录有 body 函数／方法／箭头／构造器/get/set、class、非 ambient namespace、非 const enum（普通 enum 有生成代码）、变量初始化 Call/New、顶层可执行语句。嵌套构造分列，不把“逻辑构造次数”当函数唯一数或副作用数。另对 manifest exports 的各 subpath 静态解析唯一 value symbol，给每 subpath 与全包 `(declaration file,offset)` 去重数；函数／类／变量（含 Schema 常量）分列，变量计绑定名而不是一条 const 声明。导出运行时名字多不直接代表有副作用。复用 `purityOf` 作为标注列（effects/node-imports/mutable-state/http-status），完整保留其启发式盲区，不把四个 gate 指标改名充当本项。

**跨层边／插件互引**：扫描共同源码集（另补同范围 `.tsx/.js/.jsx/.mjs/.cjs`，两种集合计数分开）里的字面量引用，按该树 owner 与 exports 解析 target；每节点为 occurrence，另按 owner→owner 去重 edge，typeOnly 与可能运行时分列。固定使用 M boundary 的关系矩阵及第2节的固定类别，而非伪造线性等级：foundation→app/module/plugin/horizontal；horizontal→app/module/plugin；module→horizontal/app/plugin；plugin→app/horizontal/module；contracts→任意其他 workspace，SDK→contracts 之外且非自身 owner 的 workspace，分别标反向／公开核心依赖。独立 `server/` 在 B/M 的主列均按 module 判断，B 历史 foundation 分类只列旁注，不进入主列。不同 plugin→plugin 全列同层互引，公共入口与实现深路径分列；app→app、module→module 另列同层边，不混作“向上”。current allowlist 只注释不扣除计数；外部包、unclassified、未解引用均列分母/盲区，不把 boundary 通过换成零穿透。此处测结构引用，不审定每一例产品许可。

## 5. 第三组：改动成本与 PR 抽样

两端各从截止提交（含自身）沿 first-parent **向过去**找最近 70 个可识别、不同 PR 的落点；不先固定日期，不随机挑。先满足识别与去重才取 70，历史不足则真实 n<70，列明遍历到 root／缺对象／浅历史原因；不给虚构分母。

可识别规则同时应用 B/M，不联网：
1. 两父标准 merge，subject 完整形态 `Merge pull request #<正整数> from <非空分支>`，且 committer 为 GitHub / noreply@github.com。
2. 单父 squash，subject 以 ` (#<正整数>)` 结尾，且同一 GitHub committer 条件。任意正文 #号、任务号、本地 merge、octopus、普通单父整合不算；未知逐条记录，不倒推 PR。Git 元数据可伪造，称“Git 可识别 PR”，不称 API 已证实。两个端点最近提交都符合上述实际格式，见人工样本。

同端 PR 号重复保留 first-parent 遍历中最近者，排除项列 duplicate 与已保留 SHA；跨端可以同 PR，但不跨端去重。常规 GitHub 批 PR 仍是一个 PR 落点，保留 batch 标签供分层解读，不从中挑子任务当独立 PR。I6 本地整合不满足格式／committer，不能冒作 PR。

每 PR 与第一父做 `git diff-tree -r --no-commit-id --name-status -z -M50% --no-ext-diff --no-textconv <parent> <commit>`；不含第二父的独立 diff，不用 merge-base。新增/改动/删除/类型变更各一个文件事件；rename 一个事件（固定 Git 50% 相似度），copy 检测关闭。记录 status、old/new path；文件数含 tests/docs/根等所有跟踪变更，二进制计一个，submodule/symlink 也一个事件，空改动 PR 计 0 不丢样本。

包数：old path 在第一父树映射、new path 在结果树映射，取包目录的并集（同路径换 manifest 名字仍一个目录 owner，并列名字；包迁移前后两个目录计两 owner，透明显示）。新增包用结果树、删除包用父树，不能全按当前 M 映射；非workspace事件按第2节分组并列，不加进包数。保存 PR号、完整提交/父 SHA、parent/result manifests、每文件映射、去重包集合、commit时间与实际最早/最晚跨度。

统计对真实 n 的整数序列排序：median 偶数取中间两数均值；P90 为 nearest-rank `x[ceil(0.9*n)-1]`，max；n=0为null。分别输出文件数与包数，百分比显式分子/n。不是同需求配对实验，不能从中位数/P90 推导重构因果、冲突率或用户体验。

## 6. 第四组：热点与具体实例

使用第5节同一两份样本。每 PR 对同一源码 path 最多触达一次；rename 的旧、新源码 path 各进入路径触达表（两行各一次，聚合任一项仍 PR 去重，可能路径触达总和大于文件事件数）。已删路径仍留在该 PR 记录；不强行把整仓路径沿 rename 合成一条身份。文件是否源码用第2节共同规则。排序 touch 降序、path 字典序，输出全部逐项表，Top20 只是展示，不改变分母。

分类多标签，不互斥：巨大文件（该 PR 父/结果任一侧 >800）、公共合同（contracts/SDK 的 manifest 公开入口及静态 re-export 可达源码）、外壳聚合（下列清单的 workbench/Host/style 路径）、登记（builtin-plugins 与 workspace-packages），另列 other。不把巨大单元同路径重复当多个触达；symbol 解析不完整时合同标签 unknown 而不是 false。

新固定聚合清单 **13 条**（同时用于 B/M；不声称原 13 路径已恢复）：

1. `apps/workbench/src/i18n/en.ts`
2. `apps/workbench/src/scripts/client/initialization.ts`
3. `apps/workbench/src/scripts/client/assistant-island.ts`
4. `apps/workbench/src/immersive-shell.ts`
5. `apps/workbench/src/builtin-plugins.ts`
6. `apps/local-host/src/web-request.ts`
7. `apps/local-host/src/web-catalog.ts`
8. `apps/local-host/src/project-host.ts`
9. `apps/local-host/src/project-plugins.ts`
10. `packages/contracts/src/platform/actions.ts`
11. `packages/contracts/src/platform/plugin.ts`
12. `packages/design-system/src/styles/craft-finish.ts`
13. `scripts/workspace-packages.mjs`

选择理由是 §12.5 描述的五份工作台、四份 Host、两份核心合同、样式与登记这组角色，plugin.ts 为声明合同代表；不是先看 M 改善再挑路径。scripts 虽不进入 TS 源码体量，作为指定登记路径仍参加固定聚合触达。输出各端存在性与样本触达（含删除/改名）；端点缺失标 absent，不把 absent 的零触达单独当改善。报告“至少一个固定路径”的 PR 去重比例以及每路径 touch/n。

新增插件/能力实例不按文件数自动猜：从各端已选样本按新→旧取第一例可由 diff 证明新增 plugin package+manifest/registration 的 PR、第一例可由 diff 证明新增 capability/action 声明及消费/注册的 PR；先保存候选触发节点，再人工读父/结果内容确定。没有合格实例则明确“该70样本未找到”，不得改挑窗口之外的漂亮案例；可补窗口外实例但必须另表且不混统计。逐例列 PR/SHA、插件内／公共合同／Host／workbench／登记／非包路径、真实位置及机制；不推导并行冲突率。

## 7. 最小实现与可重复材料（审阅后实施）

执行原件为一次性脚本 `measure.mjs`：Git snapshot adapter；复用纯 parseImports/graph；AST metrics；PR sample/diff/owner 汇总。从 M 复制所需 helper 及其最小纯依赖到输出根，只适配 TypeScript 模块解析到固定5.9.3，不改扫描逻辑；内嵌 giant visitor 不 import gate CLI，按本文抽其 predicates/span 并保存差异说明。未运行历史 package 脚本或加载 Host 业务模块。TypeChecker 仅在虚拟 Git 文件系统内工作，输出 diagnostics。

实际重跑接口（两次均已运行；准确结果与比对见 `REPORT.md`、`repeat-check.json`）：

`node /private/tmp/w6-04-measurement/measure.mjs --repo /Users/yijunwang/code/goalboard --inputs /private/tmp/w6-04-measurement/INPUTS.json --out /private/tmp/w6-04-measurement/run-1`

第二次同命令改 `--out .../run-2`，固定输入、TS版本、Git rename规则、排序与算法，除运行时间/目录元数据外逐文件比较结构化结果。持久采用前保留唯一可执行原件与复制的纯 helper；交统筹最小候选补丁（脚本、METHOD、输入、重跑命令与新增中间点spec diff），不自行选仓库持久位置或写共享spec。旧表不变，新的 B/M 并列表注明新序列；未来最终头由统筹给**一个完整 SHA**后同方法整体重算，不能只更新某几项。

结果布局：`units.json`、`boundaries.json`、`exports.json`、`contracts.json`、`packages.json`、`samples.json`、`excluded-commits.json`、`pr-files.json`、`hotspots.json`、`unknowns.json`、摘要表及 REPORT。每聚合可追到文件/节点/PR；没有测量的项填 NOT RUN，不能填0。

修订2产物在 `revision-2/run-1/` 与 `revision-2/run-2/`；原 `run-1/`、`run-2/` 和 `revision-1-original/` 保留首轮被拒数据与脚本。createRequire 工厂及其直接绑定调用列位置/数量；eval 列候选；通用生成源识别记 NOT RUN，跟踪生成 TS 仍计源码。排除文件按互斥原因列路径/数量，不据未知项填零。

人工独立核算要求（完整测量阶段）：至少各取一个巨大单元、内部引用、历史 PR 的文件/包映射、热点，按原始 Git 内容手数；保留手数与脚本结果、若不一致先修方法再两端重跑。抽样核算不等于全仓验证，作者手核不冒称独立审验角色的执行。

## 8. 交付边界与待审重点

方法阶段的两项 P1 已经定向复核通过：M 与 INPUTS、原始人工记录、来源快照一致；独立 server 在两端均按固定 module 类别进入主列，历史 foundation→module 登记变化另列。修订2完整 B/M 数字、原始记录和作者抽核见原件根下的 `revision-2/run-1/`、`revision-2/run-2/`、`AUTHOR-CHECK.md`；修订2数据已由原验证、二审两线核收并获根采纳。若之后发现计量错误，应保留失败证据，修同一原件后两端整体重算；涉及产品取舍回统筹，不能用度量自行关闭事项。
