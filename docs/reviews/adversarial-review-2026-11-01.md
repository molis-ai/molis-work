# 全仓对抗式审查报告（2026-11-01）

状态：审查完成。用户 2026-11-01 定**只出报告、不由本轮执行整治**；第 12 节分片与第 13 节裁定留给统筹排期。报告不改产品代码、门禁、测试、规格和真实 Home。初稿之后对抗式复核出的误判，已在原处更正并标「（更正）」；停下之前已经做了的，见第 15 节。同日又用另一套方法把全部数字、重复逻辑与 #1727 逐项复查了一遍（语法树计数、全文检索、变异检验），改动处标「（复查更正）」，新发现与逐项结果见第 16 节。

- **对象**：origin/main `e4e98ed33`（2026-11-01 15:13Z；该提交的 CI 与 Full 均为绿）。第 1 节的趋势数字取同一分支在 10-13、10-20、10-27 的提交。
- **依据**：[防腐整理要求](../prompts/repository-anti-corruption.md)（四个目标、§4.1–4.19、§7 完成标准、附录 A），[系统整理要求](../prompts/repository-systematic-review.md)，`AGENTS.md` 与 `docs/system/` 的现行规则，[上一轮清理检查](cleanup-audit-2026-10-20.md)。
- **方法**：工具先找候选，每条再人工核实；方法与局限见第 14 节。
- **结论分档**：「已证实」是读过代码或跑过命令的；「推断」是证据指向、但没跑通到底的；「存疑」是要主人或用户确认的。
- **严重度**：P0 是违反硬约束、安全或数据；P1 是架构漂移、调用链；P2 是清理。

## 0. 结论

1. **门禁看住的数字普遍大降**（对照 10-20 清理检查）：

   | 项 | 10-20 | 现在 |
   | --- | --- | --- |
   | typed 宿主能力 | 187 | 0 |
   | 构建期装配的内置插件 | 10 | 2（用户批准的例外） |
   | 巨大单元 | 123 | 43（41 个已登记） |
   | 测试引用包内部 | 483 | 412 |
   | `*_SCRIPT` 程序 | 129 | 98 |
   | 浏览器脚本里的空 catch | 130 | 74 |
   | 裸 fetch | 63 | 6 |
   | 由错误选出的 HTTP 状态 | 87 | 42 |
   | 翻译冲突键 | 192 | 136 |

2. **门禁看不到的地方在反向走（P1，已证实）**：
   - `apps/local-host/src` 从 10-13 的 45,620 行涨到 68,444 行（+50%）；原始需求 §4.4 与附录 R-03 要的是宿主瘦身。
   - 宿主入口的命名导出从 304 涨到 558。包外的生产代码只用其中 45 个，其余的消费者是 919 个测试文件（复查更正：按语法树数）。
   - 同一概念的小工具在变多：`isRecord` 从 14 份到 23 份；插件 SDK 自己里面同义的判断有 11 份（`isRecord` 6、`isObject` 4、`isRecordValue` 1）（复查更正）。
   - 死翻译键从 2,472 涨到 2,518。
3. **门禁本身成了最热的冲突点（P1，已证实）**：10-18 以来 main 上有 755 个提交，其中
   - `tooling/gates/page-assets.json` 被改了 176 次；
   - `scripts/gates/page-assets.mjs` 被改了 122 次，因为一次性放行写在脚本里；
   - `tooling/gates/baseline.json` 被改了 105 次。
4. **待办散在四处，彼此不链接（P1，已证实）**：
   - `specs/BACKLOG.md` 254 行，其中 163 行没有主人；
   - 协调分支上的风险登记，约 54 行没有标关闭，没有一行指向仍开着的 BACKLOG 行；
   - 协调分支上的零碎单（MISC）约 160 行；
   - 100 多个 PR 评论里写着「非阻塞」「交 Codex 修复队列」「后续单」。
5. **例外都有理由，但普遍缺出处、主人和退出条件（P2，已证实）**：
   - 页面资源门禁里 22 条新资源放行已经用完，还留在脚本里；另 2 条增长放行按门禁自己的规则「下一次改门禁时删」，不算遗漏（更正）。两类都已在整治 PR 里清掉；
   - Shelf 插件 → Shelf Module 的层间例外没有任何 BACKLOG 行跟踪；
   - 用户 10-30 定的「MemoryService 登记为内聚单元」已排给 T-061，等 #1101/#1059 合入后登记（`docs/system/HUGE-CLASS-MIGRATION.md` 表 C 行）。health 里那 2 个未登记的巨大单元就是它，不算遗漏（更正）。
6. **没有发现 P0**：硬约束、安全不变量与数据边界抽查都守住了，main 的 CI 与 Full 都是绿的。最重的是第 2–4 条三项 P1。
7. **更正 goal prompt 里的四个数字**（逐条核对后）：
   - `TODO` 20 处里只有 1 处是真的待办，其余是 Todo 插件的测试名；
   - `biome-ignore` 实际为 0，那 4 处是门禁脚本自己的文字；
   - `*_SCRIPT` 按门禁口径是 69 个文件里的 98 个程序；190 / 125 是名字的出现数；
   - 64 处测试 skip 绝大多数是平台或环境条件（44 处只在 macOS 跑）。

## 1. 基线（重测于 `e4e98ed33`）

| 项 | 现值 | 怎么量 |
| --- | --- | --- |
| 宿主入口命名导出 / `export *` | 558 / 8（10-13 为 304 / 11，10-20 为 376 / 11，10-27 为 516 / 9） | 解析 `apps/local-host/src/index.ts` 的 `export {…}` |
| 宿主入口的包外消费者 | 945 个文件 import 它；919 个是测试；26 个非测试文件共用 45 个名字，其中桌面与 `apps/server` 的 11 个文件用 23 个（复查更正） | 按语法树找 `@molis-ai/molis-work-app-local-host` 的 import 与 export…from |
| `apps/local-host/src` | 693 个 `.ts`，68,444 行（10-13 为 45,620，10-20 为 54,842，10-27 为 66,613） | `git ls-files` 行数 |
| 浏览器文本程序 | `*_SCRIPT` 98 个程序 / 69 个文件；空 catch 74；裸 fetch 6 | `node scripts/check-health-gates.mjs --report` |
| `AGENTS.md` | 29,628 字节；「构建与测试」一节约占 60% | `wc -c`、按节统计 |
| 翻译 | 80 本词典、9,560 条；死键 2,518（`apps/workbench/src/i18n/en.ts` 一本占 1,762）；577 个键定义不止一处；冲突 136 | `node scripts/gates/translations.mjs [--dead]` |
| 防腐 spec | `specs/repository-anti-corruption/spec.md` 1,467,074 字节；`privileges.md` 216,019 字节 | `wc -c` |
| `specs/` + `docs/` | 约 92 MB：PNG 49.9 MB（217 个）、Markdown 20.6 MB（994 个）、JPG 8 MB、MP4 3 MB | `git ls-files` 按扩展名 |
| 验收编号 | 61 份在进行的 spec，992 条验收里 294 条有测试引用；570 个编号没有任何证明 | `node scripts/check-spec-coverage.mjs` |
| BACKLOG | 254 行；163 行没有主人；17 行列数不对 | 解析 `specs/BACKLOG.md` |
| 「2026-10-18 改」/「暂定·暂记·先不挡」 | 77 处（30 个文件）/ 81 处（31 个文件，不含 `archive/`）（复查更正：初次统计漏了中文路径的文件） | `git -c core.quotepath=off grep -o` |
| 压制注释 | `@ts-expect-error` 20（全在测试）、`eslint-disable` 3、`biome-ignore` 0 | `git grep` |
| 测试 skip / todo | 64 处 / 39 个文件（按文本）；按调用形状数，直接写在 `test()` 上的有 50 处、31 个文件，另有 4 个共用的选项对象。全部是条件跳过，没有无条件的 skip（复查） | `git grep`；语法树 |
| 生产代码里的裸 `new Error(` | 1,708 处 / 494 个文件 | `git grep` |
| 代码注释里的过程编号 | 573 个生产文件；PG 406、S 326、BL 256、W5 139、日期 109、T 61、RAC 40 | `git grep` |
| 工作树 / 本地分支 / 远端分支 | 158 / 1,123 / 1,116；主检出落后 origin/main 175 个提交 | `git worktree list`、`git branch` |
| 其余 health 数字 | 测试内部引用 412（202 个文件）；`as unknown as` 146；显式 `any` 464；`console` 19；Error 子类 25；错误主人表外的源文件 627；兼容标记 8（全是误报，见 J 节） | `--report` |

## 2. A：对照原始需求（§7 完成标准逐条）

| 标准 | 结论 | 证据 |
| --- | --- | --- |
| 内置插件只剩 Plugin Runtime 一种装配 | 部分（用户批准的例外） | 只剩 Alchemist、插件创作台两个构建期例外：`tests/builtin-plugin-assembly-gate.test.ts` 的 `APPROVED_BUILD_TIME_EXCEPTIONS`，用户 10-21、10-23 定，BL-377 重做 |
| 新增内置插件只改自己的包 | 符合 | `tests/plugin-sample.e2e.test.ts`；`apps/workbench/src/builtin-plugins.ts` 由脚本生成 |
| 扩展点清单 | 符合 | `docs/system/EXTENSION-POINTS.md` |
| 热点下降、聚合文件各自登记 | **违反** | 聚合点从源码换成了门禁数据文件（第 8 节 G1）；`privileges.md` 106 次、`SECURITY-INVARIANTS.md` 110 次、`BACKLOG.md` 158 次 |
| 归属表、合同变更流程、CI 产品子集 | 符合 | `.github/CODEOWNERS`、`docs/system/CONTRACT-CHANGES.md`、`tests/ci-product-subset.txt` |
| 协作规则入库 | 符合 | `docs/system/PARALLEL-DEVELOPMENT.md` |
| 静态检查、API 快照、资源预算进 CI | 符合 | `.github/workflows/ci.yml` 的 health、page-assets、api、native-checks 各作业；`Verify` 依赖它们 |
| 术语表、两套能力机制收敛 | 符合 | `docs/system/GLOSSARY.md`；typed 宿主能力为 0 |
| 主链路与代码一致、每个能力一条路径 | **部分** | [CALL-CHAINS §10](../system/CALL-CHAINS.md) 自己写着四组「还没有逐条盘点的只走 HTTP 的写入」，5 个文件里约 38 处写路由（第 3 节 B9、第 11 节） |
| 巨大单元门禁生效、清单缩小 | 符合，有一处遗漏 | 123 → 43；`horizontal/memory/src/service.ts` 与 `MemoryService` 没有登记，与用户 10-30 的决定不符（I-6） |
| 测试引用内部明显下降 | 符合，但被绕开 | 942 → 412；同期宿主入口 304 → 558，测试改从宽入口拿内部（G3） |
| 兼容逻辑删除、保留项写明 | 符合 | 兼容标记 8 处全是误报（J 节）；读取只认现行版本（`schema_version !== 1` 一类严格判断） |
| 每个库一份建库代码，版本不符拒绝 | 符合，有重复 | `packages/storage/src/sqlite-baseline.ts`；但有 4 份手写的只读预检、7 个构造器重复执行建表语句（B3、B4；复查更正：原写成 B7、B8） |
| 真实 Home 按决定重建 | **未完成** | 用户 10-30 定清空重建，等用户说「开始」；前提见 `docs/releases/CHECKLIST.md` |
| 防回流门禁 | 符合 | 兼容标记按文件只许减少 |
| 体检、附录 A、交接清单每项有结论 | 部分 | 防腐 spec §3.1 有逐项闭环；R-03（宿主）与 N-11（入口）倒退，R-13（主检出落后）与 N-07（工作树堆积）复发 |
| 安全不变量有测试 | 符合，有缺口 | `Verify` 已依赖 `security-invariants` 作业（风险登记的 R-24 仍写「不挡合并」，已过时）；零碎单记着 S-03 行漏了 RAC-1805 的用例 |
| build / boundary / CI 通过 | 符合 | `e4e98ed33` 的 CI 与 Full 均绿 |

附录 A 里倒退或复发的四项：

- **R-03 宿主承载**：09-30 是 3.7 万行，现在是 6.8 万行。10-13 以来顶层文件净增 17,643 行，`assistant/` 净增 2,963 行。新增的大文件多是平台服务：
  - `connector-oauth-declarations.ts` 457 行
  - `plugin-terminal-service.ts` 290 行
  - `plugin-install-service.ts` 255 行
- **N-11 宿主入口过宽**：见 B1。
- **R-13 主检出落后**：本机主检出落后 175 个提交（当时 4207 没有在监听）。
- **N-07 工作树堆积**：158 个工作树（`/private/tmp` 下 57 个、主检出 `.claude/` 下 46 个），本地 1,123 个分支、远端 1,116 个。

## 3. B：无用代码、冗余代码、可以合并的通用实现

### B1 宿主入口过宽（P1，已证实）

- `apps/local-host/src/index.ts`：558 个命名导出加 8 个 `export *`。
- 945 个文件 import 这个包，其中 919 个是测试。26 个非测试文件（桌面启动器、`apps/server`、脚本）一共只用 45 个名字（复查更正：初次按文本数，是 954 / 927 / 27 / 39）。
- 原始需求要「分清 Host 装配接口与普通消费者接口」，10-20 清理检查的 P2 第一批也是「公开面收窄」，都没做；而且宽度一周涨了 42 个。
- 建议拆成两个出口：
  - `.` 只留装配接口，就是那 45 个名字；
  - 测试要的东西走 `@molis-ai/molis-work-test-kit` 或一个只给测试的子路径；
  - 再给入口宽度加一条只许减少的门禁。
- 这一片会碰到几百个测试文件，按目录分批做。

### B2 同一概念的几份小工具（P2，已证实）

| 工具 | 份数 | 位置与说明 | 建议 |
| --- | --- | --- | --- |
| `isRecord` | 23 份、3 种写法，语义完全相同（复查更正：原写 6 种） | 插件 SDK 自己有同义的 11 份（`isRecord` 6、`isObject` 4、`isRecordValue` 1）；contracts、kernel、宿主、Module、Coding、Git 也各有；另有 `isPlainObject` 4 份（Gmail 3、storage 1） | SDK 内一份、导出给平台与插件；合并不改行为 |
| schema 构造 `object` / `array` / `nullable` | 51 / 12 / 11 个文件，19 / 4 / 4 种写法 | 每个插件的 `actions.ts` 自己写，SDK 没有 | SDK 给一组 schema 构造器（改公开 API，跑 `pnpm api:update`） |
| HTML 转义 | SDK 已导出 `escapeHtml`（`packages/plugin-sdk/src/ui/html.ts`），另有 16 份（复查更正：原写 12 份） | 能改 import 的 8 份：cognia、issues、jelly、workflows、form 的 `esc`，Pages 两份 `escapeHtml`，工作台终端一份；PPT 的 `esc` 转的是 XML，另算；7 份在浏览器文本程序里（首页动作、项目首页、侧栏三个面板、Alchemist、创作台），import 不了 SDK，要随打包线换。只有 SDK 与 3 份转单引号 | 能 import 的改用 SDK 那份（转得更多，不会少转） |
| `messageOf` | 14 份、3 种写法 | 各插件 `src/browser/dom.ts`。13 份是同一个意思（`instanceof Error` 取 message，否则 `String()`）；工作台 `characters/common.ts:67` 那份对非 Error 返回空串，意思不同（复查） | SDK 浏览器工具；合并时那一份要单独看 |
| `requestHash` | 5 份，逐字相同 | 全在 Goals 一个包里：`goal-tree-check.ts`、`goal-tree-decision.ts`、`goal-tree-submission.ts`、`module/command-support.ts`、`proposal-baselines.ts` | 包内收成一份。10-20 的建议只做了 `canonicalize` 那一半（已改用 SDK 的 `canonicalJsonValue`） |
| 规范化 JSON | 按键排序的递归写法共 12 份（复查更正：原只列 Runtime 3 份）：Runtime 3 份、agent-host `action-digest.ts`、contracts `artifact-pins.ts`、SDK 2 份、宿主 `home-actions.ts`、`installer/runtime-config-text.ts`、`plugin-builder/build-project.ts`、工作台 `home-offers.ts`、Feed `signals.ts`；5 份用 `localeCompare`，7 份按码位 | `AGENTS.md` 要求平台各层从 SDK 取同一份 | 复查已核实：每个摘要与签名都由同一个函数产出、同一个函数校验，现在没有跨写法比较；但 SDK 那份依赖进程的语言环境（第 16 节 N4） |
| `parseJson` | 7 份、6 种写法 | `packages/storage/src/sqlite.ts`、`modules/artifacts`、Goals 两处、Feed、宿主两处 | 10-20 时是 11 份；先查哪些静默兜底 |

### B3 SQLite 只读预检写了四份（P2，已证实）

四处各自读 `PRAGMA user_version`、再比结构：

- `apps/local-host/src/home-plugin-store.ts:45`
- `apps/local-host/src/installed-plugin-libraries.ts:50`
- `apps/local-host/src/project-database.ts:25`
- `server/src/database.ts:30`

四份的检查不一样：`project-database.ts` 只比版本，其余三份还比结构。`packages/storage/src/sqlite-baseline.ts` 有 `applySqliteBaseline`、`describeSqliteSchema`、`describeSqliteBaseline`，但没有「只读断言」这一个函数。建议在 storage 加 `assertSqliteBaseline(readonlyDb, baseline)`，四处改调它。

**整治时核实（更正）**：四份不同大多是有意的，不能收成一个断言。
- 项目库必须用持有它的驱动（better-sqlite3）去读：同一进程里另一份 SQLite 关掉这个文件，会丢掉宿主的文件锁（安全用例里钉着）。所以 storage 自己那份用 `node:sqlite` 的预检不能直接给项目库用。
- 服务端的库要求结构完全一致，项目库允许插件自己的表；两处的拒绝码也不同，项目库的恢复路径另有拒绝码。
- 真正重复的是「读版本、看是不是空库、不符就拒」这一段：storage 里两份，加上 `project-database.ts`、`server/src/database.ts` 各一份。已收成 `checkSqliteBaselineVersion`（共享核心集成分支）。另两处在在途 PR 里，等它们合入。

### B4 构造器重复执行建表语句（P2，已证实；风险是推断）

7 个构造器在每次构造时 `db.exec(<X>_SCHEMA_SQL)`：

- `project-browsing-settings.ts:14`
- `modules/attention-resumption/src/index.ts:147`
- `packages/plugin-runtime/src/` 下五个：`event-repository.ts:199`、`private-storage.ts:30`、`release-artifacts.ts:44`、`repository.ts:32`、`wiring-repository.ts:168`

这些语句也都并进了基线（`apps/local-host/src/project-database-schema.ts`、`home-plugin-store.ts`），所以对正常打开的库是空操作。风险在于：一个没经基线打开的库，会被构造器悄悄补表，绕过「版本不符就拒绝」。建议删掉构造器里的执行，只留基线一处。

### B5 死代码（P2，已证实）

- **没有任何引用的导出函数（6 个）**：
  - `apps/workbench/src/ui-composition.ts:78` `renderScheduleContribution`（已删，第 15 节）
  - `horizontal/memory/src/facts.ts:46` `pauseReason`（已删，连同只给它用的两个常量）
  - `horizontal/memory/src/shapes.ts:19` `joinedFingerprint`（已删）
  - `packages/contracts/src/modules/workspace-artifacts.ts:216` `parseWorkspaceRef`、`:235` `workspaceScopeKey`
  - `packages/plugin-sdk/src/ui/calendar.ts:96` `calendarTitle`（SDK 公开面，删前确认外部作者没在用）
  - 后三个在合同与 SDK 的公开面，删它们是改合同，归 R2 的集成分支
- **只在本文件用、却导出的函数**：99 个，可以去掉 `export`。
- **只被测试用的导出**：110 个。
- **死路由**：`POST /api/assistant/memory-prefs`（`apps/local-host/src/assistant/assistant-http.ts:331`）在 `apps/workbench/src` 里没有调用方；CALL-CHAINS §10.1 自己也这样写了。
- **只建表、从不读写的两张表**：`goal_desktop_panels` 与 `goal_desktop_panel_aliases`（`apps/desktop/src/adapters/sqlite-panels.ts`），等 T-148 的裁定。
- **零碎单里登记的**：
  - ~~没有调用方的 `assertProjectPluginDatabase`~~（复查更正：基线之前已由 #1582 / T-286 删掉）；
  - ~~没有元素匹配的 `.account-global-menu` 三条样式~~（复查更正：基线之前已由 #1581 / T-283 删掉）。
- **已经不起作用的配置**：
  - Biome 仓库里的 3 条 `eslint-disable-next-line` 注释（`packages/contracts/src/platform/search-sources.ts:81`、`plugins/native/ppt/src/pptx.ts:24`、一个测试）。Biome 不读它们，但它们说明正则里的控制字符是有意的；留到下次改这几个文件时再处理，其中一条在 contracts（共享核心）（更正）。
  - ~~密钥白名单里一条全仓已经找不到的值~~（更正）：这条值在 Shelf S3 的提交 431c2847 里。那个提交不在 main 上，`migrate/bl383-runtime-context-rename` 等三个远端分支的历史里还有；这些分支合入时 `pnpm secrets:check` 要靠它，所以留着。

### B6 插件骨架的克隆（P2，已证实）

逐字相同：

- `renderCompanionListStage`：`plugins/native/diff/src/companion-stage.ts:17`、`plugins/native/text-stats/src/companion-stage.ts:17`
- `renderCompanionBrowserStage`：Files、Git 各一份
- `whenOf` / `formatTime`：dataset、form、pages、ppt 四份
- Schedule 两份 `define`
- `tokenMatches`：`apps/local-host/src/browser/browser-socket.ts:20`、`computer/computer-socket.ts:15`
- `branch`：`workspace-git-index.ts:36`、`workspace-git-integration.ts:47`

只改了名字（结构相同）：

- dataset 与 ppt 的 `pinFixed`、`installEvents`
- Pages 的 `atColumnEdge` / `atCellEdge`、`moveColumnEdge` / `moveTableEdge`

Alchemist 的 `mapIdeaCard` / `mapCard` 在冻结例外里，不动。

### B7 合同描述符的成熟度没人读（P2，推断；要主人定）

`packages/contracts/src` 有 36 个描述符带 `maturity`（`ContractMaturity`：`contract-only | partial | implemented`），31 个写的是 `partial`，连 kernel 也是。生产代码没有一处读它；这套词只由 `tests/package-maturity-vocabulary.test.ts` 钉住（W5-15-10 有意保留）。它和 `docs/SSOT-MATRIX.md` 的四个成熟度词是两套，值也没人维护。建议删掉这个字段，或者改成从登记表推出。

### B8 翻译死键（P2，已证实）

死键 2,518，按 10-20 的计划先上稳定键，再删。另有 577 个键定义不止一处。

### B9 只走 HTTP、没盘点的写入（P1，已证实）

CALL-CHAINS §10 末尾自己列着四组「没有检查过是否应该是动作」的写入，下面是各文件里出现写方法的行数（复查：按 `method === "POST"` 一类判断数，是 13 / 6 / 7 / 6 / 3，共 35）：

| 文件 | 写入计数 |
| --- | --- |
| `apps/local-host/src/assistant/assistant-http.ts` | 15 |
| `apps/local-host/src/plugin-builder/agent-surface.ts` | 6 |
| `apps/local-host/src/web-context-onboarding.ts` | 7 |
| `apps/local-host/src/agent-review-http.ts` | 6 |
| `apps/local-host/src/home-dock-http.ts` | 4 |

这和「能力注册一次，由动作目录供页面、工作流、Agent、MCP 使用」是正面冲突，需要逐组定：登记进 10.1，还是改成动作。

## 4. C：重复参数、冗余参数、重复逻辑

### C1 从来不传的可选参数（P2）

工具找出 76 个候选。已经剔除的误报：插件工厂的 `ports`（如 `createCodingPlugin`），它由 Plugin Runtime 按 `factory_export` 动态调用。下面这些人工核过：

| 函数与参数 | 调用点 | 从来没传 |
| --- | --- | --- |
| `bindSearchEntriesHandler(…, availability?)` | 26 | `availability` |
| `bindFileEntriesHandler(…, availability?)` | 11 | `availability` |
| `defineFileEntriesAction` / `defineFileContentAction` | 13 / 9 | `audiences` |
| `homeIntegrationRegistry(home, providerFactory?, now?)` | 48 | `now` |
| `artifactTypeDeclarations(sources = …)` | 13 | `sources` |
| `declaredArtifactTypes(sources = …)` | 3 | `sources` |
| `pluginSurfaceClients(packs, catalog = …)` | 16 | `catalog` |
| `locateTestChrome(env?, exists?)` | 19 | `env`、`exists` |

这些参数是「为测试留的注入口」，但没有测试用。完整候选在附录。

**核实结论（更正）**：整治时逐个核过，这些都不删，C1 降为「存疑」，不作为整治项。

- **`artifactTypeDeclarations`、`declaredArtifactTypes` 的 `sources`**：同族六个函数共用这种写法（默认取全部生产者），测试给其中三个传了参数；只删这两个，同族就不一致。A3 之后这组名字要整组换掉（`w5-08` 片），不在这里动。
- **`pluginSurfaceClients` 的 `catalog`，以及 `plugin-workbench.ts` 其余函数的 `packs`**：也是同一种写法，`pluginWorkbenchStyles(undefined, "beneath-shell")` 就是这样跳过前一个参数、传后一个的。
- **`locateTestChrome`、`locateBrowser` 的 `env`、`platform`、`exists`**：跨平台分支的注入口；缺的是一条测试，参数不该删。
- **`bindSearchEntriesHandler`、`bindFileEntriesHandler`、`define*Action` 的参数**：合同与 SDK 的公开面，外部插件作者会用。
- **`homeIntegrationRegistry` 的 `now`**：所在文件在在途的 #1724、#1725 里，等它们合入后再看。

### C2 总是传同一个值的参数（P2，已证实）

- `context-onboarding-service.ts:442` `shipped(version)`：5 处都是 `1`
- `installer/runtime-config-text.ts:213` `parseJsoncObject(label)`：3 处都是同一个中文标签
- `apps/workbench/src/plugin-workbench.ts:118` `pluginPageClients(id)`：3 处都是 `"goals"`。这就是 PG-094 ② 的「工作台里的 Goals 特例」
- `plugins/native/goals/src/contract/goal-entry-actions.ts:59` `versioned(version)`：4 处都是 `2`

### C3 两个 SQLite 驱动（P2，要定）

- `node:sqlite`：19 个生产文件在用。
- `better-sqlite3`：用在 `packages/storage/src/sqlite.ts`、`snapshot-sqlite.ts`、`modules/private-work-context` 三个文件和 Alchemist 里。

`sqlite-baseline.ts` 的接口特意写成两种都接。要么收成一个，要么在 `docs/system/HOME-DATA.md` 写明为什么必须两个。

**整治时核实（更正，范围远大于上面写的）**：
- `packages/storage/src/sqlite.ts` 就是每个项目库的连接（`LocalSqliteStorage`），原始连接经 `store.db` 交给宿主、插件平台、Feed 的适配器（`fromBetterSqlite`）和 private-work-context。
- 64 个测试文件直接 `import Database from "better-sqlite3"`。
- 桌面运行时打包、npm 分发用例、安全用例（「同一进程里另一份 SQLite 会丢掉宿主的文件锁」）都和它绑在一起。
- Node 24 上 `node:sqlite` 的接口够用（`backup`、`isTransaction`；pragma 用 `exec`），但它仍会打出 ExperimentalWarning。
- 换驱动等于换掉项目库这条主数据路径，要碰一百多个文件，而且和在途的大批（#1724 等）重叠。所以用户的 ② 是在错的范围上定的，已重新问用户（第 13 节）。

### C4 ID 与幂等键的生成方式不一（P2，已证实）

`randomUUID()` 用了 385 处，另有 20 处用 `Date.now().toString(36)` 或 `Math.random().toString(36)`，其中两处是幂等键：

- `horizontal/agent-host/src/adapters/prologue-messages.ts:179`
- `apps/workbench/src/scripts/client/events-primary.ts:449`、`:646` 的回退分支

## 5. D：多余逻辑、可以简化的逻辑

- **D1**：构造器重复建表（B4）、只读预检重复（B3）。
- **D2 永远禁用的「未登录 / 登录」按钮（P2，要用户定）**：`apps/workbench/src/settings-directory.ts:30`，每个人都看得到，旁边是 `TODO: Enable this entry when sign-in is implemented`。它和第一轨删掉的「通知功能即将开放」是同一类占位。这是全仓唯一真正的 TODO；改它会改用户看得见的界面。
- **D3 错误模型只管码，不管裸 Error（P2，推断）**：生产代码里有 1,708 处 `new Error(`，在 494 个文件里。门禁只数 Error 子类（25）与码字面量，这些裸 Error 在任何口径之外。建议分开两类：内部不变量可以留，会到达调用方的改成 `defineErrorCodes`。

## 6. E：换手痕迹

- **E1 注释里的过程编号（P2，已证实）**：573 个生产文件的注释里引用了 PG、BL、W5、T、RAC 编号或日期。
  - 代码与测试里一共引用了 125 个 BL 编号，其中 92 个已经不在 `specs/BACKLOG.md`（做完删行了），读者点不到。
  - S-xx（安全不变量）与验收编号是有用的指针，应该保留。
  - T-、batch、日期、已关的 BL 是交接痕迹，建议删，并加只许减少的计数。
- **E2 错误写法**：25 个 Error 子类还在，例如 `packages/storage/src/sqlite-baseline.ts:13` 的 `SqliteSchemaVersionError`；另有 1,708 处裸 Error（D3）。
- **E3 截断写法不一**：T-077～T-099 已把十几处改成按整字截。零碎单里记的 6 处，复查时在基线上只剩 `apps/local-host/src/assistant/assistant-followups.ts:274`（提醒标题 `.slice(0, 120)`）一处还按 UTF-16 单元截；`context-bus.ts`、`contextual-request.ts`、`plugin-frame/links.ts`、`context-actions.ts` 已改成按整字截，`plugin-frame/intake.ts:26` 是长度检查、不是截断（复查更正）。
- **E4 ID 生成**：见 C4。
- **E5 浏览器文本程序**：98 个程序、74 处空 catch、6 处裸 fetch；继续按 W4-04 / W5-04 打包线做。

## 7. F：文档与规范卫生

- **F1 `AGENTS.md`**：29,628 字节。「构建与测试」一节约 17,700 字，大多是门禁的口径与放行细节，与 `tooling/gates/README.md`、`scripts/gates/README.md` 重复。建议这一节只留「跑什么、看哪里」，口径下沉，目标 ≤ 15 KB。
- **F2 防腐 spec 与 `privileges.md`**：
  - spec 有 1.43 MB，片的标题还写着「实施中」「待按队列集成」「本地验证通过」（7 个）。用户 10-30 定的 W6-06（搬出现行规则后整份归档）正由 T-404 做。
  - `privileges.md` 216 KB。~~同一个 PG 号在两张表里状态不同~~（复查更正：第二张表是 §8「T0 复核（2026-10-19）」，是带日期的复核记录，结论格写「见 §3」，以 §3 为准，不算矛盾）。
- **F3 体积**：
  - `specs/` 与 `docs/` 约 92 MB：图片 62 MB；Markdown 20.6 MB，994 个文件；`docs/system/SECURITY-INVARIANTS.md` 一份就 417 KB。
  - 最大的几个目录：`docs/screenshots/showcase` 11.6 MB、`specs/archive/molis-work-im` 11.5 MB、`docs/design/project-arrival-flow` 10.9 MB、`specs/archive/plugin-builder` 9.0 MB。
  - `.impeccable/` 有门禁，这些图片没有。
- **F4「2026-10-18 改」**：77 处（复查更正），其中 32 处在 `docs/product-operations/`，在途的 PR #1526 正在重写这一组；其余在 `docs/system/RUNTIME-MIGRATION.md`（6）、防腐 spec（5）、`privileges.md`（4）。
- **F5「暂定」「暂记」「先不挡」**：81 处，在 31 个文件里（不含 `archive/`；复查更正）。
- **F6 防腐 spec §7 过时**：
  - BL-121 的三项还列为「待用户」，用户 10-31 已经定了；
  - 常驻服务 4173、旧成果表备份、远端分支清单这几条，被 10-30 的清空重建决定改变了，没有更新。

## 8. G：门禁本身

- **G1 热点（已证实）**：10-18 以来 755 个提交里被改最多的文件（`git log --since=2026-10-18` 的口径，不带时刻时 git 取当前钟点；按北京时间 10-18 零点起算是 841 个，排名不变）：

  | 文件 | 次数 |
  | --- | --- |
  | `tooling/gates/page-assets.json` | 176 |
  | `specs/BACKLOG.md` | 158 |
  | `scripts/gates/page-assets.mjs` | 122 |
  | `docs/system/SECURITY-INVARIANTS.md` | 110 |
  | `specs/repository-anti-corruption/privileges.md` | 106 |
  | `tooling/gates/baseline.json` | 105 |
  | 防腐 spec | 78 |
  | `apps/local-host/src/index.ts` | 69 |

  前六个里五个是门禁数据或登记文件。
- **G2 放行写在脚本里（已证实）**：`page-assets.mjs` 的 `APPROVED_NEW_ASSETS`（22 条）与 `APPROVED_CEILINGS`（2 条）全部已经用完，预算文件里已经是放行后的数字，却还留着。每次放行都要改门禁脚本本身，脚本因此成了第三热的文件。建议放行另放一个按资源分片的数据文件，用完由门禁报出来。
- **G3 门禁被绕开（推断：同时发生已证实，因果是推断）**：「测试引用包内部」只数深路径 import。同一时期这个数从 483 降到 412，宿主入口则从 376 涨到 558，而且新增的导出主要被测试用。把内部放进入口，门禁就看不到了。B1 的入口宽度门禁可以堵上。
- **G4 错误模型看不到裸 Error**：见 D3。
- **G5 只报告、不挡的数字都在涨**：死翻译键 2,472 → 2,518；验收编号 570 个没证明；宿主行数没有门禁。
- **G6 只在 macOS 跑的用例**：44 处 skip 写着 `process.platform !== 'darwin'`，Linux CI 永远不跑；风险登记 R-33 是先例（macOS 上红了没人发现）。

## 9. H：归属与决策

- **H1 BACKLOG 归属**：
  - 254 行里，124 行写「未分配」，17 行负责人为空，§8 的 22 行那张表根本没有负责人列，合计 163 行无主。
  - 有主的里面，不少写的是已经暂停或交接的线，如「②」「③」「ac-artifacts」「ac-trust」「ac-registry」「回执线」「防腐线」。
  - 17 行列数不对，如 BL-918 只有 2 列；四节用了四种表头。
- **H2 错误主人表**：62 个主人覆盖 2,617 个源文件，另有 627 个没人。
- **H3 决定与风险的编号**：协调分支 `coordination/2026-10-14/RISKS-AND-DEFERRED.md` 里有两套 R-01～R-27，又和防腐要求附录 A 的 R-01～R-14 同名。同一个「R-03」在不同文件里是三件事。

## 10. I：遗漏清单

| # | 来源 | 结果 | 下一步 |
| --- | --- | --- | --- |
| 1 | 原始需求 §7 | 见第 2 节：1 项违反（热点）、3 项部分、1 项未完成（真实 Home 重建，等用户）、4 项符合但有缺口 | 违反与部分项进第 12 节分片 |
| 2 | 防腐 spec 待办 | §1.1 已在 10-30 清掉；§7 的 10 项里至少 4 项过时（F6）；§8 的 8 项写于 10-12，「维护八」已被清空重建取代；7 个片的标题状态过时 | 随 W6-06（T-404）一起改成现状 |
| 3 | BACKLOG 254 行 | 34 行正文写着已合入、已完成、已删、已修或做完。复查逐行核过：都是「前置 PR 已合入」「做完的样子」或部分完成，没有一行按正文已经做完；但 BL-493 写着「未实现」，代码上已由 #1723 做了（第 16 节 N5）。163 行无主；17 行格式坏；2 行写着暂定或待裁 | 统筹核 BL-493；无主的定主人 |
| 4 | 协调与交接记录 | 风险登记 65 行，约 54 行没标关闭：40 行不指向任何 BL，14 行只指向已删的 BL，没有一行指向开着的 BL。R-24 实际已解决（`Verify` 依赖 `security-invariants`），仍写「开着」。零碎单约 160 行，也只在协调分支上。主检出的 `.claude/handoff/` 不入库 | 开着的并进 BACKLOG（带主人），协调分支只留进度 |
| 5 | PR 遗留 | 10-13 以来 172 个 PR 关闭未合并（复查更正：原写 61）。复查逐个核过：66 个评论里写明随批落地，84 个被已合并的批 PR 点名，其余按提交说明在 main 上找得到；不在 main 上的只有 #1538、#1553 两个维护脚本 PR（推断：被 10-30 清空重建的决定取代）。带「交 Codex 修复队列」的 PR 58 个、「非阻塞」104 个、「后续单」62 个，都没和 BACKLOG 或零碎单对账；开着的 11 个 PR 里有 10-18、10-23 的草稿（#734、#1059） | 抽查对账；关掉的 PR 判断是被取代还是丢了 |
| 6 | 用户决定落地 | **已排期**（更正）：MemoryService 登记为内聚单元（10-30 第 3 项）排给 T-061，等 #1101/#1059 合入后登记；health 里那 2 个未登记的就是它。**在做**：PG-070/071 样式搬出共用表，Goals 还剩 321 条、Feed 234 条、Coding 9、Form 6、创作台 5（T-393 等）。**已落地**：BL-121 ②（`feed-start` 已为 0）、T-137 的通用面板表。**存疑**：安装清单 `SCHEMA_VERSION = 4`（`apps/local-host/src/installer/home-contract.ts:9`），10-30 定「各库与带版本的 JSON 合成第 1 版」，`docs/releases/CHECKLIST.md` 的版本表里没有它 | MemoryService 随 T-061；`SCHEMA_VERSION` 请统筹定 |
| 7 | 验收编号 | 570 个没有证明：proactive-assistant 106、onboarding-coverage 44、font-and-skin-system 38、prologue-memory-strategy 32、coding-harness-optimization 32、work-brief 26… | 按 spec 的状态句分三类：该归档、该标「[人工]」、真没测 |
| 8 | 写了没人看守的规则 | 抽查 5 条硬约束（删项目唯一服务、并发调度声明、身份不从输入读、DOM 事件登记、错误子类），都有门禁或测试。复查把 `AGENTS.md` 里写「CI 里跑」的门禁和用例逐个追到 `ci.yml` 的必过作业，全部属实；`AGENTS.md` 里写死的两个旧数字过时了（第 16 节 N1） | 改 `AGENTS.md` |
| 9 | 安全不变量 | S-03 行漏了 RAC-1805 的用例（零碎单 T-167）；R-24 已过时 | 改表 |
| 10 | 残留 | 158 个工作树、1,123 个本地分支、1,116 个远端分支；主检出落后 175 个提交 | 按「只清干净且已在 main 的」规则清理，要各会话或用户确认 |

## 11. J：例外台账

| 登记处 | 条数 | 理由 / 出处 / 主人 / 退出条件 | 分类 | 处置 |
| --- | --- | --- | --- | --- |
| `tooling/gates/giant-exceptions.json` | 41 | 有 / 3 条有 / 无 / 无 | 长期（用户 10-25 规则） | 加主人与重看条件；MemoryService 两条由 T-061 补登（已排期） |
| `tooling/gates/root-allowlist.json` | 35 | 有 / 无 / 无 / 无；所列都在 | 长期 | 不动 |
| `tooling/gates/error-owners.json` | 46 个主人 | 有 / 无 / 自身即主人 / — | 长期 | 补那 627 个没人的文件 |
| `tooling/gates/secret-allowlist.txt` | 15 行 | 有 / 无 / 无 / 无 | 长期 | 保留（更正）：`shelf-knowledge-test-control-token-1234567` 在不在 main 的提交 431c2847 里，三个远端分支还带着；删了，这些分支合入时会被拦 |
| `tooling/gates/doc-citation-exceptions.json` | 3 | 有 / 无 / 无 / 无 | 长期 | 不动 |
| `tooling/gates/plugin-styles.json` | 5 个插件（Goals 321、Feed 234、Coding 9、Form 6、创作台 5 条规则） | 有（用户 10-25）/ 有 / 线 / 搬完为 0 | 过渡 | 随 PG-070 后继 |
| `tooling/gates/table-owners.json` | same_name 2、areas 1 | 有 / 无 / 无 / 无 | 长期 | 不动 |
| `page-assets.mjs` `APPROVED_CEILINGS` | 2 | 有 / 有 / — / 下一次改门禁时删 | 一次性，按规则轮换，不算遗漏（更正） | 整治 PR 改了门禁，按规则删了 |
| `page-assets.mjs` `APPROVED_NEW_ASSETS` | 22 | 有 / 有 / — / 首次冻结后无效 | 一次性，**已用完** | 整治 PR 已删；改成数据文件归 R7（G2） |
| 装配门禁 `APPROVED_BUILD_TIME_EXCEPTIONS`、`NATIVE_PLUGIN_HTTP_FILES` | 2、1 | 有 / 有（用户 10-21、10-23、10-27）/ 用户 / BL-377 | 用户批准的长期例外 | 不动；改它的范围先问用户 |
| `APP_IMPORT_ALLOWLIST` | 9 | 有（启动器嵌宿主）/ 无 / 无 / 无 | 长期 | 不动 |
| `PLUGIN_MODULE_IMPORT_ALLOWLIST` | 1（Shelf → Module） | 「是债，不是先例」/ 无 / 无 / 无；插件从 Module 根取实现：`openShelfStore`、`initializeShelfFiles`、`SHELF_RECIPES`、`isHttpUrl`、`shelfErrors` | **无主的过渡例外** | 开 BL：只留 `/contract` 的类型，实现搬回插件或走动作 |
| `biome.jsonc` overrides | 1 条（5 个目录关 `noConsole`） | 有 / — / — / — | 长期（命令行程序） | 不动 |
| 兼容标记 | 8 | — | **全是误报**：`pdfjs-dist/legacy/build` 的第三方路径、Manifest 的 `upgrade_compatibility` 字段、一句翻译 | 不动；可给门禁加按行的已知误报 |
| `specs/shell-page-exceptions/spec.md` | 8 类 | 有 / 有（归档 spec）/ 无 / 无 | 长期 | 加重看条件 |
| CALL-CHAINS §10.1 / §10.2 | 14 / 0 | 有 / 有 / 有 / 有 | 长期 | 不动 |
| CALL-CHAINS「没盘点的只走 HTTP 写入」 | 4 组，约 38 处 | 无 | **无主** | B9：逐组定 |
| `privileges.md` | 待做 11 行（PG-011、017、045、046、060、064、070、078、093、094、111），PG-077 待验收，「不迁、不删」5 行，「不做」1 行 | 有 / 有 / 线 / 部分有 | 过渡 + 用户批准 | 合成一张表，删掉第二张历史表 |
| `tests/quarantine.json` | 0 | — | — | — |
| 测试 skip / todo | 64 | 44 处只在 macOS、2 处要 Chrome、6 处要环境变量、3 处看工具在不在；其余是探针测试里的样例 | 平台条件，隐式 | 列一份「只在 macOS 跑」的名单，写明谁在什么时候跑 |
| 压制注释 | `@ts-expect-error` 20（全是测试里的反向类型断言）、`eslint-disable` 3 | — | 后者 Biome 不读，但说明了意图 | 留到下次改这几个文件时（更正） |
| `TODO` | 1（D2） | 无 | 隐式 | 请用户定 |
| 「2026-10-18 改」/「暂定」类 | 73 / 73 | 部分有 BL | 过渡 | 各挂一条 BL，或改成现状 |

合计：

- **用完没删**：22 条新资源放行（整治 PR 已删）；2 条增长放行按规则轮换，也随整治 PR 删了。
- **无主**：Shelf 层间例外，以及 4 组没盘点的 HTTP 写入。
- **散在登记处之外**：协调分支上的风险登记与零碎单。

## 12. 整治分片建议

按路径聚合，同一批路径一个 PR；SDK 与 storage 属于共享核心，合到一条集成分支，只跑一次全量。

| 片 | 档 | 内容 | 碰的路径 | 依赖 |
| --- | --- | --- | --- | --- |
| R1 例外清账 | 丙 | 删 22 条已用完的新资源放行和 2 条到期的增长放行；Shelf 层间例外开 BL（BACKLOG 归统筹）。白名单那条与 `eslint-disable` 留着，MemoryService 随 T-061（更正） | `scripts/gates/page-assets.mjs` | 无 |
| R2 共享工具收口 | 甲（共享核心） | SDK 里 `isRecord`、schema 构造器、`messageOf` 各一份，插件改用 SDK 的 `escapeHtml`；Runtime 改用 SDK 的规范化 JSON；Goals 的 `requestHash` 包内一份；`pnpm api:update` | `packages/plugin-sdk`、`packages/plugin-runtime`、各插件 | 集成分支 |
| R3 存储预检 | 乙（共享核心） | storage 加 `assertSqliteBaseline`，四处改调；删 7 个构造器里的建表执行 | `packages/storage`、`apps/local-host`、`server`、`packages/plugin-runtime` | 和 R2 同一条集成分支 |
| R4 宿主入口收窄 | 乙 | 入口只留装配接口，测试改走 test-kit 或测试子路径；加入口宽度门禁 | `apps/local-host/src/index.ts`、几百个测试文件 | 按测试目录分批，避开在途大批 |
| R5 参数与死代码 | 丙 | B5 里非公开面的死函数；B2 里非公开面、文件空闲的几组重复（Goals 的 `requestHash`、四份控制令牌比较、两份分支读取）；C1 核实后不删（更正）；C2 与死路由等 #1101 | 分散，按包合并 | 无 |
| R6 文档卫生 | 丙 | `AGENTS.md` 下沉门禁细则；删已关的 BL、T、日期注释并加计数；图片移出或删历史截图；F6 的过时句 | 文档、注释 | W6-06（T-404）之后 |
| R7 门禁去热点 | 甲 | 放行改成数据文件；给死翻译键、宿主行数、只走 HTTP 的写入、注释里的过程编号加只许减少的数字 | `scripts/gates/`、`tooling/gates/` | 改门禁要评审 |
| R8 待办单一出处 | 丙 | 风险登记与零碎单里开着的项并进 BACKLOG（带主人）；BACKLOG 修表头与无主行 | `specs/BACKLOG.md` | 统筹做（枢纽文件） |

## 13. 要用户或统筹裁定的

**用户 2026-11-01 已定**（弹窗）：

| # | 决定 | 落到哪 |
| --- | --- | --- |
| 1 | 新的平台服务不进宿主，放进 `horizontal/*`，宿主只做装配；存量随各线迁出；加一条宿主行数只许减少的门禁；R-03 继续开着 | R4、R7 |
| 2 | SQLite 收成 `node:sqlite`，**分两步**（初次按错的范围定，核实后重问，用户改定）：先把驱动收进 storage——storage 给出自己的连接接口，生产代码与测试不再直接 import better-sqlite3（测试改用 test-kit 的打开函数），加门禁只许 storage 用它；等 #1724 等在途大批与真实 Home 重建之后，再在 storage 里一处换成 `node:sqlite`。两步各走集成分支跑全量；Alchemist 不动 | R3（共享核心集成分支） |
| 3 | 「未登录 / 登录」按钮保留到登录做出来；把 TODO 换成一条带主人的 BACKLOG 行 | 统筹（BACKLOG 是枢纽文件） |
| 4 | 安装清单 `SCHEMA_VERSION` 算进 10-30 的决定，改成第 1 版，写进 `docs/releases/CHECKLIST.md` 的版本表；和真实 Home 清空重建同一时段落地 | 单独一个 PR，随重建合入 |
| 5 | 删掉合同描述符的 `maturity` 字段；包成熟度只认 SSOT 的四个词与 `scripts/workspace-packages.mjs` | R2（共享核心集成分支，`pnpm api:update`） |
| 6 | 只走 HTTP 的四组写入：先逐条登记进 CALL-CHAINS §10.1（带主人和理由），再逐组改成动作；新写入一律走动作 | R6、后续各组 |
| 7 | 风险登记与零碎单里开着的项并进 `specs/BACKLOG.md` 并带主人，协调分支只留进度 | 统筹（Codex） |
| 8 | 工作树与本地分支：只清工作区干净、已合入的；有改动、没合入、别的会话在用的跳过；远端分支不动 | 本会话做，清单见第 15 节 |

以下是当时提的问题，留作出处：


1. **宿主瘦身**：新的平台服务（连接器、安装、终端、助理）都长在 `apps/local-host`，可以接受，还是迁进 `horizontal/*`？这决定 R-03 能否关。
2. **两个 SQLite 驱动**：收成一个，还是写明保留的理由？
3. **设置里永远禁用的「未登录 / 登录」按钮**：删掉，还是保留到登录功能做出来？这会改用户看得见的界面。
4. **安装清单 `SCHEMA_VERSION = 4`**：按 10-30 的决定算第 1 版，还是不属于那条决定？
5. **合同描述符的 `maturity` 字段**：删掉，还是改成从登记表推出？
6. **四组没盘点的只走 HTTP 写入**：逐组登记进 CALL-CHAINS §10.1，还是改成动作？
7. **待办单一出处**：协调分支上的风险登记与零碎单，是否并进 BACKLOG？
8. **工作树与分支的清理**：是否授权，以及由谁来清？

## 14. 方法与局限

- **工具**：用仓库自带的 TypeScript 5.9.3 解析了 5,255 个 TypeScript 文件，得到 15,044 个顶层函数、430,825 个调用点，在此之上做：
  - 同名定义与函数体哈希（逐字相同，和只换名字的结构相同）；
  - 按名字对应调用点，找从不传的可选参数和恒定实参；有展开参数的调用点不算；
  - 在全部入库的文本文件里按词搜导出名，找死导出。
- **核实**：工具结果逐类抽查。可以复现的数字都标了命令。
- **会误报的地方**：
  - 按名字对应调用点：同名方法、动态工厂（已剔除插件工厂 `ports`）；
  - 死导出搜索看不到拼接出来的名字。
- **没覆盖的**：
  - 运行时行为、浏览器、真实模型；
  - I-8 只抽查了 5 条（复查补了「CI 里跑」的逐条追踪）；
  - PR 评论里的后续项只抽查了 2 个 PR（第 16 节 N6），没有逐条对账；
  - BACKLOG 那 34 行复查已逐行核。
- **数字会变**：统筹在途的大批（#1724 等）合入后，宿主行数、入口宽度、页面资源会变；整治开工前按第 1 节的命令重测。

## 15. 停下时的状态

用户 2026-11-01 定只出报告，整治不在本轮执行；同日确认这条目标就此收口，#1727 留给统筹审，本地共享核心草稿留着、不推送。停下之前已经做了的：

| 项 | 状态 |
| --- | --- |
| R1/R5 第一片 | PR [#1727](https://github.com/molis-ai/molis-work/pull/1727) 已开（删 24 条已用完、到期的页面资源放行，删 3 个死函数，Goals `requestHash`、四份控制令牌比较、两份读分支各收成一份；定向 21 个文件与 health、page-assets、boundary、secrets 都过）。留不留由统筹定 |
| 工作树与分支（⑧） | 已清：干净且已合入的工作树 21 个、本地分支 294 个；`~/.codex/worktrees` 没动 |
| 统筹交接 | #1332 评论 [6568020430](https://github.com/molis-ai/molis-work/issues/1332#issuecomment-6568020430)；更正评论 [6568532474](https://github.com/molis-ai/molis-work/issues/1332#issuecomment-6568532474)：原评论里「我接着做的」三项不做了，交统筹 |
| 共享核心集成分支 | 本地分支 `claude/anticorr-shared-core` 有未提交的草稿（删 `maturity`、`checkSqliteBaselineVersion`、SDK 内部 `isRecord` 收成一份、API 快照），已构建通过，没跑用例、没推送 |

复核出的误判（已在原处标「（更正）」）：

- `APPROVED_CEILINGS` 按门禁规则轮换，不是遗漏；
- 密钥白名单那一条仍需要；
- MemoryService 的登记已排期（T-061）；
- C1 的参数是注入口或公开合同，不删；
- B3 的四份预检大多有意不同，只有「读版本、空库、拒绝」一段重复；
- C3 的 better-sqlite3 是项目库的驱动，范围是一百多个文件，不是 3 个。

### 留给统筹排期的整治（按依赖排序）

1. **R1 余项**：Shelf 层间例外开 BL；登录按钮的 TODO 换成 BL 行（③）。
2. **R2 + R3（共享核心，一条集成分支）**：删 `maturity`（⑤）；`checkSqliteBaselineVersion`，另两处等 #1724、#1725 合入；SDK 内部小工具收口；`pnpm api:update`，跑全量。
3. **SQLite 第一步（②）**：驱动收进 storage，加门禁只许 storage import better-sqlite3。第二步等在途大批与真实 Home 重建之后。
4. **宿主边界（①⑥）**：「新平台服务不进宿主」写进 ARCHITECTURE；宿主行数门禁先只报告，在途大批合入后再改成挡合并（直接挡会让 #1724 等全部变红）；四组只走 HTTP 的写入先逐条登记 CALL-CHAINS §10.1，再逐组改动作。
5. **安装清单版本（④）**：`SCHEMA_VERSION` 4 → 1，写进 CHECKLIST 版本表，和真实 Home 清空重建同一时段合入。
6. **R4 宿主入口收窄、R6 文档卫生、R7 门禁去热点**：按第 12 节。
7. **R8 待办单一出处（⑦）**：统筹把风险登记与零碎单里开着的项并进 BACKLOG。
8. **复查新增（第 16 节）**：
   - 并进已有的片：N4 随 R2 与真实 Home 重建，N6 并进 R8，N7 并进 R2；
   - 小片：N1 改 `AGENTS.md`，N2 在 SYS-15 补一句 `--base` 断言；
   - N3 让安全不变量门禁要求每个测试文件都带测试名，改门禁要先问用户；
   - N5 由主人核 BL-493。

## 16. 复查（2026-11-01，第二遍）

用户要求再查一遍有没有遗漏，重复逻辑要交叉验证，其余各方面也补校验。这一遍不沿用第一遍的工具，换方法重做，对象仍是 `e4e98ed33`。

### 16.1 方法

- **计数**：导出、注释、skip、同名函数体都改用 TypeScript 语法树数，不用正则。文本搜索一律用 `git -c core.quotepath=off`，第一遍漏掉了中文路径的文件。
- **死代码**：第一遍判出的 105 个导出（6 个没人用、99 个只在本文件用）逐个在全仓文本里重搜，搜的范围比引用关系更宽，只搜到定义就确实没人用。
- **重复逻辑**：同名函数先把参数名和空白归一，再按函数体分组，看语义是否真的相同；规范化 JSON 追到每个摘要和签名的产出方与校验方。
- **#1727**：另开工作树完整构建，先跑基线，再对构建产物和门禁脚本做变异，看用例能不能抓到：
  - 令牌比较变异 1 处；
  - 页面资源门禁变异 5 处；
  - 每次跑完都还原，并比对文件确认已还原。
- **流程**：用 GitHub API 查 PR 评论；逐行核对 BACKLOG、安全不变量表和协调分支上的登记。

### 16.2 第一遍结论的核对结果

| 项 | 结果 |
| --- | --- |
| 翻译（80 本、9,560 条、577 个重复键、136 个冲突、2,518 个死键） | 相符；`en.ts` 的死键是 1,773，原写 1,762 |
| 验收编号（992 / 294 / 570） | 相符 |
| health 数字（412 / 202、146、464、19、25、627、8） | 相符 |
| BACKLOG（254 / 163 / 17） | 相符 |
| 宿主行数与入口宽度的趋势 | 10-13、10-20 两个点相符；10-27 是 514，原写 516，取的时刻不同 |
| 注释里的过程编号（573 个文件） | 按语法树数是 578 个，各类数字差 1–3%；E1 的 BL 编号 124 / 92，原写 125 / 92 |
| 裸 `new Error(`、`randomUUID` | 1,720 / 496、387，口径差 <1% |
| 体积 | 原文的 MB 是 MiB；另有 `.jpeg` 3.1 MB（29 个）没算进去 |
| 死导出 105 个 | 全部成立 |
| B6 克隆 | 逐字相同的几组全部成立（伙伴舞台 2 组、时间格式 4 份、Schedule `define` 2 份）；dataset 与 ppt 两组是改了名字的同一段 |
| C2 恒定实参 | 成立 |
| C4 幂等键 | 3 处成立：agent-host 1 处，工作台回退分支 2 处 |
| H3 编号撞车 | 成立：风险登记里 R-01～R-27 各出现两次；R-03 在防腐要求里指宿主体积，在风险登记里指机器负载 |
| I-9 安全不变量 | 成立：RAC-1805 的用例在 `tests/web-mutation-key-settle.test.ts`，S-03 行没列；R-24 仍写「开着」 |
| 原处已改的 | 宿主入口消费者、`isRecord` 写法数、HTML 转义份数、规范化 JSON 份数、B5 两项已删、E3、F2、F4、F5、§2 的交叉引用、PR 遗留数、B9 口径 |

### 16.3 新发现

- **N1 `AGENTS.md` 写死的旧数字（P2，已证实）**：「静态检查」一条写着空 `catch`「没变（5）」、`as unknown as`「从 199 变成 202」，现在门禁量出来是 1 和 146。规则文档里写的是某一刻的快照，会误导读者。建议删掉这两个数字，指向 `--report`。
- **N2 页面资源门禁的测试缺口（P2，已证实，变异检验）**：
  - 「新资源的首次放行多 1 字节」这个变异在 CI 实际走的 `--base` 路径上（`scripts/gates/page-assets.mjs` 的 `baseErrors`）存活，`tests/page-assets-budget.test.ts` 全过。SYS-15 只在 `--update` 路径上断言「多 1 字节被拒」。
  - 另外 4 个变异都被抓到：新资源一律放行，增长上限在两条路径上各放宽 1 字节，`--update` 路径的首次放行。
  - 这个缺口在基线上就有，不是 #1727 引入的。补法：在 SYS-15 里加一句 `--base` 下 `bytes + 1` 要失败。
- **N3 安全不变量表只查到文件这一层（P2，已证实）**：
  - 105 行、1,162 个具名测试，在测试里全都找得到。
  - 但有 10 行（S-07、S-08、S-12、S-13、S-15、S-18、S-36、S-41、S-47、S-105）的部分出处只写了测试文件、没写测试名。`scripts/gates/security-invariants.mjs` 对这种写法只查文件存在，`AGENTS.md`「每条有断言拒绝本身的测试」在这些行上没人看守。
  - S-105 用 RAC 编号指代用例，不是「」测试名。
  - 另有 15 个具名测试只在 macOS 跑（Linux 上的 `security-invariants` 作业跳过），好在没有一行全靠它们。
- **N4 SDK 的规范化 JSON 依赖语言环境（P2，推断，已复现排序差异）**：
  - `packages/plugin-sdk/src/json-value.ts` 的 `canonicalJsonValue` 用 `localeCompare` 排键。同一组键在 Node 的默认语言环境和 `zh` 下顺序不同，例如 `e` 与 `é`。
  - Goals 用它算 `request_hash`，存进提案操作库做幂等比对（`plugins/native/goals/src/governance/proposal-operation-store.ts:57`）。宿主换了语言环境重启后，带非 ASCII 键的重试会被当成不同的请求。
  - 现在 12 份按键排序的写法里 5 份用 `localeCompare`、7 份按码位。复查已核实：每个摘要与签名都由同一个函数产出和校验，没有跨写法比较，所以现在不出错。
  - 建议 R2 收口时 SDK 改成按码位排（与 RFC 8785 一致），其余各份改用它。这会改变已存的 `request_hash`，和真实 Home 清空重建放在同一时段做。
- **N5 BL-493 已做却写着「未实现」（P2，存疑）**：#1723（`e4e98ed33`）加了沙箱包的 Agent 角色与方法正文：`sandbox-agent-declarations.ts`、`sandbox-agent-bodies.ts`、S-105 和 RAC-2636～2643。这正是 BL-493 的内容，但 #1723 没改 BACKLOG。请主人确认后删行，或者改写剩下的部分。
- **N6 PR 评论里「交 Codex 修复队列」的项没有台账（P1，已证实，抽查）**：
  - 有这类评论的 PR 共 59 个。协调分支上的 `REVIEW-FIX-STATUS.md` 停在 10-24，之后没有任何地方汇总这些项。
  - 抽查 2 个 PR：
    - #1186 的一项（Dataset 请求助手不带 `scope`、不调 `host.readRefusal`，离开页面不取消、被拒时说不出原因）到基线仍是原样，也没有 BL 行或 issue。
    - #1297 的三项里，一项已修；一项（`AgentStepReportAuthor` 没从 `services/agent-host` 导出，API 快照里仍是未导出的 `interface`）还开着，而它要挂靠的 BL-470 行已经删了；另一项（页面一侧的断言）没法从代码判断。
  - 「非阻塞」的项会这样丢掉。建议 R8 先把这 59 个 PR 的项过一遍，并进 BACKLOG。
- **N7 动作描述符的工厂也是每个插件一份（P2，已证实）**：35 个 `define` 一类的工厂，函数体有 34 种，默认值大同小异（按 operation 推 `kind`、`scope`、`audiences`）。和 B2 的 schema 构造器是同一类，可以一起进 SDK。
- **N8 #1727 本身（复查结论：可以合）**：
  - `requestHash` 5 份逐字相同，都从 SDK 取 `canonicalJsonValue`。
  - `currentWorkspaceBranch` 与原来两份逐字相同，调的是同一个 `runWorkspaceGit`。
  - 删掉的三个函数在基线上全仓没有引用，也没从包入口导出。
  - `controlTokenMatches` 只有一处行为变化：期望的令牌为空时，原来三份会放行空令牌，现在一律拒绝。`resolveWebControlToken` 只给 32～512 字符的令牌，测试里也没有空令牌，所以生产上等价、更严。
  - 变异检验：令牌比较变成「只要是字符串就放行」，S-03、S-04 的 6 条用例失败（HTTP 与三个 socket 都覆盖到）。
  - CI 的 Verify 已绿，全量在跑。

### 16.4 复查的局限

- 语言环境的影响只复现了排序差异，没有在宿主里实际换语言环境重启。
- N6 只抽查了 2 个 PR。
- 变异检验只做了 #1727 涉及的两处。
- 死代码的全文重搜看不到拼接出来的名字，与第一遍相同。
