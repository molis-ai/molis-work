# Goals S8 另一半：项目库的身份是项目，不是 Goals 的看板（PG094-10 余项，PG-021）

状态：已实现（2026-10-24，迁移线 ac-sc3 片，S4（#1146）已合入 main，本片直接从 main 开）。统筹 10-23 裁：先于 S9 单做，S9 之前由宿主的 Goals 装配建看板，之后是 `start()`。草稿见 `goals-s8b-s9-runtime.md` 第 3 节。

## 1. 目标

S8 把 Goals 的 31 张表交给它自己的 Manifest 声明，项目库的身份也改成了 `project_root`；但宿主建库、验库仍然靠 Goals：`initializeProjectDatabase` 建库时同一事务里替 Goals 建看板，`validateManagedBoard` 要求恰好一个看板、再读 Goals 的快照。本片让库的身份只由根行决定，看板回到 Goals 自己手里。

## 2. 范围

| 位置 | 之前 | 现在 |
| --- | --- | --- |
| `managed-project-database.ts` `initializeProjectDatabase` | 建库 + 调 `GoalProjectApplication.initializeBoard`（根行与看板同事务） | 只写根行；不再收 `actorId` |
| 同文件 `validateManagedBoard`、`readManagedBoard` | 恰好一个看板、根行与它同 id、读 Goals 的快照 | 删 `readManagedBoard`；`validateManagedBoard` 改名 `validateManagedProject`：恰好一行根记录、同 id、完整性检查；不读 Goals 的表 |
| `goal-project-application.ts` | `projectOpened` 就是 Goals 的补对 | 先 `ensureBoard`：库有根行却没看板时，以本人、键 `project-catalog-create-<项目>` 建看板（与原来建项目时一致），再补对。Goals 的库被拒时 `goalsActionProvider` 不调 `projectOpened`，所以不建 |
| `demo-plugin-seed.ts` | 先问「演示项目的看板在不在」 | 问根行在不在 |
| `tests/goals-host-no-direct-reads.test.ts` | `managed-project-database.ts`、`demo-plugin-seed.ts` 在冻结清单里 | 两个文件从清单删；开发门的原因改指 S9 |

不改：没有根行的库（管理入口对一个新数据库路径调 `goals.board.initialize`）仍由这个动作一并建根行和看板，打开它不会建看板，所以 `molis_work_v1_initialize` 第一次仍是 `replayed: false`、`board.created` 的行为人仍是本人；开发门（`local-plugin-development.ts`）显式建根行和看板，和管理入口同类，S9 改调动作；样例项目（`demo-seed.ts`）由 S9 与样例种子一起改。已有项目（已有看板）打开后没有任何变化。

## 3. 验收

- **RAC-261**：用目录建的新项目，库里恰好一行根记录、没有看板、没有 `board.created`；`validateManagedProject` 认它，认不出别的项目号，没有根行的库不认。（`tests/goals-s8b-library-identity.test.ts`）
- **RAC-262**：打开项目建出看板一次，行为人是本人；再开不再写；用建项目的那个键调 `goals.board.initialize` 得到 `replayed: true`；没有根行的新库打开后不建看板，第一次调动作得到 `replayed: false`。（同上）
- **RAC-263**：Goals 的库被拒（账本行换了版本）时，库的检查仍通过，打开项目不建看板、不改库里的任何行。（同上；`tests/goals-project-database-refusal.test.ts` 整体仍过）
- **RAC-264**：`apps/` 里没有 `validateManagedBoard`、`readManagedBoard`；两个文件不在冻结清单里。（同上；`tests/goals-host-no-direct-reads.test.ts`）

## 4. 对调用方的影响

宿主内部：`@molis-ai/molis-work-app-local-host` 的导出少了 `readManagedBoard`，`validateManagedBoard` 改名 `validateManagedProject`，`initializeProjectDatabase` 少一个参数；工作区内没有别的调用方。没有动作、Manifest、MCP 工具名、页面资源的变化。新项目的 `board.created` 事件从建项目时挪到第一次打开时，行为人和键不变。
