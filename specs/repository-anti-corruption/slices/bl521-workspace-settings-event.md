# BL-521：工作目录设置的变化发 `host.workspace.changed@1`（第一片发事件，第二片删钩子）

状态：已实现、本地验证，PR 已开（2026-10-24，防腐线 ac-coding 片；叠片的第一片，已同步 #1191 所在的 main `2dd535912`；删 `filesOutputsRefresh` 钩子的第二片叠在它上面）。

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

- 第二片（删 `filesOutputsRefresh`，连同 BL-366、BL-521 删行；`codingRouteHooks` 已随 #1191 改名）叠在这一片上。
- 浏览器里没有走一遍；全量没跑。

## 6. 第二片：删 `filesOutputsRefresh`（BL-366、BL-521 完成）

状态：已实现、本地验证，叠在第一片（#1230）上，未开 PR（每线最多两个在开的 PR，等位置）。

- 删 `apps/local-host/src/project-plugin-input-refresh.ts`（`filesOutputsRefresh`、`readsFilesOutputs`）及 `apps/local-host` 的两处导出；`handleProjectPluginHttp` 不再收 `hooks` 参数，`ProjectPluginRouteHooks` 类型删除；`RuntimePluginRouteHooks.beforeDispatch` 没有调用方了，一并删（只剩 `afterDispatch`，入口自己用它等输入图落定）。
- 约 20 个测试里传给 `handleProjectPluginHttp` 的第五个参数去掉；`RAC-439` 由「钩子只为读 Files 产物的插件读 Files」改成「钩子不在了、宿主里没有文件再点它的名字」；`RAC-438` 的 Files 导入者只剩监督器；`PG062-13`、`PG037-01` 等读源码的断言跟着改。
- BACKLOG 删 BL-366、BL-521 两行；`apps/local-host/README.md`、`skills/molis-plugin-dev/host.md`、`privileges.md` PG-037、C9 切片说明改成现状。

### 6.1 删掉之后谁来保证「换了目录，消费方不读旧快照」

两段合起来：项目设置里换目录 → 第一片发 `workspace-settings`（RAC-461）→ Files 收到后重新确认浏览目录、换了就作废旧目录的快照（RAC-332，`tests/files-plugin.test.ts`）。Agent 批准的写入同理（`agent-change`，RAC-331）。这两个测试各证明一半，没有一条把整条链接在真实平台上走通的用例。

### 6.2 删掉之后留下的一个窗口（没有补，需要统筹定）

钩子是每个消费方路由前都读一次 Files，所以「设置变化时项目平台没在运行」也被它兜住；事件只发给**正在运行**的平台（第一片就是这样定的，不为发事件启动平台），Files 的 `start()` 也不确认浏览目录。所以：平台没在运行时换了工作目录，下次启动后，到 Files 的第一个动作（`files.state`、读目录、打开、固定）或下一个工作区事件之前，读 Files 输出的插件（Diff、Text Stats 等）会读到旧目录的快照。典型路径是宿主重启或项目换出再换回时设置变过；人在项目页里改设置时平台一般在运行，走事件。

可选的补法（都不在本片）：Files 在 `start()` 里确认一次浏览目录（要改 `S18-FILES-RETRY` 对持久化次数的断言，且 start 内的写入要核对启动期间被撤权的不变量）；或设置变化的发送方在平台没在运行时也把它起来（要给 `project-workspace-actions` 带上起平台所需的端口）。
