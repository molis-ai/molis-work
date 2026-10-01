# 全部需求合入后的功能审查、合并缺陷修复与 spec 梳理

状态：执行中（2026-10-01 起）。本文是第一步的唯一进度与证据记录。任务要求见 `docs/prompts/post-merge-functional-review.md`（以 `anti-rot` 分支上的版本为准）；第二步见 `docs/prompts/repository-anti-corruption.md`，以本文交付的 main、行为基线与 spec 梳理结果为起点。

## 1. 范围与基线

- **启动条件**：2026-10-01 10:50 UTC 核对，开放 PR 为零；本仓库再没有在运行的会话；除 `anti-rot`（任务要求本身）与 `wip/main-checkout-rescue-2026-10-01`（主检出封存的无主改动，用户亲自处理，不属于需求线）外，没有超前于 main 的分支。
- **起点日期**：2026-09-28（执行日 2026-10-01 往前推三天，与下限相同）。
- **基线提交**：`origin/main` 62cbc14d（#136 合入后）。
- **范围内的 PR**：46 个（#90–#136，其中 #97 关闭未合并，不计入）。同一需求线在起点之前的 PR（#89 等）在需求核对时一并参考。
- **未纳入本轮的线**：无。

## 2. PR 与需求清单

### 2.1 PR 对应的需求线

| 需求线 | spec | PR |
| --- | --- | --- |
| A 动作服务复查、架构复查后续、公共能力归位 | `specs/action-architecture/`、`specs/archive/architecture-followup/`、`specs/archive/platform-capability-consolidation/` | #94、#95、#99 |
| B 系统级搜索 | `specs/archive/system-search/` | #96 |
| C 系统级个人工作助理（含 Todo、个人空间与放置）及后续走查 | `specs/archive/system-assistant/`、`specs/archive/todo-plugin/`、`specs/archive/work-placement/` | #98、#105、#106、#109、#111、#113、#121、#122、#124、#127、#128、#129、#133、#136 |
| D 助理面板与底栏改版 | `specs/archive/assistant-panel-redesign/` | 随 #98、#106、#111 |
| E 插件创作台体验规划与视觉组合 | `specs/archive/plugin-builder/` | #100 |
| F Soft Workbench 全局升级 | `specs/archive/soft-workbench-rollout/`、`specs/archive/soft-workbench-ui/`（相关：`specs/ui-craft-floor/`、`specs/archive/shelf-dropagent-parity/`、`specs/archive/alchemist-plugin/` 的界面部分） | #101 |
| G 标题栏插件通知铃铛 | `specs/archive/plugin-notification-bell/` | #102 |
| H 仓库防腐整理与第一轨 | `specs/archive/repository-systematic-review/`、`docs/prompts/code-health-report-2026-09-30.md` | #91、#92、#93、#103、#135 |
| I Coding 左栏与任务图 | `specs/coding-plugin/` | #104 |
| J 插件端到端复查与动线优化 | `specs/archive/plugin-e2e-review/` | #108、#112、#117、#120、#126、#131 |
| K 页面动线与导航全量修复 | `specs/archive/page-interaction-flow/` | #114、#116 |
| L 平台侧栏 | `specs/archive/side-panel/` | #118、#123、#125 |
| M 情境驱动的动态交互 | `specs/archive/contextual-interaction/` | #119、#134 |
| N 平台记忆系统 | `specs/archive/memory-system/` | #130 |
| — 无 spec 的修复 | — | #90 模型设置单页、#107 Goal Frame 分屏用例、#110 内嵌页原型泄漏、#115 新建 Goal 断言、#132 main 上 4 条浏览器失败、#124/#131 测试修正 |

### 2.2 逐条验收

（进行中，按需求线逐条填写：编号、出处小节、判定、证据。）

## 3. 问题表

（进行中。）

## 4. 合并缺陷与用户可见重复

（进行中。）

## 5. 跨功能场景

（进行中。）

## 6. 全量回归

（基线运行中：干净工作树 `origin/main` 62cbc14d，整体构建后跑 `node scripts/run-tests.mjs` 全部用例。）

## 7. 行为基线

（第一步结束时填写：回归基线、能力快照、跨功能场景清单。）

## 8. spec 梳理

2026-10-01 对根目录 193 份 spec 逐份判定（第一步 prompt §6）。依据是 main 62cbc14d 上的代码与行为：本轮的需求线以合入的 PR 与第 2 节验收为准，其余用代码检索核对正文要的行为在不在、所依赖的对象（`src/web/render.ts`、Coordinator、Claim/Run/Review、左侧插件栏等）是否已退役。只看状态句的判定没有采用。

| 判定 | 份数 | 处理 |
| --- | --- | --- |
| 现行规范 | 7 | 留在原位，补状态句，在 `specs/README.md` 单列 |
| 已实现（含只差用户验收） | 104 | 补归档句，移到 `archive/`；只差验收的列进 BACKLOG「待你验收」 |
| 部分实现 | 8 | 剩余事项抽进 BACKLOG，原 spec 不再有在做的内容，归档 |
| 已被取代 | 70 | 写明取代者，归档 |
| 已作废 | 4 | 写明原因，归档 |
| 判断不了 | 0 | 原先存疑的两份 Casebook 文档核对后分别定为部分实现与现行规范 |

结果：

- 根目录现在只剩 7 份现行规范、本 spec 与 [BACKLOG.md](../BACKLOG.md)。`specs/README.md` 改写为只列这些，并写下新的开工与归档规则（规则以第一步 prompt §6 为准，旧规则同步改掉）。
- BACKLOG 共 62 条：待你验收 17、待你决定 4，其余按区域分组；第 8 组是交给第二步的对象。同一件事在多处出现的已合并（例如真实第三方账号验收合成 BL-060，真机输入法与读屏合成 BL-016）。
- 链接：归档脚本按「移动前解析、移动后重算」改写了 250 个文件里的相对链接与仓库路径，包括代码注释、包 README、`docs/`、`skills/`、测试里的证据目录。断链检查（全部 Markdown 的相对链接）前后对比：移动前有 10 处既有断链，移动后剩 6 处，都是行内代码里的示例写法（`[文档](molis.ai/docs)` 一类），不是链接；两处指向旧位置 `apps/local-host/src/assistant-http.ts` 的既有断链顺手改正。
- 在途会话：开始梳理时没有其他在跑的会话（第 1 节），没有需要先问负责会话的 spec。

<details>
<summary>逐份判定（193 份）</summary>

| spec | 判定 | 依据 | 去向 |
| --- | --- | --- | --- |
| action-architecture | 现行规范 | AGENTS.md 引 §3 基本合同；已合 main（#88/#94/#95） | [原位](../action-architecture/spec.md)；BL-043、BL-081、BL-082 |
| casebook-plugin | 现行规范 | docs/SSOT-MATRIX.md 引为外部 Casebook 插件的宿主前置能力说明 | [原位](../casebook-plugin/spec.md) |
| coding-plugin | 现行规范 | Coding 的单一需求来源 | [原位](../coding-plugin/spec.md)；BL-020、BL-023、BL-050、BL-051 |
| craft-finish | 现行规范 | AGENTS.md 界面一栏引用 | [原位](../craft-finish/spec.md) |
| molis-work-architecture-reorganization | 现行规范 | 架构重组需求书，ARCHITECTURE/SSOT 引用 | [原位](../molis-work-architecture-reorganization/spec.md)；BL-070 |
| plugin-platform-v2 | 现行规范 | 插件平台 v2 需求书，PLUGIN-PLATFORM.md 与 Skill 引用 | [原位](../plugin-platform-v2/spec.md)；BL-058、BL-080 |
| ui-craft-floor | 现行规范 | 规范生效，DESIGN.md 与 craft-finish 引用 | [原位](../ui-craft-floor/spec.md) |
| casebook-integration-v1 | 部分实现 | 授权事实与回执接口已落地（apps/local-host/src/casebook）；规划导出服务与官方 Showcase 接收发布未实现 | [归档](../archive/casebook-integration-v1/)；BL-054 |
| characters-local-agent-import | 部分实现 | 功能可用；五家原生 Agent 真实实操未做（Cursor/OpenCode 无 CLI） | [归档](../archive/characters-local-agent-import/)；BL-052 |
| connector-all-methods | 部分实现 | 工程与受控协议验证完成；真实第三方账号验收未做 | [归档](../archive/connector-all-methods/)；BL-060 |
| connector-experience | 部分实现 | 接入预备完成；多数服务未取得真实授权与审核 | [归档](../archive/connector-experience/)；BL-060 |
| feed-source-workbench | 部分实现 | 功能可用；真实第三方账号的选择→拉取→捕捉组合实操未做 | [归档](../archive/feed-source-workbench/)；BL-060 |
| macos-desktop-release | 部分实现 | Tauri bundle 已启用；Developer ID 签名与公证仍是发布门禁 | [归档](../archive/macos-desktop-release/)；BL-021 |
| molis-work-context-onboarding | 部分实现 | 核心动线功能可用，真实 Gmail→Cognia→Prologue→Pages 已验；自动标签页捕获、实时 IM、多项目自动归类、持续同步未做 | [归档](../archive/molis-work-context-onboarding/)；BL-012、BL-061、BL-062 |
| shelf-drop-wheel-craft | 部分实现 | 几何、进出场、启用态已落地；纸面与字色未对齐 DropAgent | [归档](../archive/shelf-drop-wheel-craft/)；BL-053 |
| alchemist-plugin | 已实现 | 内部完整；Alchemist 测试在基线中通过 | [归档](../archive/alchemist-plugin/)；BL-010 |
| app-icon-charcoal | 已实现 | apps/desktop/src-tauri/icons/icon.svg/png/icns 存在 | [归档](../archive/app-icon-charcoal/) |
| assistant-panel-redesign | 已实现 | 两期与 3.7 已随 #98/#106/#111 合 main | [归档](../archive/assistant-panel-redesign/)；BL-002 |
| characters-manager-repair | 已实现 | 状态句：完成 | [归档](../archive/characters-manager-repair/) |
| chrome-tabs-preview-groups | 已实现 | 手动分组（tab-group、pane.groups）在 tab-workspace.ts；打开方式部分已被 additive-tabs 取代 | [归档](../archive/chrome-tabs-preview-groups/) |
| clean-workspace-verification | 已实现 | package.json workspace:verify 顺序已改 | [归档](../archive/clean-workspace-verification/) |
| coding-composer-shell | 已实现 | coding-composer 输入面在 coding/src/ui.ts、styles.ts | [归档](../archive/coding-composer-shell/) |
| coding-workbench-repair | 已实现 | 功能可用；后由 #104 左栏改版覆盖 | [归档](../archive/coding-workbench-repair/) |
| cognia-plugin | 已实现 | 功能可用 | [归档](../archive/cognia-plugin/)；BL-057 |
| compact-icon-tabs | 已实现 | 固定标签（data-pinned）在 tab-workspace.ts | [归档](../archive/compact-icon-tabs/) |
| connector-connections | 已实现 | connection_id 连接库与 Feed 绑定已落地 | [归档](../archive/connector-connections/) |
| connector-method-directory | 已实现 | 官方方式目录已落地；其余约 40 个服务客户端明确不在本轮 | [归档](../archive/connector-method-directory/) |
| connector-oauth-choice | 已实现 | Notion OAuth、lark-cli、Gmail 方式选择已在 local-host | [归档](../archive/connector-oauth-choice/) |
| contextual-interaction | 已实现 | P1 #119、P2–P4 #134 已合 main；待用户验收与读屏实测 | [归档](../archive/contextual-interaction/)；BL-006、BL-016、BL-038、BL-039、BL-084 |
| coss-primitive-library | 已实现 | mw-* 原语与规格板已落地，后续由 craft-finish/Soft Workbench 继承 | [归档](../archive/coss-primitive-library/) |
| current-project-settings | 已实现 | projectSettingsCapabilities.browsingWorkspace 已落地 | [归档](../archive/current-project-settings/) |
| directory-list-primitive | 已实现 | mw-dir 原语在用 | [归档](../archive/directory-list-primitive/) |
| directory-row-visual-unify | 已实现 | mw-dir-row 统一，后由 Soft Workbench 继承 | [归档](../archive/directory-row-visual-unify/) |
| feed-inbox-pages-loop | 已实现 | 本地实现与真实路径已实操；已安装 App、IME、VoiceOver、长时定时与外部 MCP 未验证 | [归档](../archive/feed-inbox-pages-loop/)；BL-011 |
| fresh-install-end-to-end | 已实现 | 安装类测试从 pack 产物走首次使用 | [归档](../archive/fresh-install-end-to-end/) |
| functions-settings-ux | 已实现 | 功能可用；TypeSafe 真实计费调用未做 | [归档](../archive/functions-settings-ux/) |
| global-ui-interaction-consistency | 已实现 | 主链内部完整；后续 UI 由 Soft Workbench 继承 | [归档](../archive/global-ui-interaction-consistency/) |
| gmail-feed-connector-reauthorization | 已实现 | 项目 Gmail 回调与连接库已落地 | [归档](../archive/gmail-feed-connector-reauthorization/) |
| goal-momentum-internal-complete | 已实现 | goals-momentum-ui.ts 推进态势在用；所读 Claim/Run/Review 已改为事件事实 | [归档](../archive/goal-momentum-internal-complete/) |
| goal-momentum-layout-polish | 已实现 | 推进态势自适应与缩放拖动已在 goals-momentum-ui.ts | [归档](../archive/goal-momentum-layout-polish/) |
| goal-narrow-navigation | 已实现 | 窄屏 data-mobile-view 往返已落地；后续窄屏由 page-interaction-flow 继承 | [归档](../archive/goal-narrow-navigation/) |
| goal-planning-plugin-settings | 已实现 | 状态句：功能可用；规划方法在 Goals 插件设置 | [归档](../archive/goal-planning-plugin-settings/) |
| goal-tree-status-filter | 已实现 | plugins/native/goals/src/tree-client.ts 状态过滤 | [归档](../archive/goal-tree-status-filter/) |
| goalboard-feed-workbench | 已实现 | Relay 接管完成，代码中无 Relay 依赖 | [归档](../archive/goalboard-feed-workbench/) |
| goals-list-workspace-split | 已实现 | 单击进 goal-node-workspace、双击开 Frame 已落地（goals-page-renderer.ts）；后续动线由 page-interaction-flow 继承 | [归档](../archive/goals-list-workspace-split/) |
| goals-parallel-views | 已实现 | 列表/画布/看板三视图已落地（goals-momentum-ui.ts、goal-canvas.ts kanban） | [归档](../archive/goals-parallel-views/) |
| goals-plugin-no-default-open | 已实现 | 功能可用；不默认打开 Goal | [归档](../archive/goals-plugin-no-default-open/) |
| images-plugin | 已实现 | Images 插件已在 plugins/native/images；图生图等明确不在本期 | [归档](../archive/images-plugin/)；BL-046 |
| inbox-feed-plugin-split | 已实现 | Inbox、Feed 已拆成两个插件，切片 6 完成 | [归档](../archive/inbox-feed-plugin-split/) |
| installation-core-cleanup | 已实现 | 自包含安装与旧入口删除（trick.json 已无） | [归档](../archive/installation-core-cleanup/) |
| interaction-texture-upgrade | 已实现 | 交互质感层（interaction-texture.ts）在用，后由 craft-finish/Soft Workbench 继承 | [归档](../archive/interaction-texture-upgrade/) |
| jelly-plugin | 已实现 | Jelly 插件在 plugins/native/jelly | [归档](../archive/jelly-plugin/) |
| linear-palette-icons | 已实现 | 色板与图标进 design-system catalog | [归档](../archive/linear-palette-icons/) |
| linear-type-color | 已实现 | Inter 字体与字重已在 design-system typeface.ts | [归档](../archive/linear-type-color/) |
| list-row-hover-yield | 已实现 | Shelf 行 hover 时才让出 72px，动作渐显（shelf/src/styles.ts） | [归档](../archive/list-row-hover-yield/) |
| local-control-security | 已实现 | x-molis-work-control-token 门禁在 action-gateway 等处 | [归档](../archive/local-control-security/) |
| macos-capsule-localization-and-readme-media | 已实现 | 胶囊代码已在 main（capsule_window.rs、capsule-shell.ts） | [归档](../archive/macos-capsule-localization-and-readme-media/) |
| macos-secondary-display-tray-click | 已实现 | choose_screen_for_point 与 set_ignore_cursor_events 及测试已在；双屏真机待人工确认 | [归档](../archive/macos-secondary-display-tray-click/)；BL-015 |
| memory-system | 已实现 | M1–M5 经 #130 合 main；用户验收待做 | [归档](../archive/memory-system/)；BL-005、BL-022、BL-035、BL-036、BL-037 |
| molis-work-im | 已实现 | 首版群聊与 redesign-v2 讨论分屏已落地（im-server.ts、side-panel.ts 用 im-ui）；手机真机、公网部署与用户验收未做 | [归档](../archive/molis-work-im/)；BL-013、BL-063 |
| native-titlebar-alignment | 已实现 | apps/desktop/src/shell.ts 同步全屏状态 | [归档](../archive/native-titlebar-alignment/) |
| pages-plugin | 已实现 | Pages 插件含 callout、评论等后续 WI（plugins/native/pages/src）；整期内部完整 | [归档](../archive/pages-plugin/) |
| palette-icon-type-rollout | 已实现 | 色板、图标、字体整仓收口已落地 | [归档](../archive/palette-icon-type-rollout/) |
| pane-local-split-tabs | 已实现 | 分栏各栏标签已落地；后续由 page-interaction-flow 继承 | [归档](../archive/pane-local-split-tabs/) |
| personal-plugins-review-fixes | 已实现 | 内部完整；「复查落地后再看」三项属结构问题 | [归档](../archive/personal-plugins-review-fixes/)；BL-085 |
| planning-detail-tags-lede | 已实现 | planning-method-ui.ts 中标签与说明同组 | [归档](../archive/planning-detail-tags-lede/) |
| planning-engine | 已实现 | planning analyze_change/graph_check 经 MCP 提供 | [归档](../archive/planning-engine/) |
| planning-method-markdown-catalog | 已实现 | modules/goals/methods/ 按单文件 Markdown 目录 | [归档](../archive/planning-method-markdown-catalog/)；BL-056 |
| plugin-builder | 已实现 | 创作台 v3 经 #88 合 main 并已验收，#100 页面组合与视觉复查合 main | [归档](../archive/plugin-builder/)；BL-055 |
| plugin-compatible-start-context | 已实现 | release-quarantine 恢复入口已落地 | [归档](../archive/plugin-compatible-start-context/) |
| plugin-e2e-review | 已实现 | #108–#131 已合 main，§5.1 剩余四项在 #126 已合 | [归档](../archive/plugin-e2e-review/)；BL-039 |
| plugin-list-lifecycle | 已实现 | 图片、定时任务、Cognia、实验的编辑/删除已落地 | [归档](../archive/plugin-list-lifecycle/) |
| plugin-market-remove | 已实现 | removeProjectPlugin 与 web-project-settings 移除路由 | [归档](../archive/plugin-market-remove/) |
| plugin-notification-bell | 已实现 | 铃铛 #102 合 main；与助理底栏的「需要你看看」并存，见本轮问题表 | [归档](../archive/plugin-notification-bell/)；BL-009 |
| plugin-upgrades | 已实现 | 市场提醒、手动升级、兼容预检已落地 | [归档](../archive/plugin-upgrades/)；BL-072 |
| plugin-visual-identity | 已实现 | MW_PLUGINS 补齐 | [归档](../archive/plugin-visual-identity/) |
| post-cutover-cleanup | 已实现 | 空包已删 | [归档](../archive/post-cutover-cleanup/) |
| post-cutover-loading-fixes | 已实现 | Home 优先级统一与加载修复 | [归档](../archive/post-cutover-loading-fixes/) |
| post-reorganization-acceptance | 已实现 | acceptance.md 记录 | [归档](../archive/post-reorganization-acceptance/) |
| product-entrypoint-consolidation | 已实现 | apps/desktop/launchers/{cli,mcp,web} 已归位 | [归档](../archive/product-entrypoint-consolidation/) |
| product-experience-polish | 已实现 | 覆盖路径内部完整；后续由 Soft Workbench 与插件端到端复查继承 | [归档](../archive/product-experience-polish/) |
| project-guidance-and-trusted-completion | 已实现 | 项目说明（project_guidance_* MCP）与 needs_revalidation 已落地；复合父级传播随事件工作流改写 | [归档](../archive/project-guidance-and-trusted-completion/) |
| project-rules-settings-align | 已实现 | 工作规则页（policy-ui.ts）节奏已对齐；工作规则已移入 Goals 顶栏 | [归档](../archive/project-rules-settings-align/) |
| project-settings-deletion-and-onboarding-navigation | 已实现 | 项目删除入口与引导导航修复已落地；原生安装包点击未验 | [归档](../archive/project-settings-deletion-and-onboarding-navigation/) |
| project-settings-redesign | 已实现 | 独立项目设置四页已落地，后由 Soft Workbench 统一 | [归档](../archive/project-settings-redesign/) |
| repair-evidence-corrections-migration | 已实现 | evidence_corrections 迁移归 modules/evidence-verification | [归档](../archive/repair-evidence-corrections-migration/) |
| repository-review-followup | 已实现 | F1–F7 已交接或关闭，由 action-architecture 与 repository-systematic-review 承接 | [归档](../archive/repository-review-followup/) |
| repository-systematic-review | 已实现 | 本轮整理完成（#91、#92）；D-03 删旧包只能用户执行 | [归档](../archive/repository-systematic-review/)；BL-087 |
| runtime-integration-service | 已实现 | RuntimeIntegrationService 在用 | [归档](../archive/runtime-integration-service/) |
| runtime-package-boundaries | 已实现 | 安装包边界修复已落地 | [归档](../archive/runtime-package-boundaries/) |
| runtime-validation-timeout | 已实现 | 接入验证超时已放宽 | [归档](../archive/runtime-validation-timeout/) |
| session-connection-management | 已实现 | MCP context_bind/unbind/resolve 与项目设置关联已落地 | [归档](../archive/session-connection-management/) |
| session-project-binding-router | 已实现 | 同上，候选不自动绑定 | [归档](../archive/session-project-binding-router/) |
| session-work-records-redesign | 已实现 | Sessions 收进 work 插件（plugins/native/work/src/ui），工作目录后又移入项目设置 | [归档](../archive/session-work-records-redesign/) |
| session-workspace-redesign | 已实现 | openWorkSessionRegistry 全局 Session Registry 在用 | [归档](../archive/session-workspace-redesign/) |
| settings-codex-surface | 已实现 | 设置偏好页节奏已落地，卡片底色与密度后由 Soft Workbench 统一 | [归档](../archive/settings-codex-surface/) |
| settings-narrow-layout | 已实现 | 窄态设置导航已落地 | [归档](../archive/settings-narrow-layout/) |
| setup-control-ui | 已实现 | 全局设置控制面已落地 | [归档](../archive/setup-control-ui/) |
| shelf-drop-wheel-arming | 已实现 | drop_wheel 测试与 cargo build 通过；真人划选与 Finder 拖未在本机验证 | [归档](../archive/shelf-drop-wheel-arming/)；BL-014 |
| shelf-dropagent-parity | 已实现 | 本轮实现与定向验收完成；全宿主复跑与真实 Finder 系统选择器重验未完成 | [归档](../archive/shelf-dropagent-parity/)；BL-014 |
| shelf-plugin | 已实现 | DropAgent 功能面已全部落到 Molis；面板内 Esc/⌘V/⌘C/⌫ 留后续切片 | [归档](../archive/shelf-plugin/)；BL-053 |
| soft-workbench-rollout | 已实现 | #101 合 main；待用户验收；原生 macOS 包与胶囊、OAuth 授权成功态未验 | [归档](../archive/soft-workbench-rollout/)；BL-008 |
| soft-workbench-ui | 已实现 | 原型验收完成，正式升级见 soft-workbench-rollout | [归档](../archive/soft-workbench-ui/) |
| standalone-repository | 已实现 | V3 旧运行时已删除（只有 legacy-boundary.md，无 spec.md）；CLI 仍有 importV3Capability 一次性导入 | [归档](../archive/standalone-repository/)；BL-083 |
| system-assistant | 已实现 | 全部合 main（#98、#105–#129、#133）；待用户验收 | [归档](../archive/system-assistant/)；BL-001、BL-016、BL-030、BL-031、BL-032、BL-033、BL-034 |
| system-search | 已实现 | #96 合 main；插件创作台草稿未接入搜索（真实缺口） | [归档](../archive/system-search/)；BL-007、BL-040、BL-041、BL-042、BL-043 |
| technical-project-ssot-decomposition | 已实现 | 软件开发方法含 SSOT 与模块拆解阶段，方法目录已迁到 modules/goals/methods | [归档](../archive/technical-project-ssot-decomposition/) |
| todo-plugin | 已实现 | 随 #98 合 main；待用户验收 | [归档](../archive/todo-plugin/)；BL-003、BL-016、BL-030 |
| ui-authoring-closure | 已实现 | setActiveGoal 经 Goals 插件能力（goal-project-application.ts、CLI） | [归档](../archive/ui-authoring-closure/) |
| visual-layer-hygiene | 已实现 | token 唯一 owner 收口 | [归档](../archive/visual-layer-hygiene/) |
| web-goal-document-lazy-loading | 已实现 | Goal 文档按需加载（goals-document-routes.ts） | [归档](../archive/web-goal-document-lazy-loading/) |
| web-project-switcher | 已实现 | 项目目录与项目 URL 已落地 | [归档](../archive/web-project-switcher/) |
| web-view-performance | 已实现 | 单 Goal 文档与事件分页已落地 | [归档](../archive/web-view-performance/) |
| work-placement | 已实现 | 随 #98 合 main；待用户验收 | [归档](../archive/work-placement/)；BL-004、BL-044、BL-045、BL-046、BL-071 |
| workbench-pane-feed-redesign | 已实现 | 标签、分屏、Feed 目录与全局设置重设计已落地，后由 Soft Workbench 继承 | [归档](../archive/workbench-pane-feed-redesign/) |
| workbench-performance | 已实现 | 局部读路径优化已落地 | [归档](../archive/workbench-performance/) |
| workbench-tab-workspace | 已实现 | 分栏与标签在用；后续动线由 page-interaction-flow（#114）继承 | [归档](../archive/workbench-tab-workspace/) |
| workbench-visual-calibration | 已实现 | 色彩与对比校准，后由 Soft Workbench 继承 | [归档](../archive/workbench-visual-calibration/) |
| workflow | 已实现 | 工作流程插件 plugins/native/workflows | [归档](../archive/workflow/) |
| capsule-desktop-reliability | 已被取代 | 菜单栏胶囊仍在（capsule-shell.ts），所投影的 Claim/Run/Review 已由 goal-event-workflow-cleanup 退役 | [归档](../archive/capsule-desktop-reliability/) |
| capsule-menu-bar-popover | 已被取代 | 同上；锚定与弹出生命周期已实现，Focused Goal 选择规则依赖已退役的 Claim/Run | [归档](../archive/capsule-menu-bar-popover/) |
| capsule-safe-controls | 已被取代 | 暂停/恢复依赖 RunRecord，Run 已退役 | [归档](../archive/capsule-safe-controls/) |
| characters-identity-card | 已被取代 | 左侧插件轨已由 craft-finish 统一底栏取代；identity-card 无代码命中 | [归档](../archive/characters-identity-card/) |
| codebase-quality-consolidation | 已被取代 | 对象 src/v1/coordinator.ts、src/web/render.ts 已在 2026-09-08 切换中删除 | [归档](../archive/codebase-quality-consolidation/) |
| collapsed-directory-and-light-tabs | 已被取代 | 目录左栏与 Light 标签已被 craft-finish/Soft Workbench 改版取代 | [归档](../archive/collapsed-directory-and-light-tabs/) |
| compound-state-reconciliation | 已被取代 | 复合父级结算链已随 goal-event-workflow-cleanup 退役（无 compound_satisfied 代码） | [归档](../archive/compound-state-reconciliation/) |
| confirmation-review-examples | 已被取代 | 结果确认卡（Review）已随事件工作流退役 | [归档](../archive/confirmation-review-examples/) |
| continuous-goal-action-flow | 已被取代 | 21 项 GoalWorkState 已由 goal-event-workflow-cleanup 退役 | [归档](../archive/continuous-goal-action-flow/) |
| conversational-skill-revision | 已被取代 | draft_dialogue_turn 等旧 MCP 流程已退役 | [归档](../archive/conversational-skill-revision/) |
| coss-workbench-redesign | 已被取代 | 被 craft-finish 与 Soft Workbench 改版取代 | [归档](../archive/coss-workbench-redesign/) |
| decision-prerequisite-order | 已被取代 | src/web/render.ts 与 Rewire 决定中心已退役 | [归档](../archive/decision-prerequisite-order/) |
| decision-result-visibility | 已被取代 | 决定中心（Risk/Rewire）已随切换与事件工作流退役 | [归档](../archive/decision-result-visibility/) |
| dependency-decision-layout | 已被取代 | renderRewireDecision 已不存在 | [归档](../archive/dependency-decision-layout/) |
| dependency-proposal-dark-theme | 已被取代 | src/web/render.ts 已删除 | [归档](../archive/dependency-proposal-dark-theme/) |
| desktop-work-tab-visibility | 已被取代 | src/web/visual-foundation.ts 已删除，标签栏已重做 | [归档](../archive/desktop-work-tab-visibility/) |
| diagnostics-card-breathing-room | 已被取代 | 旧 Desktop Diagnostics 页面随 src/web 删除 | [归档](../archive/diagnostics-card-breathing-room/) |
| directory-plugin-switcher | 已被取代 | 两层目录与插件条已由 craft-finish 统一底栏取代 | [归档](../archive/directory-plugin-switcher/) |
| feed-directory-goal-list | 已被取代 | 被 feed-directory-drop-all 与 feed-source-workbench 取代 | [归档](../archive/feed-directory-goal-list/) |
| frame-task-navigation | 已被取代 | Goal Frame 与标签导航由 page-interaction-flow（#114）重做 | [归档](../archive/frame-task-navigation/) |
| functions-independent-authoring | 已被取代 | 开头写明归属已改到 action-architecture，三栏布局由 functions-settings-ux 取代 | [归档](../archive/functions-independent-authoring/) |
| goal-factors-workbench | 已被取代 | Goal 详情五区分块随 Goal 时间线与事件工作流重做（goal-event-workflow-cleanup） | [归档](../archive/goal-factors-workbench/) |
| goal-momentum-hifi-slice | 已被取代 | 原型切片，已由 goal-momentum-internal-complete 接入真实数据 | [归档](../archive/goal-momentum-hifi-slice/) |
| goal-tree-expanded-row-compaction | 已被取代 | src/web/render.ts 已删除，Goal 树由 Goals 插件重做 | [归档](../archive/goal-tree-expanded-row-compaction/) |
| goalboard-compact-ui-mode | 已被取代 | 密度与项目层由 linear-workbench-density、craft-finish 取代 | [归档](../archive/goalboard-compact-ui-mode/) |
| goalboard-coverage-clarifier | 已被取代 | clarifier/Claim/Run 与 src/v1/coordinator.ts 已退役 | [归档](../archive/goalboard-coverage-clarifier/) |
| goalboard-demo-screenshots | 已被取代 | README 截图随 readme-current-product 与改版更新 | [归档](../archive/goalboard-demo-screenshots/) |
| goalboard-fidelity-desktop-workstation | 已被取代 | 三栏桌面工作台已由个人工作台、craft-finish、Soft Workbench 取代 | [归档](../archive/goalboard-fidelity-desktop-workstation/) |
| goalboard-fidelity-goal-graph | 已被取代 | Graph 已由推进态势与 Goals 画布取代 | [归档](../archive/goalboard-fidelity-goal-graph/) |
| goalboard-fidelity-harness-companion | 已被取代 | 伴随窄窗依赖 Claim/Run，已退役 | [归档](../archive/goalboard-fidelity-harness-companion/) |
| goalboard-goal-focus | 已被取代 | Goal Focus 由 Goal 时间线与事件阅读器取代 | [归档](../archive/goalboard-goal-focus/) |
| goalboard-goal-graph | 已被取代 | 同 goalboard-fidelity-goal-graph | [归档](../archive/goalboard-goal-graph/) |
| goalboard-goal-navigator | 已被取代 | Goal Navigator 已由 Goals 插件列表/画布/看板取代 | [归档](../archive/goalboard-goal-navigator/) |
| goalboard-hifi-correction | 已被取代 | 高保真纠正对象（三栏、决定中心）已退役 | [归档](../archive/goalboard-hifi-correction/) |
| goalboard-mvp | 已被取代 | MVP Coordinator/Storage 合同，Coordinator 已在 2026-09-08 切换中删除；无 spec.md | [归档](../archive/goalboard-mvp/) |
| goalboard-onboarding | 已被取代 | 首次使用已由 molis-work-context-onboarding 与 onboarding-renderer 重做 | [归档](../archive/goalboard-onboarding/) |
| goalboard-personal-workbench-shell | 已被取代 | 单目录工作台已由 craft-finish 统一底栏取代 | [归档](../archive/goalboard-personal-workbench-shell/) |
| goalboard-quiet-paper-refresh | 已被取代 | 视觉方向已由 Linear×Coss、craft-finish、Soft Workbench 取代 | [归档](../archive/goalboard-quiet-paper-refresh/) |
| goalboard-readme-story | 已被取代 | README 由 readme-current-product 重写 | [归档](../archive/goalboard-readme-story/) |
| goalboard-runtime-responsive | 已被取代 | 三栏响应式布局已退役 | [归档](../archive/goalboard-runtime-responsive/) |
| goalboard-visual-foundation | 已被取代 | 视觉基础已由 design-system 与 Soft Workbench 取代 | [归档](../archive/goalboard-visual-foundation/) |
| home-field-start | 已被取代 | 高保真切片未进生产；项目首页已由 Soft Workbench 首页（project-home.ts）重做 | [归档](../archive/home-field-start/) |
| home-open-page | 已被取代 | 同上 | [归档](../archive/home-open-page/) |
| human-decision-inbox | 已被取代 | Decision Center、human_verdict Review 链已随事件工作流退役 | [归档](../archive/human-decision-inbox/) |
| human-friendly-goalboard-ux | 已被取代 | 对象 src/web/render.ts 与 Contract/Claim/Run 文案已退役 | [归档](../archive/human-friendly-goalboard-ux/) |
| info-workbench-directory-system | 已被取代 | 目录行系统由 mw-dir 原语与后续改版取代 | [归档](../archive/info-workbench-directory-system/) |
| infoflow-visual-hierarchy | 已被取代 | 信息流详情视觉由 Soft Workbench 改版取代 | [归档](../archive/infoflow-visual-hierarchy/) |
| leaf-goal-decomposition-quality | 已被取代 | 叶子判定门禁未按本文实现（无 unresolved_decisions）；goal-event-workflow-cleanup 定为树结构按需使用、不做规划审批 | [归档](../archive/leaf-goal-decomposition-quality/) |
| lifecycle-state-reconciliation | 已被取代 | Claim/Run/澄清会话已退役 | [归档](../archive/lifecycle-state-reconciliation/) |
| light-flat-location-states | 已被取代 | src/web 时代 Light 选中态，已由后续改版取代 | [归档](../archive/light-flat-location-states/) |
| light-goal-tab-legibility | 已被取代 | 同上 | [归档](../archive/light-goal-tab-legibility/) |
| light-work-tab-polish | 已被取代 | 同上 | [归档](../archive/light-work-tab-polish/) |
| linear-workbench-density | 已被取代 | 默认密度已落地（linear-density.ts）；低高度左栏修复的对象左栏已由 craft-finish 统一底栏取代 | [归档](../archive/linear-workbench-density/) |
| molis-work-onboarding-prototype | 已被取代 | 隔离原型，生产实现见 molis-work-context-onboarding | [归档](../archive/molis-work-onboarding-prototype/) |
| onboarding-native-titlebar | 已被取代 | 对象 src/web/render.ts 的 Onboarding 已删除，首次使用已重做 | [归档](../archive/onboarding-native-titlebar/) |
| plugin-list-row-align | 已被取代 | 列表行由 Soft Workbench 统一 | [归档](../archive/plugin-list-row-align/) |
| plugin-rail-selection-align | 已被取代 | 插件栏已由 craft-finish 统一底栏取代（immersive-shell.ts 仍渲染 plugin-rail-items，交第二步核对是否死代码） | [归档](../archive/plugin-rail-selection-align/)；BL-086 |
| policy-toggle-white-screen | 已被取代 | Runtime/Review Policy 已随事件工作流退役 | [归档](../archive/policy-toggle-white-screen/) |
| product-interaction-redesign | 已被取代 | 全产品交互重设计由 craft-finish、Soft Workbench、page-interaction-flow 逐轮取代 | [归档](../archive/product-interaction-redesign/) |
| project-session-workspace-rebuild | 已被取代 | 可交互原型，Sessions 与工作目录已由 work 插件和 current-project-settings 落地 | [归档](../archive/project-session-workspace-rebuild/) |
| proposal-input-usability | 已被取代 | Legacy Contract 提案入口已随事件工作流退役 | [归档](../archive/proposal-input-usability/) |
| readme-current-product | 已被取代 | README.en.md 已在 #103 删除，README 现为单份 | [归档](../archive/readme-current-product/) |
| risk-goal-lifecycle | 已被取代 | Risk 经 clarifier/executor Run 的生命周期已随事件工作流退役 | [归档](../archive/risk-goal-lifecycle/) |
| risk-resolution-theme-colors | 已被取代 | 待决定页已退役 | [归档](../archive/risk-resolution-theme-colors/) |
| root-directory-arrow-consistency | 已被取代 | 项目根目录列表已由 craft-finish 统一底栏取代 | [归档](../archive/root-directory-arrow-consistency/) |
| runtime-header-status-alignment | 已被取代 | Runtime 头部已随终端改入 work 插件重做 | [归档](../archive/runtime-header-status-alignment/) |
| ui-evidence-history | 已被取代 | src/web 时代人工 Evidence 表单与 Claim/Run/Review 记录已退役 | [归档](../archive/ui-evidence-history/) |
| web-directory-refresh-stability | 已被取代 | 4 秒 Board 轮询与 /decisions 路由已随改版退役 | [归档](../archive/web-directory-refresh-stability/) |
| workbench-frame-container | 已被取代 | 被 workbench-tab-workspace 与 page-interaction-flow 取代 | [归档](../archive/workbench-frame-container/) |
| workbench-navigation-controls | 已被取代 | Focus/Runtime 工作模式按钮已随三栏退役 | [归档](../archive/workbench-navigation-controls/) |
| bp-delivery-parallel | 已作废 | 2026-09-26 派发协调文档，子任务各有 spec（connector/cognia/onboarding 等） | [归档](../archive/bp-delivery-parallel/) |
| pause-cicd | 已作废 | .github/workflows/ci.yml 已恢复在 PR 与 main 推送上运行 | [归档](../archive/pause-cicd/) |
| release-hardening-v0.1.14 | 已作废 | 历史版本发布收口，当前版本 0.2.0 | [归档](../archive/release-hardening-v0.1.14/) |
| web-project-migration | 已作废 | migrateLegacyDatabase 已删除，按“无旧用户”不再需要旧 DB 迁移 | [归档](../archive/web-project-migration/) |

</details>

## 9. 决策记录与待决事项

（进行中。需要用户拍板的事项一律用弹窗询问，问题与回答记在这里。）

## 10. 未验证的范围

（进行中。）

## 11. 逐需求验收清单

（第一步结束时填写。）

## 12. 交给第二步的清单

（进行中。）
