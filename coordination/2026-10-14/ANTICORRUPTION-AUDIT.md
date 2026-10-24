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

### 6.2 AC-AUDIT-06 复核修正 + 精确删除清单（v2，2026-10-23 修正前提；只读确认，未改代码）

**前提修正（v1 的错误）**：v1 把「调用方核实」口径定为只 grep `/api/plugins/<alchemist|plugin-builder>`，漏了 alchemist 自己的产品路径 **`/api/alchemist/...`**。实际接线：`apps/local-host/src/web-request.ts` 的 `nativePluginRoutes` 只有一条 `id:"personal"` 的路由，它同时承担两件事：

1. 别名重写：`handlePersonalNativePluginHttp`（`apps/local-host/src/personal-native-plugin-http.ts`）用 `withRewrittenPluginApi(url)` 把 `/api/plugins/<短名>/…` 重写成 `/api/<短名>/…`；
2. **alchemist 显式直连**：非 `/api/plugins/` 前缀的 URL 由 `withRewrittenPluginApi` 原样返回，随后交给 `handleAlchemistNativePluginHttp`（`alchemist-native-plugin-http.ts:18` 只认 `/api/alchemist` 前缀）。

即 `/api/alchemist/...` 今天只有这一条接线；直接删桥会让 alchemist HTTP 全 404（task-13 已被定向用例拦下：`tests/security-invariants-plugin-pages.test.ts:19` SYS-15/S-47 alchemist 行、`tests/alchemist-host.test.ts`、`tests/security-invariants-alchemist-resumption.test.ts`）。**产品路径 `/api/alchemist/...` 必须保留。**

**调用方核实（修正后口径 = 产品 URL 与别名 URL 都 grep）**：

- 产品直连：`plugins/native/alchemist/src/client.ts:25`、`plugins/native/alchemist/src/registration.ts:15-17` 的请求都走 `/api/alchemist/...`；`tests/alchemist-host.test.ts`、`tests/security-invariants-alchemist-resumption.test.ts`、`tests/alchemist-workbench.e2e.test.ts`、`tests/alchemist-resumption.e2e.test.ts`、`tests/web-route-table.test.ts`、`tests/security-invariants-plugin-pages.test.ts` 都钉它。
- 别名 URL：`/api/plugins/<alchemist|plugin-builder>` 在 `apps/workbench`、`apps/desktop`、`apps/local-host`、`plugins/`、`tests/` 无构造（v1 已核）；`/api/plugins/personal` 无引用。
- `withRewrittenPluginApi` / `rewriteNativePluginApiPath` 另被 `functions-http.ts:1,22` 用于 `/api/plugins/functions` ↔ `/api/functions`，且测试钉住 → `native-plugin-api.ts` **必须保留**。

**精确删除清单（v2，供 task-13 执行）**：

1. 删文件 `apps/local-host/src/personal-native-plugin-http.ts`（2 个 import + 薄壳）。
2. `apps/local-host/src/web-request.ts`：
   - 删 `:34` `handlePersonalNativePluginHttp` import；
   - 把 `nativePluginRoutes` 唯一条目从 `id:"personal"`（调 `handlePersonalNativePluginHttp`、经 `withRewrittenPluginApi`）改成 `id:"alchemist"`，直接 `await handleAlchemistNativePluginHttp(request, response, url, ports)`（**不再重写 URL**；前缀由 alchemist handler 自己判 `/api/alchemist`）；
   - 端口构造与权限逻辑保持：`pluginRouteControl`（`:7`）、`ActionError`（`:8`）、`ALCHEMIST_ACTION_PERMISSIONS`（`:14`）、`{ actions: { invoke } }` 都不动（服务于 alchemist 路由层权限）；
   - `:298` 的 `...nativePluginRoutes` 保留（路由条数净不变，只换 id/目标）。
3. `tests/builtin-plugin-assembly-gate.test.ts:55-58`：`NATIVE_PLUGIN_HTTP_FILES` 删 `"personal"`（剩余 alchemist/artifact/feed/inbox，5→4，名单只减，合法）。
4. `tests/personal-plugins-review-fixes.test.ts`：删 `:46` import；`:69-71` 的 `ports` 参数与 `:77` 的 `handlePersonalNativePluginHttp(...)` 链式调用改为只走 `handleFunctionsHttp`；`:184-189` 的 `rewriteNativePluginApiPath` 断言保留（helper 仍被 functions-http 使用）。
5. 不需要改 `apps/local-host/src/index.ts`（未导出该文件；grep 确认）。

**验证命令/预期（v2）**：

- 定向用例（5 个文件）：`node scripts/run-tests.mjs tests/builtin-plugin-assembly-gate.test.ts tests/personal-plugins-review-fixes.test.ts tests/security-invariants-plugin-pages.test.ts tests/alchemist-host.test.ts tests/security-invariants-alchemist-resumption.test.ts`
- alchemist e2e（2 个文件，需要 Chrome）：`node scripts/run-tests.mjs tests/alchemist-workbench.e2e.test.ts tests/alchemist-resumption.e2e.test.ts`
- 数字：`node scripts/check-health-gates.mjs --base origin/main`（assembly 冻结名单 5→4、hostPluginFiles 只减；必要时同 PR `--update --base origin/main`）。
- 预期：冻结名单 −1、宿主 `*-native-plugin-http.ts` 5→4、别名重写路径 −1；**alchemist 直连路由与产品 URL 不变**（`/api/alchemist/...` 仍 200）；`/api/plugins/alchemist/...` 不再被重写（产品无调用方）。

**教训（防复犯）**：核实「旧路由/旧桥是否有调用方」必须同时 grep 产品 URL（如 `/api/alchemist`）与别名 URL（`/api/plugins/...`），并读 handler 的实际前缀匹配逻辑；不能只 grep 别名或只看路由 id。

**风险**：仓库外若硬编码 `/api/plugins/<alchemist>` 会 404（本仓无调用方）→ **UNVERIFIED（外部调用方）**，PR 说明写明。

**PG-058 E14 联动**：task-13 合入后 `PG-058` 的「九份 `*-native-plugin-http.ts`」→ **4 份：alchemist/artifact/feed/inbox**（personal 文件删掉）；E14 的预留句继续有效。

**HANDOFF-TO-CODEX**：AC-AUDIT-05（context-onboarding-service 直接 import pages/artifacts/todo）保持由统筹转 ac-platform 线处理，本轮不派修。

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

---

## 9. 第 5 轮（主题 d：表 owner 违规）

基准：origin/main `89c9a7194`（主题 d 期间无新提交；复核前再次 fetch 确认）。只读。

### 9.1 结论：PASS（无 blocker；本轮无需写 privileges / 无需派修）

1. **门禁本身**：`scripts/gates/table-owners.mjs` 是零基线门禁 —— owner = 源文件最近的含 package.json 祖先目录；`CREATE [VIRTUAL] TABLE` 决定表 owner；任何别的包的 SQL（`SELECT … FROM`、`JOIN`、`INSERT INTO`、`REPLACE INTO`、`UPDATE`、`DELETE FROM`、`ALTER TABLE`、`DROP TABLE`）碰到即失败；`tooling/gates/table-owners.json` 的 `shared`/`same_name` 双向校验（用了没登记、登记了没用、同名未登记都失败）；不读 tests/fixtures/build 输出。`node scripts/check-health-gates.mjs --report` 在 `89c9a7194` 退出 0（含该门禁）→ 现有代码与登记表一致。
2. **登记表复核**（`tooling/gates/table-owners.json`）：
   - `shared` 26 条：`events`、`idempotency_records`（owner `packages/storage`；users `modules/goals`、`modules/governance-collaboration`；理由=依赖方向，Artifacts 已改成注入函数并离开此表）；24 张 Goals 项目库表（owner `plugins/native/goals`；users `modules/goals`；其中 trusted_decisions、`goal_tree_proposal_*` 的 users 含 `modules/governance-collaboration`），理由=Goals 已在 Manifest `databases.project` 声明并由插件建表（S8/PG-020），SQL 暂留 modules/*，S9 把 Goals 存储搬进插件后删条目。
   - `same_name` 2 条：`workspaces`（`modules/projects` + `plugins/native/alchemist`）、`jobs`（`plugins/native/alchemist` + `plugins/native/images`），理由=不同库里的同名不同表、互不读、spec §9.5 item 9 保留名字。
   - 抽查与代码一致：`modules/goals/src/repository.ts:238-290` 读写 events/idempotency_records；`modules/governance-collaboration/src/repository.ts:38,86`、`proposal-operation-store.ts:56,67` 同；Goals 24 张表在 `plugins/native/goals/src/project-database-*.ts` 建、modules/goals 仍用。
3. **盲区实查**（门禁自述看不到的三类）：
   - 非字面量表名（`FROM ${...}`）6 处，全部 owner 一致：assistant purge（`apps/local-host/src/assistant/assistant-project-purge.ts:15,48`，WORK_TABLES 全是 `assistant_*`，由同包 `assistant-store.ts:28-68` 建）；Artifacts repository（`modules/artifacts/src/repository.ts:33-45,116`，默认 `ARTIFACT_TABLES`/`PROCESS_ITEM_TABLES`；全仓 `new ArtifactsRepository(` 只在 `modules/artifacts/src/index.ts:53,71` 构造，无外部注入表名）；memory ledger（`packages/storage/src/adapters/memory-ledger.ts:24-55,91-94`，循环的表同文件建）；plugin wiring（`packages/plugin-runtime/src/wiring-repository.ts:231`，循环 `plugin_port_bindings`/`plugin_port_artifact_bindings`，同包表）；`project-database-statements.ts:77` 的 `EXPLAIN SELECT * FROM ${name}('[]')`（校验插件声明表，不写业务表）；alchemist `workspace-export.ts:108`（清自己的库）。
   - 小写 SQL/DDL 绕过（门禁只匹配大写）：全仓无小写 `create table` 语句（只有 `plugin-database.ts:54` 注释与 `packages/plugin-sdk/src/highlight.ts:56` 关键字表）；对 shared 表的小写 FROM/INTO/UPDATE 亦无命中。
   - 非 TS 文件 SQL：`git ls-files '*.sql'` 排除 tests 后为空；`apps/desktop` 的 Rust/Swift 无 SQL。tests/fixtures 里的 SQL 不在门禁范围（设计如此）。
   - `apps/local-host/src/catalog-schema.ts:8,11,19` 的 desktop panel 表是通过注入回调 `CatalogDesktopSchema` 在 catalog 初始化时执行，SQL 文本在 owner 包 `apps/desktop/src/adapters/sqlite-panels.ts` 内 → 符合「建表 SQL 在 owner 包」，不是宿主跨包写表。
4. **平台动态建插件表（X-5/PG-020）与门禁的关系（补偿控制已存在，不算缺陷）**：`packages/plugin-runtime/src/project-database.ts:170-225` 的 `openPluginProjectDatabase` 在一个写事务里：`store_name` 全项目库唯一、已有账本时 publisher_signature/version/声明形状三者必须一致、新建时「项目库里已有同名对象」直接 `object_taken` 拒绝、建完再比对声明形状；`project-database-statements.ts` 的 PLIB-06 用 `EXPLAIN` 逐步校验插件语句只能读写自己的表 + 项目 root 行。→ 动态 DDL 门禁看不到，但运行时约束更强，不会出现「两个插件同名表静默共享」。
5. **无需 edit**：privileges.md / SSOT / spec 没有与表 owner 相关的过时描述需要本轮改（PG-020/021 的进度行已在 §7 的 E 清单外，且无新增；`table-owners.json` 理由文字与代码一致）。

### 9.2 观察（非缺陷，记录备查）

- `apps/local-host/src/catalog-schema.ts` 通过 import 各 owner 导出的 `create*Schema` 在同一 catalog 连接上建表（modules/projects、modules/goals 的 `personal_planning_method_packs`、module-private-work-context、apps/local-host 的 model providers），desktop panel 表用注入回调 —— 这是「跨包用 owner 导出的函数建表」的合法形态；但 catalog schema 的组成清单是宿主手写的，新增 owner 表要改宿主（W4 类名单问题，不属本轮主题）。
- `table-owners.mjs` 只按包级 owner 判定，不区分同包内不同 Module/服务的表；更细的 owner（表达「这张表归哪个模块」）当前规则不覆盖。
- 流程提醒：S9（Goals 存储搬进插件）落地后，需按登记理由删掉 `shared` 的 24 条 Goals 条目——由统筹在 S9 片里做，不是本轮 edit。

### 9.3 下一轮

主题 e（lead 队列）：**页面资源 / 冻结名单收口** —— `web-assets.ts` 路由唯一性第 1 轮已 PASS，本轮重点：`NATIVE_PLUGIN_HTTP_FILES` 5→4（task-13 合入后）、页面资源预算（`tooling/gates/page-assets.json`、`APPROVED_CEILINGS` 现状与 2026-10-18 规则）、独立整页门禁与例外清单、`scripts/gates/assembly.mjs` 各计数（hostPluginFiles/registerProviderSites/hybridPlugins/pluginOutsideMentions）现状复核。

## 10. 第 6 轮（主题 e：页面资源 / 整页例外 / 冻结名单收口）

- 基准：origin/main `89c9a7194`（第 5 轮以来无新提交）。只读门禁 `node scripts/check-health-gates.mjs --report` 退出 0（全部结构数字对照已提交基线无增长）。
- 结论：**PASS，无 blocker**。1 条 non-blocker 门禁卫生发现（AC-AUDIT-07）。

### 10.1 AC-AUDIT-07 | page-assets 门禁里有两处「用完的」一次性放行条目，其中一条是重复键死代码

| 项 | 内容 |
| --- | --- |
| 违反需求 | spec §5a「页面资源预算」+ AGENTS.md「功能确需的增长经评审一次性放行；一次涨超过 10 KB 或新增资源先问用户」+ `scripts/gates/page-assets.mjs:5` 自述「admitted once through APPROVED_CEILINGS … after review」 |
| 证据 | `scripts/gates/page-assets.mjs:240-262` 的 `APPROVED_CEILINGS` 共 4 个键，其中 `"/assets/molis-work-plugin-frame.js"` 出现两次：`:250` `[191104, 191192]`、`:258` `[191192, 191455]`。对象字面量后键覆盖前键 → **`:250` 是死条目**，`:258` 生效。`scripts/gates/page-assets.mjs:270-271` 的 `APPROVED_NEW_ASSETS` 仍有 `"/assets/molis-work-plugin-frame.js": 187120`（该资源已有预算，条目不再生效）。当前 `tooling/gates/page-assets.json` 27 条资产，plugin-frame.js=191455、workbench.js=1191104、coding.js=376282、issues.js=27806，正是放行后的数值。脚本 `:5`/`:240` 注释要求「下一次改这个门禁时删掉用完的条目」，实际未删；`tooling/gates/page-assets.json` 的 note 仍写「raising a number or adding an asset here is refused」，没提 2026-10-18 用户决定 #17 的「确需增长可一次性放行、>10 KB 或新增资源先问用户」，与 AGENTS.md 不一致 |
| 影响 | 不削弱判定（后键覆盖前键、批准只匹配 merge-base 精确字节），但属「门禁自身清洁/只许变严」的债；死键与陈旧放行会让后续维护者误读哪条有效，note 与决定不一致会误导 PR 说明 |
| 严重度 | non-blocker |
| 证据强度 | code-read + gate-script |
| 建议 owner | ac-shell（门禁维护）或统筹；不要单独开片，下一次改 page-assets 门禁时一起清理 |
| 修复建议 | 删 `scripts/gates/page-assets.mjs:250` 那条死键（连同注释），删 `APPROVED_NEW_ASSETS` 的 plugin-frame 行，把 `tooling/gates/page-assets.json` 的 note 改成与 AGENTS.md 一致；`--check --base origin/main` 应仍绿 |
| 已有 PR/任务 | 无（UNVERIFIED 是否有人已在改该门禁） |

### 10.2 页面资源（PASS 部分）

- 唯一路由：`apps/local-host/src/web-assets.ts` 的 `serveWorkbenchAsset` 是 `/assets/` 唯一 responder；其它宿主文件只有 `apps/local-host/src/web-project-platform-routes.ts:263` 的 `!url.pathname.startsWith("/assets/")` 放行判断（不是路由）。`apps/local-host/src/web-server.ts:118,201` 把请求交给 `web-assets.ts`；`web-composition.ts:44` 创建。工作台客户端代码里的 `/assets/` 字符串是引用 URL，不是路由。
- `web-assets.ts` 只有 11 个 `"/assets/` 字面量，但预算文件有 27 条资产：插件客户端由正则 `/assets/molis-work-plugins/([a-z0-9-]+)\.js` 动态映射到 `pluginWorkbenchClientAsset`（每个插件包一条），其余是 workbench.css/js、frame、capabilities、knowledge、characters（host 页，CHR-1）、arrival.css、settings.css、pages-editor.js、字体；预算文件把动态发现的每条都记上。→ 与 spec §5a 一致；spec 已自述「别的宿主文件新增 /assets/ 路由看不到」的限制保留。
- 审批机制实现：`page-assets.mjs` 的 `baseErrors`（新增资源无预算即失败）、`approvedCeiling`（merge-base 字节精确等于 `[0]` 时给 `[1]`，一次性）、`missErrors`（发了没预算/预算没发都失败）、`growthErrors`（`:233` 涨了报错并提示走 APPROVED_CEILINGS）→ CI 路径与 AGENTS.md 一致。

### 10.3 整页例外（PASS）

- `specs/shell-page-exceptions/spec.md` 存在（1983 字节；状态「现行规范（2026-10-21，从 `specs/archive/artifact-positioning/spec.md` §4 原样拆出，规则未改）」；`AGENTS.md:35` 的例外清单指向它。
- 表 8 行：进入页 `/`（项目工作台）、onboarding、无项目时的设置页；桌面菜单栏胶囊 `/desktop/capsule`；开发规格板 `/__ui/catalog`、`/__ui/catalog/bar`；宿主排版的侧栏文档 `/projects/<id>/side/<插件>/<视图>`；导出、打印与下载（文件/图片/PDF，不新开页面）；沙箱框里的文档预览（框内不带品牌/返回链接/自带导航）；协作服务 `/continuity`、`/im`；外部链接（侧栏浏览器或新标签页）。
- `tests/shell-page-gate.test.ts` 的 `EXCEPTIONS` 数组 7 条正则与表一一对应：`/^\/$/`、onboarding、`/settings/`、capsule、catalog、`/side/`、`/(continuity|im)/` + `frame=workbench`；变更规则要求改表必须同改 EXCEPTIONS，否则门禁失败。→ PASS。

### 10.4 冻结名单与结构数字（PASS）

- `tests/builtin-plugin-assembly-gate.test.ts`：RUNTIME_ASSEMBLED 13 条；BUILD_TIME_ASSEMBLED 7 条（alchemist、artifacts、feed、goals、inbox、plugin-builder、sessions）；NATIVE_PLUGIN_HTTP_FILES 5 条（alchemist、artifact、feed、inbox、personal）；磁盘 `apps/local-host/src/*-native-plugin-http.ts` 5 份、`plugins/native/*/src/registration.ts` 25 份、目录 25 条 → 与名单双向一致。
- 结构数字（`--report`，均未超已提交基线）：typed capabilities 126（17 文件）、registerProvider 调用 17（12 文件，project-host.ts 4 条）、hybrid Runtime 插件 1（coding）、非插件包点名该插件的文件 309（25 个内置插件：goals 47、feed 35、artifacts 20、plugin-builder 18、work 18、inbox 17、coding 12、pages 12、shelf 12、alchemist 11、schedule 11，其余 4–8）、hostPluginFiles 8、root entries 0。→ 与 privileges.md PG-068 与 EXTENSION-POINTS W5-02（目标 7→0）一致，仍靠 W5-02/W6-01 收口。
- 在途影响：#1130 Sessions 下线合入后，BUILD_TIME_ASSEMBLED 的 sessions 与 work 包、work-*.ts 宿主文件要同 PR 删除并更新名单（装配名单只许减，门禁会拦）。

### 10.5 下一轮

- 主题队列 a–e 已完成；等待 lead 新指令。默认做「全表复核 + task-13 复核」：`git ls-remote --heads origin | grep personal-http` 返回空（且当时 GitHub 连通性异常，需重试确认），PR 出现后按审计文件 §6.2 v2 复核：删 `personal-native-plugin-http.ts` + 删 `/api/plugins/<id>` 别名重写、保留 alchemist 显式直连路由、冻结名单 5→4、assembly 路由条数净不变；跑五个测试文件（assembly-gate、personal-plugins-review-fixes、security-invariants-plugin-pages、alchemist-host、security-invariants-alchemist-resumption）+ 两个 alchemist e2e。

## 11. 第 7 轮（主题 f：SECURITY-INVARIANTS.md 与代码/测试桥核对）

- **基准**：origin/main `89c9a7194`（本轮内无新提交；task-13 分支 `anticorr/w6-01-personal-http-removal` 仍不存在）。
- **方法**：全量解析 58 条 `S-01..S-58` 行 → 195 个测试引用；对照 `scripts/gates/security-invariants.mjs` 门禁语义、`test:security`/`test:contracts`/ci.yml 覆盖 tokens、测试文件编号标记；逐项抽查 §4 开放项。只读。
- **结论**：机械一致性 **PASS**（无「表里有行、测试没有」，无失效测试引用）；4 条 non-blocker 文档/门禁问题（AC-AUDIT-08..11），§4 有 3 处需复核/更新、其余抽查仍成立。

### 11.1 机械核验结果（行 → 现状）

- 58 行 ID 连续、无重复；每行至少点名 1 个测试。
- 195 个点名的测试文件全部存在；所有「标题片段」都能在文件里找到（与 health gate 绿一致）。
- CI 列全部有覆盖；其中 2 条只由 ci.yml（非 `test:security`/`test:contracts`）覆盖：S-19 `tests/secret-scan.test.ts`（ci.yml:111 Verify 的文档/门禁步骤）、S-48 `tests/health-gates-dual-instance.test.ts`（ci.yml health-gate-rules 作业）。
- 本机列 4 处实际在 CI 跑：S-31 `tests/home-plugin-platform.test.ts`（`test:security` 显式清单）、S-39/S-46/S-56 的同一文件同时写在两列（`tests/security-invariants-plugin-materials/project-database/interaction.test.ts`）。
- `tests/security-invariants-*.test.ts` 共 84 个（含 3 个 `.e2e.test.ts`：plugin-pages、plugin-terminals、plugin-drafts）；门禁文件名正则 `[a-z0-9-]+\.test\.ts` 不匹配 `.e2e.`，只需 81 个被点名；实际未被点名的只有 `tests/security-invariants-plugin-drafts.e2e.test.ts`（SYS-15-D1：opaque page drafts 重载后仍在、拒非法写、按插件隔离）。
- 4 行点名的测试没有 S 编号标记：S-16、S-19、S-22（测试头是 PA-22）、S-23（测试头是 PA-23）。
- 代码位置列：仅 S-38 的 4 条路径在本仓不存在（Prologue 仓库路径，详见 AC-AUDIT-09）；其余均可解析。
- CI 作业事实：`security-invariants` 作业 `continue-on-error: true`、不在 Verify `needs` 里（与文档「not required yet」一致）；**没有装 Chrome 的步骤**，e2e 安全用例经 `tests/fixtures/goal-browser.ts:25-26` 的 `locateTestChrome()` 为空时 `t.skip`；`linux-probe` 头注释明确「browser (needs Chrome; not run)」。

### 11.2 行 → 现状 → 建议（需要动的行）

| 行 | 现状 | 建议 | 归属 |
| --- | --- | --- | --- |
| S-16 | 测试存在、4 片段命中；文件头无 S-16 标记 | 测试头补 `// S-16`（或表内注明） | 安全线 |
| S-19 | 测试存在、片段命中；无 S-19 标记；只由 ci.yml:111 跑 | 补 S-19 标记；前言 CI 集合句补「含 ci.yml 其它步骤」 | 安全线 |
| S-22 | `tests/agent-review-standing.test.ts` 头是 `PA-22` | 表内注明 PA-22 映射或补 S-22 注释 | 安全线 |
| S-23 | `tests/prologue-adoption-guard.test.ts` 注释是 `PA-23` + §4.6.10 | 同上 | 安全线 |
| S-31 | 本机列 `home-plugin-platform.test.ts` 实际在 `test:security` 里跑 | 移到 CI 列或删除本机列条目 | 安全线 |
| S-39/S-46/S-56 | 同一测试文件同时写在 CI 列与本机列 | 注明「该文件含 macOS 专属用例，本机跑」或拆分；不要两列重复 | 安全线 |
| S-38 | 代码位置 4 条路径不在本仓：`packages/sdk/src/host/plugin/node-command-env.ts`、`crates/prologue-host-tauri/src/processes.rs`、`packages/sdk/test/host-command-path.test.ts`、`crates/prologue-host-tauri/tests/command_path.rs` | 标注「Prologue 仓库（上游 PR #44）；Molis 经 `horizontal/agent-host/src/adapters/prologue-node.ts` 的 Node Host 运行」；保留 Molis 测试引用 | 安全线/统筹 |
| S-47 | CI 列已点名 directory/pages.e2e/terminals.e2e/page-files；本机列只有文字「页面隔离是 SYS-15 的另一验收项…」无测试；`security-invariants-plugin-drafts.e2e.test.ts`（SYS-15-D1）未被表点名 | 在 S-47 下补 plugin-drafts e2e 引用（本机列）；门禁文件名正则扩到 `.e2e.test.ts` | 安全线（Codex） |
| S-48 | 测试只由 ci.yml health-gate-rules 作业覆盖 | 前言 CI 集合句补 ci.yml；或把测试加进 `test:security` | 安全线 |
| S-10（§4 第 6 条） | 公网地址「仍五份」与实际不符：现见 4 处独立实现——`packages/plugin-sandbox/src/https-proxy.ts` 的 `isPublicAddress`（共享）、`apps/local-host/src/public-https.ts`（共享 + 198.18/15 例外）、`apps/local-host/src/anysearch-transport.ts`（node:net BlockList）、`plugins/official-integrations/rss/src/custom-rss.ts` | 重新计数并改写；确认是否只剩这几处 | 安全线 |
| 门禁本身 | `security-invariants.mjs` 文件名正则不含 `.e2e.`；不要求测试标题带 S 编号 | 扩为 `(?:\.e2e)?\.test\.ts` 并要求登记（可选：文件/标题出现 `S-NN`） | 安全线（门禁改需评审） |

### 11.3 发现

**AC-AUDIT-08** | 违反需求：SECURITY-INVARIANTS §1 前言「每条不变量写…断言拒绝的测试是哪几个」+ 门禁「每个 `security-invariants-*` 文件被某行点名」 | 证据：`tests/security-invariants-plugin-drafts.e2e.test.ts` 断言 SYS-15-D1（opaque page drafts 重载后仍在、拒非法写、按插件隔离），但表里无任何行点名它；`scripts/gates/security-invariants.mjs` 文件名正则 `[a-z0-9-]+\.test\.ts` 不匹配 `.e2e.`，所以门禁也不要求 | 影响：SYS-15 草稿隔离的安全验收没有「表↔测试」映射；新增 e2e 安全测试可漏登 | 严重度 non-blocker | 证据强度 code-read+gate-script | 建议 owner 安全线/Codex | 验证：S-47 加引用后 health:check 绿；扩正则后不点名即红 | 无在途 PR（#1119 不相关）

**AC-AUDIT-09** | 违反需求：表「守住它的代码在哪」一列应可核验 | 证据：S-38 的 4 条路径不在本仓库（Prologue 仓库路径，行内只提 Prologue PR #44）；Molis 侧 `tests/security-invariants-command-path.test.ts` 与 `horizontal/agent-host/src/adapters/prologue-node.ts` 存在 | 影响：读者按「代码位置」找不到文件，边界依据被削弱 | non-blocker | code-read | 安全线/统筹 | 验证：表内路径可 `ls` 或显式标为外部仓库 | 无

**AC-AUDIT-10** | 违反需求：文档对 CI 覆盖的叙述与 ci.yml 实际一致 | 证据：(a) 2 个 CI 列测试只由 ci.yml 其它步骤/作业跑，与前言「CI 集合 = test:security + test:contracts 几条」不符；(b) 前言「新写的 7 个 security-invariants-* 文件…还没在 Linux 上跑过」已过时——security-invariants 作业在 Linux 跑全部 `test:security`（浏览器用例无 Chrome 时 skip）；(c) 「linux-probe 会把它们跑进它的报告」不成立——`scripts/ci-linux-probe.mjs` 头注释明确 browser 文件不跑；(d) 本机列语义冲突（S-31 的 CI 事实、S-39/46/56 两列重复） | 影响：读者会误判哪些安全测试真在 CI 断言、哪些只在 macOS | non-blocker | code-read+gate-script | 安全线/Codex 文档 | 验证：改后 health:check 绿 + diff 评审 | 无

**AC-AUDIT-11** | 违反需求：测试名/注释写验收编号（§1 前言与门禁意图）| 证据：S-16/S-19/S-22/S-23 点名的测试没有 S 编号（S-22 测试头 PA-22、S-23 是 PA-23）；门禁只查「标题片段」，不查编号 | 影响：按编号 grep 审计会漏这 4 条，编号→测试链路不完整 | non-blocker | code-read | 安全线 | 验证：补注释后 grep `S-16` 能命中 | 无

### 11.4 §4 开放项 spot-check（18 项）

| # | 项 | 本轮只读复核结论 |
| --- | --- | --- |
| 1 | 桌面 IPC 可及范围无实测（S-14） | 未核（需真机/实测） |
| 2 | 「是不是本机」两处实现未合并（桌面 Rust、OAuth Worker） | 未核 |
| 3 | `/locale`、`/health` 等 GET 路由无只读断言 | **仍成立**（`web-server.ts:163,188`、`web-catalog.ts:228`、`web-project-platform-routes.ts:164` 路由在，未见过滤） |
| 4 | 控制令牌文件已存在但权限过宽不收紧 | **仍成立**（`web-control-token.ts` 读已有文件直接返回；仅新建文件 `mode: 0o600`，不 chmod 存量） |
| 5 | 提示注入中和随 vendored 包验证 | 依据仍在（`tests/prologue-memory-boundary.test.ts` 存在，30 KiB 预算） |
| 6 | 公网地址实现仍五份 | **需复核**：现见 4 处（见 11.2 S-10 行），文档计数可能过时 |
| 7 | Seatbelt 沙箱用例只在 macOS | 未核 |
| 8 | Computer Use 真机拒绝无记录 | 未核 |
| 9 | S-27 外部等待只证明存在（file-present） | 文档自述，未核代码 |
| 10 | S-44 本机页面只挡本进程知道的监听口 | 文档自述，未核代码 |
| 11 | S-45 卸载不留数据时 plugin-originals 登记不删 | **仍成立**：仅 `apps/local-host/src/project-deleted-owners.ts:109` 在项目删除时 `forgetProjectOriginalFiles`；未见卸载路径清理 |
| 12 | S-57 插件连接槽绑定卸载后仍留 | **仍成立**：`connector_bindings` 表在 `horizontal/connector-host/src/connection-store.ts:92`；scope 键 `plugin-installation:${install_id}` 在 `apps/local-host/src/connector-plugin-requests.ts:27`；未见卸载清理动作 |
| 13 | S-45 原始文件头没有网页之外的证明 | 文档自述 |
| 14 | S-46 Goals 被拒时宿主直接读其表 | **仍成立**：`artifact-actions.ts`、`project-plugin-ports.ts`、`web-goals-read.ts` 存在；`goalDecisionAttention` 由 `plugins/native/goals/src/goals-application.ts:35,49` 提供、经 `apps/local-host/src/goal-project-application.ts:48,118` 暴露给宿主 |
| 15 | S-46 沙箱插件项目库语句在宿主主线程同步跑（PLIB-10/BL-395） | **仍成立**：`packages/plugin-sandbox/src/database.ts:48 sandboxDatabase`；#1119 在途（未合） |
| 16 | S-53 审查页没写会跑仓库配置程序 | 部分：`workspace-git-integration.ts:165`、`workspace-git-worktrees.ts:37` 用 `-c core.hooksPath=/dev/null` 规避 git apply/worktree 的 hooks；审查页文案/其它命令未核 |
| 17 | S-53 列出过滤器与执行之间有两进程窗口 | 未核 |
| 18 | GitHub secret scanning/push protection 公开仓库关着 | 需仓库设置，未核 |

### 11.5 下一轮

主题 **g) SSOT-MATRIX.md 与包清单/owner 漂移**（owner 列、成熟度、事实主人 vs 代码）；之后全表复核 + task-13 复核（PR 出现后按 §6.2 v2）+ 收尾报告。task-13 分支仍未出现，不空等。

## 12. 第 8 轮（主题 g：SSOT-MATRIX.md 与包清单/owner 漂移）

- **基准**：origin/main `89c9a7194`。只读核对 SSOT-MATRIX.md（220 行）与 `scripts/workspace-packages.mjs`、`scripts/package-owners.mjs`/`.github/CODEOWNERS`、spec §5.1、代码现状。
- **结论**：owner 列 **PASS**；4 条 non-blocker 文档漂移（AC-AUDIT-12..15），均不阻塞；另 1 条待 #1130 合入后同步（work/Sessions 行与计数）。

### 12.1 行 → 现状 → 建议

| 位置 | 现状 | 建议 | 类型 |
| --- | --- | --- | --- |
| SSOT:50 | 写「70 个 package（…8 horizontal…）…69 个 partial、1 个 contract-only」；实际 71 个（kinds：app 6 / foundation 10 / module 14 / **horizontal 9** / native 25 / integration 6 / tooling 1），成熟度 partial 70 + contract-only 1 | 改 70→71、8→9、69→70；核对日期 2026-10-10→2026-10-24 | 计数 |
| SSOT:174 | 「全部 70 个 workspace 包由 pnpm workspace:build 拓扑构建」 | 70→71 | 计数 |
| SSOT:67 | 「63 个 public subpath（…2026-10-19 核对）」；实际 exports 68 键含根入口 = **67 个 subpath**（`scripts/workspace-packages.mjs:263` 的 contractSubpaths 口径相同） | 63→67；或改为引用 `node scripts/workspace-packages.mjs --check` 的 contractSubpaths，不写死 | 计数 |
| SSOT:103 | server 行「还没做完的只剩宿主不再直接读它的表（im-server.ts 现在读 mw_projects、mw_members，W2-06）」；实际 `apps/local-host/src/im-server.ts` 只装配 `@molis-ai/molis-work-server`（openServerDatabase/Identity/ContinuityService/createImDomain），`mw_projects`/`mw_members` SQL 只在 `server/src/continuity/service.ts:31-65`、`server/src/identity.ts:41-52`（server 包自己的 owner）；宿主其它目录 grep 为空 | 改为「已完成：宿主只装配 server 包，不直接读 mw_* 表（W2-06）」或删第三处 | 状态过时 |
| SSOT:96,102（及 9 行） | §5 modules/goals 的「事实 owner」列仍列 Goal 等事实，governance-collaboration 同；但 spec §1 2026-10-18 X-5 行（spec.md:1161）与 spec「X-5 与『Goals 按标准迁』的读法」（spec.md:3194-3195）说「Goals 的事实只有 Goals 一个主人；modules/goals 和 governance-collaboration 只有 Goals 在用，它们的表随 Goals 插件声明、由 X-5 项目库服务按声明建」；SSOT 已有 artifacts/plugin-builder/work 的「2026-10-18 改」注（129/152/155/216），缺 goals/governance；且 9 行「Goal 是 Goals 插件拥有的一项事实（§5 modules/goals…）」与 §5 行字面冲突 | 在 96/102 行加「2026-10-18 改：Goals 事实归 plugins/native/goals（Manifest 声明、X-5 建表）；modules/goals 与 governance-collaboration 的 SQL 暂留至 S9（PG-020/PG-094）」；9 行补括号说明表暂由 module SQL 建 | 标注缺失 |

### 12.2 发现

**AC-AUDIT-12** | 违反需求：SSOT 是包清单唯一索引（§9 第 1 条：增删改名 package 先更新本矩阵）| 证据：SSOT:50 与 174 写 70 包/8 horizontal/69 partial；`scripts/workspace-packages.mjs` 的 WORKSPACE_PACKAGES = 71（horizontal 9、partial 70），`node scripts/package-owners.mjs` 输出「owners ok: 71 packages」；spec §5.1 `package-inventory.mjs --check` 输出「holds 71 packages」；同文 25/122 行又写「9 个 horizontal/ 包」→ 自相矛盾 | 影响：包数/分类是 SSOT 核心索引，读者与门禁口径不一致 | non-blocker | code-read+gate-script | 统筹文档（与 package-owners 维护者同改）| 验证：`node scripts/package-owners.mjs` 仍 exit 0；`pnpm boundary:check` 与 package-inventory 不受影响 | 无在途 PR 直接覆盖（#1130 会再改计数，见 §12.3）

**AC-AUDIT-13** | 违反需求：文档引用的合同面计数应与 package.json 一致 | 证据：SSOT:67「63 个 public subpath」vs `packages/contracts/package.json` exports 68 键（含根入口）→ 67；`scripts/workspace-packages.mjs:263` 同口径 | 影响：误判合同改动影响面 | non-blocker | code-read | 统筹文档 | 验证：`node scripts/workspace-packages.mjs --check` 的 contractSubpaths | 无

**AC-AUDIT-14** | 违反需求：SSOT 的状态描述应与代码一致 | 证据：SSOT:103 第三处「还剩宿主直接读 server 表」已过时（见 12.1；SQL 全在 server 包内，im-server.ts 只装配）| 影响：读者以为 W2-06 未完成 | non-blocker | code-read | 统筹文档 | 验证：grep `mw_projects` 在 apps/ 为空 | 无

**AC-AUDIT-15** | 违反需求：文档描述旧行为处要标「2026-10-18 改」（AGENTS.md 硬约束）| 证据：见 12.1 第 5 行；spec 10-18 X-5 行与 X-5 读法已定 Goals 事实单一主人是插件，SSOT 仅 artifacts/plugin-builder/work 有标注 | 影响：事实主人表述两处不一致，迁移/评审会看到两个 owner | non-blocker | code-read | 统筹文档 + ac-platform | 验证：文档 diff 评审；无门禁可自动查 | 无

### 12.3 PASS 与协同备注

- **owner 列 PASS**：`node scripts/package-owners.mjs` 退出 0，输出「owners ok: 71 packages, .github/CODEOWNERS and docs/SSOT-MATRIX.md match the rules」→ 归属列与 CODEOWNERS 由规则生成且一致。
- 分类数字除 horizontal 计数外均对：6 app / 10 foundation / 14 module（13 modules + server）/ 25 native / 6 integration / 1 tooling；4 个 absent 业务 Module（identity-team-access、sync-replication、actions、automation）与 docs/modules/README 一致。
- SSOT:27「到 AnySearch 的出站只有 anysearch-transport.ts 一条」成立：`apps/local-host/src/search-evidence-runtime.ts:8,15,33` 是唯一装配点（注释同义）；其余文件只出现 provider id。
- SSOT:179 CI 描述基本成立：verify 步骤含 launcher typecheck（ci.yml:202）、release assets/storage baselines/shell-page/artifact 门禁（:220）、Alchemist 插件测试（:223-224）；CI 另有 `product-subset` 作业未写入该行（可选补充，不算错）。
- SSOT:103 前两处账目成立：HOME-DATA.md:90-95 已登记 server/server.sqlite；workspace-packages.mjs 里 server 归 module。
- 未核（需 build/运行）：Jelly「Home Runtime 注册全部 53 动作」与 Coding「19 项 coding.* 动作」——只读 grep 不足以数动作快照，标 UNVERIFIED，不阻塞。
- **协同备注（防重复）**：#1130（Sessions 下线 SC-4）合入会删 `plugins/native/work` 包、目录条目与冻结名单 "sessions"；届时 SSOT:50/174 计数（71→70、native 25→24）、§7 work 行（155）、§8 说明需同一片更新——建议统筹在 #1130 合入时一并写，不另派。
- 下一轮：全表复核（§3 基线清单 + 各轮 PASS/未关闭项）+ task-13 复核（分支仍未出现）+ 收尾报告。

## 6.3 复核 task-13 PR #1168（2026-10-24，只读）

- 复核对象：PR **#1168**（draft、base `main`、head `8d748bd3b9d35c0171e4b07b09dae778a374685d`、`MERGEABLE`、5 files、+18/−44）：`apps/local-host/src/personal-native-plugin-http.ts`（整文件删除 −17）、`apps/local-host/src/web-request.ts`（+18/−33）、`tests/builtin-plugin-assembly-gate.test.ts`（−1）、`tests/personal-plugins-review-fixes.test.ts`（7 行）、`tooling/gates/baseline.json`（2 键、只降）。未改 `privileges.md`，diff 只含预期文件。
- **结论：按 §6.2 v2 清单复核通过（PASS），可等 CI 全绿后合入**；1 条 non-blocking 文档建议（下方 A）。

### 逐项核对（对应 §6.2 六步）

1. **个人桥删除**：`personal-native-plugin-http.ts` 整文件删；PR head 上 `git grep handlePersonalNativePluginHttp` 为空、`git grep nativePluginRoutes` 为空。
2. **alchemist 显式直连**：`web-request.ts` 删除 `nativePluginRoutes` 数组（原唯一 `personal` 条目）与 `...nativePluginRoutes`，替换为一条内联 `{ id: "alchemist", handle: … handleAlchemistNativePluginHttp(request, response, url, { projectId, routePrefix, actions: { invoke } }) }`，不经 `withRewrittenPluginApi`；保留 `pluginRouteControl`（import :8，路由内生命周期检查）、`ActionError`（合并进 `@molis-ai/molis-work-contracts/platform/actions` 的 import，继续抛 `actions.forbidden`「缺少请求生命周期」/`actions.unavailable`「宿主已停止」）、`ALCHEMIST_ACTION_PERMISSIONS` 与 `userActions(...).invoke` 端口；`Boolean(serverOptions.homeDirectory)` 条件保留。路由条数净不变（原 1 条 spread → 1 条内联）。
3. **冻结名单**：`NATIVE_PLUGIN_HTTP_FILES` 5→4（只删 "personal"）；`BUILD_TIME_ASSEMBLED`/`RUNTIME_ASSEMBLED`/`HYBRID_RUNTIME_PLUGINS` 未改；assembly gate 其余断言未改。
4. **测试与基线**：`personal-plugins-review-fixes.test.ts` 删 `handlePersonalNativePluginHttp` import、`listenDispatcher` 的 `ports` 参数与调用链；删两条别名断言（pages/form），保留 `rewriteNativePluginApiPath`、functions adapter、shelf 断言；`baseline.json` 仅 `testInternalImports` 444→443、该测试文件 6→5，均只降。
5. **验证证据**：PR 描述列出 `pnpm build` exit 0、5 个定向文件全绿（8/8、16/16、18/18、9/9、8/8）、2 个 alchemist e2e 各 1/1、`pnpm boundary:check` exit 0。本审计在 PR head 工作树（`/tmp/ac-review-1168`）独立跑 `node scripts/check-health-gates.mjs --report` → **exit 0**（含 assembly/结构/文档引用门禁，「Document references: none broken」），门禁面无回归。
6. **产品路径**：`plugins/native/alchemist/src/client.ts:25`（`/api/alchemist/studio/api/v1`）与 `registration.ts:17`（`/api/alchemist/studio`）仍由直连路由服务；仓库内无 `/api/plugins/<alchemist>` 构造；PR 已写明仓库外硬编码旧短名 URL 会 404（UNVERIFIED，符合「不留兼容期」决策）。CI 快照：Action contracts、Secret scan、Rust/Swift、Shell/Python SUCCESS；Gates/Health gate rules/Package boundaries/Security invariants/Product subset 在跑或排队；Linux probe 非必需 skipped。
7. **修正后的 E14 口径**：合入后 PG-058 的宿主 HTTP 文件由「九份」→**4 份**（alchemist、artifact、feed、inbox），`NATIVE_PLUGIN_HTTP_FILES` 同步 5→4；`personal` 相关描述可一并删。

### 建议（non-blocking，交统筹/W6-01 文档片，不阻塞本 PR）

A. 文件删除后两处活文档仍把它写成现存接线：`skills/molis-plugin-dev/host.md:104`「Alchemist 再挂进 `personal-native-plugin-http.ts` 的 handler 列表」、`docs/system/RUNTIME-MIGRATION.md:86`「`personal-native-plugin-http.ts` 只剩 Alchemist」。建议同 PR 顺手改成「Alchemist 由 `web-request.ts` 的显式直连条目服务」；`host.md:93` 的「不要往 `personal-native-plugin-http.ts` 加条目」可保留历史语但建议改指新写法。`specs/action-architecture/migration.md:245,433`、archive 规格与 roadmap 属历史记录，不用改。记为 **AC-AUDIT-16**（non-blocker、文档准确性）。

## 13. 收尾报告（2026-10-24，主题 a–g + task-13 复核完结）

### 13.1 基准与方法

- 基准：origin/main **89c9a7194**（#1126）。审计期间 main 前进两次已刷新（c59172ffe→1756f9842→89c9a7194）；末轮复核时 `git log 89c9a7194..HEAD -- specs/repository-anti-corruption/privileges.md docs/SSOT-MATRIX.md docs/system/SECURITY-INVARIANTS.md` 为空——E1–E22 与 AC-AUDIT-12..16 的 edit 目标在 main 上仍原样，未与统筹的批量写撞车。
- 全部只读：读取在 `/tmp/ac-audit-main`（detached origin/main 的临时 worktree，node_modules 软链），PR 复核用 `/tmp/ac-review-1168`；未改主检出、未 push、未开/评 PR、未跑 build/全量/浏览器。协作留痕经 gh contents API 写在 `coordination/handoff-2026-10-14` 的 `coordination/2026-10-14/ANTICORRUPTION-AUDIT.md`。
- 末轮复核的只读命令（main 89c9a7194）：`node scripts/gates/package-inventory.mjs --check` exit 0（holds 71 packages）；`node scripts/workspace-packages.mjs --check` exit 0（contractSubpaths 67, errors []）；`node scripts/package-owners.mjs` exit 0（owners ok: 71 packages，CODEOWNERS 与 SSOT 一致）；`node scripts/check-health-gates.mjs --report` exit 0（本机 main 与 PR #1168 head 各一次）；`node scripts/gates/dom-events.mjs --report`（8 条已知差距，均已记录在 UI-PLATFORM.md「现状与例外」并由 tests/dom-events-contract.test.ts 核对）。

### 13.2 覆盖矩阵

| 范围 | 检查点 | 结果 |
| --- | --- | --- |
| 基线清单（§1，50 条） | 需求→检查点→证据 | 48 条 PASS/存量已知（PASS/存量），2 条 FAIL（=AC-AUDIT-01..04 文档漂移），1 条 UNVERIFIED（第 48 条：MCP 作用域/S-43 directory/S-57 connections 合同与测试，未单独取证） |
| 主题 a | `@prologue/sdk` 边界、模型调用只经 horizontal/agent-host | PASS（唯一实现 77 处/31 文件，agent-host 外 0；15 个测试为 fixture 观察项） |
| 主题 b | privileges.md 136 条 PG 行 ↔ 代码现状 | 14 条行号/文件失效 + 计数过时，产出 **E1–E22** 精确 edit（待统筹批量写） |
| 主题 c | typed capability/HostCapabilityDefinition 是否新增 | PASS（total 338→126、without-action 100→31、文件 44→17，无新增文件；30 typed 全部冻结前，8 条已动作化；唯一登记点 agent-host-composition.ts:115） |
| 主题 d | 表 owner 零基线、跨包 SQL、动态 SQL 盲区 | PASS（table-owners 双向绿；same_name workspaces/jobs；assistant purge、Artifacts 注入表名、plugin-runtime wiring/memory-ledger 均为同包/声明式；PG-102/103/104 的「只给内置」方向已记录待做） |
| 主题 e | 页面资源路由/整页例外/冻结名单收口 | PASS + AC-AUDIT-07（page-assets 门禁两处用完的放行条目含重复键死代码；不削弱判定） |
| 主题 f | SECURITY-INVARIANTS.md 58 行 ↔ 代码/测试/CI | 机械一致性 PASS（每行有测试、195 文件存在、标题片段全中）；4 条 non-blocker 文档/门禁问题 AC-AUDIT-08..11 |
| 主题 g | SSOT-MATRIX.md 事实主人/包清单/owner/成熟度 | owner 列 PASS；4 条 non-blocker 文档漂移 AC-AUDIT-12..15 |
| task-13 | PR #1168 按 §6.2 v2 复核 | PASS（20/20 清单项，独立 health:check exit 0）；1 条文档建议 AC-AUDIT-16 |

### 13.3 发现清单（AC-AUDIT-01..16）

| ID | 主题 | 严重度 | 状态 / 建议 owner |
| --- | --- | --- | --- |
| 01 | privileges PG-058 九份 HTTP 文件/别名表过时 | non-blocker | 并入 E14；统筹批量写 |
| 02 | privileges PG-065「26 条手写目录/26 registration」过时 | non-blocker | 并入 E15；统筹批量写 |
| 03 | privileges.md:5 引 spec 508–517（实际 1154–1168） | non-blocker | E1；统筹批量写 |
| 04 | privileges §7 第 9 条 SSOT 128/133/152/216 已过时 | non-blocker | E19；统筹批量写 |
| 05 | context-onboarding-service.ts 直接 import pages/artifacts/todo；PG-088 只记 Pages | P2 存量 | **HANDOFF-TO-CODEX**（转 ac-platform；补 PG-088/PG-031 位置） |
| 06 | personal 旧短名路由桥（PG-058/W6-01） | P3 | **已实现**：PR #1168 复核 PASS，待 CI 绿后由 Codex 合入；合入后 §6.2 标 done、E14 九→4 份 |
| 07 | page-assets 一次性放行条目的死键/过期项 | non-blocker | 转 ac-shell/统筹，下次改该门禁时清理（需评审） |
| 08 | security-invariants 门禁正则漏 `.e2e.test.ts`，plugin-drafts e2e 未被表点名 | non-blocker | 安全线/Codex：S-47 加引用 + 扩正则（`(?:\.e2e)?`） |
| 09 | S-38 代码位置列 4 条 Prologue 仓库路径（本仓不存在） | non-blocker | 安全线/统筹：标注「Prologue 仓库（#44）」或改 Molis 侧可核位置 |
| 10 | 文档对 CI 覆盖的叙述与 ci.yml/probe 实际不符（secret-scan、dual-instance 只在别的作业；probe 不跑 browser；本机列语义） | non-blocker | 安全线/Codex 文档：改 §1 前言 |
| 11 | S-16/S-19/S-22/S-23 的测试无 S 编号（PA-22/PA-23） | non-blocker | 安全线：补注释或表内注明 PA 号 |
| 12 | SSOT 包数/分类过时（70→71、8→9 horizontal、69→70 partial；:50/:174） | non-blocker | 统筹批量写（与 package-owners 维护者同改；#1130 合入后 71→70 同片再改一次） |
| 13 | SSOT contracts subpath 63→67 | non-blocker | 统筹批量写 |
| 14 | SSOT server 行「宿主还直接读 mw_* 表」已完成（W2-06） | non-blocker | 统筹批量写：改「已完成」或删句 |
| 15 | SSOT modules/goals(96)/governance(102) 缺「2026-10-18 改」注，与 Goals 事实单一主人冲突 | non-blocker | 统筹批量写 + ac-platform |
| 16 | #1168 删除文件后 host.md:104、RUNTIME-MIGRATION.md:86 仍描述它现存 | non-blocker | W6-01 文档片/统筹（可同 PR 顺手改） |

### 13.4 待统筹批量写的 edit 清单

- **privileges.md：E1–E22**（§7 有每条的原文→新文/行号，基准 89c9a7194；含 E14 合入后九→4 份、E22 PG-035 30 条 typed + BL-365 已关）。
- **SSOT-MATRIX.md：AC-AUDIT-12..15**（:50/:67/:103/:174 与 modules/goals、governance 行加 10-18 注）。
- **skills/molis-plugin-dev/host.md:93,104、docs/system/RUNTIME-MIGRATION.md:86：AC-AUDIT-16**。
- 以上都是纯文档，不涉及权限/行为/门禁判定；建议合成一次「文档批量写」提交，由统筹过评审。

### 13.5 已合待写 / 在途 / 防重复

- 已合但 privileges 状态未写（SLICE-RULES 内，不算缺陷）：PG-051(#1147 1756f9842)、PG-010(#1120 47c780644)、PG-056/070/071(#1137 4e5f91a19、#1145、#1132)——E10/E2/进度列已给新文案。
- 在途不写：PG-017（#1139/#1143/#1144）、PG-081/082（#1130）、PG-060（#1098/#1107/#1112）、S-59/PLIB-10（#1119）。
- #1130 合入后 SSOT 计数与 §7 work 行、assembly 冻结名单 sessions 需同片更新（71→70、native 25→24），已交统筹。
- #1114（复审报告与文档债）可能覆盖部分 E/AC 文档条目，UNVERIFIED；派修前先看其范围。

### 13.6 未核与局限（明确边界）

- 只读、无 build/全量/浏览器：动作数类断言（Jelly「53 动作」、Coding「19 项 coding.* 动作」）UNVERIFIED，未计入缺陷。
- 仓库外调用方不可静态核：`/api/plugins/<alchemist>`、`/api/personal` 等旧 URL 的外部硬编码（#1168 已在说明里写明风险与「不留兼容期」决策）。
- 门禁自述盲区未重复计缺陷：非字面量表名/拼接 SQL/非 TS SQL（table-owners）、同文件 typed 净额与按 id 字符串调用（typed-capabilities）、其它宿主文件新增 `/assets/` 路由（page-assets）、「测试是否真断言拒绝」（security-invariants，靠 security-invariants-doc.test.ts 的 mutation 验证）。
- coordination/handoff-2026-10-14 是协作工作区，不是主仓；审计文件以 gh contents API 维护，行号以 main 89c9a7194 为准。

### 13.7 结论

- **无 blocker。** 存量代码与防腐要求的实质不一致集中在已知在治的迁移片（PG 状态待做/PG-007 stage4/PG-020/PG-021 等）与已记录的门禁盲区；本次新增的全是 non-blocker 文档/门禁卫生问题（AC-AUDIT-01..16，除 05 为 P2 存量 HANDOFF、06 已实现待合）。
- 建议下一步只做一批低风险收口：统筹批量写 E1–E22 + AC-AUDIT-12..16（纯文档），ac-shell 顺手清 AC-AUDIT-07，安全线清 AC-AUDIT-08/10（门禁+文档），其余按原路线；#1168 等 CI 绿后合入并把 §6.2/E14 标 done。
- 后续若 main 前进：刷新基准后复跑 13.1 的 5 条只读命令，再复核受影响的 E/AC 条目（尤其 privileges/SSOT 若被批量写过，E 清单按 PG 编号定位而非行号）。

## §6.4 task-13 / #1168 二次复核（2026-10-24 晚，基准 main 8aa62a65b）

- head `98906bfadd2c0a602aec090b687f4a92db0d8c03`（非 draft，OPEN；此前 8d748bd3b draft、cb3440a02 文档同步）。
- task-16 修改核对（diff 89c9a7194..98906bfad）：
  * `apps/local-host/src/native-plugin-api.ts`：删 `BUILTIN_PLUGIN_CATALOG` import 与动态遍历生成别名的逻辑，别名表只剩 `{ functions: "functions", "io.molis.work.functions": "functions" }`；`rewriteNativePluginApiPath` 与 `withRewrittenPluginApi` 导出保留（`apps/local-host/src/functions-http.ts:22` 仍用）。
  * `tests/personal-plugins-review-fixes.test.ts`：反向断言 form/pages 路径不再改写（`/api/plugins/pages/abc/promote`、`/api/plugins/io.molis.work.form` 原样返回）；functions 的 `/api/plugins/functions`↔`/api/functions`、`/api/plugins/io.molis.work.functions/items`↔`/api/functions/items` 断言保留。
  * 无其它误删：personal 文件删除、web-request 显式 alchemist 直连、冻结名单 5→4、baseline 只降（testInternalImports 444→443、该测试文件 import 6→5）。
  * PR body 已补 affected-tests 与别名收窄说明；CI 对 98906bfad 全部重新排队（快照时 QUEUED，Linux probe SKIPPED）。
- 结论：task-13 v2 清单 + task-16 修正均按预期；等 CI 全绿后由统筹合入。
- 遗留（非阻塞）：`docs/system/RUNTIME-MIGRATION.md:150` 仍描述「文档族客户端…由 native-plugin-api.ts 改写成 /api/<短名>/…」，现在只剩 functions 适配 → 记 AC-AUDIT-16 后续文档项（W6-01 文档片）。

## §14 第 9 轮（2026-10-24 晚）：刷新复核 + #1168 复核 + task-17 派单

### 14.1 基准刷新（main `8aa62a65b`）

main 自 89c9a7194 新增两个提交：#1163（`8aa62a65b` docs(plugin-sdk) 修正插件指令统一运行时登记说明）、#1161（`a934251d3` local-host 写后检查设置路由规格引用）——均文档。

5 条只读命令全绿：

- `node scripts/gates/package-inventory.mjs --check` → 「Package inventory holds 71 packages, all matching the code.」
- `node scripts/workspace-packages.mjs --check` → uniquePackageNames 71（ids unique）、contractSubpaths 67、errors []
- `node scripts/package-owners.mjs` → 「owners ok: 71 packages, .github/CODEOWNERS and docs/SSOT-MATRIX.md match the rules」
- `node scripts/gates/dom-events.mjs --report` → 8 条既有差距（均已在 UI-PLATFORM「现状与例外」登记）
- `node scripts/check-health-gates.mjs --report` → exit 0

diff 影响：`git diff 89c9a7194..8aa62a65b -- specs/repository-anti-corruption/privileges.md docs/SSOT-MATRIX.md docs/system/SECURITY-INVARIANTS.md` 为空 → 第 2/3 轮 E1–E22、第 8 轮 AC-AUDIT-12..15 的现象与行号全部未变，无需重定位；本表改文可在该基准直接应用。

### 14.2 #1168（task-13）复核

见 §6.4：可合（等 CI 绿）。第一次复核（8d748bd3b）PASS per §6.2 v2，§6.3 已记录；二次复核（98906bfad）task-16 修正 PASS，无新增 blocker。

提示统筹：合并入 main 后 PG-058 由 5 份改 4 份（E14 预留），`docs/system/RUNTIME-MIGRATION.md:150` 留作 AC-16 后续。

### 14.3 task-17 派单（owner review-fix-owner，纯文档）

- AC-08：SECURITY-INVARIANTS.md:61（S-47 本机列）补 `tests/security-invariants-plugin-drafts.e2e.test.ts`「SYS-15-D1 …」；门禁正则扩 `.e2e` 待用户批，本轮不动脚本。
- AC-09：:52（S-38 代码位置）标明四个 `packages/sdk/...`、`crates/prologue-host-tauri/...` 路径属 Prologue 仓库（不在本仓）。
- AC-10：§1 第 7/8 行 CI/本机口径改为「三处集合」与「浏览器用例 CI skip、probe 不跑浏览器」；建议同改 S-31 本机列（home-plugin-platform.test.ts 实为 test:security 在跑）。
- AC-11：四个测试注释加 S-16/19/22/23 编号。
- 验收：只改 5 个文件、`node scripts/check-health-gates.mjs --report` exit 0。

### 14.4 覆盖矩阵更新

无新增 FAIL。AC-AUDIT-01..04 仍 FAIL（待派修）；AC-05 HANDOFF-TO-CODEX；AC-06/07 已完成/转统筹；AC-08..16 已交付 edit 或派单（AC-08..11 task-17，AC-12..15 待统筹批量写 SSOT/privileges）。

### 14.5 下一轮

task-17 PR 出现后只读复核；#1168 合入后把 E14 标记完成；主题 h（manifest 声明 vs 实际消费）若继续（建议清单：声明了 actions/views/artifacts/process_items 但无消费者的条目；有消费但未声明的调用；页面不在 manifest 里的残留）。

### 14.2a 追加（2026-10-25 00:30 左右查询）

- #1168 head `98906bfad`：`failed: []`、`pending: 10`（CI 对本 head 仍在跑；等全绿后再记「可合」终态）。
- 同期 open PR 新增（仅记录，未派）：#1172 `anticorr/ac-trust-design`、#1169 `ac-r11-intake`、#1167 `ac-clients-cognia`、#1165 `ac-kernel/pg047-validate-result`；task-17 的 audit 文档分支尚未出现（`git ls-remote` 无匹配）。

## §15 第 10 轮（2026-10-25 凌晨）：主题 h — Manifest 声明 vs 实际消费

### 15.1 方法与机器槽位

- 数据源：`tooling/gates/actions/{actions,host-actions,scenes,host-scenes}.tsv`（由 `node scripts/gates/action-contract-snapshot.mjs --update`；`pnpm actions:update` 生成）。**main tip `8aa62a65b` 的 CI「Action and plugin contracts」作业 success**（该作业跑 `tests/action-contract-snapshot.test.ts`，除比快照外还断言「每个 Manifest 动作都由 Host 以同一 provider 注册」），因此快照可代表当前 main 的声明与运行时登记。
- 机器槽位尝试：`node scripts/machine-slot.mjs run build --label ... -- pnpm build` 排队、拿到槽后失败于 pnpm install 的 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`（审计工作树 node_modules 是指向主检出的符号链接，pnpm 想清空重建但无 TTY）；槽位自动释放，未产生半成品构建、未动源码。改用 CI 证据 + 已入库快照，不再本地 build（避免与其它会话抢槽）。

### 15.2 库存数字

- 声明动作 601 条 / 24 provider（actions.tsv）。按 provider：goals 70、alchemist 59、jelly 53、pages 44、feed 36、shelf 33、coding 28、dataset 27、form 27、cognia 25、todo 25、ppt 24、lingguang 20、schedule 19、sessions 18、artifacts 17、workflows 16（provider `io.molis.work.native.workflows`）、inbox 15、images 14、issues 11、git 10、files 6、diff 2、text-stats 2。
- 宿主注册但无 Manifest 声明的动作 271 条 / 29 provider：platform 27、system.connectors 22、system.functions 21、system.memory 20、characters 19、system.home 13、system.knowledge 12、system.placement 12、13×`sdk.artifacts.plugin-install-<hash>` 各 8（共 104）、feed 3、inbox 3、system.search 6、system.project-workspaces 3、goals.home 2、system.action-usages 2、system.information 1、plugin-platform 1。
- 场景：声明 2 条（feed.capture@1、inbox.next@1，provider=feed/inbox）；宿主注册 1 条（home.dock@1，system.home）。

### 15.3 结论

(a) 「用了但没声明」= host-actions 的 132 条非 system/platform 行，全部落在已知 PG 组，无新的插件私路/未声明动作：characters 19（PG-085/086，Characters 已是 Module，provider 仍是旧插件 id `io.molis.work.characters`；被持久引用钉住，建议不动或待合同决策）；feed/inbox 各 3（`scenes.{enable,disable,targets}:<scene>`，PG-034 Feed/Inbox action_scenes 实现在宿主，待做）；goals.home 2（PG-012 双实例 Home 半，进行中）；13 个 Home 安装各自的 SDK 服务动作 104 条（PG-023/PG-102/104 的过渡面）；plugin-platform model.generate 1（宿主）。

(b) 「声明了但没人用」：静态 id 字符串面（排除快照/tests/specs archive）145 条零文本引用；其中 131 条 audiences 含 mcp（MCP 工具名由能力生成，可被客户端调用，不能判死），14 条只面向 user/页面（coding.executor.run.start/control、coding.executor.session.open/read/update、coding.executor.state、coding.plans.confirm；feed.sources.disconnect；pages.comments.context/reply；shelf.clipboard.material、shelf.items.file、shelf.results.copy、shelf.terminal.open）→ **UNVERIFIED**：静态看不到页面调用（动作对象常量）与持久工作流步骤（用户库里的绑定）。要定死需要：构建后的动作目录 + 页面调用面（浏览器抓包/评审）或真实 Home 的调用日志 + 持久工作流绑定（本机无真实 Home）；建议收尾后专项。→ 本轮无可派修项。

(c) PASS：SSOT:212「Jelly 53 动作」✓（actions.tsv jelly 53 行）；GLOSSARY:286 workflows 的 plugin_id 多 `.native.` 段是已文档化例外；`reminders.add/cancel`、`schedules.add/cancel` 是归档 spec 明确保留的稳定 id（不是漂移）；声明场景与宿主场景一致（2+1）；`provider != registered_provider` 只有 goals 2 条（Home 半 `io.molis.work.goals.home`，PG-012 已记）；schedule 19 条里 4 条前缀 `reminders.`/`schedules.` 为保留 id。

### 15.4 发现 AC-AUDIT-17（non-blocker，文档漂移）

- `docs/SSOT-MATRIX.md:142` coding 行写「19 项 `coding.*` 动作（16 项业务动作，另有对象读取、搜索与成果预览）」；当前 Manifest 声明 **28 条 coding.***（多出的 9 条即 C8-2 执行器与计划面：`coding.executor.session.open/read/update`、`coding.executor.run.start/control`、`coding.executor.state`、`coding.plans.confirm`、`coding.plans.read/save`、`coding.artifacts.list`、`coding.changesets.read` 等）。建议 19→28，括注改为「含执行器会话/计划（C8-2）与对象读取、搜索、成果预览」；owner=统筹批量写（SSOT 行）；验证：`grep -c '^coding\.'` 于 actions.tsv（provider=io.molis.work.coding 行）。

### 15.5 下一轮

- 等 task-17 PR 做一次 diff 只读复核；#1168 绿后把 §14.2/E14 记完成态。
- 主题 h 的 UNVERIFIED 部分需要真实 Home 调用数据或页面抓包，暂不深挖；#1165/#1167/#1169/#1172 等新 PR 是否覆盖 AC-AUDIT-01..04，等 lead 派。
