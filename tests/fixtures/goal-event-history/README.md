# 带事件前历史的项目

四个项目库，各自的 Goal 带着事件工作流之前留下的事实：原来的验收标准与策略作为导入的要求、旧的批准与完成状态。它们是项目库基线当前版本的样子（`PRAGMA user_version` 与 `PROJECT_DATABASE_BASELINE.version` 相同），由 `tests/goal-event-history-fixture.ts` 载入。

做法与真实 Home 搬到基线时一样（repository-anti-corruption §4.1），只做一次：

1. 原样载入 0.2 时的 v35 项目库导出（`tests/fixtures/goal-event-v35/*.sql`，main 7129ad80 之前的 Git 历史里有），去掉其中空的旧来源表；
2. 用删掉迁移代码之前的版本打开一次，让它跑完当时的全部升级；
3. 按列名把每张基线表的行搬进一个按基线新建的库：四个库都没有缺列、没有外键与完整性问题；不进基线的只有空的旧成果表、V3 覆盖账、导入收据与迁移编号表，以及 `feed_items` 的两列空列；
4. 导出成 SQL，开头写上版本号。

基线换版本时这几份要按新基线重新生成：载入旧版本的导出，按列名搬进新基线库，再导出。版本 2（10-04，删旧提案）时各少了一条旧候选与一列空列。版本 3（10-04，删事件前历史）时先在拷贝上做与真实 Home 相同的整理（`goal_event_state_owners.source` 的 `migration` 记为 `intent`，删「迁入的历史完成」与已删记录的日志行），再搬：各少了运行、领取、依据、评审、评审义务与覆盖修订，以及 Goal Tree 提案的空列 `discovered_in_run_id`。版本 4（10-05，删风险、合同修订与旧提案条目）时先做与真实 Home 相同的整理（结构提案只留 goal 新增与关系条目及其决定、Goal 条目只留当前字段，删风险事件、旧的完成与返工事件和带旧字段的回执，补齐规划方法的正文），再搬：各少了风险、Goal 风险关联与合同修订，以及 `goals.current_contract_revision`。版本 7（10-10，删 Casebook）各少了 5 张空的 Casebook 表（`casebook_*`），没有行要整理。版本 8（10-20，项目自成根、插件表记账，PG-020 L1b；Goals 的表由它的 Manifest 声明，S8）不按列名搬，直接在拷贝上跑维护八的语句（`tests/fixtures/project-maintenance-v8.sql`），与真实 Home 做的一样：各多了 `project_root` 一行（取自 `boards`）与插件表账本 `plugin_project_databases` 里 Coding、Feed、Goals、Schedule 四行；`boards` 重建成没有 `title` 列、外键指 `project_root`，行与 rowid 不变；十一张指向 `boards` 的表改指 `project_root`，在库里重建，导出里排到最后、写成 `CREATE TABLE IF NOT EXISTS "<表>"`；建看板的幂等回执（`initialize_board`）的请求哈希改成现行写法（空请求的哈希，旧的把看板名字也算了进去）；其余各行都没变。导出用 `sqlite3 .dump`，去掉它新加的 `DELETE FROM sqlite_sequence;` 一行（载入后先去掉 `sqlite_sequence` 里因载入而重复的行），这样同一份导出载入再导出逐字不变。

`approved` 与 `approved-completed` 里存的授权完成决定（`goal_event_applied_decisions` 与幂等回执里的 `commitment`），按「点头只对整份约定有效」（`specs/archive/goal-closure-identity`）改成了当前形状：承诺里记结果说明和决定时 Goal 的每一条要求（`MIXED-C1`、`imported-policy:MIXED-OWNER`），与现行代码写下同样决定时逐字相同（用同一份约定记一条新决定对照过）。原先只记结果说明、不含任何要求。旧形状的承诺比不上现在的约定，项目规则「完成前必须你点头」打开时不再放行；读取不兜底旧形状，所以夹具存成当前形状，不改断言。真实 Home 里没有这样的决定要整理（演练拷贝里全部项目库的授权完成与接受要求的决定为零条）。

版本 9（SYS-15-S6）在临时副本执行同一份维护九脚本（`tests/fixtures/project-maintenance-v9.sql`），新增空的动作闹钟安装绑定表，旧闹钟暂停且清空租约，未填造授权。四份夹具的其余业务行逐表核对不变，再用同样的 `sqlite3 .dump` 导出。

版本 10（ac-trust T1 与 #1245 合成同一版，batch-36）：安装记录表 `plugin_runtime_installs` 多了一列 `publisher_trust`，夹具里这张表没有行，只改了建表语句；Attention 两表多了 owner 字段与按 owner 区分的部分唯一索引，不从历史 ID 推断 owner，现有记录保持未归属 null。四份夹具的历史业务 INSERT 原样保留，行与 rowid 逐表核对不变，外键和完整性检查通过（对照用 `tests/fixtures/project-maintenance-v10.sql` 在副本上跑一遍再导出，结构相同）。它们是历史业务数据的现行 schema 夹具，不是生产读取时的迁移路径。

版本 11（FI-5、FI-6，批 C）在临时副本执行维护十一（`tests/fixtures/project-maintenance-v11.sql`）后导出：插件表账本里 Feed 那一行升到 2，表名单换成 Feed 的 Manifest 现在声明的全部表（原基线里的 Feed 表改由 Feed 声明，表本身与行不动）；新增空的平台通知队列 `plugin_notifications` 与它的部分索引。四份夹具没有 Inbox 记录、也没有 Feed 的上下文边，维护里给 owner 与改边名的两步没有行可改。其余各表行数逐表核对不变，外键与完整性检查通过，同一份导出载入再导出逐字不变。
