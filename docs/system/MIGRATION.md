# 架构重组迁移矩阵

产品工程归拢：根 src 与 desktop 已退出。启动器位于 apps/desktop/launchers，SDK 兼容源码位于 apps/local-host/sdk，Tauri 配置/资源位于 apps/desktop/src-tauri；构建输出和公开命令不变。下方旧路径为迁移历史。

2026-09-08 清理补充：已删除 10 个无实现、无消费者的占位包。Inbox Native Plugin 落地后实际 workspace 为 39 包；未来设计见 SSOT 的 absent 条目。根 src 仅保留 6 个启动/SDK 文件。历史记录中的 48 包是当时口径。

2026-09-08 Cutover：原混合实现 caller 已退出。当前运行结果以 [统一验收](../../specs/molis-work-architecture-reorganization/cutover-validation.md) 为准，下面表格为最终实现位置。

| 原路径 | 当前实现 | 旧路径状态 |
| --- | --- | --- |
| src/v1 | 各 Module 事实/状态机；Native Goals 查询、规划、执行验收和决定；Host 装配 | 已删除 |
| src/feed | Sources/Signals/Feed/Attention；Native Feed 用例；Integration Provider；Storage Adapter；Host IO | 已删除 |
| src/projects、src/sessions | Projects / Private Work Context；Work Plugin；Host Catalog/Session 装配；Runtime Host | 已删除 |
| src/web/render、业务 HTTP、Capsule、PTY | Workbench / Native UI；Host Web 分组路由；Desktop 与 Runtime Host | 已删除 |
| src/desktop、src/install、src/local-host | Desktop App、Local Host 与 App-owned tooling | 已删除 |
| src/cli/main、src/mcp/server、src/web/server | 启动环境与公开 App 入口 | 保留 thin bin，无业务规则或 SQL |
| src/index、sdk-store、sdk-types | 已发布 0.1.x SDK 的 owner 转发/类型别名 | 保留兼容期；内部 caller 不再使用根 SDK，移除需另行破坏性版本决策 |

目标包仍为 partial 的原因是未来契约未全部实现，不表示仍依赖旧源码。Outbox、Team/Server、Exchange/Sync、Actions/Automation 与通用 Durable Scheduler 未实现，参见 SSOT-MATRIX。旧验证数字保留为迁移历史，不用于最终通过判断。

## 历史迁移阶段（下列数字和待办不表示当前状态）

DV4 最终状态（2026-09-06 09:24 UTC）：安装、分发与文档迁移已通过完整 Review，Molis Work completed。公开 owner/caller、旧实现退出、当前 npm 独立消费、真实 App 升级/卸载保留/重装及供应链资产均见 [完整验收](../../specs/molis-work-architecture-reorganization/dv4-validation.md)。最终检查额外修复旧编译输出混入包的问题：根构建统一执行 workspace clean/build，新 npm 和 App 已复验。下方 DV4 未完成文字为阶段历史；Apple 公证/公开发布、总数据安全恢复、全产品 E2E 和最终清理不在该完成结论内。

GW6（2026-09-06）：Goals 基础 schema、15/25/26 与 migration 30 的 Goals revision/coverage 回填已由 Goals 接管。V3 importer 与 Web 覆盖账 caller 改用公开 Command/Query，Host 保留同连接跨 owner 顺序及事务。193 项定向前后端回归通过，补强历史升级对账 6 项通过，详情见 [GW6 验收](../../specs/molis-work-architecture-reorganization/gw6-validation.md)。旧 Store 仍非整体 retired；最终清理与全产品 E2E 义务不变。

DD2 工程状态（2026-09-06）：原生/历史提案应用与决定 UI/copy/client 已按 owner 迁移，209 项串行回归和 12 项边界反证通过。当前 Coordinator / root renderer / server 为 2,771 / 2,240 / 3,243 行；它们仍未整体退出。真实 caller 与验收见 `specs/molis-work-architecture-reorganization/dd2-caller-audit.md`、`dd2-validation.md`。下文旧阶段记录只保留当时边界；canonical 完成状态以 Molis Work 为准。

DD1（2026-09-06）：草稿 start/turn/resume 的真实应用已迁入 Goals Native Plugin；Governance clarification API 接管原记录、事件、幂等与事务，Goals/Execution 保持原事实 owner。Host 三个 capability 改绑新应用，CLI/MCP 契约不变；旧 Coordinator 三方法/独占 helper 和 root Store 澄清读取映射已删除。无 schema 改动，无新 Web 表单。DD2 的提案/决定、决定后关闭会话与最终 Host 清理仍未完成，详情见 `specs/molis-work-architecture-reorganization/dd1-validation.md`。

DV4 分发切片：release tooling 已归 Desktop / Local Host，Desktop payload 复用唯一 installer release 创建能力并保留 vendor provenance/SBOM。干净锁文件安装、全部 48 包构建、Node 下载校验、App/DMG 与 npm 独立 consumer 已验证。真实旧 DMG 0.1.13→0.1.14 升级发现 Listener 初始化遗漏，已通过 owner API 修复并重跑；普通项目正文/历史、普通卸载保留及实际 App 重装恢复通过。见 [旧版升级验收](../../specs/molis-work-architecture-reorganization/dv4-upgrade-validation.md)。Apple 公证、完整 DV4 Review 和全产品 E2E/最终审计仍不能从这些局部证据推断。

DV4 安装代码切片：旧 `src/install/` 实现已清零。Home、Runtime integration、常驻服务和卸载归 Local Host 的具名公开 API，均按职责拆分；卸载 catalog 只读事实检查归 Projects，根装配只注入连接生命周期和 Demo 删除。构建指纹已包含 workspace 源码，CLI 不传 `--source` 时仍安装根产品。当前验证见 [DV4 进展](../../specs/molis-work-architecture-reorganization/dv4-progress.md)；release/Tauri/provenance/SBOM 与整体用户 E2E 尚未完成。

DV2 已完成：Skill 与中英文 MCP/Runtime 说明对应正式协议；真实 launcher handshake 归 MCP App 公开 validator，原安装 caller 已切换。66 项定向回归和边界检查通过，见 [DV2 验收报告](../../specs/molis-work-architecture-reorganization/dv2-validation.md)。DV3 已于 2026-09-05 07:42 UTC 通过正式 Review：真实本地开发 CLI、私有存储/Artifact/UI、公共 fixture、打包签名与外部安装 SDK 样例均已验证，见 [DV3 验收报告](../../specs/molis-work-architecture-reorganization/dv3-validation.md)。DV4 已开始，正在迁移安装与分发；整体前后端用户 E2E 未完成。

DV1 当前验收：CLI/MCP 全部 Goal caller 已走公开 Host Client，Board/import 等声明与完整类型已归官方 Goals Plugin。实际旧入口无 Store/Coordinator 直访；入口权限检查与 executable 装配保留，安装分发归 DV4。构建、601 项全量自动回归（0 失败/跳过）、边界检查通过。逐项证据见 [DV1 验收报告](../../specs/molis-work-architecture-reorganization/dv1-validation.md)。以下 DV1 切片是历史进展；不代表最终用户 E2E 或整体重组已完成。

DV1 第十一切片：CLI/MCP 的 Goals/Execution/Available 已全面改走 typed Host Client；旧 application scope caller 清零。Host 把 Available+projection、trash+状态、planning composition 保持在一次具名调用内；Client `withScope` 保留打开/响应/关闭顺序，不暴露 Runtime。46 项受影响入口回归、125 项 V1/adapter/一致性回归通过，包含真实排队写入不能拆开结果的验证。仍有旧 Board/import 等 capability 声明公开收口和最终 DV1 验收；整体用户 E2E 未开始。

DV1 第十切片：Draft / Goal Tree / legacy proposal 三组真实调用改走具名 typed Host Capability；Plugin 提供异步应用 client，CLI/MCP await 后展示，旧 runtime 三组字段清零并删除。42 项受影响回归通过；补充并发重复回答与跨入口 Proposal check 重放/持久化/重启链通过。边界 300 source files、0 错误。其余 Goals/Execution/Available 组合和旧 Host definitions 收口、最终 DV1 验收仍待完成。

DV1 第九切片：完整 Goal Contract 唯一类型归官方 Goals Plugin，CLI/MCP 的 Contract/Guidance/active-goal 已走该 Plugin 的公开 typed Capability，Host 注册原实现。回收站命令与结果、URL、context response 组合归 MCP App；Runtime 决定先校验 wire，再由 Local Host 组合原宿主来源/attestation。45 项入口回归、122 项 V1/协议相关回归通过，另补真实 context presenter 的 guidance 故障/Session unavailable 顺序验证；边界 299 source files、0 错误。旧 MCP 542 行，仍有其余应用组的 `withProject`→Client 切换和最终 DV1 验收，未把分阶段测试当成总目标的真实用户 E2E。

状态：Goals Query、GW1–GW4、AR1、EX1–EX4 与 AP1–AP4 已迁入  
最后核对：2026-09-02  
目标：迁移期间始终能回答“旧代码现在由谁负责、下一个迁移 Goal 是什么、什么时候可以删除”。

### WK3 已落地的 Work 应用与 UI

- Session 内容/恢复、创建/发现、Handoff、TUI 记录和工作目录补偿恢复已归 `plugins/native/work`，事实仍通过 Projects / Private Work Context / Runtime Host / Desktop Panel 公共端口访问。
- Session/Terminal 页面通过 Workbench 的 UI Host 挂载；终端按连接、面板生命周期、自动填入、xterm 显示和页面事件拆开。浏览器入口、xterm 依赖和终端英文文案跟随 Work，Web Server/renderer 仅留 Host 装配。
- 旧 Session 应用、终端/Session 大文件、工作目录 action adapter 和无生产用途的 Registry/Adapter re-export 已清零后删除。535 项全量回归、最后 90 项定向回归通过；工作区类型、构建、边界通过。
- 见 [WK3 验收与边界](../../specs/molis-work-architecture-reorganization/wk3-validation.md)。这不替代全部开发结束后的模拟用户 E2E、清理和最终规范审计。

## 1. 总体顺序

1. F1 定稿 SSOT、包状态和 Huge Class 责任图。
2. F2 创建完整 workspace/package 树，不搬整块 Huge Class。
3. F3 建立 import 与 Contract 自动门禁。
4. Feed 作为首个真实垂直切片验证 Module、Horizontal、Plugin、Host 和 UI。
5. 依次迁移 Goals、Artifacts/Ledger、Execution/Evidence/Governance、Work/Runtime、Projects/App Shell、开发者入口。

AR3 已完成迁移验收：现有结果引用展示已由 Native Artifacts UI Contribution 经 Workbench/UI Host 提供；项目文件打开的 Evidence / 原 workspace 选择策略已迁入 Plugin，安全 reader 仍由 Evidence & Verification 拥有。正式版本列表、详情、本地导出和 Goal 上下文嵌入均已有实际 caller。普通引用不会被自动注册为 Artifact；上下文只读明确输入/产出关系，按 id/version 查看。Web 与上下文回归 62 项通过，嵌入的桌面/窄屏点击与独立界面审查通过；真实 Chrome 复制成功/拒绝与相关 Artifact 回归合计 13 项通过。切片证据与整体开发后 E2E 分开记录，详见 `specs/molis-work-architecture-reorganization/ar3-embed-validation.md`。

DV1 进行中：JSON-RPC message/reply、宿主 `_meta`、Tool schema 与 Runtime audience 已迁入 MCP App；真实服务器的发现及调用分类共用公开目录。迁移前后管理端 57 / Runtime 44 个完整工具定义（顺序、描述、嵌套 schema）直接对比一致，MCP 协议与原 MCP 回归 35 项通过。CLI 和剩余 Store/初始化 caller 尚未清零，详见 `specs/molis-work-architecture-reorganization/dv1-work-plan.md`。

DV1 后续进度：CLI 输入/帮助/JSON/URL 展示已迁入 CLI App；CLI/MCP 数据库目录准备共用 Local Host，V3 import、恢复事实和回收站读走 typed Host capabilities，两个入口的直接 Store 访问已清零。MCP 恢复展示只消费 Host 返回的既有事实。最新相关回归 43 项通过，另有 V1 CLI/导入/重验证定向 5 项通过；命令路由、Project/Session 宿主组合与完整 DV1 验收仍未完成。

DV1 命令层后续：CLI/MCP 的已公开 Goals/Execution 命令转换已由各 App 的具名 handler 拥有，真实入口 switch 已切换，原 Runtime 检查仍先于调用。完整 V1 加受影响入口回归 163 项通过；另新增真实 CLI 领取 → MCP 报告/Evidence → CLI 复核的持久化链，验证幂等、错误 actor、顶层 Board 与宿主 locator_context 优先级。边界规则同步追踪 App handler 调用链，没有放开 Store/Module implementation 直访。Draft/Goal Tree、旧查询与 Project/Session 组合、最终 DV1 验收仍待完成。

DV1 查询层后续：Ready/Available/Explain 的既有 Contract 类型归官方 Goals Native Plugin，旧路径变为类型别名；Host 为 CLI/MCP 提供同一 `GoalAvailabilityQueryApi`。MCP 方法目录、Available 摘要与澄清历史分页归 App，入口不再直调上述 Coordinator 查询。163 项回归及 2 项分页/错误兼容测试通过，包边界无错误。查询算法仍由旧实现承担，`withProject` 与 Draft/Goal Tree/Project/Session 组合尚未退出，未完成最终验收。

DV1 第六切片：Draft Dialogue、Goal Tree、legacy proposal 的既有应用 Contract 由官方 Goals Plugin 公开，Clarification 记录只在 Governance Contract 定义。Host 绑定同一个原实现，CLI/MCP 的具名转换已切换；Runtime 用户确认和来源仍在 handler 前核实。157 项原 V1/受影响入口回归与新增跨入口 Draft→提案→用户决定→Candidate 拒绝/重放→Host 重启恢复链通过，边界 0 错误。只迁接口/调用，不宣称原事务/决策算法、Project/Session 组合及最终 Host Client 已退出。

DV1 第七切片：宿主环境和 Session Registry 组合归 Local Host，Session 身份匹配归 Private Work Context，MCP 活动内容解析归 App；root 兼容层仅保留 catalog reconciliation 回调和未迁的连接/Panel 组合。50 项受影响回归及 2 项新增活动测试通过，包含真实 MCP 成功写入、同 key 活动去重、其他 Session 不受影响、Registry 故障后主 Run 仍 completed 且下次 context 显示 unavailable。MCP 967 行并不等于 DV1 已完成；剩余职责见 Huge Class 清单。

DV1 第八切片：七个项目 context 工具的转换归 MCP App；公开 catalog scope 保持原资源生命周期，Local Host 接管连接缓存和 Panel/native Session 组合。旧类型改为 Contract 别名，原绑定/删除算法及权限未改。相关回归最初 75/87 通过，其余 12 项均为沙箱监听本机端口 EPERM；通过审批后定向补跑，包含这 12 项的 13 项筛选结果全部通过。另新增真实 catalog 的异步 scope/失败恢复测试通过。MCP 当前 770 行，剩余展示、确认来源及完整 Host Client 切换仍待完成，不把上述程序化回归当作最终用户 E2E。
6. 保证 Goal 做数据、安全、隐私、恢复和回滚验证。
7. Cutover 在 caller 清零后删除旧 Facade，完成全量测试、安装和发布验收。

### F2 已落地的边界

- 6 个 App、10 个 Foundation、16 个 Module、4 个 Horizontal Service、6 个 Native Plugin、5 个官方 Integration Plugin 和 1 个 Plugin CLI，共 48 个目标 package 已进入 pnpm workspace。
- `packages/contracts` 提供 30 个 Module / Service / Platform public subpath；目标 package 只通过公开入口声明依赖，FD3 允许官方 Integration Plugin 显式依赖 Plugin SDK。
- AR1 后 18 个目标 package 仍是 `contract-only`。Artifacts Module 因真实 Contract、Repository、migration 与 root composition 切片升级后，共 30 个 package 为 `partial`。
- 根 `@molis-ai/molis-work` 继续承载当前可工作的产品与发布兼容面。后续垂直 Goal 搬完真实调用链并完成行为对账后，才逐包改为 `partial`。

### F3 已落地的门禁

- `pnpm boundary:check` 扫描 48 个目标 package 的 public export、源码 import、manifest dependency、Contract 清单和依赖环。
- `pnpm boundary:test` 用四类失败样例固定 deep import、跨 Module Store/implementation、Plugin implementation 互相导入与 App 直接数据库依赖。
- `pnpm workspace:verify` 把门禁、目标 package typecheck 和 build 合成一条本地/CI 命令。
- 旧根代码通过 `tooling/boundaries/compatibility-allowlist.json` 明确记录迁移 Goal、移除 owner 和移除条件；新 package 没有豁免。

### FD1 已落地的接收链

- `packages/contracts` 已给 Sources、Signals、Connector Host、Listener Host 提供强类型 Query / Command / Driver / Raw Event / Receipt Contract。
- `modules/sources` 接管 Source desired state 和原 `feed_sources` schema；旧 `FeedStore` Source 方法只做兼容转发。
- `modules/signals` 建立正式 Signal 与 revision Repository，按 Project + Source + provider identity 去重。
- `horizontal/listener-host` 接管 cursor、lease、delivery、retry、quarantine 和原 `feed_source_runs`；旧 Source 行的 `cursor_json` 只作为一次性迁移输入。
- 现有 GitHub/Gmail caller 已走 Connector Host → durable Raw Event → Signal Receipt → 当前 Feed projection；FD3 已把 Driver/Adapter 的创建交给官方 Integration Plugin contribution。
- `tests/feed-receive-chain.test.ts` 固定失败不越过 cursor、同 operation 重启恢复、终态重放、并发 lease 和 poison event quarantine；原连接器和安全测试保持通过。

### FD2 已落地的 Feed / Attention 事实

- `modules/feed` 接管 `feed_items`、`feed_materials`、Signal revision reference、read/archive/disposition、promotion provenance、Feed 事件与 migration receipt。
- `modules/attention-resumption` 接管 `inbox_entries`、reference/reason/status 状态机与 Attention 事件；它只保存对象引用，不复制 Feed、Goal 或 Source 内容。
- Signal 新 revision 会更新同一个 Feed Item；重复 Signal 与重复 Attention 请求保持幂等。`tests/feed-module-repositories.test.ts` 覆盖创建、更新、处置和重启恢复。
- `src/feed/store.ts` 已降为 744 行兼容 facade；Feed/Attention Query、Command 和 migration 全部调用公开 Module API，不再持有对应表或状态机 SQL。
- Relay import 和 Goal advance 的 Feed 查询不再直连 Feed/Attention 表；boundary check 会拒绝这三个旧 caller 重新加入直连 SQL。
- Feed Native Plugin 在 FD2 固定消费 Feed/Attention public Contract；FD4 已补齐真实 UI contribution、HTTP route table 和 Workbench caller 切换。

### FD4 已落地的 Feed Native Plugin 与入口切换

- `packages/contracts/platform/ui` 定义 UI Contribution、Surface 与 Slot；`packages/ui-host` 提供真实注册和渲染，`apps/workbench` 通过公开入口注册官方 Feed contribution。
- `plugins/native/feed` 现在拥有 Feed 列表与详情、Source 管理、Connector 设置、调度、Relay 导入、空态、错误和重试 UI，以及既有 Feed HTTP route descriptor。Inbox 产品入口和 `/api/inbox` 已迁到 `plugins/native/inbox`。
- `src/web/render.ts` 已删除 Feed / Source renderer，只保留 Workbench Shell、Goal 决定内容的 Slot 贡献和一个宿主数据映射 adapter；`src/web/server.ts` 已删除 Feed/Inbox route 分支，只调用 Feed Plugin HTTP adapter。
- 现有浏览器交互选择器、API 路径、错误响应、来源配置和处理动作保持兼容；Feed/Attention 写入继续经过 FD2 的 Module-backed facade。
- `src/web/feed-native-plugin-http.ts` 是当前 Node Host 的兼容 transport adapter；跨 Feed→Goal 的 promotion 已在 GW4 改走公开 Goals Command，AP2 再把当前 Coordinator-based Host binding 换成本地 Host capability。不把这段装配职责吸收回 Feed Module。
- Inbox 插件拥有 Attention 产品入口：`plugins/native/inbox` 渲染独立目录/详情，`apps/local-host/src/inbox-native-plugin-http.ts` 匹配 `GET /api/inbox` 与 `POST /api/inbox/entries/:id/status`。完成/忽略只改 Attention 状态。`POST /api/feed/items/:id/inbox` 仍由 Feed HTTP 承担，但只创建或重开 Attention，不再改 `feed_items.disposition`，也不再把有 Attention 的行投影成 `item_type: inbox_message`。工作台不再接受 `feedPreset=inbox_message` 产品面；`GET /api/feed/workbench?preset=inbox_message` 返回 400。Feed snapshot 不再提供合并投影 `items`。历史 `inbox_message` 行仍由 `migrateInfoflowContractV2` 改成 `feed`。

### FD3 已落地的官方 Integration Plugin 样板

- `packages/plugin-runtime` 已实现签名绑定的安装身份、Manifest permission ceiling、grant、start、crash、bounded recovery、uninstall 与 Lifecycle Receipt；同一 `plugin_id + version + signature` 不允许静默替换 Manifest。
- `packages/plugin-sdk` 已提供 Manifest 校验、Plugin definition 和 polling Integration helper；它把 Provider port 统一暴露为 Connector Driver + Raw Event → Signal Adapter contribution。
- GitHub、Gmail、RSS、Web Query、YouTube 均有安装用 `manifest.json` 和公开 Plugin factory。GitHub/Gmail 是已接 caller 的参考实现；RSS/Web Query/YouTube 当前先固定同一 Contract 与安装身份，现有采集端通过注入 Provider port 兼容。
- GitHub Provider 已迁入 `plugins/official-integrations/github`；Gmail Provider、scope、history cursor 和错误归一已迁入 `plugins/official-integrations/gmail`，原 `src/feed/connectors/github.ts`、`gmail.ts` 与 cursor/scope 文件只保留凭据接线或 re-export 的薄兼容入口。
- `FeedConnectorService` 只消费 `OfficialIntegrationRegistry` 返回的公开 contribution，不再创建 Provider Driver、Signal Adapter 或携带 Provider-specific lifecycle 分支；Listener Host 继续完全不认识 GitHub/Gmail。
- `tests/plugin-runtime-integration.test.ts` 固定 install → grant → start → Signal → crash/recover → uninstall 主链，并验证签名隔离、grant 越权拒绝、版本未递增时拒绝 Manifest 静默变化和卸载后历史 Signal 保留。
- Runtime 当前是本地进程内实现；DV3 已提供开发安装记录持久化、源码调试 CLI 和签名工具。生产安装/发布归 DV4；独立进程/沙箱与升级 UI 不由 FD3 的历史验收代表。

### Goals Query 与 GW1–GW4 已落地的 Query、Command、Lifecycle、Planning、Repository 与入口迁移

- `packages/contracts/modules/goals` 现在公开 Goal、Relation、Policy、Risk、Project Guidance 的写入类型；`modules/goals` 通过 `GoalsModule.commands` 提供真实 Command API，并由 `GoalsRepository` 统一维护对应基础事实。
- `GoalsModule.query` 现在公开 Board/Goal、Relation、Risk link、Policy、Guidance 与 Goal-owned snapshot；旧 Store 的重复列表、关系、Risk、Policy 和 Guidance 查询已改为委托。Web、MCP、CLI 的 Contract/Policy/Guidance/回收站读入口调用独立 `goalQueries` 应用层，不再调用 Coordinator 查询实现。
- `MolisWorkCoordinator` 公开 `GoalsApplicationApi`，由 `commands`、`lifecycle`、`planning` 三个稳定子端口组成。GW4 已删除 `createGoal`、`updateDraftGoal`、Relation/Policy/Risk/Guidance、Lifecycle 和 Planning 的旧同名转发方法。
- `GoalsModule.lifecycle` 现在负责 Draft 接受、同一 Goal 的 Contract revision 递增、revalidate/complete、archive、trash/restore 和复合父 Goal 的完成协调。Contract revision 的跨 owner 影响通过窄 port 交给 Execution/Review owner，Goals 不直接访问其 Store。
- 归档、回收站、历史 Run/澄清修复、Active Goal 修复与 Contract coverage schema migration 已迁到 Goals public entrypoint；`src/v1/store.ts` 只按 migration id 调用，不再保存重复方法。`tooling/migrations` 提供只读升级对账工具。
- Lifecycle 已按归档、重新校验、完成、版本和迁移拆成小文件，没有把 Coordinator 中的旧大段逻辑整体搬成新 Huge Class。
- `tests/goals-command-module.test.ts` 直接验证公开 Command/Lifecycle API 和迁移失败回滚；`tests/v1.test.ts` 固定旧 caller 的版本连续性、幂等、错误、父子状态与历史迁移行为。`boundary:check` 会拒绝兼容方法重新持有 Goal Lifecycle SQL、重复 migration 或跨 owner Store。
- `GoalsModule.planning` 已接管 37 个内置方法的目录加载、项目方法版本递增与持久化、方法组合、完整 Runtime instructions、关系图校验、执行指标和 change impact。叶子粒度与复合 Goal 覆盖检查按职责拆分，单文件均低于 700 行。
- Workbench、MCP、CLI 分别通过自己的薄 adapter 调用 `GoalsApplicationApi`；adapter 不导入 Goals implementation、Store、SQLite 或 Coordinator。跨入口回归固定 payload、权限、错误、幂等和结果不变。
- 零 caller 的 `src/planning/` re-export 和 `src/v1/goal-decomposition-validation.ts` 已删除；Coordinator 内部需要 Goal 写入或规划判断时也调用公开 `goals` 端口。Proposal/Decision 存储没有进入 Planning，仍归 Governance。
- GW4 时 `src/v1/coordinator.ts` 从 15,168 行降至 12,423 行，EX1–EX3 继续降至 11,515 行。EX4 删除 16 个 execution-validation facade/query 方法后降至 9,752 行；新组合层按 claim（874 行）、run/rework（406 行）、evidence/review（695 行）和 78 行 application facade 拆分，没有制造新的千行类。

### EX1 已落地的 Execution Claim / Run 生命周期

- `packages/contracts/modules/execution` 公开 Claim、Run、lease、状态转换和 Query/Command API；`modules/execution` 提供真实 Repository、生命周期、schema 和历史 migration helper，状态升级为 `partial`。
- Claim/Run 的创建、续租、释放、撤销、开始、汇报、失败自动释放、租约过期和未结束 Run 恢复均由 Execution 状态机完成。Execution 不判断 Goal 是否 ready，也不写 Goal Contract、Evidence、Review、Session 或 Runtime process。
- `src/v1/coordinator.ts` 不再含 Claim/Run SQL。它保留动作资格、Goal Contract revision、幂等 Receipt 和跨 owner reconciliation，并通过 `ExecutionApplicationApi` / public Repository 调用 owner；Web/CLI/MCP 的最终薄入口切换仍归 EX4。
- `src/v1/store.ts` 的 Claim/Run schema、migration 2/6/7、migration 30 action backfill、映射和 snapshot 查询已迁出；Store 只在总 migration 中调用公开 helper。Project 删除保护也改读 Execution Repository。
- `tests/execution-module.test.ts` 直接验证 public Module 的 claim → renew → run → block/resume/complete/release 与 lease expiry/recovery；原 V1 测试继续固定幂等、并发、Contract pinning、错误和事件行为。

### EX2 已落地的 Evidence 与 Verification 门禁

- `packages/contracts/modules/evidence-verification` 公开 Evidence、Correction、locator、coverage 与 Query/Command API；`modules/evidence-verification` 接管 schema、migrations 17–20、migration 30 Evidence columns、Repository、文件/Markdown 预检、Correction 状态机和返工后的 criterion freshness，状态升级为 `partial`。
- Evidence Module 接受已经由 Goals/Execution application layer 授权的 `goal_id + contract_revision + criterion_ids + optional run_id`，不读取 Goal Store、不写 Goal 状态，也不拥有 Review verdict。Coordinator 继续负责 action token、幂等 Receipt、Run/Goal 授权和跨 owner lifecycle reconciliation。
- `src/v1/store.ts` 不再维护 Evidence/Correction schema、migration、mapping 或 snapshot SQL；`src/v1/action-projection.ts` 改调公开纯 coverage 函数；Web 项目引用通过 Evidence Query 和 locator public entrypoint 打开。旧 `src/evidence/locator.ts` 已删除。
- `tests/evidence-verification-module.test.ts` 直接验证 public Module 的 locator preflight、Evidence、Correction、criterion coverage、rework freshness、Review link、owner 与 cycle 规则；原 V1 测试继续固定历史 migration、Human Review、revalidation、错误和兼容入口。
- 完整命令、边界扫描、回归和未完成项见 [`EX2 Evidence 与 Verification 迁移验收记录`](../../specs/molis-work-architecture-reorganization/ex2-validation.md)。

### EX3 已落地的 Governance 与 Collaboration 事实迁移

- `packages/contracts/modules/governance-collaboration` 公开 Review、Proposal、Candidate、Rewire、Goal Tree Decision、确认来源以及 Query/Review/Records/Decision API；`modules/governance-collaboration` 的状态升级为 `partial`。
- Governance Module 接管 8 组正式表、migrations 3/9/10/14/27/28 与 Review contract revision 升级、Repository、Review obligation lifecycle、Proposal/Decision 状态机和跨 owner 决定的原子物化边界。
- `src/v1/store.ts` 不再维护 Governance schema、migration、mapping 或 snapshot SQL，只组合 Module 公开 schema/migration/Query。`src/v1/types.ts` 的重复 Governance 类型改成 Contract 别名。
- `src/v1/coordinator.ts` 不再持有 Governance 表 SQL 或具体 Repository；它只通过 `GovernanceApplicationApi` 提交已授权 Review、保存正式 Proposal/Decision，并调用目标 owner Command。Web/CLI/MCP/Action Projection 的最终应用入口切换仍归 EX4。
- Planning 仍只负责分析和校验，不保存 Proposal/Decision；被接受的 Goal/Relation 继续由 Goals owner 写入。Decision 与目标 owner 写入在同一 SQLite 事务中执行，失败时整体回滚。
- `tests/governance-collaboration-module.test.ts` 直接验证不同 reviewer、obligation 满足/重开、确认 provenance、非法状态转换和原子回滚；V1 回归固定历史 migration、冲突、部分/整案决定与旧入口行为。
- 完整命令、边界扫描、回归和未完成项见 [`EX3 Governance 与 Collaboration 迁移验收记录`](../../specs/molis-work-architecture-reorganization/ex3-validation.md)。

### EX4 已落地的执行验收入口与 Action Projection

- `plugins/native/goals` 现在公开 `ExecutionValidationApplicationApi`、Goal work/action projection、Contract revision 与 Human Review token 规则；旧 `src/v1/action-projection.ts` 等四个兼容实现已删除。
- `plugins/native/goals/src/execution-validation-application.ts` 组合 Query 与 Claim、Run、Verification 三组 command owner；原 `src/v1/execution-validation-*` 已退出。应用仅注入有限事务/快照/事件函数与模块公开 API，不接收旧 Store 或 Repository。Coordinator 仍装配并提供待迁的评价与跨模块组合，不因此视为已完全退出。
- Workbench、CLI、MCP 各自通过公开 adapter 使用同一应用端口；MCP 的 resume/trash read 也不再绕过 adapter。权限、action token、幂等、错误和恢复结果保持一致。
- Workbench 的 Claim、Run、Evidence、Review renderer 已迁到 `apps/workbench/src/execution-validation-ui.ts`；旧 `render.ts` 只注入翻译、图标、日期和引用显示能力。
- `tests/execution-validation-app-adapters.test.ts` 固定 CLI 领取 → MCP 报告 → Workbench Evidence/Review → Goal 完成的跨入口链，并覆盖错误 actor、stale token 和 UI contribution。
- `boundary:check` 会阻止 Coordinator facade、旧 projection 文件、App 绕过 adapter、render 规则回流和新 execution owner 超过 1,000 行。
- 完整对账见 [`EX4 执行验收入口迁移验收记录`](../../specs/molis-work-architecture-reorganization/ex4-validation.md)。

### AR1 已落地的 Artifact Core、版本与 Repository

- `packages/contracts/modules/artifacts` 公开精确 `artifact_id + version` 引用、版本记录、scope、producer provenance、opaque content 和 Query/Command API；`modules/artifacts` 是唯一 Artifact 事实 owner。
- 版本号由生产 Plugin 明确提供并严格递增。平台不区分“可变/不可变 Artifact”，也不维护 canonical head；同一 ID + version 的相同重放幂等，不同 envelope 不能覆盖。
- 小内容以规范化 JSON 保存并校验摘要，大内容保存 Storage 验证过的 reference、摘要和大小。兼容 consumer 不存在时，Artifact 仍可保存、交换和重放，平台不会解释自定义 payload。
- 一个 Artifact lineage 固定 producer Plugin ID 与 binding signature；Plugin package version 可以递增。binding signature 改变时必须视作新 Plugin / 新 Artifact，不能接管旧 lineage。
- 本地新建默认 personal；注册 `team_project` 版本必须带显式 Team 分享授权。AR1 只建立事实和权限边界，Server 同步与传输回执仍归 Exchange/Sync。
- `modules/artifacts` 接管 `artifacts`、`artifact_versions`、Repository 与 migration 31；`src/v1/store.ts` 只组合公开 schema/migration，`src/v1/coordinator.ts` 只暴露公开 `ArtifactsApplicationApi`，不保留第二套 SQL 或规则。
- 旧代码没有正式 Artifact 表，现有 Run output、Evidence locator、Feed/Session `content_ref` 只是各 owner 的字符串引用，因此 AR1 不猜测回填。AR3 再负责可浏览 UI、下载/嵌入和明确的旧结果转换。
- `tests/artifacts-module.test.ts` 固定版本递增、精确读取、权限、opaque payload、binding、摘要、缺失 consumer、不可用/归档与 migration；边界门禁同时保护官方 Artifact Plugin Contract 不吸收 Core Store。

### AP1 已落地的 Projects 身份与 Catalog 事实迁移

- `packages/contracts/modules/projects` 公开 Project、workspace membership、删除记录及 Query/Command API；`modules/projects` 通过一个 public entrypoint 提供 Repository、业务服务和 migration helper。
- `project_id` 是正式 Project identity。新建普通 Project 的 V1 `board_id` 与 `project_id` 相同；迁移旧数据库时保留原 `board_id`，它不再形成第二个产品概念。
- `projects`、`project_events`、`workspaces`、`workspace_project_memberships`、`project_deletions` 的 schema、SQL、映射和规则已退出 `src/projects/catalog.ts`，Catalog 只能调用公开 Projects Module API。
- Project 创建、选择、重命名、workspace 关联/修复/解除、Demo 重建、旧数据库迁移、删除收据和回滚保持旧公开行为。文件 staging 仍由兼容 Catalog 编排；WK1 已把 Runtime Session binding schema、mapping 和 SQL 移入 Private Work Context，AP4 已把 Desktop Panel 规则与 SQL 移出 Catalog。
- `tooling/migrations/audit-project-identity.mjs` 只读检查 Catalog owner/version、身份唯一性、`board_id` 兼容映射和 membership 引用；`tests/projects-module.test.ts` 直接验证 public module 与 schema migration，原 `tests/project-catalog.test.ts` 固定端到端兼容。
- `src/projects/catalog.ts` 在 AP1 从 2,955 行降至 2,392 行；AP4 移出 Desktop Panel 后进一步降至 2,104 行，没有把 Runtime 或 Desktop 职责错误吸收到 Projects Module。
- 完整命令、caller 清单、迁移审计与全量回归结果见 [`AP1 Projects Module 迁移验收记录`](../../specs/molis-work-architecture-reorganization/ap1-validation.md)。

### AP2 已落地的 Local Host composition

- `packages/contracts/platform/app-host` 公开 versioned Capability、Project reference、Host Client 和 Host status；`packages/kernel` 提供不含业务事实的 Capability registry。
- `apps/local-host` 按 Project storage key 只打开一份 Runtime，并负责 Capability 串行调用、身份冲突拒绝、关闭等待与重启恢复。
- `src/local-host/composition.ts` 是迁移期唯一 `Store + Coordinator` 构造点；`src/web/server.ts`、`src/mcp/server.ts`、`src/v1/cli.ts` 已删除自己的构造代码。
- Web Feed scheduler 复用 Host Store，不再为同一 Project 打开第二个 writer。个人规划方法更新后由 Host 统一重开已发现 Runtime。
- CLI、MCP 与 Workbench 风格 Client 的同 Host fixture 固定相同事实、幂等结果、单次 runtime open 和重启恢复。当前 transport 是 embedded/in-process，未把未来 daemon/IPC 伪装成完成。
- 详细边界见 [`Local Host 与 Host Client`](../platform/LOCAL-HOST.md)；命令、caller 清单和全量回归见 [`AP2 Local Host Composition 迁移验收记录`](../../specs/molis-work-architecture-reorganization/ap2-validation.md)。

### AP3 已落地的 Workbench / UI Host / Design System

- `apps/workbench` 已接管稳定 HTML 文档 Shell、三个命名 Slot 和浏览器静态资产；旧 Web renderer 只把尚未迁出的产品页面 body 交给 Workbench 装配。
- `packages/contracts/platform/ui` 公开 surface 与 mount Contract，`packages/ui-host` 校验 contribution、surface、目标 Slot 和 format；Feed Native Plugin 已按公开 Slot 声明并通过 Host mount。
- `packages/design-system` 已接管主题/密度偏好、browser bootstrap 和分层视觉样式。`src/web/visual-foundation.ts` 从 7,979 行降为 15 行兼容 re-export，原 CSS、client 和 bootstrap 输出逐字节一致。
- Workbench browser CSS/JS 已从 `src/web/render.ts` 迁入按样式层和客户端职责拆分的文件；15 个静态资产常量与迁移前逐字节一致。全局 `src/web/i18n.ts` 从 3,710 行降为 140 行语言 runtime，当前 EN 产品文案暂存于 Workbench compatibility catalog，等待各 Native Plugin UI Goal 就近接管。
- `src/web/render.ts` 从 14,028 行降为 6,129 行，已退出 Shell、Design System、UI Host、browser asset 以及 EX4 Claim/Run/Evidence/Review renderer 职责。剩余 Goals/Artifact/Work/App Shell 页面分别由 GW5/AR3/WK3/AP4 迁移。
- 详细分工见 [`UI Platform`](../platform/UI-PLATFORM.md)；命令、caller 清单和回归结果见 [`AP3 Workbench / UI Host / Design System 迁移验收记录`](../../specs/molis-work-architecture-reorganization/ap3-validation.md)。

### AP4 已落地的 Desktop / Tauri Shell

- `apps/desktop` 已接管原生 Shell 检测、Runtime 启动配方、Goal 推进提示、Desktop Panel lifecycle 和 Capsule presentation；真实 caller 使用 package public entrypoint，旧 `src/desktop/` 与 `src/web/desktop-shell.ts` 只转发。
- Desktop Panel 的用户确认、绝对工作目录、状态、Session alias 和 Project event 规则已退出 Project Catalog；`src/projects/desktop-panel-adapter.ts` 只保存 SQLite schema/Repository。生产 caller 使用 `catalog.desktopPanels`，旧 Catalog 方法只供兼容调用。
- `src/web/capsule.ts` 从 1,044 行降为 496 行，只保留状态 read model 与兼容环境注入；576 行 Capsule CSS/client/HTML shell 由 Desktop App 拥有。
- 原 1,473 行 `desktop/src-tauri/src/main.rs` 已删除并迁到 `apps/desktop/adapters/tauri/src/`，按窗口/Capsule composition、PTY、本地 Web service、Runtime environment 拆成 812/327/327/36 行。`desktop/src-tauri/` 只保存 Cargo/Tauri 发布配置并指向新 adapter。
- 当前真实能力包括窗口/菜单栏/Capsule、PTY、本地服务恢复、内置 Runtime 升级修复和显式 Tauri permissions。系统通知按钮在基线中就是禁用占位，Desktop Keychain 也未实现；AP4 不注册假能力，未来实现仍放在 Desktop adapter。
- 详细边界见 [`Desktop App 与 Tauri`](../platform/DESKTOP.md)；caller、Huge Class 与回归证据见 [`AP4 Desktop / Tauri Shell 迁移验收记录`](../../specs/molis-work-architecture-reorganization/ap4-validation.md)。

## 2. 当前路径

| 当前路径 | 当前状态 | 目标 | 主要迁移 Goal | 退出条件 |
| --- | --- | --- | --- | --- |
| `src/index.ts` | `legacy-mixed` | Contracts subpath + Module public entrypoint | F3、各垂直 Goal、最终 Cutover | caller 改用明确 Contract；根 barrel 只保留有期限兼容或删除 |
| `package.json`、`pnpm-workspace.yaml` | `workspace-root + legacy-release` | workspace root + 各 package manifest | DV4 | 48 个目标 package 已接入 build/typecheck；最终发布清单与实际产物仍由 DV4 / Cutover 对齐 |
| `src/v1/` | `legacy-mixed + public application ports` | Goals、Execution、Artifacts、Evidence、Governance、Context Ledger | AR1–AR2、EX1–EX4 | AR1 已移出 Artifact 正式事实，EX4 已移出执行验收 facade；Ledger、Draft Dialogue/Goal Tree Decision 入口和最终 Cutover 完成后删除 Coordinator |
| `src/feed/` | `thin-facade + app-auth compatibility` | Sources、Signals、Feed、Attention；Connector/Listener/Scheduler；Integration Plugin | FD1–FD4 | FD1–FD4 已移出事实 owner、接收链、Provider/Adapter、UI 与 route owner；后续 App cutover 删除凭据与旧公开来源接线 facade |
| `src/sessions/` | `thin Private Work Context + Runtime compatibility composition` | Private Work Context、Runtime Host、Work Plugin | WK1 已迁事实 owner；WK2 已迁 Runtime Host/Adapter；WK3 继续 | registry/content-store/codex-transport/adapters 已变薄；registry fallback、resume、handoff 与 UI caller 清零后删除兼容入口 |
| `src/projects/` | `thin-project-facade + app composition + Desktop forwarding` | Projects Module、Local Host、Private Work Context、Desktop App | AP1、AP2、AP4、WK1 已迁；Cutover 清 facade | Project/Runtime binding/Desktop 事实均已退出；文件 staging 和旧 Panel 方法 caller 清零后删除兼容 Catalog |
| `src/planning/` | `retired` | Goals Planning | GW3、GW4 已完成 | 零 caller re-export 已删除；Planning 不拥有 Proposal/Decision 事实 |
| `src/web/` | `legacy-product-ui + Local Host client` | Native Plugin UI、App Shell 页面、route adapters | AR3、WK3、AP4、GW5 已有对应迁移结果；最终 Cutover 待执行 | GW5 整项工程验收含项目工作规则已齐；Goals contribution/copy/client/route 与 Workbench 页面/请求装配分离。root renderer 3,827 / server 3,353，175 项串行回归通过。剩余跨 Execution/Decision/共享 Shell/兼容 caller 见 gw5-caller-audit.md，完整证据见 gw5-validation.md；总产品 E2E 与旧路径清零尚未完成 |
| `src/mcp/` | `legacy-mixed + Local Host client` | `apps/mcp` thin adapter | AP2、GW4、EX4 已迁；DV1、DV2 继续 | Goal 与 execution-validation 已接 App adapter；协议、schema、audience 已迁，context 与 Host 组合继续清理 |
| `src/cli/` | `legacy-mixed + Local Host client` | `apps/cli` thin adapter | AP2、GW4、EX4 已迁；DV1 继续 | Goal 与 execution-validation 调用已接 App adapter；其余只解析参数、调用 Host Client、展示结果 |
| `src/desktop/`、`desktop/` | `thin-forwarders + distribution-config` | `apps/desktop` 和就近 Tauri Adapter | AP4 已迁；DV4 继续 | AP4 已分离 Native Bridge 与业务 owner；DV4 完成发布配置、签名、公证与安装升级验收，Cutover 删除旧转发 |
| 原 `src/install/` | `removed` | Local Host installer；Projects 只读 catalog facts | DV4 代码迁移完成，分发验收仍进行中 | 旧 caller 已切公开 API；release scripts/Tauri/provenance/SBOM 和干净完整安装链尚待验收 |
| `src/evidence/` | `removed` | Evidence & Verification | EX2、AR1 已完成对账 | locator 已归 Evidence public entrypoint；Artifact Core 没有从此处继承第二套内容规则，目录保持删除 |
| `skills/goal-advance/` | `public-protocol` | Runtime 集成发布面 | DV2 已完成；DV4 分发 | 只消费正式工具 Contract 与 transition；安装版本与真实恢复仍需 DV4 验证 |
| `scripts/` | `legacy-mixed` | Release scripts 与 `tooling/migrations` | DV4 | 可复现、可回滚，迁移脚本有明确生命周期 |
| `.github/workflows/` | `partial-boundary-active` | Monorepo CI、boundary gate 与发布流程 | F2、F3、DV4、最终 Cutover | package 门禁已启用；全量产品测试、签名、公证、SBOM 和发布候选仍由 DV4 / Cutover 完成 |
| `vendor/` | `legacy-mixed` | 依赖 owner 与发布供应链 | DV4 | provenance、license、hash、SBOM 可追溯 |
| `tests/` | `legacy-mixed` | 对应 package tests + `packages/test-kit` | 每个垂直 Goal | 测试按行为 owner 迁移，共享工具不携带业务断言 |

## 3. 兼容入口

迁移初期允许保留根 package、`MolisWorkCoordinator`、旧 Web route/render 和旧 Store 方法，但必须遵守：

- 只能调用新 public API，不保留第二套业务判断或双写事实。
- 在本表或 package README 记录剩余 caller、兼容版本和删除 Goal。
- 每迁移一个 caller，就在同一变更更新矩阵。
- caller 清零、数据对账、错误兼容、回滚和测试通过后立即删除；不能无限期保留。

## 4. 每个垂直切片的最低交付

```text
Contract
→ Module / Repository
→ Horizontal Service（如需要）
→ Local Host Capability
→ Workbench / Native Plugin UI
→ CLI / MCP adapter（如已有入口）
→ compatibility test
→ package README + 本迁移矩阵
```

只搬文件、只建目录、只通过类型检查或只拆成更多小函数，都不算完成迁移。

## 5. 回滚

- 在新 owner 接管写入前固定现有行为与数据基线。
- 数据 migration 必须有输入版本、幂等策略、备份、对账和恢复步骤。
- caller 切换按入口分批进行；旧入口在兼容期只转发，便于回切。
- 不允许新旧 Store 同时成为权威；临时双写必须有单独 Spec、对账和截止点。
- 最终 Cutover 前由保证 Goal完成备份恢复、权限隔离、Secret、私人 Session、依赖故障和诊断演练。
