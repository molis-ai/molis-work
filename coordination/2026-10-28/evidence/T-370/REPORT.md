# T-370 · W6-04-v2 B/M 中间点测量（修订2，冻结中间点已采纳）

**结果：修订2已通过原验证与独立二审两线定向复核，根已采纳冻结 B/M 中间点。** 两端完整结构化结果的两次 21 份 JSON 逐文件字节一致。`AUTHOR-CHECK.md` 保留作者抽核身份，采用另有独立核收依据。本次采纳不签 W6-04 最终终点。未运行构建、产品测试、真实 Home、模型、GitHub 或外部服务；没有写仓库、门禁或基线。

## 冻结对象与运行

以下历史结果目录的相对位置均以原件根 `/private/tmp/w6-04-measurement/` 为基准。本包不附大 JSON；本次候选 spec 段与 diff 在 `/private/tmp/t370-persist/spec-section-candidate.md`、`/private/tmp/t370-persist/spec-candidate.diff`，由根决定写入，未附入目标证据包。

- B=`fccb2a3003de86af556f0030923f9e76ddf369c7`；M=`b9a9755786f3d29774bf706f1f68c3ce4bf8bfb8`。M 是本单开工首次读取本地 `origin/main` 的对象，之后只按 SHA 读取 Git，不追移动 main。`INPUTS.json` 固定两个完整 SHA、TypeScript 5.9.3、Node v24.14.0。
- 唯一可执行原件 `measure.mjs`，纯 helper 副本在 `vendor/`，来源为 M 的 Git 对象；`node_modules/typescript` 是到仓库已安装 5.9.3 的本地链接。脚本从 Git 对象读取源码和每个 PR 的父/结果树，不依赖主检出源码或 dist，不执行历史 package 登记脚本。
- 先后运行：`node /private/tmp/w6-04-measurement/measure.mjs --repo /Users/yijunwang/code/goalboard --inputs /private/tmp/w6-04-measurement/INPUTS.json --out /private/tmp/w6-04-measurement/revision-2/run-1`，然后只把 `--out` 改为 `.../revision-2/run-2`。`revision-2/repeat-check.json` 列出 21/21 同名 JSON 的 SHA-256，全部字节一致。未用旧一次性脚本；旧表保留，B 与 M 均以新脚本重算。

## 四组结果

| W6-04-v2 同口径项 | B | M |
| --- | ---: | ---: |
| TS 源文件 / 物理行 | 1,827 / 291,506 | 3,227 / 366,883 |
| >800 行文件；>300 行类；>25 方法类；>150 行函数 | 37；43；25；98 | 5；10；9；22 |
| 类行/方法并集（独立类） | 48 | 13 |
| 巨大登记匹配 / 未登记（各类命中不合并为独立缺陷） | B 无登记机制 / 183 | 38 / 2 |
| 测试内部引用处 / 涉及测试文件 | 1,054 / 361 | 416 / 205 |
| 静态 src/dist 混载候选进程 | 198 | 0 |
| Host 入口 `export *` / 已解析 value 名 | 12 / 240 | 8 / 431 |
| contracts 有 body 函数 / 运行时公开导出独立声明源 | 379 / 503 | 341 / 576 |
| 跨层反向引用处 / 不同插件互引处 | 8 / 0 | 35 / 0 |
| 70 PR 文件数中位 / P90 / 最大 | 6 / 98 / 615 | 4 / 19 / 313 |
| 70 PR 包数中位 / P90 / 最大 | 1 / 15 / 69 | 1 / 3 / 21 |
| 固定 13 路径任一触达的 PR | 30/70（42.9%） | 7/70（10.0%） |

第一组逐文件/节点及登记状态在 `{B,M}-units.json`。M 的两个未登记命中为 `horizontal/memory/src/service.ts` 文件及其 `MemoryService` 类；这里只报告登记状态，不据此裁定应拆分。第二组逐处引用、静态混载见 `revision-2/run-1/{B,M}-boundaries.json`，Host 的声明数、显式名称、TypeChecker 已解析名称见 `-exports.json`，contracts 构造类别与每个 subpath 导出见 `-contracts.json`。跨层边主列两端固定 M 规范类别，独立 `server/` 为 module；B 旧登记 foundation 单列沿革，不当代码改善。跨层结构引用总数从 7,150 到 14,379，独立 owner 边从 294 到 269；反向引用处从 8 到 35，上升如实保留。这里不是边界合规裁决。

第三组两端均沿 first-parent 找到 70 个按冻结规则可识别的 PR，分别访问 70 个落点，没有额外排除项；B 窗口为 2026-09-28 至 10-02，M 为 2026-10-30 至 10-31。`-samples.json` 给 PR、完整 SHA、第一父、时间和成本，`-pr-files.json` 给每文件 old/new 与父/结果 owner，`-excluded-commits.json` 给遍历与排除记录。两个窗口需求构成与节奏不同；中位数/P90 的变化不能证明重构造成成本下降。

第四组逐路径全表、Top20、13 条固定路径在 `-hotspots.json`；两端 13 条均存在。M 最大热点为 `apps/local-host/src/index.ts`（5/70），B 最大为 `apps/workbench/src/scripts/client/assistant-island.ts`（15/70）。路径可多标签，公共合同直接入口与静态 re-export 未完全确认的路径分列 unknown。`EXAMPLES.md` 按父/结果 diff 核读 B 的 PR #98 新 Todo 插件、#130 新 memory 动作族，以及 M 的 #1644 `feed.items.promote` v2；M 样本未找到新增插件包。这些是机制实例，不证明体验或冲突率。

## 抽核、盲区与交接

`AUTHOR-CHECK.md` 每端手核一项巨大文件、测试内部引用、PR 文件/包、固定热点。B 的 #163 为 2 文件/1 包、`en.ts` 热点 12 PR；M 的 #1688 为 5 文件/1 包、`en.ts` 热点 3 PR，均与原始 Git 对象吻合。它仍是作者核算，独立 reviewer 应另选样本及检查计数/分母。`revision-2/repeat-check.json` 只证明相同输入/脚本的确定性，不证明算法正确。

AST 源码主分母仅 `.ts/.mts` 的指定生产目录；JS/TSX/Rust/Swift、测试与声明文件不在体量分母。`-unknowns.json` 明列 B/M 的外部引用 4,371/9,108 处、非字面量调用 12/43 处；AST parse diagnostic 0/0、Git 虚拟 TypeChecker 模块未解 0/0。静态图的 0 混载候选不等于运行时无混载；公开名称是在无 lib/第三方依赖的虚拟 Git CompilerHost 中解析的下界。合同标签 unknown 不当 false。M 源文件/行总量、Host 已解析 value 名、contracts 运行时导出源及反向边均上升，不能把局部下降概括为全面防腐完成。

主spec追加段落另有候选文本，待根在真实§12.5的唯一写入窗口采用；旧spec-candidate.diff误定位到I4历史段，未采用。当前只持久保存本目录的测量脚本、五份纯helper、方法、输入、报告、摘要及两份独立复核报告，不改主spec旧表。最终结算须由统筹给**一个准确完整代码头**，按同方法整体重算并通过独立数据审阅；不得只换 M 列。W6-04 最终终点、W6-05、privileges、风险关闭与全线归档均未签。

## 修订2：独立数据审阅后的修复

首轮两份报告均未接受运行时导出计数：外层 export type 的 FeedSourceService 被计为值；另有 SDK 自引用误贴 sdk-out、root/other 分类错误。首轮 run-1/run-2、原脚本与报告保留于原目录及 revision-1-original/。修订只改同一测量脚本，没有改产品或冻结B/M。

公开值按导出路径递归判定，并复用固定TS5.9.3 type-only alias语义，覆盖外层/逐项type、链式重导出及type-star；未解路径记unknown。重算后Host value为240/431，type-only为138/191，两端FeedSourceService均isValue=false。contracts独立运行时声明源仍503/576，分列为B class14/function155/variable334，M class3/function166/variable407；各名保留valueKind。SDK对外判定排除同owner，core从1/94纠正为0/0；upward8/35、pluginPeers0/0保持实测。root/other按METHOD固定集合重分类，不改变包数。

新增createRequire工厂位置B14/M36、直接绑定loader调用5/5，eval候选0/0；M web-assets:12与agent-control-errors:16原反例已记录。此计数不涵盖动态别名数据流。通用生成源识别显式NOT RUN（无通用可靠生成标记），未据此排除跟踪生成源码。每端excludedFiles给声明、tests/fixtures、build/dependency、vendor、JS/TSX、Rust/Swift、范围外源码与其他跟踪文件的互斥路径清单/数量。

修订2两次21份JSON的字节比较另存revision-2/repeat-check.json，作者定向核对另见revision-2/revision-check.json。原验证与二审两线的 REVISION2.md 均已通过并关闭原必修项，根已采纳冻结 B/M 中间点；旧报告保留首轮被拒结论，当前采用依据包含独立核收。

## 持久交付与重跑入口

候选包为 `/private/tmp/t370-persist/candidate/`，目标由根串行保存到协调分支 `coordination/2026-10-28/evidence/T-370/`；本线未写共享协调分支或 main spec。脚本、输入、文档和 SUMMARY.json 在包根，五份纯 helper 在 vendor/。measure.mjs 及 helper 字节与已通过修订2原件相同，未为搬家改算法。

准确原件分开保留：脚本、输入在 `/private/tmp/w6-04-measurement/`；完整大 JSON 在其 `revision-2/run-1/`、`revision-2/run-2/`，重复性记录在 `revision-2/repeat-check.json`。首轮被拒脚本和文档在 `revision-1-original/`，首轮结果仍在原 run-1/run-2。包内 SUMMARY.json 只供查看摘要，不替代逐项原始结果。

独立核收原件：`/private/tmp/w6-04-data-verify/REVISION2.md`、`/private/tmp/w6-04-data-second/REVISION2.md`。两线均关闭原必修项，不能把旧 REPORT 的“要改”状态当成本轮状态；也不能把本中间点采用扩大为最终验收。

重跑要求 Node **v24.14.0**、TypeScript **5.9.3**，仓库保有 INPUTS 中两个完整提交及其 first-parent 历史。仓库已有冻结依赖时，从包根执行下列链接和命令。本地 node_modules 不入协调提交；若仓库缺依赖，先在自有仓库树按项目说明执行 `pnpm install --frozen-lockfile --offline`，本包不新增 package.json、锁文件或长期依赖。

```sh
TASK_REPO=/Users/yijunwang/code/goalboard
mkdir -p node_modules
ln -s "$TASK_REPO/node_modules/.pnpm/typescript@5.9.3/node_modules/typescript" node_modules/typescript
node measure.mjs --repo "$TASK_REPO" --inputs ./INPUTS.json --out /private/tmp/t370-replay/run-1
node measure.mjs --repo "$TASK_REPO" --inputs ./INPUTS.json --out /private/tmp/t370-replay/run-2
```

链接已存在时先确认它指向5.9.3，不覆盖其他依赖。两次运行串行。此次打包只在包目录检查依赖加载、模块链接与纯 helper 小样本，没有重复两端测量。最终结算仍需统筹给一个准确完整代码头，再按同方法整体重算并独立核收；W6-04 最终终点、W6-05、privileges、风险关闭与全线归档均未签。
