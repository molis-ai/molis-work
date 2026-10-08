# 系统性代码与架构防腐整理

状态：§4.1「不留兼容逻辑」已完成（2026-10-07）；§4.2–§4.19 已普查并排成 6 波 87 片（§10），第 1 波进行中；27 项待决与逻辑复查留下的问卷提交问题已全部定（10-08）

任务要求：`docs/prompts/repository-anti-corruption.md`（2026-10-03 起以 main 上的版本为准，见 §1）。同时适用 `docs/prompts/repository-systematic-review.md` 与 `docs/prompts/code-health-report-2026-09-30.md`。上一轮整理见 [repository-systematic-review](../archive/repository-systematic-review/spec.md)，这里不重复它的内容。

本 spec 是第二步唯一的进度与证据记录，每完成一片就更新。

## 0. 现场与范围

- **基线**：第一步最终 main。第一步全量回归基线见 [post-merge-review §7.1](../archive/post-merge-review/spec.md#71-回归基线)；能力快照见 [§7.2](../archive/post-merge-review/spec.md#72-能力快照)；跨功能场景清单见 [§7.4](../archive/post-merge-review/spec.md#74-跨功能场景清单)。
- **范围**：全仓 73 个 workspace 包（`apps` 6、`horizontal`、`modules`、`packages`、`plugins/native` 26、`plugins/official-integrations`、`server`、`tooling/plugin-cli`）。每个包都至少做一次结构审查，交出 §5 的包级清单。
- **在途的其他线**（开工前要重新核对）：`feature/side-shelf`、`feat/plugin-picker-pins`、`docs/archive-project-arrival-flow`、`feature/fix-project-management-freeze`（另一工作树）、Codex 工作树 `~/.codex/worktrees/d62d`。

## 1. 决策记录与待决事项

| 日期 | 事项 | 选项 | 结论 | 说明 |
| --- | --- | --- | --- | --- |
| 2026-10-02 | 任务要求以哪份为准 | anti-rot 版；main 版 | anti-rot 版 | 用户在目标里指定；anti-rot 合入并删除后改用 main 版 |
| 2026-10-02 | `~/.molis-work` 在删迁移代码前怎么处理 | 保留并升级；备份后重建；先不处理 | 保留并升级 | 先整份备份；停 4207 与常驻服务期间用删除前的代码升到最新；与新基线逐表比对一致后才删迁移代码 |
| 2026-10-02 | 4173 上的服务（第一次问时我误说成独立的旧 Home，用户选「备份后停用」；执行前发现是真实 Home 的常驻服务，重问） | 不停，保持现状；停掉常驻服务；第二步升级时一并换新版 | 不停，保持现状 | 不备份、不停；升级 `~/.molis-work` 时常驻服务也要一起停，升级后由用户决定是否换新版（**已被 2026-10-03 的决定推翻**：备份、停 4173、删旧成果表，见本表下方）|
| 2026-10-02 | 插件升级声明的机制 | 保留机制，清掉旧声明；连机制一起删 | 保留机制，清掉旧声明 | 保留 `compatible_from_versions`、`migratable_from_versions` 与发行物留存；内置插件为过去版本写的声明删掉，版本号按新策略重置 |
| 2026-10-02 | 同事有没有要保留的 Home | 给同事一份备份升级说明；没有同事在用；稍后告知 | 没有同事在用 | 只处理本机 `~/.molis-work` |
| 2026-10-02 | 共享核心的评审方式 | CODEOWNERS 记归属、不开必选评审；共享核心必须评审；再加合并队列 | CODEOWNERS 记归属，不开必选评审 | 加 `.github/CODEOWNERS`，自动请求评审但不强制；合同变更靠门禁守；不改仓库设置、不开合并队列 |
| 2026-10-02 | vendored 私有包 | 删 3 份不用的、分发照旧；删 3 份并改私有源；先不动 | 删 3 份不用的，分发照旧 | [#170](https://github.com/molis-ai/molis-work/pull/170) 删掉 assistant-memory、compaction-growth、resource-intake；私有包继续随仓库分发 |
| 2026-10-02 | 他人的工作树与分支 | 只清已合入且干净的；全部保留；逐个问 | 只清已合入且干净的 | 已删 `~/code/molis-work-performance-pr` 工作树与本地分支（#150 已合、无未提交改动）。删远端已合入分支（他人的 #159、#164，以及本目标自己的 23 条）被自动模式拦下，留给用户在 GitHub 上删，清单见 §7 |
| 2026-10-03 | 任务书来源 | — | 以 main 为准 | 任务书已合入 main：[#216](https://github.com/molis-ai/molis-work/pull/216)（`592f15bc`）用 anti-rot 上的两份任务书替换 main 上的旧版（anti-rot 自分叉以来只改了这两个文件）。此后任务要求、代码与 spec 都以 main 为准，按目标原文「anti-rot 合入 main 后以 main 为准」执行；每个分支从最新 origin/main 开，开工前 fetch、合并前同步到最新 main，不再基于 anti-rot 或其他旧分支开新工作 |
| 2026-10-03 | 验证频率 | — | 用户调整 | 用户 2026-10-03 调整验证频率：小改动攒成一批，整体构建一次，跑这批改动涉及的相关用例（改了什么就跑读它、调它的用例；带 `L()` 文案的加 `tests/i18n.test.ts`，改路由的加所有读这条路由的用例）；全量回归只在大改动时跑（改共享核心 contracts、kernel、modules、local-host 的装配、workbench 外壳，改迁移或存储，改动跨三个以上包，删除整块旧代码，或合入后相关用例意外失败），每个阶段收尾也跑一次全量作为阶段证据。不变的底线：每个 PR 的 CI 必须通过；跑测试前先整体构建；构建与浏览器用例串行；不跳过、不放宽、不删除断言；失败先用干净基线工作树比对 |
| 2026-10-03 | 推翻 10-02「4173 不停，保持现状」 | 保持现状；备份、停 4173、现在删旧成果表 | 备份、停 4173、现在删 | 成果库改造里用户决定立即删真实 Home 的旧成果表（[artifact-positioning §1](../artifact-positioning/spec.md)）：已 `launchctl bootout` 停下 4173（安装版 0.2.0，没有旧表已不能用，要等装新版）；18 个项目库已备份到 `~/.molis-work-backups/2026-10-03-drop-old-artifact-tables/` 后逐库删掉 `artifacts`、`artifact_versions`。下面 §4.1 第 4 步按此重写 |
| 2026-10-03 | anti-rot 分支与工作树（弹窗） | #216 合入后三处都删（推荐）；只删工作树与本地分支；先都不删 | 三处都删 | 已执行：#216 合入（592f15bc）后删了工作树 `.claude/worktrees/review-prompts-goal`（无未提交改动）、本地分支 `anti-rot`（无本地独有提交）与远端 `origin/anti-rot` |
| 2026-10-03 | 场景 9：拷贝真实 Home 用当前 main 打开（弹窗） | 拷到会话临时目录验证（推荐）；等 4173 装新版时一起做；不做 | 拷到会话临时目录验证 | 先确认 4207 没在写，再把 `~/.molis-work` 拷到会话临时目录；用当前 main 在别的端口、文件密钥后端打开这份拷贝走一遍；不碰原 Home、不调模型，做完删拷贝。结果记在 §9.4 第 12 条 |
| 2026-10-04 | 内置插件安装停在旧版本，删「可从旧版本升级」名单前怎么办（弹窗） | 内置插件随宿主升级（推荐）；在插件市场里逐个确认升级；先不删名单 | 内置插件随宿主升级 | 随宿主发布的内置插件（监督器名单里标 `bundled`）启动时把安装记录升到宿主的版本：保留新 Manifest 仍声明的授权、补上它要求的授权，与新装一致；不再恢复旧发行物。第三方与生成的插件不变 |
| 2026-10-04 | 没配模型目录时的文字补全兜底（§9.5 第 7 条，弹窗） | 只删旧凭据，环境变量留作开发配置（推荐）；全删，只认模型目录；先不动 | 只删旧凭据，环境变量留作开发配置 | 删掉读 `model:text:api_key` 和导入「文本补全 · 原有密钥」。`MOLIS_WORK_TEXT_*` 与 `MINIMAX_API_KEY` 只作开发与测试的显式配置，写进手册。通用的 `MOLIS_WORK_TEXT_API_KEY` 不再默认成 MiniMax。产品里只有模型目录配置模型 |
| 2026-10-04 | V3 一次性导入（§9.5 第 6 条附带，弹窗）：早先独立仓库规格特意保留的产品入口（BL-083） | 删掉导入全链（推荐）；保留导入 | 删掉导入全链 | 删 CLI `import-v3`、管理 MCP `import_v3`、宿主能力、Goals 动作与导入实现，BL-083 关闭。只有导入会写的覆盖账本随后单独删。身份修复与之无关，已先做 |
| 2026-10-04 | 删两处兼容前是否只读核对真实 Home（弹窗） | 只读核对后再删（推荐）；不核对直接删；两处都先保留 | 只读核对后再删 | ② 密钥库：只按格式核对 `feed/secrets.json`（不解密、不输出内容），格式 2、keychain+aes-gcm，27 条全是 AES-GCM，没有 v0.3 信封，可以删。① 会话执行者：执行时发现执行者存在 Prologue 的加密记录里，核对要用真实 Home 的存储密钥在内存里解开会话索引，超出弹窗里说的「拷单个文件只读统计」，没有动手，改为再问（下一行） |
| 2026-10-04 | 会话执行者核对要解密，怎么办（更正后再问，弹窗） | 在拷贝上解密索引只数条数（推荐）；不核对，保留这处兼容；不核对，直接删 | 不核对，直接删 | 删 `legacyActorId`，会话的执行者改为必填；没写执行者的很早的旧会话，插件读不到（用户已知） |
| 2026-10-04 | Casebook 对外合同的旧名（待决 6，弹窗） | 改成 Molis Work 的名字（推荐）；保持旧名列入例外；等外部插件下次改版 | 改成 Molis Work 的名字 | `goalboard.casebook.*` 改为 `molis-work.casebook.*`，Schema `$id` 改到 `https://molis-work.dev/contracts/casebook/...`（与已归档的 Casebook v1 合同同一写法），用户动作签名的域名串一并改；不留旧名别名。外部 Casebook 插件要同步，PR 里列出全部新旧 id |
| 2026-10-04 | 真实 Home 的库（用户在对话里说 "you can touch the database"） | — | 授权动真实 Home 的库 | 用于 §4.1「每个库一份当前 schema 加版本」：按 10-02 的「保留并升级」执行。先整份备份 `~/.molis-work`，确认 4207、4208、4173 都没在跑；每一步先在拷贝上演练、核对，再动原库；只写结构版本号（`PRAGMA user_version`），不改表和数据 |
| 2026-10-04 | 项目库基线的列序（日常取舍） | 按某个真实库；按代码里的建表语句 | 按建表语句 | 18 个真实项目库有多种列序（Coding 会话表就有 4 种），一份基线对不上全部；真实 Home 按列名搬进新基线库，见 §4.1 演练 |
| 2026-10-04 | 项目库、目录库里只剩旧数据才用的列与值（日常取舍） | 留着；随基线去掉 | 随基线去掉 | `feed_items.item_type`（只剩 `'feed'`）、`feed_items.linked_goal_id`（关联早在上下文账本，列恒空）、`projects.migrated_from_path`（恒空）；Feed 快照的 `contract_migrations` 与 `markRead` 的类型参数随之去掉 |
| 2026-10-04 | 目录库的版本记法（日常取舍） | 改用 `user_version`；沿用 `catalog_meta.schema_version` | 沿用，升到 20 | 目录库本来就有版本号和「拒绝更新的版本」；只删 1→19 的升级链，版本不符就拒绝 |
| 2026-10-04 | Casebook 恢复失败报什么（日常取舍） | 保留缺失迁移的明细；只报代码 | 只报 `project_recovery_unsupported_schema` | 明细说的是缺哪些迁移，基线下没有迁移可缺；外部 Casebook 插件与 #248 的改名一起同步 |
| 2026-10-04 | Schedule「重装后确认归属」（日常取舍） | 随旧 Builder 导入一起删；保留 | 保留 | 是插件重装后把提醒、定时操作交给新安装的现行流程，不是兼容；用例改成真的重装一次 |
| 2026-10-04 | 项目库、目录库的一次性搬运工具放哪（日常取舍） | 进仓库；只放会话临时目录 | 只放会话临时目录 | 只用一次（真实 Home 与测试样本），不留产品代码；做法写进 §4.1 与样本 README |
| 2026-10-04 | 真实 Home 项目库、目录库何时按新基线重建（弹窗） | 合并后马上重建并换新版（推荐）；等全部改完再重建；先不重建 | 合并后马上重建并换新版 | 已执行（见 §4.1 真实 Home）：目录库先行（v20 让 0.2.0 旧进程打开即拒），18 个项目库 v1；4173 换新版是用户的操作 |
| 2026-10-04 | 治理「旧提案」的只读投影（弹窗） | 连表带投影一起删（推荐）；只删投影留表；保留 | 连表带投影一起删 | Contract Proposal、Candidate、Rewire 三张表与投影、`supersedes_legacy_proposal_id`；项目库 v2 |
| 2026-10-04 | 根包 0.1.x SDK 出口（弹窗） | 删掉，根包不再导出代码（推荐）；留作对外 SDK；改成转发 | 删掉 | `apps/local-host/sdk/`、`tsconfig.sdk.json`、根 `exports` |
| 2026-10-04 | Goal 事件前的旧历史（弹窗） | 连表带显示一起删（推荐）；保留为只读历史 | 连表带显示一起删 | 运行、领取、依据、评审、评审义务、澄清、覆盖修订、影响范围十张表（9-08 起无写入路径）与两个模块；「迁入的历史完成」；Coding 迁移前委派；项目库 v3 |
| 2026-10-04 | MCP 三套对外名（弹窗） | 只留动作工具一套（推荐）；v1 名留作 Goals 正式名；维持现状只改名 | 只留动作工具一套 | 删 Goals/判断规则 v1 别名、插件旧导出、「旧版工具（全局开关）」；连接类工具保留；Skill 与文档改动作名 |
| 2026-10-04 | 正在跑的 0.2.0 MCP 进程（日常取舍） | 逐个停掉；不停，靠目录库版本挡住 | 不停 | 6 个其他会话的进程；目录库 v20 让它们打开即拒，不会碰重建后的项目库 |
| 2026-10-04 | 插件安装记录的世代与执行边界（日常取舍） | 留读取兜底；必填并补齐真实 Home | 必填 | 删 `'legacy:'+installed_at` 与「缺省即 host」；真实 Home 171 条已有世代，161 条缺 `execution` 由维护二写 `host`（与原读法相同） |
| 2026-10-04 | 记忆条目没有平台事实时（日常取舍） | 从标签推断；不当作平台的条目 | 不当作平台的条目 | 平台写的条目都带事实；旁表的 `memory_meta`（真实 Home 0 行）与「早于旁表的历史补记」删；`memory_migrations` 改名 `memory_markers`，丢掉已删导入的 `assistant-p8` 标记 |
| 2026-10-04 | 事件前历史删掉后受影响的现行界面（日常取舍） | — | 按现行事实重算 | 动量图改看事件工作日志；胶囊进行中按进行中 Goal 计；回收站、项目删除不再被历史运行挡；项目引用只读当前工作区；「影响范围」页删 |
| 2026-10-04 | 真实 Home 里 458 个 Goal 的归属来源 `migration`（日常取舍） | 留作历史取值；搬时记为 `intent` | 记为 `intent` | 与「迁入的历史完成」同属 9 月搬迁的产物；维护二在拷贝上先改再搬，代码不再认识 `migration` |
| 2026-10-05 | 动作工具的结果不带 Goal 地址后，Runtime 怎么给用户链接（日常取舍） | 每个 Goals 动作结果补地址；连接结果给模板 | 连接结果给模板 | `context_resolve` 的连接多一个 `goal_url_template`（`<project_url>/goals/{goal_id}`）；Skill 改为填模板，仍不许从 ID 之外的东西拼地址；不在宿主里按能力补字段 |
| 2026-10-05 | 只为别名服务的宿主方法与外壳（日常取舍） | 留着；随别名一起删 | 随别名一起删 | `trash-with-work-state` 宿主方法与 `work_state`/`next_action` 外壳、判断规则旧名转换、Jelly 自动补版本号、Pages「翻译成新文档」的组合（动作只给候选）、会话活动里旧 `payload` 包装的读取；测试改走动作 |
| 2026-10-05 | Runtime 经 MCP 写入时没有稳定 Session（日常取舍） | 所有写入一律要求；只对声明了的动作要求 | 只对声明了的动作要求 | 以前只有 Goals 别名的写入（`session_actor`）按 Session 记作者、缺 Session 就拒绝；别名删掉后这条语义搬到动作定义上：`authorship: "session"`，Goals 的写入都声明，宿主在 MCP 入口按声明拒绝，不按能力名分支。一律要求会让没有会话元数据的外部客户端写不了插件（多组现有用例就是这种客户端）。Runtime 有 Session 时每次调用都带上（按作者查的回执能找到自己的写入）；从已连接项目调用全局动作仍在该项目上下文里（判断记录问自哪个项目）；Runtime 自报 `source_kind: runtime` 不算冒充，其他渠道拒绝 |
| 2026-10-05 | 凭据两处记（弹窗） | 统一到连接表（推荐）；收编留作现行机制；这轮不动 | 统一到连接表 | 各设置直接建连接、只读连接；删每次打开连接页的「收编」、Gmail 单账号默认安装、旧引用镜像和 `legacy` 来源；真实 Home 5 条原有连接改记正式连接，钥匙串里的密钥不读不动；旧 Gmail 连接与「Gmail 兼容入口」来源连同旧令牌删除（已有 yijunw0212 的正式连接） |
| 2026-10-05 | 会话两处记（弹窗） | 会话表为唯一来源（推荐）；保留同步只改名；这轮不动 | 会话表为唯一来源 | 终端面板与 Runtime 绑定直接写会话表；删读取时的迁移、迁移回执表与 `legacy_migrated`；真实 Home 54 条按出处改记：来自绑定的 `explicitly_linked`，来自面板的 `molis_work_created` |
| 2026-10-05 | 结构提案里的旧类型条目（弹窗） | 只留当前两类条目（推荐）；含旧条目的提案整份删；只清待决其余留读 | 只留当前两类条目 | 真实 Home 约 1,500 条 dependency/contract/risk/candidate/rewire/policy 与 goal 更新条目及其决定删除；71 份纯旧提案（含 13 份已无法决定的待决）整份删；103 份混合提案只留 goal/relation 条目与对它们的决定；库表只允许 goal/relation，显示与检查里的「历史结构条目」分支删除；已落地的 Goal 与关系不动 |
| 2026-10-05 | 风险记录（弹窗） | 连表带显示一起删（推荐）；保留为只读历史 | 连表带显示一起删 | 插入函数无调用方、只经已退役的提案条目产生；风险表、Goal 风险关联、「风险」页签与决定里的风险卡片删除，真实 Home 46 条删除；Goal 页因素只留关系与规则 |
| 2026-10-05 | 合同修订（弹窗） | 删掉合同修订（推荐）；只删 r2 以上 | 删掉合同修订 | 不再存创建时的 r1 快照与修订号，Goal 原文就在 Goal 本身；Coding 只显示工作约定版本；真实 Home 477 条与修订号删除 |
| 2026-10-05 | 提案基线的旧版本格式与 policy 对象（日常取舍） | 保留旧比对；只按 semantic-v1 | 只按 semantic-v1 | 旧格式只出现在已落地、已被取代和 8 条本就冲突的条目上，删掉后不改变任何可决定的结果；policy 与 risk 对象随旧条目一起退出 |
| 2026-10-05 | 关系条目里一条带多条关系的旧形状（日常取舍） | 拆成单条；保留读取并列入例外 | 保留读取并列入例外 | 真实 Home 63 条（多为已落地，1 条待决、1 条冲突，单条最多 61 条关系）；拆开要改条目编号和引用它们的决定记录。新提交只收单条关系；`rewire`/`proposal` 嵌套无数据，删除 |
| 2026-10-05 | Casebook 导出合同里的「合同修订号」（日常取舍） | 改外部合同删字段；保留字段恒为 1 | 保留字段恒为 1 | Casebook 是给外部工具的版本化合同（goal-context 2.0.0 要求 ≥1 的整数）；Goal 的说明不再修订，恒报第一次修订，不改外部合同版本 |
| 2026-10-05 | Coding 的目标版本显示（日常取舍） | — | 只显示工作约定版本 | 删「目标合同修订 rN」与「工作约定版本未记录」；真实 Home 没有存下的 Coding 目标快照（过程项 0 条） |
| 2026-10-05 | 凭据统一第一刀的拆法（日常取舍） | 一个 PR 全做；先做模型/图片/TypeSafe，再做 Host 连接器与 Gmail/Notion | 分两刀 | 模型、图片、TypeSafe 的设置早已走连接，旧位置只剩回退和认领，自成一题；Host 连接器的固定槽位、Feed 内联绑定、GitHub 设备流、Gmail/Notion 旧槽涉及 Feed 来源与 OAuth，另成一刀。`legacy` 来源与 `adoptLegacy` 在第二刀最后删 |
| 2026-10-05 | 模型供应商的密钥归属（日常取舍） | 供应商自带密钥位；密钥属于连接 | 属于连接 | 供应商只记连接的引用：新建必须带一条 model-api 连接的引用，删供应商不删密钥（连接留在 Connectors），去掉 `setCredential`/`selectConnection`/`modelCredentialRef` 与构造时补表；表单先校验再建连接，被拒的表单不留连接 |
| 2026-10-05 | 模型密钥可用的条件（日常取舍） | 无连接行的旧密钥也算可用；必须是钉了地址的 model-api 连接 | 必须钉地址 | 删「旧前缀无连接也可用」「legacy 行不钉地址也可用」两条回退；真实 Home 的 Minimax 连接由维护按供应商地址补钉 |
| 2026-10-05 | 图片服务的密钥（日常取舍） | 插件自存 `images:<id>`；只用所选连接 | 只用所选连接 | 插件不再收 `api_key`、不再有密钥端口；没选连接时只有本机地址能生成 |
| 2026-10-05 | TypeSafe 密钥（日常取舍） | 固定槽位回退；只读按用途绑定的连接 | 只读绑定的连接 | Functions 模块改收「凭据解析」端口，删存/清密钥方法；实验必须有 Home，删 `"legacy"` 配置标记；连接断开或缺失算没有密钥，钥匙串锁住照实报错（以前被吞成「没配」）；真实 Home 由维护把 functions/experiments/plugin-builder 三个用途绑到原 TypeSafe 连接 |
| 2026-10-05 | Feed 固定来源（弹窗，更正上次「Gmail 兼容入口」的说明） | 不再自动建、按内容收拾（推荐）；全部保留；改按连接自动建；Gmail 照原决定全删 | 不再自动建、按内容收拾 | 每个项目不再自动补 GitHub/Gmail/Notion/飞书来源，来源只能选一条连接来加；真实 Home 64 个固定来源：有内容的 GitHub 来源挂到 GitHub 连接，2 个有内容的 Gmail 来源保留历史、标为断开（以后切到 yijunw0212 的连接会新建来源），58 个空占位删掉；旧 Gmail 连接与令牌照原决定删除 |
| 2026-10-05 | 环境变量里的连接器令牌（日常取舍） | 保留为「外部」连接；只认连接表 | 只认连接表 | `GITHUB_TOKEN`/`GMAIL_ACCESS_TOKEN`/`<ID>_TOKEN`/`NOTION_TOKEN`/`GMAIL_AUTH_REF` 回退和打开连接页时的环境变量收编一起删；要用令牌就建一条连接。「外部」连接只剩官方 CLI（飞书），id 改为 `external-<hash>`；飞书 CLI 的固定模式槽位删除 |
| 2026-10-05 | 连接账号动作的输入（日常取舍） | 仍按服务 id；改按连接 id | 按连接 id | `connectors.account.read` 读一条连接的账号，经同一个 `resolveApiConnection`，不会换成另一个账号；设置页没有调用方的 whoami/固定令牌路由、飞书 `cli/use`、非托管 OAuth 分支一并删除 |
| 2026-10-05 | Gmail 旧多账号模型（日常取舍） | 留安装表；删 | 删 | Feed 自带的按邮箱「安装」、单账号默认安装、旧引用镜像、单槽待授权都删；Gmail/Notion 令牌只存在连接的引用下。游标里旧版占位 `live` 与无版本游标不再兼容：空游标算首次同步，其他版本拒绝、由来源重建 |
| 2026-10-05 | 连接库与协议库的补表（日常取舍） | 构造时 `CREATE IF NOT EXISTS`；只由基线建 | 只由基线建 | 两个 store 不再就地建表；用内存库的测试自己执行 schema |
| 2026-10-05 | 验收标准判断方式与拆分复审的旧措辞（弹窗） | 按意思归入四种（推荐）；归为检查并保留原词；保留照原样读、列为例外 | 按意思归入四种 | 真实 Home 1,487 条里 797 条不在四种内：test/automated_test/simulation→自动检查；scenario/playtest/review/evidence_review/interaction/test_and_inspection/graph→检查；human_review/human_visual_review→人工决定；复审 closed_leaf→complete；之后读取也只认规定值 |
| 2026-10-05 | 规则里领取时代的字段（弹窗） | 删掉只留需要用户验收（推荐）；设置页标注不生效；这轮不动 | 删掉只留需要用户验收 | 目标模式、所需能力、自检、交叉/对抗评审人数、租约秒数没有流程读取；存储、动作、设置页只剩「需要用户验收」；真实 Home 5 条规则去掉其他字段，历史保留 |
| 2026-10-05 | Goal 定义字段算不算兼容（弹窗） | 算现行定义保留（推荐）；改由事件约定承载 | 算现行定义保留 | 范围内外、约束、所需输入、承诺输出、验收标准、拆分复审与四个状态仍由创建 Goal、Goal 树、看板、交接包和 Coding 上下文写入和显示，记为保留的现行机制 |
| 2026-10-05 | 自检、交叉评审、对抗评审的去处（用户补充 + 弹窗） | 先写 spec、防腐收尾后实现（推荐）；放进这次目标一起做；先把设置搬到 Coding 设置页 | 先写 spec、收尾后实现 | 用户指出这些属于 Coding 的质量保证、Coding 可关联 Goal。本轮从 Goal 规则删除（不搬不生效的设置），另写 specs/coding-quality-assurance/spec.md，防腐目标完成后作为独立任务实现 |
| 2026-10-05 | 风险的去处（用户补充） | — | 另做专门记录风险的插件 | 风险已随 Goals 存储删除（#272）；用户要一个专门记录风险的插件，另写 specs/risk-plugin/spec.md，不在 Goal 里恢复风险表 |
| 2026-10-05 | 判断场景绑定的两套模型（日常取舍） | 留函数键绑定作回退；只留通用能力引用 | 只留通用能力引用 | Functions 库第 2 版的 function_scene_bindings 每个场景、每个项目一行，只存能力引用（含提供方）与修订号；删 `bindScene`/`unbindScene`/`sceneBinding`/`listSceneBindings`、按函数键补 `system.functions` 提供方、首页旧选项别名迁移、Inbox/首页从旧行拼绑定、Functions「使用位置」里的旧绑定。真实 Home 该表 0 行，首页场景映射已是现行键 |
| 2026-10-05 | Feed 捕捉规则的函数键（日常取舍） | 留 `function_key` 作显示与兼容输入；只存判断引用 | 只存判断引用 | 项目库第 5 版删 `feed_out_rules.function_key`，没判断的规则 judgment_json 为 NULL、revision 必填；删每次打开时的旧绑定迁移、`legacyReference`、「兼容函数键」输入与「原判断规则不可用」显示；自然语言规则发布后直接存引用。判断历史仍按 Functions 规则键（其他提供方按能力 id）归档，由 `publishedFunctionKey` 从引用推出。真实 Home 只有 1 条无判断的关键词规则 |
| 2026-10-05 | 静态场景匹配助手（日常取舍） | 保留；删 | 删 | `functionFitsScene`/`resolvedSceneBehaviors`/`sceneBehaviorIds` 只被删掉的 `bindScene` 用；兼容性由场景目录按真实合同判断。删它们的单测与「旧 Inbox 编写仍识别」用例，`agent.mcp` 规则改测为纯判断输出 |
| 2026-10-05 | Inbox/首页按函数键读写的入口（日常取舍） | 一并改成只收引用；保留 | 保留 | `inbox.judgment.write`、首页判断设置是现行的「选一条已发布规则」入口，不是旧数据兼容；只是不再写旧列 |
| 2026-10-05 | 宿主声明的工作入口（日常取舍） | 删 `MOLIS_WORK_WORK_CONTEXT_ID`；只改名 | 只改名 | 桌面面板、集成检查现在仍用它给 Session 定稳定 id，不是旧数据兼容；`legacyWorkContextId` 改名 `hostWorkContextId`，信号里没人读的 `legacy_work_context_id` 删除 |
| 2026-10-05 | 没人调用的兼容面（日常取舍） | — | 删 | Attention 的迁移入口（`importLegacy` 等）、助理页上下文里已忽略的 `starters`、Schedule 的 `clock` 别名、Git 暂存准备里剥掉 `side` 的适配、Session 历史里没人写的 `work.legacy_end_unknown`、Manifest 里没人读的 `behaviors`/`function_scenes`/`judgment_subjects`（Feed/Inbox 的声明一并删，Plugin SDK 不再导出）|
| 2026-10-05 | Pages Callout 的旧色调名（日常取舍） | 保留折算；模板与编辑器改写调色板色 | 改写调色板色 | info/warn/success/plain 不再折算；模板、新建与解析默认都写 cyan/orange/green/gray。真实 Home 的 Pages 里没有 Callout |
| 2026-10-05 | `board_id` 与 `project_id`（弹窗） | 现在分片统一（推荐）；保留并列入例外；另立目标 | 现在分片统一 | 当前栈合入后按层分片（存储→合同→模块→插件→宿主与界面），每片一个 PR、挑合并空档；维护把 V1 演示项目（`goalboard-v1-demo`）的行改到它的项目 id；Feed 的旧形状投影随之删除 |
| 2026-10-05 | 插件工作室旧零件类型（弹窗） | 维护里改写（推荐）；删旧发布；保留别名 | 维护里改写 | 真实 Home 项目 bf397931 的 5 个发布（及其构建、设计）里的 heading/text/list/reader 等在维护时改成目录零件类型，代码删掉别名表 |
| 2026-10-05 | Form 两条没有题目快照的试用答卷（弹窗） | 删两条并去掉特殊显示（推荐）；保留；用现题补快照 | 删两条并去掉特殊显示 | 2026-09-20「试用问卷」的两条答卷在维护时删除（先备份），结果页的「历史答卷」分支与 `form_version`/`questions_json` 可空的读取一并去掉 |
| 2026-10-05 | 插件工作室目录之前的能力（任务书 §4.7「本轮不为现有的生成插件和已安装插件保留兼容」） | — | 删 | 工作室自己的旧能力清单（`goals.*`、`reminders.*`、`schedules.*` 的旧形状）、按它派发的宿主层、能力看板里的旧条目、`model.generate` 写在代码里的 `instructions` 都删；生成插件只走统一目录，模型只认声明的 prompt；发布版本必带 prompts。真实 Home 13 个发布都早于目录或 prompt，其中 5 个调用模型或旧目标能力的会失败（a9ee73b6、82933d7e、e49738d3、4807c988、1ed82264），需要在创作台重新生成；维护给存量发布补 `prompts: []` |
| 2026-10-05 | 防回流门禁的口径（日常取舍） | 只数总数；按文件计数只许减少 | 按文件计数 | `pnpm health:check` 数源码里的 `legacy`、`compat`、`@deprecated`、`backfill`（大小写按词形），每个文件只许减少、新文件从零开始；场景里普通的 compatible 不算，`compatibleRun` 这类标识算。main 7ac6fc4a 上 245 处、82 个文件 |
| 2026-10-05 | board_id 统一的切法（日常取舍，接 10-05 弹窗；做的过程中改过一次） | 按层四片；存储列单独一片；一次改完 | 一次改完（列、合同字段、变量名、目录库） | 先试了只改存储列（B1）：全量回归里 `SELECT *` 读出的行直接当记录用的地方都断了（行是 project_id、记录还叫 board_id），要么到处加临时映射、要么一次改完。选一次改完：一个 PR，挑合并空档，冲突由我解；Functions 库两张表一起改（v3），项目库 v6，目录库去掉 projects.board_id |
| 2026-10-05 | 门禁上线后剩下的 92 处兼容标记（日常取舍） | 逐条判断：删兼容、改名现行机制、保留并记录 | 按条处理 | 删：助理工作的会话补记（真实 Home 没有助理工作）、灵光不带项目的目录级路由（客户端只用项目内地址）、未绑定的插件事件游标分支（真实 Home 56 个游标都有安装与世代）、起草文字的内联 instructions、旧解释型创作台的领域代码（model/formula/设计解析）、命令回执引用可缺 run_id。改名：目录库错误码、Attention/Feed 的日志镜像、IM 房间目录、根包导入规则与若干注释。保留：插件升级声明机制、Casebook 对外覆盖字段、pdfjs 的 legacy 构建路径、产品文案。Feed 的旧形状投影与单项目服务模式随 `board_id` 统一（B2–B4）处理 |
| 2026-10-06 | 两个 id 同时出现的地方（日常取舍，board_id 一次改完的过程） | 留一个参数/字段；保留两个同值字段 | 留一个 | 改名后同一记录、同一函数里的 `project_id` 与原 `board_id` 合成一个：所有新建项目两者本来同值；函数的两个参数（如 `createLocalFeedScene(home, projectId, boardId, …)`）合成一个，调用处跟着少一个实参；`molisWorkHostProjectReference` 只收 `projectId` |
| 2026-10-06 | 示例项目的 id（日常取舍） | 示例项目随机 id，库按项目 id 播种；固定 id `molis-work-v1-demo` | 新建的示例项目用固定 id，播种按传入的项目 id | 一个 Home 只有一个示例项目，固定 id 与原来固定的 board id 同值；播种函数收项目 id，所以真实 Home 里已有的示例项目（466d6844，维护后 board 即项目 id）重建时仍写在它自己的 id 下 |
| 2026-10-06 | 索引名与命令行参数（日常取舍） | 只改列；连索引名、CLI 参数一起改 | 一起改 | 项目库 v6 里 `*_board_*_idx` 改成 `*_project_*_idx`（同一个版本，不另升）；CLI 的 `--board-id` 改为 `--project-id`；`boards` 表名保留（它是 Goals 的根记录，不是第二个身份） |
| 2026-10-06 | 存量 JSON 里的 `board_id` 键（日常取舍） | 不动；平台自己的记录改键；全部文本替换 | 平台自己的记录改键 | 真实 Home 只读扫描：幂等结果回放 `idempotency_records.outcome_json` 5,496 处、提案里的目标快照 17 处、目录库事件 20 处都是键，维护时递归改成 `project_id`（同对象已有时核对相等后去掉）；生成插件的代码与私有数据（发布产物 94 处、工作室记录）是插件自己的，不改；目标正文里人写的文字不改 |
| 2026-10-06 | Feed 的模块记录到插件记录的投影（日常取舍） | 随 board_id 一起删；另开一片 | 另开一片 | 改名后它们只剩形状差异（`connector_receipt`→`receipt`、补 `item_type`），删掉要连 Feed 界面一起改，单独一个 PR |
| 2026-10-07 | 真实 Home 维护三的时间（弹窗） | 改名 PR 合入后立刻做（推荐）；等通知 | 合入后立刻做 | 用合入后 main 的基线在拷贝上再演一遍，先整份备份真实 Home，再应用并逐库核对；做完前不启动 4207/4208/4173 |
| 2026-10-07 | `feed/secrets.json` 里旧 Gmail 固定槽位的条目（弹窗） | 删掉（推荐）；保留 | 删掉 | 只按键名删除、不读值；原文件先原样备份到 Home 内的维护备份目录（权限 600） |
| 2026-10-07 | 维护后真实 Home 用哪份代码（弹窗） | 只更新主检出并构建（推荐）；另外重装安装版；都不动 | 只更新主检出并构建 | 主检出 fast-forward 到新 main 并 `pnpm build`，未跟踪的 docs/reviews 两个文件与 plugins/native/jelly/native/ 不动；9 月 23 日的安装版 molis-work-0.2.0 不重装（LaunchAgent 自 10-01 未加载） |
| 2026-10-07 | 两套能力机制收敛（N-12，弹窗） | 对外的只走动作（推荐）；全部改动作；保持现状加门禁 | 对外的只走动作 | 删 Goals 无生产调用方的 typed 桥、工作区读只留一个 id、Casebook 改同 id 的插件受众动作；typed 注册表只留作 Runtime 插件的宿主内服务通道（agent.*、schedule 等），门禁不许再加 |
| 2026-10-07 | 记忆、放置与情境启发式的层次（N-03，弹窗） | 归 Module（推荐）；架构里加一类「平台产品服务」；只拆记忆 | 加一类「平台产品服务」 | `docs/system/ARCHITECTURE.md` 增加「平台产品服务」：记忆、放置、搜索、情境排序可以有跨插件的策略，但不持有业务事实；代码不搬，W4-08 改为文档与边界规则 |
| 2026-10-07 | MCP 连接工具的 actor_id（弹窗） | 从可信会话取并删参数（推荐）；留作审计标签但必须相等；登记为例外 | 从可信会话取并删参数 | 5 个工具（绑定、解绑、拒绝建议、新建并绑定、删项目）的身份取自 MCP 客户端与 Runtime 会话，schema 去掉 actor_id，goal-advance Skill 与 docs/mcp.md 同步改；合同变化 |
| 2026-10-07 | SSOT 与 CODEOWNERS 的负责人（弹窗） | 角色加账号、评审请求不强制（推荐）；只写角色；按团队 | 角色加账号、评审请求不强制 | SSOT 每行写角色与账号：@yijunw0212 负责全部，@jingxusandra-gif 同时负责 Coding、Agent Host、Jelly、Shelf、Diff；CODEOWNERS 只自动请求评审，不改分支保护 |
| 2026-10-07 | 产品定位的表述（用户更正） | — | 插件基座＋多插件的工作平台 | 「Goals 是权威真相源」「Molis Work 是 Goal 的权威真相源」是 V1 的 Goal 承诺；现在项目按插件组织，Goals 是拥有 Goal 的一个插件，每项事实一个主人（SSOT）。上一轮逻辑复查顺着这句只查了 Goal 的完成规则与管理门，本轮按平台与各主人补查（§11），文档按插件平台改写 |
| 2026-10-07 | 删除项目时别的主人存在 Home 里的该项目数据（弹窗） | 各主人一起删、可重试（推荐）；Todo 移到个人、其余删；不删只藏 | 各主人一起删、可重试 | 每个按项目分区的 Home 库主人加「项目已删」钩子，删项目提交后逐个清掉该项目的数据（内容、答卷、绑定、记忆、助理工作、工作室与密钥、搜索索引），每步记在删除收据里、失败可重试；删前确认框列出会一起删的插件数据 |
| 2026-10-07 | 助理的记忆工具（弹窗） | 核对原话、忘掉可撤销（推荐）；两个都要确认；保持现状 | 核对原话、忘掉可撤销 | 子任务不提供记住/忘掉；「你说过」要在宿主保存的本人原话里对得上才按「亲口」记；「忘掉」改为可撤销的停用、记成助理做的，彻底删除留给本人在设置里做 |
| 2026-10-07 | 插件平台范围（§4.6，弹窗） | Home 级 Runtime、数据不动（推荐）；每项目一份、数据进 Runtime；个人插件留构建期 | Home 级 Runtime、数据不动 | 个人插件装在一个 Home 级 Runtime 实例，按项目启用照旧；数据留在 `{home}/<id>/<id>.db` 由平台库服务打开；Goals、Artifacts、Sessions、插件创作台列为批准的构建期例外，其余 15 个逐族迁移；界面不变 |
| 2026-10-07 | 第一个迁到 Runtime 的样板（弹窗） | Form 先、Todo 第二（推荐）；Todo 先；两个同时 | Form 先、Todo 第二 | Form 同时作浏览器代码打包与类型检查的样板 |
| 2026-10-07 | 旧版 MCP 授权文件（v1）读成空（日常取舍） | 写一次迁移；按「不留兼容」拒绝并给出说明 | 不写迁移 | 用户定过「当做没有旧版数据」；真实 Home 的 `config/mcp-tools.json` 已由维护三写成 v2。逻辑复查 #8 记为不修 |
| 2026-10-07 | 个人范围成果版本的归属（逻辑复查 #16–#18，弹窗） | 一个 Home 里都归本人（推荐）；按调用方分开；保持现状 | 都归本人 | 个人版本的 owner 一律是 Home 的主人，产生它的工作流/Agent/MCP 记在 `created_by` 作来源；`registerVersion` 加单独的 owner，固定与导入传本人；去掉 `subject.read`、SDK 读、固定读的 owner 校验 |
| 2026-10-07 | 已停用的生成插件有新版本时（逻辑复查 #1，弹窗） | 可以切版本、仍保持停用（推荐）；停用时不让升级；拒绝但按钮照常显示 | 可以切版本、仍保持停用 | 升级/回滚只换版本，安装继续停用，宿主重启后也不启动 |
| 2026-10-07 | Feed「删掉本地历史」后缓存的文章正文（逻辑复查 #57，弹窗） | 真删：引用计数后清掉（推荐）；保留正文并说清楚；不动 | 真删 | 存储加删除/回收接口，统计 feed 材料与另一存储的引用，没人引用的正文与记录一起删 |
| 2026-10-07 | 卸载时保留了私有数据、重装的版本不能从旧版本升级（逻辑复查 #3/#60，弹窗） | 重装时让人选：丢弃旧数据或取消（推荐）；加异步重装迁移；保持拒绝 | 让人选 | 重装弹窗说明旧数据用不上，确认后删掉保留的私有数据再全新安装；不确认就不装 |
| 2026-10-07 | 依赖别的动作的能力是否开放给生成插件（逻辑复查 #12，日常取舍） | 暂不开放；把依赖连同权限一起授予 | 暂不开放 | 把依赖一并授予会扩大安装同意的范围；现在列为「依赖其他能力，插件一次只能调用一项，暂不开放」，需要时另起一项 |
| 2026-10-08 | Prologue SDK 收敛与私有包（§4.17，弹窗） | 推上游分支、私有包不再随仓库发（推荐）；只补来源记录；等 Prologue 负责人定 | 推上游分支、私有包不再随仓库发 | 源分支 feat/molis-side-panel-surfaces-on-memory 推到 Prologue 远端特性分支，按一个合成流程与负责人收敛到上游基线；删掉重建用不着的 25 个历史补丁并记 sha256 与来源；prologue-sdk、adeptify intelligence-client、search-evidence-layer 的 tgz 改从私有 registry 或 release 附件取，不再放进公开仓库（CI 需配私有源凭据） |
| 2026-10-08 | 评审截图与根目录材料（§4.12，弹窗） | 只留被引用的、商业材料移出仓库（推荐）；截图全部移出；都留只加门禁 | 只留被引用的、商业材料移出 | 只留现行 spec、文档或测试引用的评审组与设计参考，其余从树里删（不改历史）并加只许减少的门禁；介绍页移到 docs/product-intro/archive；outputs/ 与 .zcode/ 移出仓库并加进 .gitignore。注意：不改历史，旧提交里仍可见 |
| 2026-10-08 | 版本与发布策略（§4.12，弹窗） | 一个产品版本、下一版 0.3.0（推荐）；各包 semver；只写现状 | 一个产品版本、下一版 0.3.0 | 根包、桌面端、Tauri 跟同一版本，内置插件 Manifest 跟宿主版本；工作区包保持私有 0.0.0；每次发布有说明、CHANGELOG 与带各库版本表的检查单 |
| 2026-10-08 | 术语表收敛范围（§4.15，弹窗） | 文档一个定义、内部名跟着改、界面用词另列审批（推荐）；只改文档；代码和界面一次合并 | 文档一个定义、内部名跟着改、界面用词另列审批 | 用户看得见的用词变化先列清单经用户批准再发 |
| 2026-10-08 | 「不留兼容」何时结束、读兼容的合同流程何时开始（#15，弹窗） | 第一个装到开发机外的版本（推荐）；有外部使用者的合同现在就开始；每个合同各自决定 | 第一个装到开发机外的版本 | 1.0 或第一个外部用户装上的版本开始，日期写进 `docs/system/CONTRACT-CHANGES.md`；之前照旧「不留兼容」 |
| 2026-10-08 | 宿主设置里的写入只走 HTTP（#7，弹窗） | 留作管理接口并登记例外（推荐）；改成只给用户的动作；改成助理和 MCP 也能调的动作 | 留作管理接口并登记例外 | 每条写进 CALL-CHAINS 例外表并附删除条件；只把删除项目与 MCP 的删除统一；连接器路由以后搬进各自的官方接入插件 |
| 2026-10-08 | CI 产品子集是否挡合并（#14，弹窗） | 先不挡、两周后并入（推荐）；马上挡；单独设成必过检查 | 先不挡、两周后并入 | 单独作业跑约两周、隔离不稳定用例后加进 Verify；不改分支保护 |
| 2026-10-08 | 界面翻译（#16，弹窗） | 中文作键、按主人分词典、CI 查（推荐）；全部换成稳定键；维持现状只查缺键 | 全部换成稳定键 | 用户没选推荐。约 164 个源文件改用稳定键，词典按主人分，CI 查缺失、无用与冲突；第 5 波「翻译按主人分」改成「稳定键」并先做一个插件样板 |
| 2026-10-08 | 删旧皮肤时的视觉验收与页面体积上限（#17，弹窗） | 自动比对像素、超阈值给用户看（推荐）；每组截图都看、现在定上限；接受变化最后走查 | 自动比对像素、超阈值给用户看 | 关键界面 3 种宽度×亮暗两种主题；体积先冻结只许变小，旧皮肤删完再定真实上限 |
| 2026-10-08 | 调用编号是否上界面（#5，弹窗） | 错误详情里显示短编号可复制（推荐）；只在诊断页；不上界面 | 错误详情里显示短编号可复制 | 「设置 › 诊断」按编号列出最近的调用 |
| 2026-10-08 | 右栏「讨论」页签与 IM 代码（#4，弹窗；两次说明后用户答「后面还要迭代的」） | 保留可见但冻结（推荐）；藏到实验开关后；从 main 删掉 | 保留并继续迭代，不冻结 | 这是在用、还会迭代的产品功能，不是待删的实验。只修三处账目：`server/server.sqlite` 登记进 Home 数据与备份表；宿主不再直接读它的表（`apps/local-host/src/im-server.ts`）；包的归类改成业务（不是基础包）。`apps/server` 独立启动器的去留随功能迭代另定 |
| 2026-10-08 | 系统助理怎么拆、放哪（#3，弹窗） | 先就地拆、再搬成独立包（推荐）；拆和搬一起做；只登记例外 | 先就地拆、再搬成独立包 | — |
| 2026-10-08 | 备份范围与「卸载并清除数据」（#20，弹窗） | 离线快照命令、清除覆盖所有登记的库（推荐）；只写计划；连定时在线备份一起做 | 离线快照命令、清除覆盖所有登记的库 | 统一库登记表；经常驻宿主暂停后拍一致快照（带清单与版本核对）；定时在线备份留给 C 端计划 |
| 2026-10-08 | 真实 Home 的残留物（#21，弹窗） | 核对后清理、路径改推导（推荐）；只搬走备份和孤儿文件；不动 | 核对后清理、路径改推导 | 保留 10-07 维护前整份备份与 runtime-configs；维护替换下来的旧文件搬到 `~/molis-work-backups`；其余旧备份、孤儿文件、空库、旧 goalboard-* 安装版核对后删；目录库 v22 用 Home+项目 id 推导路径；实验库在拷贝上演练后标 v1；动手前先整份备份 |
| 2026-10-08 | 工作树、分支与仓库设置（#24，弹窗） | 我清本地、用户清远端并开自动删除（推荐）；只清本地；都不动 | 我清本地、用户清远端并开自动删除 | 本会话删已合并且干净的工作树与本地分支，wip 与整合分支逐个对比后再删；147 个已合并远端分支与「合并后自动删除分支」由用户做；救援分支与 Codex d62d 不动 |
| 2026-10-08 | 问卷已停止收集或还是草稿时的非本人提交（逻辑复查 #46 附带，弹窗） | 一律拒绝、只留本人预览试填（推荐）；照旧接收；草稿拒绝、已停止的接收 | 一律拒绝、只留本人预览试填 | Agent、MCP、工作流、插件来源的提交在非「收集中」时拒绝 |
| 2026-10-08 | Runtime 与安装插件声明的 methods（#18，弹窗） | 和内置插件一样注册（推荐）；非内置不许声明；维持现状写进文档 | 和内置插件一样注册 | 启动时注册，停用、卸载、升级时收回 |
| 2026-10-08 | 没有真正使用者的接口（#19，弹窗） | 删按需搜索、记忆只给 MCP（推荐）；都留补文档测试；都删 | 删按需搜索、记忆只给 MCP | 删 `defineSearchQueryAction` 按需搜索来源；记忆的 MCP 受众保留并补授权测试；插件受众标「未启用」 |
| 2026-10-08 | 第三方插件的安装与信任（#11，弹窗，只写计划） | 本地装、首次确认、沙箱里跑（推荐）；只认官方签名；这一步不做 | 本地装、首次确认、沙箱里跑 | `molis-work plugin install <bundle>`；首次安装确认并记住发布者密钥；独立进程沙箱运行 |
| 2026-10-08 | Characters 的代码身份（#26，弹窗） | 继续是插件、声明只在设置里（推荐）；并进宿主变成设置的一节；只改文档 | 并进宿主，变成设置的一节 | 用户没选推荐。Characters 不再是 Runtime 插件：代码并进宿主或一个 Module，界面仍是设置里的一节；安装记录与 Runtime 条目一起删（第 4 波切片） |
| 2026-10-08 | Casebook 的 5 个 typed 能力（#8） | — | 已由 10-07 N-12 决定覆盖 | 改成同 id 的插件受众动作，与外部 Casebook 插件一起发版 |

**待决（开工后攒批弹窗问）**：

1. ~~真实 Home 的处理~~：已定，见上表（同事没有要保留的 Home）。已知：`~/.molis-work`，主检出上的 4207 与常驻服务 4173（LaunchAgent `com.adeptify.goalboard.web`，安装版 0.2.0）都用它；`~/.goalboard` 是指向它的符号链接，不是另一个 Home；4208 开工核对时没有在监听。
2. ~~插件升级声明的机制~~：已定，见上表。
3. ~~共享核心的评审方式~~：已定，见上表。
4. ~~vendored 私有包~~：已定，见上表。
5. ~~他人的工作树与分支~~：已定，见上表；保留 Codex 工作树 d62d（1,173 个未提交文件）、side-shelf（未审阅的 spec 草稿）、anti-rot（本目标的任务书）、plugin-picker-pins（在做）。
6. ~~Casebook 外部合同的旧名~~：已定（10-04，见上表）。原记录：`apps/local-host/src/casebook/` 里的 `contract_id` 都是 `goalboard.casebook.*`，JSON Schema 的 `$id` 在 `goalboard.dev` 下。外部 Casebook 插件按这些 id 对接，改名是合同变化，要外部插件同步（§4.1「旧身份与旧名称」）。源码里其余的 `GoalBoard`（如 `project-capabilities.ts` 的 `checkGoalBoard`）只是内部命名，随 `board_id` 合并一起改。

## 2. 现状度量（§3）

开工时的数字（2026-10-02，main fccb2a30）。口径：源码是 git 跟踪的 `.ts/.mts`，排除 `tests/`、`specs/`、`docs/`、`dist/` 与 `.d.ts`；类和函数用 TypeScript 语法树量起止行。模板字符串里的浏览器脚本不按函数计，只算在文件行数里。

### 2.1 改动成本

- 09-28 起合入 main 的 PR：71 个。每个 PR 改动的文件数：中位数 6，p90 98，最大 615；改动的包数（`plugins/<区>/<包>` 与其他区的 `<区>/<包>`）：中位数 1，p90 11，最大 37。
- 新增一个内置插件的实际改动面（以 Todo 为例），插件包外有 15 个文件直接接线：
  - 宿主：`todo-actions.ts`、`todo-native-plugin-http.ts`、`project-host.ts`（`registerProvider`）、`web-request.ts`、`web-catalog.ts`、`context-onboarding-service.ts`、`package.json`；
  - 工作台：`builtin-plugins.ts`、`ui-composition.ts`、`i18n/en.ts`、`scripts/client/initialization.ts`、`package.json`；
  - 合同：`contracts/src/modules/todo.ts`；
  - 根：`package.json`、`scripts/workspace-packages.mjs`。

  目标：只改插件自己的包和声明。

### 2.2 冲突热点

自 09-28 起被最多 PR 改过的源码文件（按合入 main 的 70 个合并提交统计）：

| PR 数 | 文件 | 类型 |
| --- | --- | --- |
| 15 | `apps/workbench/src/scripts/client/assistant-island.ts` | 巨大文件 |
| 14 | `horizontal/agent-host/src/adapters/prologue-node.ts` | 巨大文件 |
| 12 | `packages/design-system/src/styles/craft-finish.ts` | 总样式 |
| 12 | `apps/workbench/src/i18n/en.ts` | 总词典 |
| 12 | `apps/local-host/src/web-request.ts` | 路由分发 |
| 11 | `packages/contracts/src/platform/actions.ts` | 公共合同 |
| 11 | `apps/workbench/src/scripts/client/initialization.ts` | 页面初始化 |
| 11 | `apps/workbench/src/immersive-shell.ts` | 外壳 |
| 11 | `apps/local-host/src/assistant/assistant-service.ts` | 巨大文件 |
| 10 | `plugins/native/pages/src/actions.ts`、`contracts/src/services/assistant.ts`、`contracts/src/services/agent-host.ts`、`agent-host/src/adapters/announce-guard.ts` | 合同、插件 |
| 9 | `apps/workbench/src/scripts/client/tab-workspace.ts`、`apps/local-host/src/web-catalog.ts` | 外壳、路由 |
| 8 | `scripts/workspace-packages.mjs`、`plugins/native/pages/src/client.ts`、`apps/workbench/src/page-assets.ts` | 登记、聚合 |

### 2.3 巨大单元

阈值按 §4.5：文件超过 800 行，类超过 300 行或超过 25 个方法，函数超过 150 行。

| 度量 | 编写时（74776928） | 开工时 |
| --- | --- | --- |
| 超过 800 行的源文件 | — | 37 |
| 超过 1000 行的源文件 | 24 | 25 |
| 超过 300 行的类 | 42 | 43 |
| 方法超过 25 个的类 | 25 | 25 |
| 超过 150 行的函数 | — | 99 |
| 超过 300 行的函数 | 22 | 22 |

排在前面的：

- **文件**：`pages/editor-browser.ts` 4,043 行，`workbench/i18n/en.ts` 3,661，`assistant-island.ts` 2,813，`assistant-service.ts` 2,700，`craft-finish.ts` 2,245，`pages/commands.ts` 2,241，`tab-workspace.ts` 2,050。
- **类**：`AssistantService` 2,131 行、121 个方法；`MemoryService` 1,170 行、59 个方法；`ShelfStore` 748 行、35 个方法。
- **函数**：`initializePrologueNodeAdapter` 1,436 行，`codingRouteBindings` 1,365，Pages 编辑器 `mount` 1,024，`startIm` 957。

### 2.4 边界穿透

| 度量 | 编写时 | 开工时 |
| --- | --- | --- |
| 测试直接引用包内部源码（`../<区>/*/src/`） | 942 处 | 959 处，另有 34 处引用 `dist/`；涉及 336 个测试文件 |
| 宿主入口导出 | 136 行，12 个 `export *` | 不变（`apps/local-host/src/index.ts` 222 行） |
| contracts 导出的运行时函数、类与常量 | 157 | 503（口径更宽：含 Schema 常量） |
| 只有占位描述的 contracts subpath | 6 | 6，见 §3 R-11 |
| 跨层依赖 | — | `boundary:check` 通过，兼容白名单 0 条；它守的是声明过的规则。按 `docs/system/PACKAGE-BOUNDARIES.md` 的层次重新数「向上」与「同层插件互引」，在分层一片里做 |

## 3. 体检报告附录 A 复核

| 编号 | 当时 | 开工时 | 初判 |
| --- | --- | --- | --- |
| R-01 | 7 个经 Runtime，19 个构建期组合 | 冻结名单 19 个（含 todo）；`project-host.ts` 26 处 `registerProvider` | 仍然成立 |
| R-02 | legacyMcp、LEGACY_* 没有退役条件 | `mcp-native-plugins.ts` 的 `legacyMcp`；`LEGACY_FUNCTIONS_MCP`、`LEGACY_GOALS_MCP` 仍在 catalog、server、event-identity 中使用。仓外消费者：Claude Code 里配置的 goalboard MCP（`molis_work_v1_*`） | 仍然成立；按授权直接删除，同步 Skill 与接入说明 |
| R-03 | 349 文件，3.7 万行 | 367 文件，42,714 行；18 个 `*-native-plugin-http.ts`，34 个 `*-actions.ts` | 仍然成立，还在增长 |
| R-04 | 旧助理 | `personal-assistant-` 只出现在审查 spec 的叙述里 | 已修复 |
| R-05 | README 三份 | `README.md`、`README.zh.md` | 已修复；内容待核 |
| R-07 | 工作台 27 个脚本约 1 万行；插件 18 个 client 约 1 万行；空 catch 126 处 | 工作台 32 个、14,032 行；插件 `client*` 26 个、13,086 行；空 catch 145 处 | 仍然成立，还在增长 |
| R-08 | 105 个 Error 类；escapeHtml 11 份；readBody 5 份 | Error 子类 116 个；escapeHtml 定义 28 处，另有 esc 类 14 处；readBody 6 处 | 仍然成立，还在增长 |
| R-09 | 每个 Home 至少 13 个 SQLite | QA Home 实数 30 个 Molis 自有库（不含侧栏浏览器 profile 的 5 个 Chrome 库） | 仍然成立 |
| R-10 | 184 份 spec | specs 根目录 12 个目录，其中 4 份是其他会话在做的 | 第一步已修；缺门禁 |
| R-11 | 6 个占位 subpath，总数 63 | 总数 66。只有占位描述、仓内没有使用者的 6 个：`modules/actions`、`modules/automation`、`modules/identity-team-access`、`modules/sync-replication`、`platform/exchange`、`platform/observability`。`platform/kernel`、`platform/testing` 各 1 个使用者，待查；`platform/plugin-builder` 有真实类型但没有 subpath 使用者，待查 | 仍然成立 |
| R-12 | `as unknown as` 138 处 | 236 处 | 仍然成立，还在增长 |
| R-14 | `.impeccable/` 约 1,000 个文件 | 1,067 个 | 仍然成立 |
| N-02 | 4 份 tgz | 4 份 | 仍然成立；删除要问用户 |
| N-07 | 二十多个工作树 | 27 个；本会话已清掉自己的 13 个 | 他人的待用户确认 |
| N-12 | 两套能力机制 | `HostCapabilityDefinition` 18 个源码文件；`registerCapability` 10 处；动作服务 `registerProvider` 45 处。`LocalHost.register()`（`apps/local-host/src/local-host.ts:121`）分两路：定义带 `action` 的交给 `ActionService.registerProvider`，与插件能力同一条路；不带的进 `CapabilityRegistry`，经 `LocalHost.invoke()` 调用，自带 `host_only` 可用性、提供方令牌与 `beforeEffect` 校验，是第二条路径 | 仍然成立。收敛方案：不带 `action` 的宿主能力也登记为动作（`host_only` 改成动作的可用性策略），删掉 `CapabilityRegistry` 直调分支，`LocalHost.invoke()` 改走动作服务 |
| N-13 | 没有格式化与静态检查 | 没有 lint/format 配置与脚本 | 仍然成立 |
| N-15 | 兼容逻辑大量存在 | 见 §4 | 仍然成立 |
| N-16 | 测试串行 | `scripts/run-tests.mjs` 仍用 `--test-concurrency=1` | 仍然成立 |
| N-19 | 版本策略缺失 | 73 个子包都是 0.0.0 | 仍然成立 |
| N-20 | 非 TS 不在检查里 | Rust 18、Swift 3、shell 7、Python 1 | 仍然成立 |
| N-03 | 平台记忆、放置落在横向服务 | 按 `docs/system/ARCHITECTURE.md` §3：Horizontal Service「保存 cursor、lease、retry 等技术状态，但不决定业务结果」。`horizontal/memory` 负责写入门与自动写入决策，`horizontal/placement` 记录对象与工作的业务关系，都属于 Module 的职责；`horizontal/search` 是索引技术服务，留在横向。架构文档 §2 还写着 `board_id` 的兼容说明，要随 §4.1 一起改 | 仍然成立；开工后给迁移方案 |
| 新 | 真实 Home 上同时跑着两个 Web | `~/.molis-work` 上有主检出的 4207（开发）与常驻服务 4173（安装版 0.2.0，LaunchAgent），两个版本差很多。`AGENTS.md` 的硬约束是「一个 Home 只有一个执行进程」；Agent 运行锁在两者之间仲裁（storage_busy 时轮流用） | 第二步升级真实 Home 时一并处理：同一 Home 只留一个常驻服务，其他入口转发给它；开发用隔离 Home |

其余条目（皮肤、Goals UI、Server、N-01、N-04～N-06、N-08～N-11、N-14、N-17、N-18、C 组）开工后逐项复核。

## 4. 兼容逻辑清单（§4.1，初稿）

从文件名就能看出是迁移、旧格式或兼容的文件，共 50 个：

- **宿主**：`catalog-migrations.ts`、`feed-migrations.ts`、`project-migrations.ts`、`session-migration.ts`、`pages-legacy-project.ts`；
- **Modules**：
  - `artifacts/migrations.ts`、`evidence-verification/migrations.ts`、`execution/migrations.ts`；
  - goals 的 `migrations.ts`、`event-workflow-migration.ts`、`guidance-migrations.ts`、`revision-migration.ts`、`legacy-coverage.ts`；
  - governance 的 `migrations.ts`、`legacy-proposal-view.ts`；
  - `private-work-context/session-migration.ts`；
- **炼金术士**：10 个 SQL 迁移、`migrate.ts`、`pre-migration-backup.ts`、`legacy-actions.ts`；
- **测试与样本**：13 个；
- **tooling**：`tooling/migrations/` 三个文件，以及兼容白名单 `tooling/boundaries/compatibility-allowlist.json`。

此外：

- `board_id` 出现在 269 个源码文件、335 个测试文件里；建库语句里有 91 处 `board_id TEXT` 列。最多的是宿主 75 个文件、goals 模块 35、Goals 插件 32、contracts 19、Feed 14。按 `docs/system/ARCHITECTURE.md` §2，新项目两者同值，`board_id` 只为旧 V1 库保留。方案：与各库的基线重写同一片做，列与合同字段统一成 `project_id`，合同里的 `board_id` 字段删除，不留别名；
- 源码里提到旧产品名 GoalBoard 的有 10 个文件；
- 0.1.x 根 SDK 出口、MCP 旧名与别名仍在。

源码（排除 tests/specs/docs/dist）里与兼容相关的标识：

| 标识 | 文件数 | 处数 |
| --- | --- | --- |
| `legacy` / `Legacy` | 158 / 101 | 449 / 304 |
| `compat` | 78 | 187 |
| `historical` | 48 | 82 |
| `backfill` | 11 | 15 |
| `v3Import` / `importV3` / `V3_` | 11 | 19 |
| `GoalBoard` / `goalboard` | 1 / 9 | 38 / 21 |

另有：0.1.x 根 SDK 出口 `apps/local-host/sdk/`（index、sdk-store、sdk-types）、`tsconfig.sdk.json`、根包 `exports["."]`。

这些标识里，有些是产品里的「历史」功能，例如时间线、版本、撤销记录，不算兼容。开工时逐项分类：删除，或写明保留理由。

### 4.0 按文件名找到的兼容文件：初判

依据 §4.1「要删除的」逐条对照（main 16879b22）：

| 文件 | 做什么 | 初判 |
| --- | --- | --- |
| 宿主 `catalog-migrations.ts`、`project-migrations.ts`、`feed-migrations.ts`、`session-migration.ts` | 在目录库、项目库上按序跑各 owner 的迁移；项目恢复时校验支持的 Goal schema | 删迁移链；每个库改为一份当前 schema 的建库代码加版本校验，版本不符明确拒绝 |
| 宿主 `pages-legacy-project.ts` | 为 Pages 旧项目读原目录 owner | 随「Pages 旧项目导入」一起删 |
| Modules：`artifacts`、`evidence-verification`、`execution`、`governance-collaboration` 的 `migrations.ts` | 各自的升级链 | 删；执行、证据、治理里只剩历史职责的部分按 §4.1 一并删 |
| Goals：`migrations.ts`、`event-workflow-migration.ts`、`guidance-migrations.ts`、`revision-migration.ts` | 事件工作流、指导、修订回填等升级 | 删，Goals 库只留当前建库语句 |
| Goals `legacy-coverage.ts` | V3 导入带来的覆盖账，注释写明「不是现行账本」 | 随 v3 看板导入一起删 |
| 治理 `legacy-proposal-view.ts` | 旧提案的只读投影 | 删 |
| `private-work-context/session-migration.ts` | 会话库升级 | 删 |
| 炼金术士 `migrations/001`～`010` 十个 SQL、`migrate.ts`、`pre-migration-backup.ts` | 按序迁移与迁移前备份 | 合成一份基线建库 SQL 带版本号；删迁移器与迁移前备份 |
| 炼金术士 `legacy-actions.ts` | 为旧动作保留的入口 | 删，调用方改用现行动作 |
| `tooling/migrations/audit-goal-lifecycle.mjs`、`audit-project-identity.mjs` 等 | 迁移审计脚本 | 删 |
| `tooling/boundaries/compatibility-allowlist.json` | 兼容白名单（现为 0 条） | 删，换成防回流门禁（§4.1「以后的规则」） |

测试与样本里的 13 个（历史 SQL 样本、迁移测试、读取兼容测试、旧名拒绝测试）随代码删除；只留「当前 schema 建库正确」和「拒绝版本不符的库」的测试。

### 4.1 库与就地补表

一个隔离 Home（QA Home，跑过一轮场景）里 Molis 自己的库共 30 个：

- 个人库 16 个：`{name}/{name}.db`，名单在 `packages/storage/src/home-sqlite.ts` 的 `PERSONAL_HOME_SQLITE_STORES`；
- 其他 Home 级库：`projects/catalog.db`、`assistant/assistant.db`、`sessions/sessions.db`、`placement/placement.db`、`agent-definitions/agent-definitions.db`、`characters/characters.sqlite`、`agent-runtime/.molis-runtime-owner.db`、`plugins/experiments/private.sqlite`；
- 每个项目一个 `projects/<id>/molis-work.db`；炼金术士每个项目一个 `alchemist/projects/<id>/studio.sqlite`；
- 锁库：`images` 的运行锁与 runner 库、`feed/secrets.lock.sqlite`。

建库代码里就地补旧表（main 16879b22，源码，不含测试）：

| 写法 | 处数 | 文件数 |
| --- | --- | --- |
| `ALTER TABLE` | 80 | 31 |
| `ensureSqliteColumn()`（缺列就加） | 35 | 7 |
| `PRAGMA table_info`（看列再决定） | 23 | 18 |
| `PRAGMA user_version` | 2 | 1 |

补得最多的文件：

- `modules/functions/src/store.ts` 12 处；
- `modules/goals/src/event-state-schema.ts` 9；
- `plugins/native/form/src/store.ts` 8；
- `modules/governance-collaboration/src/migrations.ts` 8；
- `pages/store.ts`、`goals/migrations.ts`、`execution/migrations.ts` 各 6。

版本记法不统一：`catalog_meta.schema_version`（项目目录）、`search_meta.schema`（搜索索引，不符就重建）、`user_version`（1 处），其余库没有版本，靠看列补列。

**方案**（开工后按库执行）：

1. 每个库只留一份当前 schema 的建库语句，删掉 `ALTER TABLE`、`ensureSqliteColumn` 与看列补列；
2. 统一一个版本记法：建库时写入当前版本；
3. 打开时版本不符就明确拒绝，报出库路径与期望版本，不就地升级；
4. 加门禁：源码里不再出现 `ALTER TABLE` 与 `ensureSqliteColumn`（测试夹具除外）。

搜索索引这种可以从权威数据重建的派生库，版本不符时重建，不算兼容。

**执行顺序**（每步一个 PR）：

1. `packages/storage` 加一个共用的打开函数，例如 `openBaselineSqlite(home, name, { version, schema })`：
   - 新库：执行基线建库语句，写入版本号（`PRAGMA user_version`）；
   - 版本相同：直接打开；
   - 版本不同：抛出明确的错误，带库路径、期望版本和处理办法，不就地升级。
2. 按库替换，每个库只留一份当前 schema。Home 级库的打开处（main 16879b22）：

   | 库 | 打开处 |
   | --- | --- |
   | `agent-definitions` | `apps/local-host/src/agent-definitions/agent-definitions.ts:315` |
   | `assistant`（助理与记忆宿主共用） | `assistant/assistant-http.ts:41`、`memory/memory-host.ts:256` |
   | `connectors` | `connector-authorization-status.ts`、`connector-connection-store.ts`、`connector-protocol-store.ts` |
   | `context-onboarding` | `context-onboarding-store.ts` |
   | `placement` | `placement-actions.ts` |
   | `functions` | `modules/functions/src/store.ts:460` |
   | 记忆账本 | `packages/storage/src/adapters/memory-ledger.ts` |
   | 搜索索引 | `text-search-index.ts`（派生库，不符就重建） |
   | 插件库 | cognia、dataset、form、images、jelly、lingguang、pages、ppt、todo、workflows 各自的 `src/store.ts` |

3. 项目库 `projects/<id>/molis-work.db` 由多个 Module 的建库语句经 `catalog-migrations`、`project-migrations` 依次组成，最后做：
   - 各 Module 只交出当前 schema；
   - 宿主一次建库、写版本；
   - 删掉迁移链与 `tooling/migrations/`。
4. 真实 Home（用户选「保留并升级」；2026-10-03 起的现状：旧成果表已删、常驻服务 4173 已停，见 §1）：
   1. 整份备份 `~/.molis-work`（10-03 已单独备份 18 个项目库，见 §7；升级前仍要整份备份一次）；
   2. 确认 4207 没在跑、4173 仍停着（10-03 起它没有旧成果表已不能用）；
   3. 用删除迁移代码之前的最新 main 打开一次，让每个库升到最新（新成果表、过程项表在这一步建出）；
   4. 用新代码在临时目录建一个基线库，逐表比对两者的表、列、索引、约束与版本号；
   5. 一致后才合入删除迁移代码的 PR；
   6. 合入后用新代码打开真实 Home，确认版本相符、不被拒绝；
   7. 4173 换成新版（重新安装或指向新构建）再启动，由用户决定时机。

真实 Home 要先按用户的决定备份、升级或重建，才能删兼容代码（§4.1「真实 Home 的安全」）。

进度（10-04 夜至 10-05）：

| PR | 合入 | 内容 |
| --- | --- | --- |
| [#260](https://github.com/molis-ai/molis-work/pull/260)、[#261](https://github.com/molis-ai/molis-work/pull/261) | ffed8174、cadb7db9 | 项目库、目录库各一份当前 schema 加版本号，版本不符就拒绝（真实 Home 10-04 已按列名重建：项目库 v1、目录库 v20） |
| [#262](https://github.com/molis-ai/molis-work/pull/262) | 222b633c | 删 0.1.x 根 SDK，根包不再导出代码 |
| [#263](https://github.com/molis-ai/molis-work/pull/263) | df025f2a | 删治理旧提案三张表与只读投影 |
| [#264](https://github.com/molis-ai/molis-work/pull/264)、[#265](https://github.com/molis-ai/molis-work/pull/265) | 2a96bc37、0e903150 | 炼金术士工作室库、服务端库各一份当前 schema；删最后一个就地补列工具 |
| [#266](https://github.com/molis-ai/molis-work/pull/266)、[#267](https://github.com/molis-ai/molis-work/pull/267) | 9e4c5b92、ebb499e0 | 插件安装记录必带 generation 与 execution；记忆旁表与助理库 v2 |
| [#268](https://github.com/molis-ai/molis-work/pull/268) | b1a791ee | 删事件模型之前的旧历史（运行、领取、依据、评审等）连表带显示 |
| [#269](https://github.com/molis-ai/molis-work/pull/269)、[#274](https://github.com/molis-ai/molis-work/pull/274) | aab032d0、ef89d8e8 | MCP 只留一套工具（平台工具加授权动作）；打包发布用例改读 `goal_url_template` |
| [#270](https://github.com/molis-ai/molis-work/pull/270) | 7b946cfc | 已删功能的残留与被叫作 legacy 的现行路径 |
| [#271](https://github.com/molis-ai/molis-work/pull/271) | 2b1ad795 | （他人会话）工作事件挂到 Goal；完成以收尾为准 |
| [#272](https://github.com/molis-ai/molis-work/pull/272) | 7325a3a2 | Goals 存储去掉风险、合同修订与退役提案条目（项目库 v4） |
| [#273](https://github.com/molis-ai/molis-work/pull/273)、[#275](https://github.com/molis-ai/molis-work/pull/275) | 81592458、7ac6fc4a | 凭据只在连接表：模型、图片、TypeSafe（C1）；宿主连接器、Feed 固定来源、Gmail 安装与 Notion 旧槽（C2） |
| [#277](https://github.com/molis-ai/molis-work/pull/277) | 合入 | 会话表为唯一来源：面板与运行时绑定写会话，删读取时的复制（会话库 v7） |
| [#278](https://github.com/molis-ai/molis-work/pull/278) | 合入 | 判断方式四种、复审状态两种、规则只剩「需要用户验收」 |
| [#279](https://github.com/molis-ai/molis-work/pull/279) | 2a8fffcd | 场景绑定一套模型（Functions v2、项目库 v5、内置首页规则种子带 Inbox offer 键） |
| [#280](https://github.com/molis-ai/molis-work/pull/280)、[#281](https://github.com/molis-ai/molis-work/pull/281)、[#282](https://github.com/molis-ai/molis-work/pull/282) | 合入（99f778cd） | 宿主声明的工作入口改名；没人调用的兼容面；Form v2 与工作室零件类型 |
| [#283](https://github.com/molis-ai/molis-work/pull/283) | dd5d8c89 | 防回流门禁：源码兼容标记按文件计数只许减少（CI 里跑；当时 92 处、42 个文件） |
| [#284](https://github.com/molis-ai/molis-work/pull/284) | 4d5776af | 生成插件只走统一目录（工作室目录之前的能力与内联模型要求删除） |
| [#285](https://github.com/molis-ai/molis-work/pull/285) | 267a6f03 | 兼容标记清理 sweep D（92 → 53） |
| [#286](https://github.com/molis-ai/molis-work/pull/286) | 6e62652d | 浏览器夹具固定 zh-CN（Chrome 154 起英文优先系统让中文断言全挂） |
| [#287](https://github.com/molis-ai/molis-work/pull/287) | e1cd4906 | 一个项目身份：`board_id` 全仓改为 `project_id`（项目库 v6、Functions v3、目录库 v21）；batch Q 全量 3,678 个用例 3,670 过、7 跳过、1 败（已修） |
| [#288](https://github.com/molis-ai/molis-work/pull/288) | d81b12cb | Feed 的记录就是模块记录（删 toLegacy* 投影，兼容标记 53 → 20） |
| [#289](https://github.com/molis-ai/molis-work/pull/289) | 排队 | 最后几处名不副实的兼容标记（20 → 17，剩下的都是保留机制） |

- 全量回归：batch K（C2 栈顶）3,685 个用例 3,674 过、4 败（均为 C2 预期变化或缺 #274，已修，重跑通过）；batch L（#277–#282 栈顶）3,680 个用例 3,659 过、13 败（11 个是本栈自己的用例仍用旧字段，已修；2 个是负载超时，单独重跑通过；受影响的 32 个用例在栈顶重跑全过）。
- batch M（#284 加 `board_id` 只改存储列的试做）3,679 个用例 3,656 过、16 败：6 个是 #284 自己的用例仍发内联 instructions（已修，#284 单独验证 192/192）；其余都来自「只改存储列」造成的行与记录字段错位，于是改为一次改完（§1）。
- sweep D（#285）已合 main（267a6f03），兼容标记 92 → 53。
- `board_id` 一次改完（分支 `refactor/project-id-everywhere`）：codemod 7,910 处 / 709 个文件，再手合并两个 id 同时出现的地方（§1 10-06 各条）；项目库 v6（含索引改名）、Functions v3、目录库 v21、会话库不变。batch O 全量 3,660 用例 3,316 过、330 败：大头是共用夹具（浏览器夹具把新建项目的库按固定示例 id 播种、目录库 SQL 只剩一个参数）、历史夹具仍标 v5、测试里原来分开写的 board 与 project 值；夹具与示例 id 修好后余下按文件并行修。
- 回归时发现与改名无关的环境变化：2026-10-05 装上的 Chrome 154 在英文优先的 macOS 上以英文请求页面，浏览器用例断言的中文界面全挂；干净的 main 上同样复现。浏览器夹具固定 `--lang=zh-CN`（[#286](https://github.com/molis-ai/molis-work/pull/286)）。
- 真实 Home 维护三演练（2026-10-07，拷贝 rehearsal-1007，基线取自改名分支的构建）：真实 Home 现为项目库 v1、Functions/Form/记忆/助理 v1、会话库 v6、目录库 v20，所以一次补齐 v1→v6 的整条链（v3、v4 的整理脚本、目标严格读取、场景绑定、改名）；27 个库 1,132,505 行搬完，外键 0、完整性 ok；26 个库的结构与当前基线逐项相同、版本对；18 个项目都能用新构建打开且 board 即项目 id；平台自己存的 JSON 键 `board_id` 改名 20,051 处；会话库 16 个面板会话、38 个绑定会话改来源，96 个 Goal 端点补上项目。演练检查时一次误开了真实 Home 的一个项目库（目录库里存的是绝对路径），版本不符被拒、文件未变，检查脚本已限制只开拷贝。
- 真实 Home 维护三已做（2026-10-07 19:22–19:40，用户弹窗定「改名 PR 合入后立刻做」）：
  1. 先停掉连着真实 Home 的旧 MCP（Claude Code、Codex、Grok 各会话的 goalboard-mcp，跑 9 月 23 日的安装版 0.2.0，会就地迁移数据库；用户弹窗定重装并停掉），按 pid 精确停止；
  2. 整份备份：APFS 克隆 `~/molis-work-backups/2026-10-07-before-maint3`（8.9 GB），160 个库与配置文件逐个比对一致；
  3. 用 main（e1cd4906）的干净构建重装 Home 安装版（installation.json 新摘要）；之后新起的 MCP 都是新代码，遇到旧版本的库只拒绝不写；
  4. 应用维护三（基线由 `gen-maint-schemas.mjs` 从同一构建生成，与两次演练用的逐字相同）：27 个库 1,132,511 行，外键 0、完整性 ok；被换下的原库在 `~/.molis-work/maintenance-3-replaced/`（权限 700）；`feed/secrets.json` 只按键名删了 8 个旧 Gmail 固定槽位条目（OAuth 应用的 client_id/secret 现行代码仍读，保留；`connector:feishu:auth_mode` 不在用户批准范围内，保留）；
  5. 工作室 5 个旧发布的零件类型改写（13 个界面文件里的 5 个），示例项目的工作室目录改名为项目 id；
  6. 只读核对：26 个库的结构与当前基线逐项相同、版本对、完整性 ok；18 个项目的 board 都以自己的项目 id 为键；目录库 18 个项目都在。
  7. Runtime 接入：三处客户端配置还是早先的 goalboard 条目（旧的 `GOALBOARD_*` 环境变量，新代码只认 `MOLIS_WORK_*`），新代码报「MCP 宿主没有提供 Runtime 标识」；用户弹窗定「备份后换成产品接入」：三份配置与三个 goal-advance 链接、三张 9 月 11 日的旧接入收据备份到 `~/molis-work-backups/2026-10-07-runtime-configs/`，删掉旧条目后用产品自己的 Runtime 接入（prepare→confirm）给 Claude Code、Codex、Grok Build 写入 `molis-work` 条目与技能；按配置启动的 MCP 能列出真实 Home 的项目。已开着的会话要重开才会用上。
  8. 主检出：另一会话 10-07 8:59–9:27 留下的 26 个文件改动与两个新 spec（用户弹窗定「本会话处理」）先存成补丁并提交到本地分支 `wip/main-checkout-2026-10-07`（4cb5e28f），主检出 fast-forward 到 main（d81b12cb）后把它重新放回为未提交改动（按改名三方合并，`boardId` 改为 `projectId`），构建通过，它改过的 16 个测试文件 73/73 通过。
- 演练（rehearsal-1007、rehearsal-1007b，拷贝只读取自真实 Home）：两次结果相同；演练检查时一次误开了真实 Home 的一个项目库（目录库存的是绝对路径），版本不符被拒、文件未变，检查脚本已限定只开拷贝。

**各库的当前版本（2026-10-07，main d81b12cb）**：每个库只有一份建库代码，版本不符就拒绝，不就地升级。

| 库 | 版本 | 记在 |
| --- | --- | --- |
| 项目库 `projects/<id>/molis-work.db` | 6 | `user_version`（`PROJECT_DATABASE_BASELINE`） |
| 目录库 `projects/catalog.db` | 21 | `catalog_meta.schema_version` |
| 会话库 `sessions/sessions.db` | 7 | `session_meta.schema_version` |
| Functions | 3 | `user_version` |
| Form、记忆、助理 | 2 | `user_version` |
| 连接、Agent 定义、引导、放置、炼金术士工作室、server、Cognia、Dataset、Images、Jelly、灵光、Pages、PPT、Todo、Workflows | 1 | `user_version` |

**保留下来、不算兼容的机制**（门禁里剩的 17 处标记都在这几类里）：

| 机制 | 为什么不算兼容 | 标记 |
| --- | --- | --- |
| 插件升级声明（`upgrade_compatibility.compatible_from_versions`、同版本重装） | 插件版本之间的升级是现行产品功能，不是读旧数据 | 5 |
| Casebook 对外的覆盖字段（`historical_backfill: false`、`legacy_withProject_calls`） | 外部 Casebook 插件按这些字段对接，是对外合同（10-04 决策） | 8 |
| pdfjs 的 `legacy/build` 路径 | 第三方包给 Node 的构建名 | 2 |
| 产品文案（Gmail 同步说明里的「回填」、规划方法的一条说明） | 给人看的话 | 2 |
| 各库的版本号与基线 | 一份当前 schema 加版本，版本不符就拒绝；不做迁移 | — |
| Goal 事件历史、成果的固定版本 | 现行产品功能（记录与版本），不是旧格式 | — |

## 5. 包级清单（§4.4）

分三个 PR 交（W1-18）：第一个就是这一版，71 个 workspace 包的事实表，每行带状态和计划审查深度；第二个逐包深审「深」11 个和「中」43 个；第三个审「浅」17 个，并把未深入或无法验证的范围写进 §8。审完的包，把「主要文件及各自的变化原因、放错位置的类和方法、重复实现、建议的移动」写在 §5.2 之后，审查列由「待审」改为「已审」。每个包的 README 都有「开发要求」一节（公开入口、负责与不负责、依赖、不变量、必跑测试），71/71 过 `pnpm boundary:check`。

### 5.1 事实表

量于 main `a510aead`，包清单取自 `scripts/workspace-packages.mjs`。用 `node scripts/gates/package-inventory.mjs --table` 从代码重新生成，用 `--check` 对照代码检查；后者也在 `node scripts/check-health-gates.mjs`（CI 里的健康门禁）里跑，是不对照 merge-base 的绝对规则：增删 workspace 包、插件迁到 Plugin Runtime 监督器、或改变 import 的可达性后不补表，CI 变红。门禁守行集合（不多不少、各一行）、层、状态和各列的取值；数字列不守，否则每个加一个文件的 PR 都要改表，要新数字就重新生成。

列的口径：

- 层：登记里的 `kind`（基础是 `foundation`，官方接入是 `integration-plugin`）。`server` 与 `packages/im-ui` 现在登记为基础包，但它们是在用、还会迭代的产品功能（右栏「讨论」页签，`apps/workbench/src/side-panel.ts:42`、`:115` 嵌入 `/im`），归类改成业务是 2026-10-08「右栏『讨论』页签与 IM 代码」一行已定的待办（PR #312）。
- 源文件、行数：`<包>/src/` 下的 `.ts`、`.mts`，不含 `.d.ts`、测试、`dist`、`fixtures`；行数是按换行切开的段数，与巨大单元门禁（`scripts/check-health-gates.mjs`）同一口径。最大文件的路径相对 `src/`。
- 公开入口：`package.json` 的 `exports` 条数。依赖内部包：`package.json` 的 `dependencies` 里 workspace 包的个数。被依赖：反方向的个数。
- 状态、计划深度、审查：见 §5.2。

| 包 | 层 | 源文件 | 行数 | 最大文件 | 公开入口 | 依赖内部包 | 被依赖 | 状态 | 计划深度 | 审查 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `apps/cli` | 应用 | 5 | 177 | `command-dispatch.ts` 54 | 1 | 2 | 1 | 在用 | 浅 | 待审 |
| `apps/desktop` | 应用 | 11 | 1,203 | `capsule-shell.ts` 555 | 1 | 6 | 1 | 在用 | 中 | 待审 |
| `apps/local-host` | 应用 | 369 | 41,807 | `assistant/assistant-service.ts` 2,656 | 1 | 64 | 2 | 在用 | 深 | 待审 |
| `apps/mcp` | 应用 | 17 | 1,062 | `runtime-context-tools.ts` 161 | 1 | 2 | 1 | 在用 | 中 | 待审 |
| `apps/server` | 应用 | 5 | 186 | `assets.ts` 76 | 1 | 7 | 0 | 非产品 | 浅 | 待审 |
| `apps/workbench` | 应用 | 171 | 40,687 | `i18n/en.ts` 3,380 | 1 | 32 | 1 | 在用 | 深 | 待审 |
| `horizontal/agent-host` | 横向 | 35 | 9,410 | `adapters/prologue-node.ts` 1,764 | 1 | 1 | 1 | 在用 | 深 | 待审 |
| `horizontal/connector-host` | 横向 | 3 | 567 | `connection-store.ts` 317 | 1 | 1 | 1 | 在用 | 浅 | 待审 |
| `horizontal/listener-host` | 横向 | 1 | 739 | `index.ts` 739 | 1 | 1 | 1 | 在用 | 中 | 待审 |
| `horizontal/memory` | 横向 | 5 | 1,560 | `service.ts` 1,338 | 1 | 1 | 1 | 在用 | 中 | 待审 |
| `horizontal/placement` | 横向 | 1 | 480 | `index.ts` 480 | 1 | 1 | 1 | 在用 | 中 | 待审 |
| `horizontal/runtime-host` | 横向 | 5 | 980 | `adapters/terminal-pty.ts` 424 | 1 | 1 | 2 | 在用 | 浅 | 待审 |
| `horizontal/scheduler` | 横向 | 1 | 567 | `index.ts` 567 | 1 | 2 | 1 | 在用 | 中 | 待审 |
| `horizontal/search` | 横向 | 1 | 575 | `index.ts` 575 | 1 | 1 | 1 | 在用 | 中 | 待审 |
| `modules/artifacts` | 模块 | 7 | 1,080 | `service.ts` 344 | 1 | 1 | 1 | 在用 | 中 | 待审 |
| `modules/attention-resumption` | 模块 | 1 | 429 | `index.ts` 429 | 1 | 1 | 1 | 在用 | 浅 | 待审 |
| `modules/characters` | 模块 | 4 | 203 | `service.ts` 128 | 1 | 1 | 1 | 在用 | 浅 | 待审 |
| `modules/context-ledger` | 模块 | 4 | 292 | `service.ts` 102 | 1 | 1 | 1 | 在用 | 浅 | 待审 |
| `modules/feed` | 模块 | 2 | 776 | `index.ts` 733 | 1 | 2 | 1 | 在用 | 中 | 待审 |
| `modules/functions` | 模块 | 9 | 1,777 | `store.ts` 939 | 1 | 2 | 1 | 在用 | 中 | 待审 |
| `modules/goals` | 模块 | 42 | 9,440 | `event-facts.ts` 631 | 1 | 1 | 2 | 在用 | 深 | 待审 |
| `modules/governance-collaboration` | 模块 | 12 | 1,116 | `goal-tree-records.ts` 220 | 1 | 1 | 1 | 在用 | 中 | 待审 |
| `modules/private-work-context` | 模块 | 21 | 3,054 | `session-records.ts` 367 | 1 | 1 | 1 | 在用 | 中 | 待审 |
| `modules/projects` | 模块 | 6 | 1,123 | `repository.ts` 467 | 1 | 1 | 1 | 在用 | 中 | 待审 |
| `modules/shelf` | 模块 | 11 | 2,652 | `store.ts` 1,176 | 1 | 2 | 2 | 在用 | 中 | 待审 |
| `modules/signals` | 模块 | 1 | 379 | `index.ts` 379 | 1 | 1 | 1 | 在用 | 浅 | 待审 |
| `modules/sources` | 模块 | 1 | 395 | `index.ts` 395 | 1 | 1 | 1 | 在用 | 浅 | 待审 |
| `packages/contracts` | 基础 | 91 | 16,544 | `services/agent-host.ts` 1,734 | 64 | 0 | 70 | 在用 | 深 | 待审 |
| `packages/design-system` | 基础 | 45 | 17,218 | `styles/craft-finish.ts` 2,313 | 1 | 1 | 22 | 在用 | 深 | 待审 |
| `packages/im-ui` | 基础 | 11 | 1,401 | `browser/controller.ts` 966 | 1 | 2 | 3 | 在用 | 中 | 待审 |
| `packages/kernel` | 基础 | 5 | 1,146 | `action-service.ts` 489 | 1 | 1 | 4 | 在用 | 深 | 待审 |
| `packages/plugin-runtime` | 基础 | 21 | 4,784 | `index.ts` 886 | 1 | 1 | 3 | 在用 | 深 | 待审 |
| `packages/plugin-sandbox` | 基础 | 8 | 726 | `runner.ts` 214 | 1 | 2 | 1 | 在用 | 中 | 待审 |
| `packages/plugin-sdk` | 基础 | 2 | 199 | `index.ts` 182 | 1 | 1 | 8 | 在用 | 中 | 待审 |
| `packages/storage` | 基础 | 13 | 2,120 | `adapters/file-secret-store.ts` 588 | 1 | 1 | 17 | 在用 | 中 | 待审 |
| `packages/test-kit` | 基础 | 2 | 483 | `boundaries.ts` 456 | 1 | 1 | 0 | 非产品 | 中 | 待审 |
| `packages/ui-host` | 基础 | 4 | 441 | `client-lifecycle.ts` 152 | 1 | 1 | 2 | 在用 | 浅 | 待审 |
| `plugins/native/alchemist` | 内置插件 | 97 | 10,327 | `studio/server/db/pulse-repository.ts` 567 | 1 | 4 | 2 | 构建期 | 中 | 待审 |
| `plugins/native/artifacts` | 内置插件 | 19 | 1,628 | `browser-ui.ts` 242 | 1 | 2 | 2 | 构建期 | 中 | 待审 |
| `plugins/native/characters` | 内置插件 | 13 | 978 | `client.ts` 217 | 1 | 2 | 2 | Runtime | 中 | 待审 |
| `plugins/native/coding` | 内置插件 | 58 | 10,718 | `client.ts` 1,656 | 1 | 2 | 2 | Runtime | 深 | 待审 |
| `plugins/native/cognia` | 内置插件 | 16 | 723 | `store.ts` 151 | 1 | 3 | 2 | 构建期 | 中 | 待审 |
| `plugins/native/dataset` | 内置插件 | 16 | 2,042 | `client.ts` 694 | 1 | 3 | 2 | 构建期 | 中 | 待审 |
| `plugins/native/diff` | 内置插件 | 10 | 953 | `comparison.ts` 286 | 1 | 1 | 2 | Runtime | 浅 | 待审 |
| `plugins/native/experiments` | 内置插件 | 10 | 740 | `styles.ts` 164 | 1 | 1 | 2 | 构建期 | 浅 | 待审 |
| `plugins/native/feed` | 内置插件 | 46 | 5,644 | `ui.ts` 698 | 1 | 2 | 3 | 构建期 | 中 | 待审 |
| `plugins/native/files` | 内置插件 | 16 | 1,177 | `manifest.ts` 150 | 1 | 1 | 2 | Runtime | 中 | 待审 |
| `plugins/native/form` | 内置插件 | 17 | 2,545 | `client.ts` 930 | 1 | 3 | 2 | 构建期 | 中 | 待审 |
| `plugins/native/git` | 内置插件 | 15 | 1,708 | `client.ts` 255 | 1 | 1 | 2 | Runtime | 中 | 待审 |
| `plugins/native/goals` | 内置插件 | 151 | 14,215 | `event-document-client.ts` 782 | 1 | 2 | 4 | 构建期 | 深 | 待审 |
| `plugins/native/images` | 内置插件 | 13 | 1,443 | `client.ts` 456 | 1 | 4 | 2 | 构建期 | 中 | 待审 |
| `plugins/native/inbox` | 内置插件 | 13 | 1,016 | `ui.ts` 189 | 1 | 1 | 2 | 构建期 | 中 | 待审 |
| `plugins/native/jelly` | 内置插件 | 27 | 2,355 | `content.ts` 202 | 1 | 3 | 2 | 构建期 | 中 | 待审 |
| `plugins/native/lingguang` | 内置插件 | 14 | 1,819 | `client.ts` 645 | 1 | 3 | 2 | 构建期 | 中 | 待审 |
| `plugins/native/pages` | 内置插件 | 44 | 14,848 | `editor-browser.ts` 4,043 | 3 | 3 | 2 | 构建期 | 深 | 待审 |
| `plugins/native/plugin-builder` | 内置插件 | 17 | 2,855 | `agent-authoring.ts` 800 | 1 | 2 | 2 | 构建期 | 中 | 待审 |
| `plugins/native/ppt` | 内置插件 | 18 | 2,276 | `client.ts` 806 | 1 | 3 | 2 | 构建期 | 中 | 待审 |
| `plugins/native/schedule` | 内置插件 | 24 | 2,484 | `client.ts` 379 | 1 | 1 | 2 | 构建期 | 中 | 待审 |
| `plugins/native/shelf` | 内置插件 | 21 | 5,037 | `client.ts` 1,708 | 2 | 3 | 2 | Runtime | 中 | 待审 |
| `plugins/native/text-stats` | 内置插件 | 6 | 372 | `core.ts` 105 | 1 | 1 | 2 | Runtime | 浅 | 待审 |
| `plugins/native/todo` | 内置插件 | 22 | 4,271 | `client.ts` 1,245 | 1 | 3 | 2 | 构建期 | 中 | 待审 |
| `plugins/native/work` | 内置插件 | 44 | 6,650 | `terminal/client.ts` 478 | 3 | 2 | 2 | 构建期 | 中 | 待审 |
| `plugins/native/workflows` | 内置插件 | 15 | 3,708 | `client.ts` 1,387 | 1 | 3 | 2 | 构建期 | 中 | 待审 |
| `plugins/official-integrations/catalog` | 官方接入 | 9 | 2,133 | `catalog.ts` 1,015 | 1 | 2 | 1 | 在用 | 中 | 待审 |
| `plugins/official-integrations/github` | 官方接入 | 5 | 934 | `provider.ts` 586 | 1 | 2 | 1 | 在用 | 浅 | 待审 |
| `plugins/official-integrations/gmail` | 官方接入 | 12 | 2,673 | `provider.ts` 957 | 3 | 2 | 2 | 在用 | 中 | 待审 |
| `plugins/official-integrations/rss` | 官方接入 | 6 | 1,246 | `catalog.ts` 540 | 2 | 2 | 2 | 在用 | 中 | 待审 |
| `plugins/official-integrations/web-query` | 官方接入 | 1 | 55 | `index.ts` 55 | 1 | 2 | 0 | 非产品 | 浅 | 待审 |
| `plugins/official-integrations/youtube` | 官方接入 | 2 | 138 | `channel.ts` 82 | 1 | 2 | 1 | 在用 | 浅 | 待审 |
| `server` | 模块 | 18 | 1,062 | `continuity/service.ts` 161 | 1 | 2 | 2 | 在用 | 中 | 待审 |
| `tooling/plugin-cli` | 工具 | 8 | 332 | `sample-source.ts` 93 | 1 | 2 | 0 | 在用 | 浅 | 待审 |

### 5.2 状态、计划深度与审查

**状态**：在用 42、Runtime 7、构建期 19、非产品 3。由代码判定，门禁每次重算：

| 状态 | 含义 | 代码里怎么判 |
| --- | --- | --- |
| 在用 | 从产品入口走得到 | 产品入口是根包的三个启动器：根 `tsconfig.json` 把 `apps/desktop/launchers/**` 编成 `package.json` 的 `bin`（`molis-work`、`molis-work-mcp`、`molis-work-web`），目录在 `apps/desktop` 下，所以从 `apps/desktop` 出发，沿包内 `.ts`/`.mts`（不含测试）里的 import 走，类型导入也算；写在模板字符串里的 import 不算 |
| Runtime | 内置插件由 Plugin Runtime 监督器启动 | 走得到，且 `apps/local-host/src/project-plugins.ts` 里有它的包名（`tests/builtin-plugin-assembly-gate.test.ts` 的 `RUNTIME_ASSEMBLED` 用同一证据） |
| 构建期 | 内置插件手工装配进宿主与工作台 | 走得到，但监督器里没有它；就是同一测试冻结的 `BUILD_TIME_ASSEMBLED`（只许减少，迁到 Runtime 时把这里的状态一起改） |
| 非产品 | 产品入口走不到 | 见下 |

非产品的三个包，每个都用 `git grep` 再核对过：

- `apps/server`：没有任何包、脚本或测试按包名导入它。它有自己的 `start` 脚本（`apps/server/package.json`，`node dist/main.js`），`server/README.md:15` 教人手工启动；不随根包发布。
- `packages/test-kit`：只被 `scripts/check-package-boundaries.mjs`、它自己的测试和 `tests/import-boundary-template.test.ts` 导入，根包把它放在 `devDependencies`。
- `plugins/official-integrations/web-query`：除它自己的文件和登记表外，没有任何文件按包名引用它（代码、脚本、测试都没有），根包的 `dependencies` 里也没有它。Feed 的 `web_query` 来源由 `plugins/native/feed/src/source-request.ts` 自己处理；`specs/action-architecture/migration.md:98` 仍写它由 Feed 来源服务驱动，与代码不符，W1-02 对齐文档时一并改。

另有三处声明了依赖、包内却没有任何文件按包名导入：`apps/workbench` 对 `packages/im-ui`（「讨论」页签用的是 `/im` 的 iframe）、`plugins/native/goals` 对 `modules/goals`、`packages/test-kit` 对 `packages/contracts`（只把包名当字符串）。这版不判断，留给逐包审查。

**计划深度**按风险定（任务书 §0：深入程度按风险决定）。四个量各给分：源文件行数 ≥ 9,000 记 2 分、≥ 3,000 记 1 分；2026-09-08（Cutover）以来碰过这个包的非合并提交数 ≥ 100 记 2 分、≥ 40 记 1 分；被依赖数 ≥ 17 记 2 分、≥ 4 记 1 分；`tooling/gates/baseline.json` 里记在它名下的巨大单元数 ≥ 10 记 2 分、≥ 4 记 1 分。总分 ≥ 4 为「深」。另有两个包放在授权脊梁上，也列「深」：`packages/kernel`（`ActionService`：可信身份、`beforeEffect`、撤销后不再写，见 `AGENTS.md` 硬约束）和 `packages/plugin-runtime`（安装、grant、签名）；每个能力调用和每次插件安装都经过它们，体量小，出错的代价最大。其余有 ≥ 1,000 行源码、或有巨大单元、或被 ≥ 3 个包依赖的为「中」，再其余为「浅」。结果：深 11（`apps/local-host`、`apps/workbench`、`horizontal/agent-host`、`modules/goals`、`packages/contracts`、`packages/design-system`、`packages/kernel`、`packages/plugin-runtime`、`plugins/native/coding`、`plugins/native/goals`、`plugins/native/pages`）、中 43、浅 17。深度是计划，不是门禁：以后某个包越过阈值不会让门禁变红，审它的时候再按当时的数重定。

**审查**：「待审」是还没做 §4.4 的结构审查，「已审」是做完并在 §5.2 之后写了逐包记录。现在 71 个包都是待审。

### 5.x 本轮补记的清单项（2026-10-03）

| 项 | 现状 | 证据 | 处理 |
| --- | --- | --- | --- |
| `apps/workbench/src/i18n/en.ts` 无引用的译文 | 约 1,489 条键在源码里找不到（全文件约 3,640 行），译文表一大半是死数据 | 脚本逐键在 `apps`、`plugins`、`packages`、`modules`、`horizontal`、`server`、`tooling`、`examples` 的源码里查找（排除 `dist`、`node_modules`）；抽查「官方连接方式」「计划与执行看板」「钉住预览」只在 `en.ts` 出现 | 死代码清理一片：删无引用的键，把动态拼出的文案改成常量后再删；健康门禁随之下调 |
| `tests/ppt-actions.e2e.test.ts` 下载竞态 | 读到 Chrome 先建的空文件就停，main 上 3 次 2 次失败 | A4b-3b 相关用例与基线对比 | 已修：[#214](https://github.com/molis-ai/molis-work/pull/214)（等文件写完再读，断言不变）。`tests/alchemist-workbench.e2e.test.ts` 读导出有同样写法，尚未见失败，留待测试稳定性一片一起改 |
| 演示稿对象的两套种类名 | PPT 的动作（`ppt.*`）声明 `subject_kinds: ["ppt"]`，对象读取、搬动、搜索、侧栏与成果来源用 `presentation` | `plugins/native/ppt/src/actions.ts`（`subject_kinds: ["ppt"]`）对 `search.ts`、`defineObjectMoveAction("ppt.placement.move", ["presentation"])` | 统一成 `presentation`；改动方的发现与授权都按种类匹配，要连同读它的用例一起改 |

## 5a. 门禁先行（§5 第 1 步，方案）

先接进 CI、防止边整理边恶化。每个门禁都有入库的基线文件，「只减不增」；改动后用突变验证（故意违反一次，确认 CI 变红）。

| 门禁 | 机制 | 基线 | 突变验证 |
| --- | --- | --- | --- |
| 静态检查最小规则集 | ESLint（或 Biome）只开几条：无未用变量与导入、无空 catch（显式注释的除外）、无 `as unknown as`（现有处数进基线） | `tooling/gates/lint-baseline.json` | 新增一处空 catch |
| 公开 API 快照 | 插件 SDK、contracts 各 subpath 的导出清单生成文件入库；导出一变就要显式更新快照，PR 里说明兼容影响 | `tooling/gates/api/*.txt` | 新增一个导出不更新快照 |
| 巨大单元只减不增 | 按 §4.5 阈值（文件 800 行、类 300 行或 25 个方法、函数 150 行）统计，超出的列名单 | `tooling/gates/giant-units.json`（开工时 37 个文件、43 个类、99 个函数） | 新增一个 160 行函数 |
| 装配名单只减不增 | 已有 `tests/builtin-plugin-assembly-gate.test.ts`，接进 CI | 冻结名单 | 加回一个 `*-native-plugin-http.ts` |
| 分层与依赖方向 | 已有 `pnpm boundary:check`，按 `PACKAGE-BOUNDARIES.md` 补上「向上依赖」与「插件互引」的统计 | 现有规则 | 插件 import 另一插件 |
| 测试不新增内部引用 | 统计测试里 `../<区>/*/src/` 与 `dist/` 的引用处数，只减不增 | 开工时 959 + 34 处 | 新增一处内部引用 |
| vendored 包数量 | `vendor/prologue-sdk/*.tgz` 不超过 2 份 | #170 合入后 1 份 | 放回一份旧包 |
| spec 状态句与根目录 | `specs/` 根目录每份都有状态句；只许在做的与现行规范 | 当前根目录 | 新建一份没有状态句的 spec |
| 兼容逻辑不回流 | 源码不再出现 `ALTER TABLE`、`ensureSqliteColumn`、旧产品名与兼容标记（建库基线与允许名单除外） | 删兼容后为 0 | 加一处 `ALTER TABLE` |
| 独立整页（artifact-positioning S7） | 除例外清单外没有路由返回完整 HTML；插件内容里不出现自带外壳；站内链接不跳出工作台 | [artifact-positioning §4](../artifact-positioning/spec.md) | 加一个返回整页的路由 |
| 成果库声明（artifact-positioning A7） | manifest 声明与实际写入一致；可见类型必须有预览；交换数据不进用户可见列表 | 同上 | 写一个未声明的类型 |

**进度**：

- 第一批已做：[#179](https://github.com/molis-ai/molis-work/pull/179)，`pnpm health:check`，接进 CI。覆盖巨大单元、测试内部引用、vendored SDK 份数、就地补表、spec 状态句。
- 开工基线（main 2b138559）：巨大单元 182（文件 37、类 48、函数 97），测试内部引用 1016，vendored SDK 1，就地补表 115。
- 突变验证四项都失败。
- 实例：基线若从 98984bf7 起算，#171 会被拦下。它让 `events-primary.ts`、`navigation-feed.ts`、`craft-finish.ts` 三个超长文件又变长，并新增 2 处测试内部引用。
- 静态检查规则集与公开 API 快照放下一批：要加 ESLint 依赖或生成 `.d.ts` 清单。

CI 目前只跑边界、类型、合同与炼金术士（`.github/workflows/ci.yml`）；以上门禁都以非浏览器用例或脚本形式加到 `architecture-boundaries` 作业里，时间预算 3 分钟以内。

## 6. 安全不变量（§4.18，初稿）

开工后逐条补上守住它的测试（要求断言「拒绝」本身），没有的补写。

| 不变量 | 代码位置（main 16879b22） | 守住的测试 |
| --- | --- | --- |
| Web 只绑回环地址 | `apps/desktop/launchers/web/server.ts:52` | 待确认 |
| 变更请求要控制令牌、同源 Origin、一次性操作键 | `apps/local-host/src/web-http.ts` 的 `authorizeLocalWebRequest` | `tests/action-gateway.test.ts` 等，待逐条确认 |
| 跨进程动作网关只接受回环 http，不带账号、密码与查询串 | `apps/local-host/src/action-gateway.ts:16` | 待确认 |
| MCP 逐客户端授权 | `apps/local-host/src/mcp-action-client.ts` 的 `authorizeMcpActions` | 待确认 |
| 插件权限与沙箱 | Plugin Runtime 的权限与网络策略 | `tests/installed-plugin-policy.test.ts`、`agent-built-plugins-network.test.ts`，待确认 |
| 密钥只给引用 | 连接存储与密钥库 | 待确认 |
| 侧栏浏览器与 Computer Use 的站点策略与逐步确认 | Prologue `surface-act` 闸门；Molis 侧 `prologue-surfaces.ts` | `tests/side-panel-*`，待确认 |
| 网页与记忆内容的提示注入防护 | Prologue 以 `<untrusted-page-content>` 交给模型 | 待确认 |
| 外部输入的路径与 URL 校验 | 见下 | 待确认 |

「是不是本机地址」的判断在源码里至少各写了一份：

- `action-gateway.ts:16`；
- `browser/browser-socket.ts:19`；
- `configured-models.ts:45`；
- `connector-api-oauth.ts:32`；
- `connector-mcp.ts:105`、`:136`；
- `im-server.ts:39`；
- `web-http.ts:32`。

允许的写法也不一样（有的认 `localhost`，有的只认 IP）。这一条并入 R-08 的重复实现，收成一个共用判断。

## 7. 需要用户操作的事项

- **常驻服务 4173 要装新版**：10-03 已停（`launchctl bootout gui/<uid>/com.adeptify.goalboard.web`，plist 未改）。它是安装版 0.2.0，读写已删除的旧成果表，不能再用；装新版或改指向新构建后，用 `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.adeptify.goalboard.web.plist` 启动。
- **旧成果表的备份**：`~/.molis-work-backups/2026-10-03-drop-old-artifact-tables/`（18 个项目库，148 MB，逐个 `integrity_check` 通过、行数与删除前一致）。确认不再需要后由用户删除。
- ~~**anti-rot**~~：已于 10-03 删除（工作树、本地与远端分支，见 §1），不再需要用户操作。
- **#192–#215 合入后留下的远端分支**（24 条，GitHub 上 Branches 页删除）：`docs/artifact-positioning-progress`、`fix/shell-s6-settings-in-workbench`、`docs/archive-post-merge-review`、`fix/shell-s6b-capabilities-in-workbench`、`chore/shell-s7-page-gates`、`fix/shell-s4-studio-in-workbench`、`fix/shell-s1b-drop-old-builder`、`docs/artifact-positioning-s4-s1b`、`fix/artifact-a6-naming-and-feed-manifest`、`feat/artifact-a2-process-items`、`feat/artifact-a1-contract`、`feat/artifact-a3-import-in-library`、`feat/artifact-a4-consumers`、`feat/artifact-a5-goal-delivery`、`fix/test-functions-harness-host`、`feat/artifact-a5b-pin-deliverables`、`feat/artifact-a5c-deliverable-proposals`、`feat/artifact-a7-declaration-gates`、`feat/artifact-a4b-source-and-references`、`feat/pages-import-entry-back`、`feat/artifact-a4b2-goal-inputs`、`feat/artifact-a4b3-continue-and-side`、`fix/test-ppt-download-race`、`feat/artifact-a4b3b-continue`；以及之后合入的本目标分支。
- 删除已合入的远端分支（自动模式拦下了我执行的删除）：`docs/spec-sweep`、`fix/onboarding-blank-name`、`fix/global-links-in-project`、`feat/one-attention-bell`、`feat/characters-settings-only`、`fix/contextual-live-region`、`test/baseline-timing-defects`、`fix/todo-project-search`、`fix/open-plugin-link`、`fix/jelly-assistant-refresh`、`fix/assistant-undo-refresh`、`fix/narrow-stage-side-panel`、`fix/assistant-claimed-save`、`fix/pages-writing-faithful`、`feat/one-idea-inbox`、`fix/open-plugin-enabled-only`、`fix/todo-search-plain-fields`、`fix/side-browser-stop-revoke`、`fix/button-guard-same-sentence`、`fix/side-browser-wait-no-ask`、`fix/assistant-origin-name`、`fix/builder-model-call-limit`、`fix/test-pages-publication-narrow`，以及他人的 `feature/project-arrival-flow`（#159）、`claude/nostalgic-engelbart-93e407`（#164）。也可以在仓库设置里打开「合并后自动删除分支」。

## 8. 未验证的范围

尚未开工，暂无。

## 9. main 自检（2026-10-03，main aef917dc）

第二步结构性改动的起点。按用户 10-03 的要求：任务书合入 main 后，逐条复核第一步与成果库改造修过的问题在最新 main 上仍然成立，再对照四份任务要求逐项标出已覆盖、本轮新发现、不适用（第二步还没做的标「待做」并指到本文的计划）。

**方法**：

- 最新 main（aef917dc，含 #219）整体构建后跑全量回归（738 个用例文件），作为本阶段证据，也一次跑过下面每一条的守护用例；
- 守护用例取自每个修复 PR 改动的测试文件（`gh pr view <N> --json files`）；已删除的用例逐个核对去向；
- 「交第二步」与「待决」的条目，用命令在 main 上重新量；
- 界面上的条目以 10-03 的隔离 Home 走查为准（[artifact-positioning §5b](../artifact-positioning/spec.md)）。

### 9.1 回归自检

**全量回归**：3,758 个用例：3,749 通过、2 失败、7 跳过（main aef917dc，10-03 10:47 起）。两个失败都不是旧问题复发，是本轮新发现，都在干净的 main 上复现（3/3 与必现），已修：见 9.4 第 1、2 条（#220、#221）。没有一条第一步或成果库改造修过的问题复发。

**第一步问题表（PMR）**

| 编号 | 当时的处理 | 复核结论 | 证据 |
| --- | --- | --- | --- |
| PMR-01 | 已修 #138 | 未复发 | `context-onboarding-blank.e2e`（全量通过） |
| PMR-02 | 已修 #140 | 未复发 | `announce-guard`、`plugin-notification-bell`、`plugin-event-recovery.e2e`（全量通过） |
| PMR-03 | 已修 #141 | 未复发 | `characters-appearance`、`creative-tools-plugins`（全量通过） |
| PMR-04 | 交第二步 | 状态准确：仍有 38 个重复键（共 3,517 个）；另查出约 1,489 个无引用的键（9.4 #1） | 逐键统计脚本，见 9.3 |
| PMR-05 | 交第二步 | 状态准确：`migrateLegacy` 仍在（15 处） | `git grep -c migrateLegacy` |
| PMR-06 | 交第二步 | **已不成立**：#170 删了 3 份未用的包，vendored 只剩 `side-panel-memory.tgz`；状态改为「已修（#170）」 | `ls vendor/prologue-sdk/*.tgz` |
| PMR-07 | 核实中 | **状态不准**：归档 spec §12.2 已量过（首屏 293 KB HTML、6,041 个节点），处理在第二步「浏览器脚本打包、按需渲染」；状态改为「已量，交第二步」，本轮重量见 9.3 | 9.3 首屏体量 |
| PMR-08 | 交第二步 | 状态准确：`#decision-goal-` 2 处、`feed-start=1` 1 处仍在 | `git grep` |
| PMR-09 | 交第二步 | 状态准确：`scripts/personal-assistant-public-sources.mts` 仍在 | `ls` |
| PMR-10 | 已修 #139 | 未复发 | `project-page-links`（全量通过） |
| PMR-11 | 已关闭 | 不适用 | — |
| PMR-12 | 核实中 | **状态不准**：助理会话 9-30 已修（c48a8608，在 main）：左栏看不到时对话顶部一行给出状态与暂停、继续、停止；抽屉开着时点对话区先收起抽屉。当时用替身在 800、1440 核对，**没有自动守护用例**（9.4 #9） | `git merge-base --is-ancestor c48a8608 main`；`assistant-dock.ts` 的 `data-assistant-strip` |
| PMR-13 | 已关闭 | 不适用 | — |
| PMR-14 | 交第二步 | 状态准确：`assistant-island.ts` 仍是 `L("正在看") + "："` | `git grep` |
| PMR-15 | 已定，交第二步 | 状态准确：BL-088 未做 | `tests/builtin-plugin-assembly-gate.test.ts` 名单未减 |
| PMR-16 | 已修 #144 | 未复发 | `system-search`、`todo-actions`（全量通过） |
| PMR-17 | 已关闭（未复现） | 不适用；第二步重跑场景 1 时留意 | — |
| PMR-18 | 已修 #146 | 未复发 | `jelly-outside-changes.e2e`（全量通过） |
| PMR-19 | 已修 #151 | 未复发 | `assistant-business-gateway`、`announce-guard`（全量通过） |
| PMR-20 | 已修 #145 | 未复发 | `context-onboarding-todo.e2e`（全量通过） |
| PMR-21 | 已修 #148 | 未复发 | `assistant-undo-refresh.e2e`、`assistant-undo`（全量通过） |
| PMR-22 | 已修 #153 | 未复发；`jelly-material` 随灵感页一起删除 | `jelly-*` 其余用例（全量通过） |
| PMR-23 | 已修 #149 | 未复发 | `side-panel-narrow-stage.e2e`（全量通过） |
| PMR-24 | 已修 #152 | 未复发（提示词 v2 仍在）；真实模型回放不在全量里，未重跑 | `pages-plugin`（全量通过） |
| PMR-25 | 已修 #154 | 未复发 | `open-plugin-link.e2e`（全量通过） |
| PMR-26 | 已修 #155 | 未复发 | `todo-actions`（全量通过） |
| PMR-27 | 已修 #157 | 未复发 | `side-panel-assistant-surface`（#157 加的 3 条，全量通过） |
| PMR-28 | 已修 #158 | 未复发 | `assistant-business-gateway` 反例（全量通过） |
| PMR-29 | 已修 #160 | 未复发 | `side-panel-assistant-surface`（全量通过） |
| PMR-30 | 交 BACKLOG | 状态准确 | BACKLOG |
| PMR-31 | 已修 #162 | 未复发 | `assistant-origin-name.e2e`（全量通过） |
| PMR-32 | 交 BACKLOG（BL-104） | 状态准确 | BACKLOG |
| PMR-33 | 已修 #163 | 未复发 | `agent-built-plugins-agent`（全量通过） |
| PMR-34 | 修复中（#172） | **状态不准**：#172 已合入（35257cd9），应为「已修」 | `plugin-builder-stage.e2e`（全量通过） |
| PMR-35 | 修复中（#182） | **状态不准**：#182 已合入（141f6cef），应为「已修」 | `agent-built-plugins-agent`（#182 加的重叠保存用例，全量通过） |
| PMR-36 | 交后续（BL-113） | 状态准确 | BACKLOG |

**第一步合并缺陷（§4）**

| 项 | 复核结论 | 证据 |
| --- | --- | --- |
| 冲突标记 | 仍无 | `git grep` 除 Markdown 与锁文件外 0 处 |
| `en.ts` 重复键（PMR-04） | 仍然成立，交第二步 | 38 个键重复（共 3,517 个） |
| Prologue SDK 合成包 | 已收：vendored 只剩一份 `side-panel-memory.tgz`（#170 删了 3 份） | `ls vendor/prologue-sdk/*.tgz` |

**成果库改造（S1–S7、A1–A7、A4b、走查）**

| 片 | 守住它的用例 | 复核结论 |
| --- | --- | --- |
| S1 删独立工作区、演示记录（#176） | `shell-page-gate`；`plugin-page-workspace` 随功能删除 | 未复发：`renderPluginPageWorkspace` 0 处 |
| S1b 删旧创作台（#198） | `agent-studio.e2e`、`plugin-builder-stage.e2e`；旧创作台用例随功能删除 | 未复发：`/plugin-builder` 整页路由 0 处 |
| S2 直达链接打开工作台（#177） | `shell-direct-links.e2e`、`shell-page-gate` | 未复发 |
| S3 沙箱框只在工作台里（#186） | `plugin-builder-stage.e2e`、`agent-plugin-identity` | 未复发 |
| S4 创作台去框（#197） | `agent-studio.e2e`、`plugin-builder-stage.e2e` | 未复发 |
| S5 文件在工作台里预览（#187） | `shell-file-preview.e2e`、`artifact-reference-ui` | 未复发 |
| S6、S6b 设置与能力库进工作台（#193、#195） | `settings-direct-access`、`capabilities-in-settings.e2e`、`project-settings-*.e2e`、`functions-draft-retention`（#206 补了用例装配） | 未复发 |
| S7 整页门禁（#196） | `shell-page-gate`（CI 里跑） | 未复发 |
| A1 合同（#202） | `artifacts-module`、`artifact-subject-context`、`artifact-browser` | 未复发 |
| A2 交换数据迁回 owner（#201） | `artifact-type-gate`、`coding-artifacts` 等 Coding 用例 | 未复发 |
| A3 导入只在成果库（#203）；Pages 恢复自己的导入（#211） | `artifact-document-import`、`artifacts-actions-browser`、`pages-import-entry.e2e` | 未复发：`/artifacts/import` 整页 0 处（只剩 `POST /api/artifacts/import`） |
| A4a owner 预览（#204） | `artifact-browser`、`artifact-type-gate`、Forms/PPT/Dataset 的 MCP 用例 | 未复发 |
| A4b-1 原文已改、被谁引用（#210） | `artifact-source-and-links` | 未复发 |
| A4b-2 作为 Goal 的输入（#212） | `goal-artifact-inputs`、`artifact-goal-input.e2e` | 未复发 |
| A4b-3a、3b 从这一版继续、侧栏预览（#213、#215） | `artifact-continue`、`artifact-continue.e2e`、`side-files-artifacts`、`artifact-type-gate` | 未复发 |
| A5a、A5b、A5c Goal 交付、当场固定、提议（#205、#207、#208） | `goal-deliverables`、`goal-deliverable-proposals`、`goal-event-document.e2e`、`goal-events-state` | 未复发 |
| A6 命名与 Feed 声明（#200） | `artifact-browser`、`immersive-workbench.e2e`、`plugin-declarative-mounting` | 未复发 |
| A7 声明门禁（#209） | `artifact-declaration-gate`、`artifact-type-gate`（CI 里跑） | 未复发 |
| 走查发现（#217、#219） | `pin-toast-opens-version.e2e`、`artifact-walkthrough.e2e`（1440、390） | 未复发 |
| 用例缺陷（#206、#214） | `functions-draft-retention`、`ppt-actions.e2e` | 未复发 |

**已删除的守护用例**：`plugin-page-workspace.test.ts`（S1 删了独立工作区）、`plugin-builder-{browser,visual}.e2e`、`plugin-builder-{presentation,publication,runtime,workflow}.test.ts`（S1b 删了旧创作台）、`jelly-material.test.ts`（PMR-22 自己的修复 #153 去掉了 Jelly 灵感）。都是随被删的功能一起删，没有丢失守护。

### 9.2 对照任务要求的补查

**第一步任务书（main 上的新版）**：新版比归档时的旧版多两条要求——

1. 「本步的修复不新增任何兼容或迁移逻辑」：已覆盖。第一步的修复 PR（#137–#185）里只有 #176 动了带 legacy 字样的文件，且是删除（`legacy-actions.ts` −33 行、`alchemist-legacy.ts` −14 行）。成果库改造的 A1、A2 新表写进现有的建库语句，没有新增迁移步骤。
2. 场景 9 改为「拷贝一份我（以及同事）正在用的 Home，用当前 main 打开，看能不能正常用」：**未做**，涉及真实 Home 的拷贝，要用户同意（见 §1 待决）。10-03 已经删了真实 Home 的旧成果表、停了 4173，用当前 main 打开时成果库从空开始。

其余各节的完成标准见第一步归档 spec §13.1，复核结论同上表。

**第二步任务书**：

| 节 | 结论 | 指向 |
| --- | --- | --- |
| §3 先量化现状 | 已量（10-02），本节 9.3 重量 | §2、§9.3 |
| §4.1 清除兼容逻辑 | 已完成（10-07）：兼容逻辑删到只剩上表保留的机制；每个库一份当前 schema、版本不符拒绝；真实 Home 维护三已做并逐库核对；防回流门禁在 CI | §4.1 末尾 |
| §4.2 调用链文档 | 待做 | — |
| §4.3 分层与边界 | 待做；已知问题已登记 | §3 N-03、N-12 |
| §4.4 包级清单 | 初稿 | §5 |
| §4.5 巨大单元 | 门禁已接（只减不增，181 个）；拆分待做 | `tooling/gates/baseline.json` |
| §4.6 扩展点与插件平台 | 待做；装配名单冻结 19 个、未减少 | `tests/builtin-plugin-assembly-gate.test.ts` |
| §4.7 多人并行 | 部分（W1-13 已做）：`docs/system/PARALLEL-DEVELOPMENT.md`（枢纽文件、排时段、集成分支、基线比对、Agent 锁、清理、PR 体量）、`docs/system/CONTRACT-CHANGES.md`（现在不留兼容期；读取兼容从第一个装到开发机之外的版本开始，日期未到）、`.github/CODEOWNERS` 与 SSOT 各表「归属」列（由 `scripts/package-owners.mjs` 生成，`pnpm boundary:check` 校验）、PR 模板新栏目、`AGENTS.md` 指针。待做：公开 API 快照 W1-04、动作合同快照 W2-15、挑相关用例脚本 W2-17、CI 产品子集 W1-11/W2-16、插件回放工具 W4-01、测试并发隔离 W5-12、Prologue SDK 合成负责人（W1-20 提名）；CODEOWNERS 现在只路由包根目录，Coding、Jelly、Shelf 在宿主与外壳里的代码未路由 | §1、`docs/system/PARALLEL-DEVELOPMENT.md` |
| §4.8 改需求的便利 | 待做 | — |
| §4.9 体检报告逐项闭环 | 进行中 | §3、§9.3 |
| §4.10 新合同全链路 | 部分：成果库的预览、固定、比较、继续协议都有门禁与用例；其余合同待做 | artifact-positioning A4–A7 |
| §4.11 数据与可靠性 | 待做；真实 Home 旧成果表已删 | §1 |
| §4.12 卫生与文档 | 部分：vendored 已收到一份；`MIGRATION.md` 未归档；工作树清理按用户决定做了一部分 | §7 |
| §4.13 门禁 | 第一批已接（健康门禁、整页门禁、成果类型与声明门禁）；静态检查、API 快照、页面资源预算待做 | §5a |
| §4.14 手册与 Skill | 部分：插件开发 Skill 写明了成果类型的 title、preview、pin、compare、continue | `skills/molis-plugin-dev/elements.md` |
| §4.15 术语表 | 部分：`docs/system/GLOSSARY.md` 已写（一概念一名一定义；术语到翻译稳定键的对应；界面用词待批清单；代码改名清单分内部改名与合同改名；Characters 按「设置的一节」写，讨论按在用功能写）；代码改名、旧术语门禁、两套能力机制的收敛未做 | `docs/system/GLOSSARY.md`、§1 |
| §4.16 静态检查 | 待做：仓库没有 lint/format 脚本 | `package.json` |
| §4.17 依赖与 SDK | 待做 | — |
| §4.18 安全不变量 | 初稿 | §6 |
| §4.19 C 端就绪方案 | 待做 | — |

**仓库系统整理要求（15 节）**：§1、§2 已覆盖（第一步 spec §1、§7）；§9 前端动线：壳子 S1–S7 与成果库走查覆盖了「插件不出整页、直达打开工作台、对话框与侧栏在工作台里」，其余页面的质感审查待做；§12 测试与预期对齐：第一步回归基线与本轮的 #206、#214（用例装配与下载竞态）覆盖了已发现的，系统性审查待做；§13 Prologue AI 手册与 Skill 已有（`docs/platform/PROLOGUE-AI.md`、`skills/molis-prologue-ai/SKILL.md`），与当前代码的一致性待第二步 §4.14 复核；§3–§8、§10、§11、§14、§15 归第二步，见上表。

**体检报告**：附录 A 的数字见 9.3；§5 的防腐顺序与第二步 §5 相同，第一步「门禁先行」已开始（第一批），其余未开始；§7.5 对在途线的建议：在途线都已合入或删除（见第一步 §13），不再适用。

### 9.3 重新量（main aef917dc，与 10-02 开工时对比）

| 项 | 10-02 | 10-03 | 口径 |
| --- | --- | --- | --- |
| 构建期装配的内置插件（R-01） | 19 | 19 | `tests/builtin-plugin-assembly-gate.test.ts` 冻结名单；`project-host.ts` 的 `registerProvider` 26 处 |
| 宿主 `apps/local-host/src`（R-03） | 367 文件、42,714 行 | 369 文件、42,787 行 | `git ls-files` 的 `.ts`；`*-native-plugin-http.ts` 18 个、`*-actions.ts` 34 个，未变 |
| 工作台客户端脚本（R-07） | 32 个、14,032 行 | 33 个、14,469 行 | `apps/workbench/src/scripts/client/*.ts` |
| 插件客户端（R-07） | 26 个、13,086 行 | 25 个、12,842 行 | `plugins/native/*/src/client*.ts` |
| 空 `catch` | 145 | 142 | 源码（不含测试） |
| `Error` 子类（R-08） | 116 | 112 | 同上 |
| `as unknown as`（R-12） | 236 | 236（源码 154、测试 82） | 含测试 |
| `.impeccable/` 入库文件（R-14） | 1,067 | 1,085 | `git ls-files` |
| vendored Prologue 包（N-02） | 4 | 1 | `vendor/prologue-sdk/*.tgz` |
| 旧能力注册（N-12） | 18 个文件、10 处 | 18 个文件、11 处 | `HostCapabilityDefinition` 文件数、`registerCapability` 处数 |
| 巨大单元（健康门禁） | 181 | 181 | `pnpm health:check` |
| 测试引用包内部 | 979 | 979 | 同上 |
| `en.ts` 无引用的键 | — | 约 1,489 | 逐键查源码，见 §5.x |

宿主与工作台客户端仍在小幅增长（成果库改造新增了比较、继续、作为输入等入口），第二步「声明代替名单」与「浏览器脚本打包」要先做。

### 9.4 本轮新发现与处理

| # | 发现 | 处理 |
| --- | --- | --- |
| 1 | 全量回归的失败①：`project-home-start` 的首页快捷方式用例在 main 上 3/3 失败。S7（#196）让站内地址不开第二个标签页，用例仍期望开新标签页；预期变化没随改，当时相关用例集漏了它 | 已修：[#220](https://github.com/molis-ai/molis-work/pull/220)（f7d7f1ec），用例改为断言在本页打开、没有第二个标签页，其余断言全部保留 |
| 2 | 全量回归的失败②：`soft-workbench-refinement` 的字号刻度。成果库导入浮层的标题 18px、结果 16px、提醒 14px 不在刻度上，来自 A3（#203） | 已修：[#221](https://github.com/molis-ai/molis-work/pull/221)（61b805a7） |
| 3 | 第一步问题表有 5 条状态与事实不符：PMR-06（#170 已删旧包）、PMR-07（已量过）、PMR-12（9-30 已修）、PMR-34（#172 已合）、PMR-35（#182 已合） | 本 PR 在归档 spec 里更正，注明「10-03 main 自检更正」 |
| 4 | PMR-12 的修复（c48a8608）没有自动守护用例，只在当时用替身核对过 | 第二步补用例：800 宽、左栏收起时，暂停与等确认两种状态下顶部一行显示继续、停止与「去确认」 |
| 5 | 成果版本的「被谁引用」只列 Goal，助理工作不在里面 | 已补做：[#222](https://github.com/molis-ai/molis-work/pull/222)（3f7a7b00）；从直达链接打开的成果标签记的是带项目前缀的地址，由 [#227](https://github.com/molis-ai/molis-work/pull/227)（ec8429f9）补查 |
| 6 | 文档引用成果：Pages 没有引用成果版本的节点，也不记反向引用 | 用户拍板「识别正文里的版本链接」：[#225](https://github.com/molis-ai/molis-work/pull/225)（a9cd3f8c，新协议 `molis.artifacts.referrers`） |
| 7 | Goal 概览看不到交付物（走查 F6） | 已补做：[#223](https://github.com/molis-ai/molis-work/pull/223)（d69f4a27），「Goal 信息」里加「交付物 · N 份」 |
| 8 | 助理面板的结果栏也叫「成果」，与成果库同名不同义 | 用户拍板改叫「产出」：[#224](https://github.com/molis-ai/molis-work/pull/224)（960acab7） |
| 9 | 成果版本没有「交给助理 / Coding」 | 用户拍板现在做：[#226](https://github.com/molis-ai/molis-work/pull/226)（ebeca52c），成果详情加两个按钮，把这一版作为材料交给新工作 |
| 10 | 成果版本不能作为工作流步骤的输入 | 用户拍板现在做：[#228](https://github.com/molis-ai/molis-work/pull/228)，工作流内容协议支持「只能作起点」的站点，成果库声明列出与读取 |
| 11 | 「存为固定版本」与「放在哪里」重叠；Goal 有两种输入 | 用户拍板「合成一种入口」：Goal 只留一个「加输入」，选对象时再选「跟着原文」或「固定这一版」（进行中） |
| 12 | 场景 9（拷贝真实 Home 用当前 main 打开） | 已做（10-04，main 818d0aff）：4207、4208、4173 都没在跑，占着 Home 文件的只有已安装 0.2.0 的 MCP 服务（只开着自己的二进制，不开库）；把 `~/.molis-work` 拷到会话临时目录（排除 1.9 GB 的 `releases/` 安装包，拷了 7.0 GB），137 个库完整性检查全过；用当前 main、文件密钥后端在 4331 打开：项目列表、项目首页（今天的工作）、Goals、Coding（旧会话在）、工作流、设置、能力库都正常，浏览器与服务端无报错，成果库为空（旧表 10-03 已删，符合预期）。插件安装记录停在旧版本（如 Coding 1.32.0、1.44.0，当前 1.50.0）但跑的是当前代码，没有升级提示；把 Coding 加进一个装着 1.32.0 的项目也能用。未验证：调模型（按约定不调）、连接（文件密钥后端读不到钥匙串里的凭据）。做完已删拷贝与临时启动项 |
| 13 | 助理底栏「正在看」对从直达链接打开的成果标签显示地址而不是标题（标签本身的名字是对的）：工作台替插件命名打开的对象时没带标签名 | 已修：[#227](https://github.com/molis-ai/molis-work/pull/227)（ec8429f9） |
| 14 | 常驻服务 4173 停着，要装新版 | 用户操作，见 §7 |
| 15 | 宿主与工作台客户端仍在增长（9.3） | 第二步「声明代替名单」「浏览器脚本打包」先做 |
| 16 | `en.ts` 约 1,489 个无引用的键、38 个重复键；演示稿两套种类名 | 已记入 §5.x，第二步处理 |

### 9.5 另一会话复查的九条（用户 2026-10-04 转来，由我判断修不修、怎么修）

逐条在 main 上核实，并用场景 9 的拷贝查了真实 Home 是否还依赖。

| # | 发现 | 核实 | 判断与做法 |
| --- | --- | --- | --- |
| 1 | 本机网页把所有调用者写成 `"web-user"` | 属实：约 20 个宿主文件各写一份字面量，`agent-host-composition.ts` 还有 `legacyActorId` | 修（第二步，可信身份一节）：身份值不变（已存数据按它记），收成合同里的一个常量，所有调用方引用它；删 `legacyActorId`。多人身份属 §4.19 C 端就绪，不在这里做 |
| 2 | 来源表 `feed_sources` 有两个主人 | 属实：`modules/sources` 建表，`horizontal/listener-host` 建 `feed_source_runs` 并对 `feed_sources` 加外键、删行；`cursor_json` 标着只给旧数据用、靠就地补列 | 修（分层与边界）：删 `cursor_json` 与就地补列、CHECK 重建、旧游标拷贝（不留兼容），见 [#240](https://github.com/molis-ai/molis-work/pull/240)。`feed_source_runs` 的处理改了做法（10-04）：运行记录是 Listener Host 的同步账本，留在它那里，只去掉它对来源表的外键。来源只退役不硬删，这条级联从不触发；运行记录本来就由 `deleteListenerSourceState` 显式清理。分支 `refactor/listener-runs-own-table` |
| 3 | 会话库仍在把 `goalboard_*` 改写成 `molis_work_*` | 属实：`session-schema.ts` 见旧值就整表重建；兼容清单只列了 `session-migration.ts` | 修（清除兼容）：真实 Home 的会话库已是第 6 版、没有旧值（54 条 `legacy_migrated`、2 条 `molis_work_created`），删掉改写；`legacy_migrated` 与 `session_migration_receipts` 一并列入兼容清单 |
| 4 | 文件密钥库的派生盐是 `"goalboard-feed-secretstore-v1"` | 属实 | **不改值**：它是派生已封存密钥的常量，换了旧密钥就解不开，只能再加一层重新封存（那才是兼容逻辑）。代码里已注明（`Historical key-derivation constant. Changing the string would invalidate existing ciphertext.`），列入 §4 例外。**另发现**：同一文件在打开时把 v0.3 的 Base64 信封重新加密（兼容逻辑），列入兼容清单；删之前先只按格式（不读内容）核对真实 Home 还有没有这种信封 |
| 5 | 八个内置插件仍列着可以从哪些旧版本升上来 | 属实；真实 Home 的安装记录多是旧版本（Coding 1.32.0 / 1.44.0、Characters 1.2.0、Files 1.1.0、Git 1.3.0 / 1.4.0） | **更正（10-04）**：前一版写「内置插件启动时不查这些名单」不对。读监督器的代码：已装版本在名单里就直接跑新代码、记录不动；不在名单里就恢复当时存下的旧发行物——所以真实 Home 里装着 Coding 1.32.0 的项目很可能跑的是旧 Coding；照原计划删名单，其余项目也会退回旧代码。用户 10-04 弹窗拍板「内置插件随宿主升级」：随宿主发布的内置插件启动时把安装记录升到当前版本、跑当前代码，不再靠名单；然后删名单。第三方与生成的插件仍走升级确认。分支 `feat/bundled-plugins-follow-host` |
| 6 | CLI 与 MCP 仍能初始化旧看板、导入 v3，执行者来自参数 | 属实：`init`、`import-v3`、`molis_work_v1_initialize`、`molis_work_v1_import_v3`，宿主用参数里的 `actor_id` 做管理身份 | 修（安全不变量，硬约束「可信身份从调用上下文来」）：删 `import-v3` 全链（旧数据导入，按「不留兼容」）；初始化的身份改从调用上下文取，参数里不再收 `actor_id`。MCP 外部调用方会少一个工具、少一个参数，在 PR 里写明 |
| 7 | 生产用的模型入口没有清单；没有模型目录时仍读环境变量与旧凭据、默认走 MiniMax | 属实（BL-082）；真实 Home 的模型目录里有 1 个已配置的提供方，不走兜底 | 修，按用户 10-04 的决定（§1）：<br>• 写调用链清单（§4.2，十七处宿主绑定都经 `host-complete-text.ts` 到 Prologue）。<br>• 删 `model:text:api_key` 的读取与导入，见 [#239](https://github.com/molis-ai/molis-work/pull/239)。<br>• 环境变量留作开发与测试的显式配置，写进手册；通用变量不再默认成 MiniMax。<br>• 产品里没配模型时，调用方提示「请先配置可用的文字模型」。<br>• 其他旧账号导入（TypeSafe、图片、旧连接引用）列入兼容清单，核对真实 Home 后再删 |
| 8 | 演示稿两套种类名 | 属实，方向相反：PPT 动作声明的是 `ppt`，对象、搜索、侧栏、成果来源都用 `presentation` | 修：统一为 `presentation`（动作声明的种类不入库，改它不涉及数据） |
| 9 | 炼金术士自己的库用了平台在用的表名 | 属实（`workspaces`、`jobs`、`evidence`、`claims`） | **不改**：每个项目单独的 `studio.sqlite`，不与平台库同库，不会冲突；改名要迁移用户数据。只在将来并库时再处理，记入已知命名 |

执行顺序：3、8、6 先做（小、独立）；1、2、5、7 随第二步对应小节做。每条一个 PR，进度记在本节。

进度（10-04）：
- 第 3 条：分支 `fix/drop-session-name-rewrite`——查下去发现改名只是会话库旧版升级链的一部分（新建的库先建成第 3 版再迁到第 6 版），按「不留兼容」一并删掉，只认第 6 版；全量回归在跑（存储改动按 10-03 的验证频率要跑全量）。
- 同时发现并修了一处与它无关的时序：`immersive-directory.e2e` 关切换器前 Dock 还在重排，按下与松开不在同一处——[#232](https://github.com/molis-ai/molis-work/pull/232)（268325bd）。
- 第 5 条：见上表更正与 §1 的决定。

进度（10-04 下午）：

| # | PR | 状态 |
| --- | --- | --- |
| 3 | [#234](https://github.com/molis-ai/molis-work/pull/234)（3fa5f40f）：会话库只认第 6 版，删旧版升级链与改名 | 已合入；全量回归在合入前跑过 |
| 8 | [#236](https://github.com/molis-ai/molis-work/pull/236)（fc0b1b70）：演示稿只用 `presentation` | 已合入 |
| 5 | [#237](https://github.com/molis-ai/molis-work/pull/237)：内置插件随宿主升级，删八份名单 | 已合入 |
| 1 | [#238](https://github.com/molis-ai/molis-work/pull/238)（69f2cd65）：`"web-user"` 收成合同常量 `LOCAL_PERSON_ACTOR_ID`（25 个文件）；`legacyActorId` 由 [#243](https://github.com/molis-ai/molis-work/pull/243) 删（§1 决定） | 已合入；#243 待全量 |
| 7 | [#239](https://github.com/molis-ai/molis-work/pull/239)（bab13d7a）：删旧凭据读取与导入；补充 [#246](https://github.com/molis-ai/molis-work/pull/246)（34ded78f）：通用环境变量不默认 MiniMax、手册写明、删 BL-082 | 已合入 |
| 2 | [#240](https://github.com/molis-ai/molis-work/pull/240)（46b7ec3f）：来源表只按当前结构建，删补列、重建、旧游标拷贝；v35 夹具去掉旧的空来源表 | 已合入 |
| 6 | [#244](https://github.com/molis-ai/molis-work/pull/244)（dfe3765e）：管理入口（CLI、管理 MCP）一律以本机这个人的身份调用；删 V3 导入全链；需求覆盖账本另由 [#252](https://github.com/molis-ai/molis-work/pull/252) 删 | #244 已合入；#252 第三批全量通过，排队合入 |

- 本批验证方式：#237–#240 都动共享核心（插件运行时、宿主、模块、合同），按 10-03 的验证频率合成一个集成分支 `integration/batch-10-04`。整体构建、健康与边界门禁都过，在上面跑一次全量回归，失败先用干净基线比对。全量通过后逐个合入。
- 第一批全量回归（集成分支 `integration/batch-10-04`）：3,753 个用例，3,745 通过，1 失败，7 跳过（需要真实账号的 live 用例），用时 76 分钟。唯一的失败是 `goal-event-document-history`：v35 旧库夹具里的来源表还是旧 CHECK，#240 不再就地重建它，属于预期变化。改为夹具装载时删掉这张空表，补在 #240；之后装载 v35 夹具的 9 个用例文件 40/40 通过。四个 PR 都贴了结果，按顺序合入。
- 第二批（集成分支 `integration/batch-10-04b` = 第一批 + 下面五项）：整体构建一次就过，健康与边界门禁通过。140 个相关非浏览器用例文件里 9 个失败，都是我写的预期变化没跟上：替身会话没写执行者、管理调用者不是本机这个人、旧密钥文件在打开时就被拒绝。已逐个修好，复跑 32/32 通过。全量回归在跑。
  - [#241](https://github.com/molis-ai/molis-work/pull/241)：工作流站点的对象种类。pages、feed、inbox、lingguang 原来拿站点 id 当种类；`subject_kind` 改为必填，加门禁 `workflow-station-kinds`。
  - [#242](https://github.com/molis-ai/molis-work/pull/242)：密钥库删 v0.3 信封升级，加用例 `secret-store-format`。
  - [#243](https://github.com/molis-ai/molis-work/pull/243)：会话执行者必填，删 `legacyActorId`。
  - [#244](https://github.com/molis-ai/molis-work/pull/244)：第 6 条（见上表）。
  - #239 的补充：通用模型环境变量不再默认成 MiniMax，手册写明开发用的环境变量，删 BL-082。#239 合入后另开 PR。
- 第二批全量回归（集成分支 `integration/batch-10-04b`）：3,748 个用例，3,740 通过，1 失败，7 跳过，用时 76 分钟。唯一的失败是 `goals-document.e2e` 的一次 CDP `Runtime.evaluate` 超时，没有断言失败；同一棵树上单独连跑 3 次都通过，第一批全量里也通过，判为全量负载下的时序问题。已合入：#241（67aa74ef）、#242（d142eb72）；#243、#244、#246 排队。
- **验证缺口（10-04 发现）**：`scripts/run-tests.mjs` 不带参数时只收 `tests/*.test.ts`，四个 `tests/*.test.mjs`（Goals 查询与存储边界、草稿对话边界、工作台注册边界）只在 CI 里按名字跑。#244 删了导入文件后，第二批全量没发现 `goals-storage-boundaries.test.mjs` 还读它，是 CI 报出来的。之后每批全量另跑 `node --test tests/*.test.mjs`（第三批 10/10）；让全量也带上它们另开小 PR。
- 第三批（集成分支 `integration/batch-10-04c` = 第二批 + 下面四项）：
  - 整体构建一次，修了一处没用到的类型引用；健康与边界门禁通过。
  - 相关用例里 2 个失败，都已修：`.mjs` 边界用例（修在 #244）；新用例的项目没启用成果库。27 个 Goal / 成果浏览器用例 55/55 通过。
  - **全量**：3,752 个用例，3,745 通过，0 失败，7 跳过，用时 78 分钟；`.mjs` 10/10。
  - 已合入：#249（f1309918）、#250（b106be22，全量也跑 `.mjs`）、#251（a172e540，迁移期工具与 MIGRATION.md 退场）；#247、#248、#252 排队。
  - [#252](https://github.com/molis-ai/molis-work/pull/252)：只有 V3 导入会写的需求覆盖账本。
  - [#247](https://github.com/molis-ai/molis-work/pull/247)：成果库里固定的一版交给插件作为输入（artifact-positioning 10-04 的决定）。
  - [#248](https://github.com/molis-ai/molis-work/pull/248)：Casebook 对外合同改名（§1 决定；外部 Casebook 插件要同步）。
  - [#249](https://github.com/molis-ai/molis-work/pull/249)：PMR-12 守护用例 `assistant-strip-narrow.e2e`。
- 第四批（集成分支 `integration/batch-10-04d` = main + 下面三项）：
  - 整体构建通过；健康门禁就地补表 110 → 72，边界 0 错误。全量在跑。
  - [#253](https://github.com/molis-ai/molis-work/pull/253)：Listener Host 的运行记录去掉对来源表的外键（第 2 条后半）。
  - [#254](https://github.com/molis-ai/molis-work/pull/254)：删 Pages 旧项目按 board_id 分区的迁移（§4.0）。
  - [#255](https://github.com/molis-ai/molis-work/pull/255)：§4.1 第一、二步，Home 级的库各留一份当前 schema 加版本号，见下面一条。
- §4.1 Home 级的库（#255，用户 10-04 授权动真实 Home 的库）：
  - **先只读对照**：在拷贝上逐个比真实 Home 的库与当前代码新建的库。差别只有两种：
    - 列的顺序：pages、forms、datasets、presentations、functions 的列是一处处补上去的，顺序与新建不同；
    - 用到时才建的表：Todo 整理器的两张表、连接器的授权结果表。
  - **基线**：17 个库各写一份，列顺序按真实 Home。上下文账本与连接器宿主导出建表语句，由所在库合进去。characters 本来就是版本 1，会话库只认第 6 版，搜索索引是派生库，三者都不改。
  - **盖版本号**：一次性工具 `scripts/stamp-store-baselines.mjs`。只给结构与基线完全一致的库盖；基线里有、库里还没建过的表建成空表；不一致的原样不动。
  - **演练（已做）**：只拷这 17 个库的文件到会话临时目录，不碰原 Home。
    1. 只读报告：17 个都可以盖（connectors 要补一张空表）；
    2. 写入：17 个都盖上，再报告都是当前版本；
    3. 74 张表的行数盖前盖后完全一样；
    4. 新代码逐个打开 17 个库全部成功，行数不变。
  - **真实 Home（10-04 已做）**：
    1. 4207、4208、4173 都没在监听；Home 里的库没被常驻服务占着（0.2.0 发布版的两个 MCP 进程只转发，没开库）。
    2. 整份备份到 `~/.molis-work-backups/2026-10-04-store-baselines/`（APFS 克隆；1,326,429 个文件与原 Home 一致，抽查的库逐字节相同）。
    3. `--apply`：17 个库全部盖上版本 1；connectors 补了一张空表。
    4. 复核：再跑一次全部报告 current；75 张表（原 74 张 + 补的空表）行数与盖前一样；新代码逐个经基线打开 17 个库全部成功。
    5. 只读模式打不开没有 `-shm` 的 WAL 库（cognia、jelly、todo、workflows 报错 14），所以没跑只读报告，直接 `--apply`：它只给结构一致的库写版本号，其余原样不动。
- **第四批全量**（`integration/batch-10-04d` = main + #253、#254、#255）：3,772 个用例，3,760 通过，5 失败，7 跳过，76 分钟。
  - 4 个失败是 #255 的预期变化：Form、PPT、Images 的用例手工建旧表或删列再期望就地升级，已改成在当前基线上造同样的场景，断言不变；删一条只测「Functions 旧库删列后还能开」的用例。
  - 第 5 个是 `goal-event-document.e2e` 负载下超时，单独跑通过。上述文件加该 e2e 单独跑 39/39。
  - #253（4f992391）、#254（acb98817）已合入；#255 排队。
- 记忆账本的「第一版导入」（10-04 删，分支 `refactor/memory-drop-first-version-import`）：
  - 只读查真实 Home 的助理库：第一版关掉的记忆 0 条、候选 0 条、开关从没存过，导入早已无事可做。
  - 删 `MemoryService.migrateLegacy` 与 `LegacyMemoryState`，删宿主每次调用前的 `migrate()` 包装和读助理库的 `readAssistantMemory`，删 `AssistantStore` 只供它用的记忆方法和两条导入用例。记忆是否关闭只看条目自己的事实。
  - 助理库里的 `assistant_memory_candidates` 表已无人读写，留在助理库基线里，等基线下一版一起去掉。
- Schedule 的旧 Builder 提醒与定时操作导入（10-04 删，分支 `refactor/schedule-drop-builder-import`）：
  - 只读查真实 Home 18 个项目库：旧格式提醒 0、旧格式定时操作 0、孤立执行记录 0；只有演示项目（466d6844）剩 2 个旧键和 1 个没导入的旧 Builder 定时任务（每日小结，下次到点 9-28 已过）。删掉读取后，它到点只会记一次「插件不可用」，不影响别的。
  - 删宿主每次启动的两段读取、两组旧唤醒登记、`pauseLegacyScheduleReminders`、旧唤醒 `board|id` 的引用格式，以及只有导入会留下的「无法恢复的旧执行记录」列表（取消定时操作会连执行记录一起删，所以别处不会产生孤立记录）：列表动作的输出、插件界面、宿主与工作台投影一起去掉。
  - 「重装后确认归属」保留：它是插件重装后把提醒、定时操作交给新安装的现行流程。原来借旧数据造场景的用例改成真的重装一次，断言不变。
- §4.1 项目库（分支 `refactor/project-database-baseline`，叠在 #253、#254、#255 与 Schedule 分支上）：
  - **先只读对照**（真实 Home 18 个项目库 vs 当前代码新建的库）：
    - 新建库只有 71 张表；真实库另有 21 张由各主人用到时才建的表（插件运行时、Scheduler 与 Schedule、Coding、上下文账本、浏览设置）；
    - 13 张表结构不同：多数是列序（一处处 `ALTER` 补上），另有来源表多一列 `cursor_json`、运行记录的外键（#240、#253 改的）、6 个库的出站规则少两列、8 个库的 `runs` 多两列旧列；
    - 16 个库还没有成果库与过程项的表，6 个库没有信号表（新代码打开时才会建）；
    - Coding 会话表在 18 个库里有 4 种列序。
    - 结论：一份基线不可能对上所有库，真实 Home 要「按列名搬进新基线库」，不能只盖版本号。
  - **基线**：`apps/local-host/src/project-database-schema.ts` 把各主人交出的建表语句拼成 `PROJECT_DATABASE_BASELINE`（版本 1）：Goals、执行、依据、治理、成果与过程项、日志、上下文账本、来源、信号、Listener、Attention、Feed 与出站规则、插件运行时五张表组、Scheduler、Schedule 三组、Coding、浏览设置、Casebook。`LocalProjectDatabase` 新库一次建好并写版本；版本不符（包括有表没版本）就拒绝；恢复只看版本。各主人仍用 `IF NOT EXISTS` 建自己的表，在项目库里是空操作；改任何一张表就是新版本。
  - **删掉**：宿主的迁移链（`project-migrations.ts`、`feed-migrations.ts`、恢复时的迁移明细 `project-recovery-details.ts`）、`SqliteSchema` 与 `schema_migrations`；Goals、治理、执行、依据、成果五个模块的迁移文件；Feed 的合同迁移与迁移收据表（Feed 快照的 `contract_migrations` 字段一起去掉）、八处补列、Goal 关联的一次性搬迁；Attention 的 reason 重建；出站规则、Scheduler、Schedule、Coding、插件事件游标的补列与重建；输入绑定的旧来源搬迁；浏览设置读已退役插件存储的一次性搬迁；Coding 后台任务列表对旧列的容忍。
  - **随之去掉的死列与死值**：`feed_items.item_type`（只剩 `'feed'`，`'inbox_message'` 是合同迁移前的旧值，`markRead` 的类型参数一起去掉）与 `feed_items.linked_goal_id`（关联早已只在上下文账本里，列恒为空）。
  - **合同变化**：Casebook 恢复失败只报 `project_recovery_unsupported_schema`（原 `project_recovery_requires_migration` 及其明细没有了，外部 Casebook 插件要同步，与 #248 一起）；Feed 快照少 `contract_migrations`。
  - **用例**：迁移本身的用例删掉（Goals 迁移 12–15/25/26/30/36、Impact 历史、治理 8、Feed 29、Attention 重建、Artifacts 31 的迁移部分）；借旧库造场景的用例改成在当前基线上造。v35 旧库样本改为「带事件前历史的项目」基线样本（`tests/fixtures/goal-event-history/`），由真实 Home 同样的流程生成一次。新增 `tests/project-database-baseline.test.ts`：基线等于入库的 schema 快照、新项目经宿主打开各插件后不多一张表、版本不符拒绝且不改库。
  - **演练（真实 Home 的拷贝，取自 10-04 备份）**：
    1. 用删迁移之前的版本（第四批集成分支）打开一次 18 个库，让当时的全部升级跑完；
    2. 一次性工具按列名把每张基线表的行搬进按基线新建的库（会话临时目录里的 `rebuild-to-baseline.mjs`，不进仓库）：共 36,214 行，0 个外键问题，18 个库完整性都通过；
    3. 不进基线的：空的 V3 覆盖账、18 条 Feed 合同迁移收据、671 条迁移编号、1 条旧导入收据；`feed_items.item_type`（全是 `'feed'`）、两处恒空的旧列，以及 `feed_sources.cursor_json`（81 个值，其中非空的 10 个与 Listener 自己表里的游标逐字相同）；
    4. 补默认值的列只出现在空表或旧代码本来也会补成同样默认值的地方（Coding 归档标记、出站规则、空的插件事件游标表、对话任务归档标记）；
    5. 新代码打开 18 个重建后的库（普通打开与恢复打开都试），459 个 Goal、431 条 Feed 都读得出来。
  - **时机（待用户定）**：重建后的项目库，删迁移之前的旧代码打不开（它会按迁移编号重新建表）。已安装的 0.2.0（常驻服务 4173 与两个 MCP 进程）就是旧代码，所以重建要和换新版一起做。
- §4.1 目录库（分支 `refactor/catalog-drop-migrations`）：
  - 目录库本来就有版本号（`catalog_meta.schema_version`，现 19）和「拒绝更新的版本」。删 1→19 的升级链：项目插件表的四次重建、数据分类补列、旧导入列的删除、运行时绑定的两次搬迁、模型供应商的两次补列；版本不符就拒绝，不就地升级。卸载前的预览不再容忍缺列的旧目录。
  - 顺带删恒空的 `projects.migrated_from_path`，版本升到 20。
  - 用例：删掉 7 条迁移用例；「老目录不建新表」改为「老目录打开时被拒且原样不动」；「迁移时锁超时后服务自己恢复」改为「第一次准备遇到锁、之后自己恢复」（基线下已没有迁移锁，重试逻辑仍在）。
  - 演练：真实目录库的拷贝只差模型供应商表的列序和项目表上的一条约束；按列名搬进版本 20 的新库，655 行全部搬过，只丢恒空的那一列；新代码打开，18 个项目都在。
- **第五批**（`integration/batch-10-04e` = 项目库基线分支（含 #253、#254、#255、Schedule）+ 记忆 + 目录库）：整体构建、`typecheck:all`、边界、健康门禁通过（就地补表 72 → 5）；相关用例全过（项目库 227 个里 8 个失败已修：其中 2 条只测迁移 36 导入规则的用例删掉，运行时的同类规则另有用例；目录与记忆 120 个里 1 个已修）。全量在跑。
  - [#257](https://github.com/molis-ai/molis-work/pull/257)：记忆第一版导入；[#258](https://github.com/molis-ai/molis-work/pull/258)：Schedule 旧导入。
- 门禁第二批（§5a）：空 catch、`as unknown as`、旧产品名的计数，以及 contracts 与插件 SDK 的公开 API 快照，加进 `pnpm health:check`（分支 `chore/health-gates-lint-api`）。公开 API 会随前面的合同改动变化，等本批合入后再生成基线开 PR。
- 「其他旧账号导入」已查（10-04）：**不全是兼容，不能直接删**。
  - `importLegacyAccounts`（`apps/local-host/src/web-connector-connections.ts`）每次列出连接时都会做几种「认领」：旧图片密钥、TypeSafe 的 `FUNCTIONS_CREDENTIAL_REF`、各连接器的 `connector:<id>:…`、模型目录的 `model-provider:<id>`，以及各项目来源里的凭据引用。认领后它们出现在设置的「连接」里。
  - 其中至少三种仍由现行流程写入：模型设置按 `model-provider:<id>` 存密钥（`model-provider-store.ts:96`）；Functions / Jev 仍直接读 `FUNCTIONS_CREDENTIAL_REF`（`functions-host.ts`、`experiments-executor.ts`）；Feed 的 GitHub、Gmail 来源注册仍写连接器凭据引用（`plugins/native/feed/src/connector-service.ts`、`connector-source-registration.ts`）。
  - 所以这里一部分是「活的投影」：把直接存的凭据显示成连接。
  - 处理：记入 §5 的分层问题。连接只有一个主人：现行流程直接建连接，认领只留给确实只有旧数据的那几种；那时再按格式核对真实 Home、删掉认领。不在兼容清单里直接删。
- 「桌面面板的 reconcile 是否仍在用」已查（10-04）：**仍在用，不能当兼容删**。
  - Work 插件的终端面板仍存在 `catalog.desktopPanels`（`plugins/native/work/src/http/panels.ts` 打开、列出、标记退出）。
  - `reconcileLegacySessionCatalog`（`apps/local-host/src/session-migration.ts`）在 MCP、网页会话与运行时面板每次读会话时，把面板与运行时绑定同步进会话库（`registry.migrateLegacy`）。名字带 legacy，其实是活路径。
  - 产品代码里没有 `openDesktopPanel` 的调用者，只有用例在用。
  - 处理：记入 §5 包级清单的分层问题。改成显式的「面板 → 会话」投影，改名，去掉 `legacy` 字样，并把 `session_migration_receipts` 与 `legacy_migrated` 的去留一起理清；不在兼容清单里删。

## 10. §4.2–§4.19 普查与路线（2026-10-07）

方法：九个只读普查各看一到三节（main 15c20920），对照任务书 §7 的完成标准量现状、列已满足/部分/缺失与证据、拆成 PR 大小的切片；再由一个完整性评审合并去重成一条路线。原文与逐节证据见 [roadmap-2026-10-07.md](roadmap-2026-10-07.md)。

**结论**：§4.1 之外，§7 的大多数条目还没满足。路线 87 片分 6 波：

| 波 | 内容 | 片数 |
| --- | --- | --- |
| 1 | 文档对齐、门禁加固（合并基线比对、API 快照、结构门禁、文档引用、页面资源预算、翻译检查、静态检查、密钥扫描、CI 产品子集探针）、协作与合同流程、调用链/扩展点/Home 数据/术语表/依赖与 SDK/C 端/版本策略文档、巨大单元清单重写 | 23 |
| 2 | 删占位合同子路径与死代码、补插件 SDK 出口、两个无版本的库加版本、跨主人 SQL 门禁、项目删除统一、Goals 无生产调用方的桥删除、工作区读一个 id、测试改走公开入口、契约快照门禁、安全不变量逐条测试、逐插件结论与 AI 入口清单 | 19 |
| 3 | 调用 id 贯通、统一错误模型、contracts 里的运行时逻辑迁出、情境启发式归位、注册时交叉校验、Runtime 插件的平台服务、管理入口改走动作、Casebook 能力、跨入口一致性用例、浏览器请求助手 | 10 |
| 4 | 探针插件夹具、Manifest methods 生效、工作区伴随按声明、Form 迁到 Runtime 的样板、助理拆分样板、Prologue 适配器与 Coding 路由拆分、记忆与放置归 Module、周期任务注册、客户端空闲负载、Home 库统一登记、视觉比对 | 12 |
| 5 | 插件按族迁到 Runtime、声明式登记、翻译按主人分、浏览器代码打包与类型检查、删旧皮肤、贡献挂载器、请求处理改注册表、宿主入口收窄、其余巨大单元拆分、宿主瘦身、测试并发隔离、结构化日志、术语改名、成熟度词表、Home 快照命令、目录库路径派生 | 17 |
| 6 | 删旧插件 API 别名与短路由、生命周期用例扩到迁移后的生产者、Skill 与手册统一更新、§3 指标重量、最终回归、交付汇总 | 6 |

**评审发现的覆盖缺口**（已并入路线）：静态检查、安全不变量测试、术语表、依赖普查、创作台 Skill 回放工具、逐插件结论、AI 入口清单、前端质感走查、第一步场景与快照的回归比对、「明显下降」没有数字目标、开工与收尾的 §3 指标对比；另有两个库没有版本（experiments `private.sqlite`、alchemist `search.sqlite`，与 §4.1「每个库一份当前 schema」相冲突，W2-05 补）。

**C 端就绪方案**（§4.19、交付第 22 项，W1-21）：[c-end-readiness.md](c-end-readiness.md)。三个里程碑（M1 能装到第二台 mac、M2 保持更新不丢数据、M3 不止 macOS）、各项成本与依赖、5 个探针，以及它们与各波的对应（它的 §4.1）：M1 的前置片在第 4、5 波，所以 M1 最早在第 5 波之后收口。还要用户定的 7 项在它的 §8，用到的已定决定在它的 §0.1；用户决定后各写成 §1 表的一行。

**普查之间的矛盾，按日常取舍定**（记入 §1）：宿主测试不加 `./testing` 子路径，测试走公开入口与 test-kit 助手；助理先就地按包形边界拆、再搬包；`goals-page-renderer.ts` 是外壳页面渲染器，改名留在工作台；门禁基线先加「与合并基点比对」，baseline.json 暂不拆；Home 库登记放在 storage、插件库由插件声明；插件模型端口做成 Runtime 插件服务（由 agent-host 支撑），不新增 typed capability；`stamp-store-baselines.mjs` 等 W2-05 用完再删；调用 id 只在 W3-01 做一次；探针插件夹具只做一套；实验的 grok/laya 本地调用登记为例外，删除条件随 Prologue 收敛口径。

**用户决定**（27 项，10-07 至 10-08 分 7 批弹窗，全部已定；原因与细节见 §1 各行）：

| # | 问题 | 决定 |
| --- | --- | --- |
| 1 | 两套能力机制收敛（N-12） | 对外的只走动作 |
| 2 | 记忆、放置与情境启发式归属（N-03） | 架构里加一类「平台产品服务」，代码不搬 |
| 3 | 系统助理去向 | 先就地拆、再搬成独立包 |
| 4 | IM 实验与「讨论」页签 | 保留并继续迭代，只修数据登记、越界读表与归类 |
| 5 | 调用编号上界面 | 错误详情里显示短编号可复制，诊断页按编号列出 |
| 6 | MCP 连接工具的 actor_id | 从可信会话取并删参数 |
| 7 | 宿主设置写入 | 留作管理接口并登记例外 |
| 8 | Casebook 能力 | 随 N-12：同 id 插件受众动作 |
| 9 | 插件平台范围 | Home 级 Runtime、数据不动 |
| 10 | 第一个迁移样板 | Form 先、Todo 第二 |
| 11 | 第三方插件信任 | 本地装、首次确认、沙箱里跑（只写计划） |
| 12 | 合成根的测试入口 | 不加 testing 子路径（按矛盾裁定） |
| 13 | SSOT 与 CODEOWNERS 负责人 | 角色加账号、评审请求不强制 |
| 14 | CI 产品子集 | 先不挡、两周后并入 Verify |
| 15 | 「不留兼容」窗口 | 第一个装到开发机外的版本 |
| 16 | 翻译 | 全部换成稳定键 |
| 17 | 视觉验收与页面体积 | 自动比对像素、超阈值给用户看；体积先冻结 |
| 18 | 非内置插件的 methods | 和内置插件一样注册 |
| 19 | 没有使用者的接口 | 删按需搜索，记忆只给 MCP |
| 20 | 备份与清除范围 | 离线快照命令，清除覆盖所有登记的库 |
| 21 | 真实 Home 残留 | 核对后清理，目录库路径改推导 |
| 22 | 评审截图与根目录材料 | 只留被引用的，商业材料移出仓库 |
| 23 | 版本与发布 | 一个产品版本，下一版 0.3.0 |
| 24 | 工作树、分支与仓库设置 | 本会话清本地；用户清远端并开自动删除 |
| 25 | Prologue SDK 与私有包 | 推上游分支，私有包不再随仓库发 |
| 26 | Characters 的代码身份 | 并进宿主，变成设置的一节 |
| 27 | 术语合并范围 | 文档一个定义、内部名跟着改、界面用词另列审批 |

**第 1 波产出**：W1-20 依赖清单与 Prologue SDK 收敛方案（2026-10-08）见 [dependencies-and-sdk-plan.md](dependencies-and-sdk-plan.md)；根 `package.json` 已固定 `packageManager`（pnpm 11.9.0），CI 与发布工作流读它。

## 11. 平台逻辑复查（2026-10-07，补第一步按 Goal 收窄的范围）

用户更正：上一轮逻辑复查只查了 Goal 的完成规则与写进 Goal 的管理门。本轮按事实主人分 8 个区（插件基座、动作服务与授权、成果库/放置/上下文账本、搜索/记忆/助理、个人插件、文稿与数据插件、工作流插件、Coding/创作台/炼金术士），只读查逻辑缺陷，每区一个对抗核验者逐条复现或驳回（复现脚本在会话临时目录 `logic-review/`）。

结果：67 条候选，4 条驳回，63 条成立（高 7、中 25、低 31；53 条已复现，其余读码确认）。按主题分 15 组修，每组一个 PR，先补回归用例再修：

| 组 | 条目 | 状态 |
| --- | --- | --- |
| 插件生命周期（停用后升级被重新启用、卸载后不能装别的版本等） | #1, #3, #60, #4, #5, #6, #7, #10, #12 | 修好待开 PR（`fix/plugin-lifecycle-states`） |
| 工作区默认接线覆盖用户固定的成果版本 | #2, #19 | #301，整合回归通过，排队合并 |
| 成果发布与归属（移出再移回后固定成旧版本、Agent 固定后本人不能再固定、个人范围读取不查归属等） | #15, #41, #16, #17, #18, #20, #21 | #304，整合回归通过，排队合并 |
| Feed/Inbox（定时拉取失败后每 30 秒重拉、归档只关一条 Inbox 等） | #50, #51, #53, #54, #57, #58 | #302，整合回归通过，排队合并 |
| 搜索打开时把读不到的对象当已删并移出索引 | #22 | #305，整合回归通过，排队合并 |
| 动作队列与身份（串行动作被并发动作调用时绕过队列、等模型的动作占住项目队列、进度能力从输入取身份等） | #9, #11, #13, #14, #61, #52, #63 | #308，整合回归通过，排队合并 |
| Todo（整理覆盖本人后改的字段、request_id 跨项目全局） | #55, #56 | #306，整合回归通过，排队合并 |
| 助理（开轮前就标记已告知、作业跟两次、撤销无占用、归档不停定时轮等） | #23, #25, #26, #29, #31 | #311，整合回归通过，排队合并 |
| 记忆（写入门按模型的 same_as 自动保留别的工作的建议、撤销自动记忆删掉本人明说的、recall 无 beforeEffect） | #24, #27, #32 | 修复中（第 5 轮评审仍有一处必修） |
| 个人插件（Jelly、灵光、Cognia） | #33, #35, #36, #37, #38, #39, #40 | #310，整合回归通过，排队合并 |
| 文稿与数据插件（交接标题超长、Form 来源取自输入、AI 发请求前不复核权限等） | #42, #46, #47, #48, #49 | #303，整合回归通过，排队合并；问卷停止收集时拒绝非本人提交（10-08 弹窗）另补 |
| Workflows（判断拦下的运行重载后丢原因、并发令牌不变） | #43, #44 | #307，整合回归通过，排队合并 |
| 删除项目留下别的主人的数据（弹窗已定：各主人一起删、可重试） | #30, #34, #45, #59, #62 | 修复中（第 5 轮评审仍有一处必修） |
| 助理记忆工具（弹窗已定：核对原话、忘掉可撤销） | #28 | 修复中（第 5 轮评审仍有一处必修） |
| 旧版 MCP 授权文件（按「不留兼容」不修） | #8 | 不修（§1） |

逐条原文（问题、位置、场景、核验理由、复现脚本、修法提示）保存在会话临时目录 `logic-review.json`；修复 PR 的描述逐条引用编号。
