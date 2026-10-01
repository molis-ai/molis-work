# Molis Work 代码与架构防腐体检报告

日期：2026-09-30
审查对象：`origin/main @ fa27207a`（PR #101 合入后），在独立只读工作树中静态审查；未改任何代码。
参照：`docs/prompts/repository-systematic-review.md` 的 15 项要求、上一轮整理 `specs/repository-systematic-review/spec.md`（F-01～F-35、D-01～D-05）。
方法：全仓清点 + 关键调用链阅读 + 现有回归记录与 CI 记录核对。**没有重跑全量回归**（约 22 分钟非浏览器 + 浏览器），引用的测试数字来自仓库里最近一次记录（2026-09-29）。

---

## 0. 一页结论

**三个问题的直接回答：**

| 问题 | 结论 |
| --- | --- |
| 代码现在有没有问题 | 有，但不是"烂"。没有发现新的严重功能缺陷；问题集中在**结构性重复**（三套插件装配路径并存）、**宿主膨胀**（`apps/local-host/src` 349 个平铺文件、3.7 万行、32 个 API 前缀）、**文档与产品漂移**（README 仍描述已退役的 Claim/Run/Evidence/Review）、**已知失败未收口**（main 上 4 个既有失败用例）。 |
| 能否持续成为插件平台 | **机制层面可以，装配层面还不能。** Plugin Runtime v2（事件、端口、生命周期、隔离、升级）设计和测试都到位；动作服务把"注册一次、页面/工作流/Agent/MCP 共用"做通了。但 25 个原生插件里只有 7 个走 v2 Runtime，其余 18 个仍靠宿主手写 `*-actions.ts` + `*-native-plugin-http.ts` + 工作台 `builtin-plugins.ts` 名单装配；**没有第三方插件的安装路径**（CLI 只有 create/validate/pack/sign/dev）；端口连线仍按插件名写死（D-04 短期方案）。以 PR #98 里新写的 Todo 为例：一个插件新增 3 个宿主文件，还改了宿主与工作台 24 个既有文件。 |
| 实现是否清晰、是否具备向 C 端开放的标准和简洁 | **内部清晰度中等偏上，C 端就绪度低。** 边界门禁、动作合同、控制令牌、密钥管理这些"骨架"是认真做的。但 C 端必需的东西还缺：自动更新、崩溃/诊断上报（observability 包 absent）、跨设备备份（只有手工整目录拷贝）、macOS 之外的平台（沙箱依赖 `sandbox-exec`）、公证签名（ad-hoc）、三个私有 vendored 包（Prologue SDK、intelligence-client、search-evidence-layer；Prologue 目录 2 份 tgz + 24 个补丁）。此外 105 个 Error 类、11 份 `escapeHtml`、约 2 万行以字符串拼接交付的浏览器脚本、四代皮肤叠加下发的 CSS，都会在 C 端放大成质量波动。 |

**在途支线（第 7 节）：** 7 个会话在同时推进 7 条线加 2 个开着的 PR；底栏、助理面板、侧栏、页面动线、动态交互五条都在改同一个外壳，其中 4 条叠在尚未合入的 2.1 万行 PR #98 上；两条新线（记忆、动态交互）在动平台公共合同或宿主结构；`immersive-shell.ts`、`navigation-presentation.ts`、`i18n/en.ts`、`builtin-plugins.ts` 各有 3～4 条线在改。#98 新增的 Todo 插件走的是旧装配路径，vendor 里的 Prologue 包又回到 4 份。主检出、1 个 Codex 工作树和 6 个已合并分支的工作树都还留着旧改动。

**总体判断：** 过去 30 天 577 次提交、73 次合并，功能面扩张远快于收口。上一轮整理（09-27～28）修掉的 35 项里，结构性问题（F-11 端口名单、F-14 规格归档、F-18 宿主平铺、F-35 客户端脚本）都选择了"短期维持 + 写进规范"，这些正是现在需要开工的防腐点。建议下一阶段**不再并行开新插件**，先做第 5 节的 6 件事。

---

## 1. 规模基线

| 指标 | 数值 |
| --- | --- |
| workspace 包 | 70（6 app、11 foundation、15 module、6 horizontal、25 native plugin、6 integration、1 tooling） |
| 源码 | 264,466 行 TypeScript（不含 dist/测试） |
| 测试 | 650 个测试文件（91 个 e2e），244,236 行，几乎与源码 1:1 |
| 最大的包 | `apps/local-host` 37,245 行 / 349 文件；`apps/workbench` 33,679 / 150；`packages/design-system` 16,128；`plugins/native/goals` 15,931；`packages/contracts` 14,288 / 59 个 subpath |
| 最大的文件 | `pages/editor-browser.ts` 3,843；`workbench/i18n/en.ts` 3,604；`pages/commands.ts` 2,240；`design-system/styles/craft-finish.ts` 1,737；`shelf/client.ts` 1,675；`coding/client.ts` 1,588；`coding/routes.ts` 1,572；`contracts/services/agent-host.ts` 1,467 |
| 近 30 天 | 577 提交、73 合并；改动最多的目录：`plugins/native` 3,638 文件次、`apps/local-host` 1,518、`apps/workbench` 1,319 |
| 规格 | `specs/` 根目录 184 份 spec + `archive/` 156 份；根目录 84 份有状态句、100 份没有 |
| 工作树 | 20 个（含 8 个 scratchpad 基线）；主检出落后 `origin/main` 30 个提交且有 149 项未提交（81 改、47 删、21 未跟踪） |

---

## 2. 上一轮整理（F-01～F-35）的延续状态

| 上轮结论 | 现状 | 判断 |
| --- | --- | --- |
| F-08/D-05 CI 只跑边界 + 契约子集 | CI 仍是 `workspace:verify` + `test:contracts`（9 组文件、约 120 项、整个任务 5 分钟）；全量只在本机跑 | 维持；main 上最近 6 次 CI 全绿，但全量失败不会被 CI 发现 |
| F-11/D-04 端口连线按插件名写死 | `workspace-plugin-bindings.ts` 名单仍在，只服务 Coding 家族 | 未动，见 3.2 |
| F-13 SSOT 过时 | 已重写为 70 包；但 `apps/server` 仍写 `absent`，而 `server/`（1,046 行）与 `apps/server/src/main.ts`（180 行，IM/跨设备接续）真实存在 | 又漂了一处 |
| F-14 规格归档 | 根目录 184 份 spec，84 份有状态句、100 份没有 | 未做 |
| F-18 宿主平铺目录 | 由 250 个文件涨到 349 个；`LOCAL-HOST.md` 写了前缀分区规则 | 规则有了，规模继续涨 |
| F-35 客户端脚本字符串化 | 门禁只覆盖工作台主程序；插件 18 个 `client.ts`（10,023 行）全部仍是模板字符串或 `String.raw` | 部分 |
| 基线失败 | 09-29 同步 main 后全量 3,387 项、8 失败：3 项旧基线、4 项 main 既有（Shelf 设置页 Grok 文案、Shelf DropAgent 对照、Feed→Shelf 动作流程、SDK 打包样例离线安装）、1 项抖动 | main 带着 4 个已知失败在跑 |

---

## 3. 逐项评估

### 3.1 代码现在有没有问题

按严重度排列。S1 = 会直接影响用户或数据；S2 = 结构性风险、持续放大；S3 = 清晰度/维护性；S4 = 卫生。

| 编号 | 级别 | 问题 | 证据 |
| --- | --- | --- | --- |
| R-01 | S2 | **三套插件装配路径并存。** (a) v2 Runtime 监督器：characters、shelf、coding、files、diff、git、text-stats 共 7 个，经 `project-plugins.ts` → `createPluginPlatform`；(b) 构建期组合：其余 18 个原生插件靠 `project-host.ts` 里约 25 行 `registerProvider(...)` + 每插件一个 `*-native-plugin-http.ts`（自定义前缀 `/api/pages`、`/api/jelly`…）+ 工作台 `builtin-plugins.ts` 26 条静态目录（导入 25 个插件包）；(c) 生成/安装插件：`installed-plugin-host.ts` + `plugin-builder-surface.ts`。`docs/platform/PLUGIN-PLATFORM.md` §7 自己也承认"其他仍标为 native 的插件继续由构建期组合装配"。 | `apps/local-host/src/project-plugins.ts:171-207`；`project-host.ts:196-258`；`apps/workbench/src/builtin-plugins.ts`（356 行、26 条） |
| R-02 | S2 | **MCP 也是双轨。** 动作目录派生的工具是主路径，但 `mcp-native-plugins.ts` 保留 `legacyMcp` 适配（Cognia、Jelly 等），`mcp-catalog.ts` 还并着 `LEGACY_FUNCTIONS_MCP`、`LEGACY_GOALS_MCP` 别名。注释写着"Historical spellings only"，但没有退役条件和日期。 | `apps/local-host/src/mcp-native-plugins.ts:8`；`mcp-catalog.ts:1-2,95-105` |
| R-03 | S2 | **宿主承载了插件专属逻辑。** `apps/local-host/src` 按前缀统计：feed 719 行、git 708、jelly 622、schedule 571、home 551、coding 548、search 529、personal-assistant 488。10 个"每插件一个"的 AI 适配文件（`alchemist-prologue.ts`、`cognia-prologue.ts`、`jelly-model.ts`、`shelf-ai.ts`、`experiments-grok.ts`…）共 680 行。规则说"业务规则留在插件包里，Host 只写组合适配"，但每加一个 AI 插件宿主就多一个适配文件。 | `docs/platform/LOCAL-HOST.md` 分区表；文件清单 |
| R-04 | S2 | **旧一代个人助理仍在仓库里，但产品到不了。** 宿主 `personal-assistant-{host,http,service,store,sources,prologue,types}.ts` 7 个文件 488 行和工作台 `personal-assistant-ui.ts`，生产代码没有任何导入者；现行助理在 `assistant/`（8 文件 1,740 行）。还挂着它的只有 3 个测试（`tests/personal-assistant-{prologue,sources}.test.ts`、`personal-assistant-fixture.ts`）、2 个脚本（`scripts/personal-assistant-{live-model,preview}.mts`）和旧 spec `specs/bp-delivery-parallel/work-items/personal-assistant/`。这 2 个测试每次全量都在跑，守着一个用户打不开的功能。来自 Codex 线 `acb2cd32`，合并 `assistant/` 时没删。 | `git grep` 只命中上述测试、脚本与 spec |
| R-05 | S2 | **README 与产品脱节。** `README.zh-CN.md`（246 行）仍以 "Claim → Run → Evidence → Review" 和 Codex 内嵌浏览器为主线，而 v0.2.0 发布说明明确这些已退役；`README.md` 链接的是另一份 `README.zh.md`（201 行，结构完全不同）；`README.en.md` 是 7 行跳转桩。三份中文/英文 README 互相漂移。主检出里有人正在改 README 并删了 47 张 showcase 截图（未提交），说明问题已被注意到。 | `README.zh-CN.md` §"核心机制"；`docs/releases/v0.2.0.md` "Runtime 与 MCP" |
| R-06 | S2 | **main 带着已知失败。** 4 个用例在未改动的 main 上稳定失败（见第 2 节），CI 子集不覆盖它们，没有任何地方登记"谁负责、何时修"。 | `specs/soft-workbench-rollout/spec.md`（70ad7027） |
| R-07 | S3 | **浏览器代码没有构建管线。** 工作台 27 个客户端脚本 10,198 行 + 插件 18 个 `client.ts` 10,023 行，以模板字符串、`String.raw` 或函数 `toString()` 送到浏览器；只有 `pty-client` 和 Pages 编辑器走 esbuild。类型检查看不到里面（F-27 就是这样漏的），126 处空 `catch {}` 里过半集中在这些脚本（前 15 个文件占 71 处）。 | `apps/workbench/src/scripts/client/`；`plugins/native/*/src/client.ts`；`package.json` 只有两条 esbuild |
| R-08 | S3 | **错误与工具函数各写各的。** 105 个 `*Error` 类；`escapeHtml` 11 份定义、`readBody` 5 份；错误码前缀 `actions.*`、`mcp.*`、`inference.*`、`plugin_*` 并存，`ActionError` 与 `MolisWorkV1Error` 两套基类。 | 全仓 grep |
| R-09 | S3 | **一个 Home 至少 13 个 SQLite 文件。** 源码里确认的：`catalog.db`、每项目 `molis-work.db`、`sessions.db`、`connectors.db`、`images.db`、`studio.sqlite` 与 `search.sqlite`（Alchemist）、`characters.sqlite`、`private.sqlite`（Experiments）、`lock.sqlite`（密钥文件锁）、`server.sqlite`（Server）、`development.db`（开发态）；按 SSOT 另有 `jelly/jelly.db`、`cognia/cognia.db`。v2 私有存储在项目库里，老插件各开一个库；备份要整目录快照（`docs/installation.md` 也是这么写的），跨库没有事务。 | `git grep` 逐个定位到定义文件 |
| R-10 | S3 | **规格目录失去导航价值。** 184 份活跃 spec 里 100 份没有状态句，`specs/README.md` 只列 15 个"还没做完"；其余靠人记忆。这是 F-14 留下的待办。 | 逐份扫描前 10 行 |
| R-11 | S3 | **合同包里塞了 6 个 10 行的占位 subpath**（`modules/actions`、`automation`、`identity-team-access`、`sync-replication`、`platform/exchange`、`platform/observability`），对应包都是 `absent`。它们让"59 个 subpath"这个数字失真，也让消费者以为能力存在。 | `packages/contracts/src/modules/actions.ts` 等 |
| R-12 | S3 | **`as unknown as` 138 处**，34 处在 `project-migrations.ts`（迁移代码可接受），其余散在各插件 store。`as any` 只有 2 处，`@ts-ignore` 0 处，这点是好的。 | grep |
| R-13 | S4 | **主检出状态。** 本机 main 落后 origin 30 个提交（#96、#99、#100、#101 都没拉），同时有 128 个未提交文件（feed/workflows/SDK network-dispatch 一批）；真实 Home 4207 跑的是这个检出的 dist。等于用户日常在用的产品比 main 旧 4 个 PR，且工作树随时可能与拉取冲突。 | `git status`、`git log main..origin/main` |
| R-14 | S4 | `.impeccable/` 有 1,018 个受版本控制的文件（评审截图与 mock），F-09 之后新截图不再入库，但历史包袱仍在仓库里。 | `git ls-files .impeccable` |

**没有发现的东西（也值得说）：** 没有插件互相 import（边界门禁有效）；模块之间没有互相 import；`@prologue/sdk` 只有 `horizontal/agent-host` 一个依赖点（硬约束守住了）；没有 TODO/FIXME 残留；`goalboard` 旧命名只剩 10 个文件 59 处。

### 3.2 能否持续成为插件平台

沿"安装/启用 → 校验 → 注册 → 宿主加载 → 目录更新 → 消费者发现 → 权限筛选 → 调用 → 结果进产品"逐段看：

| 环节 | v2 Runtime 插件（7 个 + 生成插件） | 构建期组合插件（18 个） | 第三方插件 |
| --- | --- | --- | --- |
| 安装/启用 | Runtime 安装记录、`install_id`、版本兼容声明、升级预检、发行物入库、崩溃恢复配额、隔离解除 —— **完整** | 无安装概念，随构建存在；项目级启用开关经目录 | **没有安装入口。** CLI 只有 `create/validate/pack/sign/dev`；`plugin dev` 文档明说"不是官方市场安装，也不是不可信代码沙箱" |
| 校验 | Manifest 解析器校验端口/权限/Artifact 类型一致性 | 同一 Manifest 解析器 | 同上 |
| 注册 | 动作、场景、事件、端口、UI 由 Manifest 推导 | 动作经 `defineAction` 注册到同一目录（**这点做对了**），但 HTTP 路由、导航、MCP 各自手写 | — |
| 宿主加载 | `createPluginPlatform` 拥有装配顺序 | `project-host.ts` 逐个 `registerProvider`；`web-request.ts` 逐个挂 HTTP | — |
| 目录更新 | Runtime 状态变化即刷新 | 静态 | — |
| 消费者发现 | 页面/工作流/Agent/MCP 共用动作目录；上轮验证"未知 Runtime 插件无需 Host 名单即可发现、配置、工作流执行与 MCP 调用" | 同一目录 | — |
| 权限 | grant 交集、`beforeEffect` 复查、撤权后不写记录 | 同 | — |
| 结果进产品 | Artifact 版本、事件落项目库 | 各插件自己的库或 Artifact | — |

结论：

1. **平台"内核"是可持续的**：动作服务（`packages/kernel/src/action-service.ts` 488 行）+ Plugin Runtime + Manifest 校验，这三件事的设计经得起扩展，测试也真实（SQLite 重启路径、真实 Chrome）。
2. **平台"外壳"还是产品专用的**：工作台导航（`builtin-plugins.ts`）、HTTP 路由前缀（32 个 `/api/*`）、MCP 旧适配、端口连线名单、i18n 词典（`en.ts` 逐插件 import）都是静态名单。新插件要进产品，要改的位置分散在 4～6 处互不关联的文件里，这正是 `repository-systematic-review.md` §5 点名的"多个互不关联的位置手工维护名单"。
3. **没有第三方路径**：没有安装命令、没有市场、没有签名信任链的用户侧界面。`PLUGIN-PLATFORM.md` §2 说"官方可安装生态由官方发布并审核；第三方源码由用户自行构建和安装"，但"用户自行安装"今天做不到。
4. **两代插件的能力差**：v2 插件有升级/回滚/崩溃恢复，老插件没有；老插件各开 SQLite，v2 用项目库私有存储。用户看到的"插件"其实是两种东西。

### 3.3 实现是否清晰、是否具备 C 端标准

**做得好、应保留的：**

- 分层与依赖规则有文档、有门禁（`pnpm boundary:check` + `packages/test-kit` 纯规则 + 每包 README「开发要求」门禁），CI 真跑。
- 本地 Web 的安全边界完整：只绑回环地址、Host/Origin 双校验、写操作要控制令牌 + 幂等键、`timingSafeEqual`、动作网关只接受 127.0.0.1；密钥走 Keychain/加密文件，不进 Store 和日志。
- 动作合同"读取兼容、写入严格"（D-01）+ 历史样本回放门禁；等模型的动作必须声明并发（F-21 门禁）。
- 测试规模与真实性：244k 行测试、e2e 用真实 Chrome、迁移测试用真实旧库样本；上轮把 57 个基线失败逐个归因而不是删断言。
- 规格书文化：几乎每个任务都有 spec，决策有记录。

**离 C 端还差的（按用户会先撞上的顺序）：**

| 项 | 现状 | 影响 |
| --- | --- | --- |
| 平台 | 桌面壳只有 macOS 构建脚本；生成插件沙箱依赖 `/usr/bin/sandbox-exec`（Apple 已标记弃用但仍可用）；npm/CLI 路径理论上跨平台但未验证 | Windows/Linux 没有桌面产品；沙箱策略随 macOS 版本变化的风险 |
| 分发与更新 | 发布 workflow 仅手动；ad-hoc 签名、无公证；无自动更新（Tauri updater 未配置） | 首次安装要绕 Gatekeeper；升级靠用户重下 DMG |
| 模型 | BYOK：openai/anthropic 兼容、gemini、openai-images；无内置额度 | 首次使用前必须填 Key，onboarding 得把这一步做顺 |
| 依赖 | `@prologue/sdk`、`@adeptify/intelligence-client`、`@adeptify/search-evidence-layer` 三个私有 tgz 进仓库；Prologue 目录 24 个 `.patch`，README 说当前是 `resource-intake.tgz`，主检出又多了 `network-dispatch.tgz` | 仓库是 MIT 公开的，但核心 AI 能力来自不可公开构建的包；每次 SDK 改动都是"再打一个 tgz" |
| 可观测性 | `packages/observability` absent，合同是 10 行占位；70 处 `console.*`；无崩溃上报 | C 端出问题只能让用户发日志目录 |
| 备份/迁移 | 无在线备份；文档要求"退出 App、停服务、整目录拷贝"；14+ 个 SQLite 没有统一快照 | 换机、误删、磁盘故障都是数据事故 |
| 文档 | 三份 README 漂移；SSOT 与代码有出入；187 个规格目录无索引 | 新开发者与用户都会读到过时承诺 |
| 界面一致性 | 设计系统 16 个样式模块共 11,338 行，经 `visual-foundation.ts` 全部叠进每张页面：momentum → quiet-paper → calm-desktop → personal-shell → personal-workbench-v2 → v3 → … → craft-finish，后者靠覆盖前者生效；Soft Workbench（#101）又在上面叠了一层 | 四代皮肤同时下发，没有删过旧的；每次换皮都靠覆盖，CSS 只增不减 |
| 错误呈现 | 105 个 Error 类、两套基类、多套错误码前缀 | 用户看到的错误文案与可处理性不一致（F-04/F-15 就是这类问题） |
| 浏览器代码 | 字符串拼接交付，无打包、无类型检查、无 source map | 线上 JS 错误难以定位；每次改动靠人肉回归 |

---

## 4. 模块划分与调用链判断

- **Module / Horizontal / Plugin / App 四层边界本身是合理的**，而且被门禁守住。问题不在层，在 App 层（`local-host`、`workbench`）吸收了太多"每插件一份"的适配。
- **动作服务是正确的统一入口**：页面、工作流、Agent、MCP 都经它；`bindPluginActionRoute` 让旧 HTTP 转发到动作。剩余的旁路上轮已收口（只读旁路合同 09-28）。
- **Goals 仍是最重的领域**（模块 11k + 插件 16k + 工作台 goals-*-ui 十几个文件），Workbench 里 `goals-*.ts` 有 17 个文件，说明 Goals 的 UI 组合还没完全搬进插件包。
- **Coding 与 git/files/diff/text-stats 是 v2 的样板**，也是唯一按平台承诺走完整生命周期的一组；应把它当作其余 18 个插件迁移的模板，而不是特例。
- **`server/` + `apps/server` + `packages/im-ui`**（约 2,600 行）是一条实验性的跨设备接续/IM 线，SSOT 标 `absent`，没有产品入口。要么进矩阵并标 `experimental`，要么移出主线。

---

## 5. 建议的防腐顺序（不含代码改动，只给顺序与验收信号）

| 序 | 事项 | 为什么先做 | 验收信号 |
| --- | --- | --- | --- |
| 1 | **收掉 main 上 4 个已知失败 + 把最近一次全量结果写进 `specs/README.md` 或 CI 产物** | 现在没人能一眼说出 main 是不是绿的 | 全量 0 失败（排除 2 个已登记的环境性用例）；CI 页或文档有日期与数字 |
| 2 | **删 R-04 旧助理（8 个源码文件 + 3 个测试 + 2 个脚本，旧 spec 归档）、合并三份 README、修 SSOT 的 `apps/server` 行、把 6 个占位 subpath 从 contracts exports 摘掉、删 `visual-foundation.ts` 里已被 craft-finish 覆盖的旧皮肤** | 一两天能做完，立刻减少误读与 CSS 体积 | `git grep personal-assistant-` 为空；README 只剩 `README.md` + `README.zh.md`；`boundary:check` 通过；旧皮肤删除后 e2e 截图对比无差异 |
| 3 | **定"官方插件只有一种装配方式"：把 18 个构建期组合插件按 Coding 样板迁到 v2 Runtime，迁一个删一对 `*-actions.ts`/`*-native-plugin-http.ts` 与 `builtin-plugins.ts` 条目** | R-01/R-02/R-03 的根；不做这件事，每个新插件都在加宿主代码 | `project-host.ts` 不再有逐插件 `registerProvider`；`builtin-plugins.ts` 由 Manifest 推导；`legacyMcp` 字段删除 |
| 4 | **给浏览器代码一条构建管线**（esbuild 已在依赖里，Pages 编辑器已是先例），先迁工作台 27 个脚本，再迁插件 `client.ts` | R-07；F-27 类缺陷靠门禁挡不完 | `scripts/client/*.ts` 不再含 `String.raw`/模板 JS；`client-script-undeclared` 门禁可以退役 |
| 5 | **统一错误基类与错误码前缀，删重复 helper** | R-08；C 端错误文案一致性的前提 | Error 类 < 30；`escapeHtml` 一份；错误码有一张表 |
| 6 | **规格归档与 SSOT 例行化**：给 100 份没有状态句的 spec 补状态并归档；`specs/README.md` 只列在做的 | R-10；每轮整理都会重新发现同一批过期文档 | 根目录 < 40 个活跃规格 |

C 端相关（自动更新、公证、可观测性、备份、跨平台）不在"防腐"范围，但建议在第 3 步之后立项，因为它们依赖插件装配收敛（例如自动更新要能带着插件发行物一起回滚）。

---

## 6. 未覆盖与未验证

- 没有重跑全量回归、类型检查与 `boundary:check`；依据的是 CI 记录（main 最近 6 次全绿）与 09-29 的全量记录。
- 没有真实界面走查（第 9 项要求）；Soft Workbench 刚合入（#101），视觉与动线以其 spec 的截图证据为准。
- `packages/design-system`、`horizontal/{connector,listener,runtime}-host`、`modules/` 中 14 个模块只做了清单与依赖方向核对，没有逐个读实现。
- 六个官方集成（gmail/github/rss/youtube/web-query/catalog）未用真实账号联调。
- 在途支线只核对了分支差异、文件重叠、spec 状态句、PR 说明和会话标题，没有读各线的代码实现，也没有跑它们的测试；#98 的 21,577 行没有逐文件评审。
- 各线未提交的改动以 11:00 UTC 的快照为准，四个会话都在运行，之后会变。

---

## 7. 在途支线与会话（2026-09-30 补充）

依据：`git worktree list`、各分支相对 `origin/main` 的提交与文件差异、开着的 PR、本机 Claude Code 会话列表与各线 spec 的状态句。截至 2026-09-30 11:00 UTC。

### 7.1 逐线状态

| 线 | 分支 / 工作树 | 基线 | 规模 | spec 状态 | 会话 | 本报告关心的点 |
| --- | --- | --- | --- | --- | --- | --- |
| **系统级个人工作助理**（含 Todo 插件、个人空间与放置） | `feature/system-assistant` / `~/code/goalboard-assistant`；PR #98 | 已变基到 `fa27207a`（= 当前 main） | 153 提交，+21,577 / −496，286 文件；CI 绿，可合并 | `specs/system-assistant/spec.md` 仍写「需求稿」；PR 说明写明用户验收未做；全量 3,469 项 14 失败（7 项 main 既有、1 项已修、5 项偶发） | 「系统级个人工作助理」空闲 | ① 新插件 `plugins/native/todo` 走旧装配路径：宿主新增 `todo-actions.ts`、`todo-native-plugin-http.ts`，`project-host.ts` 再加一行 `registerProvider`，并改了宿主与工作台 24 个既有文件（`builtin-plugins.ts`、`web-request.ts`、`web-catalog.ts`、`renderer.ts`、`ui-composition.ts`、`en.ts`、onboarding 与助理相关文件），R-01 从 18 变 19；② 新增 `horizontal/placement`，只依赖 contracts，但它记录的是「对象放在哪、和哪些工作有关」这类业务关系（写入 Context Ledger 分区），按 `ARCHITECTURE.md` 的定义更像 Module 而不是横向技术服务；③ vendor 里 Prologue 包 4 份（assistant-intake、assistant-memory、compaction-growth、resource-intake），D-03「只留两份」已破；④ 没有顺手删 R-04 的死代码；⑤ 宿主 +2,472 行 / 7 个新文件；⑥ 底栏加了助理的「需要你看看」铃铛 |
| **平台侧栏**（讨论、浏览器、文件、Computer Use） | `feature/side-panel` / `.claude/worktrees/side-panel` | 叠在 `feature/system-assistant` 2e837e8f 上 | 1 个 docs 提交 + 29 项未提交（11:20 UTC；20 分钟前是 12；删 `discussion-split.ts`，新增宿主 `browser/`、`contracts/services/browser.ts`、`side-panel.ts`） | 「进行中（09-30 开工）」 | 「统一侧栏文件浏览能力」运行中 | 依赖未合入的 #98；计划再打一个 Prologue 补丁包（放行 surface-*）；与助理面板线共改 `immersive-shell.ts`、`navigation-presentation.ts`，与 #102 共改 `immersive-shell.ts`、`en.ts` |
| **助理面板与底栏改版** | `claude/determined-stonebraker-06644e` / `.claude/worktrees/determined-stonebraker-06644e` | 叠在 `feature/system-assistant` 上 | 3 提交 + 12 项未提交（11:20 UTC；`assistant-dock.ts`、`assistant-island.ts`、`immersive-shell.ts`、`goals-page-renderer.ts`、`craft-finish.ts`…） | 「进行中；第一期已实现，第二期底栏、第三期未开始」 | 「现在底部 assistant 有哪些元素…」运行中 | 依赖 #98；直接改设计系统 `craft-finish.ts`（#101 刚换完皮肤） |
| **页面动线与导航模型全量修复** | `claude/page-interaction-flow-redesign-49fe35` / `.claude/worktrees/page-interaction-flow-redesign-49fe35` | `fa27207a`（当前 main） | 0 提交，36 项未提交（11:20 UTC；20 分钟前是 27，+944 / −228），含 Characters 插件 8 个文件 | 「进行中（09-30 起）」 | 「页面交互和动线设计优化」运行中 | 与 #98 有 8 个文件重叠（`builtin-plugins.ts`、`web-catalog.ts`、`en.ts`、`page-assets.ts`、`initialization.ts`、`tab-workspace.ts`、`settings-assistant.ts`、`settings-prompts.ts`）；spec 第 5 条提出「把 Character 做成设置而不是插件」，而 Characters 是 7 个 v2 Runtime 插件之一，这是架构决定，不是界面修补 |
| **平台记忆系统** | 无分支；`specs/memory-system/spec.md` 未跟踪地写在主检出 | 依赖 #98 的 P8 第一版 | 1 份 28 KB 设计稿 | 「设计稿，待用户审阅，尚未开工」 | 「Molis Work 动态交互体验设计」运行中 | 需要 Prologue 补 S1～S5 五个缺口，意味着又一个 tgz |
| **动态交互**（行为/语义驱动底栏与助手协同） | 无分支、无 spec | — | 0 | 未开工 | 同上一会话 | 与页面动线线明确不是一件事，但改的是同一块底栏 |
| **标题栏插件通知铃铛** | `origin/claude/project-thread-vsglm2`；PR #102 | `fa27207a` | 2 提交，+226 / −6，14 文件；CI 绿，可合并 | 「待验收」 | 外部协作者经 Claude 项目线程提交 | 与 #98 的助理铃铛并存，外壳会出现两个铃铛；留下 `en.ts` 两条无人用的旧占位文案；其回归数字来自缺原生资产的 Linux 容器（16 + 27 项失败），与本机基线不可比 |

### 7.2 遗留物

| 位置 | 内容 | 判断 |
| --- | --- | --- |
| 主检出 `~/code/goalboard`（main @ 8b609527，落后 origin 30 提交） | 149 项未提交（81 改、47 删、21 未跟踪）：09-28 动作架构复查的原稿（feed/workflows/SDK network-dispatch 一批）。#95 已在独立工作树把它整合并合入；对照 origin/main，仍有 50 个文件不同，是整合时的改动；`network-dispatch.tgz` 在 origin/main 上已被后来的 resource-intake 替换。另有未跟踪的 `specs/nordic-coss-ui/`、`docs/design/nordic-coss/`（09-28，未进 main）、`docs/prompts/`（本次要求原文）、`specs/memory-system/`（记忆系统设计稿） | 原稿已无独立价值，但要由动作架构那条线的负责人确认后丢弃；nordic-coss 两份文档要么归档进 `specs/archive`，要么提交；之后 `git pull --ff-only`。真实 Home 4207 目前跑的就是这个落后 4 个 PR 的检出 |
| `~/.codex/worktrees/d62d/goalboard` | 游离 HEAD 08c66209（Codex「基于证据的个人助理」5 个提交，内容已作为 acb2cd32 进 main，文件逐字节相同）+ 1,173 个未提交文件，最后活动 09-25 | 已被 `feature/system-assistant` 取代；确认后整个工作树删除 |
| 已合并分支的工作树：`goalboard-search`、`goalboard-soft-workbench`（未跟踪的 `plugins/native/jelly/native/` 构建产物）、`goalboard-fix`（8 张重生成的评审截图）、`goalboard-review`、Codex `action-service-review-merge`、`architecture-followup` | 6 个 | 删除；对应本地分支一并删（`feature/system-search`、`feature/soft-workbench-rollout`、`feature/action-service-review`、`feature/platform-capability-consolidation`、`feature/architecture-followup`、`fix/goals-legacy-snapshot`、`chore/drop-old-sdk-tgz`、`chore/repo-systematic-review`） |
| 8 个 scratchpad 基线工作树（各会话的 `baseline*`、`main-*`；复查时又多了 1 个） | 只读比对用 | 会话结束后没人清；删除 |
| 远端 27 个 `codex/*` 分支 | 09 月上旬的 Codex 线 | 逐个核对是否已合并后删除 |

### 7.3 跨线风险

1. **叠加依赖。** 侧栏、助理面板、记忆系统、插件复查四条线直接叠在未合入的 #98 上，记忆系统的设置挂载又要等页面动线线。#98 在评审中每改一次，四条线都要变基；#98 不合，它们都合不了。
2. **同一批文件被 3～4 条线同时改**（11:20 UTC 重算）：4 条线在改 `immersive-shell.ts`、`i18n/en.ts`、`scripts/client/initialization.ts`；3 条线在改 `navigation-presentation.ts`、`page-assets.ts`、`goals-page-renderer.ts`；`builtin-plugins.ts` 是 #98 与页面动线两条。20 分钟内侧栏与页面动线的未提交文件各多了十几个，重叠面还在扩大。各线之间靠记忆笔记口头约定区块，没有写成文件归属表。
3. **产品语义在分叉。** 两个铃铛；页面动线线要改 Characters 的性质；助理面板线在改 #101 刚定稿的设计系统；动态交互与页面动线都盯着底栏。Soft Workbench 的用户验收还没做完，这些线已经在它上面继续叠。
4. **每条线都带一个 Prologue SDK 包。** #98 已 4 份，侧栏和记忆系统各要再打一份。上一轮定的「换新包删旧包」在分支上没有执行。
5. **新插件继续走旧装配路径。** Todo 是 09-29 新写的插件，仍是「宿主两个文件 + 工作台目录一条」。如果第 5 节第 3 步要做，Todo 应该是第一个迁到 v2 的，或者至少不再新增旧路径插件。
6. **没有统一的回归基线。** 本机 main 报 4 个既有失败，#98 报 7 个，#102 在 Linux 容器里报 16 + 27 个；各线各自解释「main 上本来就失败」。
7. **多份 spec 同时「进行中」。** #98 的 spec 仍是「需求稿」而 PR 已可合并；侧栏、助理面板、页面动线三份「进行中」，记忆系统「设计稿」。规格与代码状态对不上时，评审只能看 PR 说明。

### 7.4 12:00 UTC 之后新开的四条线

| 线 | 分支 / 工作树 | 基线 | 现状 | 要注意的 |
| --- | --- | --- | --- | --- |
| **平台记忆系统** | `feature/memory-system` / `.claude/worktrees/sweet-clarke-8e7f12`；会话「推进平台记忆系统」 | 叠在 `feature/system-assistant` 上（第 4 条叠 #98 的线） | 5 个提交：`apps/local-host/src/memory/memory-host.ts`、改 `assistant/` 三个文件、设置页四个文件、`web-request.ts`、`web-catalog.ts`、`local-owner-permissions.ts`、`system-agent-service.ts` | ① 它改的 `assistant/assistant-service.ts` 正是 #98 评审中的文件，#98 每改一次它就要变基；② 记忆从「助理私有」升级成「平台能力」，但实现落在宿主 `memory/` 目录而不是一个包，宿主再涨一块；按 `ARCHITECTURE.md` 这是业务事实的 owner，应该是 `modules/memory`（或至少独立包）并进 SSOT；③ 设置页挂载明确要等页面动线线合入，形成「页面动线 → 记忆」的第二条依赖链；④ SDK 补丁以 c63ea1a1 为父，与侧栏线「后合者叠成合成包」，vendor 会从 4 份再涨 |
| **情境驱动动态交互** | `feature/contextual-interaction` / `.claude/worktrees/contextual-interaction`；会话「Molis Work 动态交互体验设计」 | 从 `origin/main` 开出（好） | 1 个 spec 提交 + 14 项未提交：改 `packages/contracts/src/platform/actions.ts`、`packages/kernel/src/index.ts`，新增 `contracts/platform/action-fragments.ts`、`contracts/services/contextual.ts`、`kernel/contextual.ts`、宿主 `contextual/` 子目录、Pages 的 `focus.ts`/`fragment-offers.ts`，并改 Pages 的 `editor-browser.ts` | ① 一条体验线在改动作合同与内核（`platform/actions`、`kernel`），这是全平台的公共契约，应按 `specs/action-architecture/spec.md` §3 单独评审并同步「基本合同」，不能只在体验 spec 里带过；② 它的挂载点依赖两条未合入的线（助理面板的 `[data-assistant-context-actions]` 容器、页面动线的 `molis-work:place-changed` 事件）；③ 改 `editor-browser.ts`（3,843 行、唯一 esbuild 打包的插件脚本）要留意与 Pages 其他改动的冲突；④ 与 `contracts/package.json` 相关的收口项（删 6 个占位 subpath）本轮为它让路 |
| **插件功能端到端复查与动线优化** | `feature/plugin-e2e-review` / `~/code/goalboard-plugins` | 叠在 `feature/system-assistant` 上（第 5 条） | 只有 `specs/plugin-e2e-review/` 未提交 | 题目与页面动线线、与本报告第二轨的「逐插件迁 v2」重叠；如果它逐个插件改 UI，会同时碰 18 个插件包和三条外壳线。建议它先出清单（像本报告一样），修复按插件拆成小 PR、在 #98 之后落 |
| **Coding 工作区打磨** | `feature/coding-workspace-polish` / `~/code/goalboard-coding-polish`；会话「Coding 插件 TaskBoard 标签显示问题」 | 从 `origin/main` 开出 | 尚无改动 | Coding 是 v2 插件，范围清楚；只提醒 `coding/client.ts` 是 1,588 行模板字符串，改动靠浏览器用例守 |

合起来看：现在有 **5 条线叠在未合入的 #98 上**（侧栏、助理面板、记忆、插件复查，加上记忆等页面动线），#98 的用户验收成了所有线的瓶颈；两条新线都在动平台公共合同或宿主结构，建议它们各自把合同变更单独成 PR、先合。

### 7.5 对在途工作的建议

1. **合入顺序：** #102（小、绿）→ #98（等用户验收；合入前要求三件事：删 `personal-assistant-*` 死代码、vendor 收回两份包、在 spec 状态句写清 Todo 走的是旧装配路径并登记为待迁移）→ 侧栏与助理面板变基 → 页面动线最后变基。
2. **文件归属表落地：** 把各线口头约定的区块写进各自 spec 的固定一节（哪些文件归谁、碰之前找谁），至少覆盖 7.3 第 2 条列出的 5 个文件。
3. **动 Characters 之前先立项：** 「Character 做成设置」涉及 v2 Runtime 插件退回宿主，应作为架构决定单独写方案，不夹在页面动线的 27 个文件里。
4. **清理检出：** 按 7.2 处理主检出、d62d、6 个已合并工作树、7 个基线工作树和已合并分支；然后主检出拉到 origin/main，让 4207 跑当前版本。
5. **统一基线：** 每次合入 main 后由一人在干净工作树跑全量并把数字写进固定位置（建议 `specs/README.md` 顶部或 CI 产物）；各线只对照这一份。

---

## 8. 复查记录（2026-09-30 第二遍）

对第一稿逐条重新取证后改了下面几处；其余结论复核无误。

| 位置 | 第一稿 | 复查后 | 原因 |
| --- | --- | --- | --- |
| R-04 | 旧助理 7 个文件"源码和测试里都没有导入者" | 生产无导入者；但 3 个测试、2 个脚本、工作台 `personal-assistant-ui.ts` 和旧 spec 仍引用，两个测试每次全量都在跑 | 第一遍只搜了 `-host`/`-http` 两个文件名 |
| 3.3 界面一致性 | 三个旧皮肤"各只有 1 个导入者" | 16 个样式模块 11,338 行全部经 `visual-foundation.ts` 叠进每张页面，四代皮肤同时下发 | 第一遍按文件名搜导入，没有顺着 `visual-foundation.ts` 看下去；结论方向反了：不是没人用，而是全都在用 |
| R-10 / 第 1、2、5 节 | 187 个目录"只有约 30 个有状态句" | 184 份 spec，84 份有状态句、100 份没有 | 第一遍只看前 5 行、只认"状态："写法 |
| R-07 / F-35 | 插件"15 个 client.ts 约 9,600 行" | 18 个全部是模板字符串或 `String.raw`，共 10,023 行 | 第一遍只看每个文件前 400 字节 |
| R-09 / 附录 C | "至少 14 个"，含 `artifacts.sqlite` | 源码确认 12 个 + SSOT 记载的 jelly/cognia 2 个；`artifacts.sqlite` 在源码里找不到，去掉 | 逐个名字定位到定义文件 |
| 第 0 节 | "Prologue SDK 三个 tgz" | 三个私有 vendored 包；Prologue 目录 2 份 tgz + 24 个补丁 | 措辞混淆了包数与文件数 |
| 7.1 #98 | Todo"宿主 3～5 个文件" | 新增 3 个宿主文件 + 改动 24 个既有宿主/工作台文件 | 按 #98 的 diff 逐文件核对 |
| 7.1 / 7.3 | 三条 UI 线的未提交数与重叠 | 20 分钟内侧栏 12→29、页面动线 27→36、助理面板 5→12；4 条线共改 3 个文件、3 条线共改 3 个文件 | 会话在跑，重新取快照 |
| 第 1 节 / 7.2 | 主检出"128 个未提交文件"、"7 个基线工作树" | 149 项（81 改、47 删、21 未跟踪）；8 个基线工作树 | 第一遍用的是 `diff --stat` 的计数，未含删除与未跟踪 |

复核无误的关键结论：三套装配路径与 7/18 的划分；`personal-assistant-*` 生产不可达；#98 与 #102 会出现两个铃铛（助理铃铛不在 origin/main 上）；主检出未提交内容是 09-28 动作架构原稿、已由 #95 整合；d62d 的 5 个提交已作为 acb2cd32 进 main；桌面无 updater、无崩溃上报；沙箱依赖 `sandbox-exec`；CLI 没有第三方插件安装命令；CI 只跑边界 + 契约子集。

---

## 9. 第一轨已开工（2026-09-30，本会话）

**已合入 main**：PR #103（两个提交，CI 绿），2026-09-30 12:08 UTC 合并，main 现为 `d010609b`；分支与工作树已删。只挑了与七条在途线和两个 PR 都不碰同一文件的项。

| 项 | 做了什么 | 验证 |
| --- | --- | --- |
| R-04 旧助理 | 删宿主 7 个文件、工作台 `personal-assistant-ui.ts`、4 个测试与夹具、2 个脚本；旧 spec 加「已退役」状态句，历史保留 | 全 workspace 构建通过；根 `tsc` 与 SDK `tsc` 通过 |
| 止血门禁 | 新增 `tests/builtin-plugin-assembly-gate.test.ts` 并加进 CI 的 `test:contracts`：内置插件必须是 Runtime 装配或冻结名单上的 19 个旧路径插件（Todo 已为 #98 预留）；宿主不许再出现新的 `*-native-plugin-http.ts` | 门禁 3/3；突变验证：多放一个宿主路由文件即失败；`test:contracts` 122/122 |
| 规则 | `AGENTS.md` 硬约束加两条：新内置插件只走 Runtime 装配；vendor 只放当前 Prologue 包 | — |
| R-05 README | 删 `README.zh-CN.md`（讲已退役机制的那份）与 `README.en.md`（跳转桩）；rename 测试的文件清单同步 | rename 测试 11/11 |
| SSOT | `apps/server` 行改为 `server/` + `apps/server` 的真实状态（实验、无产品入口）；新增 `packages/im-ui` 行 | `pnpm boundary:check` 70 包、0 错误 |

**这次故意没做、原因如下：**

- contracts 里 6 个占位 subpath：`packages/contracts/package.json` 正被侧栏线和动态交互线改，等它们合入。
- vendor 包数门禁：现在加会直接让 #98（4 份）和记忆线不过；建议 #98 合入前自己收到两份，门禁随第二轨补。
- 主检出 149 项未提交、d62d、6 个已合并工作树、8 个基线工作树：属于别的会话，要各自负责人确认后删。主检出里 README 的图片行删除是某个会话的未提交改动，我删 `README.zh-CN.md` 后它拉取时会有一个可直接丢弃的冲突。
- 4 个既有失败用例：需要逐个读原因，不是文档级改动，放到下一片。

**需要你做的：** 决定是否推送并开 PR；把 7.5 节的合入顺序告诉各线；#98 合入前收 vendor 与删旧助理这两项已由本分支承担一半（旧助理已删，#98 变基后无冲突，因为它没碰这些文件）。

---

## 附录 A：宿主对各插件的耦合（`apps/local-host/src` 按前缀的行数）

| 前缀 | 行数 | 前缀 | 行数 |
| --- | --- | --- | --- |
| feed | 719 | git | 708 |
| jelly | 622 | schedule | 571 |
| home | 551 | coding | 548 |
| search | 529 | personal-assistant | 488（死代码） |
| artifact | 286 | inbox | 270 |
| alchemist | 256 | experiments | 239 |
| shelf | 239 | images | 175 |
| pages | 169 | plugin-builder | 130 |
| cognia | 98 | characters | 84 |
| goals | 55 | workflows | 53 |
| dataset / form | 47 / 47 | lingguang / work / ppt | 43 / 38 / 35 |

## 附录 B：插件装配方式清单

| 方式 | 插件 |
| --- | --- |
| v2 Runtime 监督器（`project-plugins.ts`） | characters、shelf、coding、files、diff、git、text-stats |
| 构建期组合（`project-host.ts` + `*-native-plugin-http.ts` + `builtin-plugins.ts`） | goals、feed、inbox、pages、form、dataset、ppt、lingguang、jelly、cognia、images、alchemist、experiments、schedule、workflows、work、artifacts、plugin-builder |
| 安装/生成插件（`installed-plugin-host.ts`） | 插件创作台产出的插件 |
| 官方集成（`official-integrations.ts` 注册 Provider） | gmail、github、rss、youtube、web-query、catalog |

## 附录 C：数据文件清单（每个 Home）

源码确认：`projects/catalog.db`、每项目 `molis-work.db`、`sessions.db`、`connectors/connectors.db`、`images/images.db`、`alchemist/studio.sqlite`、`search.sqlite`（Alchemist）、`characters.sqlite`、`private.sqlite`（Experiments）、`lock.sqlite`（密钥文件锁）、`server.sqlite`（Server）、`development.db`（开发态）。按 SSOT 另有 `jelly/jelly.db`、`cognia/cognia.db`。
