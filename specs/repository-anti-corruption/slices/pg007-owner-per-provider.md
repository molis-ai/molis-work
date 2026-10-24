# PG-007 阶段 4：本人的权限按宿主提供方给

状态：已开 PR，进集成批（2026-10-24，防腐线 ac-kernel 接 ac-platform 的片，分支 `ac-kernel/pg007-owner-per-provider-2`，已合 main `112114f23`）；做的是 `privileges.md` PG-007 行的「阶段 4 收尾」，以及 `platform-queue.md` 第 14 条。代码按 main `61248691d` 核过：首页对话（`home-talk-actions.ts`）已随 #1157 删掉，Work 的宿主提供方也已不在，两者不再列。

## 1. 要解决的

`localWebActionContext` 让本人调宿主自己登记的动作（没有安装 id 的提供方）时，只看动作要的权限在不在全局集合 `LOCAL_OWNER_PERMISSIONS` 里，不看提供方是谁。`artifact:read`、`artifact:write` 是本人对 Characters 持有的，却因此对任何要它们的宿主动作都成立。

## 2. 做法

- `local-owner-permissions.ts` 新增 `localOwnerPermissionsOver(provider_id)`，按提供方 id 逐个写出本人对它持有什么：
  - 宿主自己的 native 插件：持有它 Manifest 动作声明的权限；
  - 宿主服务（首页、连接、信息助手、判断规则、项目工作目录、平台、Characters、个人规划、助理规则、搜索、资料、放置、记忆）：持有各自的权限常量；
  - 外部 MCP 的提供方（`…#mcp:…`）：只持有 `mcp:external`。
  没写进去的宿主提供方，本人一项也不持有。
- 宿主自己的提供方 `HOST_PROVIDER_ID`（`"platform"`，`registerAction` 在定义没写提供方时用的那个：工作目录读取、Git 评审、writer 工作树、Agent Host、项目设置）只由宿主代码登记，本人持有它每个动作自己要的权限（`localOwnerPermissionsOver(provider_id, asked)` 原样返回 `asked`），仍受路由上限收窄。只列常量会漏：它下面的动作要什么权限各不相同（`workspace:read`、`projects:settings` 等），按动作逐个写反而会和登记处分叉。
- `ownerReaches` 要两样都满足：动作要的权限在路由给的上限（原来的 `builtinPermissions`）里，也在本人对这个提供方持有的里面。
- `LOCAL_OWNER_PERMISSIONS` 只是调用能带的上限，不再单独放行任何宿主动作。
- 装上的插件（有安装 id 的提供方）照旧只看安装授权，不变。

## 3. 验收

- **RAC-338**（`tests/local-web-actions.test.ts`，S-15 撤权那条用例末尾）：
  - 本人对 Characters 持有 `artifact:write`，目录里能看到 Characters 要它的动作。
  - 另一个宿主提供方登记一个要 `artifact:write` 的动作：不在本人的 `allowed_actions` 里，`validate_authority` 与调用都 `actions.forbidden`，处理器没跑。
  - 变异检查：去掉按提供方的那一项检查，这条失败。
- **RAC-339**（同一文件）：在项目里和 Home 上，今天宿主登记的、本人能带其权限的每个动作，在新规则下都仍在本人的 `allowed_actions` 里。这条防止改成按提供方以后漏掉哪个提供方。

## 4. 测试夹具

三份测试把要本人持有的目标动作登记在虚构的宿主提供方下（`fixture-desk`、`home-held-query`，以及委托测试里的那个）。PG-007 之后本人对虚构的宿主提供方一项都不持有，这些用例会因为与它们要测的无关的原因失败，所以把目标挪到本人真的持有其权限的宿主提供方下，加注释写明原因，断言不改：

- `tests/workflows-delegation.test.ts`、`tests/plugin-action-query-home-http.test.ts`：挪到 `"platform"`；
- `tests/security-invariants-plugin-action-delegation.test.ts`：挪到 `system.project-workspaces`（本人对它持有 `projects:settings`）。

全量里若还有用例把要本人持有的目标挂在虚构的宿主提供方下，按同样的办法改。
