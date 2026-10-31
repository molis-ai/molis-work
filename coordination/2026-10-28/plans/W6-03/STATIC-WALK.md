# W6-03 六类静态路线走查

状态：六类静态路线已独立核对，供根核收；RAC-11 与最终 W6 未签通过。执行：Codex 一审线3（gpt-6-astra）。本报告接续唯一原任务 `specs/repository-anti-corruption/roadmap-2026-10-07.md:94` 的 W6-03／RAC-11，执行既有 `/private/tmp/codex-w6-closeout/w6-03-scenario-walk-plan.md`，不另立任务或验收号。

固定源码 H=`b0567bf545a74b858e4fdeddd5e66432b1065b21`，tree=`4d67dc1c07b06e7538463efc2afe570a1b350796`。下列仓库路径、行号均指 H 的 Git 对象，可用 `git show H:路径` 回查，不指主检出。仅运行 Git／文本读取与本临时报告写入；没有运行构建、门禁、测试、浏览器、模型，没有变更 refs、仓库、协调文件或 GitHub，也未访问真实 Home／Keychain。

## 旧输入变化与证据口径

先比较旧计划切点 `dc544a39790c3c73cb43756ffeb847b83e960982` 到 H。Projects Module、Knowledge Service、Files／Text Stats 样例及六场景所用核心测试、runner／slot、PARALLEL、EXTENSION-POINTS、W6-02／W6-03历史切片未变；按固定头追其必要链路，不重做旧模型回放或度量。

入口中实际变化：T376 修了 ARCHITECTURE §5 与 PLUGIN-PLATFORM 动作消费台账；host.md 的变化在终端服务段；workspace-packages 有其他采用项；builtin-plugin-assembly-gate 新增平台路由例外需有未关闭 BACKLOG 的断言。Host组合根、Home装配、合同及安全表也有采用增量，按本路线到达的消费者重读；没有由整份文件有变化推断全部旧验证作废，也没有把新终端／Home路径扩成第七类走查。T376 两处旧矛盾现已关闭，不能再列作待修。

本轮的“已核”是读到了实现与断言内容，**没有当前 H 的准确运行原件可核收**。历史切片记载运行不等于本轮见到完整 stdout、构建绑定与同头结果。下文明确替身边界，不把测试文件存在当执行通过。

## 1. 新 Module

入口：AGENTS → ARCHITECTURE／PACKAGE-BOUNDARIES → DEVELOPMENT-REQUIREMENTS:26–38 → `modules/projects/README.md` 开发要求。样例公开出口 `modules/projects/package.json` 只依赖 contracts；`scripts/workspace-packages.mjs:330` 登记该 Module，合同在 `packages/contracts/src/modules/projects.ts`。README 指向公开入口，`src/index.ts:34–37` 明确区分普通 query/commands 与组合根 lifecycle。

实际路线：`apps/local-host/src/project-catalog.ts:213,288–309,423–425` 创建 ProjectsModule 并把 list/get/rename 委托公开接口；`modules/projects/src/index.ts:83–108` 在包内创建 repository；`project-service.ts:34–49,170–180` 读 owner 表，rename 在事务内改名称并记事件，actor 由调用方传入并校验。lifecycle 留给组合根负责建项目、事务和删除步骤，不能据此给普通消费者跨 owner SQL 的许可；也不据 Catalog 样例推断任意项目表都无需 Host 装配。

实际断言：`tests/projects-module.test.ts:27–108` 用公开包入口、真实内存 SQLite，确认 Repository 不导出、同名不混 identity、缺项目拒绝 `catalog.project_not_found`、未确认 workspace 关联拒绝、空名拒绝。`tests/health-gates-table-owners.test.ts:97–128` 在临时仓库植入跨 owner SELECT／INSERT／UPDATE／DELETE，要求真实 gate 退出 1 且诊断指向主人；不是只查 JSON 字段。Module 依赖、公开 API 与包登记另由 boundary／health 所列规则负责。

结论：入口→公开契约→生产消费→包内事实操作→拒绝断言静态可走通。无新增必修。未运行新建 Module 实验；rename 的生产事务已读，但未取得本头 rename／身份／并发整链动态原件，不能用上述创建／关联测试代签。

## 2. 横向／平台产品服务

入口：DEVELOPMENT-REQUIREMENTS:37–38 明确区分运行机制与平台产品策略；PACKAGE-BOUNDARIES 指向 Knowledge，随后 `horizontal/knowledge/README.md`、`docs/horizontal/knowledge.md`、contract `services/knowledge`。Knowledge 不是“完全无产品策略”：它拥有卡片和读取回执，原文归来源、索引归 Search；package.json:27–29 仅依赖 contracts。

实际路线：`apps/local-host/src/search-actions.ts` 创建／登记 Knowledge；`knowledge-actions.ts:101–107,131–158` 传入 Search 端口、当前调用 context／beforeEffect，list/read handler 调生产 KnowledgeService。`horizontal/knowledge/src/index.ts:194,239–258,387–404` 用项目范围和可见来源查卡，原文经 `resolveActionSubject` 向 owner 读；read 在写回执前 await beforeEffect，返回实际 revision 与 `layer: original`。插件读取来源可用 owner 权限，workspace 仍用原 caller 权限，不能把平台服务理解为权限绕过。

实际拒绝：`tests/security-invariants-knowledge.test.ts:24–57` 断言无来源权限、跨项目、无项目及 owner 自身拒绝码；其 `fixtures/reference-owners.ts:29–66` 是真实 ActionService／SearchService 加 Map 来源替身，不是实际 Goals／Pages 全栈。`knowledge-reads.test.ts:105–109,144–149` 注入 beforeEffect 撤权，断言拒绝且零回执／预算不被消耗，证明服务接口路径，不能冒称真实撤权交错。补充真实 Host 路径在 `security-invariants-knowledge-lifecycle.test.ts:39–75`：本地模型 HTTP 替身暂停首请求，排除／删除后检查排队内容不发送；删除后真实卡片、usage、receipt 表均为零。

结论：生产登记、owner 读取与拒绝路径静态闭合。未运行这些断言；没有由模型替身测试推导真实模型可用、一个 Home 多进程归属已验证。

## 3. Host 装配与 W2-09 动作消费

入口：AGENTS → plugin-dev Skill 的内置登记说明（作为待核材料读取）→ Text Stats registration。`plugins/native/text-stats/package.json:17–19,40` 导出 registration；`src/registration.ts:8–12` 同时声明 project_runtime、工作台内容、客户端与样式。`apps/local-host/src/plugin-registry.ts:155–157` 从登记派生项目启动项，`project-plugins.ts:176` 起通用映射到监督器；新增插件不必添加插件名分支。构建期获批例外不能照抄为新模板。

真实消费：Files manifest consumes → `plugins/native/files/src/actions.ts:23,82` required_actions 与 `services.actions.invoke(workspaceReadActions.file)` → `apps/local-host/src/plugin-actions-client.ts:135–157` 插件受众、Host签发身份、本安装 grant／activation／原调用者复查 → `project-capabilities.ts` 唯一工作区读动作。T376 台账已准确写明显式 consumes 也能调其他插件动作；没有恢复 typed 通道或额外权限。

拒绝断言：`tests/workspace-read-one-id.test.ts:90–130` 非法 schema、未 consumes、无 grant 都断言拒绝及 handler 计数不增；停实例后是有界观察到 PENDING 且不再派发，**不是返回某个拒绝错误码**。纯消费者可调用所声明动作。:138–220 的真实 Host 测试断言非插件受众整文件被拒、伪造插件受众缺可信身份被拒、正确签发身份成功，Files/Git 实际读取工作区；来源目录与工作区由夹具提供。`builtin-plugin-assembly-gate.test.ts:62–116,148–150` 检查 runtime/factory、获批例外、未关闭 BACKLOG，以及监督器不手写插件包名；本头新增的例外约束已读。

结论：两条路线静态可走通，无新增实现必修。W6-02 历史切片 §5 第4批记 Coding族 5项通过（含 Files RAC-1101、Text Stats RAC-1103），这里只核到文档记录，未核该批原始日志，未改署 H，也不据此签所有 Home／外部插件完全同等待遇。

## 4. 前端

入口：AGENTS → DESIGN／craft-finish → plugin-dev/ui.md → Text Stats README／registration.workbench → companion-stage／browser/page → state action。registration 的 clientFactory 对应 package.json:28 的 browser factory 构建；内容挂工作台，样例没有另开整页或第二标签。`text-stats/src/actions.ts:35–39` 按 caller.locale 生成页面 html，模型／workflow／MCP 返回 view；manifest.ui 自带消息与翻译，不要求加 Host 总词典名单。

`text-stats/src/browser/page.ts:12–39` 通过 mountPluginClient／visible signal／read 序号管理查询，await 后 assertCurrent 并核序号，错误仅更新当前可见视图，hide 清理使旧响应无效。`tests/companion-client-lifecycle.e2e.test.ts:205–268` 明确遍历 files/git/diff/text-stats：隐藏不请求，旧响应不进 DOM，一次点击仅当前监听器处理，detach 后无请求；这是浏览器客户端配 HTTP 替身。`ui-client-lifecycle.e2e.test.ts:26–71` 还断言重复 mount 被拒与卸载后资源失效。隐藏只取消视图查询，已派发写操作不重放的断言在 companion 测试:253、294。

结论：内容、语言、查询生命周期的现行路径静态可核。DOM事件登记、翻译缺项、shell-page、artifact 声明、资源预算仍分别由原门禁承担；Text Stats 无自定义 DOM 事件不能证明全仓事件正确。未跑浏览器／构建／截图，三宽、暗色、英文实际显示、键盘／读屏和最终视觉体验均未证，留在原 FR／W6-05。

## 5. 测试

入口：包 README 必跑项 → test-kit README → run-tests。静态抽查上述 Projects 真实 SQLite 与公开入口；另追 `shipped-plugin-lifecycle-coding.test.ts:69–71` → `fixtures/shipped-lifecycle.ts:106–199` 的实际 Host／HTTP／Runtime。后者移出后检查 route 拒绝、动作消失、安装状态，撤权后 start 拒绝 `plugin.grant_denied`、route 503，恢复后原数据仍在，卸载后重启不得重新安装。期望是预先给出的内容与明确状态，不由核心结果反算。升级场景会安排旧安装版本，属于测试设置，不是实际旧版本安装包升级实验。

外部作者路径另见 `plugin-sample.e2e.test.ts:23` 起：packed SDK／CLI scaffold，在无执行授权、无 grant、伪造 actor、越权用户时检查拒绝；成功后查真实 Artifact 版本 payload 与 UI 内容。内部注入 Runtime fixture 不替代这条分发测试。

隔离调用链：`scripts/run-tests.mjs:84` → `scripts/run-tests/pool.mjs:128` → `scripts/ci-linux-probe/run.mjs:47–66` spawn 单文件 runner、按本次进程组清理。`tests/run-tests-pool.test.ts:71–104` 植入失败文件，断言总命令失败、3个不同 pid/Home、file backend、继承 Home 未使用、临时 Home 删除；:31–54 断言并发／browserJobs 上限。`health-gates-test-imports-tool.test.ts:180–202` 对混载检查要求 exit1，完整迁移后 exit0；生产图仍由 test-imports/graph 提供，不以旧基线下降放行。

结论：样例具有业务期望、拒绝与持久化／后续观察，runner 隔离有实质断言。所有测试本轮均未执行；静态抽查不证明全套测试有效或 H 全绿。affected-tests 仍只是建议，不能自动触发 Full。

## 6. 并行工作

入口：AGENTS → PARALLEL-DEVELOPMENT §5/5.1/6/7/8 → 当前协调节。主检出没有 coordination 目录，随后在现存协调工作树 `/Users/yijunwang/code/mw-coord/coordination/2026-10-28/README.md:8–18` 读到现行本机 Codex 接续：根统筹，作者／审验独立上下文，职能线复用；一个 build、一个 browser 测试批次，所有测试经槽位 jobs1；本机／子代理不 Full，由根安排 CI。该协调文件是本次读取的当前规则，不冒充 H 的内容。

自动约束：`tests/machine-slot.test.ts:28–37` 真子进程排队，断言 first→second→third 串行且打印持有人；:40–64 断言死持有人可接替、活 ticket 不能误删；:78–91 明确存在 CI/test/父槽位与显式 off 的行为，所以槽位是协作工具，不是不可绕过安全边界。pool 的并发上限断言见上一场景。

人工约束：owner 交接、共享文件串行、作者／验证独立、保护分支、真实 Home 授权、旧证据沿用由根协调；没有自动 gate 能证明所有人都合规。本轮仅只读，不需占运行槽，不据旧 open-PR 快照声称当前文件锁空闲。

结论：静态路线可走通；PARALLEL:97、111–112 仍写统筹本地集成分支 Full／本地全量命令，需与当前 CI-only 接续统一。当前执行服从协调节，无需重跑 Full。

## 必要最小差异与核收边界

- **已关闭**：ARCHITECTURE:70 的 Artifacts owner，PLUGIN-PLATFORM:153 的动作消费者／Skill 台账，均已随 T376 修正，不再派重复修复。
- **原差异保留**：EXTENSION-POINTS:3 已声明历史状态，但 :65 仍以 how-to 表格形式要求手改 project-plugins，:68 仍写 Host 总词典 import。最小处理是在该旧流程处明确历史切点、指向现行 registration／manifest.ui；不重算扩展成本、不侵入 W6-04。
- **原差异保留**：PARALLEL 的本地 Full 表述与当前协调冲突；由根在原相关文档任务中统一，不新增 CI／锁系统。旧计划的 PR 锁快照未刷新，不当作写授权。

W6-02 §5 有历史工程批次记录；T315 `w6-03-skill-replay-smoke.md:9,19–34,83–104` 有原切点（d9bfc504f／9488eaccd）、离线401回放摘录、真实模型两次设计冻结5/6、detail首轮5/6、全过程零修复4/6。它同时明确失败 reading 归因未定、失败完整答卷／临时输出未留存。本轮没有取得额外运行原件，不抹去失败，不把历史运行升级为本头或六类路线动态通过。

根可核收的结果：**固定 H 六类静态路线及上述最小文档差集已核**。本次未发现需要新产品决定或新增实现工单的阻断；未关闭最终样板、手册末遍、真实模型失败归因、动态运行／FR／Full及本人验收。RAC-11 继续未验证，整条 W6 不据此签通过。
