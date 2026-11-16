# 审查覆盖记录

状态：代表入口静态检查完成，动态验证进展见报告；初始基线 `efdaa3376`；增量同步至 `bd537b7d9`（2026-11-16）。本表只记录已做的检查，不将登记核对或构建通过当成业务路径验收。全部 73 个包的路径、成熟度、公开出口已从登记表和 package.json 核对；各包均按下表选择代表入口检查实际调用链；“静态检查”不等于全文件逐行审计或真实外部服务验收。动态证据仅限报告列明的测试。

| 包 | 登记成熟度 | 公开入口 | 路径审查进度 |
| --- | --- | --- | --- |
| `modules/sync-replication` | slice | `.` | `src/index.ts:92,131,151,169`：自动同步、策略保存、停用、批次与回放；身份/策略版本复核保留。未连真实云端。 |
| `apps/server` | experimental | `.` | `src/main.ts:38`：成员授权、配置允许集合、单 Host 转发与退出清理；未开公网服务。 |
| `server` | production | `.` | `src/im/writes.ts:26`：成员内幂等回执与提交后通知；`src/sync/round.rs:8`：策略版本快照。未跑真实 D1。 |
| `packages/im-ui` | production | `.` | `src/browser/controller-sync.ts:10,34`：SSE、epoch、刷新合并和失败保留草稿；不把两个排队标志改成业务状态。 |
| `packages/plugin-sandbox` | production | `.` | `src/runner.ts:31` 与 read protocol：子进程身份、调用限额、取消和受控服务；旧 BL 的进程内执行说法过时。 |
| `apps/desktop` | production | `.` | `src/web-host.ts:12,28`：桌面装配复用 Local Host；终端可用性归 runtime-host。未实操系统 WebKit。 |
| `apps/workbench` | production | `.`、`./terminal` | 资料导入→成果服务、attention→后台列表、chooser→brief、插件 frame→挂载/输入、角色确认。QF-01 实操；其余代表路径静态及必跑回归。 |
| `apps/local-host` | production | `.` | 动作 HTTP→Kernel→owner；项目/ Home 插件登记、background aggregate、单一项目删除、sourcePull、Memory 身份接线。QF-04、PF-03。 |
| `apps/cli` | production | `.` | `src/dispatch.ts`：命令分发与既有 Home 入口；不另开执行事实 owner。安装/公开发版未做。 |
| `apps/mcp` | production | `.` | `src/action-tools.ts`：实时目录→公开动作→Kernel 再授权；输入 _meta 不提供身份。 |
| `packages/contracts` | production | `./modules/sync-replication`、`./platform/sync-transport`、`.` 等 82 个子路径 | action-input、object-link、plugin-manifest、plugin-sandbox、公开状态：声明与输入/输出的单一合同。公开零引用不等于死代码。 |
| `packages/kernel` | production | `.`、`./contextual` | action-schema、action-settlement 与执行控制：输入校验、call/invocation 关联、嵌套调用、beforeEffect；保留异步后授权复核。 |
| `packages/plugin-runtime` | production | `.` | activation-jobs、notification-queue 与调用身份：激活代次/迟到提交、停止与 drain、事务内通知及稳定幂等键。 |
| `packages/plugin-sdk` | production | `.`、`./highlight`、`./rich-text` 等 13 个子路径 | state-machine、execution-lifetime、browser、sandbox-read-protocol：CAS 状态迁移、取消资源、请求方法差异和生成插件读协议。 |
| `packages/storage` | production | `.` | `src/sqlite-owner-boundary.ts:19,59`：SQLite 实际 prepare/step 授权、finally 清理；升级/快照公开入口核对。未执行存量迁移。 |
| `packages/ui-host` | slice | `.` | `src/index.ts:76,107`、declared-mount-host：登记 surface、owner 与位置兑现；另追 Host surface-slot-http 与 surfaces/position 的受控 plugin-slot，以及 Inbox/Risk/Work Brief 的 UI contribution 声明和 surfaceSlot 消费者，不重建槽能力。 |
| `packages/design-system` | production | `.`、`./produced-text`、`./capability-pack` 等 4 个子路径 | composer-rules 的草稿身份、输入法/发送规则、迟到代次；公开组件/语义样式入口。导入沿用现有组件。 |
| `packages/test-kit` | slice | `.`、`./browser`、`./local-host-http` 等 4 个子路径 | browser launch/close、隔离目录与 CDP；本轮实际使用独立浏览器、临时 Home、真实成果库。 |
| `modules/projects` | production | `.` | project-service、project-deletion：创建/成员/目录事实，删除预检与阶段回执；Host 唯一删除服务保持。 |
| `modules/context-ledger` | slice | `.` | `src/service.ts:28,60,77`：引用完整性、scope 授权、追加版本和 remove；不拥有 Feed/Session 业务状态。 |
| `modules/acceptance` | slice | `.` | state、service：要求版本→交付/证据→机器核对→人认可；状态由事实推导，个人范围仍未完成。 |
| `modules/attention-resumption` | slice | `.` | `src/index.ts:47,99`：显式转换、owner/subject 唯一约束、事件与版本；Inbox 消费服务。 |
| `modules/private-work-context` | slice | `.` | project-setup、project-resolution：确认后稳定请求身份、绑定与创建事务，显式解绑不被历史线索覆盖。 |
| `modules/artifacts` | production | `.` | artifact-document-import、service、original-store：导入固定版本、原件、去重/来源；本轮 UI→HTTP→真实记录已验。 |
| `modules/shelf` | slice | `.`、`./contract` | jobs、job-steps、copy-checks：只读原件副本、任务生命期、写前权限和结果提交；取消后不补业务失败记录。 |
| `modules/characters` | slice | `.` | service 与工作台 client：草稿 CAS、冻结发布、启停/删除、保留未提交内容；确认是否可减少列策略。 |
| `modules/judgment-rules` | production | `.` | authoring-actions、declared-rules：预览/发布前样本、绑定场景、await 后 beforeEffect；规则版本仍归 owner。 |
| `horizontal/account` | slice | `.` | session-refresh 与 session-state：Host 单次轮换、多请求各自取消；不取消仍被合法等待者使用的刷新。 |
| `horizontal/agent-host` | production | `.` | prologue-run-store、approvals、reviews、恢复：账本终态与控制意图区分；显示时间另有阻塞耦合 QF-06。未新增真实模型调用。 |
| `horizontal/connector-host` | production | `.` | `src/index.ts:38,67`：受控驱动调用、超时、当前连接复核和闭合失败；Provider 数据仍在集成边界解析。 |
| `horizontal/runtime-host` | slice | `.` | adapters/terminal-pty：独立 PTY、环境键过滤、辅助程序与回放上限；未启动用户真实终端任务。 |
| `horizontal/scheduler` | production | `.` | `src/index.ts:252,274,392`：持久租约、唤醒、续租、取消和最终 lease 检查；与插件业务排期分离。 |
| `horizontal/observation` | slice | `.` | service、records：调用出口采集、事实归属、覆盖缺口与 call/invocation 关联；采集失败不回滚业务。 |
| `horizontal/evaluation` | slice | `.` | run-executor、observation-bridge：获准样本→观测证据/隔离回放→unknown分类；补核#2100的完整分页、留存事实复核、取消补偿和样本统计；相关3文件20项通过。逐条证据读取归PF-13；未把mock评测当真实体验。 |
| `horizontal/memory` | production | `.` | service.write、run-recipe、Host memory-sources：显式原话/来源、插件命名空间、作用域与写入；Coding 特判见 PF-03。 |
| `horizontal/knowledge` | production | `.` | organize、catalog：索引→惰性正文→模型卡片；正文版本复核、截断标识与未知来源保留策略。 |
| `horizontal/search` | production | `.` | query/open 及索引同步：目录发现→等待→原调用身份复核→读；第二次 discover 是安全边界。 |
| `horizontal/appearance` | slice | `.` | selection：选择事实与可用显示分开；失效时保留原选择并呈现恢复项；原子写不因返回错误冒认失败。 |
| `horizontal/kit` | production | `.` | `src/index.ts:25`：声明 reporter 汇总，系统代报白名单属于可信来源边界；不存第二份能力事实。 |
| `horizontal/mainline` | slice | `.` | index 的后台读取、command、事件：保留 issues、重新读取 offered command 再执行；Home 丢 issues 是消费方缺口。 |
| `horizontal/placement` | production | `.` | project-copy-execution：预览指纹→身份计划→owner prepare/apply→发布；仅声明依赖等待可重试，不吞其他失败。 |
| `horizontal/surfaces` | slice | `.` | composition/fallback：声明发现、授权、组合缓存与 revision；降级只用允许的本地只读动作。 |
| `plugins/official-integrations/catalog` | production | `.` | document-import、http/provider：有限时外部读取、每次 dispatch 检查、HTTP200 业务错误分类；未连真实 OAuth。 |
| `plugins/official-integrations/github` | production | `.` | provider：受控网络、真实/fixture 显式分开、闭合错误与凭据不入内容行；未调用真实账户。 |
| `plugins/official-integrations/gmail` | production | `.`、`./history-cursor`、`./scope` | provider-sync/history-cursor：分页边界、仅完整历史记录推进游标、失败重放与限额；未调用真实账户。 |
| `plugins/official-integrations/rss` | production | `.`、`./host` | pinned-request/host：DNS 固定地址、TLS、压缩/大小限制、取消后释放；不是可直接换普通 fetch 的重复层。 |
| `plugins/official-integrations/web-query` | experimental | `.` | index 工厂及仓内调用方：工厂无生产消费者；实际查询经 Host SEL/AnySearch。公开退役候选，未删除。 |
| `plugins/official-integrations/youtube` | production | `.` | channel 归一化→Host source-vocabulary→公开 RSS；工厂无仓内调用，channel 工具仍被生产使用。 |
| `tooling/plugin-cli` | production | `.` | validate/package-files：只读 manifest/locales，不执行入口；CLI 打包/签名链登记，未生成发布包。 |
| `plugins/native/alchemist` | slice | `.`、`./registration` | SqliteJobRunner、action-operations：持久 job、lease/attempt、取消与事务 fence；Host 特殊装配是已登记例外。 |
| `plugins/native/coding` | production | `.`、`./contract`、`./registration` | session-observation 与 session-lifecycle：只读投影默认不落库；归档业务/执行两份不同 owner 事实并可接续半成功。 |
| `plugins/native/cognia` | production | `.`、`./registration` | actions、ai、drafts：输入材料→模型引用校验→授权写入；saved_id 由资料存在性推导。 |
| `plugins/native/dataset` | production | `.`、`./contract`、`./registration` | actions、promote：模型输入版本、await 后授权/CAS；数据与成果固定在联合事务提交。 |
| `plugins/native/diff` | production | `.`、`./registration` | registration/actions/comparison：公开读取固定版本、变更集与文件，SDK diff 呈现；未私读其他插件存储。 |
| `plugins/native/feed` | slice | `.`、`./contract`、`./registration` 等 4 个子路径 | 来源/条目/入箱/规则动作、回放、后台连接、来源删除；QF-02、QF-05 已改，实际业务回归中。 |
| `plugins/native/form` | production | `.`、`./contract`、`./registration` | actions/plugin/store：版本写入、发布固定资料、收集关闭可重开；拒绝旧报告的终态化建议。 |
| `plugins/native/git` | production | `.`、`./registration` | actions/routes/drafts/browser source/conflicts：公开工作区/目录、操作回执与草稿入口脱节 QF-03。 |
| `plugins/native/goals` | production | `.`、`./contract`、`./module` 等 6 个子路径 | actions/module lifecycle-archive：满足后归档、回收恢复、事务回执/事件/active 清理；Goals 平台特判待第44批。 |
| `plugins/native/images` | production | `.`、`./contract`、`./registration` | service-job/background/browser request：Runtime job→受控厂商→文件→结果；取消不写业务，孤儿文件下次授权启动回收。 |
| `plugins/native/inbox` | slice | `.`、`./registration` | actions/content/scene：通过 Feed 公开动作取材料、Pages 生成、attention 状态；失效主体保留事项。 |
| `plugins/native/issues` | production | `.`、`./registration` | capture/store：临时采集、取消删草稿、保存前身份/CAS、稳定草稿ID 去重；并发不重复记录。 |
| `plugins/native/jelly` | production | `.`、`./contract`、`./registration` | ai/command-actions：模型只出预览计划，原文 hash/版本确认后提交；日历重复规则是业务而非 scheduler 副本。 |
| `plugins/native/lingguang` | production | `.`、`./contract`、`./registration` | content-actions/actions：公开内容交接、request_id 去重、生成回复前快照与取消检查；部分材料显式标记。 |
| `plugins/native/pages` | production | `.`、`./contract`、`./registration` 等 5 个子路径 | actions/ai-run/删除撤销：写作助手不静默用假结果，简短命令验证变短；版本、保存和撤销归 Pages。 |
| `plugins/native/plugin-builder` | slice | `.`、`./registration` | manifest/agent-state/workflow/SDK sandbox：执行token、暂停恢复、生成合同与进程沙箱；BL040/055 需改旧描述。 |
| `plugins/native/ppt` | production | `.`、`./contract`、`./registration` | actions/promote：Pages 经公开动作读取、模型草稿后版本检查、联合成果提交；保留授权绑定。 |
| `plugins/native/risk` | experimental | `.`、`./registration` | review/actions：关闭后复查归档、串行安排及部分失败可见；历次结果/采纳仍在 BL。 |
| `plugins/native/schedule` | slice | `.`、`./registration` | registration/plugin：业务排期归本插件、平台 scheduler 负责持久唤醒与授权；不另造计时器。 |
| `plugins/native/shelf` | slice | `.`、`./registration` | actions/runtime-actions/plugin→modules/shelf：内容与配方入口，文件/任务事实归资料架模块；复用平台后台能力。 |
| `plugins/native/text-stats` | production | `.`、`./registration` | registration/actions/core/ui：公开材料→纯计算→显示，无第二存储或模型入口。 |
| `plugins/native/todo` | production | `.`、`./contract`、`./registration` | organize/actions/store-writes：模型解析有限修复、请求去重、最终事务/CAS、归档需已关闭。 |
| `plugins/native/work-brief` | experimental | `.`、`./registration` | next：running 丢执行进程后 unknown；仅 failed/later 可执行，未知先人工核对避免重复副作用。 |
| `plugins/native/workflows` | production | `.`、`./registration` | run-control/continuation/handoff：持久停用 fence、原请求身份、CAS 交接与部分成功回执；重试不重演未知副作用。 |

另查：`server/src/sync`（Rust 业务）与 `apps/sync-worker`（Cloudflare 入口）不计入 pnpm 包数，已核：Cloudflare fetch/scheduled 直接委托 server/src/sync；round 按空间/策略 revision 查询，变更中拒绝部分结果。未执行线上迁移。
