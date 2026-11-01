# T353 PR-B #1682 准确 M 普通同步

状态：本轮普通 merge 与有限本地增量验证完成，候选干净冻结；PR 整体仍待根结新 H 自身 CI / Full 与正式采用。仅本地交根复核，未 push、写 GitHub、触发 CI 或运行 Full。writer 窗口已按根收回交接，不再修改仓库或执行测试。

## 绑定与范围

| 绑定 | 值 |
| --- | --- |
| 旧 B | `81955aa9303011ec0f38ecbdf2b507fc23824fe2` |
| 已授权准确 M | `6729a2d4655caa603daa369f99884e09c4726bde` |
| 新 H | `2de956e7ac3b4ad1ef7df936b2e48b5b5ee72d09` |
| tree | `c532693846cc5ceba57bcfcdcbdd826f95689650` |
| 双亲 | 旧 B、准确 M（此顺序） |
| worktree / branch | `/private/tmp/t353b-current-sync/wt` / `feature/t353b-current-sync` |
| 本轮执行者 | Codex 开发线 1；原 DeepSeek / Codex 开发线 2 署名与证据归属保留 |

accepted WO 为 `/Users/yijunwang/code/mw-coord/coordination/2026-10-28/tasks/T-353.md` 的当前 B 普通同步窗口；准备方案 `/private/tmp/t353bc-current-ready/PLAN.md`，根交接共享 hunk 窗口。只正常 merge 准确 M，没有吸收 T384/T385/T387/T146 未采用候选，没有 rebase/force。原作者 B/C 树与主检出未修改。

实际唯一内容冲突是 `scripts/gates/page-assets.mjs` 的许可表。保留准确 M 的门禁算法，只留 Jelly `[76866,76899]`，清掉已消费的 Coding / Images 许可及其历史注释，不引入 workbench 额度、不改 limits 或审批政策。`tooling/gates/page-assets.json` 自动合并，准确 M 的 48 项预算仅 Jelly 76866→76899。

相对 M 恰好原 B 的 30 路径，+79/-135。28 个非资源路径结果 blob（含 `bounded-cut.ts` 的删除）逐项同旧 B；两边非资源稳定 patch-id 均为 `05da3f8c1921e5787446e265e39768127ad6d4c4`。整份 patch-id 因清理历史许可有意从 `85c1ee0c84609d7be1f7112fd05d5ac28edc1302` 变为 `1f5ece5f5629bc8bb78c7d8773d4e32eb9b718db`，不声称整份补丁机械相同。见 `binding.json`、`raw/scoped.diff`、`raw/remerge-resolution.diff`、`raw/resolution-check.json`。

## 输入复核与证据复用

本轮重新核 kernel → SDK → contracts：kernel 的 action-settlement 直接取 SDK `/whole-units`，contextual 经 kernel 一行转出取同一入口；SDK 仅依赖 contracts，子入口指向正确 dist，helper 四导出且零 import/require/转出依赖。knowledge 的 package.json、lock importer 与 workspace registry 三处 SDK 依赖一致。SDK/contracts 整包从旧 B 到新 H 无变化；27 个指定 helper/声明/测试输入逐项同 blob，见 `dependency-map.json`。这不是整棵 main 运行树无变化的声明。

按根的有限增量授权，不重跑旧 33/14 文件矩阵、238/508 或 K/P 负控、也不再跑本地 Alchemist 6/6。沿用的是未变 B 改法、指定输入和既有断言区分力，不冒称本轮新 H 实跑：

- 旧独立验证 `/private/tmp/t353b-verify/REPORT.md`：准确 `8a926168…`，14 个完整文件 238/238（12 消费者 212、knowledge 15、Pages 11）；K `cutTail→slice` 只令 RAC-2701 红，P `cutTail→cutHead` 只令 RAC-1971 红，均恢复绿。首次 K 因 TS6133 未运行不计有效红。
- 作者旧 33 文件 508/508 保留旧头和原执行者；旧 B→81955 的等价性与作者两份完整 Alchemist 1/1+5/5 见 `/private/tmp/t353b-main-reuse/REPORT.md`，不改写为本轮执行。
- 旧合法 UTF-16 / code point 限额、错误及已接受的非法串/NaN/负数/非整数、灵光 request_id 160 单元差异保持原边界；不追加 grapheme 保证或任意参数等价，PDF 零余量两边均空，不扩 SDK 合同。

## 本轮匹配验证

全部绑定同一 H / tree / lock 与 Node v24.14.0（ABI 137，darwin arm64）。整体 build 与后续门禁/测试返回后工作树均干净，源码摘要和构建清单一致：`6eb53b614e790842bbf9d94d12d169b9573f3e4a5b28354b45cb5a2bd6d46452`。原件 `raw/build-result.json`、`raw/gates-result.json`、`raw/gate-tests-result.json`。

| 本轮步骤 | 结果 | 原件 |
| --- | --- | --- |
| 离线 frozen install；整体 `pnpm build` | exit 0；匹配整体构建 | `raw/candidate-install.log`、`raw/candidate-build.log`、`raw/build-result.json` |
| `pnpm boundary:check` | exit 0，errors=[] | `raw/boundary.log` |
| health `--base 6729a2d4655caa603daa369f99884e09c4726bde` | exit 0；未改 baseline / limits | `raw/health.log` |
| `test-imports --check --chains` | exit 0；1705 个测试进程中 0 混用源码/构建 | `raw/test-imports.log` |
| diff check（准确 M...H） | exit 0 | `raw/diff.log` |
| secrets（冻结 M） | exit 0，222 新增行 | `raw/secrets-frozen-M.log` |
| page-assets check/report（准确 M） | exit 0，discoveryMisses=[] | `raw/page-assets.log`、`raw/page-assets-report-parsed.json` |
| `tests/page-assets-budget.test.ts` 完整文件 | 171/171 | `raw/gate-tests.log`、`test-summary.json` |
| `tests/health-gates-lint.test.ts` 完整文件 | 69/69 | 同上 |
| `tests/health-gates-spec-coverage.test.ts` 完整文件 | 67/67 | 同上 |

三份完整文件合计 **307/307**，fail/cancelled/skipped/todo 均 0；公共 runner，jobs1 / browser-jobs1 / retries0，无名称筛选、分片或断言修改。boundary 完成 test-kit 构建后才运行本批，未并发构建。整体构建/门禁取公共 build 槽，本批取公共 browser 槽；显式复用未隔离前的系统临时目录作为公共槽地址，未建立私有槽。

实际 Host served body 捕获 48 项、均 HTTP200，H 共 **7,469,228 B**；准确 M 原件共 **7,469,195 B**。仅 `/assets/molis-work-plugins/jelly.js` 从 **76,866→76,899（+33 B）**，其余 **47 项字节和 SHA-256 全同**，无新增资源。Jelly 的 M/H SHA-256 为 `542b73d27ea8662eddc24303f4ae3bc3b1179a46c3b60e26befd0fd1a000b220` / `f472d140e74fe14848d43aad5b2c121b9b8f3e4080d941a2d9b2cfb56a101265`。见 `candidate-assets.json`、`resource-comparison.json`。

M 参考取根允许复用的 T146 匹配整体构建/capture 原件，经 T385/T387 只读留存；本轮核 8 份原件与保留 provenance 的 SHA-256 全同，并将 48 项字节逐项核到准确 M 的 Git 预算。来源和原日志全放 `raw/M-resource-source/`，复用声明见 `raw/M-source-reuse.json`。没有重建或冒认本轮运行 M 参考构建。

环境使用白名单变量，独立 HOME / CFFIXED_USER_HOME / XDG / pnpm store / compiler caches / TMPDIR / Molis Home，文件密钥后端、adhoc `-`；pnpm CAS 为独立 APFS 克隆及只读 immutable SQLite backup，安装 sandbox 禁写真实共享 pnpm store 与 Corepack cache。Node home/tmp 与 Foundation Home/Library/Cache/ApplicationSupport 预检均在本任务目录；原生 `NSTemporaryDirectory()` 仍为系统用户临时目录，`raw/paths.json` 明记，未称其完全隔离。security 防误触记录不存在。没有调用真实模型、4207、真实 Home、日常 Chrome或真实模型凭据。

`affected-tests --base` 仅运行建议器，确认 `full=true`（共享核心、跨 12 包），原件 `raw/affected-result-parsed.json`；未运行其整批建议。secrets 只签冻结 M，根发布前仍需 fresh fetch 后按项目要求运行 secrets，不冒称本轮已做 fresh-fetch 发布检查。

## Full 与未完成边界

`full=true`。最终新 H 自身普通 CI / Full 由根发布与核验，实际 Full 必须覆盖完整 `tests/alchemist-workbench.e2e.test.ts`；不以旧局部 6/6 或别线 Full 代替。

旧 Full `41233823797` 仍失败：事件旧 B `8a926168…`，实际 checkout `0ddf16ee079cd2398709f8765b7fef0460f10588` / tree `baef23ba47c4c6a2c1a75a63e1e9390d0a57129d`；6 shard success、1 fail、9 cancelled，Alchemist 首跑及 retry 均失败，失败 shard 98 文件未跑或停止。分项日志不足，T366 是否唯一根因仍 UNKNOWN，见 `/private/tmp/t353b-full-triage/REPORT.md`。旧 B 81955 的普通 CI `41237845572` terminal success 属根提供并冻结的旧头事实，不签新 H 的 CI。

C 继续 WAIT B 实际采用；本线不改 C、base、PR 正文或共享协调记录。工程检查不代签真实 Home / 产品实操 / 用户验收。测试后只读 `git ls-remote`：main 仍准确 M，远端 B 仍旧 `81955aa9303011ec0f38ecbdf2b507fc23824fe2`，C 仍 `07592e0fc36375b8d191d24ceafbd5e58d36d403`。见 `raw/remote-readback.json`；没有 fetch 或更新其 refs。

## 窗口释放、清理与过程披露

根已回读本轮 diff/28 blob/构建/资源/三文件原件，并明确收回生产/测试/脚本 writer 窗口。**窗口已释放，H 保持冻结**；独立增量验证与二审由根另派，本线不以作者自核替代独立结论。根收回后仅完成报告、清理及状态读回，没有修改 repo 源码或再次执行测试。

进程参数、cwd 与 runtime 的 lsof 检查无本任务残留进程或开放文件，公共 build/browser 槽没有本任务 holder；没有停止任何进程。仅删除本任务新建的 system-home/private store、tmp、config/cache/data/state、clang/swift cache、Molis Home 九目录。保留干净工作树及匹配的 ignored node_modules/dist/native 产物，供根和独立核只读复用；原作者 B/C、主检出、T385/T387 与他人缓存均未清理。见 `raw/pre-cleanup-processes.json`、`cleanup.json`、`FINAL-STATE.json`。

唯一准备期自检误差：首次许可区以外比较器只剥旧注释前缀，误报算法变化，且在写入前终止；修正为排除完整已授权许可区后，M/旧 B/候选的剩余算法逐字一致，记录于 `raw/resolution-check.json`。本轮没有构建/测试失败、重试、跳过或放宽断言。
