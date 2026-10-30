# 设备 A：统一 Home 维护窗口

状态：准备中；第一步仓库盘点已完成，第二步代码与一次性 Home 演练未完成。第三、四步未获本次授权、未开始。负责人：Codex（设备 A）；统筹：Claude 统筹；唯一协调通道：issue #1332。

## 本次执行合同

用户 2026-10-29 明确授权盘点、在自己的工作树合 main 和修复维护代码、临时 Home 演练、secrets 后普通推送及开 base main PR。主检出不 checkout/switch/reset/stash。真实 Home 的文件、服务、Keychain、本机安装和配置均未访问；真实拷贝核对须先由统筹弹窗获准，真实写入须另获明确时间与逐项范围。10-29 上一次维护窗口已取消（#1332 评论 6486081779），不沿用那次许可。

目标是一次可执行、可复核的维护窗口：代码侧准备充分后才问真实拷贝许可，实际维护后才勾 CHECKLIST。使用当前严格基线，不加启动 ALTER、旧值兼容或猜 owner。脚本只在显式路径操作，一库一事务，错版、错结构或失败整库不改；跨库步骤明确每库提交边界和从完整备份恢复的方法，不冒称全 Home 原子。

## 第一步：仓库盘点（冻结 main ac5735fb2a）

下表版本逐条对 main 定义核过（40 行）；真实值全部 NOT READ。脚本无目录前缀时在 `tests/fixtures/`，测试在 `tests/`。名称拼写与现行 CHECKLIST §3 对齐。不因旧分支远落后而把它的旧版本降回 main。未升版的项不臆造维护脚本；完整性、数量与 owner 检查留到获准的副本。

| 库 | main 版本 | 合并后目标 | 维护脚本 | 演练用例 | CHECKLIST / 真实状态 |
| --- | --- | --- | --- | --- | --- |
| 项目库 `projects/<project_id>/molis-work.db` | 11 | 11（旧 S9-0b 的 10 已包含；S9-2 不再另升整库） | project-maintenance-v8.sql → -v9.sql → -v10.sql → -v11.sql | project-maintenance-v8/-v9/-v10/-v11.test.ts | 4.3 维护八及 v11：均 [ ]；真实 NOT READ |
| 项目库里 Coding 的表 `projects/<project_id>/molis-work.db#coding` | 1 | 1 | 本线无版本转换 | 现行基线/owner 回归；实际副本未核 | 无本线维护项；真实 NOT READ；真实 NOT READ |
| 项目库里 Feed 的表 `projects/<project_id>/molis-work.db#feed` | 2 | 2 | project-maintenance-v11.sql（与整库同一事务） | project-maintenance-v11.test.ts | 4.3 v11：[ ]；真实 NOT READ |
| 项目库里 Goals 的表 `projects/<project_id>/molis-work.db#goals` | 1 | 1（旧 S9-2 试稿为 2；main 改用 names→move 屏障，须裁定不重复升级） | scripts/maintenance/goals-journal-names.mjs | goals-journal-names.test.ts | 已落代码；真实执行未做；真实 NOT READ |
| 项目库里 Inbox 的表 `projects/<project_id>/molis-work.db#inbox` | 1 | 1 | 本线无版本转换 | 现行基线/owner 回归；实际副本未核 | 无本线维护项；真实 NOT READ；真实 NOT READ |
| 项目库里 Schedule 的表 `projects/<project_id>/molis-work.db#schedule` | 1 | 1 | 本线无版本转换 | 现行基线/owner 回归；实际副本未核 | 无本线维护项；真实 NOT READ；真实 NOT READ |
| 目录库 `projects/catalog.db` | 22 | 23 候选；#1101 先合则 24；BL-760 仅清成员行不占 schema 号 | catalog-path-maintenance.mjs（旧分支）＋ scripts/maintenance/goals-personal-planning-move.mjs | catalog-path-maintenance.test.ts（旧分支）；goals-personal-planning-move.test.ts | 4.2 路径派生未做；S13 真实未做；真实 NOT READ |
| Functions `functions/functions.db` | 4 | 4 | functions-maintenance-v4.sql | functions-maintenance-v4.test.ts | spec 维护清单：未做；真实 NOT READ |
| 助理 `assistant/assistant.db` | 3 | 3 | assistant-maintenance-v3.sql | assistant-maintenance-v3.test.ts | spec 维护清单：未做；真实 NOT READ |
| Home Plugin Runtime `plugin-runtime/plugin-runtime.db` | 3 | 3 | plugin-runtime-maintenance-v3.sql | plugin-runtime-maintenance-v3.test.ts | 4.3 维护八：[ ]；真实 NOT READ |
| 装进来的插件的 Home 库账本 `plugin-libraries/plugin-libraries.db` | 1 | 1 | 本线无版本转换 | 现行基线/owner 回归；实际副本未核 | 无本线维护项；真实 NOT READ；真实 NOT READ |
| 插件的本机目录授权 `plugin-directories/plugin-directories.db` | 1 | 1 | 本线无版本转换 | 现行基线/owner 回归；实际副本未核 | 无本线维护项；真实 NOT READ；真实 NOT READ |
| 插件原文件登记 `plugin-originals/plugin-originals.db` | 1 | 1 | 本线无版本转换 | 现行基线/owner 回归；实际副本未核 | 无本线维护项；真实 NOT READ；真实 NOT READ |
| Issue `issues/issues.db` | 2 | 2 | 本线无版本转换 | 现行基线/owner 回归；实际副本未核 | 无本线维护项；真实 NOT READ；真实 NOT READ |
| Goals 的个人方法 `goals/goals.db` | 1 | 1（从 catalog 搬入） | scripts/maintenance/goals-personal-planning-move.mjs | goals-personal-planning-move.test.ts | S13 真实未做；真实 NOT READ |
| Feed 的正文引用账 `feed-content/feed-content.db` | 1 | 1（数据回填，不升结构版） | feed-content-ledger-maintenance.mjs | feed-content-ledger-maintenance.test.ts | 4.3 FI-4：[ ]；真实 NOT READ |
| 记忆 `memory/memory.db` | 4 | 4；#1101 自己的后续不在本线改 | 公开 adoptMemoryHome；没有独立 fixtures 脚本 | memory-adoption-maintenance.test.ts 等（须核实际入口与 key 依赖） | spec 2→3→4：真实未做；真实 NOT READ |
| 项目资料 `knowledge/knowledge.db` | 1 | 1 | 本线无版本转换 | 现行基线/owner 回归；实际副本未核 | 无本线维护项；真实 NOT READ；真实 NOT READ |
| Form `form/form.db` | 2 | 2 | 本线无版本转换 | 现行基线/owner 回归；实际副本未核 | 无本线维护项；真实 NOT READ；真实 NOT READ |
| 放置 `placement/placement.db` | 1 | 1 | 本线无版本转换 | 现行基线/owner 回归；实际副本未核 | 无本线维护项；真实 NOT READ；真实 NOT READ |
| Agent 定义 `agent-definitions/agent-definitions.db` | 1 | 1 | 本线无版本转换 | 现行基线/owner 回归；实际副本未核 | 无本线维护项；真实 NOT READ；真实 NOT READ |
| 插件的 Agent 声明 `agent-declarations/agent-declarations.db` | 1 | 1 | 本线无版本转换 | 现行基线/owner 回归；实际副本未核 | 无本线维护项；真实 NOT READ；真实 NOT READ |
| 连接 `connectors/connectors.db` | 2 | 2 | 缺独立可复用维护脚本（现有 spec 只记演练） | 服务接入 spec 记隔离演练；需固定脚本对应回归 | 4.3 维护八：未做；真实 NOT READ |
| 引导 `context-onboarding/context-onboarding.db` | 1 | 1 | 本线无版本转换 | 现行基线/owner 回归；实际副本未核 | 无本线维护项；真实 NOT READ；真实 NOT READ |
| Cognia `cognia/cognia.db` | 1 | 1 | 本线无版本转换 | 现行基线/owner 回归；实际副本未核 | 无本线维护项；真实 NOT READ；真实 NOT READ |
| Dataset `dataset/dataset.db` | 1 | 1 | 本线无版本转换 | 现行基线/owner 回归；实际副本未核 | 无本线维护项；真实 NOT READ；真实 NOT READ |
| Images `images/images.db` | 1 | 1 | 本线无版本转换 | 现行基线/owner 回归；实际副本未核 | 无本线维护项；真实 NOT READ；真实 NOT READ |
| Jelly `jelly/jelly.db` | 1 | 1 | 本线无版本转换 | 现行基线/owner 回归；实际副本未核 | 无本线维护项；真实 NOT READ；真实 NOT READ |
| 灵光 `lingguang/lingguang.db` | 1 | 1 | 本线无版本转换 | 现行基线/owner 回归；实际副本未核 | 无本线维护项；真实 NOT READ；真实 NOT READ |
| Pages `pages/pages.db` | 2 | 2 | 缺独立维护脚本（新增 page_comments） | 需固定维护演练 | 4.3 维护八：未做；真实 NOT READ |
| PPT `ppt/ppt.db` | 1 | 1 | 本线无版本转换 | 现行基线/owner 回归；实际副本未核 | 无本线维护项；真实 NOT READ；真实 NOT READ |
| Todo `todo/todo.db` | 1 | 1 | 本线无版本转换 | 现行基线/owner 回归；实际副本未核 | 无本线维护项；真实 NOT READ；真实 NOT READ |
| Workflows `workflows/workflows.db` | 1 | 1 | 本线无版本转换 | 现行基线/owner 回归；实际副本未核 | 无本线维护项；真实 NOT READ；真实 NOT READ |
| 炼金术士工作室 `alchemist/projects/<编码后的 project_id>/studio.sqlite` | 1 | 1 | 本线无版本转换 | 现行基线/owner 回归；实际副本未核 | 无本线维护项；真实 NOT READ；真实 NOT READ |
| server（讨论） `server/server.sqlite` | 2 | 2 | im-invite-maintenance.mjs | im-invite-maintenance.test.ts | 4.3 表后 B1：未做；真实 NOT READ |
| 角色 `characters/characters.sqlite` | 2 | 2 | characters-maintenance-v2.sql | characters-maintenance-v2.test.ts | 4.3 维护八：[ ]；真实 NOT READ |
| 搜索索引（可重建的派生库） `search/search.db` | 2 | 2 | 现行 owner 按版本清空重建（不当权威数据维护） | 现有搜索回归；真实待核 | 4.5 待核；真实 NOT READ |
| 密钥与凭据（JSON 文件，不是库） `feed/secrets.json` | 2 | 2；不读取值、不换 key | 不做转换；只核格式与依赖的授权范围 | B2b 临时 Home 证据，真实待核 | 只核格式，不预设真实值；真实 NOT READ |
| MCP 授权（JSON 文件，不是库） `config/mcp-tools.json` | 3 | 3 | ACA005 的 list/apply 只在历史临时目录，入库脚本缺 | 既有 ACA005 回归；需可重建维护入口 | spec 2→3：真实未做；真实 NOT READ |
| 炼金术士搜索缓存 `alchemist/projects/<编码后的 project_id>/search.sqlite` | 1 | 1 | 本线无版本转换 | 现行基线/owner 回归；实际副本未核 | 无本线维护项；真实 NOT READ；真实 NOT READ |

### 分支、撞号与剩余工作

| 分支或工作 | 远端头 / 当前证据 | 原目标与当前 main 的关系 | 代码、脚本、演练缺口 |
| --- | --- | --- | --- |
| claude/ac-w517-catalog-paths | 343f26e46；落后 main 280 个提交、独有 2 个 | catalog22→23，项目库仍9；未开 PR | 在自有工作树 merge main，保 main 项目11；新旧路径调用链解冲突；维护脚本补当前 catalog 全结构/错结构拒绝与完整性检查；旧 S-61 已被占，须统筹给当前 S 号 |
| migrate/goals-s9-0b-on-main | e34b91306；原 #1245 closed/unmerged，实际由批次采用 | 原项目9→10，现已和 trust 合成 main 的 v10，现行整体11 | 以 main 验采用，旧分支不得再次带回旧模块/版本；v9→10 的合成脚本已在 main，须演练而非再申请号 |
| migrate/goals-s9-1-on-main | c2c21ba26；原 #1260 closed/unmerged | 只改日志端口，无独有 schema 升版，随组合进入 main | main 已完成模块搬家；不重新引入 modules/goals；核内容采用后请统筹决定旧分支只归档还是留合 main 记录 |
| migrate/goals-s9-2-namespace | d12973ce1；旧试稿 Goals 子版本1→2 | main #1295 已有 names→personal move、Runtime 和现行子版本1；旧稿结构未变 | 旧脚本 goals-namespace-prefix 被现行 goals-journal-names 替代；禁止两套都跑。现行脚本需补错版本/错结构的拒绝、按整库核完整性；未归属提醒 BL-780 另有待维护项 |
| W5-16 B2b 真实部分 | main 已含私有 CLI 状态密封/预检；真实无证据 | 不占库结构号；Runtime 原文 .bak 的 B2a 维护与 B2b 原 key 依赖分别核 | runtime-config-backup-maintenance.mjs 有演练；完整恢复仍未闭合，不冒称可依赖 home restore；真实仅在获准范围内数和验证依赖，不输出秘密/正文 |
| PG-077 第二步 BL-760/761 | main BACKLOG 中没有这两行；现行 pg077-artifacts-provider.md §5/§7 仍列未做 | 方案 A 保留 provider_id，不需要旧 A5 的 MCP/workflow provider 重写 | 删 artifacts 外壳、平台挂载、独立保留平台 id、移走目录成员/隐藏行及演练均待做；需要统筹确认采用现行 slice，避免照旧 BACKLOG 的 system.artifacts 执行 |
| T-181 二审建议 | 用户指定历史引导半字标题 | 代码截断已修不等于历史记录已修 | 只在获准拷贝核 journeys 结构化标题的孤立代理数量；不打印标题或正文；有数据再列用户逐项决定 |

版本顺序：项目库严格 7→8→9→10（trust＋Attention 同一版）→11（Feed＋owner）；本线 S9 不再重占10或11。#1101 当前另有项目11→12 与 catalog23，属于其他作者，本线只读碰撞信息、不改分支；它若先落地，后续有结构变更必须取下一个号。catalog 当前22，建议 names→personal move（现行 main 的结构收口）后 W5-17 22→23；若 #1101 先落，则按新 main 重排为24。旧 S9 子库2不能照搬，提交统筹裁定。PG-077 清数据行不改 schema，不另占版。

### 除分支外的维护缺口

CHECKLIST §4.3 所有候选保持未勾：维护八（项目7→8、8→9、9→10、Runtime2→3、Pages1→2、connectors1→2、Characters1→2、Shelf JSON1→2、孤儿安装），项目10→11、Inbox绑定、Feed引用账、R-69身份改写、助理2→3、Functions3→4、Memory2→3→4、MCP JSON2→3。末尾单列 Attention9→10 是已合并版本的重复描述，文档只修成指向统一9→10。BL-126 仅旧Session重连未做，不重跑旧维护六数据删除。

现存 SQL 中 Characters、Functions、Assistant 只核版本，缺完整旧结构拒绝，不能按用户本次标准直接使用。Pages/Connectors/MCP 的历史演练没有可从本仓库复跑的固定维护脚本。R-69、Characters孤儿清理、R-54 ui.commands、R-66 disabled、BL-780 也尚无固定执行脚本。R-66 不能仅看 disabled 就认定历史误关，需证据区分用户主动停用；不擅自恢复。上述缺口必须在副本预检前补齐，或作为明确阻塞交统筹。

## 顺序与授权闸口

1. 代码准备：先处理 W5-17 与严格维护脚本/演练；已采用 S9 以 main 实现为准；PG-077 第二步独立 PR，不合并。所有构建/测试经 machine-slot，jobs1，不跑全量/不加标签。README 适用必跑与门禁、secrets 通过后交统筹验。
2. 代码能执行后请统筹弹窗问「可以拷贝真实 Home 做只读核对吗」。只有明确答复才 immutable URI→VACUUM INTO；备份目录700。路径只按拷贝的固定布局，绝不沿 catalog.database_path 打开原库。在线拷贝仅作逐库只读体检，不声称同一时点完整备份；有 WAL/不确定项明确标记，维护时以停写后的离线整份备份再演练为准。
3. 只读副本上先版本/结构、安装和授权计数，再各 list、R-54/R-66/R-69/T-181/Characters/BL-780；加密目录 NOT READ，不读密钥和正文。每项写清数字、拟改行数、后果和恢复，贴【维护计划】由统筹逐项问用户定时间。
4. 窗口：获准后按pid停全部owner→整份离线备份逐文件比对与原Keychain存在性确认→新演练副本完整维护→统筹按序合PR→干净合入main构建→真库同流程→旧原件移到Home外700目录→安装修服务→逐库/授权/安装清单/业务可读核对→文档PR和【维护完成】。任何版本/数字异常即停止，不绕过、不降库。

## 验收与证据

- MW-A01：40 行 main 版本、四分支目标、脚本与真实状态分列；源定义和固定 SHA 可复核。
- MW-A02：所有实际采用的维护脚本在一次性 Home 正常完成；describeSqliteSchema 对实际目标基线逐项相等，integrity_check=ok、foreign_key_check为空，非本项的行/值不变。
- MW-A03：错版、错误列/索引/外键/CHECK、视图/触发器与途中失败均拒绝并整库回滚；测试直接运行交付脚本，不复制实现做旁证。
- MW-A04：PR 首行维护警告、影响库/版本/演练和未验证项明确；secrets 通过再普通push；不rebase/force/合并/全量。
- MW-A05：真实拷贝与写入的同意分开；真实维护结束前不勾任何真实项，不声称安装/本人验收。

当前证据：只读仓库检查、分支差异与 GitHub 原 PR/协调记录；没有实际维护或新演练通过。具体代码候选与命令结果在后续章节接续，首次盘点不作通过证明。

## 统筹裁定（2026-10-29）

#1332 [6513987033](https://github.com/molis-ai/molis-work/issues/1332#issuecomment-6513987033)：五项按推荐执行。旧 S9 三分支保留、标“已被 main 取代”、不重开空 PR；catalog23，#1101 先落则24；W5-17 使用 S-102；旧 RAC-240～242 撞号，不再沿用，本线统一 RAC-2300～2399。BL-760/761 按 PG-077 方案A。批准一次性维护工具补缺、现有 SQL 的严格错结构拒绝、相关文档修正。R-54/R-66/T-181 只 list，实际改记录仍要用户逐项定。真实拷贝与写入尚未获本次许可。

## 第二步：现有 SQL 的严格结构检查

RAC-2310 先红：原三份 SQL 在版本正确但多列、索引、视图、触发器时全部错误地提交（12 个子例，父项合计13失败），原件 `/tmp/molis-maintenance-a-20261029/wrong-shape-red.log`。新增离线执行入口 `tests/fixtures/home-store-maintenance.mjs`；三份 SQL 在自己的单一事务内强制调用维护前、提交前两个检查，缺检查函数直接拒绝，不再允许裸 SQL 绕过结构核对。旧结构是固定 SQL 夹具；目标结构来自实际 owner 的现行 baseline，逐项 describe 比对，另验 integrity、foreign keys、所有表行数；助手只改约定 JSON 字段。中途错误关闭连接回滚，CLI 明确 ROLLBACK。

初次严格回归4文件通过（19项，无跳过）；RAC-2311 补实际CLI的只读list、维护、目标逐项比对、重复零改后再核。真实 Home、服务、安装与凭据仍未操作。该 PR 只完成这三库的工具补缺，Pages/Connectors/MCP、项目串行链、W5-17、PG-077 等仍待做，不表示本线第二步完成。
