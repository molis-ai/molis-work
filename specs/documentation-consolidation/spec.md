# 文档状态、索引与事实来源收口

状态：执行中（2026-11-13；P0 已完成，P1 主体完成，P2 主体完成；工作线仍保留两份 spec）。2026-11-13 对 `origin/main` `b819373250` 做了文档现状审计，本文记录审计结论、收口需求与执行顺序；P0 已做状态修正、已完成 spec 归档和批次记录回填，不改变产品代码、合同或库结构；P1/P2 按用户 2026-11-13 的指示加文档门禁。

## 背景与审计结论

审计范围：74 个在册 spec（66 个「在做的」+ 8 份现行规范）、500 个统一待办条目、2,436 份 Markdown、68 个工作区包，以及最近 60 个提交相关 PR。文档的 `doc-links`、`doc-citations`、`spec-index`、`doc-raw-data` 四项门禁通过；`check-spec-coverage` 仍是报告模式。门禁保证链接和索引结构，不保证状态、编号引用与跨文档事实一致。

已确认的问题：

1. **状态漂移。** `specs/post-anticorruption-roadmap/spec.md` 顶部仍写「01 已核准，其余批次尚未启动」，但 main 上至少 18 个批次已有合入记录，当前 HEAD 就是第 15 批 #2017（`b819373250`）。5 份 daily-quality、draft-and-return、feed-bounded-reads 已合入，状态句和 `specs/README` 仍写实施中/没有实现；第 15 批三份 spec 和 work-brief 也没有跟上 #2017。
2. **索引混装。** `specs/README` 的「在做的」把已交付、执行中、未开工三类混在一起，摘要与 spec 状态句互相矛盾；`specs/README` 还有三处硬事实错误（unified-account 提交号、unified-input 漏 #2016、sqlite 把 SQLD-b 算进 #1979）。
3. **BL 形式收口、实质没有。** `specs/BACKLOG.md` 九节基本为空，500 条没有可读索引；146 个被引用编号在 main 没有文件；Memory P0 的 BL-1071～1077 只在 #2020 分支；第 27 批删除的 24 个编号仍有 223 处引用；至少 11 条以已删除的 `src/en.ts` 为对象。
4. **同一事实多份副本。** 平台产品服务有 4/5/6 三种清单；包数有 10/12 和 8/9；contracts 子路径 63/75；`RUNTIME-MIGRATION` 的「现在」整表过期；终端目录仍有「首选工作区」的旧说法。
5. **结构缺索引。** `specs/archive/` 有 379 份 spec 但没有 README；`docs/reviews/` 的 17 份评审和 17 份日评没有索引；`docs/qa/` 只有 36 张历史截图；`docs/decisions/` 只有 1 份 ADR。
6. **当前工作树落后。** 审计开始时工作树落后 main 60 个提交，本地 `AGENTS.md` 还是 78 行/33.9 KB 的旧版，main 已精简为 64 行/9.1 KB；本地 `specs/README` 69 项、backlog 427 条，main 是 74 项、500 条。文档改动应先同步 main，避免在旧行号上改。

### 关键冲突样例（P1 处理）

| 事实 | 位置 | 冲突 |
| --- | --- | --- |
| 平台产品服务 | `PRODUCT.md:36`、`docs/system/ARCHITECTURE.md:46`、`docs/SSOT-MATRIX.md:35/134`、`docs/horizontal/README.md:14` | 四份清单分别 4/5/4/5+1 项，成员不一致 |
| Governance 归属 | `PRODUCT.md:21/33/105`、`docs/system/ARCHITECTURE.md:82` | PRODUCT 当独立 owner；ARCHITECTURE 说它是 Goals 内部职责 |
| contracts 子路径 | `docs/SSOT-MATRIX.md:81`、`packages/contracts/package.json` | 63 个 subpath + 根 对 75 个 exports key（74 subpath + 根） |
| 包数 | `docs/SSOT-MATRIX.md:134`、`docs/horizontal/README.md:3`、`docs/modules/README.md:17` | 10/10/8 对实际 12/12/9；缺 kit、surfaces、sync-replication，仍写旧名 Functions |
| 装配「现在」 | `docs/system/RUNTIME-MIGRATION.md:11/47/90/269-274` | 目录 25/23、RUNTIME_ASSEMBLED 12/16、插件命名 actions 15/0、registerProvider 16/3；例外 2/4/已取消三种说法 |
| 终端目录 | `docs/platform/PLUGIN-DEVELOPMENT.md:154`、`skills/molis-plugin-dev/host.md:65`、`docs/platform/PROJECT-SETTINGS.md:3`、`skills/molis-plugin-dev/elements.md:188` | 前者说没写 `workspace_id` 用「首选工作区」；后者说没有首选、默认输出 |
| typed / 混合插件 | `docs/platform/LOCAL-HOST.md:7`、`docs/system/PACKAGE-BOUNDARIES.md:191`、`docs/system/RUNTIME-MIGRATION.md:90`、`tests/builtin-plugin-assembly-gate.test.ts:175` | typed 说仍在注册/已为 0；混合名单分别 shelf/coding/git、Coding、goals |
| PRODUCT 的 Session | `PRODUCT.md:162`、`PRODUCT.md:136` | 仍写 Session 添加/编辑；同文说 Sessions 插件 2026-10-23 下线 |
| SSOT 自身 | `docs/SSOT-MATRIX.md:134/136/138/241` | agent-host 保存三类/两类；观测采集段整段重复 |
| 权威指针 | `docs/SSOT-MATRIX.md:30/31`、`AGENTS.md:11`、`docs/system/PACKAGE-BOUNDARIES.md:225` | SSOT 把现行包清单/兼容机制指向已归档防腐 spec；AGENTS 指向 PACKAGE-BOUNDARIES 与 CONTRACT-CHANGES |

## 目标

- 每项事实只有一个权威来源；状态、索引和事实不再各写一份。
- 已完成的 spec 按 `specs/README` 规则归档或转为现行规范；剩余项进统一待办。
- 路线书、批次记录、`specs/README` 与 PR/合入事实一致。
- BL 保留「一项一文件」，但补上可读索引、编号墓碑和类型约束。
- 文档结构可维护：索引可生成或低成本维护，历史材料有入口。

## 非目标

- 本轮不改产品代码、动作合同、库结构、版本号或页面资源；CI 门禁只加用户 2026-11-13 批准的三项文档检查（`backlog-rows` 类型、`backlog-refs`、`doc-indexes`）。
- 不重写 500 条 BL 的需求内容；只做状态、编号、索引、失效引用和已失去对象的条目。
- 不把归档材料重新解释成当前规则。
- 不合并或删除仍有现行规则价值的 spec 正文；需要保留的合同稿先转现行规范或留原地。

## P0：状态修正与已完成 spec 收口

| 项 | 内容 | 完成标志 |
| --- | --- | --- |
| P0-1 | 新建本文，记录审计结论、P0/P1/P2 与验收 | 本文存在并进入 `specs/README` 索引 |
| P0-2 | 重写路线书顶部状态与当前入口；修 `specs/README` 的路线书摘要 | 两处都写明 01 已交单、02～27 多批已合入、最近合入与实时入口 |
| P0-3 | 修 6 份已完成 daily-quality/feed spec 的状态与 README 摘要；无剩余项的归档 | spec 状态、README、归档块、链接一致；门禁通过 |
| P0-4 | 修 draft-and-return、work-brief、第 15 批三份 spec 和 `specs/README` 的进度摘要；feed-bounded-reads 因 #2045 补修保留在「在做的」 | 已合入写「已合入 main + PR/提交/日期」，部分实现写清剩余 |
| P0-5 | 回填批次 15/22/27 的合入记录 | 三份批次文件有合入 PR、提交号与日期；未结算项写明去向 |
| P0-6 | 修 `specs/README` 的三处硬事实错误 | unified-account、unified-input、sqlite 三处与 spec/PR 一致 |
| P0-7 | 跑文档门禁与覆盖率检查 | `doc-links`、`doc-citations`、`spec-index`、`doc-raw-data` 通过；无断链 |

### P0 具体范围

- 归档（无剩余项）：`daily-quality-d0002`、`daily-quality-d0071`、`daily-quality-d0039`、`daily-quality-d0244`、`daily-quality-d0038`。五份对应 #1970/#1972/#1971/#1974/#1982；D0038 的 WAS-08 由 2026-11-08 真实 Tauri 探针覆盖，未操作真实账号/Home。Feed 有界读取因 #2045 补修未归档，保留在「在做的」。
- 更新不归档：`draft-and-return`（#1952 已合入；DRT-21 实操/本人验收仍在）、`work-brief`（基础首页随 #2017 已实现，Work Brief 本体未实现）、`intelligent-surfaces`、`shared-sources-and-surfaces`、`surface-composition`（第一片随 #2017 合入；后续片/验收待）。
- 批次记录：15 批补 `b819373250`；22 批补 `58af6ece64`；27 批补 `539d2d7d46`，并保留 `BL-batch27-acceptance` 的验收余项。
- 硬错误：unified-account 改为 #2013/#2021/#2025 的实际合入提交；unified-input 补 #2016；sqlite 改为 SQLD-a/c/d/e 随 #1979、SQLD-b 随 #1917。

## P1：BL 清账与事实来源对齐

- `backlog-rows.mjs` 增加 `--index`（分组、计数、一行一条、筛选）；`BACKLOG.md` 头部显示总数。
- 解决 BL-1071 编号复用；BL-1071～1077 随 #2020 带入 main 或明确「只在 #2020 分支」；1076/1077 写墓碑。
- 修 `BACKLOG.md` 的 Memory 暂停表述；清 BL-928、BL-376、第 27 批 24 个编号在现行文档里的失效引用；缺失编号已列 [墓碑速查](../../docs/backlog-removed.md)（2026-11-13 为 171 个）；11 条 `src/en.ts` 遗留 BL 已合并为 [BL-b16-server-text-residue](../backlog/BL-b16-server-text-residue.md)。
- 类型归一（47 种取值/91 条非标准）并考虑加 type 门禁；门禁变更需用户批准。
- 平台产品服务、Governance 归属、包数/子路径数、`RUNTIME-MIGRATION` 的「现在」表、终端 preferred workspace、typed/hybrid 表述统一。
- PRODUCT 的 Session 段落、发布说明计数、product-operations 的 11-04 基线。

## P2：结构与长期维护（待结构决策）

- 补 `specs/archive/README.md`、`docs/reviews/README.md`、`docs/qa/README.md`。
- 合并/收拢同类 spec：personal sync 族、prologue strategy 族、context 族、work-mainline/work-line。
- 拆分 `RUNTIME-MIGRATION.md` 的历史层与现行层；把一次性迁移记录移到归档或附录。
- 评估文档状态/失效引用的生成式门禁；用户 2026-11-13 已批准，已加 `backlog-rows` 类型、`backlog-refs`、`doc-indexes`。

## 验收标准

1. **DOC-01** [人工] 本文记录的审计结论、P0/P1/P2 范围与当前 main 的事实一致；`node scripts/gates/doc-links.mjs` 能找到本文入口。
2. **DOC-02** [人工] `specs/post-anticorruption-roadmap/spec.md` 与 `specs/README.md` 的路线书摘要都写明 01 已交单、02～27 多批已合入、当前实时入口，不再出现「其余批次尚未启动/尚未启动产品实施」。
3. **DOC-03** [人工] 6 份归档 spec 顶部有归档判定、依据、日期和剩余事项说明；`specs/README` 不再列它们；仓库内所有指向它们的链接改为 `specs/archive/...`。
4. **DOC-04** [人工] `draft-and-return`、`work-brief`、`intelligent-surfaces`、`shared-sources-and-surfaces`、`surface-composition` 的状态与 `specs/README` 摘要都反映 #1952/#2017 的合入事实；`feed-bounded-reads` 保留在「在做的」，状态反映 #2026 已合入、 #2045 补修在评审；部分实现的剩余项写清去向。
5. **DOC-05** [人工] `batches/15.md`、`batches/22.md`、`batches/27.md` 都有合入 PR、提交号、日期；27 批的 Full/验收余项仍指向 `BL-batch27-acceptance`。
6. **DOC-06** [人工] `specs/README` 中 unified-account、unified-input-voice、sqlite-driver-switch 三处与各自 spec/PR 的提交和范围一致。
7. **DOC-07** [人工] `node scripts/gates/doc-links.mjs`、`doc-citations.mjs`、`spec-index.mjs`、`doc-raw-data.mjs` 退出码为 0；`node scripts/check-spec-coverage.mjs` 不为本文报出缺号/串用前缀。

## 证据与进展

- 2026-11-13：审计完成，记录于本文；工作树同步到 `origin/main` `b819373250`。
- 2026-11-13：P0 完成。路线书顶部状态与 `specs/README` 摘要已更新；D0002、D0071、D0039、D0244、D0038 五份 spec 归档并更新全部指向链接；Feed 有界读取因 #2045 保留；draft-and-return、work-brief、intelligent-surfaces、shared-sources-and-surfaces、surface-composition 的状态已跟 #1952/#2017；批次 15/22/27 已补合入提交；`specs/README` 的 unified-account、unified-input-voice、sqlite-driver-switch 三处硬错误已修。
- 2026-11-13：P1 主体完成：
  - 新增 `scripts/backlog-index.mjs`，BACKLOG 头部改为摘要/筛选入口；类型统一回六类（原 91 条非标准已全部映射），分组子标题补齐。
  - 新增 [BL-memory-p0-closure](../backlog/BL-memory-p0-closure.md)，把 #2020 分支的 P0 收口接进 main；[BACKLOG.md](../BACKLOG.md) 的 Memory 暂停改为已解除；BL-1071 复用、1076/1077 关闭、BL-928/376/701/915/901 等已记入 [墓碑](../../docs/backlog-removed.md)。
  - 11 条 `src/en.ts` 遗留 BL 合并为 [BL-b16-server-text-residue](../backlog/BL-b16-server-text-residue.md)。
  - 新增 [BL-draft-return-acceptance](../backlog/BL-draft-return-acceptance.md)、[BL-daily-a1-residuals](../backlog/BL-daily-a1-residuals.md)、[BL-sqlite-sqld11](../backlog/BL-sqlite-sqld11.md)、[BL-capability-cpk11](../backlog/BL-capability-cpk11.md)；`specs/README` 对应摘要已指向它们。
  - 平台产品服务、Governance、包数/子路径、`RUNTIME-MIGRATION` 的「现在」表、终端输出目录、typed/hybrid、PLUGIN-PLATFORM 装配措辞、PRODUCT 的 Session、发布计数与 product-operations 基线告警已对齐。
  - 新增 [specs/archive/README.md](../archive/README.md)、[docs/reviews/README.md](../../docs/reviews/README.md)、[docs/qa/README.md](../../docs/qa/README.md)，`docs/design/README.md` 补目录清单。
  - P2 已做索引与分层说明：`specs/README` 增「相关 spec 族」，`RUNTIME-MIGRATION` 加历史/现行 banner。三族已合并：个人同步五份、Prologue 四份、情境三份；工作线因各有 MLN/WLN 编号暂不合并。
  - 新增生成式门禁：`backlog-rows.mjs` 校验六种类型，`backlog-refs.mjs` 校验活文档里的 BL 编号，`doc-indexes.mjs` 校验评审/设计索引；都接入 `docGates`。
- 2026-11-13：`doc-links`、`doc-citations`、`spec-index`、`doc-raw-data` 均通过；`check-health-gates.mjs --report` 的 Document references 为 none broken；`check-spec-coverage` 仍为报告模式。P2 的三族合并与三项文档门禁已做；工作线两份 spec 的合并与 `RUNTIME-MIGRATION` 的历史层拆分仍待另定。

## 在途 PR 的合并注意（2026-11-13 核对；已合入的 #2009、#2046、#2048 已按 main 更新，不再列在下面）

- **#2020 Memory P0**：只改 Memory 相关文档和 `CONTRACT-CHANGES`／`PLUGIN-DEVELOPMENT` 的 Memory 段；保留本轮的索引、偏好目录和门禁说明，Memory 正文按 #2020。它的 `PLUGIN-DEVELOPMENT.md` 基于旧版，终端目录仍写「首选的那个」、BL-701 仍写未完成；合并时保留「不写 `workspace_id` 就是项目的输出目录」和「第 27 批 #2010 已完成」两处。
- **#2047 第 31 批**：它的 `BACKLOG.md` 基于旧头部，合并时保留本轮的索引说明、分组标题和六类类型，只接它的新 BL 行，并同步待办计数 495→496；批次 31 的 Prologue 链接接 `specs/prologue-strategies/skill.md`。
- **#2045 Feed 补修**：`feed-bounded-reads` 保持活动路径，合并它的 FBR-08～11；它新增的 `docs/reviews/daily-quality/2026-11-12.md` 要在 `docs/reviews/README.md` 补一行，否则 `doc-indexes` 门禁会红。不要把本 spec 移回归档。

## 已合入批次的最后核对（2026-11-13）

- **#2009 第 06 批已合入**：Files 退役、项目插件 8 个、目录条目 22 个、`RUNTIME_ASSEMBLED` 15 个；`PRODUCT`、`RUNTIME-MIGRATION`、`SSOT`、`PACKAGE-BOUNDARIES` 和 `docs/releases/v0.1.0` 已按生成登记更新。
- **#2046、#2048 已合入**：批次 15 的当前记录、工作台体验 spec 与颜色用词按 main 保留。

## 决策与待定

- 2026-11-13：用户要求先记录需求再修 P0，随后继续修 P1；P2 的结构合并与门禁生成器待决定。
- 待定：文档清理是否单独开 PR（现行开发流程说文档不单独开 PR）；本文先按工作树改动记录，推送/开 PR 前再问用户。
- 待定：BL 的边界是「路线书=已排期计划、BL=未排期缺口」，还是把未开工需求也搬进 BL；已加门禁后按现行边界执行。
