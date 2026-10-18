# Alchemist 项目分库迁移前置核对

状态：只读核对完成，供下一片 handoff 使用；不是实施方案或运行验收。2026-10-18，以 `wt-alchemist-runtime` 的 `f629556d0` 及当时测试/文档/派生收尾工作区为证据。未修改该工作树、未运行安装、构建、测试或浏览器，未接触真实 Home。

结论：**Home 单实例 + 按可信动作上下文选项目的 PluginDatabase façade 可行，但公共 Runtime 尚不足以直接承接。下列四项是迁移接入前必须处理的 P1，不是当前 ALC-LIFE / ALC-RES 收尾合入的新增 blocker。** 当前生命周期与显式继续的实现结论不重审；旧提案中自动续跑、borrowedSql 等已否定部分不恢复。

以下源码路径均相对 `/Users/yijunwang/code/molis-anti-corruption-20261017/wt-alchemist-runtime`。

## P1-1：分区选择必须绑定真实动作及项目生命周期，安装授权本身不够

证据：

- `packages/plugin-runtime/src/action-provider.ts:25` 已在真实 handler 外建立 `runInPluginAction`；`action-scope.ts:9–24` 已提供 install、definition、caller。该上下文会随 Promise/定时器传播，**ALS 中仍有值不代表授权仍有效**；文件注释也明确生命周期由 caller fence 决定。
- `apps/local-host/src/home-plugin-executor.ts:40–54` 当前 authorize 只核安装 generation、当前安装 grants 和 activation grant。`plugin-database.ts:18–38` 的读写仅调用此 authorize，事务仅等待插件传来的 `beforeEffect`；没有核调用者权限、operation、所属 action scope 或 project。对现有 Home 库不能据此推断已经有项目授权。
- `apps/local-host/src/demo-project-lifecycle.ts:77–109` 的固定 id 重建会保持项目在 catalog 中并调用 `clearAll(..., { rebuild: true })`；仅检查“这个 projectId 现在存在”不能识别旧工作。Home 安装 generation 在这种重建中也不会自然改变。

最小修正：分区服务从 Runtime 自己提供的 action scope 取 install/project，核当前 caller 的同步 authority、signal、相关调用权限及安装授权；写入还须为 command，并等待真实 caller 的 beforeEffect，再做同步最终检查。现有 `transaction(beforeEffect, body)` 参数可以保留，但不能把调用方任意函数当作唯一授权。query 不能因为 Home 安装有写 grant 就获得 transaction 写权。

项目分区需要 Host 内部的可撤销实例身份；在动作/后台执行**受理时**绑定，不能等第一次 SQL 才选“当前 generation”。否则一个先等待模型、尚未访问数据库的旧调用可能在同 id 重建后首次开库，落入新项目。删除/重建撤销旧身份；清理成功后新的合法请求可绑定新实例，旧 scope 永不重新开库。它不是插件传入的永久 scope、projectId 或 path，也不要求新增持久授权平台。

已有 `model-configuration.ts:17–39` 展示了 Runtime 自取 scope、核 caller 权限、beforeEffect 后同步复核的现行模式；可沿用边界，不另开绕过入口。

## P1-2：后台接入须保留类别权限，并让真正的 worker 在本次 scope 中执行

证据：

- 已完成的 `plugins/native/alchemist/src/studio/server/services/job-resumption.ts:117–120` 为继续任务保留 collect 或 generate 的额外权限；Kernel 的 `action-execution-context.ts:11–48` 已支持 `retainBackgroundAuthority(additionalPermissions)`，校验 caller 原权限并保存原注册身份。
- 公共 `packages/contracts/src/platform/plugin-background.ts:6` 的 start 选项只有 signal；`packages/plugin-runtime/src/background-service.ts:31,37` 无参 retain，并且只检查动作静态声明的权限。直接替换会丢掉 continue 根据已存 job 类别选择的持续权限。
- 当前 Alchemist `local-worker.ts:39–44,59–76` 先内存受理、再由 `studio-lifecycle.ts:10–25` 的运行循环/定时器 claim 执行。这个循环不是公共 background 的 scope。公共 `background-service.ts:48–52` 只给传给 start 的 work 建立 retained action scope。

最小修正：让公共后台受理能把本次要求的额外权限交给现有 Kernel retain 路径，并核安装与 caller 都持有；不接受插件自造 authority、不增加持久权限记录。整次具体 job 的排队等待、claim、handler、续租、最终持久化均须留在这次后台执行及其真实 Promise 内。只在 start 的 work 中登记队列随后立即返回，之后由原 timer 运行，不能使分区 façade 获得有效 scope。不能用 job.actorId、lease 或手工缓存/重新构造的 scope 补洞。

这项只衔接已完成的继续授权，不重新设计恢复政策、原作者、预算或未知计费提示。

## P1-3：取消结果不是工作退出；项目清理必须等待真实前台和后台工作

证据：

- 公共 `background-service.ts:48–61` 保存局部 pending，却返回 `lifetime.wait(pending)`；该 result 一旦取消便移出 active 并 dispose。close 仅 abort 后 clear，没有可等待的原始 pending 集合。
- `packages/plugin-sdk/src/execution-lifetime.ts:17–18,53–60` 明确 wait 会在取消时先结束，底层 Promise 仍可能运行。这是现有 SDK 的正确语义，不能把它改称 drain 或靠另一个同义包装解决。
- `packages/plugin-runtime/src/action-provider.ts:25` 只包装 scope，没有按安装/项目登记原始前台 handler Promise。
- `apps/local-host/src/plugin-project-cleanup.ts:35–41` 当前同步通知 onProjectDeleted 后立即 purge。`tests/home-plugin-project-cleanup.test.ts:117–125` 甚至明确允许 stop 尚阻塞时 purge；这份已有测试不能证明带活跃分区连接的迁移安全。
- 已完成的 Alchemist 本地路径使用 `actor-actions.ts:7–35` 跟踪原始 invoke，并在 `studio-lifecycle.ts:28–35` 等真实 action/worker 后关库；迁移时不能以公共 background.result 取代这项保障。

最小修正：公共生命周期登记实际 handler/work Promise，按 install 和可信项目实例识别归属；撤权与阻止接纳同步生效，随后等待真实 settlement，再关闭该项目 DB/搜索资源，最后 purge。onProjectDeleted 可继续只是同步通知；真正等待由 Host 的内部生命周期执行。删除 A 不得停止 B。待清理 owner 在 stop/close 期间仍保留并指向同一 drain，不能因为 contribution 已撤销而落到直接 purge。

不必给公共 PluginDatabase 增加 close/open 或给插件第二套 driver。若新增可复用执行 helper，遵守共享可运行逻辑放 plugin-sdk 的既有边界；现有 SDK lifetime 可继续用于取消等待，原始工作登记是另一个明确职责。

## P1-4：关闭重试必须贯穿 Runtime、executor、owner 与每个连接

证据：

- `apps/local-host/src/plugin-database.ts:57` 在尝试关闭前设 closed=true，reader 失败仍 finally 关 writer；下次 close 直接跳过，无法重试失败连接。
- `apps/local-host/src/home-plugin-executor.ts:103–107` 不论 definition.stop 是否成功，都 dispose 并删除 session。
- 更上层 `packages/plugin-runtime/src/index.ts:453–488` 在 executor.stop 前撤销并移除 context/contribution，失败记 crashed；随后 stop 只接受 running，不能再通过原路径清理。这是旧提案只点 executor/HomePluginHost 时遗漏的必要一层。
- `apps/local-host/src/home-plugins.ts:75–96` 首次 close 就置 closed，后续 close 返回；release 无论 stop 成败都卸载 project owners、关闭运行登记库并丢 platform。仅修 executor 保留 Map 仍无法保证有下一次重试入口。

最小修正：公开动作可立即撤销，但内部未清理 activation/session/owner 保留到释放成功；失败以后用同一资源集重试，不允许重新 start/recover 开第二份实例绕过残留。reader、writer、搜索及登记库分别记成功步骤；不要永久缓存失败 Promise。Home close、项目清理与 stop 的交错共用实际未完成清理；只有全部成功才撤 owner/丢引用。启动失败后已经创建的服务也要有可达清理路径，不能只保存成功启动的 session。

## 已有能力与真正缺少的合同

| 已有、可以复用 | 尚未具备、下一片需要 |
| --- | --- |
| `PluginDatabaseReader` 的 get/all、`PluginDatabaseTransaction` 的同步 run、Host 管连接，事务 handle 结束后拒绝；SQLite readonly 连接拦实际写入（`plugin-database.ts:22–54`） | 分区 declaration、可信路径定位和按 action scope 选择连接；不需要 borrowedSql / prepare / 第二驱动协议 |
| 可信 definition 身份表与 owner/基线/权限注册校验（`plugin-entry-identity.ts:7–29`、`plugin-database-entries.ts:24–44`） | 当前校验只接受 `store.library`，Alchemist 的 `ALCHEMIST_HOME_STORE` 只有 `{ path: "alchemist" }`（`alchemist-paths.ts:8`），不能直接接入；新增分区形状需在同一可信 owner/基线注册链校验，嵌套声明复制并冻结 |
| storage 当前 Home 库统一使用 node:sqlite；readonly reader 不创建文件（`packages/storage/src/home-sqlite.ts:5–25`），baseline 仅接受现行版本或真正空库（`sqlite-baseline.ts:35–56`） | 当前路径固定 `<home>/<store>/<store>.db`，不能把 Alchemist 分区伪装成一份根库；增加同一 storage owner 的受限项目定位，保留 `alchemist/projects/<encoded-id>/studio.sqlite`，全 Home purge 仍登记根目录 |
| Runtime action scope、Kernel retained authority、真实 Host 项目路由绑定；SDK 可取消等待 | 上述 scope/额外权限传递、真实工作 drain、分区重建身份与失败重试，不是新增长期后台授权 |
| ALC-RES 已删除 query actor/seed 写入，ALC-LIFE 已修本地真实 Promise drain | repositories 仍使用 better-sqlite3；必须直接改为 reader/显式 tx，组合业务写传同一个 tx，不能包装旧驱动冒充 façade |

只读服务还有一个具体迁移约束：`sqlite-job-runner.ts:208–213` 的 readEvents 用旧驱动只读事务取 job+events。不能机械改成需要 write grant 的 PluginDatabase.transaction。旧提案的单条 LEFT JOIN SELECT 可保留，需保持未知 job 拒绝、存在但无事件、after 高于末尾、稳定顺序和原 cursor；不加 limit，也不把事件过滤移到 WHERE。schema baseline 建立与业务初始化继续分开，query 不写业务 defaults。

## handoff 的最小验证要求

此报告没有执行这些验证；下一片在 accepted spec 中吸收对应要求即可，不建立第二份需求书。

1. 两项目交错读写、伪造/缺失/错安装 scope、query 写、WITH 写与过期 tx 均真正拒绝；其它项目和原记录不变。
2. 有额外 collect/generate 权限的继续成功；撤去该类别权限、仅有另一类别权限、正常响应后后台、任务在队列等待期间撤权分别走真实 Kernel/background 路径。
3. 前台或后台忽略 abort 的 Promise 尚未退出时，删除/close 不关库不 purge；释放后才完成，B 仍可用。
4. 同 id 重建时旧调用尚未首次触库也不能写进新分区；清理成功后的新合法动作可正常使用。
5. reader/writer/search/stop/purge 各一次失败后，从真实公共关闭/删除入口再次清理；不丢 owner、不双开、不重复关已成功的连接，覆盖 Home close 与删除交错。
6. 实际迁移后的组合事务失败整体回滚，readEvents 仍只需读权限；不使用第二套测试数据库实现证明。

建议交接时把本报告作为下一片前置证据，当前 ALC-LIFE/ALC-RES 按其已有范围收尾。无需为迁移提前加入新代码，也无需重新询问已经确定的恢复与预算政策。
