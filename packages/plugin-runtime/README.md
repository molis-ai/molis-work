# Plugin 安装与生命周期

管理 Plugin 定义、安装身份、权限授予、启动、崩溃恢复和卸载，让 Host 能追踪一次安装的状态与访问权。

包名：`@molis-ai/molis-work-plugin-runtime`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

PluginRuntime 使用注入的 repository 和 executor；启动或恢复产生新的 grant context，失败和卸载撤销旧 context。SQLite repository 保存安装事实，private storage 按安装 ID 隔离 opaque string 数据。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名或 package.json 声明的子路径；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/index.ts](src/index.ts) | PluginRuntime 与 executor/repository 端口 |
| [src/repository.ts](src/repository.ts) | 安装状态持久化 |
| [src/private-storage.ts](src/private-storage.ts) | 按安装隔离的数据 |
| [src/package-verification.ts](src/package-verification.ts) | 包和签名验证 |

可对照现有调用方 [apps/local-host/src/plugin-development.ts](../../apps/local-host/src/plugin-development.ts) 阅读装配方式。

## 接入与边界

这是受信任的进程内执行，不是 OS sandbox。包签名验证认证 bytes 与受信公钥，不代表官方审核。普通卸载保留私人数据；成功执行不保留数据的卸载后，Host 还须调用 deleteInstallationData，不能顺手删除交换出的 Artifacts。

私人存储增加可选的 `compareAndSet(key, expected, value)`：仅当当前值与 expected 完全相同才原子替换；expected 为 null 表示仅在 key 不存在时创建。返回 false 表示冲突，未修改数据。SQLite 实现使用单条条件写入，检查当前安装权限，支持不同连接间的冲突检测。旧 `get/set/delete` 不变；第三方 Host 未提供该可选方法时，需要原子更新的插件必须明确拒绝，不能用先读后写冒充原子操作。

这是单 key 的条件写入，不是任意多 key 事务，也不提供跨设备团队同步。消费者可把同一次原子提交的状态放在一个带修订标记的值中；不要在冲突后盲目重跑含外部副作用的逻辑。

工作区依赖：`@molis-ai/molis-work-contracts`。其他运行依赖见 [package.json](package.json)。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-plugin-runtime typecheck
pnpm --filter @molis-ai/molis-work-plugin-runtime build
```

已有行为示例与回归：[plugin-runtime-integration.test.ts](../../tests/plugin-runtime-integration.test.ts)、[plugin-private-storage.test.ts](../../tests/plugin-private-storage.test.ts)。完成上述构建后运行：

```bash
node --import tsx --test --test-concurrency=1 tests/plugin-runtime-integration.test.ts tests/plugin-private-storage.test.ts
```

阅读测试中的输入与断言，可以看到接入方式、结果和错误分支。

## 开发要求

- 负责：插件身份、安装、授予、隔离、生命周期与回滚。
- 不负责：Module 业务事实、提供方协议。
- 公开入口：`@molis-ai/molis-work-plugin-runtime`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/platform/plugin`。
- 依赖：`@molis-ai/molis-work-contracts`。方向：平台包只依赖 contracts/platform 与更低层平台包（[包边界规则](../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 安装事实存 SQLite repository；私有存储按安装 ID 隔离。
  - 稳定 install_id 用于私有数据；installation_generation 区分每次确认安装，重启、启停和升级不变，卸载重装生成新值。持久任务绑定二者。安装记录必有 installation_generation 与 execution（`host` 或 `sandbox`），缺的记录不是当前 schema。
  - `stop()` 默认记录 disabled；Host 正常关闭可传 `preserve_enabled: true`，停止进程与撤销上下文后保留 installed 状态。该选项不能重新启用已经 disabled 的安装，失败仍记录 crashed。是否启动由 Host 的当前启用策略决定。
  - 不保留数据的卸载后 Host 还要调用 `deleteInstallationData`，但不能删除已交换出去的 Artifacts。
  - 已 disabled 的安装可以升级与回滚：只换版本，安装仍是 disabled，不启动新旧任何一版的实例（插件自带的 `validateUpgrade` 与私有数据捕获照常运行，生成插件没有），失败也不会启动旧实现（其余失败的升级恢复升级前的旧实现）。Host 重启后 Supervisor 不登记 disabled 的安装；带目标定义的 `upgrade`/`rollback` 会为它登记并保持撤销启用状态，之后 `enable` 启动的是切换后的版本。对没登记过、又不是 disabled 的插件，升级回答 `plugin_unknown` 且不留状态。启用只由显式 start/enable 完成。
  - 卸载后的确认安装是新的安装（新 installation_generation，沿用 install_id），可以是别的已发布版本。卸载时保留了私有数据的，目标版本要声明 `compatible_from_versions` 包含被卸载的版本（Host 随带的更新版本、生成插件回到更低版本不受此限），否则以 `plugin_kept_data_incompatible` 拒绝；调用者明确带 `discard_kept_data: true`（人确认放弃旧数据）才全新安装，Runtime 只放行这次安装，保留的私有数据由 Host 删除。未保留数据则不受限制。同版本 Manifest 指纹不同仍拒绝。没做完的确认安装用 `abandonInstall(installed, earlier?)` 退回：记录整条回到它顶替的那条已卸载记录（版本、Manifest 指纹、installation_generation、是否保留数据都不变），第一次安装没有可退回的记录（不带 `earlier`），就记为已卸载、不保留数据；运行中的实例先停。只能撤销 `installed` 指明的那次安装，且只在行仍属于它时：已被后来的安装顶替的不动；行已在这次安装自己的 installation_generation 上被卸载的也不动（不是这次安装做的，是人做的，他对数据去留的选择要算数；已退回到 `earlier` 的重放不受此限）。两种情形都以 `plugin_install_replaced` 拒绝（与「指明的不是同一安装、已卸载的记录」的 `plugin_state_invalid` 区分开），调用者据此不去动属于新安装或人那次选择的密钥、数据和提示词。这样下一次确认安装仍被问到保留数据的取舍。
  - Supervisor 的默认 grant 在已有安装满足全部必需权限时重放已有 grant，随带升级后变成可选的权限不会让下次启动被当成静默改 grant；升级失败后无论旧实现是否在运行，事件合同都回到旧版本的。
  - 内置插件（Supervisor 条目标 `bundled`，`install` 带 `bundled: true`）一律跟当前构建（用户 2026-10-08，[发布策略](../../docs/releases/POLICY.md)第 7 节做法 A）：已有安装（未卸载，同一 install_id 即同一 plugin_id 与发布者签名）的记录与构建的清单不同，不论版本更高、更低还是同版本摘要不同，启动时都改成构建的清单（`version`、`publisher_id`、`manifest_digest`、`selected_entrypoint`、`grants`、`updated_at`；`recordToFollow`、`followBundledBuild`），不看 `upgrade_compatibility`，不调 `validateUpgrade`。`install_id`、`installation_generation`、`state`、`installed_at`、`retain_private_data` 不变，私有数据留在这次安装上；部署环境和执行信任边界仍不能借启动改变。授权一条规则：新清单仍声明的保留，必需的补上（同版本改清单新增的必需权限也自动授予），不再声明的去掉。Supervisor 对这类条目不恢复任何存档发行物（`directlyUsable` 恒为真），`upgradeCandidates` 不列它们；当前构建的发行物照旧存档，记录自己的（版本，摘要）在表里总有一行。非 `bundled` 的插件规则不变：版本更低、更高但没有声明来源、同版本不同摘要仍拒绝，Supervisor 仍恢复存档发行物；已卸载的记录不在此列，重装仍走保留数据的规则（`keptDataRefusal`）。
  - 卸载仅对当前进程的活实例执行 stop；冷安装无需加载代码。成功卸载释放已加载实现，后续确认重装可重新登记同版本实现，运行中仍拒绝重复注册。
  - 条件写入是单 key CAS（`expected: null` 表示仅在不存在时创建），不是多 key 事务。
  - Host 不提供原子方法时，需要原子更新的插件必须明确拒绝，不能用先读后写冒充。
  - 内部 route 可携带可信 `execution`（signal/beforeEffect）保留原调用控制；HTTP 适配器不得从参数或 JSON body 构造它，actor 名称不授予内部调用权。
  - 事件发布检查项目和当前安装，发布 client 绑定 activation，旧 client 在重启后仍失效。订阅游标绑定 install_id 与安装世代，重装不能继承旧订阅的进度；未绑定身份的旧游标只保留为历史，新订阅从当前日志尾开始。
  - 事件处理器收到自己的安装身份、signal 和 beforeEffect；异步等待后先检查再产生副作用。先持久写 delivering，确认时复查实例/版本/订阅；中断后的未知处理隔离，不自动重放，尚未派出的启动失败可以恢复。关闭数据库前 await events.close()。
  - 隔离事件由 Host 管理入口读取和明确 retry/skip，插件 clients 没有恢复方法。确认绑定所见事件、游标 revision、安装世代和代码版本；只推进当前事件，决定与 actor/依据历史同事务保存，重装和过期确认拒绝。恢复不授予权限，实际重试仍走原订阅检查。
  - 输入图仅投递可用且未归档的固定版本；`onUpstreamReady` 的 `beforeEffect` 在异步等待后复查输入和当前执行实例。输入通知用于刷新投影，不用于一次性业务命令。激活新实例时撤销旧上下文并重新计算当前输入；关闭时先取消并结束输入协调，再关闭数据库。
- 改动后必跑：`node scripts/run-tests.mjs tests/plugin-runtime-integration.test.ts tests/plugin-private-storage.test.ts tests/plugin-upgrades.test.ts tests/plugin-host-executor.test.ts tests/plugin-events.test.ts tests/plugin-platform-composition.test.ts tests/plugin-event-recovery.test.ts tests/plugin-release-artifact.test.ts tests/plugin-lifecycle-states.test.ts`
- 相关手册：[docs/platform/PLUGIN-PLATFORM.md](../../docs/platform/PLUGIN-PLATFORM.md)、[skills/molis-plugin-dev/host.md](../../skills/molis-plugin-dev/host.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

## 进一步阅读

- [职责与接入说明](../../docs/platform/PLUGIN-DEVELOPMENT.md)
- [架构与当前实现索引](../../docs/SSOT-MATRIX.md)

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/platform/plugin`
- Migration Goals: `goal-reorg-f2`, `goal-reorg-fd3`, `goal-reorg-dv3`.

上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。
