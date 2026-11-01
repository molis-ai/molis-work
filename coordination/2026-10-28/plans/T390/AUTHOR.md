# T390 · 非法终端会话写前拒绝

状态：本地实现与有限验证完成，候选冻结，交根及独立审验终核；未推送、写 GitHub 或运行本地 Full。作者：Codex 开发线 1。

| 绑定 | 值 |
| --- | --- |
| 准确 M（已采用 T369） | `db29f18d4f602fa8d9efb689a6a766aa9b07625f` |
| 最终 H | `b7eee1b15353b74c586da601d45418c403e0ff5f` |
| tree | `de75058066a19fd86eac681efc4119878e9f310c` |
| 工作树 / 分支 | `/private/tmp/t390-dev` / `feature/t390-invalid-alias` |
| 最终构建源码摘要 | `f81b5ccbbdb3d0fc84042b42be48c64752eda8e22f22c5ab2bacca7cc442c134` |

唯一行为书是协调 `tasks/T-390.md`，含根 06:31Z 的 CI 追加窗口；按 `plans/T390/REVIEW.md` 保留三步合法同值 oracle，按并行 PLAN 隔离执行。初次读取并行 PLAN 尚未落盘，后已读取确认。最终恰好五路径：原入口、现有 catalog 测试、终端 slice、S-103 本行，以及根新增授权的 package.json 单个末尾 token。准确绑定与完整差异见 `final-binding.json`、`final-scoped.diff`。

## 改动与真实行为

`aliasSession` 在 trim、空值及 missing 检查后，先用原 `isTerminalSessionId` 拒绝非法格式，再执行 alias/bind/session 更新。非法非空值仍返回原记录，不新增错误；合法同值的判断仍在 alias/bind 之后。没有第二份 regex、API、schema、迁移或旧数据清洗。

新增两条公开 catalog 回归（RAC-2834～2836）：坏值包含选项、内部空格、129 字符，以及已绑定 A 的坏 context 向 B 报告；同时核返回记录、原 panel owner context、错误合同、关闭后只读 alias 行及重开后的公开绑定记录。合法例实际走 B 保存 S → A 报告 S → B 再报带边缘空白的同值 S，要求 alias/绑定回 B、actor 正确、B 的 session/updated_at 保持同值分支行为，关闭重开后仍成立。业务写入全走公开 commit；SQL 仅闭库后参数化只读 alias 键。

## 红、测试修订与最终证据来源

- 未修生产输入 H `178a43d1cb4adc1f560d8a3d2c41d515a7fc31d6` 与准确 M 的生产源码、依赖、脚本一致。整体构建原件见 `raw/red-build.log`、`raw/candidate-build.log`。测试只对 actor 查询使用公开 binding records 做过执行前校正；生产构建摘要未变。
- 完整原 catalog 文件 **15/16**：唯一 RAC-2834/2836 失败明确展示四个坏 alias 行已写入、三个新绑定指向 B、原 A 绑定被改到 B；合法 B→A→B 例通过。见 `raw/original-red.log`。这是真实副作用断言红，不是编译、加载或环境失败。
- 初修 H `e326710a1e13e1d51a7c10f7c165a90446edfff0` 的完整 **66 文件、649/650**：65 文件通过，catalog 唯一失败是重开后状态 `suggested` 被测试误要求为 `unbound`。此前 alias/绑定 deep assertion 已通过。现行 resolver 的 `project-resolution.ts` 明确允许历史建议且 project/connection 为空，已有 catalog 历史建议用例亦如此。修正为核 project/connection 均 null，并核公开 binding records 中该键不存在；没有改变产品语义或减弱写前拒绝。原失败完整保留在 `raw/tests.log`、`batch-summary.json`。
- 原输入红命中的前一条副作用 deep assertion 逐字保留，修订只涉及其后的重开后置条件；不重复额外负控批次。
- 最终 H 整体构建后，完整 catalog **16/16** 与 CI 选取规则 **9/9** 均通过，共 **25/25**，见 `raw/final-tests.log`、`final-test-summary.json`。其余 **64 个完整文件、625/625** 按未变输入沿用初修 H；不声称最终 H 重新执行了全部 650 项。

66 文件组成：任务直接五文件（含已采用 T369）、S-103 追加三文件、local-host README 固定 57 文件、直接读取安全文档的 CI 选取规则一文件，去重后 66。T369 `tests/mcp-connection-change-refusal.test.ts` 完整通过 **2/2**。实际文件清单、计数与原因见 `test-plan.json`、`batch-summary.json`；无名称筛选、跳过或自动重试，jobs1/browser-jobs1/retries0。原批自然跑完后才修改测试和 package.json。

## 工程门禁、CI 与资源

最终 H 的整体 build、boundary、health `--base M`、test-imports `--check --chains`、diff check、冻结 M 的 secrets、page-assets check/report 全部通过。见 `raw/ci-build-result.json`、`raw/final-gates-summary.json` 与 `raw/final-*.log`。源码与构建摘要匹配，工作树干净；CI 增量前后的生产源码/脚本/依赖/lock 无变化，编译后的 terminal panel 模块字节相同。见 `ci-increment-reuse.json`。

根批准后仅向 `test:security` 末尾追加 `tests/project-catalog.test.ts`，并将 S-103 两条指针从本机列移到 CI 列；没有覆盖其它 token、workflow、selector、runner 或 lock。真实 `securityList` 解析结果中 catalog **恰好一次**（总 271 文件），现行 CI selector 的 SI 和产品子集均为 **whole / 两片**。见 `ci-membership.json`、`raw/ci-selector.log`。实际 Linux CI 尚待根运行和手读；SI 仍非阻塞，不把静态收录当作 CI 通过。

最终 `affected-tests --base M` 的 `full=[]`、`storage=[]`，因此本地选择器结论 **full=false**；root package 的测试命令变更会触发上述 CI 两项完整清单，最终 Full 安排仍由根裁决。目录级额外建议和条件 Home 装配集合未扩跑，记录于 `affected-extra-review.json`；本片不改变那些装配/选择器。

两端均调用生产资源 handler，截获 response writer 写出的状态 200 和 body，对 48 项 body 的字节数与 SHA-256 比较，结果**全同**，各 **7,469,519 B**。这是进程内 handler 响应捕获，非 TCP 下载或浏览器验收。M 基线使用仅测试变更的未修生产输入，其生产源码与 M 完全一致；最终捕获绑定新 H。见 `M-assets.json`、`final-assets.json`、`final-resource-comparison.json`。预算和 APPROVED_CEILINGS 均未改。secrets 仅签冻结 M，本线未 fetch；根推送前仍按发布流程处理。

## 隔离与清理

公共 build/browser 各一槽，显式复用系统公共槽目录，私有 TMPDIR 未拆槽；同一树未并发构建和测试。系统 HOME/CFFIXED_USER_HOME/XDG/编译缓存/pnpm store/Molis Home 均隔离，文件密钥后端、adhoc 签名。Foundation 用户目录与 Node home/tmp 预检通过；原生 NSTemporaryDirectory 仍是系统用户临时目录，已在 `raw/paths.json` 明列。未使用真实 Home、4207、日常 Chrome、Keychain 凭据或真实模型；security 防误触日志不存在。

清理只移除本任务九个临时运行目录，保留干净工作树、匹配的 ignored 依赖/产物和全部原始证据。具体进程及文件占用检查、清理结果见 `raw/pre-cleanup.json`、`cleanup.json`、`FINAL-STATE.json`。没有修改或清理其它作者树、分支或缓存。准备期一次 patch 脚本因输入编码报错，在写入前结束，后以 ASCII 转义修正；没有把它记作产品或测试红。

作者写入已结束，候选冻结。最终独立验证/二审、实际 CI 与采用由根结算；本报告不代签真实产品或用户体验验收。

后续执行约定：所有测试（含非浏览器门禁测试）均需公共 browser 槽，build 槽不能代替测试槽。
