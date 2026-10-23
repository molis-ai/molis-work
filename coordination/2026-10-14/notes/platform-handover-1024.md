# 防腐线 ② 还没做的（交接给 yijunw0212，2026-10-24）

② 写，给 ① 和接手的同事看。依据：
- `platform-queue.md`；
- 协调分支 `coordination/2026-10-14/RISKS-AND-DEFERRED.md`；
- BACKLOG 与 `privileges.md`，取自本栈末端 `feat/w5-06-project-stages` @ `84319f0ba`。

每条写出处、先后、依赖。「笔记」指本机会话笔记目录里还有效的文件。① 会把这些文件拷进协调分支的 `coordination/2026-10-14/notes/`，清单在 §7。没写笔记的，PR 正文、BACKLOG 行或 `privileges.md` 已经够用。

## 0. 在途 PR（10-24 已在每个 PR 上留中文交接评论）

| PR | 卡在哪 | 下一步 | 笔记 |
| --- | --- | --- | --- |
| #1099 | batch-1023-10 全量已绿（run 39972250383）；和 main 只在 `tooling/gates/page-assets.json` 冲突 | 合 main，两边数字都留，在合并结果上构建后按实测核对，然后合入 | `r25-esc-feed-filter.md`（R-25 的链路） |
| #1100 | 等 #1099 合入 | 改 base 到 main，按 squash 叠放的合并做法合 main，page-assets 按实测，然后合入 | 同上 |
| #1087 | 头 `502ffa9c6`，CLEAN | 等 #1099、#1100 合入后再合入 | — |
| #1098 | 等 #1087 合入 | 合 main（squash 叠放的合并做法），改 base 到 main，构建，推送；改了 contracts 与 SDK，要进集成批次 | — |
| #1107 | 等 #1098 合入 | 同上；命中 assembly，进集成批次（可以和 #1098 同批） | — |
| #1096 | 头 `5cf8033ce`（已含 #1104），在 `integration/batch-1023-11` 里，全量 run 39982678940 还没出结果 | 批次绿就合入；合入后关 R-12、R-15，本 PR 自己删 BL-403、BL-404 两行 | `bl411-stopped-services-design.md`（BL-403 的前因，R-13 的依据） |

合入顺序：#1099 → #1100 → #1087 → #1098 → #1107。#1096 不在这条链上，按它的批次结果另合。

## 1. W5-06（PG-060）收尾

1. **③ 的页面那一半**
   - 页面改读 `creatableKinds`、`homeStarts`。
   - 删三张表：`goal-inputs-html.ts` 的新建表、`scripts/client/placement.ts` 的默认标题表、`scripts/client/project-home.ts` 的起点表。
   - 再删 PPT、Dataset、灵光其余的手写行：`primitive-catalog.ts`、`global-search.ts`、标签标题兜底表。
   - 出处：`privileges.md` PG-060 状态列「还没做的」。依赖 #1098。
   - 队列笔记把这件事记作 BL-387，但 main 和本栈的 BACKLOG 里都没有这一行，请 ① 核一下。
   - ③ 已在 `migrate/w5-06-shell-plugin-rows` 上开头，由 ③ 推。
2. **Goals S11**（③）：删掉工作台手写的 Goals 舞台。
   - 出处：`privileges.md` §2 下第 115 行。依赖：W5-06 合完。
3. **`shell-page-renderer.ts` 改函数名**：留到 W5-10。
   - 出处：#1085 正文。无依赖，优先级低。

## 2. ② 名下排好的片（建议的先后）

1. **BL-430**：项目级 Runtime 插件的状态页与重启入口。做好以后，不可用占位链到它。
   - 依赖：W5-06 三片合入后从 main 开。先写 spec 小节，带验收号。
   - 笔记：无（BACKLOG 行和 #1107 正文已够）。
2. **R-20 → BL-350（S0b-2b）**
   - 做什么：插件设置里给连接槽绑一个人的连接；绑定时核安装和槽；过期的 401 先刷新，再重试一次。
   - 先后：W5-06 之后。
   - 笔记：`s0b2-connections-seams.md`（S0b-2 开工前的接缝核查，S0b-2b 照它接着做；行号按 10-22 的 main，要重核）。
3. **R-20① → BL-356**
   - 做什么：卸载或丢弃数据时，清掉原文件登记和这个安装在 `connector_bindings` 里的绑定。
   - 补一条断言删干净的测试。
   - 优先级中，不排在 BL-350 之后。依赖：非沙箱插件能卸载。
   - 笔记：`s0b2-connections-seams.md`。
4. **BL-366**：Agent 批准的写入也发 `host.workspace.changed@1`，cause 加 `agent-change`。之后删 `coding-surface.ts` 的 `readsFilesOutputs`。
   - 优先级中。
   - 笔记：`host-workspace-changed-design.md`（v1 的设计和 ① 的 D1–D5 裁定，BL-366 就从这里来）、`x6-host-events-design.md`（宿主事件的投递模型）。
5. **BL-394**：双实例插件的项目一半从发行物恢复时丢标记。
   - 必须在第一个带 `runtime.dual_instance` 的内置插件之前做。
   - 笔记：`s0-dual-instance-plan.md`（双实例的整体计划，作背景）。
6. **R-11：C8-3**：助理按动作类型选执行方的第三片。
   - 依赖：C8-2（③，#987）、视觉线 #916、#915、#940、#951。会话卡 `task_3f6b811d` 一直没开。
   - 笔记：`c8-executor-design.md`（C8 设计，含 C8-3 的范围）、`c8-2-handover.md`（③ 的 C8-2 交接）、`coding-migration-plan.md`（§6「② 的答复」、T1–T7）。
7. **R-11：Goals S9**：会话卡 `task_96c0cd34` 一直没开。
   - S9 只写 Goals 要用的 artifacts / process_items 服务接口。
   - 笔记：`goals-s9-preconditions-1022.md`（S9 前提核对）、`platform-queue.md`（「Goals S9 开工前要知道的 ① 裁定」一段）。
8. **C9 通道其余**
   - W5-04：插件客户端按需打包。
   - PR-3：设置节、搜索、外壳、名单，即 PG-072～076。原定排在 Goals、Feed、Inbox、Schedule 迁移之前。
   - 出处：`platform-queue.md` 第 9 条。笔记：无。
9. **PG-002**：可选权限开关。和 BL-353、BL-362 一起做最顺。
   - 笔记：`pg-002-facts.md`（10-19 在 #776 分支上做的只读调研，行号要重核）。
10. **PG-007 阶段 4 收尾**：本人的权限改成按宿主提供方给。
    - 补一条拒绝测试：一个要 `artifact:write`、不属于 Characters 的宿主提供方动作，本人调不到。
    - 笔记：`platform-queue.md` 第 14 条。
11. **收回 local-host 入口的 `localWebActionContext` 导出**
    - 依赖：先给出建上下文的公开写法。main 上有 8 个测试文件在用。
    - 笔记：`platform-queue.md` 第 13 条。
12. **#1096 评审的三条建议**，放进下一片 plugin-runtime：
    - streamed 判断与路由器统一成 `stream !== undefined`；
    - `plugin-action-route.test.ts:74` 套 `within`；
    - 撤下后，处理器尾巴上没码的错误被吞，补一句注释。
    - 笔记：`platform-queue.md`「② 10-23 待办」。
13. **BL-369**：直接打开创作台的预览地址时，落到不存在的舞台。
    - 依赖：创作台的去向（BL-377）。优先级低。笔记：无。

## 3. 风险登记里 ② 的行

- **R-12（BL-403）、R-15（BL-404）**：#1096 合入就关。
- **R-13**：① 已认可评估结论。只剩一件：统一窗口里看停用、撤权用例有没有 TypeError。
  - 笔记：`bl411-stopped-services-design.md`。
- **R-20**：见 §2 第 2、3 条。
- **R-11**：见 §2 第 6、7 条。

## 4. BACKLOG 里其余归 ② 的行（不在上面的排序里）

| 优先级 | 编号 |
| --- | --- |
| 中 | BL-352（几个宿主共用一个 Home 时写成停止）、BL-363（`ui.commands` 没人调）、BL-364（agent 宿主 37 条 typed 能力）、BL-367（`stop` 钩子没有时限）、BL-375（类型 id 不查主人）、BL-395（沙箱项目库语句没有时间与大小上限，要在第一条给沙箱开项目库的生产路径之前做） |
| 低 | BL-178、BL-180、BL-181、BL-359、BL-360、BL-365、BL-371、BL-372 |

| 编号 | 笔记 |
| --- | --- |
| BL-363 | `pg061-ui-invalidate-design.md`（PG-061 拆两片时把 `ui.commands` 的接通记成 BL-363，7 个命令的现状也在里面） |
| BL-364、BL-365 | `pg035-typed-to-action-design.md`（typed 改登记成动作的写法） |
| BL-362 | `pg038-activation-jobs-design.md`（随激活作业怎样在 Manifest `background.jobs` 里声明） |
| BL-367 | `bl411-stopped-services-design.md`（停用钩子超时，当时留在本片之外） |
| BL-395 | `project-library-plan.md`（项目库与沙箱 broker 的来历） |

## 5. `privileges.md` 里归 ②、状态还不是「已做」的 PG 行

按 §2 的阶段分组。要逐条看，在 `privileges.md` 里筛「归属 ②」。

| 阶段 | PG 行 |
| --- | --- |
| 1 / T1 | PG-020、021（项目库 L1b 之后剩下的）、022、023、027、029、030、037（部分，C6 已做平台一半）、051、065～069、070（T1–3）、071、105 |
| 2 | PG-001、004（这两条阶段 1 先设计）、002、005、008、010、013、014、015、028、032、034、039～042、072～076 |
| 3 | PG-011、012（Shelf 迁入归 ③）、017、025、026、035（部分）、043（部分）、045、046、047（剩 `validateResult()`）、049、053、055、060、061、062、063、087、098、102～104、107（先归 ③，之后归 ②） |
| 4 | PG-007（阶段 4 收尾）、024（删名单）、036、054、064、077～079、082、095～097 |

| PG 行 | 笔记 |
| --- | --- |
| PG-020、021、022 | `project-library-plan.md` |
| PG-065～071、105 | `w5-02-pr1-plan.md`（W5-02 PR-1b-1..4 的计划） |
| PG-036、037、054 | `coding-migration-plan.md`、`c8-executor-design.md` |
| PG-035 | `pg035-typed-to-action-design.md` |
| PG-061 | `pg061-ui-invalidate-design.md` |
| PG-012 | `s0-dual-instance-plan.md` |
| PG-045、046 | `s0b2-connections-seams.md` |
| PG-002 | `pg-002-facts.md` |

- PG-083、084、101 不迁，防腐收尾后随创作台删除（BL-377）。
- PG-003、018、019、048、050 的状态列只写了 PR 号（#741、#762、#743/#744、#846），没写「已做」。请 ① 核一下能不能标成已做。

## 6. 已确认做完、不再列的

- #776 的后续「停了的输出端口还能 invalidate、retain」：S-18 已有测试「stopped output clients cannot invalidate or retain outside an action, including after restart」。
- PG-044 代码列里的 `git-status.ts`：本栈的 `privileges.md` 已经不引用它。
- 已合入 main 的片：agent-host 撞包（#1001）、X-6（#1013）、`host.workspace.changed`（#1028）、BL-411（#1074）、S0b-2（#1081）、C7（#1024）、S0-2b-3（#1050）、C8-1（#960）。
- 这些片对应的笔记已经过时，不用拷：`agent-host-pack-suggest-1022.md`、`x6-facts-1022.md`、`s0-2b-3-plan.md`、`s-numbers-1021.md`、`gs-s52-review.md`。

## 7. 要拷进协调分支的笔记（18 份）

10-24 由 ② 扫过，结果如下：
- 没有密钥、令牌、私钥、JWT，也没有 MiniMax 密钥或钥匙串命令。
- 提到「真实 Home」的地方都是流程，没有数据：
  - `project-library-plan.md` §3.2（v8 维护：先在一次性 Home 演练、整份备份、4207 先不重启）；
  - `x6-host-events-design.md` §3 与 D1（落库会牵涉真实 Home 的维护）；
  - `coding-migration-plan.md`、`w5-02-pr1-plan.md`、`s0-dual-instance-plan.md`、`c8-executor-design.md` 各有一两句「不碰真实 Home」。
- 唯一的本机路径：`platform-queue.md` 第 80 行附近的 `/Users/creamiex/molis-ai/prologue-wt/attachment-placeholder`（历史上 Prologue 补丁的工作树），不是密钥。

| 文件 | 用途 |
| --- | --- |
| `platform-handover-1024.md` | 本清单 |
| `platform-queue.md` | ② 的队列与历史，含 ① 的各次裁定 |
| `r25-esc-feed-filter.md` | #1099、#1100 |
| `bl411-stopped-services-design.md` | R-13、BL-367，#1096 的前因 |
| `s0b2-connections-seams.md` | BL-350、BL-356、PG-045、PG-046 |
| `host-workspace-changed-design.md` | BL-366 |
| `x6-host-events-design.md` | BL-366、PG-044 |
| `s0-dual-instance-plan.md` | BL-394、PG-012 |
| `c8-executor-design.md` | C8-3、PG-036 |
| `c8-2-handover.md` | C8-3 的依赖（③ 写） |
| `coding-migration-plan.md` | C8-3、PG-036、037、054 |
| `goals-s9-preconditions-1022.md` | Goals S9（③ 写） |
| `pg-002-facts.md` | PG-002 |
| `pg035-typed-to-action-design.md` | BL-364、BL-365、PG-035 |
| `pg038-activation-jobs-design.md` | BL-362 |
| `pg061-ui-invalidate-design.md` | BL-363、PG-061 |
| `project-library-plan.md` | PG-020～022、BL-395 |
| `w5-02-pr1-plan.md` | PG-065～071、PG-105 |
