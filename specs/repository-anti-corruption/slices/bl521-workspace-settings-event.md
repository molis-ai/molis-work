# BL-521：工作目录设置的变化发 `host.workspace.changed@1`，并删 `filesOutputsRefresh`（一个 PR，两部分）

状态：已实现、本地验证，PR #1230 已开（2026-10-24，防腐线 ac-coding 片；基于 #1191 所在的 main `2dd535912`）。发事件与删 `filesOutputsRefresh` 钩子是同一个功能，合在这一个 PR 里（用户 10-24 定一个完整功能一个 PR）。

本轮按 REVIEW6387490072 在同一 PR 修复 `project-opened` 的失败重试与缺能力入口边界，并补 S-54 的 RAC-463 测试引用，已完成下述本地验证；独立二轮、CI 与实际合入另行核收。首次插件路由等待 `drain()` 的顺序和时限不变，大目录首次打开耗时仍按原评审观察处理。

## 1. 现状

`host.workspace.changed@1` 目前只在两种情况发：人批准的插件工作区操作结算（`plugin-operation`），Agent 自己经人批准的写入结算（`agent-change`，BL-366）。项目设置里换了或移除了工作目录既不经审查结算，也不发事件，所以换目录后消费 Files 输出的插件会读到旧目录的快照。今天的补救是 `coding-surface.ts` 里的「先让 Files 刷新」钩子（#1191 把它改名 `filesOutputsRefresh`，搬到 `project-plugin-input-refresh.ts`）。

## 2. 改什么

1. `HostWorkspaceChangedPayload.cause` 加 `"workspace-settings"`（合同包 `contracts/platform/plugin-events`；订阅方本来就要对每个 `cause` 一视同仁）。
2. 新函数 `announceWorkspaceSettingsChange(store, projectId, workspaceId)`（`apps/local-host/src/workspace-settings-events.ts`）：取这个项目已在运行的平台（`runningProjectPlatform`，不启动平台），用它自己的 `hostEvents.broadcast` 发。不借 `observeReviewSettlements`。发送失败只写日志，不让已经提交的设置变更失败。
3. 在改动提交之后调它：`project-workspace-actions.ts` 的关联（add）、修复（repair）、解除（unlink；只有本来关联着的才发），以及 `project-capabilities.ts` 的 `selectBrowsingWorkspace`（选定浏览目录）。`workspace_id` 是被关联、修复、解除的那个目录，或新选的浏览目录（统筹 10-23 定）；修复后的目录在新路径上有自己的 id（实测：修复返回的 id 不是原来的），发的是这个新 id，订阅方对每个 `cause` 一视同仁、不按 id 取舍。被拒绝的（没确认、别的项目的目录、目录不存在）、没有变化的（解除一个本来没关联的目录）不发。
4. 文档：`docs/system/SECURITY-INVARIANTS.md` S-54 与 `docs/platform/PLUGIN-PLATFORM.md` 写上这条 `cause`；BACKLOG 的 BL-521 行写明发事件一半已做。

## 3. 对调用方的影响

- 合同 `contracts/platform/plugin-events`、`contracts/platform/plugin`（公开 API 快照已刷新）：`HostWorkspaceChangedPayload.cause` 多一个取值。读这个事件的 Files、Git 对每个 `cause` 一视同仁（重读、重新确认浏览目录），代码不用改；外部插件作者按合同文档本来就要这样处理，新取值是文档里写明的「新原因以新取值出现」。
- 动作合同快照没有变化（动作的形状没动）。
- 没有库结构变化、没有页面资源变化。

## 4. 验收

- **RAC-461**：项目平台在运行时，关联、修复、解除一个目录和选定浏览目录各发一次，`cause` 为 `workspace-settings`，`workspace_id` 是那个目录，订阅方（Files、Git）真的排到了事件；另一个项目的平台没听到。`tests/security-invariants-workspace-settings-events.test.ts`。
- **RAC-462**：被拒绝的（没确认的关联和修复、别的项目的目录、不存在的目录）和没变化的（再次解除已解除的目录）不发。同一个测试文件。
- 项目平台没在运行时不发、也不为它启动平台：靠 `runningProjectPlatform`「只取已在运行的、不启动」的定义；走 HTTP 的任何一个项目路由都会先把平台起来，所以这一条没有 HTTP 层的测试。

## 5. 没做、没验证

- 删 `filesOutputsRefresh`（连同 BL-366、BL-521 删行；`codingRouteHooks` 已随 #1191 改名）在同一个 PR 里，见第 6 节。
- 浏览器里没有走一遍；全量没跑。

## 6. 第二片：删 `filesOutputsRefresh`（BL-366、BL-521 完成）

状态：已实现、本地验证，与第 1–5 节同在 #1230；用户 10-24 定：补上窗口再合（6.2，试过 start() 里读，行不通，改成平台被网页入口打开时补发）。

- 删 `apps/local-host/src/project-plugin-input-refresh.ts`（`filesOutputsRefresh`、`readsFilesOutputs`）及 `apps/local-host` 的两处导出；`handleProjectPluginHttp` 不再收 `hooks` 参数，`ProjectPluginRouteHooks` 类型删除；`RuntimePluginRouteHooks.beforeDispatch` 没有调用方了，一并删（只剩 `afterDispatch`，入口自己用它等输入图落定）。
- 约 20 个测试里传给 `handleProjectPluginHttp` 的第五个参数去掉；`RAC-439` 由「钩子只为读 Files 产物的插件读 Files」改成「钩子不在了、宿主里没有文件再点它的名字」；`RAC-438` 的 Files 导入者只剩监督器；`PG062-13`、`PG037-01` 等读源码的断言跟着改。
- BACKLOG 删 BL-366、BL-521 两行；`apps/local-host/README.md`、`skills/molis-plugin-dev/host.md`、`privileges.md` PG-037、C9 切片说明改成现状。

### 6.1 删掉之后谁来保证「换了目录，消费方不读旧快照」

两段合起来：项目设置里换目录 → 第一片发 `workspace-settings`（RAC-461）→ Files 收到后重新确认浏览目录、换了就作废旧目录的快照（RAC-332，`tests/files-plugin.test.ts`）。Agent 批准的写入同理（`agent-change`，RAC-331）。这两个测试各证明一半，没有一条把整条链接在真实平台上走通的用例。

### 6.2 设置变化时平台没在运行：平台被网页入口打开时补发一次（用户 10-24 定）

钩子是每个消费方路由前都读一次 Files，所以「设置变化时项目平台没在运行」也被它兜住；事件只发给**正在运行**的平台（第一片就是这样定的，不为发事件启动平台）。删钩子会留下一个窗口：平台没在运行时换了工作目录，下次启动后到 Files 的第一个动作之前，读 Files 输出的插件（Diff、Text Stats 等）会读到旧目录的快照。

**试过、行不通的：Files 在 `start()` 里确认一次浏览目录。** 它会让五个测试文件变红——`companion-actions`、`files-git-actions`、`project-plugin-startup`、`security-invariants-plugin-pages`、`workspace-read-one-id`——它们守的是「注册、发现、启动不读业务能力」（启动时的读还没有调用方上下文，插件页面权限也过不去）。这些断言不放宽，Files 的 `start()` 不读。

**做的（本片）：** `apps/local-host/src/workspace-settings-events.ts` 的 `announceProjectOpened(platform, ports)`，由 `project-plugin-http.ts` 的 `handleProjectPluginHttp` 在一个插件路由派发之前调：每个平台一次（`WeakMap` 记 promise，并发的头几条路由等同一个），读项目当时的浏览目录（`projectSettingsCapabilities.browsingWorkspace`），广播 `host.workspace.changed@1`，`cause: "project-opened"`，`workspace_id` 是那个目录（项目没有就是空串），再 `hostEvents.drain()` 等投递结束，然后这条路由才继续，所以读 Files 输出的插件不会在 Files 作废旧快照之前读到它们。失败只写日志，不让路由失败。

“每个平台一次”以补发及投递成功完成为准。读取或补发失败后只移除本次对应的缓存，下一条网页路由重新尝试；同一次进行中的尝试仍由并发路由共同等待，不影响另一个平台。缺少能力入口时只记录诊断、不广播，也不标记成功；之后具备入口的路由仍可补发。只有成功读取后确实没有选定浏览目录才用空 `workspace_id`，不把能力不可用解释为未选择目录。

- 只有这个网页入口调它：无头启动平台（MCP、桌面壳为发现动作而 `ensureProjectPlugins`）不读不发，`project-plugin-startup` 等五个文件不动一条断言。
- 合同：`HostWorkspaceChangedPayload.cause` 再多一个取值 `"project-opened"`（API 快照已刷新）；订阅方对每个 `cause` 一视同仁，Files、Git 不用改。
- 代价：每个平台头一次被打开时 Files 读一次浏览目录、Git 重读一次（没变时 Files 什么也不作废）。
- **RAC-463**（`tests/security-invariants-workspace-settings-events.test.ts`，两条）：平台头一次被打开时只发一次、名字是空串（项目没有目录）、订阅者排到了；再开路由不再发，另一个项目各发各的；链了目录并选定之后宿主重启，新平台的补发名字是那个目录；`announceProjectOpened` 只在 `project-plugin-http.ts` 里被调。
- **RAC-463 复审回归**（同一文件）：真实网页路由遇到首次浏览目录读取失败后仍返回，未发错误事件；下一条路由成功重读并补发，后续成功去重。缺少能力入口不发空目录事件，后来能读取且确实没有选择时才发空目录。并发路由只读一次并共同等待投递结束，另一平台独立打开；无头启动不读不发。先在原 `dfa3064be` 代码上取得两类故障红例，再修复后运行同一回归；整体构建后跑该文件及 `project-plugin-startup`、`companion-actions`、`files-git-actions`、`security-invariants-plugin-pages`、`workspace-read-one-id`，复用原未变动路径证据，不另起 full。
- 没有一条把「设置变化 → 平台没在运行 → 重启 → 消费方读到的快照」在真实平台上走通的用例；事件的一半（RAC-461）、补发的一半（RAC-463）、收到后的一半（RAC-332）各有测试。

本轮验证：原 `dfa3064be` 生产代码经整体构建后，新回归稳定留下三条红例（同步抛错、异步拒绝均未在下条路由重试，缺能力入口仍广播空目录），并发与隔离正例通过；修复后同一文件 8/8 通过。包 README 的 56 个必跑文件加上述 5 个无头启动文件，共 61 文件、555 用例通过，包含原 Runtime HTTP 浏览器回归；整体构建、健康门禁（对照 `origin/main` 的 merge-base `2dd535912`）、包边界、文档与安全引用检查均通过。未另跑全量，也未做设置页完整动线或大目录首开耗时验收。

### 6.3 仍在的一个窄口（原来就有，不是本片带来的）

`filesBrowsing().confirm` 先记下新目录再逐个作废输出：作废做到一半被拒、随后进程重启，下次启动读到的记录已经是新目录，剩下没作废的输出不会再作废。同一激活里由下一次调用重试，不受影响（`S18-FILES-RETRY`）。要关掉它得把顺序改成「先作废、后记录」，会动 `S18-FILES-RETRY` 对「只留下做完的持久化」的断言，另算一片。
