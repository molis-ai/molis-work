# 防腐线收口：每一行有主人（开发线分工）

状态：2026-10-23 20:10 UTC 起由统筹维护。目的：`privileges.md` 里每一条没关的 PG 行、W5/W6 的每一项、交接说明 §3 的每一片，都落到一条线上，并写清先后。一条线做完，统筹按本表往下派；新线一次只开一个（用户 10-23：CPU 扛不住）。

线的名字：Claude 子会话写会话名（`ac-*`），Codex 写 `Codex C<n>`（派单在同目录 `CODEX-TASKS.md`），统筹自己做的写「统筹」。「待开线」= 还没有会话，等一条线空出来再开。

依据：交接说明 §3、`notes/platform-handover-1024.md` §5、`notes/migration-line-not-done-1024.md`、`STATUS-MATRIX-2026-10-23.md` 矩阵二。

## 1. 在跑的线与它们接下来的片

| 线 | 现在 | 之后（按先后） | 管的 PG 行 |
| --- | --- | --- | --- |
| `ac-kernel`（Opus high；R7 #1117 已合 10-24；号段 RAC-180～199 已用完、RAC-330～349、BL-520～524） | R7 #1117、W5-09 #1118、R8 第 1 批 #1121、PG-051 P1 #1124 | PG-051 P2 → R8 其余批次（typed 140 处改动作、BL-364）→ agent-host 巨大单元 → 平台线排好的片 1～5（BL-430、BL-350、BL-356、BL-366、BL-394） | PG-029、030、035、051；之后 PG-045 |
| `ac-sc3`（Sonnet xhigh） | SC-4 #1130、Goals S4 #1146（二轮可合）；本地已推送：sc4b（BL-485/486/488）、BL-385、SC-5 脚本、BL-383、BL-384（RAC-260）、S8b/S9 草稿 `migrate/goals-s8b-s9-draft` | 一次最多两个开着的 PR，按合入顺序开：sc4b → BL-385 → SC-5 → BL-383 → BL-384 → S8b → S9-0 事件日志端口（S-63）→ S9-0b PG-087 注意力与情境账服务 → S9 存储迁移三片 → Goals 个人规划（照 Shelf 双实例，#1083 后）→ 迁到 Runtime（T1 只解冻 Goals 条目）→ S10～S12。号段 RAC-260～299、BL-505～519、S-62、S-63、S-64（S-64 由 S9-0b 自取、统筹 10-24 追认）（统筹 10-23 裁九问） | PG-081、082、053、086；PG-094（PG094-06～14）、021、033、031 的 Goals 半（BL-501 归 `ac-platform`）、012 的 Goals 个人规划一半、087（10-23 由 Feed/Inbox 组改派） |
| `ac-sandbox-sched`（Sonnet xhigh；号段 RAC-200～209、230～249、300～329，BL-490～499、525～534，RAC-350～369，S-60、S-61、S-65、S-66） | BL-395 #1119、PG-039～042 #1123、BL-481 #1131 | PG-017 组：设计稿 #1134（统筹已定）→ P0 映射与带码拒绝 → P1 模型与指令（PG-051 P2 之后）→ P2 连接与材料（不联网）→ P3 后台 → BL-492 材料允许域名 → PG-022/102/103/104 声明进 Manifest → BL-490/491 → BL-493（PG-001 之后）；W5-17（#1113 已合，10-23 21:35 派，排在 #1139 修完之后、BL-492 之前，本地做） → Feed/Inbox 迁到 Runtime（PG-093、089 余半、040 余半、034、046、057、080，PG-010 余项；PG-087 的平台服务 10-23 改归 `ac-sc3`，这里复用） | PG-017、022、102、103、104、039～042；之后 Feed/Inbox 一组 |
| `ac-clients-1`（Sonnet xhigh；10-24 05:00 起可开 PR：先开 Cognia） | W5-03/04：Todo #1129、Images #1137；Jelly #1145、Issues #1132 已合 10-24 | Cognia（本地 `ac-clients-cognia` `e4c0e6974`，未开 PR）→ **R11（统筹 10-24 定先于灵光：灵光客户端碰 `data-make-todo`）**（PG-063/064，统筹已定方案）→ 灵光（本地 `ac-clients-lingguang` `5e26ba1ef`，等 PR 数降到 15 以下再开）→ 第二组（10-24 起先做 Dataset） Dataset、PPT、Form、Workflows、Pages（RAC-150～169、BL-460～464） | PG-055、056、063、064、070、071、100（灵光片顺手改 `fateLabel`） |
| `ac-review`（Sonnet xhigh，只读） | 一轮评审 | — | — |
| Codex | 修复、二轮、测试与集成批；C1 W5-13 | C2 W5-16 → C3 W5-10 官方集成与横向服务 | — |

> **10-24 晚派单（统筹，以此为准，上表是旧写法）**：
> - `ac-coding` → **ac-trust 实现**：先 BL-563，再 T1（合同、规则、新表、基线升版本、S-34 改写），之后 T3→T6→T2→T4→T5→T8；T7 的界面统筹排。PG-037、PG-044 已核过、随 batch-34 标已做。
> - `ac-giants` → **ac-artifacts 实现**：A2→A4→A7 的非目录部分；A3、A6 等 ac-registry 的 PG-024 片；A5 和 A7 的目录部分等用户的维护时段。
> - `ac-sandbox-sched` → **Feed/Inbox 迁到 Runtime**（`slices/feed-inbox-runtime.md`，RAC-480～519，10-24 21:35 加 500～519）：FI-1 #1247 在修；FI-2 等 #1242 合入；FI-3、FI-4 设计稿已审（10-24 21:35，`582a8b123`，方向认可、各 5 条必改，改完统筹核一眼即算审过；FI-3 可在分支开工，PR 排在 BL-490、FI-2 之后；FI-4 实现随 FI-6）；BL-490 等 #1241 合入。
> - `ac-clients-1` → **W5-04 第三组**（Coding、Diff、text-stats 的客户端，样式按需加载），之后写 PG-055 设计稿（SDK 公开界面部件）。
> - `ac-kernel` → S-57 X1～X4（号段 10-24 21:35 改为 RAC-470～479、520～539，避开 Feed/Inbox 的 480 段）合成一个 PR（等 #1242 二轮、#1241 合入后合 main、S 号排 S-68～70）；然后 R-38 第 2 片。
> - `ac-sc3` → Goals S9-0b #1245（统筹把对象种类隔离升为挡合并，Codex 在修）；S9-1 等 #1245 过一轮；S9-2 等维护时段。
> - 待开线：`ac-registry`（W5-02，PG-024 片挡着 ac-artifacts 的 A3/A6），→ 10-25 已开，见下。
> - **10-25 04:00 UTC 新开三条线（用户 10-25：「代码工程实现可以加速，如果还有工程开发任务的话，可以不只有 2-3 个会话额度」）**：
>   - `ac-registry`（`local_a2bb6a1a`，Opus high；RAC-560～579、BL-615～624）：W5-02 PR-1b（PG-105、067、065、066、068）→ PR-2（PG-069）→ PR-3（PG-072～076）→ PG-024（挡 ac-artifacts A3/A6，能提前就提前）→ 门禁 7→0 → W4-01 探针夹具；PG-095、111 在稿里评估。先写 `slices/w5-02-registry.md` 交统筹审。
>   - `ac-platform`（`local_91072c95`，Sonnet xhigh；RAC-580～599、BL-625～634）：授权与受众（PG-013、028、014）→ 写死名字（PG-032、098、100、099）→ PG-061、008、011 → PG-112、113 → PG-025、023、020（PG-020 开工前与 ac-sc3、ac-sandbox-sched 定边界）。先写 `slices/platform-authority-audience.md`。
>   - `ac-shell`（`local_6e0d7986`，Sonnet xhigh；RAC-600～619、BL-635～644）：BL-387 页面一半 → BL-388 → PG-060 余项 → BL-430（先查 ac-kernel）→ PG-088 余项（引导改走 Pages 公开动作）；Goals S11 留在 ac-sc3。先写 `slices/w5-06-shell-remainder.md`。
>   - 同时：ac-coding 接 T3 及之后各片、ac-giants 接 A4、ac-sc3 叠在 #1245 修复头上做 S9-1，各线一片做完直接接下一片。

> **10-25 13:55 UTC 派单（统筹）**：
> - `ac-kernel`：W5-10 agent-host 份（改代码只 `prologue-checkpoints`、`prologue-taskboard`、`agent-host-composition`；与 #1064 重叠的五个只在 HUGE-CLASS-MIGRATION 重判）→ BL-541 → BL-470，一个分支一个 PR，RAC-658～669。
> - `ac-coding`：T8 快进进 #1285（T5+T8 一个 PR）；下一组 T7 界面 + BL-585（T3b），叠在 T8 上，一个 PR；之后 PG-054。
> - `ac-sandbox-sched`：#1283 等二轮；FI-3～FI-6 叠一个分支，整组一个 PR。
> - `ac-shell`：#1293 进 batch-38；下一组 BL-387 余下 → PG-060 余项 → PG-088 余项 → PG-075（#1284 后），叠在 ec3e0c3ad 上一个 PR。
> - `ac-clients-1`：PG-070、PG-071 叠在 #1288（146fce17d）上一个 PR，RAC-750～769；资源涨超 10 KB 或新增资源先问。
> - `ac-platform`：#1291 一轮挡 2 项（号段改 RAC-730～740、S-80/81；S-75/76 的拒绝测试进 `test:security`）。

> **10-25 晚 死机后恢复（用户：「恢复各会话和工作内容，同时注意对 CPU 的保护」）**：本机 10 核 16 GB，死机前同时有约 9 条线 + 统筹的 build/测试，另有 ac-platform 留下的 4 个 `host-pages-error-model` 孤儿进程（`--inspect`/堆采样、各 3 GB 堆，统筹已按 PID 停掉）。从现在起：
> - **同时最多 2 条重开发线 + 1 条轻活线**（轻活=开 PR、写文档、只读评审，不 build、不跑测试）+ 统筹；一条线做完一组才放下一条。
> - 测试一律 `--jobs 1`、只跑改到的非浏览器文件；不跑浏览器批、不跑全量、不在本机做堆采样/`--inspect`；同一会话同一时间只开一个后台测试或构建；build 由机器槽位排队。
> - 现在在跑：`ac-platform`（#1291 修复）、`ac-giants`（#1294 修复）；轻活 `ac-sc3`（开 S9-3～S12 的 PR）。
> - 排队（工作树里的未提交改动都在，按序放）：`ac-coding`（T7，15 个文件）→ `ac-kernel`（W5-10 agent-host + BL-541，15 个文件）→ `ac-registry`（PG-069 组，31 个文件）→ `ac-clients-1`（PG-070/071，51 个文件）→ `ac-sandbox-sched`（FI-3）→ `ac-shell`（已推 `claude/ac-shell-rest` 58e877b21，待开 PR）。

> **10-25 晚 再调整（用户：「可以安排多线程做开发，只是测试槽可以合理安排」）**：开发线不再限 2 条，排队的 6 条全部放开；限的是本机测试与构建的槽位：
> - **测试整机一次一个**：本机跑测试一律写成 `node scripts/machine-slot.mjs run browser --label "<线名> tests" -- node scripts/run-tests.mjs --jobs 1 <文件…>`（借 `browser` 槽当整机测试槽，排队自动等），只跑改到的非浏览器文件；浏览器文件、affected 全集、全量交 CI 与统筹的整合批。
> - **构建与门禁整机一次一个**：`pnpm build`/`build-workspace` 自动取 `build` 槽；单包构建与 `pnpm health:check` 也包一层 `node scripts/machine-slot.mjs run build --label "<线名>" -- …`。
> - 不在本机做堆采样/`--inspect`；同一会话同一时间只开一个后台测试或构建；测试或构建被杀（137）先看 `memory_pressure`，别立刻重跑。
> - 写代码、读代码、写 spec、开 PR 不限并行。

> **10-25 晚 #1294 裁定（统筹）**：换设备恢复成果包（`apps/server/src/assets.ts` 的 `restoreWorkAssets`）遇到目标项目没装的产出者，选 (a) 照常导入并留警告：宿主内部的仅恢复入口，不经动作网关、不进 SDK/contracts 公开面，只有 `restoreWorkAssets` 调；只放包里原样带来的版本（producer、类型、哈希不改写）；产出者装好前不出预览、不进可写路径；拒绝测试证明普通写入照样 fail closed、恢复之外调用被拒。先恢复 X 的版本、后来 Y 先装占同名类型时的读取口径记 BL（PG-107）。
> **10-25 晚 batch-37 A1 归因（统筹在批内修）**：AQD-04 pages-hidden 与两处自调用夹具按 §9.1/§9.2 改期望；`host-pages-error-model` 的 OOM 是测试替身的目录读取器经 PG-014 的 Todo 目录读回到自己（无限递归），夹具改成只让 MCP 自己那次失败；`security-invariants-plugin-pages` 是 #1266 的产品缺陷——页面动作的路由 control 不带 caller，PG-028 后落成 `plugin` 受众被拒，修成「宿主路由的 control 都算本人请求」（main 上页面动作本就是本人受众）。

> **10-25 15:20 UTC 组 batch-38 与派单（统筹）**：
> - batch-38 已收（工作树 `.claude/worktrees/ac-batch38`，未推）：batch-37 头 `46f894762`，#1272 FIRST-4，#1273 R-38 FIRST-3，#1277 放置后继，T6 #1279，T4 #1282，T5 #1285，T8 文档，#1284 PG-055，#1281，#1276 FIX14，#1288 PG-056，#1292 C5，FIX1 巨大单元登记评审，#1293 及其上的 #1296，#1290。S 号定为：S-72 PG-013、S-73 PG-028、S-74 PG-014、S-75 T6、S-76 T4、S-77 T5、S-78 C5 MCP 自启（测试名里的 S-X3、S-X4、S-79 已改）。
> - **#1255 FIX5、#1297 改进 batch-39**：两者都和 batch-37 本身语义冲突，19 个文件和 7 个文件，统筹不代解。#1255 交 FIX 车道或原作者 merge batch-37 后重整（评论 6399324020）。#1297 交 ac-kernel：RAC-659 与 R-38 第 2 片重复，取 batch-37 的版本；RAC-658 搬进 `coding/src/browser/*.ts`（评论 6399324333）。
> - **#1283 与 #1294 共用的 `plugin-holders`**：只由 ac-giants 在 #1294 里改，给出固定 commit；ac-sandbox-sched 在调用端按 {作用域, install_id} 精确排除，并补三组真实回归。
> - `ac-registry`：W4-01 选方案 1，B4 + PG-069 开一个 PR；W4-01 探针在本地叠分支，安装那一半等 ac-trust T2；到期提醒、放置两项登记 BL。
> - `ac-shell`：先做 PG-064（W5-08 工作台转出，含 `index.ts` 的 `export *`；RAC-710～719）；PG-075 等 batch-38 分支推上去后叠进 #1296。
> - `ac-platform`：在 #1291 上叠下一组：写死名字 PG-032、098、100（还有 099，若仍开着），再做 PG-025、023、020；号段续 RAC-820～839。
> - 待查：ac-trust T2（安装服务）还只在 `claude/ac-trust-t8` 上，没有 PR；ac-registry 的 W4-01 安装一半要等它。

## 1a. 在途但不在上表任何一条线里的 PR

| PR | 谁在推 | 管的 PG 行 |
| --- | --- | --- |
| #1076 Shelf S3、#1083 Shelf S4 | Codex 整理冲突；修复按 MERGE-QUEUE §1 第 7 条认领 | PG-012 的 Shelf 一半、026、026-S1、090；S4 合入后 PG-113 归 `ac-platform` |
| #1098、#1107、#1112 W5-06 链 | Codex / 合并 Agent | PG-060 |
| 统筹的状态 PR #1133 | 统筹 | PG-027、052 标已做 |

## 1b. privileges 逐行核查后的归属裁定（统筹 10-25；依据 DeepSeek 核查 `deepseek/privileges-audit` `2f5c09cf7`）

| 行 | 裁定 |
| --- | --- |
| PG-058（无主） | 拆开归：Feed、Inbox 的宿主 HTTP 随 FI 线迁 Runtime（FI-4～7）删掉；artifact 那份归 `ac-artifacts`（A3 之后的 A 片）；Alchemist 那份按用户 10-23（BL-376）不迁、绕过。别名表 `native-plugin-api.ts` 随最后一份删掉。 |
| PG-095、PG-111（无主） | 归 `ac-platform`，作为它「后三组」之后的一组：插件合同从平台 contracts 搬回各插件公开入口（照 Images、Jelly 的 C4 #1263 做法）；Alchemist 的合同按 BL-376 绕过。 |
| PG-074 的 Goals 一半（无主） | 归 Goals 迁移线（`ac-sc3` 的 S11：`locked`、`SURFACE_OVERRIDES`），随 Goals 离开宿主私路删掉。 |
| PG-049（冲突：表里给 ac-trust） | 归 `ac-kernel`（实际实现者，#1298 随 batch-39 #1307 落地）。 |
| PG-031（冲突：表里给 ac-platform） | 归 `ac-kernel`（同上）；剩下 Feed/Inbox 那几处随 FI 线。 |
| PG-053（冲突：ac-sc3 与 ac-shell） | 归 `ac-shell`，排在它现在的顺序之后；ac-sc3 不再列。 |
| PG-029（冲突：表里给 ac-kernel） | 删除工作随 #1295（ac-sc3 迁移线，等用户维护时段）；ac-kernel 不再列。 |
| 17 条在途可关的行 | batch-38（#1300）、batch-39（#1307）落地后，统筹按核查报告「合入在途后可改已做」逐条改 privileges.md。 |

## 2. 待开线（一条线空出来就按这个顺序开）

| 序 | 线 | 内容 | 管的 PG 行 | 前置 |
| --- | --- | --- | --- | --- |
| 1 | `ac-giants`（Sonnet high；**10-24 04:30 开工**；号段 RAC-370～379、BL-550～554；R4a、R4d 已推送，等 PR 数降到 15 以下再开；10-24 06:30 起兼做 ac-trust 设计稿） | W5-10 设计系统 6 个巨大单元（R4a，分支 `anticorr/w5-10-design-system-giants`）→ Pages 编辑器余下单元（R4d） | PG-036 的巨大单元部分 | 无 |
| 2 | `ac-trust`（**10-24 06:30 设计稿由 `ac-giants` 会话代做**：`slices/ac-trust-install.md`，RAC-380～399（10-24 加 RAC-400～409）、BL-555～564、S-67/68 暂定；实现等 #1098 合入，届时视 CPU 另开会话） | 安装信任一组：PG-001/004/005 设计稿（统一安装确认、`always_on` 与默认连线只按 Manifest 声明，未签名要用户同意，内置默认同意；统筹 10-23 已定方向）→ 实现；PG-002 可选权限开关（连 BL-353、BL-362）；PG-013（BL-088）、PG-015、PG-049（显式、可撤回的同意）、PG-016（随 W5-15）；另：同意清单要在安装时把插件 `required_actions` 解析成用户同意的精确提供方并记录，之后插件声明才可不写提供方（BL-501 裁定，10-24） | PG-001、002、004、005、013、015、016、049 | #1098 合入（`plugin-settings-catalog.ts`）；**10-24 #1207 交来一项**：宿主调 Goals 的两路（管理入口、`readProjectGuidance`）现在只接随宿主发布的 Goals（退路，宿主读不到核验过的发布者签名：Manifest 的 signature 是自报字符串，包签名没接进应用）；同意清单与包签名接上后改成按可信发布者签名接受，关 R-45 与 PG-031 的 Goals 部分（BL 在本线号段里登记） |
| 3 | `ac-registry`（待建） | W5-02：PR-1b-1～4（PG-065～068、105）→ PR-2（PG-069、070）→ PR-3（PG-072～076）→ PG-024（`project_data` 进各包、删名单）→ 门禁「新插件在包外被点名」7→0（统筹 10-23 已定）→ W4-01 探针插件夹具（W6-02 的前置） | PG-024、065、066、067、068、069、072、073、074、075、076、095、105、111 | #1098、#1112 合入 |
| 4 | `ac-coding`（**10-24 06:50 UTC 开工**，会话 `local_b1765f78`，Sonnet xhigh；RAC-430～449、BL-585～594；占整机两格重开发之一，另一格 `ac-clients-1`；`ac-giants`、`ac-kernel` 暂做轻活） | C8-3（助理按角色找执行方，删 `assistant-coding.ts`）→ Coding C9（离开 HYBRID 名单，删 `coding-surface.ts` 同 PR）→ PG-044 Git（BL-366 见 `ac-kernel`）→ PG-037、091 余项、PG-054 | PG-036（C8-3）、037、044、054、091、099（`coding-surface.ts` 的死代码；Alchemist 部分不做） | W5-04 的打包写法（#1129 合入）、#1084 已合 |
| 5 | `ac-artifacts`（待建；**10-24 06:45 设计稿由 `ac-giants` 会话代做**：`slices/ac-artifacts.md`，RAC-410～429、BL-575～584、新 S 号从 S-69 暂定） | 成果库去插件身份（平台事实一族，统筹 10-23 定）：PG-077～079 → PG-096、097 | PG-077、078、079、096、097、107 | W5-01 其余族迁完前可先做设计 |
| 6 | `ac-platform`（待建；10-24 起 PG-047（模型结果 `validateResult()` 由平台强制；10-24 分支 `ac-kernel/pg047-validate-result` 头 `40cbaa09b` 已推，`full` 非空，本线已有 3 个开着的 PR，等 #1121 或 #1148 合入再开 PR）、PG-043（Home 聚合，在做）由 `ac-kernel` 做；PG-007 阶段 4 等 CHR-1 与 #1130） | 平台线零散：PG-031 一片（BL-501：宿主调别的插件时按能力在目录里找提供方，删 Goals、Inbox、Pages、CLI、MCP 里写死的 `provider_id`；`allowed_actions` 精确提供方不放宽；统筹 10-23 裁）、PG-007 阶段 4 拒绝测试、收回 `localWebActionContext` 导出、#1096 评审三条建议、PG-008、011、014、020、023、025、028、032、043、047（`validateResult()`）、061（`pg061-ui-invalidate-design.md`）、095、098、099、100、107、111、112、113；BL-352、363、367、375、178、180、181、359、360、371、372 | PG-007、008、011、014、020、023、025、028、031、032、043、047、061、098、112、113（等 Shelf S4） | 各自见 `platform-handover-1024.md` |
| 7 | `ac-shell`（待建，W5-06 链合完后） | BL-387 页面那一半（#1112 之后）→ BL-388 → BL-430 若 `ac-kernel` 未做 → Goals S11（删工作台手写的 Goals 舞台）→ PG-088 余项（引导流程改走 Pages 公开动作） | PG-060、088 | #1098、#1107、#1112 合入 |
| 8 | 统筹 + Codex | W5-11（OAuth 移进官方集成插件，统筹 10-23 定）、W5-14 改名（GLOSSARY §4/§5，统筹 10-23 定）、W5-15 成熟度词表（发版与版本号归用户）、W5-05 页面预算降值、W5-08 `index.ts` 的 `export *` | PG-045 的 OAuth 一半、PG-016 | 各族迁完 |

## 3. 不做或另行处理的行

- PG-083、084、101（创作台）、PG-092、108（Alchemist）：不迁，用户 10-21 定（BL-376、BL-377）；本轮绕过，删除前再问用户。
- PG-052 的创作台部分、PG-058 的 Alchemist 部分：同上。
- PG-081 的 Sessions 重做：另开需求（BL-177），先写需求书给用户审；本轮只清理（SC 系列）。

## 4. 收尾（全部线做完）

W6-01（删别名与短路由、冻结名单清零、AGENTS 改写）→ W6-02（生命周期测试扩到迁好的真实插件，靠 W4-01 夹具）→ W6-03（Skill 与手册统一更新）→ W6-04（重量指标）→ W6-05（集成分支最终回归，Codex 主跑）→ W6-06（交付物与 spec 归档）。最后问用户 Alchemist 与创作台的删除。

## 5. 续做时要带上的话

- **`ac-clients-1` 恢复时**：#1129 一轮评审（修后可合）第一节「做法层面」6 条——共同的宿主接口类型、esbuild 依赖声明进包与字节随 esbuild 版本变的口径、跨主人英文悄悄换掉要逐键查清写进 PR、测试别照抄两处偏弱写法、`messages.ts` 保持 `{ zh, en }` 平表不改键名、插件 id 别写死在浏览器代码——先改进样板文档，再用到 Jelly、Cognia、灵光；已开的 #1132、#1137 由修复者按同 6 条补。BL-455 的 (c) 部分（动作输入字段标题、首页事项、搜索结果等由宿主按中文原文翻译）要合同能带键，指向字体皮肤语言书 §6.1（用户 10-21：语言覆盖归那里），由修复者在 #1129 里把 BL-455 的删除条件改成指向真实需求。

## 6. W5 / W6 逐项进度（统筹随合入改）

最后刷新：2026-10-27 统筹，依据 main `74f31c19e` 和当时开着的 PR。每次合入或裁定后，在这张表里改对应的行；本文件末尾的流水只记事件，现状以这张表为准。

| 项 | 状态 | 已落地 / 还剩 |
| --- | --- | --- |
| W5-01 余项 | 进行中 | 已落地：Shelf S3 #1076、S4 #1083；Goals Runtime 随 #1295（A+B，main `9efbf8d04`）；Artifacts PG-077 第一步随 A+B。还剩：Feed/Inbox 在 C（`feature/anticorruption-closeout-c`，临近 PR）；置物架 Home 一半停后的裸 404（BL-804）等 C 合入，归 `ac-lifecycle`；PG-077 第二步与 BL-760/761 进维护时段 |
| W5-02 | 部分 | 已落地：PR-D（PG-073/074）随 batch-38（#1300），BL-530 随 A+B（S-95）。还剩：装配冻结表清零，归 W6-01 |
| W5-03 / W5-04 | 部分 | 已落地：Jelly #1145、Issues #1132、Images #1137，Workflows/Pages 客户端（batch-34）、第二组（batch-35）。还剩：PG-070 插件样式拆成按需加载（用户 10-25 定），排在 W5-10、W5-11 的 PR 之后。W5-10 批 A 走过渡模板拆分，不做 W5-04 打包 |
| W5-05 | 基本完成 | 还剩：页面预算降值（统筹）。W5-06 链已随 batch-32 合入，Shelf 等 BL-804 |
| W5-06 | 部分 | 已落地：#1098、#1107、#1191、#1173 随 batch-32（#1225）。#1112 已关、未合。还剩：挂载器与 BL-542，排在 C 之后 |
| W5-07 | 收尾时统筹核 | — |
| W5-08 | 部分 | 已落地：Feed/Functions 出口 #1120。已落地：`apps/workbench/src/index.ts` 无人用的出口（BL-635）#1326（`47190691d`）。Goals 一组留给 Goals 收尾。还剩：`index.ts` 的 `export *`（统筹，各族迁完后） |
| W5-09 | **已完成** | #591、#1118 |
| W5-10 | 进行中（10-25 口径：本身合理的标明，不硬拆） | 已落地：批 A 前两块、B、D、G、H、I、J/K、E 第一片随 A+B；#1314（`e5b173438`）、#1315（`74f31c19e`）、#1316（`341b4d9cc`）。在途：#1317（批 A 重做 tab-workspace，头 `dfd43b5fd`）CLEAN、`full` 为空，统筹 10-28 裁定可合，在 W5-10 会话合 |
| W5-11 | 进行中 | 已落地：第 1、2 片 #1322（`31c3ff04d`）。还剩：第 3 片起等 C 合入 |
| W5-12 | 收尾时统筹核 | — |
| W5-13 | 部分 | 已落地：#570、第二片、#754、RAC113、RAC114。还剩：宿主日志与错误的余片，10-28 派给 `ac-sweep`，先盘点（共享笔记 `w513-rest-2026-10-28.md`），避开 C 与 #1317 碰的文件 |
| W5-14 | 部分 | 已落地：片 1～4 与 W11-1 随 A+B。还剩：余下改名，等 C 与 W5-10 合入后开 |
| W5-15 | 部分 | 成熟度词表已有；发版与版本号归用户 |
| W5-16 | 部分 | 已落地：B1、快照（#1271，batch-40）。还剩：B2b（CLI 必要状态、同 Home lease、全库与非 SQLite 快照恢复）；碰真实 Home 的部分进维护时段 |
| W5-17 | 等维护时段 | 用户 10-24 定：和 Goals S9 同一时段，先在真实 Home 拷贝上跑 `list` 交用户，维护做完前不合 |
| W6-01 | 部分 | 已落地：`740f09d4f`（含删 by-key）随 A+B。还剩：冻结名单清零（C 去掉了 Feed 的宿主文件；其余等各族迁完）、AGENTS 改写 |
| W6-02 | 进行中 | 已落地：Todo、Jelly、Pages、灵光的走查随 A+B。在途：其余 13 个插件 #1325（头 `a5b713beb`，CLEAN），可合，合并被自动模式拦下，等用户在 `ac-lifecycle` 会话放行。还剩：置物架（BL-804），等 C |
| W6-03 | 部分 | 已落地：「现在就能改的」16 条随 batch-40（#1308）。还剩：54 条，等 W6 统一改 |
| W6-04～06 | 未开 | 等 W5 各项与 C 合入 |

## 统筹自用号段（10-24）

- BL-540～549：统筹评审时登记的隐患与后续。已用：BL-543（设置地址只转声明参数，归 `ac-platform`，R-42，#1176）、BL-544（侧视图插件框加载守护，归 `ac-shell`，#1176）、BL-540（Coding 的切断界限不读宿主进程，归 `ac-platform`，R-39）、BL-541（Agent 宿主给持有者与报告作者结构化字段，归 `ac-kernel`、R8 之后，R-40）。BL-542（运行时安装的插件写的视图 `group`、`creates`、`start` 工作台不读，按插件同等待遇收口，归 W5-06 线 #1112 之后；`skills/molis-plugin-dev/ui.md` 先注明只对随宿主发布的插件生效）。三行已由 #1159 写进 `specs/BACKLOG.md`（`f4df5b471`）；BL-542 的 skill 注明一句等 #1098 合入后补。
- BL-565～574：复审修复线（#1114）；BL-569 给 #1173（AC-AUDIT-08 门禁正则）。BL-565～568 是 #1114 从 BL-440/441/443/447 改过来的（10-24 统筹裁，BL-440～449 仍归 Codex C1/C2），BL-569～574 空着留给这条线。
- BL-575～584、RAC-410～429：`ac-artifacts`（10-24 统筹给）。
- ~~10-24 起各开发线暂停开新 PR~~ **10-24 05:00 放开**（用户 10-24：积压回到正常水位，按 GitHub 队列能力安排并发）。从现在起照下面的并发规矩：
  - **GitHub 的实际能力**（10-24 实测）：全量一次 40～67 分钟，runner 只够一次跑一批，第二批会排队、还拖慢各 PR 的 CI；合并队列一次一个，每个 8～20 分钟，一小时大约合 3～5 个。
  - **集成批**：同一时间只跑一批，每批放 3～5 个已评审可合的 PR，下一批在当前这批跑的时候备好；`full` 为空的 PR 不进批，CI 绿了、评审可合就直接入队。
  - **开 PR**：一条线「还在评审或修改」的 PR 最多两个；评审可合、只等进批或入队的不算。~~防腐线开着的非草稿 PR 合计最多 15 个~~（10-24 07:30 取消，见下条）。叠的 PR 最多两层。
  - **少推送**：只是 BEHIND（落后 main、没冲突）不同步，合并队列会在合并结果上验；只有 DIRTY（有冲突）或统筹要起批时才合 main。每推一次就占一轮 CI。
  - **本机**：重的开发同时最多两条线（用户 10-23，CPU）；把已推好的分支开成 PR 是轻活，空闲的线可以做，构建和测试照旧走机器槽位排队。
- **10-24 07:30 用户补充：减少 Claude 侧的测试和反复修改，测试与修复交 Codex 推进，Claude 先尽可能推进防腐线工程开发收尾。** 照此改：
  - **Claude 开发会话的本机检查只做**：构建、`check-health-gates --base origin/main`、`boundary:check`、`secrets:check`、`page-assets`（改了资源时）、直接改到的少量非浏览器单测。**不跑浏览器用例批**、不跑 affected 全集；浏览器与回归证据交 Codex 测试专职和 CI / 集成批。PR 正文写清「没跑」的范围。
  - **评审只退挡合并项给作者**：`ac-review` 与 Codex 评审的非阻塞建议不再退回 Claude 作者，评论里标「非阻塞，交 Codex 修复队列」，由 Codex 流水线认领；Claude 作者只修挡合并的。评审复核只看那段 diff，统筹能核的统筹自己核。
  - ~~**做完就开 PR**~~（**10-25 作废**，用户 10-25 再强调 PR 粒度：只有整个功能做完或真依赖才开 PR，后续片叠在同一分支上；见 MERGE-QUEUE §0）：取消防腐线 15 个的总数上限，片做完、自检过就开非草稿 PR（每线在审最多两个照旧），让 Codex 评审、测试并行；开完立刻做下一片。积压由统筹按批与队列消化。
  - **机械同步**：PR 对 main DIRTY 时仍由原作者同步（作者最熟），只解冲突、不改语义；单纯 BEHIND 不同步。
- 10-24 用户定 PG-017 再加两片，归 `ac-sandbox-sched`：P2c 沙箱经 broker 拿有界的 owner files（S-65，`claude/ac-pg017-p2-owner-files` `37e7ca25c`；统筹 10-24 补：卸载清目录，Home 级沙箱也给），P2d 沙箱经 broker 拿材料的 `fetch_local`、`original`（S-66，`claude/ac-pg017-p2-local-original` `b517bdc7a`，`readOriginalRange` 每段过宿主闸门）。排在 P2a #1143、P2b #1144 之后；都等 S-61～64 落地再开 PR。原来的公网读取（BL-492，`claude/ac-pg017-p2-fetch`）改名 P2e。
- **10-25 巨大单元不硬拆（用户原话：「对于oversized-unit，我们也不是硬拆，只要本身合理，可以不做硬性拆分，标明即可」）**：门禁改动 PR #1289（`claude/giant-units-register`）。本身合理、只做一件事的巨大单元（文案表、样式表、静态数据、生成代码、内聚的状态机或解析器，`kind: cohesive-unit`）在 `tooling/gates/giant-exceptions.json` 标明 `kind`、理由与门禁量出的 `size`，新增或变大都放行；`size` 与实测不等直接失败；混了几件事的照旧按职责拆。W5-10 各线（`ac-giants` 设计系统、`ac-kernel` agent-host、Codex C3）改为逐个复核「拆」的判定：合理的改判例外并标明，不为凑数字硬拆。#1289 合入前，各线的分支照旧按旧门禁过（先拆或不碰），合入后再标。
- **10-25 号段与暂定 S 号（统筹）**：`ac-platform` 第 3 组 RAC-730～749（原拟 660～699 与 ac-kernel 650～669、ac-giants 670～689、ac-shell 690～709 撞）。暂定 S 号：S-75 T6 #1279、S-76 #1255、S-77 C5 mcp-autostart、S-78 T4 #1282、S-79 T5 #1285、S-80 起 ac-platform 第 3 组（PG-112 本机工具、PG-113 桌面 IPC）；组批时按落地顺序收紧连续。
- **10-25 ac-platform 第 3 组裁定**：PG-112 Manifest `local_tools` + `services.localTools`（只探测不代跑、参数固定在 Manifest、只 `host` 等级可声明、新 SI 行带拒绝测试，第三方开放走同意账本另记 BL）；PG-113 只加固 Rust 一侧（plugin_files_*，限主人文件根、规范化、非链接、普通文件、nlink=1），一次性句柄后续片；PG-011 Manifest `runtime.scope` + 信任闸，非内置 Home 插件安装归 ac-sandbox-sched 队列；`MOLIS_WORK_SHELF_AGENT_*` 改 `MOLIS_WORK_LOCAL_TOOLS_*`、不留兼容，存量偏好进 W5-17 维护清单。
- **10-26 派片（用户 10-26「继续推进工程开发进度（以合理的安排）」「with reasonable effort level and model」）**：新号段从 BL-670 起（RAC-840～859 归 ac-platform 场景片，它已用到 849）；S-91 给 #1255 BL-490（原暂定 S-68 与 main 的 S-68 撞）、S-92 给 PG-017 P2e。
  - `ac-kernel`（Opus high）：PG-031 余项（inbox `pages.ts`、`content-action-providers.ts`、MCP 直接 import Goals 三处；避开 #1295）→ PG-057 的 `/api/assistant/*`、`/api/shelf` 一半（Feed/Inbox 一半归 FI）；RAC-910～929（原给 840～859，与 ac-platform 撞，已更正）、BL-670～679。
  - `ac-giants`（Sonnet xhigh，ac-artifacts 线）：PG-080 的 Pages 一半（Feed 一半随 FI）→ PG-078 余项（`services.artifacts`/`processItems` 由平台给）；RAC-860～869、BL-680～684。A5/A6 等维护时段。
  - `ac-clients-1`（Sonnet high）：PG-111 余项 + PG-095 Shelf（BL-618）；先列 contracts 剩余子路径的归属；Feed、Goals、Alchemist、平台模块不动；RAC-870～889、BL-685～689。
  - `ac-registry`（Opus high）：PG-046 先写设计稿 `slices/pg046-integrations-from-manifest.md`（与 FI、PG-045、W5-11 的边界），动安全边界或真实 Home 的先报，其余直接实现；RAC-890～899、BL-690～694。
  - `ac-sandbox-sched`（Sonnet xhigh）：FI-6 第 3、4 步等 ac-platform P1/P2/P4；其间 #1255 改 S-91、P2e 改 S-92 合 main → 报评审 → BL-491 → BL-493。
  - `ac-sc3`（Sonnet high）：PG-053 余项（`terminal-client.ts` 手列三个终端客户端、import Shelf 包）；RAC-900～909、BL-695～699。
  - `ac-shell`（Sonnet xhigh）：R-58/R-59 评审过（6406465099），进 batch-42；probe 结果回报后做 W5-02 PR-D（PG-073/074）。
  - `ac-coding`：T7 修复增量复审过（6406464748）已合进 batch-41 `281737558`；下一片叠在 `4ab01c098`：RAC-392 口径落文 → BL-623。
  - PG-046 与 FI-3 重叠：`ac-registry` 从 `c98614235` 原 SHA 开 `claude/ac-registry-pg046`、合 main、做 BL-528～530（从 FI 线移交），评审过随 batch-42 落；FI 线不改写 `c98614235` 之前的历史。
  - W5-15（#1309）一轮可合，统筹裁定写在 #1309 评论 6406515772（web-query 从第一个装到开发机之外的版本起算）。
- **10-26 batch-41 推送**：PR #1310，头 `8cc441315`（T7 修复 `4ab01c098` 合入 `281737558`；页面资源实测 `fd1d05aed`；CHANGELOG PG-024 `3f8b9eeb9`；privileges PG-024/066/001/073/074）；carrier `integration/carrier-1025-41` 同头，全量 40257291347。合并改到的 15 个非浏览器文件全过，health、page-assets、secrets 通过。挡落地：ac-review 补评 PG-024 生产增量 `0bb452545..20940b4b1`（PIPE 10-26 指出原评只到 0bb）。PIPE 回执 #1310 评论 6406612421；Codex 三个窄 owner：F1（PG-024 N3 测试）、F2（publisher-revoke 测试确定性）、I1（R-59 错误出口），交付后随 batch-42 采用。
- **10-26 batch-42 起头**：工作树 `.claude/worktrees/ac-batch42`，分支 `batch/1026-42`，叠在 batch-41 `8cc441315` 上；已合 ac-giants `2733a2afe`（RAC-860 护栏）、ac-shell R-58/R-59 `78abea060`、W5-15 #1309 `18af3c95a`（SSOT-MATRIX 取 W5-15 侧），CHANGELOG W5-15 升级须知 `94d2bd7d8`。待收：ac-platform 场景三片（评审中）、ac-registry PG-046（FI-3 原 SHA + BL-528/529）、#1255 BL-490（S-91）、P2e（S-92）、Codex F1/F2/I1。
- **10-26 PG-002 裁定（ac-shell 稿 `732aade3b` §7）**：①项目取自路径、入口盖章；②收窄停—改—起，不动 S-18；③放宽 `actions:delegate`/`network:*`/`secret:*`/`model:invoke` 时 UI 加一步确认（平台原话、复用 T7 `ask`），其余单击生效；④只管项目内单个安装，Home 级开关页 BL-700 归 ac-shell 紧接着做，PG-002 两者都完才标已做；⑤不建表；⑥S-93。R-58/R-59 probe 40255274685 六片全绿（NOTRUN 0）。S 号现分配：S-88/89/90 ac-platform 场景、S-91 #1255、S-92 P2e、S-93 PG-002。
- **10-26 第二轮回报与派片**：
  - 交评审：ac-review ← R-61 FIX `f6fbd6db9`、BL-623 `720e69948`（含 RAC-392 落文 `15f493018`）、ac-kernel PG-031/057 `35d8be3dc`；ac-review-2 ← PG-053 合并解法 `7278bb47e`、PG-111/095 `208bb8708`、PG-046 `72921fbaf`。
  - publisher-revoke 测试同文件：ac-coding 选 A，固定 `720e69948`，F2 从 `4ab01c098` 只改交错，统筹整合（#1310 评论 6406936767）。
  - ac-kernel threads：裁定不给 `assistant.threads.*` 加 plugin 受众（助理以自己的上下文与工具跑，插件触发即 confused deputy）；改由外壳情境浮条以本人身份调，Pages 面板的 403 按钮删掉；RAC-914～929。
  - ac-giants BL-596：用 `heldInstalls`（与 S-82 同一事实来源），存量孤儿绑定顺带清，CHANGELOG 写明。
  - ac-clients-1（Sonnet xhigh）← BL-628 设计稿（沙箱 Home 实例，S-80 放开部分要弹窗问用户），RAC-960～979、BL-710～719。
  - ac-registry ← BL-530 设计稿（沙箱集成插件），要用户定的项待弹窗；RAC-891～899、BL-690～694。
  - ac-sc3：PG-053 合并后做 W5-10 巨大单元判定。
- **10-26 batch-41 全量（40257291347）前 9 片**：只红两个文件，都不在 batch-40 红单里，均为本批引入，已在批头修（不重跑全量）：
  - `goals-planning-actions`「project planning HTTP…」：T3b `5252c6667` 把项目设置页 `planningRead` 的 `actions.plugin_disabled` 当「没有 Goals」→ 有 Goals 时策略拒绝也返回 200。改为 Goals 在不在由项目插件清单说（`web-goals-read.ts` `settings()` 加 `goalsHere`），在则如实 403（N3 原则）。
  - `plugin-directory-notices.e2e`：I1 把 `directoryForHome().list()` 改成 async，Codex `8f18228e6` 的测试仍同步取 `[0]`；测试两处改 `await`。
- **10-26 第三轮派片**：
  - ac-kernel ← threads 方案 A 批准（扩 `AssistantPluginMessage` 的 `thread`，外壳认 frame 身份、宿主卡人点才调；S-47 拒绝测试；不放松工具条规则）；之后 W5-10 批 B（`AssistantService`），先交拆分计划。
  - ac-review ← BL-596 `53304afb5..7613ac854`；ac-review-2 ← W5-10 判定 `8bf4c6235`（改门禁文件，抽查例外理由）。
  - ac-sc3 ← W5-10 批 D（`ShelfStore`）；ac-giants ← W5-10 批 G（宿主 `LocalHost` 等，先交计划，枢纽文件先查在途）；ac-coding ← PG-001 余项核对，再 W5-10 批 I（workflows 动作处理器）；ac-platform ← 下一组（避开 `plugin-scene-service.ts`）。
  - W5-10 未派：批 H（工作台渲染器，待有线空出）；批 A 归 W5-04、C 归记忆线（暂停）、E 归 Goals S 系列、F 归 FI-6。
- **10-26 batch-41 全量完结**：红 3 个文件、都非 batch-40 旧红、全是本批引入（第 3 个 `goals-configuration-actions` 与 planning 同根：T3b 拿错误码判 Goals 有无，策略拒 collection 时 `/goals/parent`、`/api/capsule` 静默变空）。批头统一改为 `ProjectRequestContext.goalsHere()`（项目插件清单），web view、设置页、capsule、artifacts 共用；`web-view-goals-absent` 按新判据重写。Home 聚合同类问题记 R-63 交 Codex。
- **10-26 用户弹窗（BL-628/BL-530）**：S-80 只对「签名固定 + 沙箱」放开；外部集成支持、跑沙箱、前置改 BL-628；账号按调用临时给连接（S-94）；地址由签名包写精确 https 来源（放宽 S-69）。ac-clients-1 开工 BL-628 P1～P5；ac-registry 先做 BL-530 不依赖 Home 实例的部分。
- **10-26 batch-41 落地**：#1310 squash 成 main `29f1ffd47`，树与批头 `8742d5d65` 相同；`integration/carrier-1025-41` 与工作树 ac-batch41 已删；privileges 随 batch-42 补 main SHA。
- **10-26 batch-42 合成**（`batch/1026-42`，头见分支）：已合 PG-053 `7278bb47e`、PG-111+PG-095 Shelf `208bb8708`、PG-046 `72921fbaf`、场景+R-61 `f6fbd6db9`（S-88～90）、BL-623 `720e69948`、PG-031/057 `35d8be3dc`、BL-596 `7613ac854`，另 W5-15、R-58/R-59、A 片、PG-026/102 文档。合成树修：PG-031 改按 id 指 Pages/灵光/Shelf（PG-111 删了那几个合同子路径）。合成树 `pnpm build` 过；API 与动作快照无变化；页面资源对 batch-41：characters.js +1,757（PG-053 搬家）、workbench.js +587（净）。待并：BL-596 FIX（授权随最后一处走）、F2、PG-002+BL-700（挡 1 项退 ac-shell）、PG-001+批 I、W5-10 判定 FIX 与批 D、#1255 S-91、P2e S-92、Codex F1/I1/实现 2、ac-kernel threads A。BL-680（删项目时 Shelf 副本留不留）待用户定。
- **10-26 第四轮派片**：
  - ac-review-2 ← W5-10 判定 FIX `8bf4c6235..277765a79` 复评；再评 ac-kernel threads 方案 A `35d8be3dc..6a2d59cef`（页面资源 workbench.js +225 B、plugin-frame.js +22 B 统筹已认，合批时按实测重算放行）。
  - ac-kernel ← batch B（`AssistantService` 拆分）叠在 `6a2d59cef` 上，RAC-917～929，先合 `277765a79` 写文档，不等它进 main。
  - ac-sc3 ← W5-10 批 A 走过渡模板拆分（不做 W5-04 打包）：先 navigation-feed → functions/client（从 main `29f1ffd47`）；tab-workspace、assistant-island 等 batch-42 落地与记忆线定。
  - ac-coding ← W5-10 新批 J（`ProjectsRepository`、`RuntimeProjectBindingCommands`，RAC-930～944、BL-720～724），再批 K（两个 Alchemist 仓库，只机械拆分，RAC-945～959、BL-725～729）。PG-001+批 I `2fc40a619` 评过可合，进 batch-42。
- **10-26 batch-42 续并**：PG-001+批 I `2fc40a619`（privileges PG-001 行取「已做」版并补 batch-41 SHA）、批 D `5f52a8910`（拆出的文件改 import `./contract.js`，PG-111 已把 Shelf 合同搬进包内）、判定 FIX `277765a79`（ac-review-2 复评中）；远端批头 `5828761e9`，未构建，本地 ac-batch42 仍在 `5ede77bce` 跑切片用例。统筹交接见 `HANDOFF-2026-10-26.md`。
- **10-26 PG-001 裁定**：可标已做，行内写明创作台包 unsigned 进沙箱（BL-377 10-23 不删）、开发目录 unsigned 跑宿主进程那一半留 BL-588，余项 BL-586～589；BL-588 进登记册。批头改行文案由接任统筹做。
- **10-26 交接改为给他人**：`HANDOFF-2026-10-26.md` 只引用 GitHub（分支、PR、提交、PR 评论），用户规则写全；batch-42 开草稿 PR #1311 作汇合点，各线改在 #1311 评论回报。
- **10-26 PG-001 行文案已改**（batch-42 `3bd58290d`）：创作台不删、包以 unsigned 进沙箱；开发目录那一半留 BL-588，登记 R-64（归 ac-clients-1）。
- **10-26 batch-42 全量开跑**：run 40268478604（carrier `29e5c5397`），#1311 转正式；P2e、PG-002+BL-700、Codex I2 改进 batch-43；BL-596 修复到了作为修复并进批头。
- **10-26 第五轮**（#1311 评论 6408395410 裁定与评审派工、6408406153 开发派片）：
  - Q1 合同类型改名做（W5-14 片 4），Q2 R-B 不做（W5-14 只管内部名）。
  - ac-review：BL-596 修复 → PG-002 修复 → BL-628 → BL-530。
  - ac-review-2：W5-10 B → A → H → J/K → G → W5-14 片 1～3 → FI-6 第 3 步。
  - 开发：
    - ac-shell：W5-14 片 4 + W5-11（RAC-980～989）；
    - ac-clients-1：BL-588（RAC-990～999）；
    - ac-registry：BL-530 第二部分（RAC-1000～1009）；
    - ac-sandbox-sched：FI-7、FI-4（RAC-1010～1019）；
    - ac-coding：W6-01（RAC-1020～1029）；
    - ac-kernel：W6-02（RAC-1030～1039）；
    - ac-platform：PG-029/040/077/087/089/093（RAC-1040～1059）；
    - ac-sc3：W5-10 批 E（RAC-1060～1069）；
    - ac-giants：PG-083/084/092/101/108 文案改为「本轮不删」。
  - BL 号段 730～779 按同序分。ac-giants 的消息因会话互发上限没送到，任务写在 #1311。
- **10-26 暂停**：batch-42 批头 `39e17eca1`（BL-596 修复 + 全量第 14 片归因修复，#1311 评论 6408642333），全量 run 40268478604 第 16 片在跑；评过待进 batch-43、已推未评、待裁定各项见 `HANDOFF-2026-10-26.md`「当前进度」。
- **10-27 分工（用户在分出的会话里定：「按你调整后的分工来：把方案发给原统筹会话，由它把 C 批交接给新会话，现在开 W5-10 线和 W5-11 线（OAuth 先只做设计），评审和合批到时候再开；W5-14 等 C 和 W5-10 合入后再开。」）**：
  - **统筹只做统筹**：派片、拍板、登记册（本表、`RISKS-AND-DEFERRED.md`、`privileges.md`）、汇总要问用户的事；不写代码。
  - **C 线**（`local_474b63a5`，Opus，10-27 05:34 UTC 已开）：接 `feature/anticorruption-closeout-c` 头 `aa56bfeb1`（`f695bd1e1` FI-C-03/04 + 原三红夹具根因，feed-runtime-plugin 40/40；`aa56bfeb1` FI-C-05 WIP 未构建未测）→ FI-C-05～07 → Inbox RAC808 测试迁移 → FI7 Feed 一半 → SYS52 → 合成树生成物 → spec §13；推 C 分支，不开 PR。号段 S-97、S-98，不另取 RAC。相关回归 9 文件中 `plugin-query-consumers`、`home-mcp-actions` 红，统筹初判为 C 合成树旧红（未改的 snapshot/inbox.list/briefs 路径），待 C 线用 `fe93d322f` 基线比对；`feed-item-actions` :44 为已知旧红。
  - **W5-10 线**（`local_8e01c044`，Sonnet 5.5 xhigh，已开）：剩余巨大单元（E 余 4 个、Pages 编辑器挂载、`hoverHandlePlugin`、`commands.ts` 等，依据 HUGE-CLASS-MIGRATION 与 `claude/w510-giant-judgements` `277765a79`）；避开 C 改过的文件（`git diff --name-only origin/main...origin/feature/anticorruption-closeout-c`，现 411 个，`apps/local-host` 下 88 个，每片前重算）；一片一个完整功能叠在自己分支，推远端回报 SHA；职责单一的只登记理由。**RAC-1070～1079、BL-780～789。**
  - **W5-11 线**（`local_5eacbf11`，Opus 5.5 high，已开）：只写设计稿（OAuth 迁进官方集成插件，即 Codex C4；回调留在平台做通用回调；Feishu CLI、Lark MCP 不进第一批；登记 Alchemist 例外）。实现等 C 合入：C 改了约 20 个连接器/OAuth 文件。**RAC-1080～1089、BL-790～799。**
  - 下一个空段从 RAC-1090、BL-800 起；S 号合批时统筹核（main 已用到 S-96，C 占 S-97/98）。
  - **以后再开**：评审会话（第一片推上来时，Opus high，只评指定增量，架构与安全先评）；合批会话（C 快开 PR 时，批头、carrier、触发 Full、合并队列的唯一所有者，交接里「只有统筹启动全量」移交给它）；W5-14 改名（C 与 W5-10 都合入后）。
  - 每份 brief 带交接硬约束：不碰真实 Home、只用一次性 Home；不发版不改版本号；不 force push、不用裸 git stash；只按 pid 停进程；取消 CI 要用户本人同意；推送前 `pnpm secrets:check`；门禁不刷数字、不放宽断言；不动 #1101、#1064、#1059、#784、#734。
  - **R-27 口径（分工会话 10-27 更正，已转 C 线）**：local-host 的 build 先 tsc 再编原生程序，tsc 本机能过，只有 jelly-whisper（swift-tools-version 6.2）编不了。本机能做：逐包构建（含 local-host tsc）、FI7 临时 Host 加浏览器验证（machine-slot）。本机做不了、交 CI 或 Codex 那台机器：整体 `pnpm build`/`workspace:build`、`pnpm actions:update`、page-assets 核对、安装类指纹测试、用到 jelly 原生程序的用例。升级工具链用户未定。
  - 统筹 hand-off 被 auto 模式拦下，三条线改以卡片提出，用户已点开。
  - **10-27 W5-10 开工清单裁定**：在 main `9efbf8d04` 上实测巨大单元 49 个，38 个已标例外，余 11 个。片序 e1 GuidanceCommands → e2 Goals 两个事件仓储 → e3 GoalEventFacts → a1 `tab-workspace.ts`（批 A 过渡拆分），都与 C 不重叠。暂不做的：
    - a2 `assistant-island.ts`：等 #1101（草稿、仍在更新，同文件）。a1 之后 #1101 若已合入就做，否则记等待。
    - f1 `feed-projection-ui.ts`：等 C 的 FI7（判定表挂「Feed 迁 Runtime 时搬走」，避免原地拆完又被搬）。
    - 批 F FeedApplication：等 C。
    - 记忆线 MemoryService：等 #1059、#1101。
    - Pages mount/`commands.ts`/`editor-browser.ts`/`hoverHandlePlugin`、`createEventDocumentForms`：已不在报告里。
  - **10-27 W5-11 设计稿**：`claude/w511-oauth-declarations` `51d62acc`（`slices/w511-connector-oauth-declarations.md`，只有设计；RAC-1080～1089 全用，BL-790～793 用，794～799 空）。
    - 用户本人答（10-27 弹窗）：
      - Q2：不写迁移，开发 Home 上已有的 Gmail、Notion、GitHub 设备授权连接标成「需要重新授权」，走 ASC-35；
      - Q5：环境变量统一改成 `CONNECTOR_<SVC>_OAUTH_CLIENT_ID/SECRET`，不留旧名，写进 CHANGELOG；
      - 第 1、2 片（合同、SDK 检查、解释器纯函数，以及 catalog 的 identity.read）评审过后开做，第 3～8 片等 C 合入。
    - 统筹拍板：
      - Q1：只用数据，插件里没有代码钩子；
      - Q3：插件停用后刷新和发送都拒；
      - Q4：MCP_SERVERS 第二批另开一片（BL-790）；
      - Q6：按 `sub` 判断是否同一账号；
      - 新 S 号分三条，各带拒绝测试，号码合批时核。
  - **10-27 评审会话**：W5-11 设计稿是第一份推上来的，按分工提评审卡片（Opus high，只评统筹指定的增量，先评 W5-11 设计稿；只读，结论回给统筹）。
    - 用户已开评审会话：local_f10a3ad3（`local_f10a3ad3-e781-4d53-8fcc-cd46a1429129`）。
    - W5-11 把答复写进设计稿，新头 `b087ae0b9`：
      - §10 各题标出谁、哪天定的；
      - §3.4 的 S 号分成三条；
      - 按 Q1 改了 identity.read：写不成数据的部分补进平台的 identity 声明；
      - 已转给评审，以这个头为准。
    - 第 1、2 片等评审的必改项改完再开。
  - **10-27 R-27 重开**：用户定先不升级本机工具链（btw 会话转达）。条目在 RISKS-AND-DEFERRED.md（`48411ff2c`），有两处更正：
    - 这台机器整体构建也红：一是 CLT 的 SwiftBridging 重复定义，二是 whisper 要 Swift 6.2，本机 6.0.3。
    - jelly-whisper 的 `swift build` 没有一处挡合并（CI 那步 `continue-on-error`，BL-122）。
    - 改到 `apps/local-host/native/` 的片，PR 正文写明「本机没编 whisper，CI 那一步不挡合并」。
    - 统筹待办：向 Codex 核实它的机器是不是 macOS、Swift 是否 ≥ 6.2。
  - **10-27 W5-11 设计稿评审（评的是 `51d62acc`）**：结论是改完再评，有 7 条必须改。原文在评审会话的笔记 review-w511-design-51d62acc.md 里。
    - M1：已有连接只认 service_id，官方集成停用后，签名沙箱包可以认领同一个 service_id。要绑定插件、发布者和令牌来源，产品客户端只给部署配置的那份；T1 之前，非宿主构建的包写带数据的 oauth 一律拒绝。
    - M2：三处比今天松：salesforce 的后缀限制没了；identity 和 context 的发往地址与 S-69 冲突；DNS 固定只覆盖了令牌请求。
    - M3：Worker import 了 `API_OAUTH_PROVIDERS`。
    - M4：旧的 `connector-connection:` 连接会落进 token 分支，成了一条兼容旁路，要改成要求重连。
    - M5：方法声明检查不过时，是整份 Manifest 不过，还是只去掉这个方法？另外 SDK 没有公共后缀表。
    - M6：「插件拿不到令牌」说多了，PG-045、PG-093 两处 provider 拿得到访问令牌。
    - M7：新 S 第 2 条要分清哪些记录能写（消费 state、标 failed、清暂存），哪些不能写（连接、凭据、protocol 配置）。
  - 统筹对评审结论的裁定：
    - M5：整份 Manifest 不过，第 1 片仍然不碰 C；SDK 不带公共后缀表，后缀放宽不许比今天松。
    - M3：要重新部署 Worker 的，先报统筹，由统筹转给用户。
    - 疑问 1：插件停用后，它声明的服务一律不发。token 连接那一半如果超出本线范围，在 BL-794～799 登记，RAC-1088 写明这个边界。
    - 疑问 2：刷新途中插件被停用，已经轮换的 refresh token 不存；重新启用后第一次刷新拿到 invalid_grant，再标成「需要重新授权」。
    - 编号：查了最近 80 个远端分支，没有冲突。
    - 第 1 片改 SDK，属于共享核心，要跑全量，等合批会话开集成批再跑。
    - 建议各条由 W5-11 自己定，不采纳的写一句理由。
  - W5-11 改完推新头后，评审只评 `b087ae0b9` 之后的增量。
  - **10-27 W5-11 第二轮评审（`b087ae0b`）**：结论是改完再评。上一轮的 M1～M7 还没改，这一轮又加了三条：
    - N1：§3.3 第 8、9 条只能在令牌请求之后判断。改成第 1～7 条在任何网络请求之前判断；第 8、9 条换到的令牌直接丢掉；顺序是先查 Host，再原子 consume，带 error 的回调也要 consume。
    - N2：共用刷新的最后检查要加「插件仍启用、安装代次和声明指纹不变」；另外，每次都轮换 refresh token 的服务在取消时会掉线。
    - N3：RAC-1088 只管 OAuth；稿里「10-21 删掉重做」的说法要改成 10-23「本轮不删」。
    - 评审笔记在共享笔记目录 `side-session-notes/local_42bc0769…/review-w511-design-{51d62acc,b087ae0b}.md`，不在仓库里。
  - **用户 10-27 定（N2 的另一半）：只存新令牌。** 插件仍启用、授权没撤、连接仍有效，只是等这次刷新的调用方全部取消了：响应回来就把轮换出的凭据写回原连接，别的一概不写。理由同 S-35，这一步只保住调用前已有的连接，算平台维护凭据。插件停用、撤权、卸载，或代次、指纹变了，照旧不存。C 的共用刷新（`009b773f`）在最后一个参与者离开时把响应丢掉，W5-11 的片要改这一处；配一条正向测试和一条停用时不落库的拒绝测试。
  - **10-27 负载控制**（用户：「做一下负载控制吧，重新规划一下任务安排和节奏，确保顺利推进」）。起因见 R-67：断网和发热、高负载叠在一起，会话成片挂掉，一天重启两次。
    - 已改共享工具 `coord-shared/tools/heavy.sh`：全机 1 个槽位，负载线 10，测试一次 1 个文件。原来是 2 个槽位、负载线 36、3 个文件。开发任务照旧先走。
    - 已改 LINE-COMMON §3：每条线同一时间最多 1 个重活（含子代理），最多 1 个子代理；推送前只构建改到的包、只跑覆盖改动的非浏览器用例；做完一步就在本地提交 WIP；长命令放后台，输出写到 `.impeccable/qa/` 下的日志；重启后先看日志和 `heavy.sh --status`，再决定要不要重跑。
    - 活会话最多 5 个：统筹、评审，加 C、W5-10、W5-11 三条线。写代码的只有 C 和 W5-10；W5-11 只改设计稿，不构建也不跑测试；评审只读代码。
    - 重活的先后：C 在前（关键路径），W5-10 在后。W5-10 恢复推 e1、e2、e3、a1，一次只挂一个重活。
    - 合批会话：C 接近 PR、并且有一个会话空出来（比如 W5-11 改完设计稿闲下来）再开，不让活会话超过 5 个。W5-14 照旧等 C 和 W5-10 合入。
    - 统一验证窗口仍由统筹定。窗口里临时开到 2 个槽位，负载线不动。
    - R-28 已更新，R-67 是新登记。
  - **10-27 W5-11 第三轮评审（`85042a7b`）**：前两轮的 M1～M7、N1～N3 都落进了正文。第 2 片可以开；第 1 片要先改 A4、A2，评审只复核这两处。评审笔记在共享笔记目录的 review-w511-design-85042a7b.md。
    - A1：§2.9「Worker 那份对不上的服务，宿主不提供 broker」在运行时做不到，改成只靠对照测试：对照 providers.ts 的每一项，写明测试保证的是仓库里的代码，不是已部署的版本。第 4 片动手前改。
    - A2：写明插件经 `services.connections` 的请求不认 account_origins（S-69 由 `connector-plugin-requests.ts` 执行，读的是同一张表），RAC-1082 配一个拒绝用例；adobe、bitbucket、feishu、lark 只补进 account_origins，不加进 origins。
    - A3：N2 会把 C 的 FI-C-02 两条断言反过来。第 5 片在同一个 PR 里改 C 的 spec 行和测试，写明用户 10-27 的决定；这次写回凭据是「被取消的调用不写业务记录」的例外，照 S-35 的先例写进 AGENTS.md，第 9 片的清单加上。第 5、9 片动手前改进稿里。
    - A4：第 1 片要改 C 改过的 `connector-host.ts`，违反稿里「可以先做的不碰 C 改过的文件」。
    - M3：`Workers Builds: molis-work-production`（R-51）不是这个 broker，账号和名字都不同，broker 是手动 `wrangler deploy`。所以第 4 片合入不算发版；第一次合入前请用户在 Cloudflare 后台确认一次，已记在 RISKS §4。
  - 统筹裁定：
    - A4 选「挪到第 4 片」：account_origins 和 SDK 的 `{account}` 检查随第 4 片做，第 1 片不碰 C 改过的文件，不开例外。依赖 account_origins 的内容（含 adobe 等四个服务）跟着挪；挪完第 2 片还能不能单独做，由 W5-11 在增量里写明，评审一起复核。
    - 第 2 片按负载规矩排：W5-10 推完 e1、e2、e3、a1 再开（同时写代码的线最多两条），统筹到时通知。
    - A1、A3 在第 4、5、9 片动手前改进稿里。四条建议由 W5-11 自己定，不采纳的写一句理由。
    - A3 写进 AGENTS.md 的例外，是用户 10-27「只存新令牌」决定的落地；PR 正文写明出处。C 线已收到 FI-C-02 以后会被改的告知，C 照现在的合同合入，不用改。
  - **10-27 W5-11 第四轮评审（`85042a7b2..6c9ced77d`）**：没有必须改，第 1、2 片都可以开。评审笔记在共享笔记目录的 review-w511-design-6c9ced77.md。
    - A2、A4 已落实，第 1 片不再改 `connector-host.ts`，第 1、2 片不写同一个文件。
    - 和评审原话有一处不同：CONNECTOR_ACCOUNT_ORIGINS 单独一张表，不做成请求表的字段。评审对着 C 头的代码核过，理由成立：`connector-plugin-requests.ts:132-135` 对不在请求表里的服务退回签名包自己的 origins，`sandbox-package.ts:146-148` 按在不在请求表决定包能不能写 origins，加一行就会盖掉包的声明。
    - 三条建议做片时照做：RAC-1082 的「不 import」只许解释器文件 import；RAC-1081 只限 identity、context 的 url；Atlassian 的 `{gateway}` 用钉住的 cloud_id，accessible-resources 走 `{account}`。
  - **10-27 W5-10 四片已推（没开 PR）**，依次叠在 main `9efbf8d04` 上，每片一个提交：e1 `claude/w510-e1-guidance` `cc7fe0ce2`、e2 `claude/w510-e2-repositories` `9cf5a7fb2`、e3 `claude/w510-e3-facts` `9ff7482d8`、a1 `claude/w510-a1-tab-workspace` `466df7f33`。自报 14 个覆盖改动的非浏览器用例全过，健康门禁对照 merge-base 通过。
    - 已转评审逐片评，评审过了统筹再通知开 PR。a2 等 #1101，f1 和 FeedApplication 等 C；W5-10 先空着。
  - **10-27 写代码的线换人**：W5-10 推完空出来，W5-11 开第 1、2 片，按顺序做，一次一个重活。第 1 片改 SDK，属于共享核心，全量进集成批。同时写代码的仍是两条：C、W5-11。
  - **10-27 15:20 试开两个槽位，几分钟后用户定改回一个**：用户先说「不要让槽位空着，可以适当尝试开到两个」，统筹把 heavy.sh 和 `heavy-verify-slots` 放到 2；用户随后说「看来还是不行，槽位还是限制在一个吧」，已改回 1，中间没有任务占过第二个槽位。heavy.sh 头部记了这次，没有用户的话不再调高。
    - 同一时段 15:19–15:21 又断了 3 次。当时负载 4～5，没有重活在跑，R-67 已按此改判为 Wi-Fi 本身的问题。
  - **10-27 W5-11 第 2 片已推**（`6c9ced77d..988f182e3`，只改设计稿，没开 PR）：新增 §2.1.1，列出 37 个有 OAuth 方法的服务的身份数据（照 C 头今天的算法抄，已有通用连接重新授权时 account_id 不变；wechat、loom 没有 OAuth 方法），并给出 account_origins 清单。已转评审，请评审先看合同那一件，因为第 1 片照它写。
    - identity 合同变大（method、body、headers、query、list、label_prefix、keep、分段 account_id，pick 只留 ids、match_setting）：评审核它会不会长成一门小语言，必要时在第 1 片定型前收窄。
    - 宿主给 token 连接查身份的两处 catalogWhoami（`connector-access.ts`、`connector-account-actions.ts`）登记 BL-795，本线不做：统筹认可，和「token 那一半登 BL-794～799」的裁定一致。
    - 两处有意的行为变化：Notion 的 account_id 改成 workspace（Q2 已定重新授权）；x 取不到用户名时不再兜底显示「X」，改为报身份读取失败。后一处等评审核 x 在我们申请的 scope 下能不能总拿到用户名，正常账号也可能拿不到就另议。
    - W5-11 接着做第 1 片：合同、SDK 检查、解释器纯函数。
  - **10-27 W5-10 四片评审结论**（评审笔记 review-w510-e1-a1.md）：e1、e2、e3 能开 PR，a1 要改。
    - e1 按职责拆，校验顺序、错误码、哈希、SQL、事件和事务边界都没变；e2、e3 逐字搬迁。
    - e3 新增 GoalEventFacts 巨大单元登记（193 行、30 方法，cohesive-unit，评审手数与实测一致），统筹认可。理由要改准：方法数由合同 GoalEventFactsApi 定；readCompletionContext 不是转发。
    - a1 两处必须改：一是按原顺序把一个闭包切成三段，文件名和内容对不上，属于硬拆，和用户 10-25「巨大单元不硬拆」冲突；二是空 catch 的注释写在模板字符串里，`/assets/molis-work-workbench.js` 多了 322 B，main 那条一次性放行已经用掉，CI 的 page-assets:check 会红。
  - 统筹裁定：
    - e1～e3 按叠放顺序开 PR，一片一个。baseline.json 不每个 PR 都刷，合批时在批头刷一次。
    - a1 不撤，也不交给 W5-04：交接已定批 A 走过渡模板拆分，所以改成按职责重拆。有副作用的语句不改先后，挪不动的留在原文件；不往模板里加注释，送出的字节数只能相等或变小；空 catch 要么留在原文件，要么真的处理错误且不涨字节；做不到就报统筹，不改门禁。这样不算硬拆，不用问用户。
    - 「同时最多两条线写代码」的限制取消（R-28）：单槽已经卡住了 CPU，用户要求不让槽位空着。现在 C、W5-11、W5-10 三条都在写代码，重活排同一个槽位。
  - **10-27 W5-11 第 2 片评审结论**（988f182e3，评审笔记 review-w511-slice2-988f182e.md）：数据能合；身份字段不算一门小语言，但要收窄。
    - 第 1 片的合同照这个写：list 只留 `{ min_by }`，删掉 sentry「按上下文里的 org 取 slug」（授权时上下文没有 org）；删掉 `context.when_missing`（37 个服务都没用）；写明 body 不展开占位符、label_prefix 是字面量。只给一个服务用的三个字段（x 的 label_prefix、adobe 的 {client_id}、sentry 的 min_by）可以留，各写一句理由。
    - 稿:284、稿:640 写错了：`connector-access.ts` 的 inspectApiConnection 和 `connector-account-actions.ts` 的 readConnectorAccount 也给 OAuth 连接用。已经对出来的不一致：Notion 的检查返回 ws:bot，连接上存的是 ws；sentry 检查缺 user；clickup、supabase 缺 workspaces；x 检查仍兜底显示「X」。
    - x 去掉兜底可以：scope 里有 users.read，/2/users/me 带 username，label 还能退到 name。Notion 照 Q2。clickup、supabase 缺 id 时，以前会拼出 `undefined:workspaces:…`，改成报错，稿里写一句。
    - 第 5 片的问题：就地重连要求旧连接带 connector-protocol 上下文、而且 account_id 相等（`connector-api-oauth.ts` 278-279 行）。旧的 Gmail、Notion、GitHub 设备授权连接没有这份上下文，所以稿:652「走 ASC-35 重连、保留绑定」在 C 的代码上走不通。
  - 统筹裁定：
    - 选 A：上面两处按 auth_method 分开，OAuth 那一支改调解释器，和授权用同一份声明、同一个算法。放在 C 合入后的第一片（第 3 或第 4 片由本线定），动手前先核 C 有没有改过这两个文件；BL-795 只剩 token 连接。不选 B：照 B，同一项事实（OAuth 连接的账号）会有两套算法，上面那些不一致就得长期登记着。
    - 副作用要写进稿里并配测试：旧检查记下 expected_account 的等待项要再检查一次。这和 Q2「不迁移、重新授权」一致，不另写兼容读取。另加测试：同一个 OAuth 服务，授权、检查、读账号三处算出的 account_id 和 label 都相同；Notion、sentry、clickup、supabase、x 至少各一条。
    - 第 5 片：先在稿里写明旧连接重连时怎样认出原来那个账号，不许读历史取值兜底。可以考虑从这条旧连接自己的重连入口发起，由本人确认是同一个账号。如果只能留一条兼容路，或者绑定保不住，先报统筹，由统筹去问用户，因为这会改变 Q2 当时的前提。
    - 改完推新头，评审只复核这几处；第 1 片照收窄后的合同接着做。
  - **10-27 W5-11 第 1 片已推送**：分支 `claude/w511-oauth-declarations`，头 bb62fe31f，基 988f182e3，8 个文件，+1211/-9。
    - 内容：contracts 加了纯数据的 kind:"oauth" 成员，只增不减，API 快照已刷新；SDK 新增 `oauth-declarations.ts`，接进 Manifest 解析，声明有错时整份 Manifest 被拒；宿主新增 `connector-oauth-declarations.ts`，是唯一的解释器，全是纯函数，还没接进现有流程（第 3 片起才接）；测试覆盖 RAC-1080～1082。
    - 本机跑过：新测试 19/19、6 个覆盖文件、`check-health-gates --base origin/main`、boundary、secrets。SDK 属共享核心，全量进集成批次，PR 写「本机延后验证」。local-host 的 Swift 原生步骤失败，是 R-27，和这片的改动无关。
    - 这片推送时，统筹的第 2 片裁定还没送到，所以有几处还没收窄：listEntry 里 sentry 按 `context.org` 取的分支和对应注释还在；「body 原样发出」「label_prefix 是字面量」两条没写；`when_missing` 已经删了。
    - RAC-1080 拿 catalogWhoami 当期望值对照，按选 A 不对：旧实现不能当真值，和它不同的地方（Notion 的 ws 和 ws:bot、x 的兜底）要标成有意的改变。
  - 统筹安排：W5-11 在第 1 片上补一个提交，做上面的收窄、改 RAC-1080 的对照方式，第 2 片裁定要改的稿也在这次一起推；不改写已推的历史。评审先评 bb62fe31f（笔记 review-w511-slice1-bb62fe31.md），知道哪几处还会变，补的提交只复核增量。评审过了再开 PR。
  - **10-27 W5-11 第 1 片评审结论**（bb62fe31f，评审笔记 review-w511-slice1-bb62fe31.md）：要改，三处必改，量都不大；收窄那几项没算在内。
    - M1：公开主机名的判断、占位符的写法、平台自己写的请求头名单，SDK 和宿主各写一份，解释器还缺请求头名单。这和 AGENTS「共用的工具放在 SDK、平台从 SDK 取同一份」冲突。
    - M2：租户由调用方传进来（OAuthRequestScope.tenant），salesforce「identity 必须发到 instance」这条优先级不在解释器里。SDK 也收下没有租户来源的 {tenant}，没限制 check: tenant 的 keep 至多一个。
    - M3：RAC-1080 仍拿 catalogWhoami 当真值，比较 label 时还去掉了「@」，所以 label_prefix 写没写都能过。
    - SDK 和解释器还有四处对不上：{tenant} 的来源（M2）、default 不按规则检查、match_setting 的 setting 不要求是 tenant、ids 指针的 ~1 转义。
    - 纯度方面只有 localeCompare 会随 locale 变。请求检查方面，评审试了账号密码位、端口、大写主机、结尾的点、编码过的斜杠、{account} 等写法，没找到绕过的路。裸 oauth 可以接受。错误码、API 快照和合同包抽查都对。
  - 统筹裁定：
    - 全部照评审改。M1 的函数放进 SDK，宿主从 SDK import，常量可以放 contracts（合同包不许放函数）。M2 由解释器按固定规则自己算租户：先用 keep 下来的，再用 setting；SDK 拒掉上面两种写法。M3 每个夹具写 §2.1.1 规定的字面量当期望值，旧实现只当旁证，和它不同的标成 intended 并断言确实不同。四处不一致一起改，localeCompare 改成按码点比较。
    - context 注释里「只在 key 不在上下文时才发」，授权流程里从来不生效，和 sentry 的 org 分支一起删。第 5 片要用时带测试加回来。
    - 写进第 3 片的稿：§2.8 的拒绝不能晚于第一次接线；发请求用 redirect: "error"。
    - 行为变化，统筹接受：已授权的工作区为空时，今天能连上（account_id 以 :workspaces: 结尾），改后报错。会受影响的是没有任何组织的 Supabase 账号，这种账号碰不到任何项目；ClickUp 授权时必须选工作区，不受影响。允许为空就要给合同加开关，和收窄的方向相反。写进 §2.1.1，报错要说下一步怎么做，并配测试。
    - W5-11 把第 2 片裁定、收窄、本次评审要改的合成一次推送。评审只复核增量，复核通过再开 PR。
  - **10-27 W5-11 照第 2 片评审改完**：新头 00cb22819，叠在 bb62fe31f 上两个提交，3dcb8c330 改代码，00cb22819 改稿。已转评审复核，笔记 review-w511-slice2-fix-00cb2281.md。
    - 收窄：list 只剩 min_by；body 和 label_prefix 里有占位写法时，SDK 整份拒绝。
    - 选 A 放在第 4 片，授权、检查、读账号在同一个 PR 里一起换。为此加了一条：检查时 token:/指针 改读 keep 下来的键，Notion 的 keep 加 workspace_name，Notion 的 identity 加 GET users/me。
    - 新加的「label 已经以 label_prefix 开头就不再加」，统筹请评审核它是不是多余的规则。
    - 第 1 片评审的修改（M1～M3）还没上来，下一次推送补上。
  - **10-27 第 5 片旧连接重连，用户本人改定**：
    - W5-11 原提议：从旧连接自己的重连入口发起，拿连接表的 account_label 和这次授权算出的 account_id 或 label 比，对上了就认作原账号、保留绑定。这条分支只有旧连接会走，照 AGENTS 算新增兼容逻辑；不加它，Q2 当时「来源绑定保留」的前提就不成立。所以统筹问了用户。
    - 用户答：**新增连接、重新绑定**。旧连接只能换成新连接，原来的来源绑定由本人重新绑，不加兼容路。
    - 落到稿里：§10 Q2 补一行改定，原句标成被取代；稿:652 跟着改；设置页提示写清楚要重新新增、重新绑定；第 5 片写明旧连接怎么收尾，配用例证明旧形状的连接不会被悄悄认成原账号。
  - **10-27 W5-11 两次推送**
    - 00cb22819 评审复核完了（笔记 review-w511-slice2-fix-00cb2281.md）：收窄落实了，稿:284、稿:640 改对了。
    - 统筹照评审另定四项：
      1. 占位符文法在 SDK 只留一份，并进 M1，补一条 GraphQL 照收的用例；
      2. 删掉「label 已经以 label_prefix 开头就不再加」，异常情况下显示 @@，写进 RAC-1080 的有意不同；
      3. account_id 和 label 只许取 identity:、context:、literal:，令牌响应只经 keep 进上下文，省掉两条规则；
      4. 稿:323 改由调用方说明白：授权时发 context 请求，检查、读账号、刷新都不发。
    - d4907d786（叠在 00cb22819 上，fa173cac6 代码，d4907d786 稿第六版）照第 1 片评审改了：
      - M1：新文件 `packages/plugin-sdk/src/oauth-templates.ts`，加 contracts 常量 `OAUTH_PLATFORM_HEADERS`；
      - M2：`oauthPinnedTenant`，先用 kept 的值，再用 setting；
      - M3：12 个服务的期望值都写成字面量；
      - 四处对齐，工作区为空时报错；
      - 两份 API 快照已刷新。
      - 已转评审，排第二。上面四项和第 5 片改稿合成下一个增量。
  - **10-27 W5-10 开了四个 PR**
    - 四个 PR：#1314（e1，CI 14 项全绿）、#1315（e2）、#1316（e3）、#1317（a1 按职责重做，头 6822578f9，workbench.js 少 52 B，预算降到 1,147,189）。
    - 四层的 affected-tests `full` 都是空的，不进集成批。
    - 统筹批准 W5-10 自己按顺序走合并队列逐个合：合入后下一层改 base 到 main，合 origin/main 后普通推送（不 rebase、不 force push），等 CI 全绿再合。#1317 等评审过了再合。baseline.json 在最后一个 PR 里刷一次。不开 auto-merge，不取消 CI。
    - workbench.js 的预算和 C 的 +21 B 会撞，谁后合谁按当时的 merge-base 重量。
  - **10-27 C 收尾回报**（`feature/anticorruption-closeout-c` 推到 143d57bb5，14 个提交，没有 PR）
    - 已完成，都是作者定向验证：FI-C-03～07、RAC-808 和 SYS52，以及各类生成物。
    - 健康门禁 `--base origin/main` 只剩一项红：FI7 没开工，`hybrid plugin feed host-files 0 → 1`。
    - 其他未完成的：
      - boundary:check 崩溃，脚本还读已删的三个文件；
      - 页面资源 +21 B；
      - 4 个红文件和 fe93d322f 的结果一样，但那是本分支 10-26 的暂停头，不是 main；
      - Notion 复审没出结论；
      - 测试文件的 tsc、浏览器用例、security 全量、Full 都没跑。
  - 统筹裁定，以及用户本人的批准：
    - **用户 10-27 批准两处边界门禁改动**：
      - ① 照共享笔记的补丁，把读已删文件的检查改指向接手的现存文件；
      - ② 做 FI7 Feed 一半时，Feed 规则照 Inbox 的写法改成「宿主没有 /api/feed、Manifest 声明 routes」。
      - 两处都不许放松（不加「文件不存在就跳过」），提交说明写用户批准，评审在 PR 里核。
    - FI7 的 Feed 一半在 C 里照做，仍是「FI-3～FI-7 一个 PR」。浏览器用例照写不在本机跑，PR 写「本机延后验证」。页面资源做完后和 +21 B 合成一次交评审放行；单个资源涨超过 10 KB 或新增资源，先问用户。
    - 4 个红文件用干净的 main 工作树（9efbf8d04）一次一个文件重跑：main 也红就登记成 main 的红；main 是绿的就是 C 的回归，在 C 里修。
    - Notion 复审（009b773f0）排给评审第一个。tsc、security 全量、Full 排到开 PR 之前，C 接近开 PR 时统筹再开合并会话。
  - **10-27 W5-11 推到 58777fed5**（叠在 d4907d786 上，三个提交，没有改写历史）：
    - 5188fb931，稿第七版：照用户改定，旧连接收尾分四步：
      - 标 reauth_required；
      - 设置页提示要重新新增、重新绑定；
      - 本人点重连，得到「请新增连接」，什么都不变；
      - 平台不删也不改绑，本人换好后自己删旧连接。
      - RAC-1089 三种旧连接各配一条用例。
    - d34d96478 和 58777fed5（代码、稿第八版）：复核的四项都改了：
      - SDK 的 oauthPlaceholder 一份文法，GraphQL 三种写法照收；
      - label_prefix 原样拼上；
      - OAuthValueSource 去掉 token:；
      - context 请求只在授权时发。
    - 本机 7 个文件、健康门禁、boundary、biome、secrets 都过了。
    - 00cb22819..58777fed5 一次转评审，排在 C 的 Notion 复审后面。第 1 片等这次复核过了再开 PR。
    - W5-11 空着时只读核一件：第 5 片第 ④ 步要的「来源换连接」入口，C 的分支上有没有。
  - **10-27 C 的 FI-C-02 Notion 复审**（009b773f0，笔记 review-c-fic02-notion-009b773f.md）：可以合，没有必须改的。点名的六项都和代码对上了，反例断言的是拒绝本身。
    - 统筹定：C 在本批补两条用例：两方都取消后、响应回来前来了第三个调用；刷新期间 refresh 值或 revision 变了。
    - 另外两条建议记进 §13，不挡合并：被取消的一方仍要等共用刷新结束；被撤权但 signal 没中止的参与者，要到下一次检查才离开。
    - 取舍：全部参与者都取消、而请求已经发出时，Notion 轮换出的新 refresh token 不写盘。这是「被取消的调用不写记录」的代价，登记 R-68。
  - **10-27 W5-10 合 #1314 被权限分类器拒了**（理由是未经评审合并；统筹的批准是会话消息，分类器不认）。
    - W5-10 没有绕开，统筹也不替它合：权限拦下的动作不换个会话去做。
    - 已请用户本人在 W5-10 会话里回复。每个 PR 合并都要用户本人同意，不把一次同意套到下一个 PR 上。
    - 以后安排合并时，事先告诉用户会在哪个会话里问他。
  - **10-27 W5-11 d4907d786 复核**（笔记 review-w511-slice1-fix-d4907d78.md）：可以合，没有必须改的。M1～M3、四处对齐、空工作区报错都落实了。
    - 统筹定，四条小改和本地的 80ee5aa74 一起推：
      - 「端口大写」照实改成放行用例；
      - 删掉走不到的 tenant 分支；
      - salesforce 的 instance 那条 keep 标 required：identity 发到哪里不能悄悄变；
      - SDK 新加的 15 个函数移到子路径（照 /highlight、/rich-text），根入口只留 Manifest 解析要用的，跑 api:update，PR 写清对插件作者的影响，AGENTS 里共用工具的清单补一项；子路径有障碍就先报统筹。
    - 80ee5aa74：W5-11 只读核实，C 分支上已经有「来源换连接」的入口，在 Feed 来源详情的账号连接下拉框。换连接会新建一个来源、暂停旧的，不是就地改绑。所以第 5 片第 ④ 步不用另开入口。
    - 评审评完 a1（#1317）后，一次复核 d4907d786..新头，其中 5188fb931..58777fed5 还没评过。复核过了第 1 片就开 PR。
  - W5-10 在等用户本人在它的会话里同意合 #1314。
  - **10-27 #1317（a1 按职责重做，6822578f9）评审通过**，没有必须改的（PR 评论 6439705331，笔记 review-w510-a1-redo-6822578f.md）。
    - 评审拿文本和语法树逐条比对：
      - 六个部件拼回去和原文是同一段文本，只换了次序；
      - 锚点次序不变，105 个定义里 104 个前移、没有后移；
      - 没有加注释，空 catch 都留在主文件；
      - page-assets 只改一行，-52 B。这个数要等改成以 main 为基、CI 跑过 page-assets:check 才算证实。
    - 两条小建议在合 main 的那次推送里一起做；两份测试文件名单合成一份时，断言的范围不许变小。
  - #1314：用户本人在 W5-10 会话里同意了，已进合并队列。#1315、#1316、#1317 每个都要用户本人再同意一次。
  - **10-27 W5-11 复核 00cb22819..58777fed5 和 80ee5aa74**：
    - 四项都落实了，可以合。
    - 占位文法：评审核实，§2.1.1 的 39 个名字里没有一家会被拒。
    - 第 ④ 步引的 C 代码位置逐个都对上了。
    - 要改稿的一处：C 上 Alchemist 的市场脉搏另有一个 GitHub 槽（`alchemist-pulse-github.ts`），旧连接要求重新授权以后会悄悄退成匿名搜索，而且不在 connectors.usages.read 里。统筹定：
      - 升级须知和 Q2 第 4 步补「市场脉搏的 GitHub 账号要重新选」；
      - RAC-1088 或 1089 加一条断言：脉冲不再用旧令牌；
      - Alchemist 不迁移、以后删，所以另两件只写进稿里，不修。
  - W5-11 推了 ac646bbda（叠在 58777fed5 上，中间是 80ee5aa74）：
    - 四条小改：端口用例、tenant 分支、salesforce 的 instance 标 required、OAuth 规则移到 SDK 子路径 /oauth；
    - 已转评审复核；
    - Alchemist 那个小提交推了，评审一并核完，第 1 片就开 PR：base 是 main，正文写清 /oauth 对插件作者的影响和「本机延后验证」，SDK 全量进集成批。
  - #1314 已合入 main。#1315 已改基到 main、合了 origin/main，推到 a9f9e1d87，CI 在跑。
  - **10-27 ac646bbda 复核**：四条小改都落实了，可以合。
    - salesforce 比要求的多走了一步：check:tenant 的 keep 一律要 required；令牌响应缺 instance 时报 account_missing。
    - /oauth：根入口的快照和 main 完全相同，新增 16 个函数、3 个类型，只增不减。
    - 两处措辞（oauthPinnedTenant 的注释、AGENTS 清单的说法）并进 Alchemist 脉搏那次改稿。评审核完这一个提交，第 1 片就开 PR。
  - **10-27 W5-11 推到 800cd0758**：b8c7af87c 补 Alchemist 脉搏，800cd0758 改两处措辞。已经推了的提交不改写，所以措辞没并进 Alchemist 那个提交，单独成一个。已转评审；评审核完，第 1 片开 PR。
  - **10-27 C 推到 8800e07bf**（快进 4 个提交）：
    - 3c961464a：边界检查按用户批的改，`check-package-boundaries` 报 errors []，64 个包。
    - 4 个红文件在干净的 main 9efbf8d04 上全绿，所以都是 C 的回归，已在 C 里修：
      - ① home-mcp-actions：Feed Manifest 缺 attention.inbox，补上了，这是产品回归的修复；
      - ② plugin-query-consumers：照 4e-2f 给测试调用方补权限；
      - ③ feed-item-actions：缺权限时升格从「列出但不可用」变成「目录里没有」；
      - ④ goals-mcp-grants-fixture：没装 Feed 的项目授权得 404 actions.missing。
    - a7b722fa9：inbox-plugin 加断言，钉住「移除 Inbox 会连带移除 Feed」。
    - ③④ 和 a7b722fa9 由评审确认是预期变化、不是削弱断言。评审排在 W5-11 最后一个小提交后面，C 接着做 FI7。
  - **10-27 W5-11 第 1 片复核结束**：评审核完 ac646bbda..800cd0758，没有必须改的（笔记 review-w511-slice1-fix-d4907d78.md 第四部分）。
    - RAC-1089 加了一条断言：发往 api.github.com 的请求不带旧连接的令牌。断言的是拒绝本身。
    - 统筹批准推送并开第 1、2 片的 PR，base main。
    - PR 正文写：根入口没变；新增 /oauth；Manifest 声明字段可写可不写；Alchemist 脉搏的账号要重新选，只写明、不修；本机延后验证。
    - 改了 SDK，算共享核心，所以全量排进集成批次跑，这个 PR 等批次跑完再合。
    - 合并要用户本人在 W5-11 会话里点同意。
  - **10-27 W5-11 开了 [#1322](https://github.com/molis-ai/molis-work/pull/1322)**（第 1、2 片，base main，Auto-fix 已开）。等集成批次跑全量；合并要用户本人在 W5-11 会话里点同意。
  - **10-27 C 8800e07bf 评审结论**（笔记 review-c-8800e07b.md）：
    - 4 个红文件的修法都成立，都是 Feed 进 Runtime 后的预期变化或产品修复，没有放宽断言：
      - ① 补 attention.inbox，和 Goals 同一写法；
      - ② 补的两项权限正好是 PLATFORM_NEEDS 多出来的；
      - ③ 断言比原来严；
      - ④ 加了 grants 为 [] 的断言，证明不留记录。
    - a7b722fa9 成立：Feed 的 companion 是 Inbox，移除 Inbox 会连带移除 Feed，这在 main 上就是如此。
    - 边界检查 3c961464a 有 2 处必须改，已转 C，排在 FI7 之前：
      - legacyCallers 要覆盖 `plugins/native/feed/src/application-assembly.ts`，或扫 feed/src 下 store/ 以外的全部文件；
      - Listener 检查的宿主一半改锚 `plugin-source-pull-service.ts:49`，并钉住 plugin.ts:97。
      - 另建议：读 Goal SQL 的检查也覆盖 application-assembly、plugin、goal-promotion。
      - §13 跟着改。
    - 统筹决定，登 **BL-800**：
      - 问题：在 C 上，移除 Inbox 后再只加回 Inbox，Feed 的消息要等手动加回 Feed 才回来；在 main 上会自动回来。用户会以为消息丢了。
      - BL-800 要做的：移除 Inbox 时提示会连带移除 Feed，加回 Inbox 时提示把 Feed 也加回。
      - 不挡 C；C 在 §13 写明这个行为变化，并在 C 的 BACKLOG 加这一行。
      - C 还要看一眼移除确认界面现在有没有点名 Feed。
      - BL-800 查过 main、协调分支和 8 个在途 PR，都没用过。下一个空号是 BL-801。
  - **10-27 C 推到 d96bd692d**：FI7 的 Feed 一半做完，健康门禁 --base 通过。
    - workbench.js 降到 1147055，抵掉 +21 B 后还有余，不用放行。
    - 8800e07bf..d96bd692d 已转评审。
    - 统筹对 C 提的 4 件事的裁定：
      1. **D-4e3-1 不成立，按用户 10-10 的决定在 C 里改产品。** 用户的决定是：本人升格记「已确认」，其他调用方记「待确认」。D-4e3-1 只出现在合成提交 d7da3e05c 的两份测试里，main 和协调分支都查不到裁定记录。
         - 改法：Goals 按可信上下文里委托链的原调用者判断，不读输入，也不信 Feed 自报。
         - 测试：desktop-tui 回绿；那两份测试改回用户的决定；新加一条拒绝用例：工作流、Agent、MCP 或 Feed 自己发起的升格，只记 proposed。
      2. **发版核对。**
         - Feed Manifest 退回 0.3.0，和 main 一样。POLICY 规定版本只在发布 PR 里改，所以这是撤掉越线的改动。
         - CHECKLIST 补 `FEED_HOME_DATABASE` 一行。
         - C 改了库结构，下次发布要升次版本，留给发布 PR。
      3. **inbox-automatic-scenes 在 C 里改写**：改走 `feed.sources.sync` 加取数替身，正好证明 Runtime 同步加 capture 场景这条路；原断言不动。另登 **BL-801**：Feed `source-sync.ts` 的 catch 先做 beforeEffect 再核，把原错误盖成 `feed.source_changed`，主人是 C 线。
      4. **FI7b 槽账号 UI 另开切片，不进 C。** C 不做它也没有回归，Feed 照旧写 connection_id。C 开出 PR 后，C 线从 C 的头开分支接着做，C 合并后再开 PR。开工前查和 W5-11 第 3 片起有没有撞文件。
    - 装配冻结名单 NATIVE_PLUGIN_HTTP_FILES 去掉 feed：同意，名单只许减少。
    - 这一轮 C 还要做：边界检查的 2 处必改、BL-800，再在 heavy.sh 下跑根 `tsc --noEmit`。
    - 浏览器用例、security 全量和 Full 不在本机跑，由合并会话来排。
    - 下一个空号 BL-802。
  - **10-27 C 推到 4353b5905**：边界检查两处必改做完（a91f7bc25），Goal 读 SQL 那条建议也一起做了；BL-800 写进 C 的 BACKLOG（4353b5905）。已转评审复核 d96bd692d..4353b5905。
    - 4 项裁定的消息还在 C 的队列里，C 这一轮先做 Notion 两条用例和 R-68 的 §13 说明。
    - C 读代码查了移除 Inbox 的确认界面，所以 BL-800 的范围缩小：
      - 项目 Dock 和插件市场移除当前项目的插件，都已写明「同时移除：Feed」；
      - 缺口一：插件市场移除别的项目的插件，只说「已移除自 <项目>」，不提 Feed；
      - 缺口二：加回 Inbox 时，哪里都不提 Feed。
  - **10-27 C FI7 Feed 一半评审完**（8800e07bf..d96bd692d，笔记 review-c-d96bd692.md）：代码没有必须改的。
    - 授权和传输检查一项没少，还多了一道：Runtime 路由先查插件在不在项目里，再按安装查每条路由的 feed:read/feed:write（S-15）。
    - 03eb459c9 比原来严。
    - OPTAREA-02 改成 actions.missing 是预期变化，和 Inbox、Schedule 在 main 上一样。
    - e8cab012f 和冻结名单只是变严、变小。
    - 统筹认了 web-home-isolation 的 W3-01 C 变化：没装 Feed 的项目在门口就拒绝，不留行、不带编号，和 Inbox 等 Runtime 插件一视同仁（用户 10-18）。C 要改 local-host README:163，并补一条「门口之后被拒、留行、带编号」的 HTTP 用例。
    - 舞台分派表按名字写死、`feed_source_catalog` 是宿主按 Feed 命名的投影，这两样都归已登记的 PG-060，不是新私路。C 在 PG-060 的位置列补上 `plugin-stage-fragment-http.ts`、`web-request.ts:201`、`web-view.ts:111`；§13 写明 4c-3「宿主那份到 4e-3 删」那个条件做到没有。
    - C 还要修过时文档：RUNTIME-MIGRATION.md:78；PG-057 的「/api/feed 23 处」，客户端现在一处也没有了。
  - **10-27 C 边界检查复审通过**（d96bd692d..4353b5905，笔记 review-c-4353b590.md）：两处必改都改对了，可以合入。
    - legacyCallers 递归扫 feed/src 下 store/ 以外的全部文件，没漏目录。
    - Listener 锚到 plugin-source-pull-service.ts:49，整条供给链是连着的。
    - Goal 读 SQL 的检查加查三个文件，够用。
  - 评审还查出几处老漏洞，这次没改，统筹决定登 **BL-802**，不在 C 里改：
    - directFactSql 正则：
      - 用 JOIN、表名加引号、加 `main.` 前缀、ALTER 或 DROP，都能绕过；
      - 表名只写了 3 张，store/ 实际建了 12 张，其余 9 张在包内部没人管。
    - Listener 正则：
      - `[^}]*` 不要求 registry 的值正是 homeIntegrationRegistry(home)；
      - 按子串匹配，写在注释里也能过。
    - 收紧这两条正则属于改门禁本身，开工前要问用户。
    - BL-802 那一行由 C 写进它的 BACKLOG，下一个空号是 BL-803。
  - **10-27 C 推到 7bb44456b**：
    - 0f4c83de4：
      - D-4e3-1 按用户 10-10 的决定改回：本人升格记已确认，其他调用方记待确认；
      - Feed Manifest 退回 0.3.0，CHECKLIST 补 FEED_HOME_DATABASE；
      - inbox-automatic-scenes 改走 feed.sources.sync；
      - FI7 评审的四处跟进。
    - e66871269：Notion 共享刷新补两条用例，§13 写了 R-68 的取舍。
    - 4353b5905..7bb44456b 已转评审复核。
    - 受影响的文件逐个跑，都绿，只有 inbox-automatic-scenes 一处例外。
  - **RAC-510 统筹裁定在 C 里修，先出方案。**
    - 现状：Runtime Feed 装配时没给 artifacts 端口，所以每条命中规则的消息都不出 feed.capture 成果，Inbox 还多一条「捕获失败」。main 上是宿主装配时给的。
    - 这是 C 规格的验收条目，也是对 main 的产品回归，带着它不能合。
    - 方案首选：平台让 `services.artifacts.publish` 和 attention 一样并进插件的提交，不给 Feed 开私路。
    - 方案要按时间点写清取消、撤权、停用时会怎样：成果也是业务记录，被取消的调用不能留下。
    - 方案写在 c-rac510-design.md，先交评审看，统筹批了 C 再动手。
    - inbox-automatic-scenes 第 166 行在那之前先红着，§13 照实记。
  - **10-27 C 7bb44456b 复审**（笔记 review-c-7bb44456.md）：
    - **一处必改**：`goals/src/action-contract.ts:18` 的 `personAsked`，只要有 `delegated_by` 就算本人。
      - 绕法：本人在工作流里点「交给下一站」（`workflows.instances.continue`），下一站的 `goals.create` 就会记成已确认，还能指定 `feed`、`onboarding` 这类渠道。
      - 违反两条：用户 10-10 定的「工作流只记待确认」，以及「只有本人能指定渠道」。
      - 统筹采纳评审的最小改法：委托来的调用，只有 `delegated_by` 是来源的主人（Feed）才算本人；别的委托方记 proposed、不许指定渠道、不填渠道时记 runtime。
      - 补拒绝用例：委托方换成 Workflows。
      - SECURITY-INVARIANTS 新加一行，写清 Goals 怎样认本人，号先写「暂定」，合并时定。
    - 登 **BL-803**：平台层的做法，由 Host 带出委托方正在跑哪个动作，把「本人」收窄到具体动作；不进 C。下一个空号是 BL-804。
    - 其余都对：
      - Goals 只读可信字段；
      - Feed 的定时、场景、后台作业和两跳委托都不会记成本人；
      - 两份测试是改回用户的决定；
      - Manifest 和 CHECKLIST 都对；
      - inbox-automatic-scenes 的断言一条没动；
      - FI7 的四处跟进都对；
      - Notion 两条用例正好钉住「请求已发出后全部取消，新的 refresh token 不写」。
    - 排序：C 先改这一处，再交 RAC-510 方案。
  - **10-27 W5-10 #1315 CI 全绿**（14 项成功，1 项跳过，合并状态 CLEAN，base 是 main）。统筹批准合并，照 #1314 的做法走合并队列；合并那一步要用户本人在 W5-10 会话里点同意。合入后 #1316 把 base 改成 main，再 merge origin/main。#1322 的 CI 也全绿了，等集成批次。
  - **10-27 C 推到 bc7c06c07**：personAsked 必改已修，委托来的调用只有来源主人 Feed 发的才算本人，暂定 S-99。c54cc6a5d 在 §13 记了 RAC-510 的状态。
  - **RAC-510 方案（c-rac510-design.md），统筹批了方案 A**：平台给 `services.artifacts.join`，和 attention.join 同一套机制、复用同一份 gateFor。
    - 成果在 Feed 的项目库事务里写：同一个连接，嵌套时用 SAVEPOINT，所以「提交之后、发布之前」这个窗口不存在。
    - 会触发捕获的 6 个动作都声明 `artifact:write`。取消、撤权、停用一律回滚整个事务，不记 `artifact_out_failed`。
    - 暂定 S-100，配 8 条拒绝用例。
    - 条件：
      - §7 先用用例证实 `feed.content.receive` 缺 `attention:write` 会不会被拒，是 C 的回归就在 C 里修；
      - CHECKLIST §4.3 加一条候选维护：main 时期 producer 为 `native:feed` 0.0.0 的成果行改成 Feed 身份；
      - 不写读取兼容。
    - 评审在同时独立看方案，并复核 bc7c06c07。
  - **登 R-69**：main 时期 Feed 捕获的成果线 producer 是 `native:feed` 0.0.0，C 之后这些旧线再捕获会出可见的 `artifact_out_failed`。处理办法是发版维护，动真实 Home 之前问用户。下一个空号 R-70。
  - **W5-10 #1315**：头还是 a9f9e1d87，等用户本人在 W5-10 会话里点同意，再进合并队列。
  - **10-27 W5-10 #1315 已合入 main**（`74f31c19e`，14:07Z），用户本人在 W5-10 会话里点的同意。
    - #1316 的 base 改成了 main，合了 origin/main，正常推送，新头 `7cc01fb34`，CI 在跑。
    - 合并时有 4 处冲突，原因是 #1314、#1315 在 main 上是 squash 合入的，e3 分支里还带着原提交。
    - #1317 等 #1316 合入后再做。
  - **10-27 评审 bc7c06c07 和 RAC-510 方案**（笔记 review-c-bc7c06c0-rac510.md）：
    - bc7c06c07 可以合。S-99 是空号。另有三处小改：拒绝用例加断言文字、§13 记通过记录、写明本机没跑的部分。
    - RAC-510 方案 A 的原子性论证成立：
      - 写库和成果库是同一个 ports.store.db；
      - better-sqlite3 12.8.0 在外层事务里用 SAVEPOINT；
      - 公告等外层事务结束才发。
    - 三处必改，统筹都采纳，并进同一轮：
      - **M1**：`feed.content.receive` 缺 `attention:write`，命中 inbox 规则就被拒。现在被 catch 静默吞掉；收窄以后会让整个动作失败。补声明 `attention:write` 和 `artifact:write`，加一条正向用例。这是 C 的回归。
      - **M2**：收窄方向反过来，只把五个平台码往上抛，其余错误照 main 接住，否则会出毒条目。事务句柄的 check() 加一条：inTransaction 为假就拒绝。
      - **M3**：S-100 的拒绝用例要断言是哪一层拒的，例如加一个只撤 `artifact:write` 的变体。另补 savepoint(keep:false) 和 async body 两条用例。
    - 实现时确认三处：
      - writer.head 不要求 artifact:read；
      - 行为人取 `audit_actor_id ?? actor_id`；
      - demo-plugin-seed.ts:280 那条演示数据入库后，照样要出捕获成果。
  - **10-27 统筹核了 #1316 的冲突解法**：合并后 7cc01fb34 相对 main 74f31c19e 的改动，和合并前 e3 在 9cf5a7fb2 之上的改动完全相同（同样 9 个文件，patch-id 都是 f0da16dd9102，逐个文件也相同），冲突只是 squash 带来的重复。不用评审复核；CI 绿了就请用户在 W5-10 会话里点同意。
  - **10-27 23:xx 用户两条决定（经 btw 会话转来，用户在那里的原话）**：
    - 再开一两条线：用户对「要不要请统筹再开一两条线？」答「嗯」。活会话上限从 5 改为 7（至多五条线），槽位仍是 1。R-28 已改。
    - 攒批再测：「嗯，以及不要开发一些就测试，攒一批一起，这样能减轻槽位排队压力」。统筹定的做法写进 LINE-COMMON §3「Batch your tests」：
      - 一批 = 一个切片或一个 PR 的量，取小者；写到约半天就切一批。
      - 整批只预约一次 heavy.sh：依次构建、typecheck、跑覆盖的非浏览器文件（`--jobs 1`），后台写日志；一次超过约 30 分钟就拆成前后两次。
      - 失败先全部修完，再一次重跑失败的文件；推送前这一批必须过；健康门禁仍是每个 PR 一次。
      - 正在跑的不停，合并门槛不变。
    - 已转告 C、W5-10、W5-11、评审。
  - **10-27 新线（这一轮由别的会话的消息触发，app 不许直接开会话，所以是两张提案卡，等用户点开）**：
    - `ac-lifecycle`（卡 task_b85423f5，Sonnet 5.5 xhigh）：W6-02 余项，把 `tests/shipped-plugin-lifecycle.test.ts` 的走查（RAC-1030～1034，Todo、Jelly、Pages、灵光）扩到其余已在 Runtime 上的随宿主发布插件。
      - 不含：Feed、Inbox（C）；Goals BL-756（等 C 与 W5-10 合入）；Alchemist、创作台（绕过）；Artifacts（PG-077 维护时段）。
      - 修法落在 C 或 W5-10/W5-11 文件里的缺陷只报不修。
      - 号段 RAC-1090～1109、BL-804～809；切片 spec `slices/w6-02-lifecycle-rest.md`。
    - `ac-sweep`（卡 task_a9d9ef91，只读）：privileges 余下约 30 行、roadmap §3.8「随防腐线收」的 BL 条目、装配冻结四张表，在 #1295 之后逐条分 A 已做 / B 随 C / C 余代码活 / D 维护时段 / E 绕过，并给出下一批可开工切片。
      - 不改仓库：privileges.md、BACKLOG、反腐 spec 正被 C 改着。
      - 报告写到共享笔记目录 `privileges-sweep-2026-10-27.md`，C 合入后统筹照它改登记册。
    - 两份「别碰」名单放在共享笔记目录：`c-branch-files-bc7c06c07.txt`（C 分支 450 个文件）、`w510-w511-pr-files-2026-10-27.txt`（#1316、#1317、#1322 的 35 个文件）。
    - 下一个空号：BL-810、RAC-1110、R-70。
  - **10-27 两张卡用户都已点开**：`ac-lifecycle` = `local_974f0dd5-26c1-437a-82ca-dce25f83628e`；`ac-sweep` = `local_57451d27-eeaf-4b46-8fd6-b940e63dbb64`。
  - **10-27 ac-sweep 报告到**（副本 `notes/privileges-sweep-2026-10-27.md`，基线 main `74f31c19e`、C `bc7c06c07`）：
    - 97 项：A 已在 main 做完 17；B 在 C 上做完 11；C 还剩代码 57；D 维护时段 4；E 绕过 2；待定 6。
    - 统筹核过的两处更正：
      - BL-123 等 #1101：同事的草稿 PR 改了 storage 的 memory-ledger*、text-search-index、knowledge-cards，以及 `contracts/services/memory*`、`search.ts`。
      - BL-646 等 C：C 改了全部三个动作快照。
    - 现在能开工的只剩 PG-064 的 Schedule 一半，已派回 ac-sweep：先核门禁数字会不会真降，不降就不做。号段 RAC-1110～1114、BL-810～812。
    - ac-sweep 同时把 6 条待定核成定论。
    - 其余代码活都排在 C、W5-10（#1316/#1317）、W5-11、#1101、W5-06 挂载器或维护时段之后。眼下最能提速的仍是让 C 合入。
  - **10-27 转给 C 的合入前两处**：
    - `tests/artifact-host-writers.test.ts` 的 `HOST_WRITERS` 还列着已删的 `feed-application.ts`，又漏了 `demo-feed-library.ts:89`，按代码看会红；统筹已核。
    - 合 main 时确认 privileges.md 第 3 行 main 的 10-27 头部说明还在。
    - 同时请 C 在收口提交里照报告 §2 改随 C 完成的 privileges 行。
  - 下一个空号：BL-813、RAC-1115、R-70。
  - **10-27 ac-sweep 的 6 条待定已核成定论**（报告 §6，计数改为 A 18 / B 11 / C 61 / D 5 / E 2 / 待定 0）：
    - BL-085 → A，C 合入后删行。
    - BL-117 → D：只剩 0.3.0 发版一项，是用户的红线，不派。
    - BL-121 → C，要产品判断，统筹留着：① 决定回执（保持现状 / 只留提示 / 删除）；② `?feed-start=1` 那条链动 Feed 的 `start_processing` 动作合同，等 C；③ 紧凑密度缩进在 `momentum.ts:630` 写了两次。
    - BL-086、088、635 是 C 类小片（报告 §7 的 5a）。
  - **10-27 统筹核了 5a 与 #1101 的重叠**：#1101 还改 `apps/workbench/src/scripts/client/assistant-island.ts` 和 `apps/local-host/src/search-actions.ts`。
    - BL-086（assistant-island.ts:1532、1801，attention.ts:73、94）等 #1101 落地；assistant-island 也是枢纽文件。
    - BL-088 只做 PMR-15 的非浏览器验证和切换器「移除」文字（带英文），`search-actions.ts` 只读不改。
    - BL-635（`apps/workbench/src/index.ts` 无人用的出口，RAC-711 的 `tests/workbench-entry-exports.test.ts`）不在 #1101、C、W 的文件里，能开工；先照 `slices/w5-08-workbench-exports.md` §3 重跑扫描，Goals 一组留给 Goals 收尾。
  - **10-27 派给 ac-sweep 的顺序**：B（PG-064 Schedule 一半，单独一个 PR，RAC-1110～1114）→ BL-635 + BL-088 合成一个 PR、两个提交（RAC-1115～1119）；BL-810～812 两片共用。两项写完后攒成一批，一次 heavy.sh 预约。
  - 下一个空号：BL-813、RAC-1120、R-70。
  - **10-27 统筹裁定：PG-064 的 Schedule 一半不单独做**。
    - ac-sweep 核过：改走 `/contract` 入口后，`scripts/gates/assembly.mjs:188` 的 pluginOutsideMentions 照样把子路径算进去，`page-view.ts` 仍是 1 个文件，数字不变。
    - 要让数字降 1，只能从 `schedule-projection-ui.ts` 转出类型，把点名挪到已经点名 Schedule 的文件里。这样耦合没少，等于刷数字，不做。
    - 并进 Goals 与外壳收尾：外壳不再画 Schedule 页时一起收。privileges 的 PG-064 行保持开着。
    - ac-sweep 直接做 5a（BL-635 + BL-088，RAC-1115～1119）；RAC-1110～1114 空着不用。
  - 下一个空号：BL-813、RAC-1120、R-70。
  - **10-27 ac-lifecycle 开 [#1325](https://github.com/molis-ai/molis-work/pull/1325)（＠ db8e96cdd）**：十三个已迁插件的生命周期走查，4 个文件 18 项全过，健康门禁（对照 merge-base）与密钥检查通过。浏览器、全量、整体 build 没跑，留给集成批。置物架退出本轮：Home 一半停下后答裸 404，修法在 C 的 `home-plugin-http.ts`，登记为 BL-804。
  - **10-27 评审线评 #1325**（笔记 `review-1325-db8e96cd.md`）：改一处文档就可以合。统筹裁定：
    - 必改：规格第 2 节的数据表、演示稿、问卷、工作流程四行改成「项目监督器，个人插件，每个项目都有」（登记都是 `personal: true`）。
    - 建议 2 一起改：规格第 1 节写明 Diff、Text Stats 没有自有数据，数据留存那几步对它们是空的。
    - 建议 1 也做：Git（RAC-1100）读回比 `selected` 的 `path`，只重跑这一个文件。
    - BL-804 不加进 C（C 正在收口），C 合入后由 ac-lifecycle 接，同步 `specs/dual-instance-plugins/spec.md`。
    - 评审只看增量；确认、CI 绿后由 ac-lifecycle 在它自己的会话里合并，用户在那里点同意。
  - **10-27 ac-sweep 的 5a 写完**：`b7e5e023e`（BL-635）、`d33ca3e01`（BL-088），只用了 RAC-1115、1116。攒批测试 `batch-1d` 在跑：上一批另外 8 个覆盖文件已过，这一批重跑两个 Home 用例。
  - C 的门禁在排队等槽位；跑完后提交、推送。
  - **10-27 btw 转来用户的四点协调问题**（用户原话：「把这四点转给统筹，怎么改由它定。」）。统筹的处理：
    1. 进度表过期：§6 已按 main `74f31c19e` 和开着的 PR 重写，表头写了最后刷新时间；以后现状以 §6 为准，流水只记事件。privileges.md 约 25 行的状态写法不统一：C 正在改这份文件，现在改会撞车。C 合入后由 `ac-sweep` 开一个文档片，照它的核查报告改随 C 完成的行，顺手统一写法。
    2. 谁执行合并：统筹只裁定「可合」，自己不执行合并。执行的是裁定里点名的会话：单个 PR 由作者会话合，集成批由合批会话组批、跑全量、入队；用户在执行的那个会话里点同意。已写进 `HANDOFF-2026-10-26.md`（「合并一律经统筹」那一条下面）和 LINE-COMMON §1。
    3. `known-red-main.md`：维护人定为合批会话，开出来之前由统筹在收到全量结果时更新；文件头已写。`coord-shared` 里 10-24 的旧副本改成指向这里的说明。
    4. 短名撞名：会话之间一律用完整会话 id。LINE-COMMON §1 加了现行会话 id 表，旧的 10-19 名单留作历史。
  - **10-27 评审复审 #1325 增量 db8e96cdd..a5b713beb**（笔记 `review-1325-a5b713be.md`）：可以合，没有新意见。统筹裁定可合，由 `ac-lifecycle` 执行：先看 `affected-tests --base origin/main --json` 的 `full`（false 照常合，true 先报统筹）；等全部检查跑完（含不挡合并的 Product subset、Security invariants），有红先报；都绿了在它自己的会话里 `gh pr merge 1325 --squash --match-head-commit a5b713beb…`，用户在那里点同意。
  - **10-28 `ac-sweep` 开 [#1326](https://github.com/molis-ai/molis-work/pull/1326)**：BL-635 + BL-088，两个提交（RAC-1115、RAC-1116），已移交评审线。等评审期间先起草 C 合入后 privileges.md 的改法，写进共享笔记 `privileges-rewrite-draft-2026-10-28.md`，不改仓库。
  - **10-28 评审 #1326 @ f050cbc33**（笔记 `review-1326-f050cbc3.md`）：CI 绿了就可以合。两条建议都做：RAC-1115 的文件进产品子集（RAC-1116 只在几秒跑完时才进），PMR-15、K-1 两处文档改成已做；名单和文档不再本机预约，靠 CI 量。评审只看增量，确认后由 `ac-sweep` 照 #1325 的做法合。
  - **10-28 C 推 7e716e494**（RAC-510，从 bc7c06c07 快进，35 个文件；HOST_WRITERS 已去掉 `feed-application.ts`）：与 main 试合无冲突；37 个受影响文件除两个老红外全绿；health、boundary 门禁过。增量已转评审，重点 M1～M3、三处实现约定、6 个动作多要 `artifact:write` 的合同改动。
    - 合批会话没开（活会话已满 7 个），统筹定 C 的 PR 前验证由 C 自己做：根目录 `tsc --noEmit` 一次预约；开草稿 PR；统筹批准推 `integration/carrier-1028-c` 跑 Full；失败文件与 `known-red-main.md` 和 §13 老红比；Security invariants 作业红了挡合并。全绿后统筹裁定，由 C 在它的会话合。
  - **10-28 #1322 不再等合批会话**：统筹批准 W5-11 线把 main 普通合进分支后推 `integration/carrier-1028-w511` 跑 Full，比对、看 Security invariants，全绿后由它在自己的会话合。与 C 重叠两个文件（`apps/local-host/src/index.ts`、`packages/plugin-sdk/README.md`），谁后合谁解。
  - **10-28 #1316 已 CLEAN**：统筹裁定可合，W5-10 在自己的会话走合并队列；之后 #1317（6822578f9，CLEAN）照样合。
  - 用户接下来会在这几个会话里各点一次合并同意：W6-02（#1325）、W5-10（#1316、#1317）、ac-sweep（#1326）、W5-11 OAuth（#1322，Full 之后）、C（Full 之后）。
  - **10-28 #1326 新头 433829b6c**：RAC-1115 进产品子集；RAC-1116 不进（起 Home、开 MCP，本机 10～11 秒）；PMR-15、K-1 标已做。`affected-tests` 的 `full` 命中 assembly（`apps/workbench/src/immersive-shell.ts` 只改了一句按钮文字）。统筹裁定照 10-23 的规矩看 `full` 字段，跑全量（BL-635 还删了 44 个入口名字），但在 CI 上：评审确认后合 main，推 `integration/carrier-1028-1326`，比对 `known-red-main.md`，全绿后 `ac-sweep` 在自己的会话合。
  - **10-28 W5-10 在等用户本人同意把 #1316 加入合并队列**（W5-10 会话）。
  - **10-28 评审 C 的 `bc7c06c07..7e716e494`**（笔记 `review-c-7e716e49-rac510.md`）：可以合，合并前看 Security invariants 作业。M1～M3、三处实现约定、写入者名单都成立；合同只是谁能调变了，schema 哈希不变，不升 version。S-97～S-100 在 main（末号 S-96）和在途 PR 里都空着。
    - 统筹裁定四条建议都在开 PR 前做：CONTRACT-CHANGES §8 补 join 与 `PluginArtifactWriter`、6 个动作的调用方多要 `artifact:write`；`CALL_REFUSALS` 补 `actions.plugin_permission`、`actions.provider_changed` 并改过时注释；`audit_actor_id` 不同时的用例；演示种子捕获的断言。攒成一批测，评审只评增量，然后开草稿 PR、推 carrier 跑 Full。
    - C 的根目录 `tsc --noEmit` 已过（heavy.sh，日志 `.impeccable/qa/c-root-tsc.log`），PR 正文已起草。
  - **10-28 #1322**：main（74f31c19e）已普通合进分支，无冲突，头 a9480e3de；同一个头推到 `integration/carrier-1028-w511`，PR 的 CI 和 Full 都在排队。
  - **10-28 评审确认 #1326 增量 `f050cbc33..433829b6c`**（笔记 `review-1326-433829b6.md`）：两条建议都落了，没有别的改动。已叫 `ac-sweep` 合 main、推 `integration/carrier-1028-1326` 跑 Full；PR 的产品子集第一次跑 RAC-1115，两个分片都要看。
  - **10-28 C 的草稿 PR 是 [#1327](https://github.com/molis-ai/molis-work/pull/1327)**（头 7e716e494，base main）。四条建议已改、未提交，正在一次 heavy.sh 里跑：构建、根 tsc、门禁、48 个文件；过了再推，请评审只评增量，然后推 carrier 跑 Full。
  - **10-28 #1326 的 Full** 是 run 40538409916（carrier `integration/carrier-1028-1326`，头 433829b6c；main 仍是 74f31c19e，不用合）。

- 10-28 统筹：三处 Full 结果与裁定。
  - #1322（carrier-1028-w511，run 40538077218）：16 片里只红第 7 片，`busy-feedback.e2e` 的 VUX-31（切换 Goal 后旧文档被藏），重试也红。#1322 只改 OAuth 合同与 SDK，不碰工作台；同一用例 10-27 在 `integration/memory-p0-application-20261025` 上也红过，#1326 的 carrier 第 7 片却过了。记进 known-red-main.md 间歇红，归 `ac-lifecycle` 查（BL-806）。**#1322 可合**，在 W5-11 OAuth 会话合，用户在那里点同意。
  - #1325：CLEAN（`a5b713beb`），可合，在 `ac-lifecycle` 会话合。
  - #1326（carrier-1028-1326，run 40538409916）：15 片绿，第 16 片还在跑。跑完全绿就在 `ac-sweep` 会话合。
  - C（carrier-1028-c，run 40538450543，旧头 `7e716e494`）：14 片红。新头 `75f21b847` 修了 PR CI 上的 11 处红，多半能对上。不取消、不重推这个 carrier（取消要用户本人同意）；C 把 14 片的失败对到 `75f21b847` 的修复上，再把新头推到新 carrier `integration/carrier-1028-c2` 跑一次 Full，跟 known-red-main.md 比，看 Security invariants，绿了转正式 PR，在 C 会话合。合前再确认 S-97～S-100 没被占。
  - 评审对 C `75f21b847` 的三条后续登记：崩掉、没启用的安装被 `projectPluginEnablementRefresh` 去停，`runtime.stop` 抛 `plugin.state_invalid`，此后每个页面请求都失败 → R-70，归 C 线，C 合入后先做；内置插件与目录外插件双实例的页面归属不同 → 归 10-18 防腐各行；`listFeedMaterialContentRefs` 没人调 → C 合入后顺手删。

- 10-28 统筹：合入与 #1329。
  - main 开了合并队列：`gh pr merge` 只把 PR 放进队列，合并方式由队列定。#1322 → `31c3ff04d`，#1326 → `47190691d`。
  - #1325 的合并被自动模式拦下，等用户在 `ac-lifecycle` 会话放行。
  - #1317：affected `full` 为空、CLEAN，裁定可合，在 W5-10 会话合。
  - #1329（BL-806，只改 `tests/busy-feedback.e2e.test.ts`，评审可合）：不单开集成 Full。理由：`full` 为空；C 的 integration Full 正占 10 个 runner，再开一个就占满 20 个、挡住所有 PR 的 Verify；用户要攒批测。PR 检查绿了就在 `ac-lifecycle` 会话合（排在 #1325 之后），合入后看 main 的夜间 Full（17:00 UTC）。评审三条提醒：①② 记 R-71；③ Files spinner 那条同类睡眠取样记 BL-807，归 `ac-lifecycle`。
  - C：carrier-1028-c 在 `75f21b847` 上排队跑 Full（run 40556272594，用户在 C 会话同意）。C 还在修 32 个新红；修好后等这次 run 跑完，再推同一个 carrier，不并行开 c2，也不顶掉在跑的那次。
- 10-28 统筹：#1326 的 carrier 已删，工作树留给 `ac-sweep`。C 合入之前，`ac-sweep` 先做 W5-13 余片：第一步只盘点，统筹回复后再开发。编号用它的 RAC-1110～1114、BL-810～812。
