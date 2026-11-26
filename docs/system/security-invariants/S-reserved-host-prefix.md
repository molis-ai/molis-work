# S-reserved-host-prefix

| ID | 不变量（拒绝什么） | 代码位置 | 测试（CI 里跑） | 测试（只在本机跑） |
| --- | --- | --- | --- | --- |
| S-reserved-host-prefix | `io.molis.work.` 前缀只给宿主自己的包（插件命名已按 V16 放开：外部插件用自己的反向域名，创作台生成的叫 `studio.<编号>`）：不是宿主构建的安装（未签名、固定公钥的第三方、创作台发布）申请这个前缀下的任何 id，不论它在不在宿主名单里，一律以 `plugin.id_namespace_conflict` 拒，在预览就拒、什么都不写，Runtime 安装与启动时再拒一次；唯一例外是本次发布自己的随包文件夹里带的 id（官方内容包，在有官方发布者密钥前由本机发布者签），而且只在从随包文件夹装时放行，同一个 id 从别处拿来的包照样拒；平台自己的前缀 `system.`（`system.artifacts`、`system.characters`、`system.assistant`、`system.shelf`，第 44B 批）任何安装包都不能用，随包文件夹也不例外；只有宿主构建在运行时里托管的平台部件（`system.shelf`）用它 | `packages/plugin-runtime/src/install-identity.ts`（`assertInstallIdentity`）；`apps/local-host/src/plugin-install-service.ts`（`assertNotHostId`）；`apps/local-host/src/bundled-packages.ts`（`releasePackageIds`）；`apps/local-host/src/host-plugin-ids.ts`（`RELEASE_PACKAGE_IDS`）；`packages/contracts/src/platform/plugin-manifest.ts`（`HOST_PLUGIN_ID_PREFIX`、`PLUGIN_ID_PATTERN`） | `tests/security-invariants-install-identity.test.ts`「PSD-04 S-reserved-host-prefix a package not of the Host's build is refused any id under io.molis.work.」「PSD-04a S-reserved-host-prefix only an id this release ships in its package folder passes the prefix check」；`tests/security-invariants-plugin-install.test.ts`「PSD-04 PSD-04a S-reserved-host-prefix a signed package outside the release asking for any io.molis.work. id is refused at the preview」 | — |

**随包放行的来源只在预览这一层核（第 44C 批，44B 复核 P-13）。** 这样就够，不另收紧：

- 来源核在预览（`apps/local-host/src/plugin-install-service.ts` 的 `preview`）：只有经 `{ bundled: { plugin_id, version } }` 进来、由宿主自己从本次发布的随包文件夹读出并验过签的包（`bundledBundle`），才带「来自本次发布」的标记（`assertNotHostId(…, 'bundled' in input)`）；调用方直接交来的 `bundle`，哪怕 id 与随包的一样，也按前缀拒。
- 预览是唯一收包的门：确认（`confirm`）只认内存里持有的那份预览（`preview_id`），不接受新的包体，所以确认时没有第二个能塞进来源标记的入口。
- Runtime 安装与启动时（`packages/plugin-runtime/src/install-identity.ts` 的 `assertInstallIdentity`）只按 id 是否在 `releaseIds`（本次发布随包文件夹里的 id，`bundled-packages.ts` 的 `releasePackageIds`）再拒一次：它防的是绕过预览直接装进 Runtime 的记录，那里没有「从哪个文件夹来」可核，id 在本次发布的名单里就是唯一能核的事实。
