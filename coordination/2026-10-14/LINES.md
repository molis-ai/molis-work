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

| 项 | 状态 | 依据 / 还剩 |
| --- | --- | --- |
| W5-01 余项 | 进行中 | Shelf S3 #1076 已合、S4 #1083 在审；Feed/Inbox、Goals、Coding C9、Artifacts 见 §1、§2 |
| W5-02 | 未开 | `ac-registry`（待开线） |
| W5-03 / W5-04 | 进行中 | Jelly #1145、Issues #1132（含 Todo 片内容，#1129 已关）已合；Images #1137 已合；`ac-clients-1`：Cognia 开 PR，R11（定 B）在做，之后灵光 |
| W5-05 | 基本完成 | 页面预算降值留到 W5-06 链与 Shelf 合完（统筹） |
| W5-06 | 进行中 | #1085、#1087 已合；#1098、#1107、#1112 在途；BL-387/388/430、Goals S11 归 `ac-shell` |
| W5-07 | 见矩阵一 | 收尾时统筹核 |
| W5-08 | 部分 | Feed/Functions 出口 #1120 在途；`index.ts` 的 `export *` 归统筹（各族迁完） |
| W5-09 | **已完成** | `agent-host.ts` 拆分 #591；`platform/plugin.ts` 拆分 #1118（`f8d1e5ba9`，10-23） |
| W5-10 | 进行中（10-25 改口径：本身合理的标明、不硬拆） | 设计系统归 `ac-giants`；官方集成与横向服务归 Codex C3；agent-host 归 `ac-kernel`（10-25 13:50 派：改代码只 `prologue-checkpoints`、`prologue-taskboard`、`agent-host-composition`；与 #1064 重叠的五个只在 HUGE-CLASS-MIGRATION 重判、代码等 #1064；之后 BL-541、BL-470，同一分支、整组一个 PR，RAC-658～669） |
| W5-11 | 部分 | OAuth 移进官方集成插件（统筹 + Codex） |
| W5-12 | 见矩阵一 | 收尾时统筹核 |
| W5-13 | 进行中（RAC113/114切片已落地，非整体完成） | Codex C1；RAC113 #1183/f586、RAC114 #1213随#1215/1712（12:52:01Z）均真实合入，快回归子集登记实际CI已核；剩余宿主日志/错误片按原C1 owner及Claude后续派单继续 |
| W5-14 | 未开 | 改名（统筹 10-23 定按 GLOSSARY §4/§5），各族迁完后 |
| W5-15 | 部分 | 成熟度词表；发版与版本号归用户 |
| W5-16 | 进行中（仅B1已真实落地） | Codex C2 实现2；B1 #1190/bc016随#1202/645已合。B2a #1209/e20已双独立审验通过、source冻结释放，在Claude full29/52受测；该批唯一S15 Images启动红归原ac-sandbox，B2a尚无最终批真merge。B2b CLI必要状态/早期同Home lease/全库及非SQLite快照恢复仍未完成，按W5当前FIX2自然固定交槽后排实际source，合同见CODEX-TASKS/SESSION-ROLES；真实Home/R41统一窗口另核 |
| W5-17 | 已派 | `ac-sandbox-sched`（#1113 已合；本地做，线上开着的 PR 合入一个再开）。10-24 用户定：和 Goals S9 同一个维护时段，先在真实 Home 拷贝上跑 `list` 交用户，维护做完前不合 |
| W6-01～06 | W6-03 预演完成 | W6-03：DeepSeek 走查报告 `deepseek/w6-03-doc-walk`（e4cf619d2，70 条）；其中「现在就能改的」16 条已改在 `claude/w6-03-docs-now`（8390d72c8，D10 的 CHECKLIST 一半随 #1295，0.3.0 发布记录不改），随下一批落地；其余 54 条等 W6 统一改。W6-01/02/04/05/06 未开 |

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
