# W5-13 C1：桌面入口拒绝与关闭失败

状态：Codex FIX4 的 #1244 一轮修复与定向工程验证已交付，独立审验/集成按原 PR 流水线接续；原 RAC-118/119 实现与证据保留。C1 原 owner 和整线未完成状态保留，#1231/#1238 由原流水线审验，#1240 两项修复由 FIX1 独占，本片不复写。

准确基线 `87ebba4c769557f9548d66310d76eb4e30b68bc9`。按[总规格](../spec.md) W5-13 的失败不可冒充成功及日志只记键的现行合同，核对已合 RAC-110～114 与三份在途片后，仍发现两条启动器出口没有收口：`launchers/cli/main.ts` 的 `main().then(...)` 没有拒绝处理（实际 lint 仍列一条浮动 Promise）；`launchers/web/server.ts` 丢掉 `server.close(error)` 的错误，2 秒界限也无条件退出 0。实际 Host 的 `awaitWebServerShutdown` 会把资源清理拒绝送进这个回调，因此后者能把清理失败说成成功。此处先是源码证据，真实构建入口的红例随后核实。

范围只限这两个 Desktop launcher、必要的同包小接线、直接相关回归与子进程夹具、本 slice 及 README 的启动器段。16 个当前 open PR 的完整路径无两入口占用；唯一 README 交叉是 #1240 的坏参数段，本片不动该段。不要为了找新片把允许的 CLI 输出或浏览器模板 catch 机械换掉，也不进入 C3 Gmail、UI、OAuth、其他 Host 枢纽或任何真实 Home/安装。

**RAC-118**：Desktop CLI 正常输出、参数及原返回码保持；若其公开 `runLocalCli` 依赖返回意外拒绝，实际产品入口只留一条现有 `hostLog` 安全记录并退出 1，不由 Node 打印原始拒绝正文/堆栈。正常业务错误仍由原 dispatch 回答，不新增重试、输入或错误体系。

**RAC-119**：Desktop Web 收到原 SIGINT/SIGTERM 后只发起一次关闭；正常关闭完成仍退出 0，原启动 stdout 与数字回环绑定保持。HTTP 关闭或 Host 清理拒绝时记一条安全错误并退出 1；若原 2 秒界限内仍没完成，记固定超时诊断、明确剩余清理未完成并非 0 退出，不能虚称关闭成功。等待期间让这个界限保持进程存活，完成后清掉它；重复信号不再发起第二次关闭，不自动重做任何业务操作。只改变失败出口，不扩成通用生命周期框架。

2026-10-24 一轮修复（#1244，6389229048／6389275074）：RAC-119 的正常停止包括仍有本工作台长连接的情形。实际 `stopStreams` 只先停调度、IM 与浏览器；PTY 的 `killAll` 及 Host 资源释放在 HTTP 关闭之后，活动 HTTP 或升级 WebSocket 会阻断这条顺序。Web 主入口在监听前登记本实例的 TCP socket；收到信号先发起原单次关闭、清理 idle，下一轮仍未完成的 HTTP 调 `closeAllConnections`，并显式关闭登记的 socket（含 upgraded WS），使原 close 事件和 Host 清理继续；二者实际完成才退出 0，无超时诊断。完成或拒绝时清掉本次排定的连接清理，原 2 秒界限、拒绝/真实卡死退出 1 和 CLI 行为保持。只改真实 Web 主入口、必要入口回归/夹具、README 和本 slice，不改导出工厂、Host 服务合同或业务事实。

RAC-119 收尾补充：Node 的 listener-close 回调可能早于 socket 的实际 close/请求取消回调，不能据此直接结束进程。主入口按本服务 socket 登记真实 close Promise；HTTP/Host 回调成功后还须等这些 Promise 完成才退出 0，期间不提前清掉原 2 秒界限。回归沿用 RAC-119，通过实际构建入口、公开连接/owner 及 OS 信号，覆盖活动 SSE、已升级并认证的 PTY WebSocket、待完成 HTTP 连接、对端断开和实际 HTTP/Host 清理；保留原两种卡死的真实 2 秒退出 1 断言，并补「fd 已关、close 通知未完成」仍守住 2 秒退出 1。当前 `plugin-route-operations.ts` 的 `view-revision` GET 直接返回 revision JSON，不把它伪造成长等待。有效旧实现红、正常控制和修后绿分别保留；缓存复用核对未过，已在新树整体构建 b0d 后取有效红。实现后走公共槽整体构建，再跑 desktop 必跑及相关回归，无新 full 或真实 Home/4207/凭据操作。

回归走实际构建的 `dist/cli/main.js` 与 `dist/web/server.js`，每个场景独立 Node 子进程/一次性 Home，经公开依赖端口注入错误，不替换入口或复制关闭处理器。CLI 意外拒绝可在子进程用 Node 公共模块 mock 替换 `runLocalCli`，其余公开导出保持；这证明的是入口的拒绝合同，不冒真实业务端口发生了事故。Web 用实际 HTTP 监听、公共 Host close 和 Node Server close，核退出码、单次清理、日志隐私、真实正常请求与失败/未完成后的退出；只按本次子进程 PID 清理。

先整体构建基线并保留有效红，再最小实现、重建、定向绿与包必跑：`tests/desktop-shell-bootstrap.test.ts`、`tests/desktop-tui.test.ts`、`tests/action-mcp-stdio.test.ts`，以及实际 affected 与必要的 CLI/入口回归。公共 build/browser 槽保持，不起新 full；若实际影响分析需要 full 则交 Claude 统一排。对准确 merge-base 的 health、boundary、fresh fetch 后逐提交 secrets、实际 diff 与源/构建引用检查记录到 `/tmp/molis-verify-2026-10-24/c1-rac118-119/`。不修改共享 baseline、门禁、阈值、编号表、存储或权限。最终一个完整非 Draft PR 交流水线路由 Claude 首评与独立 TEST，修后另按固定新头复核，不把本片当 C1 整体或最终产品验收。

验证：

- 实际构建的原 `87eb` 上，正常 CLI/真实 Web 关闭两个控制通过；六种故障叶场景分别显示 CLI 原始拒绝、Web 原始同步异常，或回调/Host 拒绝/两种阻塞却退出 0，Node 合计 2 通过、8 失败（含两个聚合父测试）。没有测试夹具首败；`red.log` 保留。Host 已完成实际资源关闭但返回的 Promise 永不结束时，原未引用的界限还会让进程提前自然退出 0。
- 修后新增 10/10，通过真实产品入口、公开依赖端口和实际 OS 信号，核原参数/返回码/帮助输出、真实 HTTP 健康回答、单次 HTTP/Host 关闭、原始错误隐私、正常 0、故障/超时 1、两种阻塞确实等待界限。测试超时时只终止本次子进程，等退出后删除它的临时 Home。
- 首批五文件 54/54：新增 10、desktop-shell-bootstrap 3、desktop-tui 35、action-mcp-stdio 1、cli-protocol 5；补充 command-entry-chain 1、security-invariants-local-entry 15、runtime-payload 3，共八文件 73/73、零跳过/运行器重试。后者包含真实临时离线 Runtime 产物安装，不代表安装到用户系统。
- 两次整体构建、离线依赖安装、严格测试类型、四份改动代码的 Biome、boundary、对准确 `87eb` merge-base 的 health 均通过。浮动 Promise 全仓 3→2，减少的是 Desktop 入口那一条；剩两条在其他线，不扩改。按当前组批规则，下降交最终批统一生成 baseline，本功能 PR 不刷新共享快查。
- 实际 affected 为 105 建议（102 非浏览器、3 浏览器），`full/storage/uncovered` 均空；八个已跑文件中六个在建议内、另两个直接 CLI 补充。余 99 建议未运行，多数只经 fixture 导入同一 Web 工厂。实际 diff 不改工厂、导出或 `isMain` 判定，行为变更在程序主入口分支；独立 TEST 据此与最终同头 CI 按风险核余项，不借其他候选的 full。
- 新文件本机 31.8 秒，含完整子进程初始化及两个真实 2 秒界限，不属于快速产品子集“几秒”的场景，保留在完整测试集合和独立 TEST 适用范围；未删除/隔离既有 CI 项，也不拆小或削弱断言来凑清单。没有新的浏览器批次、外部模型、真实 Home/4207 或产品凭据操作。
- Rust/Tauri 源码、Cargo 配置及原生门禁脚本与已核 `3ce6270b` 逐字无差异；复用 RAC-117 原件 `native-rust.log` 的实际 20 源码 rustfmt/clippy/cargo test 通过（工具链 1.96.0），没有把未新跑的 Rust 称作本片新实跑。最终提交的 fresh-fetch secrets 与 diff/门禁结果随固定头交接。

本轮 FIX4 修复证据（原件 `/tmp/molis-pr1244-shutdown-streams-fix-20261024/`）：

- 在独立树实际构建 b0d 后，正常关闭控制通过；真实认证 PTY/SSE、未被 owner 结束的真实 IM SSE、未完成授权 HTTP 三例均以 `shutdown_timed_out` 退出 1，HTTP/Host 清理未到达。初次红只显示退出码，第二次保留准确诊断，未把缓存复用未通过当有效构建。
- 首修串行复核 12/13：正常长连接已退出 0，但未完成 HTTP 的取消/close 回调没执行就退出。真实入口追踪及 Node 24.14 原生 HTTP 对照均确认 listener-close 早于这些回调。主入口改为等待实际 socket-close Promise；最终整份入口 14/14、零跳过/取消，保留原严格错误日志、两个真实 2 秒卡死断言，并新增 fd 已关但 close 通知被公开依赖端口扣住时仍等 2 秒退出 1。
- Desktop 必跑的 bootstrap 3、TUI 35、MCP stdio 1 共 39 项均有通过原件；其使用的工厂/包实现与本轮最终 main 修正无差异，和最终入口合计 4 个唯一文件 53 项有效回归。Runtime 产物 3 项在首修候选上自然完成；它证明未改的打包/安装链，不冒最终 main 再改后的产物实操。
- 首个五文件并行批只过 3/5：入口 2/13 多处在原启动/IPC 上限前失败，MCP 60 秒取消，原件完整保留；在公共槽内串行复核后 MCP 1/1、入口达到实际关闭断言。首批启动超时原因未定，未作同断言负载基线，不称偶发或已知 main；其中误用会重编 Test Kit 的 boundary 命令与首批启动重叠，后续改为公共槽串行检查，未以此推定因果或放宽断言。
- 最终整体构建、严格类型、Biome、准确 `87eb` merge-base health 均通过；边界 70 包零错误、引用图 1427 进程零混用、27 项页面资源预算通过。引用/资源输入未随最后的 main 收尾修正改变，复用其有效结果。无新 full、浏览器、Rust、真实 Home/4207/Keychain 或 Agent 操作；未改 CLI、导出工厂、服务合同、门禁或共享 baseline。
