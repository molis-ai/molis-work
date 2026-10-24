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
