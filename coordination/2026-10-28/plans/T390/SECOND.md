# T390 最终加强二审

状态：最终本地加强二审 PASS，签署于准确 H=`b7eee1b15353b74c586da601d45418c403e0ff5f`。五路径差异、作者原件及验证线4最终报告已核收，无 Blocker/P1 或本地必补执行项。支持 full=false；CI、根采用与用户验收不在本报告已通过范围。

## 输入与范围

- accepted WO：`/Users/yijunwang/code/mw-coord/coordination/2026-10-28/tasks/T-390.md`，含根 06:31Z CI 补足裁定；本线已接受的书审与 CI-PLAN 不重开。
- M=`db29f18d4f602fa8d9efb689a6a766aa9b07625f`，含已采用 T369。
- H=`b7eee1b15353b74c586da601d45418c403e0ff5f`，tree=`de75058066a19fd86eac681efc4119878e9f310c`；Git 实读匹配，作者工作树干净。
- M→H 恰好五路径：`apps/local-host/src/plugin-terminal-panels.ts`、`tests/project-catalog.test.ts`、现行终端 slice、SECURITY-INVARIANTS 的 S-103 本行、根 package.json。实际 Git 差异 111 insertions / 6 deletions，没有第六路径。
- 本轮只读 Git/源码/报告/raw 并写此文件；未构建、执行测试、变异、启动浏览器、运行 Full、写 GitHub 或改源码。

## 产品与验收裁定

RAC-2834 通过：`aliasSession` 保留 missing → trim → 空值错误顺序，只将现有 `isTerminalSessionId(session)` 的非法 return 移到 `now()`、`addAlias`、`ports.bind` 和 UPDATE 之前。非法非空元数据仍返回原记录，不新增错误、第二正则、runtime_id 校验、schema/迁移或清洗。project/actor 仍来自已有 panel 记录。三种非法字面量及已预绑 A 的非法 context 均走真实公开 catalog commit，检验返回和原 panel 完整记录、原 owner 上下文、闭库后准确 alias 键无行，重开后绑定及 actor 未被改写。

RAC-2835 通过：合法同值 return 仍在 alias/bind 后。测试实际建立 B 保存 S → A 报告 S 并解析到 A/owner-a → B 报同 S（带首尾空白）并解析到 B/owner-b。最后闭库只读 alias 指向 B，重开后公开 resolve、binding records、host_session_id、updated_at 及原 A/B panel contexts 均核验。若误将合法同值 return 前移，第三步无法恢复 B，公开解析断言会失败；不依靠同一毫秒时间巧合来证明这个分支。时间未改由实际控制流与记录对照共同支持，不宣称额外做过时间变异。

SQL 仅为关闭 catalog 后的参数化 readonly alias 后置条件；业务夹具没有 SQL 写入。绑定读取走公开接口，无新内部 import 或为测试新增 API。空白 session/runtime、缺 panel 保留原错误；合法 late session、旧 resume 和安全用例有完整文件证据。

RAC-2836 通过：原输入 R=`178a43d1cb4adc1f560d8a3d2c41d515a7fc31d6` 对 M 只有测试文件差异；生产/脚本/依赖未改。`raw/original-red.log` 完整 catalog 15/16、exit=1，RAC-2834/2836 的 deepEqual 明确显示四个坏 alias 指向 B、三个新 context 被绑 B、预绑 A 被覆盖到 B。不是编译、加载、环境或人为错误期待造成的红。该副作用 deepEqual 及其前置调用和输入与最终 H 保持，原红可继续证明此拒绝的敏感性，不要求另开负控批。

## suggested 首败与修订依据

初修 E=`e326710a1e13e1d51a7c10f7c165a90446edfff0` 的唯一失败位于重开后 `status === unbound`，此前 alias/绑定 deepEqual 已通过。已读准确 H 的 `modules/private-work-context/src/project-resolution.ts`：先查权威 binding，没有则允许 workspace 或其它 session 的已确认历史形成 suggested；suggested 的 project/connection 均 null，且 resolver 自身不写绑定。无 cwd 不会关闭历史建议。旧 catalog 同文件也已有这种非权威建议行为。

最终只将该后置条件改为 project=null、connection=null、公开 binding records 无该 runtime/session；其前面的准确 alias 无行与副作用 deepEqual 逐字保留，预绑 A 和 actor 仍明确核验。因此这是消除与现行合同冲突的测试假设，并增加持久化绑定缺失断言，不是放宽产品语义或掩盖原副作用红。`raw/tests.log` 的 suggested 首败及原批 exit=1 保留，不追写成首次全绿。

## 动态证据的真实归属

本线独立读取 raw 并重计逐文件结果，未重新执行：

| 输入 | 原件与结果 | 有效边界 |
| --- | --- | --- |
| 未修 R | `raw/original-red.log`，16 tests / 15 pass / 1 fail，skip/cancel/todo=0 | 上述真实非法副作用红；合法三步例通过 |
| 初修 E | `raw/tests.log`，66 个唯一完整文件，649/650，唯一 catalog 状态断言失败；skip/cancel=0，retries=0 | 65 文件通过，非最终 H 的整批重跑 |
| 最终 H | `raw/final-tests.log`，完整 catalog 16/16、ci-test-selection 9/9，25/25；skip/cancel/todo=0，retries=0 | 最终测试与 CI 追加增量 |
| E→H 沿用 | 其余64完整文件625/625；Git 核这64测试、生产、脚本、依赖和 fixture 均无变化 | 明确保留 E 来源，不改写成 H 执行 |

66 文件 raw 与 test-plan 集合相同，无重复/漏列；准确 H 的 local-host README 固定第一组57文件全部在批次。Home 装配条件集合不因本次入口顺序修复机械扩大；本片不改该装配/身份/模型授权/关闭。任务四文件、S-103相关补集及 T369 文件均有原件。T369 完整 `mcp-connection-change-refusal.test.ts` 2/2：真实合法 alias 持久化屏障、未换连接只派发一次、换连接精确 mcp.context_changed 拒绝、恢复后派发一次。本次没有改它的文件/屏障/MCP路径；E 与 H 产品相同，可沿用实际组合结果，不代签旧变异矩阵。

未修整体构建实际运行于 `2900b9eef235262b6005b523c23b088aef0e3901`，到 R 只改测试；`raw/red-build-result.json` digest=`1daeedd848e8d1a5f41a444f4df57771d828db9a4fd9fd329a2ae20f581b65a5` 与 R 使用产物一致。E 整体 build、H 整体 build 分别有原件；最终 `raw/ci-build-result.json` 与 final-tests 的源码/构建 digest 均为 `f81b5ccbbdb3d0fc84042b42be48c64752eda8e22f22c5ab2bacca7cc442c134`，exit=0、clean。测试通过公共包解析本树 dist；未混 src/dist。E→H 编译 terminal panel 模块 SHA256 保持 `f406ea5d60dc2acd3bac81357f89f5dcce348fc80ea4d098a93ab0a704635380`。不把构建 source digest 当作测试 blob：最终五路径 blob 与 raw binding 另核。

## CI、Full 与工程边界

package JSON 结构对比确认唯一变化为 `test:security` 后缀 ` tests/project-catalog.test.ts`。S-103 两条新回归移入 CI 列；旧 CI 列完整保留为后缀，旧本地列与 M 相同，其它 S-103 之外文档行全部相同。符合本线 A 建议，没有 workflow/selector/runner/skip/锁文件修改。

`ci-membership.json` 显示 catalog 收录一次、全清单271文件；真实 `raw/ci-selector.log` 为 security/product 均 whole、两片。原因包含 package.json、S-103 文档和 affected 的 uncovered。最终 affected 原件仍是 `full=[]`、`storage=[]`，且 `uncovered=[apps/local-host/src/plugin-terminal-panels.ts]`：静态分析未追到该入口不等于没有实际测试；本报告已按公开 catalog 调用链和真实红绿手核覆盖。五路径没有 DDL/装配/共享核心改变，因此支持本片不新增 Full 的范围判断，最终由根裁决；CI 两项 whole 与 Full suite 不混称。

已读最终 raw：boundary、health --base M、test-imports（0混用）、diff、冻结 M secrets、page-assets 全部 exit=0。资源 M 等价未修生产输入与 H 均48项/7,469,519B，本线逐项比较 bytes/SHA256 全等，预算未改。另读 capture.mjs：它调用生产资源 handler 并截获 response writer，逐项核200，并非 TCP HTTP 请求或浏览器加载验收；只证明资源产物字节。最终资产采集和对照原件保留。根推送前 fresh secrets、准确 CI/SI 原件和 §8/采用均未由本线执行或签绿。SI 仍非阻塞、merge_group 不运行；静态收录及本地通过不代表 Linux CI 通过。

作者清理报告保留全部证据和干净作者树，移除9个本任务临时运行目录；报告称无 task process/open runtime files/slot holder。此处未主动清理其它进程、资料或工作树。

## 独立验证线4与最终签字

已全文读取 `/private/tmp/t390-verify/REPORT.md` 最终原件，并核 `independent-audit.json` 的准确 H/tree/范围、输入差异和计数，以及 `current-build-audit.json` 的当前 digest、manifest、公开包实际解析及 catalog 收录一次。验证线4为独立只读证据核算，没有另跑产品测试/构建/变异，不把它写成第二批动态执行。其 RAC-2834～2836 PASS、状态断言修订依据、T369 2/2、57固定文件覆盖、最终25项加625沿用、full=false 和 SI待CI结算，与本线直接检查一致。

验证线4补充并在本报告保留两项准确边界：资源捕获是生产 handler 级而非TCP/浏览器验收；原生 Foundation NSTemporaryDirectory 仍是系统用户临时目录，不能声称全部原生临时文件隔离。其报告已实际复核9个运行目录删除与当前匹配进程为空，未独立采样历史全部子进程生命周期。没有由此发现产品回归或本地补跑需求。

最终裁定：接受该准确候选的最小完整修复及本地证据，可交根继续正常 CI、SI whole、产品子集及采用裁定。不启动额外本地 Full，不追认旧失败为绿，不对尚未读取的 CI 签绿。源码、package.json 或实际组合输入后续变化时只按新 delta 复核。
