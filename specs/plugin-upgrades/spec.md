# Plugin 版本升级与兼容协议

## 目标与现状

插件平台当前在多个 Host 启动入口传入 `replace_version: true`，打开项目时可能直接替换已安装版本。市场只维护项目插件启用列表，没有版本状态或升级动作。`plugin_runtime_installs` 持久化版本、Manifest 指纹、grant 和稳定 `install_id`；私有数据按 `install_id` 隔离。插件创作台有自己的发布序号，但生成插件 Manifest 固定为 `1.0.0`。

目标是让新版本先作为候选存在，只有用户在市场或发布流程明确触发升级时才改变安装版本。已有安装及私有数据保留在原稳定身份下。

## 行为与边界

- Manifest 新增有限的精确版本列表 `upgrade_compatibility.compatible_from_versions` 与 `migratable_from_versions`。直接兼容表示新实现无需迁移即可使用来源版本私有数据和既有授权；可迁移表示仅支持手动升级，且必须通过目标定义只读 `validateUpgrade` 数据预检。列表不是范围表达式或任意键值袋。来源版本必须是合法 SemVer，普通来源早于目标；同版本仅允许直接兼容声明，用于同版本 Manifest 修正时恢复插件运行。
- 同一 Plugin ID、发布者签名和版本通常只能对应同一份 Manifest 指纹。同版本指纹变化只有目标声明兼容当前精确版本时允许用于继续运行；不改变安装记录或产生升级候选。显式升级必须递增版本。
- 常规项目启动只恢复现有版本与 grant，不自动写入新版本。兼容声明允许新实现恢复旧安装但不改安装记录；未列入兼容来源列表的目标不能直接以新 Manifest 启动。市场可展示升级候选，用户触发升级后仍需通过目标插件的数据预检、grant 保留/范围检查和来源版本声明检查。
- 不兼容或待校验的候选存在时，打开项目仍须执行已安装版本的实现。必须从当前 Host 仍可用的版本化发行物中解析该实现；不能因为新版代码已进入 Host 而把插件留在失败状态。此状态须跨 Host/项目重启保持。
- 普通 Native 插件的发行物由 Host 从插件工厂构建成单文件 ESM，并保存在项目现有 SQLite 的 Runtime 发行物表中，按插件 ID、发布者签名、版本和 Manifest 指纹寻址。插件工厂继续接收 Host 当次装配的端口；恢复时从安装记录对应的发行物构建实现。不得新增代码目录或插件私有数据目录。兼容候选可按声明用当前实现继续运行；不兼容候选启动时必须恢复旧发行物。手动升级前先持久化目标发行物。
- 显式升级先以只读 `get` 预检目标与旧安装，再切换版本；校验失败时旧安装记录、grant 和数据不变。目标失败时 Host 恢复旧记录和可用数据快照。升级不改 `install_id`，不创建另一份私有存储，也不执行自动数据迁移。
- 市场只对当前项目提供该项目已安装插件的升级状态与手动动作；更新提示与卡片都显示已安装和目标版本。添加插件的既有路径保持独立。插件创作台每次发布映射一个递增的 Manifest SemVer，并由发布者明确声明相对上一发布的兼容关系。

## 文件边界与取舍

- `packages/contracts/src/platform/plugin*.ts`：Manifest 合同与解析。
- `packages/plugin-runtime/src`：启动恢复、显式升级、版本指纹、grant 与状态行为。
- `apps/local-host/src`：当前项目升级路由、Native 插件发行物构建/工厂适配及 Host 启动参数，不由启动过程升级。
- `apps/workbench/src`：市场版本状态与用户手动升级交互。
- `plugins/native/plugin-builder/src`：发布序号到 Manifest 版本和兼容声明的映射。
- `docs/platform/PLUGIN-PLATFORM.md`、`PLUGIN-DEVELOPMENT.md` 及创作台说明：协议和作者发布指南。

不新增独立插件代码或私有数据目录；不改变签名绑定的 `install_id`；不把首次安装混同为升级。

## 验收与验证

- Manifest 解析拒绝重复、较新或非法兼容来源版本；同版本来源仅接受直接兼容声明。
- 常规启动不会覆盖安装版本或 grant；未兼容新 Manifest 不会被静默替换。
- 显式升级只有在来源版本声明、私有数据校验及 grant 校验通过后才提交；校验或启动失败保留旧记录和旧数据。
- 失败的市场升级返回原因并允许重试，同时运行中的旧实现及其已挂载路由仍可用。
- 在新版未兼容或要求校验时重启项目，仍解析已安装版本的发行物；新 Manifest 不会因启动被执行。
- 首次安装时 Native 发行物进入当前项目 Runtime SQLite；新 Host 启动遇到不兼容候选时从该发行物恢复旧实现，手动升级成功后再切换到新发行物。
- 同版本不同 Manifest 指纹无声明时被拒绝，有同版本兼容声明时可运行但不形成升级候选；升级后 `install_id` 和数据连续。
- 市场显示更新提醒及已安装/目标版本，只有用户操作才调用升级路径；创作台发布版本递增，并保存发布者声明。
- 定向运行 Manifest、Runtime/持久化升级、创作台发布、市场 UI/API 测试；运行相关 typecheck。

前轮验证（本轮代码修改前）：完整 workspace build 与 `pnpm workspace:typecheck` 通过；Manifest、Runtime/存储、创作台发布、市场升级及项目设置定向测试集 45/45 通过；`tests/plugin-market-upgrade.e2e.test.ts` 真实 Chrome 浏览器手动升级路径通过。

## 当前审计发现（2026-09-23）

市场提醒与手动升级、Runtime 的兼容/可迁移预检和失败回滚、创作台版本号及声明已实现。失败升级后旧 contribution 与路由继续可用，候选可重试；Builder 发布只登记候选，库页按 Runtime 安装版本显示状态并由用户明确升级。生成插件版本历史保存在 Builder 已有私有存储中，重启时按安装记录恢复精确发布。

普通 Runtime-managed Native 插件的发行物现由 Host 工厂打包为单文件 ESM，按 Plugin ID、发布者签名、版本和 Manifest 指纹写入项目现有 SQLite 的 `plugin_runtime_release_artifacts` 表。Coding 面板的首方插件与 Plugin Builder 本体都接入该恢复入口；恢复时由当前 Host 重新注入端口。首次安装、明确兼容的新实现首次运行及显式升级前都会保存代码。新增集成测试在同一个 SQLite 中重建 Runtime/Supervisor，验证精确旧版恢复、已归档兼容版恢复、安装版本不变、失败预检保留旧实现且可重试、成功升级保持 `install_id`；真实 Files 与 Builder 工厂均通过打包/重新导入。

本轮对 Coding 1.31.0、Files 1.2.0、Git 1.4.0、Diff 1.3.1、Plugin Builder 1.2.0 写入了从当前仓库原版本出发的精确兼容声明，避免这次 Native/API 调整把现有 1.30.0、1.1.0、1.3.0、1.3.0、1.0.0 安装挡在启动之外。声明仍是逐版本列表，没有范围或自动接受旧来源。

部署边界：历史 Host 尚未保存发行物的安装，若遇到不兼容候选且没有精确/兼容归档，Host 无法凭安装记录重建旧 JavaScript；它会保持安装记录、grant 和数据并报告缺少发行物，不运行不兼容候选。若首个新 Host 候选明确兼容旧安装版本，则可继续使用并保存该实现供后续重启。其他仍由 Host 构建期组合、未纳入 Plugin Runtime 的 Native 插件也不在此版本化恢复范围内。此限制不改变当前仓库已知旧版本的兼容启动路径。

来源版本声明是发布者对该来源版本数据可读性和现有授权兼容性的承诺；Host 仍独立执行 grant 子集与只读数据校验，不把该声明当作任意授权。当前升级协议不执行自动数据迁移。

本轮收尾验证：`pnpm workspace:build`、`pnpm workspace:typecheck` 和 `git diff --check` 通过；Runtime、存储、Manifest、市场 API/UI、真实 Chrome 手动升级合计 28/28；Builder Runtime、发布和真实浏览器流程合计 5/5。此前 `pnpm workspace:check` 通过。

## 同步远端移除功能（2026-09-23）

合并远端插件移除功能时，市场卡片保留独立的添加/移除按钮，升级候选另显示升级按钮，两类操作共享忙碌状态。市场入口跟随远端移到侧栏底部，保留本地更新计数。验证沿用市场目录、项目插件和市场升级浏览器测试。
