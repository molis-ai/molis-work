# GW6：补齐 Goals 数据归属与新旧项目启动

状态：用户明确确认后，提案 `goal-tree-proposal-6edbcde6-4085-4bdf-89c5-6b9544edcd48` 四项均 applied，cursor 1162。GW6 accepted/closed_leaf revision 1，已开始实施；不是已完成证据。2026-09-06。

决定后的 19 个受影响 Contract 已读取复核：GW1–GW5、Query、AP3、EX4、DV2 的原结果/边界仍成立，不重做；架构/Feed 提供者仍供给同一公开契约；Execution 继续消费稳定 Goal 事实；数据保证、DV4、Cutover 和根目标的全部验证/安装/清理义务保留。父项只更新开放的覆盖计划，原三个验收条件和四项承诺未变。图检查 issues=[]。没有必要的后续 canonical 改动；DD 待确认提案没有被本次决定采用。

正式读取及预检已完成，cursor 1150：conflict_item_ids=[]、planning_issues=[]。四项分别为新建 GW6、关联原父 Goal、GW6 消费 GW2、保留原父 Contract 并更新开放的覆盖审查。首版误把 GW6 标为其他已完成核心工作的基础前置，提交被拒绝，未创建正式 Goal；已改为复用 GW1 基础、GW6 消费 GW2 的实际迁移结果，未通过增加反向依赖绕过检查。

## 目标与当前证据

沿用总 `spec.md`、`docs/modules/goals.md` 和 `docs/SSOT-MATRIX.md`，不另建架构体系。唯一主要结果是：新项目建库、旧项目升级及 V3 导入后的 Goal 数据，均由 Goals 包维护；用户重新打开项目后仍能查询、修改和查看原有内容。

原父 Goal `goal-ccdd09e2-7bfe-4b4b-82e2-29b632b51b5d` 明确包含 Schema、Goal 数据迁移和唯一 Store owner。目前不能收口为完成：

- `src/v1/store.ts` 的 `migrate()` 仍定义 Goals 基础表、索引和字段约束。
- 同文件 `migrateRiskTreatmentPlan`、`migrateProjectGuidance`、`migrateProjectGuidanceRevisions` 仍实现 migration 15/25/26。
- `migrateContinuousActionModel` 仍直接补 Goal revision 列、创建 revision/coverage 表、遍历 Goal/criteria 并生成历史 revision 1、回填父子覆盖。其他 owner 的 migration 30 部分已有公开函数。
- `coverage_items` 不是废表：`src/v1/migration.ts` 的 `importV3Board` 直接写；`src/web/server.ts` 的 `buildMolisWorkWebView` 直接读并映射。`tests/v1.test.ts` 和 `tests/web.test.ts` 有真实导入/呈现行为约束。
- GW2 证据明确只迁出 4/11/12/13/21 这组生命周期迁移，不用其历史全绿证明上述剩余代码已退出。Query 的新证据只证明其中列出的 Policy/Risk/Relation caller；没有证明旧版需求覆盖账已退出。

这证明剩余所有权迁移未完成，不证明用户数据已损坏，也不证明一次请求发生过重复写入。保留 GW1–GW5 和 Query 已完成历史；用这个有限补齐结果承接父项遗漏，不重做这些结果。

## 范围与唯一归属

| 当前剩余 | 目标归属与处理 | 必须保留 |
| --- | --- | --- |
| goals、acceptance_criteria、goal_relations、goal_contract_revisions、coverage_contract_revisions | Goals 公开 schema / migration；Host 只组合 | 字段、索引、CHECK/FK、默认值、版本和父子引用 |
| goal_trash_records、goal_trash_relation_records | Goals；复用现有生命周期迁移 | 单一开放回收记录、关系恢复历史 |
| risks、goal_risks、policy_bindings | Goals schema 与 migration 15 | scope 的实际值 goal、历史状态、关联、空 treatment_plan |
| project_guidance_entries / revisions、planning_method_packs | Goals；迁移 25/26，复用现有方法表迁移 | 顺序、重复约束、版本、来源、确认摘要、作者和时间 |
| coverage_items | Goals 维护旧版需求覆盖记录 schema 和有限 Query/导入写入端口 | covered/deferred/out/unresolved、owner Goal、blocking、理由、重访条件与排序 |
| input_bindings、impact_bindings | 复用 Goals 已有公开 owner | 不复制 schema 或迁移实现 |
| migration 30 的 Goals 部分 | Goals 只处理自己的列、revision、coverage 回填 | 原外层原子事务、marker 30 时机、原序列化、历史作者/时间回退、幂等 |

不把 `coverage_items` 改造成 Context Ledger、Artifact 或新产品。它是现有 V3 导入的需求覆盖账，不是 `coverage_contract_revisions` 的同义表。

明确不吸收：boards/Project 控制状态、events、idempotency_records、schema_migrations，Execution、Evidence、Governance 的事实或状态机，clarification_sessions/turns，Feed/Artifacts/Session。Host 启动的跨 owner 顺序与外层事务继续使用同一连接和各 owner 公开函数；不为这次目录重组引入分布式事务、outbox 或新迁移协议。其他旧 Host/Store 职责仍由全量 Cutover 按原要求清理，不宣称本项删除整个旧 Store。

## 实现方式与允许修改范围

1. 先固定当前 fresh schema 与关键历史升级/V3 行为基线。历史 fixture 必须独立于迁移后实现，不能用新 schema 生成 expected 再自证；用原有历史 fixture 或从原实现提取最小真实前置状态。
2. `modules/goals/src/` 接管剩余 Goals schema 和升级；按 schema、revision 回填、guidance 升级的内聚职责安置，不把所有内容继续追加到一个巨大 migrations 文件，也不一表一个无意义包。`index.ts` 只公开 Host 所需的有限入口。
3. `packages/contracts/src/modules/` 给旧版覆盖记录提供有限类型/API；Goals 内部 Repository 拥有 SQL 和映射。V3 importer 保留格式转换、ID 映射和跨 owner 事务，通过公开端口写覆盖记录；Web 通过 Query 读取，保持原字段与排序。不得公开任意 SQL 或任意表操作。
4. `src/v1/store.ts` 改为公开 schema / migration 装配，保留迁移顺序、条件与失败恢复；`src/v1/migration.ts`、`src/v1/goal-query-application.ts`、`src/web/server.ts` 仅切换上述 caller。若 V3 应用编排需要落到既定 Native Plugin，可在 `plugins/native/goals/src/` 使用现有窄端口，但不扩大到整个 Host 退出。
5. 更新 `scripts/check-package-boundaries.mjs` 的实际边界检查：保护 Goals DDL、升级和 coverage 读写退出，配故意恢复旧写法会失败的反例；不能只新增扫描名单便宣称迁移完成。
6. 同步 Goals README、模块文档、SSOT Matrix、迁移/huge class 记录和总 spec 的对应入口。生命周期与批准状态仍以 Molis Work 为准。

允许测试与文档：`tests/` 中 Goals/schema/V3/Web 受影响测试和最小独立历史 fixture；上述规范文档与本工作计划。不得修改用户数据库、现用 4173、Home、Applications、Runtime/模型配置，不公开发布，不自动提交 Git。

## 输入、输出与真实调用链

- 输入：GW2 的已迁生命周期/历史迁移公开 API；现有 Goals Query/Command 及 architecture SSOT；当前安装/旧版数据 fixture。
- 主输出：Goals 包唯一维护的新建、升级与导入后可读写的数据链路。
- 支撑输出：前后对账、故障回滚/重开与真实 UI 证据；旧职责退出清单和可复现开发说明。
- 首次使用：临时新项目 → 实际 Host 初始化 → 创建/读取/修改 Goal、Policy/Risk、Guidance → 重开 → 相同事实可见。
- 升级：独立历史项目 → 实际启动升级 → 原 Goal/criteria/revision/关系/规则与覆盖账可见 → 继续修改 → 重开验证。
- V3：真实导入入口 → Goals 公开写入 → 网页查看覆盖记录与 Goal 关联 → 浏览器刷新/项目重开后相同内容。保留“不自动接受旧 Goal”和导入报告的 regenerate 列表。

## 验收标准

| ID | 通过条件 | 证据 |
| --- | --- | --- |
| gw6-owner | Goals schema/升级及 coverage 读写由唯一 Goals owner 实现；root Store/导入器/Web 只消费公开入口；无新增巨大类/复制规则/第二份实现 | 逐条 caller 与 schema ownership 审查、真实导入边界故障测试、构建 |
| gw6-result | fresh、历史升级、V3 三种来源在真实 Host/CLI/Query 和浏览器中保持原 Goal、revision、Policy/Risk、Guidance、覆盖记录及错误/排序；升级后仍能修改，重开不丢状态 | 独立 fixture 对账；真实 CLI/Host 集成；浏览器读取/交互与重开测试 |
| gw6-recovery | 15/25/26/30 实际涉及的失败可回滚；跨 owner migration 30 失败不留下半次升级或成功 marker；重试与重开不重复记录、不抹掉原版本/来源 | 故障注入后检查最终数据库与 marker，再解除故障重试；保留 migration 12/13 既有恢复回归 |

定向命令（新增文件名是预定名称，执行时以真实文件为准并记结果）：

```sh
node --import tsx --test --test-concurrency=1 tests/goals-storage-migration.test.ts tests/goals-command-module.test.ts tests/goals-query-module.test.ts tests/v1.test.ts tests/web.test.ts tests/goals-storage-migration.e2e.test.ts
node --test tests/goals-storage-boundaries.test.mjs
node node_modules/typescript/bin/tsc -p packages/contracts/tsconfig.json
node node_modules/typescript/bin/tsc -p modules/goals/tsconfig.json
node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit
node scripts/check-package-boundaries.mjs
git diff --check
```

验收是本迁移切片的真实可用/恢复证明，不等于整体发布。整个重组仍须全部开发、完整前后端用户 E2E、清理、再 E2E 与初始架构要求逐条审查。

## 方法、依赖与完整性审查

方法 catalog `sha256:e222a61b77957e4763660c9a`，项目 floor 为空；轻量目录与三个完整方法正文已读取：迁移重构、软件开发、开发者工具。分别约束兼容/回退、唯一 owner/公开契约、首次运行/旧版本/可复现诊断。没有新 AI 行为、支付、安全授权体系或 UI 设计，不新增这些方法对应的功能。

依赖逐条判定：

- 迁移方法 1/2：本项内先证明新入口/回退再删除对应旧实现；下游全量 Cutover 保持消费已验证迁移结果。3：GW6 消费 GW2 的真实迁移与生命周期 API，设 GW6 depends_on GW2；4：只有本提案通过后执行，不开展不可逆投入；5：数据保证/全量验收消费本项，不反向依赖验收；6：父子归属用 part_of。
- 软件开发方法 1/2：原产品目标、架构和模块地图已存在，复用，不创建新文档前置。3/6/7：GW6 消费 GW2 及其已完成前置的公共契约，避免重复添加传递依赖。4：其他 owner 的接口稳定且有真实实现，无需让其重新等待 GW6；本项跨 owner 事务验证在隔离 fixture 中完成。5/9：既有数据保证与 Cutover 承担综合集成和发布；8：保持批准边界；10：共享文件只决定串行，不制造硬依赖。
- 开发工具方法 1：caller/文档在同项中消费公开端口，不按技术层独立拆 Goal。2：发布消费兼容证据，仍走既有下游。3/5：提供者→消费方同上；4：保持批准与不可逆边界；6：无额外排序依赖。

跨主题结果链：GW2 的生命周期/升级基线 → GW6 新旧项目统一数据 owner → 既有 Execution 消费稳定 Goal 事实；数据保证消费升级/回滚结果；Cutover 消费所有 owner 的可用实现并清理总 Host。根目标的完整 E2E/清理/开发文档义务不变。原 Query 结果和 GW1–GW5 保留，没有反向依赖或重复 Goal。

同一主要交付为什么不再拆：单独移动 DDL、只迁读写或只写测试，都不能交付“新旧项目的 Goals 数据完整通过唯一 owner 工作”。UI 操作和回滚证明直接验收该结果，不是第二个新功能；安装发布仍留 DV4/整体数据保证。只串行执行，不新建并行 Agent，不声称共享 Store 变更可并行。

父项映射补全方向：保留四项原输出及三个原条件，Goal 数据迁移加上本项主输出；goals-write-store 加上 gw6-owner，goals-write-rules 加上 gw6-result/recovery；原 GW1–GW4 对应映射保留，GW5 纳入用户旅程/UI 覆盖。由于此次仍需执行及全父项对账，父项保持开放，不提前宣称收口或完成；GW6 完成后再依据真实结果决定父项收口。

本补齐项已经用户确认并正式接受，当前结果与证据见 `gw6-validation.md`。没有悬而未决的产品功能选择。DD 父项提案独立 pending，权限审核拒绝的决定不以本提案替代或绕过。
