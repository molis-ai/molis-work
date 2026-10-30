# W5-17：目录库不再存项目库的绝对路径（目录库 v23）

状态：维护窗口线正在适配当前 main（Codex 设备 A，2026-10-29）；从原分支343f26e46普通merge main ac5735fb2a，不rebase。代码、脚本与演练尚待本轮核收，真实Home未读未写。统筹 #1332 6513987033 分配 S-102、RAC-2300～2399；本片用2300～2309。

## 1. 目标

路线图 W5-17、c-end-readiness 决定 #21（用户 2026-10-08）：目录库（`projects/catalog.db`）不再存每个项目库的绝对路径，由 Home 和 `project_id` 推出；目录库 v22 → v23；项目路径能跟随目录副本（C-4 的前提）；完整恢复仍受 W5-16 原 Home 与原 key 绑定限制，本片不证明可搬家恢复。

## 2. 做了什么

| 项 | 做法 |
| --- | --- |
| 路径推导 | `modules/projects/src/project-paths.ts` 的 `projectDirectoryPath`、`projectDatabasePath`：`<projects 目录>/<project_id>` 与里面的 `molis-work.db`；仓库里只有这一份推导，宿主的删除、演示项目、卸载清点、连接器来源状态都复用它（`managedProjectDirectory` 删除） |
| 合同字段 | 方案 A：`ProjectRecord.database_path` 留着，`ProjectsRepository` 读取时由 `projects_directory` 和 `project_id` 推出；合同、API 快照、约 60 处读取方不动。`ProjectsModuleOptions.projects_directory` 现在必填 |
| 表 | `projects` 去掉 `database_path`（含 `UNIQUE`）；`CATALOG_SCHEMA_VERSION` 22 → 23；新构建拒绝 v22（`catalog.unsupported_schema`），产品里没有就地升级 |
| 死代码 | `ProjectService.updateDatabasePath` 与仓库、模块出口的转发没有调用方，删除 |
| 事件 | `project.created` 的载荷只剩 `{ project_id }`。已写进库里的历史事件保留旧路径不改；`project_events` 在仓库里只有写入（`repository.ts` 一处 INSERT），没有任何读取方读这个字段，所以留着不会被任何代码当成路径用（统筹要求的 grep 已做，2026-10-23） |
| 维护脚本 | `tests/fixtures/catalog-path-maintenance.mjs`（`list`、`rewrite`）与演练用例 `tests/catalog-path-maintenance.test.ts`：先全读，有一个项目的库不在推导位置、没有库、或 ID 不是目录名，就一个字都不写（脚本不移文件）；一个事务里重建 `projects`，写完再读一遍；真实 Home 要 `--maintenance-window` 并查占用；做完后两个文件一起删 |

## 3. 统筹裁定（2026-10-23）

- 保留合同字段、读取时推导：同意。
- 历史事件载荷保留旧路径：同意，前提是没有读取方（见上，已核）。
- 路径不在推导位置的项目：阻止整个重写，脚本永不移文件：同意。
- 新的项目 ID 校验属于「地址与路径校验」一类，按 `docs/system/SECURITY-INVARIANTS.md` 查现有行：S-11 管的是**外部给的文件引用**不跳出它被给的目录（项目引用、Git 冲突文件，读文件），拒绝的是方案、符号链接、inode 一类；这条管的是**目录库里的一行**（手改或从别处恢复）经 `project_id` 变成存储目录，进而被删除、改名暂存、卸载清点去碰目录之外的东西。对象和后果（删除）都不同，不是同一条的延伸，所以没有并进 S-11，**占用统筹分配的 S-102**，表里新写一行，拒绝测试在 `tests/security-invariants-project-storage.test.ts`（先在去掉校验的构建上看它红，再看绿）。

## 4. 验收

| 编号 | 断言 | 测试 |
| --- | --- | --- |
| RAC-2300 | 目录库不存路径：项目库由 projects 目录和 ID 推出，目录库拷进另一个 Home 就指向那个 Home 的文件 | `tests/catalog-path-derivation.test.ts` |
| RAC-2301 | 不是一个普通目录名的 ID 没有目录：创建、读取、列出都以 `catalog.project_storage_invalid` 拒绝 | 同上；S-102 在 `tests/security-invariants-project-storage.test.ts` |
| RAC-2302 | `project.created` 事件只记项目，不记路径；模块没有移动项目库的入口 | `tests/catalog-path-derivation.test.ts` |
| RAC-2303 | 推导出的文件名就是存储包给的名字；目录库版本是 23 | 同上 |
| RAC-2304 | `list` 报每个项目存的路径、推导路径和状态，孤儿库也列出，不写，有要人看的项退出码 3 | `tests/catalog-path-maintenance.test.ts` |
| RAC-2305 | `rewrite` 遇到 Home 外的库、缺失的库或不是目录名的 ID，一个字都不写 | 同上 |
| RAC-2306 | `rewrite` 把 v22 目录库变成 v23：没有路径列、行不变、引用 `projects` 的表没有被级联清空、表结构与产品新建的一致、产品能读 | 同上 |
| RAC-2307 | v23 上再跑 `rewrite` 或 `list`，什么都不改 | 同上 |
| RAC-2308 | 重写中途失败，v22 目录库原样 | 同上 |
| RAC-2309 | 真实 Home 不带窗口参数被拒；不是本产品的目录库、版本不对的不动；有进程握着目录库拒绝 | 同上 |

## 5. 真实 Home 的维护（归用户，合入前统筹问时段）

目录库升到 v23 之后，真实 Home（4207）从主检出跑的旧构建会因版本不符起不来，所以维护要在这个 PR 合入前后紧挨着做。步骤写在 `docs/releases/CHECKLIST.md` 4.5 和 spec §4.1「库版本维护清单」的 `projects/catalog.db` 行；PR 正文里逐条写。

## 6. 没动

合同、动作、Manifest、API 快照；`project_events` 里历史事件的载荷；项目库本身的路径与布局。

## 7. 留着的

- 号：S-58～S-60 在 #1117、#1119、#1139 里，它们进 main 之前，门禁会报表里 S 号不连续；开 PR 前先合 main。
- c-end-readiness 里 W5-17 的「未合入」在合入时改成已做；`docs/system/HOME-DATA.md` 的缺口行已删。

## 8. 当前 main 适配与严格维护

保留 Projects 在 main 的拆分：project-records-repository 拥有项目行，workspace/deletion 各守自己的表，不恢复旧大仓储。新增的安装持有者、Memory采用及Feed测试夹具调用方补可信 projects_directory。旧维护脚本会探测 catalog 存的旧绝对路径，已改为纯文本分类，只检查副本内的派生位置；识别真实Home名称也不读取其文件。

完整旧schema取main ac5735fb2a在一次性Home新建目录库的28个对象（无业务行），个人规划先迁出；目标在副本维护事务提交前逐项describe，与真实新建的当前产品目录比较。保留所有表行数和project rowid；错版、错列/索引/视图/触发器、引用故障和掉表后的注入失败均拒绝回滚。暂用catalog23，#1101先落则后续顺延，窗口前重核。目录可推导不扩展完整Home恢复承诺。
