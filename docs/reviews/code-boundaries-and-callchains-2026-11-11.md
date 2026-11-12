# 代码边界 / 调用链 / 逻辑完整性 / 冗余重复 专项复审（2026-11-11）

修复状态：本报告所列问题已在 2026-11-11 的修复批次中处理，逐项状态与未修项见同目录 `code-quality-fixes-2026-11-11.md`。

状态：第二轮专项复审报告，接在第一轮《最新代码质量复审》（`docs/reviews/code-quality-review-2026-11-11.md`）之后。对象仍是 `origin/main` `2630160877`；只读，未改产品代码。本轮只回答四个问题：**代码边界是否清晰、调用链是否清晰、逻辑是否完整、冗余和重复代码有没有处理**，全部以当前真实代码和可复跑扫描为证据；上一轮已确认的流程/证据问题不重复论证，只在相关处引用。

## 0. 结论（先看这里）

| 维度 | 结论 | 一句话证据 |
| --- | --- | --- |
| **代码边界** | **清晰**。没有发现跨包/跨层执行路径或事实主人被破坏 | 用仓库自己的 `evaluateImportBoundary` 全量扫 66 包、3407 个源文件、19,220 个 import：0 违例；267 张表、31 个建表包，跨包读写 0；窗口内层间允许名单净收紧（server 组合边 2→1） |
| **调用链** | **代码层面清晰、单一路径；文档与契约测试落后于实现** | 7 条主链逐环节核到 file:line（统一输入、能力包、技能冻结、证据合同、存储升级、账号、搜索/MCP）；新 HTTP 边界全部经 `ActionClient` 进动作服务，无绕过；但 `docs/system/CALL-CHAINS.md` 没登记 composer/kit/账号/证据四条新链，`tests/web-route-table.test.ts` 除 `directories` 外没有钉住新地址 |
| **逻辑完整性** | **主路径扎实，但有 4 处"声称能走、实际走不通/走不稳"** | 取消/授权复查/幂等/CAS/回滚都有拒绝测试；新发现：助理「自动」技能正文模型读不到（P1）、账号崩溃标签页让切换/登出永久卡 30 秒（P1）、金样同一 commit 两次生成不一致（P1）、版本门禁对内联 `@version` 标记不生效（全仓 format 标记 213 处，其中内联约 103 处）（潜在 P1）；Coding「自动」技能沿用上一轮 P1 |
| **冗余/重复** | **窗口新增代码很干净；历史重复仍有，平台已有落点却没共用** | 11,360 个 ≥8 行函数体全量比对：跨文件完全相同 13 组，**窗口新增文件 0 组**；新增文件结构归一比对 0 组；窗口修改文件新增 1 处（3 个 socket 的授权绑定 8 行 ×3）；历史 6 组值得收口（parseJson×6 等）；38 个无引用导出候选；新增 TODO/空 catch 0 |

**总体判断：** 用户问的四件事里，边界和调用链在代码层面都成立，问题主要不在"写越界了"，而在"新链没有进现行文档/契约测试"；逻辑完整性主路径很好，但有两个用户可见的自动技能断点、一个账号恢复死角，以及两个门禁覆盖缺口；冗余方面窗口内几乎没新增重复，旧账还在（且多数平台已有共用实现，是可低成本收口的）。

## 1. 方法与证据

- 6 个只读并行复审（账号、存储/升级、合同、能力包/证据、工作台/输入、跨仓静态）+ Lead 独立核验。
- 跨仓静态：复用仓库自己的判定（`packages/test-kit/src/boundaries.ts` 的 `evaluateImportBoundary` 与三张名单）全量扫边界；`table-owners.mjs` 的 `scanTables`/`tableOwnerProblems` 扫表；TypeScript AST 扫重复函数体（完全相同 + 归一化结构）与无引用导出；`docs/system/CALL-CHAINS.md` 与代码逐符号对照。
- 运行时验证：在仓库要求的 **Node 24.15.0** 下跑了 18 个定向测试文件（升级链、金样、库结构、技能目录、能力包、证据合同、统一输入、Web 路由表、本地 web 动作），结果见 §4.1。注意：用默认的 Node 24.14 跑会假红 3 个文件（见 §7），这些不是代码缺陷。
- 复跑产物：boundaries/tables/redundancy 的 JSON 与运行日志随本次会话交付，未入库。

## 2. 代码边界

### 2.1 全量边界扫描：0 违例

| 检查面 | 结果 |
| --- | --- |
| 包与 import | 66 包 / 3407 源文件 / 19,220 个 specifier，按仓库自己的规则 **0 条违例** |
| Plugin → Module 实现 | 34 个点，全部是登记的唯一例外 `plugins/native/shelf → modules/shelf` |
| Plugin → 私有 UI | 10 个点，全部是已批例外 plugin-builder → design-system |
| App → App | 8 条已登记启动器边，无新增 |
| deep import / 跨包相对 import | 0 |
| App/Workbench/CLI/MCP/Desktop 直连业务库 | 0 |
| contracts → workspace 包 | 0；plugin-sdk → contracts 之外 | 0 |
| 未声明依赖 | 0 |
| 表与 owner | 267 张表、31 个建表包；跨包读写 0；插件项目库 138 张表由运行时守卫 + 4 条拒绝测试约束 |
| 窗口内允许名单变化 | 删 2 条（server→desktop、server→local-host），加 1 条（`. → apps/server`，用户 2026-11-09 批的组合根过渡）：净收紧 |
| 模型/驱动硬约束 | `@prologue/sdk` 仅 `horizontal/agent-host`；`better-sqlite3` 仅 Alchemist；一条命令一条执行路径 |

结论：**"每段代码在自己的包/类职责内"这个要求在静态可判定的范围内成立**。窗口新增的 HTTP 位于宿主，但只做传输与编排（见 §3.2）；新包（`horizontal/kit`、`horizontal/account`、`packages/contracts` 新 subpath）都在自己的层里，没有反向依赖。

### 2.2 边界上仍需收口的三件事

1. **P2｜同一身份被投影两次（Host 侧结构问题）**。`apps/local-host/src/personal-auth.ts:73` 自己拼一份 `PersonalIdentity`（`emails: []`），`apps/local-host/src/account-host.ts:100-120` 又直接返回合同 `AccountView`；工作台侧还有三份身份接口（`browser/personal-account.ts:9`、`browser/account-menu.ts:45`、`browser/account.ts`）。上一轮"邮箱丢失"只是这个结构问题的症状；也容易让两边的字段集继续漂移。建议：一个 Host 侧投影函数（从中央合同生成），客户端只留合同类型。
2. **P2｜WebSocket 授权绑定 3 份（窗口内新增重复）**。#1982 把页面控制令牌换成 page-session 后，在 `browser-socket.ts:41`、`computer-socket.ts:36`、`pty-socket.ts:115` 各写了一份**逐字相同**的 8 行 `bindAuthority`（`webSocketAuthority` 校验 + abort 监听 + close 清理）。这是安全边界的重复，改一处容易漏两处；`webSocketAuthority` 本来就在 `web-sessions.ts` 一份，应把 `bindAuthority` 也收进这里。
3. **P2｜宿主仍有点名插件 id 的既有特权（窗口内净变好）**：coding 的 `memory/*` 分支 4 处、`context-onboarding-service.ts:356`（todo/pages）、`native-content-permissions.ts:4`（pages/lingguang）。窗口新增 `native-content-permissions.ts:12` 的 `registeredPermissions("io.molis.work.feed")` 一处——它换掉了一条更差的 feed 实现 import（净变好），但仍属"宿主知道插件 id"。建议登记 BL 收口成声明式，不再新增同类分支。

### 2.3 边界相关的其他小项（P3）

- 两个工具脚本在 `apps/local-host/tooling/` 里 import 自己的包内文件（`pack-npm.mjs:6`、`write-build-manifest.mjs:2`），属包内自引用，不影响产品边界。
- page-session scope 被解析/计算 5 次：workbench 三处 `meta.content.split('.')[1]`（`directory-width.ts:15`、`personal-account.ts:40`、`account-transition.ts:21`）+ Host 两处 viewScope（`space-web-server.ts:95`、`personal-http.ts:118`）。建议 Host 给一个 viewScope 来源，客户端一个 `pageSessionScope()`。
- Characters 是唯一裸 `new DatabaseSync` 开自己 Home store 的 owner（`modules/characters/src/open.ts:69`、`project-data.ts:18`），其余 20+ 都走 `packages/storage` 原语；窗口前已存在。

## 3. 调用链

### 3.1 逐链核对结果（全部给了 file:line，报告见各分报告）

| 链 | 实现路径（摘要） | 结论 |
| --- | --- | --- |
| 统一输入（三入口 → 发送） | 助理/首页同一助理岛、Coding 框架桥都挂 `window.molisComposer`（`packages/plugin-sdk/src/ui/composer.ts`、design-system `composer-parts.ts`/`browser/composer-menus.ts`、共享资源 `composer.js`）→ `assistant-send.ts:74`/`composer-mount.ts:110` → 宿主 `/api/assistant/send`、`/api/composer/*` → 动作服务 | **单一路径，无第二套 DOM/CSS**；三入口都挂同一组件 |
| `＋` 来源 | 页面 → `/api/composer/sources|pick`（`composer-sources-http.ts:21-49`）→ `bindLocalWebActions` → 动作目录 → 插件 `composer.pick` → 回填 → 发送前 `assistant-composer-materials.ts:27-51` 复核 | 通；HTTP 只做传输，没有旁路 |
| 能力包 | 设置页 → `/api/kit/*`（`kit-settings-http.ts:25`）→ `system.kit`（`kit-actions.ts:26`）→ `horizontal/kit/src/index.ts:60` `gatherKit` → 8 个 `*.kit.report` 上报者 | 通；`horizontal/kit` 无写/无存/无 fs，纯汇总 |
| 一轮技能 | `run.start.skills` → `round-skills.ts:46` 冻结 → `agent-round-skills.ts:43-66` 每轮 list 与 body.read 各一次 | 通；`skill_round` 只由宿主写（3 处），但模型工具调用不在其中（见 §4.2） |
| 证据合同 | 插件报告 → Goals 包装（`plugin.ts:126`，先认重放）→ `evidence-check.ts:47` 等级 → `agent.evidence.check@1`（`recovery-actions.ts:32`）→ Goals 存 tier/gap | 通；规则/命令事实各一处 |
| 存储升级 | Home 打开 → `home-storage-lifetime.ts` → 升级编排 → `runSqliteUpgrade`/owner 描述符 → 各 store 打开；快照/放回、金样生成→比对→回放、`versions.json`→生成器→标记各只有一条 | 通；没有第二套 open/upgrade |
| 账号/会话 | 安装登录窗口 → `/api/personal/*` → `PersonalAuth` → 中央 Auth；Home 借用 → `account-host`（BIND/REPLACE、logout 拒绝）；桌面 native-attach 两入口；切换/登出/离线/403 | 通，但 native-attach 两处行为已不一致（见 §4.2） |
| MCP / 搜索 / 外部工具 | 常驻 Host 唯一执行；网关/逐客户端授权；外部工具 4 份运行时名单全部由 `EXTERNAL_TOOLS` 派生，AST 防回流 | 5 条抽样与 `CALL-CHAINS.md` 逐符号一致，无过期引用 |

**新 HTTP 边界纪律（逐文件核过）**：`skill-settings-http.ts`、`kit-settings-http.ts`、`composer-sources-http.ts`、`plugin-trust-http.ts`、`project-workspace-http.ts` 全部只做"读请求 → 组 `ActionCallContext` → `client.invoke` → 映射响应"，没有一处直接开库/写业务表。`composer-sources-http` 在"项目外"与"项目里"两张路由表各注册一次，是 Home 目录 vs 项目权威的**有意分叉**（注释写明），不是同一路径的两份实现。

### 3.2 调用链上的问题

1. **P2｜现行调用链文档没跟上新链。** `docs/system/CALL-CHAINS.md` 仍是"八条主链路"，但窗口新增的 **统一输入 composer、能力包 kit、账号身份（/api/personal、/api/account、native-attach）、证据合同** 四条横切链在文中 0 次出现（grep 确认），而这份文档自称"现行、对照 main 逐环节读码写成"。不是代码缺陷，是接续成本与审计证据问题：新人/评审无法从现行文档读到这四条重要链的 owner、身份、错误和记录。
2. **P2｜路由契约测试没钉住新地址。** `docs/system/CALL-CHAINS.md` 说"哪个地址落到哪个处理器由 `tests/web-route-table.test.ts` 经公开入口钉住"；窗口只给该测试加了 `/api/project-settings/directories` 两条探针（以及删除旧 workspaces），新增的 `/api/composer/*`、`/api/skills/*`、`/api/kit`、`/api/plugin-trust/*`、`/api/personal/*` 都不在探针/快照里。建议补齐，否则路由表被重排/劫持时没有回退保护。
3. **P3｜命名/注释语义已旧。** `packages/ui-host/src/request-client.ts:73` 变量叫 `controlTokenHeader`、注释仍写"The control token … go on every change"，实际值已是 page-session proof（`x-molis-work-page-session`）；`web-http.ts` 的 `controlToken` 形参同理。行为正确，但这是安全代码，误导性命名建议改掉（调用链文档链 1 步骤 1 的同一句也过期）。
4. **P3｜同一件事两套幂等语义。** 助理 composer 用组件的 `request_id`，Coding 忽略它用自己的 key（`input-receipts.ts:150-169`），且 Coding submit 从不返回 `unknown`。建议在 `ComposerSubmission.request_id` 注释写清各入口用法，或在组件层统一。
5. **P3｜两套 native-attach 行为已不一致。** `arrival/shell.ts:146-150`（不比较 browser=1，会话不匹配时回落登录）与 `browser/personal-account.ts:175-181`（比较 browser=1，不一致才 attach）：同一端点、同一票据，两种判断。
6. **P3｜合并边界的小型重复**：`search-query-routes.ts:89` 与 `plugins/official-integrations/rss/src/exact-source-routes.ts:300` 各写一个 `routeUnavailable`。

## 4. 逻辑完整性

### 4.1 运行时验证（Node 24.15.0，仓库要求版本）

跑了 18 个定向文件（17 个通过，`golden-home` 见下）：

| 文件 | 结果 |
| --- | --- |
| `upgrade-chain-registry` / `upgrade-chain` / `upgrade-snapshot` / `upgrade-maintenance` / `home-upgrade` / `home-upgrade-entries` / `store-schema-snapshot` | 全部通过 |
| `skill-catalog-runtime` / `skill-catalog-actions` / `kit-catalog` / `goal-event-evidence` / `agent-host-tool-catalog` | 全部通过 |
| `local-web-actions` / `web-route-table` / `composer-rules` / `composer-render` / `composer-board` | 全部通过 |
| `golden-home`（生成→比对→回放的大套件） | **失败（真实、可复现）**：`UPG2-02 generating it again on this commit gives the same bytes` 在同一 commit `2630160877` 上两次生成不一致——`manifest.json:517` 的 `prompt_uses` 计数 22 vs 23、对应 store `sha256` 不同，`agent-definitions.db.sql:48` 多一行 `system:knowledge/knowledge.organize`（该轮日志里有 `knowledge.organize` 的 `actions.forbidden` 警告）。见 §4.2 P1-4 |

这组测试覆盖了升级链、库结构、技能目录、能力包、证据、统一输入、web 路由的**主路径与多数拒绝路径**，是"逻辑完整性"当前最有力的工程证据。`check-health-gates --base 5945c0271a` exit 0（只许减的数字与基线持平），`api-snapshot` 87 快照/3810 声明与源码一致。

### 4.2 逻辑完整性的问题

**P1-1｜助理「自动」技能正文模型读不到（新发现，建议尽快复现）**
- 路径：`assistant-round-materials.ts:143-158` 把 `applies_to: "assistant"`、状态 `auto/manual` 的技能**只列名称与说明**，并指示模型用 `read-capability` 调 `skills.body.read@1` 读正文。
- 拒因：`skill-catalog.ts:41-44` 的 `applicable()` 用 `caller.skill_round?.consumer` 判适用；模型工具调用的 caller 来自 `agent-host-composition.ts:325-346`（`audience:"agent"`、`permissions:[]`、无 `skill_round`），因此 `applies_to:"assistant"` 的技能落到 `skill-catalog.ts:71-86` 的 `not_applicable`；`manual` 的再被 `not_named` 拒（`assistant-http.ts:202` 把 manual 也列给模型）。
- 现状：全仓写 `skill_round` 只有 3 处（`assistant-http.ts:139` 选读、`skill-settings-http.ts:36`、`agent-round-skills.ts:53`），都不覆盖模型的工具调用；`tests/assistant-methods.test.ts:112-114` 只断言"提示词里写了读法"，没有真实读取。
- 影响：SKP-10 的"助理一侧自动选用"只在提示词里成立，模型真要读时被拒；与本轮另一条（Coding 自动档未接入，`plugins/native/coding/src/executor.ts:70`，上一轮已报）合起来，**SKP-10 两侧都没闭环**。
- 建议：给 agentHost 的 actions gateway 补本轮的 `skill_round`（consumer/named 从本轮冻结信息来），或让模型经宿主提供的读技能工具而不是通用 read-capability；补一条"只列名字 → 模型真的读到正文"的端到端用例。

**P1-2｜账号：崩溃标签页会让切换/登出永久卡住（新发现）**
- `apps/local-host/src/personal/account-refresh-pages.ts:84` 的 `required` 把同一 lease 下所有"未 departed"页面都算进去，不看 `listeners.size`；页面记录只在 lease abort/close 时删除（`:53-66`）；30s 超时只清 preparation、不清页面（`:97-99`）。客户端只在 `pagehide` 发 `leave`（`account-cohort.ts:91-96`、`personal-account.ts:36`），标签页崩溃/强杀不会发。
- 结果：崩溃页成为"幽灵成员"，之后每次切账号/登出 start 都等它 30s 后失败，重试一样，只能重启 Host；与 WUA-31「不留卡住的准备」冲突。ASR-04 只覆盖"断流但存活、仍需 ack"。
- 建议：start 时把零监听页面视为 departed / 超时清除无监听页面 / 提供剔除 stale page 的恢复入口；补崩溃路径用例。

**P1-3｜版本门禁对"内联 `@version` 标记"完全不生效（潜在，今天无已升版本）**
- `scripts/gates/initial-versions.mjs:185-209` 的 `sourceVersionProblems` 只扫 `const <NAME>_VERSION` 声明；全仓 213 处 `/* @version format.* */` 中（内联约 103 处），写在对象属性/参数位置的内联标记（例：`home-restore-input.ts:124,127`、`workspace-git-worktrees.ts:130,172`、`native-plugin-release-artifact.ts:8,43`）不会被"升到 >1 必须有连续升级段 + 旧版本金样"检查覆盖。用仓库导出函数做只读探针：把 `format.connector.private-state` 写成内联 `2` → 无问题；写成 `const ..._VERSION = 2` → 报 expected 1。
- 影响：这些用户数据格式今天都还是 1，但门禁在"以后有人升版本"时不会拦；与"带版本文件改结构须升版本、附连续升级步骤"的硬约束不符。
- 建议：`sourceVersionProblems` 改扫所有带 `@version` 标记的字面量（而不是只看 `*VERSION` 常量名）。

**P1-4｜金样生成不满足"同一 commit 两次生成逐字节相同"（UPG2-02），且会随后台知识维护时序漂移**
- 证据（本机 Node 24.15.0，单文件运行，同一 commit `2630160877`）：`tests/golden-home.test.ts` 的 `UPG2-02 generating it again on this commit gives the same bytes` 失败；两次生成的 manifest 在 `prompt_uses` 计数（22 vs 23）与 agent-definitions store 的 `sha256` 上不同，库转储多一行 `INSERT INTO "prompt_uses" … 'system:knowledge/knowledge.organize' …`；生成日志同时出现 `area:"search","event":"index_update_failed","error":{"code":"actions.forbidden"},"where":"knowledge.organize"`。
- 我又用 `scripts/golden-home.mjs create` 独立生成两次（同版本、同参数、同一 commit），差异完全一致（22 vs 23 + 多出同一行）。
- 判断：生成期有一轮后台知识整理（`knowledge.organize`）会因时序/权限状态时有时无；它失败（forbidden）时仍留下了 `prompt_uses` 记录，于是金样内容随运行时机漂移。这违反 UPG2-02 与"同一提交生成两次逐字节相同"的验收，也让以后的覆盖面/确定性检查变成薛定谔的绿。
- 影响：`golden-home.test.ts` 在 `--skip-macos-only` 下会被保留（分类 `marks: []`、`run: true`），属于会进全量的文件；最近一次相关绿（batch/24 Full 2026-11-11 08:38）与 main 的 nightly 11-10 都不能证明当前头稳定。此项先按"需要归因的 P1"记，不直接指认引入 PR（`prompt_uses` 的最近窗口改动是 #2015；`knowledge.organize` 与生成期后台时序相关，需复现后定位）。
- 建议：①生成期间不跑非确定的后台知识整理，或让其失败不记 `prompt_uses`；②把"失败的动作不写用量/使用记录"作为生成器的硬规则；③在 CI 上给该文件一个固定时序或隔离，别让确定性测试靠运气。

**P2｜其他完整性缺口**
- 账号缓存隔离 fail-open：`browser/account-transition.ts:21-22` 在 page-session meta 缺失时让 `accountCache` 变 no-op（不分区、退出不清、不拦迟到写），静默无拒绝。
- 账号半写分支：`personal-http.ts:161-175` + `personal-auth.ts:92-98`，`adoptLogin` 已提交后二次 `currentIdentity` 失败 → 页面 503，实际已登录新账号（恢复语义不清）。
- 助理列了读不到的 manual 技能：`assistant-http.ts:202` 列 `states:["auto","manual"]`，模型读 manual 必被 `not_named`；建议列出时标注 assistant-only/manual 或只列 auto。
- 升级链覆盖缺口：`format.ui.last-locale`（`ui-locale-memory.ts:13,26-50`，Home-DATA 必备份文件）不在 `platform-upgrade-stores.ts:112-123` 的描述符、不在 `PERSISTENT_CONSTANTS`、不在金样 formats 读法表，且自己手写 parse/原子写；已装沙箱插件的模型偏好文件（`sandbox-model-settings.ts:17-20,38-44`）在升级链里没有枚举入口（今天版本 1，latent）；删库/改名在运行期也没有兜底（`home-upgrade.ts:302-320` 只遍历当前 descriptors）。
- 合同缺 owner 错误码：`packages/contracts/src/services/blueprints.ts` 没有 `defineErrorCodes`，`tooling/gates/error-owners.json` 没有 blueprints 主人条目，而 scene spec:612 指定 4 个码；#2000 只写"运行归 44"（P2，需补表或记偏离）。
- 技能导入签名链要求项目已打开：`plugin-trust-actions.ts:71-72` 用 `host.projects().find`（只含已建 entry），否则 `scope_mismatch`；正确写法见 `web-catalog-routes.ts:69-73`（Catalog 解析 reference，不开 Runtime）。
- 成员 HTTP 手写信封校验（`web-project-settings.ts:146-152`）与 action input schema（`modules/projects.ts:451-462`）重复维护同一形状。
- 声明-only 合同运行期与"未注册/版本失效"同码 `actions.missing`，只有 `services/sessions.ts:17-23` 有 `maturity:"contract-only"`，home/blueprints/surface-composition 没有（P3，诊断体验）。

**已看过且没问题的完整性面**：取消/停止/切会话/迟到结果/重复发送/离线恢复（统一输入）；授权在 await 后的复查（PersonalAuth/personal-http/account-host/session-manager 四处）；升级失败原子性与放回（sidecar 先删、sha 双校验、按版本决定放回）、打开路径只拒绝不升级、四取锁点与维护态、owner 隔离、插件表三层与唯一开关；成员版本写锁内观察 + revision 哈希（含最后成员事件，覆盖 ABA）+ 期望版本强制；能力包超时/失败/空目录/越权/重复条目/包头丢失；证据合同的等级/缺口/按版本失效/重放/依据形状/来源过滤；无新增空 `catch`、无新增 TODO/占位、`as unknown as` 等静态计数持平。

## 5. 冗余与重复

### 5.1 数字

- ≥8 行函数/方法体 **11,360** 个；跨文件完全相同 **13 组**；其中 **窗口新增文件 0 组**；我把新增的 249 个 `.ts` 做了结构归一（去标识符/字面量）比对，**0 组**。
- 窗口**修改**的文件里新增了 1 处：3 个 socket 的 `bindAuthority`（§2.2）。
- 平台已有落点可共用的历史重复 6 组（见 5.2）；无引用导出候选 38 个；新增 TODO/FIXME/占位 0。
- `check-health-gates` 的兼容标记、旧名、测试引用包内部、巨大单元等只许减的数字均与基线持平——窗口没有引入新的计数类债务。

### 5.2 值得处理的重复（历史为主）

| 重复 | 位置 | 判断 |
| --- | --- | --- |
| `parseJson` ×6 | `modules/artifacts/src/repository.ts:320`、`modules/attention-resumption/src/index.ts:416`、`plugins/native/feed/src/store/{items/rows,listener,signals,sources}.ts` | 平台没有共用 JSON parse（SDK 只有 `isRecord`）；建议在 SDK `/json-value` 加一个安全 parse 或明确"各 owner 自己解析"的规矩，不再一处处抄 |
| `escapeAttribute` ×2 | `packages/design-system/src/icons.ts:314`、`packages/plugin-sdk/src/ui/icon.ts:7` | 逐字相同；design-system 可以取 SDK 的 UI 工具（公开层可用），建议 SDK 导出、design-system 复用 |
| 插件浏览器 DOM helpers | dataset/ppt/form/pages 的 `textCell`/`showNote`/`arrive`/`editor` 等（`plugins/native/*/src/browser/dom.ts` 等） | 插件之间不能互相 import，但都可以用 SDK `/ui`；建议把小的表格/通知/到达 helper 收进 SDK，或明确"每个插件自写"的边界并停止增长 |
| `routeUnavailable` ×2 | `apps/local-host/src/search-query-routes.ts:89`、`plugins/official-integrations/rss/src/exact-source-routes.ts:300` | 宿主与插件各 8 行；可用 SDK 的 `actionErrorResponse` 包装消除 |
| `liveFailure` ×2 | `plugins/official-integrations/{catalog,github}/src/provider.ts` | 官方集成之间的同一错误包装；集成包之间不能 import，考虑放 SDK `/oauth` 或 `/provider` 工具 |
| `events.ts` vs `host-events.ts` 同包两处 14 行相同方法 | `packages/plugin-runtime/src/{events,host-events}.ts` | 同包内重复，直接提取 |
| `mapCard`/`mapIdeaCard` 26 行相同 | `plugins/native/alchemist/.../exploration-repository.ts:220`、`idea-repository.ts:266` | Alchemist 待重做（BL-376/377），可先提取或标注 |
| `bindAuthority` ×3 | 见 §2.2 | 窗口内新增，建议立即提取 |

### 5.3 死代码/无引用候选

- 新增/改动文件里：`browser/plugin-frame/composer-child.ts:96` 的 `sources` 在父侧被 `:189` 恒置 false（声明未用的死字段/死分支）；`side-panel.ts:354` 监听 `molis:side-toggle` 全仓无发者（窗口前既有、`UI-PLATFORM.md:86` 已记已知缺口）；账号侧 `molis-work-mode` cookie、`syncEnabled`、`PersonalWebSessions.rotate`、`PersonalAuth.dispose`、`prepare?action=status`、旧 `/account/callback` 残壳已无生产调用方（P3，建议清）。
- 无引用导出候选 38 个（全仓标识符计数，排除引用后），较值得看的：`apps/local-host/src/plugin-package-export.ts#exportPluginPackage`、`plugin-demo-seed.ts#isRegenerableDemo`、`apps/workbench/src/browser/bar-column.ts#placeBarColumn`、`modules/projects/src/project-output.ts` 的三个成员、`AgentDefinitions.methods()`（`agent-definitions.ts:189-198` 只在测试用）、`WEB_PAGE_SESSION_HEADER`（`web-sessions.ts` 导出但内部直接用常量）。多数合同类型导出是有意的公开面，删前按 API 快照与调用方确认。
- 已清干净的正面证据：旧 Coding 方法库/旧协议/旧导出 0 命中；`SkillRef` 比对键只在 SDK 一份；码元比较器合成一份；`/settings/skills` 302 与旧金样脚本删净；`better-sqlite3` 只剩 Alchemist；旧手写外部工具名单 0 残留（AST 防回流）。

## 6. 处置建议（按优先级）

1. **P1（先修/先复现）**：金样生成确定性（后台知识整理不得让生成漂移；`prompt_uses` 不记失败动作；CI 固定时序）；助理自动技能正文读取（补 agentHost gateway 的 round 上下文或改用宿主读技能工具 + e2e）；账号幽灵页面恢复（start 过滤零监听 + 超时清理 + 用例）；Coding 自动技能（接一轮或用户批准顺延）；inline `@version` 门禁补齐（本次是潜在，但属于绝对规则漏洞）。
2. **P2（边界/调用链收口）**：身份投影合一；socket `bindAuthority` 收进 `web-sessions.ts`；`CALL-CHAINS.md` 补四条新链 + `web-route-table` 补新地址；`last-locale`/沙箱模型偏好/删库纳入升级链视图；blueprints 错误码补 owner 表或记偏离；缓存隔离 fail-open 与半写分支；手动技能不要列成可读；宿主插件 id 收口记 BL。
3. **P2/P3（冗余清理）**：按 5.2 表收 3–6 组（优先同包重复与平台已有落点）；清 5.3 的死字段/死监听；无引用导出逐类确认后删或标注。
4. **P3**：命名语义旧（controlTokenHeader / 调用链注释）、两套幂等注释、两套 native-attach 对齐、routeUnavailable 等小重复。

## 7. 局限与本轮的环境注意

- 未跑全量、浏览器、真实 Home、真实 Auth；金样回放只核脚本/CI 记录，未重放。本机 `golden-home` 的 UPG2-02 确定性失败已复现（见 §4.2 P1-4），但它是否在 Linux CI 上稳定复现、以及是否由窗口内哪个改动引入，本轮没有归因；建议以 CI 上该文件的历史与一次干净主检出复核后再定责任批次。
- **本机 Node 版本必须用 24.15.0**（`.nvmrc`）。默认 24.14.0 下 3 个文件假红（`web-route-table`、`local-web-actions`、`kit-catalog`），切到 24.15.0 后全过——本报告不把它们当缺陷；也提醒后续会话别用错版本。
- 全量边界/表/重复扫描是静态判定，看不到动态 import、字符串拼出的模块名、反射与测试外部调用；无引用导出是标识符计数启发式；"完全相同"重复扫描之外的重命名近同只做了新增文件的结构归一比对，历史近同未全量。
- #1979 的 714 文件、#2004 的 487 文件等仍按关键路径+抽样，不是逐行；功能验收与真实产品体验不在本轮范围。

---

附：分报告与扫描原始数据随本次会话交付，未入库。
