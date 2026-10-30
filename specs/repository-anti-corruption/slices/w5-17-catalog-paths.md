# W5-17：目录库不存项目库绝对路径（干净 Home 起点 1）

状态：产品候选 #1549，负责人 Codex（设备 A）。普通merge main ea05b7690b，不rebase。按统筹 #1332 6517794305 / 6518340875 转达的用户决定，旧迁移路线取消，目录当前结构直接成为1；真实Home重建、安装与用户验收未开始，等全部代码就绪后用户另说“开始”。统筹分配 S-102、RAC-2300～2399；本片现行验收2300～2303，原2304～2309维护演练取消。

## 1. 目标与边界

目录库的 `projects` 不存项目库绝对路径，由可信Home中的projects目录和单段 `project_id` 推导。保留当前公开 `ProjectRecord.database_path` 读出字段、项目布局、动作/Manifest合同及owner，不改变产品版本。目录副本可推导本副本路径不等于完整Home可跨路径/原key恢复。

旧Home整体搬开后创建当前Home，不迁移旧目录；删除catalog升级脚本、旧结构夹具和演练，不留读取兼容、启动改表或移库入口。真实Home、服务、Keychain与安装均不在代码片操作范围。

## 2. 实现

| 项 | 现行行为 |
| --- | --- |
| 唯一路径推导 | `modules/projects/src/project-paths.ts` 的 `projectDirectoryPath`、`projectDatabasePath`，组成 `<projects>/<project_id>/molis-work.db`；删除、演示项目、卸载清点和连接器来源复用它，移除managedProjectDirectory重复写法 |
| 公开读模型 | `ProjectsRepository` 用必填 `projects_directory` 与id给 `ProjectRecord.database_path`，保留合同及读取方；已拆分的project-records/workspace/deletion owner不合回大仓储 |
| 目录结构 | `projects.database_path`及其UNIQUE删除；`CATALOG_SCHEMA_VERSION = 1`。新建一次完成，其他版本拒绝 |
| 拒绝顺序 | 已存在的目录库先用只读连接调用现有owner/版本检查，再开可写连接，正常打开仍复核；错版本拒绝不先切WAL改变文件头 |
| 项目身份 | id必须是普通单段目录名，创建和读取拒绝逃逸值，删除/卸载不能用库中的任意字符串碰Home外文件（S-102） |
| 事件与死代码 | 新 `project.created` 只记project_id；删除无调用方的updateDatabasePath链。事件历史无路径读取方，不做事件转换 |
| 结构拒绝 | 现行catalog不接受个人规划表；保留原拒绝条件，只将错误说明中的已取消迁移命令改成当前结构拒绝，事实属于Goals Home库 |

## 3. 验收

| 编号 | 可观察结果 | 测试 |
| --- | --- | --- |
| RAC-2300 | projects无路径列；项目路径由可信projects目录与id推导，复制目录库后读取指向副本Home | `tests/catalog-path-derivation.test.ts` |
| RAC-2301 | 非普通目录名id在创建、读取、列出时拒绝；删除、移除demo与清点不能碰目录外文件 | 上述文件；`tests/security-invariants-project-storage.test.ts`（S-102） |
| RAC-2302 | project.created只记project_id，模块不提供移库接口 | `tests/catalog-path-derivation.test.ts` |
| RAC-2303 | 存储包文件名一致，目录起点1可新建/重开；完整性ok、FK空；完整当前DDL却版本2时拒绝，文件字节与项目事实不变 | `tests/catalog-path-derivation.test.ts`；`tests/project-catalog.test.ts` |

原RAC-2304～2309的list/rewrite、事务故障回滚等是已取消迁移的演练，不再执行，其脚本/旧结构/用例删除。S-102继续有真实拒绝断言，不放宽路径或owner门禁。

先整体build；Projects与Host README必跑及路径/目录/存储拒绝相关用例经machine-slot、jobs1、一次性Home；版本表、boundary、health/base、secrets。shared-core/storage Full由统筹排，不在本机跑、不自行加标签。甲档的Codex B验证、Opus high二审由统筹安排。

## 4. 决定与证据

2026-10-23已裁定保留合同字段、读取时推导；原历史事件无读取方；路径校验属于存储目录删除边界，统筹于2026-10-29改配S-102，不占现已用于邀请的S-61。原方案catalog22→23及#1101撞号排序，均由2026-10-30干净起点决定取代；#1101由原owner衔接，不碰该分支。

旧候选曾在当时准确头完成build/boundary/40库核对/health、3个维护及路径文件12项、69个普通文件和1个隔离浏览器文件；这些仅为旧路线历史证据，不算新头验证、真实维护或用户验收。旧获准只读副本保留，现不再读私有数据预检或做跨库迁移。

当前候选普通merge ea05b7690b；删除3份catalog升级文件，保留产品路径/S-102与分拆后的owner；当前工程结果随准确head交#1332，不勾真实重建完成。

现行工程结果（2026-10-30，冻结main ea05b7690b）：整体build、health/base、boundary、48项资源7,493,088字节和40项版本表通过。核心5文件31项通过；README/直接影响65文件先64通过，projects-module新增的四个目录清理用例仍按旧prepare输入传目录，改为构造模块时绑定可信目录后单文件6项通过，所有删除/共享/事务回滚断言保留。合计70个不同文件验证通过；不重复跑未改源码的已通过用例。本头与secrets/独立验证另记#1332，不表示真实Home执行完成。
