# W5-13 C1：桌面入口拒绝与关闭失败

状态：Codex（实现 1）的 RAC-118/119 实现与定向工程验证完成；独立 REVIEW/TEST、CI 与合并待处理。C1 全线 owner 和未完成状态保留，#1231/#1238 由原流水线审验，#1240 两项修复由 FIX1 独占，本片不复写。

准确基线 `87ebba4c769557f9548d66310d76eb4e30b68bc9`。按[总规格](../spec.md) W5-13 的失败不可冒充成功及日志只记键的现行合同，核对已合 RAC-110～114 与三份在途片后，仍发现两条启动器出口没有收口：`launchers/cli/main.ts` 的 `main().then(...)` 没有拒绝处理（实际 lint 仍列一条浮动 Promise）；`launchers/web/server.ts` 丢掉 `server.close(error)` 的错误，2 秒界限也无条件退出 0。实际 Host 的 `awaitWebServerShutdown` 会把资源清理拒绝送进这个回调，因此后者能把清理失败说成成功。此处先是源码证据，真实构建入口的红例随后核实。

范围只限这两个 Desktop launcher、必要的同包小接线、直接相关回归与子进程夹具、本 slice 及 README 的启动器段。16 个当前 open PR 的完整路径无两入口占用；唯一 README 交叉是 #1240 的坏参数段，本片不动该段。不要为了找新片把允许的 CLI 输出或浏览器模板 catch 机械换掉，也不进入 C3 Gmail、UI、OAuth、其他 Host 枢纽或任何真实 Home/安装。

**RAC-118**：Desktop CLI 正常输出、参数及原返回码保持；若其公开 `runLocalCli` 依赖返回意外拒绝，实际产品入口只留一条现有 `hostLog` 安全记录并退出 1，不由 Node 打印原始拒绝正文/堆栈。正常业务错误仍由原 dispatch 回答，不新增重试、输入或错误体系。

**RAC-119**：Desktop Web 收到原 SIGINT/SIGTERM 后只发起一次关闭；正常关闭完成仍退出 0，原启动 stdout 与数字回环绑定保持。HTTP 关闭或 Host 清理拒绝时记一条安全错误并退出 1；若原 2 秒界限内仍没完成，记固定超时诊断、明确剩余清理未完成并非 0 退出，不能虚称关闭成功。等待期间让这个界限保持进程存活，完成后清掉它；重复信号不再发起第二次关闭，不自动重做任何业务操作。只改变失败出口，不扩成通用生命周期框架。

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
