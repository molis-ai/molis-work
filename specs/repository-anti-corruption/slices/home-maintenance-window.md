# 设备 A：统一 Home 维护窗口

状态：准备中；第一步仓库盘点完成，第二步候选 #1538/#1549/#1552/#1553 已交接，BL-780与Memory两段已补演练。第三步本次获准只读复制和预检完成；发现旧workspace身份及关联记录待统筹裁定。第四步未获时间与逐项授权、未开始。Memory2→3→4按统筹6516758896的新决定纳入同窗。负责人：Codex（设备 A）；统筹：Claude 统筹；唯一协调通道：issue #1332。

## 本次执行合同

用户 2026-10-29 明确授权盘点、在自己的工作树合 main 和修复维护代码、临时 Home 演练、secrets 后普通推送及开 base main PR。主检出不 checkout/switch/reset/stash。第一、二步没有访问真实 Home；统筹6516315418记录本次用户同意只读复制，第三步按所记范围进行，不停服务、不动源文件与配置、不碰Keychain。真实写入仍须另获明确时间与逐项范围。10-29 上一次维护窗口已取消（#1332 评论 6486081779），不沿用那次许可。

目标是一次可执行、可复核的维护窗口：代码侧准备充分后才问真实拷贝许可，实际维护后才勾 CHECKLIST。使用当前严格基线，不加启动 ALTER、旧值兼容或猜 owner。脚本只在显式路径操作，一库一事务，错版、错结构或失败整库不改；跨库步骤明确每库提交边界和从完整备份恢复的方法，不冒称全 Home 原子。

## 第一步：仓库盘点（冻结 main ac5735fb2a）

下表保留第一步当时的仓库盘点（40 行；当时真实值全部 NOT READ）；第三步的实际版本、工具补齐结果和当前待决项见文末，不将旧缺口描述当作当前状态。脚本无目录前缀时在 `tests/fixtures/`，测试在 `tests/`。名称拼写与现行 CHECKLIST §3 对齐。不因旧分支远落后而把它的旧版本降回 main。

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

## 后续工具片（2026-10-29，候选，未维护）

三库严格预检 #1538 保持冻结；后续在 feature/maintenance-window-tools-a 上补项目7→8→9→10→11的完整版本/结构守卫、Pages1→2、Connectors1→2、Home Runtime2→3、Goals命名与个人方法的只读结构预检。所有 SQL 必须由注册守卫的包装器执行，不直接交 sqlite3；错误结构、视图/触发器、错误版本拒绝，保留原库。目标结构与独立的新建生产库/owner baseline 比较，旧库每张原表行数不变；新增根/插件账本或空通知队列按现行合同分别验证。

RAC-2320 Pages 保留非空正文、待完成发布、导入收据并新增空评论表；2321 Connectors 保留连接/凭据引用/绑定/协议/取消收据，补 enabled=1、removed_at=NULL 与空观察；2322 六个 Home 库错版本和后置故障整库回滚。项目链沿用 PLIB-05、SYS-15-S6、RAC-397/497/514，另外补 RAC-2323 完整错结构拒绝。Goals个人方法仍一库一个事务；跨两库的部分成功边界已问统筹（#1332 6514685039），未获新裁定前不改为 ATTACH 或改变 journal 模式。

现有脚本和演练仅支持声明的旧结构；遇到未识别的插件库/对象或版本，不猜测、不兜底，带预检结果交统筹。真实 Home 的值全为 NOT READ；拷贝与维护均未获本次同意。安装、恢复与本人验收均未完成。

后续补齐 Characters 孤儿记录的单库工具（RAC-2329）：只处理 `io.molis.work.characters` 的安装、发行存档和按该安装编号持有的私有值、来源事件、订阅游标/恢复记录、通知；其他插件的行与已发布固定成果保持原值。发现依赖该安装的 Schedule 绑定、按插件号绑定的端口/输入组或库账本，先只报阻塞，不自动删这些事实。list 只读数字；apply 必须在项目库11、完整结构与完整性检查通过后单一事务，核对逐表删除数和其余表行数，途中故障整库回滚。没有本次用户逐项同意，不对真实 Home 执行。

JSON 维护用外部备份目录保留原件并暂存新文件，同文件系统一次 rename 发布；不在 Home 留临时文件，发布前失败保留源文件，发布后读回异常立即停、不自动降回。MCP2→3（RAC-2324）只增授权 generation；Shelf1→2（RAC-2330）只去 origin_realpath 与改版本，其余事实原样保留，错版本/完整布局拒绝；测试在实际 owner 上读回。RAC-2327/2328 的只读复制和元数据分类已在临时 Home 演练，非空 WAL 明确 NOT READ，不把 immutable 主文件当最新状态。

Inbox 绑定（RAC-2331）与 Feed 引用账（RAC-2332）改为完整生产库演练，读写前核全库版本/结构/完整性，目标每库一个事务；引用账只读材料引用与回执的 content_refs 元数据，不读取正文。跨库搬迁保留既有顺序，目标提交、读回后才删源；源阶段失败明确部分成功并停下，是否接受此边界仍等统筹 6515664506 裁定，不自改跨库 journal。BL-780 先提供只读分类（RAC-2333）：复用 Goals 公开的需决策/归属函数，只报待指派、重复、已结算、缺 Goal 或异常 reason 数；apply 顺序尚待同一裁定，不私自放宽 v11 的 owner 守卫。Memory2→3→4执行入口与原暂停状态已问统筹6515729779，由原 owner 交当前证据后纳入窗口。

串行维护另有一个明确的新库准备步骤（RAC-2334）：v11之后、Inbox绑定与Feed回填之前，在维护副本上用 Plugin Runtime 的公开 `openPluginProjectDatabase` 按 Inbox 当前 Manifest 建空绑定库并登记账本；用 Storage 当前 `applySqliteBaseline` 建不存在的 Feed Home 引用账。只创建确实不存在的新库，已存在的版本/完整结构必须相同，空白旧库也拒绝；不启动 Host，不装配 Agent，不调用模型，不把它写进启动逻辑。list先报是否须新建及预期新增行，新建项纳入用户逐项决定；真实执行还没有授权。

统筹6515692388追加 T-182：第三步在目录库副本上只数没有任何 workspace_project_memberships 成员的 workspaces（RAC-2328），列入维护计划，由用户逐项决定清不清；不写启动清理。只读复制同时检查复制前后的 WAL 与源文件状态，复制中出现 WAL 或变化就丢弃该副本并记 NOT READ，不报告过时值。

代码侧证据（2026-10-29，尚未真实维护）：19个工具文件的隔离演练通过，后续个人方法源阶段故障追加一项并通过，当前合计99项；原有 Runtime 配置备份与 IM 邀请维护另外两文件12项通过。版本/完整结构拒绝与真实事务回滚都直接执行交付脚本；JSON 在公开 owner 上读回，Feed 更正后用实际 producer 续写下一版。readonly体检4项包含实际 WAL 交错、目录路径陷阱、700/600权限与元数据隐私；T-181另外连实际 Pages导入收据，只读标题列，SQLite把孤立代理转成替换字符的情况仅记候选，不宣称已证实损坏。原三库 #1538、W5-17 #1549 已交接；这些证据不涵盖真实拷贝、维护、安装、Memory完整采用或本人验收。最终合 main、health/boundary/secrets 与 PR 链接在交接时补记。

统筹6516315418（2026-10-30）：本次用户同意按6515560840范围只读复制，写操作仍逐项问；跨库选A，先核全两库版本/结构、每库单事务，源阶段失败明确部分成功并停，由统筹按备份决定；BL-780按v10先清/合、待决定owner留给紧接的v11，已v11再处理null-owner，不放宽v11原守卫。该答复原来将Memory排除；此项已被下述6516758896新决定覆盖，其他边界仍保持。

BL-780执行（RAC-2335）：单库单事务，只按当前Goals公开的待决定与Goal归属函数识别；v10先删已结算/重复的null-owner条目，不改任何owner，并拒绝已有owner的库，保持原v11守卫。v11对同样的存量null-owner清理后，将剩余待决定条目指派给Goals，保留已忽略状态和修订；同一决定已有Goals条目时保留其原状态。Attention事件所有行及原entry_id保留，v11仅给本次处理的已识别null-owner事件补Goals归属（与既有v11归属规则一致），不改时间、类型或日志；v10全部留给原v11 SQL。缺失Goal、异常reason、错版本/完整结构或途中故障均拒绝/回滚，不猜测。演练必须包含v10清理接原v11、v11保留已忽略状态与历史、途中故障和未知项拒绝。

统筹6516758896转达用户的新决定覆盖6516315418第4项：Memory2→3→4由本线接下，进同一窗口；只读拷贝授权不扩为任何真实写入。RAC-2336：一次性工具只在明确路径的离线Home执行2→3，将main历史 `b87cf34d3b^` 的六字段有效偏好及继承规则物化（个人、项目默认和已有项目覆盖；旧无显式值时auto=true，不换成新Home reviewed选择），与existing-home采用记录同一库同一事务提交。已存的开关、消费者和插件限制按原计算保留，未知字段/身份/结构/版本拒绝，不猜测或重设。这个机制只存在维护夹具，产品读取器不新增兼容。RAC-2337：3→4仅调用现有Host `adoptMemoryHome`，由storage原inspect/begin/complete和Agent Host真实SDK采用/核验后发布4；部分成功/失败保留adopting并停，不改PRAGMA冒充采用，不自动回退。一次性Home覆盖v2完整结构、有效偏好独立期望、错误版/结构与写中故障整库回滚，以及真实SDK加密旧正文采用后经现行公开服务读回。真实副本只预检版本/条数，SDK加密正文与密钥仍NOT READ；17,366只是所有加密记录的文件数，不能当作记忆条数。

## 第三步：获准只读副本与维护计划（2026-10-30）

授权来源：统筹在 #1332 的6516315418记录本次用户同意。SQLite源以 `mode=ro&immutable=1` 打开并 `VACUUM INTO`，只打开副本派生路径；没有沿目录库的原绝对路径访问项目库。副本在 `~/molis-work-backups/2026-10-30-readonly-maintenance-window-a/`，目录700、文件600。138份＝136个SQLite和MCP/Shelf两JSON，活动WAL/复制中变化0；136库integrity均ok、foreign_key_check均空。这里不是整份离线备份、密钥可用性或SDK正文可恢复证明。第四步还没有获得时间与逐项授权。

下表逐条对齐CHECKLIST §3的40行。未建库不会在只读阶段打开创建；v7项目里的插件账本不存在，不能把它误报成各插件已升至当前版本。

| 位置 | 本线 main 版本 | 副本实测 |
| --- | --- | --- |
| `projects/<project_id>/molis-work.db` | 11 | 7 × 18 |
| `projects/<project_id>/molis-work.db#coding` | 1 | v7中没有插件账本（18库） |
| `projects/<project_id>/molis-work.db#feed` | 2 | v7中没有插件账本（18库） |
| `projects/<project_id>/molis-work.db#goals` | 1 | v7中没有插件账本（18库） |
| `projects/<project_id>/molis-work.db#inbox` | 1 | v7中没有插件账本（18库） |
| `projects/<project_id>/molis-work.db#schedule` | 1 | v7中没有插件账本（18库） |
| `projects/catalog.db` | 22；W5-17候选23，#1101先占号则24 | 22 |
| `functions/functions.db` | 4 | 3 |
| `assistant/assistant.db` | 3 | 2 |
| `plugin-runtime/plugin-runtime.db` | 3 | 副本不存在；未创建 |
| `plugin-libraries/plugin-libraries.db` | 1 | 副本不存在；未创建 |
| `plugin-directories/plugin-directories.db` | 1 | 副本不存在；未创建 |
| `plugin-originals/plugin-originals.db` | 1 | 副本不存在；未创建 |
| `issues/issues.db` | 2 | 副本不存在；未创建 |
| `goals/goals.db` | 1 | 副本不存在；未创建 |
| `feed-content/feed-content.db` | 1 | 副本不存在；未创建 |
| `memory/memory.db` | 4 | 2 |
| `knowledge/knowledge.db` | 1 | 副本不存在；未创建 |
| `form/form.db` | 2 | 2 |
| `placement/placement.db` | 1 | 1 |
| `agent-definitions/agent-definitions.db` | 1 | 1 |
| `agent-declarations/agent-declarations.db` | 1 | 副本不存在；未创建 |
| `connectors/connectors.db` | 2 | 1 |
| `context-onboarding/context-onboarding.db` | 1 | 1 |
| `cognia/cognia.db` | 1 | 1 |
| `dataset/dataset.db` | 1 | 1 |
| `images/images.db` | 1 | 1 |
| `jelly/jelly.db` | 1 | 1 |
| `lingguang/lingguang.db` | 1 | 1 |
| `pages/pages.db` | 2 | 1 |
| `ppt/ppt.db` | 1 | 1 |
| `todo/todo.db` | 1 | 1 |
| `workflows/workflows.db` | 1 | 1 |
| `alchemist/projects/<编码后的 project_id>/studio.sqlite` | 1 | 1 |
| `server/server.sqlite` | 2 | 1 |
| `characters/characters.sqlite` | 2 | 1 |
| `search/search.db` | 2 | 2 |
| `feed/secrets.json` | 2 | NOT READ（凭据） |
| `config/mcp-tools.json` | 3 | 2 |
| `alchemist/projects/<编码后的 project_id>/search.sqlite` | 1 | 副本不存在；未创建 |

副本预检：18/18项目可按完整v7结构进入v8；Characters/Functions/Assistant/Pages/Connectors五库的完整旧结构全部通过。Memory2完整结构通过，偏好0、strategy-adoption0，现有其他marker2条保留。目录personal move的list为0条；个人规划表仍在，故PG-077与W5-17当前list按其前置条件拒绝，这是必须先搬个人方法/移除该表的顺序约束，未在只读副本上执行DROP或其他维护。

| 顺序 | 库、从→到 / 工具 | 副本预检与预计改动 | 不做的后果 / 恢复边界 |
| --- | --- | --- | --- |
| 1 | 停全部同Home写入者；整份离线备份；再建演练副本 | 按CHECKLIST4.1/4.2，按pid确认服务/端口与进程；逐文件比对、记大小/方法；原Home主密钥只确认存在 | 本次只读副本不能替代此项；任一前提不符停止 |
| 2 | 项目7→8，`project-maintenance.mjs --target 8` | 18库全部预检通过；原业务表行数保持，新增项目根18行、四个声明账本72行；18条initialize_board请求指纹按原v8 SQL转换 | 旧项目无法由新构建打开；每库单事务，失败零改 |
| 3 | 项目8→9，同工具target9 | 新空schedule_action_bindings；旧schedule_jobs 1条停用并清lease，时间/历史保留 | 无可信安装授权，不先重新启用；需本人之后重新绑定 |
| 4 | 项目9→10，同工具target10 | 171安装：host161、sandbox10、其他0；Attention两表加null owner，行数不变 | workspace17条的身份尚待裁定；不得把未确认的host身份直接当作完成，见下方阻塞 |
| 5 | 项目v10 BL-780，`goal-decision-reminders-maintenance.mjs apply`；随后项目10→11 | 未归属提醒23＝已结束21、待决定2，重复/未知Goal/reason0；先删21、保留2给原v11。Attention事件177行保留，原v11按subject补owner；Feed账本18行1→2，新增空通知表18份，Feed旧边键0 | 不清旧提醒会留下已结束工作；不跑v11则当前Feed/Inbox不可用。原v11守卫保持不变，测试含v10衔接与v11已忽略状态 |
| 6 | Goals旧名，`scripts/maintenance/goals-journal-names.mjs rename` | 18库：events5472、idempotency5580、edges0；改名称/游标归属，行数保持 | 不做会被Goals个人方法搬迁屏障拒绝；不再运行旧S9脚本或给Goals子库加版本2 |
| 7 | Goals个人方法、PG-077成员、W5-17目录，依次`goals-personal-planning-move.mjs move`、`artifacts-project-membership-maintenance.mjs apply`、`catalog-path-maintenance.mjs rewrite` | catalog22有18项目、91成员；个人方法0行，目标Goals1尚未建。搬出空表后删artifacts成员15行/排除0；再22→23删database_path列、18项目保留，实际文件只按Home+project_id派生 | 两库先全预检，目标提交且读回后才删源；源失败保留两库状态并停。#1101若先取23，本步改24并重新演练，不碰其分支 |
| 8 | 五Home库：Functions3→4、Assistant2→3、Characters1→2、Pages1→2、Connectors1→2，`home-store-maintenance.mjs`各一库 | Functions14；Assistant设置3/其他0；Characters草稿0；Pages24/导入2；Connectors连接6/绑定2/目标1，原表数量均保持，新表为空。Home Runtime库不存在，不能当作2→3已做 | 任一旧版仍阻止新构建；每库单事务、版本/完整结构拒绝。Functions绑定0，后续Inbox搬迁应为0 |
| 9 | `prepare-window-stores.mjs`；Inbox绑定、Feed引用账 | 项目11后按Inbox Manifest建空绑定库18份及账本18行；新Feed-content1库，现有hold0，回填只写complete_since标记1；只读扫描不会消费加密正文。Inbox旧场景绑定0 | 不准备目标就不能搬绑定/标完整；source phase失败停且保留两库状态 |
| 10 | Characters孤儿，`characters-orphan-maintenance.mjs`（项目11后） | 安装18、发行存档18；安装私有值/事件/游标/恢复记录0，现有端口/input阻塞0；预计删36记录。固定Character成果与版本保留，非空成果演练已读回 | 不清则旧安装身份残留；仅本插件作用域，其他记录不动，需本人逐项同意删除 |
| 11 | Memory2→3→4，`memory-window-maintenance.mjs --step preferences`再`--step sdk` | prefs0/采用0/其他marker2；2→3新增有效偏好2、采用marker1。3→4预期更新偏好2+采用marker1及版本，由真实SDK逐页转换/核验；SDK种类数与加密正文NOT READ，不能估成0 | 不做仍被现行Memory启动门拒绝；2→3单库事务回滚，SDK部分成功保留adopting并停，不回写版本或假装全Home原子 |
| 12 | MCP JSON2→3、Shelf JSON1→2 | MCP4授权、enabled0、clients2，逐条加generation，权限/启停保持；Shelf1条含path，移除该字段、其余原样。原件外置、发布后经公开owner读回 | 新构建拒绝旧JSON；每份私有外置原件、同盘原子发布，发布后异常停止，由统筹决定恢复 |
| 13 | IM server1→2、Runtime配置备份B2b | IM rooms0/receipts0，原邀请内容NOT READ；使用现有`im-invite-maintenance.mjs`重建v2。Runtime配置备份可能含凭据，本次未复制/未读，`runtime-config-backup-maintenance.mjs`真实逐项数字NOT READ | 必须先取得含相应凭据读取/密封操作的明确范围；IM被换下原库外置，B2b保持原Keychain，不删旧备份 |
| 14 | 安装与只读验收 | 仅全部副本演练通过后统筹按依赖合PR，本线用干净合入后main构建。按CHECKLIST4.4/4.5装构建，needs_repair才service install --confirm；核459 Goals、0固定成果、18项目、4授权及所有版本、integrity/FK、安装清单；抽查可读另获内容范围 | 工程/SDK隔离演练不等于真实Home恢复、产品实操或本人验收。旧Session重开/Runtime授权单列本人事项 |

所有行都仍为候选未做；4.3步骤在本次演练副本先全套跑通，真实库才沿同一流程执行。运行各步前重算数字；和这里不符即停，不用SQLite改版绕过。脚本内部未提交事务按合同回滚；已提交库或SDK转换后的恢复由统筹按整份离线备份、原路径/原key和后续删除决定安排，不自动逆向改库。被替换原库搬到Home外的700目录，旧备份不清理。

必须由统筹交给用户的决定：维护时间及停服务/备份/安装；上述每项库变换与写入；schedule旧任务1条停用、BL-780删21、Character删36、PG-077删15目录成员；Memory保留旧有效auto=true的物化及SDK加密采用；MCP4条generation和Shelf1条path去除；IM/B2b所需私有内容读取范围。现有授权仅支持第三步只读核对，不能代签第四步。

R-54 ui.commands仅发行存档99、安装0；R-66 disabled0；R-69 native:feed成果线0/版本0，本窗没有需要写的生产者行。T-181：引导journey1、由真实导入收据定位的Pages标题1，半字/替换字符候选0，Todo引导候选0。T-182空workspace1只计数，不清空workspace。不存在的Home新库将在获准新构建的首次装配按当前基线创建，单列“未创建”，不伪称维护通过。

**当前待裁定阻塞（#1332 6517024309）**：旧 `io.molis.work.workspace` 安装17条不在当前生成的内置登记里，另有private_values3、port_bindings34、port_outputs3；archives/events/cursors/resolutions/inputs/port_artifacts0。只读元数据，不读私有值，不把它归作Characters空孤儿。推荐原owner确认身份/去向后形成专门方案，未定前保留，不能直接映射为可信host并宣称窗口可执行。

136库中96份位于固定40行清单之外：Images内部SQLite93、旧Alchemist1、已下线Sessions1、凭据锁1。HOME-DATA分别说明归属；只查版本/结构/完整性，不读其正文、不据此删除或恢复Sessions业务。Sessions与加密内容仍按原规则备份。原Home主密钥、SDK加密正文、凭据vault与Runtime配置备份没有在第三步被读取；NOT READ不能写成可恢复。

新增演练证据：BL-780五项（含原v11衔接、已忽略状态/全部历史保留、拒绝与写中回滚）通过；readonly四项在加入owner路由和动态Alchemist布局后通过；Memory窗口新三项通过，现有storage/Host/SDK采用三文件23项通过。首次测试夹具的数组取值/SQLite行原型与SDK场景授权错误保留于日志，已按公开合同修正夹具，未放宽生产断言。真实SDK测试不调用模型。
