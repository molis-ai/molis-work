# 2026-11-11 审查问题修复记录

状态：已修复并在本工作树完成工程验证；未推送、未开 PR（用户 2026-11-11 授权全部修复、人工验收免掉、允许本地 commit）。详细审查见同目录两份报告（`code-quality-review-2026-11-11.md`、`code-boundaries-and-callchains-2026-11-11.md`）。

## 修了什么

- **账号/会话（A）**：崩溃标签页幽灵成员不再永久卡切换/登出（按 listeners/订阅时间剔除 + 超时清理，补回归用例）；借用会话的登录/登出拒绝补测试与新安全不变量 `S-unified-account-borrowed-home`；身份投影收成 Host 一份（email 取自合同 `UserView`）；账号缓存隔离无 page-session 时 fail-closed；删除已提交登录后的二次确认读（不再把已登录报 503）；entry 页 native-attach 先比较 browser 会话；删除死产物（mode cookie、syncEnabled、rotate、dispose、action=status、旧 callback 残壳）；scope 解析收敛到 `pageSessionScope()`；sync-worker 假 Auth 改 V2 形状。
- **技能/Agent/证据（B）**：助理与 Coding 的模型工具调用带本轮 `skill_round`（consumer/named），模型可按需读 auto 技能正文、manual 不再列出死指针；Coding 自动技能材料接通（不预读正文）；prompt use 改在模型调用已派发时记录（金样 `prompt_uses` 不再漂移，属 BL-golden-prompt-uses-flaky 的修复部分）；技能导入签名链不要求先打开项目 Runtime；`AgentDefinitions.methods()` 标注无生产调用方；活动动词表/父工具名单从 `AGENT_TOOLS` 派生；技能比对键统一用 SDK `skillRefKey`；技能导入预览与确认使用同一版本次序。
- **存储/升级/版本门禁（C）**：`initial-versions` 门禁现在扫所有 `@version` 标记紧邻字面量（不再只看 `*VERSION` 常量；持久化格式 >1 要连续升级段与旧版本金样）；UPG2-04 覆盖措辞与 `uncovered` 机制对齐并登 `BL-golden-coverage-uncovered`；`format.ui.last-locale` 接进升级链/金样 formats/HOME-DATA；沙箱插件模型偏好与删库/改名只做事实记录+BL；三处重复的路径正则/升级段读法/版本读取合并；过时注释修正。
- **合同/能力包/文档（D）**：kit 的宿主 provider id 收进 contracts 单源；`blueprints` owner 错误码表补齐；home/blueprints/surface-composition 补 `contract-only` descriptor；`CALL-CHAINS.md` 补四条横切链并把链 1 的旧控制令牌表述改为 page-session；页面资源许可占位 review 与旧归档路径修正；能力包/统一输入/账号/日评等状态句按事实更新；成员 HTTP 信封校验复用 action schema；成员版本读只登记 BL。
- **工作台/统一输入（E）**：K5 来源名按页面语言给英文；composer 桥死字段删除；发给图标改从助理 glyph sprite 取；动效改用语义 token；删死事件 `molis:side-toggle` 及登记/文档；页面全局补进 UI-PLATFORM；页面收件人丢文件改可见提示；web 路由契约测试补 11 条新地址并重新生成快照；im-ui `createViews` 降到 150 行内并删对应巨大单元例外。
- **冗余清理（F）**：三个 socket 的授权绑定收进 `socket-authority.ts`；SDK 新增 `parseJson` 并替换 artifacts/feed 的 5 处副本；SDK `/ui` 导出 `escapeAttribute`，design-system 复用；plugin-runtime 两处事件失败包装合并；宿主/RSS 的 `routeUnavailable` 与两个官方集成的 `liveFailure` 收进合同单一工厂；connector-store 减到 298 行并删其巨大单元例外；其余跨插件重复列为 BL 候选。
- **Lead**：AGENTS SDK 共用工具清单补 `hostBoundSession`/`parseJson`/`escapeAttribute`；`CHECKLIST` 第 3 节补 `config/ui-locale.json`；`tooling/gates/README.md` 补 `@version` 标记扫描口径；修复构建中发现的 String.raw 模板反引号、嵌入函数注释反引号、import 常量与更新路由快照；更新 `BL-golden-prompt-uses-flaky` 的部分修复状态。

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
