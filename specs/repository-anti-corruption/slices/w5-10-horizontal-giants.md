# W5-10 C3：横向服务与 IM views 等价拆分

状态：四单元源码拆分、定向工程验证与准确基线门禁完成，固定 PR 交 Claude 首评/独立 TEST/统一 full 与集成。Codex（实现 1）承接 C3 第二完整区域；Gmail 作者树保持冻结，后续增量归专职。C1 与 C3 整体未完成、原 owner 保留，本片不代表整线关闭。

2026-10-24 首评维护增量（FIX6，基线 `8abab965c1f75bfb1ae1f695530a5d1a1312309f`，FIRST `6393236358`）：只处理三项非阻塞意见。IM 的滚动说明归回 `restoreScroll` 旁，以一行说明跟随、保存位置与重绘补偿，不改执行语句；函数仍在 150 行以内，序列化脚本可解析且不超过原 81,646 B 预算。Listener 的构造 options 只提为模块私有命名接口，字段、可选性和回调类型不变、不增加公开出口；投递辅助函数的依赖改为一个对象，保留原 options 引用、晚取时钟/cursor 回调、`beforeEffect` 的调用位置、Signal 回执后的写点及事务行为，持久化参数仅整理缩进。Placement 只去多余空行并把私有回调类型改称 `PlacementInstanceAccess`。

本轮按 **RAC-129-LISTENER/PLACEMENT/IM** 核收：复用原 28 文件 205 项的原范围与原件，不重跑 Search 或完整集合；Listener 参数分组后跑既有接收者/撤权回执与 README 回归，Placement/IM 按修改风险及 README 验证。核 Listener options 的双向结构类型、公开出口不增加、Placement 执行代码等价、IM 下发脚本的执行 AST 等价、解析与字节预算，再做实际 merge-base health、边界、资源和推前 fresh-fetch/secrets。构建走公共单槽；不重做 FIRST、不另起 full、不改门禁或新增豁免，不扩到 PG-095 或其他公开合同。若来源已被 carrier 冻结，只交独立固定候选由 PIPE 吸收，不推进原分支。

准确基线 `584112c65477baf907620d86657d1582d92e9eda`，独立 `feature/c3-horizontal-giants` 工作树。开工鲜核 199 个工作树，仅查四个目标目录，均无改动或未跟踪文件；24 个 open PR 的 23 个头与已核完整路径的头一致，增量鲜读 #1249 路径，四目录均无重叠。当前实际 AST 为 ListenerHost 361 行/18 方法、SearchService 392 行/25 方法、PlacementService 399 行/28 方法、createViews 162 行；其余单元不重做。现行上限：文件 800、类 300 行/25 方法、函数 150 行，不放宽、不加例外、不刷新公共 baseline 或预算。

落生产源码前再次只核四目录：200 个实际工作树无 dirty owner，25 个 open PR 中 7 个新增/变头逐个鲜读完整路径，仍无实际重叠。带新增接收者/关闭交错断言的 14 文件 109 项先在原实现通过；IM 增加真实节点复用/焦点断言的原浏览器用例也在原实现 1/1 通过，再应用完整四单元拆分。

Listener 的投递转换、Signal 回执后的记录与批量持久化提为同文件函数，显式传入原 db/signals/options 及按调用时取值的时钟/cursor 操作。run、租约、checkpoint、重放与失败边界留在原实例；相同数据库的事务范围和回执后推进保持。Search 只抽同步索引、条目正文读取、来源/状态投影等函数，map、计时器、inflight 与 close 留在原类。同步过程中闭包按原位置重新读取 changeSeq/closed，时钟与 options/indexer/onError 的原接收者保持；query 的 ACA005 原始授权异步复核与同步尾检不改。

Placement 将目标/Goal 查询、复制与转换、位置显示等明确职责提为同文件函数；所有公开方法签名保留，read/locate/remember/open 以原实例的晚绑定函数传入。ports 每次调用仍属于原服务，beforeEffect 不增加异步间隙、不移过提交点。移动及恢复 S-35 实现不改，真实对象读取、部分成功、已知位置和关系语义保持。IM 只抽 chrome markup/cache/focus 操作，根节点与两份 WeakMap 仍由每次 createViews 创建并持有。client 对序列化函数显式注入该私有函数，controller/样式/协议不改；把相关说明移到函数外，保持说明并避免增加下发脚本预算，不改 HTML 字节或交互规则。

- **RAC-129-LISTENER**：类降阈值；回执前不推进 cursor、租约互斥、投递重试/隔离、终态重放、同库原子性和中断恢复不变，端口与 options 方法接收者保持。
- **RAC-129-SEARCH**：类与方法数降阈值；每实例变更序列、map、timer、inflight、close 独立；变化/失败恢复不丢原索引；调用者与 owner 的范围分离、ACA005 有效拒绝保持。
- **RAC-129-PLACEMENT**：类与方法数降阈值；真实 owner 读取、位置/Goal 关系、复制/转换/部分成功、beforeEffect 和权限保持，现有 S-35 拒绝与移回路径通过。
- **RAC-129-IM**：createViews 降阈值；root、WeakMap 按实例隔离、escape/focus/DOM 复用、阅读位置、跟随及复制保持；真实下发脚本无缺失闭包，既有 im-follow-copy 专用浏览器用例通过，资源不增长。

先整体构建基线并跑四包 README 定向用例，补复用 Search 生命周期/ACA005、Placement S-35 等有效回归。只有关键移动风险缺覆盖时才补真实公开入口或真实 DOM 回归，并先在原实现核通过；不重复 Gmail 115 项。改 source 后整体 build 经公共机器槽，随后同一相关集合及 im-follow-copy（专用测试 Chrome/隔离 Home）验证；失败按同一基线归因，不放宽断言。核类型、边界、API/动作快照无 diff、准确 merge-base health、资源与 fresh-fetch secrets，full 按实际 affected 交 Claude 唯一统批。对应 README 与 HUGE 表仅本区域四行同步；最终固定 head/完整 diff/原始日志/未验证边界/源码 RELEASE 直交 PIPE 与 TEST，由 Claude 首评，必要修复后 Codex 增量复查。Memory、scheduler、agent-host、design-system、官方 catalog 例外及 C4 OAuth 迁移不在本片。

2026-10-24 工程核验：**RAC-129-LISTENER/SEARCH/PLACEMENT/IM 通过**。用现行 gate AST 在同一基线上测四巨大单元→0：361/18→289/18、392/25→283/21、399/28→286/20、162→149；相关文件分别 760/597/540/169 行，无新超限函数或类。真实下发 IM 脚本 81,646→81,448 字节（减少 198），HTML 渲染、controller 与交互规则未改。

基线完整 build、拆分后完整 build 经机器槽通过。原实现 14 文件 109 项与浏览器 1 项先绿，拆分后同组仍全绿；补跑影响面消费者与权限/证据/国际化相关的 13 文件 95 项也通过，合计 **27 非浏览器文件 204 项 + 1 浏览器文件 1 项 = 205 项**，无 skip/retry。IM 原/新各一次真实源码 Host/侧栏/iframe，验证未改行的 DOM 身份、chrome 焦点、跟随、保留历史阅读位置和实际复制；测试 Chrome 与临时 Home 由公共 test-kit 收尾。

9 个相关源码/测试文件 Biome 通过，包边界通过；四份修改测试的 strict TypeScript 通过。追加 strict 首次发现基线原有 `feed-receive-chain` SQL 聚合行缺少类型（原行 486、变后行 490，均 TS2339），在同一测试补明既有 `COUNT(*) AS n` 行类型，运行断言和值保持；原/变后诊断对照保存在原始包。四包公开导出键、三类构造参数与公开实例成员、其余导出的双向类型赋值通过；私有方法拆出不是公开合同变化，contracts/SDK/API/动作/Manifest/公开入口均未改。健康门禁对准确 merge-base `584112c6` 通过：全仓巨大单元 96→92，只有 giant 指标下降、其他数字没有增长，72 份公开 API 快照匹配。页面资源门禁对同一 merge-base 通过（27 资源、7,638,717 字节），公共预算与 baseline 文件不动。

实际 affected 因 4 包变更要求 full，仍交 Claude 唯一组成批，作者未另起 full。选择中只有测试选择器自身回归未跑（选择器实现未改）；IM invitations 与 Placement card clearance 浏览器未跑，未涉及的流程留统一批/独立 TEST 按风险接续。额外 ACA005 真实 MCP 及 Search 生命周期虽不在默认选择中，也已定向通过。不宣称真实 Home/跨设备/本人验收。原始构建、前后用例、浏览器、类型、测量、影响清单、边界、资源与最终门禁保存在 `/tmp/molis-verify-2026-10-24/c3-horizontal-giants/`；固定 head 和 fresh-fetch 后密钥扫描随 PR 交付。
