# AP2 Local Host Composition 迁移验收记录

日期：2026-09-02  
Goal：`goal-reorg-ap2`  
完成等级：AP2 切片达到“内部完整”；整个架构重组仍在继续。

这次迁移只改变本地运行对象由谁创建、复用和关闭，不改变 Web、CLI、MCP 或 Desktop 已有的产品行为。Local Host 当前采用进程内嵌入方式；稳定的是 Host Client Contract，未来可以在不改业务调用的前提下增加独立进程和 IPC。

<a id="ap2-boundary"></a>
## AP2 Boundary

### 已建立的正式边界

- `packages/contracts/src/platform/app-host.ts`：公开带版本的 Capability、Project reference、Host Client 与状态类型。
- `packages/kernel/src/index.ts`：只负责 Capability 注册、查找和调用，不保存业务事实，也不复制 Module 规则。
- `apps/local-host/src/index.ts`：按 Project storage key 复用一份 Runtime，串行执行该 Project 的 Capability，并统一处理身份冲突、关闭等待和重启。
- `src/local-host/composition.ts`：迁移期兼容装配点；旧 `SqliteMolisWorkStore` 与 `MolisWorkCoordinator` 只在这里组合成 Host Runtime。

正式调用通过 `LocalHostProjectClient.invoke(capability, input)`。尚未迁入独立 Module 的旧功能临时通过 `MolisWorkLocalHost.withProject` 使用同一 Runtime；这是有退出方向的兼容端口，不是第二套公共业务 API。

### 依赖检查

- Web、CLI、MCP 只从 Local Host 和 Module 的 public entrypoint 调用，没有 Local Host 或 Kernel deep import。
- Kernel 不依赖业务 Module、旧 Store、Web、CLI、MCP 或 Desktop。
- Local Host 不拥有 Goal、Project、Feed 等业务事实；业务规则继续属于相应 Module。
- `pnpm workspace:check`：48 个 package、48 个唯一名称、30 个 Contract subpath，0 error。
- `pnpm boundary:check`：48 个 package、111 个 source file、199 个 import、55 个 package edge，0 error。
- `CI=true pnpm typecheck`：通过。

<a id="ap2-legacy-exit"></a>
## AP2 Legacy Exit

AP2 已从这些产品入口移除重复的 Store / Coordinator 初始化：

- `src/web/server.ts`：每个 Project 请求使用 Host 中的同一 Runtime；Feed scheduler 复用该 Runtime 的 Store，不再另开 writer。
- `src/v1/cli.ts`：参数解析和输出保留在 CLI，业务运行对象由注入或默认拥有的 Host 提供。
- `src/mcp/server.ts`：协议和上下文适配保留在 MCP，业务运行对象由 Host 提供，并随 stdio 生命周期统一关闭。
- Desktop：当前通过它启动的 Web / Workbench 路径使用同一 Host，没有再创建一套业务 Store。

源码边界测试禁止 Web、CLI、MCP 重新出现 `new SqliteMolisWorkStore` 或 `new MolisWorkCoordinator`。`rg` 审计确认，这两个构造在本切片涉及的入口中只存在于 `src/local-host/composition.ts`。`src/projects/catalog.ts` 的文件迁移/创建 staging 和 `src/v1/demo.ts` 的独立 Demo 数据生成不属于这些运行入口，分别由后续 AP/WK 切片和 Demo 清理处理；它们没有被错误吸收到 Local Host。

AP2 没有新建一个掌管所有业务的全局 Coordinator。Host 只负责组合、复用、排队和释放，各 Module 仍通过自己的 Contract 管理规则和事实。

<a id="ap2-result"></a>
## AP2 Result

### 行为验证

- `CI=true node --import tsx --test --test-concurrency=1 tests/local-host.test.ts`：3/3 通过。
  - 并发发现同一 Project 只打开一次 Runtime。
  - 同一 Project 的 Capability 串行执行；未注册能力与身份冲突返回稳定错误。
  - CLI、MCP 和 Workbench 风格 Client 共用同一 Host，写入相同幂等 Goal 事实，关闭后可从 SQLite 恢复。
  - Web、CLI、MCP 的源码边界不允许直接构造 Store / Coordinator。
- `CI=true node --import tsx --test --test-concurrency=1 tests/local-host.test.ts tests/v1.test.ts tests/mcp.test.ts`：151/151 通过。
- Web、Desktop、Session 定向回归在正常本机权限下：105/105 通过。期间发现个人规划方法更新后旧 Runtime 未刷新，已改为由 Host 统一关闭并重开已发现的 Project Runtime，相关回归通过。
- `CI=true pnpm test`：500/500 通过，覆盖 build、打包发布 E2E、Web、MCP、CLI、Desktop、Session、旧兼容路径和新 Local Host。
- `git diff --check`：通过。

受限沙箱最初无法监听本地端口或启动浏览器/原生子进程，因此相关测试改在正常测试权限下运行；最终统计没有环境失败或断言失败。

### Single writer 的准确范围

- 一个 Local Host 实例内，同一 Project storage key 只有一份 Store / Coordinator Runtime。
- 多个入口显式注入同一 Host 时，共享这一 writer 和同一份事实；Host 关闭会等待正在使用的 Runtime。
- Host 重启后从现有 SQLite 恢复事实。
- 当前没有宣称跨独立进程自动发现、daemon 或 IPC 已经完成。它们是后续可替换的 transport，不影响本次已经固定的 Client Contract 和组合边界。

### 验收结论

- Local Host、Kernel registry 与 typed Client 已有清楚、可测试的公开边界。
- Web、CLI、MCP、Desktop 的本切片业务初始化已收口，原功能无损。
- 同 Host 多入口、single writer、统一错误和重启恢复有自动化证据。
- AP2 范围内没有已知未完成项；AP3、AP4、DV1 和 WK 系列继续把 UI、Desktop、CLI/MCP 及旧兼容职责迁入各自 owner。
