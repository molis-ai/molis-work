# Home 实例的项目级服务：成果、端口、事件（PG-025）

状态：已定（用户 2026-10-25 弹窗定不建 Home 实例的项目级成果、端口、事件，改成目录检查加启动拒绝；防腐线 ac-platform，分支 `ac-platform/group5-home-services`）。做的是 `privileges.md` 的 PG-025 一行：不给 Home 实例成果、端口、事件服务，把「启动时抛一句话」换成目录检查加测试，并记下为什么现在不建这三样（§3、D5）。验收号 RAC-744、RAC-745。

## 1. 重核结果

`HomePluginExecutor.start` 在插件不是双实例、又声明了端口、事件、成果或过程项时抛 `Error("Home Runtime 尚未提供项目成果、端口或事件服务")`（`home-plugin-executor.ts`）。这一行写的是「待做」，§4 k 说 Home 级实例要能按调用所在的项目给出数据库、成果和路由。逐项核对现状：

- **数据库**：已有。按项目分区的库（`partition: "project"`）由平台按当前调用的项目开（`openPartitionedPluginDatabase`），PART 系列用例证明。
- **路由、后台作业**：已有。路由按请求里的项目分发（`home-plugin-http.ts` 的 `routeProject`）；Home 实例的作业记着登记它的那次调用的项目（`pluginBackgroundFor`）。
- **成果（`artifacts`、`process_items`）**：项目执行器的客户端是绑死一个项目的（`createPluginArtifactClient({ project_id })`），写进去的版本还要通知这个项目的接线图（`observePluginArtifacts`）。Home 实例没有项目，要给就得让客户端每次调用从当前调用取项目，并通知别的项目的平台。
- **端口、事件**：接线的记录（`SqlitePluginWiringRepository`）、事件队列与日志（`SqlitePluginEventsRepository`）存在项目库里，投递靠该项目的监督器（`PluginSupervisor`）的生命周期。Home 安装不在任何项目的监督器里，没有地方挂。

**没有使用者。** Home 级内置插件六个：Cognia、Images、Issues、Jelly、Todo 都没有声明端口、事件、成果或过程项；Shelf 声明了，但它是双实例，这些由它的项目那一半拿（`specs/dual-instance-plugins`）。原先要靠这一行的 Alchemist 迁入（PG-092）已经撤销（用户 2026-10-21 定不迁，2026-10-23 定本轮不删、绕过、以后重做）。

## 2. 做什么

- `declaresProjectCoordination(manifest)`（`apps/local-host/src/plugin-project-coordination.ts`）一处回答「这份 Manifest 声明了只有项目的插件平台才给的东西吗」。`HomePluginExecutor.start` 和 `catalogProblems` 都用它。
- `catalogProblems` 新增一条：登记里有 `runtime`（Home 级）、没有 `dual_instance`，而 Manifest 声明了端口、事件、成果或过程项，目录就不可用（宿主不启动）。以前这要等到启动时才发现。
- 启动时的拒绝保留，信息改成说明出路：需要它们的插件作双实例，由项目那一半拿。

不改：任何插件的 Manifest、动作、服务；双实例的做法。

## 3. 不做：给 Home 实例建项目级成果、端口、事件（已定，用户 2026-10-25 弹窗，D5）

不做，理由是没有使用者，而三样都要在 Home 与项目的平台之间新开一条路：成果要跨平台通知接线图，端口、事件要把 Home 安装接进某个项目的监督器与项目库里的队列。先建没人用的路，等于给平台加一个没有调用方的合同面，和 `AGENTS.md` 里「插件缺什么就补进平台」要的是同一件事反过来：缺的才补。需要时有现成的出路：双实例。若以后有一个 Home 级插件确实要在不同项目里发布成果，再按那时的使用者设计（客户端从当前调用取项目、写入后通知目标项目的平台）。

## 4. 验收

| 号 | 内容 | 证明 |
| --- | --- | --- |
| RAC-744 | 登记有 `runtime`、没有 `dual_instance`，Manifest 声明端口（入、出）、事件（发布、订阅）、成果（产出、消费）或过程项，`catalogProblems` 各报一条；同样的声明配 `dual_instance` 不报；出厂的目录没有问题 | `tests/home-plugin-coordination.test.ts` |
| RAC-745 | 同样的 Home 插件交给 Home 监督器：不是双实例就不启动、插件自己的 `start` 一次也没被调；是双实例就正常启动 | 同上 |

## 5. 裁定

- **D5 PG-025 不给 Home 实例建成果、端口、事件服务**：用户 2026-10-25 弹窗定。不建，改成目录检查加启动拒绝，拒绝的提示是做成双实例、由项目那一半拿；以后真有插件需要时，按真实使用者开片。要建时按 §1 的四条路径分三片：成果的调用级项目客户端、跨项目通知、端口与事件进监督器；每片先找一个真实使用者。
