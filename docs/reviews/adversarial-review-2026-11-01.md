# 全仓对抗式审查报告（2026-11-01）

状态：审查完成。用户 2026-11-01 定**只出报告、不由本轮执行整治**；第 12 节分片与第 13 节裁定留给统筹排期。报告不改产品代码、门禁、测试、规格和真实 Home。初稿之后对抗式复核出的误判，已在原处更正并标「（更正）」；停下之前已经做了的，见第 15 节。同日又用另一套方法把全部数字、重复逻辑与 #1727 逐项复查了一遍（语法树计数、全文检索、变异检验），改动处标「（复查更正）」，新发现与逐项结果见第 16 节。11-02 把前两遍里按评论、正文状态或文档判的几项（关闭的 PR、BACKLOG、`privileges.md`、扩展点清单、例外台账）逐项改成对照基线代码，改动处标「（对照代码更正）」或「第三遍」，结果见第 16.5 节。同日又按用户要求补了第四遍，看哪些逻辑能下沉成平台能力、哪些实现多余、哪些检查谨慎过了头、调用链里有几层只是转发，用的是类型检查、转发链分析和在途分支核对；结果在第 17 节，对象是 `2ec20d4fc`。之后又按用户要求补了两遍：第五遍把版本收敛到初始、清理兼容（第 18 节）；第六遍在临时 Home 里数一次请求做了多少事，找无效调用与重复调用（第 19 节，对象是 `bdee612b9`）。

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
| 扩展点清单 | **部分**（对照代码更正：原写符合，只看了文档在不在） | `docs/system/EXTENSION-POINTS.md` 引用的 146 个路径都在，但有两处「现在」与代码不符（第 16.5 节 N10）：第 91 行写用户装不上插件、没有保存的信任根，batch-40（10-25）起宿主已能预览、确认并安装签名的沙箱包，并钉住发布者（`apps/local-host/src/plugin-install-service.ts`）；F2 写宿主里还要改 2 处（项目库 `version: 7`、`project-plugins.ts` 的 `codingPorts`），基线上版本是 1，`codingPorts` 已由 #938（10-21）删掉 |
| 热点下降、聚合文件各自登记 | **违反** | 聚合点从源码换成了门禁数据文件（第 8 节 G1）；`privileges.md` 106 次、`SECURITY-INVARIANTS.md` 110 次、`BACKLOG.md` 158 次 |
| 归属表、合同变更流程、CI 产品子集 | 符合 | `.github/CODEOWNERS`、`docs/system/CONTRACT-CHANGES.md`、`tests/ci-product-subset.txt` |
| 协作规则入库 | 符合 | `docs/system/PARALLEL-DEVELOPMENT.md` |
| 静态检查、API 快照、资源预算进 CI | 符合 | `.github/workflows/ci.yml` 的 health、page-assets、api、native-checks 各作业；`Verify` 依赖它们 |
| 术语表、两套能力机制收敛 | 符合 | `docs/system/GLOSSARY.md`；typed 宿主能力为 0 |
| 主链路与代码一致、每个能力一条路径 | **部分** | [CALL-CHAINS §10](../system/CALL-CHAINS.md) 自己写着四组「还没有逐条盘点的只走 HTTP 的写入」，5 个文件里约 38 处写路由（第 3 节 B9、第 11 节） |
| 巨大单元门禁生效、清单缩小 | 符合，MemoryService 已排期 | 123 → 43；`horizontal/memory/src/service.ts` 与 `MemoryService` 的内聚单元登记归 T-061，等 #1101/#1059 既定前置，不计作遗漏（I-6；更正） |
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
- **D2 永远禁用的「未登录 / 登录」按钮（P2，基线时待裁，作者后续记录见 §13 第 3 项）**：`apps/workbench/src/settings-directory.ts:30`，每个人都看得到，旁边是 `TODO: Enable this entry when sign-in is implemented`。它和第一轨删掉的「通知功能即将开放」是同一类占位。这是全仓唯一真正的 TODO；改它会改用户看得见的界面。
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
- **G2 放行写在脚本里（已证实）**：`page-assets.mjs` 的 22 条 `APPROVED_NEW_ASSETS` 已首次冻结、用完未删；另 2 条 `APPROVED_CEILINGS` 按规则在下一次修改门禁时移除，当前保留不算遗漏，本次整治修改门禁时一并轮换（更正）。每次放行都要改门禁脚本本身，脚本因此成了第三热的文件。建议放行另放一个按资源分片的数据文件，用完由门禁报出来。
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
| 1 | 原始需求 §7 | 见第 2 节：1 项违反（热点）、4 项部分（对照代码更正：扩展点清单改判部分）、1 项未完成（真实 Home 重建，等用户）、4 项符合但有缺口 | 违反与部分项进第 12 节分片 |
| 2 | 防腐 spec 待办 | §1.1 已在 10-30 清掉；§7 的 10 项里至少 4 项过时（F6）；§8 的 8 项写于 10-12，「维护八」已被清空重建取代；7 个片的标题状态过时 | 随 W6-06（T-404）一起改成现状 |
| 3 | BACKLOG 254 行 | 34 行正文写着已合入、已完成、已删、已修或做完。复查只按正文判过；第三遍逐行对照基线代码（第 16.5 节）：23 行代码与正文相符、确实没做；3 行不符——BL-493 已由 #1723 做了（N5），BL-375 的成果类型一半已做（安装、换版本、启用时拒绝第二个属主，S-82），只剩过程项，BL-137 等的 Prologue 修复已在现用的包里，只差复测；另 8 行是验收、浏览器矩阵或真实 Home 的数据，代码判断不了。163 行无主；17 行格式坏；2 行写着暂定或待裁 | 统筹核 BL-493、BL-375、BL-137；无主的定主人 |
| 4 | 协调与交接记录 | 风险登记 65 行，约 54 行没标关闭：40 行不指向任何 BL，14 行只指向已删的 BL，没有一行指向开着的 BL。R-24 实际已解决（`Verify` 依赖 `security-invariants`），仍写「开着」。零碎单约 160 行，也只在协调分支上。主检出的 `.claude/handoff/` 不入库 | 开着的并进 BACKLOG（带主人），协调分支只留进度 |
| 5 | PR 遗留 | 10-13 以来 172 个 PR 关闭未合并（复查更正：原写 61）。复查只按评论、批 PR 说明与提交说明判过；第三遍逐个对照 main 的代码（第 16.5 节）：166 个的改动在 main 上（151 个原样、7 个是搬移、8 个大部分在而其余文件后来又改过），3 个是重复认领、留下的另一个已合进 main；不在 main 上的有 3 个：#1538、#1553 两个维护脚本 PR（10-30 定清空重建、不迁移以后不再需要），和 #631 统一输入与本地语音（10-20 搁置待重做，没有 BACKLOG 行，N9）。按评论判的「只有两个不在」漏了 #631。带「交 Codex 修复队列」的 PR 58 个、「非阻塞」104 个、「后续单」62 个，都没和 BACKLOG 或零碎单对账；开着的 11 个 PR 里有 10-18、10-23 的草稿（#734、#1059） | 抽查对账；关掉的 PR 判断是被取代还是丢了 |
| 6 | 用户决定落地 | **已排期**（更正）：MemoryService 登记为内聚单元（10-30 第 3 项）排给 T-061，等 #1101/#1059 合入后登记；health 里那 2 个未登记的就是它。**在做**：PG-070/071 样式搬出共用表，Goals 还剩 321 条、Feed 234 条、Coding 9、Form 6、创作台 5（T-393 等）。**已落地**：BL-121 ②（`feed-start` 已为 0）、T-137 的通用面板表。**存疑**：安装清单 `SCHEMA_VERSION = 4`（`apps/local-host/src/installer/home-contract.ts:9`），10-30 定「各库与带版本的 JSON 合成第 1 版」，`docs/releases/CHECKLIST.md` 的版本表里没有它 | MemoryService 随 T-061；`SCHEMA_VERSION` 基线时待裁，作者后续记录与重建时段限制见 §13 第 4 项 |
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
| `privileges.md` | 待做 11 行（PG-011、017、045、046、060、064、070、078、093、094、111），PG-077 待验收，「不迁、不删」5 行，「不做」1 行 | 有 / 有 / 线 / 部分有 | 过渡 + 用户批准；第三遍对照代码：2 行状态过时、7 行的出处已不在（第 16.5 节 N11） | 合成一张表，删掉第二张历史表；N11 那几行按代码改状态和出处 |
| `tests/quarantine.json` | 0 | — | — | — |
| 测试 skip / todo | 64 | 44 处只在 macOS、2 处要 Chrome、6 处要环境变量、3 处看工具在不在；其余是探针测试里的样例 | 平台条件，隐式 | 列一份「只在 macOS 跑」的名单，写明谁在什么时候跑 |
| 压制注释 | `@ts-expect-error` 20（全是测试里的反向类型断言）、`eslint-disable` 3 | — | 后者 Biome 不读，但说明了意图 | 留到下次改这几个文件时（更正） |
| `TODO` | 1（D2） | 作者后续决定记录见 §13 第 3 项 | 基线时隐式 | 核原决定后由统筹登记带主人的 BACKLOG |
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

**作者转述的用户 2026-11-01 决定**（作者记为弹窗）：以下保存作者的决定记录；本报告未附可定位的原始弹窗记录，统筹须核原记录后另行排期。此表不独立授权产品实现、真实 Home、保护分支或凭据操作；第 4 项的真实 Home 重建时段限制保持。

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
| R1/R5 第一片 | PR [#1727](https://github.com/molis-ai/molis-work/pull/1727) 已开（删 24 条已用完、到期的页面资源放行，删 Schedule 无调用函数，保留在途消费者使用的两个 Memory helper（后继 e181f302 已恢复），Goals `requestHash`、四份控制令牌比较、两份读分支各收成一份；定向 21 个文件与 health、page-assets、boundary、secrets 都过）。留不留由统筹定 |
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
9. **第三遍新增（第 16.5 节）**：
   - N9 给 #631 的重做开 BACKLOG 行，并进 R8；
   - N10、N11 并进 R6：按代码改 `EXTENSION-POINTS.md` 的三处与 `privileges.md` 的状态和出处；
   - BACKLOG 的 BL-375、BL-137 交主人改写。
10. **第四遍新增（第 17 节）**：
   - 先要统筹定的两件：
     - N12 的文档记录协议，归 SDK，还是归成果库与放置服务；
     - N14 的版本字段，是否改成动作声明（改合同）。
   - 并进 R2（共享核心集成分支）：
     - N13、N15、N16 要的 SDK 工具；
     - N17 删描述符，把 ⑤ 扩大；
     - N22 从 schema 推出处理器的输入类型。
   - 各包自己的小片，由主人按包排：N18 删死导出，N19、N20 删转发层，N23 到 N25。
   - 先问用户的：N16 的源码计数门禁。
11. **第五遍新增（第 18 节，用户 11-02 定版本收敛到初始、清理全部兼容）**：
   - §18.6 四件用户已定：产品版本复位到 0.1.0（删旧 release 与 tag 只能用户做，排期时先问）、阶段一不升版本、id 里不带版本、加「全是 1」的检查；
   - 合同一片并进 R2（共享核心集成分支）：N26～N29 与 N39 里核实过的字段；
   - 和真实 Home 重建同一时段：N30～N33、N36、N37；
   - 各包小片：N38、N40；
   - 最后改规则和门禁：N35、N41。
12. **第六遍新增（第 19 节，用户 11-02 要求减少无效调用与重复调用）**：
   - 宿主动作目录一片（枢纽文件，先查在途 PR）：N42 一次请求一份上下文，N43 嵌套调用共用发现，N44 少变的事实按版本读、Home 插件库连接长开，N46 插件 id 映射启动时建好；
   - 小片：N45 判断规则的连接状态订阅变更事件；
   - 工作台一片：N52 侧栏文件一条请求、没配好的来源不请求，N53 合并重复读、去掉必然失败的请求，N54 轮询看前台、拿到 404 就停；
   - 各包小片：N47 由插件运行时的主人定怎么改，N48～N51；
   - 第 1、2 片之后：N55 逐个看短缓存还要不要；
   - 先问用户的：N56 的调用预算门禁。

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
- **N8 #1727 本身（作者对旧头的复查意见，后继已修正）**：
  - `requestHash` 5 份逐字相同，都从 SDK 取 `canonicalJsonValue`。
  - `currentWorkspaceBranch` 与原来两份逐字相同，调的是同一个 `runWorkspaceGit`。
  - 删掉的三个函数在基线上全仓没有引用，也没从包入口导出；但这不能证明在途无消费者。统筹核实受保护 #1059 仍调用两个 Memory helper，#1727 已在 e181f302 中将两文件恢复为 base，不修改保护分支。
  - `controlTokenMatches` 只有一处行为变化：期望的令牌为空时，原来三份会放行空令牌，现在一律拒绝。`resolveWebControlToken` 只给 32～512 字符的令牌，测试里也没有空令牌，所以生产上等价、更严。
  - 变异检验：令牌比较变成「只要是字符串就放行」，S-03、S-04 的 6 条用例失败（HTTP 与三个 socket 都覆盖到）。
  - 旧头 36e432357 的 Verify 与 Full 后续通过，仅属于旧头；e181f302 的新头 CI/Full 与最终 §8 采用由统筹另核。

### 16.4 复查的局限

- 语言环境的影响只复现了排序差异，没有在宿主里实际换语言环境重启。
- N6 只抽查了 2 个 PR。
- 变异检验只做了 #1727 涉及的两处。
- 死代码的全文重搜看不到拼接出来的名字，与第一遍相同。

### 16.5 第三遍：对照代码重核（2026-11-02）

前两遍里有几项是按 PR 评论、条目正文或文档判的，没有到代码里看。这一遍把它们逐项改成对照 `e4e98ed33` 的代码。

**方法**

- **关闭未合并的 172 个 PR**：
  - 从 GitHub 取回每个 PR 的头提交（#974 的 PR 引用已不在，按提交号取）。
  - 每个 PR 的改动取自 `git diff <分叉点>..<头>`，去掉锁文件、门禁快照和生成文件，从中取两类证据：
    - 分叉点上没有的新增行（去掉首尾空白后至少 25 个字符）；
    - 分叉点上只出现一次的删除行。
  - 在 main 的第一父链上取几个时刻：关闭时、关闭后 1/3/7/14 天、基线。新增行要在、删除行要不在，取对得最好的那一刻；八成以上对得上算在 main 上。
  - 行比对看不出的，逐个文件试 `git apply -R --check`：能反向应用，就说明这份改动在那一刻的 main 上，纯搬移也能这样认出来。
  - 还看不出的，找评论里点名或同任务号、并且已合进 main 的另一个 PR。
- **BACKLOG 的 34 行**、**`privileges.md` 的 11 行「待做」**、**`EXTENSION-POINTS.md`** 与 **CALL-CHAINS §10.1**：逐行到基线代码里找正文说的东西。
- **例外台账**：分清哪几份有门禁双向对照代码（多一条、少一条都失败），哪几份没有。

**172 个关闭的 PR**（原写：66 个评论写明随批落地、84 个被批 PR 点名，其余按提交说明在 main 上找得到，只有 #1538、#1553 不在）

| 结果 | 个数 | 说明 |
| --- | --- | --- |
| 改动原样在 main 上 | 151 | 150 个的新增行与删除行八成以上对得上；#1129 的头与 main 上已有的内容相同 |
| 逐个文件反向应用都在 | 7 | 纯搬移，行比对看不出。例如 #1671 只挪了一段注释 |
| 大部分在，少数文件后来又改过 | 8 | #1178、#1249、#1251、#1252、#1263、#1273、#1305、#1552：多数文件能反向应用。抽看余下的 4 个文件，差别都是评审修正或后续删改，例如 #1305 的 BL-323 以另一种写法进了 `assistant-memory-tools.ts` |
| 重复认领，留下的另一个在 main 上 | 3 | #1557 → #1559、#1566 → #1565、#1630 → #1631 |
| 不在 main 上 | 3 | #1538、#1553：维护窗口脚本，10-30 定清空重建、不迁移之后不再需要。**#631**：统一输入与本地语音，+6,684 行，10-20 以「交互要重做」搁置；前两遍漏了它 |

**新发现**

- **N9 #631 的重做没人跟踪（P2，已证实）**：BACKLOG 和 specs 里都没有指向 #631、也没有「统一输入」「本地语音」的行。「这个 PR 要重做」只记在会话记忆里。建议并进 R8：开一行 BACKLOG，写明重做的范围和主人。
- **N10 `EXTENSION-POINTS.md` 有两处「现在」过时（P2，已证实）**：
  - 第 91 行写用户装不上插件、没有保存的信任根。batch-40（10-25）起，宿主已能预览、确认并安装签名的沙箱包，还会钉住发布者（`apps/local-host/src/plugin-install-service.ts`）。
  - F2 写宿主里还要改 2 处：项目库的 `version: 7` 和 `project-plugins.ts` 的 `codingPorts`。基线上版本是 1，`codingPorts` 已由 #938（10-21）删掉。
  - 舞台那一行还点名 `codingCompanionStages`、`codingWorkbenchPanel`，代码里已经没有这两个函数；后面补了 W5-06 的新做法，但前半句没删。
  - 文中引用的 146 个路径都在。文档引用门禁只查 `skills/`、`AGENTS.md` 和 CALL-CHAINS，不查这份。
  - 建议：R6 按代码改这三处；要不要把这份文档纳入引用门禁，先问用户。
- **N11 `privileges.md` 的「待做」行有的已做完（P2，已证实）**：
  - **做完了，仍写「待做」**：
    - PG-111 剩下的只有用户定的例外（Characters 留在平台、Alchemist 不迁）。`packages/contracts/src/modules/` 里的插件合同也只剩这两个。
    - PG-046 的「剩」写的是 BL-530，这一行已在 #1295（10-27）做完删掉；文档导入也不再写死来源。
  - **剩下的比写的少**：
    - PG-017：BL-490 已在 batch-37 删行，BL-493 已由 #1723 做了，只剩 BL-491、BL-492。
    - PG-060：`shell-page-renderer.ts` 已不调 `createGoalsPage`，只剩 `renderer.ts`。
    - PG-064：`page-view.ts` 只剩对 Goals、Feed 的类型 import，Schedule 的已删。
  - **出处列过时**：7 行（PG-045、046、060、078、093、094、111）引用的文件已删，或者行号超出了文件末尾。这些行的进展写在状态列里，出处列一直没跟着改。
  - **相符或判断不了**：PG-011、PG-070、PG-093、PG-094 的「剩」在代码里对得上；PG-045、PG-078 的剩余项从代码判断不了。

**BACKLOG 34 行**

- 23 行与代码相符，确实没做，例如：
  - BL-222：`timeline.ts` 读不到退出码仍落到「ok」；
  - BL-540：Coding 仍读 `process.uptime()`；
  - BL-398：关对话框时没有任何取消；
  - 9 行翻译余项：`src/en.ts` 的条数与正文逐个相等。
- 3 行与代码不符：
  - BL-493：已由 #1723 做了（N5）；
  - BL-375：成果类型这一半已做（安装、换版本、启用时拒绝第二个属主，S-82，`packages/plugin-runtime/src/install-rules.ts`），过程项那一半没做；
  - BL-137：Prologue 的修复 `e5123369` 已在现用 vendored 包的来源 `1cc80b05` 里（GitHub 比较：领先 154、落后 0），只差在 Molis 里复测。
- 8 行从代码判断不了：BL-320 用户验收；BL-319、BL-338、BL-303 浏览器矩阵；BL-339 收尾；BL-309 文档重核；BL-126、BL-096 是真实 Home 里的数据，10-30 清空重建后可能已不成立。

**例外台账**

- **有门禁对照代码**（多出或缺少的条目本身就失败，基线 CI 是绿的，所以与代码相符）：`APP_IMPORT_ALLOWLIST`、`PLUGIN_MODULE_IMPORT_ALLOWLIST`、`doc-citation-exceptions.json`、`table-owners.json`、`giant-exceptions.json`、构建期装配的冻结名单。
- **CALL-CHAINS §10.1**：22 条路由在代码里都找得到，其中 6 条按路径分段写。
- **没有门禁对照的**：`privileges.md`（N11）、`EXTENSION-POINTS.md`（N10）、BACKLOG（见上）。

**这一遍的局限**

- 行比对按整行。一行除缩进以外改过任何地方，就算没进 main。
- 只在上面那几个时刻取样，中间的时刻没看。
- 「后来又改过」那 8 个，没有逐处判断每个差别是修正还是丢了；只抽看了 4 个文件。
- 重复认领那 3 个，只核了留下的那个已合进 main，没有逐行比较两份实现。
- 「交 Codex 修复队列」的项仍只抽查了 2 个 PR（N6），这一遍没有扩大。

## 17. 第四遍：能下沉的平台能力、无谓的实现、过分谨慎与调用链（2026-11-02）

对象是 origin/main `2ec20d4fc`（含 #1731）。前三遍已报的不再重复：`isRecord`、schema 构造器、HTML 转义、`messageOf`、`requestHash`、规范化 JSON、`parseJson`（B2），6 个死导出与只在本文件用的导出（B5），插件骨架的克隆（B6），描述符的 `maturity`（B7）。这一遍看四件事：哪些逻辑该下沉成平台能力，哪些实现多余，哪些检查谨慎过了头，调用链里有多少层只是转发。

### 17.1 方法

- **语法树**（TypeScript 编译器 API；3,248 个产品源文件、35,990 个函数，不含测试、脚本、示例与 vendored 包）：
  - 函数克隆：逐字相同的，和只换了局部名字的（属性名保留，字符串与数字只认种类）；
  - 只转发的函数：函数体只有一次调用，实参正好是自己的形参；
  - 同名转发链：一个方法转给下一层的同名方法。
- **类型检查**（每个包用自己的 tsconfig 建程序，跨包类型读 `pnpm build` 产出的声明）：找类型已经决定了结果的检查，包括非空值上的 `?.` 与 `??`、结果恒定的 `typeof`、数组上的 `Array.isArray`、同类型的 `String()` / `Number()` / `Boolean()`、对象上的 `||` 默认值。
  - 有三类不算多余，已排除：
    - 下标读取：仓库没开 `noUncheckedIndexedAccess`，类型说有，实际可能没有；
    - `{}` 类型：它也包括字符串和数字；
    - 运行环境的功能探测：被查的名字声明在 lib 里。
  - 每条记下值从哪来：形参、`as` 强转、库行或 JSON、内部。
- **没人用的导出**：
  - 按标识符在全仓找别的文件里的出现，测试、脚本、示例和浏览器脚本模板里的字符串都算；只做再导出的行不算。
  - 剩下的，再到 346 个远端分支和 13 个开着的 PR 头里看它们改过的文件，有一处用到就不算。这是第二遍 N8 漏查在途分支之后补上的做法。
- **人工核实**：写「已证实」的都读过代码。类型检查的命中抽了 20 条读代码，估准确率。

### 17.2 可以下沉成平台能力的

**N12 文档类记录的同一套协议，四个插件各写了一份（P1，已证实）**

- Dataset、Form、Pages、PPT 的 store 各有下面这些，只换了表名和提示语：
  - **跨项目移动** `relocate`：读当前记录，有没存完的固定就拒，按版本 `UPDATE … SET project_id`，清掉成果引用（`plugins/native/dataset/src/store.ts:121`、`plugins/native/pages/src/store.ts:240`，Form、PPT 同样）。Lingguang 也有一份，一共五份。
  - **复制** `duplicate`：同一个请求返回同一份副本。加上 Coding，一共六份。
  - **固定到成果库的两段提交**：先存 `publication_pending_json`，发布成功后由 `completePublication` 比对意图，再写回成果号，一共四份。
  - **`normalizeProjectId`**：五份，意思相同（去空白、不许空、不超过 80）。
  - **其余**：升成 Goal 的 `promoteDataset` 与 `promoteForm` 只差名字（34 行），`createDatasetPlugin` 与 `createFormPlugin` 的 `start`（18 行）、`publishArtifact`（11 行）、搜索提供方也是；读正文的 `body` 有五份。
- 平台已经负责这几件事的另一半：
  - 跨分区移动由放置服务做，调用被拒时平台把对象移回原处（S-35）；
  - 发布由成果库做。
  - 每个插件再写一遍「存待定意图 → 发布 → 完成」，等于把平台协议的状态机抄进了插件自己的库。
- 建议：在 SDK 给一份文档记录工具（移动、复制、两段固定的 SQL 与校验，表名和提示语由插件给）；或者让成果库客户端按 `(artifact_id, version)` 幂等，插件不再自己存待定意图。归哪里要统筹定。可删约 300 行（推断）。

**N13 插件页面的工具包：18 份 `browser/dom.ts`、16 份 `browser/request.ts`（P2，已证实）**

- 18 个插件各有一份 `src/browser/dom.ts`，共 494 行；16 个有 `src/browser/request.ts`，共 412 行。
- 反复出现的函数：
  - `required(root, selector)`：14 份；
  - `messageOf`：12 份；
  - `statusOf`：4 份；
  - `isAbort`：2 份；
  - `textCell`：4 份；
  - 日期标签（`whenOf`、`formatTime`、`dateLabel`、`isoDay`）：6 份；
  - 动效（`EASE_*`、`arrive`、`settle`）：3 份。
- 18 份 `dom.ts` 没有一份 import SDK 的 `/ui`。SDK 已有的也再写一遍：
  - `escapeHtml` 已在 B2 报过；
  - Pages 的 `cutUnits`、`firstCharacters` 就是 SDK `whole-units` 的 `cutHead`、`cutCharacters`（`plugins/native/pages/src/browser/dom.ts:11`、`:22`）；
  - Jelly 和 Coding 的浏览器代码已经在用 SDK 的 `whole-units`，可见浏览器端 import 得到。
- 16 份 `request.ts` 包的都是同一个 `molisWorkRequest`，差别只在插件路由、兜底文案和错误码改写。
- Dataset 与 PPT 的页面几乎是同一份：`events.ts`、`status.ts`、`request.ts`、`dom.ts` 把插件名换掉后，只差 6–15 行。
- 建议：
  - SDK `/browser` 补上 `required`、`messageOf`、`statusOf`、`isAbort`、按界面语言出日期标签，再加一个 `pluginRequest(host, { fallback, codes })`；
  - 插件删掉自己的副本，可删约 600 行（推断）；
  - CALL-CHAINS 链 1 第 1 步写的「各插件客户端自带包装（W5-04 迁）」也就有了去处。

**N14 内核按一个提供方的能力名开了分支（P1，已证实）**

- `packages/kernel/src/version-precondition.ts:6` 认四个「读取时的版本」字段，各有不少文件在用：
  - `expected_version`：94 个文件；
  - `expected_revision`：64 个；
  - `expected_revisions`：4 个；
  - `expected_updated_at`：7 个。
- 第 15 行另加一条：能力名以 `functions.authoring.` 开头、又有 `updated_at` 字段的，也算版本字段。只有判断规则的编辑动作是这样（`modules/judgment-rules/src/authoring-actions.ts:36`）。
- 这是内核为一个提供方写的名单，与硬约束「能力注册一次……不另写名单或宿主分支」相反。
- 建议二选一：
  - 动作声明写出自己的版本字段（例如 `version_field`），内核只读声明。这要改合同，跑 `pnpm api:update` 与 `pnpm actions:update`。
  - 判断规则改用内核已认的 `expected_updated_at`。

**N15 时间与日期各写各的（P2，已证实）**

- **按时区取年月日时分**：三份，都是 `Intl.DateTimeFormat("en-US", { hourCycle: "h23", … }).formatToParts`。在 `apps/local-host/src/assistant/assistant-followups.ts:338`、`apps/local-host/src/assistant/assistant-usage-ledger.ts:38`、SDK `packages/plugin-sdk/src/card-values.ts:8`。
- **判断时区是否有效**：两份，都是试一次 `new Intl.DateTimeFormat("en", { timeZone })`。在 `plugins/native/coding/src/routes-cards.ts:13`、`plugins/native/jelly/src/calendar-validation.ts:36`。
- **显示用的语言**：至少 7 种取法：
  - 不传（跟操作系统）；
  - `[]`；
  - 写死 `"zh-CN"`；
  - 写死 `"en-US"`；
  - `document.documentElement.lang || "zh-CN"`；
  - `locale || "zh-CN"`；
  - 工作台 `apps/workbench/src/i18n.ts:67` 的 `dateTimeLocale()`。
- 用户看得到、又写死 `zh-CN` 的，有这几处：
  - 评审页 `apps/local-host/src/agent-review-http.ts:96`；
  - `apps/local-host/src/computer/computer-record-source.ts:37`；
  - `packages/im-ui/src/views.ts:16`、`:19`，这里连「今天」也写死了。
  - 英文界面下，这几处仍显示中文日期。
- 建议：SDK 给 `zonedParts`、`isTimeZone` 和按界面语言的日期格式化。界面语言的缺口按用户 10-21 的口径，记进字体皮肤语言书 §6.1。

**N16 截断加省略号没有共用函数，至少 14 处还会截出半个字（P2，已证实）**

- SDK `whole-units` 有 `cutHead`，没有「截断再加 …」，于是各处自己写 `clip`：12 种写法，分在 7 个包里。
- 防腐线已经一处处改成按整字截（T-183 到 T-353，几十个 PR）。带省略号的这一类，还有至少 14 处按 UTF-16 单元截；文字里有表情或生僻字时，会留下半个字：
  - `apps/local-host/src/assistant/assistant-present.ts:165`、`apps/local-host/src/project-arrival-http.ts:83`
  - `horizontal/agent-host/src/adapters/prologue-action-gateway.ts:402`、`horizontal/agent-host/src/adapters/prologue-stream.ts:170`、`:179`、`:185`
  - `modules/shelf/src/clipboard.ts:32`
  - `packages/plugin-sdk/src/action-cards.ts:125`（SDK 自己）
  - `plugins/native/alchemist/src/studio/shared/contracts/direction.ts:14`
  - `plugins/native/feed/src/projection.ts:86`
  - `plugins/native/goals/src/page/guidance-document.ts:47`
  - `plugins/native/coding/src/browser/taskboard-format.ts:6`、`plugins/native/coding/src/continuation.ts:39`、`plugins/native/coding/src/history-digest.ts:34`
- 建议：
  - `whole-units` 加一个 `cutWithEllipsis`，这 14 处改调它；
  - 把「`.slice(0, …)` 后面接 `…`」加进源码计数门禁，只许减少。改门禁先问用户。

### 17.3 多余、无谓的实现

**N17 33 个合同描述符整个没人用（P2，已证实）**

- B7 只说了 `maturity` 字段没人读。这一遍按名字查：35 个 `ContractDescriptor` 常量里，33 个在 main 和全部远端分支上都没有任何文件提到（228 行）。
- 其中 31 个所在的文件还有别的导出，删掉常量就行。
- 另外 2 个（`platform/kernel`、`platform/testing`）所在的文件只有这个描述符，而且有包把这两个子路径声明成自己的合同入口，所以要先改声明，或者留下。
- 建议：⑤ 从「删 `maturity` 字段」扩成「删没人用的描述符」，仍在 R2 那一片做。

**N18 另有 28 个导出没人用（P2，已证实）**

- 在 main 和全部远端分支上都没人用的导出值，一共 64 个（319 行），类型另有 42 个。扣掉 N17 的 33 个描述符，再扣掉 B5 已报的 `parseWorkspaceRef`、`workspaceScopeKey`、`calendarTitle`，新的有 28 个（约 70 行）：
  - Alchemist 的 14 个 zod 模式（`plugins/native/alchemist/src/studio/shared/contracts/*.ts`）；
  - `createWebQueryIntegrationPlugin`、`createYoutubeIntegrationPlugin`：集成改由 Home 登记以后，没有地方再调它们。`createRssIntegrationPlugin` 也一样，但 #1724、#1725 在用，所以不算；
  - Feed 的 `sourceKindOpensAttention`、`feedItemTypeForSource`；
  - 创作台的 `parseBuilderJson`、`BUILDER_PROJECT_PLUGIN_ID`；
  - contracts 的三个 `FUNCTIONS_*` 常量、`WORKSPACE_REF_SCHEMA_VERSION`、`WORKSPACE_SELECTED_EVENT`、`ASSISTANT_CONTEXT_ATTRIBUTE`、`PLACEMENT_SUBJECT_SCHEMA`；
  - 宿主的 `materialImageExtensions`。
- 另有 25 个在 main 上没人用、但某个开着的 PR 或远端分支在用，这次不算死代码，例如 `dispatchControl`、`oauthDeviceRequest`，以及各插件的 `*_HOME_STORE`。

**N19 只转发、什么也不做的层（P2，已证实）**

- 795 个函数的函数体，只是把实参原样交给另一个函数。其中 329 个是 `this.<部件>.<方法>(…)` 这样的一行转发，加上方法签名约 930 行。
- 最多的几个文件：

| 文件 | 转发的方法 | 转给 |
| --- | --- | --- |
| `modules/projects/src/index.ts` | 28 | `records`、`workspaces`、`deletionSteps` |
| `apps/local-host/src/project-catalog.ts` | 24 | 上一行的 `projects.query`、`projects.commands` 等 |
| `horizontal/memory/src/service.ts` | 18 | `preferences`、`learning`、`scopeCommands`、`promotions` |
| `modules/shelf/src/store.ts` | 17 | `admissions`、`copies`、`jobs`、`clipboard` |
| `modules/judgment-rules/src/service.ts` | 15 | `store` |
| `plugins/native/goals/src/goal-event-application.ts` | 15 | `ports.events`、`ports.events.state` |
| `plugins/native/goals/src/module/event-facts.ts` | 14 | 各个部件 |

- 能看出来的几处（Shelf、Memory、Goals），都是拆大类时留下的：类按职责拆成几个部件，原来的类留着整套方法，逐个转发。调用方不用改，但每次调用都多了一层。
- 另有一处只为转一个函数而存在的文件：`packages/kernel/src/whole-units.ts`，只再导出 SDK 的 `cutHead`。
- 还有三份转译函数什么也不做：`said = (L, text) => L(text)`，在 Files、Shelf、Workflows 的 `browser/dom.ts` 里，约 30 处调用。
- 建议：调用方直接拿部件（例如 `store.admissions.admitUrl(…)`），删掉转发方法。这和用户 10-25「巨大单元不硬拆」的意思一致：拆是为了分清职责，不是为了把门禁的数字压下去，再把整套方法拼回来。

**N20 调用链里纯转发的跳数（P1，已证实）**

- **Goals「记一个顾虑」**：五步里只有最后一步做事。
  1. 动作处理器：`plugins/native/goals/src/event-command-actions.ts:59`
  2. `GoalEventApplication.applyConcern`：`plugins/native/goals/src/goal-event-application.ts:288`，转发
  3. `GoalEventState.applyConcern`：`plugins/native/goals/src/module/event-state.ts:217`，转发
  4. `GoalEventStateEffects.applyConcern`：`plugins/native/goals/src/module/event-state-effects.ts:71`，转发
  5. `GoalEventConcerns.applyConcern`：`plugins/native/goals/src/module/event-state-concerns.ts:31`，真正做事
- 原来是四层转发：e75051931（T-112）删掉了 `GoalEventFacts` 那一层。提交说明说「门面不再转发十五个方法」，只对那一个类成立，剩下的三层还在。
- Goals 里，有 22 个方法以同一个名字逐层转发 2 到 3 层，其中 `applyConcern`、`setAgreement`、`listPolicyHistory`、`listWorkEventGoalLinks`、`eventCursor` 都是 3 层。整个包里只转发的函数有 120 个。
- **项目**：`catalog.getProject` 经过两层转发才到做事的那一层。
  1. `MolisWorkProjectCatalog.getProject`：`apps/local-host/src/project-catalog.ts:285`，转发
  2. `projects.query.getProject`：`modules/projects/src/index.ts:97`，转发
  3. `ProjectService.get`：`modules/projects/src/project-service.ts:45`，查找并报「找不到」
  4. 库
  - 同样两层转发的方法有 11 个，例如 `listProjectPlugins`、`addProjectPlugin`、`addWorkspaceProject`。宿主里有 13 处调 `catalog.getProject`。
- **宿主**：`MolisWorkLocalHost.closeProject` → `LocalHost.closeProject` → `line.closeProject`，前两层只转发。
- 建议：每条链只留下有自己判断的那几层。Goals 的动作处理器直接拿 `events.state`，宿主直接拿 `projects.query`。

### 17.4 过分谨慎

**N21 1,458 处检查的结果类型已经决定了（P2；数字已证实，准确率是抽样估计）**

- SDK 和 contracts 的公开函数另算（93 处）：作者可能用不带类型的 JS 调它们，那里的检查有理由。其余按种类：

| 检查 | 处数 | 值来自形参 | 值来自 `as` 强转 |
| --- | --- | --- | --- |
| 结果恒真的 `typeof` | 420 | 222 | 72 |
| 非空值上的 `?.` | 402 | 144 | 53 |
| 同类型的 `String()` / `Number()` / `Boolean()` | 253 | 79 | 34 |
| 非空值上的 `??` | 188 | 62 | 9 |
| 数组上的 `Array.isArray` | 118 | 53 | 27 |
| 对象上的 `||` 默认值 | 76 | 49 | 1 |
| 结果恒假的 `typeof` | 1 | 1 | 0 |

- 抽了 20 条读代码：
  - 8 条确实多余：值来自插件自己的有类型数据，或者是已经按 schema 校验过的输入；
  - 7 条检查是需要的，但值的声明类型是错的：值来自 iframe 的 postMessage、模型输出、外部进程输出或库里存的 JSON，却被声明成确定的类型；
  - 2 条是误报：浏览器 API 的功能探测，和 `??` 右边是下标读取；
  - 3 条判断不了。
- 所以这 1,458 处大致是两件事：约四成是可以删的重复检查；三成多是该保留的检查，但应该把值的类型改成 `unknown`、再解析一次。

**N22 内核已经按 schema 校验过，处理器又校验一遍（P2，已证实）**

- 内核在调用任何处理器之前，先按动作的 `input_schema` 校验输入，不转类型、不补默认值（`packages/kernel/src/action-service.ts:101`）。处理器和 store 仍逐字段再查一遍：
  - **Jelly 的 `selection`**：
    - schema 里，`selection` 必填，是 `{ block_ids, text }`：`block_ids` 是不重复的非空字符串数组，`text` 是字符串（`plugins/native/jelly/src/action-schema.ts:42`，`ids` 定义在第 11 行）。
    - `plugins/native/jelly/src/ai.ts:26` 又查 `Array.isArray(ids)`、`new Set(ids).size !== ids.length`、`typeof text !== "string"`。
    - 只有「至少一项」和「文字不全是空白」是 schema 里没写的，这两条应该写进 schema（`minItems`、`pattern`）。
  - **N12 的五份 `normalizeProjectId`**：查的是宿主给的或放置服务给的项目号，两者都已经核过。
  - **输入没有类型的处理器**（`input: Record<string, unknown>`）：只能再解析一遍。`text`、`required`、`optionalText`、`field` 这类读值函数，分别有 21、15、5、6 个包各写了一份。
- 建议：
  - SDK 从 schema 推出处理器的输入类型：schema 声明一次，处理器拿到的就是有类型的值；
  - schema 没写的约束补进 schema；
  - 然后删掉处理器里的重复检查。

**N23 先 `as` 再逐字段查，类型检查帮不上忙（P2，已证实）**

- 外来的值先用 `as T` 写成目标类型，再逐个字段 `typeof`。强转之后，类型检查认为这些检查都多余；漏查一个字段，它也不会报错。上表「来自 `as` 强转」一列一共 196 处。
- 例子：
  - `apps/local-host/src/assistant/assistant-service.ts:47`–`51`；
  - `apps/local-host/src/assistant/assistant-send-materials.ts:47`–`88`：先 `as AssistantMaterial`，再查 `typeof item.title`，然后对已经是字符串的字段调十几次 `String()`。
- 建议：边界上的值声明成 `unknown`，过一次解析函数拿到类型，之后不再查。解析函数用 N22 的 schema 校验器，或者一个小解析器都行。

**N24 页面再校验一遍宿主自己造的文档（P2，已证实）**

- `apps/workbench/src/agent-review-surface.ts:138`–`166` 的 `readable()`（约 25 行）把 `AgentReviewDocument` 的每个字段再查一遍。
- 这份文档是 agent-host 用有类型的代码造的（`horizontal/agent-host/src/adapters/prologue-approvals.ts:42`）。
- 按「读取时不兜底历史取值」的规则，库里不会有旧形状的文档，所以这段防的是一种已经不允许存在的情况。

**N25 每读写一次就校验整个工作区（P2，已证实）**

- Jelly 把一个 Home 的全部笔记和日历存成一行 JSON，每次读写都对整个工作区做全量检查：
  - 每次读这一行（`plugins/native/jelly/src/store.ts:17`）和每次写（`:79`），都把全部笔记、全部区块、全部日历重新校验一遍；
  - 每个日历命令还先 `structuredClone` 整个工作区（`plugins/native/jelly/src/calendar.ts:175`）。
- 导入和从历史恢复时整份校验是对的；平常读写，只需要校验改到的部分。照现在的写法，笔记越多，每一次操作越慢。

### 17.5 估算与局限

- **可删的量**（推断）：
  - N12 约 300 行；
  - N13 约 600 行；
  - N17 约 214 行；
  - N18 约 70 行；
  - N19 与 N20 的转发方法约 930 行；
  - N24 约 25 行。
  - 合计两千行上下。要新加的 SDK 工具约一两百行。
- **局限**：
  - 转发只认「一次调用、实参就是形参」，加了一点逻辑的转发没数在内。同名链按名字匹配，只报了逐个读过的那几条。
  - 类型检查只对能建程序的 tsconfig 做（浏览器脚本的模板字符串不在内）。值的来源按语法判断，`as` 写在别的函数里的看不出来。准确率只抽了 20 条。
  - 「没人用」按标识符找，同名的另一个东西被用到时，它也算被用到：这只会漏报，不会把在用的说成没用。
  - 没有跑任何用例。可删行数是读代码估的，不是删了再量的。
  - 另外两类数了、但没有单列成发现：
    - 425 个不 await 的 async 函数：多数是为了满足异步接口，算不上问题；
    - 166 个直接返回固定值的 `catch`：抽 10 个，7 个是解析不了就当没有，合理；3 个把动作调用的失败变成空值。其中 `assistant-round-materials.ts` 写明 `null` 就是「读不了」，调用方分得清；`horizontal/placement/src/index.ts:528` 返回的 `[]` 和「没有绑定」分不清，交主人看。

## 18. 第五遍：版本收敛到初始，清理全部兼容（2026-11-02）

**用户 2026-11-02 定**：这次防腐收尾之后，所有版本——库、代码、格式等——都收敛到初始；现在没有用户，不考虑兼容；所有兼容问题都清理并检查一遍。本节盘点还差什么，照旧只出报告，排期交统筹（§15 第 11 项）。

和已有决定的关系：

- 10-30 的「真实 Home 清空重建」已把各库与带版本的 JSON 合成第 1 版，删了旧维护脚本（[发布检查单](../releases/CHECKLIST.md) §3 的 41 个库全是 1，`node scripts/verify-release-versions.mjs` 通过）；
- [合同变更流程](../system/CONTRACT-CHANGES.md) 现在处在「阶段一，不留兼容期」；
- 用户 10-29 定「1.0.0 之前都是开发版本」。

这一遍把范围从库扩到全部带版本的东西，并查读取时兜底旧形状的代码。

对象是 origin/main `2a582a2e9`（2026-11-03 04:28Z，含 #1734）。

### 18.1 方法

- **数版本**：
  - 动作合同快照 `tooling/gates/actions/*.tsv` 的 942 行；
  - 23 个内置 Manifest 与沙箱插件的 Manifest 生成器；
  - 代码里的 `*VERSION = n` 常量；
  - 提示词与角色的 `version`；
  - 带 `vN` 的字符串标识：扫描 `apps`、`packages`、`plugins`、`horizontal`、`modules`、`server` 里引号中的标识，不含测试与 `dist`；
  - 发布物：根包、桌面端、GitHub 上的 release 与 tag。
- **找兼容**：
  - 健康门禁的兼容标记（`--report`）；
  - 注释里描述旧数据、旧格式、旧记录、「仍可读」「兜底」的 158 行（133 个文件）。逐条分开「旧数据兼容」与「时间上较早」（较早的提交、过期的读取），前者再读代码核实。
  - 扫描脚本放在本会话的临时目录（`scan-versioned-ids.py`、`scan-compat-comments.py`），没有入库。
- **结论分档同前**：「已证实」读过代码；「推断」只看了注释或类型。

### 18.2 已经在初始的，不用动

- **库**：发布检查单 §3 的 41 个库都是 1，与代码一致。
- **格式**：
  - 成果与过程项的 `schema_version` 都是 1（56 处），工作区引用、文件快照、选区、变更集、Git 结果也都是 1；
  - 密钥文件 `FORMAT_VERSION`、MCP 工具偏好、项目目录、Shelf 目录、插件包载荷、Gmail 游标，也都是 1。
- **对外名称**：MCP 工具名的 `molis_work_v1_` 前缀；307 个带 `v1` 的字符串标识。
- **SQL 夹具**：29 份全是现行第 1 版结构（`tests/fixtures/goal-event-history/README.md` 写明不含升级链）。

### 18.3 还不在初始的版本

**N26 插件 Manifest 两个格式版本并存（P1，已证实）**

- 合同 `packages/contracts/src/platform/plugin-manifest.ts:115`、`:131` 写成 `schema_version: 1 | 2`、`host_api_version: 1 | 2`；
- 校验认两种：`packages/plugin-sdk/src/manifest.ts:35`–`46` 认两种，应用类型只许 2，第 225 行报「需要 schema_version 2」；`packages/plugin-runtime/src/runtime-rules.ts:10` 同样认两种；
- 字段说明里有 18 处写「v2:」。
- 全部 23 个内置 Manifest、`apps/local-host/src/sandbox-plugin-manifest.ts:72`、`:104` 都写 2。文档与样例也写 2：`docs/platform/PLUGIN-DEVELOPMENT.md`、`skills/molis-plugin-dev/ui.md`、`examples/plugin-sample`、`examples/probe-plugin`。
- 建议：
  - 现行形状改称 1，类型收成字面量 1，删掉第 1 版的校验分支、「v2:」标注和「需要 2」的报错；
  - 同一改动里改文档、Skill、样例，跑 `pnpm api:update`；
  - 外部插件作者不受影响：还没有发布出去的插件。

**N27 95 个动作不在 @1（P1，已证实）**

- 快照 942 行，95 行在 1 以上：
  - Manifest 声明的 582 行里有 60 行：56 个 @2、3 个 @3、1 个 @8（`coding.runs.control`）；
  - 宿主另登记的 360 行里有 35 行：28 个 @2、6 个 @3、1 个 @4（`plugins.install.preview`）。
- 根因在规则：CONTRACT-CHANGES §3 第 3 条「有版本字段的合同，形状变了就升版本」在阶段一同样适用，`AGENTS.md`「动作合同快照」一条也照写。所以每改一次形状，版本就涨一次。
- 建议：
  - 全部回到 @1；
  - 代码里写死的 `version: 2` 跟着改，例如 `apps/local-host/src/assistant/assistant-rule-actions.ts:37`、`:72`，测试里的 `git.state@2`；
  - 跑 `pnpm actions:update`。
- Home 里存着的固定引用（工作流程步骤、Characters 草稿里的动作选择）随真实 Home 重建清掉；开发用的 Home 要一起重建。
- 不改第 3 条的话，复位后还会再涨，见 N35。

**N28 一个动作的两个「版本」其实是两个动作（P2，已证实）**

- `connectors.plugin_slot.read` 与 `.bind` 各有 @1 和 @2，同时登记（`apps/local-host/src/connector-plugin-slot-actions.ts:36`–`53`）。
- @1 按安装绑定，@2 按记录绑定：输入不同（多了 `record_key`），范围不同（`scope: "project"`）。这是两个动作，借用了版本号。
- 建议拆成两个 id，例如 `connectors.plugin_slot.record.read@1` 与 `.record.bind@1`。

**N29 能力 id 里又写了一遍版本（P2，已证实）**

- 56 个 `agent.*` 能力的 id 以 `.vN` 结尾，版本另记在 `@N`，同一件事写了两遍。
- 其中 9 个两处对不上：
  - `agent.run.read.v1@3`、`agent.run.wait.v1@3`、`agent.session.read.v1@3`；
  - `agent.run.start.v1@2`、`agent.runtimes.v1@2`、`agent.project-work.queue.v1@2`、`agent.subagents.list.v1@2`；
  - `agent.write_checkers.list.v1@2`、`.save.v1@2`。
- 另有 `agent.collaboration.revise.v2`、`agent.inputs.send.v3` 把版本写进了名字。
- 用户定 id 里不再带版本，只认 `@N`（§18.6 第 3 项）。这会改动作 id，连带 MCP 工具名、Skill 正文、工作流程绑定。

**N30 服务 id、密钥标签与密钥盐带旧版本或旧名（P2，已证实）**

- 服务 id：`io.molis.work.service.im.v2`（`packages/contracts/src/services/im.ts:115`）、`io.molis.work.service.memory.v2`（`packages/contracts/src/services/memory.ts:11`）。
- 密钥的命名空间与引用：
  - `feed-intent-v2`（`apps/local-host/src/search-intelligence-client.ts:39`）；
  - `system:feed:evidence-content-key:v1` 与 `:v2`（`packages/storage/src/adapters/evidence-content.ts:15`–`16`）。
- 密钥派生盐：`ENV_KEY_SALT = "goalboard-feed-secretstore-v1"`（`packages/storage/src/adapters/file-secret-store.ts:67`）。它就是健康门禁「旧名 1 处」那一处，注释写着改了会让既有密文读不出来。
- 建议全部改成 v1 和现在的名字。密钥引用和盐一改，已存的密文就读不了，所以只能和真实 Home 重建同一时段落（同 ④）。

**N31 提示词与角色版本（P2，已证实）**

- 77 处提示词与角色登记，41 处在 1 以上。最高的几个：
  - `assistant-base` 31（`apps/local-host/src/assistant/assistant-agent.ts:124`）；
  - `coding-base` 14（`plugins/native/coding/src/roles.ts:130`）；
  - `coding-coordinator` 7，`coding-writers` 6；
  - `coding-builder` 角色 5，`memory.extract` 4。
- 这些版本存进 Agent 定义库，也进运行记录。建议随重建复位到 1。
- 创作台的 `promptVersion` 记录与 `pnpm studio:replay` 语料若引用这些版本，要一起重做基线（推断，没逐份核对语料）。

**N32 记忆规则 v3（P2，已证实）**

- `horizontal/memory/src/policy.ts:6` 写 `MEMORY_GATE_VERSION = 3`；
- 它会显示给用户（「自动记住 · 规则 v3」），也写进每条自动记住的记录（`apps/local-host/src/memory/memory-runtime.ts:48`）；
- `horizontal/memory/README.md` 的「M2 来源绑定与规则 v3」一节跟着这个数。
- 建议复位到 1，随重建落。

**N33 安装清单 `SCHEMA_VERSION = 4`**（已有裁定 ④，main 上仍是 4，`apps/local-host/src/installer/home-contract.ts:9`）：照 §15 第 5 项。

**N34 产品版本与内置插件版本（用户定复位到 0.1.0，§18.6 第 1 项）**

- 现状：
  - 根包、桌面端、Tauri、`PRODUCT_VERSION` 与内置 Manifest 都是 `0.3.0`；
  - GitHub 上 v0.1.0～v0.2.0 已经公开发布（当时叫 GoalBoard），v0.3.0 是草稿；
  - 桌面端只在内置版本更新时才替换已装的运行时（`apps/desktop/adapters/tauri/src/web_service.rs:218`）。
- 复位到 0.1.0 会有两个后果：
  - 新版本号和已有的 tag `v0.1.0` 撞号；
  - 装过 0.3.0 的开发机不会自动换上新运行时。
- 用户定复位到 0.1.0，连带要做的见 §18.6 第 1 项。

**N35 不改规则，版本还会涨回去（P1，用户定阶段一不升，§18.6 第 2 项）**

- 三处一起推着改形状就升版本：
  - CONTRACT-CHANGES §3 第 3 条；
  - `AGENTS.md` 的「形状变了按 CONTRACT-CHANGES 升 `version`」；
  - 快照门禁会单独点出「同一版本下形状变了」。
- 复位到 1 之后照旧执行，到 M1 时又会是一堆 @2、@3。
- 建议阶段一在原版本上直接改形状，不升版本：
  - 快照门禁照样显示 schema 哈希变了，PR 里写影响；
  - 开发用 Home 里固定的旧引用，调用时按现行 schema 校验输入，会明确失败，不会悄悄当成新形状；
  - 从阶段二起点（第一个装到开发机之外的版本）起，恢复「形状变了就升版本」。
- 用户已定照这条做（§18.6 第 2 项）。

### 18.4 还留着的兼容代码

**N36 Feed 证据正文的 v1 密钥加 v2 恢复层（P1，已证实）**

- `packages/storage/src/adapters/evidence-content.ts:14`–`16` 为「既有引用与密文仍可读」保留 v1 的引用名，另加 v2 恢复密钥；
- 第 128–140 行：旧密钥对不上旧目录时，不覆盖原来的块，另在恢复目录用 v2 密钥重写一份，「不删历史密文」。
- 这是为迁移来的项目库写的读取兼容。重建之后只剩一把密钥、一个目录：恢复层、恢复目录和第二个密钥引用都可以删。

**N37 Feed 搜索意图换命名空间绕开旧账本（P1，已证实）**

- `apps/local-host/src/search-intelligence-client.ts:36`–`39` 写明：用 v2 命名空间，是为了不碰「旧的 v1 账本」——迁移来的项目库里有 v1 的控制状态，却没有对应的本机密钥。
- 重建后没有这种库。建议回到一个命名空间，删掉注释里描述的绕行。

**N38 读取时兜底旧行、旧记录、旧标记（P2，已证实）**

- **库与记录：**
  - `apps/local-host/src/model-provider-store.ts:92`：「这一列加上之前写的行」读成 `off`；
  - `apps/local-host/src/action-call-log.ts:154`：旧形状的行留到下一次重写才丢；
  - `horizontal/agent-host/src/adapters/prologue-review-documents.ts:281`：旧记录没有取消时间，按「已取消、无可恢复批准」恢复；
  - `apps/local-host/src/context-onboarding-service.ts:41`–`48`：认出「旧版存储」的整理记录，提示重新选择；
  - `apps/local-host/src/agent-definitions/agent-definitions.ts:98`：只有旧声明的提示词仍可编辑；
  - `apps/local-host/src/assistant/assistant-work-view.ts:10`：存储里旧版本写的键不进视图。
- **请求与页面：**
  - `apps/local-host/src/web-planning.ts:14`：给「旧的 HTTP 编辑器」剥掉多交的字段；
  - `apps/workbench/src/browser/characters/action-client.ts:31`：旧版 Characters 页面没有动作字段时的退路。
- **生成插件：**
  - `packages/design-system/src/plugin-component-client.ts:24`：旧构建的部件种类映射到组件目录；
  - `plugins/native/plugin-builder/src/agent-studio.ts:141`：旧名字映射到组件目录；
  - `plugins/native/plugin-builder/src/agent-presentation.ts:46`：「历史版面仍可读」。
- 建议逐条删掉兜底，只认现行形状。重建后这些旧东西都不存在。生成插件那三处，要等创作台与生成插件迁到 Plugin Runtime 后再删：迁的时候重新生成。

**N39 合同里为旧记录留的可选字段（P2，推断）**

- 注释写明某个字段可以缺，是因为旧记录没有：
  - 记忆：`packages/contracts/src/services/memory.ts:119`、`:663`；
  - 工作区成果：`packages/contracts/src/modules/workspace-artifacts.ts:141`、`:517`；
  - Agent 运行与启动：`packages/contracts/src/services/agent-host-run-view.ts:195`，`agent-host-start.ts:25`、`:75`；
  - Agent 输入与创作台：`agent-inputs.ts:179`、`agent-host-builder.ts:32`、`agent-host-memory.ts:93`；
  - 平台模块：`packages/contracts/src/modules/functions.ts:237`、`artifacts.ts:36`；
  - Goals：`plugins/native/goals/src/contract/governance-collaboration.ts:255`，存储里的历史项保留另一种记录形状；
  - 记忆服务与 Agent 适配器：`horizontal/memory/src/facts.ts:82`、`formation.ts:39`、`prefs.ts:25`，`horizontal/agent-host/src/adapters/prologue-questions.ts:4`、`prologue-session-index.ts:16`。
- 建议：
  - 先核写入方是不是每次都写这个字段；总写的，改成必填，删掉「缺了怎样」的分支；
  - 合同改动走共享核心集成分支，跑 `pnpm api:update`。
- 只看了注释和类型，没逐个核写入方，所以记「推断」。

**N40 为旧库保留的约束与旧称（P3，已证实）**

- **列顺序**：`plugins/native/{dataset,pages,ppt}/src/database.ts:5`、`plugins/native/form/src/database.ts:14`、`modules/judgment-rules/src/store-schema.ts:5` 要求列顺序与「已有的库」一致。重建后可以删掉这条约束。
- **名字里的旧称或旧版本**：
  - `DEMO_PROJECT_ID = "molis-work-v1-demo"`，注释写「旧示例保留它建时的 id」（`apps/local-host/src/demo-project-id.ts:1`）；
  - 色板的 `--blue*` 保留历史名字、实际是铜色（`packages/design-system/src/palette.ts:172`）；
  - `shell-page-renderer.ts:138` 的函数保留旧名；
  - `navigation-feed-stage.ts:389` 保留旧的开关钩子；
  - Coding Manifest 的注释「1.30–1.44 不迁移接着用」已过时（`plugins/native/coding/src/manifest.ts:55`）。
- **测试与夹具的名字**：`tests/action-read-compatibility.test.ts` 和 `tests/fixtures/goal-event-history/legacy.sql`，内容是现行结构，名字却写着兼容、旧版。
- 建议随各自的片改名。

**N41 兼容标记门禁量不到真正的兼容（P2，已证实）**

- 门禁数到的 8 处兼容标记（6 个文件）没有一处是读取兼容：
  - `pdfjs-dist/legacy` 的导入路径；
  - 一句翻译；
  - 一个 Goal 关系的显示文字；
  - 插件升级声明 `compatible_from_versions`。按 CONTRACT-CHANGES §3 第 7 条，升级声明是要保留的机制。
- N36～N40 的兼容代码一个词也不含。
- 建议：
  - 清理完以后，不靠数词，改成直接检查版本：阶段一里每个动作是 @1、Manifest 是 1、提示词与角色是 1、`*VERSION` 常量是 1；
  - 用户已定加这条检查（§18.6 第 4 项）。

**保留、不算兼容的**（CONTRACT-CHANGES §3 第 7 条）：

- `applySqliteBaseline` 按版本拒绝不符的库；
- 插件升级声明的机制；
- 固定引用失效时报错、不换成新版本；
- 桌面端「内置版本更新才替换」；
- 阶段二的读取兼容流程。

这些是起点之后要用的，只把它们里面为过去版本写的声明清掉。

### 18.5 怎么落

1. **§18.6 的四件已定**（11-02）。N35 的规则和复位同一批落，否则复位只管一时。
2. **合同一片（共享核心集成分支，一次全量）：**
   - N26 Manifest 收成 1；
   - N27 动作回到 @1；
   - N28 拆 id；
   - N29 去掉 id 里的版本；
   - N39 里核实过的必填字段；
   - 跑 `pnpm api:update`、`pnpm actions:update`；改文档、Skill、样例；
   - 在途改了动作版本的 PR，变基时一起改回 @1。
3. **和真实 Home 重建同一时段：**
   - N34 产品版本复位到 0.1.0；用户先删 GitHub 上旧的 release 与 tag；
   - N30 的密钥引用与盐、N31 的提示词与角色、N32 记忆规则、N33 安装清单；
   - N36、N37 删恢复层；
   - 开发用的 Home 一并重建。
4. **各包小片：** N38 的兜底分支、N40 的约束与改名。生成插件那三处等创作台迁到 Plugin Runtime（路线书 PBR）。
5. **最后：**
   - 改 CONTRACT-CHANGES §3 第 3 条与 `AGENTS.md` 那一句（N35）；
   - 门禁改成直接检查版本（N41）；
   - 在 HOME-DATA 与发布检查单里写明这是统一起点。

### 18.6 用户的决定（2026-11-02，弹窗）

1. **产品版本复位到 0.1.0（N34）。** 没选推荐的「保留 0.3.0」。连带要做的：
   - 先删掉 GitHub 上旧的 release 与 tag，否则新版本和 `v0.1.0` 撞号。这是对外、删了收不回的操作，只能用户做；统筹排期时先问用户；
   - 根包、桌面端（`tauri.conf.json`、`Cargo.toml`、`Cargo.lock`）、`PRODUCT_VERSION`、23 个内置 Manifest 一起改 0.1.0；
   - 跟着改的文档：`docs/releases/` 的 CHANGELOG、`v0.2.0.md`、`v0.3.0.md`，POLICY 与 CONTRACT-CHANGES §2 里的「下一版 0.3.0」；`node scripts/verify-release-versions.mjs` 要通过；
   - 装过 0.3.0 的开发机不会自动换上新运行时（`web_service.rs:218` 只在内置版本更新时替换），随真实 Home 重建手动重装。
2. **阶段一改形状不升版本（N35）。** 采纳推荐：复位到 1 以后，在原版本上直接改；从阶段二起点起，恢复「形状变了就升版本」。要改 CONTRACT-CHANGES §3 第 3 条、`AGENTS.md` 那一句，以及快照门禁的提示文字。
3. **能力 id 里不带版本，只认 `@N`（N29）。** 采纳推荐：56 个 `agent.*` 去掉末尾的 `.vN`，放在合同一片里，MCP 工具名、Skill 正文、工作流程绑定一次改完。
4. **加「阶段一全是 1」的直接检查（N41）。** 采纳推荐：动作 @1、Manifest 1、提示词与角色 1、`*VERSION` 常量 1，阶段一里不许出现别的数；替换兼容词计数。这条门禁的写法过评审后合入。

### 18.7 局限

- 带版本的标识只扫了引号里的字符串，拼出来的标识没扫到。
- 兼容只找了注释里写明的。没写注释的兜底，比如 `?? 旧字段`，没有系统地找。
- N39 只看了注释和类型；N31 的语料只是推断。
- 没有跑任何用例，没碰真实 Home。
- 浏览器脚本的模板字符串、Rust 与 Swift 只扫了注释。

## 19. 第六遍：无效调用与重复调用（2026-11-02）

**用户 2026-11-02 要求**：产品运行时和代码里，有没有引入无效的请求和调用。用户举的例子是 Codex 防腐检查里看到的：一个分栏页面请求触发了 1,789 次插件归属校验，逻辑没错，但大多是白做。用户补充说重点不在这个数，而在这一类问题：减少无效调用、减少重复调用，把产生它们的逻辑去掉。本节先盘点，照旧只出报告，整治排期交统筹（§15 第 12 项）。

对象是 origin/main `bdee612b9`（含 #1736）。

### 19.1 方法

- **运行时计数**：
  - 一次性的临时 Home：样例项目，`seedDemoGoals` 写入数据，项目级插件全部启用；
  - 宿主在同一进程里起，用 `createMolisWorkWebServer`，端口只绑回环；
  - V8 精确覆盖率，开了 `callCount`，按函数数调用次数。每个场景之前清零，场景之后读数，同时按路径数 HTTP 请求；
  - 场景一：用 curl 单独打每个接口；
  - 场景二：在内置浏览器里走首页、项目首页、Goals、打开右侧分栏、搜索，以及一个打开后不动的页面。
- **找调用方**：在热点行设条件断点。条件永远为假，所以从不停下，只记下带 async 帧的调用栈，再按调用链汇总。
- **静态扫描**：
  - `setInterval` 与 `setTimeout` 轮询；
  - 循环和 `.map` 回调里的请求、动作调用、发现与开库；
  - 每次读取都重开的库。
- **工具**：脚本放在本会话的临时目录（`call-harness.mjs`、`probe.sh`、`scan-fanout.py`），没有入库。跑完 Home 即删，没碰真实 Home。
- **数字怎么读**：
  - 下文的数字是这台开发机、这份样例项目里的；插件与动作越多，数字越大；
  - 覆盖率计数会拖慢执行，所以耗时只看相对大小；
  - 好几个接口有几秒的短缓存（见 N55），所以「未命中缓存」那次才是真实成本，表里标明了。

先给一张总表，后面逐条说。表里的「归属判断」指插件归属判断，就是用户说的那类校验，在代码里是 `reachEntry`；「全量判断」是对全部动作逐个算一遍可用性。

| 场景 | HTTP 请求 | 归属判断 | 可用性判断 | 重开连接库 | 重开 Home 插件库 |
| --- | --- | --- | --- | --- | --- |
| 打开右侧分栏（文件面） | 15（其中 `side/files/entries` 9 条） | 19,892 | 58,043 | 305 | 253 |
| 进入项目首页 | 25 | 13,440 | 42,510 | 233 | 261 |
| 打开 Goals | 8 | 8,894 | 26,647 | 170 | 162 |
| 页面打开后不动 20 秒 | 0 | 4,670 | 13,407 | 85 | 70 |
| 单个 `/api/projects/<id>/brief`（未命中缓存） | 1 | 2,194 | 6,082 | 25 | 约 30 |
| 单个 `/api/board/momentum`（未命中缓存） | 1 | 2,663 | 8,309 | 61 | 69 |
| 单个缺参数、返回 404 的 `side/files/entries` | 1 | 1,012 | 2,952 | 15 | 9 |
| 单个 `/api/board/cursor` | 1 | 0 | 0 | 0 | 0 |

最后一行是对照：不经动作目录的接口，一次请求只要约 1 毫秒。凡是要先建调用上下文的，一次至少 25 毫秒；未命中缓存的 brief 要 150 毫秒，momentum 要 215 毫秒。

### 19.2 服务端：一次请求做了多少遍

**N42 每个请求都把调用上下文从头建一遍（P1，已证实）**

- `apps/local-host/src/local-web-actions.ts:13` 的 `localWebActionContext` 有 28 处调用，网页、助理、搜索、记忆、设置都有；
- 每调一次：
  - 对全部动作做一遍带可用性的检查（`host.inspectActions`，第 22 行），只为算出调用方的 `allowed_actions` 和权限；
  - 再做一遍场景发现（第 56 行）；
- 授权名单本来不需要可用性：可用性在真正调用时还会按被调的那个动作再判一遍；
- 路由在校验参数之前就先建上下文：
  - `side-files-http.ts:53` 先建上下文，第 55 行再做一遍全量发现，然后才看 `source` 参数；
  - 所以一个缺参数、返回 404 的请求，也要花 1,012 次归属判断。
- 同一个请求里的嵌套调用，又各自建上下文。brief 一次请求里，带可用性的全量检查跑了 4 遍：
  - 建网页调用方的上下文 1 遍；
  - `home-event-actions.ts` 的 `collect` 里 2 遍；
  - `local-host-scenes.ts` 的 `usages` 里 1 遍。

**N43 一次请求里反复做全量发现（P1，已证实）**

- 未命中缓存时，内核的全量发现次数如下（都是一次请求）：

  | 请求 | 动作发现 | 场景发现 | 绑定列表 |
  | --- | --- | --- | --- |
  | brief | 4 | 6 | 20 |
  | momentum | 12 | 20 | 28 |

- `HostAvailability.views`（`local-host-availability.ts:24`）在一遍发现之内共用依赖目录，这一点做对了；但一遍发现结束就丢掉，下一个嵌套调用从头再来；
- 依赖查找是在数组上逐个 `find`（第 44、69 行），一个 brief 里约 3.4 万次。

**N44 每次调用动作都重读项目目录、重开 Home 插件库并核对整库结构（P1，已证实）**

- 调用时的可用性策略 `projectActionAvailability` 的 `live`（`project-action-availability.ts:75`）：
  - 每判一个动作，就走一遍 `withCatalog` 和 `projectReachablePlugins`；
  - 往下的 `alwaysOnCatalogEntries`（`always-on-plugins.ts:34`）每次都调 `openReadOnlyHomePluginStore`（`home-plugin-store.ts:45`）：先 `lstat`，再开 SQLite 连接，读 `user_version`，再用 `describeSqliteSchema` 对每张表跑 `PRAGMA table_info`、`foreign_key_list`、`index_list`，最后整串比较结构；
- `ensureProjectPlugins`（`project-plugins.ts:107`）在已经启动的项目上，每次调用都 `refreshEnablement`，又是一遍目录读和 Home 插件库开关；
- `withCatalog`（`web-catalog-access.ts:36`）每次都跑 `assertCurrentSchema`，前后各一次 `listProjects`；
- 一个 momentum 请求：Home 插件库开了 69 次，目录结构核对 68 次；
- 项目里启用了哪些插件、Home 装了哪些常驻插件，一天也变不了几次。这类事实应该按版本号或变更通知读一次，而不是每次判断都开库。

**N45 判断规则的可用性每次都重开连接库（P1，已证实）**

- `modules/judgment-rules/src/actions.ts:85`、`:92`、`:96` 的可用性判断调 `credentialAvailable()`；
- 往下走 `functionsCredentialConfigured`（`judgment-rules-host.ts:71`）、`selectedTypeSafeConnection`（`typesafe-connection.ts:8`）、`withConnectorConnections`、`openConnectorsStore`；
- 每次都新开连接库，并按基线核对整库结构（`packages/storage/src/sqlite-baseline.ts:172` 的 `describeSqliteSchema`，逐表 PRAGMA），只为知道「有没有配好判断模型的连接」；
- 进项目首页一次开了 233 次。连接换了会发 `connection-change-events`，可以只在收到事件时读一次。

**N46 插件归属判断逐个线性查找（P2，已证实；就是用户说的那类）**

- `reachEntry`（`project-action-availability.ts:39`）每次都在 `PLATFORM_PLUGIN_REGISTRATIONS` 上 `find`，找不到再读一次 `homePluginsOutsideBuild`；
- 调用时走 `live`，它和下面的 `state` 各算一遍 `entryOf`（第 61 行），同一个动作的同一次判断要查两遍；
- 一个 brief 是 2,194 次判断、25,579 次比较；
- 每次判断本身不贵，贵在被 N42、N43 乘上去了：一次分栏打开近 2 万次；
- 插件 id 到登记的映射，进程启动时就能建好。

**N47 每次插件回调都复制整份 `allowed_actions`（P2，已证实；改不改要主人定）**

- `pluginCallbackContext`（`packages/plugin-runtime/src/callback-context.ts:4`）把调用方的 `allowed_actions` 逐条复制一份交给插件，几百条；
- 一个 brief 里插件可用性回调 1,502 次，复制了 246,888 个对象；
- `local-host-caller.ts:5` 的 `snapshotCaller` 每个嵌套调用也复制一份；
- 复制是为了让插件改自己那份不影响宿主（注释写明），这个目的要留；
- 可以改成交一份冻结的共享数组，或者在插件真读这个字段时再复制，由插件运行时的主人定。

**N48 页面不动时，后台还在做全量发现（P2，已证实）**

- 页面打开后 20 秒里没有一条 HTTP 请求，宿主仍然做了 13,407 次可用性判断、4,670 次归属判断，开了 85 次连接库；
- 调用栈落在：
  - 搜索重建索引 `SearchService.refreshKnown`（`horizontal/search/src/index.ts:448`）：任何命令动作成功后（`project-host.ts:141`）去抖触发，每个提供方先全量发现一遍，再为每个索引器建一遍调用上下文（`search-actions.ts` 的 `indexer` 经 `localWebActionContext`）；
  - 资料的 `settle`（`knowledge-actions.ts`）；
  - 插件动作客户端的 `discover`（`plugin-actions-client.ts`）。
- 所以一个命令成功之后，即使没人再看，宿主也会把它所在提供方的索引从全量发现开始重建一遍。

**N49 Inbox 读判断时，每一项都重新发现场景（P2，已证实）**

- `plugins/native/inbox/src/scene-runtime.ts:124` 的 `readJudgment` 每读一项，都经 `apps/local-host/src/plugin-scene-service.ts` 的 `call` 走到 `discoverScenes`（第 63、67、71 行各一处）；
- 一个 momentum 里这条链发现场景 4 次；`scene-runtime.ts:127` 对每个判断动作循环，`feed/src/scene-runtime.ts:81` 同样逐个；
- 场景列表在一次读里不会变。

**N50 冷启动时同一份 Manifest 的摘要算三遍（P2，已证实）**

- 第一次打开项目时共算了 80 次 `pluginManifestDigest`（`packages/plugin-runtime/src/identity.ts:5`），其中写安装记录 24 次；第一个 `GET /` 里 `canonicalJson` 递归了 31 万次；
- 算的地方：`installRecord`、`persistReleaseArtifact`（启动与 `#resolveInstalledEntry` 各一次）、`createPluginRuntimeReleaseArtifact`、`validateArtifact`；
- 同一个 Manifest 对象的摘要，按对象记一次就够。

**N51 画首页时逐个插件建视图注册表（P2，已证实）**

- `apps/workbench/src/plugin-catalog.ts:143` 对目录里的每个插件，各建一个只含它自己的 `UiViewRegistry`，再取 `slot`；
- 一次 `GET /` 建了 115 个；
- 只建一个注册表，按插件分组就可以。

### 19.3 页面：多发的、发了就错的请求

**N52 侧栏文件按来源逐条请求，其中一条每次都是 409（P1，已证实）**

- 打开分栏的文件面：`side-panel-files.ts:218` 对每个来源各发一条 `side/files/entries`，共 9 条；
- 每一条在服务端都要建调用上下文、做全量发现（N42），一次打开就是 19,892 次归属判断；
- `placement.ts:380` 对来源又循环请求一遍；
- 「文件」来源（`io.molis.work.files|files.side.entries|1`）在没选工作目录时每次都返回 409 `files.invalid`；`sources` 照样把它列出来，页面照样去请求；
- 可以改成一条请求取回所有来源的第一页，在服务端共用一份上下文；没配好的来源在 `sources` 里就标出状态，不去请求它的条目。

**N53 页面加载时重复读、发了必然失败的请求（P2，已证实）**

- 项目选择页一次加载里，`assistant/works` 读 4 次，`attention` 读 3 次；
  - `attention` 在 `attention.ts` 的启动、插件栏点击、可见性变化、`molis-work:attention-refresh` 事件里各读一次；
  - `assistant/works` 在 `assistant-island.ts:576`、`:607`、`:733` 等处各读一次；
  - 同时在途的读没有合并。
- 项目选择页每次加载都请求 `/api/contextual/surfaces`，还没选项目，所以必然 400「请先选择一个 Molis Work 项目」。调用方是 `context-actions.ts:125` 和 `plugin-frame/subjects.ts:9`；
- `favicon.ico` 每页 404 三次；
- 项目首页加载时，侧栏的插件框架先 `POST /api/host/plugin-pages` 登记，又马上 `DELETE`（`plugin-frame/parent.ts:80`、`:109`）：框架挂上就卸掉；
- `molis-work-workbench.css` 一次加载请求两次，第二次 304。

**N54 轮询不看页面在不在前台，也不因 404 停（P2，已证实）**

- `attention.ts:96` 是 `setInterval(read, 15000)`：没有 `document.hidden` 判断，失败也不停、不退避；
- 实测：原来那个项目没了以后，旧标签页一直在轮询它的 `attention`，连续拿到 404 和连接被拒；
- 其他轮询的情况：
  - `assistant-island.ts:610` 与 `project-home.ts:373` 看了 `document.hidden`；
  - `capsule-shell.ts:517` 每 2.5 秒刷新一次，没有看；
  - `todo/src/browser/events.ts:109` 看了；
  - `refresh-decisions.ts` 的 `board/cursor` 打开 Goals 时 6 秒读了 4 次。它本身很便宜（约 1 毫秒），可以留着；
- 宿主已经有推送通道：插件框架的事件流 `plugin-frame/events.ts`，服务端有 `server/src/events.ts`。外壳上的提醒、助理工作、看板游标却各自轮询。

### 19.4 被缓存盖住的，和缺的门禁

**N55 几秒的短缓存把浪费盖住了（P2，推断）**

- `project-arrival-http.ts:33` 的 `BRIEF_TTL_MS = 5_000`，`contextual-http.ts:52` 的 `DIRECTORY_TTL_MS = 3_000`，助理的 `surface-kinds` 也是第二次请求就几乎不花；
- 缓存期内看着很快，过期那一次照旧做满（brief 2,194 次归属判断）；
- 这些缓存像是为了压住 N42～N45 的成本才加的；根因修好以后，逐个看还要不要留，留下的写明它防的是什么。

**N56 没有门禁挡「调用变多」（P2，要用户定）**

- 已有的门禁数文件、行数、字节数、兼容词，不数一次请求做了多少事；
- N42～N54 都是逻辑上没错、只是多做的，测试不会红；
- 可以加一份「调用预算」用例：在临时 Home 里打几个代表性请求，数全量发现次数、开库次数、归属判断次数，只许变少，口径与现有的结构数字一样；
- 这是新门禁，按 `AGENTS.md` 要先问用户。

### 19.5 怎么落

整治的原则：

- **一次请求一份上下文**：只在路由真要调动作时才建，嵌套调用共用；
- **授权和可用性分开**：建授权名单不算可用性，可用性只对真被调的那个动作算；
- **少变的事实读一次**：项目启用了哪些插件、Home 装了哪些常驻插件、判断模型的连接配没配，按版本号或变更通知读，不在每次判断时开库；只读的 Home 库连接长开，结构在打开时核对一次；
- **页面一个面一条请求**：同时在途的读合并；没配好的不请求；不在前台就不轮询；拿到 404 就停。

按依赖排的顺序：

1. **N42、N43、N44、N46（宿主的动作目录，一片）**：
   - 一次请求只建一份调用上下文；
   - 嵌套调用沿用同一遍发现；
   - 插件 id 到登记的映射在启动时建好；
   - 项目的可达插件按目录版本读，Home 插件库的连接长开。
   - 这一片动的是宿主枢纽文件（`local-host-availability.ts`、`project-action-availability.ts`、`local-web-actions.ts`、`project-plugins.ts`），要先查在途 PR，按 `PARALLEL-DEVELOPMENT.md` 排；改完跑安全不变量（`pnpm test:security`）和动作合同快照。
2. **N45**：判断规则的连接状态订阅 `connection-change-events`。
3. **N52、N53、N54（工作台，一片）**：
   - 侧栏文件一条请求取全部来源；
   - 选项目之前不请求 `contextual/surfaces`；
   - 同时在途的读合并；
   - 轮询看 `document.hidden`，拿到 404 就停；
   - 侧栏框架不再挂上就卸；补 favicon。
4. **N47、N48、N49、N50、N51（各包小片）**：
   - N47 由插件运行时的主人定怎么改；
   - N48 让重建索引只建一次上下文，只重建真改了内容的提供方；
   - 其余三条是本包的局部改动。
5. **N55**：在第 1、2 片之后逐个看短缓存还要不要。
6. **N56**：先问用户，同意后和第 1 片同一个 PR 加，先记下当前数字作为基线。

### 19.6 局限

- 只走了首页、项目首页、Goals、右侧分栏的文件面、搜索，以及一个不动的页面。
- 下面这些都没走：
  - 助理发一轮（要模型）；
  - Coding、Feed、Inbox、Pages 各自的页面；
  - 插件安装与升级；
  - 桌面壳。
- 数字来自一份样例项目；真实 Home 的插件和数据更多，数字只会更大，没有在真实 Home 上测。
- 静态扫描只看循环行和后面几行，误报不少，表里只收了运行时证实的。
- 没有跑任何用例；没改产品代码、门禁、测试和真实 Home。
