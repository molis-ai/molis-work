# PG-061 `ui.invalidate` 设计短稿（②，2026-10-22，待 ① 审）

代码按 main `6d2361652` 核过。分支 `feat/pg061-ui-invalidate` 已从这一点开好，还没写代码。

## 结论

- **拆成两片。**
  - 这一片只做 `services.ui.invalidate()`。Git 的 G2、Coding 的 C6 后半等的就是它。
  - `ui.commands` 的接通不做，记 BL-363：
    - 只有 Git 的 U1 选「让它可用」时才需要；
    - 它是界面功能，要真浏览器验证，而浏览器验证还停着（用户 10-19）。
- **不取新的 S 号。**
  - 这个出口不带授权、不碰数据。插件只能让自己已打开的页面重新读一次。
  - 页面重读走的还是原来的路由，用的是读的人自己的授权。
  - 拒绝照样写测试（下面的 PG061-03、04），但不进安全不变量表。

## 现状（已核）

- **页面一半已经有了。**
  - 宿主注入的 `scope.watchRevision(read, refresh)`：页面可见时每两秒读一次 `GET /api/plugins/<id>/view-revision`，值变了就重读。
  - 项目和 Home 都有这条路由（`plugin-route-operations.ts:74`、`home-plugin-http.ts:130`）。
  - Skill `ui.md:154` 已经教插件这么写。实际用上的是 Files 和 Git（`client.ts:125`、`:250`）。
- **触发一半只有宿主能做。** 宿主调 `PluginPlatform.invalidateView(pluginId)` 把版本号加一，插件拿不到这个方法。代码在两处：
  - 项目的在 `plugin-platform.ts:202`；
  - Home 的在 `home-plugins.ts:157`。

  调用它的地方：
  - Files 的 `onWorkspaceChanged` 端口（`project-plugins.ts:163`）；
  - Git 的 `onWorkingTreeChanged` 端口（`project-plugins.ts:178`）；
  - Home 插件的命令成功以后（`project-host.ts:140`）。
- **`ui.commands` 没人调用。**
  - Coding、Diff、Files、Git 一共声明了 7 个命令，也都实现了 `commandAvailability` 和 `executeCommand`。
  - Runtime 只检查「声明了就得实现」（`contribution.ts:115-121`）。`UiHost.commands()` 也有（`view-registry.ts:102-120`）。
  - 产品里没有任何地方调用它们，只有测试在调。

## 合同

`packages/contracts/src/platform/plugin.ts` 的 `PluginUiClient` 加一个必填方法：

```ts
/** This installation's open pages may show something stale: they read again (`scope.watchRevision`). A hint, never a receipt. */
invalidate(): void;
```

1. **只作用于自己。**
   - 不带参数。插件 id 取自启动上下文，不从输入读。
   - 不分视图：现在的版本号就是每个实例一个。以后要按 `view_id` 分，是只加不改的变化。
2. **不要权限。**
   - 唯一的条件：Manifest 至少声明了一个 `ui.views`。没有就拒，码是 `ui_host.plugin_denied`。
   - 不借用 `ui:register`：Files、Git、Coding 都没声明它。为了刷新去要它，等于多给它们一项「注册界面贡献」的权利。
3. **生命周期。**
   - `start()` 里就能调。插件还没进入 running 时，调用是空操作：启动完页面本来就会重读。
   - 停用、卸载或重启以后，旧实例再调一律抛 `ui_host.plugin_denied`，版本号不变。这和 `register` 停用后的行为一样，也就是「停了不再写」。
4. **不绑在某次调用上。**
   - 动作、随激活作业、事件回调、定时器里都能调。
   - 不记到调用者名下，也不进调用记录。
   - 被取消或撤权的调用照样可以调：版本号是内存里的提示，不是业务记录，`PluginPlatform.invalidateView` 的注释写的就是这个意思。页面重读时，用的是读的人自己的授权。
5. **不限频。** 一次调用只是计数加一。页面两秒读一次，中间加几次都只重读一次。
6. **Home 与双实例。**
   - Home 实例加的是 Home 平台的版本号。
   - 双实例两半各加各的；页面从哪一半读，就看哪一半的版本号。
   - 现在唯一的双实例插件是 Shelf，它不看版本号。
7. **沙箱。** 沙箱插件的 SDK（`SandboxSdk`）现在本来就没有 `ui`，这一片不加。

## 宿主接线

- `packages/ui-host/src/plugin-client.ts`：`createPluginUiClient` 多收一个 `invalidate` 回调。客户端负责「声明了视图」「实例还没停」这两项检查，再调这个回调。
- `apps/local-host/src/plugin-host-services.ts`：`openHostSession` 传入 `() => options.invalidateView(context.plugin_id)`。
- `PluginHostExecutorOptions` 加 `invalidateView`：
  - 项目平台（`plugin-platform.ts`）把自己的 `invalidateView` 传进去；
  - Home 执行器（`home-plugin-executor.ts:65`）传 Home 平台的那一个。
- `PluginPlatform.invalidateView` 留着，宿主自己还在用（`project-host.ts:140`）。
- 删 Files、Git 的两个端口不在这一片：Git 的端口在 ③ 的 G2，Files 的在 C6。

## 测试（验收编号写进用例名）

| 编号 | 证明什么 |
| --- | --- |
| PG061-01 | 项目插件调 `invalidate()` 以后，它的 `/view-revision` 变了 |
| PG061-02 | 同一项目里别的插件的版本号不变 |
| PG061-03 | 停用以后旧实例再调被拒（`ui_host.plugin_denied`），版本号不变 |
| PG061-04 | Manifest 没声明视图的插件调用被拒 |
| PG061-05 | Home 实例调用以后，Home 路由的版本号变了 |

夹具用真实的 `MolisWorkLocalHost` 和临时 Home。

## 改动面与门禁

- **改共享核心（contracts），进批。** `pnpm api:update` 会刷新 `contracts/platform/plugin` 的快照。SDK 已经转出 `PluginUiClient` 这个类型，不用改。
- **其余代码：** ui-host 和 local-host。
- **文档：**
  - Skill `ui.md` 的 `watchRevision` 一段，补上服务端写 `services.ui.invalidate()`；
  - `docs/platform/UI-PLATFORM.md`；
  - `docs/platform/PLUGIN-DEVELOPMENT.md` 的服务表；
  - ui-host README；
  - privileges 的 PG-061 状态。
- **规模：** 预计改 6 到 8 个代码文件，加 1 个测试文件。

## 不做（记下）

- **`ui.commands` 接通 → BL-363（编号开工时再核）。**
  - 做的时候要定：命令出现在哪里（命令菜单、内容动作菜单）、谁能触发、`executeCommand` 返回的 `UiOpenedObjectView` 交给哪个工作台位置。
  - 要真浏览器验证。
  - 和 U1 一起问。
- **沙箱插件的 `ui.invalidate`。** 等沙箱插件有了自己的视图读写再补。

## 请 ① 定（都按推荐写在上面）

1. 拆片：这一片只做 `invalidate`（推荐），还是连 `ui.commands` 一起做。
2. 门槛：「声明了视图、不要权限」（推荐），还是借用 `ui:register`。
3. 停用以后再调：抛错（推荐），还是静默不做。
4. 不取 S 号（推荐），还是取 S-54。
