# 防腐存量代码审计 — 第 1 轮（宿主私路 / 冻结名单 / 内置特权缺口）

> 审计员：ac-code-auditor（只读，不写码、不开 PR）。共享任务 task-10。
> 基准：origin/main `1756f9842`（2026-10-23 fetch，`refactor(platform): 插件的 Agent 定义只由运行中的定义登记…（PG-051 P2b）(#1147)`）。审计工作树：`/tmp/ac-audit-main`（detached，主检出未动）。
> 方法：静态读码 + 现有只读门禁（`node scripts/gates/package-inventory.mjs --check`、`node scripts/gates/dom-events.mjs --report`、`node scripts/check-health-gates.mjs --report`）；不跑 build/全量/浏览器用例。
> 门禁证据：package-inventory `--check` exit 0「holds 71 packages, all matching the code」；check-health-gates `--report` exit 0（既有基线全部通过：API snapshots 72 files/2935 declarations、文档引用无断链、error-code 规则 0 违规）；dom-events `--report` 的 8 条 finding 全部已在 `docs/platform/UI-PLATFORM.md`「现状与例外」登记，并由 `tests/dom-events-contract.test.ts:396-437` 钉住。
> **本轮结论：无 blocker。** 冻结名单/装配分类/目录生成/删除项目单一服务/SDK 依赖/跨插件 import 与要求一致；发现集中在 privileges/文档漂移簇（4 条，non-blocker）与 1 条未登记的宿主私路（onboarding 直接 import Runtime 插件包，P2）。

## 1. 基线清单（需求 → 检查点 → 证据，共 50 条）

判定词：PASS=与需求一致；存量=已知存量为治（privileges/在途 PR 已记）；FAIL=本轮发现缺陷；UNVERIFIED=本轮未取证。

| # | 需求（来源） | 检查点 | 判定 | 证据（path:line / 门禁） | 强度 |
| --- | --- | --- | --- | --- | --- |
| 01 | 一个事实一个主人（AGENTS.md、SSOT-MATRIX） | SSOT 行与代码 owner 一致 | PASS（本轮抽核） | docs/SSOT-MATRIX.md §7 行带 2026-10-18 改注；PG-094 仍在治 | code-read |
| 02 | 插件平等：同 SDK/合同/Manifest/Runtime/服务/生命周期/授权；只按发布者签名分安装信任（spec:1156） | 25 个目录条目都由同一 registration.ts/生成器出 | PASS | scripts/generate-plugin-registry.mjs；apps/workbench/src/builtin-plugins.ts 头注释 | code-read |
| 03 | 不给内置插件宿主私路：构建期装配只有一条冻结路（spec:1160） | BUILD_TIME_ASSEMBLED=7 与磁盘一致 | PASS（冻结存量） | tests/builtin-plugin-assembly-gate.test.ts:49；apps/local-host/src/project-host.ts:425 | code-read |
| 04 | 新内置插件只走 Plugin Runtime（AGENTS.md） | 目录无未分类条目；Runtime 条目真被启动 | PASS | assembly-gate:29,63-65；project-plugins.ts 13 工厂 | code-read |
| 05 | 不再新增 `<plugin>-native-plugin-http.ts` | 磁盘 5 份 == NATIVE_PLUGIN_HTTP_FILES | PASS | assembly-gate:55,84,103-109；`ls apps/local-host/src/*-native-plugin-http.ts` | code-read |
| 06 | hybrid 插件名单只减 | HYBRID=["coding"]；Git 已退出 hybrid | PASS | assembly-gate 注释 W5-01-GIT-04；coding 5 处 import 冻结 | code-read |
| 07 | 插件不 import 另一个插件的实现 | plugins/native/*/src 无跨插件包 import | PASS | `grep @molis-ai/molis-work-plugin-` 静态扫描（非本包命中 0） | code-read |
| 08 | 跨模块只走公开 Contract | 宿主 import Runtime 插件包只限已登记存量 | 存量（PG-031/060/088…） | grep 清单见 AC-AUDIT-05 与 b21 | code-read |
| 09 | 模型调用只经 horizontal/agent-host（唯一依赖 @prologue/sdk） | package.json 里依赖 @prologue/sdk 的包集合 | PASS | 只有 `horizontal/agent-host/package.json` | code-read |
| 10 | SDK 只依赖 contracts（public-sdk-private-dependency） | packages/plugin-sdk/package.json deps | PASS | 仅 `@molis-ai/molis-work-contracts` | code-read |
| 11 | 宿主 typed capability 不再新增 | typed-capabilities 计数只减 | PASS（health --report exit 0） | scripts/gates/typed-capabilities.mjs | gate-script |
| 12 | 内置权限同一规则、可选项可关（spec:1159） | bundledGrants 在 install-rules | PASS（PG-003 #741） | packages/plugin-runtime/src/install-rules.ts | code-read |
| 13 | always_on 只许内置（S-34） | 拒绝非 bundled 的 always_on + 拒绝测试 | PASS | install-rules.ts:86-93；tests/security-invariants-always-on.test.ts | code-read |
| 14 | 默认连线只在内置之间（PG-005） | plugin-default-bindings 仅 shipsWithHost | 存量（status 待做） | privileges.md PG-005 | doc |
| 15 | Goals 信任内置调用者名单已删（PG-006） | builtin-plugin-callers.ts 不存在 | PASS | code-read（#812） | code-read |
| 16 | native 动作权限不自动算本机所有者（PG-007） | local-owner-permissions 路由层已改、宿主提供方声明未收尾 | 存量（阶段 4） | apps/local-host/src/local-owner-permissions.ts（b17） | code-read |
| 17 | 页面资源路由只有 web-assets.ts（spec §5a） | 除 web-assets 外无 /assets/ 路由 | PASS（门禁盲区已自述） | web-project-platform-routes.ts:263 仅放行判断；serveWorkbenchAsset 定义 web-assets.ts:52、调用 web-server.ts:118/201 | code-read |
| 18 | CustomEvent 必须登记且与实际一致 | 未登记/无人收发由门禁拦；已知差距有文档 | PASS（8 条已知差距已记录） | scripts/gates/dom-events.mjs --report；UI-PLATFORM.md「现状与例外」 | gate-script |
| 19 | 一张表一个 owner | table-owners 零基线 | PASS（health --report exit 0） | scripts/gates/table-owners.mjs；tooling/gates/table-owners.json | gate-script |
| 20 | 删除项目只有一份 Host 服务 | 所有入口调 ProjectDeletionService | PASS | project-deletion-service.ts；mcp-server.ts:126-127；web-project-deletion.ts:24-77 | code-read |
| 21 | 删除操作者由入口给、不从请求参数读 | mcp/web 入口 actor 来源 | PASS | mcp-server.ts:126-127（identity）；web-project-deletion.ts:56-60（LOCAL_PERSON_ACTOR_ID，非 body） | code-read |
| 22 | 源码兼容标记/旧名只减 | health gate 计数只减 | PASS（health --report exit 0） | scripts/check-health-gates.mjs 兼容标记组 | gate-script |
| 23 | 旧插件短名路由按 W6-01 删（PG-058） | native-plugin-api 别名 + personal 壳仍在 | 存量（见 AC-AUDIT-01/06） | apps/local-host/src/native-plugin-api.ts；web-request.ts:203-215 | code-read |
| 24 | 工作台手写名单改由声明生成（spec:1160，W5-02） | 目录已生成；设置/搜索/翻译/资源名单仍手写 | 部分（PR-1a 完成；PR-1b/2/3 未） | builtin-plugins.ts 头；PG-065/068/070/071/074/075/076 | doc+code |
| 25 | 目录条目不再手写 | builtin-plugins.ts 由生成器写 | PASS | 头注释 + scripts/gates/catalog-entries.mjs | code-read |
| 26 | 内置插件分类完整（Runtime/Home Runtime/构建期） | 25 = 13 项目 Runtime + 6 Home Runtime + 7 构建期（shelf 双身份） | PASS | assembly-gate:29-63；6 个 home registration | code-read |
| 27 | 项目库插件表 X-5（spec:1161） | Manifest 声明表、平台建表、基线不点名插件 | 存量（PG-020/021 进行中） | privileges.md | doc |
| 28 | 删项目按 project_data 声明、不另加 Runtime 钩子（spec:1163、§4a） | initialize_owner_files/onProjectDeleted 已删；project_data 声明迁移未完成 | 存量（PG-024/103 待做，PG-106 已做） | privileges.md；alchemist-service-host.ts:39 仍注册 projectDeletedHooks（PG-024 范围） | doc+code |
| 29 | Characters 并入 modules/characters（spec:1165） | 插件包删除、处理器进 Module | PASS（PG-085） | plugins/native/characters 不存在；characters-host.ts:1 引 module-characters | code-read |
| 30 | 页面不出整页（AGENTS.md） | shell-page-gate 在 CI | PASS（未单独跑） | tests/shell-page-gate.test.ts 存在 | gate-script |
| 31 | 成果库/过程项按 Manifest 声明（AGENTS.md） | artifact-type/declaration gate 在 CI | PASS（未单独跑） | tests/artifact-type-gate.test.ts、artifact-declaration-gate.test.ts 存在 | gate-script |
| 32 | 本机安全边界逐条有拒绝测试（spec §6） | S-01..S-58 表 + test:security | PASS（表在；S-34 测试抽核存在） | docs/system/SECURITY-INVARIANTS.md；tests/security-invariants-always-on.test.ts | doc |
| 33 | S-46 Goals 被拒时宿主不得直接读其表 | 开放项：artifact-actions/web-request 等五处 | 存量（开放，S9 后改动作） | SECURITY-INVARIANTS.md §4（b2） | doc |
| 34 | S-44/S-45/S-57 开放项 | 本机监听口/卸载留登记/连接槽绑定 | 存量（开放） | SECURITY-INVARIANTS.md §4（b2） | doc |
| 35 | contracts 公开 API 快照与源码一致 | api-snapshot 门禁 | PASS（health --report exit 0） | scripts/gates/api-snapshot.mjs；报告 72 文件/2935 declarations | gate-script |
| 36 | 动作合同快照与源码一致 | action-contract snapshot | PASS（health --report exit 0） | scripts/gates/action-contract-*.mjs | gate-script |
| 37 | contracts 无只导出描述符的占位子路径 | contract-placeholders 门禁 | PASS（health --report exit 0） | scripts/gates/contract-placeholders.mjs | gate-script |
| 38 | 页面资源预算（2026-10-18 起体积控制，非硬上限） | page-assets 门禁 + APPROVED_CEILINGS 流程 | PASS（health --report exit 0） | scripts/gates/page-assets.mjs；spec §5a | gate-script |
| 39 | 活文档无断链 | doc 引用门禁 | PASS（报告 none broken） | scripts/gates/doc-* | gate-script |
| 40 | spec 状态句/索引/BACKLOG 无完成行 | 仓库形状门禁 | PASS（health --report exit 0） | specs/README.md、specs/BACKLOG.md、gate backlog-rows | gate-script |
| 41 | 仓库根目录形状、.impeccable 只减 | root-entries/impeccable-files 门禁 | PASS（health --report exit 0） | tooling/gates/root-allowlist.json | gate-script |
| 42 | vendored SDK ≤2 且 provenance 相符 | vendored 门禁 | PASS（health --report exit 0） | vendor/prologue-sdk/README.md | gate-script |
| 43 | spec §5.1 包清单表与代码一致（绝对规则） | package-inventory --check | PASS | 命令 exit 0「71 packages, all matching the code」 | gate-script |
| 44 | 文档内部引用的行号准确 | privileges.md:5 引 spec 508–517 vs 实际 1154–1168 | FAIL | AC-AUDIT-03 | code-read |
| 45 | privileges PG 状态/描述与代码现状一致 | PG-058/PG-065 描述过时 | FAIL | AC-AUDIT-01/02 | code-read |
| 46 | PG-051 状态与已合 PR 一致 | #1147 已入 main，privileges 仍「待做」 | 流程内（SLICE-RULES 统筹批量写；PRIVILEGES-PENDING 已记） | privileges.md:223；PRIVILEGES-PENDING.md | doc |
| 47 | 双实例规则（spec:双实例 U1/U2） | dual_instance 只在启动名单、权限全 required | PASS（health --report exit 0） | scripts/gates/dual-instance.mjs | gate-script |
| 48 | MCP 作用域/S-43 services.actions.directory/S-57 connections | 合同与测试 | UNVERIFIED（本轮未取证） | — | — |
| 49 | spec 状态句只减 | 门禁 | PASS（health --report exit 0） | scripts/gates/spec-*.mjs | gate-script |
| 50 | 冻结名单只减不增（测试精确匹配 + assembly 指标） | 磁盘与名单一致、数字不增 | PASS | assembly-gate 全测试；health --report exit 0 | gate-script |

## 2. 本轮发现表

格式：`AC-AUDIT-NN | 违反需求（文件:行 / § / PG 行）| 证据（path:line + 代码摘录）| 影响 | 严重度 | 证据强度 | 建议 owner | 验证方式 | 已有 PR/任务`

### AC-AUDIT-01 | privileges.md `PG-058` 行与 §8 复核文字过时：声称还剩九份 `*-native-plugin-http.ts` 与手写别名表
- **违反**：spec §1 特权行（spec.md:1160）要求「现状与代码一致」类文档不漂移；privileges.md:236（PG-058）、:439（§8 复核）。
- **证据**：privileges.md:236 写「还在的宿主 HTTP 文件：alchemist、artifact、feed、inbox、pages、personal、schedule、shelf、workflows 各一份」；:439 写「还剩 `native-plugin-api.ts` 的别名表和九份 `*-native-plugin-http.ts`；原表漏了 workflows 和成果库（artifact）两份」。main tip 磁盘实际只有 **5** 份：`alchemist`、`artifact`、`feed`、`inbox`、`personal`（`ls apps/local-host/src/*-native-plugin-http.ts`；assembly-gate:55 的 NATIVE_PLUGIN_HTTP_FILES 与此一致）。pages/schedule/shelf/workflows 四份分别在 `e161c27dc`(#847)、`f562ed466`(#1018)、`38111ce61`(#1076)、`88e19e0b7`(#851) 删除。`apps/local-host/src/native-plugin-api.ts:4-14` 的别名已从手写表改为按 `BUILTIN_PLUGIN_CATALOG` 计算（`nativePluginHttpAliases()`）。
- **影响**：后续片（W6-01/PG-058）按过时清单排期会误判工作量；审计/评审会重复核已删文件。
- **严重度**：non-blocker（文档债）  **证据强度**：code-read + gate-script
- **建议 owner**：统筹（Codex；privileges 状态批量写）或评审修复线 #1114 文档债；修复线只改文档，不改代码
- **验证方式**：`ls apps/local-host/src/*-native-plugin-http.ts | wc -l` == 5；读 native-plugin-api.ts；对照 git log --diff-filter=D
- **已有 PR/任务**：#1114「复审报告与文档债」可能部分覆盖（UNVERIFIED 是否含 privileges）；W6-01 未开片

### AC-AUDIT-02 | privileges.md `PG-065` 数字过时：26 条手写目录条目 / 26 个 registration.ts
- **违反**：privileges.md:249 与 main 实际不符（要求同 PG 状态一致性）
- **证据**：`find plugins/native -maxdepth 3 -name registration.ts | wc -l` = **25**；`apps/workbench/src/builtin-plugins.ts` 头注释写明由 `scripts/generate-plugin-registry.mjs` 生成（PR-1a 已落地，scripts/gates/catalog-entries.mjs 核对）；目录 25 条 = 13 项目 Runtime + 6 Home Runtime + 7 构建期 − shelf 双身份。privileges.md:249 仍写「26 条手写的目录条目」「各插件的 src/registration.ts（26 个）」。
- **影响**：同 AC-AUDIT-01；另会让「手写目录」旧结论被当现状引用（PG-065 状态列已写「部分：PR-1a」但数字未改）。
- **严重度**：non-blocker  **证据强度**：code-read
- **建议 owner**：统筹（Codex）/ 评审修复线
- **验证方式**：find 计数；读 builtin-plugins.ts 头；`node scripts/gates/catalog-entries.mjs`（health:check 内）
- **已有 PR/任务**：#1114（可能）

### AC-AUDIT-03 | privileges.md:5 引用的 spec 行号过时（第 508–517 行 → 实际 1154–1168）
- **违反**：文档内部引用准确性（健康门禁的「文档引用」只查路径/锚点，不查行号）
- **证据**：privileges.md:5「依据 `spec.md` §1 的 2026-10-18 各行，第 508–517 行」；main tip `grep -n "^| 2026-10-18 " specs/repository-anti-corruption/spec.md` = 1154–1168（1154 页面体积、1155 收口范围、1156 插件待遇、1157 四个例外、1158 Sessions、1159 内置授权、1160 其余特权、1161 项目库插件表、1162 放置、1163 删项目数据、1164 目录条目、1165 Characters、1166 合并与全量、1167 全量红停、1168 Computer Use）。
- **影响**：按行号回查需求会指错位置（审计/新会话踩坑）。
- **严重度**：non-blocker  **证据强度**：code-read
- **建议 owner**：统筹/评审修复线（改引用为「§1 2026-10-18 各行」或当前行号）
- **验证方式**：grep 行号
- **已有 PR/任务**：无（UNVERIFIED）

### AC-AUDIT-04 | privileges §7 第 9 条（SSOT 128/133/152/216 仍把成果库/创作台/Sessions 写成插件）已过时
- **违反**：文档漂移（同上）
- **证据**：SSOT-MATRIX.md:128 = goals 行、:133 = `apps/workbench/src/functions` 行（均非成果库/创作台/Sessions）；带「2026-10-18 改」注的是 :129 artifacts、:152 plugin-builder、:155 work/Sessions、:216 plugin-builder 工作台节。privileges §7 第 9 条（原文冲突清单）仍按旧行号描述。
- **影响**：同 AC-AUDIT-01。
- **严重度**：non-blocker  **证据强度**：code-read
- **建议 owner**：统筹/评审修复线
- **验证方式**：sed -n '128p;133p;152p;155p;216p' docs/SSOT-MATRIX.md
- **已有 PR/任务**：#1114（可能）

### AC-AUDIT-05 | 宿主直接 import Runtime 插件包：context-onboarding-service.ts 的 pages/artifacts/todo，PG-088 只记了 Pages
- **违反**：AGENTS.md「插件不 import 另一插件实现；跨模块只走公开 Contract」及 spec:1160「缺的平台能力补齐、不给私路」；PG-088 记录「仍直接 import Pages 包，要改走公开动作」。
- **证据**：`apps/local-host/src/context-onboarding-service.ts:6` `import { pagesActions, blocksFromMarkdown } from "@molis-ai/molis-work-plugin-pages"`；`:15` `import { ARTIFACTS_PLUGIN_ID, artifactsActions } from "@molis-ai/molis-work-plugin-artifacts"`；`:19` `import { TODO_ORGANIZE_MATERIAL_CHARS, todoOrganizeActions } from "@molis-ai/molis-work-plugin-todo"`。使用点：:343/349（TODO_ORGANIZE_MATERIAL_CHARS 截断）、:376（`homeActions...invoke(todoOrganizeActions.extract)`）、:387（blocksFromMarkdown）、:441/:466（artifactsActions.importFile）、:451/:463（pagesActions.importDocuments）、:493/:498（todoOrganizeActions.get/apply）。PG-088 只列 context-onboarding-service.ts:5,206-209,247,253（Pages）；**todo 的 import 未被任何 PG 行点到**，artifacts 的 import 也不在 PG-031 的代码位置表（该表只列 content-action-providers.ts / web-onboarding.ts:29,31）。
- **影响**：Runtime 化后宿主仍通过包内实现走私路，W5-02/W5-06 收口时会漏掉这条；`pluginOutsideMentions` 只减门禁能拦住「新增」，不能让已存在项自动消失。
- **严重度**：non-blocker（P2，存量私路，不新增）  **证据强度**：code-read
- **建议 owner**：ac-platform（PG-088 片或 W5-02 目录/动作改造时一并改走公开动作；todo/artifacts 两条补进 privileges 代码位置）
- **验证方式**：改完后 `grep -n "molis-work-plugin-" apps/local-host/src/context-onboarding-service.ts` 为空；onboarding 相关测试通过
- **已有 PR/任务**：PG-088 部分已做（Pages Runtime 化 #847）；未见到覆盖 todo 的专门任务（UNVERIFIED）

### AC-AUDIT-06 | `personal` 旧插件短名路由仍是冻结的活路由，静态找不到调用方（UNVERIFIED），可随 PG-058/W6-01 一并删
- **违反**：spec:1160 要求「其余只给内置插件的特权全部改按声明与授权」；旧短名路由属于 W6-01 要删的兼容面（PG-058）。
- **证据**：`apps/local-host/src/web-request.ts:204-215` `nativePluginRoutes` 里 `{ id: "personal", handle: … Boolean(serverOptions.homeDirectory) && await handlePersonalNativePluginHttp(…) }`；`personal-native-plugin-http.ts` 只是薄壳：`withRewrittenPluginApi(url)` 后委托 `handleAlchemistNativePluginHttp`；`alchemist-native-plugin-http.ts:18` 只接受 `/api/alchemist` 前缀。仓库内静态 grep `/api/personal` 无调用方（含 apps/desktop、tests）。即：该 route 仅为旧「personal」插件 id 的 `/api/plugins/<id>/` → `/api/alchemist/` 别名链存在，旧 id 已不在目录（catalog 25 条无 personal）。
- **影响**：多一份冻结 native-http 文件与一条无调用方的旧路由；冻结名单只能减，删它可立即缩小名单并减少 W6-01 工作量。
- **严重度**：non-blocker（P3）  **证据强度**：code-read（调用方结论 UNVERIFIED）
- **建议 owner**：ac-platform / Codex（随 W6-01 或 PG-058 片）
- **验证方式**：确认无调用方后删 route + 文件，更新 assembly-gate 的 NATIVE_PLUGIN_HTTP_FILES（只减）与 native-plugin-api.ts；跑 assembly/dom-events/web 相关用例
- **已有 PR/任务**：PG-058 待做、W6-01 未开片；#1130/Sessions 线不涉及

## 3. 需 lead 派修清单（按优先级）

1. **AC-AUDIT-05（P2，代码）**：把 context-onboarding-service.ts 的 pages/artifacts/todo 直接 import 改成公开动作（或并入 PG-088 片）；同时把 todo/artifacts 的 import 位置补进 privileges PG-088/PG-031 的代码位置表。建议 owner：ac-platform（或 Codex 排进 W5-02/PG-088 后续片）。
2. **AC-AUDIT-01/02/03/04（P3，纯文档）**：一次 privileges.md/SSOT 行号与数字清理；建议 owner：Codex 统筹批量写 privileges 时顺手改，或评审修复线 #1114 文档债。给 Codex 的精确修改点：privileges.md:5、:236、:249、§7 第 9 条、:439。
3. **AC-AUDIT-06（P3，代码+门禁）**：确认无调用方后删 `personal` route/文件、缩 NATIVE_PLUGIN_HTTP_FILES；建议 owner：ac-platform / Codex 排进 W6-01 或 PG-058 片（需先确认 desktop/外部无调用）。

## 4. 已知/流程内，不算缺陷（避免重复派修）

- **PG-051 状态滞后**：main tip 就是 #1147（PG-051 P2b），privileges PG-051 仍「待做」；SLICE-RULES 约定片 PR 不改状态、合入后统筹批量写，PRIVILEGES-PENDING.md 已记 #1147 待写 → 流程内，不是新缺陷。
- **dom-events 的 8 条 finding**：全部是已登记在 `docs/platform/UI-PLATFORM.md`「现状与例外」的已知差距，`tests/dom-events-contract.test.ts:396-437` 在拦住「新增未记录差距」→ 不算新发现（登记机制 PASS）。
- **local-owner-permissions.ts 手写 HOST_OWNER_PERMISSIONS**：PG-007 阶段 4 待做，状态与代码一致（#788 只做路由层）。
- **项目库 X-5 / project_data 声明 / 后台调度 / Feed 宿主组装**：PG-020/021/024/093 等在治，本轮不重复。
- **原生插件 named host 文件**（alchemist-*/artifact-*/feed-*/inbox-*/goals-actions/web-goals-read 等）：属 7 个构建期冻结插件，assembly.mjs 指标「只减」兜底；在途 #1130（Sessions 下线）会删 work-*.ts，届时冻结名单与指标需同步降。
- **in-flight PR 防重复**：#1147 已合（PG-051）；#1130 Sessions 下线（PG-081/082，会动 work 包/目录/冻结名单 "sessions"）；#1148（BL-364 typed→actions）；#1112/#1107/#1098（W5-06/PG-060）；#1139/#1143/#1144（PG-017）；#1157（Sessions SC-4b）；#1114（文档债）。

## 5. 下一轮主题

**直接 `import "@prologue/sdk"` 与「模型调用只经 horizontal/agent-host」的存量核对**：包依赖面已抽核（只有 agent-host 依赖 @prologue/sdk，PASS），下一轮做代码级：源码里 `@prologue/sdk` 的 import 分布、vendored 包的使用边界、agent-host 之外是否有绕过（含 vendored 注释/类型引用）、以及 `@prologue/sdk` 公开 API 快照与 `vendor/prologue-sdk` 一致性。若 lead 有新指令则按指令切换。

---

## 6. 第 2 轮（主题 a：`@prologue/sdk` 边界 + AC-AUDIT-06 落实）

> 基准刷新：origin/main `89c9a7194`（#1126，2026-10-23 晚）。`1756f9842..89c9a7194` 只改 `plugins/native/coding/**`、`scripts/gates/page-assets.mjs`、`tooling/gates/page-assets.json` 等 11 个文件，第 1 轮结论不受影响。

### 6.1 主题 a 结论：PASS（无 blocker）

- `@prologue/sdk` 的源码 import 全部在 `horizontal/agent-host`（77 处，覆盖 `src/inference.ts` 与 `src/adapters/prologue-*.ts` 共 31 个文件）；**agent-host 之外 0 个产品源码文件 import**。
- 依赖声明：唯一声明 `@prologue/sdk` 的 `package.json` 是 `horizontal/agent-host/package.json:29`（`file:../../vendor/prologue-sdk/prologue-sdk-0.0.0-rc.1-retry-waiting.tgz`）；`scripts/workspace-packages.mjs:65` 的 agent-host 条目 `extraDependencies` 是同一条记录；`vendor/prologue-sdk/` 只有 1 份 tgz + `.sha256` + `.provenance.json`（≤2 限制、provenance 相符由 health 门禁覆盖，第 1 轮 `--report` exit 0）。
- 测试（15 个 `tests/*.test.ts`）直接 import `@prologue/sdk` 构造 fixture：测试不是产品包，不违反「唯一依赖包」硬约束；`tests/test-imports` 门禁只管内部包 → 记为观察，不算违规。
- 直接模型端点：`plugins/native/images/src/browser/connections.ts:5-6` 的 OpenAI/Gemini 端点只是图片服务的 UI 预置配置（`PRESETS`），插件内无 fetch/HTTP 调用；全仓无 `chat/completions` 等直接调用（tests 里只有 1.1.1.1 fixture 假端点）→ 「模型调用只经 horizontal/agent-host」成立（code-read）。
- `packages/plugin-sdk/src` 未 re-export `@prologue/sdk` 或任何私有包（grep 0；`packages/plugin-sdk/src/index.ts:83` 只是自己的 packageName 声明）；SDK deps 仅 contracts（第 1 轮 PASS）。

### 6.2 AC-AUDIT-06 复核修正 + 精确删除清单（只读确认，未改代码）

- **更正第 1 轮描述**：不存在 `/api/personal` 路由；`personal` 只是 `apps/local-host/src/web-request.ts` 路由表条目的 id。该条目实际作用：对 build-time 且 `personal: true` 的目录项，把 `/api/plugins/<id>/…` 经 `withRewrittenPluginApi` 重写为 `/api/<id>/…` 后交给 **alchemist** handler；alchemist handler 只认 `/api/alchemist` 前缀（`apps/local-host/src/alchemist-native-plugin-http.ts:18`）。Runtime 插件的 `/api/plugins/<runtime id>/…` 由更早的 `runtimePluginsRoute`（`project-plugin-http.ts`）处理，不经过此桥。
- **调用方核实**：`handlePersonalNativePluginHttp` 仅被 `apps/local-host/src/web-request.ts:34,206` 与 `tests/personal-plugins-review-fixes.test.ts:46,71,77` 使用；`/api/plugins/<alchemist|plugin-builder>` 前缀在 `apps/workbench`、`apps/desktop`、`apps/local-host`、`plugins/`、`tests/` 中无构造（静态 grep）；`/api/personal` 除 archive spec 的 `/api/personal-assistant` 外无引用。`withRewrittenPluginApi` / `rewriteNativePluginApiPath` 仍被 `apps/local-host/src/functions-http.ts:1,22` 使用（`/api/plugins/functions` ↔ `/api/functions`），测试也钉住其行为 → **`native-plugin-api.ts` 必须保留**。
- **精确删除清单（PG-058 / W6-01 片，供派修子代理执行）**：
  1. 删文件 `apps/local-host/src/personal-native-plugin-http.ts`（薄壳：2 个 import + `handlePersonalNativePluginHttp`）。
  2. `apps/local-host/src/web-request.ts`：删 `:7` `pluginRouteControl` import、`:8` `ActionError` import、`:14` `ALCHEMIST_ACTION_PERMISSIONS` import（三者仅被该路由块使用：grep 计数 2/3/2）；删 `:34` personal handler import；删 `:203-215` 注释 + `const nativePluginRoutes = [ { id: "personal", … } ]`；删 `:298` `...nativePluginRoutes,`。
  3. `tests/builtin-plugin-assembly-gate.test.ts:55-58`：`NATIVE_PLUGIN_HTTP_FILES` 删 `"personal"`（剩 alchemist/artifact/feed/inbox；名单只减，合法）。
  4. `tests/personal-plugins-review-fixes.test.ts`：删 `:46` import；`:69-71` `listenDispatcher` 的 `ports` 参数与 `:77` 的 `handlePersonalNativePluginHttp(...)` 调用改为只走 `handleFunctionsHttp`；`:184-189` 的 `rewriteNativePluginApiPath` 断言保留。
  5. 不需要改 `apps/local-host/src/index.ts`（未导出该文件；grep 确认）。
  6. 验证：`node scripts/run-tests.mjs tests/builtin-plugin-assembly-gate.test.ts tests/personal-plugins-review-fixes.test.ts tests/security-invariants-plugin-pages.test.ts`；`node scripts/check-health-gates.mjs --base origin/main`（数字只减；必要时同 PR `--update --base origin/main` 刷新 `tooling/gates/baseline.json`）。
- **预期收益**：冻结名单 −1、宿主 `*-native-plugin-http.ts` 5→4、assembly `hostPluginFiles`/路由表 −1；无对外 API 变化（无客户端调用）。
- **风险**：仓库外（第三方/用户脚本）若硬编码 `/api/plugins/<alchemist>` 会 404；本仓静态不可见 → 标 **UNVERIFIED（外部调用方）**，建议删除 PR 说明里写明。
- **HANDOFF-TO-CODEX**：AC-AUDIT-05（context-onboarding-service 直接 import pages/artifacts/todo）按 lead 指示本轮不派修，由统筹转 ac-platform 线处理；本轮只在审计文件保留证据。

### 6.3 下一轮

主题 b（lead 队列）：**privileges/SSOT 全表漂移核对** —— 逐 PG 行对照 main 代码现状，输出「PG 行 → 精确 edit（改状态/改描述/删行）」给统筹批量写；覆盖 PG 状态与代码矛盾、SSOT 矩阵旧描述（128/133/152/216 类）、§7 冲突清单过时项；同时把第 1 轮 4 条文档漂移合并成一份可直接贴的 edit 清单。

---

## 7. 第 3 轮（主题 b：privileges / SSOT 全表漂移核对）

> 基准：`origin/main` = `89c9a7194`（`1756f9842..89c9a7194` 只改 coding 插件与 page-assets；`git log -- specs/repository-anti-corruption/privileges.md` 自 `1756f9842` 起为空 → privileges.md 内容与第 1 轮读取一致）。方法：解析 136 条 `| PG-` 表行（含 §6/§8 重复行），用 5689 文件索引把 bare basename / 包内相对路径解析到真实文件，再校验 `path:line` 是否越界；状态列与已合 PR 对照（#1120 `47c780644`、#1126、#1132、#1137 `4e5f91a19`、#1145、#1147 `1756f9842`）。`node scripts/gates/package-inventory.mjs --check` 退出 0（spec §5.1 与代码一致）。

### 7.1 结论（无 blocker）

- **代码状态与 privileges 状态列的矛盾只剩「已合未写」的流程滞后**（SLICE-RULES 内，不算缺陷）：PG-051 已由 #1147（P2a+P2b，已在 main 1756f9842）做完，行里仍写「待做」；PG-010 已由 #1120（2026-10-24）做完「不点插件 id」，行里仍写「待做」；PG-056/070/071 的进度（Jelly #1145、Issues #1132、Images #1137）已写进行内，其他插件片未合，状态可不动。**需统筹批量写**：PG-051（→已做）、PG-010（→已做）。
- **在途 PR 覆盖的 PG 暂不改**：PG-017（#1139/#1143/#1144）、PG-081/PG-082（#1130）——等合入后随批量写一起改，避免和 PR 冲突。
- **机械漂移共 21 处**（下面 §7.2）：主要是 `path:line` 越界（生成器改造后 `builtin-plugins.ts` 只剩 58 行；客户端打包后 `client.ts` 只剩 9 行加载器；`schedule-runtime.ts`、`schedule-reminders.ts`、`builtin-plugin-callers.ts`、`capture-client.ts` 已删）与计数过时（26 条目录条目→25、rawFetch 85→45、宿主 HTTP 文件 9→5、SSOT 行号）。
- **PASS（无需改）**：`package-inventory --check`；`plugins/native/**/registration.ts` 25 个且目录由生成器写（PR-1a #840）；`@prologue/sdk` 唯一依赖（第 2 轮）；`native-plugin-api.ts` 别名表已从目录计算（非手写）；第 1 轮「已做」判断与当前 privileges 一致（PG-003/018/019/027/039/041/042/048/050/052/012/088/089 均已更新，STATUS-MATRIX-2026-10-23 的「状态过时」清单已过时）。

### 7.2 「PG 行 → 精确 edit」清单（行号基于 89c9a7194；按 PG 编号定位更稳）

| # | 行 | 现状（问题） | 改为 |
| --- | --- | --- | --- |
| E1 | privileges.md:5 | 「§1 的 2026-10-18 各行，第 508–517 行」「第 506、507、518、519 行不是特权行」 | 「第 1154–1168 行」「第 1152、1153、1169、1170 行」（2026-10-23 复核：spec 增行后旧行号失效） |
| E2 | 134（PG-006） | 代码位置 `action-contract.ts:11-21`（现 9 行）、`goals-actions.ts:17-19`、`builtin-plugin-callers.ts:1-13`（已删） | 「`plugins/native/goals/src/action-contract.ts`（现 9 行，已无内置调用者检查）、`goals-actions.ts`（原 :17-19 已删）、`builtin-plugin-callers.ts`（已删，随 #812）」 |
| E3 | 138（PG-010） | 状态「待做」；代码位置 `functions-host.ts:13-18` | 状态→「已做（#1120，2026-10-24：首页规则的选项目标按声明找，不再点插件 id）」；位置→「`modules/functions/src/builtin.ts`（默认规则仍在，不再点插件 id）、`apps/local-host/src/functions-host.ts:17-31`（`declaredRuleTargets` 按声明找）」 |
| E4 | 175（PG-102） | `apps/workbench/src/builtin-plugins.ts:76-80,140,157` | 同文件「（生成物，现 58 行；原行号已随 PR-1a 生成器失效）」，字段实际在各自 `src/registration.ts` |
| E5 | 176（PG-103） | `apps/workbench/src/builtin-plugins.ts:77-78` | 同上（生成物，现 58 行） |
| E6 | 178（PG-106） | `packages/contracts/src/platform/plugin.ts:385-386` | 「`packages/contracts/src/platform/plugin.ts`（现 304 行；原 :385-386 的 `onProjectDeleted` 已随 C4 删）」 |
| E7 | 204（PG-037） | `coding-surface.ts:173-232`（现 148 行）；`ensureStarted` 已不存在 | 「`coding-surface.ts`（现 148 行，原 :173-232 越界；分发已挪 `project-plugin-http.ts:45 handleProjectPluginHttp`）」 |
| E8 | 211（PG-044） | `project-plugin-ports.ts:46`（现 43 行） | `project-plugin-ports.ts:40-43`（review settlements 端口） |
| E9 | 219（PG-047） | `project-plugin-ports.ts:49`（现 43 行） | 「`project-plugin-ports.ts`（现 43 行，原 :49 越界；模型列表端口已删）」 |
| E10 | 223（PG-051） | 状态「待做」；`plugin-instructions.ts:26-49`、`agent-definitions/builtin-instructions.ts:13`、`todo/src/plugin.ts:15-31` | 状态→「已做（#1147，P2a+P2b，2026-10-24 合入 main：Agent 定义只由运行中的定义登记，删目录那条与回落）」；位置→「`plugin-instructions.ts:34-38,63-67`（现在唯一登记路）、`agent-definitions/builtin-instructions.ts`（目录那条已删）」 |
| E11 | 225（PG-053） | `plugins/native/shelf/src/terminal-client.ts:90,95`（现 65 行） | 「`plugins/native/shelf/src/terminal-client.ts`（现 65 行，原 :90,95 越界）」 |
| E12 | 234（PG-056） | 基线「rawFetchInScripts 共 85 处」；`todo/src/client.ts:97`、`issues/src/client.ts:34`（均 9 行加载器） | 「rawFetchInScripts 共 45 处/25 文件（`tooling/gates/baseline.json`，2026-10-23 复核）」；位置→「`plugins/native/todo/src/browser/request.ts`、`plugins/native/issues/src/browser/request.ts`（client.ts 已变打包脚本加载器）」 |
| E13 | 235（PG-057） | `issues/src/capture-client.ts:37-38,48,71,73`（不存在）、`todo/src/client.ts:783,788`（9 行） | 「`plugins/native/issues/src/browser/capture.ts`（capture-client.ts 已不存在）、`plugins/native/todo/src/browser/**`（client.ts 现为 9 行加载器）」 |
| E14 | 236（PG-058） | 描述「每个插件配一份宿主 HTTP 文件」；位置「还在的宿主 HTTP 文件：alchemist、artifact、feed、inbox、pages、personal、schedule、shelf、workflows 各一份」；受影响列含 Pages/Schedule/Workflows；状态「待做（T0 已核）」 | 描述→「剩下的构建期插件各有一份宿主 HTTP 文件（现只剩 5 份：alchemist、artifact、feed、inbox、personal；`personal` 是 alchemist 的旧短名桥）」；位置→「alchemist/artifact/feed/inbox/personal 五份；`native-plugin-api.ts:4-13` 的别名表现从 `BUILTIN_PLUGIN_CATALOG` 计算（跳过 `personal===true` 与 Runtime，另加 functions 两条），非手写表」；受影响→「Feed、Inbox、Goals、Alchemist、Shelf、成果库（Pages、Dataset、PPT、Workflows、Form、Cognia、Jelly、Images 已迁走）」；状态→「部分（2026-10-23 复核：Pages/Dataset/PPT/Workflows/Form 已迁；Goals 路由已声明 S7b、宿主仍按旧地址改写；Shelf #1076 在途；Feed/Inbox/成果库/Sessions 未动）；Alchemist 不迁…」 |
| E15 | 249（PG-065） | 「26 条手写的目录条目」「`src/registration.ts`（26 个…」 | 「25 条目录条目（原 26；Characters 已并入 `modules/characters`，CHR-1 #1008）」「`src/registration.ts`（25 个…」 |
| E16 | 274（PG-084） | `apps/workbench/src/builtin-plugins.ts:118-131`（现 58 行） | 「`apps/workbench/src/builtin-plugins.ts`（生成物，现 58 行，原 :118-131 越界；plugin-builder 条目由 `plugins/native/plugin-builder/src/registration.ts` 生成）」 |
| E17 | 284（PG-089） | `schedule-runtime.ts:50-78`、`schedule-reminders.ts:1-2,30-36`（均已删） | 两处前缀加「（已删，#1018）」；其余 Inbox 引用不变 |
| E18 | 289（PG-094） | `plugins/native/goals/src/index.ts:120-121`（现 114 行） | `plugins/native/goals/src/index.ts:110-114`（现导出口） |
| E19 | 392–404（§7 第 9 条） | 「SSOT 第 128、133、152、216 行…还把成果库、创作台、Sessions 写成插件」 | 整条改为「已解决（2026-10-23 复核）：SSOT 129（artifacts）、152（plugin-builder）、155（work/Sessions）、216（plugin-builder 工作台节）均已加「2026-10-18 改」注；原列 128、133 不是问题行（goals、workbench/functions）」 |
| E20 | 405（§7 第 10 条） | `schedule-reminders.ts:34` 的注释 | 整条改为「已随 #1018 删（文件不存在），闭环」 |
| E21 | 439（§8 PG-058 复核行） | 「还剩 native-plugin-api.ts 的别名表和九份 `*-native-plugin-http.ts`；原表漏了 workflows 和成果库（artifact）两份」 | 在句末追加「（2026-10-23 复核：磁盘只剩 5 份 alchemist/artifact/feed/inbox/personal；别名表已改为从目录计算；「九份」与「漏列」随迁移过时）」 |

### 7.3 需 lead 派修 / 转统筹

- **无需派修**：本轮全是文档 edit，建议交统筹（Codex）在下一批 privileges.md/spec.md 更新里一次写入；E1/E14/E15/E19/E21 同时覆盖第 1 轮的 4 条文档漂移。
- **供 task-13 复核**（PR 出来后我第 4 轮顺手看）：删除清单对应 PG-058 的 `personal` 一份；本轮 E14 已按「剩 5 份」写，task-13 合入后应为「剩 4 份（alchemist/artifact/feed/inbox）」，届时再改一次。

### 7.4 下一轮

主题 c（lead 队列）：**typed capability / 宿主能力注册是否仍在新增**。方法：`scripts/gates/typed-capabilities.mjs` 的 type-refs / without-action / register-calls 三项基线、`HostCapabilityDefinition` grep、`registerCapability`/`register(` 调用面，对照 privileges PG-035（剩 agent 37 条 BL-364、scheduler 4 条 BL-365）与 W5-08 typed 140 处；输出「是否还有新增入口 / 存量清单与 owner」。

---

## 8. 第 4 轮（主题 c：typed capability / 宿主能力注册是否仍在新增）

基准：origin/main `89c9a7194`（复核时再次 fetch，仍无新提交）。只读，未改代码。

### 8.1 结论：PASS（无 blocker；未发现「新增 typed 条目」）

证据（code-read + gate 报告 + git 历史）：

1. 决策基线：spec §5a 的「宿主能力（typed）：`HostCapabilityDefinition` 与包装它的别名的引用、无 `action` 的描述符、`registerCapability` 与对 `LocalHost` 一类注册型接收者的 `register` 的调用和引用；新能力注册成动作，不再新增 typed 条目」；口径在 `scripts/gates/typed-capabilities.mjs` 头部（decision 2026-10-07，N-12/W1-05：「typed registry 只作宿主内部通道（agent.*、schedule.*、workspace writers），不再新增条目」）。
2. 冻结前后对比（`tooling/gates/baseline.json`，2026-10-07 `b7844527` vs `89c9a7194`）：
   - `typedCapabilitiesTotal` 338 → **126**（−212）；
   - `#without-action` 100 → **31**（−69）；
   - 有记录文件 44 → **17**，且 `files added vs old: []`（没有新文件带 typed 记录）。
3. 现存 typed 条目清点（`packages/contracts/src/services/agent-host.ts` 的 `agentHostCapabilities`，共 38 条 `capability_id`）：**typed 30 条 + 已是动作 8 条**（`agent.messages.*` 5 条、`agent.background.*` 2 条由 #1121（R8 第 1 批，2026-10-24）改成动作；`agent.draft-text.v1` 由 #999 改成 ActionDefinition）。30 条 typed 的 id 最早引入时间全部 ≤ 2026-09-26（冻结前）；唯一「冻结后出现」的 `agent.collaboration.await.v1` 是 2026-10-15 #534 把旧 `agent.waits.await.v1` 改名（同一条能力、计数未增，**不是新增**）。`agent.project-work.queue.v1` 的引入 commit `cbdfae1f6` 是 2026-09-26（冻结前）。
4. 登记点唯一：全仓 `registerCapability(` 调用只剩 `apps/local-host/src/agent-host-composition.ts:115`（按 `definition.action` 分派：动作→`registerAction`、typed→`registerCapability`），draftText 在 `:132` 走 `registerAction`；没有第二个文件登记 typed 条目。
5. 新能力走动作的样本：`host.review.settled@1` 是宿主事件（`packages/contracts/src/platform/plugin-events.ts:28,48`；`packages/plugin-runtime/src/host-events.ts:48`），不是 typed 条目；`draftText`（#999）已是 `ActionDefinition`；`HostCapabilityDefinition` 的引用文件只有 10 个（`agent-host.ts`、`app-host.ts`、`actions.ts`、`plugin.ts`、`kernel/src/index.ts`、`local-host.ts`、`project-host.ts`、`capability-registration.ts`、`plugin-runtime/src/services.ts`、`agent-host-composition.ts`），全部旧文件。
6. 插件侧 typed 调用仍受 Manifest 约束：`packages/plugin-runtime/src/services.ts` 的 `createPluginCapabilityClient` 只放行 `manifest.capabilities.consumes`（否则 `plugin.capability_denied`），不是任意调用。剩余 typed 消费方：Coding 23 处 `api.invoke(agent.*)`（BL-364 迁移中）、Characters 宿主提供方 2 处（`characters-host.ts` 的 listRuntimes/listActions）、plugin-builder Manifest consumes（PG-101 不迁，随删除）。
7. 机械口径缺口（脚本头已自述，非本轮新发现、非 blocker）：gate 按文件净计数，同一 PR 在同一文件「加一条 typed、删一条 typed」净额不变会通过；只按 id 字符串调用既存 typed 能力的消费者不计入。记录备查。

### 8.2 本轮唯一 edit（E22，需统筹批量写）

- `specs/repository-anti-corruption/privileges.md:194`（PG-035）状态/进度文字过时：
  - 「agent 其余 37 条」→ 现在剩 **30 条**（#1121 R8 第 1 批已把 7 条改成动作，2026-10-24 合入；#1148 R8 第 2 批 4 条在途）；
  - 「scheduler 的 4 条记 BL-365」→ BL-365 已关：那 4 条已随 #1018 删除、插件改经 `services.scheduler`，R8 片只清理待办行与三处文档（`specs/repository-anti-corruption/slices/r8-agent-host-actions.md:8`）；
  - 代码位置 `agent-host-composition.ts:131,153,172,178,197,228,240,291,295` 已失效 → 改 `agent-host-composition.ts:107-120`（按 `definition.action` 分派登记）、`:132`（draftText 动作）。
- 说明：此行属「已合未写/进度更新」，写回由统筹批量写，我不改 privileges。

### 8.3 task-13 只读复核状态（§6 更新）

- 2026-10-23 fetch 后 origin/main 仍 `89c9a7194`；`git ls-remote origin refs/heads/anticorr/w6-01-personal-http-removal` 为空、`gh pr list --state all` 无该分支 → **PR 尚未出现，无法复核**。
- 验收依据仍为 §6.2 的 6 步清单：personal 文件全删、`web-request.ts` 只删 4 处 import + `:203-215` 块 + `:298` spread、`NATIVE_PLUGIN_HTTP_FILES` 5→4、测试改法、验证命令与 `--base origin/main` 数字检查。等 lead 通知或下一轮再看；合入后 PG-058 5→4（E14 已预留）。

### 8.4 下一轮

主题 d（lead 队列）：**表 owner 违规** —— `tooling/gates/table-owners.json`、`scripts/gates/table-owners.mjs` 的零基线；抽查 modules/plugins 写别人表、非字面量表名/拼接 SQL 的盲区、共用表登记理由与代码现状一致。
