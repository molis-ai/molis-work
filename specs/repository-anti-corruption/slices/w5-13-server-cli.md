# W5-13 C1 首片：server 与 CLI 的输出和错误收尾

状态：首片 PR #1151 一轮评审补修已实现并通过定向验证，待 ac-review 二轮（2026-10-23，Codex）；真实构建入口已完成 EPIPE 红例与修复验证。目标为本片工程实现、定向回归与可审阅 PR；C1 整体仍有 desktop、local-host 等后续区域，由统筹继续排片。本片不代表整条 W5-13 完成。

## 目标、证据与边界

承接协调分支 `coordination/handoff-2026-10-14` 的 `CODEX-TASKS.md` C1 和 `SLICE-RULES.md`，沿用[总规格](../spec.md) W5-13 的日志合同。开工基线为 main `abc052bcbd24d80acd6447eb26f493fe7f7f0c67`；已 fetch、核对 37 个在途 PR 的实际文件清单，server/CLI 源码没有重叠。C0 已随 #1136 合入，不重做。

`apps/server/src/main.ts` 的七处 `console.log` 都是正常命令结果或启动指引；应保持 stdout 字节与 JSON 缩进，不转成诊断日志。退出回调直接等待 HTTP 服务关闭：拒绝会逃出信号监听器、跳过库关闭。`apps/cli/src/dispatch.ts` 只有 plugin 分支直接返回 Promise，异步拒绝绕过外层 catch，不能按其余命令的协议显示错误并返回 1。CLI 的正常 console 已被 Biome 明确允许，原样保留；参数解析的 catch 会重抛有意义的错误，不作机械替换。

允许修改：上述两个入口、两包必要说明、本片规格、直接回归与夹具，以及门禁生成的下降 baseline。一轮补修授权在产品子集清单只加本片测试一行，保留其他项；已核对 #1150、#1130、#1098、#1064 仍有同文件在途改动，不改它们的条目。禁止扩大到 desktop、local-host、浏览器模板、memory、其他在途源码或后续 C2/C3；不动真实 Home、凭据、门禁规则、API、动作、数据库形状或权限。

## 方案与取舍

- server 七处命令结果由一个最小本地输出函数写 stdout，保留原 JSON 序列化和每条输出末尾换行；监听 stdout 错误，仅 EPIPE 按原 Console 的读端提前关闭行为忽略，不改退出码、不结束 serve，其他错误继续抛出。复用 CLI 输出函数需新增包依赖并改多人在途的锁文件，故不采用。现有 CLI 输出函数与 console 不变。按一轮评审方案 (b) 与原派单意图实施，console 28→21 是否接受仍交统筹裁定，不放松门禁。
- server 退出按 HTTP 服务、库的顺序各尝试关闭；每阶段失败用现有公开 `hostLog.error` 写 `server / shutdown_failed`，只带固定阶段名及错误名/码，不带消息、栈、路径或业务内容。有失败以 1 退出，全部成功仍以 0 退出。信号处理开始后，重复 SIGINT/SIGTERM 不重复关闭或提前退出。
- CLI plugin 分支等待端口 Promise，使同步抛错、异步拒绝都进入原错误呈现。参数传递、成功返回码、输出协议与其他命令不变。不引入新错误类、日志系统、兼容层或依赖。

重复信号的有意取舍：保留等待清理完成、不重复关闭的 RAC-111。现有 `server/src/http.ts` 的 close 先结束事件流、调用 closeAllConnections，再等 server.close 回调；库关闭是同步调用。没有显式超时，因此不能宣称关闭有严格时间上限；若底层关闭卡住，第二次 Ctrl-C 仍被忽略，需要外部强制终止。此次不另加第二次信号提前退出，以免跳过清理与失败报告；该建议和风险交统筹决定。

输入仍为现有命令参数和退出信号；依赖仍是现有 Server、storage 及 local-host 公开 API。测试通过真实构建入口启动独立子进程；关闭故障在子进程内替换公共依赖的关闭方法，保留真实服务启动/停止，验证入口接线和资源清理。

## 验收标准

- **RAC-110**：server 的帮助、JSON 结果与启动指引保持原 stdout 格式；正常路径无新增 stderr 日志。提前关闭管道读端时，帮助/成员命令仍以 0 退出且 stderr 为空；serve 继续响应真实 HTTP 请求并可正常 SIGTERM 关闭。非 EPIPE 的输出失败不能静默成功。CLI 允许的正常 console 不变。证明：`tests/server-cli.test.ts` 的真实构建入口回归与实际 diff；缺失入口时明确要求先执行 pnpm build，不把该检查当作构建新鲜度证明。
- **RAC-111**：server 正常退出码为 0；HTTP 关闭拒绝、库关闭抛错或两者同时失败时，各失败阶段留下一个结构化错误，仍尝试库关闭，退出码为 1；错误消息/栈不进入日志；关闭未结束时连续收到两种信号只关闭一次。证明：`tests/server-cli.test.ts` 的生产入口故障注入与清理计数。
- **RAC-112**：CLI plugin 同步失败与异步拒绝都只输出一次现有错误文本并返回 1；成功参数、返回码和输出不变。证明：`tests/cli-protocol.test.ts` 的 dispatchCli 回归。

本片只用 RAC-110～112；RAC-113～119 与 BL-445～449 保留，无新增 BL。`privileges.md` 没有本片可以关闭的行；PG-031 的 CLI 提供方耦合不属于本片，状态仍由统筹维护。

## 验证与交接

新树先 `pnpm install --frozen-lockfile --offline`，按机器槽位整体 `pnpm build`。定向命令为 `node scripts/run-tests.mjs --jobs 2 tests/server-cli.test.ts tests/cli-protocol.test.ts tests/cross-device-continuity.test.ts tests/cross-device-gateway.test.ts tests/cross-device-launcher.test.ts`。优先执行这些直接受影响的用例；包 README 的其余关联用例按派单留给统一验证，PR 列明，不跑全量或浏览器批次。一轮补修将 server 回归加入产品子集清单，CLI 回归已在清单内。

推送前执行 `node scripts/check-health-gates.mjs --base origin/main`（下降时加 `--update`）、`pnpm boundary:check`；fetch 后执行提交范围的 `pnpm secrets:check`；执行 `node scripts/affected-tests.mjs --base origin/main --json`，记录 full 触发项与选中文件数。只提交本片差异，普通推送并开 PR，交 ac-review 一轮、修意见后再交二轮；作者不自评可合，不合并。PR 写防腐复查、privileges 状态及本机延后验证，并回填协调派单的 C1 首片状态和准确 head。

## 首轮实现验证（2026-10-23，评审补修前）

- RAC-110：通过。帮助与成员 JSON 逐字断言，启动指引检查固定文字和动态 owner/端口；原启动器回归继续覆盖真实恢复、成果读取与系统 SIGTERM 退出。
- RAC-111：通过。新测试实际启动构建入口、HTTP 服务与一次性 SQLite，注入 transport、storage 和双失败，核对阶段日志、关闭尝试、清理顺序和退出码；连续信号在同一关闭等待中交错，均只关闭一次。注入信号经子进程的真实 process 监听器派发；系统信号由既有启动器回归覆盖。库自身关闭失败时只证明尝试与失败报告，不声称失败的库已成功关闭。
- RAC-112：通过。生产 dispatchCli 的成功输出/返回码/参数、同步抛错与延后拒绝均通过；原 CLI 协议与存储副作用回归保持。
- 上述五个直接文件首次运行全部通过：5 + 3 + 1 + 2 + 3 = 14 项，0 失败、0 跳过。离线安装、整体构建、完整 merge-base health、boundary 通过；health 的 console 28→21，其余受控数字没有增加。
- 新改生产入口及新测试/夹具的定向 Biome 检查通过；包含已有 CLI 测试时仍报其原有 `captureCli` 的一处 console（基线已记录，未新增），不称 lint 全绿。
- `affected-tests --base origin/main --json`：`full=[]`，最终选出 26 个非浏览器文件，未覆盖列表为空（刷新生成 baseline 前为 15 个，新增的 11 个为基线文件读者）。只执行上述直接五个；其余 21 个文件及产品子集清单补入留给统筹统一窗口，详细清单列在 PR。未跑全量、浏览器或真实 Home，不改变 C1 整体状态。一次性 server 测试目录已清理。
- 最终 head、提交范围 secrets、基线刷新与 CI/评审状态在 PR 中记录；一轮和二轮均交 ac-review，作者负责修意见。

## 一轮评审补修（2026-10-23）

一轮评论：[#1151 / 6377012345](https://github.com/molis-ai/molis-work/pull/1151#issuecomment-6377012345)。基于 `913ea55e0d899063a0f508d226a8353bd6ea3f8b`，核对认领评论与协调 README 00:20 后由本作者独占补修。

- 修前用真实 `apps/server/dist/main.js`，父进程立即关闭 stdout 管道读端：help、members、serve 三种入口都退出 1，stderr 为未处理 EPIPE；不是裸 Node 示例。新增同一路径回归修前 4/6 通过、2/6 失败，失败分别是命令退出码和 serve 就绪前崩溃，证实用例能拦住本次缺陷。
- RAC-110 补修已通过：help/members 断管后退出 0、stderr 为空；serve 断管后由真实 HTTP `/continuity/api/session` 返回预期会话，随后 OS SIGTERM 退出 0；stdout 指向只读文件产生 EBADF 时仍退出 1 并报告错误。原输出、关闭失败、重复信号和 CLI 回归均保留。五个直接文件本轮 17/17 通过，无重试或跳过。
- 产品子集清单只新增 `tests/server-cli.test.ts` 一行；增加缺失构建入口的明确报错，仍须整体构建保证源码新鲜度。未改门禁规则、依赖、API、资源或原生代码。
- 本轮整体构建、定向 Biome、产品子集规则测试 19/19、整 PR merge-base health（基点 abc052bc）与 boundary 均通过。console 保持 28→21，受控数字未增加；补修未再改生成 baseline。提交范围 secrets、精确 SHA 与原始日志在 PR 和本机交接记录。未运行全量、浏览器、原生或页面资源检查（此次不涉及相应代码）。
- `affected-tests --base origin/main --json` 为 `full=[]`，27 个非浏览器文件，`uncovered=[]`；较初片新增产品子集规则测试。其余 21 文件仍交统一验证窗口，清单见 PR。
- 原始日志目录：`/tmp/molis-verify-2026-10-23/pr1151-epipe/`；`before-repro.log`、`before-tests.log` 保留红例，`build.log`、`tests.log`、`product-subset-test.log`、`health.log`、`boundary.log`、`lint.log`、`affected.json` 保存本轮输出。二次 Ctrl-C 行为按前述取舍保持，提交 ac-review 二轮；作者不作可合判断。
