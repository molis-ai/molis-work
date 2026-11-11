# 2026-11-11 审查问题修复记录

状态：已修复并在本工作树完成工程验证；未推送、未开 PR（用户 2026-11-11 授权全部修复、人工验收免掉、允许本地 commit）。详细审查见同目录两份报告（`code-quality-review-2026-11-11.md`、`code-boundaries-and-callchains-2026-11-11.md`）。

## 修了什么

- **账号/会话（A）**：崩溃标签页幽灵成员不再永久卡切换/登出（按 listeners/订阅时间剔除 + 超时清理，补回归用例）；借用会话的登录/登出拒绝补测试与新安全不变量 `S-unified-account-borrowed-home`；身份投影收成 Host 一份（email 取自合同 `UserView`）；账号缓存隔离无 page-session 时 fail-closed；删除已提交登录后的二次确认读（不再把已登录报 503）；entry 页 native-attach 先比较 browser 会话；删除死产物（mode cookie、syncEnabled、rotate、dispose、action=status、旧 callback 残壳）；scope 解析收敛到 `pageSessionScope()`；sync-worker 假 Auth 改 V2 形状。
- **技能/Agent/证据（B）**：助理与 Coding 的模型工具调用带本轮 `skill_round`（consumer/named），模型可按需读 auto 技能正文、manual 不再列出死指针；Coding 自动技能材料接通（不预读正文）；prompt use 改在模型调用已派发时记录（金样 `prompt_uses` 不再漂移，属 BL-golden-prompt-uses-flaky 的修复部分）；技能导入签名链不要求先打开项目 Runtime；`AgentDefinitions.methods()` 标注无生产调用方；活动动词表/父工具名单从 `AGENT_TOOLS` 派生；技能比对键统一用 SDK `skillRefKey`；技能导入预览与确认使用同一版本次序。
- **存储/升级/版本门禁（C）**：`initial-versions` 门禁现在扫所有 `@version` 标记紧邻字面量（不再只看 `*VERSION` 常量；持久化格式 >1 要连续升级段与旧版本金样）；UPG2-04 覆盖措辞与**已存在**的 `uncovered` 门禁机制对齐并登 `BL-golden-coverage-uncovered`（门禁行为未放宽，只把验收文字写成实现本来就会接受的两条路；未覆盖面仍在 BL 里跟踪，不是验收完成）；`format.ui.last-locale` 接进升级链/金样 formats/HOME-DATA；沙箱插件模型偏好与删库/改名只做事实记录+BL；三处重复的路径正则/升级段读法/版本读取合并；过时注释修正。
- **合同/能力包/文档（D）**：kit 的宿主 provider id 收进 contracts 单源；`blueprints` owner 错误码表补齐；home/blueprints/surface-composition 补 `contract-only` descriptor；`CALL-CHAINS.md` 补四条横切链并把链 1 的旧控制令牌表述改为 page-session；能力包/统一输入/账号/日评等状态句按事实更新；页面资源许可只新增本任务的一份增长许可（已采用的 4 份许可按门禁规则不可改，占位 review 保留，见「复查后仍未处理」）；成员 HTTP 信封校验复用 action schema；成员版本读只登记 BL。
- **工作台/统一输入（E）**：K5 来源名按页面语言给英文；composer 桥死字段删除；发给图标改从助理 glyph sprite 取；动效改用语义 token；删死事件 `molis:side-toggle` 及登记/文档；页面全局补进 UI-PLATFORM；页面收件人丢文件改可见提示；web 路由契约测试补 11 条新地址并重新生成快照；im-ui `createViews` 降到 150 行内并删对应巨大单元例外。
- **冗余清理（F）**：三个 socket 的授权绑定收进 `socket-authority.ts`；SDK 新增 `parseJson` 并替换 artifacts/feed 的 5 处副本；SDK `/ui` 导出 `escapeAttribute`，design-system 复用；plugin-runtime 两处事件失败包装合并；宿主/RSS 的 `routeUnavailable` 与两个官方集成的 `liveFailure` 收进合同单一工厂；connector-store 减到 298 行并删其巨大单元例外；其余跨插件重复列为 BL 候选。
- **Lead**：AGENTS SDK 共用工具清单补 `hostBoundSession`/`parseJson`/`escapeAttribute`；`CHECKLIST` 第 3 节补 `config/ui-locale.json`；`tooling/gates/README.md` 补 `@version` 标记扫描口径；修复构建中发现的 String.raw 模板反引号、嵌入函数注释反引号、import 常量与更新路由快照；更新 `BL-golden-prompt-uses-flaky` 的部分修复状态。

## 与 main #2030 的合并说明（2026-11-11 晚）

PR 期间 main 合入 #2030「合后审计整改——补做 Coding 自动档、能力包 CPK 收口与记录落档」，其中 Coding「自动」档技能与 Host 侧 `skill_round` 的传递由 main 独立补做（`plugins/native/coding/src/skill-tools.ts`、`roundActions`、composition 只对 `system.skills` 写 `skill_round` 等）。本分支合并 main 时**采用其实现**，删除了本分支与之重复的 `skill-choices.ts` helper、`index.ts` 导出和 `tests/coding-automatic-skills.test.ts`；本 PR 实际保留的 Skill/Agent 侧改动是：助理 authority 的 `skill_round`（consumer=assistant、named）、manual 技能不再给模型列死指针、`prompt_uses` 派发时幂等记录、技能导入签名链不要求先开 Runtime、`skillRefKey`/活动动词/父工具名单等（这些 main 的 #2030 未覆盖）。合并后 `tests/coding-auto-skills.test.ts`（main 的用例）与 `tests/agent-host-skill-reads.test.ts` / `tests/assistant-methods.test.ts` 均通过。

## 复查（2026-11-11 第四轮，交叉对抗）

提交后做了一次独立交叉复查（不同组互审 + 全 diff 对抗扫描 + 重新跑门禁/快照/定向测试）。结论：**没有发现会把 main 弄坏的回归**；发现的都是「修复本身没闭合/文档与实现不一致/断言偏弱」之类，已在本工作树第二轮修正（尚未并入第一个 commit）：

- **P1 修复闭合**：Coding 的「自动技能」材料原先让模型用 Coding 没有的 `read-capability` 读正文，实际读不到；现在只在 `agent.listActions` 的 offered 目录里 `skills.body.read@1` 可用且受众含 agent 时，把精确引用加进本轮 `action_tools`，材料文案改成 Coding 的 per-action 工具说法；补了 helper 测试与 offered 不可用时不加的用例。
- **P2 账号**：A1 幽灵页修正——`connection-lost` 不再立即标 stale（网络抖动后的立即重试仍要求该页 ack，下一次 start 的 15s 窗口才判崩溃）；首次投递失败记为断连。补 3 条用例。
- **P2 输入/路由**：英文页 `composerSourceWords` 失败（Home 宿主启动/关闭、项目 closing）会 500 → 现在失败退回不翻译；words 只在 `sources` 分支算。web 路由探针 `GET /api/skills/list`（实际只收 POST）与无账号 fixture 的 `personal/status` 改为真实路径并重生成快照。
- **P2 提示词记录**：`prompt_uses` 的派发记录加幂等（一次读出的 prompt 无论 dispatch 钩子回调几次只记一行），补 DB 计数断言。
- **P2 文档**：`CALL-CHAINS` §11 的导出路径/链 A「不读插件名」按实现改正；`/json-value` 子路径不存在改为「SDK 根导出」；`STORAGE-AND-EXCHANGE` 的 `syncEnabled` 残留、`HOME-DATA` 的 last-locale 升级扫描副作用、gates README 的内联标记口径补全。
- **P3 清理**：`socket-authority.ts` 的无引用导出收回；`personal-account.ts` 最后一处内联 `split('.')` 改用 `pageSessionScope`；两个手工账号脚本不再轮询已删除的 `prepare?action=status`；6 个文件尾部空行；审查报告里的 `/tmp` 证据路径与「211 处」计数改正。
- **复查后仍未处理（明确记录）**：已采用页面资源许可的 JSON 不能改（门禁规定已采用许可不可改），已把评审/归档证据记在 `docs/reviews/page-asset-allowances-review-2026-11-11.md`；`BL-local-protection-version-check` 删除理由已补（#2004 的 `readUpgradeStore`/`checkSqliteBaselineVersion` 已关闭该缺口）；A 组「从未订阅的页仍按原设计保持 required」是设计取舍（优先不误伤慢加载页），页面若在加载中崩溃仍会有每次准备超时一次，未改；桌面端每次状态更新多一次 `status?browser=1` 是 parent 就有的行为（A6 只是让 entry 页与它一致），不是本批引入，未改（缓存会让账号切换后的浏览器会话对比失效）；`web-project-settings` 已恢复旧信封的严格性：客户端传 `enabled` 直接 400 `actions.input_invalid`（补了拒绝用例）；Goals 的 `parseJson` 是严格版（坏 JSON 报 unreadable），不是副本；`packages/storage` 与 `modules/attention-resumption` 的副本已在复查后换成 SDK 根导出的 `parseJson`（attention-resumption 补了 workspace SDK 依赖并更新锁文件），`BL-json-parse-copies` 随之删除。
- **第三轮补收（继续处理复查遗留）**：`packages/storage` 与 `modules/attention-resumption` 的 `parseJson` 副本都换成 SDK 根导出一份（后者补 workspace SDK 依赖、更新锁文件、在 `workspace-packages.mjs` 与 README 声明允许的依赖；`BL-json-parse-copies` 删除）；`web-project-settings` 恢复旧信封严格性，客户端传 `enabled` 直接 400（补拒绝用例）；已采用页面资源许可的评审/归档证据补在 `docs/reviews/page-asset-allowances-review-2026-11-11.md`；A1「从未订阅页仍 required」的取舍写进代码注释；桌面端每次状态多一次 `status?browser=1` 核实为 **parent 已有行为**（不是本批引入，A6 只是让 entry 页与它一致），未改并改正了先前复查记录里的说法。
- **全量安全套件（`pnpm test:security`，376 文件）最后两次整跑尝试**：第一次在 `scripts/` 改动后未重建，安装指纹类用例报 `installer.source.build_stale` 假红；第二次重建后重跑到 38/376 时仍有同一原因（中途的 `scripts/workspace-packages.mjs` 改动在构建之后），随即停止——所有失败均为「源码/脚本与 dist 指纹不一致」，不是断言或产品失败。重建后再单独复跑这 3 个失败文件：`uninstall` 5/5、`security-invariants-home-entry` 6/6、`security-invariants-home-snapshot-entries` 21/21，全过。完整 376 文件未在本次会话内整跑（约 40 分钟量级），其余用例在两次尝试中已跑到部分；变更相关的安全子集与上述文件均绿。
- **复查验证（2026-11-11 第二轮修完、重建后，第三轮再补收）**：`pnpm build` 通过；`health --base origin/main` 通过（startRound 收回到 150 行内；第三轮删 BL、调依赖切片、补 review 记录后再次通过）；`boundary`、`secrets`、`verify-release-versions`、`versions:check` 通过；定向回归 15/15 文件（账号/技能/路由/dom-events/合同/请求客户端/socket）全绿；第三轮的 membership HTTP / attention / personal-http / 路由 5/5 文件全绿；安全套件的 3 个先前失败文件（`uninstall`、`security-invariants-home-snapshot-entries`、`system-search-authority`）在重建后单独复跑 **3/3 通过**——先前失败是 build 过期与并发负载，不是产品回归；`test:contracts` 65/65 在空闲机上全过（先前 64/65 是并发负载下的超时 flake）。完整安全套件因 44 分钟量级、本轮以「失败文件复跑 + 变更相关子集」代替，未再整跑。

## 工程验证（Node 24.15.0）

- `pnpm build` 通过；`node scripts/check-health-gates.mjs --base origin/main` 通过（只许减的数字持平，删除 2 个巨大单元例外、更新 2 个尺寸均被接受）。
- `pnpm boundary:check`、`pnpm secrets:check`、`node scripts/verify-release-versions.mjs`、`pnpm page-assets:check` 通过（页面资源增量 17/159/17/454 字节，按任务新增一份增长许可 `code-review-fixes-20261111.json`；已有已采用许可未改）。
- `pnpm test:contracts`：64/65 文件通过；`tests/action-before-effect.test.ts` 在并发负载下超时，单跑 23/23 通过（判定为本地负载 flake）。快照：`pnpm api:update` 更新 9 份（见下），`actions:update` 无变化，`schemas:update` 不需要。
- 定向回归：账号 17 文件、技能/证据、升级/版本/门禁、合同/能力包、冗余/安全子集均通过（含 `security-invariants-account-host` 17/17、`security-invariants-web-sessions` 5/5、`security-invariants-home-upgrade` 26/26、`dom-events-contract` 33/33、`web-route-table` 2/2、`socket-authority` 3/3 等）。
- 未跑：全量 376 文件安全套件在本机与 build 并发时被拖红（超时/端口类），已在空闲时跑变更相关的安全子集全绿；本机不跑全量（仓库规矩是集成分支跑），CI 会跑。`tests/golden-home.test.ts` 的 UPG2-02 仍会在共享机负载下差在生成期后台写入（`agent-runtime/records` 随机后缀、notices/memory/knowledge_cards），`prompt_uses` 已稳定；已将该残余写进 `BL-golden-prompt-uses-flaky`，需单独一批隔离生成期后台任务。浏览器用例本机无测试浏览器，未跑（用户人工验收已免）。

## 公开 API / 合同变化（`pnpm api:update` 已刷新）

- contracts：新增 `PLUGIN_INSTALL_PROVIDER_ID`、`CONNECTOR_PROVIDER_ID`、`blueprintsErrors`、`services{Home,Blueprints,SurfaceComposition}Contract`、`SEARCH_PROVIDER_UNAVAILABLE`、`integrationLiveFailure`；`DOM_EVENTS` 删除 `molis:side-toggle` 一条。
- plugin-sdk：`parseJson`（根出口）、`escapeAttribute`（`/ui`）。
- 均为新增纯数据/纯工厂或删除已无发送者的事件；行为语义对调用方是增量，`molis:side-toggle` 的删除没有产品代码/插件使用者。

## 没修 / 明确不在本次范围

- GitHub PR 评审评论、CI 历史（#2013/#2015/#2028 的全量记录）等进程证据：不能在本工作树修复；见审查报告。
- 真实 Home、真实 Auth、真实渠道部署、产品人工验收：用户已免。
- 删库/改名的新门禁：用户只授权了 inline `@version` 门禁改动，本次按文档+BL 记录，未新增门禁。
- `check-package-boundaries.mjs` 的 `existsSync` 过滤、宿主内联插件 id（coding/todo/pages/lingguang 等既有特权）、`modules/attention-resumption` 的 parseJson 副本、alchemist/插件间小 helper 重复、成员版本读的 owner 内合并：或属既有已批例外，或需单独批次/依赖/锁文件改动，本次未动（部分已登 BL）。
- nightly 全量 flaky 的 quarantine/CI 修复：需 CI owner 与到期日，未在本树改。
