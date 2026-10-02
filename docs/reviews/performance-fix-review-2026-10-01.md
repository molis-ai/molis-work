# 性能修复复查（2026-10-01）

复查结论：确认 2 个 P1、3 个 P2，复查当时不能按“无损完成”交付。新增回归涉及并发恢复、连接生命周期和启动恢复；示例项目重置是旧版已有但本轮遗漏的故障，按需界面缺少资源挂起后的恢复。此前工程回归通过的记录仍有效，但没有覆盖这些路径。

当前状态：用户授权后，五项问题及首次目录初始化竞态已修正，PR 验证追加发现的热状态采样问题也已修正，Cognia 按需加载断言已同步；定向及相关模块回归通过。下面保留修正前的触发条件与旧版对照，修正结果见末节。全量非 E2E 未完成、整体原生桌面输入验收仍缺证据，不宣称原始卡死已取得现场根因。

范围：复查 `62cbc14d..a6b1b29b` 的六项性能修复及相关调用链，在 `/private/tmp/molis-project-management-freeze` 执行隔离复现，并与干净的 `62cbc14d` 已构建产物对照。复查阶段未修改生产源码；PR 追加修正后来恢复到 `/Users/yijunwang/code/molis-work-performance-pr` 隔离工作树，未替换真实应用、服务或 Home。以下旧路径和位置记录复查当时的触发点；需求与验收以 [spec](../../specs/performance-preserving-fixes/spec.md) 为准。

## P1：并发恢复会删除已登记的新项目数据库（新增回归）

位置：[managed-project-files.ts:64](/private/tmp/molis-project-management-freeze/apps/local-host/src/managed-project-files.ts:64)。

同一个 `project-onboarding-*` 标识由两个 Catalog 连接恢复：A 已把暂存目录升为正式目录，异步等待提交；B 发现该数据库并按崩溃恢复路径登记成功；A 随后登记遇到唯一约束失败，catch 无条件删除已提升的目录。结果是目录库仍有正式项目记录，但对应数据库已经被 A 删除。同进程 onboarding 的任务 Map 能合并其入口请求，但不能保护 Catalog 的跨连接/进程恢复边界。

用两个真实 Catalog、真实 SQLite 写锁及生产创建/补偿路径复现，未替换提交函数：A 报 `UNIQUE constraint failed: projects.database_path`，B 成功，`catalog_registered=true`、`database_survives=false`。另用可控异步提交交错对照旧版：旧版记录和数据库均保留，新版复现误删。

修正方向：在提交边界重新核对正式记录，使恢复请求收敛到已登记项目；失败清理只处理仍由本次请求拥有、尚未被成功采用的资源。验收必须检查最终数据库及已有正文仍可读取，不能只检查失败响应。

证据：`/tmp/molis-performance-review-catalog-real-lock.log`、`/tmp/molis-performance-review-catalog-new.log`、`/tmp/molis-performance-review-catalog-baseline.log`。

## P1：示例重置超时后原库和新库都被删除（原有遗漏）

位置：[demo-project-lifecycle.ts:86](/private/tmp/molis-project-management-freeze/apps/local-host/src/demo-project-lifecycle.ts:86)。

重置先备份旧目录、提升新目录，却在目录提交和后续初始化成功之前删除备份。提交等锁超时后，catch 删除新目录，再尝试恢复已被删除的备份，并吞掉恢复失败。正式记录仍在，示例项目的数据库消失。这里影响的是 `regenerable_demo`，不能据此宣称普通用户项目重置也受影响。

实际创建示例项目后让另一 SQLite 连接持有写锁，按生产路径重置。为缩短探针时间，仅测试连接使用 60 ms 锁期限；新版与旧版均返回 `database is locked`，且 `catalog_registered=true`、`database_survives=false`。

修正方向：保留备份到所有会影响本次重置成败的步骤完成；失败时恢复旧目录。成功后的备份清理失败也不能进入删除正式目录的补偿路径。补充等锁超时及后续初始化失败的恢复回归。

证据：`/tmp/molis-performance-review-catalog-new.log`、`/tmp/molis-performance-review-catalog-baseline.log`。

## P2：复用外部 Host 重建 Web Server 后规划保存失效（新增回归）

位置：[web-server.ts:87](/private/tmp/molis-project-management-freeze/apps/local-host/src/web-server.ts:87)、[关闭路径:276](/private/tmp/molis-project-management-freeze/apps/local-host/src/web-server.ts:276)，以及 [personal-planning-actions.ts:24](/private/tmp/molis-project-management-freeze/apps/local-host/src/personal-planning-actions.ts:24)。

Server 把本实例的 Catalog runner 注入借用的 LocalHost。Server 关闭时保留外部 Host，却关闭 runner；个人规划的 `configure` 使用 `??=`，下一台 Server 注入新 runner 后，保存处理器仍引用已关闭的旧实例。

复用同一真实 LocalHost，首次启动→保存方法→关闭 Server→启动新 Server→再次保存。新版报 `Web catalog is closing`，旧版保存成功。这是同进程复用 Host 的装配合同，不能直接泛化为所有进程重启都会失败。

修正方向：对齐 Host 与 Catalog 的所有权和释放时机，或允许处理器安全重绑定有效 runner；同时核对其他由外部 Host 保留的消费者。回归要通过真实公开动作执行重建后的写入。

证据：`/tmp/molis-performance-review-shared-host.log`、`/tmp/molis-performance-review-shared-host-baseline.log`。

## P2：首次目录初始化失败后只探活无法恢复就绪（新增回归）

位置：[一次 warm:278](/private/tmp/molis-project-management-freeze/apps/local-host/src/web-server.ts:278)、[health:170](/private/tmp/molis-project-management-freeze/apps/local-host/src/web-server.ts:170)、[失败释放:17](/private/tmp/molis-project-management-freeze/apps/local-host/src/web-catalog-access.ts:17)。

启动只发起一次 warm。可重试的锁超时会清空 opening，但没有再准备的触发器；新 `/health` 只读 ready。因此锁已释放、目录可以正常打开后，持续探活仍返回 `503 starting`，直到普通页面访问再次调用 withCatalog。原生启动等待只读 health，8 秒后会停止自有子进程；启动误报是这段消费代码带来的推断，本轮没有启动真实原生窗口验证。

在有效的 schema-18 测试目录上，外部进程持有真实 SQLite 写锁 6.5 秒，超过原 5 秒获取锁期限。释放后新版三次探活均为 `503 starting`；请求首页后恢复 `200 ok`。同脚本在旧版释放锁后三次探活均为 `200 ok`。生产超时设置未改动。

修正方向：让启动准备对暂时失败有独立、受生命周期约束的恢复机会，保持 health 脱离业务数据库；未知/未来 schema 等确定性拒绝仍须明确失败。补充锁释放后的自动就绪及关服期间不重新准备的回归。

证据：`/tmp/molis-performance-review-health-recovery.log`、`/tmp/molis-performance-review-health-recovery-baseline.log`。

## P2：插件资源一直不返回时界面无法退出等待或重试（新增遗漏）

位置：[deferred-plugin-client.ts:10](/private/tmp/molis-project-management-freeze/apps/workbench/src/scripts/client/deferred-plugin-client.ts:10)。

资源 Promise 仅由 onload/onerror 完成。请求挂起时，surface 持续 inert/loading，重试按钮只有 Promise 拒绝后才出现；重新进入同一 surface 仍复用未完成的挂载 Promise。其他导航可继续，不是整台应用的线程卡死。

在真实 Chrome 中拦住 Pages client 的资源请求，3.5 秒后仍为 `{state:loading,inert:true,retry:false,busy:true}`。生产代码没有任何有界等待或取消出口，所以该探针证明挂起路径缺少恢复；不把 3.5 秒当作预先约定的加载 SLA。

修正方向：资源等待超时后释放 UI 等待状态并提供资源重试；防止原请求晚到与重试重复挂载。只重试 UI 资源，不重派业务动作。原有“立即失败→重试成功”的浏览器测试不能覆盖此场景。

证据：`/tmp/molis-performance-review-lazy-timeout.log`（1 通过、0 跳过，测试断言故障状态可复现）。

## 验证材料与未完成项

隔离探针保留在 `.impeccable/qa/performance-audit/review/`，不属于产品资源或持久业务状态。以上命令记录修正前的复现入口，其故障状态断言不会在修正后继续通过。正式修正回归位于 tests，验证的是正确恢复与后续行为，见下节。

可复现命令，在本工作树执行：

```sh
NODE_ENV=test MOLIS_WORK_SECRET_BACKEND=file node .impeccable/qa/performance-audit/review/catalog-real-lock.mjs
NODE_ENV=test MOLIS_WORK_SECRET_BACKEND=file node .impeccable/qa/performance-audit/review/catalog-races.mjs
NODE_ENV=test MOLIS_WORK_SECRET_BACKEND=file node --input-type=module < .impeccable/qa/performance-audit/review/shared-host.mjs
NODE_ENV=test MOLIS_WORK_SECRET_BACKEND=file node --input-type=module < .impeccable/qa/performance-audit/review/health-recovery.mjs
NODE_ENV=test MOLIS_WORK_SECRET_BACKEND=file node --import tsx --test .impeccable/qa/performance-audit/review/lazy-timeout.test.ts
```

旧版对照使用原有干净的 `62cbc14d` 工作树，只执行 Node；三个跨版本脚本经 stdin 运行，使包与 dist 按旧版 cwd 解析，没有重建或修改旧版工作树。

仍未满足的原验收：原生窗口中慢 IO 时的实际指针/键盘操作、用户原始 Coding→管理项目卡死现场，以及真实 SDK 大量历史状态读取的性能实测。原有真实 SDK 恢复测试和合成历史性能探针只支持各自覆盖的结论，不能替代这三项。原有 Characters 的真实浏览器回归已经在 Agent 测试集合执行，不列为遗漏。

## 用户授权后的修正结果

| 问题 | 实现与证明 | 提交 |
| --- | --- | --- |
| 并发恢复误删 | 独立暂存、保留已提升的稳定身份数据库、提交内重新读取正式记录；真实锁交错和同时准备均返回同一身份，正文保留、创建事件一次；超时后可恢复 | `334a2417` |
| 示例重置丢库 | 所有初始化与最终事务成功后才清理备份；失败恢复旧正文与目录、插件状态；成功清理失败时新旧库仍保留 | `334a2417` |
| 外部 Host 连接失效 | 连接归借用 Host，Web 关闭/重建仍可保存，最终 Host 关闭释放；处理器可重绑定同 Home 的新有效 runner | `54eaa55d` |
| 初始化后持续未就绪 | 仅暂时锁失败后台重新准备，health 无需业务访问即可恢复；确定性拒绝与关闭不重试，失败业务回调零次重派 | `55ebd13b` |
| 资源挂起 | 10 秒超时解除等待、提供原重试入口；真实 Chrome 释放原请求和重试请求后只挂载一次，原根及最后选择保留 | `05c8b855` |

新增并发用例还暴露旧版首次 Catalog 初始化的 `table catalog_meta already exists`：多个连接先读到不存在，后来者未重读便重复初始化。已在取得初始化写事务后核对真实表、owner 与 schema，合法目录复用，未知/未来目录拒绝。保留原并发用例，修正后通过；没有新增锁系统或业务数据库格式。

修正阶段整体构建、依赖边界检查通过；目录/恢复 28、Host/权限/备份/Home 隔离 53、Workbench 30、规划重绑定 4 项均通过、零失败/跳过。这些集合有重叠，不累加为唯一用例总数。资源挂起与迟到响应、普通 Web 和 desktop=1 的 Coding→管理项目→搜索→返回真实 Chrome 路径也通过。各命令及有效证据边界记录在 [spec 的实施结果](../../specs/performance-preserving-fixes/spec.md#已完成结果与证据)。已提交 [PR #150](https://github.com/molis-ai/molis-work/pull/150)，未安装或发布。

PR 追加验证发现热状态在步骤图异步读取前采样 phase，会将期间已经结束的执行仍报为 running；受控用例在干净基线返回 completed、旧 PR 返回 running。已恢复在返回时读取热状态，冷投影仍保留原 owner/recovery 检查。Cognia 原 shell 全量加载断言改为检查按需资源入口与真实客户端 API，原领域界面断言保留。追加整体构建、边界检查通过；定向 25 项、Agent/Prologue 385 项通过（原条件用例 2 项跳过），真实 Chrome 5 项通过。首轮全量在发现失败后中止，修正后未完整重跑，不能称全量通过；命令、日志及限制见 [PR 验证补充](../../specs/performance-preserving-fixes/spec.md#pr-提交后的验证补充2026-10-01)。
