# Molis Work 代码质量收敛

## 完成等级

内部完整：本轮整理不改变用户可见行为，但要让已覆盖的边界、资源生命周期和静态约束可以由测试与编译器持续守住。

## 背景与问题证据

Molis Work 已形成 CLI、MCP、Web、Desktop、Project Catalog 与 V1 领域层，但部分入口代码仍承担过多职责，且缺少一条基础的未使用代码约束。

本轮审计确认：

- `src/v1/coordinator.ts` 与 `src/web/render.ts` 均超过 9,000 行，`src/web/server.ts` 的主请求处理函数超过 1,700 行；这些是明确的后续拆包对象，但不适合在一次无行为变化的整理里整体搬迁。
- 临时开启 TypeScript 的 `noUnusedLocals` 与 `noUnusedParameters` 后发现 9 处确定的未使用导入、参数、常量或渲染链。
- CLI、MCP、Web 与卸载流程多次重复 `MolisWorkProjectCatalog.open()` / `try` / `finally` / `close()`，资源生命周期依赖各调用方自行遵守。
- 当前 `tsconfig.json` 明确关闭未使用局部变量和参数检查，因此死代码可以继续进入主干。

## 目标

1. 删除已经由调用关系证明不可达或无效的实现。
2. 开启 TypeScript 未使用局部变量和参数检查，让同类问题不再回归。
3. 让 Project Catalog 的短生命周期访问只经过一个公共入口，由该入口保证关闭资源。
4. 保持现有 CLI、MCP、Web、Desktop、数据库和规划行为不变。
5. 记录值得继续拆分、但本轮不应冒险处理的模块边界。

## 范围

### 本轮处理

- 清理编译器确认的未使用导入、参数和常量。
- 删除未被任何调用方使用的 Goal 情势条渲染链。
- 调整仍在使用的方法签名及调用点，移除无意义参数。
- 新增 Project Catalog 作用域助手，统一短生命周期的打开、执行与关闭。
- 将生产入口中适合词法作用域管理的 Catalog 调用迁移到该助手。
- 开启 `noUnusedLocals` 与 `noUnusedParameters`。
- 检查桌面 Tauri/Rust 外壳，并把仅供测试使用的辅助实现明确限制在测试构建中。

### 非目标

- 不改变产品功能、路由、MCP 工具协议、数据库结构或 Goal 状态机。
- 不在本轮整体拆分 `MolisWorkCoordinator`、Web 请求路由或 HTML/CSS/JS 渲染文件。
- 不引入新的框架、依赖、校验和、迁移系统或抽象层级。
- 不为了形式统一改写测试中需要显式控制 Catalog 生命周期的场景。
- 不处理与本轮代码质量目标无关的既有工作区改动。

## 方案与模块边界

### 静态约束

`tsconfig.json` 开启未使用局部变量和参数检查，覆盖正式构建所包含的生产代码，避免仅靠人工审查发现死代码。

### Project Catalog 生命周期

新增一个位于 `src/projects/` 的小型作用域助手：

- 输入：`MolisWorkProjectCatalog.open()` 所需选项与一个操作函数。
- 生产：打开 Catalog，把实例交给操作函数。
- 边界：无论操作返回、抛错或异步失败，都在 `finally` 中关闭 Catalog。
- 不负责：Catalog 业务方法、事务、重试、缓存或长生命周期实例。

调用链收敛为：

`CLI / MCP / Web / uninstall -> catalog scope helper -> MolisWorkProjectCatalog`

### 大文件边界

本轮只删除确定不可达的渲染链，不移动仍在工作的实现。后续专项可按以下边界拆分：

- Coordinator：规划、Goal 生命周期、证据与决策分别形成领域服务。
- Web Server：认证与本地控制、项目路由、设置路由、Goal 路由分别形成请求处理器。
- Render：静态资源、页面骨架、Goal Detail、设置页分别形成渲染模块。

这些拆分需要各自的行为契约与回归测试，不能作为本轮顺手重构。

## 验收标准

1. `pnpm typecheck` 通过，且 `tsconfig.json` 已开启 `noUnusedLocals`、`noUnusedParameters`。
2. 临时命令 `tsc --noEmit -p tsconfig.json --noUnusedLocals --noUnusedParameters` 不再报告未使用代码。
3. 未使用的 Goal 情势条及其私有辅助函数已移除，仍被测试覆盖的公开查询函数保留。
4. 生产代码中的短生命周期 Catalog 调用通过统一助手关闭；Catalog 类自身和需要显式持有生命周期的测试不受影响。
5. `pnpm test` 与 `pnpm build` 通过。
6. `cargo check` 与 `cargo test` 不再报告桌面端死代码警告。
7. 实际 diff 不包含用户可见功能变化、数据库迁移、无关格式化或现有改动的覆盖。

## 验证

```bash
pnpm typecheck
pnpm test
pnpm build
cargo check --manifest-path desktop/src-tauri/Cargo.toml
cargo test --manifest-path desktop/src-tauri/Cargo.toml
cargo clippy --manifest-path desktop/src-tauri/Cargo.toml -- -D warnings
rg "MolisWorkProjectCatalog\\.open" src
```

最后一条允许在 Catalog 类或明确的长生命周期所有者中出现；所有请求级、命令级临时访问都应通过作用域助手。

## 假设与风险

- Catalog 的 `close()` 可安全地在操作完成后调用；现有调用方式已经使用同样的 `finally` 语义。
- 最大风险是迁移大量入口调用时改变返回或错误传播。本轮助手不捕获、不包装错误，并通过既有 MCP、Web、CLI 与卸载测试验证。
- 大文件仍然存在，这是已知结构债务；本轮以建立可持续约束和清晰资源边界为先，不宣称已经完成全仓库架构重构。

## 验收结果（2026-08-24）

- `pnpm typecheck`：通过。
- `pnpm test`：207/207 通过，包含构建、安装、卸载、MCP、规划、Web、Desktop TUI 与端到端路径。
- 桌面外壳：`cargo check`、`cargo test`（1/1）与严格 Clippy 全部通过；测试辅助函数已限制在测试构建，Tauri 命令保留稳定的前端参数协议，并对该单一框架边界记录局部 Clippy 理由。
- 资源边界：生产代码中只有 `catalog-session.ts` 可以直接调用 `MolisWorkProjectCatalog.open()`。
- 作用域助手：成功返回与操作抛错两条路径都由测试证明会关闭 Catalog。
- 入口可达性：从公开包入口、CLI、MCP、Web、PTY Client 与构建指纹入口扫描 35 个源码模块，35 个全部可达，没有孤儿模块。
- 依赖方向：源码 import 图未发现循环依赖。
- 静态清理：删除一个未使用类型导入、一个未使用图标、两个无意义参数、两个未使用 Web 常量/参数，以及 157 行不可达的 Goal 情势条渲染链。

### 后续专项，而非本轮遗留补丁

1. `MolisWorkCoordinator` 仍同时承担规划、Goal 生命周期、证据、决策等职责，适合按领域服务逐步拆分。
2. `handleMolisWorkWebRequest` 仍集中处理全局设置、项目与 Goal 路由，适合先按路由组提取，并保持统一认证入口。
3. `render.ts` 仍混合静态资源和多个页面渲染器，适合按页面边界拆分；不能只为降低行数机械搬文件。

这三项需要各自的行为需求书和回归面，不应在本轮无行为变化整理中继续扩大范围。
