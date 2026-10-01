# 保持数据与行为的性能修复方案

状态：实施中。用户已授权开工；先在隔离工作树串行实施和验证，本文件是唯一需求书，不表示已安装。依据当前仓库 `62cbc14d` 与 [性能审计报告](/Users/yijunwang/code/goalboard/docs/reviews/performance-audit-2026-10-01.md)。实施前重新核对基线与其他会话的修改。

目标完成程度为“内部完整”：六项已识别开销得到处理，桌面真实关键路径、既有数据、异常恢复和代码回退均有证据。工程测试、隔离桌面实操、用户本人验收分别记录；当前均未进行修复后的验收。此前“管理项目”卡死的现场根因仍未确认，性能修复不能直接等同于现场故障已解决。

## 无损的具体含义

1. **数据保留。** 项目/board 身份、Goals 与事件历史、插件安装与授权、工作目录关联、附件及 Artifact 精确版本、Coding Session/Run/Pending/Effect 和宿主启动索引全部沿用原记录，不裁剪、不重建、不换引用。本方案不升级业务数据库或 SDK 存储格式，不更换凭据后端。
2. **执行保留。** UI 隐藏、关闭或读请求取消，不停止服务端任务。运行、等待输入、待审、停止与结果未知的状态保留原含义；不自动重跑模型、命令、文件导入或任何未知结果的操作。授权撤销后不能提交迟到结果；一个 Home 仍只有一个执行 owner。
3. **界面保留。** 已有草稿、未提交审查意见、材料选择、当前会话、分屏/标签、滚动和焦点按原协议保存。首次加载方式可以改变，功能入口、深链接、键盘路径、中英文与现有视觉不被削减。已打开界面不因性能优化被主动销毁。
4. **回退保留。** 每步独立提交、独立验证；失败时只退该步代码，保留当前数据。旧 Home 备份不用于普通代码回退，防止覆盖修复后的新内容；数据恢复只处理有证据的存储故障，另行核对备份后的新增记录和外部副作用。

非目标：不重做项目管理页，不清理用户历史或缓存中的业务内容，不减少已有分屏缓存数量，不关闭插件/后台任务，不缩短所有 SQLite 锁等待，不降低 FULL/WAL/外键或安全检查，不引入新的业务状态库。其他会话的首页设计稿不纳入本任务。

## 实施顺序与范围

串行完成下列步骤；每一步达到自己的无损门槛再进入下一步。首批 1–4 消除同步阻塞与重复工作；后批 5–6 处理恢复和加载方式。这里的顺序用于控制影响面，不是新增用户审批流程。

| 步骤 | 解决问题 | 具体方案 | 关键保留项 |
| --- | --- | --- | --- |
| 1 | 目录访问争写锁、健康检查随之阻塞 | 初始化/迁移与普通访问分离；Web Host 在固定 Home 内复用目录连接；健康检查脱离目录数据库访问 | 当前授权、schema/owner 校验、真实写事务、跨连接可见性与关闭语义 |
| 2 | 原生命令等待进程/文件/网络 | 阻塞工作转至工作线程，Tauri command 异步返回 | 命令名、参数/结果、批次顺序、原超时/错误与准入规则 |
| 3 | 隐藏 pane 继续全局轮询 | 全局刷新接入已有 UI Host 可见性生命周期 | 可见即补读、交互延迟刷新、后台任务继续执行 |
| 4 | 静态资源 304 仍重复生成与读取 | 在资源装配实例内缓存 body 与 ETag | URL、内容、GET/HEAD、响应头、locale 隔离 |
| 5 | Coding 查询状态恢复全部历史 | 用原 owner 的索引及 SDK 读取口投影状态，详情仍沿原恢复路径 | 项目/安装身份、recovery、checkpoint、计划步骤、旧运行不可重派 |
| 6 | 首页及每个分屏加载整套插件 | 按登记的 UI contribution 延迟挂载与加载，pane 只初始化所需内容 | 草稿/界面实例、资产顺序、依赖、搜索与跨插件入口 |

### 1. 目录与健康检查

**初始化只发生在需要时。** 打开目录首先按原 owner 和 schema 规则判定：未知库和未来版本继续明确拒绝，旧版本走原原子迁移，只有新库/实际迁移取得初始化写事务。当前版本的正常访问不进入 `BEGIN IMMEDIATE`。已有 `ContextLedgerRepository` 和 `ModelProviderStore` 构造器会执行建表语句，需同时把 schema 准备与实例装配分开；不能只删外层事务而让普通读路径继续执行 DDL。其他调用方需要的默认初始化行为保留。

**连接由明确的 Host 拥有。** Web Server 每个固定 Home 的装配实例持有目录连接，首次准备合并并发打开；查询仍走原 Projects/Context owner，每次读取当前提交的事实，不增加项目列表或授权的 TTL 缓存。不能把连接放在跨 Home 的全局变量中。公开的一次性 `withMolisWorkProjectCatalog` 仍保留操作结束即关闭的合同；Web 的内部借用路径不能关闭 Host 持有的连接。停机先禁止新借用、等已有操作结束，再关闭连接；启动失败释放失败实例，下次允许正常重新准备。

**健康检查反映进程状态。** `/health` 在原 loopback/origin 等请求校验之后处理，返回进程标识、desktop_tui 等现有字段，避免为探活打开目录、初始化项目或 Runtime。`project_count` 在原目录初始化成功及目录变更通知后更新；它只是诊断值，不用于权限或路由。启动未就绪/关闭中不能冒充 ready。原生连接监控不把一次恢复延迟当作数据损坏，也不为健康检查重新启动业务执行。

**写入边界单独验证。** 保留事务、提交顺序和幂等回执，不对整个 async 业务动作重试。本步首先解决普通读抢写锁；并发真实写操作也要注入锁竞争检查。如果真实写等待仍阻塞 HTTP 事件循环，继续在原 owner 的提交边界处理获取锁：只在副作用尚未派出、原事务未提交且 owner 确认可重试时异步等待；已派出或未知结果保留原恢复语义。不得靠调小全局 busy_timeout、丢写入或伪报成功通过验收。具体写边界在实施第 1 步中确定，不把“普通读已恢复”当成全部阻塞已消除。

主要边界：[catalog](/Users/yijunwang/code/goalboard/apps/local-host/src/project-catalog.ts)、[migrations](/Users/yijunwang/code/goalboard/apps/local-host/src/catalog-migrations.ts)、[Web 装配](/Users/yijunwang/code/goalboard/apps/local-host/src/web-server.ts)、[桌面目录适配](/Users/yijunwang/code/goalboard/apps/desktop/src/project-catalog.ts)、[ContextLedger](/Users/yijunwang/code/goalboard/modules/context-ledger/src/repository.ts)。必要时改公开构造选项及对应 README，不深入导入其他 owner 的实现。

### 2. 原生命令

`shelf_find_files`、`shelf_admit_paths`、`shelf_open_path` 使用 async command，阻塞部分交给 `spawn_blocking` 或已有工作线程设施。只将必须操作 AppKit 的 UI 段留在主线程，不在异步 executor 里直接做同步 IO。文件批次仍按原顺序逐项执行，不改成并发导入；结果、原权限/路径准入、已成功项与失败语义保持一致。

第一步保留原命令合同和 IO 时限，只改变执行线程。线程异常不能报告成功；窗口离开不代表导入被撤销；连接超时不能自动重新提交。Spotlight 的进程截止时间和真正的取消能力只有在错误语义明确后再接入，不能把超时当作“没有文件”，或承诺已提交导入能够无副作用撤销。

边界：[Tauri command](/Users/yijunwang/code/goalboard/apps/desktop/adapters/tauri/src/main.rs)、[Shelf HTTP](/Users/yijunwang/code/goalboard/apps/desktop/adapters/tauri/src/shelf_http.rs)。原后台轮盘/剪贴板路径不重复改造。

### 3. 隐藏轮询

Workbench 页面创建一个 Host 生命周期 scope，将 `refreshBoard` 的定时读取归入可见性生命周期。复用已经检查当前文档、同源父 frame 和祖先 `hidden` 的实现，不新增另一套可见性判断。隐藏/卸载取消 GET 与定时器，读取完成后核对 signal 和当前页面身份，禁止迟到响应覆盖新项目、pane 或选择。

恢复可见立即检查游标；输入、搜索、拖动等原 deferred refresh 规则继续生效，忙时保留尚未消费的变化。写请求沿用原挂载/业务生命周期，不能因隐藏页面取消服务端执行。本轮先修缺失的可见性判断；跨 pane 游标去重留待实测仍有必要时，避免额外引入消息总线。

边界：[全局刷新](/Users/yijunwang/code/goalboard/apps/workbench/src/scripts/client/refresh-decisions.ts)、[初始化](/Users/yijunwang/code/goalboard/apps/workbench/src/scripts/client/initialization.ts)、[已有 UI 生命周期](/Users/yijunwang/code/goalboard/packages/ui-host/src/client-lifecycle.ts)。保留原分屏 frame 数量、恢复和持久化逻辑。

### 4. 静态资源

按实际资源内容的变体，在 `createLocalWebAssets` 所属实例内缓存生成结果和 ETag；每个资源/locale 变体首次成功读取后复用，失败不缓存为永久缺失。先验证 renderer 是否依赖 locale 或配置，不能仅按 pathname 缓存而串中英文。动态安装插件页面、项目事实、凭据或授权结果不进入此缓存。

第一步保持现有 URL 和 cache-control，内容及 ETag 算法不变，GET/HEAD 与 304 语义不变。进程重启加载新构建；生产资源视为该构建固定资产，开发资源若支持热更新，则按原热更新规则失效。暂不引入长期 HTTP 缓存或版本化 URL，避免扩大升级兼容面。

边界：[web-assets](/Users/yijunwang/code/goalboard/apps/local-host/src/web-assets.ts)。

### 5. Coding 状态与详情分离

优先使用现有加密宿主启动索引和 SDK 的公开 `terminalRuns`、`listOpenWork`、进度/回放读取口；不新建会话事实库、不更换 SDK。内部 Runtime port 增加可选轻量状态读取：热会话直接投影当前内存状态；冷会话读取索引和运行时事实，只读取证明最新轮 phase 所需的事件，按索引定位最近计划轮读取 step board，避免恢复所有历史正文。

保留原检查：owner/项目/插件安装归属，未保存完整 Run 引用、缺少启动索引、未结束工作不可读、子任务结果未知、Pending、checkpoint/rewind 和恢复门槛。不能用“terminal”简单等同“completed”，也不能跳过原 checkpoint 的恢复核对。必要恢复核对与正文回放分开；无法证明轻量读取与当前语义等价时，保持原路径并明确错误或回退，不把未知结果当正常完成。

对外 `AgentSessionStatus` 及授权入口保持兼容；不支持新内部读取口的 Adapter 沿用原合同。具体会话、历史轮次和新一轮执行仍按原路径加载、复核授权与恢复门槛。读取状态不制造历史控制句柄，不触发模型或重派 Effect。初期不增加后台预恢复和自动内存淘汰，避免正在运行的会话被误释放。

依赖第 1 步的目录/授权读取稳定性。边界：[Adapter](/Users/yijunwang/code/goalboard/horizontal/agent-host/src/adapters/prologue.ts)、[SDK 装配](/Users/yijunwang/code/goalboard/horizontal/agent-host/src/adapters/prologue-node.ts)、[状态身份校验](/Users/yijunwang/code/goalboard/horizontal/agent-host/src/capability-registration.ts)。Coding 插件仍通过公开 Host 能力读取，不直接访问 SDK 或其他插件 Store。

### 6. 按需界面与分屏加载

先完成 Pages editor 的首次使用加载，再覆盖插件 surface 和 client；只初始化真实打开的插件。资源和 UI 仍从已有注册目录、Manifest/contribution 派生，补齐依赖时写在原 owner 的登记处，不新增 Host 插件名单。分屏沿用现有 `workbenchPane` / `panePlugin` 与父子消息合同，只渲染/初始化该 pane 必需的内容，不启动第二个整套工作台。

未打开插件不创建真实 surface DOM 或 client；首次打开等待必要资源和依赖就绪再挂载，同一 surface 去重。已打开 surface 留存原实例，隐藏时暂停 UI 订阅；不删草稿或通过减少缓存 frame 数量提速。已有设置、审查、材料、伴随视图与跨插件依赖可以共享通用 shell；错误时保留当前内容、提示加载失败，重试只加载 UI 资源，不能重放业务命令。

CSS 公共/全局规则保留在 shell，只延迟具有明确 surface 作用域的规则；按现有 asset order 插入，不能按网络返回先后改变层叠。HTML/client/资源必须来自同一构建，检查现有 CSP 和声明边界。全局搜索、设置直达、插件深链接、拖拽分屏、伴随 Files/Git/Diff 等不能依赖未创建的隐藏 DOM；需要数据的入口走原公开查询，而不是为搜索重新提前挂载所有插件。

依赖第 3、4 步；不依赖第 5 步，但仍串行实施。边界：[页面 renderer](/Users/yijunwang/code/goalboard/apps/workbench/src/goals-page-renderer.ts)、[插件资源投影](/Users/yijunwang/code/goalboard/apps/workbench/src/plugin-workbench.ts)、[tab workspace](/Users/yijunwang/code/goalboard/apps/workbench/src/scripts/client/tab-workspace.ts)、原插件 UI 贡献及公开 factory。涉及插件实现时按原插件开发规则补必要依赖声明与测试，不夹带设计重做。

## 验收：正确性先于提速

性能数据在同机器、同构建模式、同 fixture 下与基线比较，冷启动与 warm 分开记录；时间阈值是待实施验证的目标，不是当前结果。功能断言先独立通过，不能为了满足时间阈值放宽语义。

| 验收对象 | 必须证明的无损结果 | 性能目标或机制证据 |
| --- | --- | --- |
| 目录/健康 | 新建、改名、插件撤权、项目删除与工作目录关联仍正确；另一连接提交后下一次读取可见；新/旧/未来/未知 schema、两个 Home、启动失败与关闭仍正确 | 再持有目录写锁 1.25 秒，warm 导航目标 <300 ms、health p95 <200 ms，20 ms 定时器最大间隔目标 <100 ms；另覆盖真实写等待，不触发误恢复 |
| 原生命令 | 逐文件导入成功/中途失败、超时未知、重复点击、读路径权限与结果保持原语义，无自动重试 | 隔离原生包连接延迟 2 秒的测试后端时，窗口仍接受点击/键盘操作；阻塞工作不在原生 IPC 主线程执行 |
| 隐藏 pane | 已发出读取消后没有迟到覆盖；隐藏不停止任务；恢复可见能读取隐藏期间更新；草稿/审查/选择仍在 | 在途请求结束/取消后，隐藏 pane 的全局 cursor 定时请求为 0；显示后即时补读 |
| 静态资源 | 内容与旧生成器一致；中英文、缺失资产、重启新构建、GET/HEAD/304 正确；缓存不含业务事实 | 每个成功资源变体只生成/读盘/计算 ETag 一次，后续条件请求不重复此工作 |
| Coding 状态 | 空会话、已完成、失败、停止、等待输入、待审、未知结果、子任务和 checkpoint 状态与原路径一致；历史全文及时间/用量/版本仍可读 | 合成大历史与真实 SDK 落盘 fixture 均证明查询状态不回放所有旧轮；仅增加旧历史时，正文回放和 heap 不随旧轮总量增长 |
| 按需 UI | 首次/再次打开、草稿、分屏切换和返回、隐藏恢复、编辑器、搜索、设置、伴随视图、深链接、键盘、窄屏与中英文通过 | 同一全插件首页的真实 surface DOM 与初载资源明显下降；未打开插件 client 不执行；每个新 pane 不再构造整套 surface pool |
| 数据与回退 | 普通读取不改写业务事实；只允许与基线一致的既有恢复状态更新；真实写入的输入、返回、持久化和后续读取一致；退回前一版代码后仍读到升级期间新增记录 | Home 恢复演练、SQLite integrity/foreign-key 检查、项目/附件/历史正文与引用核对；不只比较记录数或 JSON 可解析 |

测试使用独立 Home、真实 Server/SQLite/生产 Adapter、真实 Chrome 与隔离原生包。状态 fixture 可模拟模型事件，但必须用真实 SDK 的落盘/恢复路径证明索引和恢复语义；不得把假 Runtime 的结果当作最终桌面验收。故障注入覆盖真实锁交错、晚返回、取消/撤权、部分成功和进程重启。测试 Home 的绝对路径和 Catalog 指向必须都在隔离目录中，防止复制记录后意外读写真实 Home。

## 验证命令与交付证据

实施前将审计探针转成能发现原问题的定向回归；原探针在 `/private/tmp/molis-project-management-freeze/.impeccable/qa/performance-audit/`，只作为已有诊断证据，不替代新行为测试。每个改过的包保留 README 指定的必跑检查。源码变更后先 `pnpm build`，构建与完整回归不并发，运行时不再修改源码。

```sh
pnpm build
pnpm boundary:check
node scripts/run-tests.mjs tests/project-catalog.test.ts tests/web.test.ts tests/web-home-isolation.test.ts tests/local-host.test.ts tests/local-host-actions.test.ts tests/action-before-effect.test.ts tests/action-model-scheduling.test.ts tests/action-read-compatibility.test.ts tests/installer-symlink-dependencies.test.ts tests/system-search-host.test.ts
node scripts/run-tests.mjs tests/desktop-shell-bootstrap.test.ts tests/desktop-tui.test.ts tests/action-mcp-stdio.test.ts tests/shelf-actions.test.ts tests/shelf-project-results-http.test.ts
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
node scripts/run-tests.mjs tests/plugin-declarative-mounting.test.ts tests/builtin-plugin-agent-texts.test.ts tests/builtin-manifests-contract.test.ts tests/builtin-plugin-composition.test.ts tests/workbench-ui-platform.test.ts tests/i18n.test.ts tests/client-script-undeclared.test.ts tests/workbench-tab-workspace.e2e.test.ts tests/ui-client-lifecycle.e2e.test.ts tests/workbench-pane-feed.e2e.test.ts tests/workbench-frame-container.e2e.test.ts tests/coding-workbench.e2e.test.ts
node scripts/run-tests.mjs tests/agent-host.test.ts tests/agent-host-wiring.test.ts tests/prologue-recovery.test.ts tests/prologue-checkpoints.test.ts tests/prologue-stop-review.test.ts tests/prologue-approval-bridge.test.ts tests/prologue-step-amend.test.ts tests/coding-session-recovery.test.ts tests/coding-session-follow.test.ts tests/home-backup-recovery.test.ts
```

以上是已存在的重点测试。若修改 ContextLedger、Projects、Storage、UI Host 或具体插件，补对应 README 的必跑集合；新增回归的文件名在实施时记录到此处，不把尚未创建的命令写成已可用。最终还要做隔离安装包的真实桌面操作，不能只依赖 Chrome 或 Rust 单元测试。

逐步记录实际 diff、通过/失败/未运行的验收项及原因，保存相关 trace、请求统计和内存/时延对比；不新建状态 manifest、锁系统或第二份项目进度账。首次正常导航、后台执行期间导航、历史较多的 Coding 返回、慢导入期间窗口操作都要覆盖。此前真实卡死若仍能复现，保留现场采样继续定位，不能在性能数值下降后直接关闭原故障。

## 数据保护、安装与回退

开发复用已有隔离工作树或新建明确基线的工作树；不在正在使用真实 Home 的主检出里改源码，不碰别的会话未提交内容。六步代码变更各自可回退；无数据格式迁移，所以回退代码不需要回滚数据库。静态资源、连接与 UI 缓存随原生命周期释放，不持久化新的业务事实。

替换真实应用/服务之前，等后台任务自然结束或按原流程正常退出，再做完整 Home 的一致性备份；不要为备份硬杀任务。现有备份回归验证的是所有 writer 关闭后的离线复制，并保留原绝对 Home 路径，不是已实现的在线全 Home 快照。备份覆盖目录、项目库、附件/Blob、SDK 和宿主加密索引及原加密凭据文件；不把密钥解密成日志或普通报告，不修改钥匙串。运行中的 SQLite 不能只复制 `.db` 而忽略 WAL。无法形成一致性备份时，继续隔离验证，暂不替换真实应用。

先在可丢弃的测试 Home 原绝对路径做恢复与代码回退演练，确认可读正文、精确引用和新增记录保留，再进入真实使用。真实安装/服务切换及任何数据恢复按当时已有用户授权执行；本轮不进行这些动作，不推送、不发布。

## 假设和待实施核实项

- “无损”包含数据、权限、执行和用户未提交状态，而不只是记录数量。保留现有合法失败与恢复语义；不给未知状态制造成功。
- 目录复用不缓存权限，但需要验证 async 操作交错、外部连接变更和停机次序。真实写等待的具体 owner 边界在第 1 步故障注入中确定；若必要方案扩到全库 IO 架构或 schema 变更，先更新此 spec 并说明范围变化。
- 当前 SDK 没有直接可用的完整 `AgentSessionStatus` 接口，但已有宿主索引及公开事实读取口。第 5 步必须先证明轻量投影可以保留恢复门槛；无法证明时保留原路径，不能省略检查。
- 插件延迟挂载涉及已有初始化假设、CSS 全局规则及跨插件依赖。第 6 步先做 Pages/Coding/伴随视图的真实行为切片，再扩至其余登记插件；完整交付仍覆盖全部现有功能入口，不能把切片通过当成六项已完成。
- 原生慢 IO 导致窗口冻结目前是代码风险，尚未实测；原始“管理项目”现场也仍未捕获。方案验收需要补对应证据。
