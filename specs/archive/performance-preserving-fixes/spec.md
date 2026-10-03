# 保持数据与行为的性能修复方案

> 归档（2026-10-02）：判定为**部分实现**。六项开销修复随 [#150](https://github.com/molis-ai/molis-work/pull/150) 合入 main（b5f6ddec）；合入后全量回归见 [合入后审查 §6.1](../post-merge-review/spec.md#61-修复合入后的最终回归2026-10-02)，其中 #150 引入的 Shelf 终端回归，修复见该节。完整视觉走查与原生窗口输入验收没有做。剩余事项已移到统一待办清单：BL-109。

状态：五项复查缺陷、首次目录初始化竞态及 PR 验证追加发现的热状态采样问题已修正，Cognia 按需加载断言已同步，已提交 [PR #150](https://github.com/molis-ai/molis-work/pull/150)。合入 main `597d15d2` 并追加修正后，整体构建、依赖边界、定向 25 项、Agent/Prologue 必跑集合及真实浏览器 5 项通过。全量非 E2E、完整视觉走查和原生窗口输入验收尚未完成，原始卡死现场仍未复现，整体“内部完整”门槛继续单列。本文件是唯一需求书；改动位于隔离工作树，未替换真实应用或 Home，未发布。依据起始仓库 `62cbc14d` 与 性能审计报告（`/Users/yijunwang/code/goalboard/docs/reviews/performance-audit-2026-10-01.md`）。

目标完成程度为“内部完整”：六项已识别开销得到处理，桌面真实关键路径、既有数据、异常恢复和代码回退均须有证据。工程测试、隔离桌面实操、用户本人验收分别记录；已覆盖的工程及隔离浏览器路径通过，复查发现的失败场景已补有效回归，隔离原生 IPC 实操通过，原生窗口按钮/键盘实操与用户本人验收仍未完成。此前“管理项目”卡死的现场根因仍未确认，性能修复不能直接等同于现场故障已解决。

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

主要边界：[catalog](../../../apps/local-host/src/project-catalog.ts)、[migrations](../../../apps/local-host/src/catalog-migrations.ts)、[Web 装配](../../../apps/local-host/src/web-server.ts)、[桌面目录适配](../../../apps/desktop/src/project-catalog.ts)、[ContextLedger](../../../modules/context-ledger/src/repository.ts)。必要时改公开构造选项及对应 README，不深入导入其他 owner 的实现。

### 2. 原生命令

`shelf_find_files`、`shelf_admit_paths`、`shelf_open_path` 使用 async command，阻塞部分交给 `spawn_blocking` 或已有工作线程设施。只将必须操作 AppKit 的 UI 段留在主线程，不在异步 executor 里直接做同步 IO。文件批次仍按原顺序逐项执行，不改成并发导入；结果、原权限/路径准入、已成功项与失败语义保持一致。

第一步保留原命令合同和 IO 时限，只改变执行线程。线程异常不能报告成功；窗口离开不代表导入被撤销；连接超时不能自动重新提交。Spotlight 的进程截止时间和真正的取消能力只有在错误语义明确后再接入，不能把超时当作“没有文件”，或承诺已提交导入能够无副作用撤销。

边界：[Tauri command](../../../apps/desktop/adapters/tauri/src/main.rs)、[Shelf HTTP](../../../apps/desktop/adapters/tauri/src/shelf_http.rs)。原后台轮盘/剪贴板路径不重复改造。

### 3. 隐藏轮询

Workbench 页面创建一个 Host 生命周期 scope，将 `refreshBoard` 的定时读取归入可见性生命周期。复用已经检查当前文档、同源父 frame 和祖先 `hidden` 的实现，不新增另一套可见性判断。隐藏/卸载取消 GET 与定时器，读取完成后核对 signal 和当前页面身份，禁止迟到响应覆盖新项目、pane 或选择。

恢复可见立即检查游标；输入、搜索、拖动等原 deferred refresh 规则继续生效，忙时保留尚未消费的变化。写请求沿用原挂载/业务生命周期，不能因隐藏页面取消服务端执行。本轮先修缺失的可见性判断；跨 pane 游标去重留待实测仍有必要时，避免额外引入消息总线。

边界：[全局刷新](../../../apps/workbench/src/scripts/client/refresh-decisions.ts)、[初始化](../../../apps/workbench/src/scripts/client/initialization.ts)、[已有 UI 生命周期](../../../packages/ui-host/src/client-lifecycle.ts)。保留原分屏 frame 数量、恢复和持久化逻辑。

### 4. 静态资源

按实际资源内容的变体，在 `createLocalWebAssets` 所属实例内缓存生成结果和 ETag；每个资源/locale 变体首次成功读取后复用，失败不缓存为永久缺失。先验证 renderer 是否依赖 locale 或配置，不能仅按 pathname 缓存而串中英文。动态安装插件页面、项目事实、凭据或授权结果不进入此缓存。

第一步保持现有 URL 和 cache-control，内容及 ETag 算法不变，GET/HEAD 与 304 语义不变。进程重启加载新构建；生产资源视为该构建固定资产，开发资源若支持热更新，则按原热更新规则失效。暂不引入长期 HTTP 缓存或版本化 URL，避免扩大升级兼容面。

边界：[web-assets](../../../apps/local-host/src/web-assets.ts)。

### 5. Coding 状态与详情分离

优先使用现有加密宿主启动索引和 SDK 的公开 `terminalRuns`、`listOpenWork`、进度/回放读取口；不新建会话事实库、不更换 SDK。内部 Runtime port 增加可选轻量状态读取：热会话直接投影当前内存状态；冷会话读取索引和运行时事实，只读取证明最新轮 phase 所需的事件，按索引定位最近计划轮读取 step board，避免恢复所有历史正文。

保留原检查：owner/项目/插件安装归属，未保存完整 Run 引用、缺少启动索引、未结束工作不可读、子任务结果未知、Pending、checkpoint/rewind 和恢复门槛。不能用“terminal”简单等同“completed”，也不能跳过原 checkpoint 的恢复核对。必要恢复核对与正文回放分开；无法证明轻量读取与当前语义等价时，保持原路径并明确错误或回退，不把未知结果当正常完成。

对外 `AgentSessionStatus` 及授权入口保持兼容；不支持新内部读取口的 Adapter 沿用原合同。具体会话、历史轮次和新一轮执行仍按原路径加载、复核授权与恢复门槛。读取状态不制造历史控制句柄，不触发模型或重派 Effect。初期不增加后台预恢复和自动内存淘汰，避免正在运行的会话被误释放。

依赖第 1 步的目录/授权读取稳定性。边界：[Adapter](../../../horizontal/agent-host/src/adapters/prologue.ts)、[SDK 装配](../../../horizontal/agent-host/src/adapters/prologue-node.ts)、[状态身份校验](../../../horizontal/agent-host/src/capability-registration.ts)。Coding 插件仍通过公开 Host 能力读取，不直接访问 SDK 或其他插件 Store。

### 6. 按需界面与分屏加载

先完成 Pages editor 的首次使用加载，再覆盖插件 surface 和 client；只初始化真实打开的插件。资源和 UI 仍从已有注册目录、Manifest/contribution 派生，补齐依赖时写在原 owner 的登记处，不新增 Host 插件名单。分屏沿用现有 `workbenchPane` / `panePlugin` 与父子消息合同，只渲染/初始化该 pane 必需的内容，不启动第二个整套工作台。

本轮对原目录登记独立 clientFactory 的插件延迟其真实 surface 正文与客户端；surface 根仍供原导航识别，正文保存在惯有页面内的惰性 template 中。已有 Goals/Feed/Inbox 与通用设置绑定保留为 shell，不在本轮拆成新客户端协议；分屏省略其他独立客户端 surface 正文。首次打开等待必要资源和依赖就绪再挂载，同一 surface 去重。已打开 surface 留存原实例，隐藏时暂停 UI 订阅；不删草稿或通过减少缓存 frame 数量提速。已有设置、审查、材料、伴随视图与跨插件依赖可以共享通用 shell；错误时保留当前内容、提示加载失败，重试只加载 UI 资源，不能重放业务命令。

CSS 公共/全局规则保留在 shell；本轮核对后保留整份 CSS 及原 asset order，因为既有样式仍含全局层叠，没有可独立证明安全的拆分边界。页面体积改善来自客户端和 Pages 编辑器的按需加载，不宣称 CSS 已缩减。后续只有确认 surface 作用域后才延迟对应规则，不能按网络返回先后改变层叠。HTML/client/资源必须来自同一构建，检查现有 CSP 和声明边界。全局搜索、设置直达、插件深链接、拖拽分屏、伴随 Files/Git/Diff 等不能依赖未创建的隐藏 DOM；需要数据的入口走原公开查询，而不是为搜索重新提前挂载所有插件。

依赖第 3、4 步；不依赖第 5 步，但仍串行实施。边界：[页面 renderer](../../../apps/workbench/src/goals-page-renderer.ts)、[插件资源投影](../../../apps/workbench/src/plugin-workbench.ts)、[tab workspace](../../../apps/workbench/src/scripts/client/tab-workspace.ts)、原插件 UI 贡献及公开 factory。涉及插件实现时按原插件开发规则补必要依赖声明与测试，不夹带设计重做。

## 验收：正确性先于提速

性能数据在同机器、同构建模式、同 fixture 下与基线比较，冷启动与 warm 分开记录；下表是原验收目标，实际通过范围及数值见后面的实施记录。功能断言先独立通过，不能为了满足时间阈值放宽语义。

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

以上是已存在的重点测试。修改 ContextLedger、Projects、Storage、UI Host 或具体插件时，已补对应 README 的必跑集合；新增回归与实际结果见后面的实施记录。最终还要做隔离安装包的真实桌面操作，不能只依赖 Chrome 或 Rust 单元测试。

逐步记录实际 diff、通过/失败/未运行的验收项及原因，保存相关 trace、请求统计和内存/时延对比；不新建状态 manifest、锁系统或第二份项目进度账。首次正常导航、后台执行期间导航、历史较多的 Coding 返回、慢导入期间窗口操作都要覆盖。此前真实卡死若仍能复现，保留现场采样继续定位，不能在性能数值下降后直接关闭原故障。

## 数据保护、安装与回退

开发复用已有隔离工作树或新建明确基线的工作树；不在正在使用真实 Home 的主检出里改源码，不碰别的会话未提交内容。六步代码变更各自可回退；无数据格式迁移，所以回退代码不需要回滚数据库。静态资源、连接与 UI 缓存随原生命周期释放，不持久化新的业务事实。

替换真实应用/服务之前，等后台任务自然结束或按原流程正常退出，再做完整 Home 的一致性备份；不要为备份硬杀任务。现有备份回归验证的是所有 writer 关闭后的离线复制，并保留原绝对 Home 路径，不是已实现的在线全 Home 快照。备份覆盖目录、项目库、附件/Blob、SDK 和宿主加密索引及原加密凭据文件；不把密钥解密成日志或普通报告，不修改钥匙串。运行中的 SQLite 不能只复制 `.db` 而忽略 WAL。无法形成一致性备份时，继续隔离验证，暂不替换真实应用。

先在可丢弃的测试 Home 原绝对路径做恢复与代码回退演练，确认可读正文、精确引用和新增记录保留，再进入真实使用。真实安装/服务切换及任何数据恢复按当时已有用户授权执行；本轮不进行这些动作，不推送、不发布。

## 实施记录与验收结果（2026-10-01）

代码位于 `/private/tmp/molis-project-management-freeze`，分支 `feature/fix-project-management-freeze`，从 `62cbc14d` 开始；主检出源码、其他会话的设计稿、真实 Home、已安装应用及服务均未替换。代码提交可独立回退：

| 步骤 | 提交 | 已完成的边界 |
| --- | --- | --- |
| 1 | `a9dc7c96`、`11299c1c` | 当前 schema 普通访问不执行 DDL/初始化写事务；固定 Home 的 Web 连接复用；健康检查直接读进程状态；项目创建/删除/改名、插件 membership 和工作目录提交只异步等待未开始事务的锁，提交体一次执行 |
| 2 | `a38cc4b0` | 三个原生 Shelf 命令的原同步 IO 转工作线程；导入批次互斥，批内顺序保持 |
| 3 | `3903facd` | 全局读取归原 UI Host 可见性生命周期，隐藏停止轮询、显示立即补读；取消读取后校验 signal，后台任务与写请求生命周期保持 |
| 4 | `60bfa772` | 固定构建资源每个 locale 变体只生成/读取/计算 ETag 一次，GET/HEAD/304 合同保持 |
| 5 | `c98914a3` | 冷 Coding 状态复用原 owner 索引及 SDK 恢复检查，只回放最新轮；详情仍完整恢复，不增加历史控制句柄或重派任务 |
| 6 | `b3bcb90a` | 原登记目录派生插件客户端与依赖，首次打开才装正文及客户端；保留原根节点/实例、草稿与跨插件入口；加载失败只重试 UI 资源 |

### 实测改善

| 场景 | 基线 | 修复后 | 证据边界 |
| --- | --- | --- | --- |
| 外部进程持有目录写锁 1.25 秒，warm 管理项目请求 | 1,343.2 ms | 4.3 ms | 同机器隔离 Home、生产 HTTP 与真实 SQLite 锁 |
| 同一锁场景的 health / 20 ms 定时器最大间隔 | 1,340.5 ms / 1,337 ms | 4.4 ms / 22 ms | health 不进入业务数据库；冷启动未就绪仍正常返回 503 |
| 真实 HTTP 项目改名等待外部写锁 | 原同步获取锁存在事件循环阻塞 | 8 次 health 均 <200 ms，定时器最大间隔 <100 ms；改名成功，异常回滚 | `tests/catalog-read-contention.test.ts` 同时验证撤权发生于实际异步锁等待之后仍零副作用、FIFO 与提交体不重试 |
| 原生 Tauri 导入连接延迟 2 秒的后端 | 同步 command 在 IPC 路径等待 | 后端 2,002 ms、导入 2,011 ms；期间另一同步 IPC 14 ms 返回 | 隔离原生包、临时 Home、后端只收到一次导入，成功数 1；**原生窗口按钮/键盘未通过** |
| 隐藏 pane 5 秒 | 隐藏仍有全局轮询 | cursor 与 Coding 状态新增请求均为 0；显示立即补读 | Chrome 真实 iframe，另有 4.5 秒定向回归 |
| 初载 Workbench JS / Pages editor JS | 2,728,343 B / 1,051,326 B | 1,361,069 B / 首次打开 Pages 才加载 | 原始未压缩资源；插件独立客户端不在首次载入执行 |
| 初载 JS/CSS 总量 / 全插件首页 DOM | 约 5.76 MB / 10,888 节点 | 约 3.34 MB / 7,124 节点 | 约下降 42% / 35%；CSS 仍为 1,979,438 B，未减少；HTML 内仍有惰性模板 |
| warm 304：JS / CSS / Pages editor | 6.7 / 5.7 / 2.2 ms | 0.8 / 0.7 / 0.4 ms | 回归同时断言成功资源每变体只生成一次 |
| 25 会话 ×40 轮、101,000 条事件的状态读取 | 25 次完整恢复，101,000 次事件访问，161 ms，保留 heap +12.4 MiB | 0 次完整恢复，5,050 次事件访问，5 ms，保留 heap 约 +0 MiB | **合成历史的生产 Adapter 探针**；不是用户首开时延，warm 会继续读真实状态，未添加状态 TTL 缓存 |

冷项目页面与整个首页尚有后端准备和浏览器长任务；本次后测记录到 229 ms 与 90 ms 的长任务，不能据体积下降宣称全部渲染卡顿消失。原生注入多次受到前台焦点限制；改用限定测试 PID 的辅助功能按钮操作时，WebView 没有暴露探针按钮，因此没有取得窗口输入响应证据。测试进程已退出，临时 Home/后端已清理，没有修改用户的系统权限。

### 工程与真实路径验证

- `pnpm build` 与 `pnpm boundary:check` 通过；边界检查 1,824 个源码文件、7,550 个 import、230 条依赖边，零错误；最终 diff 检查通过。
- Rust：`cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`，66 项通过；独立调试二进制构建通过。日志 `/tmp/molis-performance-native-tests.log`。
- Agent/Prologue：`node scripts/run-tests.mjs tests/agent-*.test.ts tests/prologue-*.test.ts`，404 项中 402 通过、2 跳过、0 失败。跳过分别为原测试未启用的真实 npm 安装和未提供 MiniMax API Key 的外部模型调用；未伪报真实模型验收。日志 `/tmp/molis-performance-status-tests.log`。
- Workbench：原文“验证命令”的必跑集合，以及生命周期、分屏/frame、Coding、contextual interactions、隐藏刷新、资源缓存、按需加载、管理项目导航，共 46 项通过。覆盖真实 Chrome 的 Pages 编辑/深链接、搜索、设置、窄屏、Coding 草稿/会话标签、Files/Git/Diff/TextStats 和返回。日志 `/tmp/molis-performance-ui-regression.log`。
- Host/数据：原必跑集合及 Home 隔离、schema/owner、Projects、ContextLedger、Models、工作目录、Shelf、备份恢复，共 138 项通过。日志 `/tmp/molis-performance-host-regression.log`。
- 补充：`tests/workspace-project-actions.test.ts`、`tests/project-workspaces-settings.e2e.test.ts`、`tests/characters-appearance.test.ts`、`tests/agent-host-wiring.test.ts`、`tests/prologue-recovery.test.ts`，24 项通过。日志 `/tmp/molis-performance-additional-regression.log`。
- 最终锁竞争回归 4 项通过（包含真实等锁中途撤权与提交队列顺序）；按需界面资源失败、按钮重试和已打开根节点留存也通过定向回归。日志 `/tmp/molis-performance-catalog-final.log`、`/tmp/molis-performance-target-retest.log`。测试集合有重叠，不把上述数量相加成唯一用例总数。

新增有效回归为 `tests/catalog-read-contention.test.ts`、`tests/workbench-hidden-refresh.e2e.test.ts`、`tests/workbench-asset-cache.test.ts`、`tests/prologue-status-projection.test.ts`、`tests/workbench-deferred-clients.e2e.test.ts`，并扩充真实 SDK 的 `tests/prologue-recovery.test.ts` 和独立脚本的 `tests/client-script-undeclared.test.ts`。先前的 `tests/project-management-navigation.e2e.test.ts` 保留 Coding 新建会话→管理项目→目录搜索→返回同一会话的普通 Web 与 desktop=1 回归；它不等于原生实操或事故现场复现。

### 数据保护与回退演练

`tests/home-backup-recovery.test.ts` 在所有 writer 正常关闭后做离线 Home 复制和原绝对路径恢复，精确核对正文、Artifact 版本、加密会话和引用，并验证恢复后仍可追加。SQLite `integrity_check=ok`、`foreign_key_check=[]`。这不是在线快照，也没有恢复真实用户 Home。

另用新代码在独立 Home 创建修复期间新增的真实项目、Goal 与事件历史、两个 Artifact 版本及原 payload、加密 WorkSession 正文，并通过实际 Prologue Node Adapter/SDK 落盘一次受控失败的运行。所有 writer 关闭后，由干净的 `62cbc14d` 基线构建读取，再由当前新构建读取，两次均对原 project 身份、完整 board snapshot、精确版本正文、加密会话归属/正文及 SDK 会话全文、时间、owner 做一致性断言；旧历史控制均被原协议拒绝，读取期间禁止调用模型配置或重派任务。未变更 baseline 工作树；fixture 保持同一绝对 Home 后清理。日志 `/tmp/molis-performance-rollback-create.log`、`/tmp/molis-performance-rollback-baseline.log`、`/tmp/molis-performance-rollback-new.log`。

探针位于本工作树 `.impeccable/qa/performance-audit/`，原生 IPC 通过记录 `/tmp/molis-performance-native-ipc-proof.log`，性能后测 `/tmp/molis-performance-after-lazy-assets.json`、`/tmp/molis-performance-after-lazy.json`、`/tmp/molis-performance-status-after.json`。探针是隔离验证材料，不加入业务状态或产品资源。

## 复查结果（2026-10-01）

用户要求复查后，读取六项改动及相关调用链，并在隔离 Home 注入真实锁竞争、连接重建和资源挂起。确认 P1：并发恢复同一新项目时失败调用删除另一调用已登记的数据库（新增回归）；示例重置提交超时后原库与新库均被删除（旧版已有、本轮遗漏）。确认 P2：外部 Host 复用重建 Web Server 后个人规划保存仍引用关闭的 runner；首次 warm 锁超时后仅探活无法自行恢复；插件资源一直不返回时界面持续 inert 且没有重试出口。

并发误删已用两个真实 Catalog 和真实 SQLite 锁复现；示例重置、连接重建与启动恢复均与旧版对照。挂起资源在真实 Chrome 复现。详细触发条件、影响边界、修正方向、复现命令与日志见 [复查报告](../../../docs/reviews/performance-fix-review-2026-10-01.md)。这些场景未被此前通过的工程集合覆盖。复查阶段未修改生产源码；随后用户授权修复，实施结果见下节。保留此前性能和回退证据，不把局部回归通过等同于全部内部验收通过。

## 缺陷修正实施与验收（2026-10-01）

### 五项缺陷修正与首次初始化竞态合同

此次完成标准：五项已确认问题全部修正，并有生产路径的定向回归、所改包的必跑测试及整体构建/依赖边界检查。原生输入和事故现场的既有未验证项继续单列，不因代码修正冒充已完成。沿用此需求书，不建立第二份修复进度系统。

定向回归另复现了旧版已有的首次目录初始化竞态：并发打开新 Home 的多个连接均读到旧的“不存在”状态，后来者重复创建 catalog_meta 而失败。此项属于同一目录准备调用链，一并修正；初始化写事务内重读已提交表/owner/schema，采用合法目录，未知/未来目录仍拒绝，普通当前版本读取仍不争写锁。原并发用例保留冷启动与并发创建断言。

- 固定标识的项目创建：暂存目录每次请求独有；提升后作为可恢复资源保留，失败请求不能删除另一个调用已采用的正式数据库。在 Catalog 提交内重读正式记录，使并发恢复返回同一已登记身份；目录提升碰撞只能采用校验通过的同标识数据库，不能覆盖已有正文。验证真实锁交错、同时准备、提交超时后的再恢复和恰好一次登记事件。
- 示例重置：备份保留到新库初始化与目录提交成功；任何此前失败恢复原数据库和原目录记录。成功后的备份清理失败不能删除已成功的正式目录。验证锁超时、后续初始化失败与成功清理失败，读取恢复后的原正文并再次正常重置。
- 外部 Host 的 Web 连接：被借用 Host 持有目录连接直到 Host 关闭，服务重建复用有效连接，规划处理器允许当前 owner 的安全重绑定。服务关闭不提前关闭外部 Host 的目录消费者；内部 Host 仍由服务关闭。验证真实 Home 动作在服务关闭、重建后可继续保存，最终 Host 关闭释放连接，两个 Home 不混用。
- 启动恢复：Catalog 准备遇到 SQLITE_BUSY 可独立延迟重试，合并同一准备，不重派任何业务动作；health 仍只读进程状态。确定性 schema/owner 拒绝不循环重试，关闭取消待重试。验证真实 schema 升级锁释放后的自动就绪、确定性拒绝与关闭期间无再次打开。
- UI 资源挂起：每个资源最多等待 10 秒，然后解除等待并显示原重试入口；按 Host 生命周期释放资源、定时器和回调。重试只加载资源，迟到的旧响应不得重复挂载或清除新请求。真实 Chrome 覆盖挂起→超时→重试→原响应迟到，同时保留界面根节点及最近选择。

允许修改边界：Catalog 初始化、ManagedProjectFiles / 示例生命周期、LocalHost / Web Catalog 装配与关闭、规划 runner 绑定、按需客户端及必要文档、对应测试。无需依赖或数据格式变更。锁竞争只重试未开始的准备，不调低生产锁期限，不添加第二个业务 owner。

新增回归位于 `tests/project-catalog-preservation.test.ts`、`tests/web-catalog-recovery.test.ts`，扩充 `tests/personal-planning-actions.test.ts` 与 `tests/workbench-deferred-clients.e2e.test.ts`。完成 `pnpm build` 后运行这些文件及各包 README 的必跑集合，并运行 `pnpm boundary:check`；文件名若因复用现有用例调整，实施记录更新实际命令。

### 已完成结果与证据

| 提交 | 修正与有效回归 |
| --- | --- |
| `334a2417` | 请求独有的暂存目录；稳定身份的提升资源保留、校验采用、提交内收敛到正式记录，创建事件恰好一次；示例重置保留旧库到初始化与最终事务成功，插件启用与重置记录原子提交，清理失败不删除正式目录；首次并发初始化事务内重读真实 schema/owner |
| `54eaa55d` | 外部 LocalHost 持有 Web Catalog 到 Host 关闭，传输关闭和重建期间仍可保存；规划 runner 可安全重绑定到同 Home 的新 owner，原 Home 隔离与权限门槛保持 |
| `55ebd13b` | 仅 SQLITE_BUSY 的目录准备后台重试，合并准备、不重派失败业务回调；关闭取消重试，未知/未来 schema 不循环重试，真实迁移锁释放后无需业务请求即可健康就绪 |
| `05c8b855` | UI 资源 10 秒有界等待，失败解除 inert/aria-busy 并可重试；Host 关闭释放等待，已超时回调不会清除新请求或重复挂载；真实 Chrome 保留原根及最近选择 |

最终 `pnpm build` 和 `pnpm boundary:check` 通过（1,824 个源码文件、7,552 个 import、230 条依赖边，零错误），日志 `/tmp/molis-performance-review-fixes-build.log`、`/tmp/molis-performance-review-fixes-boundary.log`。构建仍有原有 xterm 默认导入警告，与本次修改无关，未为消除警告改变终端实现。

首次定向集合 58 项中 57 通过，失败的并发用例暴露上述旧版首次初始化竞态；已确认旧版也存在，并修正生产代码，未放宽测试。随后对受影响的目录、初始化与恢复集合完整复验：28 项通过、零失败/跳过，日志 `/tmp/molis-performance-review-fixes-catalog.log`。此集合包含 `tests/project-catalog-preservation.test.ts`、`tests/project-catalog.test.ts`、`tests/catalog-read-contention.test.ts`、`tests/web-catalog-recovery.test.ts`，读取实际恢复的 Goal 正文与 snapshot，核对目录记录、插件状态、单次登记与后续可用性。

Host 必跑及相关检查 53 项通过、零失败/跳过：`tests/local-host.test.ts`、`tests/local-host-actions.test.ts`、`tests/action-before-effect.test.ts`、`tests/action-model-scheduling.test.ts`、`tests/action-read-compatibility.test.ts`、`tests/installer-symlink-dependencies.test.ts`、`tests/system-search-host.test.ts`、`tests/home-backup-recovery.test.ts`、`tests/web-home-isolation.test.ts`、`tests/agent-host-wiring.test.ts`。日志 `/tmp/molis-performance-review-fixes-host.log`。

Workbench 必跑及真实分屏检查 30 项通过、零失败/跳过：`tests/plugin-declarative-mounting.test.ts`、`tests/builtin-plugin-agent-texts.test.ts`、`tests/builtin-manifests-contract.test.ts`、`tests/builtin-plugin-composition.test.ts`、`tests/workbench-ui-platform.test.ts`、`tests/i18n.test.ts`、`tests/client-script-undeclared.test.ts`、`tests/workbench-tab-workspace.e2e.test.ts`。日志 `/tmp/molis-performance-review-fixes-workbench.log`。

规划绑定最终 4 项通过、零失败/跳过，包含同 Home 关闭旧 runner 后重绑定、传输关闭仍可保存、重建继续保存、Host 关闭释放，以及原权限/跨 Home/MCP 集成，日志 `/tmp/molis-performance-review-fixes-planning.log`。原定向集合中的真实 Chrome 资源挂起→超时→重试→旧请求释放、最近选择与一次挂载、各插件根留存，以及 Coding→管理项目→搜索→返回同会话（普通 Web 与 desktop=1）均通过，日志 `/tmp/molis-performance-review-fixes-targeted.log`。源码最后一次改动仅在目录初始化，保留此前已核实且不受该分支影响的浏览器证据，未机械重复全部集合。测试集合存在重叠，不把数量相加。

未修改数据格式、生产锁期限、凭据后端或 SDK；测试均使用隔离 Home。源码提交和文档只在本工作树保留，主检出仅同步本任务的唯一需求书，其他会话内容不改。

## 剩余验收与范围限制

- **五项缺陷与追加初始化竞态的工程验收通过，整体内部完整仍待原生窗口输入实操。** 原生慢导入中的 IPC 已通过，实际指针/键盘和新版真实桌面导航尚未取得验证证据，因此不能标记全部内部验收完成。后续应在可正常操作的隔离应用窗口验证慢 IO 时的输入与 Coding 返回目录；不修改系统权限来强行绕过测试限制。真实 SDK 大量历史状态读取的性能实测仍未进行，合成历史探针不能替代该项。
- 此前管理项目卡住的事故现场没有捕获，根因仍未确认。浏览器导航通过和已消除的锁阻塞不能等同于该事故已经关闭。
- 本轮不把所有同步 SQLite、凭据/连接设置、项目 IO 或全局 CSS 都改造成异步架构。目录普通读和列明的项目提交边界已处理；其他 owner 的同步写仍沿原合同，不宣称任意并发写或全量插件操作均无卡顿。
- 未替换真实应用/服务、未发布，用户本人验收未进行。正式切换仍须遵循前面的完整 Home 一致性备份、原恢复协议与实际授权范围。

## PR 提交后的验证补充（2026-10-01）

用户授权推送及创建 PR，并要求完成后清理本任务后台进程。已合入 main `597d15d2`，无冲突；PR #150 已创建。首轮全量运行全部 601 个非 `.e2e.test.ts` 文件（含文件内已有的浏览器混合用例），发现 Assistant 子任务追加失败及 Cognia 的旧整体客户端断言，主动中止此轮以便先修正；中止时 1,313 通过、2 失败、358 取消、1 跳过。取消项不计为产品缺陷，此轮不作为全量通过证据。中断后原临时工作树及 /tmp 日志已不可访问，已从推送分支恢复到持久隔离工作树，后续日志保留在该树的 `.impeccable/qa/performance-audit/pr-followup/`。

受控生产 Adapter 回归证明热状态过早采样：步骤图读取在等待时收到 completed，当前分支仍返回 running，干净 `62cbc14d` 返回 completed。修正保持原热路径的异步边界，在必要步骤图读取之后取当前 phase；冷状态继续只投影最新历史、保留 owner/recovery 检查。不得取消运行时或显示时间提交门槛，不通过重派控制/模型调用来掩盖失败。覆盖步骤读取和结束事件交错，并复验真实 SDK Assistant 子任务追加及 Agent/Prologue 必跑集合。

Cognia 原测试要求整体 shell 中直接包含业务客户端，已与按需加载合同冲突；保留真实界面入口和领域正文断言，改验登记的客户端资产具备原 API 与挂载代码，shell 仅引用该资产；真实浏览器继续验证首开挂载及实例留存。追加修正后重新整体构建并定向复验，按实际结果记录，不将中止轮视作全绿；原生实操和未完成的全量/视觉验证继续明确披露。

追加修正的最终验证：

- `pnpm build`、`pnpm boundary:check` 通过，边界零错误；日志 `build.log`、`boundary.log`，既有 xterm 导入警告保留。
- `node scripts/run-tests.mjs tests/prologue-status-projection.test.ts tests/assistant-delegation.test.ts tests/cognia-workbench.test.ts tests/prologue-recovery.test.ts`：25 项通过，零失败/取消/跳过，日志 `targeted.log`。原失败的 Assistant 子任务追加用例通过，受控步骤图/结束交错通过，显示时间提交及重启恢复门槛保留。
- 以 `scripts/run-tests.mjs` 运行全部 50 个非 E2E `agent-*.test.ts` / `prologue-*.test.ts`：385 通过、零失败/取消、2 跳过，日志 `agent.log`。跳过项是原有官方 npm/Seatbelt 条件用例及缺少 `MINIMAX_API_KEY` 的真实模型用例；未为测试使用用户凭据。
- `node scripts/run-tests.mjs tests/project-management-navigation.e2e.test.ts tests/workbench-deferred-clients.e2e.test.ts tests/workbench-hidden-refresh.e2e.test.ts tests/workbench-tab-workspace.e2e.test.ts`：真实 Chrome 5 项通过，零失败/取消/跳过，日志 `browser.log`。覆盖普通 Web/desktop=1 的原 Coding Session 返回、资源超时/重试/旧响应迟到、全部登记插件首开与原根留存、隐藏补读及 1440/390 分屏。

上述日志保留于 `/Users/yijunwang/code/molis-work-performance-pr/.impeccable/qa/performance-audit/pr-followup/`。集合有重叠，不累加计数。全量非 E2E 中止后未完整重跑，完整浅色/深色 × 1440/1024/390 视觉走查未补齐；这两项及原生输入/事故现场、真实深 SDK 历史性能仍是验证限制，PR 如实记录。
