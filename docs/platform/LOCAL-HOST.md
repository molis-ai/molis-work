# Local Host 与 Host Client

## 白话说明

DV1 的 CLI/MCP Goal 操作已全部通过 Host Client，不再从 `withProject` 拿 Coordinator 或 availability。`withScope` 只保持打开 Runtime 到响应完成的资源周期，不暴露 Store，也不把整个 callback 放进串行队列；内部具名 invoke 仍按原队列执行。Available+projection、trash+work state、planning methods+composition 分别是一个 Host 组合操作，避免异步迁移拆开原有一致性。Board/import/resume/trash-list 等声明和完整输入输出类型已归官方 Goals Plugin；root composition 仅注册原实现并保留兼容 re-export。DV1 已通过复核；逐项证据见 `specs/molis-work-architecture-reorganization/dv1-validation.md`。

DV1 的 Draft、Goal Tree、旧提案组现已通过 `createGoalProposalClients` 使用正式 Host Client；原临时 runtime 的三组字段已删除。公开 capability 逐项注册到原方法，含会保存恢复记录的 Draft resume 和会保存检查记录的 Goal Tree check。App 负责 await 后展示，Host 不复制提案业务规则。

Local Host 是本地产品的“总装配间”。以前 Web、CLI、MCP 各自打开数据库、创建 Store 和 Coordinator；同一个 Project 可能同时出现多份业务运行对象。AP2 把这件事收回到一个地方：入口只描述要连接哪个 Project，再通过 Host Client 调用能力。

这不是新增一个总管所有业务的 Coordinator。Goal、Project、Feed 等规则仍归各自 Module；Host 只负责把实现装起来、复用同一份 Runtime，并在关闭或重启时统一释放资源。

## 当前真实实现

- `packages/contracts/platform/app-host` 定义 versioned Capability、Project reference、Host Client 和状态类型。
- `packages/kernel` 提供 Provider-neutral `CapabilityRegistry`；它只做注册、查找和调用，不保存业务事实。
- `apps/local-host` 按 `storage_key` 发现 Project Runtime。并发连接同一 Project 只调用一次 factory，Capability 调用按 Project 串行，关闭会等待正在使用的 Runtime。
- `src/local-host/composition.ts` 是迁移期唯一兼容装配点。旧 Store 和 Coordinator 只在这里创建；Web、CLI、MCP 已删除自己的构造代码。
- Web 的 Feed scheduler 复用 Host 已打开的同一 Store，不再为一个 Project 额外创建第二个 writer。
- Desktop 当前通过它启动的 Web/Workbench 进程使用同一 Host，没有另建业务 Store。

## Client 与兼容端口

正式入口使用 `LocalHostProjectClient.invoke(capability, input)`。AP2 已接通 Board initialize、snapshot 和 Goal create 作为真实 typed Capability 切片，并验证 CLI、MCP 和 Workbench 风格 Client 对同一命令得到同一事实和幂等结果。

尚未迁到独立 Module 的旧调用暂时通过 `MolisWorkLocalHost.withProject` 兼容 composition 端口访问同一 Runtime。它只解决迁移期资源所有权，不是新公共业务 API；EX、WK、AP3、DV1 等 Goal 会逐步用正式 Capability 替换这些调用。

DV1 已将完整 Goal Contract、项目说明和 active-goal 三项入口接到官方 Goals Plugin 的具名 Capability，由 Host 注册并调用原 owner。MCP 的 Runtime 决定参数先在 App 校验，再调用 Local Host 的 `runtimeGoalTreeDecisionAuthority` 组合宿主来源；保持原审计算法，不把模型 args 变成 Session 身份。CLI/MCP 已无 `withProject` caller；Workbench 等剩余消费者另由各自迁移任务负责。

## Single writer 的范围

DV1 的 Runtime 项目入口额外通过 `RuntimeProjectCatalogProvider.withCatalog` 消费有界公开 catalog application。该 scope 覆盖异步结果组合，成功和失败都关闭原 catalog；它不是任意名称的执行总线，也没有创建第二个 Project Store。`RuntimeProjectConnection` 只维护当前进程的连接缓存，Session 身份变化后旧连接失效，继续采用只读 resolve、同幂等 key 重试的恢复规则，不自行写绑定。Panel alias 与原生 Session 关联由 Local Host 单独组合原 Desktop/Registry API，缺 Panel 的原错误由宿主识别，其他错误不隐藏。

AP2 保证一个 Local Host 实例内，每个 Project storage key 只有一份 Store/Coordinator Runtime；多个本地入口可以显式注入并共享这个 Host。Host 关闭后重新创建，事实从 SQLite 恢复。

当前实现是 embedded/in-process transport。它没有伪装成已经完成独立 daemon、Unix socket 或跨进程自动发现；这些部署细节可以在保持 Client Contract 的前提下后续增加。CLI/MCP 独立进程仍通过同一 composition 实现打开 Host，而不是各自复制初始化规则。

## 生命周期与刷新

- 同一 storage key 如果被错误映射为另一个 `project_id`/`board_id`，Host 拒绝连接。
- Capability ID + version 重复注册或未注册调用会给出明确错误。
- 关闭 Project Runtime 会等待当前使用者退出，再关闭 Store。
- 个人规划方法是所有 Project Runtime 的构造输入；保存后由 Web 请求 Host 统一重开已发现的 Project Runtime，避免各入口持有不同版本。

## 验证

```bash
node --import tsx --test --test-concurrency=1 tests/local-host.test.ts
pnpm workspace:check
pnpm boundary:check
pnpm typecheck
pnpm test
```

`tests/local-host.test.ts` 固定并发 discovery、串行 Capability、身份冲突、CLI/MCP/Workbench 多入口、幂等结果、单次打开、重启恢复和旧入口禁止直接构造 Store/Coordinator。
